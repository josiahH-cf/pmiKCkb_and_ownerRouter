import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { FirestoreVendorStore, VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const vendorId = "vendor:test-summit-plumbing";
const vendorEmail = "service@summit-plumbing.example.invalid";
const oldUid = "uid-test-summit-old";
const replacementUid = "uid-test-summit-rotated";
const claimId = "reset-claim-one";
const nowMs = Date.parse("2026-07-15T14:00:00.000Z");

function seedActiveVendor(fake: FakeFirestore) {
  fake.seed(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`, {
    id: vendorId,
    uid: oldUid,
    email: vendorEmail,
    displayName: "Summit Plumbing Test Vendor",
    status: "active",
    inviteVersion: 3,
    data_mode: "test",
    identityState: {
      emailVerified: true,
      totpRequired: true,
      totpVerified: true,
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
    activatedAt: "2026-07-15T12:00:00.000Z",
  });
}

function resetInput() {
  return {
    actorUid: "admin-1",
    vendorId,
    expectedUid: oldUid,
    expectedStatus: "active" as const,
    expectedInviteVersion: 3,
    replacementUid,
    expectedEmail: vendorEmail,
    previewHash: "preview-hash-without-body",
    claimId,
    reasonHash: "reason-hash-without-body",
    nowMs,
    nowIso: "2026-07-15T14:00:00.000Z",
  };
}

function claimInput(overrides: Partial<ReturnType<typeof resetInput>> = {}) {
  const input = { ...resetInput(), ...overrides };
  return {
    actorUid: input.actorUid,
    vendorId: input.vendorId,
    expectedUid: input.expectedUid,
    expectedStatus: input.expectedStatus,
    expectedInviteVersion: input.expectedInviteVersion,
    expectedEmail: input.expectedEmail,
    previewHash: input.previewHash,
    reasonHash: input.reasonHash,
    claimId: input.claimId,
    nowMs: input.nowMs,
    nowIso: input.nowIso,
    claimExpiresAtMs: input.nowMs + 120_000,
  };
}

describe("Firestore Test Vendor authentication reset", () => {
  it("atomically swaps the UID, resets setup state, audits once, and resumes idempotently", async () => {
    const fake = new FakeFirestore();
    seedActiveVendor(fake);
    const store = new FirestoreVendorStore(fake as unknown as Firestore);

    await expect(
      store.claimVendorAuthenticationReset(claimInput()),
    ).resolves.toMatchObject({
      outcome: "claimed",
      recoveredExpiredClaim: false,
    });
    await expect(store.resetVendorAuthentication(resetInput())).resolves.toMatchObject({
      uid: replacementUid,
      status: "pending_setup",
      inviteVersion: 4,
      identityState: { totpVerified: false },
    });
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      uid: replacementUid,
      status: "pending_setup",
      inviteVersion: 4,
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: false,
      },
      authenticationReset: {
        previewHash: resetInput().previewHash,
        inviteVersion: 4,
        sourceUid: oldUid,
        sourceStatus: "active",
        sourceInviteVersion: 3,
        status: "prepared",
        claimId,
        claimExpiresAtMs: nowMs + 120_000,
      },
    });
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`),
    ).not.toHaveProperty("activatedAt");
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`),
    ).not.toHaveProperty("disabledAt");

    const auditEntries = Array.from(fake.store.entries()).filter(([path]) =>
      path.startsWith(`${VENDOR_COLLECTIONS.audit}/`),
    );
    expect(auditEntries).toHaveLength(2);
    expect(auditEntries.map(([, value]) => value.action).sort()).toEqual([
      "test_vendor_authentication_reset",
      "test_vendor_authentication_reset_claimed",
    ]);
    expect(
      auditEntries.find(
        ([, value]) => value.action === "test_vendor_authentication_reset",
      )?.[1],
    ).toEqual({
      actorUid: "admin-1",
      vendorId,
      action: "test_vendor_authentication_reset",
      reasonHash: resetInput().reasonHash,
      createdAt: resetInput().nowIso,
    });
    expect(JSON.stringify(auditEntries)).not.toContain("reset the vendor");
    expect(JSON.stringify(auditEntries)).not.toContain("password");
    expect(JSON.stringify(auditEntries)).not.toContain("oobCode");

    await expect(store.resetVendorAuthentication(resetInput())).resolves.toMatchObject({
      uid: replacementUid,
      inviteVersion: 4,
    });
    expect(
      Array.from(fake.store.keys()).filter((path) =>
        path.startsWith(`${VENDOR_COLLECTIONS.audit}/`),
      ),
    ).toHaveLength(2);

    const repairedUid = "uid-test-summit-repaired-replacement";
    await expect(
      store.resetVendorAuthentication({
        ...resetInput(),
        replacementUid: repairedUid,
      }),
    ).resolves.toMatchObject({ uid: repairedUid, inviteVersion: 4 });
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      uid: repairedUid,
      inviteVersion: 4,
    });
    expect(
      Array.from(fake.store.keys()).filter((path) =>
        path.startsWith(`${VENDOR_COLLECTIONS.audit}/`),
      ),
    ).toHaveLength(2);

    await expect(
      store.completeVendorAuthenticationReset({
        vendorId,
        replacementUid: repairedUid,
        previewHash: resetInput().previewHash,
        claimId,
        nowMs,
      }),
    ).resolves.toMatchObject({ uid: repairedUid, inviteVersion: 4 });
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      authenticationReset: { status: "completed" },
    });
    await expect(
      store.claimVendorAuthenticationReset({
        ...claimInput(),
        claimId: "completed-replay-claim",
      }),
    ).resolves.toEqual({ outcome: "completed" });
  });

  it("allows one live claim and atomically rebinds an expired takeover to a fresh reason", async () => {
    const fake = new FakeFirestore();
    seedActiveVendor(fake);
    const store = new FirestoreVendorStore(fake as unknown as Firestore);

    await expect(
      store.claimVendorAuthenticationReset(claimInput()),
    ).resolves.toMatchObject({
      outcome: "claimed",
      recoveredExpiredClaim: false,
    });
    await expect(
      store.claimVendorAuthenticationReset({
        ...claimInput(),
        claimId: "overlapping-claim",
        nowMs: nowMs + 30_000,
        claimExpiresAtMs: nowMs + 150_000,
      }),
    ).resolves.toEqual({ outcome: "busy" });
    await expect(
      store.claimVendorAuthenticationReset({
        ...claimInput(),
        actorUid: "admin-2",
        previewHash: "fresh-recovery-preview-hash",
        reasonHash: "fresh-recovery-reason-hash",
        claimId: "stale-recovery-claim",
        nowMs: nowMs + 120_001,
        nowIso: "2026-07-15T14:02:00.001Z",
        claimExpiresAtMs: nowMs + 240_001,
      }),
    ).resolves.toMatchObject({
      outcome: "claimed",
      recoveredExpiredClaim: true,
      record: {
        uid: oldUid,
        status: "active",
        inviteVersion: 3,
        authenticationReset: {
          previewHash: "fresh-recovery-preview-hash",
          claimId: "stale-recovery-claim",
          status: "claimed",
        },
      },
    });
    expect(
      Array.from(fake.store.values()).filter(
        (value) =>
          value.action === "test_vendor_authentication_reset_claimed" ||
          value.action === "test_vendor_authentication_reset_recovery_claimed",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUid: "admin-1",
          action: "test_vendor_authentication_reset_claimed",
        }),
        expect.objectContaining({
          actorUid: "admin-2",
          action: "test_vendor_authentication_reset_recovery_claimed",
          reasonHash: "fresh-recovery-reason-hash",
        }),
      ]),
    );
    await expect(
      store.renewVendorAuthenticationResetClaim({
        vendorId,
        previewHash: resetInput().previewHash,
        claimId,
        nowMs: nowMs + 120_001,
        claimExpiresAtMs: nowMs + 240_001,
      }),
    ).resolves.toBe(false);
    await expect(store.resetVendorAuthentication(resetInput())).resolves.toBeNull();
  });

  it("serializes disable and activation behind reset, but releases both after completion", async () => {
    const fake = new FakeFirestore();
    seedActiveVendor(fake);
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    await store.claimVendorAuthenticationReset(claimInput());

    await expect(
      store.disableVendor({
        vendorId,
        expectedUid: oldUid,
        nowIso: "2026-07-15T14:00:30.000Z",
      }),
    ).resolves.toBe("reset_in_progress");
    await expect(
      store.activateVendor(
        vendorId,
        oldUid,
        vendorEmail,
        "2026-07-15T14:00:30.000Z",
        "test",
      ),
    ).resolves.toBe(false);
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      uid: oldUid,
      status: "active",
      inviteVersion: 3,
      authenticationReset: { status: "claimed" },
    });

    await expect(
      store.claimVendorAuthenticationReset({
        ...claimInput(),
        claimId: "recover-after-lifecycle-conflicts",
        nowMs: nowMs + 120_001,
        claimExpiresAtMs: nowMs + 240_001,
      }),
    ).resolves.toMatchObject({
      outcome: "claimed",
      recoveredExpiredClaim: true,
    });
    await store.resetVendorAuthentication({
      ...resetInput(),
      claimId: "recover-after-lifecycle-conflicts",
      nowMs: nowMs + 120_001,
      replacementUid,
    });
    await store.completeVendorAuthenticationReset({
      vendorId,
      replacementUid,
      previewHash: resetInput().previewHash,
      claimId: "recover-after-lifecycle-conflicts",
      nowMs: nowMs + 120_001,
    });

    await expect(
      store.disableVendor({
        vendorId,
        expectedUid: oldUid,
        nowIso: "2026-07-15T14:02:01.000Z",
      }),
    ).resolves.toBe("stale");
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      uid: replacementUid,
      status: "pending_setup",
    });

    await expect(
      store.activateVendor(
        vendorId,
        replacementUid,
        vendorEmail,
        "2026-07-15T14:02:02.000Z",
        "test",
      ),
    ).resolves.toBe(true);
    await expect(
      store.disableVendor({
        vendorId,
        expectedUid: replacementUid,
        nowIso: "2026-07-15T14:02:03.000Z",
      }),
    ).resolves.toBe("disabled");
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      uid: replacementUid,
      status: "disabled",
      inviteVersion: 4,
      authenticationReset: { status: "completed" },
    });
  });

  it("allows authentication reset after a setup-link claim completes", async () => {
    const fake = new FakeFirestore();
    seedActiveVendor(fake);
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`, {
      ...(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`) ?? {}),
      status: "pending_setup",
    });
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    await expect(
      store.claimVendorSetupLinkRegeneration({
        actorUid: "admin-1",
        vendorId,
        expectedUid: oldUid,
        expectedInviteVersion: 3,
        expectedEmail: vendorEmail,
        previewHash: "completed-setup-preview",
        reasonHash: "completed-setup-reason-hash",
        claimId: "completed-setup-owner",
        nowMs,
        nowIso: "2026-07-15T14:00:00.000Z",
        claimExpiresAtMs: nowMs + 120_000,
      }),
    ).resolves.toBe("claimed");
    await expect(
      store.disableVendor({
        vendorId,
        expectedUid: oldUid,
        nowIso: "2026-07-15T14:00:01.000Z",
      }),
    ).resolves.toBe("reset_in_progress");
    await expect(
      store.activateVendor(
        vendorId,
        oldUid,
        vendorEmail,
        "2026-07-15T14:00:01.000Z",
        "test",
      ),
    ).resolves.toBe(false);
    await expect(
      store.completeVendorSetupLinkRegeneration({
        actorUid: "admin-1",
        vendorId,
        expectedUid: oldUid,
        expectedInviteVersion: 3,
        expectedEmail: vendorEmail,
        previewHash: "completed-setup-preview",
        claimId: "completed-setup-owner",
        reasonHash: "bodyless-setup-reason-hash",
        nowMs,
        nowIso: "2026-07-15T14:00:00.000Z",
      }),
    ).resolves.toBe(true);
    await expect(
      store.claimVendorAuthenticationReset({
        ...claimInput({
          previewHash: "reset-after-completed-setup",
          claimId: "reset-after-completed-setup-owner",
        }),
        expectedStatus: "pending_setup",
      }),
    ).resolves.toMatchObject({
      outcome: "claimed",
      recoveredExpiredClaim: false,
    });
  });

  it("rejects the old UID if its already-authorized activation arrives after rotation", async () => {
    const fake = new FakeFirestore();
    seedActiveVendor(fake);
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    await store.claimVendorAuthenticationReset(claimInput());
    await store.resetVendorAuthentication(resetInput());

    await expect(
      store.activateVendor(
        vendorId,
        oldUid,
        vendorEmail,
        "2026-07-15T14:01:00.000Z",
        "test",
      ),
    ).resolves.toBe(false);
    expect(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`)).toMatchObject({
      uid: replacementUid,
      status: "pending_setup",
      identityState: { totpVerified: false },
    });
  });

  it("rejects a pre-reset mailbox confirmation against the rotated Vendor UID", async () => {
    const fake = new FakeFirestore();
    seedActiveVendor(fake);
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    await store.claimVendorAuthenticationReset(claimInput());
    await store.resetVendorAuthentication(resetInput());
    fake.seed(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`, {
      ...(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`) ?? {}),
      status: "active",
      identityState: {
        emailVerified: true,
        totpRequired: true,
        totpVerified: true,
      },
    });
    const ticketId = "ticket:test-maple-leak";
    const threadId = "test-thread:ticket:test-maple-leak";
    const confirmationId = "confirmation-before-reset";
    fake.seed(`${VENDOR_COLLECTIONS.assignments}/${ticketId}`, {
      ticket_id: ticketId,
      vendor_id: vendorId,
      active: true,
      data_mode: "test",
    });
    fake.seed(`maintenance_tickets/${ticketId}`, {
      id: ticketId,
      data_mode: "test",
    });
    fake.seed(`${VENDOR_COLLECTIONS.threadLinks}/${vendorId}:${ticketId}:${threadId}`, {
      ticket_id: ticketId,
      vendor_id: vendorId,
      thread_id: threadId,
      active: true,
      data_mode: "test",
    });
    fake.seed(`${VENDOR_COLLECTIONS.testMailboxConfirmations}/${confirmationId}`, {
      id: confirmationId,
      actorUid: oldUid,
      vendorId,
      ticketId,
      threadId,
      payloadHash: "payload-before-reset",
      messageId: "message-before-reset@example.invalid",
      expiresAtMs: Date.parse("2026-07-15T14:10:00.000Z"),
      state: "pending",
      data_mode: "test",
      liveEvidenceEligible: false,
    });
    fake.seed(`${VENDOR_COLLECTIONS.testMailboxes}/${vendorId}:${ticketId}`, {
      id: `${vendorId}:${ticketId}`,
      vendorId,
      ticketId,
      threadId,
      data_mode: "test",
      liveEvidenceEligible: false,
      subject: "Invented sink leak",
      snippet: "Invented Test mailbox",
      label: "PMI/Vendor/Waiting",
      draftBody: "Prepared before reset",
      messages: [],
      createdAt: "2026-07-15T13:00:00.000Z",
      updatedAt: "2026-07-15T13:00:00.000Z",
    });

    await expect(
      store.commitTestMailboxReply({
        confirmationId,
        actorUid: oldUid,
        vendorId,
        ticketId,
        threadId,
        payloadHash: "payload-before-reset",
        messageId: "message-before-reset@example.invalid",
        body: "This stale confirmation must not append.",
        nowMs: Date.parse("2026-07-15T14:02:00.000Z"),
        nowIso: "2026-07-15T14:02:00.000Z",
      }),
    ).resolves.toEqual({ outcome: "mismatch" });
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.testMailboxes}/${vendorId}:${ticketId}`),
    ).toMatchObject({ draftBody: "Prepared before reset", messages: [] });
    expect(
      fake.store.get(`${VENDOR_COLLECTIONS.testMailboxConfirmations}/${confirmationId}`),
    ).toMatchObject({ state: "pending" });
  });
});
