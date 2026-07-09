import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import { GMAIL_HARD_EXCLUSION_CATEGORIES } from "@/lib/gmail-inbox-zero/constants";
import {
  composeAnticipatoryReplyDraft,
  type ComposeAnticipatoryDraftInput,
} from "@/lib/gmail-inbox-zero/anticipatory-draft";
import { buildReplyDraft, type ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import type { TriageMessageFacts } from "@/lib/gmail-inbox-zero/rules";
import type {
  ModelProvider,
  ModelTextRequest,
  ModelTextResponse,
} from "@/lib/llm/model-provider";

// A fake ModelProvider: no Gmail, no network. It counts how many times the model was called so the
// spine-refuses-before-model behavior is provable (call count 0) and single-thread invoke = 1 call.
class FakeModelProvider implements ModelProvider {
  public calls = 0;
  public lastRequest: ModelTextRequest | undefined;

  constructor(
    private readonly responder: (
      request: ModelTextRequest,
    ) => ModelTextResponse | Promise<ModelTextResponse>,
  ) {}

  async generateText(request: ModelTextRequest): Promise<ModelTextResponse> {
    this.calls += 1;
    this.lastRequest = request;
    return this.responder(request);
  }
}

const throwingProvider = () =>
  new FakeModelProvider(() => {
    throw new Error("the model must not be called");
  });

const respondWith = (draftBody: string) =>
  new FakeModelProvider(() => ({
    text: JSON.stringify({ draft_body: draftBody }),
  }));

const message: TriageMessageFacts = {
  sender: "vendor@example.com",
  subject: "Re: invoice question",
  category: "Vendor",
};

function approvedTemplate(overrides: Partial<ReplyTemplate> = {}): ReplyTemplate {
  return {
    id: "tpl-1",
    name: "Vendor invoice acknowledgement",
    body: "Thanks, we received the invoice and will follow up.",
    status: "Approved",
    ...overrides,
  };
}

function baseInput(
  provider: ModelProvider,
  overrides: Partial<ComposeAnticipatoryDraftInput> = {},
): ComposeAnticipatoryDraftInput {
  return {
    template: approvedTemplate(),
    message,
    provider,
    model: "test-model",
    ...overrides,
  };
}

/** The exact draft the deterministic spine produces (the degrade target). */
function deterministicDraft(missingFacts: string[] = []): string {
  const result = buildReplyDraft({ template: approvedTemplate(), missingFacts });
  return result.draft ?? "";
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("composeAnticipatoryReplyDraft — deterministic spine refuses before the model", () => {
  it("refuses an unapproved template and NEVER calls the model (call count 0)", async () => {
    const provider = throwingProvider();

    const result = await composeAnticipatoryReplyDraft(
      baseInput(provider, { template: approvedTemplate({ status: "Proposed" }) }),
    );

    expect(result.ok).toBe(false);
    expect(result.refusedBeforeModel).toBe(true);
    expect(result.usedModel).toBe(false);
    expect(result.draft).toBeUndefined();
    expect(provider.calls).toBe(0);
    expect(result.errors.join(" ")).toMatch(/only Approved reply patterns/);
  });

  it("refuses every hard-excluded category and NEVER calls the model (call count 0)", async () => {
    for (const category of GMAIL_HARD_EXCLUSION_CATEGORIES) {
      const provider = throwingProvider();

      const result = await composeAnticipatoryReplyDraft(
        baseInput(provider, { category }),
      );

      expect(result.ok, category).toBe(false);
      expect(result.refusedBeforeModel, category).toBe(true);
      expect(result.usedModel, category).toBe(false);
      expect(provider.calls, category).toBe(0);
      expect(result.errors.join(" ")).toMatch(/hard exclusion/);
    }
  });

  it("refuses a hard-excluded category carried on the message itself (call count 0)", async () => {
    const provider = throwingProvider();

    const result = await composeAnticipatoryReplyDraft(
      baseInput(provider, {
        message: { ...message, category: "Owner money" },
      }),
    );

    expect(result.refusedBeforeModel).toBe(true);
    expect(provider.calls).toBe(0);
  });
});

describe("composeAnticipatoryReplyDraft — model-tailored path", () => {
  it("tailors the body and carries the banner EXACTLY once with a single model call", async () => {
    const provider = respondWith(
      "Hi there, thanks for the invoice; we will follow up shortly.",
    );

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.ok).toBe(true);
    expect(result.usedModel).toBe(true);
    expect(result.refusedBeforeModel).toBe(false);
    expect(provider.calls).toBe(1);
    expect(result.draft?.startsWith(DRAFT_BANNER)).toBe(true);
    expect(occurrences(result.draft ?? "", DRAFT_BANNER)).toBe(1);
    expect(result.draft).toContain("we will follow up shortly");
  });

  it("re-applies the Needs Verification placeholders even when the model omits them", async () => {
    const provider = respondWith("Hi there, we will follow up on your invoice soon.");

    const result = await composeAnticipatoryReplyDraft(
      baseInput(provider, { missingFacts: ["invoice number", "due date"] }),
    );

    expect(result.usedModel).toBe(true);
    expect(result.draft).toContain("Needs Verification: invoice number");
    expect(result.draft).toContain("Needs Verification: due date");
    // The banner is still present exactly once alongside the re-applied placeholders.
    expect(occurrences(result.draft ?? "", DRAFT_BANNER)).toBe(1);
  });

  it("does not duplicate a placeholder the model echoes back", async () => {
    const provider = respondWith(
      "Hi there, we will follow up.\nNeeds Verification: invoice number",
    );

    const result = await composeAnticipatoryReplyDraft(
      baseInput(provider, { missingFacts: ["invoice number"] }),
    );

    expect(result.usedModel).toBe(true);
    expect(occurrences(result.draft ?? "", "Needs Verification: invoice number")).toBe(1);
  });

  it("strips a banner the model wrongly emits so it is never duplicated", async () => {
    const provider = respondWith(`${DRAFT_BANNER}\n\nHi there, thanks for the invoice.`);

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.usedModel).toBe(true);
    expect(occurrences(result.draft ?? "", DRAFT_BANNER)).toBe(1);
    expect(result.draft?.startsWith(DRAFT_BANNER)).toBe(true);
    expect(result.draft).toContain("thanks for the invoice");
  });

  it("sends structured-output + a fact-guarding system instruction (mirrors classify.ts)", async () => {
    const provider = respondWith("Hi there, thanks for the invoice.");

    await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(provider.lastRequest?.responseJsonSchema).toBeDefined();
    expect(provider.lastRequest?.temperature).toBe(0);
    expect(provider.lastRequest?.systemInstruction).toMatch(/Never invent/i);
    expect(provider.lastRequest?.systemInstruction).toMatch(/Needs Verification/);
  });
});

