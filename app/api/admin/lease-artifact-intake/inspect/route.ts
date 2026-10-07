import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { inspectStaticArtifact } from "@/lib/firestore/lease-artifact-intake";
import { LEASE_ARTIFACT_KINDS } from "@/lib/lease-documents/packet-types";

const Query = z.object({ kind: z.enum(LEASE_ARTIFACT_KINDS) }).strict();

// S130: Admin-only, read-only. Returns a received static original's page sizes, rotation, crop and
// text positions so an Admin can review its fill regions. Nothing is saved, published or sent.
export async function GET(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const query = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      throw new EditableLayerError("Choose one lease-artifact family to inspect.", 400);
    const { kind } = query.data;
    const inspection = await inspectStaticArtifact(user, kind);
    return NextResponse.json(
      { staticInspection: { kind, ...inspection } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
