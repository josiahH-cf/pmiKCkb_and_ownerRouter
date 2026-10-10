import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/api/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import { SearchQuerySchema } from "@/lib/search/entity-types";
import { searchEntities } from "@/lib/search/server-search";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read"),
      params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some(
        (k) =>
          !["q", "type", "limit", "cursor"].includes(k) || params.getAll(k).length !== 1,
      )
    )
      throw new EditableLayerError("Invalid entity search query.", 400);
    const query = SearchQuerySchema.safeParse(Object.fromEntries(params));
    if (!query.success)
      throw new EditableLayerError(
        "Choose a valid query, entity filter and result page.",
        400,
      );
    if (!query.data.q)
      return NextResponse.json(
        {
          results: [],
          nextCursor: null,
          limitations: [],
          readAt: new Date().toISOString(),
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    const page = await searchEntities(actor, query.data);
    return NextResponse.json(page, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
