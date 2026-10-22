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
    expect(windowsPathToWsl(root)).toEqual({
      distribution: null,
      path: "/mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter",
    });
    expect(windowsPathToWsl("D:\\")).toEqual({ distribution: null, path: "/mnt/d" });
    expect(windowsPathToWsl("\\\\?\\C:\\work\\repo\\")).toEqual({
      distribution: null,
      path: "/mnt/c/work/repo",
    });
    expect(windowsPathToWsl("\\\\wsl.localhost\\Ubuntu\\home\\josiah\\repo")).toEqual({
      distribution: "Ubuntu",
      path: "/home/josiah/repo",
    });
    expect(
      windowsPathToWsl("\\\\?\\UNC\\wsl.localhost\\ubuntu\\home\\josiah\\repo"),
    ).toEqual({ distribution: "ubuntu", path: "/home/josiah/repo" });
    expect(windowsPathToWsl("\\\\wsl$\\JO-Rescue-20261021\\srv\\repo")).toEqual({
      distribution: "JO-Rescue-20261021",
      path: "/srv/repo",
    });
    expect(windowsPathToWsl("\\\\fileserver\\share\\repo")).toBeNull();
    expect(windowsPathToWsl("relative\\repo")).toBeNull();
  });

  it("runs a WSL share checkout in its own distribution, not the default one", () => {
    const invocation = buildWslDelegation({
      root: "\\\\wsl$\\JO-Rescue-20261021\\home\\josiah\\repo",
      argv: ["--status"],
    });
    expect(invocation.args.slice(0, 5)).toEqual([
      "--distribution",
      "JO-Rescue-20261021",
      "-e",
      "bash",
      "-lc",
    ]);
    expect(invocation.args[5]).toBe(
      "cd '/home/josiah/repo' && 'node' 'scripts/auth/ensure.mjs' '--status'",
    );
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

  it("stops a non-hook run instead of probing or repairing the Windows store", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const delegate = () => ({ delegated: false, reason: "wsl.exe is unavailable" });
    for (const argv of [["--status"], []]) {
      const result = await main(argv, {}, { platform: "win32", root, delegate });
      expect(result).toEqual({ delegated: false, exitCode: 2 });
      expect(process.exitCode).toBe(2);
    }
    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "WSL check unavailable (wsl.exe is unavailable); run npm run auth:ensure inside WSL",
    );
  });
});
