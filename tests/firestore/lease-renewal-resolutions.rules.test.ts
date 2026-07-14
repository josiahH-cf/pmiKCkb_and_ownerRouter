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

const RESOLUTION_PATH =
  "lease_renewal_resolutions/lease_renewal_reconcile_run1_renewal_date";
const ACTIVITY_PATH = "lease_renewal_resolution_activity/activity-1";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-lr-resolutions-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, RESOLUTION_PATH), {
      id: "lease_renewal_reconcile_run1_renewal_date",
      source_trigger_key: "lease_renewal:reconcile:run1:renewal_date",
      run_id: "run1",
      field_key: "renewal_date",
      field_label: "Renewal date",
      severity: "High",
      status: "Resolved",
    });
    await setDoc(doc(db, ACTIVITY_PATH), {
      id: "activity-1",
      source_trigger_key: "lease_renewal:reconcile:run1:renewal_date",
      run_id: "run1",
      actor_uid: "admin-uid",
      action: "pick_source",
      new_status: "Resolved",
      reason: "Rentvine is the read-authoritative source.",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Lease Renewal resolution Firestore rules", () => {
  it("requires authentication to read", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, RESOLUTION_PATH)));
    await assertFails(getDoc(doc(db, ACTIVITY_PATH)));
  });

  it("allows editor-or-better to read resolutions and activity", async () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      await assertSucceeds(getDoc(doc(authedDb(role), RESOLUTION_PATH)));
      await assertSucceeds(getDoc(doc(authedDb(role), ACTIVITY_PATH)));
    }
  });

  it("denies all client writes, even for Admins", async () => {
    const adminDb = authedDb("Admin");
    await assertFails(
      setDoc(doc(adminDb, "lease_renewal_resolutions/new"), { id: "new" }),
    );
    await assertFails(updateDoc(doc(adminDb, RESOLUTION_PATH), { status: "Dismissed" }));
    await assertFails(deleteDoc(doc(adminDb, RESOLUTION_PATH)));
    await assertFails(
      setDoc(doc(adminDb, "lease_renewal_resolution_activity/new"), { id: "new" }),
    );
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
