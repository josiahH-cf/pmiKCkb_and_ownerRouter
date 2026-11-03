import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type {
  PublicationScanner,
  PublicationVersionRecord,
} from "@/lib/publication/types";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  scanner: null as PublicationScanner | null,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => ({
    uid: "fixture-editor",
    email: "fixture-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes: ["renewals"],
  }),
}));
vi.mock("@/lib/publication/provider", () => ({
  resolvePublicationScanner: vi.fn(() => state.scanner),
}));

import { GET, POST } from "@/app/api/spaces/[spaceId]/publications/route";
import {
  createPublicationPolicy,
  tightenPublicationPolicy,
} from "@/lib/publication/policy";
import { FakePublicationScanner } from "@/lib/publication/scanners";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import { receiveArtifactFamily } from "@/lib/firestore/lease-artifact-intake";
import { stablePublicationResourceId } from "@/lib/publication/resource-id";

const admin: AuthenticatedUser = {
  uid: "fixture-admin",
  email: "fixture-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const key = "managed-clamav-renewal-original-v1";
let fake: FakeFirestore;
beforeEach(() => {
  fake = new FakeFirestore();
  state.db = fake as unknown as Firestore;
  state.scanner = new FakePublicationScanner(key);
});
async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const policy = await createPublicationPolicy(
    admin,
    {
      connectorId: "fixture-originals",
      rootId: "fixture-approved-source-root",
      allowedSpaces: ["lease-renewals"],
      allowedTypes: [
        { extension: ".pdf", maxBytes: 2 * 1024 * 1024, mimeTypes: ["application/pdf"] },
      ],
      scannerKey: key,
      sensitivityCeiling: "Low",
      reason:
        "Exact synthetic reviewed blank original; no real legal approval is asserted.",
      resourceScope: {
        resourceType: "file",
        resourceId: stablePublicationResourceId(
          "fixture-originals",
          "fixture-approved-source-root",
          "lease-renewals",
          "sources/blank.pdf",
        ),
        artifactKind: "renewal_extension",
        path: "sources/blank.pdf",
        fileName: "blank.pdf",
        contentHash,
        byteSize: bytes.length,
        reviewedBlankOriginal: true,
        reviewedNoClientData: true,
      },
    },
    state.db!,
  );
  const request = (content = bytes, path = "sources/blank.pdf") =>
    new Request("https://app.test/api/spaces/lease-renewals/publications", {
      method: "POST",
      body: new Uint8Array(content).buffer,
      headers: {
        "content-type": "application/octet-stream",
        "x-publication-file-name": "blank.pdf",
        "x-publication-path": path,
        "x-publication-mime-type": "application/pdf",
        "x-publication-byte-size": String(content.length),
        "x-publication-citation-label": "Synthetic blank original",
        "x-publication-source-state": "Verified Source",
        "x-publication-policy-id": policy.id,
        "x-publication-resource-type": "file",
      },
    });
  const context = { params: Promise.resolve({ spaceId: "lease-renewals" }) };
  return { bytes, contentHash, policy, request, context };
}

