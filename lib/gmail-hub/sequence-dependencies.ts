import { outgoingRenewalReasons } from "@/lib/lease-renewal/outgoing-message-readiness";
import { readBusinessProfile } from "@/lib/firestore/presentation-settings";
import { communicationMessageFromRenewalContent } from "@/lib/gmail-hub/renewal-composition";
import { randomUUID } from "node:crypto";
import { bindWorkflowReply } from "./workflow-reply-binding";
import { linkMatchesContext } from "./workflow-context";
import { getAuth } from "firebase-admin/auth";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { validateAuthClaims } from "@/lib/auth/session";
import { getFirebaseAdminApp } from "@/lib/firebase/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import {
  readRehearsalMailTime,
  resolveRehearsalMail,
} from "@/lib/gmail-hub/rehearsal-mail";
import {
  assertGmailEffectEnvironment,
  createGmailHubService,
  createGmailMailboxClient,
  getGmailHubDependencies,
} from "./dependencies";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import { FirestoreCommunicationSequenceStore, sequenceHash } from "./sequence-store";
import {
  outreachRecordForAcceptedSend,
  writeRenewalOutreachRecord,
} from "@/lib/firestore/renewal-outreach-records";
import { CommunicationAttachmentStore } from "./sequence-attachments";
import { renewalNoticeMaterialIdentity } from "./renewal-material-source";
import { renewalReviewedInputs } from "./renewal-reviewed-inputs";
import { LEASE_READ_REREAD_WAITS_MS, LeaseReadNotSettledError } from "./reviewed-inputs";
import { RenewalNoticeSourceError } from "@/lib/lease-renewal/notice-source-error";
import { settleLiveLeaseRefresh } from "@/lib/lease-renewal/live-lease-cache";
import { offerSnapshotIsMaterial } from "@/lib/lease-renewal/offer-snapshot";
import {
  WorkflowCommunicationSequenceService,
  assertCommunicationStaff,
  settleCommunicationTarget,
  type CommunicationSequenceDependencies,
  type ResolveTargetOptions,
  type SettledCommunicationTarget,
} from "./sequence-service";
import { communicationSendKey, type VerifiedCommunicationTarget } from "./sequence-model";
import {
  WorkflowCommunicationContextSchema,
  type WorkflowCommunicationContext,
} from "./workflow-context";

let testDependencies: CommunicationSequenceDependencies | null = null;
export function setCommunicationSequenceDependenciesForTest(
  deps: CommunicationSequenceDependencies | null,
) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Communication test dependencies require NODE_ENV=test.");
  testDependencies = deps;
}
export function createCommunicationSequenceService() {
  if (testDependencies) return new WorkflowCommunicationSequenceService(testDependencies);
  const descriptor = requireEnvironmentDescriptor();
  // S254: null everywhere except the isolated rehearsal (lib/environment/rehearsal-stand-in.ts).
  const standIn = resolveRehearsalMail();
  const attachments = new CommunicationAttachmentStore();
  return new WorkflowCommunicationSequenceService({
    store: new FirestoreCommunicationSequenceStore(),
    now: readRehearsalMailTime,
    resolveTarget: resolveCommunicationTarget,
    // S274 R-S274-1: an unsettled read at confirm joins the lease read in flight before re-reading.
    waitForLeaseRead,
    resolveAttachment: (id, context) => attachments.resolve(id, context),
    readActor: readCurrentCommunicationActor,
    readBusinessProfile: (actor) => readBusinessProfile(actor),
    assertEffectEnvironment: () => assertGmailEffectEnvironment(descriptor, standIn),
    assertRuntimeAction: assertProductionRuntimeActionExecutable,
    syncMailbox: async (actor) => {
      await createGmailHubService(actor).refreshMailbox({ attemptKey: randomUUID() });
    },
    readLinkedThreads: async (actor, context) =>
      (
        await getGmailHubDependencies().store.listCommunicationLinks(
          actor.email.toLowerCase(),
        )
      )
        .filter((l) => l.gmail_thread_id && linkMatchesContext(l, context))
        .map((l) => ({
          senderEmail: actor.email.toLowerCase(),
          threadId: l.gmail_thread_id!,
        })),
    createClient: (mailbox) => createGmailMailboxClient(mailbox, descriptor, standIn),
    // S248 ARCH-S248-2: one outreach record per accepted renewal message, after the send settled.
    recordAcceptedSend: async (sequence, occurrence, sentAtMs) => {
      const record = outreachRecordForAcceptedSend(
        sequence,
        occurrence,
        sentAtMs,
        Date.now(),
      );
      if (record) await writeRenewalOutreachRecord(record);
    },
  });
}
export async function readCurrentCommunicationActor(
  uid: string,
): Promise<AuthenticatedUser> {
  const record = await getAuth(getFirebaseAdminApp()).getUser(uid);
  if (record.disabled || !record.emailVerified || !record.email)
    throw new EditableLayerError(
      "The approved managed sender is no longer available.",
      403,
    );
  return validateAuthClaims({
    ...record.customClaims,
    uid: record.uid,
    email: record.email,
    hd: record.email.toLowerCase().endsWith("@pmikcmetro.com") ? "pmikcmetro.com" : "",
  });
}
/**
 * S274 R-S274-1/R-S274-4: a refused admission of the approval read (`settledRead`) is a read still
 * in progress (floors advanced while it was read, the generation was replaced, it is not yet
 * admitted) unless it is a real outage of the lease or status source, which stays the existing
 * unreadable-source refusal and is never treated as unchanged.
 */
