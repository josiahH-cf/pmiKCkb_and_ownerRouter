// The route-facing service that turns a live renewal lease + a human's offer into a real unsent Gmail
// draft, in two steps a UI drives: preview, then (on confirm) create.
//
// Authority split — the source of each value is deliberate:
//   • RECIPIENT and FACTS (tenant name, lease-end date, current rent, property address) come from the
//     LIVE RentVine lease, never the client. The recipient is resolved by resolveRenewalRecipient (via
//     the preview core) and is never invented.
//   • The OFFER (offered rent + owner decision for a tenant notice; the market comps for an owner
//     notice) is the human operator's input at compose time — the person composing the renewal IS the
//     approver, and the result is an UNSENT draft they review and send by hand. Nothing here sends.
//
// The lease is injected (`deps.loadLease`) so this logic is fully unit-tested without RentVine, and the
// Gmail client is injected (`deps.createGmailClient`) so no test contacts Gmail. `executeRenewalNoticeDraft`
// still re-asserts the production gate + the authoritative-recipient guard before any draft is created.

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  executeGovernedDraft,
  prepareGovernedDraft,
  reconcileGovernedDraft,
  type GovernedDraftSeams,
} from "@/lib/external-execution/governed-draft-execution";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import {
  leaseAddressLabel,
  leaseCurrentRent,
  leaseEndDateIso,
  leaseTenantName,
} from "@/lib/integrations/rentvine/lease-mapper";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  compScreenshotDraftAttachmentIdentity,
  type CompScreenshotAttachment,
} from "@/lib/lease-renewal/comp-screenshot-attachment";
import type {
  RenewalDraftAttachmentIdentity,
  ResolvedRenewalDraftAttachment,
} from "@/lib/lease-renewal/execution/renewal-draft-attachment";
import {
  buildRenewalNoticeDraftPreview,
  type RenewalDraftPreview,
} from "@/lib/lease-renewal/execution/renewal-draft-preview";
import type {
  RenewalNoticeDraftOffer,
  RenewalNoticeDraftOutcome,
  RenewalNoticeDraftRequest,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { RENEWAL_NOTICE_DRAFT_ACTION_KEY } from "@/lib/lease-renewal/execution/renewal-draft-request";
import type {
  OwnerDraftInput,
  OwnerDraftMarketInput,
} from "@/lib/lease-renewal/owner-draft";
import type { TenantOfferInput } from "@/lib/lease-renewal/tenant-draft";
import {
  currentRenewalCopyTemplate,
  type RenewalCopyTemplateDefinition,
} from "@/lib/lease-renewal/renewal-copy-governance";
import type { RenewalCopyChannel } from "@/lib/lease-renewal/renewal-copy-contract";

export interface RenewalNoticeMailbox {
  email: string;
  sourceRef: string;
}

export interface RenewalNoticeDraftInput {
  /** The exact browser/route request; never enriched with server-owned recipient or fact values. */
  request: RenewalNoticeDraftRequest;
  mailbox: RenewalNoticeMailbox;
  /**
   * Values derived under server authority after request parsing. Keeping this separate prevents a
   * browser from impersonating an approved suggestion while the shared request remains unchanged.
   */
  serverContext?: {
    approvedSuggestion?: NonNullable<OwnerDraftMarketInput["approvedSuggestion"]>;
  };
}

export interface RenewalNoticeDraftDeps {
  /** Load the live RentVine lease VIEW (export-shaped: tenants[], property, lifted rent) by id. */
  loadLease(leaseId: string): Promise<RawLease | null>;
  /**
   * Resolve the current rent through the canonical fresh RentVine-versus-Sheet reconciliation.
   * Optional only so a missing seam fails closed as Needs Verification; Production supplies it.
   */
  loadOwnerCurrentRentDecision?(leaseId: string): Promise<{
    currentRent: number | null;
    currentRentEvidence: NonNullable<OwnerDraftInput["currentRentEvidence"]>;
  } | null>;
  /** Current delivered same-lease screenshot receipt; no browser reference participates. */
  loadCompScreenshotAttachment?(
    leaseId: string,
  ): Promise<CompScreenshotAttachment | null>;
  /** Gate, reload, and verify the current Drive bytes immediately before Gmail construction. */
  resolveCompScreenshotAttachment?(
    leaseId: string,
    expected: RenewalDraftAttachmentIdentity,
  ): Promise<ResolvedRenewalDraftAttachment>;
  /** Build a draft-capable Gmail client for the authenticated sender (subject === mailbox email). */
  createGmailClient(subject: string): RenewalDraftGmailClient;
  /** The signed-in operator; the S20 ledger owns approval, claim, and actor scope. */
  actor: AuthenticatedUser;
  /** Production uses the current review-only/approved registry; tests may inject an approved fixture. */
  resolveCopyTemplate?(channel: RenewalCopyChannel): RenewalCopyTemplateDefinition;
  /** Test-only S20/environment seams; production omits them. */
  seams?: GovernedDraftSeams;
}

interface LeaseRenewalFacts {
  tenantNameLabel?: string;
  leaseEndDateIso?: string;
  currentRent?: number;
  addressLabel?: string;
}

type DecisionResult<T> = { ok: true; decision: T } | { ok: false; reasons: string[] };
type TenantRenewalOffer = Extract<RenewalNoticeDraftOffer, { channel: "tenant" }>;
type OwnerRenewalOffer = { channel: "owner"; market: OwnerDraftMarketInput };

/**
 * Preview or create a renewal-notice draft for one live lease + channel. Throws EditableLayerError(404)
 * when the lease is not in the live read; otherwise returns a blocked/preview/created outcome.
 */
export async function prepareRenewalNoticeDraft(
  deps: RenewalNoticeDraftDeps,
  input: RenewalNoticeDraftInput,
): Promise<RenewalNoticeDraftOutcome> {
  const browserRequest = input.request;
  const channel = browserRequest.offer.channel;
  const lease = await deps.loadLease(browserRequest.leaseId);
  if (!lease) {
    throw new EditableLayerError(
      "That lease was not found in the live RentVine read.",
      404,
    );
  }

  const facts = leaseRenewalFacts(lease);
  const common = {
    mailbox: input.mailbox,
    workflowId: `renewal-live:${browserRequest.leaseId}`,
    actionId: `renewal-notice-draft:${channel}:${browserRequest.leaseId}`,
    workflowContext: `renewal:${browserRequest.leaseId}`,
    sourceRefs: [`rentvine:lease:${browserRequest.leaseId}`],
  };

  if (browserRequest.offer.channel === "tenant") {
    const decision = buildTenantDecision(facts, browserRequest.offer);
    if (!decision.ok) {
      return { status: "blocked", channel: "tenant", reasons: decision.reasons };
    }
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      lease,
      decision: decision.decision,
      copyTemplate:
        deps.resolveCopyTemplate?.("tenant") ?? currentRenewalCopyTemplate("tenant"),
      ...(browserRequest.copy ? { copySelection: browserRequest.copy } : {}),
    });
    return finalize(preview, browserRequest, input.mailbox, deps);
  }

  const currentRentDecision =
    (await deps.loadOwnerCurrentRentDecision?.(browserRequest.leaseId)) ?? null;
  const compScreenshot =
    (await deps.loadCompScreenshotAttachment?.(browserRequest.leaseId)) ?? null;
  const attachment = compScreenshot
    ? compScreenshotDraftAttachmentIdentity(compScreenshot)
    : undefined;
  const ownerOffer: OwnerRenewalOffer = {
    ...browserRequest.offer,
    market: {
      ...browserRequest.offer.market,
      ...(input.serverContext?.approvedSuggestion
        ? { approvedSuggestion: input.serverContext.approvedSuggestion }
        : {}),
      ...(attachment
        ? {
            compScreenshotAttachment: {
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              sha256Checksum: attachment.sha256Checksum,
            },
          }
        : {}),
    },
  };
  const decision = buildOwnerDecision(facts, ownerOffer, currentRentDecision);
  if (!decision.ok) {
    return { status: "blocked", channel: "owner", reasons: decision.reasons };
  }
  const preview = buildRenewalNoticeDraftPreview({
    ...common,
    channel: "owner",
    lease,
    decision: decision.decision,
    copyTemplate:
      deps.resolveCopyTemplate?.("owner") ?? currentRenewalCopyTemplate("owner"),
    ...(browserRequest.copy ? { copySelection: browserRequest.copy } : {}),
    ...(attachment ? { attachment } : {}),
    sourceRefs: [
      ...common.sourceRefs,
      ...(attachment ? [`comp-screenshot-receipt:${attachment.receiptId}`] : []),
    ],
  });
  return finalize(preview, browserRequest, input.mailbox, deps);
}

