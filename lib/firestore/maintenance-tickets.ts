import { readApplicableOperatingPolicyInTransaction } from "./maintenance-operating-policy-reader";
import { projectMaintenanceUrgency } from "@/lib/maintenance/operating-policy";
import {
  MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION,
  readMaintenancePropertyPreapprovalRecord,
} from "@/lib/firestore/maintenance-property-preapprovals";
import { readCurrentMaintenancePolicyOwnerRefs } from "@/lib/maintenance/policy-source";
import {
  MaintenanceAssessmentInputSchema,
  MaintenanceStageSchema,
  MAINTENANCE_STAGE_TRANSITIONS,
  maintenanceStage,
  assessmentStage,
  maintenanceStatusForStage,
  maintenanceWorkScope,
  maintenanceWorkAuthorized,
} from "@/lib/maintenance/lifecycle";
import { createHash } from "node:crypto";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
// KB-owned persistence for the Maintenance Work Order Intake ticket queue (console overhaul Slice E).
// Turns the previously-ephemeral work-order capture into a real, tracked ticket with a lifecycle
// (Open / Waiting on Response / Waiting on Vendor / Scheduled / Closed), labels, assignment, notes,
// and an append-only Activity twin — mirroring lib/firestore/workflow-run-step-checks.ts.
//
// This store performs app-plane bookkeeping behind the `edit` capability. Live provider writes and
// sends are separate exact action/target confirmations through the external execution boundary. The
// Timestamps are ISO strings (no serverTimestamp) so the writer is deterministic and unit-testable
// against a simple fake as well as the real Admin SDK.

import { FieldPath } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveStoredDataMode } from "@/lib/data-mode";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  appendMaintenanceTicketNotification,
  type MaintenanceTicketNotificationEvent,
} from "@/lib/firestore/maintenance-ticket-notifications";
import {
  MAINTENANCE_ALLOWED_STATUS_TRANSITIONS,
  MAINTENANCE_TICKET_STATUSES,
  type MaintenanceTicketActivityRecord,
  type MaintenanceTicketRecord,
} from "@/lib/maintenance/ticket-model";
import {
  MAX_PREAPPROVAL_AMOUNT_CENTS,
  formatPreapprovalAmount,
} from "@/lib/maintenance/property-preapproval";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";

// Re-export the client-safe model so server callers (routes, page) can keep importing types from
// here; the client queue imports them directly from lib/maintenance/ticket-model to avoid pulling
// this server module (firebase-admin) into the client bundle.
export {
  MAINTENANCE_TICKET_STATUSES,
  type MaintenanceTicketActivityAction,
  type MaintenanceTicketActivityRecord,
  type MaintenanceTicketRecord,
  type MaintenanceTicketReporter,
  type MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";

export const MAINTENANCE_TICKET_COLLECTIONS = {
  tickets: "maintenance_tickets",
  activity: "maintenance_ticket_activity",
  vendorAssignments: "vendor_ticket_assignments",
  creationIntents: "maintenance_ticket_creation_intents",
  operations: "maintenance_ticket_operations",
} as const;

import {
  CreateMaintenanceTicketInputSchema,
  CreateLiveMaintenanceTicketInputSchema,
} from "@/lib/maintenance/creation-intent";
export { CreateMaintenanceTicketInputSchema, CreateLiveMaintenanceTicketInputSchema };
export type CreateMaintenanceTicketInput = z.input<
  typeof CreateMaintenanceTicketInputSchema
>;

const MaintenanceTicketStatusSchema = z.enum(MAINTENANCE_TICKET_STATUSES);

// One change per call, discriminated by `op`, so each transition writes exactly one Activity entry.
const ticketCommand = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .extend({
      operationId: z.string().uuid().optional(),
      expectedVersion: z.number().int().nonnegative().optional(),
    })
    .strict();
export const TransitionMaintenanceTicketInputSchema = z.discriminatedUnion("op", [
  ticketCommand({
    op: z.literal("status"),
    status: MaintenanceTicketStatusSchema,
    reason: z.string().trim().max(4000).optional(),
  }),
  // Non-empty uid to assign, or null to unassign. trim().min(1) rejects "" / whitespace AND normalizes so
  // the value the route roster-checks is exactly the value persisted (no check/write drift); the route
  // additionally validates the uid against the assignable roster.
  ticketCommand({
    op: z.literal("assign"),
    assigneeUid: z.string().trim().min(1).max(200).nullable(),
  }),
  ticketCommand({ op: z.literal("label-add"), label: z.string().trim().min(1).max(160) }),
  ticketCommand({
    op: z.literal("label-remove"),
    label: z.string().trim().min(1).max(160),
  }),
  ticketCommand({ op: z.literal("note"), text: z.string().trim().min(1).max(50000) }),
  // S108: the exact estimate for this work, in whole cents. `null` clears it, which returns the
  // ticket to needing an owner decision; absence is never treated as within a preapproval.
  ticketCommand({
    op: z.literal("estimate"),
    amountCents: z.number().int().positive().max(MAX_PREAPPROVAL_AMOUNT_CENTS).nullable(),
    note: z.string().trim().min(1).max(2_000).optional(),
    costBasis: z
      .enum([
        "total_including_tax_and_markup",
        "vendor_cost_including_tax",
        "vendor_cost_excluding_tax",
      ])
      .optional(),
  }),
  ticketCommand({ op: z.literal("reopen"), reason: z.string().trim().min(1).max(4000) }),
  ticketCommand({
    ...MaintenanceAssessmentInputSchema.shape,
    op: z.literal("assessment"),
  }),
  ticketCommand({
    op: z.literal("lifecycle"),
    stage: MaintenanceStageSchema,
    reason: z.string().trim().min(1).max(4000),
    evidence_refs: z.array(z.string().trim().min(1).max(1000)).max(30).default([]),
  }).strict(),
  ticketCommand({
    op: z.literal("owner-decision"),
    decision: z.enum(["approved", "declined", "needs_changes"]),
    cost_basis: z.literal("total_including_tax_and_markup"),
    evidence_ref: z.string().trim().min(1).max(1000),
    reason: z.string().trim().min(1).max(4000),
  }).strict(),
]);
export const HttpTransitionMaintenanceTicketInputSchema =
  TransitionMaintenanceTicketInputSchema.superRefine((input, ctx) => {
    if (input.operationId === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["operationId"],
        message: "Retain one operation identity before dispatch.",
      });
    if (input.expectedVersion === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["expectedVersion"],
        message: "Read the current ticket version before applying an edit.",
      });
  });
