// Real read-only source checks for recorded property/owner policy. No guessed customer joins.
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { resolveOwnerContactFromPropertyId } from "@/lib/lease-renewal/live-owner-recipient";
import type { MaintenanceStandingPolicyTerms } from "./property-preapproval";
import { EditableLayerError } from "@/lib/firestore/errors";
export async function verifyMaintenancePolicySource(
  terms: MaintenanceStandingPolicyTerms,
) {
  const config = buildLiveRentVineConfig();
  if (!config.ok)
    throw new EditableLayerError(
      "The property policy source is unavailable. Your terms are kept.",
      409,
    );
  if (terms.property_keys.length > 20)
    throw new EditableLayerError(
      "Review at most twenty actual properties in one policy save.",
      400,
    );
  const verified: string[] = [];
  for (const key of terms.property_keys) {
    if (!/^[1-9][0-9]{0,9}$/.test(key))
      throw new EditableLayerError("Use an actual RentVine property identifier.", 400);
    try {
      const property = await config.rentvineClient.getProperty(key),
        actual = String(property.propertyID ?? property.propertyId ?? "");
      if (actual !== key) throw Error("Property identity was not established");
      if (terms.scope === "owner") {
        const owner = await resolveOwnerContactFromPropertyId(config.rentvineClient, key);
        if (!owner || String(owner.contactId) !== terms.owner_ref)
          throw Error("Current owner relation was not established");
        verified.push(String(owner.contactId));
      }
    } catch {
      throw new EditableLayerError(
        "The exact current property or owner relationship could not be verified. No policy was changed.",
        409,
      );
    }
  }
  return [...new Set(verified)];
}
export async function readCurrentMaintenancePolicyOwnerRefs(propertyId: string) {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return [];
  const owner = await resolveOwnerContactFromPropertyId(
    config.rentvineClient,
    propertyId,
  );
  return owner ? [String(owner.contactId)] : [];
}
