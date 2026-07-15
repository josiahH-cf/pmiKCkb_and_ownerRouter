// KB-owned persistence for the Maintenance Work Order Intake ticket queue (console overhaul Slice E).
// Turns the previously-ephemeral work-order capture into a real, tracked ticket with a lifecycle
// (Open / Waiting on Response / Waiting on Vendor / Scheduled / Closed), labels, assignment, notes,
// and an append-only Activity twin — mirroring lib/firestore/workflow-run-step-checks.ts.
//
// This store performs app-plane bookkeeping behind the `edit` capability. Live provider writes and
// sends are separate exact action/target confirmations through the external execution boundary. The
// Test lane writes only bodyless, non-Live-eligible receipts here and never resolves a provider.
// Timestamps are ISO strings (no serverTimestamp) so the writer is deterministic and unit-testable
// against a simple fake as well as the real Admin SDK.

import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveDataMode } from "@/lib/data-mode";
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
} from "@/lib/maintenance/ticket-model";
import {
  buildMaintenanceTestActionReceipt,
  MAINTENANCE_TEST_ACTIONS,
  MAINTENANCE_TEST_CONFIRMATION,
  MAINTENANCE_TEST_UNIT,
  MAINTENANCE_TEST_VENDOR,
  type MaintenanceTestActionReceipt,
} from "@/lib/maintenance/test-workflow";

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
  testActionReceipts: "maintenance_test_action_receipts",
  vendorAssignments: "vendor_ticket_assignments",
} as const;

export const CreateMaintenanceTicketInputSchema = z
  .object({
    data_mode: z.enum(["live", "test"]).default("live"),
    summary: z.string().trim().min(1),
    description: z.string().trim().min(1),
    priority: z.string().trim().min(1),
    priority_provenance: z
      .enum(["auto-inferred", "operator-set"])
      .default("operator-set"),
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
  })
  .superRefine((input, context) => {
    if (
      input.data_mode === "test" &&
      (input.unit.unitId !== MAINTENANCE_TEST_UNIT.unitId ||
        input.unit.label !== MAINTENANCE_TEST_UNIT.label)
    ) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Test tickets must use the reserved invented Test unit alias.",
      });
    }
    if (
      input.data_mode === "live" &&
      input.unit.unitId === MAINTENANCE_TEST_UNIT.unitId
    ) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "The reserved Test unit cannot be stored as Live data.",
      });
    }
  });
export type CreateMaintenanceTicketInput = z.input<
  typeof CreateMaintenanceTicketInputSchema
>;

// Browser capture creates Live records only. Test records are created by the strict canonical seed
// route, which accepts no browser-supplied unit, Vendor, reporter, or message aliases.
export const CreateLiveMaintenanceTicketInputSchema =
  CreateMaintenanceTicketInputSchema.refine((input) => input.data_mode === "live", {
    path: ["data_mode"],
    message: "Use the canonical Test-ticket route for Test data.",
  });

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
  z.object({
    op: z.literal("vendor-assign"),
    vendorId: z.string().trim().min(1).nullable(),
  }),
  z.object({ op: z.literal("label-add"), label: z.string().trim().min(1) }),
  z.object({ op: z.literal("label-remove"), label: z.string().trim().min(1) }),
  z.object({ op: z.literal("note"), text: z.string().trim().min(1) }),
]);
export type TransitionMaintenanceTicketInput = z.input<
  typeof TransitionMaintenanceTicketInputSchema
>;

export const CreateMaintenanceTestTicketInputSchema = z
  .object({
    scenario: z.literal("plumbing").default("plumbing"),
  })
  .strict();
export type CreateMaintenanceTestTicketInput = z.input<
  typeof CreateMaintenanceTestTicketInputSchema
>;

export const SimulateMaintenanceTestActionInputSchema = z.object({
  actionKey: z.enum(MAINTENANCE_TEST_ACTIONS),
  confirmation: z.literal(MAINTENANCE_TEST_CONFIRMATION),
});
export type SimulateMaintenanceTestActionInput = z.input<
  typeof SimulateMaintenanceTestActionInputSchema
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
    data_mode: parsed.data_mode,
    status: "Open",
    priority: parsed.priority,
    priority_provenance: parsed.priority_provenance,
    summary: parsed.summary,
    description: parsed.description,
    unit: { unitId: parsed.unit.unitId, label: parsed.unit.label },
    photo_refs: parsed.photo_refs,
    reporter: { kind: "staff", uid: actor.uid },
    labels: parsed.data_mode === "test" ? ["TEST DATA"] : [],
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

