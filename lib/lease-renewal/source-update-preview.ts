// S117 (R117.3, AC-S117-3): the facts an Admin reads at the confirmation point.
//
// One shape for both providers: the lease, the source system, the exact field or charge, the
// current and proposed values in business words, the effective timing and what the confirmation
// changes. No id, hash, A1 range or action key appears here; those stay in the receipt disclosure.

import type {
  SheetWritebackClientEffect,
  SheetWritebackClientProposal,
} from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  SHEET_AUDIENCE_EMAIL_FIELDS,
  SHEET_FIELD_LABELS,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import type {
  RentvineWritebackClientEffect,
  RentvineWritebackClientProposal,
} from "@/lib/lease-renewal/writeback/client-projection";

export interface SourceUpdatePreviewFacts {
  readonly lease: string;
  readonly source: string;
  readonly target: string;
  readonly current: string;
  readonly proposed: string;
  readonly timing: string;
  readonly consequence: string;
}

export interface SourceUpdateIdentity {
  readonly addressLabel: string;
  readonly leaseId: string;
}

function leaseLine(identity: SourceUpdateIdentity | null | undefined, leaseId: string) {
  return identity
    ? `${identity.addressLabel}, lease ${identity.leaseId}`
    : `Lease ${leaseId}`;
}

function str(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function schedule(charge: Record<string, unknown>): string {
  const amount = str(charge.amount, "unknown amount");
  const frequency = str(charge.frequency, "?");
  const dayDue = str(charge.dayDue, "?");
  const start = str(charge.startDate, "unknown start");
  const end =
    charge.endDate === null || charge.endDate === undefined
      ? "no end date"
      : str(charge.endDate);
  return `${amount} every ${frequency} month(s) on day ${dayDue}, ${start} to ${end}`;
}

function chargeLabel(
  inventory: RenewalChargeInventory | null | undefined,
  chargeId: string | null,
  accountId: string | null,
  description: string,
): string {
  const byId = chargeId
    ? inventory?.charges.find((entry) => entry.id === chargeId)
    : undefined;
  const byAccount =
    !byId && accountId
      ? inventory?.charges.find((entry) => entry.accountId === accountId)
      : undefined;
  const account = byId?.accountLabel ?? byAccount?.accountLabel ?? null;
  return account
    ? `${account} (recurring charge)`
    : `${description || "Recurring charge"} (recurring charge)`;
}

export function rentvinePreviewFacts(
  effect: RentvineWritebackClientEffect,
  context: {
    readonly proposal: RentvineWritebackClientProposal;
    readonly inventory?: RenewalChargeInventory | null;
    readonly identity?: SourceUpdateIdentity | null;
  },
): SourceUpdatePreviewFacts {
  const { proposal } = context;
  const lease = leaseLine(context.identity, proposal.lease_id);
  const source = `RentVine, account ${proposal.account}, read ${proposal.source_read_at}`;
  if (effect.kind === "renewal_dates_update") {
    const before = (effect.effect.before ?? {}) as Record<string, string | null>;
    const after = (effect.effect.after ?? {}) as Record<
      string,
      string | null | undefined
    >;
    const describe = (
      state: Record<string, string | null | undefined>,
      fallback: Record<string, string | null>,
    ) => {
      const parts = [
        `ends ${(state.endDate === undefined ? fallback.endDate : state.endDate) ?? "open-ended"}`,
      ];
      if ("increaseEligibilityDate" in after)
        parts.push(
          `increase eligibility ${(state.increaseEligibilityDate === undefined ? fallback.increaseEligibilityDate : state.increaseEligibilityDate) ?? "none"}`,
        );
      return parts.join(", ");
    };
    return {
      lease,
      source,
      target: "Lease renewal dates",
      current: describe(before, before),
      proposed: describe(after, before),
      timing: "Lease end date",
      consequence: `Lease start date stays ${before.startDate ?? "as read"}; no other lease field changes.`,
    };
  }
  const intent = proposal.business_intent;
  if (effect.kind === "recurring_charge_update") {
    const before = (effect.effect.before ?? {}) as Record<string, unknown>;
    const changes = (effect.effect.changes ?? {}) as Record<string, unknown>;
    const after = { ...before, ...changes };
    const start = str(after.startDate, "its start date");
    return {
      lease,
      source,
      target: chargeLabel(
        context.inventory,
        str(effect.effect.chargeId) || null,
        str(before.accountID) || null,
        str(before.description),
      ),
      current: schedule(before),
      proposed: schedule(after),
      timing:
        "endDate" in changes
          ? `Billing ends ${changes.endDate === null ? "never" : str(changes.endDate)}`
          : `Billing from ${start}`,
      consequence:
        intent === "current_base"
          ? "Changes only this recurring charge. The lease's contractual base rent is read again separately and compared after the update."
          : intent === "future_rent"
            ? `Today's billing stays in place until ${start}. The Sheet current rent is unchanged.`
            : "Changes only this recurring charge; other charges and the lease dates stay as read.",
    };
  }
  const create = (effect.effect.create ?? {}) as Record<string, unknown>;
  return {
    lease,
    source,
    target: chargeLabel(
      context.inventory,
      null,
      str(create.accountID) || null,
      str(create.description),
    ),
    current: "No charge yet",
    proposed: schedule(create),
    timing: `Billing from ${str(create.startDate, "its start date")}`,
    consequence:
      intent === "future_rent"
        ? `Adds one new recurring charge starting ${str(create.startDate, "on its start date")}; today's billing and the Sheet current rent are unchanged until then.`
        : "Adds one new recurring charge; no existing charge changes.",
  };
}

export function sheetFieldLabel(field: string): string {
  return (
    (SHEET_AUDIENCE_EMAIL_FIELDS as Record<string, { label: string } | undefined>)[field]
      ?.label ??
    (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ??
    field
  );
}

export function sheetPreviewFacts(
  effect: SheetWritebackClientEffect,
  context: {
    readonly proposal: SheetWritebackClientProposal;
    readonly identity?: SourceUpdateIdentity | null;
    readonly leaseId?: string;
  },
): SourceUpdatePreviewFacts {
  const { proposal } = context;
  const leaseId = context.leaseId ?? str(effect.effect.leaseId);
  const lease = leaseLine(context.identity, leaseId);
  if (effect.kind === "row_append") {
    return {
      lease,
      source: `Operating renewal Sheet, tab ${proposal.tab_title}, read ${proposal.source_read_at}`,
      target: `New row for ${str(effect.effect.tenantName)}`,
      current: "No row for this lease",
      proposed:
        "One appended row with the lease's system note; every other column stays blank",
      timing: "This one row, now",
      consequence: "Adds one row only; no existing row or cell changes.",
    };
  }
  const rowNumber = str(effect.effect.rowNumber);
  return {
    lease,
    source: `Operating renewal Sheet, tab ${proposal.tab_title}, row ${rowNumber}, read ${proposal.source_read_at}`,
    target: sheetFieldLabel(str(effect.effect.field)),
    current: str(effect.effect.expectedValue) || "(blank)",
    proposed: str(effect.effect.afterValue),
    timing: "This one cell, now",
    consequence: `Replaces this one cell only while it still holds the current value shown. Source: ${str(effect.effect.source)}.`,
  };
}
