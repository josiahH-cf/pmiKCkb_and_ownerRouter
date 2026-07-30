import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  EnvironmentContextError,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { ActionNotExecutableError } from "@/lib/integrations/action-gate";
import {
  RENEWAL_SHEET_WRITEBACK_ACTION_KEY,
  assertSheetWritebackExecutionAllowed,
  buildLiveWritebackDeps,
  prepareOrCommitWriteback,
} from "@/lib/lease-renewal/sheet-writeback-service";

const WritebackExecuteBodySchema = z
  .object({
    runId: z.string().trim().min(1).max(120),
    sourceTriggerKey: z.string().trim().min(1).max(300),
    // false → resolve the target for confirmation; true → perform the guarded append.
    confirm: z.boolean().default(false),
  })
  .strict();

/**
 * Resolve or commit the LIVE append-only Sheet write-back for one approved flag (Admin-gated). The row
 * and column come from the live rebuild; the write is flag-gated (default OFF), append-only, and
 * compare-and-set. This is the ONLY route that can write to the operational renewal sheet, and it does
 * so only for an Approved proposal, one confirmed cell at a time.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "renewals");
    const descriptor = requireEnvironmentDescriptor();
    const executionContext = { descriptor };

    // Refuse before parsing the body, resolving live config, constructing a Sheets writer, or
    // rebuilding the live run. The service repeats the same assertion so direct callers cannot
    // bypass this route-level early fence.
    assertSheetWritebackExecutionAllowed(executionContext);

    const body = await parseJsonBody(request, WritebackExecuteBodySchema);

    const deps = buildLiveWritebackDeps();
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
    if (error instanceof ActionNotExecutableError) {
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
