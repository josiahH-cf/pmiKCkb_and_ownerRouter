import { createHash } from "node:crypto";

import type { ReconCandidate } from "@/lib/lease-renewal/reconciliation";

export const RENEWAL_RESOLUTION_CANDIDATE_FINGERPRINT_VERSION =
  "renewal-source-candidates/v1" as const;

type CandidateFact = Pick<ReconCandidate, "source" | "value">;

export interface RenewalResolutionFingerprintBinding {
  /** Exact Sheet row identity: linked provider id when present, otherwise the stable row coordinate. */
  readonly recordIdentity: string;
  /** Identities of the non-Sheet records actually joined to this Sheet row. */
  readonly sourceIdentities: readonly {
    source: string;
    joinKind: string;
    joinId: string | null;
    joinValue: string;
  }[];
}

function canonicalValue(fieldKey: string, value: ReconCandidate["value"]): unknown {
  if (value === null) return null;
  if (fieldKey === "current_rent" && typeof value === "string") {
    const trimmed = value.trim();
    if (/^\$?\s*\d[\d,]*(?:\.\d+)?$/.test(trimmed)) {
      const amount = Number(trimmed.replace(/[$,\s]/g, ""));
      if (Number.isFinite(amount)) return amount;
    }
  }
  if (typeof value === "string") return value.trim();
  return value;
}

/**
 * Versioned, order-independent digest of the exact source facts a human reviewed. Read timestamps,
 * labels, and links are intentionally excluded so an equivalent reread stays current; a source,
 * presence, or canonical value change reopens the decision.
 */
export function renewalResolutionCandidateFingerprint(
  fieldKey: string,
  candidates: readonly CandidateFact[],
  binding?: RenewalResolutionFingerprintBinding,
): string {
  const facts = candidates
    .map((candidate) => ({
      source: candidate.source,
      value: canonicalValue(fieldKey, candidate.value),
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const canonicalBinding = binding
    ? {
        recordIdentity: binding.recordIdentity,
        sourceIdentities: [...binding.sourceIdentities].sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        ),
      }
    : null;
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        version: RENEWAL_RESOLUTION_CANDIDATE_FINGERPRINT_VERSION,
        fieldKey,
        facts,
        binding: canonicalBinding,
      }),
    )
    .digest("hex");
  return `rcf1_${digest}`;
}
