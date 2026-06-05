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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    // Distinct projectId isolates this file's emulator data and rules from the other
    // Firestore test file, which vitest may run in parallel against the same emulator.
    projectId: "pmi-kc-kb-aq-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "approval_queue_items/item-1"), {
      id: "item-1",
      process_run_ref: { id: "run-1", label: "Lease Renewal" },
      item_type: "ApprovalPackage",
      source_trigger_key: "run-1:owner-comms",
      status: "Ready for Approval",
      risk: "High",
      audience_group: "Dan/Admin decisions",
      assignee_uid: "editor-uid",
      required_approver_uid: "approver-uid",
      action_needed: "Approve the owner renewal email.",
      direct_link: "/runs/run-1",
    });
    await setDoc(doc(db, "approval_queue_activity/activity-1"), {
      id: "activity-1",
      item_id: "item-1",
      actor_uid: "editor-uid",
      action: "created",
      new_state: "Ready for Approval",
      source_trigger: "ApprovalPackage",
    });
    await setDoc(doc(db, "approval_queue_items/item-2"), {
      id: "item-2",
      process_run_ref: { id: "run-2", label: "Hidden Lease Renewal" },
      item_type: "ApprovalPackage",
      source_trigger_key: "run-2:owner-comms",
      status: "Ready for Approval",
      risk: "Low",
      audience_group: "Dan/Admin decisions",
      assignee_uid: "someone-else",
      required_approver_uid: "someone-else",
      action_needed: "Hidden approval.",
      direct_link: "/runs/run-2",
    });
    await setDoc(doc(db, "approval_queue_activity/activity-2"), {
      id: "activity-2",
      item_id: "item-2",
      actor_uid: "someone-else",
      action: "created",
      new_state: "Ready for Approval",
      source_trigger: "ApprovalPackage",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Approval Queue Firestore rules", () => {
  it("requires authentication to read queue items", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "approval_queue_items/item-1")));
    await assertFails(getDoc(doc(db, "approval_queue_activity/activity-1")));
  });

  it("allows assigned users and required approvers to read queue items and Activity", async () => {
    const db = authedDb("Editor");
    const approverDb = authedDb("Approver");

    await assertSucceeds(getDoc(doc(db, "approval_queue_items/item-1")));
    await assertSucceeds(getDoc(doc(db, "approval_queue_activity/activity-1")));
    await assertSucceeds(getDoc(doc(approverDb, "approval_queue_items/item-1")));
  });

  it("blocks non-Admins from reading unrelated queue items and Activity", async () => {
    const db = authedDb("Editor");

    await assertFails(getDoc(doc(db, "approval_queue_items/item-2")));
    await assertFails(getDoc(doc(db, "approval_queue_activity/activity-2")));
  });

  it("allows Admins to read every queue item and Activity entry", async () => {
    const db = authedDb("Admin");

    await assertSucceeds(getDoc(doc(db, "approval_queue_items/item-2")));
    await assertSucceeds(getDoc(doc(db, "approval_queue_activity/activity-2")));
  });

  it("blocks all direct client writes to queue items, even for Admins", async () => {
    const adminDb = authedDb("Admin");

    await assertFails(
      setDoc(doc(adminDb, "approval_queue_items/item-2"), {
        id: "item-2",
        process_run_ref: { id: "run-2", label: "Forged" },
        item_type: "ApprovalPackage",
        source_trigger_key: "run-2",
        status: "Approved",
        risk: "Low",
        audience_group: "Dan/Admin decisions",
        action_needed: "Forged approval.",
        direct_link: "/runs/run-2",
      }),
    );
    await assertFails(
      updateDoc(doc(adminDb, "approval_queue_items/item-1"), { status: "Approved" }),
    );
    await assertFails(deleteDoc(doc(adminDb, "approval_queue_items/item-1")));
  });

  it("keeps the Activity log append-only against direct client writes", async () => {
    const adminDb = authedDb("Admin");

    await assertFails(
      setDoc(doc(adminDb, "approval_queue_activity/activity-2"), {
        id: "activity-2",
        item_id: "item-1",
        actor_uid: "admin-uid",
        action: "approved",
        source_trigger: "ApprovalPackage",
      }),
    );
    await assertFails(
      updateDoc(doc(adminDb, "approval_queue_activity/activity-1"), {
        reason: "Tampered.",
      }),
    );
    await assertFails(deleteDoc(doc(adminDb, "approval_queue_activity/activity-1")));
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
