import type { DocumentData, DocumentSnapshot, Firestore } from "firebase-admin/firestore";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  assertClaimedActionExecutionInTransaction,
  assertUnclaimedActionExecutionInTransaction,
} from "@/lib/firestore/action-executions";
import {
  hashGmailLabelSnapshot,
  isGmailGovernedLabel,
  type GmailLabelEffectSnapshot,
  type GmailLabelSnapshotDraft,
} from "@/lib/gmail-hub/label-contract";
import { GMAIL_HUB_ACTIONS } from "@/lib/gmail-hub/action-keys";

/**
 * Durable companion ledger for the `gmail.label.apply` execution contract.
 *
 * The snapshot exists because the S20 record alone cannot answer two questions after a crash:
 * which governed label set the thread held BEFORE the effect (required to restore it), and whether
 * the provider mutation was ever actually started. Both are written under the same transactional
 * fences the Vendor lifecycle uses, so the snapshot cannot be forged into existence after the fact
 * and cannot be created for an execution that is already claimed.
 *
 * Direct client writes are denied: this collection is unlisted in `firestore.rules`, which ends in
 * a `match /{document=**}` deny-all, so only the Admin SDK reaches it.
 */
export const GMAIL_LABEL_EFFECT_COLLECTION = "gmail_label_effects" as const;

export interface GmailLabelEffectStore {
  /** Persist the immutable pre-effect snapshot; refuses once the S20 attempt is claimed. */
  persistPrepared(
    actor: AuthenticatedUser,
    draft: GmailLabelSnapshotDraft,
  ): Promise<GmailLabelEffectSnapshot>;
  /** Mark that the provider mutation is about to start; requires the exact claimed S20 attempt. */
  markProviderStarted(
    actor: AuthenticatedUser,
    input: { s20ExecutionId: string; snapshotHash: string; claimActorUid: string },
  ): Promise<GmailLabelEffectSnapshot>;
  /** Record the observed governed label set after a settled terminal transition. */
  markSettled(input: {
    s20ExecutionId: string;
    snapshotHash: string;
    observedGovernedLabelIds: readonly string[];
  }): Promise<GmailLabelEffectSnapshot>;
  get(s20ExecutionId: string): Promise<GmailLabelEffectSnapshot | null>;
}

export class FirestoreGmailLabelEffectStore implements GmailLabelEffectStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async persistPrepared(
    actor: AuthenticatedUser,
    draft: GmailLabelSnapshotDraft,
  ): Promise<GmailLabelEffectSnapshot> {
    const snapshotHash = hashGmailLabelSnapshot(draft);
    const record: GmailLabelEffectSnapshot = {
      ...draft,
      priorGovernedLabelIds: [...draft.priorGovernedLabelIds],
      priorGovernedLabels: [...draft.priorGovernedLabels],
      state: "prepared",
      snapshotHash,
    };
    const ref = this.ref(draft.s20ExecutionId);

    await this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) {
        // A re-prepare of the identical effect is normal (a reload, a second operator). Only an
        // attempt to rebind the SAME execution id to different immutable facts is a conflict.
        const current = readSnapshot(existing);
        if (current.snapshotHash !== snapshotHash) {
          throw new EditableLayerError(
            "This governed label execution is already bound to a different effect.",
            409,
          );
        }
        return;
      }
      await assertUnclaimedActionExecutionInTransaction(
        transaction,
        this.db,
        actor,
        draft.s20ExecutionId,
        binding(record),
      );
      transaction.create(ref, record);
    });

    return this.require(draft.s20ExecutionId);
  }

  async markProviderStarted(
    actor: AuthenticatedUser,
    input: { s20ExecutionId: string; snapshotHash: string; claimActorUid: string },
  ): Promise<GmailLabelEffectSnapshot> {
    const ref = this.ref(input.s20ExecutionId);
    await this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (!existing.exists) {
        throw new EditableLayerError(
          "The governed label effect snapshot is unavailable; prepare it again.",
          409,
        );
      }
      const current = readSnapshot(existing);
      assertSnapshotHash(current, input.snapshotHash);
      // Proves the provider start is downstream of the one atomic S20 claim, by the exact claimant.
      // A delayed or out-of-band call therefore cannot turn a preparation into a Live effect.
      await assertClaimedActionExecutionInTransaction(
        transaction,
        this.db,
        input.s20ExecutionId,
        binding(current),
        input.claimActorUid,
      );
      if (current.state === "prepared") {
        transaction.update(ref, {
          state: "provider_started",
          providerStartedAt: new Date().toISOString(),
        });
      }
      void actor;
    });
    return this.require(input.s20ExecutionId);
  }

  async markSettled(input: {
    s20ExecutionId: string;
    snapshotHash: string;
    observedGovernedLabelIds: readonly string[];
  }): Promise<GmailLabelEffectSnapshot> {
    const ref = this.ref(input.s20ExecutionId);
    const observed = [...new Set(input.observedGovernedLabelIds)].sort();
    await this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (!existing.exists) {
        throw new EditableLayerError(
          "The governed label effect snapshot is unavailable for settlement.",
          409,
        );
      }
      const current = readSnapshot(existing);
      assertSnapshotHash(current, input.snapshotHash);
      if (current.state === "prepared") {
        throw new EditableLayerError(
          "A governed label effect cannot settle before its provider start is recorded.",
          409,
        );
      }
      if (current.state === "settled") {
        if (
          JSON.stringify([...(current.observedGovernedLabelIds ?? [])].sort()) !==
          JSON.stringify(observed)
        ) {
          throw new EditableLayerError(
            "The governed label effect already settled with a different observed label set.",
            409,
          );
        }
        return;
      }
      transaction.update(ref, {
        state: "settled",
        settledAt: new Date().toISOString(),
        observedGovernedLabelIds: observed,
      });
    });
    return this.require(input.s20ExecutionId);
  }

  async get(s20ExecutionId: string): Promise<GmailLabelEffectSnapshot | null> {
    const snapshot = await this.ref(s20ExecutionId).get();
    return snapshot.exists ? readSnapshot(snapshot) : null;
  }

  private async require(s20ExecutionId: string): Promise<GmailLabelEffectSnapshot> {
    const record = await this.get(s20ExecutionId);
    if (!record) {
      throw new EditableLayerError(
        "The governed label effect snapshot was not persisted.",
        409,
      );
    }
    return record;
  }

  private ref(s20ExecutionId: string) {
    if (!/^exec_[a-f0-9]{40}$/.test(s20ExecutionId)) {
      throw new EditableLayerError("The S20 execution identity is invalid.", 409);
    }
    return this.db.collection(GMAIL_LABEL_EFFECT_COLLECTION).doc(s20ExecutionId);
  }
}

