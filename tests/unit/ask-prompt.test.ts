import { describe, expect, it } from "vitest";

import type { AnswerGenerationRequest } from "@/lib/llm/answer";
import { buildGroundedAnswerSystemPrompt, buildGroundedAnswerUserPrompt } from "@/lib/llm/prompt";

// The action console makes the answer process-aware (R4b): when a process is selected the server resolves
// its context and feeds it to the prompt as a HINT — never as a citable source. These guard that the hint
// appears in the user payload only when present, and that the system prompt keeps it out of citations.

function baseRequest(
  overrides: Partial<AnswerGenerationRequest> = {},
): AnswerGenerationRequest {
  return {
    ask: {
      question: "How do renewals work?",
      draft_enabled: true,
    },
    grounding: {
      citations: [],
      confidence: 0.9,
      sourceIds: ["drive-file-1"],
      sources: [
        {
          approvalStatus: "Approved",
          citation: {
            source_id: "drive-file-1",
            title: "Lease Renewals SOP",
            url: "https://drive.google.com/file/d/drive-file-1/view",
          },
          confidence: 0.9,
          driveFileId: "drive-file-1",
          sourceId: "drive-file-1",
          spaceId: "lease-renewals",
        },
      ],
    },
    sourceState: "Verified Source",
    ...overrides,
  };
}

describe("grounded answer prompt — process awareness", () => {
  it("includes the process hint in the payload when a process context is present", () => {
    const prompt = buildGroundedAnswerUserPrompt(
      baseRequest({
        process: {
          name: "Lease Renewal",
          outcome: "Prepare a renewal package",
          steps: ["Owner decision", "Tenant intake"],
        },
      }),
    );

    const payload = JSON.parse(prompt.slice(prompt.indexOf("{")));
    expect(payload.process).toEqual({
      name: "Lease Renewal",
      outcome: "Prepare a renewal package",
      steps: ["Owner decision", "Tenant intake"],
    });
  });

  it("omits the process key entirely when no process context is provided", () => {
    const prompt = buildGroundedAnswerUserPrompt(baseRequest());
    const payload = JSON.parse(prompt.slice(prompt.indexOf("{")));
    expect("process" in payload).toBe(false);
  });

  it("instructs the model that process context is never a citable source", () => {
    const system = buildGroundedAnswerSystemPrompt();
    expect(system).toContain("never cite it as a source");
  });
});
