import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/access/request-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/access/request-service")>();
  return {
    ...actual,
    previewAccessRequest: vi.fn(),
    submitAccessRequest: vi.fn(),
    listAdminAccessRequests: vi.fn(),
    getAdminAccessRequestDetail: vi.fn(),
  };
});

vi.mock("@/lib/access/apply-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/access/apply-service")>();
  return {
    ...actual,
    resolveAccessRequestAfterCorrection: vi.fn(),
  };
});

import { POST as adminReviewPost } from "@/app/api/admin/access/review/route";
import { GET as adminDetailGet } from "@/app/api/admin/access/review/[requestId]/route";
import { POST as resolvePost } from "@/app/api/admin/access/review/[requestId]/resolve/route";
import { POST as previewPost } from "@/app/api/admin/access/requests/preview/route";
import { POST as submitPost } from "@/app/api/admin/access/requests/route";
import { GET as historyGet } from "@/app/api/admin/access/requests/route";
import {
  previewAccessRequest,
  submitAccessRequest,
  listAdminAccessRequests,
  getAdminAccessRequestDetail,
} from "@/lib/access/request-service";
import { resolveAccessRequestAfterCorrection } from "@/lib/access/apply-service";
import { setAuthResolverForTest } from "@/lib/auth/session";

const actor = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
  scopes: ["renewals" as const],
};
const admin = {
  ...actor,
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  role: "Admin" as const,
};

afterEach(() => {
  setAuthResolverForTest(null);
  vi.mocked(previewAccessRequest).mockReset();
  vi.mocked(submitAccessRequest).mockReset();
  vi.mocked(listAdminAccessRequests).mockReset();
  vi.mocked(getAdminAccessRequestDetail).mockReset();
  vi.mocked(resolveAccessRequestAfterCorrection).mockReset();
});

