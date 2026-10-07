import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
import { EditableLayerError } from "./errors";
import {
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
  derivedArtifactProvenance,
  type DerivedArtifactRecord,
} from "@/lib/lease-documents/derived-artifact-contract";
import type { LoopAssociation } from "@/lib/lease-documents/dotloop-loop-association";
import {
  planLoopCreationClaim,
  planUploadClaim,
  readLoopAssociationIn,
  writeClaimedAssociation,
} from "./lease-document-loop-association";
/** Before the existing S20 one-attempt claim, bind normal S34 actions to current packet, owner approval, mappings and selection. */
export async function assertCurrentPacketActionClaim(
  tx: Transaction,
  db: Firestore,
  execution: ActionExecutionRecord,
  actorUid = "s20-claim",
) {
  if (
    !["dotloop.loop.create_from_template", "dotloop.document.upload"].includes(
      execution.action_key,
    ) ||
    !execution.scope_ref?.startsWith("external-workflow:live:renewal-packet:")
  )
    return;
  const refuse = (): never => {
    throw new EditableLayerError(
      "The packet, approved terms, forms or selected Dotloop resources changed. Review the current packet before execution.",
      409,
    );
  };
  const companion = await tx.get(
    db.collection("lease_document_action_snapshots").doc(execution.id),
  );
  const stored = companion.data();
  if (!stored) refuse();
  const { snapshotHash, effectReceipt: ignoredReceipt, ...basis } = stored!;
  void ignoredReceipt;
  const prepared = stored!.prepared;
  if (
    hashExecutionPreview(basis) !== snapshotHash ||
    stored!.previewHash !== execution.preview_hash ||
    stored!.contextHash !== execution.context_hash
  )
    refuse();
  const leaseId = stored!.leaseId as string;
  const workspaceId = createHash("sha256").update(leaseId).digest("hex");
  const packetHeadId = createHash("sha256")
    .update(`${leaseId.trim()}\u0000${leaseId.trim()}`)
    .digest("hex");
  const [
    datedWorkspace,
    leaseBoundWorkspace,
    head,
    catalog,
    mapping,
    settings,
    packetInputs,
    chargePolicy,
    workingRecord,
  ] = await Promise.all([
    tx.get(db.collection("lease_renewal_workspaces").doc(workspaceId)),
    // S34: a work record saved without a lease end or review date lives in its own head.
    tx.get(db.collection("lease_renewal_lease_bound_workspaces").doc(workspaceId)),
    tx.get(db.collection("lease_document_packet_heads").doc(packetHeadId)),
    tx.get(db.collection("lease_artifact_catalogs").doc("current")),
    tx.get(db.collection("lease_document_source_mappings").doc(workspaceId)),
    tx.get(db.collection("dotloop_renewal_settings").doc("current")),
    tx.get(db.collection("lease_document_packet_inputs").doc(workspaceId)),
    tx.get(db.collection("lease_charge_policies").doc("current")),
    tx.get(db.collection("lease_renewal_working_records").doc(workspaceId)),
  ]);
  const workspace = datedWorkspace.exists ? datedWorkspace : leaseBoundWorkspace;
  // S34 (ARCH-S34-2): the lease's loop target is re-read at the claim. Preparations made before
  // the loop association existed carry no `loopTarget` and keep their original guards.
  const isCreate = execution.action_key === "dotloop.loop.create_from_template";
  const targeted = prepared.loopTarget !== undefined;
  const association: LoopAssociation | null = targeted
    ? await readLoopAssociationIn(tx, db, leaseId)
    : null;
  let holderExecuting = false;
  const reservation = association?.folderReservation;
  if (
    targeted &&
    !isCreate &&
    association &&
    !association.folder &&
    reservation &&
    reservation.executionId !== execution.id
  )
    holderExecuting =
      (await tx.get(db.collection("action_executions").doc(reservation.executionId))).get(
        "state",
      ) === "Executing";
  // S66: the packet inputs, charge policy and Working terms the preview was evaluated from must be
  // unchanged at the claim; a preparation without them (before S66) keeps its original guards.
  const s66Changed = (
    [
      [packetInputs, "packetInputsRecordHash"],
      [chargePolicy, "chargePolicyRecordHash"],
      [workingRecord, "workingRecordHash"],
    ] as const
  ).some(
    ([doc, key]) =>
      prepared[key] !== undefined &&
      hashExecutionPreview(doc.data() ?? {}) !== prepared[key],
  );
  if (
    s66Changed ||
    workspace.get("cycleId") !== prepared.cycleId ||
    workspace.get("termsRevision") !== prepared.termsRevision ||
    hashExecutionPreview(workspace.get("ownerResponse") ?? {}) !==
      prepared.ownerApprovalHash ||
    head.get("snapshot_id") !== prepared.packet.snapshot.snapshotId ||
    head.get("payload_hash") !== prepared.packet.snapshot.payloadHash ||
    hashExecutionPreview(catalog.data() ?? {}) !== prepared.catalogRecordHash ||
    hashExecutionPreview(mapping.data() ?? {}) !== prepared.mappingRecordHash
  )
    refuse();
  for (const [storedKey, selectedKey] of [
    ["profile_id", "profileId"],
    ["template_id", "templateId"],
    ["transaction_type", "transactionType"],
    ["initial_status", "initialStatus"],
  ])
    if (settings.get(storedKey) !== prepared.selection[selectedKey]) refuse();
  for (const artifact of prepared.packet.catalog.artifacts.filter(
    (a: { status: string; artifactId: string }) =>
      a.status === "active" &&
      prepared.packet.snapshot.manifest.includedArtifacts.some(
        (included: { artifactId: string }) => included.artifactId === a.artifactId,
      ),
  )) {
    const id = artifact.publicationSource.reference.slice("publication:".length);
    const publication = await tx.get(db.collection("publication_versions").doc(id));
    const record = publication.data();
    if (
      !record?.validated ||
      record.contentHash !== artifact.contentHash ||
      record.spaceId !== "renewals" ||
      ![undefined, "live"].includes(record.data_mode)
    )
      refuse();
    const resource = await tx.get(
      db.collection("publication_resources").doc(record!.resourceId),
    );
    if (resource.get("activeVersionId") !== id) refuse();
  }
  const now = new Date().toISOString();
  const associationWrite = !targeted
    ? null
    : isCreate
      ? planLoopCreationClaim(association, {
          leaseId,
          cycleId: prepared.cycleId,
          profileId: prepared.selection.profileId,
          executionId: execution.id,
          actorUid,
          now,
        })
      : planUploadClaim(association, {
          loopId: prepared.loopTarget.loopId,
          linkRevision: prepared.loopTarget.linkRevision,
          cycleId: prepared.cycleId,
          documentRef: String(prepared.action.values.document_ref),
          contentHash: String(prepared.action.values.content_hash),
          executionId: execution.id,
          actorUid,
          now,
          holderExecuting,
        });
  // Writes follow every read: the loop reservation commits with S20's one-attempt claim.
  const writeAssociation = () => {
    if (associationWrite)
      writeClaimedAssociation(
        tx,
        db,
        associationWrite,
        isCreate ? "loop_creation_reserved" : "folder_creation_reserved",
        execution.id,
      );
  };
  const required = prepared.packet.catalog.artifacts.filter(
    (artifact: { artifactId: string; fillMapping?: unknown }) =>
      artifact.fillMapping &&
      prepared.packet.snapshot.manifest.includedArtifacts.some(
        (included: { artifactId: string }) => included.artifactId === artifact.artifactId,
      ),
  );
  if (!required.length && !prepared.derivedDocuments?.length) {
    writeAssociation();
    return;
  }
  const documents = prepared.derivedDocuments;
  if (
    !Array.isArray(documents) ||
    documents.length !== required.length ||
    new Set(documents.map((item: { artifactId: string }) => item.artifactId)).size !==
      required.length
  )
    refuse();
  const snapshotId = prepared.packet.snapshot.snapshotId;
  const freezeRef = db.collection(DERIVED_ARTIFACT_COLLECTIONS.freezes).doc(snapshotId);
  const freeze = await tx.get(freezeRef);
  for (const artifact of required) {
    const document = documents.find(
      (item: { artifactId: string }) => item.artifactId === artifact.artifactId,
    );
    if (!document?.derivedArtifactId) refuse();
    const [derivedHead, saved] = await Promise.all([
      tx.get(
        db
          .collection(DERIVED_ARTIFACT_COLLECTIONS.heads)
          .doc(derivedHeadId(snapshotId, artifact.artifactId)),
      ),
      tx.get(
        db
          .collection(DERIVED_ARTIFACT_COLLECTIONS.records)
          .doc(document.derivedArtifactId),
      ),
    ]);
    const record = saved.data() as DerivedArtifactRecord | undefined;
    if (
      !record ||
      derivedHead.get("id") !== record.id ||
      record.id !== document.derivedArtifactId ||
      record.leaseId !== leaseId ||
      record.snapshotId !== snapshotId ||
      record.packetHash !== prepared.packet.snapshot.payloadHash ||
      record.artifactId !== artifact.artifactId ||
      record.originalHash !== artifact.contentHash ||
      record.originalPublication !== artifact.publicationSource.reference ||
      record.mapHash !== artifact.fillMapping.mapHash ||
      record.outputHash !== document.contentHash ||
      record.provenanceHash !== document.derivedProvenanceHash ||
      record.provenanceHash !== derivedArtifactProvenance(record) ||
      record.approval?.outputHash !== record.outputHash ||
      record.approval?.provenanceHash !== record.provenanceHash
    )
      refuse();
  }
  const frozenHash = hashExecutionPreview({
    leaseId,
    snapshotId,
    packetHash: prepared.packet.snapshot.payloadHash,
    documents,
  });
  if (freeze.exists && freeze.get("frozenHash") !== frozenHash) refuse();
  // This write commits atomically with S20's one-attempt claim. Prepare/approve read this
  // same document before writing a head, so either operation wins and the loser retries/refuses.
  if (!freeze.exists)
    tx.create(
      freezeRef,
      stampProductRecordRetention("lease_renewal_progress", {
        leaseId,
        snapshotId,
        frozenHash,
        claimedByExecutionId: execution.id,
      }),
    );
  writeAssociation();
}
