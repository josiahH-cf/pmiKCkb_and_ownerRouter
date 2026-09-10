import { beforeEach, describe, expect, it, vi } from "vitest";
import { establishAppSession } from "../../scripts/auth/browser";

const fixture = vi.hoisted(() => ({ closed: false, rejectVerification: false }));
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
        locator: () => ({
          first: () => ({
            textContent: async () => {
              if (fixture.closed) throw new Error("role read closed too early");
              return "Admin";
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
});
const options = {
  profile: "/external-managed-profile",
  origin: "https://app.example.test",
  email: "canary-admin@pmikcmetro.com",
  executablePath: "/browser/chrome",
  platform: "linux" as const,
  headless: true,
  humanWaitMs: 0,
};
describe("managed browser verification lifetime", () => {
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
      error: "session read failed",
    });
    expect(fixture.closed).toBe(true);
  });
});
