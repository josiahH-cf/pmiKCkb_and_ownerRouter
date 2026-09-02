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
import { RentVineClient, createFetchTransport } from "@/lib/integrations/rentvine/client";
import {
  SheetWritebackService,
  SheetWritebackServiceError,
  hashSheetHeader,
  type SheetWritebackDependencies,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  OPERATING_SHEET_TAB,
  assertSheetWritebackV2ExecutionAllowed,
  buildLiveSheetWritebackDeps,
  liveOperatingSheetId,
} from "@/lib/lease-renewal/sheet-writeback/live";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import {
  SheetWritebackContractError,
  buildSheetWritebackProposal,
  sheetWritebackExecutionId,
  sheetWritebackReversalExecutionId,
  type SheetWritebackEffectInput,
  type SheetWritebackProposal,
  type ValidatedSheetWritebackEffect,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  clientSheetWritebackEffect,
  clientSheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  discardSheetWritebackProposal,
  getSheetWritebackProposal,
  saveSheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const LeaseIdSchema = z.string().regex(/^[1-9]\d*$/);

const ProposedAppendSchema = z
  .object({
    kind: z.literal("row_append"),
    leaseId: LeaseIdSchema,
    tenantName: z.string().trim().min(1).max(200),
    fields: z
      .record(
        z.string().max(60),
        z
          .object({
            value: z.string().min(1).max(500),
            source: z.string().min(1).max(500),
          })
          .strict(),
      )
      .default({}),
    renewalDateHumanConfirmed: z.boolean().optional(),
  })
  .strict();

const ProposedUpdateSchema = z
  .object({
    kind: z.literal("field_update"),
    field: z.string().min(1).max(60),
    rowNumber: z.number().int().min(2).max(100_000),
    afterValue: z.string().max(500),
    source: z.string().trim().min(1).max(500),
  })
  .strict();

const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("propose"),
      evidenceRef: z.string().trim().min(1).max(500),
      effects: z
        .array(z.discriminatedUnion("kind", [ProposedAppendSchema, ProposedUpdateSchema]))
        .min(1)
        .max(5),
    })
    .strict(),
  z.object({ operation: z.literal("status") }).strict(),
  z.object({ operation: z.literal("discard") }).strict(),
  z
    .object({
      operation: z.literal("execute"),
      previewHash: HashSchema,
      effectHash: HashSchema,
      confirm: z.literal(true),
    })
    .strict(),
  z.object({ operation: z.literal("reconcile"), effectHash: HashSchema }).strict(),
  z.object({ operation: z.literal("reverse_preview"), effectHash: HashSchema }).strict(),
  z
    .object({
      operation: z.literal("reverse_execute"),
      effectHash: HashSchema,
      reversal: z
        .object({
          reversalExecutionId: z.string().min(1).max(300),
          forwardExecutionId: z.string().min(1).max(300),
          previewHash: HashSchema,
          expiresAtIso: z.string().min(20).max(40),
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
): Promise<SheetWritebackProposal> {
  const proposal = await getSheetWritebackProposal(
    user,
    spreadsheetId,
    OPERATING_SHEET_TAB,
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

function rentvineReader() {
  const baseUrl = process.env.RENTVINE_API_BASE_URL?.trim();
  const apiKey = process.env.RENTVINE_API_KEY?.trim();
  const apiSecret = process.env.RENTVINE_API_SECRET?.trim();
  if (!baseUrl || !apiKey || !apiSecret) return null;
  return new RentVineClient(
    { baseUrl, apiKey, apiSecret },
    createFetchTransport({ timeoutMs: 30_000 }),
  );
}

async function assembleProposal(
  user: Awaited<ReturnType<typeof requireCapabilityInSpace>>,
  spreadsheetId: string,
  body: Extract<Body, { operation: "propose" }>,
  deps: SheetWritebackDependencies,
): Promise<SheetWritebackProposal> {
  const writer = deps.createWriter();
  const headerRows = await writer.getValues(
    spreadsheetId,
    `'${OPERATING_SHEET_TAB}'!A1:AZ1`,
  );
  const header = headerRows[0] ?? [];
  const resolution = resolveHeaders([header], RENEWAL_TAB_SCHEMAS.Renewals);
  const columns = new Map<string, number>();
  for (const column of resolution.columns) {
    if (column.field !== null && column.status === "resolved") {
      columns.set(column.field, column.index);
    }
  }
  const tenantColumnIndex = columns.get("tenant_name");
  if (tenantColumnIndex === undefined) serviceError("header_drift");

  const reader = rentvineReader();
  const effects: SheetWritebackEffectInput[] = [];
  for (const proposed of body.effects) {
    if (proposed.kind === "row_append") {
      // Provider ids are server-resolved: the lease read supplies its own property id.
      if (!reader) serviceError("provider_read_failed");
      const lease = (await reader.getLease(proposed.leaseId)) as Record<string, unknown>;
      const inner =
        lease["lease"] && typeof lease["lease"] === "object"
          ? (lease["lease"] as Record<string, unknown>)
          : lease;
      const propertyId = String(inner["propertyID"] ?? "");
      effects.push({
        kind: "row_append",
        mode: "normal",
        operationId: `op-${randomUUID()}`,
        leaseId: proposed.leaseId,
        propertyId,
        tenantName: proposed.tenantName,
        fields: proposed.fields,
        ...(proposed.renewalDateHumanConfirmed !== undefined
          ? { renewalDateHumanConfirmed: proposed.renewalDateHumanConfirmed }
          : {}),
      });
    } else {
      const fieldColumn = columns.get(proposed.field);
      if (fieldColumn === undefined) serviceError("header_drift");
      const letterFor = (index: number) => {
        let value = index;
        let letters = "";
        do {
          letters = String.fromCharCode(65 + (value % 26)) + letters;
          value = Math.floor(value / 26) - 1;
        } while (value >= 0);
        return letters;
      };
      const fieldLetter = letterFor(fieldColumn);
      const tenantLetter = letterFor(tenantColumnIndex);
      const cellRows = await writer.getValues(
        spreadsheetId,
        `'${OPERATING_SHEET_TAB}'!${fieldLetter}${proposed.rowNumber}:${fieldLetter}${proposed.rowNumber}`,
      );
      const tenantRows = await writer.getValues(
        spreadsheetId,
        `'${OPERATING_SHEET_TAB}'!${tenantLetter}${proposed.rowNumber}:${tenantLetter}${proposed.rowNumber}`,
      );
      const noteEntries = await writer.getColumnNotes({
        spreadsheetId,
        tabTitle: OPERATING_SHEET_TAB,
        columnIndex: tenantColumnIndex,
        startRowNumber: proposed.rowNumber,
        endRowNumber: proposed.rowNumber,
      });
      const note = noteEntries[0]?.note ?? "";
      const parsedNote = /operation ([a-z0-9-]+) /.exec(note);
      effects.push({
        kind: "field_update",
        field: proposed.field,
        rowNumber: proposed.rowNumber,
        rowKey: parsedNote ? parsedNote[1] : null,
        anchorTenantName: tenantRows[0]?.[0] ?? "",
        expectedValue: cellRows[0]?.[0] ?? "",
        afterValue: proposed.afterValue,
        source: proposed.source,
      });
    }
  }

  return buildSheetWritebackProposal({
    spreadsheetId,
    tabTitle: OPERATING_SHEET_TAB,
    headerHash: hashSheetHeader(header, columns),
    headerWidth: header.length,
    tenantColumnIndex,
    actorUid: user.uid,
    actorEmail: user.email ?? "",
    actorRole: user.role,
    sourceReadAtIso: new Date().toISOString(),
    evidenceRef: body.evidenceRef,
    effects,
    nowMs: Date.now(),
  });
}

async function effectStatuses(
  proposal: SheetWritebackProposal,
  deps: SheetWritebackDependencies,
) {
  const statuses = [];
  for (const entry of proposal.effects) {
    const executionId = sheetWritebackExecutionId(proposal, entry);
    const record = await deps.store.get(executionId);
    let reversalState: string | null = null;
    if (record?.state === "succeeded" && record.receipt) {
      const reversal = await deps.store.get(
        sheetWritebackReversalExecutionId(executionId, record.receipt.resultHash),
      );
      reversalState = reversal?.state ?? null;
    }
    statuses.push({
      ...clientSheetWritebackEffect(entry),
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

    const spreadsheetId = liveOperatingSheetId();
    if (!spreadsheetId) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "discard") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      await discardSheetWritebackProposal(user, spreadsheetId, OPERATING_SHEET_TAB);
      return NextResponse.json({ status: "discarded" });
    }

    const deps = buildLiveSheetWritebackDeps(descriptor);
    if ("status" in deps) {
      return NextResponse.json({ status: "not_configured" });
    }

    if (body.operation === "propose") {
      assertRenewalRoleAuthority("propose_source_write", user.role);
      const proposal = await assembleProposal(user, spreadsheetId, body, deps);
      await saveSheetWritebackProposal(user, proposal);
      return NextResponse.json({
        status: "proposed",
        proposal: clientSheetWritebackProposal(proposal),
      });
    }

    if (body.operation === "status") {
      const proposal = await getSheetWritebackProposal(
        user,
        spreadsheetId,
        OPERATING_SHEET_TAB,
      );
      if (!proposal) return NextResponse.json({ status: "ok", proposal: null });
      return NextResponse.json({
        status: "ok",
        proposal: clientSheetWritebackProposal(proposal),
        effects: await effectStatuses(proposal, deps),
        expired: Date.now() > Date.parse(proposal.confirmationExpiresAtIso),
      });
    }

    assertRenewalRoleAuthority("execute_source_write", user.role);
    const proposal = await loadProposalOr404(user, spreadsheetId);
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
      const reversal = await service.previewReversal({
        proposal,
        effectHash: body.effectHash,
      });
      return NextResponse.json({ status: "reversal_preview", reversal });
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
