import { describe, expect, it, vi } from "vitest";

import {
  assertCandidateReadOnlyBoundary,
  smokeReleaseCandidate,
  validateCandidateBaseUrl,
} from "@/scripts/smoke-release-candidate.mjs";

describe("read-only release candidate smoke", () => {
  it("accepts only the exact tagged Cloud Run service origin", () => {
    expect(
      validateCandidateBaseUrl(
        "https://cand-r123---pmi-kc-app-hash-uc.a.run.app",
        "cand-r123",
        "pmi-kc-app",
      ),
    ).toBe("https://cand-r123---pmi-kc-app-hash-uc.a.run.app");
    for (const value of [
      "http://localhost:3000",
      "http://candidate.example.com",
      "https://user:candidate@example.com",
      "https://candidate.example.com/path",
      "https://candidate.example.com/?token=secret",
    ]) {
      expect(() => validateCandidateBaseUrl(value, "cand-r123", "pmi-kc-app")).toThrow();
    }
    expect(() =>
      validateCandidateBaseUrl(
        "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app",
        "cand-r123",
        "pmi-kc-app",
      ),
    ).toThrow(/does not match/i);
    expect(() =>
      validateCandidateBaseUrl(
        "https://cand-r123---other-service-hash-uc.a.run.app",
        "cand-r123",
        "pmi-kc-app",
      ),
    ).toThrow(/service pmi-kc-app/i);
  });

  it("accepts the public auth shell and refuses an unexpected serving surface", () => {
    expect(() =>
      assertCandidateReadOnlyBoundary(
        {
          root: { status: 307, location: "/sign-in" },
          signIn: { status: 200, location: null },
          protectedRoute: { status: 307, location: "/sign-in" },
        },
        "https://candidate.example.com",
      ),
    ).not.toThrow();
    expect(() =>
      assertCandidateReadOnlyBoundary(
        {
          root: { status: 200, location: null },
          signIn: { status: 200, location: null },
          protectedRoute: { status: 307, location: "/sign-in" },
        },
        "https://candidate.example.com",
      ),
    ).toThrow(/auth redirect/);
    expect(() =>
      assertCandidateReadOnlyBoundary(
        {
          root: { status: 307, location: "https://evil.example/sign-in" },
          signIn: { status: 200, location: null },
          protectedRoute: { status: 307, location: "/sign-in" },
        },
        "https://candidate.example.com",
      ),
    ).toThrow(/same candidate origin/i);
  });

  it("issues GET-only, manual-redirect probes and reads no response bodies", async () => {
    const fetchFn = vi.fn(async (url) => ({
      headers: new Headers({ location: url.endsWith("/sign-in") ? "" : "/sign-in" }),
      status: url.endsWith("/sign-in") ? 200 : 307,
    }));

    await expect(
      smokeReleaseCandidate("https://cand-r123---pmi-kc-app-hash-uc.a.run.app", {
        expectedService: "pmi-kc-app",
        expectedTag: "cand-r123",
        fetchFn,
      }),
    ).resolves.toMatchObject({
      root: { status: 307 },
      signIn: { status: 200 },
      protectedRoute: { status: 307 },
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchFn.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "manual" });
    }
  });
});
