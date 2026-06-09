import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const ENTRY_PATH = "action_registry/rentvine.work_order.create";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    // Distinct projectId isolates this file's emulator data from other Firestore test
    // files that vitest may run in parallel against the same emulator.
    projectId: "pmi-kc-kb-ar-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, ENTRY_PATH), {
      id: "rentvine.work_order.create",
      key: "rentvine.work_order.create",
      label: "Create Rentvine work order",
      target_system: "Rentvine",
      readiness: "Needs Connection",
      evidence_status: "Documented",
      production_allowed: false,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Action Registry Firestore rules", () => {
  it("requires authentication to read", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, ENTRY_PATH)));
  });

  it("allows editor-or-better to read catalog entries", async () => {
    await assertSucceeds(getDoc(doc(authedDb("Editor"), ENTRY_PATH)));
    await assertSucceeds(getDoc(doc(authedDb("Approver"), ENTRY_PATH)));
    await assertSucceeds(getDoc(doc(authedDb("Admin"), ENTRY_PATH)));
  });

  it("denies all client writes, even for Admins", async () => {
    const adminDb = authedDb("Admin");

    await assertFails(
      setDoc(doc(adminDb, "action_registry/new.entry"), { key: "new.entry" }),
    );
    await assertFails(updateDoc(doc(adminDb, ENTRY_PATH), { production_allowed: true }));
    await assertFails(deleteDoc(doc(adminDb, ENTRY_PATH)));
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
