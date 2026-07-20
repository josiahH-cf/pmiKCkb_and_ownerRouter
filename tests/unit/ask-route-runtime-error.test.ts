import { afterEach, describe, expect, it, vi } from "vitest";

// LR-03: a runtime retrieval/model OUTAGE (not just a setup gap) must degrade to a graceful, retryable
// 503 instead of a bare 500. Isolated file so mocking answerQuestion does not affect the env-driven
// happy/setup-path tests in ask-route.test.ts.
vi.mock("@/lib/ask/service", () => ({
  answerQuestion: vi.fn(async () => {
    throw new Error("Vertex Search request timed out");
  }),
}));

import { POST } from "@/app/api/ask/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

afterEach(() => setAuthResolverForTest(null));

describe("Ask API runtime-outage degradation (LR-03)", () => {
  it("returns a graceful 503 (not a bare 500) when the answer service throws a runtime error", async () => {
    setAuthResolverForTest(() => ({
      uid: "editor",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    const response = await POST(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: "What is the renewal process?",
          draft_enabled: true,
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error_type: "AskRuntimeError",
    });
  });
});