describe("S130 canonical Editor PDF publication and Admin trusted-original receipt", () => {
  it("stores exact current Live bytes, then receives that family without approving a map/catalog", async () => {
    const f = await fixture();
    const response = await POST(f.request(), f.context);
    expect(response.status, await response.clone().text()).toBe(201);
    const { version } = (await response.json()) as { version: PublicationVersionRecord };
    expect(version).toMatchObject({
      validated: true,
      spaceId: "lease-renewals",
      contentHash: f.contentHash,
      renewalArtifactKind: "renewal_extension",
    });
    const readback = await GET(
      new Request("https://app.test/api/spaces/lease-renewals/publications"),
      f.context,
    );
    expect(await readback.json()).toMatchObject({
      originals: [
        { id: version.id, contentHash: f.contentHash, artifactKind: "renewal_extension" },
      ],
    });
    expect(
      await new FirestorePublicationContentStore(state.db!).read(version.contentRef),
    ).toEqual(f.bytes);
    const publicationSource = {
      system: "s21_publication",
      reference: `publication:${version.id}`,
      contentHash: f.contentHash,
    };
    const received = await receiveArtifactFamily(
      admin,
      {
        kind: "renewal_extension",
        publicationSource,
        operationId: "9cdbafda-2440-4cbe-a20c-06922072ee1d",
      },
      state.db!,
    );
    expect(received.entry).toMatchObject({
      state: "received",
      publication: publicationSource,
    });
    expect(fake.store.has("lease_artifact_catalogs/current")).toBe(false);
    await expect(
      receiveArtifactFamily(
        admin,
        {
          kind: "standard_lease",
          publicationSource,
          operationId: "937a3c18-4218-48f0-8a3f-71514d50adaf",
        },
        state.db!,
      ),
    ).rejects.toThrow(/different form family/);
  });
  it("refuses stale bytes, wrong target path and unrelated Space without an active version", async () => {
    const f = await fixture();
    const changed = new Uint8Array(f.bytes);
    changed[changed.length - 1] ^= 1;
    expect((await POST(f.request(changed), f.context)).status).toBe(403);
    expect((await POST(f.request(f.bytes, "sources/other.pdf"), f.context)).status).toBe(
      409,
    );
    expect(
      (
        await POST(f.request(), {
          params: Promise.resolve({ spaceId: "owner-renewal-outreach" }),
        })
      ).status,
    ).toBe(409);
    expect(
      [...fake.store.keys()].some(
        (path) =>
          path.startsWith("publication_versions/") ||
          path.startsWith("publication_resources/"),
      ),
    ).toBe(false);
  });
  it("publishes a freshly reviewed successor under the same policy/resource and refuses receipt of the superseded original", async () => {
    const f = await fixture();
    const first = (await (await POST(f.request(), f.context)).json()) as {
      version: PublicationVersionRecord;
    };
    const original = structuredClone(
      fake.store.get(`publication_versions/${first.version.id}`),
    );
    const nextPdf = await PDFDocument.load(f.bytes);
    nextPdf.addPage();
    const bytes = await nextPdf.save(),
      contentHash = createHash("sha256").update(bytes).digest("hex");
    if (f.policy.resourceScope?.resourceType !== "file")
      throw new Error("Fixture original scope missing");
    await tightenPublicationPolicy(
      admin,
      f.policy.id,
      {
        resourceScope: { ...f.policy.resourceScope, contentHash, byteSize: bytes.length },
        expectedContentHash: f.contentHash,
        reason: "Freshly reviewed exact synthetic successor original.",
      },
      state.db!,
    );
    const response = await POST(f.request(bytes), f.context);
    expect(response.status, await response.clone().text()).toBe(201);
    const second = (await response.json()) as { version: PublicationVersionRecord };
    expect(second.version).toMatchObject({
      policyId: f.policy.id,
      resourceId: first.version.resourceId,
      versionNumber: 2,
      contentHash,
    });
    expect(fake.store.get(`publication_versions/${first.version.id}`)).toEqual(original);
    await expect(
      receiveArtifactFamily(
        admin,
        {
          kind: "renewal_extension",
          publicationSource: {
            system: "s21_publication",
            reference: `publication:${first.version.id}`,
            contentHash: f.contentHash,
          },
          operationId: "9cdbafda-2440-4cbe-a20c-06922072ee1d",
        },
        state.db!,
      ),
    ).rejects.toThrow(/current validated live publication/);
  });
  it("keeps malware, sensitivity rejection and scanner outage out of active publication", async () => {
    const f = await fixture();
    for (const malware of [
      { code: "malware_detected" as const },
      { code: "scanner_unavailable" as const },
    ]) {
      state.scanner = new FakePublicationScanner(key, { malware });
      expect((await POST(f.request(), f.context)).status).toBe(
        malware.code === "scanner_unavailable" ? 409 : 400,
      );
    }
    state.scanner = new FakePublicationScanner(key, {
      sensitivity: { code: "sensitivity_violation" },
    });
    expect((await POST(f.request(), f.context)).status).toBe(400);
    expect(
      [...fake.store.keys()].some((path) => path.startsWith("publication_versions/")),
    ).toBe(false);
  });
});
