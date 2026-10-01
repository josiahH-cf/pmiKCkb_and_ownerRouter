import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";

// S148/S151: the Dashboard query route reads a completed history turn (to replay a duplicate
// delivery) only where history is actually saved. In the Live-read-only rehearsal and for
// verification accounts no history exists, so the route reads none: no Firestore read per question
// against a real project. Asking still works everywhere.

const state = vi.hoisted(() => ({
  user: null as unknown as AuthenticatedUser,
  historyReads: 0,
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: async () => state.user,
}));
vi.mock("@/lib/firestore/assistant-history-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/assistant-history-read")>()),
  readCompletedTurnAnswer: async () => {
    state.historyReads += 1;
    return null;
  },
}));
vi.mock("@/lib/config/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server")>()),
  readServerConfig: () => ({
    askDemoMode: true,
    modelProvider: "gemini",
    geminiClassifyModel: "test-classify-model",
    localModelName: "test-local-model",
  }),
}));
vi.mock("@/lib/operational-context/server-context", async () => {
  const fake = await import("@/tests/helpers/operational-context-fake");
  return { createServerOperationalContext: () => fake.fakeOperationalContext() };
});

import { POST } from "@/app/api/assistant/query/route";
import { resetOperationDedupe } from "@/lib/api/assistant-operation-dedupe";

const owner: AuthenticatedUser = {
  uid: "owner-1",
  email: "owner1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

async function ask(operationId: string) {
  const response = await POST(
    new Request("http://localhost/api/assistant/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "What work is assigned to me today?",
        conversation: null,
        operationId,
      }),
    }),
  );
  expect(response.status).toBe(200);
}

beforeEach(() => {
  state.user = owner;
  state.historyReads = 0;
  resetOperationDedupe();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("S148 replay reads history only where history is saved", () => {
  it("reads the completed turn in Production", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
    await ask("00000000-0000-4000-8000-000000000001");
    expect(state.historyReads).toBe(1);
  });

  it("reads nothing in the Live-read-only rehearsal against a real project", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "live_readonly");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
    await ask("00000000-0000-4000-8000-000000000002");
    expect(state.historyReads).toBe(0);
  });

  it("reads the emulator history under the automated harness", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "demo");
    vi.stubEnv("DATA_CONTEXT", "live_readonly");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    await ask("00000000-0000-4000-8000-000000000003");
    expect(state.historyReads).toBe(1);
  });

  it("reads nothing for a verification account", async () => {
    vi.stubEnv("ENVIRONMENT_KIND", "production");
    vi.stubEnv("DATA_CONTEXT", "live");
    state.user = { ...owner, email: "canary-admin@pmikcmetro.com" };
    await ask("00000000-0000-4000-8000-000000000004");
    expect(state.historyReads).toBe(0);
  });
});
