import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NOT_INSTALLED,
  authPackagesInstalled,
  main as selectMain,
  registeredCheckout,
  selectAuthCheckout,
} from "../../scripts/auth/checkout-dependencies.mjs";
import { handOffWithoutPackages, main } from "../../scripts/auth/ensure.mjs";
import { HOOK_DELEGATION_TIMEOUT_MS } from "../../scripts/auth/wsl-delegate.mjs";

// No credential store, Google process or token is used: fixtures are empty folders, a checkout
// registration record and stand-in auth scripts that print a fixed line.
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const REPOSITORY = "josiahH-cf/pmiKCkb_and_ownerRouter";
const temps = [];

function temp() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "pmi-auth-checkout-")));
  temps.push(dir);
  return dir;
}

function write(path, text = "") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A checkout whose auth scripts exist; `packages` adds a resolvable Google package. */
function checkout(dir, { packages = false, ensure = "" } = {}) {
  write(join(dir, "scripts", "auth", "ensure.mjs"), ensure);
  if (packages) {
    write(
      join(dir, "node_modules", "google-auth-library", "package.json"),
      JSON.stringify({ name: "google-auth-library", main: "index.js" }),
    );
    write(join(dir, "node_modules", "google-auth-library", "index.js"));
  }
  return dir;
}

