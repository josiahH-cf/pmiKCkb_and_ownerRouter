import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyRenewalCohort } from "@/lib/lease-renewal/cohort";
import { DESK_GUIDANCE_CONTRACT } from "@/lib/lease-renewal/desk-guidance";
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
  independentStandingCovered,
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
const exactAgreement = (rent: number): StandingOwnerAgreement =>
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
  }) as StandingOwnerAgreement;

interface CoverageCase {
  readonly name: string;
  readonly assignments: readonly PricingAssignment[];
  readonly standingAgreements?: readonly Record<string, unknown>[];
  readonly policies?: readonly RenewalPricingPolicy[];
  readonly exact?: readonly StandingOwnerAgreement[];
  readonly legacy?: Record<string, unknown>;
  readonly workingRent?: number | null;
  readonly portfolioId?: string | null;
  readonly currentRent?: number | null;
}
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
];

function appCovered(c: CoverageCase): boolean {
  const snapshot = {
    assignments: [...c.assignments],
    policies: [...(c.policies ?? [policy()])],
    agreements: [...(c.exact ?? [])],
    legacyPolicies: c.legacy ?? {},
    standingAgreements: [...(c.standingAgreements ?? [agreement()])],
  } as unknown as RenewalPricingSnapshot;
  const fact: VerifiedPricingLease = {
    leaseId: LEASE,
    portfolioId: c.portfolioId === null ? "" : (c.portfolioId ?? PORTFOLIO),
    currentRent: c.currentRent === undefined ? 1700 : c.currentRent,
    cycleDate: CYCLE,
    rentSource: "RentVine contractual base rent",
  };
  const authority = resolveRenewalPricing(snapshot, fact, null, TODAY, {
    workingRent: c.workingRent ?? null,
  }).authority;
  // The variants oracle mirrors the S250 standing kind; the S194 exact kind is not modelled.
  expect(authority.kind ?? "standing", c.name).not.toBe("exact");
  return authority.covered;
}

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
    workingRecords: new Map([
      [
        LEASE,
        {
          leaseId: LEASE,
          revision: 1,
          fields: {
            ...(c.workingRent != null ? { terms_rent: { value: c.workingRent } } : {}),
            ...(housing !== undefined ? { housing_assistance: { value: housing } } : {}),
          },
        },
      ],
    ]),
  };
}

function oracleCovered(c: CoverageCase): boolean {
  return independentStandingCovered(
    {
      leaseId: LEASE,
      portfolioId: c.portfolioId === null ? null : (c.portfolioId ?? PORTFOLIO),
      currentRent: c.currentRent === undefined ? 1700 : c.currentRent,
      cycleDate: CYCLE,
    },
    documentsFor(c),
    TODAY,
  );
}

describe("S250 standing coverage: the app's one coverage function and the oracle agree", () => {
  for (const c of COVERAGE_CASES)
    it(c.name, () => {
      expect(oracleCovered(c)).toBe(appCovered(c));
    });
  it("the matrix holds both answers", () => {
    const answers = new Set(COVERAGE_CASES.map(appCovered));
    expect(answers).toEqual(new Set([true, false]));
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

describe("S251 program skip signal: the cohort and the oracle agree", () => {
  const CASES: readonly Record<string, string>[] = [
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
