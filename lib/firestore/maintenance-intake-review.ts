// Edit-gated review + promote surface for the public tokenized intake (A5 → 2d). This is the AUTHED
// counterpart to the no-actor public writer: it is where a staff editor triages what landed in the
// `maintenance_unverified_intake` quarantine and either PROMOTES it into a real ticket or DISMISSES it.
//
// It is deliberately a SEPARATE module from lib/firestore/maintenance-unverified-intake.ts so the public
// writer keeps its structural isolation (the negative-import invariant): the writer must never import
// createMaintenanceTicket / requireCapability. This file is the authed side and MAY — every entry point
// asserts the `edit` capability and takes an AuthenticatedUser.
//
// Promotion is ONE atomic transaction (read-modify-write): it creates the real ticket + its Activity
// twin AND flips the intake to "promoted" together, so a promote can never create a ticket while leaving
// the intake un-flipped (which would let it be promoted twice). By default the promoted ticket is marked
// reporter.kind="external", unit=null, labelled "Needs Verification" (an external report has no verified
// unit until a human confirms it). Slice 2a lets the editor OPTIONALLY confirm the unit at promotion via
// the shared type-ahead: when a unit is supplied the ticket carries { unitId, label } and the
// "Needs Verification" label is dropped; when it is absent the default is unchanged.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  MAINTENANCE_INTAKE_COLLECTIONS,
  type UnverifiedIntakeRecord,
} from "@/lib/firestore/maintenance-unverified-intake";
import { MAINTENANCE_TICKET_COLLECTIONS } from "@/lib/firestore/maintenance-tickets";
import { MAINTENANCE_PRIORITIES } from "@/lib/maintenance/constants";
import type {
  MaintenanceTicketActivityRecord,
  MaintenanceTicketRecord,
} from "@/lib/maintenance/ticket-model";
import { inferPriority } from "@/lib/maintenance/work-order-draft";

/** Label that marks a promoted intake's ticket as still needing unit/detail verification. */
export const NEEDS_VERIFICATION_LABEL = "Needs Verification";

export const PromoteIntakeInputSchema = z.object({
  priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
  // Optional operator-confirmed unit (slice 2a). When present the promoted ticket carries this unit and
  // drops the Needs-Verification label; when absent the promote is UNCHANGED (unit:null + Needs Verification).
  unit: z
    .object({
      unitId: z.string().trim().min(1),
      label: z.string().trim().min(1),
    })
    .nullable()
    .optional(),
});
export type PromoteIntakeInput = z.input<typeof PromoteIntakeInputSchema>;

export const DismissIntakeInputSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type DismissIntakeInput = z.input<typeof DismissIntakeInputSchema>;

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested intake action.",
      403,
    );
  }
}

function nowIso(now: number): string {
  return new Date(now).toISOString();
}

function readIntake(id: string, data: unknown): UnverifiedIntakeRecord {
  return { ...(data as UnverifiedIntakeRecord), id };
}

