// S159/S248 and S278 R-S278-4: the evidence reference a Sheet proposal prepared from recorded
// staff facts carries. One recorded fact names its event; a reviewed set of a lease row's listed
// cells names the ordered set of its facts' events through one digest. Each form binds the
// proposal to the exact recorded values it was prepared from: the one-attempt claim, the checks
// before and after each write and the receipt sync all read it. Server-only.

import { hashExecutionPreview } from "@/lib/execution/preview-hash";

const SINGLE = /^workspace:([1-9]\d*):cycle:([a-f0-9-]{36}):manual:([a-f0-9-]{36})$/;
const SET = /^workspace:([1-9]\d*):cycle:([a-f0-9-]{36}):manual:set-([a-f0-9]{64})$/;

export type ManualSheetReference =
  | {
      readonly kind: "single";
      readonly leaseId: string;
      readonly cycleId: string;
      readonly eventId: string;
    }
  | {
      readonly kind: "set";
      readonly leaseId: string;
      readonly cycleId: string;
      readonly setHash: string;
    };

/** True for every reference prepared from recorded staff facts, well formed or not. */
export function isManualSheetReference(evidenceRef: string): boolean {
  return evidenceRef.includes(":manual:");
}

/** The parsed reference, or null when it is not one of the two exact forms. */
export function parseManualSheetReference(
  evidenceRef: string,
): ManualSheetReference | null {
  const single = SINGLE.exec(evidenceRef);
  if (single)
    return {
      kind: "single",
      leaseId: single[1]!,
      cycleId: single[2]!,
      eventId: single[3]!,
    };
  const set = SET.exec(evidenceRef);
  if (set) return { kind: "set", leaseId: set[1]!, cycleId: set[2]!, setHash: set[3]! };
  return null;
}

export function manualSheetReference(
  leaseId: string,
  cycleId: string,
  eventId: string,
): string {
  return `workspace:${leaseId}:cycle:${cycleId}:manual:${eventId}`;
}

/** The digest of the ordered recorded facts one set proposal applies, cell by cell. */
export function manualSheetSetHash(
  entries: readonly { readonly field: string; readonly eventId: string }[],
): string {
  return hashExecutionPreview({
    version: "s278-manual-sheet-set/v1",
    entries: entries.map((entry) => [entry.field, entry.eventId]),
  });
}

export function manualSheetSetReference(
  leaseId: string,
  cycleId: string,
  entries: readonly { readonly field: string; readonly eventId: string }[],
): string {
  return `workspace:${leaseId}:cycle:${cycleId}:manual:set-${manualSheetSetHash(entries)}`;
}
