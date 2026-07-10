import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(async () => ({
    text: JSON.stringify({
      summary: "Vendor confirmed the invoice.",
      waiting_on: "Owner approval.",
      suggested_next_action: "Forward to the owner.",
    }),
  })),
}));
vi.mock("@/lib/llm/model-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/model-provider")>();
  return {
    ...actual,
    createModelProvider: vi.fn(() => ({ generateText: generateTextMock })),
  };
});

import { POST } from "@/app/api/gmail-hub/thread-summary/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { createModelProvider } from "@/lib/llm/model-provider";

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "josiah@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function req(body: unknown) {
  return new Request("http://localhost/api/gmail-hub/thread-summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  generateTextMock.mockClear();
  vi.mocked(createModelProvider).mockClear();
});

describe("gmail-hub thread-summary route (AC-S15-4)", () => {
  it("returns 401 when unauthenticated and never constructs the model provider", async () => {
    setAuthResolverForTest(() => null);
    const response = await POST(req({ threadText: "hello" }));
    expect(response.status).toBe(401);
    expect(createModelProvider).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("returns 200 with a structured summary object over pasted text", async () => {
    setEditor();
    const response = await POST(req({ threadText: "Vendor: invoice attached. Manager: thanks." }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.usedModel).toBe(true);
    expect(payload.summary).toBe("Vendor confirmed the invoice.");
    expect(payload.waiting_on).toBe("Owner approval.");
    expect(payload.suggested_next_action).toBe("Forward to the owner.");
  });

  it("returns a typed 400 for an empty/whitespace paste and never calls the model", async () => {
    setEditor();
    const response = await POST(req({ threadText: "   \n  " }));
    expect(response.status).toBe(400);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("imports no @/lib/gmail-runtime/* (negative-import pin)", () => {
    const source = stripComments(
      readFileSync(
        join(process.cwd(), "app", "api", "gmail-hub", "thread-summary", "route.ts"),
        "utf8",
      ),
    );
    expect(source).not.toContain("@/lib/gmail-runtime");
    expect(source).not.toContain("GmailRuntimeClient");
  });
});

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