export type TransitionMaintenanceTicketInput = z.input<
  typeof TransitionMaintenanceTicketInputSchema
>;

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (
    !["Editor", "Approver", "Admin"].includes(actor.role) ||
    !can(actor.role, capability) ||
    actor.hd !== "pmikcmetro.com" ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    (capability !== "read" && isVerificationAccount(actor))
  ) {
    throw new EditableLayerError(
      "This user is not authorized for the requested maintenance-ticket action.",
      403,
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function activityDoc(
  partial: Omit<MaintenanceTicketActivityRecord, "id" | "created_at">,
  createdAt: string,
) {
  return stampProductRecordRetention(
    "maintenance_ticket_activity",
    stripUndefined({
      id: uuidv7(),
      created_at: createdAt,
      ...partial,
    }) as MaintenanceTicketActivityRecord & Record<string, unknown>,
  );
}

export async function createMaintenanceTicket(
  actor: AuthenticatedUser,
  input: CreateMaintenanceTicketInput,
  db: Firestore = getAdminFirestore(),
  verifiedPropertyId?: string,
): Promise<MaintenanceTicketRecord> {
  assertCan(actor, "edit");
  const parsed = CreateMaintenanceTicketInputSchema.parse(input);
  const createdAt = nowIso();
  const id = uuidv7();

  const record: MaintenanceTicketRecord = stampProductRecordRetention(
    MAINTENANCE_TICKET_COLLECTIONS.tickets,
    {
      id,
      data_mode: parsed.data_mode,
      status: "Open" as const,
      record_version: 1,
      workflow_stage: "assessment" as const,
      meaningful_progress_at: createdAt,
      lifecycle_started_at: createdAt,
      lifecycle_origin: "native" as const,
      priority: parsed.priority,
      priority_provenance: parsed.priority_provenance,
      summary: parsed.summary,
      description: parsed.description,
      unit: { unitId: parsed.unit.unitId, label: parsed.unit.label },
      ...(verifiedPropertyId && /^[1-9][0-9]*$/.test(verifiedPropertyId)
        ? { property_id: verifiedPropertyId }
        : {}),
      photo_refs: parsed.photo_refs,
      reporter: { kind: "staff" as const, uid: actor.uid },
      labels: [],
      space_id: parsed.space_id,
      ...(parsed.source_trigger_key
        ? { source_trigger_key: parsed.source_trigger_key }
        : {}),
      created_at: createdAt,
      updated_at: createdAt,
    },
  );

  // The ticket and its append-only Activity row commit together (atomic), so the audit twin can
  // never be left missing after a partial failure.
  const intentRef = parsed.creation_id
    ? db
        .collection(MAINTENANCE_TICKET_COLLECTIONS.creationIntents)
        .doc(creationIntentKey(actor, parsed.creation_id))
    : null;
  const fingerprint = creationFingerprint(parsed);
  return db.runTransaction(async (transaction) => {
    if (intentRef) {
      const existing = await transaction.get(intentRef);
      if (existing.exists) {
        const intent = existing.data()!;
        assertCreationIntent(intent, actor, fingerprint);
        const prior = await transaction.get(
          db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(intent.ticket_id),
        );
        if (!prior.exists)
          throw new EditableLayerError(
            "The original creation is recorded, but its ticket is unavailable. Reconcile this exact intent; do not create another.",
            409,
          );
        return readMaintenanceTicket(prior.id, prior.data()!);
      }
    }
    const applicable = await readApplicableOperatingPolicyInTransaction(
      transaction,
      db,
      "emergency",
      verifiedPropertyId ?? null,
      createdAt,
    );
    const decision = projectMaintenanceUrgency(
      { summary: parsed.summary, description: parsed.description },
      applicable.policy,
    );
    const committedRecord = {
      ...record,
      priority: decision.priority === "Emergency" ? "Emergency" : record.priority,
      operating_policy_decision: decision,
    };
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(id),
      stripUndefined(committedRecord),
    );
    const initialActivity = activityDoc(
      {
        ticket_id: id,
        actor_uid: actor.uid,
        action: "create",
        new_status: "Open",
        ticket_version: 1,
      },
      createdAt,
    );
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(initialActivity.id),
      initialActivity,
    );
    appendMaintenanceCoreTimeline(
      transaction,
      db,
      committedRecord,
      initialActivity,
      createdAt,
    );
    if (intentRef)
      transaction.set(
        intentRef,
        stampProductRecordRetention("maintenance_ticket_creation_intents", {
          actor_uid: actor.uid,
          creation_id: parsed.creation_id!,
          fingerprint,
          ticket_id: id,
          state: "created",
          created_at: createdAt,
        }),
      );
    return committedRecord;
  });
}

