import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import {
  CreatePublicationPolicySchema,
  createPublicationPolicy,
  tightenPublicationPolicy,
} from "@/lib/publication/policy";
import { resolvePublicationScanner } from "@/lib/publication/provider";

const actor: AuthenticatedUser = {
  uid: "fixture-admin",
  email: "fixture-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const key = "managed-clamav-renewal-original-v1";
const resourceId = `source:${createHash("sha256")
  .update(
    JSON.stringify({
      connectorId: "fixture-renewal-originals",
      path: "sources/blank-extension.pdf",
      rootId: "fixture-originals",
      spaceId: "lease-renewals",
    }),
  )
  .digest("hex")}`;
function input() {
  return {
    allowedSpaces: ["lease-renewals"],
    allowedTypes: [
      { extension: ".pdf", maxBytes: 2 * 1024 * 1024, mimeTypes: ["application/pdf"] },
    ],
    connectorId: "fixture-renewal-originals",
    rootId: "fixture-originals",
    scannerKey: key,
    sensitivityCeiling: "Low" as const,
    reason: "Review this exact synthetic blank renewal original only.",
    resourceScope: {
      resourceType: "file" as const,
      resourceId,
      artifactKind: "renewal_extension" as const,
      path: "sources/blank-extension.pdf",
      fileName: "blank-extension.pdf",
      contentHash: "a".repeat(64),
      byteSize: 512,
      reviewedBlankOriginal: true as const,
      reviewedNoClientData: true as const,
    },
  };
}

describe("S130 exact reviewed blank-original publication policy", () => {
  it("admits one exact renewal PDF without enabling general file publication", async () => {
    const fake = new FakeFirestore();
    const policy = await createPublicationPolicy(
      actor,
      input(),
      fake as unknown as Firestore,
    );
    expect(policy.resourceScope).toEqual(input().resourceScope);
    expect(policy.allowedSpaces).toEqual(["lease-renewals"]);
    expect(policy.allowedTypes).toEqual(input().allowedTypes);
  });
  it("refuses a broad type, Space, filename, family or unreviewed-content grant", async () => {
    for (const changed of [
      { allowedSpaces: ["owner-renewal-outreach"] },
      { allowedTypes: [{ extension: ".txt", maxBytes: 100, mimeTypes: ["text/plain"] }] },
      {
        resourceScope: {
          ...input().resourceScope,
          resourceId: `source:${"0".repeat(64)}`,
        },
      },
      { resourceScope: { ...input().resourceScope, fileName: "different.pdf" } },
      { resourceScope: { ...input().resourceScope, reviewedNoClientData: false } },
      { resourceScope: { ...input().resourceScope, byteSize: 2 * 1024 * 1024 + 1 } },
    ]) {
      const fake = new FakeFirestore();
      await expect(async () =>
        createPublicationPolicy(
          actor,
          CreatePublicationPolicySchema.parse({ ...input(), ...changed }),
          fake as unknown as Firestore,
        ),
      ).rejects.toThrow();
      expect(fake.store.size).toBe(0);
    }
  });
  it("allows an audited fresh hash/size review under the same identity, but rejects stale CAS and a changed family", async () => {
    const fake = new FakeFirestore(),
      db = fake as unknown as Firestore;
    const policy = await createPublicationPolicy(actor, input(), db);
    const changed = {
      ...input().resourceScope,
      contentHash: "b".repeat(64),
      byteSize: 600,
    };
    const next = await tightenPublicationPolicy(
      actor,
      policy.id,
      {
        resourceScope: changed,
        expectedContentHash: input().resourceScope.contentHash,
        reason: "Fresh exact synthetic original review; legal approval remains separate.",
      },
      db,
    );
    expect(next.id).toBe(policy.id);
    expect(next.resourceScope).toEqual(changed);
    await expect(
      tightenPublicationPolicy(
        actor,
        policy.id,
        {
          resourceScope: input().resourceScope,
          expectedContentHash: input().resourceScope.contentHash,
          reason: "Stale original review must be refused.",
        },
        db,
      ),
    ).rejects.toThrow();
    await expect(
      tightenPublicationPolicy(
        actor,
        policy.id,
        {
          resourceScope: { ...changed, artifactKind: "standard_lease" },
          expectedContentHash: changed.contentHash,
          reason: "Changing a reviewed original family must be refused.",
        },
        db,
      ),
    ).rejects.toThrow();
    expect(
      [...fake.store.values()].some(
        (row) =>
          row.eventType === "content_reviewed" && row.contentHash === changed.contentHash,
      ),
    ).toBe(true);
  });
  it("keeps the managed PDF key unavailable without its reviewed scope", async () => {
    expect(
      await resolvePublicationScanner(key).scanMalware(new Uint8Array(), {
        connectorId: "fixture",
        rootId: "fixture",
        spaceId: "renewals",
        resourceId: "fixture",
        resourceType: "file",
        declaredByteSize: 0,
        declaredMimeType: "application/pdf",
        path: "sources/blank.pdf",
        fileName: "blank.pdf",
      }),
    ).toEqual({ code: "scanner_unavailable" });
  });
});
