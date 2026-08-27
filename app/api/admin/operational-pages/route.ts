import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapability } from "@/lib/auth/session";
import {
  approveOperationalPageVersion,
  createOperationalPageDraft,
  listOperationalPageAdminState,
  publishOperationalPageVersion,
  rollbackOperationalPage,
} from "@/lib/firestore/operational-pages";
import {
  OperationalPageActionSchema,
  OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
  OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
  OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION,
} from "@/lib/operational-pages/schema";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    if (new URL(request.url).search) {
      return NextResponse.json(
        { error: "Unexpected query parameters." },
        { status: 400 },
      );
    }
    return NextResponse.json(await listOperationalPageAdminState(actor));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("manageAdmin");
    const input = await parseJsonBody(request, OperationalPageActionSchema);
    switch (input.operation) {
      case "draft":
        return NextResponse.json(
          {
            version: await createOperationalPageDraft(actor, input),
            nextConfirmation: OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
          },
          { status: 201 },
        );
      case "approve":
        return NextResponse.json({
          approval: await approveOperationalPageVersion(actor, input),
          nextConfirmation: OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
        });
      case "publish":
        return NextResponse.json({
          receipt: await publishOperationalPageVersion(actor, input),
          rollbackConfirmation: OPERATIONAL_PAGE_ROLLBACK_CONFIRMATION,
        });
      case "rollback":
        return NextResponse.json({
          receipt: await rollbackOperationalPage(actor, input),
        });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
