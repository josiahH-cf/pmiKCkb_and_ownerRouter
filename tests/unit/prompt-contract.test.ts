import { describe, expect, it } from "vitest";
import { DRAFT_BANNER, UNVERIFIED_PLACEHOLDER } from "@/lib/constants";
import { buildGroundedAnswerSystemPrompt } from "@/lib/llm/prompt";

describe("model contract prompt", () => {
  it("preserves verbatim shared vocabulary", () => {
    const prompt = buildGroundedAnswerSystemPrompt();

    expect(prompt).toContain(DRAFT_BANNER);
    expect(prompt).toContain(UNVERIFIED_PLACEHOLDER);
    expect(prompt).toContain("No Reliable Source Found");
  });
});
