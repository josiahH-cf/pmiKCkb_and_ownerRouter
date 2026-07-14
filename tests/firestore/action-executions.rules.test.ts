import { readFileSync } from "node:fs";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-action-execution-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "action_executions/exec-1"), {
      action_key: "fixture.action",
      actor_uid: "editor-uid",
      attempt_count: 0,
      preview_hash: "a".repeat(64),
      state: "Ready",
    });
    await setDoc(doc(db, "action_execution_activity/activity-1"), {
      action: "prepared",
      actor_uid: "editor-uid",
      execution_id: "exec-1",
      to_state: "Ready",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("S20 action execution Firestore rules", () => {
  it("denies every direct client read even to Admin", async () => {
    const db = authedDb("Admin");
    await assertFails(getDoc(doc(db, "action_executions/exec-1")));
    await assertFails(getDoc(doc(db, "action_execution_activity/activity-1")));
  });

  it("denies create, update, and delete even to Admin", async () => {
    const db = authedDb("Admin");
    await assertFails(
      setDoc(doc(db, "action_executions/forged"), {
        action_key: "fixture.action",
        risk: "Low",
        state: "Succeeded",
      }),
    );
    await assertFails(
      updateDoc(doc(db, "action_executions/exec-1"), {
        attempt_count: 0,
        state: "Ready",
      }),
    );
    await assertFails(deleteDoc(doc(db, "action_execution_activity/activity-1")));
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
