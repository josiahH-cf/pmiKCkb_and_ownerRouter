import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const PATHS = [
  "gmail_send_confirmations/confirmation-1",
  "gmail_send_audit/audit-1",
  "gmail_mailbox_state/mailbox-1",
  "gmail_push_dedupe/message-1",
  "gmail_sync_audit/sync-1",
] as const;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-gmail-hub-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    for (const path of PATHS) {
      await setDoc(doc(context.firestore(), path), { state: "server-only" });
    }
  });
});

afterAll(async () => testEnv.cleanup());

describe("Gmail Hub server-only Firestore rules (AC-S19-9)", () => {
  it("denies every client read, including Admin", async () => {
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const db = authedDb(role);
      for (const path of PATHS) await assertFails(getDoc(doc(db, path)));
    }
  });

  it("denies every client create, update, and delete", async () => {
    const db = authedDb("Admin");
    for (const path of PATHS) {
      const existing = doc(db, path);
      const collection = path.split("/")[0];
      await assertFails(
        setDoc(doc(db, `${collection}/client-created`), { state: "bad" }),
      );
      await assertFails(updateDoc(existing, { state: "tampered" }));
      await assertFails(deleteDoc(existing));
    }
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
