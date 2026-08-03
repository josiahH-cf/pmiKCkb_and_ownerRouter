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

  it("selects the real read provider for explicit Demo + Live-read-only", () => {
    expect(
      resolveConsoleDataMode({
        DATA_CONTEXT: "live_readonly",
        ENVIRONMENT_KIND: "demo",
        NODE_ENV: "development",
      }),
    ).toEqual({ kind: "live" });
    expect(
      resolveConsoleDataModes({
        DATA_CONTEXT: "live_readonly",
        ENVIRONMENT_KIND: "demo",
        NODE_ENV: "development",
      }),
    ).toEqual([{ kind: "live" }]);
  });

  it("refuses the retired fixture context and keeps Production Live-only", () => {
    expect(() =>
      resolveConsoleDataModes({
        DATA_CONTEXT: "demo",
        ENVIRONMENT_KIND: "demo",
        NODE_ENV: "development",
      }),
    ).toThrow(/fixture lane is retired/);
    expect(
      resolveConsoleDataModes({
        DATA_CONTEXT: "live",
        ENVIRONMENT_KIND: "production",
        NODE_ENV: "production",
      }),
    ).toEqual([{ kind: "live" }]);
  });

  it("never constructs the fixture provider in production and fails visibly", async () => {
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
      },
    );
    expect(projection.rows).toEqual([]);
    expect(projection.sourceHealth.map((source) => source.source)).toEqual([
      "Rentvine",
      "PMI KC workflow",
      "Gmail",
    ]);
    expect(JSON.stringify(projection)).not.toContain("fixture-sensitive");
  });

  it("constructs the real read provider for Demo + Live-read-only", async () => {
    const liveProvider: ConsoleDataProvider = {
      load: vi.fn(async () => ({ rows: [], sourceHealth: [] })),
    };
    const createLive = vi.fn(() => liveProvider);
    const mode = resolveConsoleDataMode({
      DATA_CONTEXT: "live_readonly",
      ENVIRONMENT_KIND: "demo",
      NODE_ENV: "development",
    });

    await loadConsoleProjection(actor, mode, { createLive });

    expect(createLive).toHaveBeenCalledOnce();
  });
});
