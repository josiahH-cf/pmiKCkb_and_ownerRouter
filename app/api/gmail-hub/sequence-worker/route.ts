import { NextResponse } from "next/server";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import {
  verifyCommunicationWorkerRequest,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import { boundedCommunicationBody } from "@/lib/gmail-hub/sequence-http";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { EditableLayerError } from "@/lib/firestore/errors";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    await verifyCommunicationWorkerRequest(request); // Service identity before body or provider construction.
    readAllowedQuery(request, []);
    const text = (await boundedCommunicationBody(request, 100)).toString("utf8").trim();
    if (text && text !== "{}")
      throw new EditableLayerError("The worker accepts no target or message input.", 400);
    return NextResponse.json(
      await runCommunicationWorker({ service: createCommunicationSequenceService() }),
    );
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
    await assertProductionRuntimeActionExecutable("gmail.renewal_notice.send");
    await assertProductionRuntimeActionExecutable("gmail.maintenance_owner_notice.send");
    console.log(
      JSON.stringify({ event: "communication_worker_readiness", probeId, ready: true }),
    );
    return NextResponse.json({ status: "ready" });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
