import { describe, expect, it, vi } from "vitest";

import {
  buildWorkflowAiReply,
  findUnsupportedClaims,
  lineDiff,
} from "@/lib/gmail-hub/ai-reply-policy";

const source = {
  ref: "gmail-message:message-1",
  label: "Synthetic thread message",
  text: "The approved visit date is 2026-08-01 and the amount is $125.",
  verified: true,
};

function provider(draft: string) {
  return {
    generateText: vi.fn(async () => ({ text: JSON.stringify({ draft }) })),
  };
}

describe("workflow-reply:v1.0", () => {
  it("returns a transient source-visible proposal and line diff", async () => {
    const model = provider("Thank you. The approved visit date is 2026-08-01.");
    const result = await buildWorkflowAiReply({
      artifactRef: "maintenance-owner:v1.0",
      category: "scheduling",
      currentText: "Thank you.",
      model: "synthetic-model",
      provider: model,
      sources: [source],
    });
    expect(result).toMatchObject({
      ok: true,
      reviewState: "Needs Review",
      applied: false,
      persisted: false,
      usedModel: true,
      policyRef: "workflow-reply:v1.0",
      artifactRef: "maintenance-owner:v1.0",
      sources: [{ ref: source.ref, label: source.label }],
    });
    expect(result.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.diff.added).toContain(
      "Thank you. The approved visit date is 2026-08-01.",
    );
    expect(model.generateText).toHaveBeenCalledTimes(1);
  });

  it("refuses invented amounts, dates, recipients, and commitments", async () => {
    const model = provider(
      "We will guarantee completion by 2026-09-09 for $999. Email fake@example.com.",
    );
    const result = await buildWorkflowAiReply({
      artifactRef: "maintenance-owner:v1.0",
      category: "scheduling",
      currentText: "",
      model: "synthetic-model",
      provider: model,
      sources: [source],
    });
    expect(result.ok).toBe(false);
    expect(result.proposal).toBe("");
    expect(result.errors.join(" ")).toMatch(/unsupported value|unsupported commitment/i);
    expect(result.persisted).toBe(false);
  });

  it("refuses exclusions and unverified sources before model construction", async () => {
    const excluded = provider("Any draft");
    const excludedResult = await buildWorkflowAiReply({
      artifactRef: "maintenance-owner:v1.0",
      category: "legal_notices",
      currentText: "",
      model: "synthetic-model",
      provider: excluded,
      sources: [source],
    });
    expect(excludedResult.ok).toBe(false);
    expect(excluded.generateText).not.toHaveBeenCalled();

    const unverified = provider("Any draft");
    const unverifiedResult = await buildWorkflowAiReply({
      artifactRef: "maintenance-owner:v1.0",
      category: "scheduling",
      currentText: "",
      model: "synthetic-model",
      provider: unverified,
      sources: [{ ...source, verified: false }],
    });
    expect(unverifiedResult.ok).toBe(false);
    expect(unverified.generateText).not.toHaveBeenCalled();
  });

  it("detects only claims absent from the authorized corpus", () => {
    expect(
      findUnsupportedClaims(
        "The amount is $125 on 2026-08-01.",
        "Approved: $125 on 2026-08-01.",
      ),
    ).toEqual([]);
    expect(findUnsupportedClaims("The amount is $999.", "Approved: $125.")).toEqual([
      "unsupported value $999",
    ]);
    expect(lineDiff("one\ntwo", "one\nthree")).toEqual({
      removed: ["two"],
      added: ["three"],
    });
  });
});
