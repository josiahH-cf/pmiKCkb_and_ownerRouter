import { describe, expect, it } from "vitest";

import { classifyDeniedRouteOutcome } from "@/lib/production-assurance/route-outcome";

// S51: the Editor denial canary. Before this classifier the canary demanded that the browser REST
// on `/sign-in?error=forbidden`, which no signed-in person ever does: the sign-in page forwards a
// live session to `/`. That check could never pass for a real Editor and read as an owner blocker.

const ORIGIN = "https://cand-example---pmi-kc-app-kq6wuvpiva-uc.a.run.app";

describe("classifyDeniedRouteOutcome", () => {
  it("passes when the chain carries the exact forbidden sign-in hop and lands on the Dashboard", () => {
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: [`${ORIGIN}/admin`, `${ORIGIN}/sign-in?error=forbidden`, `${ORIGIN}/`],
      }),
    ).toEqual({ passed: true });
  });

  it("still passes when the browser rests on the forbidden sign-in page itself", () => {
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin/users",
        hopUrls: [`${ORIGIN}/admin/users`, `${ORIGIN}/sign-in?error=forbidden`],
      }),
    ).toEqual({ passed: true });
  });

  it("fails when the denied document rendered, even after an earlier forbidden hop", () => {
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: [`${ORIGIN}/admin`],
      }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: [`${ORIGIN}/sign-in?error=forbidden`, `${ORIGIN}/admin/users`],
      }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
  });

  it("fails when no hop is the exact forbidden sign-in redirect", () => {
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: [`${ORIGIN}/admin`, `${ORIGIN}/sign-in`, `${ORIGIN}/`],
      }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: [`${ORIGIN}/admin`, `${ORIGIN}/`],
      }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
  });

  it("fails closed on an empty chain, a cross-origin hop, or a malformed URL", () => {
    expect(
      classifyDeniedRouteOutcome({ origin: ORIGIN, deniedPath: "/admin", hopUrls: [] }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: [
          `${ORIGIN}/admin`,
          "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/sign-in?error=forbidden",
          `${ORIGIN}/`,
        ],
      }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
    expect(
      classifyDeniedRouteOutcome({
        origin: ORIGIN,
        deniedPath: "/admin",
        hopUrls: ["not a url"],
      }),
    ).toEqual({ passed: false, diagnostic: "auth_mismatch" });
  });
});