function settledReadFailure(error: unknown): never {
  if (
    error instanceof RenewalNoticeSourceError &&
    error.reason !== "lease_unavailable" &&
    error.reason !== "status_unavailable"
  )
    throw new LeaseReadNotSettledError("read_in_flight");
  throw error;
}
async function renewalTarget(
  actor: AuthenticatedUser,
  c: WorkflowCommunicationContext,
  options: ResolveTargetOptions = {},
) {
  const channel = c.purpose === "renewal_owner" ? "owner" : "tenant";
  const current = options.settle
    ? await currentRenewalMessage(actor, c.entityId, channel, undefined, {
        settledRead: true,
      }).catch(settledReadFailure)
    : await currentRenewalMessage(actor, c.entityId, channel);
  const to = current.recipients.status === "ready" ? [current.recipients.to] : [];
  const cc = current.recipients.status === "ready" ? current.recipients.cc : [];
  const blockers =
    current.recipients.status === "ready" ? [] : [...current.recipients.reasons];
  if (current.noticeBlock) blockers.push(current.noticeBlock);
  const f = current.facts;
  const notice = renewalNoticeMaterialIdentity(current.basis.noticeSafety);
  const leaseBasis = {
    leaseId: c.entityId,
    channel,
    to,
    cc,
    notice,
    ...(current.dispositionRevision
      ? { dispositionRevision: current.dispositionRevision }
      : {}),
  };
  const terms = f.ownerTerms
    ? {
        rent: f.ownerTerms.rent,
        effectiveDate: f.ownerTerms.effectiveDate,
        endDate: f.ownerTerms.endDate,
      }
    : null;
  const charges = f.charges.map(({ id, applicable, amount, cadence, effectiveDate }) => ({
    id,
    applicable,
    amount,
    cadence,
    effectiveDate,
  }));
  // S265 (ARCH-S265-4): the resource members of both material hashes are retired. A link alone
  // never stood for the reviewed resource; the included resources' full evidence is frozen with
  // each authorized message and rechecked at dispatch instead. They stay null so an authorization
  // reviewed before S265 (when every tenant entry read blank or unverified) keeps its hash.
  const legacyMaterialSourceHash = sequenceHash({
    ...leaseBasis,
    address: f.address,
    currentRent: f.currentBaseRent?.value ?? null,
    leaseEnd: f.leaseEndDate,
    terms,
    charges,
    insuranceTransition: f.insuranceTransition?.applicable ?? null,
    informationForm: null,
    insuranceFlyer: null,
    blockers,
  });
  const required = c.replyTo
    ? outgoingRenewalReasons({
        content: current.content,
        signatureConfigured: current.signatureSetup !== null,
        reply: true,
      })
    : current.outgoingReasons;
  // S264 (R-S264-4/6, ARCH-S264-4): a tenant offer whose charges are material binds its exact
  // offer snapshot, including the mapping and source versions, so a charge, mapping or source
  // revision changes the send basis even when every amount matches. An offer with no charge rows,
  // transitions or RentVine charge lines contributes nothing, so its earlier basis is unchanged.
  const offerSnapshot = channel === "tenant" ? current.basis.offerSnapshot : null;
  const offerBasis =
    offerSnapshot && offerSnapshotIsMaterial(offerSnapshot.snapshot)
      ? { offer: offerSnapshot.snapshotHash }
      : {};
  const contentBasis = c.replyTo
    ? null
    : {
        address: f.address,
        publication:
          current.publication.status === "approved"
            ? current.publication.contentHash
            : null,
        ...(channel === "tenant"
          ? {
              leaseEnd: f.leaseEndDate,
              terms,
              charges: charges.filter((charge) => charge.applicable === true),
              insuranceTransition: f.insuranceTransition?.applicable ?? null,
              informationForm: null,
              insuranceFlyer: null,
              rbpFlyer: null,
              ...offerBasis,
            }
          : f.ownerIntent === "renew_or_not"
            ? { ownerIntent: f.ownerIntent }
            : {
                ownerIntent: f.ownerIntent,
                currentRent: f.currentBaseRent?.value ?? null,
                rent: f.suggestedRent?.value ?? null,
                range: f.range ? { low: f.range.low, high: f.range.high } : null,
              }),
      };
  const targetBlockers = [
    ...new Set([
      ...blockers,
      ...required,
      ...(c.replyTo && current.priorSenderWording
        ? ["Review prior sender wording and rebuild or edit the current message."]
        : []),
      ...(!c.replyTo && current.publication.status !== "approved"
        ? [current.publication.reason]
        : []),
    ]),
  ];
  const target: VerifiedCommunicationTarget = {
    context: c,
    to,
    cc,
    label: f.address ?? `Lease ${c.entityId}`,
    sourceRefs: [`rentvine:lease:${c.entityId}`],
    noticeCycleId: current.noticeCycleId ?? null,
    dispositionRevision: current.dispositionRevision,
    outgoingContract: true,
    signatureSetup: current.signatureSetup,
    blockers: targetBlockers,
    materialSourceHash: sequenceHash({ ...leaseBasis, contentBasis, blockers }),
    // S274 ARCH-S274-1: whether this read settled; S274 ARCH-S274-3: what the review displays.
    readSettlement: current.readSettlement,
    reviewedInputs: renewalReviewedInputs({
      channel,
      reply: Boolean(c.replyTo),
      to,
      cc,
      signature: current.inputs.signature,
      signatureSetup: current.signatureSetup,
      facts: f,
      publication:
        current.publication.status === "approved"
          ? {
              name: current.publication.name,
              contentHash: current.publication.contentHash,
            }
          : null,
      offerSnapshotHash: offerBasis.offer ?? null,
      notice,
      dispositionRevision: current.dispositionRevision ?? null,
      blockers: targetBlockers,
    }),
    legacyMaterialSourceHash,
    // S265: the tenant resources as read now, and those the offer's decisions require. Only the
    // resources an exact authorized message includes are frozen and compared.
    ...(channel === "tenant"
      ? {
          tenantResources: current.tenantResources,
          tenantResourceRequired: c.replyTo ? [] : [...current.tenantResourceRequired],
        }
      : {}),
    // S264 R-S264-6: the exact offer snapshot an authorization of this message freezes.
    ...(offerSnapshot && !c.replyTo ? { offerSnapshot } : {}),
  };
  const initial = communicationMessageFromRenewalContent(current.content);
  const signatureParagraph =
    f.signature || !f.signatureConfigured
      ? (communicationMessageFromRenewalContent(current.composedContent).paragraphs.at(
          -1,
        ) ?? null)
      : null;
  return {
    target,
    initial,
    signatureParagraph,
    // S249 ARCH-S249-2: the lease message record's revision this composition was made from.
    messageRevision: current.messageRevision,
    // S249 R-S249-5 (J): the prefilled figure this composed message carries, if any.
    carriedRecommendation: current.carriedRecommendation,
    attachmentNotice: current.attachment
      ? "The saved comparable image is available in the lease workspace. Add the exact file here before authorization."
      : null,
  };
}
export async function prepareWorkflowComposition(
  actor: AuthenticatedUser,
  context: WorkflowCommunicationContext,
  options: ResolveTargetOptions = {},
) {
  assertCommunicationStaff(actor, "read");
  const c = WorkflowCommunicationContextSchema.parse(context);
  if (c.lane === "maintenance")
    throw new EditableLayerError("Custom maintenance is retired.", 410);
  communicationSendKey(c);
  if (!hasSpaceAccess(actor, c.lane))
    throw new EditableLayerError("The linked workflow Space is unavailable.", 403);
  const result = await renewalTarget(actor, c, options);
  if (!c.replyTo) return result;
  const service = createCommunicationSequenceService();
  const original = await service.get(actor, c.replyTo.sequenceId);
  const thread = await service.thread(
    actor,
    original.id,
    c.replyTo.threadId,
    c.replyTo.senderEmail,
  );
  const binding = bindWorkflowReply(c, original.context, thread, result.target);
  return {
    ...result,
    target: {
      ...result.target,
      reply: binding,
      sourceRefs: [...result.target.sourceRefs, `gmail-message:${c.replyTo.parentId}`],
      materialSourceHash: sequenceHash({
        source: result.target.materialSourceHash,
        reply: binding,
      }),
      legacyMaterialSourceHash: sequenceHash({
        source: result.target.legacyMaterialSourceHash,
        reply: binding,
      }),
    },
    initial: {
      subject: binding.subject,
      paragraphs: [[{ text: "" }]],
      attachmentIds: [],
    },
  };
}
export async function resolveCommunicationTarget(
  actor: AuthenticatedUser,
  context: WorkflowCommunicationContext,
  options: ResolveTargetOptions = {},
) {
  return (await prepareWorkflowComposition(actor, context, options)).target;
}

