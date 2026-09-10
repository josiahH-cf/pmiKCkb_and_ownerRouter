import type { RenewalMessageClaimBasis } from "@/lib/lease-renewal/message-claim-basis";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  assertUnclaimedActionExecutionInTransaction,
  getActionExecution,
} from "@/lib/firestore/action-executions";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { expectedExternalS20ExecutionId } from "@/lib/external-execution/s20-bridge";
import { externalActionContextHash } from "@/lib/external-execution/identity";
import type { RenewalDraftPreview } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import type { RenewalNoticeDraftOutcome } from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";

type ReadyPreview = Extract<RenewalDraftPreview, { status: "ready" }>;
interface DraftSnapshot {
  claimBasis: RenewalMessageClaimBasis;
  leaseId: string;
  cycleId: string;
  channel: "owner" | "tenant";
  actorUid: string;
  executionId: string;
  previewHash: string;
  contextHash: string;
  snapshotHash: string;
  preview: ReadyPreview;
  recordedAt: string;
  outcome?: RenewalNoticeDraftOutcome;
}
export const MESSAGE_DRAFT_COLLECTIONS = {
  head: "renewal_message_draft_heads",
  snapshots: "renewal_message_draft_snapshots",
} as const;
function headId(leaseId: string, cycleId: string, channel: "owner" | "tenant") {
  return hashExecutionPreview({ leaseId, cycleId, channel });
}
function assertWriter(actor: AuthenticatedUser) {
  if (!can(actor.role, "edit") || isVerificationAccount(actor))
    throw new EditableLayerError("Renewals staff authority is required.", 403);
  assertMutationAllowed(requireEnvironmentDescriptor());
}
function validateSnapshot(value: DraftSnapshot) {
  if (
    !value ||
    value.preview?.status !== "ready" ||
    value.preview.channel !== value.channel ||
    value.preview.action.authority ||
    value.preview.action.actionKey !== "gmail.renewal_notice.draft_create" ||
    value.preview.action.dataMode !== "live" ||
    expectedExternalS20ExecutionId({ ...value.preview.action, authority: undefined }) !==
      value.executionId ||
    externalActionContextHash(value.preview.action) !== value.contextHash ||
    hashExecutionPreview({ ...value.preview.action.values }) !== value.previewHash ||
    hashExecutionPreview({ preview: value.preview, claimBasis: value.claimBasis }) !==
      value.snapshotHash
  )
    throw new EditableLayerError(
      "The saved Gmail attempt does not match its exact reviewed snapshot.",
      409,
    );
  return value;
}

