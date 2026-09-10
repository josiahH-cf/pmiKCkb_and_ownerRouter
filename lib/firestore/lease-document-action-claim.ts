import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { EditableLayerError } from "./errors";
/** Before the existing S20 one-attempt claim, bind normal S34 actions to current packet, owner approval, mappings and selection. */
export async function assertCurrentPacketActionClaim(
  tx: Transaction,
  db: Firestore,
  execution: ActionExecutionRecord,
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
  const [workspace, head, catalog, mapping, settings] = await Promise.all([
    tx.get(db.collection("lease_renewal_workspaces").doc(workspaceId)),
    tx.get(db.collection("lease_document_packet_heads").doc(packetHeadId)),
    tx.get(db.collection("lease_artifact_catalogs").doc("current")),
    tx.get(db.collection("lease_document_source_mappings").doc(workspaceId)),
    tx.get(db.collection("dotloop_renewal_settings").doc("current")),
  ]);
  if (
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
}