/**
 * S274 R-S274-1: wait before the next read of an unsettled lease read. A lease read in flight in
 * this instance is joined (the wait ends when it lands); otherwise the wait runs its length, so a
 * read another instance started can land first. Starts no read and changes no cache state.
 */
export async function waitForLeaseRead(ms: number): Promise<void> {
  const started = Date.now();
  if (await settleLiveLeaseRefresh(ms)) return;
  const left = ms - (Date.now() - started);
  if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
}

/**
 * S274 ARCH-S274-1, for later suites (S272, S273): the one target resolution confirm uses. It
 * joins a lease read in flight and re-reads within the stated bound (three re-reads over about ten
 * seconds; pass `waitsMs: []` for one read and no wait, as the worker does), and reports a settled
 * target or a typed not-settled result. A real outage still throws.
 */
export async function resolveSettledCommunicationTarget(
  actor: AuthenticatedUser,
  context: WorkflowCommunicationContext,
  options: { waitsMs?: readonly number[] } = {},
): Promise<SettledCommunicationTarget> {
  return settleCommunicationTarget(
    () => resolveCommunicationTarget(actor, context, { settle: true }),
    options.waitsMs ?? LEASE_READ_REREAD_WAITS_MS,
    waitForLeaseRead,
  );
}

export async function prepareWorkflowReplyComposition(
  actor: AuthenticatedUser,
  replyTo: NonNullable<WorkflowCommunicationContext["replyTo"]>,
) {
  const original = await createCommunicationSequenceService().get(
    actor,
    replyTo.sequenceId,
  );
  const context = WorkflowCommunicationContextSchema.parse({
    ...original.context,
    actionKey: "gmail.thread.reply",
    replyTo,
  });
  const result = await prepareWorkflowComposition(actor, context);
  return { ...result, context };
}
