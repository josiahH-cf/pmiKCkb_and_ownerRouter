import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  getMessageDraftSnapshot,
  recordMessageDraftOutcome,
  savePreparedMessageDraft,
} from "@/lib/firestore/renewal-message-drafts";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
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

const identity = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    channel: z.enum(["owner", "tenant"]),
  })
  .strict();
const command = z.discriminatedUnion("kind", [
  SaveMessagePreparationSchema.extend({ kind: z.literal("save") }),
  z.object({ kind: z.literal("publish"), channel: z.enum(["owner", "tenant"]) }).strict(),
  identity
    .extend({
      kind: z.literal("draft"),
      confirm: RenewalDraftConfirmationSchema.optional(),
      reconcile: RenewalDraftReconciliationSchema.optional(),
    })
    .refine(
      (value) => !(value.confirm && value.reconcile),
      "Confirm and reconcile are separate operations.",
    ),
]);
function publicPreparation(current: Awaited<ReturnType<typeof currentRenewalMessage>>) {
  return {
    availableCompScreenshot: current.availableCompScreenshot,
    draftAttempt: current.draftAttempt,
    previousDraftAttempts: current.previousDraftAttempts,
    senderEmail: current.senderEmail,
    cycleId: current.workspace?.cycleId ?? null,
    saved: current.saved,
    inputs: current.inputs,
    facts: current.facts,
    content: current.content,
    sourceFingerprint: current.basis.sourceFingerprint,
    needsReview: current.needsReview,
    signatureMatchesActor: current.signatureMatchesActor,
    publication: {
      status: current.publication.status,
      ref: current.publication.ref,
      ...(current.publication.status !== "approved"
        ? { reason: current.publication.reason }
        : {}),
    },
    notices: current.notices,
  };
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
    if (input.kind === "draft" && input.reconcile) {
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
    const current = await currentRenewalMessage(actor, input.leaseId, input.channel);
    if (input.kind === "save") {
      const { kind: _kind, ...save } = input;
      if (!current.basis.workspaceFingerprint)
        throw new EditableLayerError(
          "Select the current renewal cycle before saving its message.",
          409,
        );
      const result = await saveMessagePreparation(actor, save, {
        sourceFingerprint: current.basis.sourceFingerprint,
        workspaceFingerprint: current.basis.workspaceFingerprint,
      });
      return NextResponse.json({
        duplicate: result.duplicate,
        ...publicPreparation(
          await currentRenewalMessage(actor, input.leaseId, input.channel),
        ),
      });
    }
    const preview = buildSuppliedRenewalDraftPreview(actor, current);
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
          hashExecutionPreview({
            preview,
            claimBasis: {
              workspaceFingerprint: current.basis.workspaceFingerprint,
              sourceFingerprint: current.basis.sourceFingerprint,
              resourceFingerprint: current.basis.resourceFingerprint,
              preparationRevision: current.saved?.revision,
            },
          })
      )
        throw new EditableLayerError(
          "The exact reviewed message changed. Reload and preview its current facts.",
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
        ...(input.reconcile ? { reconcile: input.reconcile } : {}),
      },
      { email: actor.email, sourceRef: `session:${actor.uid}` },
      {
        ...draftDeps,
        loadLease: async () => current.lease,
      },
    );
    if (outcome.status === "preview" && preview.status === "ready" && current.workspace) {
      if (!current.saved || !current.basis.workspaceFingerprint)
        throw new EditableLayerError("The reviewed message basis is unavailable.", 409);
      const snapshot = await savePreparedMessageDraft(actor, {
        claimBasis: {
          workspaceFingerprint: current.basis.workspaceFingerprint,
          sourceFingerprint: current.basis.sourceFingerprint,
          resourceFingerprint: current.basis.resourceFingerprint,
          preparationRevision: current.saved.revision,
        },
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
