// The route-facing service that turns a persisted maintenance ticket + the authoritative property owner
// into a real UNSENT Gmail draft, in two steps a UI drives: preview, then (on confirm) create.
//
// Authority split — the source of each value is deliberate:
//   • The RECIPIENT (owner email + source ref) and the property/unit facts come from the LIVE RentVine
//     read, never the client. The owner is resolved server-side (`deps.resolveOwner`) and is never invented.
//   • The BODY is composed by buildOwnerNoticeDraft from the persisted ticket's own facts; a missing owner
//     name or unmatched unit stays a visible `Needs Verification:` marker, never a guessed value.
//
// The ticket is injected (`deps.loadTicket`) and the owner resolver + Gmail client are injected too, so this
// logic is fully unit-tested without Firestore, RentVine, or Gmail. `executeMaintenanceOwnerNoticeDraft`
// re-asserts the production gate + the authoritative-recipient guard before any draft is created. Nothing
// here sends — the paired `.send` action stays production_allowed:false.

import { EditableLayerError } from "@/lib/firestore/errors";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { buildOwnerNoticeDraft } from "@/lib/maintenance/owner-notice-draft";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type {
  MaintenancePriority,
  WorkOrderDraft,
} from "@/lib/maintenance/work-order-draft";
import {
  buildMaintenanceOwnerNoticeDraftAction,
  executeMaintenanceOwnerNoticeDraft,
} from "@/lib/maintenance/execution/owner-notice-draft-request";

export interface MaintenanceOwnerNoticeMailbox {
  email: string;
  sourceRef: string;
}

/** The authoritatively-resolved owner recipient. `name` is optional and only used to greet, never to gate. */
export interface MaintenanceOwnerRecipient {
  email: string;
  sourceRef: string;
  name?: string;
}

export interface MaintenanceOwnerNoticeDraftInput {
  ticketRef: string;
  mailbox: MaintenanceOwnerNoticeMailbox;
  /** false → return the preview only; true → create the real unsent draft. */
  confirm: boolean;
}

export interface MaintenanceOwnerNoticeDraftDeps {
  /** Load the persisted maintenance ticket by id (null when it does not exist). */
  loadTicket(ticketRef: string): Promise<MaintenanceTicketRecord | null>;
  /** Resolve the authoritative property owner for a ticket, or null when it cannot resolve. */
  resolveOwner(
    ticket: MaintenanceTicketRecord,
  ): Promise<MaintenanceOwnerRecipient | null>;
  /** Build a draft-capable Gmail client for the authenticated sender (subject === mailbox email). */
  createGmailClient(subject: string): RenewalDraftGmailClient;
}

export type MaintenanceOwnerNoticeDraftOutcome =
  | { status: "blocked"; reasons: string[] }
  | {
      status: "preview";
      recipient: { to: string; sourceRef: string };
      subject: string;
      body: string;
    }
  | {
      status: "created";
      recipient: { to: string; sourceRef: string };
      subject: string;
      draftId: string;
    };

/**
 * Preview or create a maintenance owner-notice draft for one persisted ticket. Throws EditableLayerError(404)
 * when the ticket does not exist; otherwise returns a blocked/preview/created outcome. A Test ticket, an
 * unmatched unit, or an owner that does not resolve authoritatively yields a blocked result — never a real
 * draft with an invented recipient.
 */
export async function prepareMaintenanceOwnerNoticeDraft(
  deps: MaintenanceOwnerNoticeDraftDeps,
  input: MaintenanceOwnerNoticeDraftInput,
): Promise<MaintenanceOwnerNoticeDraftOutcome> {
  const ticket = await deps.loadTicket(input.ticketRef);
  if (!ticket) {
    throw new EditableLayerError("That maintenance ticket does not exist.", 404);
  }

  // A Test ticket must never resolve a real owner or create a real draft.
  if (ticket.data_mode !== "live") {
    return {
      status: "blocked",
      reasons: [
        "Owner notices are only available for Live tickets; this is a Test ticket.",
      ],
    };
  }

  const reasons: string[] = [];
  if (!ticket.unit) {
    reasons.push("Match the location to a unit before drafting an owner notice.");
  }

  // Only attempt owner resolution once the unit is known; a null owner blocks honestly.
  const owner = ticket.unit ? await deps.resolveOwner(ticket) : null;
  if (ticket.unit && !owner) {
    reasons.push(
      "The property owner's contact could not be resolved authoritatively from RentVine (owner name/contact needs verification).",
    );
  }
  if (reasons.length > 0 || !ticket.unit || !owner) {
    return { status: "blocked", reasons };
  }

  const draft = buildOwnerNoticeDraft({
    workOrder: workOrderFromTicket(ticket),
    ...(owner.name ? { ownerName: owner.name } : {}),
    propertyLabel: ticket.unit.label,
  });

  const action = buildMaintenanceOwnerNoticeDraftAction({
    ticketRef: input.ticketRef,
    unitTag: ticket.unit.unitId,
    recipient: { to: owner.email, sourceRef: owner.sourceRef },
    mailbox: input.mailbox,
    subject: draft.subject,
    body: draft.body,
  });

  const recipient = { to: owner.email, sourceRef: owner.sourceRef };
  if (!input.confirm) {
    return {
      status: "preview",
      recipient,
      subject: draft.subject,
      body: String(action.values.body),
    };
  }

  const client = deps.createGmailClient(input.mailbox.email);
  const receipt = await executeMaintenanceOwnerNoticeDraft(client, action);
  return {
    status: "created",
    recipient,
    subject: draft.subject,
    draftId: receipt.providerRef,
  };
}

/** Reconstruct the WorkOrderDraft shape buildOwnerNoticeDraft consumes from a persisted ticket. */
function workOrderFromTicket(ticket: MaintenanceTicketRecord): WorkOrderDraft {
  return {
    summary: ticket.summary,
    description: ticket.description,
    priority: ticket.priority as MaintenancePriority,
    unit: ticket.unit,
    photoRefs: ticket.photo_refs,
    reporter: {
      uid: ticket.reporter.uid ?? "",
      ...(ticket.reporter.name ? { name: ticket.reporter.name } : {}),
    },
    capturedAt: ticket.created_at,
    blockers: [],
    readyForExecution: false,
  };
}
