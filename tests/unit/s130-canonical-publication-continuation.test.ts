import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { PublicationVersionRecord } from "@/lib/publication/types";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

// Real publication/intake/catalog/packet/content/filler owners; only the scanner, session and
// storage/provider ports are synthetic. No product packet or approved-byte reader is replaced.
const state = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => ({
    uid: "synthetic-editor",
    email: "synthetic-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes: ["renewals"],
  }),
}));
vi.mock("@/lib/publication/provider", async () => {
  const { FakePublicationScanner } = await import("@/lib/publication/scanners");
  return {
    resolvePublicationScanner: () =>
      new FakePublicationScanner("managed-clamav-renewal-original-v1"),
  };
});

import { POST } from "@/app/api/spaces/[spaceId]/publications/route";
import { createPublicationPolicy } from "@/lib/publication/policy";
import { stablePublicationResourceId } from "@/lib/publication/resource-id";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import {
  receiveArtifactFamily,
  recordArtifactFieldMap,
  decideArtifactFamily,
} from "@/lib/firestore/lease-artifact-intake";
import { setFamilyUse } from "@/lib/firestore/lease-artifact-family-use";
import { LEASE_ARTIFACT_KINDS } from "@/lib/lease-documents/packet-types";
import { ArtifactFieldMapSchema } from "@/lib/lease-documents/artifact-intake-contract";
import {
  ApprovedLeaseCatalogSchema,
  ApprovedPacketSourcesSchema,
} from "@/lib/lease-documents/live-source-schema";
import { resolveDisplayedPacketInput } from "@/lib/lease-documents/live-input";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { readyS66Input } from "@/tests/fixtures/s66-packet";
import { geometry, staticOriginal } from "@/tests/fixtures/synthetic-static";
import { readStaticPdfValuesByOrder } from "@/lib/lease-documents/static-pdf";
import {
  resolveApprovedDotloopArtifact,
  readHistoricalApprovedArtifact,
} from "@/lib/lease-documents/approved-artifact-content";
import {
  savePacketSnapshot,
  getCurrentPacketSnapshot,
} from "@/lib/firestore/lease-document-packet-snapshots";
import {
  prepareDerivedArtifact,
  approveDerivedArtifact,
  readDerivedArtifactContent,
  readHistoricalDerivedArtifactContent,
  type DerivedArtifactDeps,
} from "@/lib/firestore/lease-derived-artifacts";
import { DotloopClient } from "@/lib/integrations/dotloop/client";
import { DotloopRequestScheduler } from "@/lib/integrations/dotloop/request-scheduler";
import { boundaryFromContentType, parseMultipart } from "@/tests/helpers/multipart";

