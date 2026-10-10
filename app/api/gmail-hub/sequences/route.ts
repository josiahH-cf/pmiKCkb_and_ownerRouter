import { EditableLayerError } from "@/lib/firestore/errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import {
  SequenceCommandSchema,
  sequenceResponse,
  boundedCommunicationBody,
} from "@/lib/gmail-hub/sequence-http";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";

export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    const q = readAllowedQuery(request, ["id", "after"]);
    const service = createCommunicationSequenceService();
    if (q.has("id"))
      return sequenceResponse(
        await service.get(actor, z.string().uuid().parse(q.get("id"))),
      );
    const after = q.has("after") ? z.string().uuid().parse(q.get("after")) : null;
    return NextResponse.json(await service.list(actor, after), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireCapability("edit"); // Authenticate before decoding private content.
    readAllowedQuery(request, []);
    const input = SequenceCommandSchema.parse(
      JSON.parse((await boundedCommunicationBody(request)).toString("utf8")),
    );
    const service = createCommunicationSequenceService();
    if (input.action === "save")
      return sequenceResponse(
        await service.save(actor, input.draft, input.expectedVersion, input.operationId),
      );
    if (
      input.action === "send" ||
      input.action === "schedule" ||
      input.action === "resume"
    ) {
      const sequence = await service.authorize(actor, input);
      // Send now is this one user-authorized operation, using the same durable occurrence as the worker.
      if (input.action === "send") {
        try {
          return sequenceResponse((await service.dispatch(sequence.id)).sequence);
        } catch {
          return sequenceResponse(await service.get(actor, sequence.id));
        } // accepted authority remains visible and owned; no blind second dispatch
      }
      return sequenceResponse(sequence);
    }
    if (input.action === "reconcile")
      return sequenceResponse(await service.reconcile(actor, input.id));
    if (input.action === "refresh")
      return sequenceResponse(await service.refresh(actor, input.id));
    if (
      input.action === "pause" ||
      input.action === "cancel" ||
      input.action === "transfer"
    )
      return sequenceResponse(
        await service.control(actor, { ...input, action: input.action }),
      );
    throw new EditableLayerError("Choose a supported communication action.", 400);
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
