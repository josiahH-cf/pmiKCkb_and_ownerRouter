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
  "vendors/vendor-1",
  "vendor_ticket_assignments/ticket-1",
  "vendor_ticket_thread_links/link-1",
  "vendor_oauth_states/state-1",
  "vendor_mailbox_connections/vendor-1",
  "vendor_send_confirmations/confirmation-1",
  "vendor_token_revocation_queue/job-1",
  "vendor_audit/audit-1",
] as const;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-vendor-portal-test",
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

describe("Vendor portal server-only Firestore rules (AC-S22-3/5)", () => {
  it("denies reads to staff and external Vendor clients", async () => {
    for (const claims of [
      { uid: "admin", claims: { role: "Admin" } },
      { uid: "vendor", claims: { vendor: true, vendor_id: "vendor-1" } },
    ]) {
      const db = testEnv.authenticatedContext(claims.uid, claims.claims).firestore();
      for (const path of PATHS) await assertFails(getDoc(doc(db, path)));
    }
  });

  it("denies all client mutations", async () => {
    const db = testEnv.authenticatedContext("admin", { role: "Admin" }).firestore();
    for (const path of PATHS) {
      const ref = doc(db, path);
      await assertFails(
        setDoc(doc(db, `${path.split("/")[0]}/client`), { state: "bad" }),
      );
      await assertFails(updateDoc(ref, { state: "bad" }));
      await assertFails(deleteDoc(ref));
    }
  });
});
