import type { ExternalActionReceipt } from "@/lib/external-execution/types";
import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createDotloopRuntime,
  readDotloopRuntimeReadiness,
} from "@/lib/connections/dotloop-runtime";
import {
  executeExternalActionWithS20,
  reconcileExternalActionWithS20,
  type ExecuteExternalActionWithS20Input,
} from "@/lib/external-execution/s20-bridge";
import { externalActionIdempotencyKey } from "@/lib/external-execution/identity";
import { getDotloopRenewalSettings } from "@/lib/firestore/dotloop-renewal-settings";
import { recordPacketExecutionProjection } from "@/lib/firestore/lease-document-packet-snapshots";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  LiveDotloopProvider,
  type LiveDotloopProviderDeps,
} from "@/lib/integrations/dotloop/renewal-provider";
import { bindCurrentPacketForDotloop } from "@/lib/lease-documents/dotloop-packet-binding";
import { resolveApprovedDotloopArtifact } from "@/lib/lease-documents/approved-artifact-content";
import { DotloopRenewalExecutor } from "@/lib/lease-renewal/execution/providers";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";

/** Server-only assembly. Participant references and contact details must come from approved
 * mappings, never browser assertions. That resolver awaits B-DL3; references are not emails. */
export async function executeDotloopPacketWithS20(
  actor: AuthenticatedUser,
  input: {
    packet: Parameters<typeof bindCurrentPacketForDotloop>[0];
    participants: readonly (LiveDotloopProviderDeps["participants"][number] & {
      participantRef: string;
    })[];
    artifactContent?: LiveDotloopProviderDeps["artifactContent"];
    reconcile?: boolean;
    receiptStore?: {
      read: () => Promise<ExternalActionReceipt | null>;
      save: (receipt: ExternalActionReceipt) => Promise<void>;
    };
    request: Omit<ExecuteExternalActionWithS20Input, "executor">;
  },
) {
  const key = input.request.action.actionKey;
  if (key !== "dotloop.loop.create_from_template" && key !== "dotloop.document.upload")
    throw new EditableLayerError("Unsupported packet action.", 400);
  // The two exact keys remain closed. Refuse before constructing credentials or provider clients.
  await assertProductionRuntimeActionExecutable(key);
  const binding = bindCurrentPacketForDotloop({
    ...input.packet,
    operation: key === "dotloop.document.upload" ? "document_upload" : "loop_create",
  });
  const settings = await getDotloopRenewalSettings(actor);
  const readiness = await readDotloopRuntimeReadiness();
  if (
    readiness.state !== "connected" ||
    !settings?.transactionType ||
    !settings.initialStatus
  )
    throw new EditableLayerError(
      "Dotloop connection, profile, template, transaction type, and status must be verified first.",
      409,
    );
  if (
    settings.templateId !== binding.templateRef ||
    input.participants.length !== binding.participantRefs.length ||
    input.participants.some(
      (participant, i) => participant.participantRef !== binding.participantRefs[i],
    )
  )
    throw new EditableLayerError(
      "The packet's verified participant and template mappings do not match.",
      409,
    );
  const values = input.request.action.values;
  if (key === "dotloop.document.upload") {
    const loop = input.packet.snapshot.execution?.loopLink;
    if (
      !loop ||
      loop.packetSnapshotHash !== binding.packetSnapshotHash ||
      loop.loopId !== values.loop_ref ||
      loop.profileId !== settings.profileId ||
      !binding.documents.some(
        (document) =>
          document.documentRef === values.document_ref &&
          document.contentHash === values.content_hash,
      )
    )
      throw new EditableLayerError(
        "The document must belong to this current packet and its receipted loop.",
        409,
      );
  } else if (
    values.template_ref !== binding.templateRef ||
    values.participant_refs !== binding.participantRefs.join(",")
  ) {
    throw new EditableLayerError(
      "The confirmed loop values do not match this current packet.",
      409,
    );
  }
  const artifactContent =
    input.artifactContent ??
    (async (documentRef: string) => {
      const document = binding.documents.find(
        (entry) => entry.documentRef === documentRef,
      );
      if (!document)
        throw new EditableLayerError(
          "This document is outside the confirmed packet.",
          409,
        );
      return resolveApprovedDotloopArtifact(actor, {
        catalog: input.packet.catalog,
        documentRef,
        expectedContentHash: document.contentHash,
      });
    });
  // Missing/changed legal content is a preflight refusal, never a consumed provider attempt.
  const resolvedArtifact =
    key === "dotloop.document.upload"
      ? await artifactContent(String(values.document_ref))
      : undefined;
  if (
    resolvedArtifact &&
    createHash("sha256").update(resolvedArtifact.content).digest("hex") !==
      values.content_hash
  )
    throw new EditableLayerError(
      "The approved artifact content changed before execution.",
      409,
    );
  const runtime = createDotloopRuntime();
  if (!runtime) throw new EditableLayerError("Dotloop credentials are unavailable.", 409);
  const provider = new LiveDotloopProvider({
    client: runtime.client,
    selection: {
      profileId: settings.profileId,
      templateId: settings.templateId,
      transactionType: settings.transactionType,
      initialStatus: settings.initialStatus,
    },
    participants: input.participants,
    packetSnapshotId: binding.packetSnapshotId,
    artifactContent: resolvedArtifact
      ? async (documentRef) => {
          if (documentRef !== values.document_ref)
            throw new EditableLayerError(
              "This document is outside the confirmed packet.",
              409,
            );
          return resolvedArtifact;
        }
      : artifactContent,
  });
  const run = input.reconcile
    ? reconcileExternalActionWithS20
    : executeExternalActionWithS20;
  const executor = new DotloopRenewalExecutor(provider);
  const wrapped = input.receiptStore
    ? {
        validate: executor.validate.bind(executor),
        execute: async (action: Parameters<typeof executor.execute>[0]) => {
          const receipt = await executor.execute(action);
          await input.receiptStore!.save(receipt);
          return receipt;
        },
        reconcile: async (action: Parameters<typeof executor.reconcile>[0]) => {
          const retained = await input.receiptStore!.read();
          if (retained) return { ...retained, reconciled: true };
          // A matching provider name cannot establish which attempt created a loop.
          // Normal packet recovery uses a durable response/readback receipt; otherwise retain ambiguity.
          void action;
          return null;
        },
      }
    : executor;
  const response = await run(actor, {
    ...input.request,
    executor: wrapped,
  });
  const recoveredReceipt =
    response.execution.state === "Succeeded" && input.receiptStore
      ? await input.receiptStore.read()
      : null;
  const result = {
    ...response,
    result:
      "result" in response
        ? response.result
        : "receipt" in response
          ? response.receipt
          : (recoveredReceipt ?? undefined),
  };
  // S20 owns the receipt. Loop presence is partial packet execution, never signed completion.
  if (
    result.execution.state === "Succeeded" &&
    key === "dotloop.loop.create_from_template"
  ) {
    const found = result.result;
    if (!found)
      throw new EditableLayerError("The receipted loop needs readback recovery.", 409);
    const observed = await runtime.client.getLoop(settings.profileId, found.providerRef);
    if (!observed)
      throw new EditableLayerError("The receipted loop needs readback recovery.", 409);
    await recordPacketExecutionProjection(actor, {
      snapshot_id: binding.packetSnapshotId,
      idempotency_key: externalActionIdempotencyKey(input.request.action),
      state: "Partially executed",
      receipt_id: result.execution.id,
      loop_link: {
        loop_id: observed.id,
        ...(observed.loopUrl ? { loop_url: observed.loopUrl } : {}),
        profile_id: settings.profileId,
        template_id: settings.templateId,
        packet_snapshot_hash: binding.packetSnapshotHash,
        read_back_at: new Date().toISOString(),
        ...(observed.status ? { loop_status: observed.status } : {}),
        ...(observed.participantCount === null
          ? {}
          : { participant_count: observed.participantCount }),
      },
    });
  }
  if (
    result.execution.state === "Succeeded" &&
    key === "dotloop.document.upload" &&
    result.result
  ) {
    const receipt = result.result;
    if (!receipt.providerEvidence || !receipt.submittedContentHash)
      throw new EditableLayerError("The document receipt needs evidence recovery.", 409);
    await recordPacketExecutionProjection(actor, {
      snapshot_id: binding.packetSnapshotId,
      idempotency_key: externalActionIdempotencyKey(input.request.action),
      state: "Partially executed",
      receipt_id: result.execution.id,
      document_evidence: [
        {
          receiptId: result.execution.id,
          providerRef: receipt.providerRef,
          evidenceLevel: receipt.providerEvidence.level,
          documentId: receipt.providerEvidence.documentId,
          documentName: receipt.providerEvidence.documentName,
          submittedContentHash: receipt.submittedContentHash,
        },
      ],
    });
  }
  return result;
}
