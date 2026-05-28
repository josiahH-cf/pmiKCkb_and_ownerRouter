import { DRAFT_BANNER } from "@/lib/constants";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import {
  demoCitation,
  isLeaseRenewalsDemoQuestion,
  isUnsupportedDemoQuestion,
} from "@/lib/demo/data";
import type { AskRequest, AskResponse } from "@/lib/schemas";
import { noReliableSourceResponse } from "@/lib/source-state";

export interface AskServiceOptions {
  config?: ServerConfig;
}

export async function answerQuestion(
  user: AuthenticatedUser,
  request: AskRequest,
  options: AskServiceOptions = {},
): Promise<AskResponse> {
  const config = options.config ?? readServerConfig();

  if (config.askDemoMode) {
    return answerDemoQuestion(user, request);
  }

  return noReliableSourceResponse(request.question);
}

function answerDemoQuestion(user: AuthenticatedUser, request: AskRequest): AskResponse {
  if (
    isUnsupportedDemoQuestion(request.question) ||
    !isLeaseRenewalsDemoQuestion(request.question)
  ) {
    return noReliableSourceResponse(request.question);
  }

  return {
    question: request.question,
    source_state: "Verified Source",
    answer:
      "Use the Lease Renewals demo SOP: check the lease and renewal status, confirm owner direction before commitments, and use approved follow-up wording only for documented details.",
    handling_steps: [
      "Open the Lease Renewals Space.",
      "Check the renewal SOP and any open placeholders.",
      "Use the approved owner follow-up template only for verified details.",
      "Create a placeholder for undocumented fees, timing, or approval details.",
    ],
    citations: [demoCitation],
    draft: `${DRAFT_BANNER}\n\nHi [Owner Name],\n\nWe are checking the renewal status and will confirm the recommended next step once the documented renewal details are verified.\n\nThank you,`,
    escalation_owner: user.role === "Editor" ? "Approver" : "Process owner",
  };
}
