import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { FirestoreVendorStore, VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

describe("Vendor bodyless audit store", () => {
  it("filters by Vendor, rejects malformed timestamps, sorts newest first, and caps output", async () => {
    const fake = new FakeFirestore();
    const vendorId = "vendor:test-summit-plumbing";
    fake.seed(`${VENDOR_COLLECTIONS.audit}/older`, {
      actorUid: "admin-1",
      vendorId,
      action: "vendor.created",
      reasonHash: "hash-one",
      createdAt: "2026-07-18T10:00:00.000Z",
    });
    fake.seed(`${VENDOR_COLLECTIONS.audit}/newer`, {
      actorUid: "admin-1",
      vendorId,
      action: "vendor.disabled",
      reasonHash: "hash-two",
      createdAt: "2026-07-18T12:00:00.000Z",
    });
    fake.seed(`${VENDOR_COLLECTIONS.audit}/malformed`, {
      actorUid: "admin-1",
      vendorId,
      action: "vendor.invalid",
      createdAt: "not-a-date",
    });
    fake.seed(`${VENDOR_COLLECTIONS.audit}/other-vendor`, {
      actorUid: "admin-1",
      vendorId: "vendor:other",
      action: "vendor.created",
      createdAt: "2026-07-18T13:00:00.000Z",
    });

    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    await expect(store.listBodylessAudit(vendorId, 1)).resolves.toEqual([
      expect.objectContaining({
        vendorId,
        action: "vendor.disabled",
        createdAt: "2026-07-18T12:00:00.000Z",
      }),
    ]);
  });
});
