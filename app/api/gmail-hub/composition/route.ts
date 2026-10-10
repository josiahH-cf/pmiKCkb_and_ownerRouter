import {
  observeStaffOperation,
  operationStage,
} from "@/lib/observability/staff-operation";
import { EditableLayerError } from "@/lib/firestore/errors";
import { sequenceHash } from "@/lib/gmail-hub/sequence-store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import {
  prepareWorkflowComposition,
  prepareWorkflowReplyComposition,
} from "@/lib/gmail-hub/sequence-dependencies";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import { gmailHubErrorResponse, readAllowedQuery } from "@/lib/gmail-hub/http";

async function handleGet(request: Request) {
  try {
    const actor = await operationStage("permission", () => requireCapability("read"));
    const q = readAllowedQuery(request, [
      "lease",
      "ticket",
      "purpose",
      "reply_from",
      "reply_thread",
      "reply_sender",
      "reply_parent",
    ]);
    if (q.has("reply_from")) {
      if (["lease", "ticket", "purpose"].some((k) => q.has(k)))
        throw new EditableLayerError("Choose one exact communication entry.", 400);
      const reply = WorkflowCommunicationContextSchema.shape.replyTo.unwrap().parse({
        sequenceId: q.get("reply_from"),
        threadId: q.get("reply_thread"),
        senderEmail: q.get("reply_sender"),
        parentId: q.get("reply_parent"),
      });
      const result = await operationStage("prepare", () =>
        prepareWorkflowReplyComposition(actor, reply),
      );
      return NextResponse.json(
        {
          ...result,
          reviewedTargetHash: sequenceHash({
            to: result.target.to,
            cc: result.target.cc,
            materialSourceHash: result.target.materialSourceHash,
          }),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (["reply_thread", "reply_sender", "reply_parent"].some((k) => q.has(k)))
      throw new EditableLayerError("Choose the exact linked original reply.", 400);
    const purpose = z
      .enum(["renewal_owner", "renewal_tenant", "maintenance_owner"])
      .parse(q.get("purpose"));
    const lease = q.get("lease"),
      ticket = q.get("ticket");
    if (!!lease === !!ticket || (purpose === "maintenance_owner") !== !!ticket)
      throw new EditableLayerError("Choose one supported workflow target.", 400);
    const context = WorkflowCommunicationContextSchema.parse({
      lane: lease ? "renewals" : "maintenance",
      entityType: lease ? "renewal_lease" : "maintenance_ticket",
      entityId: lease ?? ticket,
      purpose,
      actionKey: lease
        ? "gmail.renewal_notice.send"
        : "gmail.maintenance_owner_notice.send",
      sourceRefs: lease ? [`rentvine:lease:${lease}`] : [],
    });
    const result = await operationStage("prepare", () =>
      prepareWorkflowComposition(actor, context),
    );
    return NextResponse.json(
      {
        ...result,
        context,
        reviewedTargetHash: sequenceHash({
          to: result.target.to,
          cc: result.target.cc,
          materialSourceHash: result.target.materialSourceHash,
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return gmailHubErrorResponse(error);
  }
}

export function GET(request: Request) {
  return observeStaffOperation("communications_prepare", 0, () => handleGet(request));
}
