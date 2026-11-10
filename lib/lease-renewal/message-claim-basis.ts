import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  workingEntry,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
/**
 * S234 R-S234-2: the Working terms a message was composed from, each with its revision. They are
 * the renewal terms, so the claim re-reads them in its transaction and any terms save after the
 * preview refuses it.
 */
export function workingTermsFingerprint(working: RenewalWorkingRecord | null) {
  const field = (key: string) => {
    const entry = workingEntry(working, key);
    return entry ? { value: entry.value, revision: entry.revision } : null;
  };
  return hashExecutionPreview({
    rent: field("terms_rent"),
    effectiveDate: field("terms_effective_date"),
    endDate: field("terms_end_date"),
  });
}
/**
 * S261 ARCH-S261-2: the working current rent correction an owner message's base was calculated
 * from, with its revision. The draft claim re-reads it in its transaction, so a correction saved
 * after the preview (even to the same amount) refuses that older preview.
 */
export function workingBaseFingerprint(working: RenewalWorkingRecord | null) {
  const entry = workingEntry(working, "current_rent");
  return hashExecutionPreview({
    currentRent: entry ? { value: entry.value, revision: entry.revision } : null,
  });
}
export function workspaceMessageBasisFingerprint(head: Record<string, unknown>) {
  return hashExecutionPreview({
    cycleId: head.cycleId,
    termsRevision: head.termsRevision,
    ownerResponse: head.ownerResponse,
    tenantResponse: head.tenantResponse,
    preparation: head.preparation,
  });
}
/**
 * S265 (ARCH-S265-3): the fingerprint of the tenant resources a reviewed message includes, from
 * their frozen evidence only. A resource the message omits contributes nothing, so a change to it
 * changes no message that leaves it out.
 */
export function includedResourceFingerprint(
  included: readonly import("./tenant-resource-evidence").FrozenTenantResource[],
) {
  return hashExecutionPreview({
    includedResources: [...included].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  });
}
/**
 * The pre-S265 fingerprint of all three tenant entries. Snapshots reviewed before S265 carry it;
 * claims no longer compare it, because an unused resource change must not refuse a message.
 */
export function messageResourceFingerprint(settings: Record<string, unknown> | null) {
  const entries = settings?.entries as Record<string, unknown> | undefined;
  return hashExecutionPreview({
    resources:
      settings === null
        ? null
        : {
            insurance_flyer: entries?.insurance_flyer ?? null,
            renewal_information_form: entries?.renewal_information_form ?? null,
            rbp_flyer: entries?.rbp_flyer ?? null,
          },
  });
}
export interface RenewalMessageClaimBasis {
  workspaceFingerprint: string;
  sourceFingerprint: string;
  resourceFingerprint: string;
  preparationRevision: number;
  /** Absent only on historical receipts; never sufficient for a new claim. */
  noticeSafety?: { scopeHash: string; version: number; semanticHash: string };
  /** S234: absent only on snapshots prepared before it; never sufficient for a new claim. */
  workingTermsFingerprint?: string;
  /**
   * S261: the owner message's base correction by revision. Absent on tenant messages and on owner
   * snapshots prepared before it, which keep their recovery.
   */
  workingBaseFingerprint?: string;
  /** Zero or absent means that this lease had no retirement record at review. */
  dispositionRevision?: number;
  signatureSetup?: import("./sender-signature-choice").SenderSignatureEvidence;
  /**
   * S265 (R-S265-4): the frozen evidence of each tenant resource the exact reviewed content
   * includes; empty when it includes none. Absent only on snapshots prepared before S265, whose
   * stored content then decides whether they include a resource.
   */
  includedResources?: import("./tenant-resource-evidence").FrozenTenantResource[];
}
