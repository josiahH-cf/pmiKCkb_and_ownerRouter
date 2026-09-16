import { describe, expect, it } from "vitest";

import {
  planRentChargeRequests,
  type RentChargePlanContext,
} from "@/lib/lease-renewal/rent-charge-intent";
import { RENEWAL_GOVERNANCE_MATRIX } from "@/lib/lease-renewal/role-action-governance";
import {
  manualActionSheetIntent,
  type RenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

function charge(
  id: string,
  overrides: Omit<Partial<RenewalChargeOption>, "projection"> & {
    projection?: Partial<RenewalChargeOption["projection"]>;
  } = {},
): RenewalChargeOption {
  const { projection, ...rest } = overrides;
  return {
    id,
    accountId: "9",
    accountLabel: "Rent account",
    classification: "rent",
    current: true,
    ...rest,
    projection: {
      leaseRecurringChargeID: id,
      leaseID: "81",
      accountID: "9",
      amount: "1250.00",
      description: "Rent",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-01-01",
      endDate: null,
      nextChargeDate: "2026-10-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1,
      ...projection,
    },
  };
}

const inventory: RenewalChargeInventory = {
  leaseId: "81",
  asOfDate: "2026-09-16",
  leaseDates: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    increaseEligibilityDate: null,
  },
  charges: [
    charge("301"),
    charge("303", {
      current: false,
      projection: {
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        recurringStatusID: 2,
        description: "Future rent",
      },
    }),
    // A non-rent account whose description says "Rent": the label never defines billing meaning.
    charge("302", {
      accountId: "12",
      accountLabel: null,
      classification: "non_rent",
      projection: { accountID: "12", amount: "35.00", description: "Rent" },
    }),
  ],
};

const context: RentChargePlanContext = {
  leaseId: "81",
  workspaceContext: "secure-context",
  sheetRowAvailable: true,
  priorHashes: { sheet: null, rentvine: "h".repeat(64) },
  inventory,
};

const terms = { rent: 1300, effectiveDate: "2027-01-01", endDate: "2027-12-31" };

function bodies(plans: ReturnType<typeof planRentChargeRequests>) {
  return plans.map((plan) => ("body" in plan ? JSON.stringify(plan.body) : plan.refusal));
}

