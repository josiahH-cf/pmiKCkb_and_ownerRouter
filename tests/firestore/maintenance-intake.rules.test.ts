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

const INTAKE_PATH = "maintenance_unverified_intake/intake-1";
const ACTIVITY_PATH = "maintenance_unverified_intake_activity/activity-1";
const NONCE_PATH = "maintenance_intake_nonce/jti-1";
const COUNTER_PATH = "maintenance_intake_rate_counter/prop-1__2026-07-09";
const EPOCH_PATH = "maintenance_intake_epoch/prop-1";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-maint-intake-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, INTAKE_PATH), {
      id: "intake-1",
      status: "unverified",
      source: "public-link",
      property_key: "prop-1",
      summary: "Leaky faucet",
    });
    await setDoc(doc(db, ACTIVITY_PATH), {
      id: "activity-1",
      intake_id: "intake-1",
      action: "intake",
    });
    await setDoc(doc(db, NONCE_PATH), { jti: "jti-1", property_key: "prop-1" });
    await setDoc(doc(db, COUNTER_PATH), { property_key: "prop-1", count: 1 });
    await setDoc(doc(db, EPOCH_PATH), { property_key: "prop-1", epoch: 0 });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Maintenance public-intake Firestore rules", () => {
  it("denies unauthenticated reads of the intake queue", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, INTAKE_PATH)));
    await assertFails(getDoc(doc(db, ACTIVITY_PATH)));
  });

  it("lets editor-or-better read the intake queue + activity (for triage)", async () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      await assertSucceeds(getDoc(doc(authedDb(role), INTAKE_PATH)));
      await assertSucceeds(getDoc(doc(authedDb(role), ACTIVITY_PATH)));
    }
  });

  it("denies ALL client writes to intake + activity, even for Admins", async () => {
    const adminDb = authedDb("Admin");
    await assertFails(
      setDoc(doc(adminDb, "maintenance_unverified_intake/new"), { id: "new" }),
    );
    await assertFails(updateDoc(doc(adminDb, INTAKE_PATH), { status: "verified" }));
    await assertFails(deleteDoc(doc(adminDb, INTAKE_PATH)));
    await assertFails(
      setDoc(doc(adminDb, "maintenance_unverified_intake_activity/new"), { id: "new" }),
    );
  });

  it("fully denies client access to nonce, rate-counter, and epoch (server-only)", async () => {
    const adminDb = authedDb("Admin");
    // No client may even READ the abuse-control bookkeeping.
    await assertFails(getDoc(doc(adminDb, NONCE_PATH)));
    await assertFails(getDoc(doc(adminDb, COUNTER_PATH)));
    await assertFails(getDoc(doc(adminDb, EPOCH_PATH)));
    // And certainly not write it (e.g. to bump their own daily cap or clear a nonce).
    await assertFails(updateDoc(doc(adminDb, COUNTER_PATH), { count: 0 }));
    await assertFails(deleteDoc(doc(adminDb, NONCE_PATH)));
    await assertFails(updateDoc(doc(adminDb, EPOCH_PATH), { epoch: 99 }));
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
