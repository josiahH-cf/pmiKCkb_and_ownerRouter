import { renderInlineMessageParagraph } from "@/lib/email/inline-runs";
import { z } from "zod";
import type { CommunicationSchedule } from "./schedule-calendar";
import {
  WorkflowCommunicationContextSchema,
  type WorkflowCommunicationContext,
} from "./workflow-context";

const header = z
  .string()
  .trim()
  .max(998)
  .refine((s) => !/[\r\n\x00-\x1f\x7f]/.test(s));
const run = z
  .object({
    text: z.string().max(20_000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    color: z.literal("#c2410c").optional(),
    href: z
      .string()
      .url()
      .max(2000)
      .refine((s) => {
        const u = new URL(s);
        return (
          (u.protocol === "https:" && !u.username && !u.password) ||
          /^mailto:[^\s<>"@]+@[^\s<>"@]+$/.test(s)
        );
      })
      .optional(),
  })
  .strict();
export const WorkingCommunicationMessageSchema = z
  .object({
    subject: header,
    layout: z.literal("renewal").optional(),
    paragraphs: z.array(z.array(run).min(1).max(100)).min(1).max(200),
    attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict()
  .refine(
    (s) => JSON.stringify(s).length <= 100_000,
    "The message exceeds the supported size.",
  );
export const RichCommunicationMessageSchema = WorkingCommunicationMessageSchema.refine(
  (s) => !!s.subject,
  "Enter a subject.",
).refine(
  (s) => s.paragraphs.some((p) => p.some((r) => r.text.trim())),
  "Enter a message.",
);
export type RichCommunicationMessage = z.infer<typeof RichCommunicationMessageSchema>;
export const SequenceDraftSchema = z
  .object({
    id: z.string().uuid(),
    context: WorkflowCommunicationContextSchema,
    initial: RichCommunicationMessageSchema,
    followUp: WorkingCommunicationMessageSchema.nullable(),
  })
  .strict()
  .refine((s) => {
    try {
      communicationSendKey(s.context);
      return true;
    } catch {
      return false;
    }
  }, "Choose a supported actual lease or maintenance communication.");
export type SequenceDraft = z.infer<typeof SequenceDraftSchema>;
export type SequenceState =
  | "draft"
  | "active"
  | "paused"
  | "cancelled"
  | "completed"
  | "needs_reconciliation";
export interface CommunicationAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}
export interface StaffBusinessSignatureSnapshot {
  uid: string;
  email: string;
  version: number;
  recordedAt: string;
  source: string;
  text: string;
  contentHash: string;
}
export interface AuthorizedMessage {
  signature?: StaffBusinessSignatureSnapshot;
  subject: string;
  plainText: string;
  htmlBody: string;
  attachments: CommunicationAttachment[];
}
export interface CommunicationReplyBinding {
  senderEmail: string;
  threadId: string;
  parentMessageId: string;
  subject: string;
  references: string[];
}
export interface CommunicationThreading {
  threadId?: string;
  inReplyTo?: string;
  references: string[];
}
export interface CommunicationAuthorization {
  signatureSetup?: import("@/lib/lease-renewal/sender-signature-choice").SenderSignatureEvidence;
  /** Absent on legacy records, which remain readable but cannot dispatch. */
  deliveryPolicyVersion?: string;
  reply?: CommunicationReplyBinding;
  revision: number;
  approvedByUid: string;
  senderEmail: string;
  approvedAtMs: number;
  payloadHash: string;
  materialSourceHash: string;
  to: string[];
  cc: string[];
  sourceRefs: string[];
  initial: AuthorizedMessage;
  followUp: AuthorizedMessage | null;
  schedule: CommunicationSchedule | null;
  /** An immediate first tenant offer followed by an explicitly reviewed recurrence. */
  immediateTenantOffer?: true;
  /**
   * S265 (R-S265-4): the frozen evidence of the tenant resources each authorized message includes.
   * Present on tenant authorizations given after S265 (empty lists when nothing is included);
   * absent on earlier ones, whose stored content then decides whether they include a resource.
   */
  resourceBasis?: import("@/lib/lease-renewal/tenant-resource-inclusion").AuthorizedTenantResourceBasis;
  /**
   * S264 (R-S264-6): the exact tenant offer snapshot this authorization's initial message states,
   * frozen with it. Absent on earlier authorizations and on messages that state no offer.
   */
  offerSnapshot?: import("@/lib/lease-renewal/offer-snapshot").FrozenOfferSnapshot;
}
export interface CommunicationSequence
  extends
    SequenceDraft,
    Partial<import("./retention-policy").CommunicationsRetentionFields> {
  schemaVersion: "workflow-communication-sequence/v1";
  workflowLabel: string;
  version: number;
  responsibleUid: string;
  senderEmail: string;
  state: SequenceState;
  createdAtMs: number;
  updatedAtMs: number;
  createdByUid: string;
  authorization: CommunicationAuthorization | null;
  signatureSnapshots?: {
    initial: StaffBusinessSignatureSnapshot | null;
    followUp: StaffBusinessSignatureSnapshot | null;
  };
  nextDueAtMs: number | null;
  confirmedCount: number;
  lastSentAtMs: number | null;
  pause: {
    cause:
      | "staff"
      | "reply"
      | "bounce"
      | "changed_source"
      | "transfer"
      | "edited"
      | "source_unavailable"
      | "authorization_unavailable"
      | "provider_refused"
      | "send_unconfirmed"
      | "unexpected_sender"
      | "resource_changed"
      // S276 R-S276-2: staff recorded the tenant's response on the lease.
      | "tenant_response_recorded";
    byUid: string;
    atMs: number;
    evidenceIds: string[];
    /**
     * S274 R-S274-6: for a hold on a settled difference, each changed input with the value kept
     * with the authorization where one was kept. Absent on other causes and on older records.
     */
    changedInputs?: import("./reviewed-inputs").ChangedInput[];
  } | null;
  unresolvedOccurrenceId: string | null;
  linkedThreads: { senderEmail: string; threadId: string }[];
  threads: {
    senderEmail: string;
    threadId: string;
    messageId: string;
    rfcMessageId: string;
    sentAtMs: number;
  }[];
  observedMessageIds: string[];
  /** S233 R-S233-1: each incoming message seen on a linked thread, oldest first; absent on older records. */
  inbound?: CommunicationInboundEvidence[];
  /**
   * S233 R-S233-1: the renewal cycle the notice scope named at the latest review. Informational: it
   * is kept beside the authorization, so the authorization's payload and replay binding are unchanged.
   */
  noticeCycleId?: string | null;
  /**
   * S248 ARCH-S248-2: the staff operation that produced the current authorization (a Send,
   * Schedule or Resume), for the outreach record a send writes. Kept beside the authorization like
   * the notice cycle, so the authorization's payload and replay binding are unchanged; absent on
   * records authorized before it was kept.
   */
  authorizationOperation?: { id: string; revision: number };
  /**
   * S274 R-S274-6: the labelled inputs the authorizing review displayed (recipients, signature,
   * content values, holds), for the authorization revision they belong to. Kept beside the
   * authorization like the notice cycle, so its payload and replay binding are unchanged; absent on
   * records authorized before it was kept. A hold on a settled difference names each changed input
   * with its value from here.
   */
  authorizedInputs?: {
    revision: number;
    inputs: import("./reviewed-inputs").ReviewedInput[];
  };
  /**
   * S275 R-S275-1: the indexed watched marker the store derives on every write
   * (`replyWatchApplies`): a completed renewal message stays on the worker's watched page until
   * its answer is known. Absent on records written before S275, which the worker's one catch-up
   * pass observes once (R-S275-7).
   */
  replyWatch?: boolean;
  /** S275 R-S275-1: why and when the watch ended; absent while it holds or never applied. */
  replyWatchEnded?: import("./reply-watch").ReplyWatchEnded | null;
  observation: {
    checkedAtMs: number;
    state: "current" | "unavailable";
    historyId: string | null;
    mailboxHistoryIds?: Record<string, string>;
    /** S233 R-S233-4: why the last check did not read cleanly; absent when current or on older records. */
    reason?: SequenceObservationFailure;
    /** S233 R-S233-4: when the check stopped reading cleanly; kept across consecutive failed checks. */
    unavailableSinceMs?: number;
  } | null;
  lastOperation: { id: string; hash: string };
}
/**
 * S233 R-S233-4: why an incoming check did not read cleanly. A linked thread could not be read; a
 * thread is over the 50-message or 100,000-character read bound (or one message over its body
 * bound); the staff mailbox sync failed, so the sequence was not checked this run; or the lease
 * source or recipient facts could not be read before a send. S274 R-S274-4: or the lease read was
 * still settling at the due time, so the message waits for the next check (no claim, no pause).
 */
export const SEQUENCE_OBSERVATION_FAILURES = [
  "read_failed",
  "thread_too_large",
  "mailbox_sync_failed",
  "source_unavailable",
  "lease_read_settling",
] as const;
export type SequenceObservationFailure = (typeof SEQUENCE_OBSERVATION_FAILURES)[number];

/**
 * S233 R-S233-1/R-S233-2: one incoming message on a linked thread, as classified when it was first
 * seen. It records evidence only: no body, subject or address is kept.
 */
export interface CommunicationInboundEvidence {
  /** `${mailboxKey}:${gmailMessageId}`, the same id `observedMessageIds` holds. */
  id: string;
  /** The staff mailbox whose thread holds the message. */
  senderEmail: string;
  threadId: string;
  messageId: string;
  kind: "human" | "auto_reply" | "bounce" | "uncertain";
  receivedAtMs: number;
  /** A bounce's attempt by its RFC Message-ID or thread; null when no single attempt is identified. */
  attemptOccurrenceId?: string | null;
}
/** At most this many incoming entries are kept per communication; older ones stay counted as seen. */
export const INBOUND_EVIDENCE_LIMIT = 200;
export interface CommunicationOccurrence {
  id: string;
  sequenceId: string;
  authorizationRevision: number;
  index: number;
  state: "claimed" | "sent" | "ambiguous" | "refused";
  senderEmail: string;
  rfcMessageId: string;
  payloadHash: string;
  claimedAtMs: number;
  threading?: CommunicationThreading;
  settledAtMs?: number;
  gmailMessageId?: string;
  gmailThreadId?: string;
  sentAtMs?: number;
  reason?: "paused_before_dispatch" | "provider_refusal" | "provider_unknown";
  /** S264 R-S264-6: the exact offer the first tenant message carried, frozen with it. */
  offerSnapshot?: import("@/lib/lease-renewal/offer-snapshot").FrozenOfferSnapshot;
}
export interface VerifiedCommunicationTarget {
  reply?: CommunicationReplyBinding;
  context: WorkflowCommunicationContext;
  /** S233 R-S233-1: the renewal cycle of the notice scope; informational, never part of the binding. */
  noticeCycleId?: string | null;
  dispositionRevision?: number;
  outgoingContract?: boolean;
  signatureSetup?:
    | import("@/lib/lease-renewal/sender-signature-choice").SenderSignatureEvidence
    | null;
  legacyMaterialSourceHash?: string;
  to: string[];
  cc: string[];
  sourceRefs: string[];
  materialSourceHash: string;
  label: string;
  blockers?: string[];
  /**
   * S265: for a tenant renewal message, each tenant resource's current use from this read. Not
   * part of the reviewed target hash: only the resources a message includes are compared.
   */
  tenantResources?: import("@/lib/lease-renewal/tenant-resource-evidence").TenantResourceUses;
  /** S265: the resources the offer's decisions require in its initial message. */
  tenantResourceRequired?: readonly import("@/lib/lease-renewal/tenant-resource-evidence").TenantResourceId[];
  /** S264: the exact tenant offer snapshot the current message states. */
  offerSnapshot?: import("@/lib/lease-renewal/offer-snapshot").FrozenOfferSnapshot;
  /**
   * S274 ARCH-S274-1: whether the lease read this target was resolved on is settled. Absent reads
   * as settled. Not part of the reviewed target hash.
   */
  readSettlement?: import("./reviewed-inputs").LeaseReadSettlement;
  /**
   * S274 ARCH-S274-3: the labelled inputs this target displays for review, in display order. Not
   * part of the reviewed target hash; a refusal or a hold names the inputs that differ.
   */
  reviewedInputs?: import("./reviewed-inputs").ReviewedInput[];
}
export function communicationSendKey(
  context: WorkflowCommunicationContext,
):
  | "gmail.renewal_notice.send"
  | "gmail.maintenance_owner_notice.send"
  | "gmail.thread.reply" {
  if (
    context.actionKey === "gmail.thread.reply" &&
    context.replyTo &&
    ((context.entityType === "renewal_lease" && context.lane === "renewals") ||
      (context.entityType === "maintenance_ticket" && context.lane === "maintenance"))
  )
    return "gmail.thread.reply";
  if (
    context.lane === "renewals" &&
    context.entityType === "renewal_lease" &&
    ["renewal_owner", "renewal_tenant"].includes(context.purpose) &&
    ["gmail.mailbox.read", "gmail.renewal_notice.send"].includes(context.actionKey)
  )
    return "gmail.renewal_notice.send";
  if (
    context.lane === "maintenance" &&
    context.entityType === "maintenance_ticket" &&
    context.purpose === "maintenance_owner" &&
    ["gmail.mailbox.read", "gmail.maintenance_owner_notice.send"].includes(
      context.actionKey,
    )
  )
    return "gmail.maintenance_owner_notice.send";
  throw new Error("This workflow has no supported Send/Schedule operation.");
}
/** Preview, copy and MIME use the same escaped structured content. */
export function renderEditableCommunicationBody(
  paragraphs: RichCommunicationMessage["paragraphs"],
  layout?: RichCommunicationMessage["layout"],
): { plainText: string; htmlBody: string } {
  const rendered = paragraphs.map((p) => renderInlineMessageParagraph(p));
  const renewal = layout === "renewal";
  return {
    plainText: rendered.map((p) => p.plainText).join("\n\n"),
    htmlBody:
      (renewal
        ? '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#000000">'
        : '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">') +
      rendered
        .map((p) => (renewal ? '<p style="margin:0 0 16px">' : "<p>") + p.html + "</p>")
        .join("") +
      "</div>",
  };
}
export function renderCommunicationMessage(input: RichCommunicationMessage): {
  plainText: string;
  htmlBody: string;
} {
  return renderEditableCommunicationBody(
    RichCommunicationMessageSchema.parse(input).paragraphs,
    input.layout,
  );
}
export function plainCommunicationMessage(
  subject: string,
  body: string,
): RichCommunicationMessage {
  return RichCommunicationMessageSchema.parse({
    subject,
    paragraphs: body.split(/\n\n/).map((text) => [{ text }]),
    attachmentIds: [],
  });
}
