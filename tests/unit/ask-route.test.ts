import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/ask/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

const validBody = {
  question: "What is the renewal process?",
  draft_enabled: true,
};
const originalAskDemoMode = process.env.ASK_DEMO_MODE;
const originalGcpProjectId = process.env.GCP_PROJECT_ID;

afterEach(() => {
  process.env.ASK_DEMO_MODE = originalAskDemoMode;
  process.env.GCP_PROJECT_ID = originalGcpProjectId;
  setAuthResolverForTest(null);
});

describe("Ask API auth guard", () => {
  it("returns 401 when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication is required.",
    });
  });

  it("returns 403 when the hosted domain is not allowed", async () => {
    setAuthResolverForTest(() => ({
      uid: "wrong-domain",
      email: "editor@example.com",
      hd: "example.com",
      role: "Editor",
    }));

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Google Workspace hosted domain is not allowed.",
    });
  });

  it("returns a setup error when live retrieval is not configured", async () => {
    process.env.ASK_DEMO_MODE = "false";
    process.env.GCP_PROJECT_ID = "";
    setAuthResolverForTest(() => ({
      uid: "editor",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Missing GCP_PROJECT_ID for Vertex AI Search.",
      error_type: "RetrievalSetupError",
    });
  });

  it("returns the local demo verified-source answer when demo mode is active", async () => {
    process.env.ASK_DEMO_MODE = "true";
    setAuthResolverForTest(() => ({
      uid: "editor",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      question: validBody.question,
      source_state: "Verified Source",
      citations: [expect.objectContaining({ source_id: "demo-lease-renewals-sop" })],
    });
  });
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
