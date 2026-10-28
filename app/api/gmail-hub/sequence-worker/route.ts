import { NextResponse } from "next/server";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import { RENEWAL_DELIVERY_POLICY_VERSION } from "@/lib/gmail-hub/delivery-policy";
import {
  runCommunicationWorker,
  verifyCommunicationWorkerRequest,
} from "@/lib/gmail-hub/sequence-worker";
import { boundedCommunicationBody } from "@/lib/gmail-hub/sequence-http";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";
import { EditableLayerError } from "@/lib/firestore/errors";
import { assertProductionRuntimeActionExecutable } from "@/lib/operations/runtime-suspension-gate";
import { applicationEffectBlockReason } from "@/lib/operations/application-effect-policy";
import {
  readCommunicationWorkerHealth,
  type CommunicationWorkerHealth,
} from "@/lib/gmail-hub/worker-health";
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
    if (
      applicationEffectBlockReason("gmail.renewal_notice.send") ||
      !applicationEffectBlockReason("gmail.maintenance_owner_notice.send")
    )
      throw new EditableLayerError(
        "The confirmed-renewal communication policy is not verified.",
        409,
      );
    await assertProductionRuntimeActionExecutable("gmail.renewal_notice.send");
    await assertProductionRuntimeActionExecutable("gmail.mailbox.read");
    // S233 R-S233-5: the read-only assurance reads the worker's health from this same entry. Times
    // and counts only; a failed health read leaves readiness standing and says so.
    let health: CommunicationWorkerHealth | "unavailable";
    try {
      health = await readCommunicationWorkerHealth();
    } catch {
      health = "unavailable";
    }
    console.log(
      JSON.stringify({
        event: "communication_worker_readiness",
        probeId,
        ready: true,
        mode: "confirmed_renewal",
        dispatchEnabled: true,
        legacyDispatchEnabled: false,
        deliveryPolicyVersion: RENEWAL_DELIVERY_POLICY_VERSION,
        health,
      }),
    );
    return NextResponse.json({
      status: "ready",
      dispatchEnabled: true,
      legacyDispatchEnabled: false,
      deliveryPolicyVersion: RENEWAL_DELIVERY_POLICY_VERSION,
      health,
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
