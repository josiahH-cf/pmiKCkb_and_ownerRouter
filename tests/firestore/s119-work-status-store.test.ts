import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RENEWAL_WORK_STATUS_COLLECTIONS,
  getRenewalWorkStatus,
  listRenewalWorkStatusActivity,
  listRenewalWorkStatuses,
  saveRenewalWorkStatus,
} from "@/lib/firestore/renewal-work-status";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  getRenewalWorkspace,
  renewalWorkspaceDocId,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import { projectRenewalWorkStatus } from "@/lib/lease-renewal/work-status";
import { manualRenewalSummary } from "@/lib/lease-renewal/workspace-state";

// S119: the staff work status is a versioned, audited, Editor-gated app-owned annotation. It
// associates the current cycle when one exists, never creates one, never completes one, and
// resolves stale, duplicate and repeated requests without losing history. Values are synthetic.

const projectId = "pmi-kc-kb-s119-work-status-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const secondEditor: AuthenticatedUser = {
  uid: "editor-2",
  email: "editor2@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const canary: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const OP = (n: number) => `0f1c8f6e-6d1c-4bd3-9d7a-00000000000${n}`;
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s119-work-status-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function countDocs(collection: string) {
  return (await db.collection(collection).get()).size;
}

describe("S119 staff work status store", () => {
  it("AC-S119-1/AC-S119-4: saves one attributed status per lease with append-only history and without manufacturing a cycle", async () => {
    const first = await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "701",
        status: "verifying_lease_and_rent",
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    expect(first.duplicate).toBe(false);
    expect(first.record).toMatchObject({
      schemaVersion: "renewal-work-status/v1",
      leaseId: "701",
      revision: 1,
      status: "verifying_lease_and_rent",
      recordedByUid: editor.uid,
      recordedByLabel: editor.email,
      cycleId: null,
      eventId: OP(1),
    });
    expect(Date.parse(first.record.recordedAt)).not.toBeNaN();
    expect(first.history).toHaveLength(1);
    expect(first.history[0]).toMatchObject({
      revision: 1,
      previousStatus: null,
      status: "verifying_lease_and_rent",
      recordedByUid: editor.uid,
      recordedByLabel: editor.email,
      cycleId: null,
    });
    // No renewal cycle or workspace was created to hold the annotation.
    expect(
      (
        await db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
          .doc(renewalWorkspaceDocId("701"))
          .get()
      ).exists,
    ).toBe(false);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(0);

    expect(await getRenewalWorkStatus(editor, "701", db)).toEqual(first.record);
    expect(await getRenewalWorkStatus(editor, "702", db)).toBeNull();
    const listed = await listRenewalWorkStatuses(editor, db);
    expect([...listed.keys()]).toEqual(["701"]);
    expect(listed.get("701")).toEqual(first.record);

    const second = await saveRenewalWorkStatus(
      secondEditor,
      {
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 1,
        operationId: OP(2),
      },
      db,
    );
    expect(second.record).toMatchObject({
      revision: 2,
      status: "waiting_on_owner_response",
      recordedByUid: secondEditor.uid,
      recordedByLabel: secondEditor.email,
      eventId: OP(2),
    });
    const history = await listRenewalWorkStatusActivity(editor, "701", db);
    expect(
      history.map((entry) => [entry.revision, entry.previousStatus, entry.status]),
    ).toEqual([
      [1, null, "verifying_lease_and_rent"],
      [2, "verifying_lease_and_rent", "waiting_on_owner_response"],
    ]);
    expect(history[0].recordedByLabel).toBe(editor.email);
    expect(history[1].recordedByLabel).toBe(secondEditor.email);
  });

  it("AC-S119-4: a stale expected revision is refused with the current value intact and no history entry", async () => {
    await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "701",
        status: "verifying_lease_and_rent",
        expectedRevision: 0,
        operationId: OP(1),
      },
      db,
    );
    await saveRenewalWorkStatus(
      secondEditor,
      {
        leaseId: "701",
        status: "waiting_on_owner_response",
        expectedRevision: 1,
        operationId: OP(2),
      },
      db,
    );
    await expect(
      saveRenewalWorkStatus(
        editor,
        {
          leaseId: "701",
          status: "preparing_tenant_offer",
          expectedRevision: 1,
          operationId: OP(3),
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/Another operator/),
    });
    expect(await getRenewalWorkStatus(editor, "701", db)).toMatchObject({
      revision: 2,
      status: "waiting_on_owner_response",
      recordedByUid: secondEditor.uid,
    });
    expect(await listRenewalWorkStatusActivity(editor, "701", db)).toHaveLength(2);
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.activity)).toBe(2);
  });

  it("AC-S119-4: a repeated operation resolves as a duplicate without a second history entry; a changed payload under the same id is refused", async () => {
    const input = {
      leaseId: "701",
      status: "waiting_on_owner_response" as const,
      expectedRevision: 0,
      operationId: OP(1),
    };
    const first = await saveRenewalWorkStatus(editor, input, db);
    const again = await saveRenewalWorkStatus(editor, input, db);
    expect(again.duplicate).toBe(true);
    expect(again.record).toEqual(first.record);
    expect(again.history).toHaveLength(1);
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.activity)).toBe(1);
    await expect(
      saveRenewalWorkStatus(editor, { ...input, status: "preparing_tenant_offer" }, db),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/changed/) });
    await expect(saveRenewalWorkStatus(secondEditor, input, db)).rejects.toMatchObject({
      status: 409,
    });
    expect(await getRenewalWorkStatus(editor, "701", db)).toEqual(first.record);
  });

  it("AC-S119-4: refuses a verification identity, a malformed lease id and a forged actor field without writing", async () => {
    await expect(
      saveRenewalWorkStatus(
        canary,
        {
          leaseId: "701",
          status: "verifying_lease_and_rent",
          expectedRevision: 0,
          operationId: OP(2),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      saveRenewalWorkStatus(
        editor,
        {
          leaseId: "lease-701",
          status: "verifying_lease_and_rent",
          expectedRevision: 0,
          operationId: OP(3),
        },
        db,
      ),
    ).rejects.toThrow();
    await expect(
      saveRenewalWorkStatus(
        editor,
        {
          leaseId: "701",
          status: "verifying_lease_and_rent",
          expectedRevision: 0,
          operationId: OP(4),
          recordedByUid: "forged",
        } as unknown as Parameters<typeof saveRenewalWorkStatus>[1],
        db,
      ),
    ).rejects.toThrow();
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.head)).toBe(0);
    expect(await countDocs(RENEWAL_WORK_STATUS_COLLECTIONS.activity)).toBe(0);
    expect(await getRenewalWorkStatus(editor, "701", db)).toBeNull();
  });

  it("AC-S119-2: associates the current cycle, keeps attribution across rollover and never completes or alters the workspace", async () => {
    const started = await startRenewalCycle(
      editor,
      {
        leaseId: "702",
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(5),
        basis,
        reason: "Cycle for the S119 emulator case.",
      },
      basis,
      db,
    );
    const firstCycle = started.state!.cycleId;
    const saved = await saveRenewalWorkStatus(
      editor,
      {
        leaseId: "702",
        status: "complete_staff_status",
        expectedRevision: 0,
        operationId: OP(6),
      },
      db,
    );
    expect(saved.record.cycleId).toBe(firstCycle);
    expect(saved.history[0].cycleId).toBe(firstCycle);
    expect(
      projectRenewalWorkStatus({ available: true, record: saved.record }, firstCycle),
    ).toMatchObject({ state: "recorded", cycleRelation: "current" });

    // The workspace is untouched: no completion, no revision, no activity, obligations unchanged.
    const workspace = await getRenewalWorkspace(editor, "702", db);
    expect(workspace).toMatchObject({
      cycleId: firstCycle,
      revision: 0,
      completion: null,
    });
    expect(manualRenewalSummary(workspace).complete).toBe(false);
    expect(manualRenewalSummary(workspace).nextActivity).toBe("owner_outreach");
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(1);

    const rolled = await startRenewalCycle(
      secondEditor,
      {
        leaseId: "702",
        expectedCycleId: firstCycle,
        expectedRevision: 0,
        operationId: OP(7),
        basis,
        reason: "A second cycle after the first was abandoned.",
      },
      basis,
      db,
    );
    const secondCycle = rolled.state!.cycleId;
    expect(secondCycle).not.toBe(firstCycle);
    const retained = await getRenewalWorkStatus(editor, "702", db);
    expect(retained).toEqual(saved.record);
    expect(
      projectRenewalWorkStatus({ available: true, record: retained }, secondCycle),
    ).toMatchObject({
      state: "recorded",
      cycleRelation: "previous",
      cycleId: firstCycle,
    });
    const next = await saveRenewalWorkStatus(
      secondEditor,
      {
        leaseId: "702",
        status: "verifying_lease_and_rent",
        expectedRevision: 1,
        operationId: OP(8),
      },
      db,
    );
    expect(next.record.cycleId).toBe(secondCycle);
    expect(
      projectRenewalWorkStatus({ available: true, record: next.record }, secondCycle),
    ).toMatchObject({ cycleRelation: "current" });
    const history = await listRenewalWorkStatusActivity(editor, "702", db);
    expect(history.map((entry) => entry.cycleId)).toEqual([firstCycle, secondCycle]);
  });
});
