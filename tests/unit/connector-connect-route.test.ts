import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/connections/[connectorId]/connect/route";
import { setAuthResolverForTest } from "@/lib/auth/session";

afterEach(() => {
  setAuthResolverForTest(null);
});

describe("POST /api/connections/[connectorId]/connect", () => {
  it("refuses the status-only RentCast card before any connection flow", async () => {
    setAuthResolverForTest(() => ({
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
      uid: "admin-1",
    }));

    const response = await POST(
      new Request("http://localhost/api/connections/rentcast/connect", {
        method: "POST",
      }),
      { params: Promise.resolve({ connectorId: "rentcast" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "This connector is read and verified here, but its server setup is not managed by this API.",
    });
  });
});
