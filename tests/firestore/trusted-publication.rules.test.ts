import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-trusted-publication-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "publication_policies/policy-1"), { enabled: true });
    await setDoc(doc(db, "publication_policy_audit/audit-1"), {
      eventType: "created",
    });
    await setDoc(doc(db, "publication_resources/source-1"), {
      activeVersionId: "version-1",
    });
    await setDoc(doc(db, "publication_versions/version-1"), { validated: true });
    await setDoc(doc(db, "publication_content_chunks/content-1_000"), {
      chunkBase64: "c3ludGhldGlj",
    });
    await setDoc(doc(db, "publication_audit/audit-1"), { eventType: "published" });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("S21 trusted-publication Firestore rules", () => {
  it("allows only Admin policy/audit reads and no direct writes", async () => {
    const admin = authedDb("Admin");
    const editor = authedDb("Editor");
    await assertSucceeds(getDoc(doc(admin, "publication_policies/policy-1")));
    await assertSucceeds(getDoc(doc(admin, "publication_policy_audit/audit-1")));
    await assertFails(getDoc(doc(editor, "publication_policies/policy-1")));
    await assertFails(
      updateDoc(doc(admin, "publication_policies/policy-1"), { enabled: false }),
    );
  });

  it("denies direct client reads and writes for content, pointers, and audits", async () => {
    const admin = authedDb("Admin");
    await assertFails(getDoc(doc(admin, "publication_resources/source-1")));
    await assertFails(getDoc(doc(admin, "publication_versions/version-1")));
    await assertFails(getDoc(doc(admin, "publication_content_chunks/content-1_000")));
    await assertFails(getDoc(doc(admin, "publication_audit/audit-1")));
    await assertFails(
      setDoc(doc(admin, "publication_versions/forged"), { validated: true }),
    );
    await assertFails(
      setDoc(doc(admin, "publication_content_chunks/forged_000"), {
        chunkBase64: "Zm9yZ2Vk",
      }),
    );
  });
});

function authedDb(role: "Editor" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
