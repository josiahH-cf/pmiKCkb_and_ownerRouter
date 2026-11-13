import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { SYNTHETIC_OWNER_ROSTER } from "../helpers/owner-approval";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  RenewalWorkspaceStateSchema,
  getRenewalWorkspace,
  listRenewalWorkspaceActivity,
  listRenewalWorkspaces,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import { classifyRenewalCohort } from "@/lib/lease-renewal/cohort";
import { endDateReviewsByLease } from "@/lib/lease-renewal/off-cycle-review";
import type { RenewalWorkBasis } from "@/lib/lease-renewal/workspace-state";

// S282 ARCH-S282-1 / ARCH-S282-2 / AC-S282-1 / AC-S282-5 / BEH-S282-5: the off-cycle end date
// review is saved through the existing workspace save path, with its role check, version check and
// audit entry, bound to the lease, the cycle and the exact end date value reviewed, and read back
// by the cohort. Fail-first on the starting state: the action kind did not exist, so every save
// here was refused by the schema. Values are synthetic and the store is the local emulator.

const projectId = "pmi-kc-kb-s282-off-cycle-review-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
// The read-only identity: a verification account reads and never records (canary policy).
const verification: AuthenticatedUser = {
  uid: "canary-editor",
  email: "canary-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "9106";
const OFF_CYCLE_END = "2027-01-14";
const OTHER_OFF_CYCLE_END = "2027-01-20";
const OP = (n: number) =>
  `7e3d9b2f-8c4a-4d5e-9f60-0000000000${String(n).padStart(2, "0")}`;
const leaseEnd: RenewalWorkBasis = {
  kind: "lease_end",
  dateIso: OFF_CYCLE_END,
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
  app = initializeApp({ projectId }, `s282-off-cycle-review-${process.pid}`);
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

/** Every document in every collection, so a refusal can be shown to write nothing at all. */
async function snapshotAll() {
  const collections = await db.listCollections();
  const entries = await Promise.all(
    collections.map(async (collection) => {
      const docs = await collection.get();
      return docs.docs.map(
        (doc) => `${collection.id}/${doc.id}:${JSON.stringify(doc.data())}`,
      );
    }),
  );
  return entries.flat().sort();
}

function reviewInput(
  n: number,
  cycleId: string | null,
  expectedRevision: number,
  action: Record<string, unknown>,
) {
  return {
    leaseId: LEASE,
    cycleId,
    expectedRevision,
    operationId: OP(n),
    action: {
      kind: "end_date_review",
      decision: "include",
      endDateIso: OFF_CYCLE_END,
      reason: "Owner confirmed the date",
      ...action,
    },
  };
}

/** A lease with an existing work record (an ordinary outreach record saved first). */
async function existingRecord() {
  const saved = await saveRenewalWorkspace(
    editor,
    {
      leaseId: LEASE,
      cycleId: null,
      expectedRevision: 0,
      operationId: OP(90),
      action: { kind: "activity", activity: "owner_outreach", outcome: "waiting" },
    },
    db,
    async () => leaseEnd,
    SYNTHETIC_OWNER_ROSTER,
  );
  return saved.state!;
}

describe("S282 off-cycle end date review store", () => {
  it("AC-S282-1: a review without a reason is refused with zero writes", async () => {
    const before = await snapshotAll();
    await expect(
      saveRenewalWorkspace(
        editor,
        reviewInput(1, null, 0, { reason: "" }),
        db,
        async () => leaseEnd,
        SYNTHETIC_OWNER_ROSTER,
      ),
    ).rejects.toThrow();
    await expect(
      saveRenewalWorkspace(
        editor,
        reviewInput(2, null, 0, { decision: undefined }),
        db,
        async () => leaseEnd,
        SYNTHETIC_OWNER_ROSTER,
      ),
    ).rejects.toThrow();
    expect(await snapshotAll()).toEqual(before);
  });

  it("AC-S282-1 / ARCH-S282-2: the saved record holds lease, cycle, end date, decision, reason, actor and time, with its audit entry", async () => {
    const current = await existingRecord();
    const saved = await saveRenewalWorkspace(
      editor,
      reviewInput(3, current.cycleId, current.revision, {}),
      db,
      async () => leaseEnd,
      SYNTHETIC_OWNER_ROSTER,
    );
    expect(saved.duplicate).toBe(false);
    const state = saved.state!;
    expect(state.leaseId).toBe(LEASE);
    expect(state.revision).toBe(current.revision + 1);
    expect(state.endDateReviews).toHaveLength(1);
    const [review] = state.endDateReviews!;
    expect(review).toMatchObject({
      eventId: OP(3),
      cycleId: current.cycleId,
      endDateIso: OFF_CYCLE_END,
      decision: "include",
      reason: "Owner confirmed the date",
      actorUid: editor.uid,
      actorLabel: editor.email,
    });
    expect(Number.isFinite(Date.parse(review!.recordedAt))).toBe(true);
    // The head keeps the exact shape every reader parses.
    const head = await db.collection(RENEWAL_WORKSPACE_COLLECTIONS.head).get();
    expect(() => RenewalWorkspaceStateSchema.parse(head.docs[0]!.data())).not.toThrow();
    // The existing save path's append-only audit entry names the review.
    const activity = await listRenewalWorkspaceActivity(editor, LEASE, db);
    const entry = activity.find((item) => item.id === OP(3)) as unknown as {
      actor_uid: string;
      cycle_id: string;
      action: { kind: string; decision: string; endDateIso: string; reason: string };
    };
    expect(entry).toMatchObject({
      actor_uid: editor.uid,
      cycle_id: current.cycleId,
      action: {
        kind: "end_date_review",
        decision: "include",
        endDateIso: OFF_CYCLE_END,
        reason: "Owner confirmed the date",
      },
    });
  });

  it("BEH-S282-5: a read-only identity is refused with zero writes", async () => {
    const current = await existingRecord();
    const before = await snapshotAll();
    await expect(
      saveRenewalWorkspace(
        verification,
        reviewInput(4, current.cycleId, current.revision, {}),
        db,
        async () => leaseEnd,
        SYNTHETIC_OWNER_ROSTER,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await snapshotAll()).toEqual(before);
    // The read-only identity still reads the record and its decision.
    expect(await getRenewalWorkspace(verification, LEASE, db)).toMatchObject({
      leaseId: LEASE,
    });
  });

  it("AC-S282-1: a stale version is refused with zero writes", async () => {
    const current = await existingRecord();
    const before = await snapshotAll();
    await expect(
      saveRenewalWorkspace(
        editor,
        reviewInput(5, current.cycleId, current.revision - 1, {}),
        db,
        async () => leaseEnd,
        SYNTHETIC_OWNER_ROSTER,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await snapshotAll()).toEqual(before);
  });

  it("AC-S282-5: recording a review reads no source, prepares no Sheet value and writes only the work record", async () => {
    const current = await existingRecord();
    const resolveBasis = vi.fn(async () => leaseEnd);
    const workRecord = new Set<string>([
      RENEWAL_WORKSPACE_COLLECTIONS.activity,
      RENEWAL_WORKSPACE_COLLECTIONS.cycles,
      RENEWAL_WORKSPACE_COLLECTIONS.head,
    ]);
    const outsideWorkRecord = async () =>
      (await snapshotAll()).filter((entry) => !workRecord.has(entry.split("/")[0]!));
    const collectionsBefore = (await db.listCollections()).map((c) => c.id).sort();
    const othersBefore = await outsideWorkRecord();
    const saved = await saveRenewalWorkspace(
      editor,
      reviewInput(6, current.cycleId, current.revision, { decision: "hold" }),
      db,
      resolveBasis,
      SYNTHETIC_OWNER_ROSTER,
    );
    // With a work record in place nothing reads the source for a basis.
    expect(resolveBasis).not.toHaveBeenCalled();
    // No Sheet value is prepared, no new collection appears and nothing else changes.
    expect(saved.state?.sourceUpdates).toEqual(current.sourceUpdates);
    expect((await db.listCollections()).map((c) => c.id).sort()).toEqual(
      collectionsBefore,
    );
    expect(await outsideWorkRecord()).toEqual(othersBefore);
  });

  it("ARCH-S282-1 / BEH-S282-4: the cohort reads the stored review for the exact end date; another date asks again", async () => {
    const current = await existingRecord();
    await saveRenewalWorkspace(
      editor,
      reviewInput(7, current.cycleId, current.revision, {}),
      db,
      async () => leaseEnd,
      SYNTHETIC_OWNER_ROSTER,
    );
    const states = await listRenewalWorkspaces(editor, db);
    const endDateReviews = endDateReviewsByLease(states);
    const classify = (endDate: string) =>
      classifyRenewalCohort([{ leaseID: LEASE, endDate, leaseType: "Fixed Term" }], {
        windows: [{ startIso: "2027-01-01", endIso: "2027-01-31" }],
        endDateReviews,
      }).classifications[0];
    expect(classify(OFF_CYCLE_END)).toMatchObject({
      disposition: "actionable",
      offCycle: { state: "included" },
    });
    expect(classify(OTHER_OFF_CYCLE_END)).toMatchObject({
      disposition: "review",
      reason: "off_cycle_date",
      offCycle: { state: "needs_review" },
    });
    // A second review for the new value keeps the first as history on the same cycle.
    const latest = (await getRenewalWorkspace(editor, LEASE, db))!;
    const again = await saveRenewalWorkspace(
      editor,
      reviewInput(8, latest.cycleId, latest.revision, {
        decision: "hold",
        endDateIso: OTHER_OFF_CYCLE_END,
        reason: "New date to check",
      }),
      db,
      async () => leaseEnd,
      SYNTHETIC_OWNER_ROSTER,
    );
    expect(again.state?.endDateReviews?.map((item) => item.endDateIso)).toEqual([
      OFF_CYCLE_END,
      OTHER_OFF_CYCLE_END,
    ]);
    expect(
      again.state?.endDateReviews?.every((item) => item.cycleId === latest.cycleId),
    ).toBe(true);
  });

  it("ARCH-S282-2: the same operation saved twice records once", async () => {
    const current = await existingRecord();
    const input = reviewInput(9, current.cycleId, current.revision, {});
    await saveRenewalWorkspace(
      editor,
      input,
      db,
      async () => leaseEnd,
      SYNTHETIC_OWNER_ROSTER,
    );
    const repeat = await saveRenewalWorkspace(
      editor,
      input,
      db,
      async () => leaseEnd,
      SYNTHETIC_OWNER_ROSTER,
    );
    expect(repeat.duplicate).toBe(true);
    expect(repeat.state?.endDateReviews).toHaveLength(1);
  });
});
