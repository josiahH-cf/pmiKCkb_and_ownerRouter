import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ARTIFACT_CATALOG_COLLECTION,
  ARTIFACT_INTAKE_ACTIVITY_COLLECTION,
  ARTIFACT_INTAKE_COLLECTION,
  decideArtifactFamily,
  readArtifactIntakeManifest,
  receiveArtifactFamily,
  recordArtifactFieldMap,
  type ArtifactIntakeDeps,
} from "@/lib/firestore/lease-artifact-intake";
import type { ArtifactFieldMap } from "@/lib/lease-documents/artifact-intake-contract";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import type { LeaseArtifactKind, PacketFact } from "@/lib/lease-documents/packet-types";
import type { PublicationVersionRecord } from "@/lib/publication/types";
import { FakeFirestore } from "../helpers/fake-firestore";

// S130 (F10): receiving is review, not activation; mapping is version-bound; approval projects the
// exact version into the S66 catalog the packet evaluation consumes; replacing an approved file
// rewrites that catalog so unexecuted preparations read as stale. Every value is SYNTHETIC; the
// only "publication" is an injected fake read and no provider is constructed.

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const approver = { ...admin, uid: "approver-1", role: "Approver" } as AuthenticatedUser;
const editor = { ...admin, uid: "editor-1", role: "Editor" } as AuthenticatedUser;
const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const pdf = (body: string) => new Uint8Array(Buffer.from(`%PDF-1.4\n${body}\n%%EOF`));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const FILLABLE = pdf("<< /Type /Catalog /AcroForm << >> >> << /Type /Page >>");
const STATIC = pdf("<< /Type /Catalog >> << /Type /Page >>");
const OTHER = pdf(
  "<< /Type /Catalog /AcroForm << >> >> << /Type /Page >> << /Type /Page >>",
);

const FILES: Record<string, Uint8Array> = {
  "synthetic-ext-0001": FILLABLE,
  "synthetic-hoa-0001": STATIC,
  "synthetic-ext-0002": OTHER,
};

function publication(
  id: string,
  overrides: Partial<PublicationVersionRecord> = {},
): PublicationVersionRecord {
  const bytes = FILES[id] ?? FILLABLE;
  return {
    id,
    connectorId: "connector",
    contentByteSize: bytes.byteLength,
    contentHash: sha(bytes),
    contentRef: {
      byteSize: bytes.byteLength,
      chunkCount: 1,
      contentHash: sha(bytes),
      contentId: id,
      storage: "firestore-chunks-v1",
    },
    createdAt: "2026-09-20T12:00:00Z",
    createdByUid: "admin-1",
    detectedMimeType: "application/pdf",
    fileName: `${id}.pdf`,
    path: `/${id}.pdf`,
    policyId: "policy-1",
    resourceId: `resource-${id}`,
    resourceType: "file",
    rootId: "root",
    sensitivity: "Low",
    spaceId: "renewals",
    validated: true,
    versionNumber: 1,
    ...overrides,
  };
}

function deps(overrides: Partial<ArtifactIntakeDeps> = {}) {
  const readPublication = vi.fn(async (id: string) => publication(id));
  const readActiveVersionId = vi.fn(async (resourceId: string) =>
    resourceId.replace("resource-", ""),
  );
  const readContent = vi.fn(
    async (reference: { contentId: string }) => FILES[reference.contentId] ?? FILLABLE,
  );
  return {
    readPublication,
    readActiveVersionId,
    readContent,
    ...overrides,
  } satisfies ArtifactIntakeDeps;
}

const binding = (id: string) => ({
  system: "s21_publication" as const,
  reference: `publication:${id}`,
  contentHash: sha(FILES[id] ?? FILLABLE),
});

