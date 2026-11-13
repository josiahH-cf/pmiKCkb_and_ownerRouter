import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  authorize: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: mocks.authorize,
}));
vi.mock("@/lib/attention/renewal-team-line-read", () => ({
  loadRenewalTeamLine: mocks.load,
}));

import { GET } from "@/app/api/dashboard/renewal-team/route";
import { AuthError } from "@/lib/auth/session";

afterEach(() => vi.resetAllMocks());

describe("GET /api/dashboard/renewal-team", () => {
  it("requires Renewals read access before returning the bodyless team count", async () => {
    const actor = { uid: "synthetic-editor", role: "Editor" };
    const count = { count: 12, month: "2026-12", href: "/lease-renewal/live/desk" };
    mocks.authorize.mockResolvedValue(actor);
    mocks.load.mockResolvedValue(count);

    const response = await GET();

    expect(mocks.authorize).toHaveBeenCalledWith("read", "renewals");
    expect(mocks.load).toHaveBeenCalledWith(actor);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(count);
  });

  it.each([401, 403] as const)(
    "preserves the %s refusal without reading data",
    async (status) => {
      mocks.authorize.mockRejectedValue(
        new AuthError("Renewals read unavailable.", status),
      );

      expect((await GET()).status).toBe(status);
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );
});
