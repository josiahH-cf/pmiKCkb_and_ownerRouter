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
import { ACTION_REGISTRY_SEED } from "@/lib/integrations/action-registry-seed";
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
  it("uses the key as the record id and stays non-executable", () => {
    const record = buildActionRegistryRecord(ACTION_REGISTRY_SEED[0]);

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
      all.filter((entry) => entry.production_allowed).map((entry) => entry.key),
    ).toEqual([
      "gmail.draft.create",
      "gmail.label.apply",
      "gmail.mailbox.read",
      "gmail.message.send",
      "gmail.renewal_notice.draft_create",
      "gmail.thread.reply",
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