/** Creates an exercisable production Test ticket from reserved, non-customer aliases only. */
export async function createCanonicalMaintenanceTestTicket(
  actor: AuthenticatedUser,
  input: CreateMaintenanceTestTicketInput = {},
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTicketRecord> {
  CreateMaintenanceTestTicketInputSchema.parse(input);
  return createMaintenanceTicket(
    actor,
    {
      data_mode: "test",
      summary: "TEST — Kitchen sink leak",
      description:
        "Invented Test scenario: water is visible below the kitchen sink after the faucet runs.",
      priority: "High",
      priority_provenance: "operator-set",
      unit: MAINTENANCE_TEST_UNIT,
      photo_refs: [],
      source_trigger_key: "test:maintenance:plumbing:v1",
    },
    db,
  );
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
    const ticket = readMaintenanceTicket(snapshot.id, snapshot.data()!);

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
      case "vendor-assign": {
        const mode = resolveDataMode(ticket);
        if (
          mode === "test" &&
          op.vendorId !== null &&
          op.vendorId !== MAINTENANCE_TEST_VENDOR.id
        ) {
          throw new EditableLayerError(
            "Test tickets may only use the reserved invented Test Vendor.",
            400,
          );
        }
        if (mode === "live" && op.vendorId === MAINTENANCE_TEST_VENDOR.id) {
          throw new EditableLayerError(
            "The reserved Test Vendor cannot be assigned to Live data.",
            400,
          );
        }
        const previousVendorId = ticket.vendor_id;
        updated = { ...updated, vendor_id: op.vendorId ?? undefined };
        activity = {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "vendor-assign",
          text: op.vendorId ? "assigned" : "unassigned",
        };
        if (op.vendorId || previousVendorId) {
          transaction.set(
            db.collection(MAINTENANCE_TICKET_COLLECTIONS.vendorAssignments).doc(ticketId),
            stripUndefined({
              ticket_id: ticketId,
              vendor_id: op.vendorId ?? previousVendorId,
              active: Boolean(op.vendorId),
              data_mode: mode,
              updated_at: updatedAt,
            }),
          );
        }
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
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/**
 * Writes an internal Test receipt only after reading the persisted ticket and proving its lane.
 * This path imports no live provider and cannot produce live-eligible evidence.
 */
export async function simulateMaintenanceTestAction(
  actor: AuthenticatedUser,
  ticketId: string,
  input: SimulateMaintenanceTestActionInput,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTestActionReceipt> {
  assertCan(actor, "edit");
  const parsed = SimulateMaintenanceTestActionInputSchema.parse(input);
  const ticketRef = db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId);
  const createdAt = nowIso();
  // One ticket/action pair is one simulated external effect. A deterministic document id makes a
  // browser retry, double-click, transaction retry, or second operator return the original receipt
  // instead of inventing another successful provider outcome.
  const receiptId = `test_${createHash("sha256")
    .update(`${ticketId}\u0000${parsed.actionKey}`)
    .digest("hex")}`;

  return db.runTransaction(async (transaction) => {
    const ticketSnapshot = await transaction.get(ticketRef);
    if (!ticketSnapshot.exists) {
      throw new EditableLayerError("That maintenance ticket does not exist.", 404);
    }
    const ticket = readMaintenanceTicket(ticketSnapshot.id, ticketSnapshot.data()!);
    if (ticket.data_mode !== "test") {
      throw new EditableLayerError(
        "Simulated actions are only available for explicitly labeled Test tickets.",
        409,
      );
    }
    const receiptRef = db
      .collection(MAINTENANCE_TICKET_COLLECTIONS.testActionReceipts)
      .doc(receiptId);
    const receiptSnapshot = await transaction.get(receiptRef);
    if (
      parsed.actionKey === "vendor.assignment.change" &&
      ticket.vendor_id !== MAINTENANCE_TEST_VENDOR.id
    ) {
      throw new EditableLayerError(
        "Assign the reserved Test Vendor before simulating the Vendor action.",
        409,
      );
    }
    if (receiptSnapshot.exists) {
      const existing = readRecord<MaintenanceTestActionReceipt>(
        receiptSnapshot.id,
        receiptSnapshot.data()!,
      );
      if (
        existing.ticket_id !== ticketId ||
        existing.action_key !== parsed.actionKey ||
        existing.data_mode !== "test" ||
        existing.provider_contacted !== false ||
        existing.live_proof_eligible !== false
      ) {
        throw new EditableLayerError(
          "The existing Test receipt does not match this exact ticket action.",
          409,
        );
      }
      return existing;
    }

    const receipt = buildMaintenanceTestActionReceipt({
      id: receiptId,
      ticketId,
      actionKey: parsed.actionKey,
      actorUid: actor.uid,
      createdAt,
    });
    transaction.set(receiptRef, receipt);
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(uuidv7()),
      activityDoc(
        {
          ticket_id: ticketId,
          actor_uid: actor.uid,
          action: "test-action",
          text: parsed.actionKey,
        },
        createdAt,
      ),
    );
    return receipt;
  });
}

export async function listMaintenanceTestActionReceipts(
  actor: AuthenticatedUser,
  ticketId?: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceTestActionReceipt[]> {
  assertCan(actor, "read");
  const snapshot = await db
    .collection(MAINTENANCE_TICKET_COLLECTIONS.testActionReceipts)
    .get();
  return snapshot.docs
    .map((doc) => readRecord<MaintenanceTestActionReceipt>(doc.id, doc.data()))
    .filter((receipt) => !ticketId || receipt.ticket_id === ticketId)
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function readMaintenanceTicket(
  id: string,
  data: Record<string, unknown>,
): MaintenanceTicketRecord {
  const record = readRecord<MaintenanceTicketRecord>(id, data);
  return { ...record, data_mode: resolveDataMode(record) };
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
