import {
  hasCurrentRenewalAuthorization,
  isRenewalDeliveryContext,
  RENEWAL_DELIVERY_POLICY_VERSION,
} from "./delivery-policy";
import { MAINTENANCE_RETIREMENT_MESSAGE } from "@/lib/maintenance/retirement";
import type { StaffBusinessProfile } from "@/lib/staff/business-profile";
import {
  outgoingPayloadReasons,
  SIGNATURE_SETUP_REQUIRED,
} from "@/lib/lease-renewal/outgoing-message-readiness";
import { matchesBusinessSignature } from "./business-signature";
import {
  compositionRecordRead,
  operationStage,
} from "@/lib/observability/staff-operation";
import {
  classifyIncomingMessage,
  communicationEmailFrom as emailFrom,
} from "./inbound-classification";
import { randomUUID } from "node:crypto";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { EditableLayerError } from "@/lib/firestore/errors";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import type {
  GmailProfile,
  GmailSendResult,
  GmailThreadView,
} from "@/lib/gmail-runtime/types";
import type {
  WorkflowMimeAttachment,
  WorkflowMimeMessage,
} from "@/lib/gmail-runtime/workflow-mime";
import { WORKFLOW_ATTACHMENT_MAX_BYTES } from "@/lib/gmail-runtime/workflow-mime";
import { communicationScopeKey } from "./sequence-attachments";
import {
  firstOccurrence,
  CommunicationScheduleSchema,
  localDateAt,
  nextOccurrence,
  type CommunicationSchedule,
} from "./schedule-calendar";
import {
  RichCommunicationMessageSchema,
  SequenceDraftSchema,
  communicationSendKey,
  renderCommunicationMessage,
  type AuthorizedMessage,
  type StaffBusinessSignatureSnapshot,
  type CommunicationAttachment,
  type CommunicationAuthorization,
  type CommunicationInboundEvidence,
  type CommunicationOccurrence,
  type CommunicationSequence,
  type SequenceDraft,
  type VerifiedCommunicationTarget,
} from "./sequence-model";
import { gmailMailboxKey } from "./state-store";
import { correlateBounceAttempt } from "./communication-evidence";
import {
  reviewedCommunicationTargetHash,
  sequenceHash,
  type SequenceStore,
} from "./sequence-store";
import type { WorkflowCommunicationContext } from "./workflow-context";
import { replyCheckable, type ReplyWatchEndReason } from "./reply-watch";
import {
  TENANT_RESPONSE_PAUSE_CAUSE,
  tenantReminderScope,
  tenantResponseHolds,
  tenantResponsePause,
  type RecordedTenantResponse,
} from "./tenant-response-hold";
import {
  authorizedOccurrenceBasis,
  projectTenantResourceInclusion,
  tenantResourceEffectVerdict,
  tenantResourceStatesFromUses,
  type AuthorizedTenantResourceBasis,
} from "@/lib/lease-renewal/tenant-resource-inclusion";
import type { TenantResourceId } from "@/lib/lease-renewal/tenant-resource-evidence";
import {
  appendUnsentHistory,
  unsentAttemptOnResume,
  unsentAttemptOnSave,
} from "@/lib/lease-renewal/unsent-message";
import {
  CommunicationTargetChangedError,
  LEASE_READ_REREAD_WAITS_MS,
  LeaseReadNotSettledError,
  changedReviewedInputs,
  type ChangedInput,
  type LeaseReadUnsettledReason,
  type ReviewedInput,
} from "./reviewed-inputs";

/** S274: how a target is read. `settle` reads the lease as an approval read (it joins a read in flight). */
export interface ResolveTargetOptions {
  readonly settle?: boolean;
}

/** S274 ARCH-S274-1: one target resolution, settled or not, as a typed result. */
export type SettledCommunicationTarget =
  | { readonly state: "settled"; readonly target: VerifiedCommunicationTarget }
  | { readonly state: "not_settled"; readonly reason: LeaseReadUnsettledReason };

/**
 * S274 ARCH-S274-1: resolve a target on a settled lease read. A target whose read did not settle,
 * or a resolution refused as a read still in progress, is read again after each wait (the bound:
 * at most `waitsMs.length` re-reads); past the bound the result is not settled with the last
 * reason. Any other failure (an unreadable source) is thrown as it was.
 */
