import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/auth/ensure.mjs";
import {
  HOOK_DELEGATION_TIMEOUT_MS,
  buildWslDelegation,
  delegateToWsl,
  windowsPathToWsl,
} from "../../scripts/auth/wsl-delegate.mjs";

const root = "C:\\Users\\josia\\Documents\\github-windows\\pmiKCkb_and_ownerRouter";

describe("Windows shells report the approved WSL store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("maps drive and WSL share checkouts, and refuses paths WSL cannot see", () => {
    expect(windowsPathToWsl(root)).toBe(
      "/mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter",
    );
    expect(windowsPathToWsl("D:\\")).toBe("/mnt/d");
    expect(windowsPathToWsl("\\\\?\\C:\\work\\repo\\")).toBe("/mnt/c/work/repo");
    expect(windowsPathToWsl("\\\\wsl.localhost\\Ubuntu\\home\\josiah\\repo")).toBe(
      "/home/josiah/repo",
    );
    expect(
      windowsPathToWsl("\\\\?\\UNC\\wsl.localhost\\ubuntu\\home\\josiah\\repo"),
    ).toBe("/home/josiah/repo");
    expect(windowsPathToWsl("\\\\wsl$\\Ubuntu\\srv\\repo")).toBe("/srv/repo");
    expect(windowsPathToWsl("\\\\fileserver\\share\\repo")).toBeNull();
    expect(windowsPathToWsl("relative\\repo")).toBeNull();
  });

  it("runs the same script and arguments inside WSL with every argument quoted", () => {
    const invocation = buildWslDelegation({
      root,
      argv: ["--need=canary", "--admin-email=o'brien@pmikcmetro.com"],
    });
    expect(invocation.file).toBe("wsl.exe");
    expect(invocation.args.slice(0, 3)).toEqual(["-e", "bash", "-lc"]);
    expect(invocation.args[3]).toBe(
      "cd '/mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter' && " +
        "'node' 'scripts/auth/ensure.mjs' '--need=canary' " +
        "'--admin-email=o'\\''brien@pmikcmetro.com'",
    );
    expect(buildWslDelegation({ root: "\\\\fileserver\\share", argv: [] })).toBeNull();
  });

  it("bounds only the session-start hook and never reports a failed start as a credential", () => {
    const calls = [];
    const spawn = (file, args, options) => {
      calls.push(options);
      return { status: 0 };
    };
    expect(delegateToWsl({ root, argv: ["--hook"], hook: true, spawn })).toEqual({
      delegated: true,
      status: 0,
    });
    expect(calls[0]).toMatchObject({
      stdio: "inherit",
      timeout: HOOK_DELEGATION_TIMEOUT_MS,
    });
    delegateToWsl({ root, argv: [], spawn });
    expect(calls[1].timeout).toBeUndefined();

    const failing = (code) => () => ({
      status: null,
      error: Object.assign(new Error(code), { code }),
    });
    expect(delegateToWsl({ root, argv: [], spawn: failing("ENOENT") })).toEqual({
      delegated: false,
      reason: "wsl.exe is unavailable",
    });
    expect(delegateToWsl({ root, argv: [], spawn: failing("ETIMEDOUT") })).toEqual({
      delegated: false,
      reason: "the WSL check timed out",
    });
    expect(delegateToWsl({ root, argv: [], spawn: () => ({ status: null }) })).toEqual({
      delegated: false,
      reason: "the WSL check was stopped",
    });
  });

  it("relays the WSL exit code and keeps the hook advisory", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const delegate = vi.fn(() => ({ delegated: true, status: 2 }));
    await main(["--status"], {}, { platform: "win32", root, delegate });
    expect(delegate).toHaveBeenCalledWith({ root, argv: ["--status"], hook: false });
    expect(process.exitCode).toBe(2);
    expect(log).not.toHaveBeenCalled();

    await main(["--hook"], {}, { platform: "win32", root, delegate });
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(
      "auth: WSL check failed (exit 2); run npm run auth:ensure inside WSL",
    );
  });

  it("names an unavailable WSL check instead of asking for a new enrollment", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const delegate = () => ({ delegated: false, reason: "wsl.exe is unavailable" });
    const result = await main(["--hook"], {}, { platform: "win32", root, delegate });
    expect(result).toEqual({ delegated: false, exitCode: 0 });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe(
      "auth: WSL check unavailable (wsl.exe is unavailable); run npm run auth:ensure inside WSL",
    );
    expect(log.mock.calls[0][0]).not.toContain("auth:enroll");
  });
});
