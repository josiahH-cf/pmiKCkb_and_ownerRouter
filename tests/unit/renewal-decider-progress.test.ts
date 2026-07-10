import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import { can, type Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RENEWAL_DECIDER_PROGRESS_COLLECTIONS,
  SetRenewalDeciderProgressInputSchema,
  listRenewalDeciderProgressActivityForRun,
  listRenewalDeciderProgressForRun,
  renewalDeciderProgressDocId,
  setRenewalDeciderProgress,
} from "@/lib/firestore/renewal-decider-progress";
import { FakeFirestore } from "../helpers/fake-firestore";

const RUN_ID = "run-1";
const FLAG_KEY = "lease_renewal:reconcile:run-1:current_rent";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const editor = userWith("Editor", "editor-1");
const approver = userWith("Approver", "approver-1");

let db: FakeFirestore;

beforeEach(() => {
  db = new FakeFirestore();
});

function fs(): Firestore {
  return db as unknown as Firestore;
}

describe("renewal decider progress persistence", () => {
  it("gates app-plane Skip bookkeeping at edit, so a plain Editor can defer a flag", async () => {
    expect(can("Editor", "edit")).toBe(true);
    expect(can("Editor", "approve")).toBe(false);
    expect(can("Editor", "manageAdmin")).toBe(false);

    await expect(
      setRenewalDeciderProgress(
        editor,
        { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
        fs(),
      ),
    ).resolves.toMatchObject({
      user_uid: "editor-1",
      run_id: RUN_ID,
      source_trigger_key: FLAG_KEY,
      status: "Deferred",
    });
  });

  it("uses the deterministic uid:run_id:source_trigger_key natural key", async () => {
    const expectedId = renewalDeciderProgressDocId("editor-1", RUN_ID, FLAG_KEY);
    expect(renewalDeciderProgressDocId("editor-1", RUN_ID, FLAG_KEY)).toBe(expectedId);
    expect(expectedId.split(".")).toHaveLength(3);
    expect(expectedId).not.toContain("/");
    expect(renewalDeciderProgressDocId("editor-1", "run:a", "flag_b")).not.toBe(
      renewalDeciderProgressDocId("editor-1", "run_a", "flag:b"),
    );

    const progress = await setRenewalDeciderProgress(
      editor,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
      fs(),
    );
    expect(progress.id).toBe(expectedId);
    expect(
      db.store.has(`${RENEWAL_DECIDER_PROGRESS_COLLECTIONS.progress}/${expectedId}`),
    ).toBe(true);
  });

  it("upserts one current marker and appends an Activity twin in the same transaction", async () => {
    await setRenewalDeciderProgress(
      editor,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
      fs(),
    );
    await setRenewalDeciderProgress(
      editor,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Seen" },
      fs(),
    );

    const progress = await listRenewalDeciderProgressForRun(editor, RUN_ID, fs());
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ status: "Seen", user_uid: "editor-1" });

    const activity = await listRenewalDeciderProgressActivityForRun(editor, RUN_ID, fs());
    expect(activity).toHaveLength(2);
    expect(activity.map((entry) => entry.new_status)).toEqual(["Deferred", "Seen"]);
    expect(activity[0].previous_status).toBeUndefined();
    expect(activity[1].previous_status).toBe("Deferred");
  });

  it("isolates current and Activity reads per user, even for the same run and flag", async () => {
    await setRenewalDeciderProgress(
      editor,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
      fs(),
    );
    await setRenewalDeciderProgress(
      approver,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Seen" },
      fs(),
    );

    await expect(listRenewalDeciderProgressForRun(editor, RUN_ID, fs())).resolves.toEqual(
      [expect.objectContaining({ user_uid: "editor-1", status: "Deferred" })],
    );
    await expect(
      listRenewalDeciderProgressForRun(approver, RUN_ID, fs()),
    ).resolves.toEqual([
      expect.objectContaining({ user_uid: "approver-1", status: "Seen" }),
    ]);
    await expect(
      listRenewalDeciderProgressActivityForRun(editor, RUN_ID, fs()),
    ).resolves.toEqual([
      expect.objectContaining({ actor_uid: "editor-1", new_status: "Deferred" }),
    ]);
  });

  it("enforces a strict, opaque, value-free payload and persists no client values or PII", async () => {
    expect(
      SetRenewalDeciderProgressInputSchema.safeParse({
        run_id: RUN_ID,
        source_trigger_key: FLAG_KEY,
        status: "Deferred",
        candidate_value: "$1,425",
        property_address: "123 Main Street",
        customer_email: "tenant@example.com",
      }).success,
    ).toBe(false);
    expect(
      SetRenewalDeciderProgressInputSchema.safeParse({
        run_id: RUN_ID,
        source_trigger_key: "123 Main Street",
        status: "Deferred",
      }).success,
    ).toBe(false);

    await setRenewalDeciderProgress(
      editor,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
      fs(),
    );

    const current = [...db.store.entries()].find(([path]) =>
      path.startsWith(`${RENEWAL_DECIDER_PROGRESS_COLLECTIONS.progress}/`),
    )?.[1];
    const activity = [...db.store.entries()].find(([path]) =>
      path.startsWith(`${RENEWAL_DECIDER_PROGRESS_COLLECTIONS.activity}/`),
    )?.[1];

    expect(Object.keys(current ?? {}).sort()).toEqual(
      [
        "created_at",
        "id",
        "run_id",
        "source_trigger_key",
        "status",
        "updated_at",
        "user_uid",
      ].sort(),
    );
    expect(Object.keys(activity ?? {}).sort()).toEqual(
      [
        "action",
        "actor_uid",
        "created_at",
        "id",
        "new_status",
        "run_id",
        "source_trigger_key",
      ].sort(),
    );
    expect(JSON.stringify({ current, activity })).not.toContain("$1,425");
    expect(JSON.stringify({ current, activity })).not.toContain("123 Main Street");
    expect(JSON.stringify({ current, activity })).not.toContain("tenant@example.com");
  });

  it("writes only the two KB-owned progress collections", async () => {
    await setRenewalDeciderProgress(
      editor,
      { run_id: RUN_ID, source_trigger_key: FLAG_KEY, status: "Deferred" },
      fs(),
    );

    expect([...db.store.keys()]).toHaveLength(2);
    expect(
      [...db.store.keys()].every(
        (path) =>
          path.startsWith(`${RENEWAL_DECIDER_PROGRESS_COLLECTIONS.progress}/`) ||
          path.startsWith(`${RENEWAL_DECIDER_PROGRESS_COLLECTIONS.activity}/`),
      ),
    ).toBe(true);
  });
});
