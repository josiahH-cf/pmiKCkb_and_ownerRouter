// S237 R-S237-5: what still differs after the renewal's RentVine and Sheet updates. Each tracked
// field shows the Working or approved value, the latest provider or Sheet readback with its read
// time, and whether they match. Nothing here claims the systems are synchronized; a field the page
// did not read says so. Pure: the page passes its own fresh reads.

import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "./writeback/charge-inventory-model";
import { workingRenewalTerms, type RenewalWorkingRecord } from "./working-record";
import type { RenewalWorkspaceState } from "./workspace-state";
import { SHEET_FIELD_LABELS } from "./sheet-writeback/field-intent";

export interface RemainingDifferenceRow {
  readonly key: string;
  readonly label: string;
  readonly intended: string;
  readonly readback: string;
  readonly readAt: string | null;
  /** True when they match, false when they differ, null when either side is not known. */
  readonly matches: boolean | null;
}

const money = (value: number) => `$${value.toFixed(2)}`;

function sheetText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  // A Yes/No column may read back as TRUE/FALSE or yes/no; they are the same answer.
  if (/^(yes|true)$/i.test(text)) return "Yes";
  if (/^(no|false)$/i.test(text)) return "No";
  return text;
}

export function projectRemainingDifferences(input: {
  readonly working: RenewalWorkingRecord | null;
  readonly workspace: RenewalWorkspaceState | null;
  /** The intended increase-eligibility date from the prepared RentVine dates update, if any. */
  readonly increaseEligibilityIntent?: string | null;
  readonly rentvine: {
    readonly inventory: RenewalChargeInventory;
    readonly readAt: string;
  } | null;
  readonly sheet: {
    readonly values: Readonly<Record<string, unknown>>;
    readonly readAt: string | null;
  } | null;
}): RemainingDifferenceRow[] {
  const terms = workingRenewalTerms(input.working);
  const dates = input.rentvine?.inventory.leaseDates ?? null;
  const rentvineAt = input.rentvine?.readAt ?? null;
  const rows: RemainingDifferenceRow[] = [];
  const compare = (
    key: string,
    label: string,
    intended: string | null,
    readback: string | null,
    readAt: string | null,
    read: boolean,
  ) =>
    rows.push({
      key,
      label,
      intended: intended ?? "No Working value saved",
      readback: !read ? "Not read on this page" : (readback ?? "None in the source"),
      readAt: read ? readAt : null,
      matches: intended === null || !read ? null : intended === readback,
    });
  compare(
    "lease_end_date",
    "Lease end date",
    terms.endDate,
    dates?.endDate ?? null,
    rentvineAt,
    Boolean(dates),
  );
  if (input.increaseEligibilityIntent !== undefined)
    compare(
      "increase_eligibility_date",
      "Increase-eligibility date",
      input.increaseEligibilityIntent,
      dates?.increaseEligibilityDate ?? null,
      rentvineAt,
      Boolean(dates),
    );
  // The rent charge that should begin on the Working effective date.
  const rentCharges =
    input.rentvine?.inventory.charges.filter(
      (charge) => charge.classification === "rent",
    ) ?? [];
  const starting = terms.effectiveDate
    ? rentCharges.filter(
        (charge) => chargeDateIso(charge.projection.startDate) === terms.effectiveDate,
      )
    : [];
  compare(
    "rent_charge",
    terms.effectiveDate ? `Rent charge from ${terms.effectiveDate}` : "Rent charge",
    terms.rent !== null && terms.effectiveDate !== null ? money(terms.rent) : null,
    starting.length === 1
      ? money(Number(starting[0].projection.amount))
      : starting.length > 1
        ? `${starting.length} rent charges start that day`
        : null,
    rentvineAt,
    Boolean(input.rentvine),
  );
  // Each recognized Sheet field this renewal touched.
  for (const [field, update] of Object.entries(input.workspace?.sourceUpdates ?? {})) {
    const label = (SHEET_FIELD_LABELS as Record<string, string>)[field] ?? field;
    compare(
      `sheet:${field}`,
      `Sheet: ${label}`,
      sheetText(update.intent.value),
      input.sheet ? sheetText(input.sheet.values[field]) : null,
      input.sheet?.readAt ?? null,
      Boolean(input.sheet),
    );
  }
  return rows;
}
