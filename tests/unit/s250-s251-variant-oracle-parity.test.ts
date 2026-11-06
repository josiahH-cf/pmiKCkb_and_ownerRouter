import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyRenewalCohort } from "@/lib/lease-renewal/cohort";
import { DESK_GUIDANCE_CONTRACT } from "@/lib/lease-renewal/desk-guidance";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import {
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import {
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
  type ManualActivity,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { INDEPENDENT_UNRECORDED_STAFF_LANE } from "@/lib/production-assurance/manual-renewal-projection";
import {
  INDEPENDENT_VARIANTS_CONTRACT_MARKER,
  independentContractReadsEvidence,
  independentContractReadsVariants,
  independentStaffLaneWaitingRule,
} from "@/lib/production-assurance/renewal-source-projection";
import {
  independentHousingAssistance,
  independentOwnerStepCovered,
  independentPricingCycleDate,
  independentVariantSkipSignal,
  projectIndependentVariantManualRenewal,
  type IndependentVariantDocuments,
} from "@/lib/production-assurance/variant-projection";

// S250/S251 release reconciliation parity: the app's desk projection (the one coverage function
// and the staff summary) and the oracle's independent projection agree over one fixture matrix.
// The oracle never imports the app's coverage, summary or cohort; this test runs both. Every
// name, id and amount is synthetic.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

const TODAY = "2026-11-06";
const POLICY_ID = "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b";
const AGREEMENT_ID = "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c";
const PORTFOLIO = "9402";
const LEASE = "9102";
const CYCLE = "2026-12-31";

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
const agreement = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});
const assignment = (
  scope: "lease" | "portfolio",
  sourceId: string,
  standing: unknown,
  policyId: string | null = null,
): PricingAssignment =>
  ({
    scope,
    sourceId,
    policyId,
    version: 1,
    selectedPolicyVersion: policyId ? 1 : null,
    reason: "Pricing basis chosen on the lease",
    recordedByUid: "synthetic-editor",
    recordedAt: "2026-11-01T15:00:00.000Z",
    standing,
  }) as PricingAssignment;
