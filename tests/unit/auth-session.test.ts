import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authenticateSessionCookie,
  AUTH_ABSOLUTE_MAX_AGE_SECONDS,
  AuthError,
  authenticateIdToken,
  localDemoSessionValue,
  localDemoUser,
  readLocalDemoSessionRole,
  requireCapability,
  requireRole,
  requireUser,
  setAuthResolverForTest,
  setIdTokenVerifierForTest,
  setSessionCookieCreatorForTest,
  setSessionCookieVerifierForTest,
  validateAuthClaims,
} from "@/lib/auth/session";

const originalAllowedHd = process.env.ALLOWED_HD;
const originalDemoAuth = process.env.LOCAL_DEMO_AUTH;

afterEach(() => {
  process.env.ALLOWED_HD = originalAllowedHd;
  process.env.LOCAL_DEMO_AUTH = originalDemoAuth;
  setAuthResolverForTest(null);
  setIdTokenVerifierForTest(null);
  setSessionCookieCreatorForTest(null);
  setSessionCookieVerifierForTest(null);
});

describe("auth hosted-domain enforcement", () => {
  it("accepts users from the configured hosted domain", () => {
    process.env.ALLOWED_HD = "pmikcmetro.com";

    expect(
      validateAuthClaims({
        uid: "user-1",
        email: "editor@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Editor",
      }),
    ).toEqual({
      uid: "user-1",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    });
  });

  it("rejects users from another hosted domain", () => {
    process.env.ALLOWED_HD = "pmikcmetro.com";

    expect(() =>
      validateAuthClaims({
        uid: "user-1",
        email: "editor@example.com",
        hd: "example.com",
        role: "Editor",
      }),
    ).toThrow(AuthError);
  });

  it("rejects users without a hosted-domain claim", () => {
    expect(() =>
      validateAuthClaims({
        uid: "user-1",
        email: "editor@pmikcmetro.com",
        role: "Editor",
      }),
    ).toThrow(AuthError);
  });
});

