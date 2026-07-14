import { readFileSync } from "node:fs";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const OWNER_PROGRESS = "renewal_decider_progress/editor-marker";
const OWNER_ACTIVITY = "renewal_decider_progress_activity/editor-activity";
const ADMIN_PROGRESS = "renewal_decider_progress/admin-marker";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-renewal-decider-progress-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, OWNER_PROGRESS), {
      id: "editor-marker",
      user_uid: "editor-uid",
      run_id: "run-1",
      source_trigger_key: "lease_renewal:reconcile:run-1:current_rent",
      status: "Deferred",
    });
    await setDoc(doc(db, OWNER_ACTIVITY), {
      id: "editor-activity",
      actor_uid: "editor-uid",
      run_id: "run-1",
      source_trigger_key: "lease_renewal:reconcile:run-1:current_rent",
      action: "Deferred",
      new_status: "Deferred",
    });
    await setDoc(doc(db, ADMIN_PROGRESS), {
      id: "admin-marker",
      user_uid: "admin-uid",
      run_id: "run-1",
      source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
      status: "Seen",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("renewal decider progress Firestore rules", () => {
  it("denies unauthenticated reads of current and Activity records", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, OWNER_PROGRESS)));
    await assertFails(getDoc(doc(db, OWNER_ACTIVITY)));
  });

  it("lets an Editor read only their own current and Activity records", async () => {
    const db = contextDb("editor-uid", "Editor");
    await assertSucceeds(getDoc(doc(db, OWNER_PROGRESS)));
    await assertSucceeds(getDoc(doc(db, OWNER_ACTIVITY)));
    await assertFails(getDoc(doc(db, ADMIN_PROGRESS)));
  });

  it("keeps progress client-read-own even for an Admin", async () => {
    const db = contextDb("admin-uid", "Admin");
    await assertSucceeds(getDoc(doc(db, ADMIN_PROGRESS)));
    await assertFails(getDoc(doc(db, OWNER_PROGRESS)));
    await assertFails(getDoc(doc(db, OWNER_ACTIVITY)));
  });

  it("denies every direct client write, including the owner and an Admin", async () => {
    const ownerDb = contextDb("editor-uid", "Editor");
    await assertFails(updateDoc(doc(ownerDb, OWNER_PROGRESS), { status: "Seen" }));
    await assertFails(
      setDoc(doc(ownerDb, "renewal_decider_progress/editor-new"), {
        user_uid: "editor-uid",
        run_id: "run-1",
        source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
        status: "Deferred",
      }),
    );
    await assertFails(deleteDoc(doc(ownerDb, OWNER_ACTIVITY)));

    const adminDb = contextDb("admin-uid", "Admin");
    await assertFails(updateDoc(doc(adminDb, ADMIN_PROGRESS), { status: "Deferred" }));
    await assertFails(
      setDoc(doc(adminDb, "renewal_decider_progress_activity/admin-new"), {
        actor_uid: "admin-uid",
        run_id: "run-1",
        source_trigger_key: "lease_renewal:reconcile:run-1:renewal_date",
        action: "Seen",
      }),
    );
    await assertFails(deleteDoc(doc(adminDb, ADMIN_PROGRESS)));
  });
});

function contextDb(uid: string, role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(uid, { role }).firestore();
}
