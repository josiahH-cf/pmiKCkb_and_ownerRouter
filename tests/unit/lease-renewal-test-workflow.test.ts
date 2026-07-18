import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  LEASE_TEST_RUN_COLLECTIONS,
  createCanonicalLeaseTestRun,
  listLeaseTestBusinessEvents,
  listLeaseTestActionAttempts,
  listLeaseTestActionReceipts,
  simulateLeaseTestAction,
  recordLeaseTestBusinessEvent,
  transitionLeaseTestRun,
} from "@/lib/firestore/lease-renewal-test-runs";
import { LEASE_EXECUTION_ACTIONS } from "@/lib/lease-renewal/execution/matrix";
import {
  LEASE_TEST_ACTIONS,
  LEASE_TEST_ALIASES,
  LEASE_TEST_CONFIRMATION,
  LEASE_TEST_BUSINESS_CONFIRMATION,
  buildLeaseTestActionEvidence,
  leaseTestActionDependencies,
} from "@/lib/lease-renewal/test-workflow";

function fakeDb() {
  const store = new Map<string, Map<string, Record<string, unknown>>>();
  const collection = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  function docRef(name: string, id: string) {
    const records = collection(name);
    return {
      id,
      _name: name,
      async get() {
        const data = records.get(id);
        return { exists: records.has(id), id, data: () => data };
      },
      async set(data: Record<string, unknown>) {
        records.set(id, data);
      },
    };
  }
  const db = {
    collection(name: string) {
      return {
        doc: (id: string) => docRef(name, id),
        async get() {
          return {
            docs: [...collection(name).entries()].map(([id, data]) => ({
              id,
              data: () => data,
            })),
          };
        },
      };
    },
    async runTransaction<T>(callback: (transaction: unknown) => Promise<T>) {
      return callback({
        get: (ref: { get(): Promise<unknown> }) => ref.get(),
        set: (ref: { _name: string; id: string }, data: Record<string, unknown>) => {
          collection(ref._name).set(ref.id, data);
        },
      });
    },
  };
  return { db: db as unknown as Firestore, store };
}

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

async function moveToExecuting(runId: string, db: Firestore) {
  await recordBusiness(runId, "candidate_included", db);
  await transitionLeaseTestRun(editor, runId, { nextStatus: "Reviewed" }, db);
  await recordBusiness(runId, "owner_renewal_approved", db);
  await transitionLeaseTestRun(editor, runId, { nextStatus: "Approved" }, db);
  await recordBusiness(runId, "tenant_offer_scheduled", db);
  await recordBusiness(runId, "conditional_facts_confirmed", db);
  await transitionLeaseTestRun(editor, runId, { nextStatus: "Executing" }, db);
}

async function recordBusiness(
  runId: string,
  action: Parameters<typeof recordLeaseTestBusinessEvent>[2]["action"],
  db: Firestore,
) {
  return recordLeaseTestBusinessEvent(
    editor,
    runId,
    { action, confirmation: LEASE_TEST_BUSINESS_CONFIRMATION },
    db,
  );
}

async function runActions(
  runId: string,
  actionKeys: readonly (typeof LEASE_TEST_ACTIONS)[number][],
  db: Firestore,
) {
  for (const actionKey of actionKeys) {
    await simulateLeaseTestAction(
      editor,
      runId,
      { actionKey, confirmation: LEASE_TEST_CONFIRMATION },
      db,
    );
  }
}

