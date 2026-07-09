import type { Firestore, Transaction } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  MAINTENANCE_TICKET_NOTIFICATION_COLLECTION,
  appendMaintenanceTicketNotification,
  listMaintenanceTicketNotifications,
  markMaintenanceTicketNotificationRead,
} from "@/lib/firestore/maintenance-ticket-notifications";

// Minimal in-memory Firestore matching the Admin-SDK surface the writer/readers use (doc get/set,
// collection get, runTransaction). The module stores plain ISO-string records, so this fake is
// faithful.
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

// A transaction whose set() writes straight into the fake store, for exercising the append writer.
function fakeTransaction(store: Map<string, Map<string, Record<string, unknown>>>) {
  return {
    set: (ref: { _name: string; id: string }, data: Record<string, unknown>) => {
      if (!store.has(ref._name)) store.set(ref._name, new Map());
      store.get(ref._name)!.set(ref.id, data);
    },
  } as unknown as Transaction;
}

const actor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function notifs(store: Map<string, Map<string, Record<string, unknown>>>) {
  return [...(store.get(MAINTENANCE_TICKET_NOTIFICATION_COLLECTION)?.values() ?? [])];
}

describe("maintenance ticket notifications", () => {
  it("writes one PII-free notification for a recipient who is not the actor", () => {
    const { db, store } = fakeDb();
    appendMaintenanceTicketNotification(fakeTransaction(store), db, {
      ticketId: "t-1",
      event: "assigned",
      recipientUid: "assignee-1",
      actorUid: actor.uid,
      ticketStatus: "Open",
      createdAt: "2026-07-09T00:00:00.000Z",
    });

    const written = notifs(store);
    expect(written).toHaveLength(1);
    const record = written[0];
    expect(record).toMatchObject({
      ticket_id: "t-1",
      event: "assigned",
      recipient_uid: "assignee-1",
      ticket_status: "Open",
      href: "/maintenance",
    });
    // PII-free: never a summary / unit / reporter / assignee-email leak.
    for (const forbidden of [
      "summary",
      "description",
      "unit",
      "reporter",
      "assignee_email",
      "recipient_email",
    ]) {
      expect(record).not.toHaveProperty(forbidden);
    }
  });

  it("is a no-op when the recipient is the acting user (no self-notify)", () => {
    const { db, store } = fakeDb();
    appendMaintenanceTicketNotification(fakeTransaction(store), db, {
      ticketId: "t-1",
      event: "status_changed",
      recipientUid: actor.uid,
      actorUid: actor.uid,
      ticketStatus: "Scheduled",
      createdAt: "2026-07-09T00:00:00.000Z",
    });
    expect(notifs(store)).toHaveLength(0);
  });

  it("is a no-op when there is no recipient (unassigned ticket)", () => {
    const { db, store } = fakeDb();
    appendMaintenanceTicketNotification(fakeTransaction(store), db, {
      ticketId: "t-1",
      event: "closed",
      recipientUid: undefined,
      actorUid: actor.uid,
      ticketStatus: "Closed",
      createdAt: "2026-07-09T00:00:00.000Z",
    });
    expect(notifs(store)).toHaveLength(0);
  });

  it("lists only the caller's own unread notifications, newest-first", async () => {
    const { db, store } = fakeDb();
    const bucket = new Map<string, Record<string, unknown>>();
    store.set(MAINTENANCE_TICKET_NOTIFICATION_COLLECTION, bucket);
    bucket.set("n-old", {
      id: "n-old",
      ticket_id: "t-1",
      event: "assigned",
      recipient_uid: actor.uid,
      title: "Maintenance ticket assigned",
      message: "A maintenance ticket was assigned to you.",
      ticket_status: "Open",
      href: "/maintenance",
      created_at: "2026-07-08T00:00:00.000Z",
    });
    bucket.set("n-new", {
      id: "n-new",
      ticket_id: "t-2",
      event: "status_changed",
      recipient_uid: actor.uid,
      title: "Maintenance ticket updated",
      message: "A maintenance ticket you are assigned was updated.",
      ticket_status: "Scheduled",
      href: "/maintenance",
      created_at: "2026-07-09T00:00:00.000Z",
    });
    bucket.set("n-read", {
      id: "n-read",
      ticket_id: "t-3",
      event: "assigned",
      recipient_uid: actor.uid,
      title: "x",
      message: "y",
      ticket_status: "Open",
      href: "/maintenance",
      created_at: "2026-07-09T02:00:00.000Z",
      read_at: "2026-07-09T03:00:00.000Z",
    });
    bucket.set("n-other", {
      id: "n-other",
      ticket_id: "t-4",
      event: "assigned",
      recipient_uid: "someone-else",
      title: "x",
      message: "y",
      ticket_status: "Open",
      href: "/maintenance",
      created_at: "2026-07-09T05:00:00.000Z",
    });

    const list = await listMaintenanceTicketNotifications(
      actor,
      { unreadOnly: true },
      db,
    );
    expect(list.map((n) => n.id)).toEqual(["n-new", "n-old"]);
  });

  it("marks a notification read only for its recipient, and is idempotent", async () => {
    const { db, store } = fakeDb();
    const bucket = new Map<string, Record<string, unknown>>();
    store.set(MAINTENANCE_TICKET_NOTIFICATION_COLLECTION, bucket);
    bucket.set("n-1", {
      id: "n-1",
      ticket_id: "t-1",
      event: "assigned",
      recipient_uid: actor.uid,
      title: "Maintenance ticket assigned",
      message: "A maintenance ticket was assigned to you.",
      ticket_status: "Open",
      href: "/maintenance",
      created_at: "2026-07-09T00:00:00.000Z",
    });

    const other: AuthenticatedUser = { ...actor, uid: "someone-else" };
    await expect(
      markMaintenanceTicketNotificationRead(other, "n-1", db),
    ).rejects.toMatchObject({ status: 403 });

    const marked = await markMaintenanceTicketNotificationRead(actor, "n-1", db);
    expect(marked.read_at).toBeTruthy();
    const again = await markMaintenanceTicketNotificationRead(actor, "n-1", db);
    expect(again.read_at).toBe(marked.read_at);

    await expect(
      markMaintenanceTicketNotificationRead(actor, "missing", db),
    ).rejects.toMatchObject({ status: 404 });
  });
});
