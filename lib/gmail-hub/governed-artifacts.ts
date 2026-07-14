import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";

/** A human-authored label action; it does not classify a message or imply a workflow decision. */
export const GMAIL_MANUAL_LABEL_RULE_REF = "manual-human-review:v1";

/**
 * No production workflow reply templates are approved in the repository yet. Sample Gmail Hub
 * templates are intentionally excluded. Additions require an approved/versioned product artifact.
 */
export function isApprovedWorkflowReplyTemplate(
  context: WorkflowCommunicationContext,
): boolean {
  void context;
  return false;
}
