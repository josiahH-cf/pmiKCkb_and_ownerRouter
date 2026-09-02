import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { recordRenewalProcessEvidence } from "@/lib/firestore/lease-renewal-progress";
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
  RenewalWritebackService,
  RenewalWritebackServiceError,
  leaseDateStateOf,
  type RenewalWritebackDependencies,
} from "@/lib/lease-renewal/writeback/execution-service";
import {
  assertRenewalWritebackExecutionAllowed,
  buildLiveRenewalWritebackDeps,
} from "@/lib/lease-renewal/writeback/live";
import {
  RENEWAL_WRITEBACK_ACCOUNT,
  RenewalWritebackContractError,
  buildRenewalWritebackProposal,
  projectRecurringCharge,
  renewalWritebackExecutionId,
  renewalWritebackReversalExecutionId,
  type RenewalWritebackEffectInput,
  type RenewalWritebackProposal,
  type ValidatedRenewalWritebackEffect,
} from "@/lib/lease-renewal/writeback/proposal-contract";
import {
  clientRenewalWritebackEffect,
  clientRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/client-projection";
import {
  discardRenewalWritebackProposal,
  getRenewalWritebackProposal,
  saveRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-store";

const LeaseIdSchema = z.string().regex(/^[1-9]\d*$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const ProposedDatesSchema = z
  .object({
    kind: z.literal("renewal_dates_update"),
    after: z
      .object({
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        increaseEligibilityDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .strict(),
  })
  .strict();

const ProposedChargeUpdateSchema = z
  .object({
    kind: z.literal("recurring_charge_update"),
    chargeId: LeaseIdSchema,
    changes: z
      .object({
        accountID: z.string().max(40).optional(),
        amount: z.string().max(40).optional(),
        description: z.string().max(500).optional(),
        dayDue: z.string().max(4).optional(),
        frequency: z.string().max(4).optional(),
        startDate: z.string().max(20).optional(),
        endDate: z.string().max(20).nullable().optional(),
      })
      .strict(),
  })
  .strict();

const ProposedChargeCreateSchema = z
  .object({
    kind: z.literal("recurring_charge_create"),
    create: z
      .object({
        accountID: z.string().max(40),
        amount: z.string().max(40),
        description: z.string().max(500),
        dayDue: z.string().max(4),
        frequency: z.string().max(4),
        startDate: z.string().max(20),
        endDate: z.string().max(20).optional(),
      })
      .strict(),
  })
  .strict();

const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("propose"),
      leaseId: LeaseIdSchema,
      evidenceRef: z.string().trim().min(1).max(500),
      effects: z
        .array(
          z.discriminatedUnion("kind", [
            ProposedDatesSchema,
            ProposedChargeUpdateSchema,
            ProposedChargeCreateSchema,
          ]),
        )
        .min(1)
        .max(20),
    })
    .strict(),
  z.object({ operation: z.literal("status"), leaseId: LeaseIdSchema }).strict(),
  z.object({ operation: z.literal("discard"), leaseId: LeaseIdSchema }).strict(),
  z
    .object({
      operation: z.literal("execute"),
      leaseId: LeaseIdSchema,
      previewHash: HashSchema,
      effectHash: HashSchema,
      confirm: z.literal(true),
    })
    .strict(),
  z
    .object({
      operation: z.literal("reconcile"),
      leaseId: LeaseIdSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_preview"),
      leaseId: LeaseIdSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_execute"),
      leaseId: LeaseIdSchema,
      effectHash: HashSchema,
      reversal: z
        .object({
          reversalExecutionId: z.string().min(1).max(300),
          forwardExecutionId: z.string().min(1).max(300),
          previewHash: HashSchema,
          expiresAtIso: z.string().min(20).max(40),
          kind: z.enum([
            "restore_dates",
            "restore_charge_fields",
            "delete_created_charge",
          ]),
        })
        .strict(),
      confirm: z.literal(true),
    })
    .strict(),
]);

type Body = z.infer<typeof BodySchema>;

async function loadProposalOr404(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  leaseId: string,
): Promise<RenewalWritebackProposal> {
  const proposal = await getRenewalWritebackProposal(user, leaseId);
  if (!proposal) {
    throw new RenewalWritebackServiceError("effect_missing");
  }
  return proposal;
}

function effectByHash(
  proposal: RenewalWritebackProposal,
  effectHash: string,
): ValidatedRenewalWritebackEffect {
  const effect = proposal.effects.find((entry) => entry.effectHash === effectHash);
  if (!effect) throw new RenewalWritebackServiceError("effect_missing");
  return effect;
}

async function assembleProposal(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  body: Extract<Body, { operation: "propose" }>,
  deps: RenewalWritebackDependencies,
): Promise<RenewalWritebackProposal> {
  const sourceReadAtIso = new Date().toISOString();
  const leaseState = leaseDateStateOf(await deps.reads.getLease(body.leaseId));
  const effects: RenewalWritebackEffectInput[] = [];
  for (const proposed of body.effects) {
    if (proposed.kind === "renewal_dates_update") {
      effects.push({ kind: proposed.kind, before: leaseState, after: proposed.after });
    } else if (proposed.kind === "recurring_charge_update") {
      const before = projectRecurringCharge(
        await deps.reads.getRecurringCharge(body.leaseId, proposed.chargeId),
      );
      effects.push({
        kind: proposed.kind,
        chargeId: proposed.chargeId,
        before,
        changes: proposed.changes,
      });
    } else {
      effects.push({ kind: proposed.kind, create: proposed.create });
    }
  }
  return buildRenewalWritebackProposal({
    leaseId: body.leaseId,
    account: RENEWAL_WRITEBACK_ACCOUNT,
    actorUid: user.uid,
    actorEmail: user.email ?? "",
    actorRole: user.role,
    leaseState,
    sourceReadAtIso,
    evidenceRef: body.evidenceRef,
    effects,
    nowMs: Date.now(),
  });
}

async function effectStatuses(
  proposal: RenewalWritebackProposal,
  deps: RenewalWritebackDependencies,
) {
  const statuses = [];
  for (const entry of proposal.effects) {
    const executionId = renewalWritebackExecutionId(proposal, entry);
    const record = await deps.store.get(executionId);
    let reversalState: string | null = null;
    if (record?.state === "succeeded" && record.receipt) {
      const reversal = await deps.store.get(
        renewalWritebackReversalExecutionId(executionId, record.receipt.resultHash),
      );
      reversalState = reversal?.state ?? null;
    }
    statuses.push({
      ...clientRenewalWritebackEffect(entry),
      execution_id: executionId,
      state: record?.state ?? "not_started",
      attempt_count: record?.attemptCount ?? 0,
      ...(record?.receipt
        ? {
            receipt: {
              provider_ref: record.receipt.providerRef,
              result_hash: record.receipt.resultHash,
              reconciled: record.receipt.reconciled,
            },
          }
        : {}),
      reversal_state: reversalState,
    });
  }
  return statuses;
}

/** Project the value-free receipt evidence; a failure never re-writes the provider (ARCH-S97-4). */
async function projectReceiptEvidence(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  leaseId: string,
  executionId: string,
  resultHash: string,
): Promise<"projected" | "pending_reconciliation"> {
  try {
    await recordRenewalProcessEvidence(user, leaseId, "source-write-receipt", {
      ref: `s97-writeback:${executionId}`,
      source: "app_record",
      disposition: "verified",
      observedAt: new Date().toISOString(),
      fingerprint: resultHash,
    });
    return "projected";
  } catch {
    return "pending_reconciliation";
  }
}

/**
 * One governed S97 surface: Editors assemble/save/discard exact typed proposals; Admins execute,
 * reconcile, and reverse one effect at a time behind the per-key committed-seed and runtime gates.
 * Preview and status never write; execution requires the exact unexpired confirmation.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const descriptor = requireEnvironmentDescriptor();
    // Environment refusal precedes body parsing; the per-key mutating gate follows below.
    await assertRenewalWritebackExecutionAllowed(descriptor, "recovery");
    const body = await parseJsonBody(request, BodySchema);

    if (body.operation === "discard") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      await discardRenewalWritebackProposal(user, body.leaseId);
      return NextResponse.json({ status: "discarded" });
    }

    const deps = buildLiveRenewalWritebackDeps(descriptor);
    if ("status" in deps) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "propose") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      const proposal = await assembleProposal(user, body, deps);
      await saveRenewalWritebackProposal(user, proposal);
      return NextResponse.json({
        status: "proposed",
        proposal: clientRenewalWritebackProposal(proposal),
      });
    }

    if (body.operation === "status") {
      const proposal = await getRenewalWritebackProposal(user, body.leaseId);
      if (!proposal) return NextResponse.json({ status: "ok", proposal: null });
      return NextResponse.json({
        status: "ok",
        proposal: clientRenewalWritebackProposal(proposal),
        effects: await effectStatuses(proposal, deps),
        expired: Date.now() > Date.parse(proposal.confirmationExpiresAtIso),
      });
    }

    assertRenewalRoleAuthority("execute_source_write", user.role);
    const proposal = await loadProposalOr404(user, body.leaseId);
    const effect = effectByHash(proposal, body.effectHash);
    const service = new RenewalWritebackService(deps);

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
          ...(receipt.outcome ? { outcome: receipt.outcome } : {}),
        },
      });
    }

    if (body.operation === "reverse_preview") {
      const reversal = await service.previewReversal({
        proposal,
        effectHash: body.effectHash,
      });
      return NextResponse.json({ status: "reversal_preview", reversal });
    }

    // Mutating operations: the exact per-key committed-seed + runtime gate refuses before any
    // writer construction (BEH-S97-3); the service re-runs the same gate around the provider call.
    await assertRenewalWritebackExecutionAllowed(
      descriptor,
      "mutating",
      effect.actionKey,
    );

    if (body.operation === "execute") {
      if (body.previewHash !== proposal.previewHash) {
        throw new RenewalWritebackServiceError("confirmation_invalid");
      }
      const outcome = await service.executeEffect({
        proposal,
        effectHash: body.effectHash,
        confirmation: {
          previewHash: body.previewHash,
          effectHash: body.effectHash,
          confirmedAtIso: new Date().toISOString(),
        },
      });
      invalidateLiveLeaseCache();
      const executionId = renewalWritebackExecutionId(proposal, effect);
      const projection = await projectReceiptEvidence(
        user,
        proposal.leaseId,
        executionId,
        outcome.receipt.resultHash,
      );
      return NextResponse.json({
        status: "executed",
        duplicate: outcome.duplicate,
        receipt: {
          provider_ref: outcome.receipt.providerRef,
          result_hash: outcome.receipt.resultHash,
          reconciled: outcome.receipt.reconciled,
        },
        ...(outcome.createdChargeId
          ? { created_charge_id: outcome.createdChargeId }
          : {}),
        projection,
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
    if (error instanceof RenewalWritebackServiceError) {
      return NextResponse.json(
        { error: error.message, error_type: error.code },
        { status: error.code === "effect_missing" ? 404 : 409 },
      );
    }
    if (error instanceof RenewalWritebackContractError) {
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
