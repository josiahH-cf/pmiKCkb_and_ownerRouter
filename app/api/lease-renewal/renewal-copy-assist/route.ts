import { NextResponse } from "next/server";

import { apiErrorResponse, parseJsonBody } from "@/lib/api/editable";
import { requireCapabilityInSpace } from "@/lib/auth/session";
import { readServerConfig } from "@/lib/config/server";
import {
  RenewalCopyAssistRequestSchema,
  defaultRenewalCopySelection,
  renewalCopyChannelForRef,
} from "@/lib/lease-renewal/renewal-copy-contract";
import {
  assistGovernedRenewalCopy,
  currentRenewalCopyTemplate,
  renewalCopyTemplateSummary,
} from "@/lib/lease-renewal/renewal-copy-governance";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import {
  AnswerGenerationSetupError,
  createModelProvider,
} from "@/lib/llm/model-provider";

/**
 * Tailor only the allowlisted prose regions of one server-resolved renewal template. This route
 * reads no lease, recipient, amount, date, Gmail body, or provider evidence and has no Gmail/source
 * writer. Current review-only templates refuse before model configuration or construction.
 */
export async function POST(request: Request) {
  try {
    await requireCapabilityInSpace(renewalRoleCapability("tailor_copy"), "renewals");
    const input = await parseJsonBody(request, RenewalCopyAssistRequestSchema);
    const channel = renewalCopyChannelForRef(input.templateRef);
    const template = currentRenewalCopyTemplate(channel);
    const summary = renewalCopyTemplateSummary(template);
    const selection = defaultRenewalCopySelection(channel);

    if (
      input.templateRef !== template.ref ||
      input.templateVersion !== template.version ||
      template.publication.status !== "approved"
    ) {
      const reason =
        template.publication.status === "approved"
          ? "The requested copy version is not the current server template."
          : template.publication.status === "review_only"
            ? `Review-only copy cannot use AI assistance until client-approved wording is published. ${template.publication.reason}`
            : `This renewal copy version is retired. ${template.publication.reason}`;
      return NextResponse.json({
        status: "refused",
        template: summary,
        selection,
        usedModel: false,
        refusedBeforeModel: true,
        errors: [reason],
      });
    }

    try {
      const config = readServerConfig();
      const provider = createModelProvider(config);
      const model =
        config.modelProvider === "local"
          ? config.localModelName
          : config.geminiAnswerModel;
      return NextResponse.json(
        await assistGovernedRenewalCopy({
          template,
          selection,
          provider,
          model,
        }),
      );
    } catch (error) {
      if (!(error instanceof AnswerGenerationSetupError)) throw error;
      return NextResponse.json({
        status: "ready",
        template: summary,
        selection,
        usedModel: false,
        refusedBeforeModel: false,
        errors: [
          "Assistance is unavailable; the current approved deterministic prose was kept.",
        ],
      });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
