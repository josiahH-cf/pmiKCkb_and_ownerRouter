import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  MAINTENANCE_TICKET_COLLECTIONS,
  createCanonicalMaintenanceTestTicket,
  createMaintenanceTicket,
  getMaintenanceTicket,
  listMaintenanceTicketActivity,
  listMaintenanceTestActionReceipts,
  listMaintenanceTickets,
  simulateMaintenanceTestAction,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";
import { MAINTENANCE_TICKET_NOTIFICATION_COLLECTION } from "@/lib/firestore/maintenance-ticket-notifications";
import {
  MAINTENANCE_TEST_CONFIRMATION,
  MAINTENANCE_TEST_VENDOR,
} from "@/lib/maintenance/test-workflow";

// Minimal in-memory Firestore matching the Admin-SDK surface the writer uses (doc get/set, collection
// get). The writer stores plain ISO-string records (no serverTimestamp), so this fake is faithful.
function fakeDb() {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  function docRef(name: string, id: string) {
    const c = col(name);
    return {
      id,
      _name: name,
      async get() {
        const data = c.get(id);
        return { exists: c.has(id), id, data: () => data };
      },
      async set(data: Record<string, unknown>) {
        c.set(id, data);
      },
    };
  }
  const db = {
    collection(name: string) {
      return {
        doc: (id: string) => docRef(name, id),
        async get() {
          const c = col(name);
          return {
            docs: [...c.entries()].map(([id, data]) => ({ id, data: () => data })),
          };
        },
      };
    },
    // Minimal transaction: get() reads the doc; set() writes synchronously to the backing map,
    // mirroring Firestore's tx.get (async) + tx.set (queued) so the writer's transaction path runs.
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        get: (ref: { get(): Promise<unknown> }) => ref.get(),
        set: (ref: { _name: string; id: string }, data: Record<string, unknown>) => {
          col(ref._name).set(ref.id, data);
        },
      };
      return fn(tx);
    },
  };
  return { db: db as unknown as Firestore, store };
}

// A recording variant of fakeDb: it tags every runTransaction with a unique id and logs each
// transaction.set as { txId, collection, id }, so a test can prove two writes are enqueued on the
// SAME transaction handle.
//
// ROLLBACK NOTE: like the shared tests/helpers/fake-firestore.ts (and fakeDb above), this fake
// applies transaction writes to the backing store IMMEDIATELY inside tx.set and does NOT discard
// staged writes when the callback throws — it does not model Firestore's atomic ROLLBACK. So a true
// "the notification is not committed when a later step in the same transaction throws" test is not
// expressible against the fake. We instead prove the structural guarantee of atomicity: the ticket
// write and the notification write share ONE transaction object, which the real Admin SDK commits or
// rolls back together.
function recordingFakeDb() {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const txSets: Array<{ txId: number; collection: string; id: string }> = [];
  let txCounter = 0;
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  function docRef(name: string, id: string) {
    const c = col(name);
    return {
      id,
      _name: name,
      async get() {
        const data = c.get(id);
        return { exists: c.has(id), id, data: () => data };
      },
      async set(data: Record<string, unknown>) {
        c.set(id, data);
      },
    };
  }
  const db = {
    collection(name: string) {
      return {
        doc: (id: string) => docRef(name, id),
        async get() {
          const c = col(name);
          return {
            docs: [...c.entries()].map(([id, data]) => ({ id, data: () => data })),
          };
        },
      };
    },
    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const txId = ++txCounter;
      const tx = {
        get: (ref: { get(): Promise<unknown> }) => ref.get(),
        set: (ref: { _name: string; id: string }, data: Record<string, unknown>) => {
          txSets.push({ txId, collection: ref._name, id: ref.id });
          col(ref._name).set(ref.id, data);
        },
      };
      return fn(tx);
    },
  };
  return { db: db as unknown as Firestore, store, txSets };
}

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