describe("persistent Lease production Test workflow", () => {
  it("reuses all eleven Lease action definitions and reserved non-customer aliases", () => {
    expect(LEASE_TEST_ACTIONS).toEqual(LEASE_EXECUTION_ACTIONS);
    expect(LEASE_TEST_ACTIONS).toHaveLength(11);
    expect(LEASE_TEST_ALIASES.propertyLabel).toMatch(/^TEST/);
    expect(LEASE_TEST_ALIASES.residentEmail).toMatch(/@example\.invalid$/);
    expect(leaseTestActionDependencies("gmail.renewal_notice.send")).toEqual([
      "gmail.renewal_notice.draft_create",
    ]);
  });

  it("builds bodyless attempt/receipt evidence that is structurally ineligible for Live proof", () => {
    const evidence = buildLeaseTestActionEvidence({
      receiptId: "receipt-1",
      attemptId: "attempt-1",
      runId: "run-1",
      actionKey: "gmail.renewal_notice.draft_create",
      actorUid: "editor-1",
      createdAt: "2026-07-15T12:00:00.000Z",
    });
    expect(evidence).toMatchObject({
      receipt: {
        data_mode: "test",
        outcome: "simulated_success",
        provider_contacted: false,
        live_proof_eligible: false,
        attempt_count: 1,
      },
      attempt: {
        data_mode: "test",
        state: "succeeded",
        provider_contacted: false,
        attempt_number: 1,
      },
    });
    expect(evidence.receipt).not.toHaveProperty("provider_ref");
    expect(evidence.receipt).not.toHaveProperty("body");
    expect(evidence.attempt).not.toHaveProperty("body");
  });

  it("keeps both Test modules disconnected from every Live provider constructor", () => {
    for (const path of [
      "lib/lease-renewal/test-workflow.ts",
      "lib/firestore/lease-renewal-test-runs.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source).not.toMatch(
        /from\s+["']@\/lib\/(?:gmail|rentvine|google|drive|external-execution|lease-renewal\/execution\/providers)/,
      );
      expect(source).not.toContain("fetch(");
      expect(source).not.toContain("providerRef");
    }
  });

  it("persists a full ordered journey through Done with one idempotent attempt and receipt per action", async () => {
    const { db, store } = fakeDb();
    const run = await createCanonicalLeaseTestRun(editor, {}, db);
    expect(run).toMatchObject({
      data_mode: "test",
      status: "Created",
      labels: ["TEST DATA"],
      action_total: 11,
    });

    await moveToExecuting(run.id, db);
    await runActions(run.id, LEASE_TEST_ACTIONS.slice(0, 6), db);
    await recordBusiness(run.id, "tenant_accepts", db);
    await runActions(run.id, LEASE_TEST_ACTIONS.slice(6, 9), db);
    await recordBusiness(run.id, "signatures_complete", db);
    await runActions(run.id, LEASE_TEST_ACTIONS.slice(9), db);
    await recordBusiness(run.id, "business_test_closeout", db);

    const receipts = await listLeaseTestActionReceipts(editor, run.id, db);
    const attempts = await listLeaseTestActionAttempts(editor, run.id, db);
    expect(receipts.map((receipt) => receipt.action_key)).toEqual(LEASE_TEST_ACTIONS);
    expect(attempts.map((attempt) => attempt.action_key)).toEqual(LEASE_TEST_ACTIONS);

    const duplicate = await simulateLeaseTestAction(
      editor,
      run.id,
      {
        actionKey: LEASE_TEST_ACTIONS[0],
        confirmation: LEASE_TEST_CONFIRMATION,
      },
      db,
    );
    expect(duplicate.receipt).toEqual(receipts[0]);
    expect(store.get(LEASE_TEST_RUN_COLLECTIONS.receipts)?.size).toBe(11);
    expect(store.get(LEASE_TEST_RUN_COLLECTIONS.attempts)?.size).toBe(11);
    expect([...store.keys()].sort()).toEqual(
      Object.values(LEASE_TEST_RUN_COLLECTIONS).sort(),
    );

    const done = await transitionLeaseTestRun(editor, run.id, { nextStatus: "Done" }, db);
    expect(done.status).toBe("Done");
    expect(done.completed_at).toBeTruthy();
  });

  it("requires lifecycle order, dependencies, and all receipts before Done", async () => {
    const { db } = fakeDb();
    const run = await createCanonicalLeaseTestRun(editor, {}, db);

    await expect(
      transitionLeaseTestRun(editor, run.id, { nextStatus: "Reviewed" }, db),
    ).rejects.toThrow(/candidate disposition/i);

    await expect(
      simulateLeaseTestAction(
        editor,
        run.id,
        {
          actionKey: LEASE_TEST_ACTIONS[0],
          confirmation: LEASE_TEST_CONFIRMATION,
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });

    await moveToExecuting(run.id, db);
    await expect(
      simulateLeaseTestAction(
        editor,
        run.id,
        {
          actionKey: "gmail.renewal_notice.send",
          confirmation: LEASE_TEST_CONFIRMATION,
        },
        db,
      ),
    ).rejects.toThrow(/Complete required Test action/);
    await expect(
      transitionLeaseTestRun(editor, run.id, { nextStatus: "Done" }, db),
    ).rejects.toThrow(/Complete all 11 Test actions/);
  });

  it("persists an idempotent bodyless business history and closes the renewal on Move-Out", async () => {
    const { db, store } = fakeDb();
    const run = await createCanonicalLeaseTestRun(editor, {}, db);
    await moveToExecuting(run.id, db);
    await runActions(
      run.id,
      [
        "gmail.renewal_notice.draft_create",
        "gmail.renewal_notice.send",
        "rentvine.renewal.portal_message.send",
        "sms.renewal_message.send",
      ],
      db,
    );

    const moved = await recordBusiness(run.id, "tenant_moves_out", db);
    expect(moved).toMatchObject({
      duplicate: false,
      event: {
        data_mode: "test",
        outcome: "move_out_handoff_started",
        provider_contacted: false,
        live_proof_eligible: false,
      },
      run: {
        business_test_status: "moved_to_move_out",
        status: "Moved to Move-Out",
        tenant_response: "move_out",
        move_out_handoff: {
          state: "started",
          direct_link: "/spaces/move-out-deposit-disposition",
        },
      },
    });
    await expect(recordBusiness(run.id, "tenant_moves_out", db)).resolves.toMatchObject({
      duplicate: true,
    });
    await expect(recordBusiness(run.id, "tenant_accepts", db)).rejects.toThrow(
      /does not match this milestone/i,
    );
    await expect(
      simulateLeaseTestAction(
        editor,
        run.id,
        {
          actionKey: "google_sheets.renewal_checklist.writeback",
          confirmation: LEASE_TEST_CONFIRMATION,
        },
        db,
      ),
    ).rejects.toThrow(/Moved to Move-Out|remaining renewal actions/i);

    const events = await listLeaseTestBusinessEvents(editor, run.id, db);
    expect(events.map((event) => event.action)).toEqual([
      "candidate_included",
      "owner_renewal_approved",
      "tenant_offer_scheduled",
      "conditional_facts_confirmed",
      "tenant_moves_out",
    ]);
    expect(JSON.stringify(events)).not.toContain("message_body");
    expect(
      [...store.keys()].some((name) => /rentvine|gmail|dotloop|boom/i.test(name)),
    ).toBe(false);
  });

  it("rejects a non-Test run before any attempt or receipt is written", async () => {
    const { db, store } = fakeDb();
    store.set(
      LEASE_TEST_RUN_COLLECTIONS.runs,
      new Map([
        [
          "live-run",
          {
            id: "live-run",
            data_mode: "live",
            status: "Executing",
          },
        ],
      ]),
    );

    await expect(
      simulateLeaseTestAction(
        editor,
        "live-run",
        {
          actionKey: LEASE_TEST_ACTIONS[0],
          confirmation: LEASE_TEST_CONFIRMATION,
        },
        db,
      ),
    ).rejects.toThrow(/explicitly labeled Test run/);
    expect(store.get(LEASE_TEST_RUN_COLLECTIONS.receipts)?.size ?? 0).toBe(0);
    expect(store.get(LEASE_TEST_RUN_COLLECTIONS.attempts)?.size ?? 0).toBe(0);
  });
});
