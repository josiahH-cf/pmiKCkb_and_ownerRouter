// S246 R-S246-5: the two staff choices for a lease whose recorded cycle date is earlier than the
// lease end RentVine reports now. Server only.
//
//   - Keep working: an app-owned decision in its own store. It completes nothing.
//   - Record staff completion: the existing staff completion of the work record, carrying the
//     RentVine lease end as its source evidence. It is the same save every other completion uses,
//     so it stays on the record it names and reaches no provider.
//
// Both verify, on the server, that the work record is still the unfinished cycle staff saw and
// that RentVine still reports the later lease end they saw. Nothing completes by itself: each
// runs only from a staff confirmation and is refused for a verification account.

import type { Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  CYCLE_DATE_CHANGED_MESSAGE,
  KeepWorkingCycleSchema,
  assertCycleDateChoiceAuthority,
  recordKeepWorkingCycle,
} from "@/lib/firestore/renewal-cycle-date-decisions";
import {
  getRenewalWorkspace,
  saveRenewalWorkspace,
} from "@/lib/firestore/renewal-workspace";
import { sourceRenewalCompletionEvidence } from "@/lib/lease-renewal/cycle-date-decision";
import { resolveCurrentLeaseEndIso } from "@/lib/lease-renewal/workspace-cycle-context";

export type CycleDateChoiceDependencies = {
  /** The lease end the current source read reports; a browser value never stands in for it. */
  readonly currentLeaseEndIso?: (
    actor: AuthenticatedUser,
    leaseId: string,
  ) => Promise<string | null>;
  readonly db?: Firestore;
};

/** Keep working the recorded cycle. The lease stays in the batch of the cycle staff recorded. */
export async function keepWorkingRecordedCycle(
  actor: AuthenticatedUser,
  raw: unknown,
  dependencies: CycleDateChoiceDependencies = {},
) {
  assertCycleDateChoiceAuthority(actor);
  const input = KeepWorkingCycleSchema.parse(raw);
  const sourceEnd = await (dependencies.currentLeaseEndIso ?? resolveCurrentLeaseEndIso)(
    actor,
    input.leaseId,
  );
  return recordKeepWorkingCycle(actor, input, sourceEnd, dependencies.db);
}

/**
 * Record staff completion of the recorded cycle with the RentVine lease end as its evidence.
 * A repeated request returns the completion it already recorded.
 */
export async function confirmSourceRenewalCompletion(
  actor: AuthenticatedUser,
  raw: unknown,
  dependencies: CycleDateChoiceDependencies = {},
) {
  assertCycleDateChoiceAuthority(actor);
  const input = KeepWorkingCycleSchema.parse(raw);
  const [state, sourceEnd] = await Promise.all([
    getRenewalWorkspace(actor, input.leaseId, dependencies.db),
    (dependencies.currentLeaseEndIso ?? resolveCurrentLeaseEndIso)(actor, input.leaseId),
  ]);
  if (state?.completion?.eventId === input.operationId) return { state, duplicate: true };
  if (
    !state ||
    state.completion ||
    state.basis.kind !== "lease_end" ||
    state.basis.dateIso !== input.recordedDateIso ||
    sourceEnd !== input.sourceDateIso ||
    input.sourceDateIso <= input.recordedDateIso
  )
    throw new EditableLayerError(CYCLE_DATE_CHANGED_MESSAGE, 409);
  return saveRenewalWorkspace(
    actor,
    {
      leaseId: input.leaseId,
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: input.operationId,
      action: {
        kind: "complete",
        ...sourceRenewalCompletionEvidence({
          recordedDateIso: input.recordedDateIso,
          sourceDateIso: input.sourceDateIso,
        }),
      },
    },
    dependencies.db,
  );
}
