// S117 (R117.2, R117.4, AC-S117-4): one per-destination status projection for Rent and charges.
//
// Every row says where a value lives right now: saved in the app, prepared for an Admin, applied
// with a receipt, read back, declined, uncertain, or unavailable with its retained reason. The rows
// are projected from records the page already reads; nothing here executes, retries or reconciles.
// A prepared or drifted row is never described as synchronized, and a succeeded charge update with
// a differing base rent is its own attention row.

import type { RenewalAttemptRecord } from "@/lib/lease-renewal/execution/attempt-continuation";
import {
  SHEET_AUDIENCE_EMAIL_FIELDS,
  SHEET_FIELD_LABELS,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import {
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import type { SheetWritebackEffectStatusView } from "@/lib/lease-renewal/sheet-writeback/status";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import type { CurrentBaseReadback } from "@/lib/lease-renewal/writeback/current-base-readback";
import {
  renewalWritebackExecutionId,
  type RenewalWritebackEffectInput,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export type RentChargeOutcomeState =
  | "recorded"
  | "pending"
  | "prepared"
  | "expired"
  | "running"
  | "succeeded"
  | "verified"
  | "ambiguous"
  | "failed"
  | "unavailable"
  | "mismatch";

export interface RentChargeOutcomeRow {
  readonly id: string;
  readonly destination: "app" | "rentvine" | "sheet";
  readonly intent: "current" | "future" | "tracking";
  readonly label: string;
  readonly state: RentChargeOutcomeState;
  readonly stateLabel: string;
  readonly detail: string;
  readonly anchor: string | null;
  /** True when a person must act or look before relying on the displayed value. */
  readonly attention: boolean;
}

export const RENT_CHARGE_STATE_LABELS: Readonly<Record<RentChargeOutcomeState, string>> =
  {
    recorded: "Saved in the app",
    pending: "Waiting to be prepared",
    prepared: "Prepared, awaiting Admin confirmation",
    expired: "Preview expired; prepare it again",
    running: "Awaiting a durable outcome",
    succeeded: "Applied with receipt",
    verified: "Read back after the confirmed update",
    ambiguous: "Needs reconciliation",
    failed: "Declined without change",
    unavailable: "Preparation unavailable",
    mismatch: "Charge applied; lease base rent still differs",
  };

const RENTVINE_KIND_LABELS = {
  renewal_dates_update: "lease renewal dates",
  recurring_charge_update: "recurring charge update",
  recurring_charge_create: "new recurring charge",
} as const;

const ATTENTION: ReadonlySet<RentChargeOutcomeState> = new Set([
  "expired",
  "ambiguous",
  "failed",
  "unavailable",
  "mismatch",
]);

function money(value: number): string {
  return value.toFixed(2);
}

function sheetFieldLabel(field: string): string {
  return (
    (SHEET_AUDIENCE_EMAIL_FIELDS as Record<string, { label: string } | undefined>)[field]
      ?.label ??
    (SHEET_FIELD_LABELS as Record<string, string | undefined>)[field] ??
    field
  );
}

function row(
  input: Omit<RentChargeOutcomeRow, "stateLabel" | "attention">,
): RentChargeOutcomeRow {
  return {
    ...input,
    stateLabel: RENT_CHARGE_STATE_LABELS[input.state],
    attention: ATTENTION.has(input.state),
  };
}

function describeRentvineEffect(effect: RenewalWritebackEffectInput): string {
  if (effect.kind === "recurring_charge_update") {
    const changes = effect.changes as Record<string, string | null | undefined>;
    return `Charge ${Object.keys(changes)
      .map((key) => `${key} to ${changes[key] ?? "open-ended"}`)
      .join(", ")}.`;
  }
  if (effect.kind === "recurring_charge_create")
    return `New charge ${effect.create.amount} from ${effect.create.startDate}.`;
  return `Lease dates ${Object.entries(effect.after)
    .map(([key, value]) => `${key} to ${value ?? "open-ended"}`)
    .join(", ")}.`;
}

function attemptState(
  attempt: RenewalAttemptRecord | undefined,
  expired: boolean,
): RentChargeOutcomeState {
  if (!attempt) return expired ? "expired" : "prepared";
  if (attempt.state === "succeeded") return "succeeded";
  if (attempt.state === "ambiguous") return "ambiguous";
  if (attempt.state === "failed") return "failed";
  if (attempt.state === "running") return "running";
  return expired ? "expired" : "prepared";
}

export function projectRentChargeOutcomes(input: {
  readonly manualState: RenewalWorkspaceState | null | undefined;
  readonly rentvineProposal: RenewalWritebackProposal | null | undefined;
  readonly attempts: readonly RenewalAttemptRecord[];
  readonly sheetProposal: SheetWritebackProposal | null | undefined;
  readonly sheetEffects: readonly SheetWritebackEffectStatusView[] | null | undefined;
  readonly currentBaseReadback: CurrentBaseReadback;
  readonly nowMs: number;
}): RentChargeOutcomeRow[] {
  const rows: RentChargeOutcomeRow[] = [];
  const manual = input.manualState ?? null;

  const terms =
    manual?.ownerResponse?.outcome === "approved_terms"
      ? manual.ownerResponse.terms
      : null;
  if (terms) {
    rows.push(
      row({
        id: "app:approved-terms",
        destination: "app",
        intent: "future",
        label: "Approved future rent (app record)",
        state: "recorded",
        detail: `${money(terms.rent)} effective ${terms.effectiveDate} to ${terms.endDate}. Saved in the app only; today's rent and the Sheet current rent are unchanged until a confirmed source update.`,
        anchor: "#renewal-future-rent",
      }),
    );
  }

  for (const [field, entry] of Object.entries(manual?.sourceUpdates ?? {})) {
    const state: RentChargeOutcomeState =
      entry.state === "verified"
        ? "verified"
        : entry.state === "prepared"
          ? "prepared"
          : entry.state === "unavailable"
            ? "unavailable"
            : "pending";
    const value =
      typeof entry.intent.value === "boolean"
        ? entry.intent.value
          ? "Yes"
          : "No"
        : String(entry.intent.value);
    rows.push(
      row({
        id: `sheet:staff:${field}`,
        destination: "sheet",
        intent: "tracking",
        label: `Sheet ${sheetFieldLabel(field)} from the staff record`,
        state,
        detail: `Recorded value ${value}.${entry.reason ? ` ${entry.reason}` : ""}`,
        anchor: "#operating-sheet-title",
      }),
    );
  }

  const rentvine = input.rentvineProposal ?? null;
  if (rentvine) {
    const expired = input.nowMs > Date.parse(rentvine.confirmationExpiresAtIso);
    const intent =
      rentvine.businessIntent === "current_base"
        ? "current"
        : rentvine.businessIntent === "future_rent"
          ? "future"
          : "tracking";
    for (const entry of rentvine.effects) {
      const executionId = renewalWritebackExecutionId(rentvine, entry);
      const attempt = input.attempts.find((record) => record.executionId === executionId);
      let state = attemptState(attempt, expired);
      let detail = describeRentvineEffect(entry.effect);
      if (state === "succeeded" && intent === "current") {
        const readback = input.currentBaseReadback;
        if (readback.state === "charge_applied_base_rent_differs") {
          state = "mismatch";
          detail = `Charge applied at ${readback.chargeAmount}; the lease's contractual base rent still reads ${money(readback.baseRent)}. Review the lease in RentVine and refresh this lease before relying on the rent shown.`;
        } else if (readback.state === "charge_applied_base_rent_matches") {
          detail = `Charge applied at ${readback.chargeAmount}; the refreshed lease base rent reads the same amount.`;
        } else if (readback.state === "charge_applied_base_rent_unavailable") {
          detail = `Charge applied at ${readback.chargeAmount}; the refreshed lease base rent could not be read, so agreement is unproven.`;
        }
      }
      rows.push(
        row({
          id: `rentvine:${entry.effectHash}`,
          destination: "rentvine",
          intent,
          label: `RentVine ${RENTVINE_KIND_LABELS[entry.effect.kind]}`,
          state,
          detail,
          anchor: "#rentvine-updates-title",
        }),
      );
    }
  }

  const sheet = input.sheetProposal ?? null;
  if (sheet) {
    const expired = input.nowMs > Date.parse(sheet.confirmationExpiresAtIso);
    const statuses = new Map(
      (input.sheetEffects ?? []).map((status) => [status.execution_id, status] as const),
    );
    for (const entry of sheet.effects) {
      const executionId = sheetWritebackExecutionId(sheet, entry);
      const status = statuses.get(executionId);
      const raw = status?.state ?? "not_started";
      const state: RentChargeOutcomeState =
        raw === "succeeded"
          ? "verified"
          : raw === "ambiguous"
            ? "ambiguous"
            : raw === "failed"
              ? "failed"
              : raw === "running"
                ? "running"
                : expired
                  ? "expired"
                  : "prepared";
      const label =
        entry.effect.kind === "field_update"
          ? `Sheet ${sheetFieldLabel(String(entry.effect.field))}`
          : "Sheet missing-row append";
      const detail =
        entry.effect.kind === "field_update"
          ? `Row ${entry.effect.rowNumber}: ${entry.effect.expectedValue || "(blank)"} to ${entry.effect.afterValue}.`
          : "One new row for this lease with its system note.";
      rows.push(
        row({
          id: `sheet:${entry.effectHash}`,
          destination: "sheet",
          intent:
            entry.effect.kind === "field_update" && entry.effect.staffIntent
              ? "tracking"
              : "current",
          label,
          state,
          detail,
          anchor: "#operating-sheet-title",
        }),
      );
    }
  }
  return rows;
}