function register(home, nativeRoot, overrides = {}) {
  write(
    join(home, ".local", "state", "pmi-kc-release", "checkout-pair.json"),
    JSON.stringify({
      schemaVersion: 1,
      repository: REPOSITORY,
      nativeRoot,
      sourceRoot: "/mnt/c/unused",
      ...overrides,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("auth commands choose a checkout that has installed packages", () => {
  it("resolves the Google package installed in or above a checkout", () => {
    const base = temp();
    expect(authPackagesInstalled(checkout(join(base, "bare")))).toBe(false);
    expect(
      authPackagesInstalled(checkout(join(base, "installed"), { packages: true })),
    ).toBe(true);
    // A worktree nested inside an installed checkout resolves its parent's packages.
    expect(
      authPackagesInstalled(
        checkout(join(base, "installed", ".claude", "worktrees", "w")),
      ),
    ).toBe(true);
    expect(authPackagesInstalled(ROOT)).toBe(true);
  });

  it("keeps a checkout that can run the auth checks itself", () => {
    const here = checkout(temp(), { packages: true });
    expect(selectAuthCheckout({ root: here, home: temp() })).toEqual({
      root: here,
      handoff: false,
    });
  });

  it("hands a checkout without packages to the registered checkout", () => {
    const home = temp();
    const here = checkout(temp());
    const registered = checkout(temp(), { packages: true });
    register(home, registered);
    expect(registeredCheckout(home)).toBe(registered);
    expect(selectAuthCheckout({ root: here, home })).toEqual({
      root: registered,
      handoff: true,
    });
  });

  it.each([
    ["no registration", () => {}],
    [
      "another repository",
      (home, root) => register(home, root, { repository: "other/repo" }),
    ],
    ["another schema", (home, root) => register(home, root, { schemaVersion: 2 })],
    ["a relative root", (home) => register(home, "relative/root")],
    ["a missing root", (home, root) => register(home, join(root, "missing"))],
    [
      "a registered checkout without packages",
      (home) => register(home, checkout(temp())),
    ],
  ])("refuses a hand-off with %s", (_label, arrange) => {
    const home = temp();
    const here = checkout(temp());
    arrange(home, checkout(temp(), { packages: true }));
    expect(selectAuthCheckout({ root: here, home })).toBeNull();
  });

  it("never hands a checkout to itself", () => {
    const home = temp();
    const here = checkout(temp());
    register(home, here);
    expect(selectAuthCheckout({ root: here, home, installed: () => false })).toBeNull();
  });

  it("prints the chosen checkout for enroll.sh, or the not-installed line", () => {
    const home = temp();
    const here = checkout(temp());
    const registered = checkout(temp(), { packages: true });
    const lines = [];
    const warnings = [];
    const io = { write: (line) => lines.push(line), warn: (line) => warnings.push(line) };
    expect(selectMain({ root: here, home, ...io })).toBe(2);
    expect(warnings).toEqual([NOT_INSTALLED]);
    register(home, registered);
    expect(selectMain({ root: here, home, ...io })).toBe(0);
    expect(lines).toEqual([registered]);
  });
});

describe("ensure.mjs hands its check to the registered checkout", () => {
  const select = (selected) => () => selected;

  it("runs the check itself when this checkout has its packages", () => {
    const spawn = vi.fn();
    expect(
      handOffWithoutPackages({
        root: "/repo",
        argv: ["--status"],
        env: {},
        select: select({ root: "/repo", handoff: false }),
        spawn,
      }),
    ).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("relays the registered checkout's exit status for the same arguments", () => {
    const spawn = vi.fn(() => ({ status: 2 }));
    const warn = vi.fn();
    const env = { HOME: "/home/owner" };
    const result = handOffWithoutPackages({
      root: "/mnt/c/worktree",
      argv: ["--need=adc", "--unattended"],
      env,
      select: select({ root: "/home/owner/registered", handoff: true }),
      spawn,
      warn,
    });
    expect(result).toEqual({ handedOff: true, exitCode: 2 });
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ["/home/owner/registered/scripts/auth/ensure.mjs", "--need=adc", "--unattended"],
      { cwd: "/home/owner/registered", env, stdio: "inherit" },
    );
    expect(warn).toHaveBeenCalledWith(
      "This checkout has no installed packages; checking from the registered WSL checkout /home/owner/registered.",
    );
  });

  it("keeps quiet and JSON output clean, and bounds a session-start hook", () => {
    const spawn = vi.fn(() => ({ status: 2 }));
    const warn = vi.fn();
    const log = vi.fn();
    const handedOff = select({ root: "/registered", handoff: true });
    expect(
      handOffWithoutPackages({
        root: "/worktree",
        argv: ["--quiet"],
        env: {},
        quiet: true,
        select: handedOff,
        spawn,
        warn,
        log,
      }),
    ).toEqual({ handedOff: true, exitCode: 2 });
    expect(
      handOffWithoutPackages({
        root: "/worktree",
        argv: ["--hook"],
        env: {},
        hook: true,
        select: handedOff,
        spawn,
        warn,
        log,
      }),
    ).toEqual({ handedOff: true, exitCode: 0 });
    expect(spawn.mock.calls[1][2].timeout).toBe(HOOK_DELEGATION_TIMEOUT_MS);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    [false, 2, "NOT READY: this checkout has no installed packages"],
    [true, 0, "auth: NOT READY: this checkout has no installed packages"],
  ])(
    "reports a missing install instead of crashing (hook %s)",
    (hook, exitCode, line) => {
      const spawn = vi.fn();
      const messages = [];
      const result = handOffWithoutPackages({
        root: "/worktree",
        argv: [],
        env: {},
        hook,
        select: select(null),
        spawn,
        warn: (message) => messages.push(message),
        log: (message) => messages.push(message),
      });
      expect(result).toEqual({ handedOff: false, exitCode });
      expect(messages).toHaveLength(1);
      expect(messages[0].startsWith(line)).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it("never reports a stopped hand-off as a credential state", () => {
    const warn = vi.fn();
    const result = handOffWithoutPackages({
      root: "/worktree",
      argv: [],
      env: {},
      select: select({ root: "/registered", handoff: true }),
      spawn: () => ({ status: null, error: new Error("spawn failed") }),
      warn,
    });
    expect(result).toEqual({ handedOff: false, exitCode: 2 });
    expect(warn).toHaveBeenLastCalledWith(
      "the registered WSL checkout could not finish this check; run npm run auth:ensure there",
    );
  });

  it("returns the hand-off result from main on WSL", async () => {
    const handOff = vi.fn(() => ({ handedOff: true, exitCode: 2 }));
    const result = await main(
      ["--status", "--quiet"],
      {},
      {
        platform: "linux",
        root: "/worktree",
        handOff,
      },
    );
    expect(result).toEqual({ handedOff: true, exitCode: 2 });
    expect(process.exitCode).toBe(2);
    expect(handOff).toHaveBeenCalledWith({
      root: "/worktree",
      argv: ["--status", "--quiet"],
      env: {},
      hook: false,
      quiet: true,
    });
  });
});

// The 2026-11-11 failure: a checkout whose node_modules is empty could not even load ensure.mjs,
// so the session-start hook and auth:enroll:wsl crashed before reporting anything.
describe.skipIf(process.platform === "win32")(
  "auth scripts in a checkout without packages",
  () => {
    const scripts = [
      "scripts/preflight-adc.mjs",
      "scripts/auth/checkout-dependencies.mjs",
      "scripts/auth/credential-store.mjs",
      "scripts/auth/ensure.mjs",
      "scripts/auth/identities.mjs",
      "scripts/auth/plan.mjs",
      "scripts/auth/wsl-delegate.mjs",
    ];

    function bareCheckout() {
      const dir = temp();
      for (const script of scripts) {
        mkdirSync(dirname(join(dir, script)), { recursive: true });
        copyFileSync(join(ROOT, script), join(dir, script));
      }
      return dir;
    }

    function ensure(dir, home, args) {
      return spawnSync(
        process.execPath,
        [join(dir, "scripts/auth/ensure.mjs"), ...args],
        {
          cwd: dir,
          encoding: "utf8",
          timeout: 30_000,
          env: { PATH: process.env.PATH, HOME: home },
        },
      );
    }

    it("reports NOT READY instead of crashing when no checkout has packages", () => {
      const dir = bareCheckout();
      const home = temp();
      const status = ensure(dir, home, ["--status"]);
      expect(status.status, status.stderr).toBe(2);
      expect(status.stderr).toContain(
        "NOT READY: this checkout has no installed packages",
      );
      expect(status.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
      const hook = ensure(dir, home, ["--hook"]);
      expect(hook.status, hook.stderr).toBe(0);
      expect(hook.stdout).toContain(
        "auth: NOT READY: this checkout has no installed packages",
      );
    });

    it("relays the registered checkout's own check", () => {
      const dir = bareCheckout();
      const home = temp();
      const registered = checkout(temp(), {
        packages: true,
        ensure:
          "console.log(`registered check: ${process.argv.slice(2).join(' ')} in ${process.cwd()}`);\nprocess.exitCode = 2;\n",
      });
      register(home, registered);
      const result = ensure(dir, home, ["--need=gcloud,adc", "--unattended"]);
      expect(result.status, result.stderr).toBe(2);
      expect(result.stdout).toContain(
        `registered check: --need=gcloud,adc --unattended in ${registered}`,
      );
      expect(result.stderr).toContain(
        `checking from the registered WSL checkout ${registered}`,
      );
    });
  },
);
