import { EditableLayerError } from "@/lib/firestore/errors";
import { loadLiveUnitCandidates } from "@/lib/maintenance/live-unit-source";
import { deriveVerifiedTicketProperty } from "@/lib/maintenance/property-identity";

/** Server-only. Absence preserves the optional field; no typed property value is accepted. */
export async function readVerifiedTicketProperty(
  unitId: string | undefined,
): Promise<string | undefined> {
  if (!unitId) return undefined;
  const source = await loadLiveUnitCandidates();
  return source.status === "ok"
    ? (deriveVerifiedTicketProperty(unitId, source.candidates) ?? undefined)
    : undefined;
}

/** New human capture validates the exact selected canonical unit, independently of browser labels. */
export async function verifyMaintenanceCreationUnit(
  unit: { unitId: string; label: string },
  load = loadLiveUnitCandidates,
): Promise<string | undefined> {
  const source = await load();
  if (source.status !== "ok")
    throw new EditableLayerError(
      "The current unit source is unavailable. Your captured work is kept; select the verified location when the source is readable.",
      409,
    );
  const matches = source.candidates.filter((c) => c.unitId === unit.unitId);
  if (
    matches.length !== 1 ||
    matches[0].propertyConflict ||
    matches[0].label !== unit.label ||
    matches[0].label.startsWith("Needs Verification")
  )
    throw new EditableLayerError(
      "The selected unit is missing, changed or ambiguous. Choose its current verified source entry before creating a ticket.",
      409,
    );
  return deriveVerifiedTicketProperty(unit.unitId, source.candidates) ?? undefined;
}