const exactAgreement = (
  rent: number,
  overrides: Partial<StandingOwnerAgreement> = {},
): StandingOwnerAgreement =>
  ({
    id: "4e5f6071-8293-4da4-9eb5-cf6a7b8c9dae",
    policyId: POLICY_ID,
    policyVersion: 1,
    portfolioId: PORTFOLIO,
    leaseIds: [LEASE],
    cycleDate: CYCLE,
    terms: { rent, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
    evidenceRef: "synthetic-evidence",
    effectiveFrom: "2026-10-01",
    expiresOn: "2027-06-30",
    revoked: false,
    version: 1,
    recordedByUid: "synthetic-admin",
    recordedAt: "2026-10-01T16:00:00.000Z",
    ...overrides,
  }) as StandingOwnerAgreement;

interface CoverageCase {
  readonly name: string;
  readonly assignments: readonly PricingAssignment[];
  readonly standingAgreements?: readonly Record<string, unknown>[];
  readonly policies?: readonly RenewalPricingPolicy[];
  readonly exact?: readonly StandingOwnerAgreement[];
  /** The older (S62) portfolio rule, as `owner_policy_rules` stores it. */
  readonly olderRule?: Record<string, unknown>;
  readonly workingRent?: number | null;
  /** The working effective and end dates (with the rent, the complete working terms). */
  readonly workingDates?: { readonly effective: string; readonly end: string };
  readonly portfolioId?: string | null;
  readonly currentRent?: number | null;
  readonly cycleDate?: string;
  /** The desk's answer this fixture must reach, so the matrix proves both kinds. */
  readonly expectKind?: "exact" | "standing" | null;
}
/** The id the pricing store gives an older portfolio rule (its legacy policy). */
const legacyPolicyId = (portfolioId: string) => {
  const h = createHash("sha256")
    .update(JSON.stringify(["legacy-renewal-policy", portfolioId]))
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const OLDER_RULE = {
  id: PORTFOLIO,
  portfolio_id: PORTFOLIO,
  kind: "flat_percent_increase",
  percent: 3,
  effective_from: "2026-10-01",
  note: "Synthetic older rule",
  updated_by_uid: "synthetic-admin",
  updated_at: "2026-10-01T15:00:00.000Z",
};
const TERMS_DATES = { effective: "2027-01-01", end: "2027-12-31" } as const;
const SECOND_POLICY_ID = "5f607182-93a4-4eb5-8fc6-d07b8c9daebf";
const SECOND_AGREEMENT_ID = "60718293-a4b5-4fc6-9d07-e18c9daebfc0";
const portfolioPolicy = assignment("portfolio", PORTFOLIO, null, POLICY_ID);
const portfolioAgreement = assignment("portfolio", PORTFOLIO, {
  kind: "agreement",
  agreementId: AGREEMENT_ID,
});
const COVERAGE_CASES: readonly CoverageCase[] = [
  { name: "covered by the portfolio choice", assignments: [portfolioAgreement] },
  { name: "the rule's rent typed", assignments: [portfolioAgreement], workingRent: 1751 },
  {
    name: "a different typed rent",
    assignments: [portfolioAgreement],
    workingRent: 1800,
  },
  {
    name: "ended",
    assignments: [portfolioAgreement],
    standingAgreements: [agreement({ endsOn: "2026-11-01" })],
  },
  {
    name: "revoked",
    assignments: [portfolioAgreement],
    standingAgreements: [agreement({ revoked: true })],
  },
  {
    name: "not yet in effect",
    assignments: [portfolioAgreement],
    standingAgreements: [agreement({ effectiveFrom: "2026-12-01" })],
  },
  {
    name: "no owner pre-approval",
    assignments: [portfolioAgreement],
    standingAgreements: [agreement({ preApprovalStatement: null })],
  },
  {
    name: "unverifiable portfolio",
    assignments: [
      assignment("lease", LEASE, { kind: "agreement", agreementId: AGREEMENT_ID }),
    ],
    portfolioId: null,
  },
  {
    name: "lease outside the agreement's portfolio",
    assignments: [
      assignment("lease", LEASE, { kind: "agreement", agreementId: AGREEMENT_ID }),
    ],
    standingAgreements: [agreement({ portfolioId: "9401" })],
  },
  {
    name: "a conflicting exact agreement",
    assignments: [portfolioAgreement],
    exact: [exactAgreement(1800)],
  },
  {
    name: "an exact agreement for the same rent",
    assignments: [portfolioAgreement],
    exact: [exactAgreement(1751)],
  },
  {
    name: "rule disabled",
    assignments: [portfolioAgreement],
    policies: [policy({ enabled: false })],
  },
  {
    name: "no current rent",
    assignments: [portfolioAgreement],
    currentRent: null,
  },
  {
    name: "owner decides at the portfolio",
    assignments: [assignment("portfolio", PORTFOLIO, { kind: "owner_decides" })],
  },
  {
    name: "the lease's owner decides over the portfolio agreement",
    assignments: [
      portfolioAgreement,
      assignment("lease", LEASE, { kind: "owner_decides" }),
    ],
  },
  {
    name: "the lease's agreement with no portfolio choice",
    assignments: [
      assignment("lease", LEASE, { kind: "agreement", agreementId: AGREEMENT_ID }),
    ],
  },
  {
    name: "an older portfolio rule and no basis choice",
    assignments: [],
    legacy: {
      [PORTFOLIO]: { kind: "percentage", value: 3, version: 1, enabled: true },
    },
  },
  {
    name: "a plain policy assignment and no basis choice",
    assignments: [assignment("portfolio", PORTFOLIO, null, POLICY_ID)],
  },
  // ---- S194's exact per-lease, per-cycle kind (R-S250-9: it keeps working as it does today) ----
  {
    name: "S194 exact: one current agreement covers its lease, cycle and exact terms",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
    expectKind: "exact",
  },
  {
    name: "S194 exact: the lease's own policy assignment selects the agreement's policy",
    assignments: [assignment("lease", LEASE, null, POLICY_ID)],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
    expectKind: "exact",
  },
  {
    name: "S194 exact: the working rent differs from the agreement",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751)],
    workingRent: 1760,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: the working dates differ from the agreement",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: { effective: "2027-02-01", end: "2027-12-31" },
  },
  {
    name: "S194 exact: the working terms are incomplete",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
  },
  {
    name: "S194 exact: the policy has a newer version than the agreement names",
    assignments: [portfolioPolicy],
    policies: [policy(), policy({ version: 2, updatedAt: "2026-10-15T15:00:00.000Z" })],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: the agreement names another lease's cycle",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751, { cycleDate: "2027-01-31" })],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: the agreement expired",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751, { expiresOn: "2026-11-01" })],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: the agreement was revoked",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751, { revoked: true })],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: two current agreements for the lease conflict",
    assignments: [portfolioPolicy],
    exact: [
      exactAgreement(1751),
      exactAgreement(1751, { id: "7a8b9cad-becf-4d0e-8f1a-2b3c4d5e6f70" }),
    ],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: the lease is outside the agreement's portfolio",
    assignments: [portfolioPolicy],
    exact: [exactAgreement(1751, { portfolioId: "9401" })],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: no policy is assigned and no older rule applies",
    assignments: [],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: only the older portfolio rule applies, and the agreement names a stored policy",
    assignments: [],
    olderRule: OLDER_RULE,
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact: the agreement names the older portfolio rule's policy",
    assignments: [],
    olderRule: OLDER_RULE,
    exact: [exactAgreement(1751, { policyId: legacyPolicyId(PORTFOLIO) })],
    workingRent: 1751,
    workingDates: TERMS_DATES,
    expectKind: "exact",
  },
  {
    name: "S194 exact: an older rule not yet in effect",
    assignments: [],
    olderRule: { ...OLDER_RULE, effective_from: "2026-12-01" },
    exact: [exactAgreement(1751, { policyId: legacyPolicyId(PORTFOLIO) })],
    workingRent: 1751,
    workingDates: TERMS_DATES,
  },
  {
    name: "S194 exact covers while a standing agreement chosen on the portfolio has another rent",
    assignments: [
      assignment(
        "portfolio",
        PORTFOLIO,
        { kind: "agreement", agreementId: SECOND_AGREEMENT_ID },
        POLICY_ID,
      ),
    ],
    policies: [
      policy(),
      policy({ id: SECOND_POLICY_ID, name: "Sample five percent rule", value: 5 }),
    ],
    standingAgreements: [
      agreement({ id: SECOND_AGREEMENT_ID, policyId: SECOND_POLICY_ID }),
    ],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
    expectKind: "exact",
  },
  {
    name: "S194 exact and S250 standing agree on the rent: either covers",
    assignments: [
      assignment(
        "portfolio",
        PORTFOLIO,
        { kind: "agreement", agreementId: AGREEMENT_ID },
        POLICY_ID,
      ),
    ],
    exact: [exactAgreement(1751)],
    workingRent: 1751,
    workingDates: TERMS_DATES,
    expectKind: "exact",
  },
];

