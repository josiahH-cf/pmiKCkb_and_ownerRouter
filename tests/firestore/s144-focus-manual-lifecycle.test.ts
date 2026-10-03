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
  saveRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import {
  projectRenewalActions,
  type RenewalActionProjection,
} from "@/lib/lease-renewal/renewal-actions";
import type {
  RenewalWorkspaceAction,
  RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { AFTER_ACCEPTANCE, actionFixture } from "../helpers/renewal-action-fixtures";

// S144/S145 (ARCH-S144-2, BEH-S144-2, AC-S144-2/3, AC-S145-2): the Focus path through the real
// staff-record store. Each step is saved with the same operation contract the Focus pane's control
// uses, the record is read back, and the S142 projection is recomputed from that readback only.
// Stale, replayed and wrong-cycle saves keep the record and the projection unchanged; a new cycle
// keeps the earlier one as history. Values are synthetic and the store is the local emulator.

const projectId = "pmi-kc-kb-s144-focus-lifecycle-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "318";
const OP = (n: number) =>
  `5c8e2a1b-7d3f-4e6a-9b0c-0000000001${String(n).padStart(2, "0")}`;
const basis = {
  kind: "lease_end" as const,
  dateIso: "2026-12-31",
  source: "RentVine lease end",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;
let operation = 0;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s144-focus-lifecycle-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  operation = 0;
  await testEnv.clearFirestore();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

const snapshot = actionFixture({ manual: null }).snapshot;

/** The projection the Focus pane derives from the read-back record. */
function project(state: RenewalWorkspaceState | null): RenewalActionProjection {
  return projectRenewalActions(
    { ...snapshot, leaseId: LEASE },
    { readable: true, state },
  );
}

async function readBack() {
  return getRenewalWorkspace(editor, LEASE, db);
}

async function start(expected: RenewalWorkspaceState | null) {
  operation += 1;
  const started = await startRenewalCycle(
    editor,
    {
      leaseId: LEASE,
      expectedCycleId: expected?.cycleId ?? null,
      expectedRevision: expected?.revision ?? 0,
      operationId: OP(operation),
      basis,
      reason: "Staff selected the reviewed current renewal cycle",
    },
    basis,
    db,
  );
  return started.state!;
}

/** S154: with no record yet, the first save establishes it from the lease's real basis. */
async function record(
  state: RenewalWorkspaceState | null,
  action: RenewalWorkspaceAction,
) {
  operation += 1;
  const saved = await saveRenewalWorkspace(
    editor,
    {
      leaseId: LEASE,
      cycleId: state?.cycleId ?? null,
      expectedRevision: state?.revision ?? 0,
      operationId: OP(operation),
      action,
    },
    db,
    async () => basis,
  );
  expect(saved.duplicate).toBe(false);
  return (await readBack())!;
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as EditableLayerError;
  }
  throw new Error("Expected a refusal.");
}

describe("S144 Focus path through the staff-record store", () => {
  it("advances one confirmed, read-back record at a time to staff completion and back", async () => {
    // S154 (BEH-S154-3): with nothing recorded there is no cycle action; the staff lane's first
    // activity is ready and the first save establishes the work record.
    const untouched = project(await readBack());
    expect(untouched.actions.find((a) => a.id === "manual.cycle")).toBeUndefined();
    expect(untouched.actions.find((a) => a.id === "manual.owner_outreach")?.status).toBe(
      "ready_for_actor",
    );
    expect(await readBack()).toBeNull();

    let state = await record(null, {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Owner phone call",
    });
    expect(state.basis).toEqual(basis);
    expect(state.revision).toBe(1);
    let projection = project(state);
    expect(projection.headlineActionId).toBe("manual.owner_response");
    expect(projection.actions.find((a) => a.id === "manual.owner_response")?.status).toBe(
      "waiting",
    );

    state = await record(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1450, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      source: "Owner email",
    });
    expect(project(state).primaryActionId).toBe("manual.tenant_offer");

    state = await record(state, {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "done",
      source: "Offer email",
    });
    state = await record(state, {
      kind: "tenant_response",
      outcome: "accepted",
      source: "Tenant email",
    });
    projection = project(state);
    // S156 (BEH-S156-2/7): every remaining activity is available at once, and the completion
    // record is never held behind the checklist; the list remains guidance.
    expect(
      new Set(
        projection.actions
          .filter((a) => a.id.startsWith("manual.") && a.status === "ready_for_actor")
          .map((a) => a.id),
      ),
    ).toEqual(
      new Set([
        ...AFTER_ACCEPTANCE.map((activity) => `manual.${activity}`),
        "manual.preparation",
        "manual.complete",
      ]),
    );

    for (const activity of AFTER_ACCEPTANCE) {
      const before = project(state);
      state = await record(state, {
        kind: "activity",
        activity,
        outcome: "done",
        source: `Staff record for ${activity}`,
      });
      const after = project(state);
      // Only the recorded activity (and, at the end, completion readiness) changes.
      const changed = before.actions
        .filter((a) => after.actions.find((b) => b.id === a.id)?.status !== a.status)
        .map((a) => a.id);
      expect(changed.filter((id) => id !== "manual.complete")).toEqual([
        `manual.${activity}`,
      ]);
    }
    projection = project(state);
    expect(projection.primaryActionId).toBe("manual.complete");
    expect(projection.outcome.state).toBe("in_progress");

    state = await record(state, {
      kind: "complete",
      source: "Staff reviewed the current cycle checklist",
    });
    projection = project(state);
    expect(projection.outcome).toEqual({
      state: "complete_recorded_by_staff",
      label: "Completed: recorded by staff",
    });
    expect(projection.primaryActionId).toBeNull();

    state = await record(state, { kind: "reopen", source: "Staff reopened completion" });
    expect(project(state).primaryActionId).toBe("manual.complete");
  });

  it("refuses a stale revision, replays a duplicate once and refuses a wrong cycle", async () => {
    const state = await record(null, {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Owner phone call",
    });
    const establishingOperation = OP(operation);
    const before = project(state);
    const activityCount = (
      await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).get()
    ).size;

    // Another tab still holds revision 0.
    const stale = await refusal(
      saveRenewalWorkspace(
        editor,
        {
          leaseId: LEASE,
          cycleId: state.cycleId,
          expectedRevision: 0,
          operationId: OP(90),
          action: {
            kind: "activity",
            activity: "tenant_offer",
            outcome: "done",
            source: "Old tab",
          },
        },
        db,
      ),
    );
    expect(stale.status).toBe(409);
    expect(project(await readBack())).toEqual(before);

    // The exact same request replayed after a lost response is answered once, not applied twice:
    // the establishing save still names no cycle, and the replay returns the established record.
    const replay = await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: null,
        expectedRevision: 0,
        operationId: establishingOperation,
        action: {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Owner phone call",
        },
      },
      db,
      async () => basis,
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.state?.cycleId).toBe(state.cycleId);
    expect((await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.activity).get()).size).toBe(
      activityCount,
    );
    expect(project(await readBack())).toEqual(before);

    const wrongCycle = await refusal(
      saveRenewalWorkspace(
        editor,
        {
          leaseId: LEASE,
          cycleId: OP(91),
          expectedRevision: state.revision,
          operationId: OP(92),
          action: {
            kind: "activity",
            activity: "tenant_offer",
            outcome: "done",
            source: "Wrong cycle",
          },
        },
        db,
      ),
    );
    expect(wrongCycle.status).toBe(409);
    expect(project(await readBack())).toEqual(before);
  });

  it("starts a new cycle without reviving the earlier one", async () => {
    const first = await record(null, {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Owner phone call",
    });
    // The retained explicit cycle start keeps the earlier record as history.
    const second = await start(first);
    expect(second.cycleId).not.toBe(first.cycleId);
    const projection = project(second);
    expect(projection.cycleId).toBe(second.cycleId);
    expect(projection.primaryActionId).toBe("manual.owner_outreach");
    expect(new Set(projection.actions.map((a) => a.ref.cycleId))).toEqual(
      new Set([second.cycleId]),
    );
    const history = await db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.cycles)
      .doc(first.cycleId)
      .get();
    expect(history.get("activities.owner_outreach.outcome")).toBe("done");
  });
});
