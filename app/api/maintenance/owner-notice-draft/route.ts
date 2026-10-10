import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { getMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { resolveOwnerContactFromPropertyId } from "@/lib/lease-renewal/live-owner-recipient";
import { MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY } from "@/lib/maintenance/execution/owner-notice-draft-request";
import {
  MAX_OWNER_NOTICE_BODY_LENGTH,
  prepareMaintenanceOwnerNoticeDraft,
} from "@/lib/maintenance/execution/owner-notice-draft-service";
import {
  listLegacyOwnerNoticeAttempts,
  listCreatedOwnerNoticeDrafts,
} from "@/lib/firestore/owner-notice-draft-history";
import { getUnitIndex } from "@/lib/maintenance/unit-index";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
} from "@/lib/operations/runtime-suspension-gate";

const OwnerNoticeDraftBodySchema = z
  .object({
    ticketRef: z.string().trim().min(1).max(120),
    // S139: the person's reviewed wording; absent uses the standard body composed from the ticket.
    body: z.string().max(MAX_OWNER_NOTICE_BODY_LENGTH).optional(),
    reconcile: z
      .object({ executionId: z.string().regex(/^exec_[a-f0-9]{40}$/) })
      .strict()
      .optional(),
    // Confirmation carries the exact prepared execution and the preview hash it was reviewed at.
    confirm: z
      .object({
        executionId: z
          .string()
          .trim()
          .regex(/^exec_[a-f0-9]{40}$/),
        previewHash: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Only original-attempt recovery remains here. New messages use Communications. */
export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "maintenance");
    const query = z
      .object({
        ticketRef: z.string().trim().min(1).max(120),
        cursor: z
          .string()
          .regex(/^exec_[a-f0-9]{40}$/)
          .optional(),
      })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    if (!(await getMaintenanceTicket(user, query.ticketRef)))
      return NextResponse.json({ error: "That ticket is unavailable." }, { status: 404 });
    return NextResponse.json(
      await listLegacyOwnerNoticeAttempts(user, query.ticketRef, query.cursor),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "maintenance");
    const body = await parseJsonBody(request, OwnerNoticeDraftBodySchema);
    if (!body.reconcile || body.confirm)
      return NextResponse.json(
        {
          error:
            "New messages open in Communications. Only read-only recovery of an earlier attempt is available here.",
          code: "communications_composer_required",
          providerCallAttempted: false,
          href: `/gmail-hub?compose=maintenance_owner&ticket=${encodeURIComponent(body.ticketRef)}`,
        },
        { status: 410, headers: { "Cache-Control": "private, no-store" } },
      );

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
        // Descriptor-bound: Demo and Live-read-only refuse here, so no provider is constructed.
        createGmailClient: (subject) =>
          createDescriptorBoundGmailRuntimeClient(
            subject,
            requireEnvironmentDescriptor(),
          ),
        listCreatedDrafts: (ticketRef) => listCreatedOwnerNoticeDrafts(user, ticketRef),
        actor: user,
      },
      {
        ticketRef: body.ticketRef,
        ...(body.body !== undefined ? { body: body.body } : {}),
        reconcile: body.reconcile,
        mailbox: { email: user.email, sourceRef: `app:session:${user.uid}` },
      },
    );

    return NextResponse.json(outcome);
  } catch (error) {
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      return NextResponse.json(
        {
          action_key: MAINTENANCE_OWNER_NOTICE_DRAFT_ACTION_KEY,
          error: error.message,
          error_type: error.code,
        },
        { status: error.status },
      );
    }
    return apiErrorResponse(error);
  }
}