/** The working record document as stored, with the fields this fixture sets. */
function workingDocument(c: CoverageCase, housing?: unknown) {
  return {
    leaseId: LEASE,
    revision: 1,
    fields: {
      ...(c.workingRent != null
        ? { terms_rent: { value: c.workingRent, revision: 1 } }
        : {}),
      ...(c.workingDates
        ? {
            terms_effective_date: { value: c.workingDates.effective, revision: 1 },
            terms_end_date: { value: c.workingDates.end, revision: 1 },
          }
        : {}),
      ...(housing !== undefined ? { housing_assistance: { value: housing } } : {}),
    },
  };
}

function appAuthority(c: CoverageCase) {
  const portfolioId = c.portfolioId === null ? "" : (c.portfolioId ?? PORTFOLIO);
  const olderRule = c.olderRule;
  const legacy =
    olderRule &&
    typeof olderRule.effective_from === "string" &&
    olderRule.effective_from <= TODAY &&
    !c.assignments.some((a) => a.scope === "portfolio" && a.policyId)
      ? {
          [PORTFOLIO]: {
            id: legacyPolicyId(PORTFOLIO),
            version: 1,
            name: `Portfolio ${PORTFOLIO} legacy rule`,
            kind: "percentage",
            value: olderRule.percent,
            effectiveFrom: olderRule.effective_from,
            effectiveThrough: null,
            enabled: true,
            purpose: olderRule.note || "Legacy pricing rule",
            updatedByUid: olderRule.updated_by_uid,
            updatedAt: olderRule.updated_at ?? "",
          },
        }
      : {};
  const snapshot = {
    assignments: [...c.assignments],
    policies: [...(c.policies ?? [policy()])],
    agreements: [...(c.exact ?? [])],
    legacyPolicies: legacy,
    standingAgreements: [...(c.standingAgreements ?? [agreement()])],
  } as unknown as RenewalPricingSnapshot;
  const fact: VerifiedPricingLease = {
    leaseId: LEASE,
    portfolioId,
    currentRent: c.currentRent === undefined ? 1700 : c.currentRent,
    cycleDate: c.cycleDate ?? CYCLE,
    rentSource: "RentVine contractual base rent",
  };
  // The desk's own reading of the working record (live-desk.ts): the complete terms and the rent.
  const working = workingDocument(c) as unknown as RenewalWorkingRecord;
  return resolveRenewalPricing(
    snapshot,
    fact,
    effectiveRenewalTerms(working).complete,
    TODAY,
    { workingRent: workingRenewalTerms(working).rent },
  ).authority;
}
const appCovered = (c: CoverageCase): boolean => appAuthority(c).covered;

