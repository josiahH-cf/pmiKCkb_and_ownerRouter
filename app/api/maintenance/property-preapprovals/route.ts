import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import {
  clearMaintenancePropertyPreapproval,
  getMaintenancePropertyPreapproval,
  listMaintenancePropertyPreapprovalActivity,
  listMaintenancePropertyPreapprovals,
  setMaintenancePropertyPreapproval,
} from "@/lib/firestore/maintenance-property-preapprovals";

// S108: the app-owned property maintenance preapproval. It writes only the KB's own record and its
// append-only history. No RentVine effect derives from it, and it never claims owner approval inside
// RentVine: it decides whether this app asks the owner, nothing more.
const BodySchema = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("set"),
      property_key: z.string().trim().min(1).max(200),
      amount_cents: z.number().int().positive(),
      effective_from_iso: z.string().trim().min(1).max(60),
      note: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("clear"),
      property_key: z.string().trim().min(1).max(200),
    })
    .strict(),
]);

export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "maintenance");
    const propertyKey = new URL(request.url).searchParams.get("property_key")?.trim();
    if (!propertyKey) {
      return NextResponse.json({
        status: "ok",
        preapprovals: await listMaintenancePropertyPreapprovals(user),
      });
    }
    const [preapproval, activity] = await Promise.all([
      getMaintenancePropertyPreapproval(user, propertyKey),
      listMaintenancePropertyPreapprovalActivity(user, propertyKey),
    ]);
    return NextResponse.json({ status: "ok", preapproval, activity });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "maintenance");
    const body = await parseJsonBody(request, BodySchema);
    if (body.operation === "clear") {
      await clearMaintenancePropertyPreapproval(user, body.property_key);
      return NextResponse.json({ status: "cleared", preapproval: null });
    }
    const preapproval = await setMaintenancePropertyPreapproval(user, {
      propertyKey: body.property_key,
      amountCents: body.amount_cents,
      effectiveFromIso: body.effective_from_iso,
      note: body.note,
    });
    return NextResponse.json({ status: "recorded", preapproval });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
