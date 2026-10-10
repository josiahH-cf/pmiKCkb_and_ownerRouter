// Build only pre-upgrade compatibility fixtures through the retained draft service. Ordinary HTTP
// creation is retired by S193. This helper is impossible to run against production resources.
import { NextResponse } from "next/server";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  getMessageDraftSnapshot,
  savePreparedMessageDraft,
  recordMessageDraftOutcome,
} from "@/lib/firestore/renewal-message-drafts";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import { finalizeRenewalNoticeDraft } from "@/lib/lease-renewal/execution/renewal-notice-draft-service";
import { createDescriptorBoundGmailRuntimeClient } from "@/lib/gmail-hub/dependencies";
import { requireEnvironmentDescriptor } from "@/lib/environment/descriptor";
import { apiErrorResponse } from "@/lib/api/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { POST as ordinaryRoute } from "@/app/api/lease-renewal/message-preparation/route";
export async function legacyMessageAttemptFixture(
  request: Request,
  actor: AuthenticatedUser,
) {
  if (
    process.env.NODE_ENV !== "test" ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
  )
    throw new Error("Legacy fixtures require the isolated test emulator.");
  const input = await request.clone().json();
  if (input.kind !== "draft" || input.reconcile) return ordinaryRoute(request);
  try {
    const current = await currentRenewalMessage(actor, input.leaseId, input.channel);
    const preview = buildSuppliedRenewalDraftPreview(actor, current);
    if (preview.status !== "ready") return NextResponse.json(preview);
    if (!current.workspace || !current.saved || !current.basis.workspaceFingerprint)
      throw new Error("A compatibility fixture requires a saved prior message.");
    const claimBasis = {
      noticeSafety: current.basis.noticeSafety ?? undefined,
      workspaceFingerprint: current.basis.workspaceFingerprint,
      sourceFingerprint: current.basis.sourceFingerprint,
      resourceFingerprint: current.basis.resourceFingerprint,
      preparationRevision: current.saved.revision,
    };
    if (input.confirm) {
      const saved = await getMessageDraftSnapshot(
        actor,
        input.confirm.executionId,
        input.leaseId,
        input.channel,
      );
      if (
        saved.snapshot.previewHash !== input.confirm.previewHash ||
        saved.snapshot.snapshotHash !== hashExecutionPreview({ preview, claimBasis })
      )
        throw new EditableLayerError("The message changed after this preview.", 409);
      if (saved.execution.state === "Succeeded" && saved.snapshot.outcome)
        return NextResponse.json(saved.snapshot.outcome);
    }
    const result = await finalizeRenewalNoticeDraft(
      preview,
      {
        leaseId: input.leaseId,
        offer: { channel: input.channel },
        ...(input.confirm ? { confirm: input.confirm } : {}),
      },
      { email: actor.email, sourceRef: `session:${actor.uid}` },
      {
        actor,
        loadLease: async () => current.lease,
        createGmailClient: (subject) =>
          createDescriptorBoundGmailRuntimeClient(
            subject,
            requireEnvironmentDescriptor(),
          ),
      },
    );
    if (result.status === "preview")
      await savePreparedMessageDraft(actor, {
        claimBasis,
        leaseId: input.leaseId,
        cycleId: current.workspace.cycleId,
        channel: input.channel,
        preview,
        executionId: result.executionId,
        previewHash: result.previewHash,
      });
    else if ("executionId" in result)
      await recordMessageDraftOutcome(actor, input.leaseId, input.channel, result);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
