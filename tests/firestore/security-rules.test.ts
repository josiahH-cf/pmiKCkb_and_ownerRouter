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
    projectId: "pmi-kc-kb-test",
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "spaces/lease-renewals"), {
      id: "lease-renewals",
      name: "Lease Renewals",
      read_only: false,
    });
    await setDoc(doc(db, "spaces/owner-email"), {
      id: "owner-email",
      name: "Owner Email",
      read_only: true,
    });
    await setDoc(doc(db, "sops/sop-1"), {
      id: "sop-1",
      body_md: "# SOP: Lease Renewals",
      owner_uid: "owner-uid",
      space_id: "lease-renewals",
      status: "Draft",
      title: "Lease Renewals",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore security rules", () => {
  it("requires authentication for editable reads", async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, "sops/sop-1")));
  });

  it("allows editors to create draft SOPs in writable Spaces", async () => {
    const db = authedDb("Editor");

    await assertSucceeds(
      setDoc(doc(db, "sops/sop-2"), {
        id: "sop-2",
        body_md: "# SOP: Move In",
        owner_uid: "owner-uid",
        space_id: "lease-renewals",
        status: "Draft",
        title: "Move In",
      }),
    );
  });

  it("blocks editors from approving SOPs", async () => {
    const db = authedDb("Editor");

    await assertFails(
      updateDoc(doc(db, "sops/sop-1"), {
        last_reviewed_at: "2026-05-27T00:00:00.000Z",
        status: "Approved",
      }),
    );
  });

  it("allows approvers to approve SOPs", async () => {
    const db = authedDb("Approver");

    await assertSucceeds(
      updateDoc(doc(db, "sops/sop-1"), {
        last_reviewed_at: "2026-05-27T00:00:00.000Z",
        status: "Approved",
      }),
    );
  });

  it("blocks writes to read-only Spaces", async () => {
    const db = authedDb("Admin");

    await assertFails(
      setDoc(doc(db, "sops/sop-owner-email"), {
        id: "sop-owner-email",
        body_md: "# SOP: Owner Email",
        owner_uid: "owner-uid",
        space_id: "owner-email",
        status: "Draft",
        title: "Owner Email",
      }),
    );
  });

  it("allows only admins to soft delete and never allows hard delete", async () => {
    const editorDb = authedDb("Editor");
    const adminDb = authedDb("Admin");

    await assertFails(
      updateDoc(doc(editorDb, "sops/sop-1"), {
        deleted_at: "2026-05-27T00:00:00.000Z",
        status: "Deprecated",
      }),
    );
    await assertSucceeds(
      updateDoc(doc(adminDb, "sops/sop-1"), {
        deleted_at: "2026-05-27T00:00:00.000Z",
        status: "Deprecated",
      }),
    );
    await assertFails(deleteDoc(doc(adminDb, "sops/sop-1")));
  });

  it("blocks direct client writes to Ask logs", async () => {
    const db = authedDb("Editor");

    await assertFails(
      setDoc(doc(db, "ask_logs/log-1"), {
        answer: "Forged answer.",
        audience: "Owner",
        channel: "Gmail",
        citations: [],
        draft: "",
        grounding_source_ids: [],
        id: "log-1",
        question: "Can a client write Ask logs?",
        source_state: "Verified Source",
        urgency: "Normal",
        user_uid: "editor-uid",
      }),
    );
  });
});

function authedDb(role: "Editor" | "Approver" | "Admin") {
  return testEnv.authenticatedContext(`${role.toLowerCase()}-uid`, { role }).firestore();
}
