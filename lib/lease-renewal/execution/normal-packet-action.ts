import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
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
import {
  DOTLOOP_PARTICIPANT_ROLES,
  type DotloopParticipantRole,
} from "@/lib/integrations/dotloop/client";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { bindCurrentPacketForDotloop } from "@/lib/lease-documents/dotloop-packet-binding";
import { bindApprovedDerivedPacket } from "@/lib/lease-documents/derived-packet-binding";
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
import {
  describeLoopForLease,
  linkExistingLoop,
  readLoopAssociation,
  recordLoopReadback,
  reviewedLoopHash,
  unlinkLeaseLoop,
  type ReviewedLoopObservation,
} from "@/lib/firestore/lease-document-loop-association";
import { getRenewalWorkspace } from "@/lib/firestore/renewal-workspace";
import { readCurrentDerivedArtifact } from "@/lib/firestore/lease-derived-artifacts";
import {
  DOCUMENT_UPLOAD_STATUS_LABELS,
  documentUploadPlan,
  propertyAddressValue,
  usableLoopTarget,
  type LoopAssociation,
  type LoopAssociationView,
  type LoopPropertyAddress,
} from "@/lib/lease-documents/dotloop-loop-association";
import type { PacketInputsRecord } from "@/lib/lease-documents/packet-inputs";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";

const CREATE_KEY = "dotloop.loop.create_from_template";
const UPLOAD_KEY = "dotloop.document.upload";

/** The verified structured address a new loop is created with; null unless all four are entered. */
export function loopPropertyAddress(
  inputs: PacketInputsRecord | null | undefined,
): LoopPropertyAddress | null {
  const value = (key: string) => {
    const entry = inputs?.facts[key]?.value;
    return typeof entry === "string" && entry.trim() ? entry.trim() : null;
  };
  const streetName = value("property.street_line");
  const city = value("property.city");
  const state = value("property.state");
  const zip = value("property.zip");
  return streetName && city && state && zip ? { streetName, city, state, zip } : null;
}

/** The staff-reported execution milestone, kept apart from provider and signed evidence. */
function staffReport(state: RenewalWorkspaceState | null | undefined) {
  const signatures = state?.activities?.signatures ?? null;
  const completion = state?.completion ?? null;
  const record = (entry: {
    recordedAt: string;
    occurredAt?: string;
    source: string;
    reason?: string;
  }) => ({
    recordedAt: entry.recordedAt,
    occurredAt: entry.occurredAt ?? null,
    source: entry.source,
    reason: entry.reason ?? null,
  });
  return {
    signatures: signatures
      ? { outcome: signatures.outcome, ...record(signatures) }
      : null,
    completion: completion ? record(completion) : null,
  };
}

