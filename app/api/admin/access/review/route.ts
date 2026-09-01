import { NextResponse } from "next/server";
import { z } from "zod";

import { ACCESS_CAPABILITIES } from "@/lib/access/catalog";
import { accessApiErrorResponse, readStrictAccessJson } from "@/lib/access/http";
import { listAdminAccessRequests } from "@/lib/access/request-service";
import { requireUser } from "@/lib/auth/session";
import { ACCESS_REQUEST_STATES } from "@/lib/access/contracts";
import { ROLES, SPACE_SCOPES } from "@/lib/constants";

const CURSOR_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CATALOG_FILTER_KEYS = [
  ...ACCESS_CAPABILITIES,
  ...ROLES,
  "named_spaces",
  "all_spaces",
] as const;

const AdminListCommandSchema = z
  .object({
    schema_version: z.literal("access-request-admin-list-command-v1"),
    filters: z
      .object({
        requester_query: z.string().min(1).max(160).optional(),
        intent_kind: z.enum(["capability", "role", "spaces"]).optional(),
        catalog_key: z.enum(CATALOG_FILTER_KEYS).optional(),
        space_id: z.enum(SPACE_SCOPES).optional(),
        state: z.enum(ACCESS_REQUEST_STATES).optional(),
        minimum_waiting_minutes: z.number().int().safe().min(0).max(525_600).optional(),
        cursor: z.string().regex(CURSOR_PATTERN).optional(),
        limit: z.number().int().safe().min(1).max(50).optional(),
      })
      .strict(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const command = await readStrictAccessJson(request, AdminListCommandSchema, 4 * 1024);
    return NextResponse.json(await listAdminAccessRequests(actor, command.filters));
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const params = new URL(request.url).searchParams;
    const allowed = new Set([
      "intent_kind",
      "catalog_key",
      "space_id",
      "state",
      "minimum_waiting_minutes",
      "cursor",
      "limit",
    ]);
    if (
      [...params.keys()].some((key) => !allowed.has(key)) ||
      [...allowed].some((key) => params.getAll(key).length > 1)
    ) {
      return NextResponse.json(
        { error: "Invalid access-review query." },
        { status: 400 },
      );
    }
    const intentKind = params.get("intent_kind") ?? undefined;
    if (intentKind && !["capability", "role", "spaces"].includes(intentKind)) {
      return NextResponse.json(
        { error: "Invalid access-review query." },
        { status: 400 },
      );
    }
    const state = params.get("state") ?? undefined;
    if (state && !(ACCESS_REQUEST_STATES as readonly string[]).includes(state)) {
      return NextResponse.json(
        { error: "Invalid access-review query." },
        { status: 400 },
      );
    }
    const waiting = params.has("minimum_waiting_minutes")
      ? Number(params.get("minimum_waiting_minutes"))
      : undefined;
    const limit = params.has("limit") ? Number(params.get("limit")) : undefined;
    const catalogKey = params.get("catalog_key") ?? undefined;
    const spaceId = params.get("space_id") ?? undefined;
    const cursor = params.get("cursor") ?? undefined;
    if (
      (waiting !== undefined &&
        (!Number.isSafeInteger(waiting) || waiting < 0 || waiting > 525_600)) ||
      (limit !== undefined &&
        (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)) ||
      (catalogKey !== undefined &&
        !(CATALOG_FILTER_KEYS as readonly string[]).includes(catalogKey)) ||
      (spaceId !== undefined && !(SPACE_SCOPES as readonly string[]).includes(spaceId)) ||
      (cursor !== undefined && !CURSOR_PATTERN.test(cursor))
    ) {
      return NextResponse.json(
        { error: "Invalid access-review query." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await listAdminAccessRequests(actor, {
        intent_kind: intentKind as "capability" | "role" | "spaces" | undefined,
        catalog_key: catalogKey,
        space_id: spaceId,
        state: state as (typeof ACCESS_REQUEST_STATES)[number] | undefined,
        minimum_waiting_minutes: waiting,
        cursor,
        limit,
      }),
    );
  } catch (error) {
    return accessApiErrorResponse(error);
  }
}
