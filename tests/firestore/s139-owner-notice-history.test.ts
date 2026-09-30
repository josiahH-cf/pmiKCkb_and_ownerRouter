import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { listCreatedOwnerNoticeDrafts } from "@/lib/firestore/owner-notice-draft-history";
import { MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY } from "@/lib/maintenance/execution/owner-notice-draft-request";

// S139: the earlier-draft disclosure reads only succeeded owner-notice executions for this ticket
// from the shared ledger, limited to the actor's own unless the actor is an Admin. Read-only.

const projectId = "pmi-kc-kb-s139-owner-notice-history-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const admin: AuthenticatedUser = { ...editor, uid: "admin-1", role: "Admin" };

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s139-owner-notice-history-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

async function execution(id: string, fields: Record<string, unknown>) {
  await db
    .collection("action_executions")
    .doc(id)
    .set({
      action_key: MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY,
      scope_ref: "external-workflow:live:ticket-9",
      state: "Succeeded",
      actor_uid: editor.uid,
      ...fields,
    });
}

describe("S139 owner-notice draft history", () => {
  it("lists only succeeded drafts for this ticket, scoped to the actor unless Admin", async () => {
    await execution("own-succeeded", {});
    await execution("other-actor", { actor_uid: "editor-2" });
    await execution("own-pending", { state: "Pending" });
    await execution("other-ticket", { scope_ref: "external-workflow:live:ticket-10" });
    await execution("other-action", { action_key: "gmail.resident_reply.draft_create" });

    expect(await listCreatedOwnerNoticeDrafts(editor, "ticket-9", db)).toEqual([
      "own-succeeded",
    ]);
    expect((await listCreatedOwnerNoticeDrafts(admin, "ticket-9", db)).sort()).toEqual([
      "other-actor",
      "own-succeeded",
    ]);
    expect(await listCreatedOwnerNoticeDrafts(editor, "ticket-11", db)).toEqual([]);
  });
});