/** The association as the handoff shows it; ids are Dotloop-origin and never reach AI input. */
function associationView(
  association: LoopAssociation | null,
  cycleId: string | null,
): LoopAssociationView | null {
  if (!association) return null;
  return {
    state: association.state,
    origin: association.origin,
    loopId: association.loopId,
    loopName: association.loopName,
    loopUrl: association.loopUrl,
    profileId: association.profileId,
    cycleId: association.cycleId,
    currentCycle: association.cycleId === cycleId,
    linkRevision: association.linkRevision,
    linkedAt: association.linkedAt,
    reason: association.reason,
    folderRecorded: Boolean(association.folder),
    readback: association.readback,
    documents: association.documents,
  };
}
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
  // S34 (AC-S34-8): each operation names only its own exact key. Creating a loop needs the create
  // key; uploading into the lease's linked loop needs the upload key; preparation needs neither.
  const keyBlocker = async (key: string) => {
    try {
      await assertProductionRuntimeActionExecutable(key);
      return null;
    } catch {
      return `The exact ${key} action is not currently executable; its S34 activation gate remains required.`;
    }
  };
  const [createKeyBlocker, uploadKeyBlocker] = await Promise.all([
    keyBlocker(CREATE_KEY),
    keyBlocker(UPLOAD_KEY),
  ]);
  let association: LoopAssociation | null = null;
  try {
    association = await readLoopAssociation(leaseId);
  } catch (error) {
    blockers.push(
      error instanceof EditableLayerError
        ? error.message
        : "The lease's Dotloop loop record could not be read.",
    );
  }
  const cycleId = resolved?.workspace?.cycleId ?? null;
  const target = usableLoopTarget(association, cycleId) ? association : null;
  const included = (resolved?.input.catalog.artifacts ?? []).filter((a) =>
    snapshot?.manifest?.includedArtifacts.some((i) => i.artifactId === a.artifactId),
  );
  const documents = (
    await Promise.all(
      included.map(async (a) => {
        if (!a.providerBindings) return [];
        // The upload carries the approved filled output when the form is mapped, else the
        // approved original. An unapproved filled output is not uploadable yet.
        let contentHash: string | null = a.contentHash;
        if (a.fillMapping && snapshot) {
          const record = await readCurrentDerivedArtifact(actor, {
            leaseId,
            snapshotId: snapshot.snapshotId,
            artifactId: a.artifactId,
          }).catch(() => null);
          contentHash = record?.approval ? record.outputHash : null;
        }
        return [
          {
            artifactId: a.artifactId,
            label: a.label,
            documentRef: a.providerBindings.dotloopDocumentRef,
            contentHash,
            unchangedAttachment: a.unchangedAttachment === true,
          },
        ];
      }),
    )
  ).flat();
  const plan = documentUploadPlan(
    target,
    documents.flatMap((document) =>
      document.contentHash ? [{ ...document, contentHash: document.contentHash }] : [],
    ),
  );
  const documentStatus = documents.map((document) => {
    const planned = plan.find((entry) => entry.documentRef === document.documentRef);
    return {
      ...document,
      status: planned?.status ?? "filled_output_needed",
      statusLabel: planned
        ? DOCUMENT_UPLOAD_STATUS_LABELS[planned.status]
        : "Prepare, inspect and approve the filled PDF before it can be uploaded.",
      history: planned?.history ?? [],
    };
  });
  const createBlockers = [
    ...(createKeyBlocker ? [createKeyBlocker] : []),
    ...(association?.state === "current"
      ? [
          association.cycleId === cycleId
            ? "This lease already has a linked Dotloop loop; upload documents into it. A new loop needs the current link corrected first."
            : "The lease's linked loop served an earlier cycle. Confirm its reuse for this cycle, or correct the link before creating a new loop.",
        ]
      : association?.state === "creating"
        ? [
            "An app loop creation for this lease is unresolved. Recover that attempt before anything else; a new loop is not created.",
          ]
        : []),
  ];
  const uploadBlockers = [
    ...(uploadKeyBlocker ? [uploadKeyBlocker] : []),
    ...(target
      ? []
      : ["Create or link this lease's Dotloop loop before uploading documents."]),
  ];
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
    documents: documentStatus,
    attempts,
    readiness,
    blockers,
    operations: {
      create: { actionKey: CREATE_KEY, blockers: createBlockers },
      upload: { actionKey: UPLOAD_KEY, blockers: uploadBlockers },
    },
    association: associationView(association, cycleId),
    propertyAddress: loopPropertyAddress(resolved?.inputs),
    staffReport: staffReport(resolved?.workspace),
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
  const [resolved, snapshot, head, settings, readiness, association] = await Promise.all([
    resolveLivePacketInput(actor, leaseId, leaseId, new Date().toISOString()),
    getCurrentPacketSnapshot(actor, leaseId, leaseId),
    getPacketHead(actor, leaseId, leaseId),
    getDotloopRenewalSettings(actor),
    readDotloopRuntimeReadiness(),
    readLoopAssociation(leaseId),
  ]);
  // S34: a lease with a current link or an unresolved creation never creates another loop.
  if (
    operation === "loop_create" &&
    (association?.state === "current" || association?.state === "creating")
  )
    throw new EditableLayerError(
      association.state === "creating"
        ? "An app loop creation for this lease is unresolved. Recover that attempt; a second loop is not created."
        : "This lease already has a linked Dotloop loop. Upload documents into it, or correct the link before creating another.",
      409,
    );
  if (
    !snapshot ||
    !head ||
    !resolved.workspace ||
    resolved.ownerApproval !== "current" ||
    resolved.workspace.ownerResponse?.outcome !== "approved_terms"
  )
    throw new EditableLayerError(
      "Evaluate a current packet with the owner's approval of the current Working terms and reviewed signers first.",
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
  const binding = await bindApprovedDerivedPacket(
    actor,
    bindCurrentPacketForDotloop(packet),
    packet,
  );
  if (binding.templateRef !== settings.templateId)
    throw new EditableLayerError(
      "The approved form catalog and selected Dotloop template differ.",
      409,
    );
  const participants = binding.participantRefs.map((ref) => {
    const matches = resolved.contacts.filter((c) => c.participantRef === ref);
    if (matches.length !== 1)
      throw new EditableLayerError(
        "Each required signer needs one reviewed name and email in Packet inputs.",
        409,
      );
    const { participantRef, fullName, email, role } = matches[0];
    if (!(DOTLOOP_PARTICIPANT_ROLES as readonly string[]).includes(role))
      throw new EditableLayerError(
        "A reviewed signer has a Dotloop role that is not documented.",
        409,
      );
    return { participantRef, fullName, email, role: role as DotloopParticipantRole };
  });
  // S34 (ARCH-S34-2): the lease's loop association is the only upload target.
  const target = usableLoopTarget(association, resolved.workspace.cycleId)
    ? association
    : null;
  const document =
    operation === "document_upload"
      ? binding.documents.find((d) => d.documentRef === documentRef)
      : null;
  if (operation === "document_upload" && (!document || !target))
    throw new EditableLayerError(
      target
        ? "Select one approved document from this packet."
        : association?.state === "current"
          ? "The lease's linked loop served an earlier renewal cycle. Confirm its reuse for this cycle first."
          : "Create or link this lease's Dotloop loop before uploading documents.",
      409,
    );
  if (operation === "document_upload" && target!.profileId !== settings.profileId)
    throw new EditableLayerError(
      "The linked loop belongs to a different Dotloop profile than the one selected in Connections.",
      409,
    );
  const priorUploads = target
    ? documentUploadPlan(target, document ? [{ ...document, label: "" }] : [])
    : [];
  if (operation === "document_upload" && priorUploads[0]?.status === "uploaded_current")
    throw new EditableLayerError(
      "This exact document version is already in the linked loop; its upload receipt is reused.",
      409,
    );
  const propertyAddress = loopPropertyAddress(resolved.inputs);
  const base = {
    dataMode: "live" as const,
    workflowId: `renewal-packet:${snapshot.snapshotId}`,
    contractRef: "documented:dotloop-public-api-v2:s34",
    connectionRef: `dotloop:profile:${settings.profileId}`,
    mappingRef: `s66:${binding.catalogVersion}:${snapshot.payloadHash}${binding.documents.some((item) => item.derivedArtifactId) ? `:filled:${hashExecutionPreview({ documents: binding.documents.map((item) => ({ artifactId: item.artifactId, derivedId: item.derivedArtifactId ?? null, provenance: item.derivedProvenanceHash ?? null })) })}` : ""}`,
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
      property_address: propertyAddressValue(propertyAddress),
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
            loop_ref: target!.loopId,
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
    ...(binding.documents.some((item) => item.derivedArtifactId)
      ? { derivedDocuments: binding.documents.filter((item) => item.derivedArtifactId) }
      : {}),
    participants,
    action,
    trustedContext,
    definition: LEASE_EXECUTION_DEFINITION_MAP.get(action.actionKey)!,
    // S34 (AC-S34-8): an upload depends on the lease's current loop association, checked here,
    // at execution and at the S20 claim; no create receipt is required for a linked loop.
    dependencyExecutionIds: {} as Record<string, string>,
    loopTarget:
      operation === "document_upload"
        ? {
            loopId: target!.loopId,
            profileId: target!.profileId,
            linkRevision: target!.linkRevision,
            origin: target!.origin,
            folderRecorded: Boolean(target!.folder),
          }
        : null,
    supersedes:
      operation === "document_upload" && priorUploads[0]?.latestUpload
        ? {
            contentHash: priorUploads[0].latestUpload.contentHash,
            uploadedAt: priorUploads[0].latestUpload.uploadedAt,
          }
        : null,
    propertyAddress: operation === "loop_create" ? propertyAddress : null,
    catalogRecordHash: resolved.catalogRecordHash,
    mappingRecordHash: resolved.mappingRecordHash,
    packetInputsRecordHash: resolved.packetInputsRecordHash,
    chargePolicyRecordHash: resolved.chargePolicyRecordHash,
    workingRecordHash: resolved.workingRecordHash,
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
    // S182: the confirming staff member approves this exact preview in the lease's own control.
    // Neither the company settings recorder nor an Admin approval-queue route is substituted.
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
  // A colleague confirms the original preparation without replacing its authenticated preparer.
  const prepared = existing.exists
    ? await getActionExecution(actor, existingId)
    : await prepareExternalActionWithS20(actor, {
        action: value.action,
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
    artifacts: value.packet.snapshot.manifest!.includedArtifacts.map((artifact) => {
      const derived = value.derivedDocuments?.find(
        (item) => item.artifactId === artifact.artifactId,
      );
      return {
        ...artifact,
        ...(derived ? { contentHash: derived.contentHash } : {}),
        downloadUrl: derived
          ? `/api/lease-renewal/filled-artifact?${new URLSearchParams({ leaseId, snapshotId: value.packet.snapshot.snapshotId, artifactId: derived.artifactId, derivedId: derived.derivedArtifactId! })}`
          : `/api/lease-renewal/document-artifact?leaseId=${encodeURIComponent(leaseId)}&documentRef=${encodeURIComponent(value.packet.catalog.artifacts.find((a) => a.artifactId === artifact.artifactId)!.providerBindings!.dotloopDocumentRef)}`,
      };
    }),
    fields: value.packet.snapshot.manifest!.fields.map((field) => ({
      label: field.factKey,
      value: field.displayValue,
      source: field.source.system,
    })),
    selection: value.selection,
    operation,
    documentRef: documentRef ?? null,
    actionKey: value.action.actionKey,
    loopTarget: value.loopTarget,
    supersedes: value.supersedes,
    propertyAddress: value.propertyAddress,
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
    cycleId: value.cycleId,
    loopTarget: value.loopTarget ?? null,
    propertyAddress: value.propertyAddress ?? null,
    reconcile: recover,
    ...(recover && value.derivedDocuments
      ? { retainedDerivedDocuments: value.derivedDocuments }
      : {}),
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

/** One explicit readback of the lease's linked loop. It never infers document or signature completion. */
export async function refreshNormalPacketLink(actor: AuthenticatedUser, leaseId: string) {
  if (!can(actor.role, renewalRoleCapability("record_packet_readback")))
    throw new EditableLayerError("Renewal staff record packet provider readback.", 403);
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Verification accounts cannot persist provider readback.",
      403,
    );
  assertMutationAllowed(requireEnvironmentDescriptor());
  const [association, settings] = await Promise.all([
    readLoopAssociation(leaseId),
    getDotloopRenewalSettings(actor),
  ]);
  if (
    !association ||
    association.state !== "current" ||
    !association.loopId ||
    !settings ||
    settings.profileId !== association.profileId
  )
    throw new EditableLayerError(
      "A linked Dotloop loop and its selected Dotloop profile are required for readback.",
      409,
    );
  const runtime = createDotloopRuntime();
  if (!runtime)
    throw new EditableLayerError(
      "The managed Dotloop connection is unavailable; saved loop evidence is retained.",
      409,
    );
  const observed = await runtime.client.getLoop(
    association.profileId,
    association.loopId,
  );
  if (!observed || observed.id !== association.loopId)
    throw new EditableLayerError(
      "The linked loop could not be read; its saved evidence is retained.",
      409,
    );
  const saved = await recordLoopReadback(actor, {
    leaseId,
    loopId: association.loopId,
    readback: {
      readBackAt: new Date().toISOString(),
      loopStatus: observed.status,
      participantCount: observed.participantCount,
    },
  });
  return {
    association: associationView(saved, saved.cycleId),
    status: "read_back",
    evidenceLevel: "loop_metadata_only",
  };
}

/** Read an existing loop through the company connection so staff can review it before linking. */
async function observeLoop(actor: AuthenticatedUser, loopId: string) {
  const settings = await getDotloopRenewalSettings(actor);
  if (!settings?.profileId)
    throw new EditableLayerError(
      "Select the company Dotloop profile in Connections before linking a loop.",
      409,
    );
  const runtime = createDotloopRuntime();
  if (!runtime)
    throw new EditableLayerError(
      "The managed Dotloop connection is unavailable, so the loop cannot be reviewed.",
      409,
    );
  const loop = await runtime.client.getLoop(settings.profileId, loopId);
  if (!loop)
    throw new EditableLayerError(
      "No loop with that number is readable through the company Dotloop profile.",
      404,
    );
  const participants = await runtime.client.listParticipants(settings.profileId, loop.id);
  const observation: ReviewedLoopObservation = {
    profileId: settings.profileId,
    loopId: loop.id,
    name: loop.name,
    status: loop.status,
    loopUrl: loop.loopUrl,
    participantCount: loop.participantCount,
    participants: participants.map((participant) => ({
      fullName: participant.fullName,
      email: participant.email,
      role: participant.role,
    })),
  };
  return observation;
}

function assertLinkActor(actor: AuthenticatedUser) {
  if (!can(actor.role, renewalRoleCapability("link_dotloop_loop")))
    throw new EditableLayerError(
      "Editor access is required to link or correct a lease's Dotloop loop.",
      403,
    );
  if (isVerificationAccount(actor))
    throw new EditableLayerError(
      "Verification accounts cannot change the lease's Dotloop loop.",
      403,
    );
}

/**
 * S34: review an existing loop for this lease. A matching name or address is shown as a hint only;
 * the review says whether the loop is already recorded for another lease or an earlier cycle.
 */
export async function reviewExistingDotloopLoop(
  actor: AuthenticatedUser,
  leaseId: string,
  loopId: string,
) {
  assertLinkActor(actor);
  const [observation, workspace] = await Promise.all([
    observeLoop(actor, loopId),
    getRenewalWorkspace(actor, leaseId),
  ]);
  const relation = await describeLoopForLease(
    leaseId,
    observation.profileId,
    observation.loopId,
  );
  const cycleId = workspace?.cycleId ?? null;
  return {
    observation,
    observationHash: reviewedLoopHash(observation),
    archived: observation.status === "ARCHIVED",
    recordedForOtherLease: relation.recordedForOtherLease,
    servedEarlierCycle:
      relation.earlierCycleIds.some((id) => id !== cycleId) ||
      (relation.current?.loopId === observation.loopId &&
        relation.current.cycleId !== cycleId),
    expectedLinkRevision: relation.current?.linkRevision ?? 0,
    currentLink: associationView(relation.current, cycleId),
  };
}

/** S34: link the loop staff reviewed, re-reading it first so a changed loop is not linked. */
export async function linkReviewedDotloopLoop(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    loopId: string;
    observationHash: string;
    reason: string;
    expectedLinkRevision: number;
    reuseAcrossCycles: boolean;
  },
) {
  assertLinkActor(actor);
  const [observation, workspace] = await Promise.all([
    observeLoop(actor, input.loopId),
    getRenewalWorkspace(actor, input.leaseId),
  ]);
  if (reviewedLoopHash(observation) !== input.observationHash)
    throw new EditableLayerError(
      "The loop changed since it was reviewed. Review it again before linking.",
      409,
    );
  if (observation.status === "ARCHIVED")
    throw new EditableLayerError(
      "An archived loop cannot receive renewal documents. Choose an active loop.",
      409,
    );
  if (!workspace?.cycleId)
    throw new EditableLayerError(
      "Start or open this lease's renewal cycle before linking its Dotloop loop.",
      409,
    );
  const saved = await linkExistingLoop(actor, {
    leaseId: input.leaseId,
    cycleId: workspace.cycleId,
    observation,
    reason: input.reason,
    expectedLinkRevision: input.expectedLinkRevision,
    reuseAcrossCycles: input.reuseAcrossCycles,
  });
  return { association: associationView(saved, workspace.cycleId) };
}

/** S34: correct the lease's loop link. Nothing in Dotloop changes; history stays readable. */
export async function unlinkDotloopLoop(
  actor: AuthenticatedUser,
  input: { leaseId: string; expectedLinkRevision: number; reason: string },
) {
  assertLinkActor(actor);
  const saved = await unlinkLeaseLoop(actor, input);
  return { association: associationView(saved, saved.cycleId) };
}
