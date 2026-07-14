import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/firestore/notification-preferences";
import {
  applyLowAlarm,
  isLaneDigested,
  isLaneSnoozed,
  passesLaneThreshold,
} from "@/lib/notifications/low-alarm";

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

  it("writes only to the actor's own doc, accepts workflow families, and pins email off", async () => {
    const { db, store } = fakeDb();
    const saved = await updateNotificationPreferences(
      actor,
      { muted_families: ["maintenance_tickets", "maintenance_communications"] },
      db,
    );

    expect(saved.muted_families).toEqual([
      "maintenance_tickets",
      "maintenance_communications",
    ]);
    expect(saved.email_enabled).toBe(false);

    const bucket = store.get(COLLECTION)!;
    expect([...bucket.keys()]).toEqual(["editor-1"]);
    expect(bucket.get("editor-1")).toMatchObject({
      uid: "editor-1",
      muted_families: ["maintenance_tickets", "maintenance_communications"],
      email_enabled: false,
    });

    const readBack = await getNotificationPreferences(actor, db);
    expect(readBack.muted_families).toEqual([
      "maintenance_tickets",
      "maintenance_communications",
    ]);
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

  // B4: the low-alarm fields are MERGE-PRESERVED — a mute-only update never wipes a stored threshold.
  it("merge-preserves lane_thresholds / snoozed_lanes / digest_lanes on a mute-only update", async () => {
    const { db } = fakeDb();
    await updateNotificationPreferences(
      actor,
      {
        muted_families: [],
        lane_thresholds: { connection: "high" },
        digest_lanes: ["decision"],
      },
      db,
    );
    // A later update that only changes mutes must NOT wipe the low-alarm settings.
    const merged = await updateNotificationPreferences(
      actor,
      { muted_families: ["maintenance_tickets"] },
      db,
    );
    expect(merged.lane_thresholds).toEqual({ connection: "high" });
    expect(merged.digest_lanes).toEqual(["decision"]);
    expect(merged.muted_families).toEqual(["maintenance_tickets"]);

    const readBack = await getNotificationPreferences(actor, db);
    expect(readBack.lane_thresholds).toEqual({ connection: "high" });
    expect(readBack.digest_lanes).toEqual(["decision"]);
  });
});

// AC-S17-5: the pure low-alarm resolver primitives — threshold, snooze, digest.
describe("low-alarm resolver (S17 B4)", () => {
  const now = "2026-07-10T12:00:00.000Z";

  it("hides a signal below its lane threshold, keeps one at or above it", () => {
    const prefs = { lane_thresholds: { connection: "high" as const } };
    expect(passesLaneThreshold({ lane: "connection", severity: "medium" }, prefs)).toBe(
      false,
    );
    expect(passesLaneThreshold({ lane: "connection", severity: "high" }, prefs)).toBe(
      true,
    );
    // A lane with no threshold passes everything.
    expect(passesLaneThreshold({ lane: "coverage", severity: "low" }, prefs)).toBe(true);
  });

  it("silences a lane until its snooze expires", () => {
    const future = { snoozed_lanes: { coverage: "2026-07-10T18:00:00.000Z" } };
    const past = { snoozed_lanes: { coverage: "2026-07-10T06:00:00.000Z" } };
    expect(isLaneSnoozed("coverage", future, now)).toBe(true);
    expect(isLaneSnoozed("coverage", past, now)).toBe(false);
    // An unparseable timestamp fails toward showing the signal (never silently hides work).
    expect(
      isLaneSnoozed("coverage", { snoozed_lanes: { coverage: "not-a-date" } }, now),
    ).toBe(false);
  });

  it("flags a digested lane", () => {
    expect(isLaneDigested("decision", { digest_lanes: ["decision"] })).toBe(true);
    expect(isLaneDigested("renewal", { digest_lanes: ["decision"] })).toBe(false);
  });

  it("applyLowAlarm drops snoozed + below-threshold items and keeps the rest", () => {
    const items = [
      { lane: "connection" as const, severity: "medium" as const }, // below threshold -> dropped
      { lane: "connection" as const, severity: "high" as const }, // kept
      { lane: "coverage" as const, severity: "high" as const }, // snoozed -> dropped
      { lane: "renewal" as const, severity: "low" as const }, // kept
    ];
    const kept = applyLowAlarm(
      items,
      {
        lane_thresholds: { connection: "high" },
        snoozed_lanes: { coverage: "2026-07-10T18:00:00.000Z" },
      },
      now,
    );
    expect(kept).toEqual([
      { lane: "connection", severity: "high" },
      { lane: "renewal", severity: "low" },
    ]);
  });
});
