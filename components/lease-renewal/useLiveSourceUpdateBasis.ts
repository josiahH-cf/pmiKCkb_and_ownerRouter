"use client";
// S237 (PR #163 review): the terms basis and "What still differs" are recomputed on every render
// from the live Working record and staff record, so a Working terms save or a fresh preview never
// leaves them describing earlier terms. The page's server reads are the fallback when a provider
// is absent or its record is unreadable.

import { formatBusinessTimestamp } from "@/lib/date-display";
import {
  projectRemainingDifferences,
  type RemainingDifferenceRow,
} from "@/lib/lease-renewal/remaining-differences";
import {
  projectSourceUpdateTermsBasis,
  type SourceUpdateTermsBasis,
} from "@/lib/lease-renewal/source-update-terms-basis";
import {
  currentAcceptanceHold,
  type TenantAcceptanceHold,
  type TenantAcceptanceRead,
} from "@/lib/lease-renewal/tenant-acceptance-hold";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { useRenewalNowCard } from "./RenewalNowCardContext";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";

export type SourceUpdateTermsBasisInputs = Omit<
  Parameters<typeof projectSourceUpdateTermsBasis>[0],
  "formatTime"
>;
export type RemainingDifferencesInputs = Parameters<
  typeof projectRemainingDifferences
>[0];

function useLiveRecords(fallback: {
  working: SourceUpdateTermsBasisInputs["working"];
  workspace: SourceUpdateTermsBasisInputs["workspace"];
}) {
  const working = useRenewalWorkingRecord();
  const manual = useRenewalManualWorkspace();
  return {
    working: working && !working.readUnavailable ? working.record : fallback.working,
    workspace: manual?.state ?? fallback.workspace,
  };
}

export function useLiveTermsBasis(
  inputs: SourceUpdateTermsBasisInputs | null,
): SourceUpdateTermsBasis | null {
  const live = useLiveRecords({
    working: inputs?.working ?? null,
    workspace: inputs?.workspace ?? null,
  });
  return inputs
    ? projectSourceUpdateTermsBasis({
        ...inputs,
        ...live,
        formatTime: formatBusinessTimestamp,
      })
    : null;
}

export function useLiveRemainingDifferences(
  inputs: RemainingDifferencesInputs | null,
): readonly RemainingDifferenceRow[] | null {
  const live = useLiveRecords({
    working: inputs?.working ?? null,
    workspace: inputs?.workspace ?? null,
  });
  return inputs ? projectRemainingDifferences({ ...inputs, ...live }) : null;
}

/**
 * S264 R-S264-6: the hold on a source update that carries the accepted renewal while the tenant's
 * recorded acceptance answers an earlier offer. The tenant message's live read comes first, then
 * this page's read; either counts only for the work record's current tenant answer. Where no work
 * record is mounted or given, the page's read stands as it was bound when the page was read.
 * Shown only: the server checks the same hold before any claim.
 */
export function useLiveAcceptanceHold(
  read: TenantAcceptanceRead | null | undefined,
  fallbackWorkspace?: RenewalWorkspaceState | null,
): TenantAcceptanceHold | null {
  const manual = useRenewalManualWorkspace();
  const live = useRenewalNowCard()?.offerAnswers?.view?.acceptance;
  const state = manual ? manual.state : fallbackWorkspace;
  if (state === undefined)
    return read?.state === "earlier_offer" && read.line
      ? { eventId: read.eventId, line: read.line }
      : null;
  return currentAcceptanceHold(state, [live, read]);
}
