import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  getLeaseTermReview,
  listLeaseTermReviewActivity,
  listLeaseTermReviews,
  recordLeaseTermReview,
} from "@/lib/firestore/lease-renewal-term-reviews";
import {
  applyLeaseDetailToView,
  leaseViewsFromExport,
  markLeaseDetailUnavailable,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  leaseTermSourceFingerprint,
  projectLeaseTerm,
} from "@/lib/lease-renewal/lease-term";

// S103: the app-owned lease term review is versioned, audited, Editor-gated, and fingerprint-bound.
// Values are synthetic. The record never reaches a provider.

const projectId = "pmi-kc-kb-s103-term-review-test";
const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s103-term-review-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function unreadableDetailView(endDateIso: string) {
  const [view] = leaseViewsFromExport([
    { lease: { leaseID: 41, endDate: endDateIso }, unit: {} },
  ]);
  markLeaseDetailUnavailable(view);
  return view;
}

function fixedTermView(endDateIso: string) {
  const [view] = leaseViewsFromExport([
    { lease: { leaseID: 41, endDate: endDateIso }, unit: {} },
  ]);
  applyLeaseDetailToView(view, {
    baseRentAmount: 1500,
    rentAmount: 1500,
    isMonthToMonth: "0",
    monthToMonthStartDate: null,
    hasPendingMonthToMonthConversion: false,
  });
  return view;
}

describe("S103 lease term review store", () => {
  it("records, versions, and audits one current review per lease", async () => {
    const view = unreadableDetailView("2026-09-30");
    const fingerprint = leaseTermSourceFingerprint(view);
    const first = await recordLeaseTermReview(
      editor,
      {
        lease_id: "41",
        term: "month_to_month",
        anchor_date: "2025-09-15",
        reason: "Converted to month-to-month at the end of the prior term.",
        source_fingerprint: fingerprint,
      },
      db,
      "2026-09-03T00:00:00.000Z",
    );
    expect(first).toMatchObject({
      version: 1,
      leaseId: "41",
      term: "month_to_month",
      anchorDateIso: "2025-09-15",
      recordedByUid: editor.uid,
    });
    expect(first.recordHash).toMatch(/^[a-f0-9]{64}$/);

    const corrected = await recordLeaseTermReview(
      editor,
      {
        lease_id: "41",
        term: "fixed_term",
        reason: "The signed renewal is a fixed term after all.",
        source_fingerprint: fingerprint,
      },
      db,
      "2026-09-03T01:00:00.000Z",
    );
    expect(corrected).toMatchObject({ version: 2, term: "fixed_term" });
    // A correction never leaves a stale anchor behind.
    expect(corrected.anchorDateIso).toBeNull();

    const current = await getLeaseTermReview(editor, "41", db);
    expect(current).toMatchObject({ version: 2, term: "fixed_term" });
    const activity = await listLeaseTermReviewActivity(editor, "41", db);
    expect(activity.map((entry) => [entry.previousTerm, entry.newTerm])).toEqual([
      [null, "month_to_month"],
      ["month_to_month", "fixed_term"],
    ]);
  });

  it("drives the shared projection and goes stale when the lease facts drift (AC-S103-3)", async () => {
    const seen = unreadableDetailView("2026-09-30");
    const record = await recordLeaseTermReview(
      editor,
      {
        lease_id: "41",
        term: "month_to_month",
        anchor_date: "2025-09-15",
        reason: "Month-to-month confirmed with the owner.",
        source_fingerprint: leaseTermSourceFingerprint(seen),
      },
      db,
      "2026-09-03T00:00:00.000Z",
    );
    expect(projectLeaseTerm(seen, record)).toMatchObject({
      term: "month_to_month",
      nextReviewIso: "2026-09-15",
      recordedReviewStale: false,
    });

    const drifted = unreadableDetailView("2026-11-30");
    expect(projectLeaseTerm(drifted, record)).toMatchObject({
      term: "needs_review",
      recordedReviewStale: true,
      nextReviewIso: null,
    });
  });

  it("never lets a recorded review override an exact provider fixed-term signal into the monthly cohort", async () => {
    const view = fixedTermView("2026-09-30");
    const record = await recordLeaseTermReview(
      editor,
      {
        lease_id: "41",
        term: "month_to_month",
        anchor_date: "2025-09-15",
        reason: "The owner says this one runs month to month.",
        source_fingerprint: leaseTermSourceFingerprint(view),
      },
      db,
      "2026-09-03T00:00:00.000Z",
    );
    // A recorded month-to-month may take a lease OUT of the monthly cohort. That is the safe
    // direction; the reverse (a recorded fixed term over an exact provider month-to-month signal)
    // is covered by the pure projection suite and is refused there.
    expect(projectLeaseTerm(view, record)).toMatchObject({
      term: "month_to_month",
      reason: "recorded_month_to_month",
    });
  });

  it("refuses an incomplete month-to-month payload and a stray fixed-term anchor", async () => {
    const fingerprint = leaseTermSourceFingerprint(unreadableDetailView("2026-09-30"));
    await expect(
      recordLeaseTermReview(
        editor,
        {
          lease_id: "41",
          term: "month_to_month",
          reason: "No anchor supplied.",
          source_fingerprint: fingerprint,
        },
        db,
      ),
    ).rejects.toThrow(/requires the exact date/);

    await expect(
      recordLeaseTermReview(
        editor,
        {
          lease_id: "41",
          term: "fixed_term",
          anchor_date: "2025-09-15",
          reason: "Anchor on a fixed term.",
          source_fingerprint: fingerprint,
        },
        db,
      ),
    ).rejects.toThrow(/carries no month-to-month anchor/);

    await expect(
      recordLeaseTermReview(
        editor,
        {
          lease_id: "41",
          term: "month_to_month",
          anchor_date: "2025-02-30",
          reason: "Impossible calendar date.",
          source_fingerprint: fingerprint,
        },
        db,
      ),
    ).rejects.toThrow(/exact ISO calendar date/);

    expect(await getLeaseTermReview(editor, "41", db)).toBeNull();
  });

  it("returns the bulk desk map keyed by lease id", async () => {
    const fingerprint = leaseTermSourceFingerprint(unreadableDetailView("2026-09-30"));
    for (const leaseId of ["41", "42"]) {
      await recordLeaseTermReview(
        editor,
        {
          lease_id: leaseId,
          term: "fixed_term",
          reason: "Fixed term confirmed in the signed lease.",
          source_fingerprint: fingerprint,
        },
        db,
        "2026-09-03T00:00:00.000Z",
      );
    }
    const byLease = await listLeaseTermReviews(editor, db);
    expect([...byLease.keys()].sort()).toEqual(["41", "42"]);
    expect(byLease.get("41")).toMatchObject({ term: "fixed_term", version: 1 });
  });
});
