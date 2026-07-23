import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { resolveOwnerContactFromPropertyId } from "@/lib/lease-renewal/live-owner-recipient";
import { prepareMaintenanceOwnerNoticeDraft } from "@/lib/maintenance/execution/owner-notice-draft-service";
import { getUnitIndex } from "@/lib/maintenance/unit-index";

const OwnerNoticeDraftBodySchema = z
  .object({
    ticketRef: z.string().trim().min(1).max(120),
    confirm: z.boolean().default(false),
  })
  .strict();

/**
 * Preview or create (confirm:true) a real UNSENT maintenance owner-notice Gmail draft for one persisted
 * ticket. The recipient + property facts come from the authoritative live RentVine read (owner is a
 * PROPERTY attribute, resolved unit -> propertyId -> portfolio -> contact); the body is composed from the
 * ticket's own facts. Draft-only — the service re-asserts the production gate and never sends.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const body = await parseJsonBody(request, OwnerNoticeDraftBodySchema);

    const config = buildLiveRentVineConfig();
    if (!config.ok) {
      return NextResponse.json(
        {
          error:
            config.reason === "account_mismatch"
              ? "The configured RentVine account is not the expected pmikcmetro tenant."
              : "Live RentVine is not configured; an owner-notice draft needs the live owner read.",
        },
        { status: 503 },
      );
    }
    const rentvineClient = config.rentvineClient;

    const outcome = await prepareMaintenanceOwnerNoticeDraft(
      {
        loadTicket: (ticketRef) => getMaintenanceTicket(user, ticketRef),
        // The owner is resolved authoritatively server-side: the ticket's unit id keys into the live unit
        // index (the same /leases/export read the matcher used) to recover the RentVine propertyId, then the
        // property -> portfolio -> owning-contact join yields the email. Any missing hop returns null and the
        // draft blocks honestly — never a guessed recipient. A unit no longer present in the live export (or
        // a Test unit alias) simply fails to resolve here.
        async resolveOwner(ticket) {
          if (!ticket.unit) return null;
          const index = await getUnitIndex();
          if (index.status !== "ok") return null;
          const candidate = index.candidates.find(
            (entry) => entry.unitId === ticket.unit!.unitId,
          );
          if (!candidate?.propertyId) return null;
          const owner = await resolveOwnerContactFromPropertyId(
            rentvineClient,
            candidate.propertyId,
          );
          if (!owner) return null;
          return {
            email: owner.email,
            sourceRef: `rentvine:property:${candidate.propertyId}:portfolio:${owner.portfolioId}:contact:${owner.contactId}.email`,
            ...(owner.name ? { name: owner.name } : {}),
          };
        },
        createGmailClient: (subject) => new GmailRuntimeClient({ subject }),
      },
      {
        ticketRef: body.ticketRef,
        confirm: body.confirm,
        mailbox: { email: user.email, sourceRef: `app:session:${user.uid}` },
      },
    );

    return NextResponse.json(outcome);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
