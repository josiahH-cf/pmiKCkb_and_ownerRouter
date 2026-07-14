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

  it("returns a preview carrying channel:tenant and literal-false gates", async () => {
    setEditor();
    vi.mocked(isActionExecutable).mockReturnValue(false);
    const response = await POST(req({ leaseId: "lease-known" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.enabled).toBe(false);
    expect(payload.status).toBe("preview_only");
    expect(payload.execution_allowed).toBe(false);
    expect(payload.request.channel).toBe("tenant");
    expect(payload.request.production_allowed).toBe(false);
    expect(payload.request.send_allowed).toBe(false);
    expect(payload.request.body.startsWith("Draft — Review before sending")).toBe(true);
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

  it("rejects a browser-supplied tenant recipient", async () => {
    setEditor();
    const response = await POST(
      req({ leaseId: "lease-known", tenantEmail: "tenant@example.com" }),
    );
    expect(response.status).toBe(400);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });
});
