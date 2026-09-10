import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import {
  parseExternalReceipt,
  externalReceiptResultCode,
} from "@/lib/external-execution/receipt";
import type { ExternalActionReceipt } from "@/lib/external-execution/types";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  getCurrentPacketSnapshot,
  getPacketHead,
  recordPacketExecutionProjection,
} from "@/lib/firestore/lease-document-packet-snapshots";
import {
  approveActionExecution,
  getActionExecution,
} from "@/lib/firestore/action-executions";
import {
  createDotloopRuntime,
  readDotloopRuntimeReadiness,
} from "@/lib/connections/dotloop-runtime";
import { getDotloopRenewalSettings } from "@/lib/firestore/dotloop-renewal-settings";
import { resolveLivePacketInput } from "@/lib/lease-documents/live-input";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { bindCurrentPacketForDotloop } from "@/lib/lease-documents/dotloop-packet-binding";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { externalActionContextHash } from "@/lib/external-execution/identity";
import {
  prepareExternalActionWithS20,
  expectedExternalS20ExecutionId,
  type ExternalActionPreparationInput,
  type TrustedExternalExecutionContext,
} from "@/lib/external-execution/s20-bridge";
import { LEASE_EXECUTION_DEFINITION_MAP } from "@/lib/lease-renewal/execution/matrix";
import { DotloopRenewalExecutor } from "@/lib/lease-renewal/execution/providers";
import { executeDotloopPacketWithS20 } from "@/lib/lease-renewal/execution/dotloop-runtime";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
export const PACKET_ACTION_SNAPSHOTS = "lease_document_action_snapshots";
export type PacketOperation = "loop_create" | "document_upload";
const validator = new DotloopRenewalExecutor(
  new Proxy({} as never, {
    get() {
      throw new Error("Packet validation cannot construct a provider.");
    },
  }),
);
export async function currentPacketHandoff(actor: AuthenticatedUser, leaseId: string) {
  const [sourceRead, snapshot, connectionRead] = await Promise.all([
    resolveLivePacketInput(actor, leaseId, leaseId, new Date().toISOString()).then(
      (value) => ({ value }),
      () => ({ value: null }),
    ),
    getCurrentPacketSnapshot(actor, leaseId, leaseId),
    readDotloopRuntimeReadiness().then(
      (value) => value,
      () => ({
        state: "unavailable",
        reasons: ["Connection readiness could not be read"],
      }),
    ),
  ]);
  const resolved = sourceRead.value;
  const readiness = connectionRead;
  const blockers = resolved
    ? [...resolved.notices]
    : [
        "Fresh packet sources could not be read. Saved packet evidence and exact attempts are retained.",
      ];
  if (readiness.state !== "connected")
    blockers.push(`Dotloop connection: ${readiness.reasons.join(", ")} (S106).`);
  for (const key of ["dotloop.loop.create_from_template", "dotloop.document.upload"]) {
    try {
      await assertProductionRuntimeActionExecutable(key);
    } catch {
      blockers.push(
        `The exact ${key} action is not currently executable; its S34 activation gate remains required.`,
      );
    }
  }
  const documents = (resolved?.input.catalog.artifacts ?? [])
    .filter((a) =>
      snapshot?.manifest?.includedArtifacts.some((i) => i.artifactId === a.artifactId),
    )
    .flatMap((a) =>
      a.providerBindings
        ? [
            {
              artifactId: a.artifactId,
              label: a.label,
              documentRef: a.providerBindings.dotloopDocumentRef,
            },
          ]
        : [],
    );
  const saved = await getAdminFirestore()
    .collection(PACKET_ACTION_SNAPSHOTS)
    .where("leaseId", "==", leaseId)
    .get();
  const attempts = (
    await Promise.all(
      saved.docs.map(async (doc) => {
        try {
          const execution = await getActionExecution(actor, doc.id);
          return { executionId: doc.id, state: execution.state };
        } catch (error) {
          // The existing S20 reader restricts staff to their own attempts; Admin sees the full queue.
          if (error instanceof EditableLayerError && error.status === 404) return null;
          throw error;
        }
      }),
    )
  ).filter((value) => value !== null);
  return {
    snapshot,
    signers:
      snapshot?.manifest?.participants.map(
        (p) =>
          resolved?.sources?.contacts.find(
            (c) => c.participantRef === p.providerBindings?.dotloopParticipantRef,
          )?.fullName ?? p.participantId,
      ) ?? [],
    documents,
    attempts,
    readiness,
    blockers,
    expectedLeaseSourceHash: resolved?.leaseSourceHash ?? null,
    catalogVersion: resolved?.input.catalog.catalogVersion ?? "unverified",
  };
}
async function assemble(
  actor: AuthenticatedUser,
  leaseId: string,
  operation: PacketOperation,
  documentRef?: string,
) {
  const [resolved, snapshot, head, settings, readiness] = await Promise.all([
    resolveLivePacketInput(actor, leaseId, leaseId, new Date().toISOString()),
    getCurrentPacketSnapshot(actor, leaseId, leaseId),
    getPacketHead(actor, leaseId, leaseId),
    getDotloopRenewalSettings(actor),
    readDotloopRuntimeReadiness(),
  ]);
  if (
    !snapshot ||
    !head ||
    !resolved.sources ||
    resolved.workspace?.ownerResponse?.outcome !== "approved_terms"
  )
    throw new EditableLayerError(
      "Evaluate a current packet with approved owner terms and current participant/field mappings first.",
      409,
    );
  if (evaluateRenewalPacket(resolved.input).payloadHash !== snapshot.payloadHash)
    throw new EditableLayerError(
      "Packet sources or approved terms changed. Evaluate and review a current snapshot.",
      409,
    );
  if (
    readiness.state !== "connected" ||
    !settings?.transactionType ||
    !settings.initialStatus
  )
    throw new EditableLayerError(
      "Verify Dotloop connection, selected profile/template and transaction status in Connections.",
      409,
    );
  const packet = {
    snapshot,
    currentHead: head,
    catalog: resolved.input.catalog,
    confirmedPayloadHash: snapshot.payloadHash,
    operation,
  };
  const binding = bindCurrentPacketForDotloop(packet);
  if (binding.templateRef !== settings.templateId)
    throw new EditableLayerError(
      "The approved form catalog and selected Dotloop template differ.",
      409,
    );
  const participants = binding.participantRefs.map((ref) => {
    const matches = resolved.sources!.contacts.filter((c) => c.participantRef === ref);
    if (matches.length !== 1)
      throw new EditableLayerError(
        "Each required signer must have one current approved contact mapping.",
        409,
      );
    return matches[0];
  });
  const document =
    operation === "document_upload"
      ? binding.documents.find((d) => d.documentRef === documentRef)
      : null;
  if (operation === "document_upload" && (!document || !snapshot.execution?.loopLink))
    throw new EditableLayerError(
      "Select one approved document from this packet after its loop is receipted.",
      409,
    );
  const base = {
    dataMode: "live" as const,
    workflowId: `renewal-packet:${snapshot.snapshotId}`,
    contractRef: "documented:dotloop-public-api-v2:s34",
    connectionRef: `dotloop:profile:${settings.profileId}`,
    mappingRef: `s66:${binding.catalogVersion}:${snapshot.payloadHash}`,
    sourceRefs: [
      `rentvine:lease:${leaseId}`,
      `s66:packet:${snapshot.snapshotId}`,
      `renewal-cycle:${resolved.workspace.cycleId}`,
    ],
  };
  const loopAction: ExternalActionPreparationInput = {
    ...base,
    actionId: `packet-loop:${snapshot.snapshotId}`,
    actionKey: "dotloop.loop.create_from_template",
    values: {
      workflow_context: `renewal:${leaseId}`,
      template_ref: binding.templateRef,
      participant_refs: binding.participantRefs.join(","),
    },
  };
  const action: ExternalActionPreparationInput =
    operation === "loop_create"
      ? loopAction
      : {
          ...base,
          actionId: `packet-document:${snapshot.snapshotId}:${document!.documentRef}`,
          actionKey: "dotloop.document.upload",
          values: {
            loop_ref: snapshot.execution!.loopLink!.loopId,
            document_ref: document!.documentRef,
            document_type: resolved.input.catalog.artifacts.find(
              (a) => a.artifactId === document!.artifactId,
            )!.kind,
            content_hash: document!.contentHash,
          },
        };
  const technical = {
    connectionReady: true,
    documentedEvidence: true,
    endpointDocumented: true,
    permissionGranted: true,
    productionAllowed: true,
    requiredValuesPresent: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
  };
  const trustedContext: TrustedExternalExecutionContext = {
    connectionReady: true,
    endpointDocumented: true,
    localPreviewValidated: true,
    permissionGranted: true,
    roleScopeAuthorized: true,
    sourceValidated: true,
    technical,
    externalReferences: {
      connectionRef: action.connectionRef!,
      contractRef: action.contractRef!,
      mappingRef: action.mappingRef!,
      sourceRefs: action.sourceRefs,
    },
  };
  return {
    packet,
    participants,
    action,
    trustedContext,
    definition: LEASE_EXECUTION_DEFINITION_MAP.get(action.actionKey)!,
    dependencyExecutionIds:
      operation === "document_upload"
        ? {
            "dotloop.loop.create_from_template":
              expectedExternalS20ExecutionId(loopAction),
          }
        : ({} as Record<string, string>),
    catalogRecordHash: resolved.catalogRecordHash,
    mappingRecordHash: resolved.mappingRecordHash,
    ownerApprovalHash: hashExecutionPreview({ ...resolved.workspace.ownerResponse }),
    selection: {
      profileId: settings.profileId,
      templateId: settings.templateId,
      transactionType: settings.transactionType,
      initialStatus: settings.initialStatus,
    },
    cycleId: resolved.workspace.cycleId,
    termsRevision: resolved.workspace.termsRevision,
    leaseSourceHash: resolved.leaseSourceHash,
    approvalQueue: {
      requiredAdminUid: settings.recordedByUid,
      directLink: `/lease-renewal/live/desk/lease/${encodeURIComponent(leaseId)}#renewal-section-documents`,
      processRunRef: { id: base.workflowId, label: "Renewal packet review" },
    },
  };
}
export async function prepareNormalPacketAction(
  actor: AuthenticatedUser,
  leaseId: string,
  operation: PacketOperation,
  documentRef?: string,
) {
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Verification accounts cannot prepare packet effects.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const value = await assemble(actor, leaseId, operation, documentRef);
  await assertProductionRuntimeActionExecutable(value.action.actionKey);
  const existingId = expectedExternalS20ExecutionId(value.action);
  const existing = await getAdminFirestore()
    .collection(PACKET_ACTION_SNAPSHOTS)
    .doc(existingId)
    .get();
  if (
    existing.exists &&
    hashExecutionPreview(existing.get("prepared")) !== hashExecutionPreview(value)
  )
    throw new EditableLayerError(
      "This packet already has a different immutable preparation. Recover its exact attempt or evaluate the current changed sources.",
      409,
    );
  // Admin reviews the original Editor preparation without trying to replace its authenticated preparer.
  const prepared = existing.exists
    ? await getActionExecution(actor, existingId)
    : await prepareExternalActionWithS20(actor, {
        action: value.action,
        approvalQueue: value.approvalQueue,
        definition: value.definition,
        trustedContext: value.trustedContext,
        validate: (action) => validator.validate(action),
      });
  // Existing S66 snapshots hold exact artifact facts; this companion retains the immutable action for recovery.
  const stored = {
    leaseId,
    operation,
    documentRef: documentRef ?? null,
    prepared: value,
    previewHash: prepared.preview_hash,
    contextHash: externalActionContextHash(value.action),
  };
  const ref = getAdminFirestore().collection(PACKET_ACTION_SNAPSHOTS).doc(prepared.id);
  await getAdminFirestore().runTransaction(async (tx) => {
    const prior = await tx.get(ref);
    if (prior.exists) {
      if (prior.get("snapshotHash") !== hashExecutionPreview(stored))
        throw new EditableLayerError(
          "This packet preparation differs from its saved snapshot.",
          409,
        );
      return;
    }
    tx.create(
      ref,
      JSON.parse(
        JSON.stringify({ ...stored, snapshotHash: hashExecutionPreview(stored) }),
      ),
    );
  });
  return {
    executionId: prepared.id,
    previewHash: prepared.preview_hash,
    state: prepared.state,
    packetHash: value.packet.snapshot.payloadHash,
    participants: value.participants.map((p) => ({
      name: p.fullName,
      email: p.email,
      role: p.role,
    })),
    artifacts: value.packet.snapshot.manifest!.includedArtifacts.map((artifact) => ({
      ...artifact,
      downloadUrl: `/api/lease-renewal/document-artifact?leaseId=${encodeURIComponent(leaseId)}&documentRef=${encodeURIComponent(value.packet.catalog.artifacts.find((a) => a.artifactId === artifact.artifactId)!.providerBindings!.dotloopDocumentRef)}`,
    })),
    fields: value.packet.snapshot.manifest!.fields.map((field) => ({
      label: field.factKey,
      value: field.displayValue,
      source: field.source.system,
    })),
    selection: value.selection,
    operation,
    documentRef: documentRef ?? null,
  };
}
export async function finishNormalPacketAction(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    executionId: string;
    previewHash?: string;
    reconcile?: boolean;
    reason?: string;
  },
) {
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Verification accounts cannot execute packet effects.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const storedDoc = await getAdminFirestore()
    .collection(PACKET_ACTION_SNAPSHOTS)
    .doc(input.executionId)
    .get();
  const stored = storedDoc.data();
  if (!stored || stored.leaseId !== input.leaseId)
    throw new EditableLayerError(
      "The exact packet action was not found for this lease.",
      404,
    );
  const { snapshotHash, effectReceipt: ignoredReceipt, ...basis } = stored;
  void ignoredReceipt;
  if (hashExecutionPreview(basis) !== snapshotHash)
    throw new EditableLayerError(
      "The saved packet action changed; preserve its evidence for review.",
      409,
    );
  const original = stored.prepared as Awaited<ReturnType<typeof assemble>>;
  const already = await getActionExecution(actor, input.executionId);
  const recover = input.reconcile || already.state === "Succeeded";
  let value = original;
  if (!recover) {
    if (input.previewHash !== stored.previewHash)
      throw new EditableLayerError("Confirm the exact current packet preview.", 409);
    value = await assemble(
      actor,
      input.leaseId,
      stored.operation,
      stored.documentRef ?? undefined,
    );
    if (hashExecutionPreview(value) !== hashExecutionPreview(original))
      throw new EditableLayerError(
        "Packet sources changed after preview; prepare a new current preview.",
        409,
      );
  }
  let execution = await getActionExecution(actor, input.executionId);
  if (!recover && execution.state === "Awaiting Admin")
    execution = await approveActionExecution(actor, input.executionId, {
      previewHash: stored.previewHash,
      contextHash: stored.contextHash,
      reason: input.reason ?? "",
    });
  return executeDotloopPacketWithS20(actor, {
    packet: value.packet,
    participants: value.participants,
    reconcile: recover,
    receiptStore: {
      read: async () => {
        const value = (await storedDoc.ref.get()).get("effectReceipt");
        if (!value) return null;
        const receipt = parseExternalReceipt(
          value,
          original.action.actionKey,
          value.reconciled === true,
          "live",
        );
        const ledger = await getActionExecution(actor, input.executionId);
        if (
          ledger.state === "Succeeded" &&
          ledger.result_code !== externalReceiptResultCode(receipt)
        )
          throw new EditableLayerError(
            "The retained packet receipt does not match its execution ledger.",
            409,
          );
        return receipt;
      },
      save: async (receipt: ExternalActionReceipt) => {
        await getAdminFirestore().runTransaction(async (tx) => {
          const saved = await tx.get(storedDoc.ref);
          if (saved.get("snapshotHash") !== snapshotHash)
            throw new EditableLayerError(
              "The packet action changed before receipt persistence.",
              409,
            );
          const prior = saved.get("effectReceipt");
          if (
            prior &&
            externalReceiptResultCode(prior) !== externalReceiptResultCode(receipt)
          )
            throw new EditableLayerError(
              "The exact packet action already has a different receipt.",
              409,
            );
          if (!prior)
            tx.update(storedDoc.ref, {
              effectReceipt: JSON.parse(JSON.stringify(receipt)),
            });
        });
      },
    },
    request: {
      action: value.action,
      executionId: input.executionId,
      confirmedPreviewHash: stored.previewHash,
      definition: value.definition,
      trustedContext: value.trustedContext,
      dependencyExecutionIds: value.dependencyExecutionIds,
    },
  });
}

