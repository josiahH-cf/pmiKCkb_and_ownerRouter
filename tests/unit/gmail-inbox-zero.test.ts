import { describe, expect, it } from "vitest";
import { DRAFT_BANNER } from "@/lib/constants";
import {
  GMAIL_HARD_EXCLUSION_CATEGORIES,
  GMAIL_INBOX_ZERO_BASE_LABELS,
  GMAIL_INBOX_ZERO_LABELS,
  GMAIL_INBOX_ZERO_PHASES,
  GMAIL_RULE_STATUSES,
} from "@/lib/gmail-inbox-zero/constants";
import { buildReplyDraft, type ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import {
  evaluateInboxTriage,
  proposeRuleChangeFromFeedback,
  type LabelRule,
  type TriageMessageFacts,
} from "@/lib/gmail-inbox-zero/rules";

const message: TriageMessageFacts = {
  sender: "vendor@example.com",
  subject: "Re: invoice question",
  category: "Vendor",
};

function approvedExactRule(overrides: Partial<LabelRule> = {}): LabelRule {
  return {
    id: "rule-1",
    label: "Waiting on Outside",
    plain_english: "Mail from vendor@example.com is waiting on someone outside PMI KC.",
    criteria: { sender: "vendor@example.com" },
    match_kind: "exact",
    status: "Approved",
    ...overrides,
  };
}

function approvedTemplate(overrides: Partial<ReplyTemplate> = {}): ReplyTemplate {
  return {
    id: "tpl-1",
    name: "Vendor invoice acknowledgement",
    body: "Thanks — we received the invoice and will follow up.",
    status: "Approved",
    ...overrides,
  };
}

describe("gmail inbox zero vocabulary", () => {
  it("locks the doc-confirmed labels, phases, statuses, and hard exclusions", () => {
    expect(GMAIL_INBOX_ZERO_BASE_LABELS).toEqual([
      "Waiting on Outside",
      "Waiting on Team",
    ]);
    expect(GMAIL_INBOX_ZERO_LABELS).toEqual([
      "Waiting on Outside",
      "Waiting on Team",
      "Dan Decision",
      "Draft Ready",
    ]);
    expect(GMAIL_INBOX_ZERO_PHASES).toEqual(["Shadow", "Suggest", "Drafts"]);
    expect(GMAIL_RULE_STATUSES).toEqual(["Proposed", "Approved", "Retired"]);
    expect(GMAIL_HARD_EXCLUSION_CATEGORIES).toEqual([
      "Owner money",
      "Legal/notices",
      "Tenant disputes",
    ]);
  });
});

describe("evaluateInboxTriage", () => {
  it("applies nothing in the Shadow phase, even for approved exact matches", () => {
    const result = evaluateInboxTriage([approvedExactRule()], message, "Shadow");

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({
      label: "Waiting on Outside",
      rule_id: "rule-1",
    });
    expect(result.auto_apply).toEqual([]);
  });

  it("auto-applies only approved exact matches past Shadow", () => {
    const result = evaluateInboxTriage([approvedExactRule()], message, "Suggest");

    expect(result.auto_apply).toHaveLength(1);
    expect(result.auto_apply[0].reason).toMatch(/vendor@example.com/);
  });

  it("keeps pattern rules suggestion-only", () => {
    const patternRule = approvedExactRule({
      id: "rule-2",
      criteria: { subject_contains: "invoice" },
      match_kind: "pattern",
    });

    const result = evaluateInboxTriage([patternRule], message, "Suggest");

    expect(result.suggestions).toHaveLength(1);
    expect(result.auto_apply).toEqual([]);
  });

  it("ignores Proposed and Retired rules entirely", () => {
    const result = evaluateInboxTriage(
      [
        approvedExactRule({ id: "rule-3", status: "Proposed" }),
        approvedExactRule({ id: "rule-4", status: "Retired" }),
      ],
      message,
      "Suggest",
    );

    expect(result.suggestions).toEqual([]);
    expect(result.auto_apply).toEqual([]);
  });

  it("never matches a rule without structured criteria", () => {
    const result = evaluateInboxTriage(
      [approvedExactRule({ id: "rule-5", criteria: undefined })],
      message,
      "Suggest",
    );

    expect(result.suggestions).toEqual([]);
  });

  it("requires every defined criterion to match", () => {
    const result = evaluateInboxTriage(
      [
        approvedExactRule({
          id: "rule-6",
          criteria: { sender: "vendor@example.com", category: "Owner" },
        }),
      ],
      message,
      "Suggest",
    );

    expect(result.suggestions).toEqual([]);
  });
});

describe("proposeRuleChangeFromFeedback", () => {
  it("turns a label correction into a Proposed exact rule that needs Admin approval", () => {
    const proposal = proposeRuleChangeFromFeedback({
      thread_ref: "thread-9",
      previous_label: "Waiting on Team",
      corrected_label: "Waiting on Outside",
      noted_by: "dan",
      noted_at: "2026-06-12T00:00:00Z",
      message,
    });

    expect(proposal.status).toBe("Proposed");
    expect(proposal.match_kind).toBe("exact");
    expect(proposal.criteria).toEqual({ sender: "vendor@example.com" });
    expect(proposal.plain_english).toMatch(/Requires Admin approval/);
    expect(proposal.plain_english).toMatch(/instead of Waiting on Team/);
  });
});

describe("buildReplyDraft", () => {
  it("builds an approved-template draft carrying the review banner", () => {
    const result = buildReplyDraft({ template: approvedTemplate() });

    expect(result.ok).toBe(true);
    expect(result.draft?.startsWith(DRAFT_BANNER)).toBe(true);
    expect(result.draft).toContain("we received the invoice");
  });

  it("marks missing facts with the Needs Verification placeholder", () => {
    const result = buildReplyDraft({
      template: approvedTemplate(),
      missingFacts: ["invoice number", "due date"],
    });

    expect(result.draft).toContain("Needs Verification: invoice number");
    expect(result.draft).toContain("Needs Verification: due date");
  });

  it("refuses non-approved reply templates", () => {
    const result = buildReplyDraft({
      template: approvedTemplate({ status: "Proposed" }),
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/only Approved reply patterns/);
  });

  it("refuses hard-excluded categories (label only, never draft)", () => {
    for (const category of GMAIL_HARD_EXCLUSION_CATEGORIES) {
      const result = buildReplyDraft({ template: approvedTemplate(), category });

      expect(result.ok, category).toBe(false);
      expect(result.errors.join(" ")).toMatch(/hard exclusion/);
    }
  });
});
