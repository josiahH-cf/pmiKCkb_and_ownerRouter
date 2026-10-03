import { randomUUID } from "node:crypto";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  getMessageDraftSnapshot,
  preparedMessageDraftDiffers,
  recordMessageDraftOutcome,
  savePreparedMessageDraft,
} from "@/lib/firestore/renewal-message-drafts";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace, type AuthenticatedUser } from "@/lib/auth/session";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { SaveMessagePreparationSchema } from "@/lib/lease-renewal/renewal-message-preparation";
import { saveMessagePreparation } from "@/lib/firestore/renewal-message-preparations";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import { finalizeRenewalNoticeDraft } from "@/lib/lease-renewal/execution/renewal-notice-draft-service";
import {
  RenewalDraftConfirmationSchema,
  RenewalDraftReconciliationSchema,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { EditableLayerError } from "@/lib/firestore/errors";
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
function claimBasisOf(current: Current) {
  return {
    noticeSafety: current.basis.noticeSafety ?? undefined,
    workspaceFingerprint: current.basis.workspaceFingerprint!,
    sourceFingerprint: current.basis.sourceFingerprint,
    resourceFingerprint: current.basis.resourceFingerprint,
    preparationRevision: current.saved!.revision,
  };
}
/** A refusal that happened before any Gmail call, in the shape the message card reports. */
function refusedBeforeGmail(error: string, code: string, status = 409) {
  return NextResponse.json({ error, code, providerCallAttempted: false }, { status });
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
    if (input.save && !input.confirm) {
      // S162 (R-S162-7): the explicit draft action saves the displayed message itself. A failed
      // save is reported as that failure; nothing is previewed from an older saved state.
      try {
        await saveMessage(
          actor,
          { ...input.save, leaseId: input.leaseId, channel: input.channel },
          input.leaseId,
        );
      } catch (error) {
        if (error instanceof EditableLayerError)
          return refusedBeforeGmail(
            `The message could not be saved, so no draft was prepared. Your wording is kept on screen. ${error.message}`,
            "message_save_failed",
            error.status,
          );
        throw error;
      }
    }
    let current = await currentRenewalMessage(actor, input.leaseId, input.channel);
    if (
      !input.confirm &&
      input.displayed &&
      (current.content.subject !== input.displayed.subject ||
        current.content.plainText !== input.displayed.body)
    )
      return refusedBeforeGmail(
        "The message changed after it was shown here, so no draft was prepared. The current message is loading; preview the draft again from it.",
        "message_changed",
      );
    let preview = buildSuppliedRenewalDraftPreview(actor, current);
    if (
      !input.confirm &&
      preview.status === "ready" &&
      current.saved &&
      current.workspace &&
      current.basis.workspaceFingerprint &&
      (await preparedMessageDraftDiffers(actor, preview, claimBasisOf(current)))
    ) {
      // S162: the same saved revision now reads with different recipients, facts or resources than
      // an attempt already prepared under it. A new revision gives this preview its own attempt
      // identity instead of colliding with the earlier one; the wording itself is unchanged.
      await saveMessage(
        actor,
        {
          leaseId: input.leaseId,
          cycleId: current.workspace.cycleId,
          channel: input.channel,
          expectedRevision: current.saved.revision,
          operationId: randomUUID(),
          inputs: current.saved.inputs,
          bodyOverride:
            current.bodyOverride && current.bodyOverride.state !== "unreadable"
              ? {
                  text: current.bodyOverride.text,
                  baseHash: current.bodyOverride.baseHash,
                }
              : null,
          subjectOverride: current.subjectOverride,
        },
        input.leaseId,
      );
      current = await currentRenewalMessage(actor, input.leaseId, input.channel);
      preview = buildSuppliedRenewalDraftPreview(actor, current);
    }
    if (input.confirm) {
      const saved = await getMessageDraftSnapshot(
        actor,
        input.confirm.executionId,
        input.leaseId,
        input.channel,
      );
      if (preview.status !== "ready") return NextResponse.json(preview);
      if (
        saved.snapshot.previewHash !== input.confirm.previewHash ||
        saved.snapshot.snapshotHash !==
          hashExecutionPreview({ preview, claimBasis: claimBasisOf(current) })
      )
        throw new EditableLayerError(
          "The message changed after this preview. Preview the draft again to confirm the current message.",
          409,
        );
      if (saved.execution.state === "Succeeded" && saved.snapshot.outcome)
        return NextResponse.json(saved.snapshot.outcome);
      if (["Executing", "Needs reconciliation"].includes(saved.execution.state))
        return NextResponse.json({
          status: "needs_reconciliation",
          channel: input.channel,
          executionId: input.confirm.executionId,
          reason:
            "The one attempt is already consumed. Recover this exact attempt; do not create a duplicate.",
        });
    }
    const outcome = await finalizeRenewalNoticeDraft(
      preview,
      {
        leaseId: input.leaseId,
        offer: { channel: input.channel },
        ...(input.confirm ? { confirm: input.confirm } : {}),
      },
      { email: actor.email, sourceRef: `session:${actor.uid}` },
      {
        ...draftDeps,
        loadLease: async () => current.lease,
      },
    );
    if (outcome.status === "preview" && preview.status === "ready" && current.workspace) {
      if (!current.saved || !current.basis.workspaceFingerprint)
        throw new EditableLayerError(
          "The saved message could not be read back. Preview the draft again.",
          409,
        );
      const snapshot = await savePreparedMessageDraft(actor, {
        claimBasis: claimBasisOf(current),
        leaseId: input.leaseId,
        cycleId: current.workspace.cycleId,
        channel: input.channel,
        preview,
        executionId: outcome.executionId,
        previewHash: outcome.previewHash,
      });
      const existing = await getMessageDraftSnapshot(
        actor,
        snapshot.executionId,
        input.leaseId,
        input.channel,
      );
      if (existing.execution.state === "Succeeded" && existing.snapshot.outcome)
        return NextResponse.json(existing.snapshot.outcome);
      if (["Executing", "Needs reconciliation"].includes(existing.execution.state))
        return NextResponse.json({
          status: "needs_reconciliation",
          channel: input.channel,
          executionId: snapshot.executionId,
          reason: "Recover the existing consumed attempt before any new draft.",
        });
    } else if ("executionId" in outcome)
      await recordMessageDraftOutcome(actor, input.leaseId, input.channel, outcome);
    return NextResponse.json(outcome, {
      headers: { "Cache-Control": "private, no-store" },
    });
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
