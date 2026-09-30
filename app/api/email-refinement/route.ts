import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { refinementModelRateLimiter } from "@/lib/api/model-call-throttle";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  ownerNoticeRefinementContext,
  renewalRefinementContext,
  residentReplyRefinementContext,
  type RefinementContext,
} from "@/lib/email-refinement/context";
import {
  EMAIL_REFINEMENT_VERSION,
  MAX_REFINED_BODY_LENGTH,
  MAX_REFINEMENT_INSTRUCTION_LENGTH,
  refineEmailDraft,
} from "@/lib/email-refinement/refine";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import { createModelProvider } from "@/lib/llm/model-provider";

// S139: one instruction refines the current draft on a workflow-linked draft screen. The caller
// sends the draft text and the instruction; the record facts come from the owning service as the
// signed-in actor with the same permission the draft screen itself needs. The response is only a
// proposed revision: nothing is saved, drafted or sent here, and a failure leaves the draft as is.
export const dynamic = "force-dynamic";

const body = z.string().max(MAX_REFINED_BODY_LENGTH);
const instruction = z.string().trim().min(1).max(MAX_REFINEMENT_INSTRUCTION_LENGTH);

const RequestSchema = z.discriminatedUnion("surface", [
  z
    .object({
      surface: z.literal("renewal_message"),
      leaseId: z.string().regex(/^[1-9]\d*$/),
      channel: z.enum(["owner", "tenant"]),
      currentBody: body,
      instruction,
    })
    .strict(),
  z
    .object({
      surface: z.literal("maintenance_owner_notice"),
      ticketRef: z.string().trim().min(1).max(120),
      currentBody: body,
      instruction,
    })
    .strict(),
  z
    .object({
      surface: z.literal("maintenance_resident_reply"),
      messageId: z.number().int().positive(),
      currentBody: body,
      instruction,
    })
    .strict(),
]);

export async function POST(request: Request) {
  try {
    const input = await parseJsonBody(request, RequestSchema);
    const actor =
      input.surface === "renewal_message"
        ? await requireCapabilityInSpace(
            renewalRoleCapability("draft_create"),
            "renewals",
          )
        : await requireCapabilityInSpace("edit", "maintenance");
    if (!refinementModelRateLimiter.check(actor.uid, Date.now()).allowed)
      return NextResponse.json(
        {
          error:
            "Too many wording requests. Wait a moment and try again; your draft is unchanged.",
        },
        { status: 429 },
      );
    let context: RefinementContext;
    if (input.surface === "renewal_message")
      context = await renewalRefinementContext(actor, input.leaseId, input.channel);
    else if (input.surface === "maintenance_owner_notice")
      context = await ownerNoticeRefinementContext(actor, input.ticketRef);
    else context = await residentReplyRefinementContext(actor, input.messageId);

    const config = readServerConfig();
    if (config.askDemoMode)
      return NextResponse.json({
        version: EMAIL_REFINEMENT_VERSION,
        status: "unavailable",
        reason:
          "The wording assistant is not available in local rehearsal. Your draft is unchanged.",
      });
    const provider = createModelProvider(config);
    const model =
      config.modelProvider === "local" ? config.localModelName : config.geminiAnswerModel;
    const result = await refineEmailDraft(
      {
        surface: input.surface,
        purpose: context.purpose,
        currentBody: input.currentBody,
        instruction: input.instruction,
        facts: context.facts,
        protectedPhrases: context.protectedPhrases,
        ...(context.quotedContent ? { quotedContent: context.quotedContent } : {}),
      },
      { provider, model },
    );
    return NextResponse.json(
      {
        version: EMAIL_REFINEMENT_VERSION,
        ...result,
        ...(result.status === "revised" && context.baseHash
          ? { baseHash: context.baseHash }
          : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