async function finalize(
  preview: RenewalDraftPreview,
  input: RenewalNoticeDraftRequest,
  mailbox: RenewalNoticeMailbox,
  deps: RenewalNoticeDraftDeps,
): Promise<RenewalNoticeDraftOutcome> {
  const channel = input.offer.channel;
  if (preview.status === "blocked") {
    if (input.reconcile) {
      return {
        status: "reconciliation",
        channel,
        executionId: input.reconcile.executionId,
        resolution: "needs_review",
        reason:
          "The exact attempt can no longer be reconstructed from current authoritative facts. Review the execution before preparing any new draft.",
      };
    }
    return { status: "blocked", channel, reasons: preview.reasons };
  }
  const governedRequest = {
    action: preview.action as never,
    definition: LEASE_EXECUTION_DEFINITION_MAP.get(RENEWAL_NOTICE_DRAFT_ACTION_KEY)!,
    createClient: () => deps.createGmailClient(mailbox.email),
    ...(preview.attachment && deps.resolveCompScreenshotAttachment
      ? {
          resolveAttachment: (expected: RenewalDraftAttachmentIdentity) =>
            deps.resolveCompScreenshotAttachment!(input.leaseId, expected),
        }
      : {}),
  };

  if (input.reconcile) {
    try {
      const outcome = await reconcileGovernedDraft(
        deps.actor,
        {
          ...governedRequest,
          executionId: input.reconcile.executionId,
        },
        deps.seams,
      );
      if (outcome.status === "not_found") {
        return {
          status: "reconciliation",
          channel,
          executionId: input.reconcile.executionId,
          resolution: "not_found",
          reason:
            "The exact RFC Message-ID was not found. The one attempt remains unresolved; review Gmail before any new draft.",
        };
      }
      const draftId =
        "receipt" in outcome && outcome.receipt ? outcome.receipt.providerRef : undefined;
      return {
        status: "reconciliation",
        channel,
        executionId: input.reconcile.executionId,
        resolution: "created",
        duplicate: outcome.duplicate,
        ...(draftId ? { draftId } : {}),
        reason: "The exact unsent Gmail draft was found and the execution is reconciled.",
      };
    } catch (error) {
      if (error instanceof EditableLayerError && error.status === 409) {
        return {
          status: "reconciliation",
          channel,
          executionId: input.reconcile.executionId,
          resolution: "needs_review",
          reason:
            "The exact attempt does not match the current authoritative draft inputs. Review the execution before preparing any new draft.",
        };
      }
      throw error;
    }
  }

  if (preview.status === "review_only") {
    return {
      status: "review_only",
      channel,
      recipient: preview.recipient,
      subject: preview.subject,
      body: preview.body,
      template: preview.template,
      copy: preview.copy,
      reasons: preview.reasons,
      ...(preview.attachment ? { attachment: preview.attachment } : {}),
    };
  }

  if (!input.confirm) {
    const prepared = await prepareGovernedDraft(deps.actor, governedRequest, deps.seams);
    return {
      status: "preview",
      channel,
      recipient: preview.recipient,
      subject: preview.subject,
      body: preview.body,
      executionId: prepared.id,
      previewHash: prepared.preview_hash,
      template: preview.template,
      ...(preview.attachment ? { attachment: preview.attachment } : {}),
    };
  }

  const outcome = await executeGovernedDraft(
    deps.actor,
    {
      ...governedRequest,
      executionId: input.confirm.executionId,
      previewHash: input.confirm.previewHash,
    },
    deps.seams,
  );
  if (outcome.execution.state !== "Succeeded" || !outcome.result) {
    // The terminal transition already committed inside the bridge, which also emitted the single
    // value-free A2 event. Surface it truthfully instead of implying a draft exists.
    return {
      status: "needs_reconciliation",
      channel,
      executionId: outcome.execution.id,
      reason:
        outcome.execution.state === "Failed"
          ? "Gmail refused the draft. The one attempt was consumed; review the mailbox before preparing another."
          : "The draft outcome could not be confirmed. Reconcile this execution before preparing another.",
    };
  }
  return {
    status: "created",
    channel,
    recipient: preview.recipient,
    subject: preview.subject,
    draftId: outcome.result.providerRef,
    executionId: outcome.execution.id,
    template: preview.template,
    ...(preview.attachment ? { attachment: preview.attachment } : {}),
  };
}