function documentsFor(c: CoverageCase, housing?: unknown): IndependentVariantDocuments {
  return {
    assignments: new Map(
      c.assignments.map((a) => [`${a.scope}_${a.sourceId}`, { ...a }]),
    ),
    standingAgreements: new Map(
      (c.standingAgreements ?? [agreement()]).map((g) => [String(g.id), { ...g }]),
    ),
    policyVersions: (c.policies ?? [policy()]).map((p) => ({ ...p, policyId: p.id })),
    exactAgreements: (c.exact ?? []).map((g) => ({ ...g })),
    workingRecords: new Map([[LEASE, workingDocument(c, housing)]]),
    olderRules: new Map(c.olderRule ? [[PORTFOLIO, { ...c.olderRule }]] : []),
  };
}

function oracleCovered(c: CoverageCase): boolean {
  return independentOwnerStepCovered(
    {
      leaseId: LEASE,
      portfolioId: c.portfolioId === null ? null : (c.portfolioId ?? PORTFOLIO),
      currentRent: c.currentRent === undefined ? 1700 : c.currentRent,
      cycleDate: c.cycleDate ?? CYCLE,
    },
    documentsFor(c),
    TODAY,
  );
}

describe("S250 standing coverage: the app's one coverage function and the oracle agree", () => {
  for (const c of COVERAGE_CASES)
    it(c.name, () => {
      expect(oracleCovered(c)).toBe(appCovered(c));
      if (c.expectKind !== undefined) {
        const authority = appAuthority(c);
        expect(authority.covered ? authority.kind : null).toBe(c.expectKind);
      }
    });
  it("the matrix holds both answers and both kinds", () => {
    const answers = new Set(COVERAGE_CASES.map(appCovered));
    expect(answers).toEqual(new Set([true, false]));
    const kinds = new Set(
      COVERAGE_CASES.map(appAuthority).flatMap((a) => (a.covered ? [a.kind] : [])),
    );
    expect(kinds).toEqual(new Set(["exact", "standing"]));
  });
});


// ---- The staff lane ------------------------------------------------------------------------

const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const record = (termsRevision = 0) => ({
  eventId: "00000000-0000-4000-8000-000000000001",
  actorUid: "fixture-staff",
  recordedAt: "2026-11-01T12:00:00.000Z",
  source: "Fixture source",
  termsRevision,
});
const POST_ACCEPTANCE: readonly ManualActivity[] = [
  "information_form",
  "form_returned",
  "documents",
  "document_delivery",
  "signatures",
  "insurance",
  "rhino",
  "pet",
  "charges",
  "inspection",
  "filter",
  "utilities",
];

type StateCase = readonly [string, () => RenewalWorkspaceState | null];
function state(build: (s: RenewalWorkspaceState) => void): () => RenewalWorkspaceState {
  return () => {
    const s = emptyRenewalWorkspace(LEASE, CYCLE_ID, {
      kind: "lease_end",
      dateIso: CYCLE,
      source: "RentVine lease end",
    });
    s.revision = 3;
    build(s);
    return s;
  };
}
const done = (
  s: RenewalWorkspaceState,
  key: ManualActivity,
  revision = s.termsRevision,
) => {
  s.activities[key] = { ...record(revision), outcome: "done" };
};
const answer = (s: RenewalWorkspaceState, outcome: string) => {
  s.ownerResponse = {
    ...record(s.termsRevision),
    outcome,
    ...(outcome === "approved_terms"
      ? { terms: { rent: 1751, effectiveDate: "2027-01-01", endDate: "2027-12-31" } }
      : {}),
  } as RenewalWorkspaceState["ownerResponse"];
};
const choose = (s: RenewalWorkspaceState, choice: "keep_current" | "propose_change") => {
  s.rentChoice = { ...record(s.termsRevision), choice };
};
const accepted = (s: RenewalWorkspaceState) => {
  s.tenantResponse = { ...record(s.termsRevision), outcome: "accepted" };
};