function binding(snapshot: GmailLabelEffectSnapshot) {
  return {
    actionKey: snapshot.actionKey,
    actorUid: snapshot.actorUid,
    contextHash: snapshot.contextHash,
    previewHash: snapshot.previewHash,
  };
}

function assertSnapshotHash(snapshot: GmailLabelEffectSnapshot, expected: string) {
  if (snapshot.snapshotHash !== expected) {
    throw new EditableLayerError(
      "The governed label effect snapshot does not match this execution.",
      409,
    );
  }
}

/**
 * Strict read. A stored snapshot whose recomputed hash disagrees with its persisted hash, or whose
 * enum fields drifted, is refused rather than used to authorize a restore against the wrong set.
 */
function readSnapshot(
  snapshot: DocumentSnapshot<DocumentData>,
): GmailLabelEffectSnapshot {
  const data = snapshot.data();
  if (
    !data ||
    data.schemaVersion !== 1 ||
    data.actionKey !== GMAIL_HUB_ACTIONS.label ||
    (data.kind !== "apply" && data.kind !== "restore") ||
    typeof data.actorUid !== "string" ||
    typeof data.mailboxKeyHash !== "string" ||
    typeof data.linkId !== "string" ||
    typeof data.threadId !== "string" ||
    typeof data.labelId !== "string" ||
    typeof data.ruleRef !== "string" ||
    typeof data.reasonHash !== "string" ||
    typeof data.previewHash !== "string" ||
    typeof data.contextHash !== "string" ||
    typeof data.createdAt !== "string" ||
    typeof data.snapshotHash !== "string" ||
    data.s20ExecutionId !== snapshot.id ||
    !isGmailGovernedLabel(data.label) ||
    (data.dataMode !== "live" && data.dataMode !== "test") ||
    !["prepared", "provider_started", "settled"].includes(String(data.state)) ||
    !isStringArray(data.priorGovernedLabelIds) ||
    !isStringArray(data.priorGovernedLabels) ||
    !data.priorGovernedLabels.every(isGmailGovernedLabel)
  ) {
    throw new EditableLayerError("The governed label effect snapshot is malformed.", 409);
  }
  const record = data as unknown as GmailLabelEffectSnapshot;
  if (hashGmailLabelSnapshot(record) !== record.snapshotHash) {
    throw new EditableLayerError(
      "The governed label effect snapshot failed its integrity check.",
      409,
    );
  }
  return record;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
