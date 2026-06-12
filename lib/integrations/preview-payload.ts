import type { PreviewPayloadField } from "@/lib/firestore/types";

export interface PreviewPayloadValidationResult {
  ok: boolean;
  errors: string[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

/**
 * Validate an execution-preview payload against an action's structured field
 * descriptors. Previews must show exactly the declared fields: required fields must be
 * present and typed correctly, and payload keys outside the descriptor list are errors so
 * an execution preview can never silently carry more data than the approver saw.
 *
 * Pure and deterministic; performs no I/O and never touches an external system.
 */
export function validatePreviewPayload(
  fields: PreviewPayloadField[],
  payload: Record<string, unknown>,
): PreviewPayloadValidationResult {
  const errors: string[] = [];
  const declared = new Map(fields.map((field) => [field.name, field]));

  for (const field of fields) {
    const value = payload[field.name];

    if (value === undefined || value === null) {
      if (field.required) {
        errors.push(`Missing required preview field "${field.name}".`);
      }
      continue;
    }

    const typeError = checkFieldType(field, value);

    if (typeError) {
      errors.push(typeError);
    }
  }

  for (const key of Object.keys(payload)) {
    if (!declared.has(key)) {
      errors.push(`Unexpected preview field "${key}" is not in the declared schema.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function checkFieldType(field: PreviewPayloadField, value: unknown): string | undefined {
  switch (field.type) {
    case "string":
    case "enum":
    case "reference":
      if (typeof value !== "string" || value.trim() === "") {
        return `Preview field "${field.name}" must be a non-empty string.`;
      }
      return undefined;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `Preview field "${field.name}" must be a finite number.`;
      }
      return undefined;
    case "boolean":
      if (typeof value !== "boolean") {
        return `Preview field "${field.name}" must be a boolean.`;
      }
      return undefined;
    case "date":
      if (
        typeof value !== "string" ||
        !(ISO_DATE_PATTERN.test(value) || ISO_TIMESTAMP_PATTERN.test(value))
      ) {
        return `Preview field "${field.name}" must be an ISO date (YYYY-MM-DD) or timestamp.`;
      }
      return undefined;
  }
}
