import { it, expect } from "vitest";
import { projectMaintenanceWaitingOn } from "@/lib/maintenance/waiting-on";
import * as policy from "@/lib/maintenance/property-preapproval";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
const ticket: MaintenanceTicketRecord = {
  id: "case-one",
  data_mode: "live",
  status: "Open",
  summary: "Fixture dripping tap",
  description: "Report with no approval or estimate",
  priority: "Normal",
  priority_provenance: "operator-set",
  unit: { unitId: "unit:801", label: "Fixture unit" },
  photo_refs: [],
  reporter: { kind: "staff", uid: "staff-one" },
  labels: [],
  space_id: "maintenance-work-order-intake",
  created_at: "2026-10-06T23:00:00Z",
  updated_at: "2026-10-09T15:00:00Z",
};
const assessed = {
  ...ticket,
  property_id: "901",
  workflow_stage: "owner_decision",
  estimate_amount_cents: 25000,
  estimate_cost_basis: "total_including_tax_and_markup",
  assessment: {
    outcome: "work_required",
    scope: "Replace leaking part",
    evidence_refs: ["quote:one"],
    recorded_at: "2026-10-09T15:00:00Z",
    recorded_by_uid: "staff-one",
    version: 1,
  },
} as typeof ticket;
const legacy = {
  property_key: "901",
  amount_cents: 25000,
  effective_from_iso: "2026-10-01T00:00:00Z",
  recorded_by_uid: "admin-one",
  version: 1,
};
const terms = {
  scope: "property" as const,
  property_keys: ["901"],
  owner_ref: null,
  comparison: "inclusive" as const,
  cost_basis: "total_including_tax_and_markup" as const,
  evidence_ref: "owner-record:approved-terms",
  expires_at: null,
  revoked_at: null,
};
it("an imported amount without explicit current scope and cost semantics is not standing authority", () => {
  expect(
    policy.evaluateMaintenanceStandingPolicy(assessed, legacy, "2026-10-09T15:00:00Z"),
  ).toMatchObject({ state: "unqualified_policy", authorized: false });
});
it("requires assessment, real property applicability, exact boundary and known matching cost basis", () => {
  const p = { ...legacy, policy_terms: terms };
  expect(
    policy.evaluateMaintenanceStandingPolicy(assessed, p, "2026-10-09T15:00:00Z")
      .authorized,
  ).toBe(true);
  for (const [t, v, expected] of [
    [{ ...assessed, assessment: undefined }, p, "assessment_required"],
    [{ ...assessed, property_id: "902" }, p, "scope_mismatch"],
    [{ ...assessed, estimate_cost_basis: undefined }, p, "cost_basis_unknown"],
    [
      assessed,
      { ...p, policy_terms: { ...terms, comparison: "exclusive" } },
      "amount_exceeds_policy",
    ],
    [assessed, { ...p, effective_from_iso: "2026-10-10T00:00:00Z" }, "not_effective"],
    [
      assessed,
      { ...p, policy_terms: { ...terms, revoked_at: "2026-10-09T00:00:00Z" } },
      "revoked",
    ],
    [
      assessed,
      { ...p, policy_terms: { ...terms, expires_at: "2026-10-09T15:00:00Z" } },
      "expired",
    ],
  ] as const)
    expect(
      policy.evaluateMaintenanceStandingPolicy(t, v, "2026-10-09T15:00:00Z"),
    ).toMatchObject({ state: expected, authorized: false });
});
it("owner-scoped authority additionally requires a current verified owner/property relation", () => {
  const p = {
    ...legacy,
    policy_terms: { ...terms, scope: "owner" as const, owner_ref: "101" },
  };
  expect(
    policy.evaluateMaintenanceStandingPolicy(assessed, p, "2026-10-09T15:00:00Z")
      .authorized,
  ).toBe(false);
  expect(
    policy.evaluateMaintenanceStandingPolicy(assessed, p, "2026-10-09T15:00:00Z", ["101"])
      .authorized,
  ).toBe(true);
  expect(
    policy.evaluateMaintenanceStandingPolicy(
      { ...assessed, estimate_amount_cents: 25001 },
      p,
      "2026-10-09T15:00:00Z",
      ["101"],
    ).authorized,
  ).toBe(false);
});

it("an unqueried owner relationship asks for verification without manufacturing another owner decision", () => {
  const p = {
    ...legacy,
    policy_terms: { ...terms, scope: "owner" as const, owner_ref: "101" },
  };
  const input = {
    ticket: assessed,
    link: null,
    preapproval: p,
    at: "2026-10-09T15:00:00Z",
  };
  expect(projectMaintenanceWaitingOn(input)).toMatchObject({
    waitingOn: "authority_verification",
    ownerDecisionRequired: false,
    withinPreapproval: false,
  });
  expect(
    projectMaintenanceWaitingOn({ ...input, verifiedOwnerRefs: ["101"] }),
  ).toMatchObject({
    waitingOn: "vendor",
    ownerDecisionRequired: false,
    withinPreapproval: true,
  });
  expect(
    projectMaintenanceWaitingOn({ ...input, verifiedOwnerRefs: ["102"] }),
  ).toMatchObject({
    waitingOn: "owner_approval",
    ownerDecisionRequired: true,
    withinPreapproval: false,
  });
});
it("known policy refusals remain refusals while owner readback is absent", () => {
  const p = {
    ...legacy,
    policy_terms: { ...terms, scope: "owner" as const, owner_ref: "101" },
  };
  for (const [t, v, reason] of [
    [
      assessed,
      { ...p, policy_terms: { ...p.policy_terms, revoked_at: "2026-10-09T00:00:00Z" } },
      "revoked",
    ],
    [
      assessed,
      { ...p, policy_terms: { ...p.policy_terms, expires_at: "2026-10-09T15:00:00Z" } },
      "expired",
    ],
    [{ ...assessed, estimate_cost_basis: undefined }, p, "cost_basis_unknown"],
    [{ ...assessed, estimate_amount_cents: 25001 }, p, "amount_exceeds_policy"],
  ] as const) {
    expect(
      policy.evaluateMaintenanceStandingPolicy(t, v, "2026-10-09T15:00:00Z"),
    ).toMatchObject({ state: reason, authorized: false });
    expect(
      projectMaintenanceWaitingOn({
        ticket: t,
        link: null,
        preapproval: v,
        at: "2026-10-09T15:00:00Z",
      }),
    ).toMatchObject({
      waitingOn: "owner_approval",
      ownerDecisionRequired: true,
      withinPreapproval: false,
    });
  }
});
