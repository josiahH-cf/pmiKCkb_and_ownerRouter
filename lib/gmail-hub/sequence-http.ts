import { NextResponse } from "next/server";
import { z } from "zod";
import { SequenceDraftSchema, type CommunicationSequence } from "./sequence-model";
import { CommunicationScheduleSchema } from "./schedule-calendar";
import { sequenceHash } from "./sequence-store";
import { EditableLayerError } from "@/lib/firestore/errors";

const identity = {
  id: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  operationId: z.string().uuid(),
};
export const SequenceCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      draft: SequenceDraftSchema,
      expectedVersion: identity.expectedVersion,
      operationId: identity.operationId,
    })
    .strict(),
  ...(["send", "schedule", "resume"] as const).map((action) =>
    z
      .object({
        action: z.literal(action),
        ...identity,
        reviewedDraftHash: z.string().regex(/^[a-f0-9]{64}$/),
        reviewedTargetHash: z.string().regex(/^[a-f0-9]{64}$/),
        schedule: CommunicationScheduleSchema.nullable(),
      })
      .strict(),
  ),
  ...(["pause", "cancel"] as const).map((action) =>
    z.object({ action: z.literal(action), ...identity }).strict(),
  ),
  z
    .object({
      action: z.literal("transfer"),
      ...identity,
      responsibleUid: z.string().trim().min(1).max(128),
    })
    .strict(),
  z.object({ action: z.literal("reconcile"), id: identity.id }).strict(),
  z.object({ action: z.literal("refresh"), id: identity.id }).strict(),
]);
export function sequenceResponse(sequence: CommunicationSequence) {
  return NextResponse.json(
    {
      sequence,
      reviewedDraftHash: sequenceHash({
        initial: sequence.initial,
        followUp: sequence.followUp,
      }),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
/** Bound reads before JSON/form parsing; Content-Length is only an early rejection, never the bound. */
export async function boundedCommunicationBody(request: Request, maxBytes = 125_000) {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes)
    throw new EditableLayerError("This communication exceeds its supported size.", 400);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new EditableLayerError(
            "This communication exceeds its supported size.",
            400,
          );
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
  return Buffer.concat(chunks);
}
