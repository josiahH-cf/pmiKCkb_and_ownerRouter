import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  getMessageDraftSnapshot,
  recordMessageDraftOutcome,
} from "@/lib/firestore/renewal-message-drafts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace, type AuthenticatedUser } from "@/lib/auth/session";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { SaveMessagePreparationSchema } from "@/lib/lease-renewal/renewal-message-preparation";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { finalizeRenewalNoticeDraft } from "@/lib/lease-renewal/execution/renewal-notice-draft-service";
import {
  RenewalDraftConfirmationSchema,
  RenewalDraftReconciliationSchema,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { GovernedDraftConnectionError } from "@/lib/external-execution/governed-draft-execution";
import { buildLiveCompScreenshotRuntime } from "@/lib/lease-renewal/comp-screenshot-runtime";
import { resolveRenewalDraftCompScreenshotAttachment } from "@/lib/lease-renewal/comp-screenshot-attachment-runtime";
import type { RenewalDraftAttachmentIdentity } from "@/lib/lease-renewal/execution/renewal-draft-attachment";
import { resolveRenewalWorkBasis } from "@/lib/lease-renewal/workspace-cycle-context";

const identity = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    channel: z.enum(["owner", "tenant"]),
  })
  .strict();
/** The message state a draft request carries so its own action can save it (S162 R-S162-7). */
const draftSave = SaveMessagePreparationSchema.omit({ leaseId: true, channel: true });
const command = z.discriminatedUnion("kind", [
  SaveMessagePreparationSchema.extend({ kind: z.literal("save") }),
  z.object({ kind: z.literal("publish"), channel: z.enum(["owner", "tenant"]) }).strict(),
  identity
    .extend({
      kind: z.literal("draft"),
      /**
       * S162: exactly what the person sees when they ask for the draft. The preview is refused
       * when the saved message does not read back as this subject and body.
       */
      displayed: z
        .object({ subject: z.string().max(400), body: z.string().max(40_000) })
        .strict()
        .optional(),
      /** The unsaved message state, saved inside this explicit draft action before the preview. */
      save: draftSave.optional(),
      confirm: RenewalDraftConfirmationSchema.optional(),
      reconcile: RenewalDraftReconciliationSchema.optional(),
    })
    .refine(
      (value) => !(value.confirm && value.reconcile),
      "Confirm and reconcile are separate operations.",
    ),
]);
type Current = Awaited<ReturnType<typeof currentRenewalMessage>>;
function publicPreparation(current: Current) {
  return {
    availableCompScreenshot: current.availableCompScreenshot,
    draftAttempt: current.draftAttempt,
    previousDraftAttempts: current.previousDraftAttempts,
    senderEmail: current.senderEmail,
    signatureOrigin: current.signatureOrigin,
    retainedSignature: current.retainedSignature,
    chargeInventory: current.chargeInventory,
    recipients: current.recipients,
    destinations: current.destinations,
    cycleId: current.workspace?.cycleId ?? null,
    saved: current.saved,
    inputs: current.inputs,
    facts: current.facts,
    content: current.content,
    // S139/S161: the saved authored wording, and the hash of the composition it would start from.
    bodyOverride: current.bodyOverride,
    bodyBaseHash: current.bodyBaseHash,
    subjectOverride: current.subjectOverride,
    sourceFingerprint: current.basis.sourceFingerprint,
    signatureMatchesActor: current.signatureMatchesActor,
    publication: {
      status: current.publication.status,
      ref: current.publication.ref,
      ...(current.publication.status !== "approved"
        ? { reason: current.publication.reason }
        : {}),
    },
    notices: current.notices,
    policyGates: current.policyGates,
  };
}
function saveMessage(actor: AuthenticatedUser, value: unknown, leaseId: string) {
  // S154: the first saved message establishes the lease's work record from its real basis.
  return saveMessagePreparation(actor, value, {
    resolveBasis: () => resolveRenewalWorkBasis(actor, leaseId),
  });
}
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const input = identity.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(
      publicPreparation(await currentRenewalMessage(actor, input.leaseId, input.channel)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("draft_create"),
      "renewals",
    );
    const input = await parseJsonBody(request, command);
    if (input.kind === "publish") {
      await requireCapabilityInSpace(
        renewalRoleCapability("approve_message_template"),
        "renewals",
      );
      const publication = await publishSuppliedRenewalTemplate(actor, input.channel);
      return NextResponse.json({
        status: publication.status,
        duplicate: publication.duplicate,
        templateId: publication.templateId,
        contentHash: publication.contentHash,
      });
    }
    if (input.kind === "save") {
      // S161: an autosave. It needs no cycle, no review and no current source read to be stored.
      const { kind: _kind, ...save } = input;
      const result = await saveMessage(actor, save, input.leaseId);
      return NextResponse.json({
        duplicate: result.duplicate,
        ...publicPreparation(
          await currentRenewalMessage(actor, input.leaseId, input.channel),
        ),
      });
    }
    const draftDeps = {
      actor,
      loadLease: async () => null,
      createGmailClient: (subject: string) =>
        createDescriptorBoundGmailRuntimeClient(subject, requireEnvironmentDescriptor()),
      resolveCompScreenshotAttachment: async (
        leaseId: string,
        expected: RenewalDraftAttachmentIdentity,
      ) => {
        const runtime = buildLiveCompScreenshotRuntime();
        return resolveRenewalDraftCompScreenshotAttachment(
          leaseId,
          expected,
          runtime.deps,
          runtime.context,
        );
      },
    };
    if (input.reconcile) {
      // Recovery reads the exact persisted attempt even when source facts, links or the active cycle changed.
      const saved = await getMessageDraftSnapshot(
        actor,
        input.reconcile.executionId,
        input.leaseId,
        input.channel,
      );
      if (
        saved.execution.state === "Succeeded" &&
        saved.snapshot.outcome?.status === "created"
      )
        return NextResponse.json(saved.snapshot.outcome);
      const recovered = await finalizeRenewalNoticeDraft(
        saved.snapshot.preview,
        {
          leaseId: input.leaseId,
          offer: { channel: input.channel },
          reconcile: input.reconcile,
        },
        { email: actor.email, sourceRef: `session:${actor.uid}` },
        draftDeps,
      );
      await recordMessageDraftOutcome(actor, input.leaseId, input.channel, recovered);
      return NextResponse.json(recovered, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json(
      {
        error:
          "New messages are reviewed in Communications. This route only recovers an earlier draft attempt.",
        code: "communications_composer_required",
        providerCallAttempted: false,
        href: `/gmail-hub?compose=renewal_${input.channel}&lease=${input.leaseId}`,
      },
      { status: 410, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof GovernedDraftConnectionError)
      return NextResponse.json(
        {
          error: error.message,
          code: "gmail_connection_unavailable",
          providerCallAttempted: false,
        },
        { status: error.status },
      );
    return apiErrorResponse(error);
  }
}
