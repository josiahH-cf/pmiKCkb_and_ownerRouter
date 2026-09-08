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
  linkExistingMaintenanceWorkOrder,
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

describe("S100 imported link provenance and conflict boundary", () => {
  const input = {
    ticketId: "ticket-9",
    ticketVersion: "2026-09-07T00:00:00.000Z",
    workOrderId: "63",
    propertyId: "21",
    unitId: "42",
    confirmedPreviewHash: "b".repeat(64),
  };
  async function database() {
    const db = new FakeFirestore() as unknown as Firestore;
    await db
      .collection("maintenance_tickets")
      .doc("ticket-9")
      .set({ updated_at: input.ticketVersion, unit: { unitId: "unit:42" } });
    return db;
  }
  it("reads back an imported link without a creation receipt and reuses an exact duplicate", async () => {
    const db = await database();
    const linked = await linkExistingMaintenanceWorkOrder(EDITOR, input, db);
    expect(linked).toMatchObject({
      state: "linked",
      action_key: "rentvine.work_order.read",
      provider_work_order_id: "63",
    });
    expect(linked).not.toHaveProperty("execution_id");
    expect(linked).not.toHaveProperty("receipt_result_hash");
    expect(await linkExistingMaintenanceWorkOrder(EDITOR, input, db)).toEqual(linked);
    await expect(
      projectMaintenanceWorkOrderOutcome(
        EDITOR,
        { ticketRef: "ticket-9", executionId: "invented", state: "succeeded" },
        db,
      ),
    ).rejects.toThrow("different execution");
  });
  it("refuses conflicting links and ticket changes before persisting", async () => {
    const db = await database();
    await claimMaintenanceWorkOrderLink(EDITOR, baseLink(), db);
    await expect(linkExistingMaintenanceWorkOrder(EDITOR, input, db)).rejects.toThrow(
      "conflicting",
    );
    const fresh = await database();
    await expect(
      linkExistingMaintenanceWorkOrder(
        EDITOR,
        { ...input, ticketVersion: "changed" },
        fresh,
      ),
    ).rejects.toThrow("changed");
    expect(await getMaintenanceWorkOrderLink(EDITOR, "ticket-9", fresh)).toBeNull();
  });
});
