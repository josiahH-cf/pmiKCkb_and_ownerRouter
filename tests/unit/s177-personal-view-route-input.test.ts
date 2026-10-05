import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  read: vi.fn<(actor: unknown, surface: string) => Promise<unknown>>(async () => ({
    surface: "renewals",
    revision: 0,
    value: { query: "", layout: { columns: {} } },
    updatedAt: null,
  })),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(async () => ({
    uid: "fixture-staff",
    email: "fixture.staff@pmikcmetro.com",
    role: "Editor",
  })),
}));
vi.mock("@/lib/firestore/personal-views", () => ({
  getPersonalView: state.read,
  savePersonalView: vi.fn(),
}));

import { GET } from "@/app/api/personal-view/route";

beforeEach(() => {
  state.read.mockClear();
});

describe("S177 personal view read refuses an unknown table as a bad request", () => {
  it("answers 400 without reading when the surface is unknown or missing", async () => {
    for (const url of [
      "http://localhost/api/personal-view?surface=nope",
      "http://localhost/api/personal-view",
    ]) {
      const response = await GET(new Request(url));
      expect(response.status, url).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(state.read).not.toHaveBeenCalled();
  });

  it("still reads a known table for the signed-in account", async () => {
    const response = await GET(
      new Request("http://localhost/api/personal-view?surface=renewals"),
    );
    expect(response.status).toBe(200);
    expect(state.read).toHaveBeenCalledTimes(1);
    expect(state.read.mock.calls[0][1]).toBe("renewals");
  });
});
