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
import { refreshLiveLeaseSnapshotFromProvider } from "@/lib/lease-renewal/live-lease-cache";
import { buildLiveRentVineConfig } from "@/lib/lease-renewal/live-config";
import {
  RENEWAL_SOURCE_REFRESH_COOKIE,
  RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/lease-renewal/post-write-freshness";
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
  buildRecurringChargeCreateBaseline,
  buildRenewalWritebackProposal,
  projectRecurringCharge,
  renewalWritebackReversalExecutionId,
  type RenewalWritebackEffectInput,
  type RenewalWritebackProposal,
  type RecurringChargeProjection,
  type ValidatedRenewalWritebackEffect,
} from "@/lib/lease-renewal/writeback/proposal-contract";
import {
  clientRenewalWritebackEffect,
  clientRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/client-projection";
import {
  discardRenewalWritebackProposal,
  getRenewalWritebackProposal,
  getRenewalWritebackProposalGeneration,
  listRenewalWritebackProposalHistory,
  saveRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-store";

const LeaseIdSchema = z.string().regex(/^[1-9]\d*$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

async function refreshProjectionAfterWrite(writeCompletedAtMs: number) {
  const config = buildLiveRentVineConfig();
  if (!config.ok) return { status: "unavailable" as const };
  try {
    const { snapshot } = await refreshLiveLeaseSnapshotFromProvider(
      config.rentvineClient,
      writeCompletedAtMs,
      Date.now(),
    );
    return {
      status: "current" as const,
      read_at_iso: new Date(snapshot.readAtMs).toISOString(),
      complete: snapshot.complete,
    };
  } catch {
    // The exact provider receipt/readback remains the write outcome. A failed broader projection
    // refresh is reported separately and must never turn a succeeded write into false ambiguity.
    return { status: "failed" as const };
  }
}

/**
 * Carry a short-lived, value-free source-generation barrier back to the browser. The next workspace
 * render must meet it even if that render lands on a different Cloud Run instance with an older
 * module cache.
 */
function postWriteResponse(payload: unknown, writeCompletedAtMs: number) {
  const response = NextResponse.json(payload);
  response.cookies.set({
    name: RENEWAL_SOURCE_REFRESH_COOKIE,
    value: String(writeCompletedAtMs),
    httpOnly: true,
    maxAge: RENEWAL_SOURCE_REFRESH_COOKIE_MAX_AGE_SECONDS,
    path: "/lease-renewal",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

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
      expectedPriorPreviewHash: HashSchema.nullable(),
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
  z
    .object({
      operation: z.literal("discard"),
      leaseId: LeaseIdSchema,
      previewHash: HashSchema,
    })
    .strict(),
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
      previewHash: HashSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_preview"),
      leaseId: LeaseIdSchema,
      previewHash: HashSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_reconcile"),
      leaseId: LeaseIdSchema,
      previewHash: HashSchema,
      effectHash: HashSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal("reverse_execute"),
      leaseId: LeaseIdSchema,
      previewHash: HashSchema,
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

async function loadProposalGenerationOr404(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  leaseId: string,
  previewHash: string,
): Promise<RenewalWritebackProposal> {
  const proposal = await getRenewalWritebackProposalGeneration(
    user,
    leaseId,
    previewHash,
  );
  if (!proposal) throw new RenewalWritebackServiceError("effect_missing");
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
  const leaseState = leaseDateStateOf(await deps.reads.getLease(body.leaseId));
  const needsCreateBaseline = body.effects.some(
    (effect) => effect.kind === "recurring_charge_create",
  );
  const chargeSnapshot: RecurringChargeProjection[] = [];
  if (needsCreateBaseline) {
    const listed = await deps.reads.listRecurringCharges(body.leaseId);
    const listedIds = listed.map(
      (entry) => (entry as Record<string, unknown>)["leaseRecurringChargeID"],
    );
    if (
      listedIds.some((id) => typeof id !== "string" || !/^[1-9]\d*$/.test(id)) ||
      new Set(listedIds).size !== listedIds.length
    ) {
      throw new RenewalWritebackServiceError("provider_shape");
    }
    for (const id of listedIds as string[]) {
      const projection = projectRecurringCharge(
        await deps.reads.getRecurringCharge(body.leaseId, id),
      );
      if (
        projection.leaseRecurringChargeID !== id ||
        projection.leaseID !== body.leaseId
      ) {
        throw new RenewalWritebackServiceError("provider_shape");
      }
      chargeSnapshot.push(projection);
    }
  }
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
      effects.push({
        kind: proposed.kind,
        create: proposed.create,
        baseline: buildRecurringChargeCreateBaseline({
          leaseId: body.leaseId,
          create: proposed.create,
          projections: chargeSnapshot,
        }),
      });
    }
  }
  return buildRenewalWritebackProposal({
    leaseId: body.leaseId,
    account: RENEWAL_WRITEBACK_ACCOUNT,
    actorUid: user.uid,
    actorEmail: user.email ?? "",
    actorRole: user.role,
    leaseState,
    sourceReadAtIso: new Date().toISOString(),
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
  const service = new RenewalWritebackService(deps);
  for (const entry of proposal.effects) {
    const { executionId, record } = await service.readEffectExecution(
      proposal,
      entry.effectHash,
    );
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

async function archivedGenerationStatuses(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  leaseId: string,
  deps: RenewalWritebackDependencies,
) {
  const history = await listRenewalWritebackProposalHistory(user, leaseId);
  return Promise.all(
    history.map(async (entry) => {
      const succeeded = new Set(
        entry.succeededEffects.map((effect) => effect.effectHash),
      );
      return {
        generation_preview_hash: entry.proposal.previewHash,
        archived_at: entry.archivedAtIso,
        archived_reason: entry.archivedReason,
        proposal: clientRenewalWritebackProposal(entry.proposal),
        effects: (await effectStatuses(entry.proposal, deps)).filter((effect) =>
          succeeded.has(effect.effect_hash),
        ),
      };
    }),
  );
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
      await discardRenewalWritebackProposal(user, body.leaseId, body.previewHash);
      return NextResponse.json({ status: "discarded" });
    }

    const deps = buildLiveRenewalWritebackDeps(descriptor);
    if ("status" in deps) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "propose") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      const proposal = await assembleProposal(user, body, deps);
      await saveRenewalWritebackProposal(user, proposal, body.expectedPriorPreviewHash);
      return NextResponse.json({
        status: "proposed",
        proposal: clientRenewalWritebackProposal(proposal),
      });
    }

    if (body.operation === "status") {
      const proposal = await getRenewalWritebackProposal(user, body.leaseId);
      const historyPromise = archivedGenerationStatuses(user, body.leaseId, deps);
      if (!proposal) {
        return NextResponse.json({
          status: "ok",
          proposal: null,
          effects: [],
          lifecycle_locked: false,
          history: await historyPromise,
        });
      }
      const effects = await effectStatuses(proposal, deps);
      return NextResponse.json({
        status: "ok",
        proposal: clientRenewalWritebackProposal(proposal),
        effects,
        lifecycle_locked: effects.some(
          (effect) =>
            effect.state === "running" ||
            effect.state === "ambiguous" ||
            effect.reversal_state === "running" ||
            effect.reversal_state === "ambiguous",
        ),
        history: await historyPromise,
        expired: Date.now() > Date.parse(proposal.confirmationExpiresAtIso),
      });
    }

    assertRenewalRoleAuthority("execute_source_write", user.role);
    const proposal =
      body.operation === "execute"
        ? await loadProposalOr404(user, body.leaseId)
        : await loadProposalGenerationOr404(user, body.leaseId, body.previewHash);
    const effect = effectByHash(proposal, body.effectHash);
    const service = new RenewalWritebackService(deps);

    if (body.operation === "reconcile") {
      const receipt = await service.reconcileEffect({
        proposal,
        effectHash: body.effectHash,
      });
      const writeCompletedAtMs = Date.now();
      const reconciledExecution = await service.readEffectExecution(
        proposal,
        body.effectHash,
      );
      const [sourceRefresh, projection] = await Promise.all([
        refreshProjectionAfterWrite(writeCompletedAtMs),
        projectReceiptEvidence(
          user,
          proposal.leaseId,
          reconciledExecution.executionId,
          receipt.resultHash,
        ),
      ]);
      return postWriteResponse(
        {
          status: "reconciled",
          receipt: {
            provider_ref: receipt.providerRef,
            result_hash: receipt.resultHash,
            reconciled: receipt.reconciled,
            ...(receipt.outcome ? { outcome: receipt.outcome } : {}),
          },
          projection,
          source_refresh: sourceRefresh,
        },
        writeCompletedAtMs,
      );
    }

    if (body.operation === "reverse_preview") {
      const reversal = await service.previewReversal({
        proposal,
        effectHash: body.effectHash,
      });
      return NextResponse.json({ status: "reversal_preview", reversal });
    }

    if (body.operation === "reverse_reconcile") {
      const receipt = await service.reconcileReversal({
        proposal,
        effectHash: body.effectHash,
      });
      const writeCompletedAtMs = Date.now();
      const sourceRefresh = await refreshProjectionAfterWrite(writeCompletedAtMs);
      return postWriteResponse(
        {
          status: "reversal_reconciled",
          receipt: {
            provider_ref: receipt.providerRef,
            result_hash: receipt.resultHash,
            reconciled: receipt.reconciled,
          },
          source_refresh: sourceRefresh,
        },
        writeCompletedAtMs,
      );
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
      const writeCompletedAtMs = Date.now();
      const sourceRefresh = await refreshProjectionAfterWrite(writeCompletedAtMs);
      const projection = await projectReceiptEvidence(
        user,
        proposal.leaseId,
        outcome.executionId,
        outcome.receipt.resultHash,
      );
      return postWriteResponse(
        {
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
          source_refresh: sourceRefresh,
        },
        writeCompletedAtMs,
      );
    }

    const outcome = await service.executeReversal({
      proposal,
      effectHash: body.effectHash,
      reversal: body.reversal,
      confirmedAtIso: new Date().toISOString(),
    });
    const writeCompletedAtMs = Date.now();
    const sourceRefresh = await refreshProjectionAfterWrite(writeCompletedAtMs);
    return postWriteResponse(
      {
        status: "reversed",
        duplicate: outcome.duplicate,
        receipt: {
          provider_ref: outcome.receipt.providerRef,
          result_hash: outcome.receipt.resultHash,
          reconciled: outcome.receipt.reconciled,
        },
        source_refresh: sourceRefresh,
      },
      writeCompletedAtMs,
    );
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
