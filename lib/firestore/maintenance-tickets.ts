// KB-owned persistence for the Maintenance Work Order Intake ticket queue (console overhaul Slice E).
// Turns the previously-ephemeral work-order capture into a real, tracked ticket with a lifecycle
// (Open / Waiting on Response / Waiting on Vendor / Scheduled / Closed), labels, assignment, notes,
// and an append-only Activity twin — mirroring lib/firestore/workflow-run-step-checks.ts.
//
// GOVERNANCE: app-plane bookkeeping gated at the `edit` capability. Writes ONLY the KB's own
// Firestore collections; it NEVER executes a system-of-record write or a send. The RentVine
// work-order create stays gated (production_allowed:false) — this queue is its trigger/record, not
// its execution. Timestamps are ISO strings (no serverTimestamp) so the writer is deterministic and
// unit-testable against a simple fake as well as the real Admin SDK.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  appendMaintenanceTicketNotification,
  type MaintenanceTicketNotificationEvent,
} from "@/lib/firestore/maintenance-ticket-notifications";
import {
  MAINTENANCE_TICKET_STATUSES,
  type MaintenanceTicketActivityRecord,
  type MaintenanceTicketRecord,
  type MaintenanceTicketStatus,
} from "@/lib/maintenance/ticket-model";

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
} as const;

export const CreateMaintenanceTicketInputSchema = z.object({
  summary: z.string().trim().min(1),
  description: z.string().default(""),
  priority: z.string().trim().min(1),
  priority_provenance: z.enum(["auto-inferred", "operator-set"]).default("operator-set"),
  unit: z.object({ unitId: z.string(), label: z.string() }).nullable().default(null),
  photo_refs: z.array(z.string()).default([]),
  space_id: z.string().default("maintenance-work-order-intake"),
  source_trigger_key: z.string().optional(),
});
export type CreateMaintenanceTicketInput = z.input<
  typeof CreateMaintenanceTicketInputSchema
>;

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

  const record: MaintenanceTicketRecord = {
    id,
    status: "Open",
    priority: parsed.priority,
    priority_provenance: parsed.priority_provenance,
    summary: parsed.summary,
    description: parsed.description,
    unit: parsed.unit,
    photo_refs: parsed.photo_refs,
    reporter: { kind: "staff", uid: actor.uid },
    labels: [],
    space_id: parsed.space_id,
    ...(parsed.source_trigger_key
      ? { source_trigger_key: parsed.source_trigger_key }
      : {}),
    created_at: createdAt,
    updated_at: createdAt,
  };

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
    const ticket = readRecord<MaintenanceTicketRecord>(snapshot.id, snapshot.data()!);

    let updated: MaintenanceTicketRecord = { ...ticket, updated_at: updatedAt };
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
        const reopening = ticket.status === "Closed" && op.status !== "Closed";
        updated = {
          ...updated,
          status: op.status,
          closed_at: op.status === "Closed" ? updatedAt : undefined,
          closed_reason: op.status === "Closed" ? reason : undefined,
        };
        if (reopening) {
          updated.closed_at = undefined;
          updated.closed_reason = undefined;
        }
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: op.status === "Closed" ? "close" : reopening ? "reopen" : "status",
          previous_status: ticket.status,
          new_status: op.status,
          text: reason,
        };
        notificationEvent =
          op.status === "Closed" ? "closed" : reopening ? "reopened" : "status_changed";
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
  return readRecord<MaintenanceTicketRecord>(snapshot.id, snapshot.data()!);
}

export async function listMaintenanceTickets(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).get();
  return snapshot.docs
    .map((doc) => readRecord<MaintenanceTicketRecord>(doc.id, doc.data()))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
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
