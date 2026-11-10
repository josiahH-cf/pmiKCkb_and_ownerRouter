import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { SYNTHETIC_OWNER_ROSTER } from "../helpers/owner-approval";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readEffectiveRenewalTerms } from "@/lib/firestore/renewal-effective-terms";
import {
  RENEWAL_WORKING_RECORD_COLLECTIONS,
  getRenewalWorkingRecord,
  renewalWorkingRecordDocId,
  saveRenewalWorkingField,
} from "@/lib/firestore/renewal-working-record";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  getRenewalWorkspace,
  ownerRosterFingerprint,
  saveRenewalWorkspace,
  startRenewalCycle,
} from "@/lib/firestore/renewal-workspace";
import { ownerApprovalCoverage } from "@/lib/lease-renewal/owner-approval-coverage";
import { workingRenewalTerms } from "@/lib/lease-renewal/working-record";
import type { OwnerApprovalInput } from "@/lib/lease-renewal/workspace-state";

// S262 R-S262-1..5 and S263 R-S263-1/3 on the local emulator (AC-S262-1, AC-S262-2, AC-S262-3,
// AC-S262-4, AC-S262-5, AC-S263-1, AC-S263-3): future renewal terms are saved and read for the
// exact renewal cycle; a reviewed owner answer saves its Amount approved with the answer in one
// transaction; and the next-day start saves only on its explicit choice from a verified lease end.
// The file reads the stores through their existing entry points only, so the same assertions run
// against the code before this change. Synthetic leases, owners, amounts and dates only.

const projectId = "pmi-kc-kb-s262-s263-current-cycle-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
let counter = 0;
const op = () => `6a1d2c3b-4e5f-4a6b-8c7d-${String(++counter).padStart(12, "0")}`;
const LEASE = "5821";
const FIRST = {
  kind: "lease_end" as const,
  dateIso: "2026-11-30",
  source: "RentVine lease end",
};
const SECOND = {
  kind: "lease_end" as const,
  dateIso: "2027-11-30",
  source: "RentVine lease end",
};
const ROSTER = [
  { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
];
const APPROVAL: OwnerApprovalInput = {
  party: {
    kind: "owner",
    sourceRef: ROSTER[0]!.sourceRef,
    label: ROSTER[0]!.label,
    rosterFingerprint: ownerRosterFingerprint(ROSTER),
  },
  channel: { kind: "written", medium: "Signed letter", reference: "drive:letter-1" },
  occurredAt: "2026-10-20T16:00:00.000Z",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s262-s263-current-cycle-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as { status?: number; message: string; name?: string };
  }
  throw new Error("Expected a refusal.");
}

async function startCycle(basis = FIRST) {
  const current = await getRenewalWorkspace(editor, LEASE, db);
  const { state } = await startRenewalCycle(
    editor,
    {
      leaseId: LEASE,
      expectedCycleId: current?.cycleId ?? null,
      expectedRevision: current?.revision ?? 0,
      operationId: op(),
      basis,
      reason: "Synthetic renewal cycle.",
    },
    basis,
    db,
  );
  return state! as typeof state & { previousCycleId?: string | null };
}

function save(
  field: string,
  value: unknown,
  expectedRevision: number,
  extra: Record<string, unknown> = {},
) {
  return saveRenewalWorkingField(
    editor,
    { leaseId: LEASE, field, value, expectedRevision, operationId: op(), ...extra },
    db,
  );
}

type StoredEntry = Record<string, unknown>;
async function stored() {
  const snapshot = await db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head)
    .doc(renewalWorkingRecordDocId(LEASE))
    .get();
  return snapshot.data() as
    | { revision: number; fields: Record<string, StoredEntry> }
    | undefined;
}

/** The projected record's held-back value for one field, as the current-cycle read returns it. */
function held(record: unknown, field: string) {
  return (
    record as {
      cycle?: { cycleId: string | null; held: Record<string, { scope: string }> };
    } | null
  )?.cycle?.held[field];
}

async function workingActivity() {
  const docs = await db
    .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.activity)
    .where("lease_id", "==", LEASE)
    .get();
  return docs.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown>,
  );
}

async function collections() {
  return (await db.listCollections()).map((ref) => ref.id).sort();
}

const verifiedEnd = (endIso: string) => async () => ({
  state: "verified" as const,
  endIso,
  basis: "rentvine" as const,
  fingerprint: `rentvine:${endIso}`,
});

