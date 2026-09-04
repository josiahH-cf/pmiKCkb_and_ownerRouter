import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  clearMaintenancePropertyPreapproval,
  getMaintenancePropertyPreapproval,
  listMaintenancePropertyPreapprovalActivity,
  listMaintenancePropertyPreapprovals,
  setMaintenancePropertyPreapproval,
} from "@/lib/firestore/maintenance-property-preapprovals";
import {
  claimMaintenanceWorkOrderLink,
  getMaintenanceWorkOrderLink,
  projectMaintenanceWorkOrderOutcome,
  recordMaintenanceWorkOrderSnapshot,
  type MaintenanceWorkOrderProviderSnapshot,
} from "@/lib/firestore/maintenance-work-order-links";

// S108: the property preapproval is Admin-only, versioned, and audited, and the RentVine snapshot is
// recorded only onto an existing link from a human-initiated read. Values are synthetic.

const projectId = "pmi-kc-kb-s108-preapproval-test";
const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = { ...admin, uid: "editor-1", role: "Editor" };
const approver: AuthenticatedUser = { ...admin, uid: "approver-1", role: "Approver" };

const SNAPSHOT: MaintenanceWorkOrderProviderSnapshot = {
  property_id: "7",
  work_order_status_id: "3",
  status_label: "In Progress",
  priority_id: "2",
  is_owner_approved: "0",
  assigned_vendor_trade_id: null,
  updated_at_iso: null,
  read_at_iso: "2026-09-04T00:00:00.000Z",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s108-preapproval-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

async function record(amountCents: number, actor = admin) {
  return setMaintenancePropertyPreapproval(
    actor,
    {
      propertyKey: "7",
      amountCents,
      effectiveFromIso: "2026-01-01T00:00:00.000Z",
      note: "Owner agreement",
    },
    db,
  );
}

describe("S108 property preapproval store (AC-S108-4)", () => {
  it("records an Admin preapproval with its version and history row", async () => {
    const first = await record(50_000);
    expect(first).toMatchObject({
      property_key: "7",
      amount_cents: 50_000,
      version: 1,
      recorded_by_uid: "admin-1",
    });
    await expect(
      getMaintenancePropertyPreapproval(admin, "7", db),
    ).resolves.toMatchObject({ amount_cents: 50_000, version: 1 });
    const activity = await listMaintenancePropertyPreapprovalActivity(admin, "7", db);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "set",
      amount_cents: 50_000,
      previous_amount_cents: null,
      version: 1,
      actor_uid: "admin-1",
    });
  });

  it("versions a change and keeps the prior amount in history", async () => {
    await record(50_000);
    const second = await record(75_000);
    expect(second.version).toBe(2);
    const activity = await listMaintenancePropertyPreapprovalActivity(admin, "7", db);
    expect(activity.map((entry) => entry.amount_cents)).toEqual([75_000, 50_000]);
    expect(activity[0].previous_amount_cents).toBe(50_000);
  });

  it("refuses every non-Admin role", async () => {
    for (const actor of [editor, approver]) {
      await expect(record(50_000, actor)).rejects.toThrow(/Admin access/i);
      await expect(clearMaintenancePropertyPreapproval(actor, "7", db)).rejects.toThrow(
        /Admin access/i,
      );
    }
    await expect(listMaintenancePropertyPreapprovals(admin, db)).resolves.toEqual([]);
  });

  it("lets a reader see the current amount without changing it", async () => {
    await record(50_000);
    await expect(
      getMaintenancePropertyPreapproval(editor, "7", db),
    ).resolves.toMatchObject({ amount_cents: 50_000 });
  });

  it("clearing removes the record, keeps the history, and refuses when absent", async () => {
    await record(50_000);
    await clearMaintenancePropertyPreapproval(admin, "7", db);
    await expect(getMaintenancePropertyPreapproval(admin, "7", db)).resolves.toBeNull();
    const activity = await listMaintenancePropertyPreapprovalActivity(admin, "7", db);
    expect(activity[0]).toMatchObject({
      action: "cleared",
      amount_cents: null,
      previous_amount_cents: 50_000,
    });
    await expect(clearMaintenancePropertyPreapproval(admin, "7", db)).rejects.toThrow(
      /no recorded preapproval/i,
    );
  });

  it("refuses an amount that is not exact positive money", async () => {
    await expect(record(0)).rejects.toThrow(/greater than zero/i);
    await expect(record(-1)).rejects.toThrow(/greater than zero/i);
    await expect(record(1.5)).rejects.toThrow(/greater than zero/i);
    await expect(record(99_999_999_999)).rejects.toThrow(/above the app limit/i);
  });
});

describe("S108 provider snapshot rides on the existing link (ARCH-S108-1 / AC-S108-1)", () => {
  async function seedLink() {
    await claimMaintenanceWorkOrderLink(
      editor,
      {
        ticket_ref: "ticket-1",
        action_key: "rentvine.work_order.create",
        execution_id: "exec-1",
        state: "pending",
        created_by_uid: editor.uid,
        attempt_seq: 1,
      },
      db,
    );
    await projectMaintenanceWorkOrderOutcome(
      editor,
      {
        ticketRef: "ticket-1",
        executionId: "exec-1",
        state: "succeeded",
        providerWorkOrderId: "9001",
      },
      db,
    );
  }

  it("records nothing when the ticket has no link", async () => {
    await expect(
      recordMaintenanceWorkOrderSnapshot(
        editor,
        { ticketRef: "ticket-1", providerWorkOrderId: "9001", snapshot: SNAPSHOT },
        db,
      ),
    ).resolves.toBe("no_link");
  });

  it("records the observed state and updates it on a second read, never duplicating", async () => {
    await seedLink();
    await expect(
      recordMaintenanceWorkOrderSnapshot(
        editor,
        { ticketRef: "ticket-1", providerWorkOrderId: "9001", snapshot: SNAPSHOT },
        db,
      ),
    ).resolves.toBe("recorded");
    const first = await getMaintenanceWorkOrderLink(editor, "ticket-1", db);
    expect(first?.provider_snapshot).toMatchObject({
      status_label: "In Progress",
      is_owner_approved: "0",
    });

    await recordMaintenanceWorkOrderSnapshot(
      editor,
      {
        ticketRef: "ticket-1",
        providerWorkOrderId: "9001",
        snapshot: {
          ...SNAPSHOT,
          status_label: "Completed",
          is_owner_approved: "1",
          read_at_iso: "2026-09-05T00:00:00.000Z",
        },
      },
      db,
    );
    const second = await getMaintenanceWorkOrderLink(editor, "ticket-1", db);
    expect(second?.provider_snapshot).toMatchObject({
      status_label: "Completed",
      is_owner_approved: "1",
      read_at_iso: "2026-09-05T00:00:00.000Z",
    });
    // The link identity the S99 execution path established is untouched.
    expect(second).toMatchObject({
      state: "succeeded",
      execution_id: "exec-1",
      provider_work_order_id: "9001",
      attempt_seq: 1,
    });
  });

  it("refuses to record a snapshot from a different work order", async () => {
    await seedLink();
    await expect(
      recordMaintenanceWorkOrderSnapshot(
        editor,
        { ticketRef: "ticket-1", providerWorkOrderId: "9002", snapshot: SNAPSHOT },
        db,
      ),
    ).resolves.toBe("different_work_order");
    const link = await getMaintenanceWorkOrderLink(editor, "ticket-1", db);
    expect(link?.provider_snapshot).toBeUndefined();
  });
});
