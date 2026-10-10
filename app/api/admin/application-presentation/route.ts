import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { parseUniqueQuery } from "@/lib/api/query";
import { requireOperationsLiveContext } from "@/lib/operations/live-context";
import { PresentationCommandSchema } from "@/lib/staff/business-profile";
import {
  readApplicationPresentation,
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
    const a = await requireCapability("manageAdmin"),
      q = parseUniqueQuery(
        request,
        z.object({ operation_id: z.string().uuid().optional() }).strict(),
      );
    return NextResponse.json(
      q.operation_id
        ? await readPresentationOperation(a, q.operation_id)
        : { presentation: await readApplicationPresentation() },
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
    return NextResponse.json(
      await savePresentationSetting(
        a,
        await parseJsonBody(request, PresentationCommandSchema.options[1]),
      ),
      { headers },
    );
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
