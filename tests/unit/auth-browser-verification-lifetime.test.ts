import { beforeEach, describe, expect, it, vi } from "vitest";
import { establishAppSession } from "../../scripts/auth/browser";

vi.mock("../../lib/production-assurance/profile-lease.mjs", () => ({
  acquireManagedProfileLease: async () => ({ release: async () => {} }),
  ManagedProfileError: class ManagedProfileError extends Error {},
}));
const fixture = vi.hoisted(() => ({
  closed: false,
  rejectVerification: false,
  email: "canary-admin@pmikcmetro.com",
  role: "Admin",
  sessionStatus: 204,
}));
vi.mock("playwright-core", () => ({
  chromium: {
    launchPersistentContext: async () => {
      const page = {
        url: () => "https://app.example.test/",
        goto: async (url: string) => {
          if (url.endsWith("/sign-in")) return;
          await Promise.resolve();
          if (fixture.closed) throw new Error("verification page closed too early");
          if (fixture.rejectVerification) throw new Error("session read failed");
        },
        waitForTimeout: async () => {},
        request: { get: async () => ({ status: () => fixture.sessionStatus }) },
        locator: (selector: string) => ({
          first: () => ({
            textContent: async () => {
              if (fixture.closed) throw new Error("role read closed too early");
              return selector === "main > p" ? fixture.email : fixture.role;
            },
          }),
        }),
      };
      return {
        pages: () => [page],
        close: async () => {
          fixture.closed = true;
        },
      };
    },
  },
}));

beforeEach(() => {
  fixture.closed = false;
  fixture.rejectVerification = false;
  fixture.email = "canary-admin@pmikcmetro.com";
  fixture.role = "Admin";
  fixture.sessionStatus = 204;
});
const options = {
  profile: "/external-managed-profile",
  origin: "https://app.example.test",
  email: "canary-admin@pmikcmetro.com",
  executablePath: "/browser/chrome",
  platform: "linux" as const,
  expectedRole: "Admin",
  headless: true,
  humanWaitMs: 0,
};
describe("managed browser verification lifetime", () => {
  it("rejects a different server-rendered account without inferring identity from cookies", async () => {
    fixture.email = "different@pmikcmetro.com";
    await expect(establishAppSession(options)).resolves.toMatchObject({
      result: "error",
      code: "wrong_identity",
    });
    expect(fixture.closed).toBe(true);
  });
  it("rejects an unexpected role without changing its claim", async () => {
    fixture.role = "Editor";
    await expect(establishAppSession(options)).resolves.toMatchObject({
      result: "error",
      code: "wrong_role",
    });
    expect(fixture.closed).toBe(true);
  });
  it("does not accept a displayed role when the actual session is rejected", async () => {
    fixture.sessionStatus = 401;
    await expect(establishAppSession(options)).resolves.toMatchObject({
      result: "error",
      code: "app_session_rejected",
    });
    expect(fixture.closed).toBe(true);
  });

  it("keeps the browser open until the existing session and displayed role are read", async () => {
    await expect(establishAppSession(options)).resolves.toMatchObject({
      result: "signed_in",
      role: "Admin",
      method: "existing_session",
    });
    expect(fixture.closed).toBe(true);
  });
  it("returns a failed verification without leaking an unhandled rejected promise", async () => {
    fixture.rejectVerification = true;
    await expect(establishAppSession(options)).resolves.toMatchObject({
      result: "error",
      code: "browser_session_error",
    });
    expect(fixture.closed).toBe(true);
  });
});