describe("AC-S262-5 future terms saved and read for the exact cycle", () => {
  it("AC-S262-5: a new cycle reads none of the previous cycle's terms as current, keeps them as history, and refuses a late save from the earlier cycle", async () => {
    const first = await startCycle();
    expect(first.previousCycleId).toBeNull();
    await save("terms_rent", 1850, 0, { expectedCycleId: first.cycleId });
    await save("terms_effective_date", "2026-12-01", 0);
    await save("terms_end_date", "2027-11-30", 0);
    await save("current_rent", 1800, 0);
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1850,
      cycleId: first.cycleId,
    });
    // The lease fact keeps its lease scope.
    expect((await stored())!.fields.current_rent).not.toHaveProperty("cycleId");
    expect((await readEffectiveRenewalTerms(LEASE, db)).complete).not.toBeNull();

    const second = await startCycle(SECOND);
    expect(second.previousCycleId).toBe(first.cycleId);
    const projected = await getRenewalWorkingRecord(editor, LEASE, db);
    expect(workingRenewalTerms(projected)).toMatchObject({
      rent: null,
      effectiveDate: null,
      endDate: null,
    });
    expect(projected!.fields.terms_rent).toBeUndefined();
    expect(projected!.fields.current_rent?.value).toBe(1800);
    expect(held(projected, "terms_rent")).toMatchObject({
      scope: "earlier",
      entry: { value: 1850 },
    });
    expect(held(projected, "terms_effective_date")).toMatchObject({ scope: "earlier" });
    expect((await readEffectiveRenewalTerms(LEASE, db)).rent).toBeNull();

    // A page opened in the earlier cycle, or its retry, saves nothing.
    const late = await refusal(
      save("terms_rent", 1900, 1, { expectedCycleId: first.cycleId }),
    );
    expect(late).toMatchObject({ status: 409 });
    expect(late.message).toContain("renewal cycle changed");
    const unbound = await refusal(save("terms_rent", 1900, 1, { expectedCycleId: null }));
    expect(unbound).toMatchObject({ status: 409 });
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1850,
      revision: 1,
    });

    // The current cycle's owner enters its own terms; the earlier value stays in history.
    await save("terms_rent", 1900, 1, { expectedCycleId: second.cycleId });
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBe(1900);
    const rentEvents = (await workingActivity()).filter(
      (entry) => entry.field === "terms_rent",
    );
    expect(rentEvents.map((entry) => [entry.next_value, entry.cycle_id])).toEqual(
      expect.arrayContaining([
        [1850, first.cycleId],
        [1900, second.cycleId],
      ]),
    );
    expect(rentEvents.find((entry) => entry.next_value === 1900)).toMatchObject({
      previous_value: 1850,
      previous_cycle_id: first.cycleId,
    });
    // A lease fact never names a cycle.
    expect(
      await refusal(save("current_rent", 1825, 1, { expectedCycleId: second.cycleId })),
    ).toMatchObject({ status: 400 });
  });

  it("AC-S262-5: a value saved before any work record belongs to the first cycle; continuing the same cycle keeps it", async () => {
    await save("terms_rent", 1850, 0, { expectedCycleId: null });
    expect((await stored())!.fields.terms_rent).toMatchObject({ cycleId: null });
    // Neither the save nor the read created a work record.
    expect(await getRenewalWorkspace(editor, LEASE, db)).toBeNull();
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBe(1850);
    expect(await getRenewalWorkspace(editor, LEASE, db)).toBeNull();
    const first = await startCycle();
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBe(1850);
    // The same cycle continues: an ordinary save on it keeps every value.
    await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: first.cycleId,
        expectedRevision: first.revision,
        operationId: op(),
        action: {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Synthetic call",
        },
      },
      db,
    );
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBe(1850);
    await startCycle(SECOND);
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBeNull();
  });

  it("AC-S262-5: an unbound legacy value is held until its owner confirms it with a fresh revision check, and an S249 fill neither replaces it nor counts it as empty", async () => {
    const first = await startCycle();
    // A cycle and a value written before cycles bound future terms (no binding on either).
    const heads = await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.head).get();
    expect(heads.docs).toHaveLength(1);
    for (const doc of heads.docs)
      await doc.ref.update({ previousCycleId: FieldValue.delete() });
    await db
      .collection(RENEWAL_WORKING_RECORD_COLLECTIONS.head)
      .doc(renewalWorkingRecordDocId(LEASE))
      .set({
        schemaVersion: "renewal-working-record/v1",
        leaseId: LEASE,
        revision: 1,
        fields: {
          terms_rent: {
            value: 1850,
            revision: 1,
            eventId: "6a1d2c3b-4e5f-4a6b-8c7d-100000000001",
            recordedAt: "2026-09-01T15:00:00.000Z",
            recordedByUid: "editor-1",
            recordedByLabel: "editor1@pmikcmetro.com",
            origin: "staff_entry",
          },
        },
      });
    const read = await getRenewalWorkingRecord(editor, LEASE, db);
    expect(workingRenewalTerms(read).rent).toBeNull();
    expect(held(read, "terms_rent")).toMatchObject({ scope: "unverified" });
    // S249: a proposal cannot fill a field that holds an unconfirmed value.
    const fill = await refusal(
      saveRenewalWorkingField(
        editor,
        {
          leaseId: LEASE,
          field: "terms_rent",
          value: 1910,
          expectedRevision: 1,
          operationId: op(),
          origin: "adopted_source",
          sourceLabel: "stored market comparison",
        },
        db,
        { cycleId: first.cycleId, dateIso: FIRST.dateIso },
      ),
    );
    expect(fill).toMatchObject({ status: 409 });
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1850,
      revision: 1,
    });
    // The field's owner confirms it for this renewal: a fresh revision on the active cycle.
    await save("terms_rent", 1850, 1, { expectedCycleId: first.cycleId });
    const confirmed = await getRenewalWorkingRecord(editor, LEASE, db);
    expect(confirmed!.fields.terms_rent).toMatchObject({
      value: 1850,
      revision: 2,
      cycleId: first.cycleId,
    });
    expect(held(confirmed, "terms_rent")).toBeUndefined();
  });

  it("AC-S262-5: an S249 proposal fills a field whose only value belongs to an earlier cycle", async () => {
    await startCycle();
    await save("terms_rent", 1850, 0);
    const second = await startCycle(SECOND);
    await saveRenewalWorkingField(
      editor,
      {
        leaseId: LEASE,
        field: "terms_rent",
        value: 1910,
        expectedRevision: 1,
        operationId: op(),
        origin: "adopted_source",
        sourceLabel: "stored market comparison",
      },
      db,
      { cycleId: second.cycleId, dateIso: SECOND.dateIso },
    );
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBe(1910);
  });
});

