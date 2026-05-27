import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE, POST } from "@/app/api/auth/session/route";
import {
  AUTH_ABSOLUTE_MAX_AGE_SECONDS,
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  setIdTokenVerifierForTest,
  setSessionCookieCreatorForTest,
} from "@/lib/auth/session";

const originalAllowedHd = process.env.ALLOWED_HD;
const originalSessionCookie = process.env.AUTH_SESSION_COOKIE;

beforeEach(() => {
  process.env.ALLOWED_HD = "pmikcmetro.com";
  process.env.AUTH_SESSION_COOKIE = "__session";
});

afterEach(() => {
  process.env.ALLOWED_HD = originalAllowedHd;
  process.env.AUTH_SESSION_COOKIE = originalSessionCookie;
  setIdTokenVerifierForTest(null);
  setSessionCookieCreatorForTest(null);
});

describe("auth session route", () => {
  it("creates a server session cookie for a valid Firebase ID token", async () => {
    setIdTokenVerifierForTest((idToken) => {
      expect(idToken).toBe("valid-id-token");
      return makeFirebaseClaims();
    });
    setSessionCookieCreatorForTest((idToken, expiresInMs) => {
      expect(idToken).toBe("valid-id-token");
      expect(expiresInMs).toBe(SESSION_COOKIE_MAX_AGE_MS);
      return "server-session-cookie";
    });

    const response = await POST(makePostRequest("valid-id-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        uid: "editor",
        email: "editor@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Editor",
      },
    });
    expect(response.headers.get("set-cookie")).toContain(
      `__session=server-session-cookie`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain(
      `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    );
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
  });

  it("returns 401 when the bearer token is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication is required.",
    });
  });

  it("accepts case-insensitive bearer auth with flexible spacing", async () => {
    setIdTokenVerifierForTest((idToken) => {
      expect(idToken).toBe("spaced-token");
      return makeFirebaseClaims();
    });
    setSessionCookieCreatorForTest(() => "spaced-session-cookie");

    const response = await POST(
      new Request("http://localhost/api/auth/session", {
        headers: {
          authorization: "bearer    spaced-token",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects Firebase ID tokens outside the allowed hosted domain", async () => {
    setIdTokenVerifierForTest(() => makeFirebaseClaims({ email: "editor@example.com" }));

    const response = await POST(makePostRequest("wrong-domain-token"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Google Workspace hosted domain is not allowed.",
    });
  });

  it("rejects stale Firebase auth sessions", async () => {
    setIdTokenVerifierForTest(() =>
      makeFirebaseClaims({
        auth_time: currentAuthTime() - AUTH_ABSOLUTE_MAX_AGE_SECONDS - 1,
      }),
    );

    const response = await POST(makePostRequest("stale-token"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Recent Google sign-in is required.",
    });
  });

  it("defaults Firebase users without a role claim to Editor", async () => {
    setIdTokenVerifierForTest(() => makeFirebaseClaims({ role: undefined }));
    setSessionCookieCreatorForTest(() => "default-role-session");

    const response = await POST(makePostRequest("default-role-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { role: "Editor" },
    });
  });

  it("rejects invalid Firebase role claims", async () => {
    setIdTokenVerifierForTest(() => makeFirebaseClaims({ role: "Viewer" }));

    const response = await POST(makePostRequest("invalid-role-token"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Missing or invalid authenticated user role.",
    });
  });

  it("clears the server session cookie", async () => {
    const response = await DELETE();

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("__session=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

function makePostRequest(idToken: string) {
  return new Request("http://localhost/api/auth/session", {
    headers: {
      authorization: `Bearer ${idToken}`,
    },
    method: "POST",
  });
}

function makeFirebaseClaims(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    uid: "editor",
    email: "editor@pmikcmetro.com",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
    auth_time: currentAuthTime(),
    role: "Editor",
    ...overrides,
  };
}

function currentAuthTime() {
  return Math.floor(Date.now() / 1000);
}
