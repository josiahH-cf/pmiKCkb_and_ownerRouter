// S250 with S249 (L33, cost safety): a lease whose standing agreement covers its owner step needs
// no billed comparison for its kickoff, and an out-of-date or incomplete RentVine read never turns
// a covered lease into an ordinary one that the automatic start looks up. Every dependency is an
// in-memory fake or the desk's own orchestration over synthetic sources; nothing reaches a
// provider, a mailbox or a store. Names, ids and amounts are synthetic.
import { describe, expect, it, vi } from "vitest";

import { automaticStartAllowed } from "@/components/lease-renewal/RenewalKickoffPreparation";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { KickoffSupportRead } from "@/lib/lease-renewal/kickoff-facts";
import {
  runKickoffPreparation,
  type KickoffLeaseRead,
  type KickoffPreparationDeps,
} from "@/lib/lease-renewal/kickoff-preparation-service";
import { projectRenewalBatchRows } from "@/lib/lease-renewal/renewal-batch-row";
import type {
  PricingAssignment,
  RenewalPricingPolicy,
  RenewalPricingRead,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  S246_LEASES,
  S246_READ_TS,
  S246_TODAY,
  loadS246Desk,
  s246Row,
} from "@/tests/helpers/s246-portfolio";

const STAFF = {
  uid: "synthetic-editor",
  email: "synthetic-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as AuthenticatedUser;

// ---- The server fence ------------------------------------------------------------------------

const LEASE: KickoffLeaseRead = {
  cycleDateIso: "2026-12-31",
  inWorkingBatch: true,
  workRecordCycleId: "5b0c1d2e-3f40-4a51-8b62-7c8d9e0f1a2b",
  housingAssistance: null,
};

function harness(lease: KickoffLeaseRead) {
  const lookup = vi.fn(async () => ({
    ok: true,
    confidence: "Likely",
    observationId: "obs-1",
    cached: false,
  }));
  const claim = vi.fn(async (input: Parameters<KickoffPreparationDeps["claim"]>[0]) => ({
    claimed: true as const,
    record: {
      leaseId: input.leaseId,
      cycleKey: input.cycleKey,
      state: "claimed" as const,
      trigger: input.trigger,
      actorUid: input.actorUid,
      operationId: input.operationId,
      claimedAt: "2026-11-05T15:00:00.000Z",
      settledAt: null,
      observationId: null,
      billed: null,
      reason: null,
    },
  }));
  const deps: KickoffPreparationDeps = {
    automaticStartEnabled: async () => true,
    readLease: async () => lease,
    storedComparison: async () => false,
    allowanceReached: async () => false,
    claim,
    settle: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    lookup,
  };
  return { deps, lookup, claim };
}
const automatic = { leaseId: "9102", trigger: "automatic" as const, operationId: "op-1" };
const staff = { leaseId: "9102", trigger: "staff" as const, operationId: "op-1" };

describe("S250 server fence: the automatic start looks up no lease a standing agreement covers", () => {
  it("a covered lease is not looked up by itself, and no claim is taken", async () => {
    const { deps, lookup, claim } = harness({
      ...LEASE,
      ownerStepCoverage: "covered",
    } as KickoffLeaseRead);
    const result = await runKickoffPreparation(STAFF, automatic, deps);
    expect(result).toMatchObject({ status: "covered", billed: false });
    expect(result.message).toMatch(/standing agreement/i);
    expect(lookup).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("coverage that could not be confirmed is refused before any lookup", async () => {
    const { deps, lookup, claim } = harness({
      ...LEASE,
      ownerStepCoverage: "unconfirmed",
    } as KickoffLeaseRead);
    const result = await runKickoffPreparation(STAFF, automatic, deps);
    expect(result).toMatchObject({ status: "refused", code: "coverage_unconfirmed" });
    expect(lookup).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("a staff click on a covered lease still runs the comparison", async () => {
    const { deps, lookup } = harness({
      ...LEASE,
      ownerStepCoverage: "covered",
    } as KickoffLeaseRead);
    expect(await runKickoffPreparation(STAFF, staff, deps)).toMatchObject({
      status: "prepared",
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("a lease that left the rule (or never had one) is an ordinary target", async () => {
    for (const ownerStepCoverage of [null, undefined]) {
      const { deps, lookup } = harness({ ...LEASE, ownerStepCoverage } as KickoffLeaseRead);
      expect(await runKickoffPreparation(STAFF, automatic, deps)).toMatchObject({
        status: "prepared",
      });
      expect(lookup).toHaveBeenCalledTimes(1);
    }
  });
});

// ---- The client fence ------------------------------------------------------------------------

describe("S249 client fence: the automatic start reads only a current batch", () => {
  it("a batch drawn from an out-of-date or incomplete RentVine read starts nothing by itself", () => {
    const base = {
      enabled: true,
      canPrepare: true,
      targets: 1,
      webdriver: false,
      rehearsal: false,
    };
    expect(automaticStartAllowed({ ...base, sourceCurrent: true })).toBe(true);
    expect(automaticStartAllowed({ ...base, sourceCurrent: false })).toBe(false);
  });
});

// ---- The desk: one coverage identity through an aging read ------------------------------------

const COVERED = S246_LEASES.activeInMonth;
const PORTFOLIO = String(Number(COVERED) + 9000);
const POLICY_ID = "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b";
const AGREEMENT_ID = "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c";
const policy: RenewalPricingPolicy = {
  id: POLICY_ID,
  name: "Sample three percent rule",
  kind: "percentage",
  value: 3,
  effectiveFrom: "2026-10-01",
  effectiveThrough: null,
  enabled: true,
  purpose: "Synthetic rule for tests.",
  version: 1,
  updatedByUid: "synthetic-admin",
  updatedAt: "2026-10-01T15:00:00.000Z",
};
const pricing: RenewalPricingRead = {
  snapshot: {
    assignments: [
      {
        scope: "portfolio",
        sourceId: PORTFOLIO,
        policyId: null,
        version: 1,
        selectedPolicyVersion: null,
        reason: "Pricing basis chosen on the lease",
        recordedByUid: "synthetic-editor",
        recordedAt: "2026-11-01T15:00:00.000Z",
        standing: { kind: "agreement", agreementId: AGREEMENT_ID },
      } as PricingAssignment,
    ],
    policies: [policy],
    agreements: [],
    legacyPolicies: {},
    standingAgreements: [
      {
        id: AGREEMENT_ID,
        name: "Example Standing Agreement",
        policyId: POLICY_ID,
        portfolioId: PORTFOLIO,
        preApprovalStatement: "The owner pre-approves renewals at the recorded rule.",
        effectiveFrom: "2026-10-01",
        endsOn: null,
        agreedBy: "Sample Owner",
        agreedHow: "Written instruction to the office",
        agreedWhen: "October 1, 2026",
        revoked: false,
        version: 1,
        recordedByUid: "synthetic-admin",
        recordedAt: "2026-10-01T16:00:00.000Z",
      },
    ],
  },
  facts: [
    {
      leaseId: COVERED,
      portfolioId: PORTFOLIO,
      currentRent: 1200,
      cycleDate: "2026-12-31",
      rentSource: "RentVine contractual base rent",
    },
  ],
  today: S246_TODAY,
};
const support: KickoffSupportRead = {
  observationsByLease: new Map(),
  signature: true,
  templateApproved: true,
  allowanceReached: false,
  preparationsByLease: new Map(),
};
const typed = (rent: number): ReadonlyMap<string, RenewalWorkingRecord> =>
  new Map([
    [
      COVERED,
      {
        leaseId: COVERED,
        revision: 1,
        fields: {
          terms_rent: {
            value: rent,
            revision: 1,
            origin: "typed",
            recordedAt: "2026-11-05T15:00:00.000Z",
            recordedByUid: "synthetic-editor",
          },
        },
      } as unknown as RenewalWorkingRecord,
    ],
  ]);

async function desk(options: Parameters<typeof loadS246Desk>[0] = {}) {
  const view = await loadS246Desk({
    pricing,
    kickoffSupport: support,
    working: new Map(),
    ...options,
  });
  const rows = projectRenewalBatchRows(view.items, {
    sourceReadAtIso: S246_READ_TS,
    todayIso: S246_TODAY,
  });
  const row = rows.find((entry) => entry.leaseId === COVERED)!;
  // The batch's preparation targets, read as the batch view reads them.
  const targets = rows
    .filter(
      (entry) =>
        entry.kickoff?.needsComparison && !entry.kickoff.allowanceReached && entry.canOpen,
    )
    .map((entry) => entry.leaseId);
  return { authority: s246Row(view, COVERED).renewalPricing?.authority, row, targets };
}

describe("S250 desk: coverage keeps its identity, and only a lease that needs a comparison is a target", () => {
  it("a covered lease on a current read carries the tag and is no preparation target", async () => {
    const { authority, row, targets } = await desk();
    expect(authority).toMatchObject({ covered: true, kind: "standing" });
    expect(row.tags.map((tag) => tag.key)).toContain("standing_agreement");
    expect(targets).not.toContain(COVERED);
  });

  it("an aging but complete read keeps the standing agreement's coverage, its tag and its step", async () => {
    const { authority, row, targets } = await desk({ currency: "stale" });
    expect(authority).toMatchObject({ covered: true, kind: "standing" });
    expect(row.tags.map((tag) => tag.key)).toContain("standing_agreement");
    expect(row.nextStep.stepId).toBe("offer-tenant");
    expect(targets).not.toContain(COVERED);
  });

  it("an expired read says coverage could not be confirmed, names the agreement and is no target", async () => {
    const { authority, row, targets } = await desk({ currency: "expired" });
    expect(authority).toMatchObject({
      covered: false,
      unconfirmed: true,
      kind: "standing",
      label: "Example Standing Agreement",
    });
    expect(authority?.reason).toMatch(/could not be confirmed/);
    expect(row.nextStep.stepId).toBe("ask-owner");
    expect(targets).not.toContain(COVERED);
  });

  it("an incomplete RentVine read says coverage could not be confirmed and is no target", async () => {
    const { authority, targets } = await desk({ snapshotComplete: false });
    expect(authority).toMatchObject({ covered: false, unconfirmed: true });
    expect(targets).not.toContain(COVERED);
  });

  it("a working record that could not be read says coverage could not be confirmed and is no target", async () => {
    const { authority, targets } = await desk({ working: undefined });
    expect(authority).toMatchObject({ covered: false, unconfirmed: true, kind: "standing" });
    expect(targets).not.toContain(COVERED);
  });

  it("a lease that left the rule with a typed rent is an ordinary target again (L47)", async () => {
    const { authority, row, targets } = await desk({ working: typed(1300) });
    expect(authority).toMatchObject({ covered: false, kind: "standing" });
    expect(authority?.unconfirmed).toBeUndefined();
    expect(authority?.reason).toMatch(/differs from/);
    expect(row.nextStep.stepId).toBe("ask-owner");
    expect(targets).toContain(COVERED);
  });
});