/** One explicit readback of an already receipted loop. It never infers document or signature completion. */
export async function refreshNormalPacketLink(actor: AuthenticatedUser, leaseId: string) {
  if (actor.role !== "Admin" && actor.role !== "Approver")
    throw new EditableLayerError(
      "An Approver or Admin records packet provider readback.",
      403,
    );
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Verification accounts cannot persist provider readback.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const snapshot = await getCurrentPacketSnapshot(actor, leaseId, leaseId),
    link = snapshot?.execution?.loopLink;
  const settings = await getDotloopRenewalSettings(actor);
  if (
    !snapshot?.execution ||
    !link ||
    link.packetSnapshotHash !== snapshot.payloadHash ||
    !settings ||
    settings.profileId !== link.profileId
  )
    throw new EditableLayerError(
      "A receipted current packet and its selected Dotloop profile are required for readback.",
      409,
    );
  const runtime = createDotloopRuntime();
  if (!runtime)
    throw new EditableLayerError(
      "The managed Dotloop connection is unavailable; saved loop evidence is retained.",
      409,
    );
  const observed = await runtime.client.getLoop(link.profileId, link.loopId);
  if (!observed || observed.id !== link.loopId)
    throw new EditableLayerError(
      "The exact saved loop could not be read; its evidence is retained.",
      409,
    );
  const result = await recordPacketExecutionProjection(actor, {
    snapshot_id: snapshot.snapshotId,
    idempotency_key: snapshot.execution.idempotencyKey,
    state: snapshot.execution.state,
    ...(snapshot.execution.receiptId ? { receipt_id: snapshot.execution.receiptId } : {}),
    loop_link: {
      loop_id: link.loopId,
      profile_id: link.profileId,
      template_id: link.templateId,
      packet_snapshot_hash: snapshot.payloadHash,
      read_back_at: new Date().toISOString(),
      ...((observed.loopUrl ?? link.loopUrl)
        ? { loop_url: (observed.loopUrl ?? link.loopUrl)! }
        : {}),
      ...((observed.status ?? link.loopStatus)
        ? { loop_status: (observed.status ?? link.loopStatus)! }
        : {}),
      ...((observed.participantCount ?? link.participantCount) == null
        ? {}
        : { participant_count: (observed.participantCount ?? link.participantCount)! }),
      ...(link.documentCount === null ? {} : { document_count: link.documentCount }),
    },
  });
  return { snapshot: result, status: "read_back", evidenceLevel: "loop_metadata_only" };
}
