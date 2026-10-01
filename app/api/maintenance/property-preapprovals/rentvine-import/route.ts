import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace, type AuthenticatedUser } from "@/lib/auth/session";
import { formatCalendarDate } from "@/lib/date-display";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  importMaintenancePropertyPreapprovals,
  listMaintenancePropertyPreapprovals,
} from "@/lib/firestore/maintenance-property-preapprovals";
import {
  planPreapprovalImport,
  type PreapprovalImportPlan,
} from "@/lib/maintenance/rentvine-preapproval-import";
import {
  loadRentVinePropertyLimits,
  PROPERTY_LIMIT_SOURCE_TEXT,
} from "@/lib/maintenance/rentvine-property-limits";

// S108 amendment (owner decision 2026-10-01, B-MNT1): preview and record RentVine's per-property
// maintenance limits as the app's preapprovals. GET reads RentVine and plans; POST re-reads, refuses
// any plan that differs from the confirmed preview hash, then records every change in one transaction.
// Both are Admin-only. Nothing is written to RentVine, and no preapproval is cleared.
const BodySchema = z
  .object({
    plan_hash: z.string().regex(/^[a-f0-9]{64}$/),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

async function currentPlan(
  user: AuthenticatedUser,
): Promise<{ plan: PreapprovalImportPlan } | { unavailable: NextResponse }> {
  const source = await loadRentVinePropertyLimits();
  if (source.status !== "ok") {
    return {
      unavailable: NextResponse.json(
        { code: source.status, error: PROPERTY_LIMIT_SOURCE_TEXT[source.status] },
        { status: 503 },
      ),
    };
  }
  return {
    plan: planPreapprovalImport(
      source.properties,
      await listMaintenancePropertyPreapprovals(user),
    ),
  };
}

function exactDate(value: string): string {
  const iso = `${value}T00:00:00.000Z`;
  if (new Date(iso).toISOString() !== iso) {
    throw new EditableLayerError("Provide an exact effective date.", 400);
  }
  return iso;
}

export async function GET() {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "maintenance");
    const read = await currentPlan(user);
    if ("unavailable" in read) return read.unavailable;
    return NextResponse.json({ status: "ok", plan: read.plan });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "maintenance");
    const body = await parseJsonBody(request, BodySchema);
    const effectiveFromIso = exactDate(body.effective_from);
    const read = await currentPlan(user);
    if ("unavailable" in read) return read.unavailable;
    const { plan } = read;
    if (plan.planHash !== body.plan_hash) {
      throw new EditableLayerError(
        "RentVine or the app's preapprovals changed after the preview. Preview the import again.",
        409,
      );
    }
    const preapprovals = await importMaintenancePropertyPreapprovals(user, {
      rows: plan.rows,
      effectiveFromIso,
      note: `Imported from the RentVine maintenance limit on ${formatCalendarDate(new Date().toISOString().slice(0, 10))}.`,
    });
    return NextResponse.json({
      status: "imported",
      recorded: preapprovals.length,
      unchanged: plan.rows.filter((row) => row.action === "unchanged").length,
      preapprovals,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
