import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import { recordTenantOfferDraft } from "@/lib/firestore/lease-renewal-progress";
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { resolveLiveOwnerEmail } from "@/lib/lease-renewal/live-owner-recipient";
import {
  prepareRenewalNoticeDraft,
  type RenewalNoticeDraftInput,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-service";

// A rent/market figure: finite and strictly positive (a $0 renewal offer is never valid).
const positiveMoney = z.number().finite().positive();
// A charge line that may legitimately be zero (e.g. no resident-benefit package).
const chargeMoney = z.number().finite().nonnegative();

const TenantOfferSchema = z
  .object({
    channel: z.literal("tenant"),
    ownerDecision: z.enum(["keep_same", "increase", "custom"]),
    offeredRent: positiveMoney,
    charges: z
      .object({ rbp: chargeMoney.optional(), insurance: chargeMoney.optional() })
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
        specificNumber: positiveMoney.optional(),
        rangeLow: positiveMoney.optional(),
        rangeHigh: positiveMoney.optional(),
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
    const nowMs = Date.now();
    const { channel, ...offer } = body.offer;
    const input = {
      channel,
      offer,
      leaseId: body.leaseId,
      confirm: body.confirm,
      mailbox: { email: user.email, sourceRef: `app:session:${user.uid}` },
    } as RenewalNoticeDraftInput;

    // S29: for the OWNER channel, resolve any Admin-approved comp-derived rent number SERVER-SIDE and
    // inject it into the owner-draft market. The request schema deliberately omits approvedSuggestion, so
    // the number is NEVER client-supplied; getApprovedRentSuggestion returns it only when an Approved
    // record still matches the current server recompute (otherwise null, and the draft stays unchanged).
    if (input.channel === "owner") {
      const approved = await getApprovedRentSuggestion(user, body.leaseId);
      if (approved) {
        input.offer.market = {
          ...input.offer.market,
          approvedSuggestion: { value: approved.value, comps: approved.comps },
        };
      }
    }

    const outcome = await prepareRenewalNoticeDraft(
      {
        async loadLease(leaseId) {
          const views = await getLiveLeaseViews(rentvineClient, nowMs);
          const view = views.find((candidate) => leaseIdOf(candidate) === leaseId);
          if (!view) return null;
          // OWNER channel only: RentVine's lease/export rows carry no owner email, so resolve it via the
          // proven read-only property -> portfolio -> contact join and attach it as an owner-scoped object
          // so resolveRenewalRecipient({ channel: "owner" }) can read `owner.email`. When the join cannot
          // resolve authoritatively it returns null and the view is left unenriched, so the owner channel
          // blocks honestly ("owner email Needs Verification") rather than guessing. The tenant channel is
          // untouched and makes no property/portfolio/contact reads. The enriched value still flows through
          // assertAuthoritativeRenewalRecipient in the executor. Copy (never mutate) the shared cache view.
          if (channel === "owner") {
            const owner = await resolveLiveOwnerEmail(rentvineClient, leaseId);
            if (owner) {
              return { ...view, owner: { email: owner.email } };
            }
          }
          return view;
        },
        createGmailClient: (subject) => new GmailRuntimeClient({ subject }),
      },
      input,
    );

    // Phase A: creating the tenant-offer draft advances this lease's recorded progress to Build docs.
    // Best-effort and non-blocking — progress is a convenience layer, so a stamp failure (e.g. no owner
    // decision recorded yet when composing from the notices desk) never fails an already-created draft.
    if (channel === "tenant" && body.confirm && outcome.status === "created") {
      try {
        await recordTenantOfferDraft(user, body.leaseId, outcome.draftId);
      } catch {
        // Intentionally ignored — the Gmail draft exists; progress tracking is secondary.
      }
    }

    return NextResponse.json(outcome);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
