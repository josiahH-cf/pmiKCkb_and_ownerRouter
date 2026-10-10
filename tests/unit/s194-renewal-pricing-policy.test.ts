import { actionFixture, manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import {
  projectRenewalActions,
  renewalGuidanceActionId,
} from "@/lib/lease-renewal/renewal-actions";
import {
  manualRenewalSummary,
  emptyRenewalWorkspace,
} from "@/lib/lease-renewal/workspace-state";
import { describe, expect, it } from "vitest";
import {
  RenewalPricingPolicyInputSchema,
  projectRenewalPricingPolicy,
  standingOwnerAuthority,
  policyPrefill,
} from "@/lib/lease-renewal/renewal-pricing-policy";
const base = {
  id: "5d3f8275-0f4f-4c5c-909b-23103711c953",
  version: 2,
  name: "Verified standing percentage",
  kind: "percentage" as const,
  value: 3.5,
  effectiveFrom: "2026-10-01",
  effectiveThrough: null,
  enabled: true,
  purpose: "Recorded agreement",
  updatedByUid: "staff",
  updatedAt: "2026-10-09T15:00:00Z",
};
const { version, updatedByUid, updatedAt, ...policyInput } = base;
void version;
void updatedByUid;
void updatedAt;
describe("S194 reusable policies and scoped standing authority", () => {
  it("calculates all supported types with whole-dollar provenance and no amount for manual review", () => {
    expect(projectRenewalPricingPolicy(base, 1201, "2026-10-09").amount).toBe(1243);
    expect(
      projectRenewalPricingPolicy(
        { ...base, kind: "fixed_dollar", value: 25.25 },
        1201,
        "2026-10-09",
      ).amount,
    ).toBe(1226);
    expect(
      projectRenewalPricingPolicy(
        { ...base, kind: "no_increase", value: null },
        1201,
        "2026-10-09",
      ).amount,
    ).toBe(1201);
    expect(
      projectRenewalPricingPolicy(
        { ...base, kind: "manual_review", value: null },
        1201,
        "2026-10-09",
      ).amount,
    ).toBeNull();
    expect(projectRenewalPricingPolicy(base, null, "2026-10-09").amount).toBeNull();
    expect(
      projectRenewalPricingPolicy(
        { ...base, effectiveFrom: "2026-11-01" },
        1201,
        "2026-10-09",
      ).amount,
    ).toBeNull();
  });
  it("validates real calendar dates, kind values and missing configuration", () => {
    expect(RenewalPricingPolicyInputSchema.safeParse(policyInput).success).toBe(true);
    expect(
      RenewalPricingPolicyInputSchema.safeParse({
        ...policyInput,
        effectiveFrom: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      RenewalPricingPolicyInputSchema.safeParse({
        ...policyInput,
        kind: "fixed_dollar",
        value: null,
      }).success,
    ).toBe(false);
    expect(
      RenewalPricingPolicyInputSchema.safeParse({
        ...policyInput,
        kind: "no_increase",
        value: 3.5,
      }).success,
    ).toBe(false);
  });
  it("prefills only a never-touched amount and never overwrites a manual or historical value", () => {
    const proposal = projectRenewalPricingPolicy(base, 1201, "2026-10-09");
    expect(
      policyPrefill({ proposal, workingEntry: null, recordedOwnerRent: null }),
    ).toMatchObject({ value: 1243, origin: "policy_prefill", policyVersion: 2 });
    expect(
      policyPrefill({ proposal, workingEntry: { value: 1300 }, recordedOwnerRent: null }),
    ).toBeNull();
    expect(
      policyPrefill({ proposal, workingEntry: { value: null }, recordedOwnerRent: null }),
    ).toBeNull();
    expect(
      policyPrefill({ proposal, workingEntry: null, recordedOwnerRent: 1200 }),
    ).toBeNull();
  });
  it("requires actual membership, recorded evidence and exact current scope for standing authority", () => {
    const terms = { rent: 1243, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
    const agreement = {
      id: "1a5a1f4d-aabd-4f4a-9c1a-57ec40305e38",
      version: 1,
      policyId: base.id,
      policyVersion: base.version,
      portfolioId: "55",
      leaseIds: ["115"],
      cycleDate: "2026-12-31",
      terms,
      evidenceRef: "app_record:reviewed-standing-agreement",
      effectiveFrom: "2026-10-01",
      expiresOn: "2027-01-31",
      revoked: false,
      recordedByUid: "admin",
      recordedAt: "2026-10-09T15:00:00Z",
    };
    const input = {
      agreement,
      policy: base,
      leaseId: "115",
      verifiedPortfolioId: "55",
      cycleDate: "2026-12-31",
      terms,
      currentRent: 1201,
      today: "2026-10-09",
      conflict: false,
    };
    expect(standingOwnerAuthority(input).covered).toBe(true);
    expect(standingOwnerAuthority({ ...input, agreement: null }).covered).toBe(false);
    expect(standingOwnerAuthority({ ...input, verifiedPortfolioId: null }).covered).toBe(
      false,
    );
    expect(standingOwnerAuthority({ ...input, verifiedPortfolioId: "56" }).covered).toBe(
      false,
    );
    expect(standingOwnerAuthority({ ...input, cycleDate: "2027-12-31" }).covered).toBe(
      false,
    );
    expect(
      standingOwnerAuthority({ ...input, agreement: { ...agreement, revoked: true } })
        .covered,
    ).toBe(false);
    expect(
      standingOwnerAuthority({
        ...input,
        agreement: { ...agreement, expiresOn: "2026-10-08" },
      }).covered,
    ).toBe(false);
    expect(
      standingOwnerAuthority({ ...input, terms: { ...terms, rent: 1300 } }).covered,
    ).toBe(false);
    expect(standingOwnerAuthority({ ...input, conflict: true }).covered).toBe(false);
    expect(
      standingOwnerAuthority({ ...input, policy: { ...base, version: 3 } }).covered,
    ).toBe(false);
  });
});

it("S194 current standing authority guides the tenant offer without manufacturing owner outreach or consent", () => {
  const state = emptyRenewalWorkspace("115", "5d3f8275-0f4f-4c5c-909b-23103711c953", {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "Synthetic authoritative source",
  });
  const before = structuredClone(state);
  expect(manualRenewalSummary(state, { standingOwnerAuthority: true }).nextActivity).toBe(
    "tenant_offer",
  );
  expect(
    manualRenewalSummary(state, { standingOwnerAuthority: false }).nextActivity,
  ).toBe("owner_outreach");
  expect(state).toEqual(before);
  expect(state.ownerResponse).toBeNull();
  expect(state.activities.owner_outreach).toBeUndefined();
});

it("S194 all guidance consumers skip only covered outreach, retain real records and hold stale authority", () => {
  const state = manualFixture();
  const { snapshot } = actionFixture({ manual: state });
  const covered = {
    ...snapshot,
    standingOwnerAuthority: {
      covered: true,
      manualRevision: state.revision,
      reason: "Recorded exact agreement",
    },
  };
  const p = projectRenewalActions(covered);
  expect(p.headlineActionId).toBe("manual.tenant_offer");
  expect(renewalGuidanceActionId(covered)).toBe("manual.tenant_offer");
  expect(p.actions.find((a) => a.id === "manual.owner_outreach")?.status).toBe(
    "not_applicable",
  );
  expect(p.actions.find((a) => a.id === "manual.owner_response")?.status).toBe(
    "not_applicable",
  );
  expect(state.ownerResponse).toBeNull();
  expect(state.activities.owner_outreach).toBeUndefined();
  expect(
    projectRenewalActions({
      ...covered,
      standingOwnerAuthority: {
        ...covered.standingOwnerAuthority,
        manualRevision: state.revision - 1,
      },
    }).headlineActionId,
  ).toBe("manual.owner_outreach");
  const counter = manualFixture({
    done: ["tenant_offer"],
    tenant: "counter_change_requested",
  });
  expect(
    projectRenewalActions({ ...covered, manual: { readable: true, state: counter } })
      .headlineActionId,
  ).toBe("manual.owner_response");
});