function map(
  kind: LeaseArtifactKind,
  template: string,
  overrides: Partial<ArtifactFieldMap> = {},
): ArtifactFieldMap {
  return {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: kind,
    mapVersion: `${kind}-synthetic-v1`,
    templateVersion: `publication:${template}`,
    formFamily: "synthetic-family",
    formFamilyExtensionCompatible: true,
    audience: kind === "owner_acknowledgment" ? "owner" : "tenant",
    allowedPacketContexts: ["renewal_extension"],
    fields: [
      {
        fieldId: "Rent",
        factKey: "renewal.approved_rent",
        meaning: "Approved monthly rent",
        required: true,
        multiplicity: "single",
        allowedSourceSystems: ["staff_recorded_owner_approval"],
      },
    ],
    signers: [
      {
        signerRole: "tenant",
        participantKind: "tenant",
        required: true,
        location: "Tenant signature",
      },
    ],
    reviewNote: "SYNTHETIC review",
    ...overrides,
  };
}

async function status(promise: Promise<unknown>) {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof EditableLayerError ? error.status : -1;
  }
}

const source = (system: string, reference: string) => ({
  system,
  reference,
  retrievedAt: "2026-09-20T12:00:00.000Z",
});
const fact = (
  fieldKey: string,
  value: string | number | boolean,
  system = "rentvine",
): PacketFact => ({
  fieldKey,
  normalizedValue: value,
  displayValue: String(value),
  source: source(system, `${system}:${fieldKey}`),
  confidence: "Verified",
  applicability: "Applicable",
  verifiedBy: "synthetic",
  blockingScope: "synthetic",
});

