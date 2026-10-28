// S236 (PR #161 review) / S237 (PR #163 review): which Working term revisions a packet's documents
// carry, and whether they are still the current ones. Pure and client-safe, so the server's
// returned-state view and the page's live terms basis read the same rule.

import type { PacketSourceReference } from "@/lib/lease-documents/packet-types";
import {
  workingEntry,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import type { ApprovedWorkingTerms } from "@/lib/lease-renewal/workspace-state";

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