describe("auth guards", () => {
  beforeEach(() => {
    process.env.ALLOWED_HD = "pmikcmetro.com";
  });

  it("returns 401 when no session is present", async () => {
    setAuthResolverForTest(() => null);

    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });

  it("allows editors to read but not approve", async () => {
    setAuthResolverForTest(() => ({
      uid: "editor",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    await expect(requireCapability("read")).resolves.toMatchObject({
      role: "Editor",
    });
    await expect(requireCapability("approve")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("allows approvers to approve but not manage admin", async () => {
    setAuthResolverForTest(() => ({
      uid: "approver",
      email: "approver@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Approver",
    }));

    await expect(requireCapability("approve")).resolves.toMatchObject({
      role: "Approver",
    });
    await expect(requireCapability("manageAdmin")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("limits admin pages to Admin users", async () => {
    setAuthResolverForTest(() => ({
      uid: "admin",
      email: "admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
    }));

    await expect(requireRole("Admin")).resolves.toMatchObject({ role: "Admin" });
  });
});

describe("Firebase session-cookie verification", () => {
  beforeEach(() => {
    process.env.ALLOWED_HD = "pmikcmetro.com";
  });

  it("authenticates verified Google session cookies", async () => {
    setSessionCookieVerifierForTest((sessionCookie) => {
      expect(sessionCookie).toBe("valid-session");
      return makeFirebaseClaims();
    });

    await expect(authenticateSessionCookie("valid-session")).resolves.toEqual({
      uid: "editor",
      email: "editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    });
  });

  it("returns 401 for invalid session cookies", async () => {
    setSessionCookieVerifierForTest(() => {
      throw new Error("invalid session");
    });

    await expect(authenticateSessionCookie("invalid-session")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("returns 401 for revoked session cookies", async () => {
    setSessionCookieVerifierForTest(() => {
      throw new Error("auth/session-cookie-revoked");
    });

    await expect(authenticateSessionCookie("revoked-session")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects verified users outside the allowed hosted domain", async () => {
    setSessionCookieVerifierForTest(() =>
      makeFirebaseClaims({ email: "editor@example.com" }),
    );

    await expect(authenticateSessionCookie("wrong-domain")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects explicit hosted-domain claims that do not match the email domain", async () => {
    setSessionCookieVerifierForTest(() => makeFirebaseClaims({ hd: "example.com" }));

    await expect(authenticateSessionCookie("mismatched-hd")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects unverified email addresses", async () => {
    setSessionCookieVerifierForTest(() => makeFirebaseClaims({ email_verified: false }));

    await expect(authenticateSessionCookie("unverified-email")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects non-Google sign-in providers", async () => {
    setSessionCookieVerifierForTest(() =>
      makeFirebaseClaims({ firebase: { sign_in_provider: "password" } }),
    );

    await expect(authenticateSessionCookie("password-provider")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects missing or invalid role claims", async () => {
    setSessionCookieVerifierForTest(() => makeFirebaseClaims({ role: "Viewer" }));

    await expect(authenticateSessionCookie("invalid-role")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("defaults new Firebase users without a role claim to Editor", async () => {
    setSessionCookieVerifierForTest(() => makeFirebaseClaims({ role: undefined }));

    await expect(authenticateSessionCookie("default-role")).resolves.toMatchObject({
      role: "Editor",
    });
  });

  it("requires recent Firebase auth time", async () => {
    setSessionCookieVerifierForTest(() =>
      makeFirebaseClaims({
        auth_time: currentAuthTime() - AUTH_ABSOLUTE_MAX_AGE_SECONDS - 1,
      }),
    );

    await expect(authenticateSessionCookie("stale-auth")).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("local demo auth", () => {
  it("is disabled unless explicitly configured", async () => {
    process.env.LOCAL_DEMO_AUTH = "false";
    setSessionCookieVerifierForTest(() => {
      throw new Error("not firebase");
    });

    await expect(authenticateSessionCookie("local-demo")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("resolves no demo role when demo auth is disabled", () => {
    process.env.LOCAL_DEMO_AUTH = "false";

    expect(readLocalDemoSessionRole("local-demo")).toBeNull();
    expect(readLocalDemoSessionRole("local-demo:Editor")).toBeNull();
  });

  it("keeps the plain local-demo cookie as an Admin session", () => {
    process.env.LOCAL_DEMO_AUTH = "true";

    expect(readLocalDemoSessionRole("local-demo")).toBe("Admin");
  });

  it("resolves role-scoped demo cookies", () => {
    process.env.LOCAL_DEMO_AUTH = "true";

    expect(readLocalDemoSessionRole("local-demo:Editor")).toBe("Editor");
    expect(readLocalDemoSessionRole("local-demo:Approver")).toBe("Approver");
    expect(readLocalDemoSessionRole("local-demo:Admin")).toBe("Admin");
  });

  it("rejects unknown demo roles and unrelated cookies", () => {
    process.env.LOCAL_DEMO_AUTH = "true";

    expect(readLocalDemoSessionRole("local-demo:Viewer")).toBeNull();
    expect(readLocalDemoSessionRole("local-demo:")).toBeNull();
    expect(readLocalDemoSessionRole("firebase-session")).toBeNull();
  });

  it("builds backward-compatible demo session cookie values", () => {
    expect(localDemoSessionValue("Admin")).toBe("local-demo");
    expect(localDemoSessionValue("Editor")).toBe("local-demo:Editor");
    expect(localDemoSessionValue("Approver")).toBe("local-demo:Approver");
  });

  it("mints role-specific demo users with the allowed hosted domain", () => {
    process.env.ALLOWED_HD = "pmikcmetro.com";

    expect(localDemoUser()).toEqual({
      uid: "local-demo-admin",
      email: "local-demo@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
    });
    expect(localDemoUser("Editor")).toEqual({
      uid: "local-demo-editor",
      email: "local-demo-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    });
  });
});

describe("Firebase ID-token verification", () => {
  beforeEach(() => {
    process.env.ALLOWED_HD = "pmikcmetro.com";
  });

  it("authenticates verified Google ID tokens", async () => {
    setIdTokenVerifierForTest((idToken) => {
      expect(idToken).toBe("valid-token");
      return makeFirebaseClaims();
    });

    await expect(authenticateIdToken("valid-token")).resolves.toMatchObject({
      email: "editor@pmikcmetro.com",
      role: "Editor",
    });
  });

  it("returns 401 for invalid ID tokens", async () => {
    setIdTokenVerifierForTest(() => {
      throw new Error("invalid token");
    });

    await expect(authenticateIdToken("invalid-token")).rejects.toMatchObject({
      status: 401,
    });
  });
});

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
