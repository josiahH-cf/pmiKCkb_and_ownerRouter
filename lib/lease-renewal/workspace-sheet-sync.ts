import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  getRenewalWorkspace,
  recordWorkspaceSourceStatus,
} from "@/lib/firestore/renewal-workspace";
import {
  requireEnvironmentDescriptor,
  assertMutationAllowed,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import { assembleSheetProposal } from "@/lib/lease-renewal/sheet-writeback/prepare";
import {
  liveOperatingSheetId,
  OPERATING_SHEET_TAB,
} from "@/lib/lease-renewal/sheet-writeback/live";
import {
  getSheetWritebackProposal,
  saveSheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import {
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import type { SheetEditableField } from "@/lib/lease-renewal/sheet-writeback/field-intent";

const MANUAL_REFERENCE =
  /^workspace:([1-9]\d*):cycle:([a-f0-9-]{36}):manual:([a-f0-9-]{36})$/;
/** Staff events can authorize only their still-current prepared intent, never any provider receipt. */
export async function assertManualSheetProposalCurrent(
  actor: AuthenticatedUser,
  proposal: SheetWritebackProposal,
) {
  if (!proposal.evidenceRef.includes(":manual:")) return;
  const match = MANUAL_REFERENCE.exec(proposal.evidenceRef);
  if (
    !match ||
    match[1] !== proposal.scope.leaseId ||
    proposal.scope.kind !== "lease_workspace"
  )
    throw new EditableLayerError("The recorded source-update identity is invalid.", 409);
  const state = await getRenewalWorkspace(actor, proposal.scope.leaseId);
  const effect = proposal.effects[0]?.effect;
  const entry =
    effect?.kind === "field_update" && effect.staffIntent
      ? state?.sourceUpdates[effect.staffIntent.field]
      : null;
  if (
    !state ||
    state.cycleId !== match[2] ||
    !entry ||
    entry.eventId !== match[3] ||
    entry.proposalId !== proposal.generationId ||
    effect.kind !== "field_update" ||
    !effect.staffIntent ||
    hashExecutionPreview(entry.intent) !== hashExecutionPreview(effect.staffIntent)
  )
    throw new EditableLayerError(
      "This staff fact or renewal cycle changed. Prepare its current Sheet update before confirming.",
      409,
    );
}
/** Receipt lookup uses the real execution store. Matching provider values alone never settle this. */
export async function syncManualSheetReceipt(
  actor: AuthenticatedUser,
  proposal: SheetWritebackProposal,
) {
  const match = MANUAL_REFERENCE.exec(proposal.evidenceRef);
  if (!match) return { state: "not_linked" as const };
  const effect = proposal.effects[0];
  if (effect?.effect.kind !== "field_update" || !effect.effect.staffIntent)
    return { state: "not_linked" as const };
  const executionId = sheetWritebackExecutionId(proposal, effect);
  const record = await new FirestoreExternalExecutionStore().get(executionId);
  if (
    record?.state !== "succeeded" ||
    record.id !== executionId ||
    record.idempotencyKey !== executionId ||
    record.previewHash !== proposal.previewHash ||
    record.contextHash !== proposal.previewHash ||
    record.dataMode !== "live" ||
    record.actionKey !== effect.actionKey ||
    !record.receipt ||
    record.receipt.actionKey !== effect.actionKey
  )
    return { state: "pending" as const };
  await assertManualSheetProposalCurrent(actor, proposal);
  await recordWorkspaceSourceStatus(actor, {
    leaseId: proposal.scope.leaseId,
    cycleId: match[2],
    field: effect.effect.staffIntent.field,
    eventId: match[3],
    update: {
      state: "verified",
      proposalId: proposal.generationId,
      executionId,
      reason: `Read back after the confirmed update at ${record.receipt.createdAt}.`,
    },
  });
  return { state: "verified" as const };
}
/** Prepare, never execute, the value already recorded by staff. Unrelated unfinished proposals stay put. */
export async function prepareWorkspaceSheetUpdate(
  actor: AuthenticatedUser,
  input: { leaseId: string; cycleId: string; field: SheetEditableField; eventId: string },
) {
  assertMutationAllowed(requireEnvironmentDescriptor());
  const state = await getRenewalWorkspace(actor, input.leaseId),
    entry = state?.sourceUpdates[input.field];
  if (
    !state ||
    state.cycleId !== input.cycleId ||
    !entry ||
    entry.eventId !== input.eventId
  )
    throw new EditableLayerError(
      "This recorded source update changed. Reload the current activity.",
      409,
    );
  if (entry.state === "verified") return state;
  const evidenceRef = `workspace:${input.leaseId}:cycle:${input.cycleId}:manual:${input.eventId}`;
  try {
    const spreadsheetId = liveOperatingSheetId();
    if (!spreadsheetId)
      throw new EditableLayerError(
        "The operating Sheet is not connected. The staff record is saved; this update remains pending.",
        409,
      );
    const scope = { kind: "lease_workspace" as const, leaseId: input.leaseId };
    const active = await getSheetWritebackProposal(
      actor,
      spreadsheetId,
      OPERATING_SHEET_TAB,
      scope,
    );
    if (
      active?.evidenceRef === evidenceRef &&
      Date.parse(active.confirmationExpiresAtIso) > Date.now()
    ) {
      await recordWorkspaceSourceStatus(actor, {
        ...input,
        update: {
          state: "prepared",
          proposalId: active.generationId,
          reason: "Review and separately confirm the prepared Sheet update.",
        },
      });
      await syncManualSheetReceipt(actor, active);
      return await getRenewalWorkspace(actor, input.leaseId);
    }
    if (active) {
      const store = new FirestoreExternalExecutionStore();
      const records = await Promise.all(
        active.effects.map((effect) =>
          store.get(sheetWritebackExecutionId(active, effect)),
        ),
      );
      const oldManual = MANUAL_REFERENCE.exec(active.evidenceRef);
      const sameManualField = Boolean(
        oldManual &&
        active.effects.length === 1 &&
        active.effects[0].effect.kind === "field_update" &&
        active.effects[0].effect.staffIntent?.field === input.field,
      );
      const unattemptedManual =
        sameManualField &&
        records.every(
          (record) => !record || (record.state === "ready" && record.attemptCount === 0),
        );
      if (
        !unattemptedManual &&
        records.some(
          (record) => !record || !["succeeded", "failed"].includes(record.state),
        )
      )
        throw new EditableLayerError(
          "Another Sheet proposal still needs review or recovery. This recorded value stays pending without replacing it.",
          409,
        );
    }
    const proposal = await assembleSheetProposal(
      actor,
      spreadsheetId,
      input.leaseId,
      "update_field",
      entry.intent,
      evidenceRef,
    );
    await saveSheetWritebackProposal(actor, proposal, scope, active?.previewHash ?? null);
    await recordWorkspaceSourceStatus(actor, {
      ...input,
      update: {
        state: "prepared",
        proposalId: proposal.generationId,
        reason: "Review and separately confirm the prepared Sheet update.",
      },
    });
  } catch (error) {
    const reason =
      error instanceof EditableLayerError
        ? error.message
        : "The recorded value is saved, but its current Sheet target or proposal could not be verified. Retry preparation after reviewing the source.";
    await recordWorkspaceSourceStatus(actor, {
      ...input,
      update: { state: "unavailable", reason },
    });
  }
  return await getRenewalWorkspace(actor, input.leaseId);
}
