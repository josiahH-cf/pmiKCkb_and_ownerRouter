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
  buildRenewalNoticeDraftPreview,
  type RenewalDraftPreview,
} from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { RENEWAL_NOTICE_DRAFT_ACTION_KEY } from "@/lib/lease-renewal/execution/renewal-draft-request";
import type {
  OwnerDraftInput,
  OwnerDraftMarketInput,
} from "@/lib/lease-renewal/owner-draft";
import type { RenewalRecipientChannel } from "@/lib/lease-renewal/recipient-resolution";
import type { OwnerDecision, TenantOfferInput } from "@/lib/lease-renewal/tenant-draft";

export interface RenewalNoticeMailbox {
  email: string;
  sourceRef: string;
}

export interface TenantRenewalOffer {
  ownerDecision: OwnerDecision;
  offeredRent: number;
  charges?: { rbp?: number; insurance?: number };
  infoFormUrl?: string;
}

export interface OwnerRenewalOffer {
  market: OwnerDraftMarketInput;
}

interface CommonInput {
  leaseId: string;
  mailbox: RenewalNoticeMailbox;
  /**
   * Absent → return the preview plus its S20 execution id and immutable preview hash.
   * Present → execute that exact prepared execution.
   *
   * This replaced a bare `confirm: boolean`, which could only say "do it" and carried no binding to
   * WHAT was reviewed: a boolean cannot detect that the lease, recipient, or offer changed between
   * preview and confirmation, and gives the ledger nothing to make the attempt idempotent against.
   */
  confirm?: { executionId: string; previewHash: string };
}

export type RenewalNoticeDraftInput =
  | (CommonInput & { channel: "tenant"; offer: TenantRenewalOffer })
  | (CommonInput & { channel: "owner"; offer: OwnerRenewalOffer });

export interface RenewalNoticeDraftDeps {
  /** Load the live RentVine lease VIEW (export-shaped: tenants[], property, lifted rent) by id. */
  loadLease(leaseId: string): Promise<RawLease | null>;
  /**
   * Resolve the current rent through the canonical fresh RentVine-versus-Sheet reconciliation.
   * Optional only so a missing seam fails closed as Needs Verification; Production supplies it.
   */
  loadOwnerCurrentRentDecision?(leaseId: string): Promise<{
    currentRent: number;
    currentRentEvidence: NonNullable<OwnerDraftInput["currentRentEvidence"]>;
  } | null>;
  /** Build a draft-capable Gmail client for the authenticated sender (subject === mailbox email). */
  createGmailClient(subject: string): RenewalDraftGmailClient;
  /** The signed-in operator; the S20 ledger owns approval, claim, and actor scope. */
  actor: AuthenticatedUser;
  /** Test-only S20/environment seams; production omits them. */
  seams?: GovernedDraftSeams;
}

export type RenewalNoticeDraftOutcome =
  | { status: "blocked"; channel: RenewalRecipientChannel; reasons: string[] }
  | {
      status: "preview";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string };
      subject: string;
      body: string;
      /** The exact prepared execution the caller must confirm; binds this reviewed preview. */
      executionId: string;
      previewHash: string;
    }
  | {
      status: "created";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string };
      subject: string;
      draftId: string;
      executionId: string;
    }
  | {
      status: "needs_reconciliation";
      channel: RenewalRecipientChannel;
      executionId: string;
      reason: string;
    };

interface LeaseRenewalFacts {
  tenantNameLabel?: string;
  leaseEndDateIso?: string;
  currentRent?: number;
  addressLabel?: string;
}

type DecisionResult<T> = { ok: true; decision: T } | { ok: false; reasons: string[] };

/**
 * Preview or create a renewal-notice draft for one live lease + channel. Throws EditableLayerError(404)
 * when the lease is not in the live read; otherwise returns a blocked/preview/created outcome.
 */
export async function prepareRenewalNoticeDraft(
  deps: RenewalNoticeDraftDeps,
  input: RenewalNoticeDraftInput,
): Promise<RenewalNoticeDraftOutcome> {
  const lease = await deps.loadLease(input.leaseId);
  if (!lease) {
    throw new EditableLayerError(
      "That lease was not found in the live RentVine read.",
      404,
    );
  }

  const facts = leaseRenewalFacts(lease);
  const common = {
    mailbox: input.mailbox,
    workflowId: `renewal-live:${input.leaseId}`,
    actionId: `renewal-notice-draft:${input.channel}:${input.leaseId}`,
    workflowContext: `renewal:${input.leaseId}`,
    sourceRefs: [`rentvine:lease:${input.leaseId}`],
  };

  if (input.channel === "tenant") {
    const decision = buildTenantDecision(facts, input.offer);
    if (!decision.ok) {
      return { status: "blocked", channel: "tenant", reasons: decision.reasons };
    }
    const preview = buildRenewalNoticeDraftPreview({
      ...common,
      channel: "tenant",
      lease,
      decision: decision.decision,
    });
    return finalize(preview, input, deps);
  }

  const currentRentDecision =
    (await deps.loadOwnerCurrentRentDecision?.(input.leaseId)) ?? null;
  const decision = buildOwnerDecision(facts, input.offer, currentRentDecision);
  if (!decision.ok) {
    return { status: "blocked", channel: "owner", reasons: decision.reasons };
  }
  const preview = buildRenewalNoticeDraftPreview({
    ...common,
    channel: "owner",
    lease,
    decision: decision.decision,
  });
  return finalize(preview, input, deps);
}

async function finalize(
  preview: RenewalDraftPreview,
  input: RenewalNoticeDraftInput,
  deps: RenewalNoticeDraftDeps,
): Promise<RenewalNoticeDraftOutcome> {
  if (preview.status === "blocked") {
    return { status: "blocked", channel: input.channel, reasons: preview.reasons };
  }
  const request = {
    action: preview.action as never,
    definition: LEASE_EXECUTION_DEFINITION_MAP.get(RENEWAL_NOTICE_DRAFT_ACTION_KEY)!,
    createClient: () => deps.createGmailClient(input.mailbox.email),
  };

  if (!input.confirm) {
    const prepared = await prepareGovernedDraft(deps.actor, request, deps.seams);
    return {
      status: "preview",
      channel: input.channel,
      recipient: preview.recipient,
      subject: preview.subject,
      body: preview.body,
      executionId: prepared.id,
      previewHash: prepared.preview_hash,
    };
  }

  const outcome = await executeGovernedDraft(
    deps.actor,
    {
      ...request,
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
      channel: input.channel,
      executionId: outcome.execution.id,
      reason:
        outcome.execution.state === "Failed"
          ? "Gmail refused the draft. The one attempt was consumed; review the mailbox before preparing another."
          : "The draft outcome could not be confirmed. Reconcile this execution before preparing another.",
    };
  }
  return {
    status: "created",
    channel: input.channel,
    recipient: preview.recipient,
    subject: preview.subject,
    draftId: outcome.result.providerRef,
    executionId: outcome.execution.id,
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
    currentRent: number;
    currentRentEvidence: NonNullable<OwnerDraftInput["currentRentEvidence"]>;
  } | null,
): DecisionResult<OwnerDraftInput> {
  const reasons: string[] = [];
  if (!facts.addressLabel) {
    reasons.push("Property address was not found in the live RentVine lease.");
  }
  const currentRent = currentRentDecision?.currentRent ?? facts.currentRent;
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
