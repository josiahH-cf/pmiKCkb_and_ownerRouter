import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "@/app/api/admin/notice-rules/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  readNoticeRuleConfigRecord,
  updateNoticeRuleConfig,
} from "@/lib/firestore/lease-renewal-notice-rules";

// Keep the schema (UpdateNoticeRuleConfigInputSchema) real; mock only the repo so the route's auth +
// dispatch is the unit under test. The persistence itself is covered by the repo test.
vi.mock("@/lib/firestore/lease-renewal-notice-rules", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/lease-renewal-notice-rules")>();
  return {
    ...actual,
    readNoticeRuleConfigRecord: vi.fn(),
    updateNoticeRuleConfig: vi.fn(),
  };
});

const admin = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
const editor = { ...admin, uid: "editor-1", role: "Editor" as const };

const validBody = {
  rules: [
    {
      scope: "global",
      values: {
        noticeDeadlineDayOfMonth: 15,
        noticeDeadlineMonthOffset: -2,
        operatorWarningLeadDays: 10,
        followUpIntervalDays: 7,
        enabled: true,
      },
      verified: true,
    },
  ],
};

function patchReq(body: unknown) {
  return new Request("http://localhost/api/admin/notice-rules", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(readNoticeRuleConfigRecord).mockReset();
  vi.mocked(updateNoticeRuleConfig).mockReset();
});

afterEach(() => {
  setAuthResolverForTest(() => null);
});

describe("admin notice-rules route (F-TMPL-5)", () => {
  it("lets an Admin read and save the rules", async () => {
    setAuthResolverForTest(() => admin);
    const record = {
      id: "active",
      ...validBody,
      created_at: "c",
      updated_at: "u",
      seeded_by_uid: "s",
    };
    vi.mocked(readNoticeRuleConfigRecord).mockResolvedValue(record as never);
    vi.mocked(updateNoticeRuleConfig).mockResolvedValue(record as never);

    const getResponse = await GET();
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      noticeRules: { id: "active" },
    });

    const patchResponse = await PATCH(patchReq(validBody));
    expect(patchResponse.status).toBe(200);
    expect(updateNoticeRuleConfig).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      expect.objectContaining({ rules: expect.any(Array) }),
    );
  });

  it("blocks a non-Admin from reading or saving (403, repo never runs)", async () => {
    setAuthResolverForTest(() => editor);

    expect((await GET()).status).toBe(403);
    expect((await PATCH(patchReq(validBody))).status).toBe(403);
    expect(readNoticeRuleConfigRecord).not.toHaveBeenCalled();
    expect(updateNoticeRuleConfig).not.toHaveBeenCalled();
  });

  it("rejects a malformed rules body with a 400 before the repo runs", async () => {
    setAuthResolverForTest(() => admin);
    const response = await PATCH(patchReq({ rules: [] }));
    expect(response.status).toBe(400);
    expect(updateNoticeRuleConfig).not.toHaveBeenCalled();
  });
});