describe("S83 requester API transport", () => {
  it("authenticates before invoking either service", async () => {
    setAuthResolverForTest(() => null);
    const response = await previewPost(jsonRequest("/preview", previewBody()));
    expect(response.status).toBe(401);
    expect(previewAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects a wrong media type and over-cap Preview body", async () => {
    setAuthResolverForTest(() => actor);
    const wrongType = await previewPost(
      new Request("http://localhost/api/admin/access/requests/preview", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(previewBody()),
      }),
    );
    expect(wrongType.status).toBe(415);

    const overCap = await previewPost(
      new Request("http://localhost/api/admin/access/requests/preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(16 * 1024 + 1),
        },
        body: "{}",
      }),
    );
    expect(overCap.status).toBe(413);
    expect(previewAccessRequest).not.toHaveBeenCalled();
  });

  it("rejects unknown Preview keys with no service call", async () => {
    setAuthResolverForTest(() => actor);
    const response = await previewPost(
      jsonRequest("/preview", { ...previewBody(), requester_uid: "someone-else" }),
    );
    expect(response.status).toBe(400);
    expect(previewAccessRequest).not.toHaveBeenCalled();
  });

  it("returns the strict ready Preview variant at HTTP 200", async () => {
    setAuthResolverForTest(() => actor);
    vi.mocked(previewAccessRequest).mockResolvedValue({
      schema_version: "access-request-preview-response-v1",
      status: "ready",
      attempt_id: "11111111-1111-4111-8111-111111111111",
      expires_at: "2026-09-01T12:15:00.000Z",
      preview_hash: "a".repeat(64),
      preview: {} as never,
    });
    const response = await previewPost(jsonRequest("/preview", previewBody()));
    expect(response.status).toBe(200);
    expect(previewAccessRequest).toHaveBeenCalledWith(actor, previewBody());
  });

  it("maps each Submit union to its exact HTTP status", async () => {
    setAuthResolverForTest(() => actor);
    const command = {
      schema_version: "access-request-submit-command-v1",
      attempt_id: "11111111-1111-4111-8111-111111111111",
      preview_hash: "a".repeat(64),
    };
    vi.mocked(submitAccessRequest).mockResolvedValue({
      schema_version: "access-request-submit-response-v1",
      status: "created",
      message: "Access request submitted.",
      request: {} as never,
    });
    expect((await submitPost(jsonRequest("", command))).status).toBe(201);

    vi.mocked(submitAccessRequest).mockResolvedValue({
      schema_version: "access-request-submit-response-v1",
      status: "stale_preview",
      message: "Access changed before submission. Review the latest preview.",
      commit_state: "not_committed",
    });
    expect((await submitPost(jsonRequest("", command))).status).toBe(409);

    vi.mocked(submitAccessRequest).mockResolvedValue({
      schema_version: "access-request-submit-response-v1",
      status: "unavailable",
      message: "Request status could not be verified. Check request status.",
      commit_state: "unknown",
    });
    expect((await submitPost(jsonRequest("", command))).status).toBe(503);
  });

  it("maps an unexpected request-service outage to a bounded non-leaking 503", async () => {
    setAuthResolverForTest(() => actor);
    vi.mocked(previewAccessRequest).mockRejectedValue(
      new Error("firestore project and collection detail"),
    );

    const response = await previewPost(jsonRequest("/preview", previewBody()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Access requests are temporarily unavailable.",
    });
  });

  it("rejects malformed or repeated own-history cursors before a service read", async () => {
    setAuthResolverForTest(() => actor);
    const malformed = await historyGet(
      new Request(
        "http://localhost/api/admin/access/requests?cursor=staff-name&limit=50",
      ),
    );
    expect(malformed.status).toBe(400);
    const repeated = await historyGet(
      new Request(
        `http://localhost/api/admin/access/requests?cursor=${"a".repeat(43)}&cursor=${"b".repeat(43)}`,
      ),
    );
    expect(repeated.status).toBe(400);
  });

  it("keeps requester filters in a strict bounded Admin POST body", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(listAdminAccessRequests).mockResolvedValue({
      items: [],
      next_cursor: null,
      pending_count: 0,
    });
    const filters = {
      requester_query: "Requesting Editor",
      intent_kind: "capability" as const,
      catalog_key: "approve",
      space_id: "renewals",
      state: "pending" as const,
      minimum_waiting_minutes: 60,
      limit: 50,
    };
    const response = await adminReviewPost(
      new Request("http://localhost/api/admin/access/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: "access-request-admin-list-command-v1",
          filters,
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(listAdminAccessRequests).toHaveBeenCalledWith(admin, filters);

    const rejected = await adminReviewPost(
      new Request("http://localhost/api/admin/access/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: "access-request-admin-list-command-v1",
          filters: {
            requester_query: "Requesting Editor",
            requester_uid: "hidden-in-url",
          },
        }),
      }),
    );
    expect(rejected.status).toBe(400);
  });

  it("rejects repeated or out-of-range Admin GET filters before a service read", async () => {
    setAuthResolverForTest(() => admin);
    const { GET } = await import("@/app/api/admin/access/review/route");
    const repeated = await GET(
      new Request("http://localhost/api/admin/access/review?state=pending&state=denied"),
    );
    const excessiveWait = await GET(
      new Request(
        "http://localhost/api/admin/access/review?minimum_waiting_minutes=525601",
      ),
    );

    expect(repeated.status).toBe(400);
    expect(excessiveWait.status).toBe(400);
    expect(listAdminAccessRequests).not.toHaveBeenCalled();
  });

  it("loads one opaque Admin request detail through its independently authorized service", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(getAdminAccessRequestDetail).mockResolvedValue({
      request: { id: "request_0001" } as never,
      activity: [],
      requester_directory: { state: "unavailable" },
    });
    const response = await adminDetailGet(
      new Request("http://localhost/api/admin/access/review/request_0001"),
      { params: Promise.resolve({ requestId: "request_0001" }) },
    );
    expect(response.status).toBe(200);
    expect(getAdminAccessRequestDetail).toHaveBeenCalledWith(admin, "request_0001");
  });

  it("keeps reviewed correction closure in a strict bounded Admin command", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(resolveAccessRequestAfterCorrection).mockResolvedValue({
      status: "superseded",
      message: "The approved target is no longer the reviewed outcome.",
      request: {} as never,
    });
    const command = {
      schema_version: "access-request-resolution-command-v1" as const,
      reason: "A separately reviewed access plan replaced this request.",
    };
    const response = await resolvePost(
      new Request("http://localhost/api/admin/access/review/request_0001/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
      { params: Promise.resolve({ requestId: "request_0001" }) },
    );
    expect(response.status).toBe(200);
    expect(resolveAccessRequestAfterCorrection).toHaveBeenCalledWith(
      admin,
      "request_0001",
      command,
    );

    const rejected = await resolvePost(
      new Request("http://localhost/api/admin/access/review/request_0001/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...command, target_role: "Admin" }),
      }),
      { params: Promise.resolve({ requestId: "request_0001" }) },
    );
    expect(rejected.status).toBe(400);
    expect(resolveAccessRequestAfterCorrection).toHaveBeenCalledTimes(1);
  });
});

function previewBody() {
  return {
    schema_version: "access-request-preview-command-v1" as const,
    intent: {
      schema_version: "access-intent-v1" as const,
      intent_kind: "capability" as const,
      catalog_version: "catalog-v1" as const,
      catalog_key: "approve",
      scope: { kind: "global" as const, space_ids: [] },
    },
    reason: "Approve eligible work assigned to my staff role.",
  };
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost/api/admin/access/requests${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
