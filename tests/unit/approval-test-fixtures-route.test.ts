import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/users", () => ({
  listAppUsers: vi.fn(),
}));
vi.mock("@/lib/firestore/approval-test-fixtures", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/firestore/approval-test-fixtures")>();
  return {
    ...actual,
    inspectApprovalTestFixtures: vi.fn(),
    restoreApprovalTestFixtures: vi.fn(),
  };
});

import { GET, POST } from "@/app/api/approval-queue/test-fixtures/route";
import { listAppUsers } from "@/lib/admin/users";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  APPROVAL_TEST_FIXTURE_CONFIRMATION,
  inspectApprovalTestFixtures,
  restoreApprovalTestFixtures,
} from "@/lib/firestore/approval-test-fixtures";

function request(body: unknown) {
  return new Request("http://localhost/api/approval-queue/test-fixtures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(listAppUsers).mockResolvedValue([
    {
      uid: "editor-1",
      email: "editor@pmikcmetro.com",
      role: "Editor",
      scopes: ["renewals"],
      disabled: false,
      lastSignInAt: null,
    },
  ]);
  vi.mocked(inspectApprovalTestFixtures).mockResolvedValue({
    fixture_count: 7,
    item_ids: ["fixture-1"],
    ready_count: 7,
    state: "ready",
  });
  vi.mocked(restoreApprovalTestFixtures).mockResolvedValue({
    fixture_count: 7,
    item_ids: ["fixture-1"],
    ready_count: 7,
    restored_count: 7,
    state: "ready",
  });
  setAuthResolverForTest(() => ({
    email: "admin@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Admin",
    uid: "admin-1",
  }));
});

afterEach(() => {
  setAuthResolverForTest(null);
  vi.clearAllMocks();
});

describe("Approval Queue Test fixture route", () => {
  it("reads and restores with exact confirmation and a real restricted staff UID", async () => {
    expect((await GET()).status).toBe(200);
    expect(inspectApprovalTestFixtures).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "editor-1",
    );

    const response = await POST(
      request({
        action: "restore",
        confirmation: APPROVAL_TEST_FIXTURE_CONFIRMATION,
      }),
    );
    expect(response.status).toBe(200);
    expect(restoreApprovalTestFixtures).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      "editor-1",
    );
  });

  it("rejects a stale confirmation, non-Admin, or absent restricted staff identity", async () => {
    expect(
      (await POST(request({ action: "restore", confirmation: "wrong" }))).status,
    ).toBe(400);

    setAuthResolverForTest(() => ({
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      uid: "editor-1",
    }));
    expect((await GET()).status).toBe(403);

    setAuthResolverForTest(() => ({
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      uid: "admin-1",
    }));
    vi.mocked(listAppUsers).mockResolvedValue([]);
    expect((await GET()).status).toBe(409);
  });
});
