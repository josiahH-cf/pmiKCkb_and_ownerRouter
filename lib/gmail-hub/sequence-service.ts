import type { StaffBusinessProfile } from "@/lib/staff/business-profile";
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
  type CommunicationSchedule,
} from "./schedule-calendar";
import {
  SequenceDraftSchema,
  communicationSendKey,
  renderCommunicationMessage,
  type AuthorizedMessage,
  type StaffBusinessSignatureSnapshot,
  type CommunicationAttachment,
  type CommunicationAuthorization,
  type CommunicationSequence,
  type SequenceDraft,
  type VerifiedCommunicationTarget,
} from "./sequence-model";
import { gmailMailboxKey } from "./state-store";
import { sequenceHash, type SequenceStore } from "./sequence-store";
import type { WorkflowCommunicationContext } from "./workflow-context";

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
  ): Promise<VerifiedCommunicationTarget>;
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
  async list(actor: AuthenticatedUser, after: string | null = null) {
    assertCommunicationStaff(actor, "read");
    const page = await this.deps.store.list(after, 50);
    return {
      ...page,
      sequences: page.sequences
        .filter((s) => hasSpaceAccess(actor, s.context.lane))
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
    const target = await this.deps.resolveTarget(actor, s.context);
    if (
      sequenceHash({
        to: target.to,
        cc: target.cc,
        materialSourceHash: target.materialSourceHash,
      }) !== input.reviewedTargetHash
    )
      throw new EditableLayerError(
        "The recipients or source facts changed after the preview. Refresh and review them before Send/Schedule.",
        409,
      );
    if (
      s.context.replyTo &&
      (!target.reply ||
        s.initial.subject !== target.reply.subject ||
        (s.followUp && s.followUp.subject !== target.reply.subject))
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
      if (!s.authorization || s.state !== "paused")
        throw new EditableLayerError(
          "Only a paused approved communication can resume.",
          409,
        );
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
      s.followUp
        ? this.snapshot(
            s.followUp,
            s.context,
            s.signatureSnapshots?.followUp,
            actor.email,
          )
        : null,
    ]);
    const nowMs = this.now();
    let schedule = input.schedule
      ? CommunicationScheduleSchema.parse(input.schedule)
      : null;
    if (input.action === "schedule" && !schedule)
      throw new EditableLayerError(
        "Choose the first local date, time and timezone.",
        400,
      );
    if (input.action === "send" && schedule)
      throw new EditableLayerError("Send now and Schedule are separate actions.", 400);
    if (input.action === "resume") schedule = s.authorization!.schedule;
    if (schedule?.everyDays !== null && schedule?.everyDays !== undefined && !followUp)
      throw new EditableLayerError(
        "A repeating schedule needs reviewed follow-up content.",
        400,
      );
    if (
      schedule?.sendLimit !== null &&
      schedule?.sendLimit !== undefined &&
      s.confirmedCount >= schedule.sendLimit
    )
      throw new EditableLayerError("The approved send limit is already reached.", 409);
    if (schedule?.endDate && localDateAt(nowMs, schedule.timeZone) > schedule.endDate)
      throw new EditableLayerError("The schedule's inclusive end date has passed.", 409);
    const nextDueAtMs =
      input.action === "resume"
        ? Math.max(nowMs, s.nextDueAtMs ?? nowMs)
        : schedule
          ? firstOccurrence(schedule, nowMs).instantMs
          : nowMs;
    const a = {
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
      ...(target.reply ? { reply: target.reply } : {}),
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
        return {
          ...c,
          version: input.expectedVersion + 1,
          state: "active",
          workflowLabel: target.label,
          authorization,
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
    const unique = new Map(
      [...s.linkedThreads, ...s.threads].map((t) => [
        `${t.senderEmail}:${t.threadId}`,
        t,
      ]),
    );
    const senders = new Set(s.threads.map((t) => t.senderEmail.toLowerCase()));
    senders.add(s.senderEmail.toLowerCase());
    const ids: string[] = [];
    let cause: "reply" | "bounce" | "source_unavailable" | null = null;
    let complete = true;
    const mailboxHistoryIds: Record<string, string> = {};
    try {
      for (const t of unique.values()) {
        const thread = await this.client(t.senderEmail).getThread(t.threadId);
        if (thread.truncated || thread.id !== t.threadId) complete = false;
        const mailboxKey = gmailMailboxKey(t.senderEmail);
        if (
          thread.historyId &&
          /^\d+$/.test(thread.historyId) &&
          (!mailboxHistoryIds[mailboxKey] ||
            BigInt(thread.historyId) > BigInt(mailboxHistoryIds[mailboxKey]))
        )
          mailboxHistoryIds[mailboxKey] = thread.historyId;
        for (const m of thread.messages) {
          if (m.bodyTruncated) complete = false;
          if (senders.has(emailFrom(m.from) ?? "") || m.labelIds.includes("SENT"))
            continue;
          const receivedAtMs = Number(m.internalDate);
          if (!Number.isFinite(receivedAtMs) || receivedAtMs <= 0) {
            complete = false;
            continue;
          }
          if (
            receivedAtMs < s.authorization.approvedAtMs ||
            s.observedMessageIds.includes(`${mailboxKey}:${m.id}`) ||
            s.observedMessageIds.includes(m.id)
          )
            continue;
          ids.push(`${mailboxKey}:${m.id}`);
          const classification = classifyIncomingMessage(m, [
            ...s.authorization.to,
            ...s.authorization.cc,
          ]);
          if (classification === "bounce") cause = "bounce";
          else if (classification === "human" && cause !== "bounce") cause = "reply";
          else if (classification === "uncertain" && !cause) cause = "source_unavailable";
        }
      }
    } catch {
      complete = false;
    }
    return this.deps.store.observe(s.id, {
      authorizationRevision: s.authorization.revision,
      checkedAtMs: this.now(),
      messageIds: ids,
      pause: cause,
      historyId:
        Object.keys(mailboxHistoryIds).length === 1
          ? Object.values(mailboxHistoryIds)[0]
          : null,
      mailboxHistoryIds,
      complete,
    });
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
    let target: VerifiedCommunicationTarget;
    try {
      target = await this.deps.resolveTarget(actor, s.context);
    } catch {
      await this.deps.store.observe(s.id, {
        authorizationRevision: s.authorization.revision,
        checkedAtMs: this.now(),
        messageIds: [],
        pause: null,
        historyId: null,
        complete: false,
      });
      return {
        status: "awaiting_source",
        sequence: requireSequence(await this.deps.store.get(id)),
      };
    }
    if (target.materialSourceHash !== s.authorization.materialSourceHash) {
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
          },
          nextDueAtMs: null,
        }),
      });
      return { status: "paused", sequence: s };
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
      { ...prepared, materialSourceHash: target.materialSourceHash },
      threading,
    );
    if (!claim)
      return {
        status: "not_due",
        sequence: requireSequence(await this.deps.store.get(id)),
      };
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
      return {
        status: "sent",
        sequence: await this.deps.store.settle(o, {
          nowMs: this.now(),
          result: readback,
          sentAtMs: readback.sentAtMs,
        }),
      };
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
    return this.observe(s);
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
