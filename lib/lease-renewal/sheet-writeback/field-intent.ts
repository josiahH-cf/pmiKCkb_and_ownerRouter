import { z } from "zod";
import { RENEWAL_TAB_SCHEMAS } from "@/lib/lease-renewal/headers";

export const SHEET_FIELD_LABELS = {
  owner_pricing_confirmed: "Owner pricing confirmed",
  renewal_letter_sent: "Renewal letter sent",
  renewal_date: "Renewal date",
  current_rent: "Current base rent",
  market_value: "Market value",
  renewal_completed: "Renewal completed",
  tenant_responded: "Tenant response",
  info_form_sent: "Information form sent",
  form_returned: "Information form returned",
  lease_docs_sent: "Lease documents sent",
  rhino_renewed: "Applicable Rhino policy renewed",
  pet_registered: "Pet registration",
  esign_complete: "Electronic signatures completed",
  additional_insured_verified: "Additional insured verification",
  recurring_charge_added: "Applicable recurring charge recorded",
  added_to_inspection_sheet: "Inspection sheet follow-up",
  air_filter_setup: "Air filter delivery",
  utility_proof: "Utility proof",
} as const;

export type SheetEditableField = keyof typeof SHEET_FIELD_LABELS;
const fields = Object.keys(SHEET_FIELD_LABELS) as [
  SheetEditableField,
  ...SheetEditableField[],
];
export const SheetFieldIntentSchema = z
  .object({
    field: z.enum(fields),
    value: z.union([z.string().trim().min(1).max(500), z.number().finite(), z.boolean()]),
    source: z.string().trim().min(1).max(240),
  })
  .strict()
  .superRefine((input, ctx) => {
    const shape = sheetFieldShape(input.field);
    let valid = true;
    if (shape === "currency")
      valid =
        typeof input.value === "number" &&
        input.value >= 0 &&
        (input.field !== "current_rent" || input.value > 0) &&
        Math.abs(Math.round(input.value * 100) - input.value * 100) < 0.00001;
    else if (shape === "date")
      valid =
        typeof input.value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(input.value) &&
        Number.isFinite(Date.parse(input.value)) &&
        new Date(input.value).toISOString().slice(0, 10) === input.value;
    else if (shape === "yes_no" || shape === "boolean")
      valid = typeof input.value === "boolean";
    else
      valid =
        typeof input.value === "string" && !/^[=+@-]|[\u0000-\u001f]/.test(input.value);
    if (!valid)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a valid value for this business field.",
      });
  });

export type SheetFieldIntent = z.infer<typeof SheetFieldIntentSchema>;
export function parseSheetFieldIntent(input: unknown): SheetFieldIntent {
  return SheetFieldIntentSchema.parse(input);
}
export function sheetFieldShape(field: SheetEditableField) {
  return (
    RENEWAL_TAB_SCHEMAS.Renewals.find((entry) => entry.key === field)?.expectedShape ??
    "text"
  );
}

/** Preserve checkbox versus written yes/no representation. Actual provider types are read back. */
export function sheetIntentValue(
  input: SheetFieldIntent,
  previous: string,
  checkbox = false,
): string {
  if (typeof input.value === "boolean") {
    return checkbox || /^(true|false)$/i.test(previous)
      ? input.value
        ? "TRUE"
        : "FALSE"
      : input.value
        ? "Yes"
        : "No";
  }
  return String(input.value);
}
