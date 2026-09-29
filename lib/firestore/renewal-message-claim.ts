import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { ActionExecutionRecord } from "@/lib/execution/types";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  messageResourceFingerprint,
  workspaceMessageBasisFingerprint,
} from "@/lib/lease-renewal/message-claim-basis";
import { suppliedRenewalPublication } from "./renewal-message-publication";
import { EditableLayerError } from "./errors";
import { noticeSafetyMarkerRef } from "./renewal-notice-safety";
import {
  NoticeSafetyMarkerSchema,
  noticeSafetyBasis,
  manualNonRenewalReason,
} from "@/lib/lease-renewal/notice-safety";
import { LEASE_EXPORT_MAX_AGE_MS } from "@/lib/lease-renewal/live-lease-cache";
/** A companion guard at the existing S20 claim. Legacy attempts recover without a new claim. */
export async function assertCurrentRenewalMessageClaim(
  tx: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  execution: ActionExecutionRecord,
) {
  if (execution.action_key !== "gmail.renewal_notice.draft_create") return;
  const scope =
    /^external-workflow:live:renewal-live:([1-9]\d*):cycle:([a-f0-9-]{36})$/.exec(
      execution.scope_ref ?? "",
    );
  if (!scope)
    throw new EditableLayerError(
      "Review the current cycle message in the lease workspace before creating a new draft. Historical attempt recovery remains available.",
      409,
    );
  const fail = (): never => {
    throw new EditableLayerError(
      "The saved message, owner terms, resource links or approved publication changed. Reload and review a new preview before drafting.",
      409,
    );
  };
  const [, leaseId, cycleId] = scope;
  const snap = await tx.get(
    db.collection("renewal_message_draft_snapshots").doc(execution.id),
  );
  const snapshot = snap.data(),
    basis = snapshot?.claimBasis;
  if (
    !snapshot ||
    !basis ||
    snapshot.leaseId !== leaseId ||
    snapshot.cycleId !== cycleId ||
    snapshot.actorUid !== actor.uid ||
    snapshot.previewHash !== execution.preview_hash ||
    snapshot.contextHash !== execution.context_hash ||
    snapshot.snapshotHash !==
      hashExecutionPreview({ preview: snapshot.preview, claimBasis: basis }) ||
    !["owner", "tenant"].includes(snapshot.channel)
  )
    fail();
  const channel = snapshot!.channel as "owner" | "tenant",
    identity = hashExecutionPreview({ leaseId, cycleId, channel });
  const [workspace, preparation, active, resources, templates, noticeMarker] =
    await Promise.all([
      tx.get(
        db
          .collection("lease_renewal_workspaces")
          .doc(createHash("sha256").update(leaseId).digest("hex")),
      ),
      tx.get(db.collection("renewal_message_preparations").doc(identity)),
      tx.get(db.collection("renewal_message_draft_heads").doc(identity)),
      tx.get(db.collection("renewal_resource_locations").doc("current")),
      tx.get(db.collection("templates").where("space_id", "==", "lease-renewals")),
      tx.get(noticeSafetyMarkerRef(db, leaseId)),
    ]);
  const message = preparation.data(),
    head = workspace.data();
  const marker = NoticeSafetyMarkerSchema.safeParse(noticeMarker.data());
  if (
    !head ||
    manualNonRenewalReason(head) !== null ||
    !basis.noticeSafety ||
    !marker.success ||
    Date.now() - marker.data!.sourceReadAt.lease >= LEASE_EXPORT_MAX_AGE_MS ||
    Date.now() - marker.data!.sourceReadAt.status >= LEASE_EXPORT_MAX_AGE_MS ||
    hashExecutionPreview(noticeSafetyBasis(marker.data!)) !==
      hashExecutionPreview(basis.noticeSafety) ||
    head.cycleId !== cycleId ||
    workspaceMessageBasisFingerprint(head) !== basis.workspaceFingerprint ||
    !message ||
    message.revision !== basis.preparationRevision ||
    message.reviewedSourceFingerprint !== basis.sourceFingerprint ||
    message.signatureActorUid !== actor.uid ||
    String(message.signatureEmail).toLowerCase() !== actor.email.toLowerCase() ||
    active.get("executionId") !== execution.id ||
    messageResourceFingerprint(
      resources.exists ? resources.data()! : { version: 0, entries: {} },
    ) !== basis.resourceFingerprint
  )
    fail();
  const expected = suppliedRenewalPublication(channel);
  const matches = templates.docs
    .map((doc) => doc.data())
    .filter(
      (record) =>
        !record.deleted_at &&
        typeof record.name === "string" &&
        record.name.trim().toLowerCase() === expected.name.toLowerCase(),
    );
  if (
    matches.length !== 1 ||
    matches[0].status !== "Approved" ||
    matches[0].body !== expected.body ||
    !matches[0].approved_by_uid ||
    !matches[0].last_reviewed_at
  )
    fail();
}
