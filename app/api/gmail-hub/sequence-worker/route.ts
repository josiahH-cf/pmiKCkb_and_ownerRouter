import { NextResponse } from "next/server";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import {
  verifyCommunicationWorkerRequest,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import { boundedCommunicationBody } from "@/lib/gmail-hub/sequence-http";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { EditableLayerError } from "@/lib/firestore/errors";
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
