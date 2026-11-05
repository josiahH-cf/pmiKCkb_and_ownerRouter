// S246 R-S246-5: the app-owned store for staff's choice to keep working a recorded cycle after
// RentVine reported a later lease end. One current decision per lease plus append-only activity,
// with the same conventions as the staff work status store: server-derived actor, an environment
// mutation check, duplicate-operation protection and a refusal for a verification account.
//
// A decision is bound to the exact work record, the lease end that record recorded and the later
// lease end RentVine reported. It reads the lease's current work record inside the transaction only
// to verify that binding. It never creates, advances, completes or reopens a work record, and it
// reaches no provider. A decision for other dates is simply not current, so the lease asks again.

import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import {
  RENEWAL_CYCLE_DATE_DECISION_SCHEMA_VERSION,
  type RenewalCycleDateDecision,
} from "@/lib/lease-renewal/cycle-date-decision";

export const RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS = {
  head: "lease_renewal_cycle_date_decisions",
  activity: "lease_renewal_cycle_date_decision_activity",
} as const;

const leaseId = z.string().regex(/^[1-9]\d*$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RenewalCycleDateDecisionSchema = z
  .object({
    schemaVersion: z.literal(RENEWAL_CYCLE_DATE_DECISION_SCHEMA_VERSION),
    leaseId,
    cycleId: z.string().uuid(),
    recordedDateIso: isoDate,
    sourceDateIso: isoDate,
    decision: z.literal("keep_working"),
    revision: z.number().int().positive(),
    recordedAt: z.string().datetime(),
    recordedByUid: z.string().min(1),
    recordedByLabel: z.string().min(1),
    eventId: z.string().uuid(),
  })
  .strict();

/** What staff saw and chose: the recorded cycle date and the later lease end RentVine reports. */
export const KeepWorkingCycleSchema = z
  .object({
    leaseId,
    recordedDateIso: isoDate,
    sourceDateIso: isoDate,
    operationId: z.string().uuid(),
  })
  .strict();
export type KeepWorkingCycleInput = z.input<typeof KeepWorkingCycleSchema>;

/**
 * A confirmation also names the work record staff reviewed: its cycle and its revision. The two
 * dates cannot tell when another operator changed that record after the row was shown, so the
 * completion is bound to the exact version on screen and a newer one is refused.
 */
export const ConfirmSourceRenewalSchema = KeepWorkingCycleSchema.extend({
  cycleId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();
export type ConfirmSourceRenewalInput = z.input<typeof ConfirmSourceRenewalSchema>;

export const CYCLE_DATE_CHANGED_MESSAGE =
  "This lease changed since the page was opened, so nothing was recorded. Reload Renewals and choose again.";

export function renewalCycleDateDecisionDocId(id: string): string {
  return createHash("sha256").update(leaseId.parse(id)).digest("hex");
}

function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      write
        ? "Editor access is required to record this choice. Continue read-only or ask an Admin to review your role."
        : "Renewal workspace read access is required.",
      403,
    );
}

/**
 * The write authority both choices need, checked before any source read: an environment that
 * allows mutation, Editor access, and an account that is not a verification account.
 */
export function assertCycleDateChoiceAuthority(actor: AuthenticatedUser): void {
  assertActor(actor, true);
}

/** Whether this account may record either choice here; the desk offers the actions only then. */
export function canRecordCycleDateChoice(actor: AuthenticatedUser): boolean {
  try {
    assertActor(actor, true);
    return true;
  } catch {
    return false;
  }
}

function parseDecision(raw: unknown, id: string): RenewalCycleDateDecision {
  const decision = RenewalCycleDateDecisionSchema.parse(raw);
  if (decision.leaseId !== id)
    throw new EditableLayerError(
      "The saved choice does not match this lease. Reload before recording it again.",
      409,
    );
  return decision;
}

export async function getRenewalCycleDateDecision(
  actor: AuthenticatedUser,
  id: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalCycleDateDecision | null> {
  assertActor(actor);
  const snapshot = await db
    .collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head)
    .doc(renewalCycleDateDecisionDocId(id))
    .get();
  return snapshot.exists ? parseDecision(snapshot.data(), id) : null;
}

/** Every current decision keyed by lease id, for the one bulk desk read. */
export async function listRenewalCycleDateDecisions(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, RenewalCycleDateDecision>> {
  assertActor(actor);
  const docs = await db.collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head).get();
  return new Map(
    docs.docs.map((doc) => {
      const decision = RenewalCycleDateDecisionSchema.parse(doc.data());
      if (doc.id !== renewalCycleDateDecisionDocId(decision.leaseId))
        throw new EditableLayerError("A saved choice identity is invalid.", 409);
      return [decision.leaseId, decision];
    }),
  );
}

/**
 * Record "keep working" for one lease. `currentSourceEndIso` is the lease end the current RentVine
 * read reports, resolved by the caller on the server; a browser value never stands in for it. The
 * work record is read inside the transaction and must still be the unfinished cycle staff saw.
 */
export async function recordKeepWorkingCycle(
  actor: AuthenticatedUser,
  raw: unknown,
  currentSourceEndIso: string | null,
  db: Firestore = getAdminFirestore(),
): Promise<{ decision: RenewalCycleDateDecision; duplicate: boolean }> {
  assertActor(actor, true);
  const input = KeepWorkingCycleSchema.parse(raw);
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const head = db
    .collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.head)
    .doc(renewalCycleDateDecisionDocId(input.leaseId));
  const event = db
    .collection(RENEWAL_CYCLE_DATE_DECISION_COLLECTIONS.activity)
    .doc(input.operationId);
  const workspaceRefs = renewalWorkspaceHeadRefs(db, input.leaseId);
  const duplicate = await db.runTransaction(async (tx) => {
    const [snapshot, prior, dated, leaseBound] = await Promise.all([
      tx.get(head),
      tx.get(event),
      tx.get(workspaceRefs.dated),
      tx.get(workspaceRefs.leaseBound),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This choice changed after it was first sent. Reload Renewals and choose again.",
          409,
        );
      return true;
    }
    const workspace = currentRenewalWorkspaceState(db, input.leaseId, dated, leaseBound);
    if (
      !workspace ||
      workspace.completion ||
      workspace.basis.kind !== "lease_end" ||
      workspace.basis.dateIso !== input.recordedDateIso ||
      currentSourceEndIso !== input.sourceDateIso ||
      input.sourceDateIso <= input.recordedDateIso
    )
      throw new EditableLayerError(CYCLE_DATE_CHANGED_MESSAGE, 409);
    const current = snapshot.exists
      ? parseDecision(snapshot.data(), input.leaseId)
      : null;
    const now = new Date().toISOString();
    const next = RenewalCycleDateDecisionSchema.parse({
      schemaVersion: RENEWAL_CYCLE_DATE_DECISION_SCHEMA_VERSION,
      leaseId: input.leaseId,
      cycleId: workspace.cycleId,
      recordedDateIso: input.recordedDateIso,
      sourceDateIso: input.sourceDateIso,
      decision: "keep_working",
      revision: (current?.revision ?? 0) + 1,
      recordedAt: now,
      recordedByUid: actor.uid,
      recordedByLabel: actor.email,
      eventId: input.operationId,
    } satisfies RenewalCycleDateDecision);
    tx.set(head, next);
    tx.create(event, {
      lease_id: input.leaseId,
      cycle_id: workspace.cycleId,
      request_hash: requestHash,
      actor_uid: actor.uid,
      actor_label: actor.email,
      recorded_at: now,
      decision: "keep_working",
      recorded_date: input.recordedDateIso,
      source_date: input.sourceDateIso,
      previous_revision: current?.revision ?? 0,
      next_revision: next.revision,
    });
    return false;
  });
  const decision = await getRenewalCycleDateDecision(actor, input.leaseId, db);
  if (!decision)
    throw new EditableLayerError(
      "The saved choice could not be read back. Reload before recording it again.",
      409,
    );
  return { decision, duplicate };
}