const STATE_CASES: readonly StateCase[] = [
  ["nothing recorded", () => null],
  ["an empty record", state(() => undefined)],
  ["program contact recorded", state((s) => done(s, "program_contact"))],
  [
    "program contact and outreach",
    state((s) => {
      done(s, "program_contact");
      done(s, "owner_outreach");
    }),
  ],
  [
    "Renew recorded, no rent choice",
    state((s) => {
      done(s, "program_contact");
      answer(s, "renew_tenant");
    }),
  ],
  [
    "Renew and Keep the current rent",
    state((s) => {
      done(s, "program_contact");
      answer(s, "renew_tenant");
      choose(s, "keep_current");
    }),
  ],
  [
    "Renew and Propose a change",
    state((s) => {
      done(s, "program_contact");
      answer(s, "renew_tenant");
      choose(s, "propose_change");
    }),
  ],
  [
    "No answer yet",
    state((s) => {
      done(s, "program_contact");
      done(s, "owner_outreach");
      answer(s, "no_response");
    }),
  ],
  [
    "Do not renew",
    state((s) => {
      done(s, "program_contact");
      answer(s, "declined_non_renewal");
    }),
  ],
  [
    "an approval of terms",
    state((s) => {
      done(s, "owner_outreach");
      answer(s, "approved_terms");
    }),
  ],
  [
    "a revision requested",
    state((s) => {
      done(s, "owner_outreach");
      answer(s, "revision_requested");
    }),
  ],
  [
    "accepted, assisted-housing follow-up unrecorded",
    state((s) => {
      done(s, "program_contact");
      done(s, "owner_outreach");
      answer(s, "approved_terms");
      done(s, "tenant_offer");
      accepted(s);
      for (const key of POST_ACCEPTANCE) done(s, key);
    }),
  ],
  [
    "accepted, assisted-housing follow-up done",
    state((s) => {
      done(s, "program_contact");
      done(s, "owner_outreach");
      answer(s, "approved_terms");
      done(s, "tenant_offer");
      accepted(s);
      for (const key of POST_ACCEPTANCE) done(s, key);
      done(s, "assisted_housing");
    }),
  ],
  [
    "accepted, assisted-housing follow-up not applicable",
    state((s) => {
      done(s, "program_contact");
      done(s, "owner_outreach");
      answer(s, "approved_terms");
      done(s, "tenant_offer");
      accepted(s);
      for (const key of POST_ACCEPTANCE) done(s, key);
      s.activities.assisted_housing = {
        ...record(s.termsRevision),
        outcome: "not_applicable",
        reason: "No program form for this renewal",
      };
    }),
  ],
  [
    "recorded complete",
    state((s) => {
      done(s, "owner_outreach");
      s.completion = record(s.termsRevision);
    }),
  ],
];
const VARIANTS = [
  { name: "standard", standing: false, housing: undefined },
  { name: "standing agreement", standing: true, housing: undefined },
  { name: "Housing assistance No", standing: false, housing: { status: "no" } },
  {
    name: "Housing assistance Yes",
    standing: false,
    housing: { status: "yes", program: "Example Housing Assistance Office" },
  },
  {
    name: "standing agreement and Housing assistance Yes",
    standing: true,
    housing: { status: "yes", program: "Example Housing Assistance Office" },
  },
] as const;

describe("S251 staff lane: the app's summary and the oracle agree on every compared attribute", () => {
  for (const variant of VARIANTS)
    for (const [name, build] of STATE_CASES)
      it(`${variant.name}: ${name}`, () => {
        const s = build();
        // The oracle reads the fact from the working record document, as stored.
        const program = independentHousingAssistance({
          fields:
            variant.housing === undefined
              ? {}
              : { housing_assistance: { value: variant.housing } },
        });
        const app = manualRenewalSummary(s, {
          standingOwnerAuthority: variant.standing,
          housingAssistance: program ? { program } : null,
        });
        const oracle =
          projectIndependentVariantManualRenewal(s, {
            standingCovered: variant.standing,
            housingAssistance: program,
          }) ?? INDEPENDENT_UNRECORDED_STAFF_LANE;
        expect(oracle.nextActivity).toBe(app.nextActivity);
        expect(oracle.complete).toBe(app.complete);
        // Who has the move decides Waiting or Ready; a recorded completion reads Complete.
        if (!app.complete)
          expect(oracle.awaitedParty ?? null).toBe(
            app.waitingParty === "staff" ? null : app.waitingParty,
          );
        if (s && "pendingSourceUpdates" in oracle)
          expect(oracle.pendingSourceUpdates).toBe(app.pendingSourceUpdates);
      });
});

