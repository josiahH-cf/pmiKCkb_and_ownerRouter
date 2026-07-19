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

import { EditableLayerError } from "@/lib/firestore/errors";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { mapLeasesToNonSheetCandidates } from "@/lib/integrations/rentvine/lease-mapper";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  buildRenewalNoticeDraftPreview,
  type RenewalDraftPreview,
} from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { executeRenewalNoticeDraft } from "@/lib/lease-renewal/execution/renewal-draft-request";
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
  /** false → return the preview only; true → create the real unsent draft. */
  confirm: boolean;
  /** Read timestamp for the (pure) lease→facts mapping; accepted as INPUT, never Date.now(). */
  readTimestamp: string;
}

export type RenewalNoticeDraftInput =
  | (CommonInput & { channel: "tenant"; offer: TenantRenewalOffer })
  | (CommonInput & { channel: "owner"; offer: OwnerRenewalOffer });

export interface RenewalNoticeDraftDeps {
  /** Load the live RentVine lease VIEW (export-shaped: tenants[], property, lifted rent) by id. */
  loadLease(leaseId: string): Promise<RawLease | null>;
  /** Build a draft-capable Gmail client for the authenticated sender (subject === mailbox email). */
  createGmailClient(subject: string): RenewalDraftGmailClient;
}

export type RenewalNoticeDraftOutcome =
  | { status: "blocked"; channel: RenewalRecipientChannel; reasons: string[] }
  | {
      status: "preview";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string };
      subject: string;
      body: string;
    }
  | {
      status: "created";
      channel: RenewalRecipientChannel;
      recipient: { to: string; sourceRef: string };
      subject: string;
      draftId: string;
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

  const facts = leaseRenewalFacts(lease, input.readTimestamp);
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

  const decision = buildOwnerDecision(facts, input.offer);
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
  if (!input.confirm) {
    return {
      status: "preview",
      channel: input.channel,
      recipient: preview.recipient,
      subject: preview.subject,
      body: preview.body,
    };
  }
  const client = deps.createGmailClient(input.mailbox.email);
  const receipt = await executeRenewalNoticeDraft(client, preview.action);
  return {
    status: "created",
    channel: input.channel,
    recipient: preview.recipient,
    subject: preview.subject,
    draftId: receipt.providerRef,
  };
}

function leaseRenewalFacts(lease: RawLease, readTimestamp: string): LeaseRenewalFacts {
  // Reuse the exact live-read field mapping for tenant name / lease-end / current rent.
  const candidate = mapLeasesToNonSheetCandidates([lease], { readTimestamp })
    .candidates[0];
  const leaseEnd = candidate?.fields.lease_end_date?.value;
  const currentRent = candidate?.fields.current_rent?.value;
  return {
    tenantNameLabel: candidate?.joinValue,
    leaseEndDateIso: typeof leaseEnd === "string" ? leaseEnd : undefined,
    currentRent: typeof currentRent === "number" ? currentRent : undefined,
    addressLabel: addressOf(lease),
  };
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
): DecisionResult<OwnerDraftInput> {
  const reasons: string[] = [];
  if (!facts.addressLabel) {
    reasons.push("Property address was not found in the live RentVine lease.");
  }
  if (typeof facts.currentRent !== "number") {
    reasons.push("Current rent was not found in the live RentVine lease.");
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    decision: {
      addressLabel: facts.addressLabel!,
      currentRent: facts.currentRent!,
      market: offer.market,
    },
  };
}

function addressOf(lease: RawLease): string | undefined {
  const property =
    lease.property && typeof lease.property === "object"
      ? (lease.property as Record<string, unknown>)
      : {};
  for (const source of [property, lease] as const) {
    for (const key of ["streetName", "address", "addressLine1", "propertyAddress"]) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}
