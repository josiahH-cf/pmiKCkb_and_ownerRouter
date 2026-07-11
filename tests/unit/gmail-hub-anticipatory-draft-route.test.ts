import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

// Mock ONLY the model-provider factory so we inject a fake provider and can count model calls; keep the
// rest of the module (esp. AnswerGenerationSetupError, which the route imports) real. The composer
// (composeAnticipatoryReplyDraft) is NOT mocked — it runs for real so the spine-refuses-before-model
// guarantee is exercised end to end (call count 0 on refusal).
const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(async () => ({
    text: JSON.stringify({ draft_body: "Tailored: thanks, we will follow up shortly." }),
  })),
}));
vi.mock("@/lib/llm/model-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/model-provider")>();
  return {
    ...actual,
    createModelProvider: vi.fn(() => ({ generateText: generateTextMock })),
  };
});

import { POST } from "@/app/api/gmail-hub/anticipatory-draft/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { createModelProvider } from "@/lib/llm/model-provider";

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "josiah@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

const approvedTemplate = {
  id: "tpl-1",
  name: "Vendor invoice acknowledgement",
  body: "Thanks, we received the invoice and will follow up.",
  status: "Approved",
};

const message = {
  sender: "vendor@example.com",
  subject: "Re: invoice question",
  category: "Vendor",
};

function req(body: unknown) {
  return new Request("http://localhost/api/gmail-hub/anticipatory-draft", {
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

describe("gmail-hub anticipatory-draft route", () => {
  it("returns 401 when unauthenticated and never constructs the model provider", async () => {
    setAuthResolverForTest(() => null);
    const response = await POST(req({ template: approvedTemplate, message }));
    expect(response.status).toBe(401);
    expect(createModelProvider).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("AC-S15-1: Approved template → 200 with usedModel and a banner-first draft (one model call)", async () => {
    setEditor();
    const response = await POST(req({ template: approvedTemplate, message }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.usedModel).toBe(true);
    expect(payload.refusedBeforeModel).toBe(false);
    expect(typeof payload.draft).toBe("string");
    expect(payload.draft.startsWith(DRAFT_BANNER)).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("AC-S15-2: unapproved template → refusedBeforeModel, model call count is exactly 0", async () => {
    setEditor();
    const response = await POST(
      req({ template: { ...approvedTemplate, status: "Proposed" }, message }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.refusedBeforeModel).toBe(true);
    expect(payload.usedModel).toBe(false);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("AC-S15-2: hard-excluded category → refusedBeforeModel, model never sees it (0 calls)", async () => {
    setEditor();
    for (const category of ["Owner money", "Legal/notices", "Tenant disputes"]) {
      const response = await POST(
        req({ template: approvedTemplate, message: { ...message, category } }),
      );
      const payload = await response.json();
      expect(payload.refusedBeforeModel, category).toBe(true);
    }
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with a typed 400 and never calls the model", async () => {
    setEditor();
    const response = await POST(req({ template: { id: "x" }, message }));
    expect(response.status).toBe(400);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("AC-S15-1: the route module imports no @/lib/gmail-runtime/* (negative-import pin)", () => {
    const source = stripComments(
      readFileSync(
        join(process.cwd(), "app", "api", "gmail-hub", "anticipatory-draft", "route.ts"),
        "utf8",
      ),
    );
    expect(source).not.toContain("@/lib/gmail-runtime");
    expect(source).not.toContain("GmailRuntimeClient");
  });
});

// Strip block + line comments so a doc-comment naming a forbidden import can't satisfy/fail the check
// (mirrors tests/unit/route-auth-boundary.test.ts).
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
