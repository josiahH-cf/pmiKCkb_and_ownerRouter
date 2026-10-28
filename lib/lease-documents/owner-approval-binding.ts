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
import type {
  PacketFact,
  PacketSourceReference,
} from "@/lib/lease-documents/packet-types";
import {
  completeWorkingTerms,
  workingEntry,
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
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

/** The source system of the approval-bound term facts a packet carries. */
export const APPROVED_TERMS_SOURCE_SYSTEM = "staff_recorded_owner_approval";

/** The source reference naming the exact Working term field revisions an approval covered. */
export function approvedTermsReference(
  cycleId: string,
  revisions: ApprovedWorkingTerms["fieldRevisions"],
): string {
  return `renewal-cycle:${cycleId}:working-terms:${revisions.rent}.${revisions.effectiveDate}.${revisions.endDate}`;
}
const APPROVED_TERMS_REFERENCE =
  /^renewal-cycle:([^:]+):working-terms:(\d+)\.(\d+)\.(\d+)$/;
const WORKING_TERM_FIELDS = [
  "terms_rent",
  "terms_effective_date",
  "terms_end_date",
] as const;

/**
 * S236 (PR #161 review): whether a packet's documents still carry the current Working renewal
 * terms. A packet built from an approval names the exact rent, effective-date and end-date field
 * revisions in its sources; any later save of one of those fields makes the packet's terms older,
 * however recently a signature on it was observed. A packet without that reference is judged by
 * time: a term saved after the packet was created makes it older. Other Working fields, notes,
 * same-value saves and owner-response re-records never change the answer. `changedAt` is when the
 * current terms were last saved; an unreadable saved time is never current.
 */
export function packetWorkingTermsFreshness(input: {
  cycleId: string | null;
  sourceVersions: readonly PacketSourceReference[];
  createdAt: string;
  working: RenewalWorkingRecord | null;
}): { current: boolean; changedAt: string | null } {
  const entries = WORKING_TERM_FIELDS.flatMap((field) => {
    const entry = workingEntry(input.working, field);
    return entry ? [entry] : [];
  });
  const times = entries.map((entry) => Date.parse(entry.recordedAt));
  if (times.some((time) => !Number.isFinite(time)))
    return { current: false, changedAt: null };
  const latest = entries.reduce<(typeof entries)[number] | null>(
    (newest, entry) =>
      !newest || Date.parse(entry.recordedAt) > Date.parse(newest.recordedAt)
        ? entry
        : newest,
    null,
  );
  const changedAt = latest?.recordedAt ?? null;
  const bases = [
    ...new Set(
      input.sourceVersions
        .filter((source) => source.system === APPROVED_TERMS_SOURCE_SYSTEM)
        .map((source) => source.reference),
    ),
  ];
  if (bases.length > 1) return { current: false, changedAt };
  if (bases.length === 1) {
    const match = APPROVED_TERMS_REFERENCE.exec(bases[0]);
    const revision = (field: string) => workingEntry(input.working, field)?.revision ?? 0;
    return {
      current: Boolean(
        match &&
        match[1] === input.cycleId &&
        Number(match[2]) === revision("terms_rent") &&
        Number(match[3]) === revision("terms_effective_date") &&
        Number(match[4]) === revision("terms_end_date"),
      ),
      changedAt,
    };
  }
  const created = Date.parse(input.createdAt);
  return {
    current:
      Number.isFinite(created) &&
      (changedAt === null || Date.parse(changedAt) <= created),
    changedAt,
  };
}

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
}): { state: OwnerApprovalState; facts: PacketFact[]; notice?: string } {
  const response = input.workspace?.ownerResponse;
  if (!input.workspace || response?.outcome !== "approved_terms")
    return { state: "not_recorded", facts: [] };
  const binding = response.approvedWorkingTerms;
  if (!binding) return { state: "no_working_terms", facts: [] };
  const terms = completeWorkingTerms(workingRenewalTerms(input.working));
  const revision = (field: string) => workingEntry(input.working, field)?.revision ?? 0;
  if (
    !terms ||
    terms.rent !== binding.rent ||
    terms.effectiveDate !== binding.effectiveDate ||
    terms.endDate !== binding.endDate ||
    revision("terms_rent") !== binding.fieldRevisions.rent ||
    revision("terms_effective_date") !== binding.fieldRevisions.effectiveDate ||
    revision("terms_end_date") !== binding.fieldRevisions.endDate
  )
    return { state: "terms_changed", facts: [] };
  if (binding.economicsHash !== input.economicsHash)
    return { state: "charges_changed", facts: [] };
  // The approval covers the calculated charges. Charges a current mapping supplies instead are
  // covered by that mapping's own Admin approval; the packet says so rather than implying otherwise.
  const mappingCharges =
    input.packetChargesHash !== undefined &&
    input.packetChargesHash !== input.economicsHash;
  const workspace = input.workspace;
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
    ...(mappingCharges ? { notice: MAPPING_CHARGES_NOTICE } : {}),
    facts: [
      // Display text stays the stored value; a reviewed map field formats it for its document.
      fact("renewal.approved_rent", binding.rent, String(binding.rent)),
      fact("renewal.effective_date", binding.effectiveDate, binding.effectiveDate),
      fact("renewal.end_date", binding.endDate, binding.endDate),
    ],
  };
}