function creationIntentKey(actor: AuthenticatedUser, creationId: string) {
  return createHash("sha256")
    .update(JSON.stringify([actor.uid, creationId]))
    .digest("hex");
}
function creationFingerprint(input: CreateMaintenanceTicketInput) {
  const parsed = { ...CreateMaintenanceTicketInputSchema.parse(input) };
  delete parsed.creation_id;
  return createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
}
function assertCreationIntent(
  intent: Record<string, unknown>,
  actor: AuthenticatedUser,
  fingerprint?: string,
) {
  if (
    intent.actor_uid !== actor.uid ||
    typeof intent.ticket_id !== "string" ||
    intent.state !== "created"
  )
    throw new EditableLayerError(
      "The original creation receipt cannot be reconciled.",
      409,
    );
  if (fingerprint && intent.fingerprint !== fingerprint)
    throw new EditableLayerError(
      "This creation intent already records different captured content. Recover the original result before starting deliberately new work.",
      409,
    );
}
export async function readMaintenanceTicketCreation(
  actor: AuthenticatedUser,
  creationId: string,
  input?: CreateMaintenanceTicketInput,
  db: Firestore = getAdminFirestore(),
) {
  assertCan(actor, "read");
  z.string().uuid().parse(creationId);
  const ref = db
    .collection(MAINTENANCE_TICKET_COLLECTIONS.creationIntents)
    .doc(creationIntentKey(actor, creationId));
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists)
      return {
        state: "not_recorded" as const,
        creation_id: creationId,
        ticket: null,
        detail:
          "No settled result is recorded for this intent yet. A missing result does not prove that an in-flight request failed.",
      };
    const intent = snapshot.data()!;
    assertCreationIntent(intent, actor, input ? creationFingerprint(input) : undefined);
    const ticket = await tx.get(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(intent.ticket_id),
    );
    if (!ticket.exists)
      return {
        state: "unresolved" as const,
        creation_id: creationId,
        ticket: null,
        detail:
          "The creation is recorded, but its exact ticket cannot be read. Keep this original intent for reconciliation.",
      };
    return {
      state: "created" as const,
      creation_id: creationId,
      ticket: readMaintenanceTicket(ticket.id, ticket.data()!),
      detail:
        "The app ticket and initial activity were committed together. A separate provider work order is not established by this receipt.",
    };
  });
}

