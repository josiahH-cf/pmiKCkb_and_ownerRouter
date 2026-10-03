import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildDeskLeaseGuidance,
  type DeskGuidanceInput,
} from "@/lib/lease-renewal/desk-guidance";
import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalEvidenceMap,
  type RenewalProcessProjection,
} from "@/lib/lease-renewal/renewal-process";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  MANUAL_ACTIVITIES,
  type ManualActivity,
  type RenewalWorkspaceState,
  type StaffActivityRecord,
} from "@/lib/lease-renewal/workspace-state";

// S142-A: the manual summary and desk guidance outputs over a generated state matrix, recorded from
// the unchanged helpers before any predicate is extracted for the dependency projection. The
// extraction must leave every output identical. Record once with UPDATE_S142_EQUIVALENCE=1 on
// unchanged code; never update it to make a later change pass.
// S156/S157 re-baseline (0f02e013, 8a3f929d): the owner-confirmed program changed the predicates
// themselves (no completion gate, Not applicable without a policy attestation, the staff lane as
// the guidance's status, no Blocked status or blocker list, advisory rent differences). The
// fixture was re-recorded once on those authorized rules; it again pins every output against
// accidental drift from here on.

const FIXTURE_PATH = join(__dirname, "..", "fixtures", "s142-predicate-equivalence.json");
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

function digest(values: readonly unknown[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(`${canonical(value)}\n`);
  return hash.digest("hex").slice(0, 32);
}

function record(termsRevision: number, extra: Partial<StaffActivityRecord> = {}) {
  return {
    eventId: "00000000-0000-4000-8000-000000000001",
    actorUid: "fixture-staff",
    recordedAt: "2026-09-30T12:00:00.000Z",
    source: "Fixture source",
    termsRevision,
    ...extra,
  };
}

const OWNER_CASES = [
  "none",
  "no_response",
  "revision_requested",
  "approved_terms",
  "declined_non_renewal",
] as const;
const TENANT_CASES = [
  "none",
  "awaiting_response",
  "accepted",
  "counter_change_requested",
  "declined_nonrenewing",
  "needs_verification",
] as const;
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
  "assisted_housing",
];
const ACTIVITY_PROFILES = [
  "none",
  "outreach_waiting",
  "outreach",
  "outreach_offer",
  "outreach_offer_stale",
  "all",
  "all_rhino_na",
  "all_rhino_na_without_policy",
  "all_but_documents",
  "all_with_handoff",
] as const;
const COMPLETION_CASES = ["none", "current", "stale"] as const;

