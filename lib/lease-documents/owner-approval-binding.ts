// S66 (AC-S66-8, BEH-S66-3): owner approval bound to the exact current Working renewal terms.
//
// When staff record that the owner approved the renewal, the server captures the complete Working
// terms (each field's value and revision) and the calculated charges as that approval's coverage.
// The packet uses approved terms only while those exact terms and charges are still current. An
// approval recorded against older terms, legacy owner-response terms, a pricing review, or
// changed charges never substitutes for it; staff keep working while it is pending.

import {
  calculateRenewalCharges,
  economicsHash,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import {
  packetInputFacts,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";
import type { PacketFact } from "@/lib/lease-documents/packet-types";
import {
  completeWorkingTerms,
  workingEntry,
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import {
  describeApprovalChanges,
  ownerApprovalCoverage,
  type OwnerApprovalCoverage,
} from "@/lib/lease-renewal/owner-approval-coverage";
import type {
  ApprovedWorkingTerms,
  RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

/** The charges the packet would carry from the lease's packet inputs and the published policy. */
export function packetEconomics(
  leaseId: string,
  inputs: PacketInputsRecord | null,
  policy: ChargePolicyRecord | null,
) {
  const calculated = calculateRenewalCharges({
    leaseId,
    policy,
    facts: packetInputFacts(inputs),
    animals: inputs?.animals.entries ?? [],
    overrides: inputs?.chargeOverrides.entries ?? [],
  });
  return { calculated, hash: economicsHash(calculated) };
}

/** The coverage an approval recorded now would carry, or null while the Working terms are incomplete. */
export function captureApprovedWorkingTerms(input: {
  leaseId: string;
  working: RenewalWorkingRecord | null;
  inputs: PacketInputsRecord | null;
  policy: ChargePolicyRecord | null;
}): ApprovedWorkingTerms | null {
  const terms = completeWorkingTerms(workingRenewalTerms(input.working));
  if (!terms) return null;
  const revision = (field: string) => workingEntry(input.working, field)?.revision ?? 0;
  const economics = packetEconomics(input.leaseId, input.inputs, input.policy);
  return {
    rent: terms.rent,
    effectiveDate: terms.effectiveDate,
    endDate: terms.endDate,
    fieldRevisions: {
      rent: revision("terms_rent"),
      effectiveDate: revision("terms_effective_date"),
      endDate: revision("terms_end_date"),
    },
    economicsHash: economics.hash,
    chargePolicyVersion: economics.calculated.policyVersion,
  };
}

// S237 (PR #163 review): the approved-terms reference and the packet terms freshness are pure and
// client-safe; the page recomputes them from the live Working record.
export {
  APPROVED_TERMS_SOURCE_SYSTEM,
  approvedTermsReference,
  packetWorkingTermsFreshness,
} from "./packet-terms-freshness";
import {
  APPROVED_TERMS_SOURCE_SYSTEM,
  approvedTermsReference,
} from "./packet-terms-freshness";

export type OwnerApprovalState =
  | "current"
  | "not_recorded"
  | "no_working_terms"
  | "terms_changed"
  | "charges_changed";

export const OWNER_APPROVAL_NOTICES: Readonly<
  Record<Exclude<OwnerApprovalState, "current">, string>
> = {
  not_recorded:
    "Record explicit owner approval of the current renewal terms before packet execution.",
  no_working_terms:
    "The recorded owner approval does not name complete Working renewal terms. Save the Working terms, then record the owner's approval again.",
  terms_changed:
    "The Working renewal terms changed after the owner's approval was recorded. Record the owner's approval of the current terms.",
  charges_changed:
    "The calculated charges changed after the owner's approval was recorded. Record the owner's approval of the current terms and charges.",
};

/**
 * S234 R-S234-3: the packet notice for a coverage that is not current, naming exactly which
 * Working terms changed.
 */
export function ownerApprovalNotice(coverage: OwnerApprovalCoverage): string | null {
  if (coverage.state === "current") return null;
  if (coverage.state !== "terms_changed") return OWNER_APPROVAL_NOTICES[coverage.state];
  return `The Working renewal ${describeApprovalChanges(coverage.changed)} changed after the owner's approval was recorded. Record the owner's approval of the current terms.`;
}

/**
 * Shown while the approval is current but the packet's charges come from the lease's Admin-approved
 * original-lease mapping: that mapping's own approval, bound to the approved terms revision, covers
 * them, not the owner's approval of the calculated charges.
 */
export const MAPPING_CHARGES_NOTICE =
  "This lease's charges come from its Admin-approved original-lease mapping, not from the calculated charges the owner approved. Review them before the packet is prepared.";

/**
 * Whether the recorded approval covers the current Working terms and charges, and the approved-term
 * facts the packet may use when it does. Legacy `ownerResponse.terms` are never read here.
 */
export function currentOwnerApproval(input: {
  workspace: RenewalWorkspaceState | null;
  working: RenewalWorkingRecord | null;
  economicsHash: string;
  /** The hash of the charges the packet actually carries (`packetChargeBasis`), when known. */
  packetChargesHash?: string;
}): {
  state: OwnerApprovalState;
  facts: PacketFact[];
  notice?: string;
  /** S234 R-S234-3: the same coverage, naming exactly what changed, for the notice and screens. */
  coverage: OwnerApprovalCoverage;
} {
  const coverage = ownerApprovalCoverage(input);
  const workspace = input.workspace;
  const response = workspace?.ownerResponse;
  if (coverage.state !== "current" || !workspace || !response)
    return {
      state: coverage.state === "current" ? "not_recorded" : coverage.state,
      facts: [],
      coverage,
    };
  const binding = coverage.binding;
  // The approval covers the calculated charges. Charges a current mapping supplies instead are
  // covered by that mapping's own Admin approval; the packet says so rather than implying otherwise.
  const mappingCharges =
    input.packetChargesHash !== undefined &&
    input.packetChargesHash !== input.economicsHash;
  const source = {
    system: APPROVED_TERMS_SOURCE_SYSTEM,
    reference: approvedTermsReference(workspace.cycleId, binding.fieldRevisions),
    retrievedAt: response.recordedAt,
    version: String(workspace.termsRevision),
  };
  const fact = (
    fieldKey: string,
    value: string | number,
    display: string,
  ): PacketFact => ({
    fieldKey,
    normalizedValue: value,
    displayValue: display,
    source,
    confidence: "Verified",
    applicability: "Applicable",
    verifiedBy: response.actorUid,
    blockingScope: "owner_terms",
  });
  return {
    state: "current",
    coverage,
    ...(mappingCharges ? { notice: MAPPING_CHARGES_NOTICE } : {}),
    facts: [
      // Display text stays the stored value; a reviewed map field formats it for its document.
      fact("renewal.approved_rent", binding.rent, String(binding.rent)),
      fact("renewal.effective_date", binding.effectiveDate, binding.effectiveDate),
      fact("renewal.end_date", binding.endDate, binding.endDate),
    ],
  };
}
