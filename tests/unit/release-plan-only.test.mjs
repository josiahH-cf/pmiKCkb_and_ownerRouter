import { describe, expect, it, vi } from "vitest";

const spawned = vi.hoisted(() => ({ calls: [] }));
vi.mock("node:child_process", () => ({
  spawn: (...args) => {
    spawned.calls.push(args);
    throw new Error("release --plan-only must never spawn a process.");
  },
}));

import { main } from "@/scripts/release.mjs";

/**
 * AC-S40-11: `--plan-only` is a guaranteed non-executing branch that runs BEFORE auth/S52 execution
 * eligibility and never invokes gcloud.
 *
 * A comment claiming a branch does not execute is not evidence. `node:child_process.spawn` is
 * replaced with a throwing spy, so if any code path reached a process the test would fail loudly
 * rather than silently pass.
 */

describe("release --plan-only never executes", () => {
  it("prints an ordered plan and spawns nothing", async () => {
    spawned.calls.length = 0;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await main(["--environment=production", "--plan-only"], {
      ...process.env,
    });

    expect(spawned.calls).toEqual([]);
    expect(result.planned).toBe(true);
    expect(result.steps.map((step) => step.name)).toEqual([
      "capture-prior-revision",
      "deploy-candidate",
      "smoke-candidate",
      "assure-candidate",
      "promote-exact-revision",
      "observe-promoted-revision",
      "rollback",
    ]);

    const printed = log.mock.calls.map((call) => call.join(" ")).join("\n");
    // The printed candidate command must carry BOTH descriptor variables and zero-traffic delivery.
    expect(printed).toContain("ENVIRONMENT_KIND=production");
    expect(printed).toContain("DATA_CONTEXT=live");
    expect(printed).toContain("--no-traffic");
    expect(printed).toContain("Nothing above has run.");
    // A plan makes no budget claim while the S52 ceiling is null.
    expect(printed).not.toContain("--budget-confirmed");
    log.mockRestore();
    vi.restoreAllMocks();
  });

  it("refuses a plan combined with an executing flag before doing anything", async () => {
    spawned.calls.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      main(["--environment=production", "--plan-only", "--execute"], { ...process.env }),
    ).rejects.toThrow(/--plan-only cannot be combined/);

    expect(spawned.calls).toEqual([]);
    vi.restoreAllMocks();
  });

  it("refuses an unknown environment without spawning", async () => {
    spawned.calls.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      main(["--environment=staging", "--plan-only"], { ...process.env }),
    ).rejects.toThrow(/not one of/);

    expect(spawned.calls).toEqual([]);
    vi.restoreAllMocks();
  });

  it("refuses an emulator variable by name, from the ambient shell, without spawning", async () => {
    spawned.calls.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      main(["--environment=production", "--plan-only"], {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8090",
      }),
    ).rejects.toThrow(/FIRESTORE_EMULATOR_HOST/);

    expect(spawned.calls).toEqual([]);
    vi.restoreAllMocks();
  });

  it("requires exactly one mode: no flag at all is refused", async () => {
    spawned.calls.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(main(["--environment=production"], { ...process.env })).rejects.toThrow(
      /exactly one of --plan-only, --execute, or --promote/,
    );

    expect(spawned.calls).toEqual([]);
    vi.restoreAllMocks();
  });
});