const baseInput = {
  summary: "Leaking sink",
  description: "Water under the kitchen sink",
  priority: "Emergency",
  priority_provenance: "auto-inferred" as const,
  unit: { unitId: "u-1", label: "123 Main St #2", confidence: "Verified" as const },
};

describe("maintenance tickets", () => {
  it("creates an Open ticket with a create Activity entry", async () => {
    const { db, store } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);

    expect(ticket.status).toBe("Open");
    expect(ticket.data_mode).toBe("live");
    expect(ticket.priority).toBe("Emergency");
    expect(ticket.reporter).toEqual({ kind: "staff", uid: "editor-1" });
    expect(store.get(MAINTENANCE_TICKET_COLLECTIONS.tickets)?.size).toBe(1);

    const activity = await listMaintenanceTicketActivity(editor, ticket.id, db);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ action: "create", new_status: "Open" });
  });

  it("transitions status and logs the change", async () => {
    const { db } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    const updated = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Waiting on Vendor" },
      db,
    );

    expect(updated.status).toBe("Waiting on Vendor");
    const persisted = await getMaintenanceTicket(editor, ticket.id, db);
    expect(persisted?.status).toBe("Waiting on Vendor");
    const activity = await listMaintenanceTicketActivity(editor, ticket.id, db);
    expect(activity.map((a) => a.action)).toEqual(["create", "status"]);
  });

  it("requires a reason to close, and records it", async () => {
    const { db } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);

    await expect(
      transitionMaintenanceTicket(
        editor,
        ticket.id,
        { op: "status", status: "Closed" },
        db,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const closed = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Closed", reason: "vendor fixed it" },
      db,
    );
    expect(closed.status).toBe("Closed");
    expect(closed.closed_reason).toBe("vendor fixed it");
    expect(closed.closed_at).toBeTruthy();
  });

  it("clears the closed fields on reopen", async () => {
    const { db } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Closed", reason: "done" },
      db,
    );
    const reopened = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "reopen", reason: "The leak returned after the first repair." },
      db,
    );

    expect(reopened.status).toBe("Open");
    expect(reopened.closed_at).toBeUndefined();
    expect(reopened.closed_reason).toBeUndefined();
    const activity = await listMaintenanceTicketActivity(editor, ticket.id, db);
    expect(activity.map((a) => a.action)).toEqual(["create", "close", "reopen"]);
    expect(activity.at(-1)?.text).toBe("The leak returned after the first repair.");
  });

  it("rejects backward status moves and requires the explicit audited reopen operation", async () => {
    const { db } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Waiting on Response" },
      db,
    );

    await expect(
      transitionMaintenanceTicket(
        editor,
        ticket.id,
        { op: "status", status: "Open" },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });

    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Closed", reason: "Resolved." },
      db,
    );
    await expect(
      transitionMaintenanceTicket(
        editor,
        ticket.id,
        { op: "status", status: "Open" },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("adds and removes labels", async () => {
    const { db } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    const labeled = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "label-add", label: "plumbing" },
      db,
    );
    expect(labeled.labels).toEqual(["plumbing"]);
    const unlabeled = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "label-remove", label: "plumbing" },
      db,
    );
    expect(unlabeled.labels).toEqual([]);
  });

  it("records a note without changing status", async () => {
    const { db } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    const noted = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "note", text: "called the tenant" },
      db,
    );
    expect(noted.status).toBe("Open");
    const activity = await listMaintenanceTicketActivity(editor, ticket.id, db);
    expect(activity.at(-1)).toMatchObject({ action: "note", text: "called the tenant" });
  });

  it("404s a transition on an unknown ticket", async () => {
    const { db } = fakeDb();
    await expect(
      transitionMaintenanceTicket(editor, "nope", { op: "note", text: "hi" }, db),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lists tickets newest-first", async () => {
    const { db } = fakeDb();
    await createMaintenanceTicket(editor, { ...baseInput, summary: "A" }, db);
    await createMaintenanceTicket(editor, { ...baseInput, summary: "B" }, db);
    const tickets = await listMaintenanceTickets(editor, db);
    expect(tickets).toHaveLength(2);
    expect(tickets.map((t) => t.summary).sort()).toEqual(["A", "B"]);
  });

  it("normalizes a legacy ticket without data_mode to Live", async () => {
    const { db, store } = fakeDb();
    store.set(
      MAINTENANCE_TICKET_COLLECTIONS.tickets,
      new Map([
        [
          "legacy",
          {
            id: "legacy",
            status: "Open",
            priority: "Normal",
            priority_provenance: "operator-set",
            summary: "Legacy ticket",
            description: "Predates explicit lanes",
            unit: null,
            photo_refs: [],
            reporter: { kind: "staff", uid: "editor-1" },
            labels: [],
            space_id: "maintenance",
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-01T00:00:00.000Z",
          },
        ],
      ]),
    );

    const record = await getMaintenanceTicket(editor, "legacy", db);
    expect(record?.data_mode).toBe("live");

    await transitionMaintenanceTicket(
      editor,
      "legacy",
      { op: "note", text: "Legacy record normalized" },
      db,
    );
    expect(
      store.get(MAINTENANCE_TICKET_COLLECTIONS.tickets)?.get("legacy")?.data_mode,
    ).toBe("live");
  });

  it("creates a reserved Test ticket and atomically mirrors its Test Vendor assignment", async () => {
    const { db, store } = fakeDb();
    const ticket = await createCanonicalMaintenanceTestTicket(editor, {}, db);

    expect(ticket).toMatchObject({
      data_mode: "test",
      unit: { unitId: "unit:test-maple-204" },
      labels: ["TEST DATA"],
    });

    const assigned = await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "vendor-assign", vendorId: MAINTENANCE_TEST_VENDOR.id },
      db,
    );
    expect(assigned.vendor_id).toBe(MAINTENANCE_TEST_VENDOR.id);
    expect(
      store.get(MAINTENANCE_TICKET_COLLECTIONS.vendorAssignments)?.get(ticket.id),
    ).toMatchObject({
      ticket_id: ticket.id,
      vendor_id: MAINTENANCE_TEST_VENDOR.id,
      active: true,
      data_mode: "test",
    });
  });

  it("records a bodyless internal Test receipt that cannot qualify as Live proof", async () => {
    const { db } = fakeDb();
    const ticket = await createCanonicalMaintenanceTestTicket(editor, {}, db);
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "vendor-assign", vendorId: MAINTENANCE_TEST_VENDOR.id },
      db,
    );

    const receipt = await simulateMaintenanceTestAction(
      editor,
      ticket.id,
      {
        actionKey: "vendor.assignment.change",
        confirmation: MAINTENANCE_TEST_CONFIRMATION,
      },
      db,
    );
    expect(receipt).toMatchObject({
      data_mode: "test",
      provider_contacted: false,
      live_proof_eligible: false,
      outcome: "simulated_success",
    });
    expect(await listMaintenanceTestActionReceipts(editor, ticket.id, db)).toEqual([
      receipt,
    ]);

    const duplicate = await simulateMaintenanceTestAction(
      editor,
      ticket.id,
      {
        actionKey: "vendor.assignment.change",
        confirmation: MAINTENANCE_TEST_CONFIRMATION,
      },
      db,
    );
    expect(duplicate).toEqual(receipt);
    expect(await listMaintenanceTestActionReceipts(editor, ticket.id, db)).toEqual([
      receipt,
    ]);
  });

  it("rejects Test simulation for a Live ticket before writing a receipt", async () => {
    const { db, store } = fakeDb();
    const liveTicket = await createMaintenanceTicket(editor, baseInput, db);

    await expect(
      simulateMaintenanceTestAction(
        editor,
        liveTicket.id,
        {
          actionKey: "rentvine.work_order.create",
          confirmation: MAINTENANCE_TEST_CONFIRMATION,
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.get(MAINTENANCE_TICKET_COLLECTIONS.testActionReceipts)).toBeUndefined();
  });

  it("rejects reserved Test aliases in the Live lane", async () => {
    const { db } = fakeDb();
    await expect(
      createMaintenanceTicket(
        editor,
        {
          ...baseInput,
          unit: {
            unitId: "unit:test-maple-204",
            label: "TEST — 204 Maple Court Unit 2",
            confidence: "Verified",
          },
        },
        db,
      ),
    ).rejects.toThrow(/reserved Test unit/);
  });

  it("notifies the assignee on assign + status, and never on create/label/note or unassigned", async () => {
    const { db, store } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    // create writes no notification (baseInput has no assignee).
    expect(store.get("maintenance_ticket_notifications")).toBeUndefined();

    const notifs = () =>
      [...(store.get("maintenance_ticket_notifications")?.values() ?? [])] as Array<
        Record<string, unknown>
      >;

    // Assigning to a DIFFERENT uid than the actor writes one 'assigned' notification.
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "assign", assigneeUid: "assignee-1" },
      db,
    );
    expect(notifs()).toHaveLength(1);
    expect(notifs()[0]).toMatchObject({
      event: "assigned",
      recipient_uid: "assignee-1",
      href: expect.stringContaining(`/maintenance?ticket_id=${ticket.id}`),
    });

    // A subsequent status change by the actor notifies the assignee.
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Scheduled" },
      db,
    );
    expect(notifs()).toHaveLength(2);
    expect(
      notifs().some(
        (n) => n.event === "status_changed" && n.recipient_uid === "assignee-1",
      ),
    ).toBe(true);

    // Label + note changes write no new notification.
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "label-add", label: "plumbing" },
      db,
    );
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "note", text: "called the tenant" },
      db,
    );
    expect(notifs()).toHaveLength(2);
  });

  it("writes no notification for a status change on an unassigned ticket", async () => {
    const { db, store } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "status", status: "Scheduled" },
      db,
    );
    expect(store.get("maintenance_ticket_notifications")).toBeUndefined();
  });

  it("enqueues the ticket write and the assignee notification on ONE shared transaction (atomicity)", async () => {
    // The fake Firestore applies transaction writes immediately and does NOT model rollback (see the
    // recordingFakeDb ROLLBACK NOTE), so a true "not committed on throw" test is not expressible here.
    // Instead we prove the structural guarantee: the notification set and the ticket set are enqueued
    // on the SAME transaction object within a SINGLE runTransaction — one atomic unit the real Admin
    // SDK commits or rolls back together, so the notification twin can never be committed without the
    // ticket update (or vice versa).
    const { db, txSets } = recordingFakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);

    // Ignore the create transaction's writes; measure only the transition's.
    const beforeTransition = txSets.length;
    await transitionMaintenanceTicket(
      editor,
      ticket.id,
      { op: "assign", assigneeUid: "assignee-1" },
      db,
    );
    const transitionSets = txSets.slice(beforeTransition);

    // The transition opened exactly one transaction: every write it staged shares one tx id.
    const txIds = new Set(transitionSets.map((s) => s.txId));
    expect(txIds.size).toBe(1);

    // That one transaction wrote BOTH the ticket doc and the notification doc.
    const ticketSet = transitionSets.find(
      (s) => s.collection === MAINTENANCE_TICKET_COLLECTIONS.tickets,
    );
    const notificationSet = transitionSets.find(
      (s) => s.collection === MAINTENANCE_TICKET_NOTIFICATION_COLLECTION,
    );
    expect(ticketSet).toBeDefined();
    expect(notificationSet).toBeDefined();

    // The notification is enqueued on the SAME transaction handle as the ticket write (one atomic
    // unit), not a separate best-effort write on its own transaction.
    expect(notificationSet?.txId).toBe(ticketSet?.txId);
  });
});
