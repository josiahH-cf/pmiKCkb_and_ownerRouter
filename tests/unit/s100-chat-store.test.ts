import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "../helpers/fake-firestore";
import type { Firestore } from "firebase-admin/firestore";

vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("This suite always passes its db explicitly.");
  },
}));

import {
  applyRerunResidentBinding,
  commitChatSyncPage,
  getWorkOrderChatMessage,
  listWorkOrderChatRecords,
} from "@/lib/firestore/rentvine-work-order-chat-messages";
import type { ChatRowDisposition } from "@/lib/integrations/rentvine/chat-contract";
import { COMMUNICATIONS_RETENTION_MS } from "@/lib/gmail-hub/retention-contract";

const EDITOR = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
} as never;

const NOW = Date.parse("2026-09-02T12:00:00.000Z");
const ACCOUNT = "rentvine:pmikcmetro";

function messageRow(
  overrides: Partial<Extract<ChatRowDisposition, { kind: "message" }>> = {},
): ChatRowDisposition {
  return {
    kind: "message",
    messageId: 501,
    role: "tenant",
    userId: null,
    contactId: 77,
    createdAtIso: "2026-09-01T15:04:05.000Z",
    body: "The sink is still leaking.",
    truncated: false,
    payloadHash: "a".repeat(64),
    attachments: [],
    ...overrides,
  };
}

function commit(
  db: Firestore,
  dispositions: ChatRowDisposition[],
  bindings: Map<number, never> | Map<number, unknown> = new Map(),
  nowMs = NOW,
) {
  return commitChatSyncPage(
    EDITOR,
    {
      accountRef: ACCOUNT,
      ticketRef: "ticket-9",
      workOrderId: "9005",
      syncAttemptRef: "exec_1",
      dispositions,
      residentBindings: bindings as never,
      nowMs,
    },
    db,
  );
}

const BINDING = {
  contactId: 77,
  leaseId: "115",
  leaseTenantId: "88",
  sourceVersion: "b".repeat(64),
};

describe("S100 chat sync store", () => {
  let db: Firestore;

  beforeEach(() => {
    db = new FakeFirestore() as unknown as Firestore;
  });

  it("stores a new page with exact counts, retention stamp, and resident auto-binding", async () => {
    const counts = await commit(
      db,
      [
        messageRow(),
        messageRow({ messageId: 502, role: "manager", userId: 4, contactId: null }),
        messageRow({ messageId: 503, contactId: 78 }),
        { kind: "rejected", reason: "wrong_object" },
      ],
      new Map([[77, BINDING]]),
    );
    expect(counts).toEqual({
      new_messages: 3,
      already_synced: 0,
      needs_mapping: 1,
      review: 0,
      rejected: 1,
      truncated: 0,
    });
    const bound = await getWorkOrderChatMessage(EDITOR, ACCOUNT, 501, db);
    expect(bound?.mapping_state).toBe("resident_bound");
    expect(bound?.resident_lease_id).toBe("115");
    expect(bound?.retention_anchor_at_ms).toBe(NOW);
    expect(bound?.expires_at_ms).toBe(NOW + COMMUNICATIONS_RETENTION_MS.workflow_link);
    expect(bound?.legal_hold).toBe(false);
    const manager = await getWorkOrderChatMessage(EDITOR, ACCOUNT, 502, db);
    expect(manager?.mapping_state).toBe("nonresident");
    const unmapped = await getWorkOrderChatMessage(EDITOR, ACCOUNT, 503, db);
    expect(unmapped?.mapping_state).toBe("needs_mapping");
  });

  it("counts an identical duplicate without rewriting and never refreshes the anchor", async () => {
    await commit(db, [messageRow()], new Map([[77, BINDING]]));
    const later = NOW + 10 * 24 * 60 * 60 * 1000;
    const counts = await commit(db, [messageRow()], new Map(), later);
    expect(counts.already_synced).toBe(1);
    expect(counts.new_messages).toBe(0);
    const stored = await getWorkOrderChatMessage(EDITOR, ACCOUNT, 501, db);
    expect(stored?.retention_anchor_at_ms).toBe(NOW);
    expect(stored?.mapping_state).toBe("resident_bound");
  });

  it("quarantines a changed duplicate with both hashes and keeps the original untouched", async () => {
    await commit(db, [messageRow()]);
    const counts = await commit(db, [
      messageRow({ body: "Edited provider text.", payloadHash: "c".repeat(64) }),
    ]);
    expect(counts.review).toBe(1);
    expect(counts.new_messages).toBe(0);
    const original = await getWorkOrderChatMessage(EDITOR, ACCOUNT, 501, db);
    expect(original?.body).toBe("The sink is still leaking.");
    expect(original?.payload_hash).toBe("a".repeat(64));
    const records = await listWorkOrderChatRecords(EDITOR, "ticket-9", db);
    const review = records.find((entry) => entry.lane === "review");
    expect(review).toMatchObject({
      reason: "provider_message_changed",
      payload_hash: "c".repeat(64),
      prior_payload_hash: "a".repeat(64),
    });
    expect(JSON.stringify(review)).not.toContain("Edited provider text.");
  });

  it("stores unknown-role and shape-mismatch rows only in the review lane", async () => {
    const counts = await commit(db, [
      {
        kind: "review",
        reason: "role_id_shape_mismatch",
        messageId: 601,
        payloadHash: "d".repeat(64),
        createdAtIso: "2026-09-01T10:00:00.000Z",
      },
    ]);
    expect(counts.review).toBe(1);
    expect(await getWorkOrderChatMessage(EDITOR, ACCOUNT, 601, db)).toBeNull();
  });

  it("rerun binding updates only the mapping fields of the exact contact-matched message", async () => {
    await commit(db, [messageRow({ messageId: 503, contactId: 78 })]);
    await expect(
      applyRerunResidentBinding(
        EDITOR,
        { accountRef: ACCOUNT, messageId: 503, binding: BINDING },
        db,
      ),
    ).rejects.toThrow(/contact identity/);
    const state = await applyRerunResidentBinding(
      EDITOR,
      {
        accountRef: ACCOUNT,
        messageId: 503,
        binding: { ...BINDING, contactId: 78 },
      },
      db,
    );
    expect(state).toBe("resident_bound");
    const stored = await getWorkOrderChatMessage(EDITOR, ACCOUNT, 503, db);
    expect(stored?.mapping_state).toBe("resident_bound");
    expect(stored?.retention_anchor_at_ms).toBe(NOW);
  });
});
