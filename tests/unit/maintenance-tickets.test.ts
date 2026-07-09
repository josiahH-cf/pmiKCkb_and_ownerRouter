import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  MAINTENANCE_TICKET_COLLECTIONS,
  createMaintenanceTicket,
  getMaintenanceTicket,
  listMaintenanceTicketActivity,
  listMaintenanceTickets,
  transitionMaintenanceTicket,
} from "@/lib/firestore/maintenance-tickets";

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
  unit: { unitId: "u-1", label: "123 Main St #2" },
};

describe("maintenance tickets", () => {
  it("creates an Open ticket with a create Activity entry", async () => {
    const { db, store } = fakeDb();
    const ticket = await createMaintenanceTicket(editor, baseInput, db);

    expect(ticket.status).toBe("Open");
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
      { op: "status", status: "Open" },
      db,
    );

    expect(reopened.status).toBe("Open");
    expect(reopened.closed_at).toBeUndefined();
    expect(reopened.closed_reason).toBeUndefined();
    const activity = await listMaintenanceTicketActivity(editor, ticket.id, db);
    expect(activity.map((a) => a.action)).toEqual(["create", "close", "reopen"]);
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
});
