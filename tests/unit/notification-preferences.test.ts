import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/firestore/notification-preferences";

const COLLECTION = "user_notification_preferences";

function fakeDb() {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const db = {
    collection(name: string) {
      const c = col(name);
      return {
        doc: (id: string) => ({
          id,
          async get() {
            return { exists: c.has(id), id, data: () => c.get(id) };
          },
          async set(data: Record<string, unknown>) {
            c.set(id, data);
          },
        }),
      };
    },
  };
  return { db: db as unknown as Firestore, store };
}

const actor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

describe("notification preferences", () => {
  it("returns a default when no record exists", async () => {
    const { db } = fakeDb();
    const prefs = await getNotificationPreferences(actor, db);
    expect(prefs).toMatchObject({ muted_families: [], email_enabled: false });
    expect(prefs.uid).toBe("editor-1");
  });

  it("writes only to the actor's own doc, keeps only available family mutes, and pins email off", async () => {
    const { db, store } = fakeDb();
    const saved = await updateNotificationPreferences(
      actor,
      { muted_families: ["maintenance_tickets", "rentvine_replies"] },
      db,
    );

    // Stubbed Gmail-dependent family is dropped; the available one is kept.
    expect(saved.muted_families).toEqual(["maintenance_tickets"]);
    expect(saved.email_enabled).toBe(false);

    const bucket = store.get(COLLECTION)!;
    expect([...bucket.keys()]).toEqual(["editor-1"]);
    expect(bucket.get("editor-1")).toMatchObject({
      uid: "editor-1",
      muted_families: ["maintenance_tickets"],
      email_enabled: false,
    });

    const readBack = await getNotificationPreferences(actor, db);
    expect(readBack.muted_families).toEqual(["maintenance_tickets"]);
  });

  it("preserves created_at and bumps updated_at on a second update", async () => {
    const { db } = fakeDb();
    const first = await updateNotificationPreferences(actor, { muted_families: [] }, db);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await updateNotificationPreferences(
      actor,
      { muted_families: ["maintenance_tickets"] },
      db,
    );

    expect(second.created_at).toBe(first.created_at);
    expect(second.updated_at).not.toBe(first.updated_at);
    expect(second.updated_at! >= first.updated_at!).toBe(true);
  });
});
