import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { isOperatingSheetWritebackPaused } from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  prepareDerivedWorkspaceSheetUpdate,
  prepareWorkspaceSheetUpdate,
} from "@/lib/lease-renewal/workspace-sheet-sync";
import { OUTREACH_AUDIENCES } from "@/lib/lease-renewal/outreach-evidence";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { listMarketObservations } from "@/lib/firestore/renewal-market-observations";
import { assertSignaturesCompletable } from "@/lib/lease-documents/returned-state-service";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  getRenewalWorkspace,
  listRenewalWorkspaceActivity,
  saveRenewalWorkspace,
  startRenewalCycle,
  SaveRenewalWorkspaceSchema,
  StartRenewalCycleSchema,
} from "@/lib/firestore/renewal-workspace";
import {
  resolveLeaseOwnerRoster,
  resolveRenewalCycleBasis,
  resolveRenewalWorkBasis,
} from "@/lib/lease-renewal/workspace-cycle-context";
import {
  ConfirmSourceRenewalSchema,
  KeepWorkingCycleSchema,
} from "@/lib/firestore/renewal-cycle-date-decisions";
import {
  confirmSourceRenewalCompletion,
  keepWorkingRecordedCycle,
} from "@/lib/lease-renewal/cycle-date-choice";
import {
  CorrectRenewalOutreachSchema,
  correctRenewalOutreach,
} from "@/lib/firestore/renewal-outreach-records";

const Body = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("prepare_source"),
      leaseId: z.string().regex(/^[1-9]\d*$/),
      cycleId: z.string().uuid(),
      field: z.enum(
        Object.keys(SHEET_FIELD_LABELS) as [
          keyof typeof SHEET_FIELD_LABELS,
          ...(keyof typeof SHEET_FIELD_LABELS)[],
        ],
      ),
      eventId: z.string().uuid(),
    })
    .strict(),
  // S248 R-S248-11: a derived outreach record prepares the same Sheet update a staff record
  // prepares, bound to the exact message; applying it is confirmed separately.
  z
    .object({
      operation: z.literal("prepare_derived_source"),
      leaseId: z.string().regex(/^[1-9]\d*$/),
      cycleId: z.string().uuid(),
      audience: z.enum(OUTREACH_AUDIENCES),
      sequenceId: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_-]+$/),
      occurrenceId: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  StartRenewalCycleSchema.extend({ operation: z.literal("start_cycle") }),
  SaveRenewalWorkspaceSchema.extend({ operation: z.literal("record") }),
  // S246 R-S246-5: the two staff choices when RentVine reports a later lease end than the
  // recorded cycle. Each names the recorded date and the RentVine date staff saw; a confirmation
  // also names the cycle and revision of the work record the row showed.
  KeepWorkingCycleSchema.extend({ operation: z.literal("keep_working") }),
  ConfirmSourceRenewalSchema.extend({ operation: z.literal("confirm_source_renewal") }),
  // S248 R-S248-10: "This was not the renewal outreach" removes a derived outreach record with a
  // reason; the record and its history stay.
  CorrectRenewalOutreachSchema.extend({ operation: z.literal("correct_outreach") }),
]);
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("read_workspace"),
      "renewals",
    );
    const leaseId = z
      .string()
      .regex(/^[1-9]\d*$/)
      .parse(new URL(request.url).searchParams.get("leaseId"));
    const [state, activity] = await Promise.all([
      getRenewalWorkspace(actor, leaseId),
      listRenewalWorkspaceActivity(actor, leaseId),
    ]);
    return NextResponse.json({
      writeback_paused: isOperatingSheetWritebackPaused(),
      state,
      activity,
      observations: state
        ? await listMarketObservations(actor, leaseId, state.cycleId)
        : [],
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace(
      renewalRoleCapability("save_renewal_progress"),
      "renewals",
    );
    const input = await parseJsonBody(request, Body);
    if (input.operation === "prepare_source")
      return NextResponse.json({
        state: await prepareWorkspaceSheetUpdate(actor, input),
      });
    if (input.operation === "prepare_derived_source") {
      const { operation: _, ...value } = input;
      return NextResponse.json({
        state: await prepareDerivedWorkspaceSheetUpdate(actor, value),
        writeback_paused: isOperatingSheetWritebackPaused(),
      });
    }
    if (input.operation === "start_cycle") {
      const { operation: _, ...value } = input;
      return NextResponse.json(
        await startRenewalCycle(
          actor,
          value,
          await resolveRenewalCycleBasis(actor, value.leaseId, value.basis),
        ),
      );
    }
    if (input.operation === "correct_outreach") {
      const { operation: _, ...value } = input;
      return NextResponse.json({ record: await correctRenewalOutreach(actor, value) });
    }
    if (
      input.operation === "keep_working" ||
      input.operation === "confirm_source_renewal"
    ) {
      const choice = {
        leaseId: input.leaseId,
        recordedDateIso: input.recordedDateIso,
        sourceDateIso: input.sourceDateIso,
        operationId: input.operationId,
      };
      if (input.operation === "keep_working")
        return NextResponse.json(await keepWorkingRecordedCycle(actor, choice));
      // The existing staff completion of the work record, with the RentVine lease end as its
      // source evidence, bound to the record version staff reviewed. Application persistence
      // only: it reads and writes no Sheet.
      return NextResponse.json({
        ...(await confirmSourceRenewalCompletion(actor, {
          ...choice,
          cycleId: input.cycleId,
          expectedRevision: input.expectedRevision,
        })),
        writeback_paused: isOperatingSheetWritebackPaused(),
      });
    }
    const { operation: _, ...value } = input;
    // S236 R-S236-6: a fully tracked current packet derives Required signatures complete.
    if (
      value.action.kind === "activity" &&
      value.action.activity === "signatures" &&
      value.action.outcome === "done"
    )
      await assertSignaturesCompletable(actor, value.leaseId);
    // S154/S155: the first actual save establishes the work record from the lease's real basis.
    // Saving is application persistence only: it reads and writes no Sheet. A pending Sheet value
    // is prepared when staff deliberately ask for it (prepare_source), and confirmed separately.
    const result = await saveRenewalWorkspace(
      actor,
      value,
      undefined,
      () => resolveRenewalWorkBasis(actor, value.leaseId),
      // S234 R-S234-1: an approval's party is checked against a fresh owner roster.
      { ownerRoster: () => resolveLeaseOwnerRoster(actor, value.leaseId) },
    );
    return NextResponse.json({
      ...result,
      writeback_paused: isOperatingSheetWritebackPaused(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
