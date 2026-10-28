"use client";
import { formatCalendarDate } from "@/lib/date-display";
import {
  describeOwnerApprovalCoverage,
  ownerApprovalCoverage,
} from "@/lib/lease-renewal/owner-approval-coverage";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * S234 R-S234-3: which Working terms (with their revisions) and charges the recorded owner approval
 * covers, and whether it still covers them, naming exactly what changed. Shown in the Owner
 * response section and on the document handoff; it reads the same rule as the packet.
 */
export function OwnerApprovalCoverageLine({
  state,
  economicsHash,
}: Readonly<{
  state: RenewalWorkspaceState | null;
  /** The current calculated charges' hash; null when the page could not compute them. */
  economicsHash: string | null;
}>) {
  const working = useRenewalWorkingRecord();
  if (state?.ownerResponse?.outcome !== "approved_terms" || !working) return null;
  if (working.readUnavailable)
    return (
      <p data-renewal-field="owner-approval-coverage" data-coverage="unavailable">
        Owner approval coverage could not be checked: the Working terms could not be read.
      </p>
    );
  const coverage = ownerApprovalCoverage({
    workspace: state,
    working: working.record,
    economicsHash,
  });
  return (
    <p data-renewal-field="owner-approval-coverage" data-coverage={coverage.state}>
      {describeOwnerApprovalCoverage(coverage, {
        money: (value) => USD.format(value),
        date: (iso) => formatCalendarDate(iso),
      })}
    </p>
  );
}
