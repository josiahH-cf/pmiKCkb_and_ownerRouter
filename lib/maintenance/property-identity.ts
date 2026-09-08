import type { MaintenancePropertyPreapproval } from "@/lib/maintenance/property-preapproval";
import type { UnitCandidate } from "@/lib/maintenance/unit-matcher";

export function deriveVerifiedTicketProperty(
  unitId: string,
  candidates: readonly UnitCandidate[],
): string | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.unitId.replace(/^unit:/, "") === unitId.replace(/^unit:/, ""),
  );
  if (matches.length !== 1 || matches[0].propertyConflict) return null;
  const propertyId = matches[0].propertyId;
  return propertyId && /^[1-9][0-9]*$/.test(propertyId) ? propertyId : null;
}

export function maintenancePropertyIdentity(
  ticket: { unit: { unitId: string } | null; property_id?: string },
  link: { property_id?: string; provider_snapshot?: { property_id: string } } | null,
): { status: "verified" | "unknown" | "conflict"; propertyId: string | null } {
  if (!ticket.unit) return { status: "unknown", propertyId: null };
  const values = [
    ...new Set(
      [
        ticket.property_id,
        link?.property_id,
        link?.provider_snapshot?.property_id,
      ].filter(
        (value): value is string =>
          typeof value === "string" && /^[1-9][0-9]*$/.test(value),
      ),
    ),
  ];
  return values.length > 1
    ? { status: "conflict", propertyId: null }
    : values.length === 1
      ? { status: "verified", propertyId: values[0] }
      : { status: "unknown", propertyId: null };
}

/** A recorded amount is usable only on or after its recorded effective instant. */
export function effectivePropertyPreapproval(
  record: MaintenancePropertyPreapproval | null,
  nowIso: string,
): MaintenancePropertyPreapproval | null {
  if (
    !record ||
    !Number.isFinite(Date.parse(nowIso)) ||
    !Number.isFinite(Date.parse(record.effective_from_iso)) ||
    Date.parse(record.effective_from_iso) > Date.parse(nowIso)
  )
    return null;
  return record;
}