describe("S130 receive is review, never activation (AC-S130-1, AC-S130-2)", () => {
  it("records a classified received entry idempotently and refuses non-Admins, bad bindings, changed content and duplicate content", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const d = deps();
    expect(await readArtifactIntakeManifest(db)).toMatchObject({
      state: "readable",
      entries: { renewal_extension: null, hoa_artifact: null },
    });
    expect(
      await status(
        receiveArtifactFamily(
          editor,
          {
            kind: "renewal_extension",
            publicationSource: binding("synthetic-ext-0001"),
            operationId: OP(1),
          },
          db,
          d,
        ),
      ),
    ).toBe(403);
    expect(d.readContent).not.toHaveBeenCalled();

    const first = await receiveArtifactFamily(
      admin,
      {
        kind: "renewal_extension",
        publicationSource: binding("synthetic-ext-0001"),
        operationId: OP(1),
      },
      db,
      d,
      "2026-09-20T12:00:00Z",
    );
    expect(first).toMatchObject({
      duplicate: false,
      entry: {
        kind: "renewal_extension",
        state: "received",
        revision: 1,
        classification: { format: "fillable_pdf", hasAcroForm: true },
        file: { fileName: "synthetic-ext-0001.pdf" },
      },
    });
    expect(
      await receiveArtifactFamily(
        admin,
        {
          kind: "renewal_extension",
          publicationSource: binding("synthetic-ext-0001"),
          operationId: OP(1),
        },
        db,
        d,
      ),
    ).toMatchObject({ duplicate: true, entry: { revision: 1 } });
    expect(
      await status(
        receiveArtifactFamily(
          admin,
          {
            kind: "hoa_artifact",
            publicationSource: binding("synthetic-ext-0001"),
            operationId: OP(2),
          },
          db,
          d,
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        receiveArtifactFamily(
          admin,
          {
            kind: "hoa_artifact",
            publicationSource: binding("synthetic-hoa-0001"),
            operationId: OP(3),
          },
          db,
          deps({
            readPublication: vi.fn(async () => {
              throw new Error("missing");
            }),
          }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        receiveArtifactFamily(
          admin,
          {
            kind: "hoa_artifact",
            publicationSource: binding("synthetic-hoa-0001"),
            operationId: OP(3),
          },
          db,
          deps({ readActiveVersionId: vi.fn(async () => "other") }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        receiveArtifactFamily(
          admin,
          {
            kind: "hoa_artifact",
            publicationSource: binding("synthetic-hoa-0001"),
            operationId: OP(3),
          },
          db,
          deps({ readContent: vi.fn(async () => OTHER) }),
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        receiveArtifactFamily(
          admin,
          {
            kind: "hoa_artifact",
            publicationSource: binding("synthetic-hoa-0001"),
            operationId: OP(3),
          },
          db,
          deps({
            readPublication: vi.fn(async (id: string) =>
              publication(id, { spaceId: "ask" }),
            ),
          }),
        ),
      ),
    ).toBe(409);
    const manifest = await readArtifactIntakeManifest(db);
    expect(manifest.entries.hoa_artifact).toBeNull();
    expect(manifest.entries.renewal_extension?.state).toBe("received");
    expect(fake.store.get(`${ARTIFACT_CATALOG_COLLECTION}/current`)).toBeUndefined();
    expect(
      fake.store.get(`${ARTIFACT_INTAKE_ACTIVITY_COLLECTION}/${OP(1)}`),
    ).toMatchObject({ action: "artifact_received", format: "fillable_pdf" });
  });
});

describe("S130 mapping and approval project the exact version into the catalog (AC-S130-3, AC-S130-5, AC-S130-6)", () => {
  it("binds the map to the exact publication, refuses a renamed required field, approves under a revision check and writes a catalog the packet evaluation consumes", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const d = deps();
    await receiveArtifactFamily(
      admin,
      {
        kind: "renewal_extension",
        publicationSource: binding("synthetic-ext-0001"),
        operationId: OP(1),
      },
      db,
      d,
      "2026-09-20T12:00:00Z",
    );
    expect(
      await status(
        recordArtifactFieldMap(
          editor,
          {
            kind: "renewal_extension",
            fieldMap: map("renewal_extension", "synthetic-ext-0001"),
            expectedRevision: 1,
          },
          db,
        ),
      ),
    ).toBe(403);
    expect(
      await status(
        recordArtifactFieldMap(
          admin,
          {
            kind: "renewal_extension",
            fieldMap: map("renewal_extension", "synthetic-ext-0001"),
            expectedRevision: 9,
          },
          db,
        ),
      ),
    ).toBe(409);
    expect(
      await status(
        recordArtifactFieldMap(
          admin,
          {
            kind: "renewal_extension",
            fieldMap: map("renewal_extension", "synthetic-ext-0002"),
            expectedRevision: 1,
          },
          db,
        ),
      ),
    ).toBe(400);
    expect(
      await status(
        recordArtifactFieldMap(
          admin,
          {
            kind: "renewal_extension",
            fieldMap: map("renewal_extension", "synthetic-ext-0001"),
            detectedFieldIds: ["Monthly Rent"],
            expectedRevision: 1,
          },
          db,
        ),
      ),
    ).toBe(400);
    expect(
      await status(
        recordArtifactFieldMap(
          admin,
          {
            kind: "hoa_artifact",
            fieldMap: map("hoa_artifact", "synthetic-hoa-0001"),
            expectedRevision: 1,
          },
          db,
        ),
      ),
    ).toBe(409);
    const reviewed = await recordArtifactFieldMap(
      admin,
      {
        kind: "renewal_extension",
        fieldMap: map("renewal_extension", "synthetic-ext-0001"),
        detectedFieldIds: ["Rent", "Other"],
        expectedRevision: 1,
      },
      db,
      "2026-09-20T12:30:00Z",
    );
    expect(reviewed).toMatchObject({
      state: "reviewed",
      revision: 2,
      mapHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });

    const decide = (
      actor: AuthenticatedUser,
      kind: LeaseArtifactKind,
      decision: "approve" | "reject",
      expectedRevision: number,
      op: string,
    ) =>
      decideArtifactFamily(
        actor,
        {
          kind,
          decision,
          reason: "SYNTHETIC decision",
          expectedRevision,
          operationId: op,
        },
        db,
        d,
        "2026-09-20T13:00:00Z",
      );
    expect(await status(decide(editor, "renewal_extension", "approve", 2, OP(4)))).toBe(
      403,
    );
    expect(await status(decide(approver, "renewal_extension", "approve", 1, OP(4)))).toBe(
      409,
    );
    expect(await status(decide(approver, "hoa_artifact", "approve", 1, OP(4)))).toBe(404);
    const approved = await decide(approver, "renewal_extension", "approve", 2, OP(4));
    expect(approved).toMatchObject({
      duplicate: false,
      entry: { state: "approved", revision: 3, decided_by_uid: "approver-1" },
    });
    expect(
      await decide(approver, "renewal_extension", "approve", 2, OP(4)),
    ).toMatchObject({ duplicate: true });
    expect(await status(decide(approver, "renewal_extension", "approve", 3, OP(5)))).toBe(
      409,
    );

    const record = ApprovedLeaseCatalogSchema.parse(
      fake.store.get(`${ARTIFACT_CATALOG_COLLECTION}/current`),
    );
    expect(
      record.catalog.artifacts.map((artifact) => [
        artifact.kind,
        artifact.version,
        artifact.status,
      ]),
    ).toEqual([["renewal_extension", "synthetic-ext-0001", "active"]]);
    const evaluation = evaluateRenewalPacket({
      leaseId: "L1",
      transactionId: "L1",
      facts: [
        fact("transaction.type", "existing_renewal"),
        fact("management.origin", "pmi_managed"),
        fact("active_lease.executed", true),
        fact("active_lease.form_family", "synthetic-family"),
        fact("renewal.approved_rent", 1200, "staff_recorded_owner_approval"),
      ],
      participants: [
        {
          participantId: "T1",
          kind: "tenant",
          signerRole: "tenant",
          source: source("rentvine", "rentvine:party:T1"),
          confidence: "Verified",
          authoritativeOrder: 0,
        },
      ],
      charges: [],
      animals: [],
      catalog: record.catalog,
    });
    expect(evaluation.packetContext).toBe("renewal_extension");
    expect(
      evaluation.manifest?.includedArtifacts.map((artifact) => artifact.kind),
    ).toEqual(["renewal_extension"]);
    expect(evaluation.manifest?.fields).toEqual([
      expect.objectContaining({ fieldId: "Rent", normalizedValue: 1200 }),
    ]);
    // The other context families are honestly unavailable, not silently omitted.
    expect(
      evaluation.blockers
        .filter((blocker) => blocker.code === "artifact_unavailable")
        .map((blocker) => blocker.scope)
        .sort(),
    ).toEqual(["animal_agreement", "city_addendum", "hoa_artifact", "lead_disclosure"]);

    // Replacing the approved file returns the family to review and rewrites the catalog without it.
    const replaced = await receiveArtifactFamily(
      admin,
      {
        kind: "renewal_extension",
        publicationSource: binding("synthetic-ext-0002"),
        operationId: OP(6),
      },
      db,
      d,
      "2026-09-21T12:00:00Z",
    );
    expect(replaced.entry).toMatchObject({
      state: "received",
      revision: 4,
      supersedes: "publication:synthetic-ext-0001",
    });
    expect(replaced.entry.fieldMap).toBeUndefined();
    expect(
      ApprovedLeaseCatalogSchema.parse(
        fake.store.get(`${ARTIFACT_CATALOG_COLLECTION}/current`),
      ).catalog.artifacts,
    ).toEqual([]);
    expect(await status(decide(approver, "renewal_extension", "approve", 4, OP(7)))).toBe(
      409,
    );
    const rejected = await decide(approver, "renewal_extension", "reject", 4, OP(8));
    expect(rejected.entry).toMatchObject({
      state: "rejected",
      decision_reason: "SYNTHETIC decision",
    });
    expect(
      await status(
        recordArtifactFieldMap(
          admin,
          {
            kind: "renewal_extension",
            fieldMap: map("renewal_extension", "synthetic-ext-0002"),
            expectedRevision: 5,
          },
          db,
        ),
      ),
    ).toBe(409);
    expect(
      [...fake.store.keys()].every(
        (key) =>
          key.startsWith(`${ARTIFACT_INTAKE_COLLECTION}/`) ||
          key.startsWith(`${ARTIFACT_INTAKE_ACTIVITY_COLLECTION}/`) ||
          key.startsWith(`${ARTIFACT_CATALOG_COLLECTION}/`),
      ),
    ).toBe(true);
    expect(d.readContent).toHaveBeenCalledTimes(2);
  });

  it("reads a malformed or unreachable manifest as unreadable, never as pending-and-fine", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    fake.seed(`${ARTIFACT_INTAKE_COLLECTION}/hoa_artifact`, {
      kind: "hoa_artifact",
      state: "approved",
    });
    expect((await readArtifactIntakeManifest(db)).state).toBe("unreadable");
    expect(
      (
        await readArtifactIntakeManifest({
          collection() {
            throw new Error("offline");
          },
        } as unknown as Firestore)
      ).state,
    ).toBe("unreadable");
  });
});