describe("composeAnticipatoryReplyDraft — non-fatal degrade to the deterministic draft", () => {
  it("degrades when the model throws (one call, usedModel:false)", async () => {
    const provider = throwingProvider();

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.ok).toBe(true);
    expect(result.usedModel).toBe(false);
    expect(result.refusedBeforeModel).toBe(false);
    expect(result.draft).toBe(deterministicDraft());
    expect(provider.calls).toBe(1);
  });

  it("degrades when the model returns non-JSON text", async () => {
    const provider = new FakeModelProvider(() => ({ text: "not json at all" }));

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.ok).toBe(true);
    expect(result.usedModel).toBe(false);
    expect(result.draft).toBe(deterministicDraft());
  });

  it("degrades when the model returns the wrong JSON shape", async () => {
    const provider = new FakeModelProvider(() => ({
      text: JSON.stringify({ not_the_field: 1 }),
    }));

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.usedModel).toBe(false);
    expect(result.draft).toBe(deterministicDraft());
  });

  it("degrades when draft_body is empty or whitespace", async () => {
    const provider = respondWith("   \n  ");

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.usedModel).toBe(false);
    expect(result.draft).toBe(deterministicDraft());
  });

  it("degrades when the model returns only the banner (empty body after strip)", async () => {
    const provider = respondWith(DRAFT_BANNER);

    const result = await composeAnticipatoryReplyDraft(baseInput(provider));

    expect(result.usedModel).toBe(false);
    expect(result.draft).toBe(deterministicDraft());
    expect(occurrences(result.draft ?? "", DRAFT_BANNER)).toBe(1);
  });

  it("preserves the deterministic Needs-Verification section on degrade", async () => {
    const provider = throwingProvider();

    const result = await composeAnticipatoryReplyDraft(
      baseInput(provider, { missingFacts: ["invoice number"] }),
    );

    expect(result.usedModel).toBe(false);
    expect(result.draft).toBe(deterministicDraft(["invoice number"]));
    expect(result.draft).toContain("Needs Verification: invoice number");
  });
});
