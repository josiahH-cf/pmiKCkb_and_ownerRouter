import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/lease-renewal/notice-timing-basis/route";
import { setAuthResolverForTest } from "@/lib/auth/session";
import {
  assertTimingBasisStaff,
  readMoveOutTimingBasisSelection,
  selectMoveOutTimingBasis,
} from "@/lib/firestore/lease-renewal-move-out-timing-basis";

vi.mock("@/lib/firestore/lease-renewal-move-out-timing-basis", async (original) => ({
  ...(await original<
    typeof import("@/lib/firestore/lease-renewal-move-out-timing-basis")
  >()),
  readMoveOutTimingBasisSelection: vi.fn(),
  selectMoveOutTimingBasis: vi.fn(),
}));
// No read-only managed role exists today (ROLES is Editor, Approver, Admin), and session
// validation admits only those three. This stub adds one so the staff gate the GET route calls is
// proven to follow the capability table rather than its own role list.
vi.mock("@/lib/constants", async (original) => {
  const actual = await original<typeof import("@/lib/constants")>();
  return { ...actual, ROLES: [...actual.ROLES, "Viewer"] };
});
vi.mock("@/lib/auth/roles", async (original) => {
  const actual = await original<typeof import("@/lib/auth/roles")>();
  return {
    ...actual,
    can: (role: string, capability: string) =>
      role === "Viewer"
        ? capability === "read"
        : actual.can(role as never, capability as never),
  };
});
const editor = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const input = {
  decisionId: "notice-basis/2026-10-02/q2",
  expectedVersion: 0,
  operationId: "00000000-0000-4000-8000-000000000001",
};
const url = "http://localhost/api/lease-renewal/notice-timing-basis";
const request = (body: unknown) =>
  new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.mocked(readMoveOutTimingBasisSelection).mockReset();
  vi.mocked(selectMoveOutTimingBasis).mockReset();
});
afterEach(() => setAuthResolverForTest(() => null));

describe("S125 canonical staff route (ARCH-S125-3/4)", () => {
  it.each(["Editor", "Approver", "Admin"] as const)(
    "allows %s one documented choice, using only server actor and no extra approval note",
    async (role) => {
      setAuthResolverForTest(() => ({ ...editor, role }));
      vi.mocked(selectMoveOutTimingBasis).mockResolvedValue({
        record: { version: 1 } as never,
        duplicate: false,
      });
      const response = await PATCH(request(input));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(selectMoveOutTimingBasis).toHaveBeenCalledWith({ ...editor, role }, input);
    },
  );
  it("authenticates before decoding and refuses wrong domain/Space and verification writes before the store", async () => {
    setAuthResolverForTest(() => null);
    expect(
      (await PATCH(new Request(url, { method: "PATCH", body: "bad json" }))).status,
    ).toBe(401);
    for (const actor of [
      { ...editor, uid: "" },
      { ...editor, hd: "example.com" },
      { ...editor, email: "person@example.com" },
      { ...editor, email: "canary-editor@pmikcmetro.com" },
    ]) {
      setAuthResolverForTest(() => actor);
      expect((await PATCH(request(input))).status).toBe(403);
    }
    expect(selectMoveOutTimingBasis).not.toHaveBeenCalled();
  });
  it("rejects arbitrary policy/actor/provenance and malformed intent instead of widening policy editing", async () => {
    setAuthResolverForTest(() => editor);
    for (const body of [
      { ...input, decisionId: "other" },
      { ...input, thresholdDays: 31 },
      { ...input, actor: "admin" },
      { ...input, reviewedNote: "New approval" },
      { ...input, expectedVersion: -1 },
      { ...input, operationId: "not-uuid" },
    ]) {
      expect((await PATCH(request(body))).status).toBe(400);
    }
    expect(selectMoveOutTimingBasis).not.toHaveBeenCalled();
  });
  it("admits any managed role with read_workspace to the read gate and keeps selecting on edit", () => {
    const viewer = { ...editor, uid: "staff-viewer", role: "Viewer" as never };
    expect(() => assertTimingBasisStaff(viewer, false)).not.toThrow();
    expect(() => assertTimingBasisStaff(viewer, true)).toThrow(
      /Editor access is required/,
    );
    expect(() =>
      assertTimingBasisStaff({ ...editor, role: "Stranger" as never }, false),
    ).toThrow(/Managed renewal staff access is required/);
  });
  it("reads the exact owned receipt with no-store and keeps verification reads available", async () => {
    setAuthResolverForTest(() => ({ ...editor, email: "canary-editor@pmikcmetro.com" }));
    vi.mocked(readMoveOutTimingBasisSelection).mockResolvedValue({
      timingBasis: { state: "missing", record: null },
      intent: { state: "missing" },
      canSelect: false,
    });
    const response = await GET(new Request(`${url}?operationId=${input.operationId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readMoveOutTimingBasisSelection).toHaveBeenCalledWith(
      expect.objectContaining({ email: "canary-editor@pmikcmetro.com" }),
      input.operationId,
    );
    expect(selectMoveOutTimingBasis).not.toHaveBeenCalled();
  });
});
