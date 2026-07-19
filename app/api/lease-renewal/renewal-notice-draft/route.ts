import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  prepareRenewalNoticeDraft,
  type RenewalNoticeDraftInput,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-service";

const money = z.number().finite().nonnegative();

const TenantOfferSchema = z
  .object({
    channel: z.literal("tenant"),
    ownerDecision: z.enum(["keep_same", "increase", "custom"]),
    offeredRent: money,
    charges: z
      .object({ rbp: money.optional(), insurance: money.optional() })
      .strict()
      .optional(),
    infoFormUrl: z.string().trim().url().optional(),
  })
  .strict();

const OwnerOfferSchema = z
  .object({
    channel: z.literal("owner"),
    market: z
      .object({
        specificNumber: money.optional(),
        rangeLow: money.optional(),
        rangeHigh: money.optional(),
        compsScreenshotRef: z.string().trim().min(1).max(500).optional(),
      })
      .strict(),
  })
  .strict();

const RenewalNoticeDraftBodySchema = z
  .object({
    leaseId: z.string().trim().min(1).max(120),
    confirm: z.boolean().default(false),
    offer: z.discriminatedUnion("channel", [TenantOfferSchema, OwnerOfferSchema]),
  })
  .strict();

function leaseIdOf(view: RawLease): string | undefined {
  for (const key of ["leaseID", "leaseId", "id"]) {
    const value = view[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

/**
 * Preview or create (confirm:true) a real UNSENT renewal-notice Gmail draft for one LIVE lease. The
 * recipient + facts come from the authoritative live RentVine read; the offer is the operator's input.
 * Draft-only — the service re-asserts the production gate and never sends.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("edit", "renewals");
    const body = await parseJsonBody(request, RenewalNoticeDraftBodySchema);

    const config = buildLiveRentVineConfig();
    if (!config.ok) {
      return NextResponse.json(
        {
          error:
            config.reason === "account_mismatch"
              ? "The configured RentVine account is not the expected pmikcmetro tenant."
              : "Live RentVine is not configured; a renewal-notice draft needs the live lease read.",
        },
        { status: 503 },
      );
    }

    const rentvineClient = config.rentvineClient;
    const { channel, ...offer } = body.offer;
    const input = {
      channel,
      offer,
      leaseId: body.leaseId,
      confirm: body.confirm,
      readTimestamp: new Date().toISOString(),
      mailbox: { email: user.email, sourceRef: `app:session:${user.uid}` },
    } as RenewalNoticeDraftInput;

    const outcome = await prepareRenewalNoticeDraft(
      {
        async loadLease(leaseId) {
          const rows = await rentvineClient.listLeasesExport();
          return (
            leaseViewsFromExport(rows).find((view) => leaseIdOf(view) === leaseId) ?? null
          );
        },
        createGmailClient: (subject) => new GmailRuntimeClient({ subject }),
      },
      input,
    );

    return NextResponse.json(outcome);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
