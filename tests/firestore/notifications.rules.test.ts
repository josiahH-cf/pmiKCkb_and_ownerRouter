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

const NOTIF_PATH = "maintenance_ticket_notifications/notif-1";
const PREFS_PATH = "user_notification_preferences/editor-uid";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId: "pmi-kc-kb-notif-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, NOTIF_PATH), {
      id: "notif-1",
      ticket_id: "t-1",
      event: "assigned",
      recipient_uid: "editor-uid",
      title: "Maintenance ticket assigned",
      message: "A maintenance ticket was assigned to you.",
      ticket_status: "Open",
      href: "/maintenance",
    });
    await setDoc(doc(db, PREFS_PATH), {
      uid: "editor-uid",
      muted_families: [],
      email_enabled: false,
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("In-app notification Firestore rules", () => {
  it("denies unauthenticated reads of notifications + preferences", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, NOTIF_PATH)));
    await assertFails(getDoc(doc(db, PREFS_PATH)));
  });

  it("lets the recipient read their own notification + preferences", async () => {
    const db = contextDb("editor-uid", "Editor");
    await assertSucceeds(getDoc(doc(db, NOTIF_PATH)));
    await assertSucceeds(getDoc(doc(db, PREFS_PATH)));
  });

  it("denies another user reading someone else's notification + preferences", async () => {
    const db = contextDb("other-uid", "Editor");
    await assertFails(getDoc(doc(db, NOTIF_PATH)));
    await assertFails(getDoc(doc(db, PREFS_PATH)));
  });

  it("lets an Admin read any user's notification + preferences", async () => {
    const db = contextDb("admin-uid", "Admin");
    await assertSucceeds(getDoc(doc(db, NOTIF_PATH)));
    await assertSucceeds(getDoc(doc(db, PREFS_PATH)));
  });

  it("denies ALL client writes to both collections, even for the owner and Admins", async () => {
    const ownerDb = contextDb("editor-uid", "Editor");
    await assertFails(updateDoc(doc(ownerDb, NOTIF_PATH), { read_at: "2026-07-09" }));
    await assertFails(updateDoc(doc(ownerDb, PREFS_PATH), { muted_families: ["x"] }));
    await assertFails(
      setDoc(doc(ownerDb, "user_notification_preferences/editor-uid"), {
        uid: "editor-uid",
      }),
    );

    const adminDb = contextDb("admin-uid", "Admin");
    await assertFails(
      setDoc(doc(adminDb, "maintenance_ticket_notifications/new"), { id: "new" }),
    );
    await assertFails(deleteDoc(doc(adminDb, NOTIF_PATH)));
    await assertFails(deleteDoc(doc(adminDb, PREFS_PATH)));
  });
});

function contextDb(uid: string, role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(uid, { role }).firestore();
}
