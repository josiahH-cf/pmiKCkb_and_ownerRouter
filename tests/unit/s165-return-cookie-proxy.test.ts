// S165 return navigation: the request proxy remembers the page a signed-out person was opening so
// sign-in can return them to it. The page guard's redirect target stays exactly "/sign-in"
// (tests/e2e/auth-guards.e2e.test.mjs and tests/unit/page-guards.test.ts), so the destination is
// carried in a short-lived path-only cookie instead of the URL.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  authenticateSessionCookie: vi.fn(async () => ({
    uid: "editor-1",
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  })),
  getSessionCookieName: () => "pmi-session",
  readLocalDemoSessionRole: () => null,
}));
vi.mock("@/lib/environment/descriptor", () => ({
  resolveEnvironmentDescriptor: () => ({
    ok: true,
    descriptor: { environmentKind: "production", dataContext: "live" },
  }),
}));

import { proxy } from "../../proxy";
import { RETURN_TO_COOKIE } from "@/lib/auth/return-to";

const PAGE_HEADERS = { accept: "text/html,application/xhtml+xml" };

function open(
  path: string,
  headers: Record<string, string> = PAGE_HEADERS,
  method = "GET",
) {
  return proxy(new NextRequest(`https://app.invalid${path}`, { method, headers }));
}

describe("S165 return navigation cookie (BEH-S165-1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("remembers the page a signed-out person opens, as a short-lived path-only cookie", async () => {
    const response = await open("/lease-renewal/live/desk/lease/1001?deskView=abc");

    expect(response.headers.get("x-middleware-next")).toBe("1");
    const cookie = response.cookies.get(RETURN_TO_COOKIE);
    expect(cookie?.value).toBe("/lease-renewal/live/desk/lease/1001?deskView=abc");
    expect(cookie?.maxAge).toBe(600);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("lax");
  });

  it.each([
    ["an API request", "/api/work", { accept: "application/json" }, "GET"],
    ["a framework data request", "/work", { ...PAGE_HEADERS, rsc: "1" }, "GET"],
    ["the sign-in page", "/sign-in", PAGE_HEADERS, "GET"],
    ["the Vendor boundary", "/vendor/tickets/7", PAGE_HEADERS, "GET"],
    ["the sign-in helper", "/__/auth/handler?apiKey=k", PAGE_HEADERS, "GET"],
    ["the Dashboard default", "/", PAGE_HEADERS, "GET"],
    ["a page POST", "/work", PAGE_HEADERS, "POST"],
  ])("sets nothing for %s", async (_label, path, headers, method) => {
    const response = await open(path, headers, method);

    expect(response.cookies.get(RETURN_TO_COOKIE)).toBeUndefined();
  });

  it("BEH-S165-2: sets nothing when the request already carries a session", async () => {
    const response = await open("/work", {
      ...PAGE_HEADERS,
      cookie: "pmi-session=isolated-fixture-cookie",
    });

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.get(RETURN_TO_COOKIE)).toBeUndefined();
  });
});
