import { NextResponse } from "next/server";

import { AccessRequestSubmitCommandSchema } from "@/lib/access/contracts";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { listOwnAccessRequests, submitAccessRequest } from "@/lib/access/request-service";
import { requireUser } from "@/lib/auth/session";

const MAX_SUBMIT_BYTES = 4 * 1024;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const command = await readStrictAccessJson(
      request,
      AccessRequestSubmitCommandSchema,
      MAX_SUBMIT_BYTES,
    );
    const result = await submitAccessRequest(actor, command);
    const status =
      result.status === "created"
        ? 201
        : result.status === "replayed" || result.status === "existing_request"
          ? 200
          : result.status === "stale_preview" || result.status === "idempotency_conflict"
            ? 409
            : 503;
    return NextResponse.json(result, { status });
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const url = new URL(request.url);
    const unknown = [...url.searchParams.keys()].filter(
      (key) => key !== "cursor" && key !== "limit",
    );
    if (
      unknown.length ||
      url.searchParams.getAll("cursor").length > 1 ||
      url.searchParams.getAll("limit").length > 1
    ) {
      return NextResponse.json(
        { error: "Invalid request-history query." },
        { status: 400 },
      );
    }
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    if (
      (cursor !== undefined && !CURSOR_PATTERN.test(cursor)) ||
      (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50))
    ) {
      return NextResponse.json(
        { error: "Invalid request-history query." },
        { status: 400 },
      );
    }
    return NextResponse.json(await listOwnAccessRequests(actor, { cursor, limit }));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
