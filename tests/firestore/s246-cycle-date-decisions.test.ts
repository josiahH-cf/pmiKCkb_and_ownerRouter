import { readFileSync } from "node:fs";

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
  CYCLE_DATE_CHANGED_MESSAGE,
  RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS,
  canRecordCycleDateChoice,
  getRenewalCycleDateDecision,
  listRenewalCycleDateDecisions,
  renewalCycleDateDecisionDocId,
} from "@/lib/firestore/renewal-cycle-date-decisions";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  ensureRenewalWorkRecord,
  getRenewalWorkspace,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import {
  confirmSourceRenewalCompletion,
  keepWorkingRecordedCycle,
} from "@/lib/lease-renewal/cycle-date-choice";
import { cycleDateDecisionIsCurrent } from "@/lib/lease-renewal/cycle-date-decision";
import {
  manualNonRenewal,
  manualRenewalSummary,
} from "@/lib/lease-renewal/workspace-state";

// S246 R-S246-5 / BEH-S246-2: a lease whose recorded cycle date is earlier than the lease end
// RentVine reports now offers two staff choices. "Keep working" is an app-owned decision bound to
// the exact work record and both dates; "Record staff completion" is the existing staff completion
// of that work record with the RentVine date as its evidence. Nothing completes by itself, a
// reading never writes, and a verification account records neither. Values are synthetic and the
// store is the local emulator; no source is read (the current lease end is injected).

const projectId = "pmi-kc-kb-s246-cycle-date-decisions-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const verification: AuthenticatedUser = {
  ...editor,
  uid: "verification-1",
  email: "canary-editor@pmikcmetro.com",
};
const LEASE = "4821";
const RECORDED = "2026-12-31";
const SOURCE = "2027-12-31";
const OP = (n: number) =>
  `5b8d2e3f-6c5a-4d7e-9f8a-0000000000${String(n).padStart(2, "0")}`;
