import { createHash } from "node:crypto";
import { EditableLayerError } from "@/lib/firestore/errors";

function canonical(value: unknown, depth = 0): unknown {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map((child) => canonical(child, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, v]) => (depth !== 0 || key !== "revision") && v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v, depth + 1)]),
    );
  return value;
}
/** Opaque exact-current-record binding, including normalized Firestore timestamps. */
export function processDefinitionRevision(definition: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(definition)))
    .digest("hex");
}
export function assertProcessDefinitionRevision(
  definition: { id: string },
  expected?: string,
) {
  if (
    (definition.id === "owner-renewal-outreach" && !expected) ||
    (expected && expected !== processDefinitionRevision(definition))
  )
    throw new EditableLayerError(
      "The process definition changed or its reviewed revision is missing. Reload the current definition and review your edits before retrying.",
      409,
    );
}
