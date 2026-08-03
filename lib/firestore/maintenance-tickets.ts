// KB-owned persistence for the Maintenance Work Order Intake ticket queue (console overhaul Slice E).
// Turns the previously-ephemeral work-order capture into a real, tracked ticket with a lifecycle
// (Open / Waiting on Response / Waiting on Vendor / Scheduled / Closed), labels, assignment, notes,
// and an append-only Activity twin — mirroring lib/firestore/workflow-run-step-checks.ts.
//
// This store performs app-plane bookkeeping behind the `edit` capability. Live provider writes and
// sends are separate exact action/target confirmations through the external execution boundary. The
// Timestamps are ISO strings (no serverTimestamp) so the writer is deterministic and unit-testable
// against a simple fake as well as the real Admin SDK.

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
} as const;

export const CreateMaintenanceTicketInputSchema = z.object({
  data_mode: z.literal("live").default("live"),
  summary: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.string().trim().min(1),
  priority_provenance: z.enum(["auto-inferred", "operator-set"]).default("operator-set"),
  // A ticket is actionable only after the operator chooses a roster-backed suggestion. Raw typed
  // location text and nullable/unverified objects are intentionally rejected at this server seam.
  unit: z.object({
    unitId: z.string().trim().min(1),
    label: z.string().trim().min(1),
    confidence: z.literal("Verified"),
  }),
  photo_refs: z.array(z.string()).default([]),
  space_id: z.string().default("maintenance-work-order-intake"),
  source_trigger_key: z.string().optional(),
});
export type CreateMaintenanceTicketInput = z.input<
  typeof CreateMaintenanceTicketInputSchema
>;

export const CreateLiveMaintenanceTicketInputSchema = CreateMaintenanceTicketInputSchema;

const MaintenanceTicketStatusSchema = z.enum(MAINTENANCE_TICKET_STATUSES);

// One change per call, discriminated by `op`, so each transition writes exactly one Activity entry.
export const TransitionMaintenanceTicketInputSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("status"),
    status: MaintenanceTicketStatusSchema,
    reason: z.string().optional(),
  }),
  // Non-empty uid to assign, or null to unassign. trim().min(1) rejects "" / whitespace AND normalizes so
  // the value the route roster-checks is exactly the value persisted (no check/write drift); the route
  // additionally validates the uid against the assignable roster.
  z.object({ op: z.literal("assign"), assigneeUid: z.string().trim().min(1).nullable() }),
  z.object({ op: z.literal("label-add"), label: z.string().trim().min(1) }),
  z.object({ op: z.literal("label-remove"), label: z.string().trim().min(1) }),
  z.object({ op: z.literal("note"), text: z.string().trim().min(1) }),
  z.object({ op: z.literal("reopen"), reason: z.string().trim().min(1) }),
]);
export type TransitionMaintenanceTicketInput = z.input<
  typeof TransitionMaintenanceTicketInputSchema
>;

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
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
  return stripUndefined({ id: uuidv7(), created_at: createdAt, ...partial });
}

export async function createMaintenanceTicket(
  actor: AuthenticatedUser,
  input: CreateMaintenanceTicketInput,
  db: Firestore = getAdminFirestore(),
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
      priority: parsed.priority,
      priority_provenance: parsed.priority_provenance,
      summary: parsed.summary,
      description: parsed.description,
      unit: { unitId: parsed.unit.unitId, label: parsed.unit.label },
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
  await db.runTransaction(async (transaction) => {
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(id),
      stripUndefined(record),
    );
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(uuidv7()),
      activityDoc(
        { ticket_id: id, actor_uid: actor.uid, action: "create", new_status: "Open" },
        createdAt,
      ),
    );
  });

  return record;
}

export async function transitionMaintenanceTicket(
  actor: AuthenticatedUser,
  ticketId: string,
  input: TransitionMaintenanceTicketInput,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketRecord> {
  assertCan(actor, "edit");
  const op = TransitionMaintenanceTicketInputSchema.parse(input);
  // Input-only validation (not state-dependent) is cheap to do before the transaction.
  if (op.op === "status" && op.status === "Closed" && !op.reason?.trim()) {
    throw new EditableLayerError("A reason is required to close a ticket.", 400);
  }

  const updatedAt = nowIso();
  const ticketRef = db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId);

  // Read-modify-write inside a transaction so concurrent transitions on the same ticket cannot
  // clobber each other (lost update), and the ticket + its Activity row commit atomically.
  return db.runTransaction(async (transaction) => {
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

    // Validate and apply the product-record retention contract before any transition-specific
    // transaction write. This upgrades a fully legacy record, preserves an existing legal hold,
    // and refuses a partial/malformed retention state before a Vendor assignment or notification
    // could be queued.
    let updated: MaintenanceTicketRecord = stampProductRecordRetention(
      "maintenance_tickets",
      { ...ticket, updated_at: updatedAt },
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

    transaction.set(ticketRef, stripUndefined(updated));
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(uuidv7()),
      activityDoc(activity, updatedAt),
    );
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
  return { ...record, data_mode: resolveStoredDataMode(record) };
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
