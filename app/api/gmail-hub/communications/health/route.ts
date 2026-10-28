import { NextResponse } from "next/server";

import { hasSpaceAccess, requireCapability } from "@/lib/auth/session";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { assertCommunicationStaff } from "@/lib/gmail-hub/sequence-service";
import { readCommunicationWorkerHealth } from "@/lib/gmail-hub/worker-health";

/**
 * S233 R-S233-5: the communications worker's last run, its counts, the oldest past-due unsent
 * message and the oldest incoming check, for communications staff, over the communications their
 * Spaces show. Times and counts only; it reads the worker record and open sequences and never
 * claims, observes or sends anything.
 */
export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    assertCommunicationStaff(actor, "read");
    readAllowedQuery(request, []);
    const health = await readCommunicationWorkerHealth({
      include: (context) => hasSpaceAccess(actor, context.lane),
    });
    return NextResponse.json(health, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
