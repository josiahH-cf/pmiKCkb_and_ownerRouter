import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import { isCompleteLeaseRenewalResolutionRecord } from "@/lib/lease-renewal/effective-data-check";

export const WRITEBACK_AUTHORIZATION_TOKEN_VERSION =
  "lease-renewal-writeback-authorization/v1" as const;

export interface WritebackAuthorizationSnapshot {
  sourceTriggerKey: string;
  runId: string;
  propertyKey?: string;
  fieldKey: string;
  proposedValue: string;
  sourceOfValue: string;
  candidateFingerprint: string;
  resolutionUpdatedAt: string;
}

/**
 * Bodyless, immutable identity of the exact queued proposal an Admin reviewed. This is a
 * freshness token, not a bearer credential: the authenticated Admin gate still authorizes the
 * decision, while the server recomputes this value from the current resolution before accepting it.
 */
export function buildWritebackAuthorizationToken(
  snapshot: WritebackAuthorizationSnapshot,
): string {
  const digest = hashExecutionPreview({
    version: WRITEBACK_AUTHORIZATION_TOKEN_VERSION,
    sourceTriggerKey: snapshot.sourceTriggerKey,
    runId: snapshot.runId,
    propertyKey: snapshot.propertyKey ?? null,
    fieldKey: snapshot.fieldKey,
    proposedValue: snapshot.proposedValue,
    sourceOfValue: snapshot.sourceOfValue,
    candidateFingerprint: snapshot.candidateFingerprint,
    resolutionUpdatedAt: snapshot.resolutionUpdatedAt,
  });
  return `rwat1_${digest}`;
}

/** Return the token only for a complete, source-bound queued resolution. */
export function writebackAuthorizationTokenForResolution(
  resolution: LeaseRenewalResolutionRecord,
): string | null {
  const proposal = resolution.proposed_writeback;
  if (
    !isCompleteLeaseRenewalResolutionRecord(resolution) ||
    resolution.status !== "Resolved" ||
    proposal?.status !== "Queued" ||
    !resolution.candidate_fingerprint?.trim() ||
    !resolution.updated_at?.trim()
  ) {
    return null;
  }
  return buildWritebackAuthorizationToken({
    sourceTriggerKey: resolution.source_trigger_key,
    runId: resolution.run_id,
    ...(resolution.property_key ? { propertyKey: resolution.property_key } : {}),
    fieldKey: resolution.field_key,
    proposedValue: proposal.value,
    sourceOfValue: proposal.source_of_value,
    candidateFingerprint: resolution.candidate_fingerprint,
    resolutionUpdatedAt: resolution.updated_at,
  });
}