function leaseRenewalFacts(lease: RawLease): LeaseRenewalFacts {
  // Each fact is extracted INDEPENDENTLY (reusing the exact live-read field map + coercers). The owner
  // channel needs the current rent + address even when a tenant name is absent, so — unlike the
  // candidate mapper, which skips a whole lease that has no tenant name — nothing here is gated on the
  // tenant name. Free-text facts are sanitized so an embedded control char can never reach a header.
  return {
    tenantNameLabel: sanitizeText(leaseTenantName(lease)),
    leaseEndDateIso: leaseEndDateIso(lease),
    currentRent: leaseCurrentRent(lease),
    addressLabel: sanitizeText(leaseAddressLabel(lease)),
  };
}

/** Strip control chars (incl. CR/LF that would break an email header) and collapse whitespace. */
function sanitizeText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = value
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned === "" ? undefined : cleaned;
}

function buildTenantDecision(
  facts: LeaseRenewalFacts,
  offer: TenantRenewalOffer,
): DecisionResult<TenantOfferInput> {
  const reasons: string[] = [];
  if (!facts.tenantNameLabel) {
    reasons.push("Tenant name was not found in the live RentVine lease.");
  }
  if (!facts.leaseEndDateIso) {
    reasons.push("Lease end date was not found in the live RentVine lease.");
  }
  if (!(offer.offeredRent > 0)) {
    reasons.push("Offered rent must be greater than zero.");
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    decision: {
      tenantNameLabel: facts.tenantNameLabel!,
      leaseEndDateIso: facts.leaseEndDateIso!,
      ownerDecision: offer.ownerDecision,
      offeredRent: offer.offeredRent,
      ...(offer.charges ? { charges: offer.charges } : {}),
      ...(offer.infoFormUrl ? { infoFormUrl: offer.infoFormUrl } : {}),
    },
  };
}

