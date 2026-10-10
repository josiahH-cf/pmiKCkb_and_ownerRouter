import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { parseUniqueQuery } from "@/lib/api/query";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { PresentationCommandSchema } from "@/lib/staff/business-profile";
import {
  inspectOwnBusinessProfile,
  readBusinessProfile,
  readPresentationOperation,
  savePresentationSetting,
  stopPresentationOperation,
} from "@/lib/firestore/presentation-settings";
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
    const a = await requireCapability("read");
    const q = parseUniqueQuery(
      request,
      z
        .object({
          uid: z
            .string()
            .min(1)
            .max(128)
            .regex(/^[^/]+$/)
            .optional(),
          operation_id: z.string().uuid().optional(),
        })
        .strict()
        .refine((v) => !(v.uid && v.operation_id), "Choose one exact read."),
    );
    return NextResponse.json(
      q.operation_id
        ? await readPresentationOperation(a, q.operation_id)
        : q.uid
          ? { profile: await readBusinessProfile(a, q.uid) }
          : await inspectOwnBusinessProfile(a),
      { headers },
    );
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    const a = await requireCapability("manageAdmin");
    requireOperationsLiveContext();
    const c = await parseJsonBody(request, PresentationCommandSchema.options[0]);
    return NextResponse.json(await savePresentationSetting(a, c), { headers });
  } catch (e) {
    return error(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const a = await requireCapability("manageAdmin");
    requireOperationsLiveContext();
    const c = await parseJsonBody(
      request,
      z
        .object({
          operationId: z.string().uuid(),
          op: z.literal("stop_before_admission"),
        })
        .strict(),
    );
    return NextResponse.json(await stopPresentationOperation(a, c.operationId), {
      headers,
    });
  } catch (e) {
    return error(e);
  }
}
