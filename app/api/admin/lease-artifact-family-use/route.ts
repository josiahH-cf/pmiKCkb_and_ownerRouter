import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  readFamilyUseRecord,
  setFamilyUse,
} from "@/lib/firestore/lease-artifact-family-use";
import {
  resolveFamilyUse,
  SetFamilyUseInputSchema,
} from "@/lib/lease-documents/family-use";

// S66 (AC-S66-6): Admin surface for how each lease-document family is used. GET returns the record
// and every family's resolved use with its source; POST records one family's use against the
// version the page loaded. Admin-only, server-only writes. Nothing here approves a file or a legal
// version, connects a provider or opens an action key.
export async function GET() {
  try {
    await requireCapability("manageAdmin");
    const read = await readFamilyUseRecord();
    return NextResponse.json({
      familyUse: {
        readable: read.readable,
        version: read.record?.version ?? 0,
        families: resolveFamilyUse(read.record, new Date().toISOString()),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, SetFamilyUseInputSchema);
    const result = await setFamilyUse(user, input);
    return NextResponse.json({
      familyUse: {
        readable: true,
        version: result.record.version,
        families: resolveFamilyUse(result.record, new Date().toISOString()),
        duplicate: result.duplicate,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
