// S237 R-S237-1: the terms basis shown beside every RentVine and operating-Sheet preview: the
// Working terms revision and when it was saved, whether the recorded owner approval covers exactly
// those terms (owner-approval-binding), and the executed-document status for the same lease cycle
// (S236). It is informational only: it never becomes a prerequisite, never changes an effect, its
// hash or admission, and the page recomputes it every time the preview is shown. Pure and
// client-safe (PR #163 review): the panel recomputes it from the live Working and staff records.

import { packetWorkingTermsFreshness } from "@/lib/lease-documents/packet-terms-freshness";
import type { PacketSourceReference } from "@/lib/lease-documents/packet-types";
import {
  describeApprovalChanges,
  ownerApprovalCoverage,
  type OwnerApprovalCoverage,
} from "@/lib/lease-renewal/owner-approval-coverage";
import {
  workingEntry,
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

/** What the S236 returned-state view contributes; its terms freshness is recomputed live. */
export interface SourceUpdateReturnedBasis {
  readonly unavailable: string | null;
  readonly signaturesComplete: boolean;
  readonly overall: string;
  readonly packetTermsCurrent: boolean;
  readonly packetTermsBasis?: {
    readonly cycleId: string | null;
    readonly sourceVersions: readonly PacketSourceReference[];
    readonly createdAt: string;
  } | null;
}

export interface SourceUpdateTermsBasis {
  readonly terms: string;
  readonly approval: string;
  readonly documents: string;
}

const APPROVAL_COVERAGE: Record<OwnerApprovalCoverage["state"], string> = {
  current: "Owner approval covers these terms and charges",
  terms_changed:
    "Owner approval no longer covers these terms: the Working terms changed after it was recorded",
  charges_changed:
    "Owner approval no longer covers these terms: the calculated charges changed after it was recorded",
  no_working_terms: "The recorded owner approval does not name complete Working terms",
  not_recorded: "No recorded owner approval",
};

export function projectSourceUpdateTermsBasis(input: {
  readonly working: RenewalWorkingRecord | null;
  readonly workspace: RenewalWorkspaceState | null;
  /** The calculated charges' hash; null when the charges could not be read. */
  readonly economicsHash: string | null;
  /** The S236 returned-state view for this lease's current cycle; null when unread. */
  readonly returned: SourceUpdateReturnedBasis | null;
  readonly formatTime: (iso: string) => string;
}): SourceUpdateTermsBasis {
  const terms = workingRenewalTerms(input.working);
  const saved = (["terms_rent", "terms_effective_date", "terms_end_date"] as const)
    .map((field) => workingEntry(input.working, field)?.recordedAt ?? null)
    .filter((at): at is string => at !== null && Number.isFinite(Date.parse(at)))
    .sort()
    .at(-1);
  const coverage =
    input.economicsHash === null
      ? null
      : ownerApprovalCoverage({
          workspace: input.workspace,
          working: input.working,
          economicsHash: input.economicsHash,
        });
  // S234 R-S234-3: a stale approval names exactly which Working terms changed.
  const approval = !coverage
    ? "Owner approval coverage could not be checked: the calculated charges could not be read"
    : coverage.state === "terms_changed"
      ? `Owner approval no longer covers these terms: the Working ${describeApprovalChanges(coverage.changed)} changed after it was recorded`
      : APPROVAL_COVERAGE[coverage.state];
  const returned = input.returned;
  // PR #163 review: the packet's terms freshness follows the Working record shown now.
  const packetTermsCurrent =
    returned?.packetTermsBasis && returned.packetTermsCurrent
      ? packetWorkingTermsFreshness({
          ...returned.packetTermsBasis,
          working: input.working,
        }).current
      : (returned?.packetTermsCurrent ?? true);
  const documents =
    !returned || returned.unavailable
      ? "Executed documents: Not recorded"
      : !packetTermsCurrent
        ? "Executed documents: signatures are for earlier Working terms"
        : returned.signaturesComplete
          ? "Executed documents: Fully executed by staff record, not provider-verified"
          : `Executed documents: ${returned.overall}`;
  return {
    terms:
      terms.revision > 0
        ? `Working renewal terms revision ${terms.revision}${saved ? `, saved ${input.formatTime(saved)}` : ""}`
        : "No Working renewal terms saved",
    approval,
    documents,
  };
}
