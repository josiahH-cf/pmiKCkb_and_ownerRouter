import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeFirestore } from "../helpers/fake-firestore";
import type { Firestore } from "firebase-admin/firestore";

vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("This suite always passes its db explicitly.");
  },
}));

import {
  claimMaintenanceWorkOrderLink,
  getMaintenanceWorkOrderLink,
  projectMaintenanceWorkOrderOutcome,
} from "@/lib/firestore/maintenance-work-order-links";

const EDITOR = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  role: "Editor",
  hd: "pmikcmetro.com",
} as never;

function baseLink(overrides: Record<string, unknown> = {}) {
  return {
    ticket_ref: "ticket-9",
    action_key: "rentvine.work_order.create" as const,
    execution_id: "exec_1",
    state: "pending" as const,
    created_by_uid: "editor-1",
    attempt_seq: 0,
    ...overrides,
  };
}

describe("S99 work-order link store", () => {
  let db: Firestore;

  beforeEach(() => {
    db = new FakeFirestore() as unknown as Firestore;
  });

  it("claims one pending link per ticket and refuses a second live claim", async () => {
    await claimMaintenanceWorkOrderLink(EDITOR, baseLink(), db);
    expect((await getMaintenanceWorkOrderLink(EDITOR, "ticket-9", db))?.state).toBe(
      "pending",
    );
    await expect(
      claimMaintenanceWorkOrderLink(
        EDITOR,
        baseLink({ execution_id: "exec_2", attempt_seq: 1 }),
        db,
      ),
    ).rejects.toThrow(/already has a live/);
  });

  it("frees a new claim only after a failed outcome, with the attempt sequence advancing", async () => {
    await claimMaintenanceWorkOrderLink(EDITOR, baseLink(), db);
    await projectMaintenanceWorkOrderOutcome(
      EDITOR,
      { ticketRef: "ticket-9", executionId: "exec_1", state: "failed" },
      db,
    );
    await claimMaintenanceWorkOrderLink(
      EDITOR,
      baseLink({ execution_id: "exec_2", attempt_seq: 1 }),
      db,
    );
    const link = await getMaintenanceWorkOrderLink(EDITOR, "ticket-9", db);
    expect(link?.execution_id).toBe("exec_2");
    expect(link?.attempt_seq).toBe(1);
  });

  it("projects a succeeded outcome with provider identity only for the exact claimed execution", async () => {
    await claimMaintenanceWorkOrderLink(EDITOR, baseLink(), db);
    await expect(
      projectMaintenanceWorkOrderOutcome(
        EDITOR,
        { ticketRef: "ticket-9", executionId: "exec_other", state: "succeeded" },
        db,
      ),
    ).rejects.toThrow(/different execution/);
    await projectMaintenanceWorkOrderOutcome(
      EDITOR,
      {
        ticketRef: "ticket-9",
        executionId: "exec_1",
        state: "succeeded",
        providerWorkOrderId: "9005",
        receiptResultHash: "a".repeat(64),
      },
      db,
    );
    const link = await getMaintenanceWorkOrderLink(EDITOR, "ticket-9", db);
    expect(link).toMatchObject({
      state: "succeeded",
      provider_work_order_id: "9005",
      receipt_result_hash: "a".repeat(64),
    });
  });

  it("keeps an ambiguous outcome live so no second create can start", async () => {
    await claimMaintenanceWorkOrderLink(EDITOR, baseLink(), db);
    await projectMaintenanceWorkOrderOutcome(
      EDITOR,
      { ticketRef: "ticket-9", executionId: "exec_1", state: "ambiguous" },
      db,
    );
    await expect(
      claimMaintenanceWorkOrderLink(
        EDITOR,
        baseLink({ execution_id: "exec_2", attempt_seq: 1 }),
        db,
      ),
    ).rejects.toThrow(/already has a live/);
  });
});