describe("AC-S262-1..4 the reviewed owner answer and its Amount approved", () => {
  let cycleId: string;
  beforeEach(async () => {
    cycleId = (await startCycle()).cycleId;
    await save("terms_rent", 1850, 0);
    await save("terms_effective_date", "2026-12-01", 0);
    await save("terms_end_date", "2027-11-30", 0);
    await save("current_rent", 1800, 0);
  });

  async function answer(
    action: Record<string, unknown>,
    operationId = op(),
    expected?: { cycleId: string; revision: number },
  ) {
    const state = expected ?? (await getRenewalWorkspace(editor, LEASE, db))!;
    return saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: state.cycleId,
        expectedRevision: state.revision,
        operationId,
        action: { kind: "owner_response", ...action },
      },
      db,
      undefined,
      SYNTHETIC_OWNER_ROSTER,
    );
  }
  const approved = (
    amount: number,
    scope: "amount_only" | "exact_terms" = "amount_only",
    revisions = { working: 1, recommendation: 0 },
  ) => ({
    outcome: "approved_terms",
    approval: APPROVAL,
    approvedBase: {
      amount,
      scope,
      expectedWorkingRevision: revisions.working,
      expectedRecommendationRevision: revisions.recommendation,
    },
  });
  async function coverage() {
    return ownerApprovalCoverage({
      workspace: await getRenewalWorkspace(editor, LEASE, db),
      working: await getRenewalWorkingRecord(editor, LEASE, db),
      economicsHash: null,
    });
  }

  it("AC-S262-2 / BEH-S262-1: the reviewed answer saves $1,875 as the approved base and keeps $1,850 as Rent to recommend in the same save", async () => {
    const before = await collections();
    const operationId = op();
    const { state } = await answer(approved(1875), operationId);
    expect(state!.ownerResponse).toMatchObject({
      outcome: "approved_terms",
      approval: { party: { kind: "owner", label: "Example Owner LLC" } },
      approvedBase: {
        amount: 1875,
        scope: "amount_only",
        cycleId,
        workingRevision: 2,
        recommended: { value: 1850, revision: 1 },
      },
    });
    // An amount-only answer covers no dates.
    expect(state!.ownerResponse?.approvedWorkingTerms).toBeUndefined();
    const record = (await stored())!;
    expect(record.fields.terms_rent).toMatchObject({
      value: 1875,
      revision: 2,
      cycleId,
      basis: { kind: "owner_approval", ownerResponseEventId: operationId },
    });
    expect(record.fields.recommended_rent).toMatchObject({
      value: 1850,
      revision: 1,
      cycleId,
      recordedByLabel: "editor1@pmikcmetro.com",
      preservedFrom: { field: "terms_rent", revision: 1 },
    });
    // Dates and lease facts are untouched.
    expect(record.fields.terms_effective_date).toMatchObject({ revision: 1 });
    expect(record.fields.current_rent).toMatchObject({ value: 1800, revision: 1 });
    expect((await readEffectiveRenewalTerms(LEASE, db)).rent).toBe(1875);
    const events = (await workingActivity()).filter(
      (entry) => entry.owner_response_event_id === operationId,
    );
    expect(events.map((entry) => entry.field).sort()).toEqual([
      "recommended_rent",
      "terms_rent",
    ]);
    // R-S262-4 / ARCH-S262-4: the save creates no mail operation, provider receipt or new store.
    expect(await collections()).toEqual(before);
    // R-S262-3: amount-only covers exactly this base revision and never the dates.
    expect(await coverage()).toEqual({
      state: "amount_only",
      binding: { rent: 1875, rentRevision: 2 },
      rentCurrent: true,
    });
  });

  it("BEH-S262-3: changing a date never widens an amount-only answer, and a later base revision makes it earlier evidence", async () => {
    await answer(approved(1875));
    await save("terms_end_date", "2027-12-31", 1);
    expect(await coverage()).toMatchObject({ state: "amount_only", rentCurrent: true });
    await save("terms_rent", 1880, 2, { expectedCycleId: cycleId });
    expect(await coverage()).toMatchObject({ state: "amount_only", rentCurrent: false });
  });

  it("AC-S262-2: Rent to recommend edits leave the offer on the approved base; Use this amount for the offer applies only the reviewed recommendation revision", async () => {
    await answer(approved(1875));
    await save("recommended_rent", 1900, 1, { expectedCycleId: cycleId });
    expect(
      workingRenewalTerms(await getRenewalWorkingRecord(editor, LEASE, db)).rent,
    ).toBe(1875);
    expect(await coverage()).toMatchObject({ state: "amount_only", rentCurrent: true });

    // A changed proposal revision refuses even though the working base revision is unchanged.
    await save("recommended_rent", 1925, 2, { expectedCycleId: cycleId });
    const stale = await refusal(
      save("terms_rent", 1900, 2, {
        expectedCycleId: cycleId,
        recommendationRevision: 2,
      }),
    );
    expect(stale).toMatchObject({ status: 409 });
    expect(stale.message).toContain("Rent to recommend changed since you reviewed it");
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1875,
      revision: 2,
    });
    // A value other than the reviewed recommendation is refused too.
    expect(
      await refusal(
        save("terms_rent", 1990, 2, {
          expectedCycleId: cycleId,
          recommendationRevision: 3,
        }),
      ),
    ).toMatchObject({ status: 409 });

    await save("terms_rent", 1925, 2, {
      expectedCycleId: cycleId,
      recommendationRevision: 3,
    });
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1925,
      revision: 3,
      basis: { kind: "recommendation", recommendationRevision: 3 },
    });
    // The owner's recorded answer stays as recorded, and now covers an earlier base.
    expect(
      (await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse?.approvedBase,
    ).toMatchObject({ amount: 1875, workingRevision: 2 });
    expect(await coverage()).toMatchObject({ state: "amount_only", rentCurrent: false });
  });

  it("BEH-S262-2: with no earlier recommendation the answer leaves it unavailable, and a later direct base entry never becomes the recommendation", async () => {
    await save("terms_rent", null, 1);
    const { state } = await answer(
      approved(1875, "amount_only", { working: 2, recommendation: 0 }),
    );
    expect(state!.ownerResponse?.approvedBase?.recommended).toBeNull();
    expect((await stored())!.fields.recommended_rent).toBeUndefined();
    // The working base edited directly in Working renewal terms keeps its own value.
    await save("terms_rent", 1890, 3, { expectedCycleId: cycleId });
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1890,
      basis: { kind: "working_entry" },
    });
    const read = await getRenewalWorkingRecord(editor, LEASE, db);
    expect(read!.fields.recommended_rent).toBeUndefined();
    expect(workingRenewalTerms(read).rent).toBe(1890);
  });

  it("AC-S262-2: a stale review, a concurrent edit or another cycle saves neither the answer nor the base", async () => {
    const read = (await getRenewalWorkspace(editor, LEASE, db))!;
    // Another editor changes the working base after the review was opened.
    await save("terms_rent", 1860, 1);
    const stale = await refusal(answer(approved(1875), op(), read));
    expect(stale).toMatchObject({ status: 409 });
    expect(stale.message).toContain("changed after you reviewed the owner's answer");
    expect((await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse).toBeNull();
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1860,
      revision: 2,
    });
    expect((await stored())!.fields.recommended_rent).toBeUndefined();

    // A work record revision that moved is refused before anything is written.
    await saveRenewalWorkspace(
      editor,
      {
        leaseId: LEASE,
        cycleId: read.cycleId,
        expectedRevision: read.revision,
        operationId: op(),
        action: {
          kind: "activity",
          activity: "owner_outreach",
          outcome: "done",
          source: "Synthetic call",
        },
      },
      db,
    );
    expect(
      await refusal(
        answer(
          approved(1875, "amount_only", { working: 2, recommendation: 0 }),
          op(),
          read,
        ),
      ),
    ).toMatchObject({ status: 409 });

    // An answer for the earlier cycle is refused after a new cycle starts.
    await startCycle(SECOND);
    expect(
      await refusal(
        answer(approved(1875, "amount_only", { working: 2, recommendation: 0 }), op(), {
          cycleId: read.cycleId,
          revision: read.revision + 1,
        }),
      ),
    ).toMatchObject({ status: 409 });
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1860,
      revision: 2,
    });
  });

  it("AC-S262-2 / BEH-S262-2: a retried save returns its first result and writes nothing again", async () => {
    const read = (await getRenewalWorkspace(editor, LEASE, db))!;
    const operationId = op();
    await answer(approved(1875), operationId, read);
    const record = await stored();
    const activity = (await workingActivity()).length;
    const replay = await answer(approved(1875), operationId, read);
    expect(replay.duplicate).toBe(true);
    expect(await stored()).toEqual(record);
    expect((await workingActivity()).length).toBe(activity);
    // The same operation with a different amount is a changed request, not a second answer.
    expect(await refusal(answer(approved(1880), operationId, read))).toMatchObject({
      status: 409,
    });
    expect((await stored())!.fields.terms_rent).toMatchObject({ value: 1875 });
  });

  it("AC-S262-1: a non-approving answer, a missing amount or sub-cent precision records nothing", async () => {
    const decline = await refusal(
      answer({
        outcome: "declined_non_renewal",
        approvedBase: {
          amount: 1875,
          scope: "amount_only",
          expectedWorkingRevision: 1,
          expectedRecommendationRevision: 0,
        },
      }),
    );
    expect(decline).toMatchObject({ status: 400 });
    for (const approvedBase of [
      {
        scope: "amount_only",
        expectedWorkingRevision: 1,
        expectedRecommendationRevision: 0,
      },
      {
        amount: 1875.555,
        scope: "amount_only",
        expectedWorkingRevision: 1,
        expectedRecommendationRevision: 0,
      },
      {
        amount: 0,
        scope: "amount_only",
        expectedWorkingRevision: 1,
        expectedRecommendationRevision: 0,
      },
    ])
      await refusal(
        answer({ outcome: "approved_terms", approval: APPROVAL, approvedBase }),
      );
    expect((await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse).toBeNull();
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1850,
      revision: 1,
    });
    // A decline without an amount keeps its outcome and never changes the renewal rent.
    const { state } = await answer({ outcome: "declined_non_renewal" });
    expect(state!.ownerResponse?.outcome).toBe("declined_non_renewal");
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1850,
      revision: 1,
    });
  });

  it("AC-S262-3: an exact-terms answer covers the dates it saw, and a date change makes it earlier", async () => {
    const { state } = await answer(approved(1875, "exact_terms"));
    expect(state!.ownerResponse?.approvedWorkingTerms).toMatchObject({
      rent: 1875,
      effectiveDate: "2026-12-01",
      endDate: "2027-11-30",
      fieldRevisions: { rent: 2, effectiveDate: 1, endDate: 1 },
    });
    expect(state!.ownerResponse?.approvedBase).toMatchObject({ scope: "exact_terms" });
    expect(await coverage()).toMatchObject({ state: "current" });
    await save("terms_end_date", "2027-12-31", 1);
    expect(await coverage()).toMatchObject({
      state: "terms_changed",
      changed: ["end_date"],
    });
  });

  it("AC-S262-3: an exact-terms answer without saved dates is refused and records nothing", async () => {
    await save("terms_end_date", null, 1);
    const refused = await refusal(answer(approved(1875, "exact_terms")));
    expect(refused).toMatchObject({ status: 409 });
    expect(refused.message).toContain("choose Base rent only");
    expect((await getRenewalWorkspace(editor, LEASE, db))!.ownerResponse).toBeNull();
    expect((await stored())!.fields.terms_rent).toMatchObject({
      value: 1850,
      revision: 1,
    });
  });

  it("AC-S262-3 (preservation): an approval recorded without an amount keeps its exact S234 coverage", async () => {
    const { state } = await answer({ outcome: "approved_terms", approval: APPROVAL });
    expect(state!.ownerResponse?.approvedBase).toBeUndefined();
    expect(state!.ownerResponse?.approvedWorkingTerms).toMatchObject({ rent: 1850 });
    expect(await coverage()).toMatchObject({ state: "current" });
    expect((await stored())!.fields.recommended_rent).toBeUndefined();
  });
});