/** List quarantined intake, newest first. `status` defaults to the un-triaged "unverified" bucket. */
export async function listUnverifiedIntake(
  actor: AuthenticatedUser,
  status: UnverifiedIntakeRecord["status"] = "unverified",
  db: Firestore = getAdminFirestore(),
): Promise<UnverifiedIntakeRecord[]> {
  assertCan(actor, "read");
  const snapshot = await db.collection(MAINTENANCE_INTAKE_COLLECTIONS.intake).get();
  return snapshot.docs
    .map((doc) => readIntake(doc.id, doc.data()))
    .filter((record) => record.status === status)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

/**
 * Promote one quarantined intake into a real maintenance ticket, atomically flipping the intake to
 * "promoted". Throws 404 if the intake is gone and 409 if it was already triaged (so a double-click or a
 * concurrent promote cannot create two tickets). Returns the created ticket.
 */
export async function promoteUnverifiedIntake(
  actor: AuthenticatedUser,
  intakeId: string,
  input: PromoteIntakeInput = {},
  db: Firestore = getAdminFirestore(),
  now: number = Date.now(),
): Promise<MaintenanceTicketRecord> {
  assertCan(actor, "edit");
  const parsed = PromoteIntakeInputSchema.parse(input);
  const timestamp = nowIso(now);
  const intakeRef = db.collection(MAINTENANCE_INTAKE_COLLECTIONS.intake).doc(intakeId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(intakeRef);
    if (!snapshot.exists) {
      throw new EditableLayerError("That intake no longer exists.", 404);
    }
    const intake = readIntake(snapshot.id, snapshot.data()!);
    if (intake.status !== "unverified") {
      throw new EditableLayerError("That intake has already been reviewed.", 409);
    }

    // Priority: honor an operator override, else infer from the report text (transparent provenance).
    const priority =
      parsed.priority ?? inferPriority(`${intake.summary} ${intake.description}`);
    const provenance = parsed.priority ? "operator-set" : "auto-inferred";

    // Optional operator-confirmed unit (slice 2a). When present the ticket carries it and the
    // Needs-Verification label is dropped; when absent the promote is unchanged (unit:null + the label).
    const confirmedUnit = parsed.unit ?? null;

    const ticketId = uuidv7();
    const ticket: MaintenanceTicketRecord = {
      id: ticketId,
      data_mode: "live",
      status: "Open",
      priority,
      priority_provenance: provenance,
      summary: intake.summary,
      description: intake.description,
      unit: confirmedUnit,
      photo_refs: [],
      reporter: {
        kind: "external",
        ...(intake.contact ? { contact: intake.contact } : {}),
      },
      labels: confirmedUnit ? [] : [NEEDS_VERIFICATION_LABEL],
      space_id: "maintenance-work-order-intake",
      source_trigger_key: `maintenance:intake:${intake.id}`,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const ticketActivity: MaintenanceTicketActivityRecord = {
      id: uuidv7(),
      ticket_id: ticketId,
      actor_uid: actor.uid,
      action: "create",
      new_status: "Open",
      text: confirmedUnit
        ? `Promoted from a public intake report (unit confirmed: ${confirmedUnit.label}).`
        : "Promoted from a public intake report (unit needs verification).",
      created_at: timestamp,
    };
    const promotedIntake: UnverifiedIntakeRecord = {
      ...intake,
      status: "promoted",
      reviewed_by: actor.uid,
      reviewed_at: timestamp,
      ticket_id: ticketId,
    };

    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.tickets).doc(ticketId),
      ticket,
    );
    transaction.set(
      db.collection(MAINTENANCE_TICKET_COLLECTIONS.activity).doc(ticketActivity.id),
      ticketActivity,
    );
    transaction.set(intakeRef, promotedIntake);
    transaction.set(
      db.collection(MAINTENANCE_INTAKE_COLLECTIONS.activity).doc(uuidv7()),
      {
        id: uuidv7(),
        intake_id: intake.id,
        action: "promote",
        actor_uid: actor.uid,
        ticket_id: ticketId,
        created_at: timestamp,
      },
    );

    return ticket;
  });
}

/** Dismiss a quarantined intake as junk/duplicate (records the reason). Idempotency-guarded like promote. */
export async function dismissUnverifiedIntake(
  actor: AuthenticatedUser,
  intakeId: string,
  input: DismissIntakeInput,
  db: Firestore = getAdminFirestore(),
  now: number = Date.now(),
): Promise<UnverifiedIntakeRecord> {
  assertCan(actor, "edit");
  const parsed = DismissIntakeInputSchema.parse(input);
  const timestamp = nowIso(now);
  const intakeRef = db.collection(MAINTENANCE_INTAKE_COLLECTIONS.intake).doc(intakeId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(intakeRef);
    if (!snapshot.exists) {
      throw new EditableLayerError("That intake no longer exists.", 404);
    }
    const intake = readIntake(snapshot.id, snapshot.data()!);
    if (intake.status !== "unverified") {
      throw new EditableLayerError("That intake has already been reviewed.", 409);
    }

    const dismissed: UnverifiedIntakeRecord = {
      ...intake,
      status: "dismissed",
      reviewed_by: actor.uid,
      reviewed_at: timestamp,
      dismiss_reason: parsed.reason,
    };
    transaction.set(intakeRef, dismissed);
    transaction.set(
      db.collection(MAINTENANCE_INTAKE_COLLECTIONS.activity).doc(uuidv7()),
      {
        id: uuidv7(),
        intake_id: intake.id,
        action: "dismiss",
        actor_uid: actor.uid,
        text: parsed.reason,
        created_at: timestamp,
      },
    );
    return dismissed;
  });
}
