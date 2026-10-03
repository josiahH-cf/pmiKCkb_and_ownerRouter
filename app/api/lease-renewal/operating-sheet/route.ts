import {
  assertManualSheetProposalCurrent,
  syncManualSheetReceipt,
} from "@/lib/lease-renewal/workspace-sheet-sync";
import { assembleSheetProposal } from "@/lib/lease-renewal/sheet-writeback/prepare";
import { NextResponse } from "next/server";
import { EditableLayerError } from "@/lib/firestore/errors";
import { postWriteResponse } from "@/lib/lease-renewal/post-write-response";
import { z } from "zod";
import { SheetFieldIntentInputSchema } from "@/lib/lease-renewal/sheet-writeback/field-intent";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { readSheetWorkingRecord } from "@/lib/firestore/renewal-sheet-working-inputs";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
} from "@/lib/operations/runtime-suspension-gate";
import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { invalidateLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { sheetLookupBinding } from "@/lib/lease-renewal/sheet-lookup";
import { readOperatingSheetLookup } from "@/lib/lease-renewal/sheet-lookup-read";
import {
  SheetWritebackService,
  SheetWritebackServiceError,
  type SheetWritebackServiceErrorCode,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  OPERATING_SHEET_TAB,
  assertSheetWritebackV2ExecutionAllowed,
  buildLiveSheetWritebackDeps,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import {
  SheetWritebackContractError,
  type SheetWritebackProposal,
  type ValidatedSheetWritebackEffect,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { clientSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  discardSheetWritebackProposal,
  getSheetWritebackProposal,
  listSheetWritebackProposalHistory,
  saveSheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import {
  SheetWorkspaceContextError,
  verifySheetWorkspaceContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-context";
import {
  SheetWorkspaceResolutionError,
  assertProposalMatchesFreshLeaseContext,
  resolveFreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { loadSheetWritebackEffectStatuses } from "@/lib/lease-renewal/sheet-writeback/status";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const WorkspaceContextSchema = z.string().min(40).max(1_000);
/** GET reads: the durable status (default) or the operator's lookup selection (S158). */
const SHEET_READ_HEADER = "x-renewal-sheet-read";

const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("propose"),
      workspaceContext: WorkspaceContextSchema,
      intent: z.enum([
        "append_missing_row",
        // S160: the current-rent update is prepared from the working current rent. The earlier
        // intent name stays accepted so an open page keeps working; both mean the same thing.
        "update_working_current_rent",
        "update_approved_current_rent",
        "update_field",
        "update_audience_emails",
      ]),
      fieldIntent: SheetFieldIntentInputSchema.optional(),
      /** S116: which audience's email field to prepare from the current lease roster. */
      audience: z.enum(["owner", "tenant"]).optional(),
      /** Optional integrity check: the working current rent the page showed when preparing. */
      expectedCurrentRent: z.number().finite().positive().optional(),
      expectedPriorPreviewHash: HashSchema.nullable(),
    })
    .strict(),
  z
    .object({ operation: z.literal("status"), workspaceContext: WorkspaceContextSchema })
    .strict(),
  z
    .object({ operation: z.literal("lookup"), workspaceContext: WorkspaceContextSchema })
    .strict(),
  z
    .object({
      operation: z.literal("discard"),
      workspaceContext: WorkspaceContextSchema,
      previewHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("execute"),
      workspaceContext: WorkspaceContextSchema,
      previewHash: HashSchema,
      effectHash: HashSchema,
      confirm: z.literal(true),
    })
    .strict(),
  z
    .object({
      operation: z.literal("reconcile"),
      workspaceContext: WorkspaceContextSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_preview"),
      workspaceContext: WorkspaceContextSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_execute"),
      workspaceContext: WorkspaceContextSchema,
      effectHash: HashSchema,
      reversal: z
        .object({
          reversalExecutionId: z.string().min(1).max(300),
          forwardExecutionId: z.string().min(1).max(300),
          previewHash: HashSchema,
          expiresAtIso: z
            .string()
            .min(20)
            .max(40)
            .refine((value) => Number.isFinite(Date.parse(value))),
          kind: z.enum(["delete_appended_row", "restore_field"]),
          currentRowNumber: z.number().int().min(2).optional(),
        })
        .strict(),
      confirm: z.literal(true),
    })
    .strict(),
]);

/** Plain words for each service refusal; the code stays in `error_type` for the panel. */
const SERVICE_MESSAGES: Record<SheetWritebackServiceErrorCode, string> = {
  environment_refused:
    "This environment does not perform live Sheet updates. Nothing was changed.",
  action_closed:
    "This Sheet operation's action key is not open, so nothing was sent. The reviewed value stays visible.",
  flag_disabled:
    "Operating-Sheet updates are off by policy, so nothing was sent. Saved app values are unchanged.",
  runtime_stale:
    "This proposal belongs to an earlier release. Prepare a fresh preview and confirm that one.",
  effect_missing: "This Sheet update is no longer saved. Prepare a fresh preview.",
  execution_missing:
    "No attempt is recorded for this update, so there is nothing to reconcile.",
  execution_state:
    "This Sheet attempt already has a durable outcome. Reconcile or review it; it is not sent again.",
  execution_in_progress:
    "This Sheet attempt is still in progress. Reconcile it once it has settled.",
  claim_refused:
    "This update could not be claimed for one attempt: the proposal, its target or the working value changed. Prepare a fresh preview.",
  provider_read_failed:
    "The operating Sheet could not be read just now, so this update was not sent. Try again shortly.",
  header_drift:
    "The operating tab's header changed since this preview. Prepare a fresh preview from the current read.",
  row_anchor_drift:
    "The Sheet row or cell changed since this preview, so this update was not applied. Prepare a fresh preview from the current read.",
  cas_not_applied:
    "The Sheet cell no longer held the value shown in the preview, so this update was not applied. Prepare a fresh preview.",
  provider_readback_mismatch:
    "The Sheet answered, but the read-back did not match the exact update. Reconcile this attempt before anything else is sent.",
  provider_ambiguous:
    "The Sheet did not confirm this update. It is not sent again; reconcile it from the current Sheet state.",
  reconcile_not_proven:
    "The Sheet now shows the proposed value, but this attempt cannot prove it wrote it. The attempt stays recorded as uncertain; no further Sheet change is made.",
  reconcile_drift:
    "The Sheet changed in a way this attempt did not produce. Review the row in the Sheet; nothing was sent again.",
  reversal_unsupported: "A reversal is not available for this Sheet update.",
  reversal_forward_unproven:
    "This update has no proven result to reverse. Reconcile it first.",
  reversal_target_drift:
    "The Sheet row or cell changed since the update, so no reversal was made.",
  confirmation_invalid:
    "This confirmation does not match the saved preview. Review the current preview and confirm that one.",
  authorization_stale:
    "The Sheet row, value or working value changed after this preview, so this update was not applied. Prepare a fresh preview.",
  provider_capability_unavailable:
    "Google Sheets provides no atomic stable-row delete or restore, so this operation is not available in the app.",
  proof_retired: "Proof operations are retired and cannot run.",
};

function serviceError(code: SheetWritebackServiceError["code"]): never {
  throw new SheetWritebackServiceError(code);
}

async function loadProposalOr404(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  spreadsheetId: string,
  leaseId: string,
): Promise<SheetWritebackProposal> {
  const proposal = await getSheetWritebackProposal(
    user,
    spreadsheetId,
    OPERATING_SHEET_TAB,
    { kind: "lease_workspace", leaseId },
  );
  if (!proposal) serviceError("effect_missing");
  return proposal;
}

function effectByHash(
  proposal: SheetWritebackProposal,
  effectHash: string,
): ValidatedSheetWritebackEffect {
  const effect = proposal.effects.find((entry) => entry.effectHash === effectHash);
  if (!effect) serviceError("effect_missing");
  return effect;
}

/** The current-rent staff intent of a proposal, when it is one (S160). */
function workingRentIntentOf(proposal: SheetWritebackProposal): number | null {
  const effect = proposal.effects[0]?.effect;
  return effect?.kind === "field_update" &&
    effect.staffIntent?.field === "current_rent" &&
    !effect.authorization &&
    typeof effect.staffIntent.value === "number"
    ? effect.staffIntent.value
    : null;
}

/**
 * Revalidate the saved proposal against a fresh read. The lookup selection the attempt started
 * with is reused for both checks so a selection changed mid-attempt cannot turn a completed
 * update into an uncertain one; a changed selection before the attempt refuses it outright.
 */
async function assertProposalCurrent(
  proposal: SheetWritebackProposal,
  binding: ReturnType<typeof sheetLookupBinding>,
  after = false,
): Promise<void> {
  const effect =
    proposal.effects[0]?.effect.kind === "field_update"
      ? proposal.effects[0].effect
      : null;
  const context = await resolveFreshOperatingSheetLeaseContext(
    proposal.scope.leaseId,
    undefined,
    effect?.staffIntent?.field ?? effect?.audienceIntent?.field,
    { binding },
  );
  const working =
    !after && workingRentIntentOf(proposal) !== null
      ? {
          workingCurrentRent: workingCurrentRent(
            await readSheetWorkingRecord(proposal.scope.leaseId),
          ),
        }
      : null;
  assertProposalMatchesFreshLeaseContext(proposal, context, working, after);
}

/**
 * One governed S98 surface: staff assemble/save/discard exact typed Sheet proposals and confirm
 * one effect at a time behind the per-key committed-seed and runtime gates plus the reviewed
 * operating-write switch (S159/S160). The route's `reverse_preview` and `reverse_execute` reach
 * the service, which refuses both as `provider_capability_unavailable` until a stable-row seam
 * exists. Preview, status and the S158 lookup read never write.
 */
export async function POST(request: Request) {
  return handleRequest(request, null);
}

/** The signed actor-bound workspace context stays out of URLs and cache keys. */
export async function GET(request: Request) {
  const read = request.headers.get(SHEET_READ_HEADER) === "lookup" ? "lookup" : "status";
  const response = await handleRequest(request, read);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function handleRequest(request: Request, read: "status" | "lookup" | null) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const descriptor = requireEnvironmentDescriptor();
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const workspaceContext = request.headers.get("x-renewal-workspace-context");
    if (
      read &&
      (new URL(request.url).search !== "" ||
        !WorkspaceContextSchema.safeParse(workspaceContext).success)
    ) {
      throw new EditableLayerError(
        "A valid workspace context header is required for status.",
        400,
      );
    }
    const body: z.infer<typeof BodySchema> =
      read === "lookup"
        ? { operation: "lookup", workspaceContext: workspaceContext! }
        : read === "status"
          ? { operation: "status", workspaceContext: workspaceContext! }
          : await parseJsonBody(request, BodySchema);
    const { leaseId } = verifySheetWorkspaceContext(body.workspaceContext, user.uid);
    const proposalScope = { kind: "lease_workspace" as const, leaseId };

    const spreadsheetId = liveOperatingSheetId();
    if (!spreadsheetId) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "lookup") {
      // S158: an app read of the saved selection plus a provider READ of exactly that location,
      // through the configured workbook's read-only reader. No writer exists on this path.
      const config = buildLiveRenewalConfig();
      if (!config.ok) return NextResponse.json({ status: "not_configured" });
      const lookup = await readOperatingSheetLookup({
        reader: config.sheetsReader,
        spreadsheetId: config.spreadsheetId,
        binding: sheetLookupBinding(await readSheetWorkingRecord(leaseId)),
      });
      return NextResponse.json({ status: "ok", lookup });
    }

    if (body.operation === "discard") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      if (isVerificationAccount(user))
        throw new EditableLayerError(
          "A verification account reads this lease only. Sign in with a staff account to prepare a source update.",
          403,
        );
      await discardSheetWritebackProposal(
        user,
        spreadsheetId,
        OPERATING_SHEET_TAB,
        proposalScope,
        body.previewHash,
      );
      return NextResponse.json({ status: "discarded" });
    }

    const deps = buildLiveSheetWritebackDeps(descriptor);
    if ("status" in deps) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "propose") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      if (isVerificationAccount(user))
        throw new EditableLayerError(
          "A verification account reads this lease only. Sign in with a staff account to prepare a source update.",
          403,
        );
      if (!deps.writeFlagEnabled()) {
        return NextResponse.json(
          {
            error: "Operating-Sheet updates are paused; no proposal was created.",
            error_type: "writeback_paused",
          },
          { status: 409 },
        );
      }
      if ((body.intent === "update_field") !== (body.fieldIntent !== undefined))
        serviceError("confirmation_invalid");
      if ((body.intent === "update_audience_emails") !== (body.audience !== undefined))
        serviceError("confirmation_invalid");
      const currentRent =
        body.intent === "update_working_current_rent" ||
        body.intent === "update_approved_current_rent";
      if (body.expectedCurrentRent !== undefined && !currentRent)
        serviceError("confirmation_invalid");
      const proposal = await assembleSheetProposal(
        user,
        spreadsheetId,
        leaseId,
        body.intent,
        body.fieldIntent,
        undefined,
        body.audience,
      );
      // S160: the page may send the working value it showed; a different amount is never
      // written, it means the working value changed and a fresh preview is needed.
      if (
        body.expectedCurrentRent !== undefined &&
        workingRentIntentOf(proposal) !== body.expectedCurrentRent
      )
        throw new SheetWorkspaceResolutionError("working_value_changed");
      await saveSheetWritebackProposal(
        user,
        proposal,
        proposalScope,
        body.expectedPriorPreviewHash,
      );
      return NextResponse.json({
        status: "proposed",
        proposal: clientSheetWritebackProposal(proposal),
      });
    }

    if (body.operation === "status") {
      const [proposal, history] = await Promise.all([
        getSheetWritebackProposal(
          user,
          spreadsheetId,
          OPERATING_SHEET_TAB,
          proposalScope,
        ),
        listSheetWritebackProposalHistory(
          user,
          spreadsheetId,
          OPERATING_SHEET_TAB,
          proposalScope,
        ),
      ]);
      const archived = await Promise.all(
        history.map(async (entry) => ({
          proposal: clientSheetWritebackProposal(entry.proposal),
          effects: await loadSheetWritebackEffectStatuses(entry.proposal, deps.store),
          archived_at: entry.archivedAtIso,
          archived_reason: entry.archivedReason,
        })),
      );
      // S128/S159: the proactive server-owned switch read so the panel shows the Sheet update as
      // off before any attempt. It uses the same write switch as the mutation gate and never
      // blocks status or reads; it states the Sheet update's own availability only.
      const writebackPaused = !deps.writeFlagEnabled();
      if (!proposal) {
        return NextResponse.json({
          status: "ok",
          proposal: null,
          archived,
          writeback_paused: writebackPaused,
          capabilities: {
            row_append: true,
            field_update: true,
            reversal: false,
          },
        });
      }
      return NextResponse.json({
        status: "ok",
        proposal: clientSheetWritebackProposal(proposal),
        effects: await loadSheetWritebackEffectStatuses(proposal, deps.store),
        archived,
        expired: Date.now() > Date.parse(proposal.confirmationExpiresAtIso),
        writeback_paused: writebackPaused,
        capabilities: {
          row_append: true,
          field_update: true,
          reversal: false,
        },
      });
    }

    assertRenewalRoleAuthority("execute_source_write", user.role);
    // S160: ordinary staff confirm supported updates. A verification account never dispatches,
    // reconciles or reverses one, whatever its role.
    if (isVerificationAccount(user))
      throw new EditableLayerError(
        "A verification account reads this lease only. Sign in with a staff account to update a source.",
        403,
      );
    const proposal = await loadProposalOr404(user, spreadsheetId, leaseId);
    const effect = effectByHash(proposal, body.effectHash);
    const service = new SheetWritebackService(deps);

    if (body.operation === "reconcile") {
      const receipt = await service.reconcileEffect({
        proposal,
        effectHash: body.effectHash,
      });
      return NextResponse.json({
        status: "reconciled",
        receipt: {
          provider_ref: receipt.providerRef,
          result_hash: receipt.resultHash,
          reconciled: receipt.reconciled,
        },
      });
    }

    if (body.operation === "reverse_preview") {
      // Do not mint a confirmation for an operation the live provider cannot safely execute.
      serviceError("provider_capability_unavailable");
    }

    // S128/S159: operating-Sheet mutations are off whenever the reviewed server-owned switch is
    // not exactly enabled. Every mutating operation (execute, reverse_execute) refuses here with
    // the exact reason before the per-key gate or any writer construction. Status, discard, the
    // lookup read and read-only reconcile above stay available; the service still fails closed on
    // flag_disabled as defense in depth.
    if (!deps.writeFlagEnabled()) {
      return NextResponse.json(
        {
          error: "Operating-Sheet writes are paused by policy; no Sheet change was made.",
          error_type: "writeback_paused",
        },
        { status: 409 },
      );
    }

    // Mutating operations: the exact per-key gate refuses before any writer construction.
    await assertSheetWritebackV2ExecutionAllowed(
      descriptor,
      "mutating",
      effect.actionKey,
    );

    if (body.operation === "execute") {
      if (body.previewHash !== proposal.previewHash) {
        serviceError("confirmation_invalid");
      }
      // S158/S160: the lookup selection and the working current rent the attempt starts with.
      // A working value that changed after the preview is refused before any claim; the same
      // check runs again inside the one-attempt claim (value integrity, not a permission).
      const record = await readSheetWorkingRecord(leaseId);
      const binding = sheetLookupBinding(record);
      const previewedRent = workingRentIntentOf(proposal);
      if (previewedRent !== null && workingCurrentRent(record) !== previewedRent)
        throw new SheetWorkspaceResolutionError("working_value_changed");
      const outcome = await service.executeEffect({
        proposal,
        effectHash: body.effectHash,
        confirmation: {
          previewHash: body.previewHash,
          effectHash: body.effectHash,
          confirmedAtIso: new Date().toISOString(),
        },
        revalidateAfterEffect: async () => {
          try {
            await assertManualSheetProposalCurrent(user, proposal);
            await assertProposalCurrent(proposal, binding, true);
          } catch {
            throw new SheetWritebackServiceError("provider_readback_mismatch");
          }
        },
        revalidateBeforeEffect: async () => {
          try {
            await assertManualSheetProposalCurrent(user, proposal);
            await assertProposalCurrent(proposal, binding);
          } catch {
            throw new SheetWritebackServiceError("authorization_stale");
          }
        },
      });
      invalidateLiveLeaseCache();
      const workspaceSynchronization = await syncManualSheetReceipt(user, proposal).catch(
        () => ({ state: "pending" as const }),
      );
      return postWriteResponse(
        {
          status: "executed",
          workspaceSynchronization,
          duplicate: outcome.duplicate,
          receipt: {
            provider_ref: outcome.receipt.providerRef,
            result_hash: outcome.receipt.resultHash,
            reconciled: outcome.receipt.reconciled,
          },
          ...(outcome.appendedRowNumber !== undefined
            ? { appended_row_number: outcome.appendedRowNumber }
            : {}),
        },
        Date.now(),
      );
    }

    const outcome = await service.executeReversal({
      proposal,
      effectHash: body.effectHash,
      reversal: body.reversal,
      confirmedAtIso: new Date().toISOString(),
    });
    invalidateLiveLeaseCache();
    return NextResponse.json({
      status: "reversed",
      duplicate: outcome.duplicate,
      receipt: {
        provider_ref: outcome.receipt.providerRef,
        result_hash: outcome.receipt.resultHash,
        reconciled: outcome.receipt.reconciled,
      },
    });
  } catch (error) {
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: error.status },
      );
    }
    if (error instanceof SheetWritebackServiceError) {
      return NextResponse.json(
        { error: SERVICE_MESSAGES[error.code] ?? error.message, error_type: error.code },
        { status: error.code === "effect_missing" ? 404 : 409 },
      );
    }
    if (error instanceof SheetWritebackContractError) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: 409 },
      );
    }
    if (error instanceof SheetWorkspaceResolutionError) {
      // S159: the refusal names this one Sheet update's problem in plain words; it ends no other work.
      return NextResponse.json(
        { error: error.plainMessage, error_type: error.code },
        { status: 409 },
      );
    }
    if (error instanceof SheetWorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: 409 },
      );
    }
    if (error instanceof EnvironmentContextError) {
      return NextResponse.json(
        {
          data_context: error.descriptor.dataContext,
          environment_kind: error.descriptor.environmentKind,
          error: error.message,
          error_type: "environment_context_not_allowed",
        },
        { status: 409 },
      );
    }
    return apiErrorResponse(error);
  }
}
