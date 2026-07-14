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
const RECORD = "admin_scope_changes/change-1";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-admin-scope-audit-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), RECORD), {
      actor_uid: "admin-uid",
      actor_email: "admin@pmikcmetro.com",
      target_uid: "worker-uid",
      target_email: "worker@pmikcmetro.com",
      previous_scopes: null,
      previous_scope_claim_invalid: false,
      new_scopes: ["maintenance"],
      reason: "maintenance sub-user",
      created_at: "2026-07-10T00:00:00.000Z",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("admin scope-change audit Firestore rules", () => {
  it("allows only an authenticated Admin to read", async () => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), RECORD)));
    await assertFails(getDoc(doc(authedDb("Editor"), RECORD)));
    await assertFails(getDoc(doc(authedDb("Approver"), RECORD)));
    await assertSucceeds(getDoc(doc(authedDb("Admin"), RECORD)));
  });

  it("denies every direct client write, including an Admin", async () => {
    const db = authedDb("Admin");
    await assertFails(
      setDoc(doc(db, "admin_scope_changes/forged"), {
        actor_uid: "admin-uid",
        target_uid: "worker-uid",
        previous_scopes: null,
        previous_scope_claim_invalid: false,
        new_scopes: ["renewals"],
        reason: "forged",
      }),
    );
    await assertFails(updateDoc(doc(db, RECORD), { reason: "tampered" }));
    await assertFails(deleteDoc(doc(db, RECORD)));
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