function manualState(
  owner: (typeof OWNER_CASES)[number],
  tenant: (typeof TENANT_CASES)[number],
  tenantCurrent: boolean,
  profile: (typeof ACTIVITY_PROFILES)[number],
  completion: (typeof COMPLETION_CASES)[number],
): RenewalWorkspaceState {
  const state = emptyRenewalWorkspace("lease-1207-walnut-2", CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  const terms = owner === "none" || owner === "no_response" ? 0 : 1;
  state.termsRevision = terms;
  state.revision = 7;
  if (owner !== "none")
    state.ownerResponse = {
      ...record(terms),
      outcome: owner,
      ...(owner === "approved_terms"
        ? { terms: { rent: 1450, effectiveDate: "2027-01-01", endDate: "2027-12-31" } }
        : {}),
    };
  if (tenant !== "none")
    state.tenantResponse = {
      ...record(tenantCurrent ? terms : terms - 1),
      outcome: tenant,
    };
  const done = (key: ManualActivity, revision = terms) => {
    state.activities[key] = { ...record(revision), outcome: "done" };
  };
  if (profile === "outreach_waiting")
    state.activities.owner_outreach = { ...record(terms), outcome: "waiting" };
  if (profile !== "none" && profile !== "outreach_waiting") done("owner_outreach");
  if (profile === "outreach_offer_stale") done("tenant_offer", terms - 1);
  if (profile === "outreach_offer" || profile.startsWith("all")) done("tenant_offer");
  if (profile.startsWith("all")) for (const key of POST_ACCEPTANCE) done(key);
  if (profile === "all_rhino_na")
    state.activities.rhino = {
      ...record(terms, {
        reason: "No Rhino policy on this lease",
        applicabilityPolicy: "Rhino applicability rule v1",
      }),
      outcome: "not_applicable",
    };
  if (profile === "all_rhino_na_without_policy")
    state.activities.rhino = {
      ...record(terms, { reason: "No Rhino policy on this lease" }),
      outcome: "not_applicable",
    };
  if (profile === "all_but_documents") delete state.activities.documents;
  if (profile === "all_with_handoff") done("non_renewal_handoff");
  if (completion !== "none")
    state.completion = record(completion === "current" ? terms : terms - 1);
  return state;
}

function manualGroups(): Record<string, string> {
  const groups: Record<string, string> = {
    null: digest([manualRenewalSummary(null)]),
  };
  for (const owner of OWNER_CASES)
    for (const tenant of TENANT_CASES)
      for (const tenantCurrent of tenant === "none" ? [true] : [true, false]) {
        const outputs: unknown[] = [];
        for (const profile of ACTIVITY_PROFILES)
          for (const completion of COMPLETION_CASES)
            outputs.push(
              manualRenewalSummary(
                manualState(owner, tenant, tenantCurrent, profile, completion),
              ),
            );
        groups[`${owner}|${tenant}|${tenantCurrent ? "current" : "stale"}`] =
          digest(outputs);
      }
  return groups;
}

function verified(key: string): RenewalEvidenceMap[keyof RenewalEvidenceMap] {
  return buildRenewalEvidenceReference({
    ref: `app_record:${key}:receipt-1`,
    source: "app_record",
    disposition: "verified",
  });
}

function acceptedEvidence(): RenewalEvidenceMap {
  const evidence: RenewalEvidenceMap = {};
  for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS)
    evidence[requirement.key] = requirement.allowNotApplicable
      ? buildRenewalEvidenceReference({
          ref: `policy:${requirement.key}:not-applicable`,
          source: "policy_version",
          disposition: "not_applicable",
          reason: `The approved ${requirement.key} rule does not apply to this lease.`,
        })
      : verified(requirement.key);
  return evidence;
}

const PROCESS_CASES: Record<string, () => RenewalProcessProjection | null> = {
  none: () => null,
  blocked: () =>
    projectRenewalProcess({
      processVersion: "renewal-v1",
      evidence: {},
      evidenceBlockers: {
        "base-rent": {
          reason: "Contractual base rent is missing, stale, ambiguous, or conflicting.",
          nextAction: "Resolve contractual base rent before continuing.",
        },
      },
    }),
  ready: () =>
    projectRenewalProcess({
      processVersion: "renewal-v1",
      evidence: {
        "lease-tracked": verified("lease-tracked"),
        "lease-identity": verified("lease-identity"),
        "lease-end-date": verified("lease-end-date"),
      },
    }),
  owner_step: () => {
    const evidence: RenewalEvidenceMap = {};
    for (const key of [
      "lease-tracked",
      "lease-identity",
      "lease-end-date",
      "base-rent",
      "recurring-charges-separated",
      "source-conflicts-resolved",
      "source-snapshot-current",
      "renewal-recipients",
    ] as const)
      evidence[key] = verified(key);
    return projectRenewalProcess({ processVersion: "renewal-v1", evidence });
  },
  waiting: () =>
    projectRenewalProcess({
      processVersion: "renewal-v1",
      evidence: acceptedEvidence(),
      tenantOutcome: {
        state: "awaiting_response",
        evidence: verified("tenant-outcome")!,
      },
    }),
  needs_verification: () =>
    projectRenewalProcess({
      processVersion: "renewal-v1",
      evidence: acceptedEvidence(),
      tenantOutcome: {
        state: "needs_verification",
        evidence: verified("tenant-outcome")!,
      },
    }),
  migration: () => projectRenewalProcess({ processVersion: "legacy-four-step-v0" }),
  complete: () => {
    const evidence = {
      ...acceptedEvidence(),
      "app-completion": verified("app-completion"),
    };
    return projectRenewalProcess({
      processVersion: "renewal-v1",
      evidence,
      tenantOutcome: { state: "accepted", evidence: evidence["tenant-outcome"]! },
      complete: true,
    });
  },
};

