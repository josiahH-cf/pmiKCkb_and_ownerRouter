import { readFileSync } from "node:fs";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { WORK_ACCOUNTABILITY_COLLECTIONS } from "@/lib/firestore/work-accountability";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

let testEnv: RulesTestEnvironment;
const COLLECTIONS = Object.values(WORK_ACCOUNTABILITY_COLLECTIONS);

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-work-accountability-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    for (const collection of COLLECTIONS) {
      await setDoc(doc(context.firestore(), collection, "server-only"), {
        state: "server-only",
      });
    }
  });
});

afterAll(async () => testEnv.cleanup());

describe("S68 server-only Firestore boundary", () => {
  it("denies direct reads and mutations to unauthenticated clients", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    for (const collection of COLLECTIONS) {
      const ref = doc(db, collection, "server-only");
      await assertFails(getDoc(ref));
      await assertFails(setDoc(doc(db, collection, "client"), { state: "bad" }));
    }
  });

  it("denies direct reads and mutations to every internal app role", async () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const db = testEnv.authenticatedContext(role.toLowerCase(), { role }).firestore();
      for (const collection of COLLECTIONS) {
        const ref = doc(db, collection, "server-only");
        await assertFails(getDoc(ref));
        await assertFails(updateDoc(ref, { state: "bad" }));
        await assertFails(deleteDoc(ref));
        await assertFails(setDoc(doc(db, collection, "client"), { state: "bad" }));
      }
    }
  });
});
