// S262 R-S262-2 (ARCH-S262-2): the working-record change a reviewed owner answer with an Amount
// approved makes, planned as one value so the S234 transaction writes it with the response or not
// at all. The approved amount becomes the working renewal base for the exact cycle, with the
// answer as its basis. Rent to recommend is kept as its own fact: an existing one stays, and a
// shared working value is preserved with its original attribution. When no recommendation can
// be established it stays unavailable; the approved amount is never copied into it. Working
// dates, lease facts and earlier values are untouched. Pure.

import {
  RENEWAL_WORKING_RECORD_SCHEMA_VERSION,
  type RenewalWorkingRecord,
  type WorkingFieldEntry,
} from "./working-record";

export interface ApprovedBaseWorkingChange {
  /** The stored working record to write, or null when it already holds exactly this answer. */
  readonly record: RenewalWorkingRecord | null;
  /** Append-only working activity for each field this change writes, keyed by its event id. */
  readonly events: readonly {
    readonly id: string;
    readonly doc: Record<string, unknown>;
  }[];
  /** The working renewal base revision the approval covers. */
  readonly workingRevision: number;
  /** The recommendation the review named, or null when it is unavailable. */
  readonly recommended: { readonly value: number; readonly revision: number } | null;
}

const sameAmount = (left: number, right: number) => Math.abs(left - right) < 0.005;

export function planApprovedBaseChange(input: {
  readonly leaseId: string;
  /** The stored record, every field as saved. */
  readonly stored: RenewalWorkingRecord | null;
  /** The same record projected onto the cycle the answer is recorded for. */
  readonly projected: RenewalWorkingRecord | null;
  readonly cycleId: string;
  readonly amount: number;
  readonly ownerResponseEventId: string;
  readonly actor: { readonly uid: string; readonly label: string };
  readonly recordedAt: string;
  readonly newEventId: () => string;
}): ApprovedBaseWorkingChange {
  const fields: Record<string, WorkingFieldEntry> = { ...(input.stored?.fields ?? {}) };
  const events: { id: string; doc: Record<string, unknown> }[] = [];
  const base = input.projected?.fields.terms_rent ?? null;
  const ownRecommendation = input.projected?.fields.recommended_rent ?? null;
  const event = (
    field: string,
    previous: WorkingFieldEntry | null,
    next: WorkingFieldEntry,
    extra: Record<string, unknown>,
  ) => ({
    id: next.eventId,
    doc: {
      lease_id: input.leaseId,
      field,
      actor_uid: input.actor.uid,
      actor_label: input.actor.label,
      recorded_at: input.recordedAt,
      previous_value: previous?.value ?? null,
      next_value: next.value,
      previous_revision: previous?.revision ?? 0,
      next_revision: next.revision,
      origin: next.origin,
      ...(next.sourceLabel ? { source_label: next.sourceLabel } : {}),
      ...(next.context ? { context: next.context } : {}),
      cycle_id: input.cycleId,
      ...(previous?.cycleId !== undefined ? { previous_cycle_id: previous.cycleId } : {}),
      owner_response_event_id: input.ownerResponseEventId,
      ...extra,
    },
  });

  let recommended: ApprovedBaseWorkingChange["recommended"] = null;
  if (ownRecommendation) {
    recommended =
      typeof ownRecommendation.value === "number"
        ? { value: ownRecommendation.value, revision: ownRecommendation.revision }
        : null;
  } else if (base && !base.basis && typeof base.value === "number") {
    // The shared working value was the recommendation: it becomes its own fact, unchanged.
    const previous = input.stored?.fields.recommended_rent ?? null;
    const preserved: WorkingFieldEntry = {
      value: base.value,
      revision: (previous?.revision ?? 0) + 1,
      eventId: input.newEventId(),
      recordedAt: base.recordedAt,
      recordedByUid: base.recordedByUid,
      recordedByLabel: base.recordedByLabel,
      origin: base.origin,
      ...(base.sourceLabel ? { sourceLabel: base.sourceLabel } : {}),
      ...(base.context ? { context: base.context } : {}),
      cycleId: input.cycleId,
      preservedFrom: {
        field: "terms_rent",
        revision: base.revision,
        eventId: base.eventId,
      },
    };
    fields.recommended_rent = preserved;
    events.push(
      event("recommended_rent", previous, preserved, {
        preserved_from: preserved.preservedFrom,
      }),
    );
    recommended = { value: base.value, revision: preserved.revision };
  }

  let workingRevision: number;
  if (
    base?.basis?.kind === "owner_approval" &&
    base.cycleId === input.cycleId &&
    typeof base.value === "number" &&
    sameAmount(base.value, input.amount)
  ) {
    // The same approved amount for this cycle: its revision stands and the answer covers it.
    workingRevision = base.revision;
  } else {
    const previous = input.stored?.fields.terms_rent ?? null;
    const next: WorkingFieldEntry = {
      value: input.amount,
      revision: (previous?.revision ?? 0) + 1,
      eventId: input.newEventId(),
      recordedAt: input.recordedAt,
      recordedByUid: input.actor.uid,
      recordedByLabel: input.actor.label,
      origin: "staff_entry",
      cycleId: input.cycleId,
      basis: { kind: "owner_approval", ownerResponseEventId: input.ownerResponseEventId },
    };
    fields.terms_rent = next;
    events.push(event("terms_rent", previous, next, { basis: next.basis }));
    workingRevision = next.revision;
  }

  return {
    record: events.length
      ? {
          schemaVersion: RENEWAL_WORKING_RECORD_SCHEMA_VERSION,
          leaseId: input.leaseId,
          revision: (input.stored?.revision ?? 0) + 1,
          fields,
        }
      : null,
    events,
    workingRevision,
    recommended,
  };
}
