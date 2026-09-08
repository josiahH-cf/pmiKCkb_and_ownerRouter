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
