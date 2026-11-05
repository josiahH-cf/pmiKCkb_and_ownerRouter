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
import { isOperatingSheetWritebackPaused } from "@/lib/lease-renewal/sheet-writeback-policy";
import { sheetRuntimeBindingMatches } from "@/lib/lease-renewal/sheet-writeback/runtime-binding";
import { createHash } from "node:crypto";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { recordDerivedSourceUpdate } from "@/lib/firestore/renewal-workspace";
import {
  RENEWAL_OUTREACH_RECORD_COLLECTION,
  readLeaseOutreachEvidence,
} from "@/lib/firestore/renewal-outreach-records";
import {
  OUTREACH_ACTIVITY,
  outreachFillFor,
  type OutreachAudience,
} from "@/lib/lease-renewal/outreach-evidence";
import { derivedOutreachSheetIntent } from "@/lib/lease-renewal/workspace-state";

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
  // S248 R-S248-11: a value from the app's confirmed send stays bound to that message. Once staff
  // said "This was not the renewal outreach", its Sheet update cannot be confirmed.
  if (entry.derivedFrom && (await derivedOutreachCorrected(entry.derivedFrom.occurrenceId)))
    throw new EditableLayerError(
      "That message no longer counts as the renewal outreach. Nothing was sent to the Sheet.",
      409,
    );
}
/** True when staff removed the derived outreach record this Sheet value came from. */
async function derivedOutreachCorrected(occurrenceId: string): Promise<boolean> {
  const record = await getAdminFirestore()
    .collection(RENEWAL_OUTREACH_RECORD_COLLECTION)
    .doc(occurrenceId)
    .get();
  return record.exists && record.get("correction") != null;
}
/** S248 R-S248-11: the deterministic event identity of the value one derived record prepares. */
export function derivedSourceEventId(occurrenceId: string): string {
  const hex = createHash("sha256")
    .update(`s248-derived-outreach:${occurrenceId}`)
    .digest("hex");
  // Shaped as a version 8 UUID so the existing staff-value identity checks accept it.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
/**
 * S248 R-S248-11: prepare, never execute, the operating Sheet update a derived outreach record
 * holds: the same field and Done the staff record of that activity prepares, bound to the exact
 * message the app's confirmed send recorded. The record is re-derived here from the stored
 * evidence; applying the update keeps its own exact preview, confirmation, one-attempt claim and
 * receipt. Owner outreach has no Sheet column, exactly as for a staff record.
 */
export async function prepareDerivedWorkspaceSheetUpdate(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    audience: OutreachAudience;
    sequenceId: string;
    occurrenceId: string;
  },
) {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (isOperatingSheetWritebackPaused())
    throw new EditableLayerError(
      "Saved in app; Sheet updates paused. No proposal was created.",
      409,
    );
  const activity = OUTREACH_ACTIVITY[input.audience];
  const intent = derivedOutreachSheetIntent(activity);
  if (!intent)
    throw new EditableLayerError(
      "Owner outreach has no operating Sheet column, so there is no Sheet update to prepare.",
      409,
    );
  const state = await getRenewalWorkspace(actor, input.leaseId);
  if (!state || state.cycleId !== input.cycleId)
    throw new EditableLayerError(
      "This lease's work record changed. Reload the current activity.",
      409,
    );
  const evidence = await readLeaseOutreachEvidence(input.leaseId);
  const derived = outreachFillFor(state, { input: evidence, cycleDateIso: null })?.[
    activity
  ];
  if (
    !derived ||
    derived.sequenceId !== input.sequenceId ||
    derived.occurrenceId !== input.occurrenceId
  )
    throw new EditableLayerError(
      "That message no longer records this step. Reload the lease.",
      409,
    );
  const eventId = derivedSourceEventId(input.occurrenceId);
  await recordDerivedSourceUpdate(actor, {
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    eventId,
    intent,
    derivedFrom: { sequenceId: input.sequenceId, occurrenceId: input.occurrenceId },
  });
  return prepareWorkspaceSheetUpdate(actor, {
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    field: intent.field,
    eventId,
  });
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
  if (isOperatingSheetWritebackPaused())
    throw new EditableLayerError(
      "Saved in app; Sheet updates paused. No proposal was created.",
      409,
    );
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
      sheetRuntimeBindingMatches(active.runtimeBinding) &&
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
