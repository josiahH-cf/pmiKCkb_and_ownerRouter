// S108 amendment (owner decision 2026-10-01, B-MNT1): RentVine's per-property maintenance limit is
// the source for the app's property preapprovals. This module only plans the import. It turns the
// raw RentVine property fields into exact whole cents, compares them with the app's current
// preapprovals, and hashes the plan so a confirmation can only record the exact preview an Admin saw.
// It never clears an app preapproval: a property without a RentVine limit keeps its current setting.

import { createHash } from "node:crypto";

import {
  MAX_PREAPPROVAL_AMOUNT_CENTS,
  type MaintenancePropertyPreapproval,
} from "@/lib/maintenance/property-preapproval";

/** One RentVine property as the import reads it. `limitAmount` is the raw provider value. */
export interface RentVinePropertyLimit {
  readonly propertyKey: string;
  readonly label: string;
  readonly limitAmount: unknown;
  readonly maintenanceNotes: string | null;
  readonly active: boolean;
}

export type PreapprovalImportAction = "add" | "update" | "unchanged";

export interface PreapprovalImportRow {
  readonly propertyKey: string;
  readonly label: string;
  readonly amountCents: number;
  readonly currentAmountCents: number | null;
  readonly currentVersion: number | null;
  readonly action: PreapprovalImportAction;
  readonly maintenanceNotes: string | null;
}

export type PreapprovalImportSkipReason =
  | "invalid_amount"
  | "above_app_limit"
  | "duplicate_property"
  | "invalid_property";

export interface PreapprovalImportSkip {
  readonly propertyKey: string;
  readonly label: string;
  readonly reason: PreapprovalImportSkipReason;
}

export interface PreapprovalImportPlan {
  readonly propertiesRead: number;
  readonly rows: readonly PreapprovalImportRow[];
  readonly skipped: readonly PreapprovalImportSkip[];
  readonly planHash: string;
}

/** The most rows one confirmation may record; each row writes a record and a history entry. */
export const PREAPPROVAL_IMPORT_MAX_ROWS = 200;

export type RentVineLimitCents =
  | { readonly kind: "amount"; readonly cents: number }
  | { readonly kind: "absent" }
  | { readonly kind: "invalid_amount" }
  | { readonly kind: "above_app_limit" };

/**
 * Read RentVine's `maintenanceLimitAmount` as whole cents. RentVine returns a plain decimal string
 * such as "500.00". Empty, null and zero mean the property has no limit, so nothing is imported.
 */
export function rentVineLimitCents(raw: unknown): RentVineLimitCents {
  if (raw === null || raw === undefined) return { kind: "absent" };
  if (typeof raw !== "string" && typeof raw !== "number")
    return { kind: "invalid_amount" };
  const text = String(raw).trim();
  if (text === "") return { kind: "absent" };
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(text)) return { kind: "invalid_amount" };
  const [dollars, fraction = ""] = text.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return { kind: "invalid_amount" };
  if (cents === 0) return { kind: "absent" };
  if (cents > MAX_PREAPPROVAL_AMOUNT_CENTS) return { kind: "above_app_limit" };
  return { kind: "amount", cents };
}

function byPropertyKey<T extends { readonly propertyKey: string }>(
  left: T,
  right: T,
): number {
  const difference = Number(left.propertyKey) - Number(right.propertyKey);
  return difference !== 0 && Number.isFinite(difference)
    ? difference
    : left.propertyKey.localeCompare(right.propertyKey);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Plan the import. Only active properties with an exact positive RentVine limit become rows; each row
 * says whether it adds a preapproval, updates a different amount, or already matches. The hash covers
 * every row's amounts, current version, action and notes plus every skip, so any change in RentVine
 * or in the app between preview and confirmation yields a different hash.
 */
export function planPreapprovalImport(
  properties: readonly RentVinePropertyLimit[],
  current: readonly MaintenancePropertyPreapproval[],
): PreapprovalImportPlan {
  const currentByKey = new Map(current.map((entry) => [entry.property_key, entry]));
  const seen = new Map<string, number>();
  for (const property of properties) {
    seen.set(property.propertyKey, (seen.get(property.propertyKey) ?? 0) + 1);
  }
  const rows: PreapprovalImportRow[] = [];
  const skipped: PreapprovalImportSkip[] = [];
  for (const property of properties) {
    if (!property.active) continue;
    const limit = rentVineLimitCents(property.limitAmount);
    if (limit.kind === "absent") continue;
    const base = { propertyKey: property.propertyKey, label: property.label };
    if (!/^[1-9][0-9]*$/.test(property.propertyKey)) {
      skipped.push({ ...base, reason: "invalid_property" });
      continue;
    }
    if ((seen.get(property.propertyKey) ?? 0) > 1) {
      skipped.push({ ...base, reason: "duplicate_property" });
      continue;
    }
    if (limit.kind !== "amount") {
      skipped.push({ ...base, reason: limit.kind });
      continue;
    }
    const existing = currentByKey.get(property.propertyKey) ?? null;
    rows.push({
      ...base,
      amountCents: limit.cents,
      currentAmountCents: existing?.amount_cents ?? null,
      currentVersion: existing?.version ?? null,
      action: !existing
        ? "add"
        : existing.amount_cents === limit.cents
          ? "unchanged"
          : "update",
      maintenanceNotes: property.maintenanceNotes?.trim()
        ? property.maintenanceNotes.trim()
        : null,
    });
  }
  rows.sort(byPropertyKey);
  skipped.sort(byPropertyKey);
  const planHash = digest(
    JSON.stringify({
      rows: rows.map((row) => [
        row.propertyKey,
        row.amountCents,
        row.currentAmountCents,
        row.currentVersion,
        row.action,
        digest(row.maintenanceNotes ?? ""),
      ]),
      skipped: skipped.map((skip) => [skip.propertyKey, skip.reason]),
    }),
  );
  return { propertiesRead: properties.length, rows, skipped, planHash };
}

/** The rows a confirmation records: additions and changed amounts, never an unchanged row. */
export function preapprovalImportChanges(
  plan: Pick<PreapprovalImportPlan, "rows">,
): PreapprovalImportRow[] {
  return plan.rows.filter((row) => row.action !== "unchanged");
}
