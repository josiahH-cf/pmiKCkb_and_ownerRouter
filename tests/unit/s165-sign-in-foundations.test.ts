// S165: the pure rules behind the mobile sign-in repair. Browser classification, the copy shown
// when Google sign-in cannot finish, the return-after-sign-in path rule, the choice of sign-in
// helper host, and the same-origin helper relay's fixed upstream mapping.

import { describe, expect, it } from "vitest";

import { resolveAuthHelperUpstream } from "@/lib/auth/auth-helper-proxy";
import { returnPathForSignedOutRequest, safeReturnPath } from "@/lib/auth/return-to";
import {
  SIGN_IN_COPY,
  detectSignInBrowser,
  popupUnavailableMessage,
  signInFailureMessage,
} from "@/lib/auth/sign-in-browser";
import { resolveFirebaseAuthDomain } from "@/lib/firebase/client";
import nextConfig from "../../next.config";

const UA = {
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  // The family recorded for the reported failure: the Google app's own browser on an iPhone.
  iosGoogleApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/440.0.0 Mobile/15E148 Safari/604.1",
  iosWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
};

describe("S165 sign-in browser classification (BEH-S165-1, AC-S165-1)", () => {
  it.each([
    ["desktop Chrome", UA.desktopChrome, 0, "desktop", "other"],
    ["desktop Safari", UA.desktopSafari, 0, "desktop", "other"],
    ["iOS Safari", UA.iosSafari, 5, "mobile", "ios"],
    ["iOS Chrome", UA.iosChrome, 5, "mobile", "ios"],
    ["Android Chrome", UA.androidChrome, 5, "mobile", "android"],
    ["an iPad reporting a desktop user agent", UA.desktopSafari, 5, "mobile", "ios"],
    ["the Google app browser on iOS", UA.iosGoogleApp, 5, "in_app", "ios"],
    ["an iOS app web view", UA.iosWebView, 5, "in_app", "ios"],
    ["an Android app web view", UA.androidWebView, 5, "in_app", "android"],
    ["an unknown browser", "", 0, "desktop", "other"],
  ])("classifies %s", (_label, userAgent, touchPoints, kind, platform) => {
    expect(detectSignInBrowser(userAgent, touchPoints)).toEqual({ kind, platform });
  });
});

describe("S165 sign-in failure copy (BEH-S165-9)", () => {
  const browsers = [
    detectSignInBrowser(UA.desktopChrome),
    detectSignInBrowser(UA.iosSafari, 5),
    detectSignInBrowser(UA.androidChrome, 5),
    detectSignInBrowser(UA.iosGoogleApp, 5),
  ];
  const codes = [
    "auth/popup-blocked",
    "auth/operation-not-supported-in-this-environment",
    "auth/popup-closed-by-user",
    "auth/cancelled-popup-request",
    "auth/network-request-failed",
    "auth/web-storage-unsupported",
    "auth/unauthorized-domain",
    "auth/too-many-requests",
    "auth/user-disabled",
    "auth/user-token-expired",
    "auth/internal-error",
    "",
    "anything-else",
  ];

  it("every message is plain: no provider code, no em dash, and it says what to do next", () => {
    const messages = [
      ...Object.values(SIGN_IN_COPY),
      ...browsers.map(popupUnavailableMessage),
      ...browsers.flatMap((browser) =>
        codes.map((code) => signInFailureMessage(code, browser)),
      ),
    ];

    for (const message of messages) {
      expect(message).not.toMatch(/auth\/|Firebase|sessionStorage|—|–/);
      expect(message.trim().length).toBeGreaterThan(20);
      expect(message.endsWith(".")).toBe(true);
    }
  });

  it("names the phone's own browser when the Google window cannot open inside an app", () => {
    expect(popupUnavailableMessage(detectSignInBrowser(UA.iosGoogleApp, 5))).toBe(
      "Google sign-in cannot open inside this app. Open this page in Safari, then sign in there.",
    );
    expect(popupUnavailableMessage(detectSignInBrowser(UA.androidWebView, 5))).toBe(
      "Google sign-in cannot open inside this app. Open this page in Chrome, then sign in there.",
    );
  });
});