function buildOwnerDecision(
  facts: LeaseRenewalFacts,
  offer: OwnerRenewalOffer,
  currentRentDecision: {
    currentRent: number | null;
    currentRentEvidence: NonNullable<OwnerDraftInput["currentRentEvidence"]>;
  } | null,
): DecisionResult<OwnerDraftInput> {
  const reasons: string[] = [];
  if (!facts.addressLabel) {
    reasons.push("Property address was not found in the live RentVine lease.");
  }
  const currentRent = currentRentDecision
    ? currentRentDecision.currentRent
    : facts.currentRent;
  if (
    typeof currentRent !== "number" ||
    !Number.isFinite(currentRent) ||
    currentRent <= 0
  ) {
    reasons.push("Current rent was not found in the live RentVine lease.");
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    decision: {
      addressLabel: facts.addressLabel!,
      currentRent: currentRent!,
      ...(currentRentDecision
        ? { currentRentEvidence: currentRentDecision.currentRentEvidence }
        : {}),
      market: offer.market,
    },
  };
}

// S71: `addressOf` used to duplicate the lease-mapper's first-hit-wins key walk here, so the gated
// owner email carried the same street-only label as the desk — a street name with no house number.
// The single composer now serves both, which is what makes AC-S71-2 (one address string across the
// desk card, the workspace heading, and the owner draft) enforceable rather than aspirational.
