import type { ExternalActionReceipt } from "@/lib/external-execution/types";
import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createDotloopRuntime,
  readDotloopRuntimeReadiness,
  refreshDotloopResourceReadiness,
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
import {
  bindApprovedDerivedPacket,
  bindRetainedDerivedPacket,
} from "@/lib/lease-documents/derived-packet-binding";
import {
  readDerivedArtifactContent,
  readHistoricalDerivedArtifactContent,
} from "@/lib/firestore/lease-derived-artifacts";
import type { DotloopPacketBinding } from "@/lib/lease-documents/dotloop-packet-binding";
import { DotloopRenewalExecutor } from "@/lib/lease-renewal/execution/providers";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import {
  completeLoopCreation,
  readLoopAssociation,
  recordLoopFolder,
  recordLoopUpload,
  releasePendingUpload,
} from "@/lib/firestore/lease-document-loop-association";
import {
  propertyAddressValue,
  type LoopPropertyAddress,
} from "@/lib/lease-documents/dotloop-loop-association";

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
    /** S34: the lease cycle and frozen loop target from the immutable preparation. */
    cycleId?: string;
    loopTarget?: { loopId: string; profileId: string; linkRevision: number } | null;
    /** S34: the verified structured address a new loop is created with, or null. */
    propertyAddress?: LoopPropertyAddress | null;
    reconcile?: boolean;
    /** Server-loaded immutable S34 preparation only; consumed for read-only own-receipt recovery. */
    retainedDerivedDocuments?: DotloopPacketBinding["documents"];
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
  const originalBinding = bindCurrentPacketForDotloop({
    ...input.packet,
    operation: key === "dotloop.document.upload" ? "document_upload" : "loop_create",
  });
  const binding = input.reconcile
    ? await bindRetainedDerivedPacket(
        actor,
        originalBinding,
        input.packet,
        input.retainedDerivedDocuments,
      )
    : await bindApprovedDerivedPacket(actor, originalBinding, input.packet);
  const settings = await getDotloopRenewalSettings(actor);
  // S106: provider-write admission validates the current resources live; recovery of an owned
  // receipt reuses the labeled observation instead of requiring another provider read.
  const readiness = input.reconcile
    ? await readDotloopRuntimeReadiness()
    : (await refreshDotloopResourceReadiness({ actorUid: actor.uid })).readiness;
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
  const leaseId = input.packet.snapshot?.leaseId ?? "";
  // S34 (ARCH-S34-2): an upload goes only into the lease's current loop association as previewed;
  // recovery of an owned receipt reads its own evidence and needs no current link.
  const association =
    key === "dotloop.document.upload" ? await readLoopAssociation(leaseId) : null;
  if (key === "dotloop.document.upload") {
    if (
      !binding.documents.some(
        (document) =>
          document.documentRef === values.document_ref &&
          document.contentHash === values.content_hash,
      ) ||
      (!input.reconcile &&
        (!association ||
          association.state !== "current" ||
          association.loopId !== values.loop_ref ||
          association.profileId !== settings.profileId ||
          !input.loopTarget ||
          input.loopTarget.loopId !== association.loopId ||
          input.loopTarget.linkRevision !== association.linkRevision))
    )
      throw new EditableLayerError(
        "The document must belong to this current packet and the lease's linked loop.",
        409,
      );
  } else if (
    values.template_ref !== binding.templateRef ||
    values.participant_refs !== binding.participantRefs.join(",") ||
    values.property_address !== propertyAddressValue(input.propertyAddress ?? null)
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
      if (document.derivedArtifactId) {
        const read = input.reconcile
          ? readHistoricalDerivedArtifactContent
          : readDerivedArtifactContent;
        return read(actor, {
          leaseId: input.packet.snapshot.leaseId,
          snapshotId: binding.packetSnapshotId,
          artifactId: document.artifactId,
          derivedId: document.derivedArtifactId,
          requireApproval: true,
        });
      }
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
    propertyAddress: input.propertyAddress ?? null,
    packetSnapshotId: binding.packetSnapshotId,
    // S34 (AC-S34-6): the lease's durable packet folder; the first created folder is recorded and
    // every later document, worker or restart reuses it.
    ...(key === "dotloop.document.upload"
      ? {
          documentFolder: {
            // Read at use, after this attempt's claim: a folder another upload recorded meanwhile
            // is reused instead of creating a second one.
            read: async () =>
              (await readLoopAssociation(leaseId))?.folder?.dotloopFolderId ?? null,
            record: (dotloopFolderId: string) =>
              recordLoopFolder({
                leaseId,
                loopId: String(values.loop_ref),
                dotloopFolderId,
                executionId: input.request.executionId,
              }),
          },
        }
      : {}),
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
  // A definitively failed upload sent nothing; its version is free for a fresh confirmation.
  // An uncertain one keeps holding it.
  if (key === "dotloop.document.upload" && response.execution.state === "Failed")
    await releasePendingUpload({ leaseId, executionId: response.execution.id });
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
    // The created loop becomes the lease's current loop only through its own reserved creation.
    await completeLoopCreation(actor, {
      leaseId,
      cycleId: input.cycleId ?? "unknown",
      profileId: settings.profileId,
      executionId: result.execution.id,
      loop: {
        id: observed.id,
        name: observed.name,
        loopUrl: observed.loopUrl,
        status: observed.status,
        participantCount: observed.participantCount,
      },
    });
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
    // S34 (AC-S34-7): record this exact version in the lease's loop; earlier versions stay.
    const [, dotloopFolderId] = receipt.providerRef.split(":");
    const uploaded = binding.documents.find(
      (document) => document.documentRef === values.document_ref,
    )!;
    await recordLoopUpload(actor, {
      leaseId,
      loopId: String(values.loop_ref),
      document: {
        artifactId: uploaded.artifactId,
        documentRef: uploaded.documentRef,
        label:
          input.packet.catalog.artifacts.find(
            (artifact) => artifact.artifactId === uploaded.artifactId,
          )?.label ?? uploaded.documentRef,
        contentHash: receipt.submittedContentHash,
        snapshotId: binding.packetSnapshotId,
        derivedArtifactId: uploaded.derivedArtifactId ?? null,
        receiptId: result.execution.id,
        dotloopDocumentId: receipt.providerEvidence.documentId,
        dotloopFolderId: dotloopFolderId ?? "",
        documentName: receipt.providerEvidence.documentName,
        uploadedAt: new Date().toISOString(),
        uploadedByUid: actor.uid,
      },
    });
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
