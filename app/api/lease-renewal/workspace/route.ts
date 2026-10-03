import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { isOperatingSheetWritebackPaused } from "@/lib/lease-renewal/sheet-writeback-policy";
import { prepareWorkspaceSheetUpdate } from "@/lib/lease-renewal/workspace-sheet-sync";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { listMarketObservations } from "@/lib/firestore/renewal-market-observations";
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
  resolveRenewalCycleBasis,
  resolveRenewalWorkBasis,
} from "@/lib/lease-renewal/workspace-cycle-context";

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
  StartRenewalCycleSchema.extend({ operation: z.literal("start_cycle") }),
  SaveRenewalWorkspaceSchema.extend({ operation: z.literal("record") }),
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
    const { operation: _, ...value } = input;
    // S154/S155: the first actual save establishes the work record from the lease's real basis.
    // Saving is application persistence only: it reads and writes no Sheet. A pending Sheet value
    // is prepared when staff deliberately ask for it (prepare_source), and confirmed separately.
    const result = await saveRenewalWorkspace(actor, value, undefined, () =>
      resolveRenewalWorkBasis(actor, value.leaseId),
    );
    return NextResponse.json({
      ...result,
      writeback_paused: isOperatingSheetWritebackPaused(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
