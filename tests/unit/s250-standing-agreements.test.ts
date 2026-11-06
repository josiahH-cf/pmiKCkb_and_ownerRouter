import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StandingOwnerAgreementInputSchema,
  policyPrefill,
  resolveRenewalPricing,
  type PricingAssignment,
  type RenewalPricingPolicy,
  type RenewalPricingSnapshot,
  type StandingOwnerAgreement,
  type VerifiedPricingLease,
} from "@/lib/lease-renewal/renewal-pricing-policy";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
} from "@/lib/lease-renewal/workspace-state";
import { renewalBatchRowTags } from "@/lib/lease-renewal/renewal-batch-row";
import {
  projectRenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import { projectRenewalPreparation } from "@/lib/lease-renewal/renewal-preparation";

// S250: standing owner agreements set once per owner portfolio and chosen on the lease. Every
// name, id and amount is synthetic. The fixture's rule is a 3 percent increase on a $1,700.00
// current rent, which rounds to $1,751.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const TODAY = "2026-11-06";
const POLICY_ID = "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b";
const AGREEMENT_ID = "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c";
const OTHER_AGREEMENT_ID = "3d4e5f60-7182-4c93-8da4-be5f6a7b8c9d";
const PORTFOLIO = "9402";

const policy = (overrides: Partial<RenewalPricingPolicy> = {}): RenewalPricingPolicy => ({
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
  ...overrides,
});

/** One S250 standing agreement (portfolio scope, no cycle date, no lease list, no exact terms). */
const agreement = (overrides: Record<string, unknown> = {}) => ({
  id: AGREEMENT_ID,
  name: "Example Standing Agreement",
  policyId: POLICY_ID,
  portfolioId: PORTFOLIO,
  preApprovalStatement:
    "The owner pre-approves every renewal in this portfolio at the recorded rule.",
  effectiveFrom: "2026-10-01",
  endsOn: null,
  agreedBy: "Sample Owner",
  agreedHow: "Written instruction to the office",
  agreedWhen: "October 1, 2026",
  revoked: false,
  version: 1,
  recordedByUid: "synthetic-admin",
  recordedAt: "2026-10-01T16:00:00.000Z",
  ...overrides,
});

const portfolioAssignment = (
  standing: unknown = { kind: "agreement", agreementId: AGREEMENT_ID },
): PricingAssignment =>
  ({
    scope: "portfolio",
    sourceId: PORTFOLIO,
    policyId: null,
    version: 1,
    selectedPolicyVersion: null,
    reason: "Pricing basis chosen on the lease",
    recordedByUid: "synthetic-editor",
    recordedAt: "2026-11-01T15:00:00.000Z",
    standing,
  }) as PricingAssignment;

const leaseAssignment = (leaseId: string, standing: unknown): PricingAssignment =>
  ({
    scope: "lease",
    sourceId: leaseId,
    policyId: null,
    version: 1,
    selectedPolicyVersion: null,
    reason: "Pricing basis chosen on the lease",
    recordedByUid: "synthetic-editor",
    recordedAt: "2026-11-02T15:00:00.000Z",
    standing,
  }) as PricingAssignment;

const snapshot = (
  overrides: Partial<RenewalPricingSnapshot> & Record<string, unknown> = {},
): RenewalPricingSnapshot =>
  ({
    assignments: [portfolioAssignment()],
    policies: [policy()],
    agreements: [],
    legacyPolicies: {},
    standingAgreements: [agreement()],
    ...overrides,
  }) as RenewalPricingSnapshot;

const lease = (
  leaseId: string,
  cycleDate: string,
  overrides: Partial<VerifiedPricingLease> = {},
): VerifiedPricingLease => ({
  leaseId,
  portfolioId: PORTFOLIO,
  currentRent: 1700,
  cycleDate,
  rentSource: "RentVine contractual base rent",
  ...overrides,
});

const resolve = (
  facts: VerifiedPricingLease,
  read: RenewalPricingSnapshot = snapshot(),
  workingRent: number | null = null,
  today = TODAY,
) =>
  (
    resolveRenewalPricing as unknown as (
      ...args: unknown[]
    ) => ReturnType<typeof resolveRenewalPricing>
  )(read, facts, null, today, { workingRent });

describe("S250 ARCH-S250-1: the standing agreement kind", () => {
  it("is represented with a pre-approval statement, dates and portfolio scope, without a cycle date, lease list or exact terms", async () => {
    const recorded = agreement();
    const { version, recordedByUid, recordedAt, ...input } = recorded;
    void version;
    void recordedByUid;
    void recordedAt;
    // The S194 exact record requires a cycle date, a lease list and exact terms.
    expect(StandingOwnerAgreementInputSchema.safeParse(input).success).toBe(false);
    const { StandingAgreementInputSchema } = await import(
      "@/lib/lease-renewal/standing-agreement"
    );
    expect(StandingAgreementInputSchema.safeParse(input).success).toBe(true);
    expect(Object.keys(input)).not.toEqual(
      expect.arrayContaining(["cycleDate", "leaseIds", "terms"]),
    );
  });

  it("keeps the S194 exact agreement a distinct valid kind (R-S250-9)", () => {
    const exact = {
      id: OTHER_AGREEMENT_ID,
      policyId: POLICY_ID,
      policyVersion: 1,
      portfolioId: PORTFOLIO,
      leaseIds: ["9102"],
      cycleDate: "2026-12-31",
      terms: { rent: 1751, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      evidenceRef: "Synthetic owner instruction reference",
      effectiveFrom: "2026-10-01",
      expiresOn: "2027-12-31",
      revoked: false,
    };
    expect(StandingOwnerAgreementInputSchema.safeParse(exact).success).toBe(true);
  });
});

describe("S250 ARCH-S250-2 / AC-S250-1: one coverage function, every cycle while in effect", () => {
  it("a portfolio agreement covers two leases of one portfolio across two cycle dates with no per-cycle record", () => {
    for (const facts of [lease("9102", "2026-12-31"), lease("9122", "2027-03-31")]) {
      const resolved = resolve(facts);
      expect(resolved.authority.covered, facts.leaseId).toBe(true);
      expect(resolved.authority).toMatchObject({
        kind: "standing",
        label: "Example Standing Agreement",
        rule: "Raise the current rent by 3 percent",
        amount: 1751,
      });
      expect(resolved.authority.reason).toContain(
        "Covered by Example Standing Agreement: no owner message needed",
      );
    }
  });

  it("the next cycle, a year later, is still covered while the agreement is in effect", () => {
    const later = resolve(lease("9102", "2027-12-31"), snapshot(), null, "2027-11-06");
    expect(later.authority.covered).toBe(true);
  });
});

describe("S250 R-S250-4: the rent to recommend is the rule applied to the current rent", () => {
  it("percentage, fixed-dollar and no-increase rules round to whole dollars, with the basis in words", () => {
    const cases: [Partial<RenewalPricingPolicy>, number, string][] = [
      [{ kind: "percentage", value: 3 }, 1751, "Raise the current rent by 3 percent"],
      [{ kind: "fixed_dollar", value: 75 }, 1775, "Raise the current rent by $75"],
      [{ kind: "no_increase", value: null }, 1700, "Keep the current rent"],
    ];
    for (const [rule, amount, words] of cases) {
      const resolved = resolve(
        lease("9102", "2026-12-31"),
        snapshot({ policies: [policy(rule)] }),
      );
      expect(resolved.proposal?.amount, words).toBe(amount);
      expect(resolved.authority).toMatchObject({ covered: true, amount, rule: words });
      expect(resolved.authority.basis).toContain("applied to the current rent of $1,700.00");
    }
  });

  it("prefills only an untouched field and fills Rent to recommend from the agreement with its basis", () => {
    const resolved = resolve(lease("9102", "2026-12-31"));
    expect(
      policyPrefill({
        proposal: resolved.proposal!,
        workingEntry: null,
        recordedOwnerRent: null,
      })?.value,
    ).toBe(1751);
    // AC-S250-4: a typed rent is never overwritten.
    expect(
      policyPrefill({
        proposal: resolved.proposal!,
        workingEntry: { value: 1800 },
        recordedOwnerRent: null,
      }),
    ).toBeNull();
    const preparation = projectRenewalPreparation({
      numbers: {
        contractualRent: 1700,
        rentCharges: null,
        leaseEndIso: "2026-12-31",
        workingRent: null,
        sheetRent: null,
        sheetEndIso: null,
        sourceReadable: true,
      },
      comparison: { state: "none" },
      typedRent: null,
      agreementRent: {
        value: resolved.authority.amount!,
        basis: resolved.authority.basis!,
      },
      currentRent: 1700,
      ownerRecipient: { state: "ready" },
      signature: true,
      templateApproved: true,
      address: "100 Sample Street",
    });
    expect(preparation.rent).toMatchObject({ value: 1751, origin: "agreement" });
    expect(preparation.rent.basis).toContain("Example Standing Agreement");
  });
});

describe("S250 BEH-S250-2: lease choice wins; removing it reveals the portfolio default", () => {
  it("Owner decides on the lease overrides the portfolio agreement, and clearing it covers again", () => {
    const overridden = resolve(
      lease("9102", "2026-12-31"),
      snapshot({
        assignments: [
          portfolioAssignment(),
          leaseAssignment("9102", { kind: "owner_decides" }),
        ],
      }),
    );
    expect(overridden.authority.covered).toBe(false);
    const cleared = resolve(
      lease("9102", "2026-12-31"),
      snapshot({
        assignments: [portfolioAssignment(), leaseAssignment("9102", null)],
      }),
    );
    expect(cleared.authority.covered).toBe(true);
    expect(cleared.authority.appliedScope).toBe("portfolio");
  });
});

describe("S250 BEH-S250-3: the owner step reads covered and the path continues at Offer the tenant", () => {
  it("the staff lane and the stage skip the owner step for a covered lease", () => {
    const resolved = resolve(lease("9102", "2026-12-31"));
    const lane = manualRenewalSummary(null, {
      standingOwnerAuthority: resolved.authority.covered,
    });
    expect(lane.nextActivity).toBe("tenant_offer");
    const context: RenewalStageContext = {
      leaseId: "9102",
      staffRecordUnavailable: false,
      standingAgreement: resolved.authority.covered
        ? {
            label: (resolved.authority as { label?: string }).label ?? null,
            reason: resolved.authority.reason,
          }
        : null,
      housingAssistance: null,
      numbers: { verified: true, openDifferences: 0 },
      term: { monthToMonth: false, reviewNeeded: false },
      moveOutInitiated: false,
      sourceRenewal: null,
      verification: null,
      handStatus: null,
      lastContactAtIso: null,
      threadCheck: null,
      outreach: null,
    };
    const stage = projectRenewalStage(null, context, { standingCovered: true });
    expect(stage.currentStepId).toBe("offer-tenant");
    expect(stage.steps.find((step) => step.id === "ask-owner")).toMatchObject({
      state: "covered",
      detail: "Covered by Example Standing Agreement: no owner message needed",
    });
    // The desk row carries the Standing agreement tag.
    expect(
      renewalBatchRowTags(
        { renewalPricing: resolved as never },
        { needsCheck: false, checkDetail: null },
      ).map((tag) => tag.label),
    ).toEqual(["Standing agreement"]);
  });
});

describe("S250 BEH-S250-4 / AC-S250-2: leaving the rule returns the owner step with the reason", () => {
  const cases: [string, () => ReturnType<typeof resolve>, RegExp][] = [
    [
      "a typed rent different from the rule",
      () => resolve(lease("9102", "2026-12-31"), snapshot(), 1800),
      /working rent \$1,800\.00 differs from \$1,751\.00/,
    ],
    [
      "an ended agreement",
      () =>
        resolve(
          lease("9102", "2026-12-31"),
          snapshot({ standingAgreements: [agreement({ endsOn: "2026-10-31" })] }),
        ),
      /ended on 10\/31\/2026/,
    ],
    [
      "a revoked agreement",
      () =>
        resolve(
          lease("9102", "2026-12-31"),
          snapshot({ standingAgreements: [agreement({ revoked: true })] }),
        ),
      /was revoked/,
    ],
    [
      "an agreement with no pre-approval statement",
      () =>
        resolve(
          lease("9102", "2026-12-31"),
          snapshot({ standingAgreements: [agreement({ preApprovalStatement: null })] }),
        ),
      /records no owner pre-approval/,
    ],
    [
      "an unverifiable portfolio",
      () =>
        resolve(
          lease("9102", "2026-12-31", { portfolioId: "" }),
          snapshot({
            assignments: [
              leaseAssignment("9102", { kind: "agreement", agreementId: AGREEMENT_ID }),
            ],
          }),
        ),
      /portfolio could not be verified/,
    ],
    [
      "a lease outside the agreement's portfolio",
      () =>
        resolve(
          lease("9101", "2026-12-31", { portfolioId: "9401" }),
          snapshot({
            assignments: [
              leaseAssignment("9101", { kind: "agreement", agreementId: AGREEMENT_ID }),
            ],
          }),
        ),
      /outside the portfolio of Example Standing Agreement/,
    ],
    [
      "two conflicting agreements",
      () =>
        resolve(
          lease("9102", "2026-12-31"),
          snapshot({
            agreements: [
              {
                id: OTHER_AGREEMENT_ID,
                policyId: POLICY_ID,
                policyVersion: 1,
                portfolioId: PORTFOLIO,
                leaseIds: ["9102"],
                cycleDate: "2026-12-31",
                terms: {
                  rent: 1790,
                  effectiveDate: "2027-01-01",
                  endDate: "2027-12-31",
                },
                evidenceRef: "Synthetic exact agreement reference",
                effectiveFrom: "2026-10-01",
                expiresOn: "2027-12-31",
                revoked: false,
                version: 1,
                recordedByUid: "synthetic-admin",
                recordedAt: "2026-10-02T15:00:00.000Z",
              } satisfies StandingOwnerAgreement,
            ],
          }),
        ),
      /Two agreements with different rents/,
    ],
  ];
  for (const [name, read, reason] of cases)
    it(`${name} requires the owner step`, () => {
      const resolved = read();
      expect(resolved.authority.covered).toBe(false);
      expect(resolved.authority.reason).toMatch(reason);
      // Unrelated work is never stopped: the lane still names the owner outreach next.
      expect(
        manualRenewalSummary(null, { standingOwnerAuthority: false }).nextActivity,
      ).toBe("owner_outreach");
    });
});

describe("S250 R-S250-9: existing records keep their meaning", () => {
  it("an older portfolio rule still proposes a rent and never covers the owner step", () => {
    const resolved = resolve(
      lease("9102", "2026-12-31"),
      snapshot({
        assignments: [],
        standingAgreements: [],
        legacyPolicies: {
          [PORTFOLIO]: policy({ id: "4e5f6071-8293-4da4-9eb5-cf6a7b8c9d0e" }),
        },
      }),
    );
    expect(resolved.proposal?.amount).toBe(1751);
    expect(resolved.authority.covered).toBe(false);
    expect(resolved.authority.reason).toBe(
      "No applicable recorded standing owner authority. Individual owner review is required.",
    );
  });
});

describe("S250 BEH-S250-5 / AC-S250-4: a rule change applies forward only", () => {
  it("a changed rule changes later proposals; a rent adopted from the earlier rule keeps its value and is named as built on it", async () => {
    const { adoptedStandingRule, standingRuleContext } = await import(
      "@/lib/lease-renewal/standing-agreement"
    );
    const before = resolve(lease("9102", "2026-12-31"));
    const changed = snapshot({
      policies: [
        policy(),
        policy({ value: 4, version: 2, updatedAt: "2026-11-05T15:00:00.000Z" }),
      ],
    });
    const after = resolve(lease("9102", "2026-12-31"), changed, 1751);
    expect(before.proposal?.amount).toBe(1751);
    expect(after.proposal?.amount).toBe(1768);
    // The saved working rent keeps its value; the lease returns to the owner step.
    expect(after.authority.covered).toBe(false);
    expect(after.authority.reason).toMatch(/\$1,751\.00 differs from \$1,768\.00/);
    const adopted = adoptedStandingRule({
      origin: "adopted_source",
      context: standingRuleContext({
        agreementId: AGREEMENT_ID,
        policyId: POLICY_ID,
        policyVersion: 1,
        basis: before.authority.basis!,
      }),
    });
    expect(adopted).toEqual({
      agreementId: AGREEMENT_ID,
      policyId: POLICY_ID,
      policyVersion: 1,
    });
    expect(adopted!.policyVersion).not.toBe(after.policy?.version);
  });

  it("recording the agreement records no owner response and leaves the staff record as it was", () => {
    const state = emptyRenewalWorkspace("9102", "5a1b2c3d-4e5f-4061-8172-93a4b5c6d7e8", {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    });
    const covered = resolve(lease("9102", "2026-12-31"));
    expect(covered.authority.covered).toBe(true);
    expect(state.ownerResponse).toBeNull();
    expect(manualRenewalSummary(state, { standingOwnerAuthority: true })).toMatchObject({
      nextActivity: "tenant_offer",
    });
  });
});
