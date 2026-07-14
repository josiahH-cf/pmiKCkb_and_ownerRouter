import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the lease lookup + composer so the route test is deterministic and never needs real sample data,
// and mock the gate + Gmail client so we can exercise both the gate-closed and gate-open branches without
// a real Gmail call.
vi.mock("@/lib/lease-renewal/sample-desk", () => ({
  getRenewalLeaseWorkspace: vi.fn((id: string) =>
    id === "lease-known" ? { ownerDraft: { subject: "s", body: "b" } } : null,
  ),
}));
vi.mock("@/lib/lease-renewal/notice-send-policy", () => ({
  buildOwnerNoticeDraftRequest: vi.fn(() => ({
    kind: "gmail_renewal_notice_draft",
    channel: "owner",
    to: "owner@example.com",
    subject: "Renewal notice",
    body: "Draft — Review before sending\n\nHello",
    missingInputs: [],
    production_allowed: false,
    send_allowed: false,
  })),
}));
vi.mock("@/lib/integrations/action-gate", () => ({
  isActionExecutable: vi.fn(() => false),
}));
const { createDraftMock } = vi.hoisted(() => ({
  createDraftMock: vi.fn(async () => ({ draftId: "draft_1" })),
}));
vi.mock("@/lib/gmail-runtime/client", () => ({
  // A real (non-arrow) function so it can be used with `new` in the route.
  GmailRuntimeClient: vi.fn(function (this: { createDraft: unknown }) {
    this.createDraft = createDraftMock;
  }),
  // Kept as a real class so the route's `instanceof` error mapping resolves.
  GmailRuntimeError: class GmailRuntimeError extends Error {},
}));

import { POST } from "@/app/api/lease-renewal/owner-notice-draft/route";
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
  return new Request("http://localhost/api/lease-renewal/owner-notice-draft", {
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

describe("owner-notice-draft route", () => {
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

  it("returns a sample-data preview and never constructs Gmail", async () => {
    setEditor();
    vi.mocked(isActionExecutable).mockReturnValue(false);
    const response = await POST(req({ leaseId: "lease-known" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(false);
    expect(payload.status).toBe("preview_only");
    expect(payload.execution_allowed).toBe(false);
    expect(payload.request.to).toBe("owner@example.com");
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });

  it("cannot be activated by opening the historical Action Registry gate", async () => {
    setEditor();
    vi.mocked(isActionExecutable).mockReturnValue(true);
    const response = await POST(req({ leaseId: "lease-known" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(false);
    expect(payload.status).toBe("preview_only");
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("rejects a browser-supplied owner recipient", async () => {
    setEditor();
    const response = await POST(
      req({ leaseId: "lease-known", ownerEmail: "owner@example.com" }),
    );
    expect(response.status).toBe(400);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });
});
