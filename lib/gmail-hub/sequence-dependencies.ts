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
import { resolveRehearsalStandIn } from "@/lib/environment/rehearsal-stand-in";
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
import {
  WorkflowCommunicationSequenceService,
  assertCommunicationStaff,
  type CommunicationSequenceDependencies,
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
  const standIn = resolveRehearsalStandIn();
  const attachments = new CommunicationAttachmentStore();
  return new WorkflowCommunicationSequenceService({
    store: new FirestoreCommunicationSequenceStore(),
    resolveTarget: resolveCommunicationTarget,
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
async function renewalTarget(actor: AuthenticatedUser, c: WorkflowCommunicationContext) {
  const channel = c.purpose === "renewal_owner" ? "owner" : "tenant";
  const current = await currentRenewalMessage(actor, c.entityId, channel);
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
  const legacyMaterialSourceHash = sequenceHash({
    ...leaseBasis,
    address: f.address,
    currentRent: f.currentBaseRent?.value ?? null,
    leaseEnd: f.leaseEndDate,
    terms,
    charges,
    insuranceTransition: f.insuranceTransition?.applicable ?? null,
    informationForm: f.informationForm?.url ?? null,
    insuranceFlyer: f.insuranceFlyer?.url ?? null,
    blockers,
  });
  const required = c.replyTo
    ? outgoingRenewalReasons({
        content: current.content,
        signatureConfigured: current.signatureSetup !== null,
        reply: true,
      })
    : current.outgoingReasons;
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
              informationForm: f.informationForm?.url ?? null,
              insuranceFlyer: f.insuranceTransition?.applicable
                ? (f.insuranceFlyer?.url ?? null)
                : null,
              rbpFlyer: f.charges.some(
                (charge) =>
                  charge.id === "rbp" &&
                  charge.applicable === true &&
                  (charge.comparison === "changed" || charge.comparison === "new"),
              )
                ? (f.rbpFlyer?.url ?? null)
                : null,
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
    blockers: [
      ...new Set([
        ...blockers,
        ...required,
        ...(!c.replyTo && current.publication.status !== "approved"
          ? [current.publication.reason]
          : []),
      ]),
    ],
    materialSourceHash: sequenceHash({ ...leaseBasis, contentBasis, blockers }),
    legacyMaterialSourceHash,
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
) {
  assertCommunicationStaff(actor, "read");
  const c = WorkflowCommunicationContextSchema.parse(context);
  if (c.lane === "maintenance")
    throw new EditableLayerError("Custom maintenance is retired.", 410);
  communicationSendKey(c);
  if (!hasSpaceAccess(actor, c.lane))
    throw new EditableLayerError("The linked workflow Space is unavailable.", 403);
  const result = await renewalTarget(actor, c);
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
) {
  return (await prepareWorkflowComposition(actor, context)).target;
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