// S194's exact kind feeds the same one boolean to the staff summary, so every compared lane
// attribute follows it: each staff record under an exact agreement reads the same in both.
describe("S194 exact kind: the staff lane the desk derives from it matches the oracle's", () => {
  const exactCovered = COVERAGE_CASES.find((c) => c.expectKind === "exact")!;
  const exactRefused = COVERAGE_CASES.find(
    (c) => c.name === "S194 exact: the working rent differs from the agreement",
  )!;
  for (const c of [exactCovered, exactRefused])
    for (const [name, build] of STATE_CASES)
      it(`${c.name}: ${name}`, () => {
        const s = build();
        const app = manualRenewalSummary(s, { standingOwnerAuthority: appCovered(c) });
        const oracle =
          projectIndependentVariantManualRenewal(s, {
            standingCovered: oracleCovered(c),
            housingAssistance: null,
          }) ?? INDEPENDENT_UNRECORDED_STAFF_LANE;
        expect(oracle.nextActivity).toBe(app.nextActivity);
        expect(oracle.complete).toBe(app.complete);
        if (!app.complete)
          expect(oracle.awaitedParty ?? null).toBe(
            app.waitingParty === "staff" ? null : app.waitingParty,
          );
      });
});

describe("S194 exact kind: the cycle the agreement is matched against", () => {
  // The desk reads the RentVine lease end, else the staff record's dated basis (live-desk.ts).
  const leaseEnd = state(() => undefined)();
  const leaseBound = state((s) => {
    s.basis = { kind: "lease_bound", source: "Synthetic lease-bound record" };
  })();
  it.each([
    ["the RentVine end date", "2026-12-31", null, "2026-12-31"],
    ["no RentVine end date: the staff record's dated basis", "Needs Verification", leaseEnd, CYCLE],
    ["no RentVine end date and a lease-bound record", "Needs Verification", leaseBound, null],
    ["no RentVine end date and no record", "", null, null],
  ] as const)("%s", (_name, endDate, record, expected) => {
    expect(independentPricingCycleDate(endDate, record)).toBe(expected);
  });
});

describe("S251 program skip signal: the cohort and the oracle agree", () => {
  const CASES: readonly Record<string, unknown>[] = [
    { tags: "Housing choice voucher" },
    { leaseType: "Section 8 Program" },
    { program: "HAP contract" },
    { program: "Section 8" },
    { program: "voucher" },
    { program: "PadSplit" },
    { program: "Rental program" },
    { leaseType: "Fixed Term" },
    { notes: "Owner hold through spring" },
    {},
    // A present field that is not a word: an empty list is present, so the search stops there.
    { tags: [], status: "Program lease" },
    { program: [], leaseType: "Rental program" },
    { tags: "   ", status: "Program lease" },
    { program: 0, leaseType: "Rental program" },
  ];
  for (const fields of CASES)
    it(JSON.stringify(fields), () => {
      const app = classifyRenewalCohort(
        [{ leaseID: 9113, endDate: "2027-01-31", ...fields }],
        {
          windows: [{ startIso: "2026-11-01", endIso: "2027-03-31" }],
        },
      ).classifications[0]!;
      expect(independentVariantSkipSignal(fields)).toBe(app.disposition === "skip");
    });
});

describe("S251 contract marker: the variants rules are a new marker the oracle reads", () => {
  it("the app renders the variants marker and the oracle reads it with the evidence", () => {
    expect(DESK_GUIDANCE_CONTRACT).toBe(INDEPENDENT_VARIANTS_CONTRACT_MARKER);
    expect(independentContractReadsVariants(DESK_GUIDANCE_CONTRACT)).toBe(true);
    expect(independentContractReadsEvidence(DESK_GUIDANCE_CONTRACT)).toBe(true);
    expect(independentStaffLaneWaitingRule(DESK_GUIDANCE_CONTRACT)).toBe("awaited_party");
    expect(independentContractReadsVariants("s248-evidence-stage")).toBe(false);
  });
});
