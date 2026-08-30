import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  leaseCurrentRent,
  leasePortfolioId,
} from "@/lib/integrations/rentvine/lease-mapper";
import { recordTenantOfferDraft } from "@/lib/firestore/lease-renewal-progress";
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import {
  buildLiveRenewalConfig,
  buildLiveRentVineConfig,
} from "@/lib/lease-renewal/live-config";
import {
  LeaseDataExpiredError,
  requireCurrentLeaseViews,
} from "@/lib/lease-renewal/live-lease-cache";
import { prepareRenewalNoticeDraft } from "@/lib/lease-renewal/execution/renewal-notice-draft-service";
import { RenewalNoticeDraftRequestSchema } from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { RENEWAL_NOTICE_DRAFT_ACTION_KEY } from "@/lib/lease-renewal/execution/renewal-draft-request";
import {
  loadCurrentRenewalDraftCompScreenshotAttachment,
  resolveRenewalDraftCompScreenshotAttachment,
} from "@/lib/lease-renewal/comp-screenshot-attachment-runtime";
import { buildLiveCompScreenshotRuntime } from "@/lib/lease-renewal/comp-screenshot-runtime";
import { RENEWAL_COMP_SCREENSHOT_ACTION_KEY } from "@/lib/lease-renewal/comp-screenshot-action";
import { loadLiveOwnerCurrentRentDecision } from "@/lib/lease-renewal/live-desk";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";

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
 * Preview, exactly confirm, or read-only reconcile a real UNSENT renewal-notice Gmail draft for one
 * LIVE lease. The recipient + facts come from the authoritative live RentVine read; the offer is the
 * operator's input. Draft-only — the service re-asserts the production gate and never sends.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("draft_create"),
      "renewals",
    );
    const body = await parseJsonBody(request, RenewalNoticeDraftRequestSchema);
    if (!body.reconcile) {
      await assertProductionRuntimeActionExecutable(RENEWAL_NOTICE_DRAFT_ACTION_KEY);
    }

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
    const channel = body.offer.channel;
    let compScreenshotRuntime: ReturnType<typeof buildLiveCompScreenshotRuntime> | null =
      null;
    const getCompScreenshotRuntime = () =>
      (compScreenshotRuntime ??= buildLiveCompScreenshotRuntime());
    let approvedSuggestion:
      | { value: number; comps: { rent: number; source: string; label?: string }[] }
      | undefined;

    // S29: for the OWNER channel, resolve any Admin-approved comp-derived rent number SERVER-SIDE and
    // inject it into the owner-draft market. The request schema deliberately omits approvedSuggestion, so
    // the number is NEVER client-supplied; getApprovedRentSuggestion returns it only when an Approved
    // record still matches the current server recompute (otherwise null, and the draft stays unchanged).
    if (body.offer.channel === "owner") {
      // S60 (AC-S60-10): the stale-approval re-verify recomputes with the same authoritative rent
      // the approval was clamped against; the shared cache makes this read a coalesced hit.
      let approvalCurrentRent: number | null = null;
      let approvalPortfolioId: string | null = null;
      try {
        const views = await requireCurrentLeaseViews(rentvineClient, nowMs);
        const view = views.find((candidate) => leaseIdOf(candidate) === body.leaseId);
        approvalCurrentRent = view ? (leaseCurrentRent(view) ?? null) : null;
        approvalPortfolioId = view ? (leasePortfolioId(view) ?? null) : null;
      } catch (error) {
        if (error instanceof LeaseDataExpiredError) throw error;
        approvalCurrentRent = null;
      }
      const approved = await getApprovedRentSuggestion(
        user,
        body.leaseId,
        approvalCurrentRent,
        approvalPortfolioId,
      );
      if (approved) {
        approvedSuggestion = { value: approved.value, comps: approved.comps };
      }
    }

    const outcome = await prepareRenewalNoticeDraft(
      {
        async loadLease(leaseId) {
          // S58: composing refuses expired lease data (LeaseDataExpiredError → 409 below) rather
          // than drafting from a snapshot past the hard max age.
          //
          // S61: the OWNER channel resolves directly from the view's own `portfolio.owners[]` —
          // measured portfolio-wide on 2026-08-06: owner email present on 305/305 export rows, so
          // the former property → portfolio → contact join (which injected a SINGLE synthesized
          // `owner: { email }` and silently defeated the fan-out) is removed. The resolver sees the
          // full owner array and addresses every owner of record.
          const views = await requireCurrentLeaseViews(rentvineClient, nowMs);
          return views.find((candidate) => leaseIdOf(candidate) === leaseId) ?? null;
        },
        async loadOwnerCurrentRentDecision(leaseId) {
          // Owner copy may call the rent Verified only after the same fresh RentVine-versus-Sheet
          // reconciliation shown on the Live desk. Missing Sheet config, stale/conflicting data,
          // or an unavailable decision store all fail closed; no raw provider value is promoted.
          const renewalConfig = buildLiveRenewalConfig();
          if (!renewalConfig.ok) return null;
          let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
          try {
            resolutions = await listResolutionsForRun(user, "live-review");
          } catch {
            resolutions = [];
          }
          const result = await loadLiveOwnerCurrentRentDecision(
            leaseId,
            new Date(nowMs).toISOString(),
            renewalConfig,
            resolutions,
          );
          return result.status === "ok" ? result.decision : null;
        },
        async loadCompScreenshotAttachment(leaseId) {
          const runtime = getCompScreenshotRuntime();
          return loadCurrentRenewalDraftCompScreenshotAttachment(
            leaseId,
            runtime.deps.store,
          );
        },
        async resolveCompScreenshotAttachment(leaseId, expected) {
          const runtime = getCompScreenshotRuntime();
          return resolveRenewalDraftCompScreenshotAttachment(
            leaseId,
            expected,
            runtime.deps,
            runtime.context,
          );
        },
        // Descriptor-bound: Demo and Live-read-only refuse here, so no provider is constructed.
        createGmailClient: (subject) =>
          createDescriptorBoundGmailRuntimeClient(
            subject,
            requireEnvironmentDescriptor(),
          ),
        actor: user,
      },
      {
        request: body,
        mailbox: { email: user.email, sourceRef: `app:session:${user.uid}` },
        ...(approvedSuggestion ? { serverContext: { approvedSuggestion } } : {}),
      },
    );

    // Record the exact unsent-draft receipt. It remains in Tenant decision until a verified outcome.
    // Best-effort and non-blocking — progress is a convenience layer, so a stamp failure (e.g. no owner
    // decision recorded yet when composing from the notices desk) never fails an already-created draft.
    if (channel === "tenant" && outcome.status === "created") {
      try {
        await recordTenantOfferDraft(user, body.leaseId, outcome.draftId);
      } catch {
        // Intentionally ignored — the Gmail draft exists; progress tracking is secondary.
      }
    }

    return NextResponse.json(outcome);
  } catch (error) {
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      const actionKey = error.message.includes(`"${RENEWAL_COMP_SCREENSHOT_ACTION_KEY}"`)
        ? RENEWAL_COMP_SCREENSHOT_ACTION_KEY
        : RENEWAL_NOTICE_DRAFT_ACTION_KEY;
      return NextResponse.json(
        {
          action_key: actionKey,
          error: error.message,
          error_type: error.code,
        },
        { status: error.status },
      );
    }
    if (error instanceof LeaseDataExpiredError) {
      // S58: explicit expired-data refusal — nothing was prepared or created.
      return NextResponse.json(
        { error: error.message, error_type: "lease_data_expired" },
        { status: 409 },
      );
    }
    return apiErrorResponse(error);
  }
}
