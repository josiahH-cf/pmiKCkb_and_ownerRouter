import { readBusinessProfile } from "@/lib/firestore/presentation-settings";
import { applyBusinessSignature } from "./business-signature";
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
import {
  assertLiveProviderActionAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  createGmailHubService,
  getGmailHubDependencies,
  createDescriptorBoundGmailRuntimeClient,
} from "./dependencies";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import { FirestoreCommunicationSequenceStore, sequenceHash } from "./sequence-store";
import { CommunicationAttachmentStore } from "./sequence-attachments";
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
  const attachments = new CommunicationAttachmentStore();
  return new WorkflowCommunicationSequenceService({
    store: new FirestoreCommunicationSequenceStore(),
    resolveTarget: resolveCommunicationTarget,
    resolveAttachment: (id, context) => attachments.resolve(id, context),
    readActor: readCurrentCommunicationActor,
    readBusinessProfile: (actor) => readBusinessProfile(actor),
    assertEffectEnvironment: () => assertLiveProviderActionAllowed(descriptor),
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
    createClient: (mailbox) =>
      createDescriptorBoundGmailRuntimeClient(mailbox, descriptor),
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
  const target: VerifiedCommunicationTarget = {
    context: c,
    to,
    cc,
    label: f.address ?? `Lease ${c.entityId}`,
    sourceRefs: [`rentvine:lease:${c.entityId}`],
    noticeCycleId: current.noticeCycleId ?? null,
    blockers,
    // Material values, not an admission generation, read timestamp, signature or unrelated field.
    materialSourceHash: sequenceHash({
      leaseId: c.entityId,
      channel,
      to,
      cc,
      notice: current.basis.noticeSafety,
      address: f.address,
      currentRent: f.currentBaseRent?.value ?? null,
      leaseEnd: f.leaseEndDate,
      terms: f.ownerTerms
        ? {
            rent: f.ownerTerms.rent,
            effectiveDate: f.ownerTerms.effectiveDate,
            endDate: f.ownerTerms.endDate,
          }
        : null,
      charges: f.charges.map(({ id, applicable, amount, cadence, effectiveDate }) => ({
        id,
        applicable,
        amount,
        cadence,
        effectiveDate,
      })),
      insuranceTransition: f.insuranceTransition?.applicable ?? null,
      informationForm: f.informationForm?.url ?? null,
      insuranceFlyer: f.insuranceFlyer?.url ?? null,
      blockers,
    }),
  };
  let initial = communicationMessageFromRenewalContent(current.content);
  const profile = await readBusinessProfile(actor).catch(() => null);
  if (profile) {
    const old = current.facts.signature;
    const known = old
      ? [old.name, old.role, old.phone, old.hours, old.email, old.website?.url]
          .filter(Boolean)
          .join("\n")
      : null;
    initial = applyBusinessSignature(initial, profile, actor.email, known);
  }
  return {
    target,
    initial,
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
