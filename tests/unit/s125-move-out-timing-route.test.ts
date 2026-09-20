import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "@/app/api/admin/move-out-timing-basis/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  readMoveOutTimingBasisRecord,
  updateMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";

// S125 (F04): the route's auth and dispatch are the unit under test; the schema stays real and the
// repository is mocked (its persistence is covered by the config test).
vi.mock("@/lib/firestore/lease-renewal-move-out-timing-basis", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/firestore/lease-renewal-move-out-timing-basis")
    >();
  return {
    ...actual,
    readMoveOutTimingBasisRecord: vi.fn(),
    updateMoveOutTimingBasis: vi.fn(),
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
  targetKind: "expected_move_out",
  countingRule: "calendar_days_target_minus_notice_v1",
  thresholdDays: 30,
  reviewedNote: "Confirmed by the owner in the September review.",
  expectedVersion: 0,
};

const record = {
  id: "active",
  target_kind: "expected_move_out",
  counting_rule: "calendar_days_target_minus_notice_v1",
  threshold_days: 30,
  reviewed_note: validBody.reviewedNote,
  version: 1,
  created_at: "c",
  updated_at: "u",
  updated_by_uid: "admin-1",
};

function patchReq(body: unknown) {
  return new Request("http://localhost/api/admin/move-out-timing-basis", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(readMoveOutTimingBasisRecord).mockReset();
  vi.mocked(updateMoveOutTimingBasis).mockReset();
});

afterEach(() => {
  setAuthResolverForTest(() => null);
});

describe("admin move-out-timing-basis route (S125)", () => {
  it("lets an Admin read the saved basis or its absence and record a reviewed basis", async () => {
    setAuthResolverForTest(() => admin);
    vi.mocked(readMoveOutTimingBasisRecord).mockResolvedValue({
      state: "missing",
      record: null,
    });
    vi.mocked(updateMoveOutTimingBasis).mockResolvedValue(record as never);

    const getResponse = await GET();
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({
      timingBasis: { state: "missing", record: null },
    });

    const patchResponse = await PATCH(patchReq(validBody));
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      timingBasis: { state: "saved", record: { version: 1 } },
    });
    expect(updateMoveOutTimingBasis).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin-1" }),
      expect.objectContaining({ targetKind: "expected_move_out", expectedVersion: 0 }),
    );
  });

  it("blocks a non-Admin from reading or recording (403, repository never runs)", async () => {
    setAuthResolverForTest(() => editor);
    expect((await GET()).status).toBe(403);
    expect((await PATCH(patchReq(validBody))).status).toBe(403);
    expect(readMoveOutTimingBasisRecord).not.toHaveBeenCalled();
    expect(updateMoveOutTimingBasis).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with a 400 before the repository runs", async () => {
    setAuthResolverForTest(() => admin);
    expect((await PATCH(patchReq({ ...validBody, targetKind: "whenever" }))).status).toBe(
      400,
    );
    expect((await PATCH(patchReq({ ...validBody, thresholdDays: 0 }))).status).toBe(400);
    expect((await PATCH(patchReq({ ...validBody, reviewedNote: "" }))).status).toBe(400);
    expect(updateMoveOutTimingBasis).not.toHaveBeenCalled();
  });
});
