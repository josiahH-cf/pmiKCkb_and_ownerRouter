import {
  assertManualSheetProposalCurrent,
  syncManualSheetReceipt,
} from "@/lib/lease-renewal/workspace-sheet-sync";
import { assembleSheetProposal } from "@/lib/lease-renewal/sheet-writeback/prepare";
import { NextResponse } from "next/server";
import { EditableLayerError } from "@/lib/firestore/errors";
import { postWriteResponse } from "@/lib/lease-renewal/post-write-response";
import { z } from "zod";
import { SheetFieldIntentSchema } from "@/lib/lease-renewal/sheet-writeback/field-intent";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
} from "@/lib/operations/runtime-suspension-gate";
import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import { invalidateLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import {
  SheetWritebackService,
  SheetWritebackServiceError,
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
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { ownerOutcomeBlocksDownstream } from "@/lib/lease-renewal/renewal-progress";
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
  resolveAuthorizedCurrentRentUpdate,
  resolveFreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { loadSheetWritebackEffectStatuses } from "@/lib/lease-renewal/sheet-writeback/status";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const WorkspaceContextSchema = z.string().min(40).max(1_000);

const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("propose"),
      workspaceContext: WorkspaceContextSchema,
      intent: z.enum([
        "append_missing_row",
        "update_approved_current_rent",
        "update_field",
      ]),
      fieldIntent: SheetFieldIntentSchema.optional(),
      expectedCurrentRent: z.number().finite().positive().optional(),
      expectedPriorPreviewHash: HashSchema.nullable(),
    })
    .strict(),
  z
    .object({ operation: z.literal("status"), workspaceContext: WorkspaceContextSchema })
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

async function assertProposalCurrent(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  proposal: SheetWritebackProposal,
  after = false,
): Promise<void> {
  const context = await resolveFreshOperatingSheetLeaseContext(
    proposal.scope.leaseId,
    undefined,
    proposal.effects[0]?.effect.kind === "field_update"
      ? proposal.effects[0].effect.staffIntent?.field
      : undefined,
  );
  const authorized =
    !after &&
    proposal.effects[0]?.effect.kind === "field_update" &&
    !proposal.effects[0].effect.staffIntent
      ? await resolveAuthorizedCurrentRentUpdate(user, context)
      : null;
  assertProposalMatchesFreshLeaseContext(proposal, context, authorized, after);
}

/**
 * One governed S98 surface: Editors assemble/save/discard exact typed Sheet proposals; Admins
 * execute (behind the recorded owner-outcome gate) and reconcile one effect at a time behind the
 * per-key committed-seed and runtime gates plus the reviewed operating-write switch. The route's
 * `reverse_preview` and `reverse_execute` reach the service, which refuses both as
 * `provider_capability_unavailable` until a stable-row seam exists. Preview and status never write.
 */
export async function POST(request: Request) {
  return handleRequest(request, false);
}

/** The signed actor-bound workspace context stays out of URLs and cache keys. */
export async function GET(request: Request) {
  const response = await handleRequest(request, true);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function handleRequest(request: Request, statusOnly: boolean) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const descriptor = requireEnvironmentDescriptor();
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const workspaceContext = request.headers.get("x-renewal-workspace-context");
    if (
      statusOnly &&
      (new URL(request.url).search !== "" ||
        !WorkspaceContextSchema.safeParse(workspaceContext).success)
    ) {
      throw new EditableLayerError(
        "A valid workspace context header is required for status.",
        400,
      );
    }
    const body = statusOnly
      ? { operation: "status" as const, workspaceContext: workspaceContext! }
      : await parseJsonBody(request, BodySchema);
    const { leaseId } = verifySheetWorkspaceContext(body.workspaceContext, user.uid);
    const proposalScope = { kind: "lease_workspace" as const, leaseId };

    const spreadsheetId = liveOperatingSheetId();
    if (!spreadsheetId) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "discard") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
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
      if ((body.intent === "update_field") !== (body.fieldIntent !== undefined))
        serviceError("confirmation_invalid");
      const proposal = await assembleSheetProposal(
        user,
        spreadsheetId,
        leaseId,
        body.intent,
        body.fieldIntent,
      );
      if (
        body.expectedCurrentRent !== undefined &&
        (body.intent !== "update_approved_current_rent" ||
          proposal.effects.length !== 1 ||
          proposal.effects[0].effect.kind !== "field_update" ||
          Number(proposal.effects[0].effect.afterValue) !== body.expectedCurrentRent)
      )
        serviceError("confirmation_invalid");
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
      if (!proposal) {
        return NextResponse.json({
          status: "ok",
          proposal: null,
          archived,
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
        capabilities: {
          row_append: true,
          field_update: true,
          reversal: false,
        },
      });
    }

    assertRenewalRoleAuthority("execute_source_write", user.role);
    const proposal = await loadProposalOr404(user, spreadsheetId, leaseId);
    const effect = effectByHash(proposal, body.effectHash);
    const service = new SheetWritebackService(deps);

    if (body.operation === "execute" && effect.effect.kind === "row_append") {
      // S105: the appended renewal row records the owner's approved terms. While the recorded
      // owner response is not an approval, the append is refused before the one-attempt claim.
      const downstreamBlock = ownerOutcomeBlocksDownstream(
        await getRenewalProgress(user, leaseId),
      );
      if (downstreamBlock) {
        return NextResponse.json(
          { error: downstreamBlock, error_type: "owner_outcome_blocks_downstream" },
          { status: 409 },
        );
      }
    }

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
            await assertProposalCurrent(user, proposal, true);
          } catch {
            throw new SheetWritebackServiceError("provider_readback_mismatch");
          }
        },
        revalidateBeforeEffect: async () => {
          try {
            await assertManualSheetProposalCurrent(user, proposal);
            await assertProposalCurrent(user, proposal);
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
        { error: error.message, error_type: error.code },
        { status: error.code === "effect_missing" ? 404 : 409 },
      );
    }
    if (error instanceof SheetWritebackContractError) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: 409 },
      );
    }
    if (
      error instanceof SheetWorkspaceContextError ||
      error instanceof SheetWorkspaceResolutionError
    ) {
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
