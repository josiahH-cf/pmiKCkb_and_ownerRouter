import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { parseUniqueQuery } from "@/lib/api/query";
import { EditableLayerError } from "@/lib/firestore/errors";
import { readVerifiedTicketProperty } from "@/lib/maintenance/verified-ticket-property";
import {
  ApplyOperatingPolicySchema,
  applyOperatingPolicy,
  readOperatingPolicyOperation,
  readOperatingPolicyScope,
  stopOperatingPolicyOperation,
} from "@/lib/firestore/maintenance-operating-policies";
import { readApplicableOperatingPolicy } from "@/lib/firestore/maintenance-operating-policy-reader";
const headers = {
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
};
const Query = z
  .object({
    purpose: z.enum(["emergency", "chargeback"]).optional(),
    property_id: z
      .string()
      .regex(/^[1-9][0-9]{0,9}$/)
      .optional(),
    unit_id: z
      .string()
      .regex(/^(?:unit:)?[1-9][0-9]{0,9}$/)
      .optional(),
    operation_id: z.string().uuid().optional(),
    view: z.literal("applicable").optional(),
    before_version: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (v.operation_id && Object.keys(v).length !== 1) ||
      (!v.operation_id && !v.purpose) ||
      (v.unit_id && !v.view) ||
      (v.unit_id && v.property_id) ||
      (v.before_version && v.view)
    )
      c.addIssue({ code: "custom", message: "Select one exact policy read target." });
  });
export async function GET(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("read", "maintenance");
    requireOperationsLiveContext();
    const q = parseUniqueQuery(request, Query);
    if (q.operation_id)
      return NextResponse.json(
        await readOperatingPolicyOperation(actor, q.operation_id),
        { headers },
      );
    let property = q.property_id ?? null;
    if (q.unit_id) {
      property = (await readVerifiedTicketProperty(q.unit_id)) ?? null;
      if (!property)
        throw new EditableLayerError(
          "The selected unit's current property is unavailable. Existing safety guidance remains available.",
          409,
        );
    }
    return NextResponse.json(
      q.view
        ? await readApplicableOperatingPolicy(q.purpose!, property)
        : await readOperatingPolicyScope(
            actor,
            q.purpose!,
            property
              ? { kind: "property", propertyId: property }
              : { kind: "organization" },
            undefined,
            q.before_version,
          ),
      { headers },
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("manageAdmin", "maintenance");
    requireOperationsLiveContext();
    return NextResponse.json(
      await applyOperatingPolicy(
        actor,
        await parseJsonBody(request, ApplyOperatingPolicySchema),
      ),
      { headers },
    );
  } catch (error) {
    const response = apiErrorResponse(error);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireCapabilityInSpace("manageAdmin", "maintenance");
    requireOperationsLiveContext();
    const q = await parseJsonBody(
      request,
      z
        .object({
          op: z.literal("stop_before_admission"),
          operationId: z.string().uuid(),
        })
        .strict(),
    );
    return NextResponse.json(await stopOperatingPolicyOperation(actor, q.operationId), {
      headers,
    });
  } catch (error) {
    const response = apiErrorResponse(error);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  }
}
