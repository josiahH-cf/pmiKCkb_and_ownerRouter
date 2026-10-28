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
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
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
