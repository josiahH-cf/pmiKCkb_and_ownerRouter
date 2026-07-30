import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import {
  authErrorResponse,
  requireCapabilityInSpace,
  type AuthenticatedUser,
} from "@/lib/auth/session";
import { renewalCompScreenshotClosedResponse } from "@/lib/lease-renewal/comp-screenshot-action";
import { buildLiveCompScreenshotRuntime } from "@/lib/lease-renewal/comp-screenshot-runtime";
import {
  assertCompScreenshotExecutionAllowed,
  assertCompScreenshotRecoverySetup,
  commitCompScreenshotRollback,
  compScreenshotErrorResponse,
  previewCompScreenshotRollback,
  type CompScreenshotExecutionContext,
  type CompScreenshotServiceDeps,
} from "@/lib/lease-renewal/comp-screenshot-service";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
  assertProductionRuntimeActionExecutable,
} from "@/lib/operations/runtime-suspension-gate";

const RollbackBodySchema = z
  .object({
    operation: z.literal("trash"),
    confirm: z.boolean(),
    leaseId: z.string().trim().min(1).max(120),
    executionId: z.string().regex(/^comp_store_[a-f0-9]{48}$/),
    rollbackId: z
      .string()
      .regex(/^comp_trash_[a-f0-9]{48}$/)
      .optional(),
    previewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.confirm && (!value.rollbackId || !value.previewHash)) {
      ctx.addIssue({
        code: "custom",
        message: "A confirmed rollback requires the exact rollbackId and previewHash.",
      });
    }
    if (!value.confirm && (value.rollbackId || value.previewHash)) {
      ctx.addIssue({
        code: "custom",
        message: "A new rollback preview cannot supply prior identifiers.",
      });
    }
  });

export interface RenewalCompScreenshotRollbackRouteDeps {
  authenticate: () => Promise<AuthenticatedUser>;
  assertRuntimeExecutable: () => Promise<void>;
  buildRuntime: () => {
    deps: CompScreenshotServiceDeps;
    context: CompScreenshotExecutionContext;
  };
}

const DEFAULT_DEPS: RenewalCompScreenshotRollbackRouteDeps = {
  authenticate: () => requireCapabilityInSpace("manageAdmin", "renewals"),
  assertRuntimeExecutable: () =>
    assertProductionRuntimeActionExecutable("google_drive.renewal_comp_screenshot.store"),
  buildRuntime: buildLiveCompScreenshotRuntime,
};

export function createRenewalCompScreenshotRollbackHandler(
  overrides: Partial<RenewalCompScreenshotRollbackRouteDeps> = {},
) {
  const routeDeps = { ...DEFAULT_DEPS, ...overrides };
  return async function POST(request: Request) {
    let actor: AuthenticatedUser;
    try {
      actor = await routeDeps.authenticate();
    } catch (error) {
      return authErrorResponse(error);
    }

    try {
      // Rollback moves a provider object to trash, so it requires a fresh runtime-clear decision
      // before config/provider construction. Read-only status/reconcile remains the recovery path
      // available during containment.
      await routeDeps.assertRuntimeExecutable();
      const runtime = routeDeps.buildRuntime();
      await assertCompScreenshotExecutionAllowed(runtime.context, "recovery");
      assertCompScreenshotRecoverySetup(runtime.deps);
      const body = await parseJsonBody(request, RollbackBodySchema);
      const outcome = body.confirm
        ? await commitCompScreenshotRollback(
            actor,
            {
              leaseId: body.leaseId,
              executionId: body.executionId,
              rollbackId: body.rollbackId!,
              previewHash: body.previewHash!,
            },
            runtime.deps,
            runtime.context,
          )
        : await previewCompScreenshotRollback(
            actor,
            body.leaseId,
            body.executionId,
            runtime.deps,
            runtime.context,
          );
      return NextResponse.json(outcome);
    } catch (error) {
      if (
        error instanceof ActionNotExecutableError ||
        error instanceof ActionRuntimeSuspendedError
      ) {
        return NextResponse.json(
          {
            ...renewalCompScreenshotClosedResponse(),
            ...(error instanceof ActionRuntimeSuspendedError
              ? { error: error.message, error_type: error.code }
              : {}),
          },
          { status: error.status },
        );
      }
      const contract = compScreenshotErrorResponse(error);
      if (contract) {
        return NextResponse.json(contract.body, { status: contract.status });
      }
      return apiErrorResponse(error);
    }
  };
}

export const POST = createRenewalCompScreenshotRollbackHandler();
