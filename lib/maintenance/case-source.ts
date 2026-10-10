// Supported read-only RentVine identities. Staff supplies the actual event-date tenancy evidence;
// present occupancy never establishes the lease for earlier work.
import { createHash } from "node:crypto";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { leaseExportRowId } from "@/lib/integrations/rentvine/client";
import { deriveUnitCandidatesFromExport } from "./unit-matcher";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { CaseAssociationInput } from "./case-model";
export interface VerifiedMaintenanceAssociation {
  unitLabel: string | null;
  ownerLabel?: string | null;
  sourceHash: string;
}
export async function verifyMaintenanceCaseAssociation(
  input: CaseAssociationInput,
): Promise<VerifiedMaintenanceAssociation> {
  if (input.kind === "unresolved")
    return {
      unitLabel: null,
      sourceHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    };
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "The current identity source is unavailable. Keep your association and original operation.",
      409,
    );
  try {
    const property = await config.rentvineClient.getProperty(input.propertyId!);
    if (String(property.propertyID ?? property.propertyId ?? "") !== input.propertyId)
      throw Error("Property identity missing");
    let ownerLabel: string | null = null;
    if (input.ownerRef) {
      const contact = await config.rentvineClient.getContact(input.ownerRef);
      if (
        String(contact.contactID ?? contact.contactId ?? contact.id ?? "") !==
        input.ownerRef
      )
        throw Error("Owner contact identity missing");
      const label = contact.name ?? contact.displayName ?? contact.companyName;
      ownerLabel =
        typeof label === "string" && label.trim() ? label.trim().slice(0, 500) : null;
    }
    let unitLabel: string | null = null;
    if (input.unitId) {
      const read = await config.rentvineClient.listAllLeasesExport();
      if (!read.complete) throw Error("Partial source");
      const candidates = deriveUnitCandidatesFromExport(read.rows).candidates.filter(
        (c) => c.unitId === `unit:${input.unitId}`,
      );
      if (
        candidates.length !== 1 ||
        candidates[0].propertyConflict ||
        candidates[0].propertyId !== input.propertyId ||
        candidates[0].label.startsWith("Needs Verification")
      )
        throw Error("Unit relationship conflict");
      unitLabel = candidates[0].label;
      if (input.kind === "lease") {
        const rows = read.rows.filter((row) => leaseExportRowId(row) === input.leaseId);
        if (rows.length !== 1) throw Error("Lease identity missing");
        const candidate = deriveUnitCandidatesFromExport(rows).candidates;
        if (
          candidate.length !== 1 ||
          candidate[0].unitId !== `unit:${input.unitId}` ||
          candidate[0].propertyId !== input.propertyId ||
          candidate[0].propertyConflict
        )
          throw Error("Lease relationship conflict");
      }
    }
    return {
      unitLabel,
      ownerLabel,
      sourceHash: createHash("sha256")
        .update(
          JSON.stringify([
            input.kind,
            input.propertyId,
            input.unitId,
            input.leaseId,
            input.ownerRef ?? null,
            input.eventDate,
            input.evidenceRef,
          ]),
        )
        .digest("hex"),
    };
  } catch {
    throw new EditableLayerError(
      "The exact current property/unit/lease/owner-contact identity could not be verified. No association changed. Review the event-date tenancy and ownership evidence; current occupancy or ownership is not historical proof.",
      409,
    );
  }
}
