import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTransactionalFirestore } from "../helpers/fake-transactional-firestore";

const mocks = vi.hoisted(() => ({ getAdminFirestore: vi.fn() }));
vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: mocks.getAdminFirestore,
}));

vi.mock("@/lib/llm/answer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/answer")>();
  return {
    ...actual,
    GoogleGenAiAnswerGenerator: class {
      async generateAnswer() {
        throw new Error("Isolated model unavailable");
      }
    },
  };
});
import { POST } from "@/app/api/ask/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

const validBody = {
  question: "What is the renewal process?",
  draft_enabled: true,
};
const originalAskDemoMode = process.env.ASK_DEMO_MODE;
const originalGcpProjectId = process.env.GCP_PROJECT_ID;
let store: FakeTransactionalFirestore;
let expectedLogCount = 0;

beforeEach(() => {
  vi.clearAllMocks();
  expectedLogCount = 0;
  store = new FakeTransactionalFirestore();
  mocks.getAdminFirestore.mockReturnValue(store);
});

afterEach(() => {
  process.env.ASK_DEMO_MODE = originalAskDemoMode;
  process.env.GCP_PROJECT_ID = originalGcpProjectId;
  setAuthResolverForTest(null);
  expect(store.store.size).toBe(expectedLogCount);
});

describe("Ask API auth guard", () => {
  it("returns 401 when unauthenticated", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(makeRequest(validBody));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication is required.",
    });
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
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
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });

  it("returns labeled best-effort coverage when retrieval and generation are unavailable", async () => {
    process.env.ASK_DEMO_MODE = "false";
    process.env.GCP_PROJECT_ID = "";
    setAuthResolverForTest(() => ({
      uid: "editor",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    const response = await POST(makeRequest(validBody));

    expectedLogCount = 1;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source_state: "No Reliable Source Found",
      draft: "",
      citations: [],
      answered_by: { model: "Application fallback", source_count: 0 },
      evidence_context: {
        mode: "guidance",
        claims: [
          expect.objectContaining({ kind: "unknown", source_ids: [] }),
          expect.objectContaining({ kind: "recommendation", source_ids: [] }),
        ],
      },
    });
    // The unchanged audit records an honest unverified answer; no provider effect is created.
    expect(mocks.getAdminFirestore).toHaveBeenCalled();
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
    expect(mocks.getAdminFirestore).not.toHaveBeenCalled();
  });
});

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
