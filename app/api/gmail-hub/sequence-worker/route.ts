import { NextResponse } from "next/server";
import { verifyCommunicationWorkerRequest } from "@/lib/gmail-hub/sequence-worker";
import { boundedCommunicationBody } from "@/lib/gmail-hub/sequence-http";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { EditableLayerError } from "@/lib/firestore/errors";
import { applicationEffectBlockReason } from "@/lib/operations/application-effect-policy";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    await verifyCommunicationWorkerRequest(request); // Service identity before body or provider construction.
    readAllowedQuery(request, []);
    const text = (await boundedCommunicationBody(request, 100)).toString("utf8").trim();
    if (text && text !== "{}")
      throw new EditableLayerError("The worker accepts no target or message input.", 400);
    // Retain old authorizations/attempts as evidence; retirement never dispatches a backlog.
    return NextResponse.json({ status: "draft_only", dispatched: 0 });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}

/** A managed readiness probe never constructs a sequence service or claims/dispatches work. */
export async function GET(request: Request) {
  try {
    await verifyCommunicationWorkerRequest(request);
    readAllowedQuery(request, []);
    const probeId = request.headers.get("x-pmi-worker-readiness");
    if (!probeId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(probeId))
      throw new EditableLayerError(
        "A bounded managed readiness probe identity is required.",
        400,
      );
    if (
      !applicationEffectBlockReason("gmail.renewal_notice.send") ||
      !applicationEffectBlockReason("gmail.maintenance_owner_notice.send")
    )
      throw new EditableLayerError(
        "The unsent-only communication policy is not verified.",
        409,
      );
    console.log(
      JSON.stringify({
        event: "communication_worker_readiness",
        probeId,
        ready: true,
        mode: "draft_only",
        dispatchEnabled: false,
      }),
    );
    return NextResponse.json({ status: "draft_only", dispatchEnabled: false });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
