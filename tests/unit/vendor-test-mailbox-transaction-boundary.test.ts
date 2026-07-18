import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { FirestoreVendorStore, VENDOR_COLLECTIONS } from "@/lib/firestore/vendors";
import type {
  VendorTestMailboxConfirmation,
  VendorTestMailboxRecord,
} from "@/lib/vendor/test-mailbox";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const vendorId = "vendor:test-summit-plumbing";
const actorUid = "uid-test-mailbox-owner";
const ticketId = "ticket:test-maple-leak";
const threadId = `test-thread:${ticketId}`;
const mailboxPath = `${VENDOR_COLLECTIONS.testMailboxes}/${vendorId}:${ticketId}`;
const assignmentPath = `${VENDOR_COLLECTIONS.assignments}/${ticketId}`;
const threadPath = `${VENDOR_COLLECTIONS.threadLinks}/${vendorId}:${ticketId}:${threadId}`;

function seedAuthorizedLane(fake: FakeFirestore) {
  fake.seed(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`, {
    id: vendorId,
    uid: actorUid,
    email: "service@summit-plumbing.example.invalid",
    displayName: "Summit Plumbing Test Vendor",
    status: "active",
    inviteVersion: 1,
    data_mode: "test",
    identityState: {
      emailVerified: true,
      totpRequired: true,
      totpVerified: true,
    },
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
  });
  fake.seed(assignmentPath, {
    ticket_id: ticketId,
    vendor_id: vendorId,
    active: true,
    data_mode: "test",
  });
  fake.seed(`maintenance_tickets/${ticketId}`, {
    id: ticketId,
    data_mode: "test",
    status: "Waiting on Vendor",
    priority: "Normal",
    priority_provenance: "operator-set",
    summary: "Invented sink leak",
    vendor_id: vendorId,
    source_state: "verified",
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T12:00:00.000Z",
  });
}

function mailbox(): VendorTestMailboxRecord {
  return {
    id: `${vendorId}:${ticketId}`,
    vendorId,
    ticketId,
    threadId,
    data_mode: "test",
    liveEvidenceEligible: false,
    subject: "Invented sink leak",
    snippet: "Invented Test mailbox",
    label: "PMI/Vendor/Waiting",
    labelHistory: [
      { label: "PMI/Vendor/Waiting", createdAt: "2026-07-15T12:00:00.000Z" },
    ],
    draftBody: "",
    messages: [],
    createdAt: "2026-07-15T12:00:00.000Z",
    updatedAt: "2026-07-15T12:00:00.000Z",
  };
}

function confirmation(): VendorTestMailboxConfirmation {
  return {
    id: "confirmation-before-boundary-change",
    actorUid,
    vendorId,
    ticketId,
    threadId,
    payloadHash: "payload-before-boundary-change",
    messageId: "message-before-boundary-change@example.invalid",
    expiresAtMs: Date.parse("2026-07-15T14:10:00.000Z"),
    state: "pending",
    data_mode: "test",
    liveEvidenceEligible: false,
  };
}

describe("Firestore Test mailbox transactional authorization", () => {
  it("returns a bodyless staff handoff only for the active Test ticket join", async () => {
    const fake = new FakeFirestore();
    seedAuthorizedLane(fake);
    const store = new FirestoreVendorStore(fake as unknown as Firestore);
    const initialMailbox = mailbox();
    await store.saveTestMailbox({
      actorUid,
      record: initialMailbox,
      expectedUpdatedAt: null,
    });
    fake.seed(mailboxPath, {
      ...initialMailbox,
      label: "PMI/Vendor/Complete",
      labelHistory: undefined,
      draftBody: "Private simulated draft",
      messages: [
        {
          id: "private-message-id",
          direction: "vendor_reply",
          body: "Private simulated reply",
          createdAt: "2026-07-15T12:01:00.000Z",
        },
      ],
      updatedAt: "2026-07-15T12:02:00.000Z",
    });

    const handoff = await store.getTestMailboxHandoffForStaff(ticketId);

    expect(handoff).toMatchObject({
      currentState: "Complete",
      labelHistory: [{ state: "Waiting" }, { state: "Complete" }],
      draftPresent: true,
      replyCount: 1,
      externalProvider: false,
      liveEvidenceEligible: false,
    });
    expect(JSON.stringify(handoff)).not.toMatch(
      /Private simulated|private-message-id|threadId|vendorId/i,
    );

    fake.seed(assignmentPath, {
      ...(fake.store.get(assignmentPath) ?? {}),
      active: false,
    });
    await expect(store.getTestMailboxHandoffForStaff(ticketId)).resolves.toBeNull();
  });

  it.each(["disable", "deassign", "uid rotation", "reset claim", "unlink"] as const)(
    "denies an existing mailbox read after %s",
    async (boundaryChange) => {
      const fake = new FakeFirestore();
      seedAuthorizedLane(fake);
      const store = new FirestoreVendorStore(fake as unknown as Firestore);
      const initialMailbox = mailbox();
      await store.saveTestMailbox({
        actorUid,
        record: initialMailbox,
        expectedUpdatedAt: null,
      });
      await expect(
        store.getTestMailbox({ actorUid, vendorId, ticketId }),
      ).resolves.toEqual(initialMailbox);

      if (boundaryChange === "deassign") {
        fake.seed(assignmentPath, {
          ...(fake.store.get(assignmentPath) ?? {}),
          active: false,
        });
      } else if (boundaryChange === "unlink") {
        fake.seed(threadPath, {
          ...(fake.store.get(threadPath) ?? {}),
          active: false,
        });
      } else {
        const vendorPath = `${VENDOR_COLLECTIONS.vendors}/${vendorId}`;
        const vendor = fake.store.get(vendorPath) ?? {};
        fake.seed(vendorPath, {
          ...vendor,
          ...(boundaryChange === "disable" ? { status: "disabled" } : {}),
          ...(boundaryChange === "uid rotation" ? { uid: "uid-after-reset" } : {}),
          ...(boundaryChange === "reset claim"
            ? { authenticationReset: { status: "claimed" } }
            : {}),
        });
      }

      await expect(
        store.getTestMailbox({ actorUid, vendorId, ticketId }),
      ).resolves.toBeNull();
      expect(fake.store.get(mailboxPath)).toEqual(initialMailbox);
    },
  );

  it.each([
    ["draft", "reset"],
    ["label", "reset"],
    ["prepare", "reset"],
    ["confirm", "reset"],
    ["draft", "deassign"],
    ["label", "deassign"],
    ["prepare", "deassign"],
    ["confirm", "deassign"],
    ["draft", "unlink"],
    ["label", "unlink"],
    ["prepare", "unlink"],
    ["confirm", "unlink"],
  ] as const)(
    "denies %s after %s at the commit transaction",
    async (mutation, boundaryChange) => {
      const fake = new FakeFirestore();
      seedAuthorizedLane(fake);
      const store = new FirestoreVendorStore(fake as unknown as Firestore);
      const initialMailbox = mailbox();
      await expect(
        store.saveTestMailbox({
          actorUid,
          record: initialMailbox,
          expectedUpdatedAt: null,
        }),
      ).resolves.toMatchObject({ id: initialMailbox.id });
      const preparedConfirmation = confirmation();
      if (mutation === "confirm") {
        await expect(
          store.createTestMailboxConfirmation(preparedConfirmation),
        ).resolves.toBe(true);
      }

      if (boundaryChange === "reset") {
        fake.seed(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`, {
          ...(fake.store.get(`${VENDOR_COLLECTIONS.vendors}/${vendorId}`) ?? {}),
          uid: "uid-after-reset",
          status: "pending_setup",
          inviteVersion: 2,
        });
      } else if (boundaryChange === "deassign") {
        fake.seed(assignmentPath, {
          ...(fake.store.get(assignmentPath) ?? {}),
          active: false,
        });
      } else {
        fake.seed(threadPath, {
          ...(fake.store.get(threadPath) ?? {}),
          active: false,
        });
      }

      if (mutation === "draft" || mutation === "label") {
        const updated: VendorTestMailboxRecord = {
          ...initialMailbox,
          ...(mutation === "draft"
            ? { draftBody: "This stale draft must not persist." }
            : { label: "PMI/Vendor/Complete" as const }),
          updatedAt: "2026-07-15T14:00:00.000Z",
        };
        await expect(
          store.saveTestMailbox({
            actorUid,
            record: updated,
            expectedUpdatedAt: initialMailbox.updatedAt,
          }),
        ).resolves.toBeNull();
      } else if (mutation === "prepare") {
        await expect(
          store.createTestMailboxConfirmation(preparedConfirmation),
        ).resolves.toBe(false);
      } else {
        await expect(
          store.commitTestMailboxReply({
            confirmationId: preparedConfirmation.id,
            actorUid,
            vendorId,
            ticketId,
            threadId,
            payloadHash: preparedConfirmation.payloadHash,
            messageId: preparedConfirmation.messageId,
            body: "This stale confirmed reply must not append.",
            nowMs: Date.parse("2026-07-15T14:00:00.000Z"),
            nowIso: "2026-07-15T14:00:00.000Z",
          }),
        ).resolves.toEqual({ outcome: "mismatch" });
      }

      expect(fake.store.get(mailboxPath)).toEqual(initialMailbox);
      if (mutation === "prepare") {
        expect(
          fake.store.has(
            `${VENDOR_COLLECTIONS.testMailboxConfirmations}/${preparedConfirmation.id}`,
          ),
        ).toBe(false);
      }
      if (mutation === "confirm") {
        expect(
          fake.store.get(
            `${VENDOR_COLLECTIONS.testMailboxConfirmations}/${preparedConfirmation.id}`,
          ),
        ).toMatchObject({ state: "pending" });
      }
    },
  );
});
