import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

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
  hashSheetHeader,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  OPERATING_SHEET_TAB,
  assertSheetWritebackV2ExecutionAllowed,
  buildLiveSheetWritebackDeps,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import {
  SheetWritebackContractError,
  buildSheetWritebackProposal,
  type SheetWritebackEffectInput,
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
  effectForFreshLeaseContext,
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
      intent: z.enum(["append_missing_row", "update_approved_current_rent"]),
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

type Body = z.infer<typeof BodySchema>;

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

async function assembleProposal(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  spreadsheetId: string,
  leaseId: string,
  intent: Extract<Body, { operation: "propose" }>["intent"],
): Promise<SheetWritebackProposal> {
  const context = await resolveFreshOperatingSheetLeaseContext(leaseId);
  if (
    (intent === "append_missing_row" && context.row !== null) ||
    (intent === "update_approved_current_rent" && context.row === null)
  ) {
    throw new SheetWorkspaceResolutionError("row_state_mismatch");
  }
  const authorized = context.row
    ? await resolveAuthorizedCurrentRentUpdate(user, context)
    : null;
  const effects: SheetWritebackEffectInput[] = [
    effectForFreshLeaseContext(context, authorized, `op-${randomUUID()}`),
  ];

  return buildSheetWritebackProposal({
    generationId: `proposal-${randomUUID()}`,
    spreadsheetId,
    tabTitle: OPERATING_SHEET_TAB,
    headerHash: hashSheetHeader(context.header, context.columns),
    headerWidth: context.header.length,
    tenantColumnIndex: context.tenantColumnIndex,
    scope: {
      kind: "lease_workspace",
      leaseId: context.leaseId,
      propertyId: context.propertyId,
    },
    actorUid: user.uid,
    actorEmail: user.email ?? "",
    actorRole: user.role,
    sourceReadAtIso: context.sourceReadAtIso,
    evidenceRef: `workspace:${context.leaseId}:fresh-live-join`,
    effects,
    nowMs: Date.now(),
  });
}

async function assertProposalCurrent(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  proposal: SheetWritebackProposal,
): Promise<void> {
  const context = await resolveFreshOperatingSheetLeaseContext(proposal.scope.leaseId);
  const authorized =
    proposal.effects[0]?.effect.kind === "field_update"
      ? await resolveAuthorizedCurrentRentUpdate(user, context)
      : null;
  assertProposalMatchesFreshLeaseContext(proposal, context, authorized);
}

/**
 * One governed S98 surface: Editors assemble/save/discard exact typed Sheet proposals; Admins
 * execute, reconcile, and reverse one effect at a time behind the per-key committed-seed and
 * runtime gates plus the reviewed operating-write switch. Preview and status never write.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const descriptor = requireEnvironmentDescriptor();
    await assertSheetWritebackV2ExecutionAllowed(descriptor, "recovery");
    const body = await parseJsonBody(request, BodySchema);
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
      if (body.intent === "update_approved_current_rent") {
        serviceError("provider_capability_unavailable");
      }
      const proposal = await assembleProposal(user, spreadsheetId, leaseId, body.intent);
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
            field_update: false,
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
          field_update: false,
          reversal: false,
        },
      });
    }

    assertRenewalRoleAuthority("execute_source_write", user.role);
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
        revalidateBeforeEffect: async () => {
          try {
            await assertProposalCurrent(user, proposal);
          } catch {
            throw new SheetWritebackServiceError("authorization_stale");
          }
        },
      });
      invalidateLiveLeaseCache();
      return NextResponse.json({
        status: "executed",
        duplicate: outcome.duplicate,
        receipt: {
          provider_ref: outcome.receipt.providerRef,
          result_hash: outcome.receipt.resultHash,
          reconciled: outcome.receipt.reconciled,
        },
        ...(outcome.appendedRowNumber !== undefined
          ? { appended_row_number: outcome.appendedRowNumber }
          : {}),
      });
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