describe("S117 typed current and future rent/charge intents (ARCH-S117-1)", () => {
  it("AC-S117-1: a current correction plans one exact request per destination and never borrows the future intent", () => {
    const plans = planRentChargeRequests(
      {
        scope: "current",
        field: "current_rent",
        value: 1300,
        source: "Reviewed RentVine",
        destinations: ["sheet", "rentvine"],
        chargeId: "301",
      },
      context,
    );
    expect(plans).toHaveLength(2);
    const [sheet, rentvine] = plans;
    expect(sheet).toMatchObject({
      destination: "sheet",
      route: "operating-sheet",
      body: {
        operation: "propose",
        workspaceContext: "secure-context",
        intent: "update_approved_current_rent",
        expectedCurrentRent: 1300,
      },
    });
    expect(rentvine).toMatchObject({
      destination: "rentvine",
      route: "rentvine-writeback",
      body: {
        operation: "propose",
        leaseId: "81",
        businessIntent: "current_base",
        evidenceRef: "Reviewed RentVine",
        expectedPriorPreviewHash: "h".repeat(64),
        effects: [
          {
            kind: "recurring_charge_update",
            chargeId: "301",
            changes: { amount: "1300.00" },
          },
        ],
      },
    });
    for (const body of bodies(plans)) {
      expect(body).not.toContain("future_rent");
      expect(body).not.toContain("renewalContext");
    }
  });

  it("AC-S117-1: a current correction refuses an unresolved, future or non-rent charge without hiding the Sheet plan", () => {
    for (const chargeId of ["302", "303", "", "999"]) {
      const plans = planRentChargeRequests(
        {
          scope: "current",
          field: "current_rent",
          value: 1300,
          source: "Reviewed",
          destinations: ["sheet", "rentvine"],
          chargeId,
        },
        context,
      );
      expect(plans[0]).toMatchObject({ destination: "sheet", route: "operating-sheet" });
      expect(plans[1]).toMatchObject({ destination: "rentvine" });
      expect("refusal" in plans[1] && plans[1].refusal).toMatch(
        /exact current rent-account charge/,
      );
    }
  });

  it("AC-S117-1: a future preparation targets RentVine only with the recorded terms and never the Sheet or current base", () => {
    const update = planRentChargeRequests(
      {
        scope: "future",
        operation: "update_future",
        chargeId: "303",
        terms,
        scheduleReview: "Reviewed future schedule",
        cycleId: "0f6a8a5e-2f2c-4c1e-9a52-7c1f0e2f5b11",
        termsRevision: 2,
      },
      context,
    );
    expect(update).toHaveLength(1);
    expect(update[0]).toMatchObject({
      destination: "rentvine",
      route: "rentvine-writeback",
      body: {
        businessIntent: "future_rent",
        renewalContext: {
          cycleId: "0f6a8a5e-2f2c-4c1e-9a52-7c1f0e2f5b11",
          termsRevision: 2,
          scheduleReview: "Reviewed future schedule",
        },
        effects: [
          {
            kind: "recurring_charge_update",
            chargeId: "303",
            changes: { amount: "1300.00" },
          },
        ],
      },
    });
    const create = planRentChargeRequests(
      {
        scope: "future",
        operation: "create_future",
        chargeId: "301",
        terms,
        scheduleReview: "Reviewed",
        cycleId: "0f6a8a5e-2f2c-4c1e-9a52-7c1f0e2f5b11",
        termsRevision: 2,
      },
      context,
    );
    expect(create[0]).toMatchObject({
      body: {
        businessIntent: "future_rent",
        effects: [
          {
            kind: "recurring_charge_create",
            create: {
              accountID: "9",
              amount: "1300.00",
              startDate: "01/01/2027",
              endDate: "12/31/2027",
              dayDue: "1",
              frequency: "1",
            },
          },
        ],
      },
    });
    for (const body of [...bodies(update), ...bodies(create)]) {
      expect(body).not.toContain("operating-sheet");
      expect(body).not.toContain("current_base");
      expect(body).not.toContain("update_approved_current_rent");
    }
    const openEnded = planRentChargeRequests(
      {
        scope: "future",
        operation: "end_current",
        chargeId: "301",
        terms,
        scheduleReview: "Reviewed",
        cycleId: "0f6a8a5e-2f2c-4c1e-9a52-7c1f0e2f5b11",
        termsRevision: 2,
        currentChargeEndDate: "2026-12-31",
      },
      context,
    );
    expect("refusal" in openEnded[0] && openEnded[0].refusal).toMatch(/open-ended/);
  });

  it("AC-S117-1: renewal dates and unsupported fields route only where an exact operation exists", () => {
    const dates = planRentChargeRequests(
      {
        scope: "current",
        field: "renewal_date",
        value: "2027-01-31",
        source: "Reviewed lease",
        destinations: ["sheet", "rentvine"],
      },
      context,
    );
    expect(dates[0]).toMatchObject({
      route: "operating-sheet",
      body: {
        intent: "update_field",
        fieldIntent: {
          field: "renewal_date",
          value: "2027-01-31",
          source: "Reviewed lease",
        },
      },
    });
    expect(dates[1]).toMatchObject({
      route: "rentvine-writeback",
      body: {
        effects: [{ kind: "renewal_dates_update", after: { endDate: "2027-01-31" } }],
      },
    });
    expect(JSON.stringify(dates[1])).not.toContain("businessIntent");
    const market = planRentChargeRequests(
      {
        scope: "current",
        field: "market_value",
        value: 1400,
        source: "Reviewed comps",
        destinations: ["rentvine"],
      },
      context,
    );
    expect("refusal" in market[0] && market[0].refusal).toMatch(
      /no supported RentVine operation/,
    );
    const noRow = planRentChargeRequests(
      {
        scope: "current",
        field: "market_value",
        value: 1400,
        source: "Reviewed comps",
        destinations: ["sheet"],
      },
      { ...context, sheetRowAvailable: false },
    );
    expect("refusal" in noRow[0] && noRow[0].refusal).toMatch(/exact existing Sheet row/);
  });

  it("AC-S117-1: recording owner terms or a term review stays app-owned and never becomes a current-rent source update", () => {
    const intent = manualActionSheetIntent({
      kind: "owner_response",
      outcome: "approved_terms",
      terms,
      source: "Owner call",
    } as unknown as RenewalWorkspaceAction);
    expect(intent?.field).toBe("owner_pricing_confirmed");
    expect(intent?.field).not.toBe("current_rent");
    expect(RENEWAL_GOVERNANCE_MATRIX.record_term_review.actionKeys).toEqual([]);
    expect(RENEWAL_GOVERNANCE_MATRIX.record_term_review.effect).toBe("app_owned_write");
  });
});
