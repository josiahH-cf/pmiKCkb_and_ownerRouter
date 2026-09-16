// S117 (R117.1, ARCH-S117-1): one typed rent/charge intent per operator action.
//
// The browser expresses either a *current* correction (a fact that is wrong today) or a *future*
// preparation (owner-approved terms that start later). This module turns that one intent into the
// exact request bodies the existing operating-Sheet and RentVine routes already accept. It adds no
// route, key or executor. The two scopes cannot borrow each other's server intent: a current
// correction never carries `future_rent` or a renewal context, and a future preparation never
// produces a Sheet body, `current_base`, or the approved-current-rent Sheet intent.

import type { SheetEditableField } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { FutureRentBinding } from "@/lib/lease-renewal/writeback/future-rent-intent";
import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";

export type RentChargeDestination = "sheet" | "rentvine";
export type RenewalTerms = FutureRentBinding["terms"];

export type RentChargeIntent =
  | {
      readonly scope: "current";
      readonly field: SheetEditableField;
      /** The reviewed business value, already typed for the field shape. */
      readonly value: string | number | boolean;
      readonly source: string;
      readonly destinations: readonly RentChargeDestination[];
      /** The exact current rent-account charge, required only for a RentVine current-rent change. */
      readonly chargeId?: string;
    }
  | {
      readonly scope: "future";
      readonly operation: "update_future" | "end_current" | "create_future";
      readonly chargeId: string;
      readonly terms: RenewalTerms;
      readonly scheduleReview: string;
      readonly cycleId: string;
      readonly termsRevision: number;
      /** ISO end date for `end_current`; the operator reviews it explicitly. */
      readonly currentChargeEndDate?: string;
    };

export type RentChargeRequestPlan =
  | {
      readonly destination: RentChargeDestination;
      readonly route: "operating-sheet" | "rentvine-writeback";
      readonly body: Record<string, unknown>;
    }
  | { readonly destination: RentChargeDestination; readonly refusal: string };

export interface RentChargePlanContext {
  readonly leaseId: string;
  readonly workspaceContext: string | null;
  readonly sheetRowAvailable: boolean;
  readonly priorHashes: {
    readonly sheet: string | null;
    readonly rentvine: string | null;
  };
  readonly inventory: RenewalChargeInventory | null;
}

const RENTVINE_CURRENT_FIELDS: ReadonlySet<string> = new Set([
  "current_rent",
  "renewal_date",
]);

/** RentVine's write contract takes US dates; the app keeps ISO everywhere else. */
export function providerDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

function currentPlans(
  intent: Extract<RentChargeIntent, { scope: "current" }>,
  context: RentChargePlanContext,
): RentChargeRequestPlan[] {
  const plans: RentChargeRequestPlan[] = [];
  const amount =
    typeof intent.value === "number" && Number.isFinite(intent.value)
      ? intent.value
      : null;
  for (const destination of intent.destinations) {
    if (destination === "sheet") {
      if (!context.workspaceContext || !context.sheetRowAvailable) {
        plans.push({
          destination,
          refusal:
            "An exact existing Sheet row is unavailable. Use the existing missing-row append below when applicable.",
        });
        continue;
      }
      plans.push({
        destination,
        route: "operating-sheet",
        body: {
          operation: "propose",
          workspaceContext: context.workspaceContext,
          expectedPriorPreviewHash: context.priorHashes.sheet,
          ...(intent.field === "current_rent"
            ? { intent: "update_approved_current_rent", expectedCurrentRent: amount }
            : {
                intent: "update_field",
                fieldIntent: {
                  field: intent.field,
                  value: intent.value,
                  source: intent.source,
                },
              }),
        },
      });
      continue;
    }
    if (!context.inventory || !RENTVINE_CURRENT_FIELDS.has(intent.field)) {
      plans.push({
        destination,
        refusal: "This field has no supported RentVine operation here.",
      });
      continue;
    }
    if (intent.field === "current_rent") {
      const charge = context.inventory.charges.find(
        (entry) =>
          entry.id === intent.chargeId &&
          entry.classification === "rent" &&
          entry.current === true,
      );
      if (!charge || amount === null || amount <= 0) {
        plans.push({
          destination,
          refusal:
            "Select the exact current rent-account charge; aggregate rent cannot be divided automatically.",
        });
        continue;
      }
      plans.push({
        destination,
        route: "rentvine-writeback",
        body: {
          operation: "propose",
          leaseId: context.leaseId,
          expectedPriorPreviewHash: context.priorHashes.rentvine,
          evidenceRef: intent.source,
          businessIntent: "current_base",
          effects: [
            {
              kind: "recurring_charge_update",
              chargeId: charge.id,
              changes: { amount: amount.toFixed(2) },
            },
          ],
        },
      });
      continue;
    }
    plans.push({
      destination,
      route: "rentvine-writeback",
      body: {
        operation: "propose",
        leaseId: context.leaseId,
        expectedPriorPreviewHash: context.priorHashes.rentvine,
        evidenceRef: intent.source,
        effects: [
          { kind: "renewal_dates_update", after: { endDate: String(intent.value) } },
        ],
      },
    });
  }
  return plans;
}

function futurePlans(
  intent: Extract<RentChargeIntent, { scope: "future" }>,
  context: RentChargePlanContext,
): RentChargeRequestPlan[] {
  const charge = context.inventory?.charges.find(
    (entry) => entry.id === intent.chargeId && entry.classification === "rent",
  );
  if (!charge) {
    return [
      {
        destination: "rentvine",
        refusal:
          "Choose an observed rent-account charge before preparing a future schedule.",
      },
    ];
  }
  const amount = intent.terms.rent.toFixed(2);
  let effect: Record<string, unknown>;
  if (intent.operation === "end_current") {
    if (!intent.currentChargeEndDate || !chargeDateIso(charge.projection.endDate)) {
      return [
        {
          destination: "rentvine",
          refusal:
            "An open-ended charge cannot gain an end date through the existing reversible contract. Review that exact change in RentVine, then reload.",
        },
      ];
    }
    effect = {
      kind: "recurring_charge_update",
      chargeId: charge.id,
      changes: { endDate: providerDate(intent.currentChargeEndDate) },
    };
  } else if (intent.operation === "update_future") {
    effect = {
      kind: "recurring_charge_update",
      chargeId: charge.id,
      changes: { amount },
    };
  } else {
    effect = {
      kind: "recurring_charge_create",
      create: {
        accountID: charge.accountId,
        amount,
        description: charge.projection.description,
        dayDue: charge.projection.dayDue,
        frequency: charge.projection.frequency,
        startDate: providerDate(intent.terms.effectiveDate),
        endDate: providerDate(intent.terms.endDate),
      },
    };
  }
  return [
    {
      destination: "rentvine",
      route: "rentvine-writeback",
      body: {
        operation: "propose",
        leaseId: context.leaseId,
        businessIntent: "future_rent",
        expectedPriorPreviewHash: context.priorHashes.rentvine,
        evidenceRef: intent.scheduleReview,
        renewalContext: {
          cycleId: intent.cycleId,
          termsRevision: intent.termsRevision,
          scheduleReview: intent.scheduleReview,
        },
        effects: [effect],
      },
    },
  ];
}

/**
 * Plan the exact per-destination requests for one typed intent. Each destination gets its own
 * plan or its own plain-English refusal, so a refused second destination never hides the first.
 */
export function planRentChargeRequests(
  intent: RentChargeIntent,
  context: RentChargePlanContext,
): RentChargeRequestPlan[] {
  return intent.scope === "current"
    ? currentPlans(intent, context)
    : futurePlans(intent, context);
}