const AT = "2026-11-03T18:00:00.000Z";
const admin: AuthenticatedUser = {
  uid: "synthetic-admin",
  email: "synthetic-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
let fake: FakeFirestore;
beforeEach(() => {
  fake = new FakeFirestore();
  state.db = fake as unknown as Firestore;
});

async function approvedFixture(spaceId = "lease-renewals") {
  const db = state.db!;
  const bytes = await staticOriginal();
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const policy = await createPublicationPolicy(
    admin,
    {
      connectorId: "synthetic-originals",
      rootId: "synthetic-reviewed-root",
      allowedSpaces: ["lease-renewals"],
      allowedTypes: [
        { extension: ".pdf", maxBytes: 2 * 1024 * 1024, mimeTypes: ["application/pdf"] },
      ],
      scannerKey: "managed-clamav-renewal-original-v1",
      sensitivityCeiling: "Low",
      reason: "Synthetic source review only; no supplied original or legal decision.",
      resourceScope: {
        resourceType: "file",
        resourceId: stablePublicationResourceId(
          "synthetic-originals",
          "synthetic-reviewed-root",
          "lease-renewals",
          "sources/synthetic.pdf",
        ),
        artifactKind: "renewal_extension",
        path: "sources/synthetic.pdf",
        fileName: "synthetic.pdf",
        contentHash,
        byteSize: bytes.length,
        reviewedBlankOriginal: true,
        reviewedNoClientData: true,
      },
    },
    db,
  );
  const response = await POST(
    new Request("https://fixture.invalid/api/spaces/lease-renewals/publications", {
      method: "POST",
      body: new Uint8Array(bytes).buffer,
      headers: {
        "content-type": "application/octet-stream",
        "x-publication-file-name": "synthetic.pdf",
        "x-publication-path": "sources/synthetic.pdf",
        "x-publication-mime-type": "application/pdf",
        "x-publication-byte-size": String(bytes.length),
        "x-publication-citation-label": "Synthetic only",
        "x-publication-source-state": "Verified Source",
        "x-publication-policy-id": policy.id,
        "x-publication-resource-type": "file",
      },
    }),
    { params: Promise.resolve({ spaceId: "lease-renewals" }) },
  );
  expect(response.status, await response.clone().text()).toBe(201);
  const { version } = (await response.json()) as { version: PublicationVersionRecord };
  if (spaceId !== "lease-renewals") {
    // Historical-space fixture only: no migration or legacy publication grant is performed.
    await db
      .collection("publication_versions")
      .doc(version.id)
      .set({ ...version, spaceId });
  }
  const received = await receiveArtifactFamily(
    admin,
    {
      kind: "renewal_extension",
      operationId: randomUUID(),
      publicationSource: {
        system: "s21_publication",
        reference: `publication:${version.id}`,
        contentHash,
      },
      providerBindings: { dotloopDocumentRef: "synthetic-document" },
    },
    db,
    undefined,
    AT,
  );
  expect(received.entry.state).toBe("received");
  expect(fake.store.has("lease_artifact_catalogs/current")).toBe(false);
  const reviewedGeometry = await geometry(bytes);
  reviewedGeometry.regions = reviewedGeometry.regions.filter(
    (region) => region.fieldId === "Rent",
  );
  reviewedGeometry.regions[0].format = "money_cents";
  const map = ArtifactFieldMapSchema.parse({
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "renewal_extension",
    mapVersion: "synthetic-v1",
    templateVersion: `publication:${version.id}`,
    formFamily: "fixture-standard-family",
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension"],
    fields: [
      {
        fieldId: "Rent",
        factKey: "lease.monthly_rent_cents",
        meaning: "Synthetic monthly rent",
        required: true,
        multiplicity: "single",
        allowedSourceSystems: ["rentvine"],
      },
    ],
    signers: [0, 1].map((index) => ({
      signerRole: "tenant",
      participantKind: "tenant",
      required: true,
      location: `Synthetic human signature ${index}`,
    })),
    static: reviewedGeometry,
    reviewNote: "Synthetic map decision; no real original is approved.",
  });
  const mapped = await recordArtifactFieldMap(
    admin,
    {
      kind: "renewal_extension",
      fieldMap: map,
      expectedRevision: received.entry.revision,
    },
    db,
    AT,
  );
  await decideArtifactFamily(
    admin,
    {
      kind: "renewal_extension",
      decision: "approve",
      reason: "Synthetic fixture approval only",
      expectedRevision: mapped.revision,
      operationId: randomUUID(),
    },
    db,
    undefined,
    AT,
  );
  for (const [index, kind] of LEASE_ARTIFACT_KINDS.entries()) {
    await setFamilyUse(
      admin,
      {
        kind,
        use: kind === "renewal_extension" ? "mandatory" : "not_used",
        expectedVersion: index,
        operationId: randomUUID(),
      },
      db,
      AT,
    );
  }
  const catalog = ApprovedLeaseCatalogSchema.parse(
    (await db.collection("lease_artifact_catalogs").doc("current").get()).data(),
  ).catalog;
  const artifact = catalog.artifacts[0];
  expect(artifact).toMatchObject({
    kind: "renewal_extension",
    status: "active",
    contentHash,
    fillMapping: { mapHash: expect.any(String) },
  });
  const input = readyS66Input();
  const rent = input.facts.find((fact) => fact.fieldKey === "lease.monthly_rent_cents")!;
  rent.normalizedValue = 85_000;
  rent.displayValue = "85000";
  const lease = { leaseID: 701, baseRentAmount: 850 };
  const workspace = emptyRenewalWorkspace("701", "11111111-1111-4111-8111-111111111111", {
    kind: "lease_bound",
    source: "Synthetic fixture",
  });
  workspace.termsRevision = 1;
  const scope = renewalWorkspaceDocId("701");
  await db
    .collection("lease_renewal_lease_bound_workspaces")
    .doc(scope)
    .set({ ...workspace });
  await db
    .collection("lease_document_source_mappings")
    .doc(scope)
    .set(
      ApprovedPacketSourcesSchema.parse({
        schemaVersion: "approved-renewal-packet-sources/v1",
        data_mode: "live",
        leaseId: "701",
        cycleId: workspace.cycleId,
        termsRevision: workspace.termsRevision,
        leaseSourceHash: hashExecutionPreview(lease),
        approvedByUid: admin.uid,
        approvedAt: AT,
        source: catalog.source,
        facts: input.facts,
        participants: input.participants,
        charges: input.charges,
        animals: input.animals,
        contacts: input.participants.map((participant, index) => ({
          participantRef: participant.providerBindings!.dotloopParticipantRef,
          fullName: `Synthetic participant ${index}`,
          email: `synthetic-${index}@example.test`,
          role: participant.kind === "tenant" ? "TENANT" : "LANDLORD",
        })),
      }),
    );
  const resolve = () => resolveDisplayedPacketInput(admin, "701", "701", AT, [lease], db);
  const current = () =>
    resolveApprovedDotloopArtifact(admin, {
      catalog,
      artifactId: artifact.artifactId,
      expectedContentHash: contentHash,
    });
  const historical = () =>
    readHistoricalApprovedArtifact(admin, {
      originalPublication: `publication:${version.id}`,
      originalHash: contentHash,
    });
  return {
    db,
    bytes,
    version,
    artifact,
    catalog,
    contentHash,
    resolve,
    current,
    historical,
  };
}

describe("S130 AC22 canonical approved-original continuation", () => {
  it.each(["lease-renewals", "renewals"])(
    "keeps %s approved material eligible in the actual packet reader",
    async (spaceId) => {
      const f = await approvedFixture(spaceId);
      const source = await f.resolve();
      expect(source.sources).not.toBeNull();
      expect(source.input.catalog.artifacts[0].status).toBe("active");
      expect(evaluateRenewalPacket(source.input).state).toBe("Ready for preview");
      expect(source.notices.join(" ")).not.toContain(
        "publication is unavailable or changed",
      );
    },
  );
  it.each(["lease-renewals", "renewals"])(
    "reads exact current %s bytes, fills them, and transports the approved result",
    async (spaceId) => {
      const f = await approvedFixture(spaceId);
      expect((await f.current()).content).toEqual(f.bytes);
      const source = await f.resolve();
      const evaluation = evaluateRenewalPacket(source.input);
      expect(evaluation.blockers).toEqual([]);
      const snapshot = await savePacketSnapshot(
        admin,
        { evaluation, expectedCurrentSnapshotId: null, nowIso: AT },
        f.db,
      );
      const deps: DerivedArtifactDeps = {
        resolve: async () => ({
          input: (await f.resolve()).input,
          snapshot: await getCurrentPacketSnapshot(admin, "701", "701", f.db),
        }),
        original: resolveApprovedDotloopArtifact,
        historicalOriginal: readHistoricalApprovedArtifact,
        content: new FirestorePublicationContentStore(f.db),
        now: () => AT,
      };
      const identity = {
        leaseId: "701",
        snapshotId: snapshot.snapshotId,
        artifactId: f.artifact.artifactId,
      };
      const prepared = await prepareDerivedArtifact(
        admin,
        {
          ...identity,
          action: "prepare",
          operationId: randomUUID(),
          expectedCurrentId: null,
        },
        f.db,
        deps,
      );
      const approved = await approveDerivedArtifact(
        admin,
        {
          ...identity,
          action: "approve",
          operationId: randomUUID(),
          derivedId: prepared.id,
          outputHash: prepared.outputHash,
          inspected: true,
        },
        f.db,
        deps,
      );
      const filled = await readDerivedArtifactContent(
        admin,
        { ...identity, derivedId: approved.id, requireApproval: true },
        f.db,
        deps,
      );
      expect(
        await readStaticPdfValuesByOrder(
          filled.content,
          approved.comparison.regionOrder!,
        ),
      ).toEqual({ Rent: "$850.00" });
      const transport = {
        fetch: vi.fn(
          async (request: { body?: unknown; headers: Record<string, string> }) => {
            const boundary = boundaryFromContentType(request.headers["content-type"]);
            expect(boundary).toBeTruthy();
            const parts = parseMultipart(request.body as Uint8Array, boundary!);
            expect(parts).toHaveLength(1);
            expect(parts[0].data).toEqual(filled.content);
            return {
              status: 201,
              headers: {},
              json: async () => ({ data: { id: 77, name: filled.fileName } }),
            };
          },
        ),
      };
      const client = new DotloopClient({
        transport,
        tokens: { accessToken: async () => "synthetic-only", refresh: async () => null },
        scheduler: new DotloopRequestScheduler(),
      });
      await client.uploadDocument({
        profileId: "10",
        loopId: "20",
        folderId: "30",
        fileName: filled.fileName,
        contentType: filled.contentType,
        content: filled.content,
      });
      expect(transport.fetch).toHaveBeenCalledTimes(1);
      expect((await f.historical()).content).toEqual(f.bytes);
      await f.db.collection("publication_resources").doc(f.version.resourceId).set({
        activeVersionId: "synthetic-successor",
      });
      await expect(f.current()).rejects.toThrow(/unavailable or has changed/);
      const retained = await readHistoricalDerivedArtifactContent(
        admin,
        { ...identity, derivedId: approved.id, requireApproval: true },
        f.db,
        deps,
      );
      expect(retained.content).toEqual(filled.content);
      expect(retained.original.content).toEqual(f.bytes);
    },
  );
  it.each(["lease-renewals", "renewals"])(
    "retains immutable %s audit bytes after a successor but refuses current transport",
    async (spaceId) => {
      const f = await approvedFixture(spaceId);
      await f.db
        .collection("publication_resources")
        .doc(f.version.resourceId)
        .set({ activeVersionId: "synthetic-successor" });
      await expect(f.current()).rejects.toThrow(/unavailable or has changed/);
      expect((await f.historical()).content).toEqual(f.bytes);
      expect((await f.resolve()).input.catalog.artifacts[0].status).toBe("inactive");
    },
  );
  it.each(["owner-renewal-outreach", "lease-renewals-other", "Renewals"])(
    "refuses unrelated %s at downstream readers before content load",
    async (spaceId) => {
      const f = await approvedFixture();
      await f.db
        .collection("publication_versions")
        .doc(f.version.id)
        .set({ ...f.version, spaceId });
      const read = vi.spyOn(FirestorePublicationContentStore.prototype, "read");
      try {
        await expect(f.current()).rejects.toThrow(/unavailable or has changed/);
        await expect(f.historical()).rejects.toThrow(/unavailable or inconsistent/);
        expect(read).not.toHaveBeenCalled();
        expect((await f.resolve()).input.catalog.artifacts[0].status).toBe("inactive");
      } finally {
        read.mockRestore();
      }
    },
  );
});
