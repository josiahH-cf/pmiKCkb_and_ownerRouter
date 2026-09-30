// S139 refinement context per workflow-linked draft screen. Each loader reads the owning record as
// the signed-in actor through the same service the draft screen uses, so the model gets the facts
// staff would otherwise retype, scoped to the selected draft only. Nothing here writes.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { formatCalendarDate } from "@/lib/date-display";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { getWorkOrderChatMessage } from "@/lib/firestore/rentvine-work-order-chat-messages";
import { rentVineAccountCode } from "@/lib/integrations/rentvine/client";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import {
  MESSAGE_CHARGES,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { RefinementFact, RefinementInput } from "@/lib/email-refinement/refine";

export type RefinementContext = Pick<
  RefinementInput,
  "purpose" | "facts" | "protectedPhrases" | "quotedContent"
> & {
  /** Renewal only: binds an accepted refinement to the composed body it started from. */
  readonly baseHash?: string;
};

function usd(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The renewal message's own facts, in the same formats the composed message uses. */
export function renewalRefinementFacts(facts: RenewalMessageFacts): RefinementFact[] {
  const out: RefinementFact[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim()) out.push({ label, value });
  };
  add("Recipient names", facts.names.join(", "));
  add("Property address", facts.address);
  if (facts.currentBaseRent) add("Current base rent", usd(facts.currentBaseRent.value));
  if (facts.leaseEndDate) add("Lease end date", formatCalendarDate(facts.leaseEndDate));
  if (facts.ownerTerms) {
    add("Approved renewal rent", usd(facts.ownerTerms.rent));
    add(
      "Renewal term",
      `${formatCalendarDate(facts.ownerTerms.effectiveDate)} through ${formatCalendarDate(facts.ownerTerms.endDate)}`,
    );
  }
  if (facts.range)
    add("Comparable rent range", `${usd(facts.range.low)} to ${usd(facts.range.high)}`);
  if (facts.suggestedRent)
    add("Reviewed rent suggestion", usd(facts.suggestedRent.value));
  for (const comp of facts.comps.slice(0, 6))
    add(`Comparable at ${comp.address}`, usd(comp.rent));
  for (const charge of facts.charges) {
    if (charge.applicable !== true || charge.amount === null) continue;
    add(
      MESSAGE_CHARGES[charge.id],
      [
        usd(charge.amount),
        charge.cadence === "monthly"
          ? "per month"
          : charge.cadence === "one_time"
            ? "one time"
            : null,
        charge.effectiveDate
          ? `effective ${formatCalendarDate(charge.effectiveDate)}`
          : null,
      ]
        .filter(Boolean)
        .join(", "),
    );
  }
  add("Renewal information form link", facts.informationForm?.url);
  add("Insurance flyer link", facts.insuranceFlyer?.url);
  add("Resident Benefits Package link", facts.rbpFlyer?.url);
  if (facts.signature) {
    add("Sender name", facts.signature.name);
    add("Sender role", facts.signature.role);
    add("Sender phone", facts.signature.phone);
    add("Sender email", facts.signature.email);
    add("Sender website", facts.signature.website?.url);
  }
  return out;
}

export async function renewalRefinementContext(
  actor: AuthenticatedUser,
  leaseId: string,
  channel: "owner" | "tenant",
): Promise<RefinementContext> {
  const current = await currentRenewalMessage(actor, leaseId, channel);
  if (!current.saved)
    throw new EditableLayerError("Save this message before refining its wording.", 409);
  return {
    purpose:
      channel === "owner"
        ? "A lease renewal message to the property owner about this year's renewal."
        : "A lease renewal offer message to the tenant.",
    facts: renewalRefinementFacts(current.facts),
    protectedPhrases: [
      ...current.facts.names,
      ...(current.facts.address ? [current.facts.address] : []),
      ...(current.facts.signature ? [current.facts.signature.name] : []),
    ],
    baseHash: current.bodyBaseHash,
  };
}

function ticketFacts(ticket: MaintenanceTicketRecord): RefinementFact[] {
  const out: RefinementFact[] = [];
  if (ticket.unit?.label) out.push({ label: "Property", value: ticket.unit.label });
  out.push({ label: "Reported issue", value: ticket.summary });
  if (ticket.priority) out.push({ label: "Priority", value: String(ticket.priority) });
  out.push({ label: "Ticket status", value: ticket.status });
  return out;
}

export async function ownerNoticeRefinementContext(
  actor: AuthenticatedUser,
  ticketRef: string,
): Promise<RefinementContext> {
  const ticket = await getMaintenanceTicket(actor, ticketRef);
  if (!ticket)
    throw new EditableLayerError("That maintenance ticket does not exist.", 404);
  return {
    purpose:
      "A maintenance notice to the property owner about a reported repair request.",
    facts: ticketFacts(ticket),
    protectedPhrases: ticket.unit?.label ? [ticket.unit.label] : [],
  };
}

export async function residentReplyRefinementContext(
  actor: AuthenticatedUser,
  messageId: number,
): Promise<RefinementContext> {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim() ?? "";
  const accountRef = `rentvine:${rentVineAccountCode(baseUrl)}`;
  const stored = await getWorkOrderChatMessage(actor, accountRef, messageId);
  if (!stored || stored.role !== "tenant")
    throw new EditableLayerError(
      "Only a synchronized resident message can be answered here.",
      409,
    );
  const ticket = await getMaintenanceTicket(actor, stored.ticket_ref).catch(() => null);
  return {
    purpose: "A reply to a resident's maintenance message.",
    facts: ticket ? ticketFacts(ticket) : [],
    protectedPhrases: [],
    quotedContent: [{ label: "Resident message", text: stored.body }],
  };
}