const MANUAL_CASES: Record<string, RenewalWorkspaceState | null> = {
  none: null,
  fresh: manualState("none", "none", true, "none", "none"),
  outreach: manualState("none", "none", true, "outreach", "none"),
  revision: manualState("revision_requested", "none", true, "outreach", "none"),
  awaiting_tenant: manualState(
    "approved_terms",
    "awaiting_response",
    true,
    "outreach_offer",
    "none",
  ),
  counter: manualState(
    "approved_terms",
    "counter_change_requested",
    true,
    "outreach_offer",
    "none",
  ),
  ready_complete: manualState("approved_terms", "accepted", true, "all", "none"),
  complete: manualState("approved_terms", "accepted", true, "all", "current"),
  non_renewal: manualState("declined_non_renewal", "none", true, "outreach", "none"),
};

const RENT_CHECKS = ["none", "agree", "missing", "single_source", "conflict"] as const;

function guidanceInput(
  manual: RenewalWorkspaceState | null,
  process: RenewalProcessProjection | null,
  readComplete: boolean,
  currencyState: "fresh" | "stale" | "expired",
  progressStateAvailable: boolean | undefined,
  disposition: "actionable" | "review",
  rentCheck: (typeof RENT_CHECKS)[number],
): DeskGuidanceInput {
  return {
    summary: {
      id: "1207",
      disposition,
      // The guidance reads only the reason label; reason and retention are type-complete filler.
      reason: disposition === "review" ? "no_end_date" : "actionable",
      reasonLabel: disposition === "review" ? "Lease end date is missing" : "In window",
      retention: { state: "window", label: "In window" },
      ...(manual ? { manualProgress: manualRenewalSummary(manual) } : {}),
    },
    process,
    dataCheck:
      rentCheck === "none"
        ? null
        : ([
            {
              fieldKey: "current_rent",
              fieldLabel: "Current rent",
              agreement: rentCheck,
              candidates: [],
            },
          ] as unknown as DeskGuidanceInput["dataCheck"]),
    rentvineCurrentRent: 1400,
    rentDecision: null,
    currencyState,
    readComplete,
    ...(progressStateAvailable === undefined ? {} : { progressStateAvailable }),
  };
}

function guidanceGroups(): Record<string, string> {
  const groups: Record<string, string> = {};
  for (const [manualName, manual] of Object.entries(MANUAL_CASES))
    for (const [processName, process] of Object.entries(PROCESS_CASES)) {
      const outputs: unknown[] = [];
      const projection = process();
      for (const readComplete of [true, false])
        for (const currencyState of ["fresh", "stale", "expired"] as const)
          for (const progress of [true, false, undefined])
            for (const disposition of ["actionable", "review"] as const)
              for (const rentCheck of RENT_CHECKS)
                outputs.push(
                  buildDeskLeaseGuidance(
                    guidanceInput(
                      manual,
                      projection,
                      readComplete,
                      currencyState,
                      progress,
                      disposition,
                      rentCheck,
                    ),
                  ),
                );
      groups[`${manualName}|${processName}`] = digest(outputs);
    }
  return groups;
}

describe("S142-A predicate equivalence", () => {
  it("covers every manual activity in the generated matrix", () => {
    const keys = new Set<ManualActivity>([
      "owner_outreach",
      "tenant_offer",
      ...POST_ACCEPTANCE,
    ]);
    keys.add("non_renewal_handoff");
    expect([...keys].sort()).toEqual(Object.keys(MANUAL_ACTIVITIES).sort());
  });

  it("keeps manual summary and desk guidance outputs identical to the recorded baseline", () => {
    const current = { manual: manualGroups(), guidance: guidanceGroups() };
    if (process.env.UPDATE_S142_EQUIVALENCE === "1")
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(current, null, 2)}\n`);
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    const baseline = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
    expect(current).toEqual(baseline);
  }, 60_000);
});
