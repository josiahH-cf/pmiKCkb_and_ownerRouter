import { readFileSync } from "node:fs";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let testEnv: RulesTestEnvironment;

const RUN_PATH = "lease_renewal_test_runs/test-renewal-1";
const ATTEMPT_PATH = "lease_renewal_test_action_attempts/attempt-1";
const RECEIPT_PATH = "lease_renewal_test_action_receipts/receipt-1";
const BUSINESS_EVENT_PATH = "lease_renewal_test_business_events/event-1";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-lease-test-workflow-rules",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, RUN_PATH), {
      id: "test-renewal-1",
      data_mode: "test",
      status: "Executing",
    });
    await setDoc(doc(db, ATTEMPT_PATH), {
      id: "attempt-1",
      run_id: "test-renewal-1",
      data_mode: "test",
      action_key: "gmail.renewal_notice.draft_create",
      attempt_number: 1,
      provider_contacted: false,
    });
    await setDoc(doc(db, RECEIPT_PATH), {
      id: "receipt-1",
      run_id: "test-renewal-1",
      data_mode: "test",
      action_key: "gmail.renewal_notice.draft_create",
      live_proof_eligible: false,
      provider_contacted: false,
    });
    await setDoc(doc(db, BUSINESS_EVENT_PATH), {
      id: "event-1",
      run_id: "test-renewal-1",
      data_mode: "test",
      action: "tenant_accepts",
      provider_contacted: false,
      live_proof_eligible: false,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Lease Test workflow Firestore rules", () => {
  it("denies unauthenticated reads", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, RUN_PATH)));
    await assertFails(getDoc(doc(db, ATTEMPT_PATH)));
    await assertFails(getDoc(doc(db, RECEIPT_PATH)));
    await assertFails(getDoc(doc(db, BUSINESS_EVENT_PATH)));
  });

  it("allows authenticated staff roles to read runs and bodyless evidence", async () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const db = authedDb(role);
      await assertSucceeds(getDoc(doc(db, RUN_PATH)));
      await assertSucceeds(getDoc(doc(db, ATTEMPT_PATH)));
      await assertSucceeds(getDoc(doc(db, RECEIPT_PATH)));
      await assertSucceeds(getDoc(doc(db, BUSINESS_EVENT_PATH)));
    }
  });

  it("denies every direct client write, including Admin create/update/delete", async () => {
    const db = authedDb("Admin");
    await assertFails(
      setDoc(doc(db, "lease_renewal_test_runs/new"), {
        data_mode: "test",
        status: "Created",
      }),
    );
    await assertFails(updateDoc(doc(db, RUN_PATH), { status: "Done" }));
    await assertFails(deleteDoc(doc(db, RUN_PATH)));
    await assertFails(
      setDoc(doc(db, "lease_renewal_test_action_attempts/new"), {
        provider_contacted: false,
      }),
    );
    await assertFails(
      setDoc(doc(db, "lease_renewal_test_action_receipts/new"), {
        live_proof_eligible: false,
      }),
    );
    await assertFails(
      setDoc(doc(db, "lease_renewal_test_business_events/new"), {
        data_mode: "test",
        action: "tenant_accepts",
      }),
    );
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