export async function transitionMaintenanceTicket(
  actor: AuthenticatedUser,
  ticketId: string,
  input: TransitionMaintenanceTicketInput,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketRecord> {
  assertCan(actor, "edit");
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,200}$/)
    .parse(ticketId);
  const op = TransitionMaintenanceTicketInputSchema.parse(input);
  if (op.operationId === undefined || op.expectedVersion === undefined)
    throw new EditableLayerError(
      "Read the current ticket version and retain one operation identity before applying this edit.",
      400,
    );
  const fingerprint = createHash("sha256").update(JSON.stringify(op)).digest("hex");
  const operationRef = op.operationId
    ? db
        .collection(MAINTENANCE_TICKET_COLLECTIONS.operations)
        .doc(maintenanceOperationKey(actor, ticketId, op.operationId))
    : null;
  // Input-only validation (not state-dependent) is cheap to do before the transaction.
  if (op.op === "status" && op.status === "Closed" && !op.reason?.trim()) {
    throw new EditableLayerError("A reason is required to close a ticket.", 400);
  }

  const updatedAt = nowIso();
  const ticketRef = db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId);

  const needsWork =
    (op.op === "lifecycle" &&
      ["vendor_coordination", "scheduled", "in_progress"].includes(op.stage)) ||
    (op.op === "status" && ["Waiting on Vendor", "Scheduled"].includes(op.status));
  let ownerProperty: string | null = null,
    ownerRefs: string[] = [];
  if (needsWork) {
    const before = await ticketRef.get(),
      raw = before.data();
    const property = raw?.property_id;
    if (typeof property === "string") {
      const policy = await db
        .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
        .doc(property)
        .get();
      if (policy.data()?.policy_terms?.scope === "owner") {
        ownerProperty = property;
        ownerRefs = await readCurrentMaintenancePolicyOwnerRefs(property);
      }
    }
  }

  // Read-modify-write inside a transaction so concurrent transitions on the same ticket cannot
  // clobber each other (lost update), and the ticket + its Activity row commit atomically.
  return db.runTransaction(async (transaction) => {
    const priorOperation = operationRef ? await transaction.get(operationRef) : null;
    const snapshot = await transaction.get(ticketRef);
    if (!snapshot.exists) {
      throw new EditableLayerError("That maintenance ticket does not exist.", 404);
    }
    const persistedTicket = snapshot.data()!;
    const ticket = readMaintenanceTicket(snapshot.id, persistedTicket);
    if (ticket.data_mode !== "live") {
      throw new EditableLayerError(
        "Legacy Test maintenance tickets are retired and cannot be changed.",
        409,
      );
    }

    if (priorOperation?.exists) {
      const prior = priorOperation.data()!;
      if (
        prior.actor_uid !== actor.uid ||
        prior.ticket_id !== ticketId ||
        prior.fingerprint !== fingerprint
      )
        throw new EditableLayerError(
          "That operation identity records different work. Recover its original receipt.",
          409,
        );
      return ticket;
    }
    if (
      op.expectedVersion !== undefined &&
      op.expectedVersion !== (ticket.record_version ?? 0)
    )
      throw new EditableLayerError(
        "This ticket changed in another workspace. Your words are kept; read its current version before applying a new edit.",
        409,
      );
    let currentPolicy = null;
    if (needsWork && ticket.property_id) {
      const policy = await transaction.get(
        db
          .collection(MAINTENANCE_PROPERTY_PREAPPROVAL_COLLECTION)
          .doc(ticket.property_id),
      );
      if (policy.exists)
        currentPolicy = readMaintenancePropertyPreapprovalRecord(policy.data()!);
    }
    const workAuthorized = maintenanceWorkAuthorized(
      ticket,
      currentPolicy,
      ownerProperty === ticket.property_id ? ownerRefs : [],
      updatedAt,
    );
    // Validate and apply the product-record retention contract before any transition-specific
    // transaction write. This upgrades a fully legacy record, preserves an existing legal hold,
    // and refuses a partial/malformed retention state before a Vendor assignment or notification
    // could be queued.
    let updated: MaintenanceTicketRecord = stampProductRecordRetention(
      "maintenance_tickets",
      {
        ...ticket,
        updated_at: updatedAt,
        record_version: (ticket.record_version ?? 0) + 1,
        lifecycle_started_at: ticket.lifecycle_started_at ?? updatedAt,
        lifecycle_origin: ticket.lifecycle_origin ?? "legacy_starting_state",
      },
      persistedTicket,
    );
    let activity: Omit<MaintenanceTicketActivityRecord, "id" | "created_at">;
    // The assignee-facing notification event for this transition, or undefined when the change carries
    // no notification (label/note edits, or an unassign). Emitted at the end inside the SAME atomic
    // transaction so the notification twin can never be left missing after a partial failure.
    let notificationEvent: MaintenanceTicketNotificationEvent | undefined;

    switch (op.op) {
      case "status": {
        const reason = op.reason?.trim();
        if (op.status === "Closed" && op.operationId !== undefined)
          throw new EditableLayerError(
            "Use PMI completion review or troubleshooting closeout to close this case.",
            409,
          );
        if (op.operationId !== undefined && maintenanceStage(ticket) === "assessment")
          throw new EditableLayerError(
            "Assess this issue before changing its work stage.",
            409,
          );
        const nextStage =
          op.status === "Scheduled"
            ? "scheduled"
            : op.status === "Waiting on Vendor"
              ? "vendor_coordination"
              : "needs_information";
        if (!MAINTENANCE_STAGE_TRANSITIONS[maintenanceStage(ticket)].includes(nextStage))
          throw new EditableLayerError(
            "Use a legal next maintenance stage; this status shortcut cannot skip assessment or PMI review.",
            409,
          );
        if (needsWork && !workAuthorized)
          throw new EditableLayerError(
            "Record the actual scoped owner decision or effective standing authorization before coordinating work.",
            409,
          );
        if (op.status === "Closed" && !reason) {
          throw new EditableLayerError("A reason is required to close a ticket.", 400);
        }
        if (!MAINTENANCE_ALLOWED_STATUS_TRANSITIONS[ticket.status].includes(op.status)) {
          throw new EditableLayerError(
            ticket.status === "Closed"
              ? "Closed tickets can only be reopened through the explicit Reopen action."
              : `A maintenance ticket cannot move from ${ticket.status} to ${op.status}.`,
            409,
          );
        }
        updated = {
          ...updated,
          status: op.status,
          ...(op.operationId
            ? {
                workflow_stage:
                  op.status === "Closed"
                    ? ("closed" as const)
                    : op.status === "Scheduled"
                      ? ("scheduled" as const)
                      : op.status === "Waiting on Vendor"
                        ? ("vendor_coordination" as const)
                        : ("needs_information" as const),
              }
            : {}),
          closed_at: op.status === "Closed" ? updatedAt : undefined,
          closed_reason: op.status === "Closed" ? reason : undefined,
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: op.status === "Closed" ? "close" : "status",
          previous_status: ticket.status,
          new_status: op.status,
          text: reason,
        };
        notificationEvent = op.status === "Closed" ? "closed" : "status_changed";
        break;
      }
      case "reopen": {
        if (ticket.status !== "Closed") {
          throw new EditableLayerError(
            "Only a closed maintenance ticket can be reopened.",
            409,
          );
        }
        updated = {
          ...updated,
          status: "Open",
          workflow_stage: "assessment",
          owner_decision: undefined,
          closed_at: undefined,
          closed_reason: undefined,
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "reopen",
          previous_status: "Closed",
          new_status: "Open",
          text: op.reason,
        };
        notificationEvent = "reopened";
        break;
      }
      case "assign": {
        updated = { ...updated, assignee_uid: op.assigneeUid ?? undefined };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "assign",
          text: op.assigneeUid ?? "unassigned",
        };
        notificationEvent = op.assigneeUid ? "assigned" : undefined;
        break;
      }
      case "label-add": {
        updated = {
          ...updated,
          labels: updated.labels.includes(op.label)
            ? updated.labels
            : [...updated.labels, op.label],
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "label",
          text: `+${op.label}`,
        };
        break;
      }
      case "label-remove": {
        updated = {
          ...updated,
          labels: updated.labels.filter((label) => label !== op.label),
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "label",
          text: `-${op.label}`,
        };
        break;
      }
      case "estimate": {
        updated = {
          ...updated,
          estimate_amount_cents: op.amountCents ?? undefined,
          estimate_cost_basis: op.amountCents === null ? undefined : op.costBasis,
          ...(op.amountCents !== ticket.estimate_amount_cents ||
          op.costBasis !== ticket.estimate_cost_basis
            ? { owner_decision: undefined }
            : {}),
          estimate_recorded_at: op.amountCents === null ? undefined : updatedAt,
          estimate_recorded_by_uid: op.amountCents === null ? undefined : actor.uid,
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "estimate",
          text:
            op.amountCents === null
              ? "Cleared the estimate amount."
              : `Recorded an estimate of ${formatPreapprovalAmount(op.amountCents)}.${op.note ? ` ${op.note}` : ""}`,
        };
        break;
      }
      case "assessment": {
        if (ticket.status === "Closed")
          throw new EditableLayerError(
            "Reopen this closed case before assessing it again.",
            409,
          );
        const assessment = {
            outcome: op.outcome,
            scope: op.scope,
            evidence_refs: op.evidence_refs,
            version: (ticket.assessment?.version ?? 0) + 1,
            recorded_at: updatedAt,
            recorded_by_uid: actor.uid,
          },
          stage = assessmentStage(op.outcome);
        updated = {
          ...updated,
          assessment,
          workflow_stage: stage,
          status: maintenanceStatusForStage(stage),
          owner_decision: undefined,
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "assessment",
          previous_stage: maintenanceStage(ticket),
          new_stage: stage,
          text: JSON.stringify(assessment),
        };
        break;
      }
      case "owner-decision": {
        if (
          ticket.status === "Closed" ||
          ticket.assessment?.outcome !== "work_required" ||
          !ticket.estimate_amount_cents
        )
          throw new EditableLayerError(
            "An assessed work scope and exact estimate are required before recording this owner's decision.",
            409,
          );
        updated = {
          ...updated,
          estimate_cost_basis: op.cost_basis,
          owner_decision: {
            decision: op.decision,
            work_scope: maintenanceWorkScope({
              ...ticket,
              estimate_cost_basis: op.cost_basis,
            }),
            cost_basis: op.cost_basis,
            evidence_ref: op.evidence_ref,
            reason: op.reason,
            recorded_at: updatedAt,
            recorded_by_uid: actor.uid,
          },
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "owner-decision",
          text: JSON.stringify(updated.owner_decision),
        };
        break;
      }
      case "lifecycle": {
        const previous = maintenanceStage(ticket);
        if (!MAINTENANCE_STAGE_TRANSITIONS[previous].includes(op.stage))
          throw new EditableLayerError(
            "That maintenance stage cannot follow the current stage. Assess, return or reopen the case explicitly.",
            409,
          );
        if (op.stage === "assessment" && ticket.status === "Closed")
          throw new EditableLayerError(
            "Use the explicit Reopen action with its reason.",
            409,
          );
        if (
          ["vendor_coordination", "scheduled", "in_progress"].includes(op.stage) &&
          !workAuthorized
        )
          throw new EditableLayerError(
            "The current work scope has no recorded owner approval or effective standing authorization. Review the current financial basis first.",
            409,
          );
        if (
          op.stage === "closed" &&
          op.evidence_refs.length === 0 &&
          ticket.assessment?.evidence_refs.length === 0
        )
          throw new EditableLayerError(
            "PMI closeout requires a retained evidence reference or the recorded troubleshooting evidence.",
            400,
          );
        const status = maintenanceStatusForStage(op.stage);
        updated = {
          ...updated,
          workflow_stage: op.stage,
          status,
          ...(status === "Closed"
            ? { closed_at: updatedAt, closed_reason: op.reason }
            : {}),
          ...(op.stage === "assessment" ? { owner_decision: undefined } : {}),
        };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action:
            op.stage === "closed" || op.stage === "cancelled" ? "close" : "lifecycle",
          previous_status: ticket.status,
          new_status: status,
          previous_stage: previous,
          new_stage: op.stage,
          text: JSON.stringify({ reason: op.reason, evidence_refs: op.evidence_refs }),
        };
        notificationEvent = status === "Closed" ? "closed" : "status_changed";
        break;
      }
      case "note": {
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "note",
          text: op.text,
        };
        break;
      }
    }

    if (!["label-add", "label-remove"].includes(op.op))
      updated = { ...updated, meaningful_progress_at: updatedAt };
    activity = { ...activity, ticket_version: updated.record_version };
    transaction.set(ticketRef, stripUndefined(updated));
    if (operationRef)
      transaction.set(
        operationRef,
        stampProductRecordRetention("maintenance_ticket_operations", {
          actor_uid: actor.uid,
          ticket_id: ticketId,
          operation_id: op.operationId!,
          fingerprint,
          committed_version: updated.record_version!,
          created_at: updatedAt,
          state: "committed",
        }),
      );
    const durableActivity = activityDoc(activity, updatedAt);
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(durableActivity.id),
      durableActivity,
    );
    if (!ticket.lifecycle_started_at)
      appendMaintenanceCoreTimeline(
        transaction,
        db,
        ticket,
        {
          id: uuidv7(),
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "note",
          text: "Existing open case starting state observed; earlier transactions were not backfilled.",
          ticket_version: updated.record_version,
        },
        updatedAt,
        "case_starting_state",
      );
    appendMaintenanceCoreTimeline(transaction, db, updated, durableActivity, updatedAt);
    // Notify the ticket's assignee inside the same transaction. No-op when nobody is assigned or the
    // assignee is the actor (no self-notify), so only a delegated change reaches someone else.
    if (notificationEvent) {
      appendMaintenanceTicketNotification(transaction, db, {
        ticketId,
        event: notificationEvent,
        recipientUid: updated.assignee_uid,
        actorUid: actor.uid,
        ticketStatus: updated.status,
        createdAt: updatedAt,
      });
    }
    return updated;
  });
}

