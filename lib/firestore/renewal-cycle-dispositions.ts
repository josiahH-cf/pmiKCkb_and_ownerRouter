import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  CycleDispositionIdentitySchema,
  CycleDispositionRecordSchema,
  dispositionCycleFor,
  projectCycleDisposition,
  type CycleDispositionRecord,
  type DispositionSourceBasis,
} from "@/lib/lease-renewal/cycle-disposition";
import { cycleDateDecisionIsCurrent } from "@/lib/lease-renewal/cycle-date-decision";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import {
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "./renewal-workspace";
import {
  RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS,
  RenewalCycleDateDecisionSchema,
  renewalCycleDateDecisionDocId,
} from "./renewal-cycle-date-decisions";

import { dispositionRef, readDispositionRecord } from "./renewal-cycle-disposition-read";
export const ChangeRenewalCycleDispositionSchema = CycleDispositionRecordSchema.pick({
  leaseId: true,
  action: true,
  reason: true,
  operationId: true,
})
  .extend({
    expected: z
      .object({
        cycle: CycleDispositionIdentitySchema,
        revision: z.number().int().nonnegative(),
        workspaceRevision: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type ChangeRenewalCycleDisposition = z.infer<
  typeof ChangeRenewalCycleDispositionSchema
>;

export class PendingRenewalDispatchError extends EditableLayerError {
  constructor(
    readonly sequenceId: string | null,
    readonly executionId: string | null,
    message: string,
  ) {
    super(message, 409);
  }
}

async function assertNoPendingDispatch(
  tx: Transaction,
  db: Firestore,
  leaseId: string,
  cycleId: string | null,
) {
  const sequences = await tx.get(
    db
      .collection("gmail_communication_sequences")
      .where("context.entityId", "==", leaseId)
      .limit(501),
  );
  if (sequences.size > 500)
    throw new PendingRenewalDispatchError(
      null,
      null,
      "The linked communications could not all be checked. Review them before retiring this cycle.",
    );
  const pending = sequences.docs.find((doc) => {
    const data = doc.data();
    return (
      !data.purged &&
      data.context?.lane === "renewals" &&
      data.context?.entityType === "renewal_lease" &&
      (!cycleId || !data.noticeCycleId || data.noticeCycleId === cycleId) &&
      (data.unresolvedOccurrenceId ||
        data.state === "needs_reconciliation" ||
        (data.state === "active" && data.authorization && data.nextDueAtMs !== null))
    );
  });
  if (pending) {
    const reconcile =
      Boolean(pending.get("unresolvedOccurrenceId")) ||
      pending.get("state") === "needs_reconciliation";
    throw new PendingRenewalDispatchError(
      pending.id,
      null,
      reconcile
        ? "Reconcile the exact pending send in Communications before retiring this cycle."
        : "Pause or cancel the scheduled communication before retiring this cycle.",
    );
  }
  if (!cycleId) return;
  const drafts = await tx.get(
    db
      .collection("action_executions")
      .where(
        "scope_ref",
        "==",
        `external-workflow:live:renewal-live:${leaseId}:cycle:${cycleId}`,
      )
      .limit(501),
  );
  const unresolved = drafts.docs.find(
    (doc) =>
      doc.get("action_key") === "gmail.renewal_notice.draft_create" &&
      ["Executing", "Needs reconciliation"].includes(doc.get("state")),
  );
  if (unresolved || drafts.size > 500)
    throw new PendingRenewalDispatchError(
      null,
      unresolved?.id ?? null,
      "Check the pending Gmail draft in the lease's message history before retiring this cycle.",
    );
}

export async function readRenewalDispositionEvent(
  leaseId: string,
  operationId: string,
  db: Firestore = getAdminFirestore(),
): Promise<CycleDispositionRecord | null> {
  const doc = await dispositionRef(db, leaseId)
    .collection("history")
    .doc(operationId)
    .get();
  if (!doc.exists) return null;
  const result = CycleDispositionRecordSchema.parse(doc.get("result"));
  if (result.leaseId !== leaseId || result.operationId !== operationId)
    throw new EditableLayerError(
      "The saved retirement event has a different identity.",
      409,
    );
  return result;
}

export async function listRenewalDispositionEvents(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
) {
  const docs = await dispositionRef(db, leaseId)
    .collection("history")
    .orderBy("result.revision", "desc")
    .limit(51)
    .get();
  return {
    events: docs.docs
      .slice(0, 50)
      .map((doc) => CycleDispositionRecordSchema.parse(doc.get("result"))),
    truncated: docs.size > 50,
  };
}

export async function changeRenewalCycleDisposition(
  actor: AuthenticatedUser,
  input: ChangeRenewalCycleDisposition,
  source: DispositionSourceBasis | null,
  db: Firestore = getAdminFirestore(),
) {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, "edit") ||
    !hasSpaceAccess(actor, "renewals") ||
    isVerificationAccount(actor)
  )
    throw new EditableLayerError(
      "Editing this lease in Renewals requires authorized Editor access.",
      403,
    );
  input = ChangeRenewalCycleDispositionSchema.parse(input);
  const ref = dispositionRef(db, input.leaseId);
  const event = ref.collection("history").doc(input.operationId);
  const workspaceRefs = renewalWorkspaceHeadRefs(db, input.leaseId);
  const decisionRef = db
    .collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head)
    .doc(renewalCycleDateDecisionDocId(input.leaseId));
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, input });
  await db.runTransaction(async (tx) => {
    const [saved, prior, dated, leaseBound, decision] = await tx.getAll(
      ref,
      event,
      workspaceRefs.dated,
      workspaceRefs.leaseBound,
      decisionRef,
    );
    if (prior.exists) {
      if (prior.get("requestHash") !== requestHash)
        throw new EditableLayerError(
          "This retirement operation already names a different decision.",
          409,
        );
      return;
    }
    const workspace = currentRenewalWorkspaceState(db, input.leaseId, dated, leaseBound);
    const basis = workspace?.basis;
    const keepWorking =
      source?.kind === "lease_end" &&
      basis?.kind === "lease_end" &&
      decision.exists &&
      cycleDateDecisionIsCurrent(RenewalCycleDateDecisionSchema.parse(decision.data()), {
        cycleId: workspace?.cycleId,
        recordedDateIso: basis.dateIso,
        sourceDateIso: source.dateIso,
      });
    const cycle = dispositionCycleFor(source, workspace, keepWorking);
    const current = projectCycleDisposition(
      readDispositionRecord(saved, input.leaseId),
      cycle,
      workspace?.revision ?? 0,
    );
    if (!cycle || current.state === "unavailable")
      throw new EditableLayerError(
        "Refresh the current lease and verify its cycle before recording a disposition.",
        409,
      );
    if (
      current.revision !== input.expected.revision ||
      current.workspaceRevision !== input.expected.workspaceRevision ||
      hashExecutionPreview(cycle) !== hashExecutionPreview(input.expected.cycle)
    )
      throw new EditableLayerError(
        "The current cycle or retirement changed. Refresh and review it again. Your reason is kept.",
        409,
      );
    if (input.action === "retire" && current.state === "retired")
      throw new EditableLayerError("This cycle is already retired.", 409);
    if (input.action === "restore" && current.state !== "retired")
      throw new EditableLayerError("Only a current retirement can be restored.", 409);
    if (input.action === "retire")
      await assertNoPendingDispatch(tx, db, input.leaseId, cycle.cycleId);
    const result: CycleDispositionRecord = {
      leaseId: input.leaseId,
      cycle,
      revision: current.revision + 1,
      action: input.action,
      reason: input.reason,
      actorUid: actor.uid,
      at: new Date().toISOString(),
      operationId: input.operationId,
    };
    tx.set(ref, result);
    tx.create(event, { result, requestHash });
  });
  const result = await readRenewalDispositionEvent(input.leaseId, input.operationId, db);
  if (!result) throw new Error("Retirement event readback is unavailable.");
  return result;
}
