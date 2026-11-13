import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  getRenewalWorkspace,
  recordRecommendationMarketValue,
  recordWorkspaceSourceStatus,
  recordWorkspaceSourceStatuses,
} from "@/lib/firestore/renewal-workspace";
import { getRenewalWorkingRecord } from "@/lib/firestore/renewal-working-record";
import {
  MARKET_VALUE_WORDS,
  marketValueBindingCurrent,
  marketValueSheetIntent,
  marketValueSource,
  recommendationBinding,
} from "@/lib/lease-renewal/market-value-source";
import {
  isManualSheetReference,
  manualSheetReference,
  manualSheetSetHash,
  manualSheetSetReference,
  parseManualSheetReference,
} from "@/lib/lease-renewal/sheet-writeback/manual-reference";
import {
  SHEET_SET_WORDS,
  sheetFieldLabel,
  takeSheetSet,
} from "@/lib/lease-renewal/sheet-writeback/set-words";
import {
  requireEnvironmentDescriptor,
  assertMutationAllowed,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { FirestoreExternalExecutionStore } from "@/lib/firestore/external-action-executions";
import {
  assembleSheetProposal,
  assembleSheetProposalSet,
} from "@/lib/lease-renewal/sheet-writeback/prepare";
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

const STAFF_FACT_CHANGED =
  "This staff fact or renewal cycle changed. Prepare its current Sheet update before confirming.";

type WorkspaceSourceEntry = NonNullable<
  Awaited<ReturnType<typeof getRenewalWorkspace>>
>["sourceUpdates"][string];

/**
 * Staff events can authorize only their still-current prepared intent, never any provider receipt.
 * S278 R-S278-4: a lease row's listed cells are bound to the ordered set of their recorded events,
 * each still prepared for this proposal with the exact intent it previews.
 */
export async function assertManualSheetProposalCurrent(
  actor: AuthenticatedUser,
  proposal: SheetWritebackProposal,
) {
  if (!isManualSheetReference(proposal.evidenceRef)) return;
  const reference = parseManualSheetReference(proposal.evidenceRef);
  if (
    !reference ||
    reference.leaseId !== proposal.scope.leaseId ||
    proposal.scope.kind !== "lease_workspace"
  )
    throw new EditableLayerError("The recorded source-update identity is invalid.", 409);
  const state = await getRenewalWorkspace(actor, proposal.scope.leaseId);
  if (!state || state.cycleId !== reference.cycleId)
    throw new EditableLayerError(STAFF_FACT_CHANGED, 409);
  if (reference.kind === "single" && proposal.effects.length !== 1)
    throw new EditableLayerError(STAFF_FACT_CHANGED, 409);
  const entries: { field: string; eventId: string; entry: WorkspaceSourceEntry }[] = [];
  for (const validated of proposal.effects) {
    const effect = validated.effect;
    const entry =
      effect.kind === "field_update" && effect.staffIntent
        ? state.sourceUpdates[effect.staffIntent.field]
        : undefined;
    if (
      !entry ||
      effect.kind !== "field_update" ||
      !effect.staffIntent ||
      entry.proposalId !== proposal.generationId ||
      hashExecutionPreview(entry.intent) !== hashExecutionPreview(effect.staffIntent)
    )
      throw new EditableLayerError(STAFF_FACT_CHANGED, 409);
    entries.push({ field: effect.staffIntent.field, eventId: entry.eventId, entry });
  }
  if (
    (reference.kind === "single" && entries[0]?.eventId !== reference.eventId) ||
    (reference.kind === "set" && manualSheetSetHash(entries) !== reference.setHash)
  )
    throw new EditableLayerError(STAFF_FACT_CHANGED, 409);
  for (const { field, entry } of entries) {
    // S248 R-S248-11: a value from the app's confirmed send stays bound to that message. Once
    // staff said "This was not the renewal outreach", its Sheet update cannot be confirmed.
    if (
      entry.derivedFrom &&
      (await derivedOutreachCorrected(entry.derivedFrom.occurrenceId))
    )
      throw new EditableLayerError(
        "That message no longer counts as the renewal outreach. Nothing was sent to the Sheet.",
        409,
      );
    // S278 R-S278-1: the Market value is the reviewed Rent to recommend it was prepared from. The
    // retired comparison figure never reaches the Sheet, and a changed recommendation refuses.
    if (field === "market_value") {
      if (!entry.fromRecommendation)
        throw new EditableLayerError(MARKET_VALUE_WORDS.retired, 409);
      await assertRecommendationCurrent(actor, proposal.scope.leaseId, state, entry);
    }
  }
}

/** S278 R-S278-1: the server's own read of the Market value source for the lease's cycle. */
async function readMarketValueSource(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
) {
  const [record, outreach] = await Promise.all([
    getRenewalWorkingRecord(actor, leaseId),
    readLeaseOutreachEvidence(leaseId),
  ]);
  return marketValueSource({ record, outreach, cycleId });
}

async function assertRecommendationCurrent(
  actor: AuthenticatedUser,
  leaseId: string,
  state: { readonly cycleId: string },
  entry: WorkspaceSourceEntry,
) {
  const source = await readMarketValueSource(actor, leaseId, state.cycleId);
  if (
    !entry.fromRecommendation ||
    !marketValueBindingCurrent(entry.fromRecommendation, entry.intent.value, source)
  )
    throw new EditableLayerError(MARKET_VALUE_WORDS.changed, 409);
}

/** S278 R-S278-1: the deterministic event identity of the Market value one recommendation prepares. */
export function recommendationMarketValueEventId(
  cycleId: string,
  binding: { field: string; revision: number; eventId: string },
): string {
  const hex = createHash("sha256")
    .update(
      `s278-market-value:${cycleId}:${binding.field}:${binding.revision}:${binding.eventId}`,
    )
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/**
 * S278 R-S278-1: record, never execute, the Market value the reviewed recommendation prepares. The
 * value, its basis and its binding are re-derived here from the server's own reads; nothing the
 * browser sends supplies them. Without a reviewed recommendation nothing is recorded.
 */
async function recordReviewedMarketValue(
  actor: AuthenticatedUser,
  input: { leaseId: string; cycleId: string },
) {
  const source = await readMarketValueSource(actor, input.leaseId, input.cycleId);
  if (source.kind !== "reviewed")
    throw new EditableLayerError(MARKET_VALUE_WORDS.notReviewed, 409);
  const binding = recommendationBinding(source.recommendation);
  const eventId = recommendationMarketValueEventId(input.cycleId, binding);
  const state = await recordRecommendationMarketValue(actor, {
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    eventId,
    intent: marketValueSheetIntent(source.recommendation),
    fromRecommendation: binding,
  });
  return { state, eventId };
}

/**
 * S278 R-S278-1: prepare, never execute, the Market value update from the reviewed current-cycle
 * recommendation, through the same single exact preview and confirmation as any recorded fact.
 */
export async function prepareMarketValueSheetUpdate(
  actor: AuthenticatedUser,
  input: { leaseId: string; cycleId: string },
) {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (isOperatingSheetWritebackPaused())
    throw new EditableLayerError(
      "Saved in app; Sheet updates paused. No proposal was created.",
      409,
    );
  const { state, eventId } = await recordReviewedMarketValue(actor, input);
  const entry = state.sourceUpdates.market_value;
  if (entry?.state === "verified" && entry.eventId !== eventId) return state;
  return prepareWorkspaceSheetUpdate(actor, {
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    field: "market_value",
    eventId: entry?.eventId ?? eventId,
  });
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
  const reference = parseManualSheetReference(proposal.evidenceRef);
  if (!reference) return { state: "not_linked" as const };
  if (
    proposal.effects.length === 0 ||
    proposal.effects.some(
      (effect) => effect.effect.kind !== "field_update" || !effect.effect.staffIntent,
    )
  )
    return { state: "not_linked" as const };
  // S278 R-S278-4: each cell's own receipt marks its own fact read back, cell by cell.
  const store = new FirestoreExternalExecutionStore();
  const verified: {
    field: string;
    executionId: string;
    createdAt: string;
  }[] = [];
  for (const effect of proposal.effects) {
    if (effect.effect.kind !== "field_update" || !effect.effect.staffIntent) continue;
    const executionId = sheetWritebackExecutionId(proposal, effect);
    const record = await store.get(executionId);
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
      continue;
    verified.push({
      field: effect.effect.staffIntent.field,
      executionId,
      createdAt: record.receipt.createdAt,
    });
  }
  if (verified.length === 0) return { state: "pending" as const };
  await assertManualSheetProposalCurrent(actor, proposal);
  const state = await getRenewalWorkspace(actor, proposal.scope.leaseId);
  await recordWorkspaceSourceStatuses(actor, {
    leaseId: proposal.scope.leaseId,
    cycleId: reference.cycleId,
    updates: verified.map((item) => ({
      field: item.field,
      eventId:
        reference.kind === "single"
          ? reference.eventId
          : (state?.sourceUpdates[item.field]?.eventId ?? ""),
      update: {
        state: "verified" as const,
        proposalId: proposal.generationId,
        executionId: item.executionId,
        reason: `Read back after the confirmed update at ${item.createdAt}.`,
        receiptAt: item.createdAt,
      },
    })),
  });
  return verified.length === proposal.effects.length
    ? { state: "verified" as const }
    : { state: "pending" as const };
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
  // S278 R-S278-1: the comparison figure no longer feeds the Sheet; Market value is prepared from
  // the reviewed Rent to recommend only.
  if (input.field === "market_value" && !entry.fromRecommendation)
    throw new EditableLayerError(MARKET_VALUE_WORDS.retired, 409);
  const evidenceRef = manualSheetReference(input.leaseId, input.cycleId, input.eventId);
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
    if (active && (await activeSheetProposalBlocks(active, [input.field])))
      throw new EditableLayerError(ANOTHER_PROPOSAL_OPEN, 409);
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

const ANOTHER_PROPOSAL_OPEN =
  "Another Sheet proposal still needs review or recovery. This recorded value stays pending without replacing it.";

/**
 * Whether the lease's open Sheet proposal blocks preparing the listed fields. An attempt still
 * running or uncertain always blocks: it keeps its own recovery. A proposal never attempted is
 * replaced only when it was prepared from recorded staff facts and every one of its fields is
 * being prepared again; any other untouched proposal stays open ("Finish or discard the open
 * update first"). S278 R-S278-5: once a combined run stopped, nothing of it runs again, so a
 * fresh preview may replace it.
 */
async function activeSheetProposalBlocks(
  active: SheetWritebackProposal,
  fields: readonly string[],
): Promise<boolean> {
  const store = new FirestoreExternalExecutionStore();
  const records = await Promise.all(
    active.effects.map((effect) => store.get(sheetWritebackExecutionId(active, effect))),
  );
  const untouched = (record: (typeof records)[number]) =>
    !record || (record.state === "ready" && record.attemptCount === 0);
  if (
    records.some(
      (record) =>
        record !== null &&
        !untouched(record) &&
        !["succeeded", "failed"].includes(record.state),
    )
  )
    return true;
  if (records.every(untouched)) {
    const activeFields = active.effects.map((effect) =>
      effect.effect.kind === "field_update"
        ? effect.effect.staffIntent?.field
        : undefined,
    );
    return !(
      isManualSheetReference(active.evidenceRef) &&
      activeFields.every((field) => field !== undefined && fields.includes(field))
    );
  }
  // Some cells settled. A single update has none left; a stopped combined run never resumes.
  return false;
}

/** S278 R-S278-4: what preparing a lease row's listed cells together did, by field. */
export interface PreparedSheetSet {
  readonly state: Awaited<ReturnType<typeof getRenewalWorkspace>>;
  readonly prepared: readonly string[];
  readonly leftOut: readonly { field: string; message: string }[];
  readonly remaining: number;
  readonly error?: string;
}

/**
 * S278 R-S278-4: prepare, never execute, one proposal for the lease's one existing row holding
 * the listed recorded Sheet cells (at most ten, the first ten in list order). The reviewed Market
 * value joins the list when asked for and the recommendation is reviewed. Each listed cell keeps
 * its own recorded fact; the proposal binds the ordered set of them. A cell the fresh read refuses
 * keeps its own recovery on its row; a field with its own selected cell stays pending for its own
 * review.
 */
export async function prepareWorkspaceSheetUpdateSet(
  actor: AuthenticatedUser,
  input: {
    leaseId: string;
    cycleId: string;
    entries: readonly { field: SheetEditableField; eventId: string }[];
    marketValue: boolean;
  },
): Promise<PreparedSheetSet> {
  assertMutationAllowed(requireEnvironmentDescriptor());
  if (isOperatingSheetWritebackPaused())
    throw new EditableLayerError(
      "Saved in app; Sheet updates paused. No proposal was created.",
      409,
    );
  const requested = [...input.entries];
  if (input.marketValue) {
    const { state: recorded } = await recordReviewedMarketValue(actor, input);
    const entry = recorded.sourceUpdates.market_value;
    if (
      entry &&
      entry.state !== "verified" &&
      !requested.some((item) => item.field === "market_value")
    )
      requested.push({ field: "market_value", eventId: entry.eventId });
  }
  const state = await getRenewalWorkspace(actor, input.leaseId);
  if (!state || state.cycleId !== input.cycleId)
    throw new EditableLayerError(
      "This recorded source update changed. Reload the current activity.",
      409,
    );
  for (const item of requested) {
    const entry = state.sourceUpdates[item.field];
    if (!entry || entry.eventId !== item.eventId || entry.state === "verified")
      throw new EditableLayerError(
        "This recorded source update changed. Reload the current activity.",
        409,
      );
    if (item.field === "market_value" && !entry.fromRecommendation)
      throw new EditableLayerError(MARKET_VALUE_WORDS.retired, 409);
  }
  const { taken, remaining } = takeSheetSet(requested);
  if (taken.length < 2) throw new EditableLayerError(SHEET_SET_WORDS.needsTwo, 409);
  const spreadsheetId = liveOperatingSheetId();
  if (!spreadsheetId)
    throw new EditableLayerError(
      "The operating Sheet is not connected. The staff record is saved; these updates remain pending.",
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
    active &&
    (await activeSheetProposalBlocks(
      active,
      taken.map((item) => item.field),
    ))
  )
    return {
      state,
      prepared: [],
      leftOut: [],
      remaining: remaining.length,
      error: ANOTHER_PROPOSAL_OPEN,
    };
  const eventOf = new Map<string, string>(
    taken.map((item) => [item.field, item.eventId]),
  );
  const { proposal, leftOut } = await assembleSheetProposalSet(
    actor,
    spreadsheetId,
    input.leaseId,
    taken.map((item) => state.sourceUpdates[item.field]!.intent),
    (fields) =>
      fields.length === 1
        ? manualSheetReference(input.leaseId, input.cycleId, eventOf.get(fields[0]!)!)
        : manualSheetSetReference(
            input.leaseId,
            input.cycleId,
            fields.map((field) => ({ field, eventId: eventOf.get(field)! })),
          ),
  );
  if (proposal)
    await saveSheetWritebackProposal(actor, proposal, scope, active?.previewHash ?? null);
  const preparedFields = (proposal?.effects ?? []).flatMap((effect) =>
    effect.effect.kind === "field_update" && effect.effect.staffIntent
      ? [effect.effect.staffIntent.field]
      : [],
  );
  await recordWorkspaceSourceStatuses(actor, {
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    updates: [
      ...preparedFields.map((field) => ({
        field,
        eventId: eventOf.get(field)!,
        update: {
          state: "prepared" as const,
          proposalId: proposal!.generationId,
          reason:
            preparedFields.length > 1
              ? `Review the ${preparedFields.length} prepared Sheet updates together and confirm them once.`
              : "Review and separately confirm the prepared Sheet update.",
        },
      })),
      ...leftOut
        .filter((item) => item.kind === "refused")
        .map((item) => ({
          field: item.field,
          eventId: eventOf.get(item.field)!,
          update: { state: "unavailable" as const, reason: item.message },
        })),
    ],
  });
  return {
    state: await getRenewalWorkspace(actor, input.leaseId),
    prepared: preparedFields.map(sheetFieldLabel),
    leftOut: leftOut.map((item) => ({
      field: sheetFieldLabel(item.field),
      message: item.message,
    })),
    remaining: remaining.length,
  };
}