describe("S165 return path rule (BEH-S165-1, BEH-S165-2)", () => {
  it.each([
    "/work",
    "/lease-renewal/live/desk/lease/1001?deskView=abc",
    "/spaces/renewals/pages/checklist",
    "/admin/users",
  ])("keeps a path inside the staff app: %s", (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    42,
    "",
    "/",
    "work",
    "https://elsewhere.example/steal",
    "//elsewhere.example/steal",
    "/\\elsewhere.example",
    "/work\nSet-Cookie: x=y",
    "/work page",
    "/a/../admin",
    "/work//double",
    "/sign-in",
    "/sign-in?error=forbidden",
    "/vendor",
    "/vendor/tickets/1",
    "/api/auth/session",
    "/_next/static/chunk.js",
    "/__/auth/handler",
    `/${"a".repeat(2000)}`,
  ])("drops anything else: %s", (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  const pageRequest = (overrides: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = {
      accept: "text/html,application/xhtml+xml",
      ...((overrides.headers as Record<string, string>) ?? {}),
    };
    return returnPathForSignedOutRequest({
      method: "GET",
      pathname: "/lease-renewal/live/desk/lease/1001",
      search: "?deskView=abc",
      hasSession: false,
      ...overrides,
      header: (name: string) => headers[name] ?? null,
    });
  };

  it("remembers the page a signed-out person opens in the browser", () => {
    expect(pageRequest()).toBe("/lease-renewal/live/desk/lease/1001?deskView=abc");
  });

  it.each([
    ["a request that already carries a session", { hasSession: true }],
    ["a non-GET request", { method: "POST" }],
    ["an API or data request", { headers: { accept: "application/json" } }],
    ["a framework data request", { headers: { rsc: "1" } }],
    ["a link prefetch", { headers: { "next-router-prefetch": "1" } }],
    ["a browser prefetch", { headers: { "sec-purpose": "prefetch" } }],
    ["an asset", { pathname: "/icons/logo.png", search: "" }],
    ["the sign-in page itself", { pathname: "/sign-in", search: "" }],
    ["the Vendor boundary", { pathname: "/vendor/tickets/7", search: "" }],
    ["an API path", { pathname: "/api/work", search: "" }],
    ["the Dashboard default", { pathname: "/", search: "" }],
  ])("leaves %s alone", (_label, overrides) => {
    expect(pageRequest(overrides)).toBeNull();
  });
});

describe("S165 sign-in helper host (ARCH-S165-1)", () => {
  const configuredAuthDomain = "example-project.firebaseapp.com";

  it("keeps the Firebase-hosted helper when no same-origin host is declared", () => {
    expect(
      resolveFirebaseAuthDomain({
        configuredAuthDomain,
        currentHost: "app.example.test",
      }),
    ).toEqual({ authDomain: configuredAuthDomain, sameOrigin: false });
  });

  it("uses the app's own host only on exactly the declared host", () => {
    expect(
      resolveFirebaseAuthDomain({
        configuredAuthDomain,
        sameOriginAuthHost: "App.Example.Test",
        currentHost: "app.example.test",
      }),
    ).toEqual({ authDomain: "app.example.test", sameOrigin: true });
  });

  it.each([
    ["a release candidate address", "cand-1---app.example.test"],
    ["localhost", "localhost:3000"],
    ["server rendering (no host)", null],
  ])("keeps the Firebase-hosted helper on %s", (_label, currentHost) => {
    expect(
      resolveFirebaseAuthDomain({
        configuredAuthDomain,
        sameOriginAuthHost: "app.example.test",
        currentHost,
      }),
    ).toEqual({ authDomain: configuredAuthDomain, sameOrigin: false });
  });

  it.each(["https://app.example.test", "app.example.test/path", "app example", " "])(
    "ignores a malformed declared host: %s",
    (sameOriginAuthHost) => {
      expect(
        resolveFirebaseAuthDomain({
          configuredAuthDomain,
          sameOriginAuthHost,
          currentHost: "app.example.test",
        }).sameOrigin,
      ).toBe(false);
    },
  );
});

describe("S165 same-origin helper relay mapping (ARCH-S165-1)", () => {
  const active = {
    sameOriginAuthHost: "app.example.test",
    authDomain: "example-project.firebaseapp.com",
  };

  it("is inert until the same-origin host is declared", () => {
    expect(
      resolveAuthHelperUpstream({
        sameOriginAuthHost: undefined,
        authDomain: active.authDomain,
        segments: ["auth", "handler"],
        search: "",
      }),
    ).toBeNull();
  });

  it("maps the fixed helper locations to this project's Firebase helper domain", () => {
    expect(
      resolveAuthHelperUpstream({
        ...active,
        segments: ["auth", "handler"],
        search: "?apiKey=k&authType=signInViaRedirect",
      }),
    ).toBe(
      "https://example-project.firebaseapp.com/__/auth/handler?apiKey=k&authType=signInViaRedirect",
    );
    expect(
      resolveAuthHelperUpstream({
        ...active,
        segments: ["auth", "iframe.js"],
        search: "",
      }),
    ).toBe("https://example-project.firebaseapp.com/__/auth/iframe.js");
    expect(
      resolveAuthHelperUpstream({
        ...active,
        segments: ["firebase", "init.json"],
        search: "",
      }),
    ).toBe("https://example-project.firebaseapp.com/__/firebase/init.json");
  });

  it.each([
    [["auth"]],
    [["auth", ".."]],
    [["auth", "..", "..", "secret"]],
    [["auth", "a/b"]],
    [["auth", "handler", "x", "y", "z", "too-deep"]],
    [["firebase", "other.json"]],
    [["firestore", "data"]],
    [[]],
  ])("refuses a path outside the helper locations: %j", (segments) => {
    expect(resolveAuthHelperUpstream({ ...active, segments, search: "" })).toBeNull();
  });

  it.each(["elsewhere.example", "example-project.web.app.evil.example", "", undefined])(
    "refuses to relay to a helper domain that is not a Firebase helper domain: %s",
    (authDomain) => {
      expect(
        resolveAuthHelperUpstream({
          sameOriginAuthHost: active.sameOriginAuthHost,
          authDomain,
          segments: ["auth", "handler"],
          search: "",
        }),
      ).toBeNull();
    },
  );

  it("routes the helper paths to the relay with a rewrite, never a redirect", async () => {
    expect(nextConfig.redirects).toBeUndefined();
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toEqual([
      { source: "/__/auth/:path*", destination: "/api/auth/helper/auth/:path*" },
      {
        source: "/__/firebase/init.json",
        destination: "/api/auth/helper/firebase/init.json",
      },
    ]);
  });
});
