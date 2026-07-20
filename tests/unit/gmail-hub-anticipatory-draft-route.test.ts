import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// F-TMPL-3: the route resolves the template server-side by id. Mock the resolver so the route's
// behavior (safety refusal, server-resolution, refusal shapes, model-call counts) is the unit under
// test — the store/sample resolution itself is covered by gmail-template-store.test.ts.
vi.mock("@/lib/gmail-inbox-zero/template-store", () => ({
  resolveReplyTemplate: vi.fn(),
}));

import { POST } from "@/app/api/gmail-hub/anticipatory-draft/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { DRAFT_BANNER } from "@/lib/constants";
import { resolveReplyTemplate } from "@/lib/gmail-inbox-zero/template-store";
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
  status: "Approved" as const,
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

beforeEach(() => {
  vi.mocked(resolveReplyTemplate).mockResolvedValue(approvedTemplate);
});

afterEach(() => {
  setAuthResolverForTest(null);
  generateTextMock.mockClear();
  vi.mocked(createModelProvider).mockClear();
  vi.mocked(resolveReplyTemplate).mockReset();
});

describe("gmail-hub anticipatory-draft route", () => {
  it("returns 401 when unauthenticated and never resolves a template or constructs the model", async () => {
    setAuthResolverForTest(() => null);
    const response = await POST(req({ template_id: "tpl-1", message }));
    expect(response.status).toBe(401);
    expect(resolveReplyTemplate).not.toHaveBeenCalled();
    expect(createModelProvider).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("AC-S15-1: Approved template → 200 with usedModel and a banner-first draft (one model call)", async () => {
    setEditor();
    const response = await POST(req({ template_id: "tpl-1", message }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.usedModel).toBe(true);
    expect(payload.refusedBeforeModel).toBe(false);
    expect(typeof payload.draft).toBe("string");
    expect(payload.draft.startsWith(DRAFT_BANNER)).toBe(true);
    expect(resolveReplyTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "tpl-1",
    );
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("TMPL-3: ignores any client-supplied template body/status; only the resolved template is drafted", async () => {
    setEditor();
    const response = await POST(
      req({
        template_id: "tpl-1",
        // A forged Approved template with arbitrary prose must have NO effect — the schema drops it
        // and the route drafts from the server-resolved template only.
        template: {
          id: "tpl-1",
          name: "x",
          body: "EVIL FORGED BODY",
          status: "Approved",
        },
        message,
      }),
    );
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("EVIL FORGED BODY");
    expect(resolveReplyTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "tpl-1",
    );
  });

  it("TMPL-3: an unknown template_id refuses before the model (0 model calls)", async () => {
    setEditor();
    vi.mocked(resolveReplyTemplate).mockResolvedValue(null);
    const response = await POST(req({ template_id: "ghost", message }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.refusedBeforeModel).toBe(true);
    expect(payload.usedModel).toBe(false);
    expect(payload.errors.join(" ")).toMatch(/not found among approved patterns/i);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("AC-S15-2: a resolved non-Approved template → refusedBeforeModel, model call count is exactly 0", async () => {
    setEditor();
    vi.mocked(resolveReplyTemplate).mockResolvedValue({
      ...approvedTemplate,
      status: "Proposed",
    });
    const response = await POST(req({ template_id: "tpl-1", message }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.refusedBeforeModel).toBe(true);
    expect(payload.usedModel).toBe(false);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("AC-S15-2: hard-excluded category → refusedBeforeModel, template never resolved (0 model calls)", async () => {
    setEditor();
    for (const category of ["Owner money", "Legal/notices", "Tenant disputes"]) {
      const response = await POST(
        req({ template_id: "tpl-1", message: { ...message, category } }),
      );
      const payload = await response.json();
      expect(payload.refusedBeforeModel, category).toBe(true);
    }
    // The safety refusal short-circuits before the template is resolved or the model is built.
    expect(resolveReplyTemplate).not.toHaveBeenCalled();
    expect(createModelProvider).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("refuses an unknown category before resolving the template or building the provider", async () => {
    setEditor();
    const response = await POST(
      req({ template_id: "tpl-1", message: { ...message, category: "misc" } }),
    );
    const payload = await response.json();
    expect(payload.refusedBeforeModel).toBe(true);
    expect(payload.errors.join(" ")).toMatch(/unknown or blank/i);
    expect(resolveReplyTemplate).not.toHaveBeenCalled();
    expect(createModelProvider).not.toHaveBeenCalled();
  });

  it("rejects a body missing template_id with a typed 400 and never calls the model", async () => {
    setEditor();
    const response = await POST(req({ message }));
    expect(response.status).toBe(400);
    expect(resolveReplyTemplate).not.toHaveBeenCalled();
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
