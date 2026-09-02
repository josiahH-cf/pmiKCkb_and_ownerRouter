import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  buildActionRegistryRecord,
  getActionRegistryEntry,
  listActionRegistry,
  upsertActionRegistryEntry,
} from "@/lib/firestore/action-registry";
import {
  ACTION_REGISTRY_SEED,
  OWNER_PROOF_WINDOW_OPEN_KEYS,
} from "@/lib/integrations/action-registry-seed";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const editor = userWith("Editor", "editor-1");

let db: Firestore;

beforeEach(() => {
  db = new FakeFirestore() as unknown as Firestore;
});

describe("Action Registry repository", () => {
  it("uses the key as the record id and keeps a closed entry non-executable", () => {
    // The retired broad Sheet identifier is permanently closed, so this pin survives activations.
    const retired = ACTION_REGISTRY_SEED.find(
      (entry) => entry.key === "google_sheets.renewal_checklist.writeback",
    )!;
    const record = buildActionRegistryRecord(retired);

    expect(record.id).toBe(record.key);
    expect(record.production_allowed).toBe(false);
  });

  it("seeds and lists catalog entries sorted by key", async () => {
    for (const entry of ACTION_REGISTRY_SEED) {
      await upsertActionRegistryEntry(entry, db);
    }

    const all = await listActionRegistry(editor, db);
    const keys = all.map((entry) => entry.key);

    expect(all).toHaveLength(ACTION_REGISTRY_SEED.length);
    expect(keys).toEqual([...keys].sort());
    expect(
      all
        .filter((entry) => entry.production_allowed)
        .map((entry) => entry.key)
        // S97-S100: a committed bounded proof window may temporarily open one exact key.
        .filter((key) => !OWNER_PROOF_WINDOW_OPEN_KEYS.includes(key)),
    ).toEqual([
      "gmail.label.apply",
      "gmail.mailbox.read",
      "gmail.maintenance_owner_notice.draft_create",
      "gmail.renewal_notice.draft_create",
      "gmail.thread.reply",
      // S98 activation (2026-09-02): proven exact operating-Sheet write keys.
      "google_sheets.renewal_checklist.field_update",
      "google_sheets.renewal_checklist.row_append",
      // S39.3: internal-staff transactional notice flipped live (sorts after the gmail.* keys).
      "internal.transactional_notice.send",
      // S59: read-only RentCast lookup, explicitly activated for the meeting-readiness slice.
      "rentcast.rental_listings.search",
      // S97 activation (2026-09-02): proven exact renewal-writeback keys.
      "rentvine.lease.recurring_charge.create",
      "rentvine.lease.recurring_charge.update",
      "rentvine.lease.renewal_dates.update",
      // S99 activation (2026-09-02): proven exact work-order keys.
      "rentvine.work_order.chat.sync",
      "rentvine.work_order.create",
      "rentvine.work_order.read",
      "rentvine.work_order.update_status",
    ]);
  });

  it("reads a single entry by key", async () => {
    const seedKey = ACTION_REGISTRY_SEED[0].key;
    await upsertActionRegistryEntry(ACTION_REGISTRY_SEED[0], db);

    const entry = await getActionRegistryEntry(editor, seedKey, db);

    expect(entry.key).toBe(seedKey);
    expect(typeof entry.created_at).toBe("string");
  });

  it("throws when an entry is missing", async () => {
    await expect(getActionRegistryEntry(editor, "missing.key", db)).rejects.toThrow();
  });
});
