import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import { CommunicationAttachmentStore } from "@/lib/gmail-hub/sequence-attachments";
import { boundedCommunicationBody } from "@/lib/gmail-hub/sequence-http";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";

export async function POST(request: Request) {
  try {
    const actor = await requireCapability("edit");
    const q = readAllowedQuery(request, ["id", "attachment"]);
    const id = z.string().uuid().parse(q.get("id")),
      attachmentId = z.string().uuid().parse(q.get("attachment"));
    const s = await createCommunicationSequenceService().get(actor, id);
    const bytes = await boundedCommunicationBody(request, 5 * 1024 * 1024 + 20_000);
    const form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "" },
      body: bytes,
    }).formData();
    const fields = [...form.keys()];
    const file = form.get("file");
    if (fields.length !== 1 || fields[0] !== "file" || !(file instanceof File))
      throw new EditableLayerError("Choose one supported PDF or image attachment.", 400);
    const attachment = await new CommunicationAttachmentStore().put({
      id: attachmentId,
      actorUid: actor.uid,
      context: s.context,
      filename: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      nowMs: Date.now(),
    });
    return NextResponse.json(
      { attachment },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
export async function GET(request: Request) {
  try {
    const actor = await requireCapability("read");
    const q = readAllowedQuery(request, ["id", "attachment", "mode"]);
    const s = await createCommunicationSequenceService().get(
      actor,
      z.string().uuid().parse(q.get("id")),
    );
    const attachment = z.string().uuid().parse(q.get("attachment"));
    if (q.get("mode") === "metadata")
      return NextResponse.json(
        {
          attachment: await new CommunicationAttachmentStore().metadata(
            attachment,
            s.context,
          ),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    if (q.has("mode")) throw new EditableLayerError("Unknown attachment read mode.", 400);
    const allowed = new Set([
      ...s.initial.attachmentIds,
      ...(s.followUp?.attachmentIds ?? []),
      ...(s.authorization?.initial.attachments.map((a) => a.id) ?? []),
      ...(s.authorization?.followUp?.attachments.map((a) => a.id) ?? []),
    ]);
    if (!allowed.has(attachment))
      throw new EditableLayerError(
        "This file is not attached to the linked communication.",
        403,
      );
    const result = await new CommunicationAttachmentStore().resolve(
      attachment,
      s.context,
    );
    return new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}
