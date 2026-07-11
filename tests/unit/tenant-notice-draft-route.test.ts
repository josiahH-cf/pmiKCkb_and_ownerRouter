import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the lease lookup + composer so the route test is deterministic, and mock the gate + Gmail client
// so we can exercise both the gate-closed and gate-open branches without a real Gmail call. Twin of
// tests/unit/owner-notice-draft-route.test.ts.
vi.mock("@/lib/lease-renewal/sample-desk", () => ({
  getRenewalLeaseWorkspace: vi.fn((id: string) => {
    if (id === "lease-known")
      return { tenantDraft: { channels: { email: { subject: "s", body: "b" } } } };
    if (id === "lease-no-offer") return { tenantDraft: null };
    return null;
  }),
}));
vi.mock("@/lib/lease-renewal/notice-send-policy", () => ({
  buildTenantNoticeDraftRequest: vi.fn(() => ({
    kind: "gmail_renewal_notice_draft",
    channel: "tenant",
    to: "tenant@example.com",
    subject: "Your lease renewal",
    body: "Draft — Review before sending\n\nHere is your renewal offer.",
    missingInputs: [],
    production_allowed: false,
    send_allowed: false,
  })),
}));
vi.mock("@/lib/integrations/action-gate", () => ({
  isActionExecutable: vi.fn(() => false),
}));
const { createDraftMock } = vi.hoisted(() => ({
  createDraftMock: vi.fn(async () => ({ draftId: "draft_t1" })),
}));
vi.mock("@/lib/gmail-runtime/client", () => ({
  GmailRuntimeClient: vi.fn(function (this: { createDraft: unknown }) {
    this.createDraft = createDraftMock;
  }),
  GmailRuntimeError: class GmailRuntimeError extends Error {},
}));

import { POST } from "@/app/api/lease-renewal/tenant-notice-draft/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { isActionExecutable } from "@/lib/integrations/action-gate";

function setEditor() {
  setAuthResolverForTest(() => ({
    email: "josiah@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    uid: "editor-1",
  }));
}

function req(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/tenant-notice-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(isActionExecutable).mockReset();
  vi.mocked(isActionExecutable).mockReturnValue(false);
  vi.mocked(GmailRuntimeClient).mockClear();
  createDraftMock.mockClear();
});

describe("tenant-notice-draft route (AC-S15-6)", () => {
  it("returns 401 when unauthenticated and never constructs the Gmail client", async () => {
    setAuthResolverForTest(() => null);
    const response = await POST(req({ leaseId: "lease-known" }));
    expect(response.status).toBe(401);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown lease", async () => {
    setEditor();
    const response = await POST(req({ leaseId: "nope" }));
    expect(response.status).toBe(404);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });

  it("returns 409 when the tenant offer is not ready yet (no owner decision)", async () => {
    setEditor();
    const response = await POST(req({ leaseId: "lease-no-offer" }));
    expect(response.status).toBe(409);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });

  it("gate closed → typed refusal carrying the channel:tenant, literal-false, banner-first draft", async () => {
    setEditor();
    vi.mocked(isActionExecutable).mockReturnValue(false);
    const response = await POST(req({ leaseId: "lease-known" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(false);
    expect(payload.status).toBe("needs_gmail_access");
    expect(payload.request.channel).toBe("tenant");
    expect(payload.request.production_allowed).toBe(false);
    expect(payload.request.send_allowed).toBe(false);
    expect(payload.request.body.startsWith("Draft — Review before sending")).toBe(true);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });

  it("gate open → creates the unsent draft via the Gmail client for the signed-in user", async () => {
    setEditor();
    vi.mocked(isActionExecutable).mockReturnValue(true);
    const response = await POST(req({ leaseId: "lease-known" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(true);
    expect(payload.status).toBe("draft_created");
    expect(payload.draftId).toBe("draft_t1");
    expect(GmailRuntimeClient).toHaveBeenCalledTimes(1);
    expect(GmailRuntimeClient).toHaveBeenCalledWith({ subject: "josiah@pmikcmetro.com" });
    expect(createDraftMock).toHaveBeenCalledWith({
      to: "tenant@example.com",
      subject: "Your lease renewal",
      body: "Draft — Review before sending\n\nHere is your renewal offer.",
    });
  });
});
