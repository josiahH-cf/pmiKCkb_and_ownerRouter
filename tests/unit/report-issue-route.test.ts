import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/report-issue/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import { createSupportReport } from "@/lib/firestore/support-reports";

// Mock the store so the route never touches the Admin SDK; the route's delivered contract is the SUT.
vi.mock("@/lib/firestore/support-reports", () => ({
  createSupportReport: vi.fn(),
}));

const editor = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  uid: "editor-uid",
};

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/report-issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(createSupportReport).mockReset();
  setAuthResolverForTest(() => editor);
});

afterEach(() => {
  setAuthResolverForTest(() => null);
});

describe("report-issue route (F-SUPP-1)", () => {
  it("persists the report to the support queue and returns delivered:true", async () => {
    vi.mocked(createSupportReport).mockResolvedValue({
      id: "report-1",
      route: "/lease-renewal",
      reporter_uid: "editor-uid",
      reporter_role: "Editor",
      origin: "app",
      status: "new",
      created_at: "2026-07-20T00:00:00.000Z",
    });

    const response = await POST(
      jsonReq({
        description: "Save does nothing",
        context: { route: "/lease-renewal?leaseId=secret", viewport: "1280x800" },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      delivered: true,
    });
    // The route is sanitized (query string dropped) before it is stored.
    expect(createSupportReport).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-uid" }),
      expect.objectContaining({
        route: "/lease-renewal",
        description: "Save does nothing",
        origin: "app",
      }),
    );
  });

  it("returns delivered:false as a soft failure when the queue write fails (still 202)", async () => {
    vi.mocked(createSupportReport).mockRejectedValue(new Error("firestore unavailable"));

    const response = await POST(jsonReq({ context: { route: "/" } }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      received: true,
      delivered: false,
    });
  });

  it("forwards an error-boundary origin and digest to the queue", async () => {
    vi.mocked(createSupportReport).mockResolvedValue({
      id: "report-2",
      route: "/",
      reporter_uid: "editor-uid",
      reporter_role: "Editor",
      origin: "error_boundary",
      status: "new",
      created_at: "2026-07-20T00:00:00.000Z",
    });

    await POST(
      jsonReq({
        origin: "error_boundary",
        errorDigest: "digest-xyz",
        context: { route: "/spaces" },
      }),
    );

    expect(createSupportReport).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-uid" }),
      expect.objectContaining({ origin: "error_boundary", errorDigest: "digest-xyz" }),
    );
  });

  it("rejects an unauthenticated caller and never writes", async () => {
    setAuthResolverForTest(() => null);

    const response = await POST(jsonReq({ context: { route: "/" } }));

    expect(response.status).toBe(401);
    expect(createSupportReport).not.toHaveBeenCalled();
  });
});