describe("AC-S263-1/3 the explicit next-day start", () => {
  function propose(
    value: string,
    leaseEndIso: string,
    verify: () => Promise<unknown>,
    expectedRevision = 0,
  ) {
    return saveRenewalWorkingField(
      editor,
      {
        leaseId: LEASE,
        field: "terms_effective_date",
        value,
        expectedRevision,
        operationId: op(),
        dateProposal: { kind: "day_after_lease_end", leaseEndIso },
      },
      db,
      undefined,
      // The route resolves the verified current lease end; the store checks it again.
      { verifyLeaseEnd: verify } as never,
    );
  }

  it("AC-S263-1: the explicit choice saves the day after the verified end for the active cycle", async () => {
    const { cycleId } = await startCycle();
    const { record } = await propose(
      "2026-12-01",
      "2026-11-30",
      verifiedEnd("2026-11-30"),
    );
    expect(record!.fields.terms_effective_date).toMatchObject({
      value: "2026-12-01",
      revision: 1,
      cycleId,
    });
    // Nothing else changed: no end date is invented.
    expect(record!.fields.terms_end_date).toBeUndefined();
  });

  it("AC-S263-3: a wrong date, a changed or unverified end, or a saved start saves nothing", async () => {
    await startCycle();
    expect(
      await refusal(propose("2026-12-02", "2026-11-30", verifiedEnd("2026-11-30"))),
    ).toMatchObject({ status: 400 });
    expect(
      await refusal(propose("2026-12-01", "2026-11-30", verifiedEnd("2027-11-30"))),
    ).toMatchObject({ status: 409 });
    expect(
      await refusal(
        propose("2026-12-01", "2026-11-30", async () => ({
          state: "unverified",
          reason: "unreadable",
          rawEndIso: "2026-11-30",
          line: "The RentVine read for this lease is not current.",
        })),
      ),
    ).toMatchObject({ status: 409 });
    expect(
      await refusal(
        propose("2026-12-01", "2026-11-30", async () => {
          throw new Error("source unavailable");
        }),
      ),
    ).toMatchObject({ status: 409 });
    expect(await stored()).toBeUndefined();
    await save("terms_effective_date", "2026-12-15", 0);
    const saved = await refusal(
      propose("2026-12-01", "2026-11-30", verifiedEnd("2026-11-30"), 1),
    );
    expect(saved).toMatchObject({ status: 409 });
    expect(saved.message).toContain("The saved date stays");
    expect((await stored())!.fields.terms_effective_date).toMatchObject({
      value: "2026-12-15",
    });
  });

  it("AC-S263-1: an earlier cycle's start leaves the current start empty for the suggestion", async () => {
    await startCycle();
    await save("terms_effective_date", "2026-12-01", 0);
    const second = await startCycle(SECOND);
    const { record } = await propose(
      "2027-12-01",
      "2027-11-30",
      verifiedEnd("2027-11-30"),
      1,
    );
    expect(record!.fields.terms_effective_date).toMatchObject({
      value: "2027-12-01",
      cycleId: second.cycleId,
    });
  });
});
