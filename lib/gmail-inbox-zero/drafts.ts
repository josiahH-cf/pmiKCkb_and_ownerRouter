import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import { inspectGmailDraftSafety } from "@/lib/gmail-inbox-zero/draft-safety";
import type { GmailRuleStatus } from "@/lib/gmail-inbox-zero/rules";

/**
 * Reply-template domain model and draft-text builder from
 * docs/products/gmail-inbox-zero.md. Drafts use approved reply patterns only, always
 * carry the `Draft — Review before sending` boundary, mark missing facts with the
 * `Needs Verification: <fact>` placeholder, and refuse hard-excluded categories
 * (label only, never draft).
 *
 * Pure text composition only: this module creates no Gmail draft and has no send
 * capability. Dan presses Send; nothing here can.
 */

export interface ReplyTemplate {
  id: string;
  name: string;
  body: string;
  status: GmailRuleStatus;
}

export interface BuildReplyDraftInput {
  template: ReplyTemplate;
  missingFacts?: string[];
  category: string;
}

export interface BuildReplyDraftResult {
  ok: boolean;
  draft?: string;
  errors: string[];
}

export function buildReplyDraft(input: BuildReplyDraftInput): BuildReplyDraftResult {
  const errors: string[] = [];
  const { template, category } = input;
  const missingFacts = input.missingFacts ?? [];

  if (template.status !== "Approved") {
    errors.push(
      `Reply template "${template.name}" is ${template.status}; only Approved reply patterns can produce drafts.`,
    );
  }

  const categorySafety = inspectGmailDraftSafety({ category });
  errors.push(...categorySafety.errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const sections = [DRAFT_BANNER, template.body.trim()];

  if (missingFacts.length > 0) {
    sections.push(
      missingFacts
        .map((fact) => UNVERIFIED_PLACEHOLDER.replace("<fact>", fact))
        .join("\n"),
    );
  }

  return { ok: true, draft: sections.join("\n\n"), errors: [] };
}
