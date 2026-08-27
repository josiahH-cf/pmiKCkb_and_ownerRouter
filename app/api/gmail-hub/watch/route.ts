import { NextResponse } from "next/server";

import { requireCapability } from "@/lib/auth/session";
import { gmailHubErrorResponse } from "@/lib/gmail-hub/http";

export async function GET() {
  try {
    await requireCapability("read");
    return NextResponse.json({
      status: "retired",
      reason:
        "Continuous Gmail watch renewal is retired. Use the read-only manual refresh.",
      fallback: "/api/gmail-hub/refresh",
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}

export async function POST() {
  try {
    await requireCapability("edit");
    return NextResponse.json(
      {
        status: "retired",
        error:
          "Continuous Gmail watch renewal is retired. No Gmail provider call was made.",
        fallback: "/api/gmail-hub/refresh",
      },
      { status: 410 },
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