const recordedBasis = {
  kind: "lease_end" as const,
  dateIso: RECORDED,
  source: "RentVine lease end",
};
const sourceReports = (iso: string | null) => async () => iso;

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s246-cycle-date-decisions-${process.pid}`);
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

/** The unfinished work record staff recorded against the December lease end. */
async function recordedCycle() {
  return ensureRenewalWorkRecord(editor, LEASE, db, async () => recordedBasis);
}

function choice(operation: number, overrides: Record<string, string> = {}) {
  return {
    leaseId: LEASE,
    recordedDateIso: RECORDED,
    sourceDateIso: SOURCE,
    operationId: OP(operation),
    ...overrides,
  };
}

/**
 * What the batch row showed for a confirmation: the two dates and the work record staff reviewed
 * (its cycle and revision), so a record another operator changed afterwards is refused.
 */
function confirmChoice(
  operation: number,
  reviewed: { readonly cycleId: string; readonly revision: number },
) {
  return {
    ...choice(operation),
    cycleId: reviewed.cycleId,
    expectedRevision: reviewed.revision,
  };
}
/** A syntactically valid work record identity that names no stored record. */
const NO_RECORD = { cycleId: OP(90), revision: 1 };

async function decisionWrites() {
  return {
    head: await countDocs(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head),
    activity: await countDocs(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.activity),
  };
}

describe("S246 keep working the recorded cycle (R-S246-5, BEH-S246-2)", () => {
  it("reading creates nothing, and keep working records one decision bound to the work record and both dates without changing that record", async () => {
    const record = await recordedCycle();
    expect(await getRenewalCycleDateDecision(editor, LEASE, db)).toBeNull();
    expect((await listRenewalCycleDateDecisions(editor, db)).size).toBe(0);
    expect(await decisionWrites()).toEqual({ head: 0, activity: 0 });
    const workActivityBefore = await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity);

    const kept = await keepWorkingRecordedCycle(editor, choice(1), {
      db,
      currentLeaseEndIso: sourceReports(SOURCE),
    });
    expect(kept.duplicate).toBe(false);
    expect(kept.decision).toMatchObject({
      leaseId: LEASE,
      cycleId: record.cycleId,
      recordedDateIso: RECORDED,
      sourceDateIso: SOURCE,
      decision: "keep_working",
      revision: 1,
      recordedByUid: editor.uid,
      eventId: OP(1),
    });
    expect(await decisionWrites()).toEqual({ head: 1, activity: 1 });
    const head = await db
      .collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head)
      .doc(renewalCycleDateDecisionDocId(LEASE))
      .get();
    expect(head.exists).toBe(true);

    // The work record is exactly as staff left it: nothing completed, advanced or reopened.
    const after = await getRenewalWorkspace(editor, LEASE, db);
    expect(after).toEqual(record);
    expect(after?.completion).toBeNull();
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(
      workActivityBefore,
    );

    // The desk's one bulk read returns it, and it answers exactly the question staff saw.
    const listed = await listRenewalCycleDateDecisions(editor, db);
    expect([...listed.keys()]).toEqual([LEASE]);
    const current = {
      cycleId: record.cycleId,
      recordedDateIso: RECORDED,
      sourceDateIso: SOURCE,
    };
    expect(cycleDateDecisionIsCurrent(listed.get(LEASE), current)).toBe(true);
    // RentVine moving the lease end again, or a new work record, asks staff again.
    expect(
      cycleDateDecisionIsCurrent(listed.get(LEASE), {
        ...current,
        sourceDateIso: "2028-12-31",
      }),
    ).toBe(false);
    expect(
      cycleDateDecisionIsCurrent(listed.get(LEASE), { ...current, cycleId: OP(99) }),
    ).toBe(false);
  });

  it("a repeated request returns the first result, and a changed request under the same operation is refused", async () => {
    await recordedCycle();
    const dependencies = { db, currentLeaseEndIso: sourceReports(SOURCE) };
    const first = await keepWorkingRecordedCycle(editor, choice(2), dependencies);
    const replay = await keepWorkingRecordedCycle(editor, choice(2), dependencies);
    expect(replay.duplicate).toBe(true);
    expect(replay.decision).toEqual(first.decision);
    expect(await decisionWrites()).toEqual({ head: 1, activity: 1 });

    const changed = await rejection(
      keepWorkingRecordedCycle(editor, choice(2, { sourceDateIso: "2028-12-31" }), {
        db,
        currentLeaseEndIso: sourceReports("2028-12-31"),
      }),
    );
    expect(changed.status).toBe(409);
    expect(changed.message).toMatch(/changed after it was first sent/);
    expect(await decisionWrites()).toEqual({ head: 1, activity: 1 });
  });

  it("is refused, and records nothing, when the lease is no longer the question staff saw", async () => {
    // No work record: there is no recorded cycle to keep working.
    const noRecord = await rejection(
      keepWorkingRecordedCycle(editor, choice(3), {
        db,
        currentLeaseEndIso: sourceReports(SOURCE),
      }),
    );
    expect(noRecord.status).toBe(409);
    expect(noRecord.message).toBe(CYCLE_DATE_CHANGED_MESSAGE);

    const record = await recordedCycle();
    // RentVine reports a different lease end now, or none; the browser's date is never trusted.
    for (const reported of ["2028-01-31", RECORDED, null]) {
      const moved = await rejection(
        keepWorkingRecordedCycle(editor, choice(4), {
          db,
          currentLeaseEndIso: sourceReports(reported),
        }),
      );
      expect(moved.status, String(reported)).toBe(409);
      expect(moved.message, String(reported)).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    }
    // The page named a different recorded date than the work record holds.
    const otherRecorded = await rejection(
      keepWorkingRecordedCycle(editor, choice(5, { recordedDateIso: "2026-11-30" }), {
        db,
        currentLeaseEndIso: sourceReports(SOURCE),
      }),
    );
    expect(otherRecorded.status).toBe(409);
    // A lease end that is not later than the recorded date is not a renewal in the source.
    const notLater = await rejection(
      keepWorkingRecordedCycle(
        editor,
        choice(6, { recordedDateIso: RECORDED, sourceDateIso: RECORDED }),
        { db, currentLeaseEndIso: sourceReports(RECORDED) },
      ),
    );
    expect(notLater.status).toBe(409);
    // A completed work record has nothing left to keep working.
    await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: record.cycleId,
        expectedRevision: record.revision,
        operationId: OP(7),
        action: { kind: "complete", source: "Staff record" },
      },
      db,
    );
    const completed = await rejection(
      keepWorkingRecordedCycle(editor, choice(8), {
        db,
        currentLeaseEndIso: sourceReports(SOURCE),
      }),
    );
    expect(completed.status).toBe(409);
    expect(completed.message).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    expect(await decisionWrites()).toEqual({ head: 0, activity: 0 });
  });

  it("a verification account records neither choice, and is offered neither", async () => {
    const record = await recordedCycle();
    const dependencies = { db, currentLeaseEndIso: sourceReports(SOURCE) };
    expect(canRecordCycleDateChoice(editor)).toBe(true);
    expect(canRecordCycleDateChoice(verification)).toBe(false);
    const kept = await rejection(
      keepWorkingRecordedCycle(verification, choice(9), dependencies),
    );
    expect(kept.status).toBe(403);
    const confirmed = await rejection(
      confirmSourceRenewalCompletion(
        verification,
        confirmChoice(10, record),
        dependencies,
      ),
    );
    expect(confirmed.status).toBe(403);
    expect(await decisionWrites()).toEqual({ head: 0, activity: 0 });
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
    // It still reads what the desk shows.
    expect((await listRenewalCycleDateDecisions(verification, db)).size).toBe(0);
  });

  it("the live read-only inspection context offers and records neither choice", async () => {
    const record = await recordedCycle();
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "live_readonly");
    try {
      expect(canRecordCycleDateChoice(editor)).toBe(false);
      const dependencies = { db, currentLeaseEndIso: sourceReports(SOURCE) };
      await expect(
        keepWorkingRecordedCycle(editor, choice(17), dependencies),
      ).rejects.toThrow(/inspection context/);
      await expect(
        confirmSourceRenewalCompletion(editor, confirmChoice(18, record), dependencies),
      ).rejects.toThrow(/inspection context/);
    } finally {
      vi.stubEnv("ENVIRONMENT_KIND", "production");
      vi.stubEnv("DATA_CONTEXT", "live");
    }
    expect(await decisionWrites()).toEqual({ head: 0, activity: 0 });
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
  });

  it("the decision collections are server-only: no client rule names them", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).not.toContain(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head);
    expect(rules).not.toContain(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.activity);
  });
});

describe("S246 record staff completion from the RentVine lease end (R-S246-5, BEH-S246-2)", () => {
  it("completes the recorded work record through the existing staff completion, with the RentVine date as its evidence", async () => {
    const record = await recordedCycle();
    const dependencies = { db, currentLeaseEndIso: sourceReports(SOURCE) };
    const confirmed = await confirmSourceRenewalCompletion(
      editor,
      confirmChoice(11, record),
      dependencies,
    );
    expect(confirmed.duplicate).toBe(false);
    const state = confirmed.state;
    if (!state) throw new Error("Expected the completed work record.");
    expect(state.cycleId).toBe(record.cycleId);
    // The recorded cycle keeps the date staff recorded; the RentVine date is the evidence.
    expect(state.basis).toEqual(recordedBasis);
    expect(state.completion).toMatchObject({
      eventId: OP(11),
      actorUid: editor.uid,
      source: `RentVine lease end ${SOURCE}`,
    });
    expect(state.completion?.reason).toContain(SOURCE);
    expect(state.completion?.reason).toContain(RECORDED);
    expect(manualRenewalSummary(state).complete).toBe(true);
    // The completion is one ordinary work-record event; the decision store is untouched.
    const event = await db
      .collection(RENEWAL_WORKSPACE_COLLECTIONS.activity)
      .doc(OP(11))
      .get();
    expect(event.get("action")).toMatchObject({ kind: "complete" });
    expect(await decisionWrites()).toEqual({ head: 0, activity: 0 });

    // A lost response is resolved by replay: the same completion, no second event.
    const activityCount = await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity);
    // The replay names the version staff reviewed, which the completion has since advanced.
    const replay = await confirmSourceRenewalCompletion(
      editor,
      confirmChoice(11, record),
      dependencies,
    );
    expect(replay.duplicate).toBe(true);
    expect(replay.state?.completion?.eventId).toBe(OP(11));
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(activityCount);
    // A second, different confirmation finds the record already completed and records nothing.
    const again = await rejection(
      confirmSourceRenewalCompletion(editor, confirmChoice(12, record), dependencies),
    );
    expect(again.status).toBe(409);
    expect(again.message).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(activityCount);
  });

  it("completes nothing when RentVine no longer reports the lease end staff confirmed, or no work record exists", async () => {
    const missing = await rejection(
      confirmSourceRenewalCompletion(editor, confirmChoice(13, NO_RECORD), {
        db,
        currentLeaseEndIso: sourceReports(SOURCE),
      }),
    );
    expect(missing.status).toBe(409);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.head)).toBe(0);

    const record = await recordedCycle();
    for (const reported of ["2028-01-31", RECORDED, null]) {
      const moved = await rejection(
        confirmSourceRenewalCompletion(editor, confirmChoice(14, record), {
          db,
          currentLeaseEndIso: sourceReports(reported),
        }),
      );
      expect(moved.status, String(reported)).toBe(409);
      expect(moved.message, String(reported)).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    }
    const state = await getRenewalWorkspace(editor, LEASE, db);
    expect(state?.completion).toBeNull();
    expect(state && manualRenewalSummary(state).complete).toBe(false);
  });

  it("refuses the completion when another operator changed the work record after the row was shown", async () => {
    const shown = await recordedCycle();
    const dependencies = { db, currentLeaseEndIso: sourceReports(SOURCE) };
    // Another operator records the owner's decline after the batch row was rendered. The two
    // dates staff confirmed are unchanged, so only the reviewed revision can tell.
    const declined = await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: shown.cycleId,
        expectedRevision: shown.revision,
        operationId: OP(30),
        action: { kind: "owner_response", outcome: "declined_non_renewal" },
      },
      db,
    );
    expect(manualNonRenewal(declined.state ?? null)).toBe(true);
    const activityCount = await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity);
    const refused = await rejection(
      confirmSourceRenewalCompletion(editor, confirmChoice(31, shown), dependencies),
    );
    expect(refused.status).toBe(409);
    expect(refused.message).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    const state = await getRenewalWorkspace(editor, LEASE, db);
    expect(state?.completion).toBeNull();
    expect(manualNonRenewal(state)).toBe(true);
    expect(await countDocs(RENEWAL_WORKSPACE_COLLECTIONS.activity)).toBe(activityCount);
  });

  it("refuses a confirmation that names another work record", async () => {
    const shown = await recordedCycle();
    const refused = await rejection(
      confirmSourceRenewalCompletion(
        editor,
        confirmChoice(32, { cycleId: OP(91), revision: shown.revision }),
        { db, currentLeaseEndIso: sourceReports(SOURCE) },
      ),
    );
    expect(refused.status).toBe(409);
    expect(refused.message).toBe(CYCLE_DATE_CHANGED_MESSAGE);
    expect((await getRenewalWorkspace(editor, LEASE, db))?.completion).toBeNull();
  });

  it("keep working and a later confirmation stay independent: the decision is kept as history and the completion is the staff record", async () => {
    const record = await recordedCycle();
    const dependencies = { db, currentLeaseEndIso: sourceReports(SOURCE) };
    await keepWorkingRecordedCycle(editor, choice(15), dependencies);
    // Staff later finish the recorded cycle the ordinary way.
    const done = await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: record.cycleId,
        expectedRevision: record.revision,
        operationId: OP(16),
        action: { kind: "complete", source: "Staff record" },
      },
      db,
    );
    expect(done.state?.completion?.eventId).toBe(OP(16));
    expect(await decisionWrites()).toEqual({ head: 1, activity: 1 });
  });
});