/** Persist the exact reviewed content before its one S20 claim, so recovery survives source changes. */
export async function savePreparedMessageDraft(
  actor: AuthenticatedUser,
  input: {
    claimBasis: RenewalMessageClaimBasis;
    leaseId: string;
    cycleId: string;
    channel: "owner" | "tenant";
    preview: ReadyPreview;
    executionId: string;
    previewHash: string;
  },
  db: Firestore = getAdminFirestore(),
) {
  assertWriter(actor);
  const snapshot: DraftSnapshot = validateSnapshot(
    JSON.parse(
      JSON.stringify({
        ...input,
        actorUid: actor.uid,
        contextHash: externalActionContextHash(input.preview.action),
        snapshotHash: hashExecutionPreview({
          preview: input.preview,
          claimBasis: input.claimBasis,
        }),
        recordedAt: new Date().toISOString(),
      }),
    ),
  );
  const head = db
    .collection(MESSAGE_DRAFT_COLLECTIONS.head)
    .doc(headId(input.leaseId, input.cycleId, input.channel));
  const ref = db.collection(MESSAGE_DRAFT_COLLECTIONS.snapshots).doc(input.executionId);
  await db.runTransaction(async (tx) => {
    const [existing, active] = await Promise.all([tx.get(ref), tx.get(head)]);
    if (existing.exists) {
      const previous = validateSnapshot(existing.data() as DraftSnapshot);
      if (
        previous.snapshotHash !== snapshot.snapshotHash ||
        previous.actorUid !== actor.uid
      )
        throw new EditableLayerError(
          "This exact Gmail attempt belongs to a different reviewed snapshot or sender.",
          409,
        );
      return;
    }
    if (active.exists && active.get("executionId") !== input.executionId) {
      const prior = await tx.get(
        db.collection("action_executions").doc(active.get("executionId")),
      );
      if (
        !prior.exists ||
        ["Executing", "Needs reconciliation"].includes(prior.get("state")) ||
        (prior.get("attempt_count") > 0 &&
          !["Succeeded", "Failed"].includes(prior.get("state")))
      )
        throw new EditableLayerError(
          "Recover the previous Gmail attempt before preparing another draft for this cycle and channel.",
          409,
        );
    }
    await assertUnclaimedActionExecutionInTransaction(tx, db, actor, input.executionId, {
      actionKey: "gmail.renewal_notice.draft_create",
      actorUid: actor.uid,
      previewHash: input.previewHash,
      contextHash: snapshot.contextHash,
    });
    tx.create(ref, snapshot);
    tx.set(head, {
      leaseId: input.leaseId,
      cycleId: input.cycleId,
      channel: input.channel,
      executionId: input.executionId,
    });
  });
  return snapshot;
}
export async function getMessageDraftSnapshot(
  actor: AuthenticatedUser,
  executionId: string,
  leaseId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  const document = await db
    .collection(MESSAGE_DRAFT_COLLECTIONS.snapshots)
    .doc(executionId)
    .get();
  if (!document.exists)
    throw new EditableLayerError("This saved Gmail attempt was not found.", 404);
  const snapshot = validateSnapshot(document.data() as DraftSnapshot);
  if (
    snapshot.leaseId !== leaseId ||
    snapshot.channel !== channel ||
    snapshot.actorUid !== actor.uid ||
    String(snapshot.preview.action.values.from).toLowerCase() !==
      actor.email.toLowerCase()
  )
    throw new EditableLayerError(
      "Recover this attempt while signed in as its original managed sender.",
      403,
    );
  const execution = await getActionExecution(actor, executionId, db);
  if (
    execution.preview_hash !== snapshot.previewHash ||
    execution.context_hash !== snapshot.contextHash
  )
    throw new EditableLayerError(
      "The saved Gmail attempt differs from its execution record.",
      409,
    );
  return { snapshot, execution };
}
export async function getCurrentMessageDraft(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  const head = await db
    .collection(MESSAGE_DRAFT_COLLECTIONS.head)
    .doc(headId(leaseId, cycleId, channel))
    .get();
  if (!head.exists) return null;
  try {
    const { snapshot, execution } = await getMessageDraftSnapshot(
      actor,
      head.get("executionId"),
      leaseId,
      channel,
      db,
    );
    return {
      executionId: snapshot.executionId,
      state: execution.state,
      recoveryAvailable: true,
      outcome: snapshot.outcome ?? null,
      preview: {
        subject: snapshot.preview.subject,
        body: snapshot.preview.body,
        htmlBody: snapshot.preview.htmlBody ?? null,
        recipient: snapshot.preview.recipient,
        previewHash: snapshot.previewHash,
      },
    };
  } catch (error) {
    if (
      error instanceof EditableLayerError &&
      (error.status === 403 || error.status === 404)
    )
      return {
        executionId: head.get("executionId") as string,
        state: "Needs original sender",
        recoveryAvailable: false,
        outcome: null,
        preview: null,
      };
    throw error;
  }
}
/** Previous cycles retain recoverable attempts. A new cycle never erases an uncertain mailbox effect. */
export async function getPreviousMessageDrafts(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  channel: "owner" | "tenant",
  db: Firestore = getAdminFirestore(),
) {
  const heads = await db
    .collection(MESSAGE_DRAFT_COLLECTIONS.head)
    .where("leaseId", "==", leaseId)
    .get();
  const previous = heads.docs.filter(
    (doc) => doc.get("cycleId") !== cycleId && doc.get("channel") === channel,
  );
  const attempts = await Promise.all(
    previous.map(async (doc) => {
      const attempt = await getCurrentMessageDraft(
        actor,
        leaseId,
        doc.get("cycleId"),
        channel,
        db,
      );
      return attempt ? { ...attempt, cycleId: doc.get("cycleId") as string } : null;
    }),
  );
  return attempts.filter(
    (attempt): attempt is NonNullable<typeof attempt> =>
      !!attempt &&
      ["Executing", "Needs reconciliation", "Needs original sender"].includes(
        attempt.state,
      ),
  );
}
export async function recordMessageDraftOutcome(
  actor: AuthenticatedUser,
  leaseId: string,
  channel: "owner" | "tenant",
  outcome: RenewalNoticeDraftOutcome,
  db: Firestore = getAdminFirestore(),
) {
  assertWriter(actor);
  if (!("executionId" in outcome)) return;
  const { execution } = await getMessageDraftSnapshot(
    actor,
    outcome.executionId,
    leaseId,
    channel,
    db,
  );
  if (
    (outcome.status === "created" ||
      (outcome.status === "reconciliation" && outcome.resolution === "created")) &&
    (execution.state !== "Succeeded" ||
      !execution.result_code?.startsWith("external_receipt:succeeded:"))
  )
    throw new EditableLayerError(
      "The Gmail outcome has no successful execution receipt.",
      409,
    );
  const ref = db.collection(MESSAGE_DRAFT_COLLECTIONS.snapshots).doc(outcome.executionId);
  await db.runTransaction(async (tx) => {
    const [latest, ledger] = await Promise.all([
      tx.get(ref),
      tx.get(db.collection("action_executions").doc(outcome.executionId)),
    ]);
    if (!latest.exists)
      throw new EditableLayerError("The exact saved attempt is missing.", 409);
    const stored = validateSnapshot(latest.data() as DraftSnapshot);
    const successful = (value: RenewalNoticeDraftOutcome | undefined) =>
      value?.status === "created" ||
      (value?.status === "reconciliation" && value.resolution === "created");
    if (successful(stored.outcome) && !successful(outcome)) return;
    if (
      successful(outcome) &&
      (ledger.get("state") !== "Succeeded" ||
        !String(ledger.get("result_code") ?? "").startsWith(
          "external_receipt:succeeded:",
        ))
    )
      throw new EditableLayerError(
        "The Gmail outcome has no successful execution receipt.",
        409,
      );
    tx.update(ref, { outcome });
  });
}
