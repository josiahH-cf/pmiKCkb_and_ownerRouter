import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  getRenewalWorkspace,
  listRenewalWorkspaceActivity,
  listRenewalWorkspaces,
  renewalWorkspaceDocId,
  saveRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import { manualRenewalSummary } from "@/lib/lease-renewal/workspace-state";

// S123 (F02, AC-S123-3/5/6): reads never create a cycle; an explicit start records exactly one
// incomplete cycle under the stable lease identity; a later cycle preserves the previous one as
// history; concurrent and replayed saves resolve by revision and operation id without losing or
// duplicating work. Values are synthetic and the store is the local emulator.

const projectId = "pmi-kc-kb-s123-cycle-store-test";
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
const OP = (n: number) =>
  `3a7c1d2e-5b4f-4c6d-8e9f-0000000000${String(n).padStart(2, "0")}`;
const recordedBasis = {
  kind: "lease_end" as const,
  dateIso: "2026-08-31",
  source: "RentVine lease end",
};
const advancedBasis = { ...recordedBasis, dateIso: "2027-08-31" };

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s123-cycle-store-${process.pid}`);
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

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as EditableLayerError;
  }
  throw new Error("Expected a refusal.");
}

describe("S123 cycle store", () => {
  it("AC-S123-3: reads create nothing; one explicit start records one incomplete cycle with unrecorded milestones missing", async () => {
    expect(await getRenewalWorkspace(editor, "4821", db)).toBeNull();
    expect((await listRenewalWorkspaces(editor, db)).size).toBe(0);
    expect(await listRenewalWorkspaceActivity(editor, "4821", db)).toEqual([]);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(0);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(0);

    const started = await startRenewalCycle(
      editor,
      {
        leaseId: "4821",
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(1),
        basis: advancedBasis,
        reason: "Work already done outside the app is being recorded.",
      },
      advancedBasis,
      db,
    );
    const state = started.state;
    if (!state) throw new Error("Expected a started cycle.");
    expect(state).toMatchObject({
      leaseId: "4821",
      cycleId: OP(1),
      basis: advancedBasis,
      revision: 0,
      completion: null,
      ownerResponse: null,
      tenantResponse: null,
      activities: {},
    });
    expect(manualRenewalSummary(state)).toMatchObject({
      complete: false,
      nextActivity: "owner_outreach",
      label: "Manual work in progress",
    });
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(1);

    // A replay of the same request is idempotent: no second cycle, no second event.
    const replay = await startRenewalCycle(
      editor,
      {
        leaseId: "4821",
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(1),
        basis: advancedBasis,
        reason: "Work already done outside the app is being recorded.",
      },
      advancedBasis,
      db,
    );
    expect(replay.state?.cycleId).toBe(OP(1));
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(1);

    // A stale start that did not see the recorded cycle is refused, never merged.
    const stale = await rejection(
      startRenewalCycle(
        secondEditor,
        {
          leaseId: "4821",
          expectedCycleId: null,
          expectedRevision: 0,
          operationId: OP(2),
          basis: advancedBasis,
          reason: "A second operator did not reload.",
        },
        advancedBasis,
        db,
      ),
    );
    expect(stale.status).toBe(409);
    expect(stale.message).toMatch(/current cycle changed/i);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.cycles)).toBe(1);

    // A start whose reviewed basis drifted from the freshly resolved source basis is refused.
    const drifted = await rejection(
      startRenewalCycle(
        editor,
        {
          leaseId: "4821",
          expectedCycleId: OP(1),
          expectedRevision: 0,
          operationId: OP(3),
          basis: recordedBasis,
          reason: "The page showed an older lease end.",
        },
        advancedBasis,
        db,
      ),
    );
    expect(drifted.status).toBe(409);
    expect(drifted.message).toMatch(/cycle context changed/i);
  });

  it("AC-S123-5: a later cycle keeps the previous cycle and its facts as history under the same lease", async () => {
    await startRenewalCycle(
      editor,
      {
        leaseId: "4821",
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(10),
        basis: recordedBasis,
        reason: "First cycle.",
      },
      recordedBasis,
      db,
    );
    const accepted = await saveRenewalWorkspace(
      editor,
      {
        leaseId: "4821",
        cycleId: OP(10),
        expectedRevision: 0,
        operationId: OP(11),
        action: { kind: "tenant_response", outcome: "accepted", source: "Tenant email" },
      },
      db,
    );
    expect(accepted.duplicate).toBe(false);
    expect(accepted.state?.tenantResponse?.outcome).toBe("accepted");

    const next = await startRenewalCycle(
      secondEditor,
      {
        leaseId: "4821",
        expectedCycleId: OP(10),
        expectedRevision: 1,
        operationId: OP(12),
        basis: advancedBasis,
        reason: "Staff explicitly started the next reviewed renewal cycle",
      },
      advancedBasis,
      db,
    );
    expect(next.state).toMatchObject({
      cycleId: OP(12),
      basis: advancedBasis,
      tenantResponse: null,
      completion: null,
      activities: {},
    });
    const previous = await db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles)
      .doc(OP(10))
      .get();
    expect(previous.exists).toBe(true);
    expect(previous.get("basis")).toEqual(recordedBasis);
    const head = await db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
      .doc(renewalWorkspaceDocId("4821"))
      .get();
    expect(head.get("cycleId")).toBe(OP(12));
    const events = await listRenewalWorkspaceActivity(editor, "4821", db);
    const startEvent = events.find((entry) => entry.id === OP(12)) as Record<
      string,
      unknown
    >;
    expect(startEvent.previous_cycle_id).toBe(OP(10));
    expect(new Set(events.map((entry) => entry.id))).toEqual(
      new Set([OP(10), OP(11), OP(12)]),
    );
    // Only the exact new cycle accepts records; the previous cycle id is refused.
    const old = await rejection(
      saveRenewalWorkspace(
        editor,
        {
          leaseId: "4821",
          cycleId: OP(10),
          expectedRevision: 1,
          operationId: OP(13),
          action: { kind: "tenant_response", outcome: "accepted", source: "Old tab" },
        },
        db,
      ),
    );
    expect(old.status).toBe(409);
    expect(next.state && manualRenewalSummary(next.state).nextActivity).toBe(
      "owner_outreach",
    );
  });

  it("AC-S123-6: racing saves yield one recoverable conflict; a lost response is resolved by replay without a duplicate milestone", async () => {
    await startRenewalCycle(
      editor,
      {
        leaseId: "4821",
        expectedCycleId: null,
        expectedRevision: 0,
        operationId: OP(20),
        basis: recordedBasis,
        reason: "Cycle for the race.",
      },
      recordedBasis,
      db,
    );
    const save = (actor: AuthenticatedUser, operationId: string, source: string) =>
      saveRenewalWorkspace(
        actor,
        {
          leaseId: "4821",
          cycleId: OP(20),
          expectedRevision: 0,
          operationId,
          action: {
            kind: "activity",
            activity: "owner_outreach",
            outcome: "done",
            source,
          },
        },
        db,
      );
    const results = await Promise.allSettled([
      save(editor, OP(21), "Operator one"),
      save(secondEditor, OP(22), "Operator two"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const conflict = (rejected[0] as PromiseRejectedResult).reason as EditableLayerError;
    expect(conflict.status).toBe(409);
    expect(conflict.message).toMatch(/Reload and review the current record/);
    const current = await getRenewalWorkspace(editor, "4821", db);
    expect(current?.revision).toBe(1);
    expect(current?.activities.owner_outreach?.outcome).toBe("done");
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(2);

    // The winner's response was lost: replaying its exact request reads back the same state.
    const winnerId = current?.activities.owner_outreach?.eventId;
    const winner = winnerId === OP(21) ? editor : secondEditor;
    const replay = await save(
      winner,
      winnerId as string,
      winnerId === OP(21) ? "Operator one" : "Operator two",
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.state?.revision).toBe(1);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(2);
    // The recorded basis is untouched by every save.
    expect(replay.state?.basis).toEqual(recordedBasis);
  });
});