export async function getMaintenanceTicket(
  actor: AuthenticatedUser,
  ticketId: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketRecord | null> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(MAINTENANCE_TICKET_COLLECTIONS.tickets)
    .doc(ticketId)
    .get();
  if (!snapshot.exists) return null;
  return readMaintenanceTicket(snapshot.id, snapshot.data()!);
}

export async function listMaintenanceTickets(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).get();
  return snapshot.docs
    .map((doc) => readMaintenanceTicket(doc.id, doc.data()))
    .filter((ticket) => ticket.data_mode === "live")
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function readMaintenanceTicket(
  id: string,
  data: Record<string, unknown>,
): MaintenanceTicketRecord {
  const record = readRecord<MaintenanceTicketRecord>(id, data);
  return {
    ...record,
    data_mode: resolveStoredDataMode(record),
    record_version: record.record_version ?? 0,
    workflow_stage: maintenanceStage(record),
  };
}

export async function listMaintenanceTicketActivity(
  actor: AuthenticatedUser,
  ticketId: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketActivityRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).get();
  return snapshot.docs
    .map((doc) => readRecord<MaintenanceTicketActivityRecord>(doc.id, doc.data()))
    .filter((record) => record.ticket_id === ticketId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function readRecord<T>(id: string, data: Record<string, unknown>): T {
  return normalizeFirestoreValue({ ...data, id }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** S203 metadata read: bounded pages over the owning ticket store; no descriptions or reporter data leave it. */
export async function readMaintenanceSearchMetadata(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const records: Array<
    Pick<
      MaintenanceTicketRecord,
      "id" | "summary" | "unit" | "property_id" | "status" | "updated_at" | "vendor_id"
    >
  > = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    let q = db
      .collection(MAINTENANCE_TICKET_COLLECTIONS.tickets)
      .orderBy(FieldPath.documentId())
      .limit(500);
    if (after) q = q.startAfter(after);
    const result = await q.get();
    for (const d of result.docs) {
      const t = readMaintenanceTicket(d.id, d.data());
      if (t.data_mode !== "live") continue;
      records.push({
        id: t.id,
        summary: t.summary.slice(0, 240),
        unit: t.unit,
        status: t.status,
        updated_at: t.updated_at,
        ...(t.property_id ? { property_id: t.property_id } : {}),
        ...(t.vendor_id ? { vendor_id: t.vendor_id } : {}),
      });
    }
    if (result.size < 500) return { records, complete: true };
    after = result.docs.at(-1)!.id;
  }
  return { records, complete: false };
}

export function maintenanceOperationKey(
  actor: AuthenticatedUser,
  ticketId: string,
  operationId: string,
) {
  return createHash("sha256")
    .update(JSON.stringify([actor.uid, ticketId, operationId]))
    .digest("hex");
}
export async function readMaintenanceTicketOperation(
  actor: AuthenticatedUser,
  ticketId: string,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  assertCan(actor, "read");
  z.string().uuid().parse(operationId);
  return db.runTransaction(async (tx) => {
    const receipt = await tx.get(
      db
        .collection(MAINTENANCE_TICKET_COLLECTIONS.operations)
        .doc(maintenanceOperationKey(actor, ticketId, operationId)),
    );
    if (!receipt.exists)
      return {
        state: "not_recorded",
        operation_id: operationId,
        ticket: null,
        detail:
          "No settled receipt is recorded. Absence does not prove an in-flight edit failed; keep this original operation.",
      };
    const operation = receipt.data()!;
    if (operation.actor_uid !== actor.uid || operation.ticket_id !== ticketId)
      throw new EditableLayerError("The original operation cannot be reconciled.", 409);
    if (operation.state === "cancelled")
      return {
        state: "cancelled",
        operation_id: operationId,
        ticket: null,
        detail:
          "This exact app operation was stopped before commitment. Its original identity cannot commit later. Your entered words may be reviewed as new work.",
      };
    const snapshot = await tx.get(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId),
    );
    return {
      state: snapshot.exists ? "committed" : "unresolved",
      operation_id: operationId,
      committed_version: operation.committed_version,
      ticket: snapshot.exists
        ? readMaintenanceTicket(snapshot.id, snapshot.data()!)
        : null,
      detail:
        "The app edit was recorded. Current ticket state may include later work; this receipt proves no provider effect or payment.",
    };
  });
}

export function appendMaintenanceCoreTimeline(
  transaction: import("firebase-admin/firestore").Transaction,
  db: Firestore,
  ticket: MaintenanceTicketRecord,
  activity: Omit<MaintenanceTicketActivityRecord, "created_at">,
  at: string,
  kind?: string,
) {
  transaction.set(
    db.collection("maintenance_case_events").doc(activity.id),
    stampProductRecordRetention(
      "maintenance_case_events",
      stripUndefined({
        id: activity.id,
        ticket_id: ticket.id,
        ticket_version: activity.ticket_version ?? ticket.record_version ?? 0,
        kind: kind ?? activity.action,
        actor_kind: "staff",
        actor_id: activity.actor_uid,
        occurred_at: at,
        recorded_at: at,
        summary:
          activity.text ??
          (activity.action === "create"
            ? "Maintenance case created for assessment."
            : "Maintenance activity recorded."),
        evidence_refs:
          activity.action === "assessment"
            ? (ticket.assessment?.evidence_refs ?? [])
            : [],
        association: ticket.maintenance_association ?? null,
        state_snapshot: {
          stage: maintenanceStage(ticket),
          status: ticket.status,
          property_id: ticket.property_id ?? null,
          unit_id: ticket.unit?.unitId ?? null,
          assessment: ticket.assessment ?? null,
          estimate_amount_cents: ticket.estimate_amount_cents ?? null,
          estimate_cost_basis: ticket.estimate_cost_basis ?? null,
          owner_decision: ticket.owner_decision ?? null,
        },
      }),
    ),
  );
}

/** Atomically fences only an app-owned original edit. If it committed first, report it honestly.
 * Every owning editor reads this same operation document before its atomic writes. */
export async function stopOriginalMaintenanceEdit(
  actor: AuthenticatedUser,
  ticketId: string,
  operationId: string,
  db: Firestore = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  if (isVerificationAccount(actor))
    throw new EditableLayerError("Verification accounts cannot stop app edits.", 403);
  z.string().uuid().parse(operationId);
  const ref = db
    .collection(MAINTENANCE_TICKET_COLLECTIONS.operations)
    .doc(maintenanceOperationKey(actor, ticketId, operationId));
  return db.runTransaction(async (tx) => {
    const [prior, ticket] = await tx.getAll(
      ref,
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId),
    );
    if (!ticket.exists || ticket.data()!.data_mode !== "live")
      throw new EditableLayerError("That maintenance case is unavailable.", 404);
    if (prior.exists) {
      if (prior.data()!.actor_uid !== actor.uid || prior.data()!.ticket_id !== ticketId)
        throw new EditableLayerError(
          "The original edit identity could not be reconciled.",
          409,
        );
      if (prior.data()!.state === "committed")
        return {
          state: "committed",
          operation_id: operationId,
          committed_version: prior.data()!.committed_version,
          ticket: readMaintenanceTicket(ticket.id, ticket.data()!),
        };
      if (prior.data()!.state !== "cancelled")
        throw new EditableLayerError(
          "The recorded app outcome needs reconciliation; it was not relabeled.",
          409,
        );
      return { state: "cancelled", operation_id: operationId, ticket: null };
    }
    tx.create(
      ref,
      stampProductRecordRetention("maintenance_ticket_operations", {
        actor_uid: actor.uid,
        ticket_id: ticketId,
        operation_id: operationId,
        fingerprint: "cancelled-before-commit",
        state: "cancelled",
        created_at: new Date().toISOString(),
      }),
    );
    return { state: "cancelled", operation_id: operationId, ticket: null };
  });
}
