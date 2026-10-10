import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { parseUniqueQuery } from "@/lib/api/query";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { verifyMaintenancePolicySource } from "@/lib/maintenance/policy-source";
import {
  ApplyMaintenancePolicyInputSchema,
  applyMaintenancePolicy,
  readMaintenancePolicyOperation,
  stopMaintenancePolicyOperation,
  getMaintenancePropertyPreapproval,
  listMaintenancePropertyPreapprovalActivity,
  listMaintenancePropertyPreapprovals,
} from "@/lib/firestore/maintenance-property-preapprovals";
const headers = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
const error = (e: unknown) => {
  const r = apiErrorResponse(e);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
};
export async function GET(request: Request) {
  try {
    const user = await requireCapabilityInSpace("read", "maintenance");
    const q = parseUniqueQuery(
      request,
      z
        .object({
          operation_id: z.string().uuid().optional(),
          property_key: z
            .string()
            .regex(/^[A-Za-z0-9:_-]{1,200}$/)
            .optional(),
        })
        .strict()
        .refine(
          (v) => !(v.operation_id && v.property_key),
          "Select one exact policy read.",
        ),
    );
    if (q.operation_id)
      return NextResponse.json(
        await readMaintenancePolicyOperation(user, q.operation_id),
        { headers },
      );
    if (!q.property_key)
      return NextResponse.json(
        { status: "ok", preapprovals: await listMaintenancePropertyPreapprovals(user) },
        { headers },
      );
    const [preapproval, activity] = await Promise.all([
      getMaintenancePropertyPreapproval(user, q.property_key),
      listMaintenancePropertyPreapprovalActivity(user, q.property_key),
    ]);
    return NextResponse.json({ status: "ok", preapproval, activity }, { headers });
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "maintenance");
    requireOperationsLiveContext();
    const raw = await parseJsonBody(request, z.unknown());
    if (
      raw &&
      typeof raw === "object" &&
      "operation" in raw &&
      ["set", "clear"].includes(String(raw.operation))
    )
      return NextResponse.json(
        {
          error:
            "Use the reviewed standing-policy Save or Revoke with its current version and original operation identity. An imported limit alone supplies no spending authority.",
        },
        { status: 410, headers },
      );
    const body = ApplyMaintenancePolicyInputSchema.parse(raw);
    const prior = await readMaintenancePolicyOperation(user, body.operation_id);
    if (body.operation === "set_policy" && prior.state === "not_recorded")
      await verifyMaintenancePolicySource(body.policy_terms);
    return NextResponse.json(
      {
        status: "recorded",
        operation_id: body.operation_id,
        preapproval: await applyMaintenancePolicy(user, body),
      },
      { headers },
    );
  } catch (e) {
    return error(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await requireCapabilityInSpace("manageAdmin", "maintenance");
    requireOperationsLiveContext();
    const body = await parseJsonBody(
      request,
      z
        .object({
          operation: z.literal("stop_before_admission"),
          operation_id: z.string().uuid(),
        })
        .strict(),
    );
    return NextResponse.json(
      await stopMaintenancePolicyOperation(user, body.operation_id),
      { headers },
    );
  } catch (e) {
    return error(e);
  }
}