export async function settleCommunicationTarget(
  resolve: () => Promise<VerifiedCommunicationTarget>,
  waitsMs: readonly number[],
  wait: (ms: number) => Promise<void>,
): Promise<SettledCommunicationTarget> {
  let reason: LeaseReadUnsettledReason = "read_in_flight";
  for (let attempt = 0; attempt <= waitsMs.length; attempt += 1) {
    if (attempt > 0) await wait(waitsMs[attempt - 1]!);
    try {
      const target = await resolve();
      const settlement = target.readSettlement ?? { state: "settled" as const };
      if (settlement.state === "settled") return { state: "settled", target };
      reason = settlement.reason;
    } catch (error) {
      if (!(error instanceof LeaseReadNotSettledError)) throw error;
      reason = error.reason;
    }
  }
  return { state: "not_settled", reason };
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** S274 R-S274-6: the inputs kept with this exact authorization revision, or none. */
function keptAuthorizedInputs(s: CommunicationSequence): ReviewedInput[] | null {
  return s.authorization &&
    s.authorizedInputs &&
    s.authorizedInputs.revision === s.authorization.revision
    ? s.authorizedInputs.inputs
    : null;
}

/**
 * S265 (R-S265-4, ARCH-S265-4): the tenant resources each exact authorized message includes, with
 * their frozen evidence. Every included resource must be usable now, linked as its current
 * destination, keep its wording and cover the reviewed recipients; the initial offer must carry
 * what the decisions require. Any failure refuses the authorization with each exact fix.
 */
function tenantResourceAuthorizationBasis(
  target: VerifiedCommunicationTarget,
  initial: AuthorizedMessage,
  followUp: AuthorizedMessage | null,
): AuthorizedTenantResourceBasis | undefined {
  if (!target.tenantResources) return undefined;
  const states = tenantResourceStatesFromUses(target.tenantResources);
  const recipients = [...target.to, ...target.cc];
  const review = (message: AuthorizedMessage, required: readonly TenantResourceId[]) =>
    projectTenantResourceInclusion({
      content: message,
      states,
      requirements: { required, informationForm: "omitted", holds: [] },
      recipients,
    });
  const first = review(initial, target.tenantResourceRequired ?? []);
  const next = followUp ? review(followUp, []) : null;
  const problems = [...first.problems, ...(next?.problems ?? [])].map(
    (problem) => problem.message,
  );
  if (problems.length)
    throw new EditableLayerError([...new Set(problems)].join(" "), 409);
  return { initial: [...first.included], followUp: next ? [...next.included] : null };
}

export interface SequenceMailClient {
  subject: string;
  getProfile(): Promise<GmailProfile>;
  getThread(id: string): Promise<GmailThreadView>;
  sendWorkflowMessage(message: WorkflowMimeMessage): Promise<GmailSendResult>;
  findWorkflowMessage(
    rfcMessageId: string,
    expected: WorkflowMimeMessage,
  ): Promise<(GmailSendResult & { sentAtMs: number }) | null>;
}
export interface CommunicationSequenceDependencies {
  store: SequenceStore;
  resolveTarget(
    actor: AuthenticatedUser,
    context: WorkflowCommunicationContext,
    options?: ResolveTargetOptions,
  ): Promise<VerifiedCommunicationTarget>;
  /**
   * S274 R-S274-1: wait before the next read of an unsettled lease read at confirm; production
   * joins the lease read in flight. Without it the service waits the plain length.
   */
  waitForLeaseRead?(ms: number): Promise<void>;
  resolveAttachment(
    id: string,
    context: WorkflowCommunicationContext,
  ): Promise<WorkflowMimeAttachment & { identity: CommunicationAttachment }>;
  readActor(uid: string): Promise<AuthenticatedUser>;
  createClient(mailbox: string): SequenceMailClient;
  assertRuntimeAction(action: string): Promise<void>;
  assertEffectEnvironment(): void;
  now?(): number;
  readBusinessProfile?(actor: AuthenticatedUser): Promise<StaffBusinessProfile | null>;
  syncMailbox?(actor: AuthenticatedUser): Promise<void>;
  readLinkedThreads?(
    actor: AuthenticatedUser,
    context: WorkflowCommunicationContext,
  ): Promise<CommunicationSequence["linkedThreads"]>;
  /**
   * S248 ARCH-S248-2: after Gmail accepted a message and the send settled, record the renewal
   * outreach once for that exact message. It runs after the send and never decides it: a failure
   * here is swallowed, so the send is neither repeated nor failed by it.
   */
  recordAcceptedSend?(
    sequence: CommunicationSequence,
    occurrence: CommunicationOccurrence & { gmailMessageId: string },
    sentAtMs: number,
  ): Promise<void>;
  /**
   * S275 R-S275-1: why a watched message's watch ends now, read from the lease record (its answer,
   * its cycle and its lease end), or null while it holds. Absent, the worker pages no watched
   * message, exactly as before the watch.
   */
  replyWatchEndReason?(
    sequence: CommunicationSequence,
    nowMs: number,
  ): Promise<ReplyWatchEndReason | null>;
  /**
   * S276 R-S276-3 (ARCH-S276-2): the tenant response recorded on the message's lease (its current
   * work record), or null when none is recorded. Read-only. Absent, dispatch reads no response and
   * the claim transaction still applies the hold on the stored record.
   */
  readTenantResponse?(
    sequence: CommunicationSequence,
  ): Promise<RecordedTenantResponse | null>;
  /**
   * S273 R-S273-6: after the communication worker held a message, raise its one in-app notice for
   * the responsible sender (deduplicated per sequence and pause; no body, no recipient address). It
   * runs after the hold and never decides it: a failure here is swallowed.
   */
  recordHold?(sequence: CommunicationSequence): Promise<void>;
}
export function assertCommunicationStaff(
  actor: AuthenticatedUser,
  capability: "read" | "edit" | "sendEmail",
) {
  if (
    !["Editor", "Approver", "Admin"].includes(actor.role) ||
    actor.hd !== "pmikcmetro.com" ||
    !actor.email.toLowerCase().endsWith("@pmikcmetro.com") ||
    !can(actor.role, capability) ||
    (capability !== "read" && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      "Current managed staff authority is required for this communication action.",
      403,
    );
}
function assertWorkflowAccess(
  actor: AuthenticatedUser,
  context: WorkflowCommunicationContext,
) {
  if (context.lane === "maintenance")
    throw new EditableLayerError(MAINTENANCE_RETIREMENT_MESSAGE, 410);
  communicationSendKey(context);
  if (!hasSpaceAccess(actor, context.lane))
    throw new EditableLayerError(
      "This workflow Space is unavailable to this staff member.",
      403,
    );
}
function requireSequence(s: CommunicationSequence | null): CommunicationSequence {
  if (!s) throw new EditableLayerError("This communication does not exist.", 404);
  return s;
}
export { classifyIncomingMessage } from "./inbound-classification";
export class WorkflowCommunicationSequenceService {
  private readonly now: () => number;
  constructor(readonly deps: CommunicationSequenceDependencies) {
    this.now = deps.now ?? Date.now;
  }
  /**
   * S274 ARCH-S274-1: the one target resolution confirm uses: a settled lease read, joined and read
   * again within the bound (three re-reads over about ten seconds), or a typed not-settled result.
   * The worker passes no waits: one read, and an unsettled one waits for its next run.
   */
  async resolveSettledTarget(
    actor: AuthenticatedUser,
    context: WorkflowCommunicationContext,
    waitsMs: readonly number[] = LEASE_READ_REREAD_WAITS_MS,
  ): Promise<SettledCommunicationTarget> {
    return settleCommunicationTarget(
      () => this.deps.resolveTarget(actor, context, { settle: true }),
      waitsMs,
      this.deps.waitForLeaseRead ?? sleep,
    );
  }
  async list(actor: AuthenticatedUser, after: string | null = null) {
    assertCommunicationStaff(actor, "read");
    const page = await this.deps.store.list(after, 50);
    return {
      ...page,
      sequences: page.sequences
        .filter(
          (s) =>
            isRenewalDeliveryContext(s.context) && hasSpaceAccess(actor, s.context.lane),
        )
        .map((s) => ({
          id: s.id,
          workflowLabel: s.workflowLabel,
          context: s.context,
          state: s.state,
          version: s.version,
          responsibleUid: s.responsibleUid,
          senderEmail: s.senderEmail,
          createdAtMs: s.createdAtMs,
          updatedAtMs: s.updatedAtMs,
          nextDueAtMs: s.nextDueAtMs,
          confirmedCount: s.confirmedCount,
          lastSentAtMs: s.lastSentAtMs,
          scheduled: !!s.authorization?.schedule,
          scheduleTimeZone: s.authorization?.schedule?.timeZone ?? null,
          requiresReview:
            !!s.authorization &&
            !["completed", "cancelled"].includes(s.state) &&
            !s.unresolvedOccurrenceId &&
            !hasCurrentRenewalAuthorization(s),
          pause: s.pause,
          observation: s.observation,
          unresolvedOccurrenceId: s.unresolvedOccurrenceId,
        })),
    };
  }
  async thread(
    actor: AuthenticatedUser,
    id: string,
    threadId: string,
    senderEmail?: string,
  ) {
    const s = await this.get(actor, id);
    const matches = [
      ...new Map(
        [...s.linkedThreads, ...s.threads]
          .filter(
            (t) =>
              t.threadId === threadId &&
              (!senderEmail || t.senderEmail === senderEmail.toLowerCase()),
          )
          .map((t) => [`${t.senderEmail}:${t.threadId}`, t]),
      ).values(),
    ];
    if (matches.length !== 1)
      throw new EditableLayerError(
        "Choose the exact workflow-linked thread and its original sender mailbox.",
        403,
      );
    const t = matches[0];
    await this.deps.assertRuntimeAction("gmail.mailbox.read");
    const client = this.client(t.senderEmail);
    if (
      (await client.getProfile()).emailAddress.toLowerCase() !==
      t.senderEmail.toLowerCase()
    )
      throw new EditableLayerError(
        "The original linked mailbox could not be verified.",
        403,
      );
    return client.getThread(t.threadId);
  }
  async refresh(actor: AuthenticatedUser, id: string) {
    assertCommunicationStaff(actor, "edit");
    return this.observe(await this.get(actor, id));
  }
  async get(actor: AuthenticatedUser, id: string) {
    await operationStage("permission", async () =>
      assertCommunicationStaff(actor, "read"),
    );
    const s = requireSequence(
      await compositionRecordRead(
        {
          actorUid: actor.uid,
          authorityFingerprint: sequenceHash({
            email: actor.email,
            hd: actor.hd,
            role: actor.role,
            scopeContract: "s167-all-internal-spaces",
          }),
          recordKey: `communication:${id}`,
          configVersion: `sequence-history.v1:${process.env.ENVIRONMENT_KIND ?? ""}:${process.env.DATA_CONTEXT ?? ""}`,
        },
        () => operationStage("record_read", () => this.deps.store.get(id)),
      ),
    );
    await operationStage("permission", async () =>
      assertWorkflowAccess(actor, s.context),
    ); // The stored workflow was admitted from its real owner; no mailbox read is needed for history.
    return s;
  }
  /** S233 R-S233-1: the communication's attempts for its evidence list, after the same access checks. */
  async attempts(actor: AuthenticatedUser, id: string) {
    const s = await this.get(actor, id);
    return this.deps.store.listOccurrences(s.id);
  }
  async save(
    actor: AuthenticatedUser,
    draft: SequenceDraft,
    expectedVersion: number,
    operationId: string,
  ) {
    assertCommunicationStaff(actor, "edit");
    const parsed = SequenceDraftSchema.parse(draft);
    assertWorkflowAccess(actor, parsed.context);
    const old = await this.deps.store.get(parsed.id);
    if (
      old &&
      (communicationScopeKey(old.context) !== communicationScopeKey(parsed.context) ||
        communicationSendKey(old.context) !== communicationSendKey(parsed.context) ||
        sequenceHash(old.context.replyTo ?? null) !==
          sequenceHash(parsed.context.replyTo ?? null))
    )
      throw new EditableLayerError(
        "A communication cannot move to a different workflow.",
        409,
      );
    // Once the real workflow is admitted, app-owned wording saves need no mailbox/provider round trip.
    const [admission, admittedLinks] = !old
      ? await Promise.all([
          this.deps.resolveTarget(actor, parsed.context),
          this.deps.readLinkedThreads?.(actor, parsed.context) ?? [],
        ])
      : [null, []];
    const profile =
      !old || old.responsibleUid === actor.uid
        ? ((await this.deps.readBusinessProfile?.(actor).catch(() => null)) ?? null)
        : null;
    const signature = (
      message: SequenceDraft["initial"] | null,
      previous: SequenceDraft["initial"] | null | undefined,
      prior: StaffBusinessSignatureSnapshot | null | undefined,
    ): StaffBusinessSignatureSnapshot | null => {
      if (!message) return null;
      if (
        profile &&
        profile.uid === actor.uid &&
        matchesBusinessSignature(message, profile, actor.email)
      ) {
        const paragraph = message.paragraphs.at(-1)!;
        return {
          uid: profile.uid,
          email: profile.email.toLowerCase(),
          version: profile.version,
          recordedAt: profile.updatedAt,
          source: profile.profile.source,
          text: paragraph.map((run) => run.text).join(""),
          contentHash: sequenceHash(paragraph),
        };
      }
      // An unchanged saved paragraph keeps its original version even if the current profile is
      // edited or unavailable. New authored text never inherits an old profile claim.
      return prior &&
        previous &&
        sequenceHash(message.paragraphs.at(-1)) ===
          sequenceHash(previous.paragraphs.at(-1))
        ? prior
        : null;
    };
    const signatureSnapshots = {
      initial: signature(parsed.initial, old?.initial, old?.signatureSnapshots?.initial),
      followUp: signature(
        parsed.followUp,
        old?.followUp,
        old?.signatureSnapshots?.followUp,
      ),
    };
    const nowMs = this.now();
    const operationHash = sequenceHash({
      action: "save",
      actor: actor.uid,
      parsed,
      expectedVersion,
    });
    return this.deps.store.write({
      id: parsed.id,
      actorUid: actor.uid,
      expectedVersion,
      operationId,
      operationHash,
      nowMs,
      action: "draft_saved",
      apply: (current) => {
        if (current && ["completed", "cancelled"].includes(current.state))
          throw new EditableLayerError(
            "Keep this history and start a new communication.",
            409,
          );
        // S273 R-S273-5: a save over unsent authorized work ends that attempt (scheduled or held,
        // then updated); it stays listed, read only, beside the authorization.
        const ended = unsentAttemptOnSave(current, nowMs);
        return {
          ...parsed,
          workflowLabel: current?.workflowLabel ?? admission!.label,
          schemaVersion: "workflow-communication-sequence/v1",
          version: expectedVersion + 1,
          responsibleUid: current?.responsibleUid ?? actor.uid,
          senderEmail: current?.senderEmail ?? actor.email.toLowerCase(),
          state: current?.unresolvedOccurrenceId
            ? "needs_reconciliation"
            : current?.authorization
              ? "paused"
              : "draft",
          createdAtMs: current?.createdAtMs ?? nowMs,
          createdByUid: current?.createdByUid ?? actor.uid,
          updatedAtMs: nowMs,
          authorization: current?.authorization ?? null,
          signatureSnapshots,
          nextDueAtMs: null,
          confirmedCount: current?.confirmedCount ?? 0,
          lastSentAtMs: current?.lastSentAtMs ?? null,
          pause: current?.authorization
            ? { cause: "edited", byUid: actor.uid, atMs: nowMs, evidenceIds: [] }
            : null,
          unresolvedOccurrenceId: current?.unresolvedOccurrenceId ?? null,
          linkedThreads: current?.linkedThreads ?? [
            ...admittedLinks,
            ...(parsed.context.replyTo
              ? [
                  {
                    senderEmail: parsed.context.replyTo.senderEmail,
                    threadId: parsed.context.replyTo.threadId,
                  },
                ]
              : []),
          ],
          threads: current?.threads ?? [],
          observedMessageIds: current?.observedMessageIds ?? [],
          observation: current?.observation ?? null,
          ...(ended
            ? { unsentHistory: appendUnsentHistory(current?.unsentHistory, ended) }
            : current?.unsentHistory
              ? { unsentHistory: current.unsentHistory }
              : {}),
          lastOperation: { id: operationId, hash: operationHash },
        };
      },
    });
  }
  async authorize(
    actor: AuthenticatedUser,
    input: {
      id: string;
      expectedVersion: number;
      operationId: string;
      action: "send" | "schedule" | "resume";
      schedule: CommunicationSchedule | null;
      reviewedDraftHash: string;
      reviewedTargetHash: string;
      /**
       * S274 R-S274-5: the labelled inputs the review displayed, as the composition returned them.
       * Used only to name what changed; the refusal itself is decided by the target hash.
       */
      reviewedInputs?: readonly ReviewedInput[] | null;
    },
  ) {
    assertCommunicationStaff(actor, "sendEmail");
    this.deps.assertEffectEnvironment();
    let s = requireSequence(await this.deps.store.get(input.id));
    assertWorkflowAccess(actor, s.context);
    if (s.responsibleUid !== actor.uid || s.senderEmail !== actor.email.toLowerCase())
      throw new EditableLayerError(
        "Only the responsible managed sender can authorize this message. Transfer first if needed.",
        403,
      );
    if (s.unresolvedOccurrenceId)
      throw new EditableLayerError(
        "Reconcile the admitted send before authorizing more work.",
        409,
      );
    if (["completed", "cancelled"].includes(s.state))
      throw new EditableLayerError(
        "Start a new communication; historical work cannot be replayed.",
        409,
      );
    const currentDraftHash = sequenceHash({ initial: s.initial, followUp: s.followUp });
    if (currentDraftHash !== input.reviewedDraftHash)
      throw new EditableLayerError(
        "The message changed after it was shown. Review its current content.",
        409,
      );
    await this.deps.assertRuntimeAction(communicationSendKey(s.context));
    await this.deps.assertRuntimeAction("gmail.mailbox.read");
    const client = this.client(actor.email);
    const profile = await client.getProfile();
    if (profile.emailAddress.toLowerCase() !== actor.email.toLowerCase())
      throw new EditableLayerError(
        "The mailbox does not match the responsible sender.",
        403,
      );
    // S274 R-S274-1/R-S274-2: compare only on a settled read. A read in flight is joined and read
    // again within the bound; R-S274-3: past the bound the result is the retryable "still
    // reading" one, with nothing written, dispatched or paused.
    const resolution = await this.resolveSettledTarget(actor, s.context);
    if (resolution.state === "not_settled")
      throw new LeaseReadNotSettledError(resolution.reason);
    const target = resolution.target;
    // R-S274-5: a settled difference names each changed input the review displayed.
    if (reviewedCommunicationTargetHash(target) !== input.reviewedTargetHash)
      throw new CommunicationTargetChangedError(
        changedReviewedInputs(
          input.reviewedInputs ?? null,
          target.reviewedInputs ?? null,
        ),
      );
    if (input.action === "resume" && (!s.authorization || s.state !== "paused"))
      throw new EditableLayerError(
        "Only a paused approved communication can resume.",
        409,
      );
    let schedule = input.schedule
      ? CommunicationScheduleSchema.parse(input.schedule)
      : null;
    if (input.action === "schedule" && !schedule)
      throw new EditableLayerError(
        "Choose the first local date, time and timezone.",
        400,
      );
    const immediateTenantOffer = input.action === "send" && schedule !== null;
    if (
      immediateTenantOffer &&
      schedule &&
      (s.context.purpose !== "renewal_tenant" ||
        s.context.replyTo ||
        !target.noticeCycleId ||
        s.confirmedCount !== 0 ||
        s.authorization ||
        s.state !== "draft" ||
        schedule.everyDays === null ||
        (!schedule.endDate && (schedule.sendLimit ?? 0) < 2))
    )
      throw new EditableLayerError(
        "Send now with follow-ups requires a new tenant offer for the exact current cycle and a bounded recurrence.",
        409,
      );
    if (input.action === "resume") schedule = s.authorization!.schedule;
    const authorizesFollowUp =
      schedule?.everyDays !== null && schedule?.everyDays !== undefined;
    if (
      authorizesFollowUp &&
      !RichCommunicationMessageSchema.safeParse(s.followUp).success
    )
      throw new EditableLayerError(
        "A repeating schedule needs a complete follow-up message.",
        400,
      );
    if (
      s.context.replyTo &&
      (!target.reply ||
        s.initial.subject !== target.reply.subject ||
        (authorizesFollowUp && s.followUp?.subject !== target.reply.subject))
    )
      throw new EditableLayerError(
        "A linked reply keeps the original subject. Review the exact thread or start a new communication for a different subject.",
        409,
      );
    if (target.blockers?.length)
      throw new EditableLayerError(target.blockers.join(" "), 409);
    if (!target.to.length || !target.sourceRefs.length)
      throw new EditableLayerError(
        "Verified workflow recipients are required before Send/Schedule.",
        409,
      );
    if (input.action === "resume") {
      s = await this.observe(s);
      if (s.observation?.state !== "current")
        throw new EditableLayerError(
          "Current linked incoming evidence is unavailable. Resume waits for that read.",
          409,
        );
    }
    if (this.deps.syncMailbox) await this.deps.syncMailbox(actor);
    const linkedThreads = this.deps.readLinkedThreads
      ? await this.deps.readLinkedThreads(actor, s.context)
      : s.linkedThreads;
    const [initial, followUp] = await Promise.all([
      this.snapshot(s.initial, s.context, s.signatureSnapshots?.initial, actor.email),
      authorizesFollowUp && s.followUp
        ? this.snapshot(
            s.followUp,
            s.context,
            s.signatureSnapshots?.followUp,
            actor.email,
          )
        : null,
    ]);
    if (target.outgoingContract) {
      const gaps = [initial, ...(followUp ? [followUp] : [])].flatMap((message) =>
        outgoingPayloadReasons(message.subject, message.plainText),
      );
      if (!target.signatureSetup) gaps.unshift(SIGNATURE_SETUP_REQUIRED);
      if (gaps.length) throw new EditableLayerError([...new Set(gaps)].join(" "), 409);
    }
    const resourceBasis = tenantResourceAuthorizationBasis(target, initial, followUp);
    const nowMs = this.now();
    if (
      schedule?.sendLimit !== null &&
      schedule?.sendLimit !== undefined &&
      s.confirmedCount >= schedule.sendLimit
    )
      throw new EditableLayerError("The approved send limit is already reached.", 409);
    if (schedule?.endDate && localDateAt(nowMs, schedule.timeZone) > schedule.endDate)
      throw new EditableLayerError("The schedule's inclusive end date has passed.", 409);
    if (immediateTenantOffer && schedule) {
      const followUp = nextOccurrence(schedule, nowMs, 1);
      if (
        followUp === null ||
        localDateAt(followUp, schedule.timeZone) !== schedule.firstDate
      )
        throw new EditableLayerError(
          "The reviewed plan does not allow a follow-up on the shown date. Review its timing again.",
          409,
        );
    }
    const nextDueAtMs =
      input.action === "resume"
        ? Math.max(nowMs, s.nextDueAtMs ?? nowMs)
        : input.action === "schedule" && schedule
          ? firstOccurrence(schedule, nowMs).instantMs
          : nowMs;
    const a = {
      deliveryPolicyVersion: RENEWAL_DELIVERY_POLICY_VERSION,
      ...(target.signatureSetup ? { signatureSetup: target.signatureSetup } : {}),
      revision: (s.authorization?.revision ?? 0) + 1,
      approvedByUid: actor.uid,
      senderEmail: actor.email.toLowerCase(),
      approvedAtMs: nowMs,
      materialSourceHash: target.materialSourceHash,
      to: target.to,
      cc: target.cc,
      sourceRefs: target.sourceRefs,
      initial,
      followUp,
      schedule,
      ...(immediateTenantOffer ||
      (input.action === "resume" && s.authorization?.immediateTenantOffer)
        ? { immediateTenantOffer: true as const }
        : {}),
      ...(target.reply ? { reply: target.reply } : {}),
      ...(resourceBasis ? { resourceBasis } : {}),
      // S264 R-S264-6: the exact offer snapshot the reviewed tenant message states.
      ...(target.offerSnapshot ? { offerSnapshot: target.offerSnapshot } : {}),
    };
    const authorization: CommunicationAuthorization = {
      ...a,
      payloadHash: sequenceHash(a),
    };
    const operationHash = sequenceHash({ actor: actor.uid, input });
    return this.deps.store.write({
      id: s.id,
      actorUid: actor.uid,
      operationId: input.operationId,
      operationHash,
      expectedVersion: input.expectedVersion,
      nowMs,
      action: input.action === "send" ? "send_authorized" : "schedule_authorized",
      dispositionRevision: target.dispositionRevision,
      initialTenantAuthorization:
        input.action !== "resume" &&
        s.confirmedCount === 0 &&
        s.context.purpose === "renewal_tenant" &&
        !s.context.replyTo,
      apply: (current) => {
        const c = requireSequence(current);
        if (
          c.unresolvedOccurrenceId ||
          c.responsibleUid !== actor.uid ||
          sequenceHash({ initial: c.initial, followUp: c.followUp }) !==
            input.reviewedDraftHash
        )
          throw new EditableLayerError(
            "This communication changed; review the current version.",
            409,
          );
        // S273 R-S273-5: a Resume ends the held attempt (held, then resumed), read only.
        const resumed =
          input.action === "resume" ? unsentAttemptOnResume(c, nowMs) : null;
        return {
          ...c,
          ...(resumed
            ? { unsentHistory: appendUnsentHistory(c.unsentHistory, resumed) }
            : {}),
          version: input.expectedVersion + 1,
          state: "active",
          workflowLabel: target.label,
          authorization,
          ...(target.noticeCycleId !== undefined
            ? { noticeCycleId: target.noticeCycleId }
            : {}),
          authorizationOperation: {
            id: input.operationId,
            revision: authorization.revision,
          },
          // S274 R-S274-6: the inputs this review displayed, kept beside the authorization (its
          // payload and replay binding are unchanged) so a later hold names each changed one.
          ...(target.reviewedInputs
            ? {
                authorizedInputs: {
                  revision: authorization.revision,
                  inputs: target.reviewedInputs,
                },
              }
            : {}),
          linkedThreads: [
            ...new Map(
              [...c.linkedThreads, ...linkedThreads].map((t) => [
                `${t.senderEmail}:${t.threadId}`,
                t,
              ]),
            ).values(),
          ],
          nextDueAtMs,
          pause: null,
          updatedAtMs: nowMs,
          lastOperation: { id: input.operationId, hash: operationHash },
        };
      },
    });
  }
  async control(
    actor: AuthenticatedUser,
    i: {
      id: string;
      expectedVersion: number;
      operationId: string;
      action: "pause" | "cancel" | "transfer";
      responsibleUid?: string;
    },
  ) {
    assertCommunicationStaff(actor, "edit");
    const s = requireSequence(await this.deps.store.get(i.id));
    assertWorkflowAccess(actor, s.context);
    const target =
      i.action === "transfer" && i.responsibleUid
        ? await this.deps.readActor(i.responsibleUid)
        : null;
    if (i.action === "transfer" && !target)
      throw new EditableLayerError("Choose a real managed staff sender.", 400);
    if (target) assertCommunicationStaff(target, "sendEmail");
    const nowMs = this.now(),
      operationHash = sequenceHash({ actor: actor.uid, i });
    return this.deps.store.write({
      id: i.id,
      actorUid: actor.uid,
      expectedVersion: i.expectedVersion,
      operationId: i.operationId,
      operationHash,
      nowMs,
      action: i.action,
      apply: (current) => {
        const c = requireSequence(current);
        if (["completed", "cancelled"].includes(c.state))
          throw new EditableLayerError(
            "This communication is already finished. Its history remains available.",
            409,
          );
        return {
          ...c,
          version: i.expectedVersion + 1,
          state:
            i.action === "cancel"
              ? "cancelled"
              : c.unresolvedOccurrenceId
                ? "needs_reconciliation"
                : "paused",
          nextDueAtMs: null,
          responsibleUid: target?.uid ?? c.responsibleUid,
          senderEmail: target?.email.toLowerCase() ?? c.senderEmail,
          pause: {
            cause: i.action === "transfer" ? "transfer" : "staff",
            byUid: actor.uid,
            atMs: nowMs,
            evidenceIds: [],
          },
          updatedAtMs: nowMs,
          lastOperation: { id: i.operationId, hash: operationHash },
        };
      },
    });
  }
  async observeAuthorized(id: string) {
    const s = requireSequence(await this.deps.store.get(id));
    const actor = await this.deps.readActor(s.responsibleUid);
    assertCommunicationStaff(actor, "read");
    assertWorkflowAccess(actor, s.context);
    const observed = await this.observe(s);
    if (observed.authorization && observed.observation?.state !== "current")
      throw new EditableLayerError(
        "The linked observation is incomplete; the mailbox cursor remains held.",
        409,
      );
    return observed;
  }
  /** Poll only the exact linked threads, including their original mailbox across a team handoff. */
  async observe(s: CommunicationSequence): Promise<CommunicationSequence> {
    if (!s.authorization) return s;
    await this.deps.assertRuntimeAction("gmail.mailbox.read");
    const linked =
      s.authorization.immediateTenantOffer && s.confirmedCount > 0
        ? s.threads
        : [...s.linkedThreads, ...s.threads];
    const unique = new Map(linked.map((t) => [`${t.senderEmail}:${t.threadId}`, t]));
    const senders = new Set(s.threads.map((t) => t.senderEmail.toLowerCase()));
    senders.add(s.senderEmail.toLowerCase());
    const ids: string[] = [];
    const messages: CommunicationInboundEvidence[] = [];
    let cause: "reply" | "bounce" | "unexpected_sender" | null = null;
    let complete = true;
    // S233 R-S233-4: a read failure outranks an over-bound thread when both occur.
    let reason: "read_failed" | "thread_too_large" | null = null;
    const fail = (why: "read_failed" | "thread_too_large") => {
      complete = false;
      if (reason !== "read_failed") reason = why;
    };
    const mailboxHistoryIds: Record<string, string> = {};
    try {
      for (const t of unique.values()) {
        const thread = await this.client(t.senderEmail).getThread(t.threadId);
        if (thread.id !== t.threadId) fail("read_failed");
        if (thread.truncated) fail("thread_too_large");
        const mailboxKey = gmailMailboxKey(t.senderEmail);
        if (
          thread.historyId &&
          /^\d+$/.test(thread.historyId) &&
          (!mailboxHistoryIds[mailboxKey] ||
            BigInt(thread.historyId) > BigInt(mailboxHistoryIds[mailboxKey]))
        )
          mailboxHistoryIds[mailboxKey] = thread.historyId;
        for (const m of thread.messages) {
          if (m.bodyTruncated) fail("thread_too_large");
          if (senders.has(emailFrom(m.from) ?? "") || m.labelIds.includes("SENT"))
            continue;
          const receivedAtMs = Number(m.internalDate);
          if (!Number.isFinite(receivedAtMs) || receivedAtMs <= 0) {
            fail("read_failed");
            continue;
          }
          if (
            receivedAtMs <
              (s.authorization.immediateTenantOffer
                ? (s.threads[0]?.sentAtMs ?? s.authorization.approvedAtMs)
                : s.authorization.approvedAtMs) ||
            s.observedMessageIds.includes(`${mailboxKey}:${m.id}`) ||
            s.observedMessageIds.includes(m.id)
          )
            continue;
          ids.push(`${mailboxKey}:${m.id}`);
          const classification = classifyIncomingMessage(m, [
            ...s.authorization.to,
            ...s.authorization.cc,
          ]);
          // S233 R-S233-1/R-S233-2: evidence only; a report names its attempt when one is clear.
          messages.push({
            id: `${mailboxKey}:${m.id}`,
            senderEmail: t.senderEmail,
            threadId: t.threadId,
            messageId: m.id,
            kind: classification,
            receivedAtMs,
            ...(classification === "bounce"
              ? {
                  attemptOccurrenceId: correlateBounceAttempt(
                    m,
                    s.threads.filter(
                      (attempt) =>
                        attempt.senderEmail.toLowerCase() === t.senderEmail.toLowerCase(),
                    ),
                  ),
                }
              : {}),
          });
          if (classification === "bounce") cause = "bounce";
          else if (classification === "human" && cause !== "bounce") cause = "reply";
          else if (classification === "uncertain" && !cause) cause = "unexpected_sender";
        }
      }
    } catch {
      fail("read_failed");
    }
    return this.deps.store.observe(s.id, {
      authorizationRevision: s.authorization.revision,
      checkedAtMs: this.now(),
      messageIds: ids,
      messages,
      pause: cause,
      historyId:
        Object.keys(mailboxHistoryIds).length === 1
          ? Object.values(mailboxHistoryIds)[0]
          : null,
      mailboxHistoryIds,
      complete,
      ...(reason ? { reason } : {}),
    });
  }

  /**
   * S233 R-S233-4: record that this run could not check the sequence's incoming mail because the
   * staff mailbox sync failed. Its scheduled sends stay held until a check reads cleanly.
   */
  async markNotChecked(s: CommunicationSequence): Promise<CommunicationSequence> {
    if (!s.authorization) return s;
    return this.deps.store.observe(s.id, {
      authorizationRevision: s.authorization.revision,
      checkedAtMs: this.now(),
      messageIds: [],
      pause: null,
      historyId: null,
      complete: false,
      reason: "mailbox_sync_failed",
    });
  }

  /**
   * S275 R-S275-1: the lease record's verdict on one watched message. When its watch ends the
   * reason is recorded and the message leaves the watched page; otherwise nothing is written.
   */
  async settleReplyWatch(
    s: CommunicationSequence,
  ): Promise<{ ended: ReplyWatchEndReason | null; sequence: CommunicationSequence }> {
    const store = this.deps.store;
    if (!this.deps.replyWatchEndReason || !store.endReplyWatch)
      return { ended: null, sequence: s };
    const nowMs = this.now();
    const reason = await this.deps.replyWatchEndReason(s, nowMs);
    if (!reason) return { ended: null, sequence: s };
    return {
      ended: reason,
      sequence: await store.endReplyWatch(s.id, { reason, atMs: nowMs }),
    };
  }

  /**
   * S275 R-S275-2: the manual Gmail check (and any caller that names a staff mailbox) observes
   * every watched or open message of that mailbox directly, independent of the mailbox history
   * cursor, so a reply the cursor has passed is still found. Each message stands alone: one whose
   * thread read is incomplete is recorded as not checked this run and never fails the others.
   */
  async observeMailbox(
    actor: AuthenticatedUser,
    options: { readonly skip?: ReadonlySet<string>; readonly limit?: number } = {},
  ): Promise<{ observed: number; notChecked: number; ended: number }> {
    assertCommunicationStaff(actor, "read");
    const counts = { observed: 0, notChecked: 0, ended: 0 };
    if (!this.deps.store.listReplyCheckable) return counts;
    const mailbox = actor.email.toLowerCase();
    const candidates = (
      await this.deps.store.listReplyCheckable(options.limit ?? 100)
    ).filter(
      (s) =>
        replyCheckable(s) &&
        hasSpaceAccess(actor, s.context.lane) &&
        (s.senderEmail.toLowerCase() === mailbox ||
          s.threads.some((t) => t.senderEmail.toLowerCase() === mailbox)),
    );
    for (const original of candidates) {
      if (options.skip?.has(original.id)) continue;
      try {
        let s = original;
        if (s.state === "completed") {
          const settled = await this.settleReplyWatch(s);
          if (settled.ended) {
            counts.ended += 1;
            continue;
          }
          s = settled.sequence;
        }
        const observed = await this.observe(s);
        if (observed.observation?.state === "current") counts.observed += 1;
        else counts.notChecked += 1;
      } catch {
        counts.notChecked += 1;
        // Not checked this run: the record says so, and the other messages carry on.
        await this.markNotChecked(original).catch(() => undefined);
      }
    }
    return counts;
  }
  async dispatch(id: string): Promise<{
    status:
      | "sent"
      | "not_due"
      | "paused"
      | "awaiting_source"
      | "needs_reconciliation"
      | "refused";
    sequence: CommunicationSequence;
    /**
     * S274 R-S274-4/R-S274-7: with `awaiting_source`, the wait was on a lease read still settling
     * (no claim, no send, no pause); the worker counts it apart from held work.
     */
    waitedOnLeaseRead?: true;
  }> {
    let s = requireSequence(await this.deps.store.get(id));
    if (s.unresolvedOccurrenceId) return { status: "needs_reconciliation", sequence: s };
    if (
      s.state !== "active" ||
      !s.authorization ||
      s.nextDueAtMs === null ||
      s.nextDueAtMs > this.now()
    )
      return { status: "not_due", sequence: s };
    if (!hasCurrentRenewalAuthorization(s)) return { status: "refused", sequence: s };
    // Never bind prepared content/mailbox/threading to a replacement authorization or later count.
    // The transaction compares this original basis, even if observation returns a newer record.
    const prepared = {
      materialSourceHash: s.authorization.materialSourceHash,
      authorizationRevision: s.authorization.revision,
      payloadHash: s.authorization.payloadHash,
      senderEmail: s.senderEmail,
      confirmedCount: s.confirmedCount,
    };
    let actor: AuthenticatedUser;
    try {
      actor = await this.deps.readActor(s.responsibleUid);
      assertCommunicationStaff(actor, "sendEmail");
      assertWorkflowAccess(actor, s.context);
      if (
        actor.email.toLowerCase() !== s.senderEmail ||
        s.authorization.approvedByUid !== actor.uid
      )
        throw new EditableLayerError(
          "The approved managed sender is no longer available.",
          409,
        );
      this.deps.assertEffectEnvironment();
      await this.deps.assertRuntimeAction(communicationSendKey(s.context));
      await this.deps.assertRuntimeAction("gmail.mailbox.read");
    } catch {
      try {
        s = await this.deps.store.write({
          id: s.id,
          actorUid: "communication-worker",
          expectedVersion: s.version,
          operationId: randomUUID(),
          operationHash: sequenceHash([s.id, s.version, "current_authority_unavailable"]),
          nowMs: this.now(),
          action: "current_authority_unavailable",
          apply: (current) => ({
            ...requireSequence(current),
            version: s.version + 1,
            state: "paused",
            nextDueAtMs: null,
            pause: {
              cause: "authorization_unavailable",
              byUid: "communication-worker",
              atMs: this.now(),
              evidenceIds: [],
            },
          }),
        });
      } catch (error) {
        if (!(error instanceof EditableLayerError) || error.status !== 409) throw error;
        s = requireSequence(await this.deps.store.get(id));
      }
      return { status: "paused", sequence: s };
    }
    // S276 R-S276-3 / R-S276-4 (ARCH-S276-2): the tenant's recorded response is checked before any
    // claim, ahead of the lease read, so a reminder that became due after any recorded response (a
    // decline included) is paused under the response's own cause and never sent, even when the
    // pause at save time was not written. The claim transaction applies the same check.
    if (this.deps.readTenantResponse && tenantReminderScope(s)) {
      let response: RecordedTenantResponse | null = null;
      try {
        response = await this.deps.readTenantResponse(s);
      } catch {
        response = null; // The claim transaction reads the same stored record.
      }
      if (response && tenantResponseHolds(s, response)) {
        const recorded = response;
        try {
          s = await this.deps.store.write({
            id: s.id,
            actorUid: "communication-worker",
            expectedVersion: s.version,
            operationId: randomUUID(),
            operationHash: sequenceHash([
              s.id,
              s.version,
              TENANT_RESPONSE_PAUSE_CAUSE,
              recorded.eventId,
            ]),
            nowMs: this.now(),
            action: TENANT_RESPONSE_PAUSE_CAUSE,
            apply: (current) => ({
              ...requireSequence(current),
              version: s.version + 1,
              state: "paused",
              nextDueAtMs: null,
              pause: tenantResponsePause(recorded, recorded.actorUid, this.now()),
              updatedAtMs: this.now(),
            }),
          });
        } catch (error) {
          if (!(error instanceof EditableLayerError) || error.status !== 409) throw error;
          s = requireSequence(await this.deps.store.get(id));
        }
        return { status: "paused", sequence: s };
      }
    }
    // S274 R-S274-4 (ARCH-S274-2): dispatch tells "not settled" from "changed" before any claim.
    // One read, no wait: a read in flight, a generation not ready or a retirement status that is
    // unavailable only because the read is not fresh is handled like an unreadable source (no
    // claim, no send, no pause) and re-checked on the next run, with its own reason.
    let resolution: SettledCommunicationTarget;
    try {
      resolution = await this.resolveSettledTarget(actor, s.context, []);
    } catch {
      await this.deps.store.observe(s.id, {
        authorizationRevision: s.authorization.revision,
        checkedAtMs: this.now(),
        messageIds: [],
        pause: null,
        historyId: null,
        complete: false,
        reason: "source_unavailable",
      });
      return {
        status: "awaiting_source",
        sequence: requireSequence(await this.deps.store.get(id)),
      };
    }
    if (resolution.state === "not_settled") {
      await this.deps.store.observe(s.id, {
        authorizationRevision: s.authorization.revision,
        checkedAtMs: this.now(),
        messageIds: [],
        pause: null,
        historyId: null,
        complete: false,
        reason: "lease_read_settling",
      });
      return {
        status: "awaiting_source",
        sequence: requireSequence(await this.deps.store.get(id)),
        waitedOnLeaseRead: true,
      };
    }
    const target: VerifiedCommunicationTarget = resolution.target;
    const authorization = s.authorization;
    const materialSourceHash =
      target.outgoingContract && !authorization.signatureSetup
        ? target.legacyMaterialSourceHash
        : target.materialSourceHash;
    const hasRepeat =
      authorization.schedule?.everyDays !== undefined &&
      authorization.schedule.everyDays !== null;
    const messages = [
      authorization.initial,
      ...(hasRepeat && authorization.followUp ? [authorization.followUp] : []),
    ];
    const signatureBound = authorization.signatureSetup
      ? authorization.signatureSetup.uid === authorization.approvedByUid &&
        authorization.signatureSetup.email === authorization.senderEmail
      : messages.every(
          (message) =>
            message.signature?.uid === authorization.approvedByUid &&
            message.signature.email === authorization.senderEmail &&
            message.signature.version > 0,
        );
    const readinessHeld =
      target.outgoingContract &&
      (!signatureBound ||
        target.blockers?.some((reason) => reason !== SIGNATURE_SETUP_REQUIRED) ||
        messages.some(
          (message) =>
            outgoingPayloadReasons(message.subject, message.plainText).length > 0,
        ));
    if (materialSourceHash !== authorization.materialSourceHash || readinessHeld) {
      // S274 R-S274-6: the hold on a settled difference stores each changed input, with the value
      // kept with this authorization where one was kept; without kept values none is guessed.
      const kept = keptAuthorizedInputs(s);
      const changedInputs: ChangedInput[] = kept
        ? changedReviewedInputs(kept, target.reviewedInputs ?? null)
        : [];
      s = await this.deps.store.write({
        id: s.id,
        actorUid: actor.uid,
        expectedVersion: s.version,
        operationId: randomUUID(),
        operationHash: sequenceHash(["source_changed", target.materialSourceHash]),
        nowMs: this.now(),
        action: "material_source_changed",
        apply: (current) => ({
          ...requireSequence(current),
          version: s.version + 1,
          state: "paused",
          pause: {
            cause: "changed_source",
            byUid: "communication-worker",
            atMs: this.now(),
            evidenceIds: target.sourceRefs,
            ...(changedInputs.length ? { changedInputs } : {}),
          },
          nextDueAtMs: null,
        }),
      });
      return { status: "paused", sequence: s };
    }
    // S265 (R-S265-4): the tenant resources the occurrence about to be claimed includes, against
    // this fresh read, today's date and its actual recipients. An unsent occurrence whose proof
    // changed, was revoked, expired or no longer covers its recipients pauses for review; a
    // resource it omits is never read. The claim transaction rereads the same evidence.
    if (target.tenantResources) {
      const verdict = tenantResourceEffectVerdict({
        basis: authorizedOccurrenceBasis(authorization.resourceBasis, s.confirmedCount),
        content:
          (s.confirmedCount === 0 ? authorization.initial : authorization.followUp) ??
          authorization.initial,
        uses: target.tenantResources,
        recipients: [...authorization.to, ...authorization.cc],
        effect: "send",
      });
      if (!verdict.ok && verdict.kind === "unavailable") {
        await this.deps.store.observe(s.id, {
          authorizationRevision: authorization.revision,
          checkedAtMs: this.now(),
          messageIds: [],
          pause: null,
          historyId: null,
          complete: false,
          reason: "source_unavailable",
        });
        return {
          status: "awaiting_source",
          sequence: requireSequence(await this.deps.store.get(id)),
        };
      }
      if (!verdict.ok) {
        const evidenceIds = [`renewal-resource:${verdict.resourceId}`];
        s = await this.deps.store.write({
          id: s.id,
          actorUid: actor.uid,
          expectedVersion: s.version,
          operationId: randomUUID(),
          operationHash: sequenceHash(["resource_changed", s.version, evidenceIds]),
          nowMs: this.now(),
          action: "tenant_resource_changed",
          apply: (current) => ({
            ...requireSequence(current),
            version: s.version + 1,
            state: "paused",
            pause: {
              cause: "resource_changed",
              byUid: "communication-worker",
              atMs: this.now(),
              evidenceIds,
            },
            nextDueAtMs: null,
          }),
        });
        return { status: "paused", sequence: s };
      }
    }
    s = await this.observe(s);
    if (s.state !== "active") return { status: "paused", sequence: s };
    if (s.observation?.state !== "current")
      return { status: "awaiting_source", sequence: s };
    const a = s.authorization!;
    const hashable = Object.fromEntries(
      Object.entries(a).filter(([key]) => key !== "payloadHash"),
    );
    if (sequenceHash(hashable) !== a.payloadHash)
      throw new EditableLayerError(
        "The approved communication snapshot needs reconciliation.",
        409,
      );
    const selected = s.confirmedCount === 0 ? a.initial : a.followUp;
    if (!selected)
      throw new EditableLayerError("No approved follow-up content exists.", 409);
    const attachments = await Promise.all(
      selected.attachments.map(async (expected) => {
        const actual = await this.deps.resolveAttachment(expected.id, s.context);
        if (sequenceHash(actual.identity) !== sequenceHash(expected))
          throw new EditableLayerError(
            "An approved attachment changed or is unavailable.",
            409,
          );
        return actual;
      }),
    );
    const client = this.client(a.senderEmail);
    await this.deps.assertRuntimeAction("gmail.mailbox.read");
    if ((await client.getProfile()).emailAddress.toLowerCase() !== a.senderEmail)
      throw new EditableLayerError("The approved mailbox is unavailable.", 409);
    // Prepare threading before claim; recipient addresses always stay the reviewed source-bound set.
    const previous = [...s.linkedThreads, ...s.threads]
      .reverse()
      .find((t) => t.senderEmail === a.senderEmail);
    let parent: GmailThreadView["messages"][number] | undefined;
    if (previous) {
      const thread = await client.getThread(previous.threadId);
      if (thread.truncated || thread.messages.some((m) => m.bodyTruncated))
        return { status: "awaiting_source", sequence: s };
      parent = [...thread.messages].reverse().find((m) => m.messageId && m.subject);
    }
    // The final complete incoming read precedes the serializable claim. Gmail has no atomic
    // send-if-no-reply operation; an unseen provider reply can race this read even before claim.
    s = await this.observe(s);
    if (s.state !== "active" || s.observation?.state !== "current")
      return { status: s.state === "active" ? "awaiting_source" : "paused", sequence: s };
    const reply = s.confirmedCount === 0 ? a.reply : null;
    const threaded = !!parent && parent.subject === selected.subject && !!previous;
    const threading = reply
      ? {
          ...(reply.senderEmail === a.senderEmail ? { threadId: reply.threadId } : {}),
          inReplyTo: reply.parentMessageId,
          references: [...new Set([...reply.references, reply.parentMessageId])].slice(
            -20,
          ),
        }
      : {
          ...(threaded
            ? { threadId: previous!.threadId, inReplyTo: parent!.messageId }
            : {}),
          references: threaded
            ? [...new Set([...parent!.references, parent!.messageId])].slice(-20)
            : [],
        };
    const claim = await this.deps.store.claim(
      id,
      this.now(),
      {
        ...prepared,
        materialSourceHash: authorization.materialSourceHash,
        dispositionRevision: target.dispositionRevision,
      },
      threading,
    );
    if (!claim) {
      const after = requireSequence(await this.deps.store.get(id));
      // S276 R-S276-3: the claim itself held a reminder for the tenant's recorded response.
      return {
        status:
          after.state === "paused" && after.pause?.cause === TENANT_RESPONSE_PAUSE_CAUSE
            ? "paused"
            : "not_due",
        sequence: after,
      };
    }
    const o = claim.occurrence;
    const message: WorkflowMimeMessage = {
      from: a.senderEmail,
      to: a.to,
      cc: a.cc,
      bcc: [],
      subject: selected.subject,
      body: selected.plainText,
      htmlBody: selected.htmlBody,
      attachments,
      messageId: o.rfcMessageId,
      ...threading,
      verifyThreading: true,
    };
    let attempted = false;
    try {
      await this.deps.assertRuntimeAction(communicationSendKey(s.context));
      if (!(await this.deps.store.canDispatch(o)))
        return {
          status: "refused",
          sequence: await this.deps.store.settle(o, {
            nowMs: this.now(),
            outcome: "refused",
            reason: "paused_before_dispatch",
          }),
        };
      attempted = true;
      const sent = await client.sendWorkflowMessage(message);
      const readback = await client.findWorkflowMessage(o.rfcMessageId, message);
      if (
        !readback ||
        readback.messageId !== sent.messageId ||
        readback.threadId !== sent.threadId
      )
        throw new Error("Exact send readback is unavailable.");
      const settled = await this.deps.store.settle(o, {
        nowMs: this.now(),
        result: readback,
        sentAtMs: readback.sentAtMs,
      });
      await this.recordAccepted(settled, o, readback.messageId, readback.sentAtMs);
      return { status: "sent", sequence: settled };
    } catch (error) {
      const ambiguous =
        attempted && (!(error instanceof GmailRuntimeError) || error.ambiguous);
      return {
        status: ambiguous ? "needs_reconciliation" : "refused",
        sequence: await this.deps.store.settle(o, {
          nowMs: this.now(),
          outcome: ambiguous ? "ambiguous" : "refused",
          reason: !attempted
            ? "paused_before_dispatch"
            : ambiguous
              ? "provider_unknown"
              : "provider_refusal",
        }),
      };
    }
  }
  async reconcile(actor: AuthenticatedUser, id: string) {
    let s = await this.get(actor, id);
    if (!s.unresolvedOccurrenceId) return s;
    const o = await this.deps.store.getOccurrence(s.unresolvedOccurrenceId);
    if (!o || o.sequenceId !== id || !["claimed", "ambiguous"].includes(o.state))
      throw new EditableLayerError(
        "The admitted send needs operator reconciliation.",
        409,
      );
    await this.deps.assertRuntimeAction("gmail.mailbox.read");
    const a = s.authorization;
    if (!a || a.revision !== o.authorizationRevision || a.payloadHash !== o.payloadHash)
      throw new EditableLayerError(
        "The admitted snapshot needs operator reconciliation.",
        409,
      );
    const m = o.index === 0 ? a.initial : a.followUp;
    if (!m)
      throw new EditableLayerError("The admitted message snapshot is unavailable.", 409);
    const attachments = await Promise.all(
      m.attachments.map(async (expected) => {
        const actual = await this.deps.resolveAttachment(expected.id, s.context);
        if (sequenceHash(actual.identity) !== sequenceHash(expected))
          throw new EditableLayerError("An admitted file needs reconciliation.", 409);
        return actual;
      }),
    );
    const message: WorkflowMimeMessage = {
      from: o.senderEmail,
      to: a.to,
      cc: a.cc,
      bcc: [],
      subject: m.subject,
      body: m.plainText,
      htmlBody: m.htmlBody,
      attachments,
      messageId: o.rfcMessageId,
      ...(o.threading ?? { references: [] }),
      verifyThreading: !!o.threading,
    };
    const result = await this.client(o.senderEmail).findWorkflowMessage(
      o.rfcMessageId,
      message,
    );
    if (!result) return s; // absence is never proof of no effect and cannot authorize redispatch
    s = await this.deps.store.settle(o, {
      nowMs: this.now(),
      result,
      sentAtMs: result.sentAtMs,
    });
    await this.recordAccepted(s, o, result.messageId, result.sentAtMs);
    return this.observe(s);
  }
  /**
   * S248 ARCH-S248-2: the outreach record for a settled, accepted send. Only a message the settled
   * communication holds as sent is recorded; any failure is swallowed, so the next read rebuilds
   * the same fact from the communication's delivery evidence.
   */
  private async recordAccepted(
    sequence: CommunicationSequence,
    occurrence: CommunicationOccurrence,
    gmailMessageId: string,
    sentAtMs: number,
  ): Promise<void> {
    if (!this.deps.recordAcceptedSend) return;
    if (
      !sequence.threads.some((thread) => thread.rfcMessageId === occurrence.rfcMessageId)
    )
      return;
    try {
      await this.deps.recordAcceptedSend(
        sequence,
        { ...occurrence, state: "sent", gmailMessageId, sentAtMs },
        sentAtMs,
      );
    } catch {
      // The record is rebuilt on read from the delivery evidence (ARCH-S248-2).
    }
  }
  private client(mailbox: string) {
    const client = this.deps.createClient(mailbox);
    if (client.subject !== mailbox.toLowerCase())
      throw new EditableLayerError(
        "The Gmail subject does not match the approved mailbox.",
        403,
      );
    return client;
  }
  private async snapshot(
    m: SequenceDraft["initial"],
    context: WorkflowCommunicationContext,
    signature?: StaffBusinessSignatureSnapshot | null,
    senderEmail?: string,
  ): Promise<AuthorizedMessage> {
    if (signature && signature.email !== senderEmail?.toLowerCase())
      throw new EditableLayerError(
        "This draft retains another staff sender's business signature. Use your current business signature and review the new wording before Send or Schedule.",
        409,
      );
    const attachments = await Promise.all(
      m.attachmentIds.map((id) => this.deps.resolveAttachment(id, context)),
    );
    if (
      attachments.reduce((n, a) => n + a.identity.sizeBytes, 0) >
      WORKFLOW_ATTACHMENT_MAX_BYTES
    )
      throw new EditableLayerError("Attachments exceed the combined 5 MiB limit.", 400);
    return {
      subject: m.subject,
      ...renderCommunicationMessage(m),
      attachments: attachments.map((a) => a.identity),
      ...(signature ? { signature } : {}),
    };
  }
}
