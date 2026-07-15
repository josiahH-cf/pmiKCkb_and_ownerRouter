import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  resolveConsoleDataMode,
  resolveConsoleDataModes,
} from "@/lib/console/environment";
import { loadConsoleProjection, type ConsoleDataProvider } from "@/lib/console/live-data";

const actor: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};

describe("Console environment boundary", () => {
  it("forces ordinary production to live mode despite demo/browser-like flags", () => {
    expect(
      resolveConsoleDataMode({
        ASK_DEMO_MODE: "true",
        CONSOLE_DATA_MODE: "fixture",
        NEXT_PUBLIC_CONSOLE_DATA_MODE: "fixture",
        NODE_ENV: "production",
      }),
    ).toEqual({ kind: "live" });
  });

  it("allows only a server-named non-production test deployment to use fixtures", () => {
    expect(
      resolveConsoleDataMode({
        CONSOLE_TEST_DEPLOYMENT_NAME: "test-staging-1",
        NODE_ENV: "production",
      }),
    ).toEqual({ badge: "Test data", deploymentName: "test-staging-1", kind: "test" });
    expect(
      resolveConsoleDataMode({
        CONSOLE_TEST_DEPLOYMENT_NAME: "production",
        NODE_ENV: "production",
      }),
    ).toEqual({ kind: "live" });
  });

  it("serves separate Live and Test workspaces in ordinary production", () => {
    expect(resolveConsoleDataModes({ NODE_ENV: "production" })).toEqual([
      { kind: "live" },
      {
        badge: "Test data",
        deploymentName: "production-test-workspace",
        kind: "test",
      },
    ]);
    expect(resolveConsoleDataModes({ NODE_ENV: "development" })).toEqual([
      { badge: "Test data", deploymentName: "local", kind: "test" },
    ]);
    expect(
      resolveConsoleDataModes({
        CONSOLE_TEST_DEPLOYMENT_NAME: "test-staging-1",
        NODE_ENV: "production",
      }),
    ).toEqual([
      { kind: "live" },
      {
        badge: "Test data",
        deploymentName: "production-test-workspace",
        kind: "test",
      },
    ]);
  });

  it("never constructs the fixture provider in production and fails visibly", async () => {
    const createTest = vi.fn();
    const provider: ConsoleDataProvider = {
      load: vi.fn(async () => {
        throw new Error("fixture-sensitive provider detail");
      }),
    };
    const projection = await loadConsoleProjection(
      actor,
      { kind: "live" },
      {
        createLive: () => provider,
        createTest,
      },
    );
    expect(createTest).not.toHaveBeenCalled();
    expect(projection.rows).toEqual([]);
    expect(projection.sourceHealth.map((source) => source.source)).toEqual([
      "Rentvine",
      "PMI KC workflow",
      "Gmail",
    ]);
    expect(JSON.stringify(projection)).not.toContain("fixture-sensitive");
  });

  it("uses only the fixture provider in local/test mode", async () => {
    const createLive = vi.fn();
    const testProvider: ConsoleDataProvider = {
      load: vi.fn(async () => ({ rows: [], sourceHealth: [] })),
    };
    const createTest = vi.fn(async () => testProvider);
    await loadConsoleProjection(
      actor,
      { badge: "Test data", deploymentName: "automated-test", kind: "test" },
      { createLive, createTest },
    );
    expect(createLive).not.toHaveBeenCalled();
    expect(createTest).toHaveBeenCalledTimes(1);
  });
});
