import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

let testEnv: RulesTestEnvironment;
const PATHS = [
  "external_action_executions/execution-1",
  "external_action_execution_audit/audit-1",
] as const;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-external-actions-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    for (const path of PATHS)
      await setDoc(doc(context.firestore(), path), { state: "server-only" });
  });
});

afterAll(async () => testEnv.cleanup());

describe("External action execution Firestore rules", () => {
  it("denies reads and mutations for every client role", async () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const db = testEnv.authenticatedContext(role.toLowerCase(), { role }).firestore();
      for (const path of PATHS) {
        const ref = doc(db, path);
        await assertFails(getDoc(ref));
        await assertFails(updateDoc(ref, { state: "bad" }));
        await assertFails(deleteDoc(ref));
        await assertFails(
          setDoc(doc(db, `${path.split("/")[0]}/client`), { state: "bad" }),
        );
      }
    }
  });
});
