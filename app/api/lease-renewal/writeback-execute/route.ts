import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  assertRenewalRoleAuthority,
  renewalRoleCapability,
} from "@/lib/lease-renewal/role-action-governance";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import {
  ActionNotExecutableError,
  ActionRuntimeSuspendedError,
} from "@/lib/operations/runtime-suspension-gate";
import {
  RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
  SheetWritebackContractError,
  assertSheetWritebackExecutionAllowed,
  assertSheetWritebackRequestIdentifiers,
  buildLiveWritebackDeps,
  buildLiveWritebackRecoveryDeps,
  prepareOrCommitWriteback,
} from "@/lib/lease-renewal/sheet-writeback-service";

const WritebackExecuteBodySchema = z
  .object({
    runId: z.string().trim().min(1).max(120),
    sourceTriggerKey: z.string().trim().min(1).max(300),
    operation: z.enum(["write", "reconcile", "correction", "status"]).default("write"),
    // false → issue an immutable preview; true → commit only the paired server preview.
    confirm: z.boolean().default(false),
    executionId: z.string().trim().min(1).max(120).optional(),
    previewHash: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

/**
 * Preview, commit, reconcile, or correct one LIVE append-only Sheet write-back (Admin-gated). Commit
 * requires the exact unexpired server preview and a winning durable one-attempt claim. Recovery
 * creates no Sheet effect, but may terminalize an unclaimed provider idempotency key; correction has
 * a separate preview and clears only the exact receipted effect generation.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    assertRenewalRoleAuthority("execute_source_write", user.role);
    const descriptor = requireEnvironmentDescriptor();
    const executionContext = { descriptor };

    // Environment refusal stays ahead of body parsing. Registry closure intentionally does not
    // strand effect-free recovery of an already-consumed attempt, so the exact operation is parsed
    // before the mutating gate is selected.
    await assertSheetWritebackExecutionAllowed(executionContext, "recovery");

    const body = await parseJsonBody(request, WritebackExecuteBodySchema);
    await assertSheetWritebackExecutionAllowed(
      executionContext,
      body.operation === "reconcile" || body.operation === "status"
        ? "recovery"
        : "mutating",
    );
    // Confirmation shape is checked before live config/store construction, so `confirm:true` can
    // never degrade into a misleading not-configured response when its exact preview is missing.
    assertSheetWritebackRequestIdentifiers(body);

    const deps =
      body.operation === "reconcile" || body.operation === "status"
        ? buildLiveWritebackRecoveryDeps()
        : buildLiveWritebackDeps();
    if ("status" in deps) {
      return NextResponse.json({ status: "not_configured" });
    }

    const outcome = await prepareOrCommitWriteback(
      user,
      body,
      new Date().toISOString(),
      deps,
      executionContext,
    );
    return NextResponse.json(outcome);
  } catch (error) {
    if (
      error instanceof ActionNotExecutableError ||
      error instanceof ActionRuntimeSuspendedError
    ) {
      return NextResponse.json(
        {
          action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
          error: error.message,
          error_type: error.code,
        },
        { status: error.status },
      );
    }

    if (error instanceof SheetWritebackContractError) {
      return NextResponse.json(
        {
          action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
          error: error.message,
          error_type: error.code,
        },
        { status: error.status },
      );
    }

    if (error instanceof EnvironmentContextError) {
      return NextResponse.json(
        {
          action_key: RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
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
