import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import {
  runPmiAuth,
  canEnrollGoogle,
  githubIdentity,
} from "../../scripts/auth/pmi-auth.mjs";
import {
  acquireManagedProfileLease,
  inspectChromiumProfile,
} from "../../lib/production-assurance/profile-lease.mjs";
import { resolveAttendedDisplay } from "../../scripts/auth/display.mjs";

const ready = () => ({
  items: ["gcloud", "adc", "env", "gh"].map((credential) => ({
    credential,
    state: "ok",
    identity:
      credential === "gcloud" || credential === "adc" ? "josiah@pmikcmetro.com" : "",
    detail: "verified fixture",
  })),
});
const signedIn = { result: "signed_in", role: "Admin", method: "existing_session" };
function fixture() {
  return {
    configurationRoot: () => "/fixture/config",
    ensure: vi.fn(async () => ready()),
    github: vi.fn(async () => ({ state: "ok", detail: "verified" })),
    session: vi.fn(async () => signedIn),
    enroll: vi.fn(async () => true),
    recordEnrollment: vi.fn(),
    providers: vi.fn(async () => ({
      state: "not_verified",
      detail: "fixture provider checks unverified",
    })),
    profile: "/fixture/profile",
    executablePath: "/fixture/chrome",
  };
}
const run = (deps, checkOnly = false) => runPmiAuth({ deps, checkOnly, emit: () => {} });

describe("one-command PMI auth orchestration", () => {
  it("reuses valid credentials, verifies exact browser identity/role, and does not overclaim provider readiness", async () => {
    const deps = fixture();
    const result = await run(deps);
    expect(result).toMatchObject({
      localAuthReady: true,
      exitCode: 3,
      providerHealth: { state: "not_verified" },
    });
    expect(deps.enroll).not.toHaveBeenCalled();
    expect(deps.session).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "josiah@pmikcmetro.com",
        expectedRole: "Admin",
        headless: true,
      }),
    );
    expect(deps.recordEnrollment).not.toHaveBeenCalled();
  });
  it.each([
    "unexpected_identity",
    "personal_identity",
    "wrong_store",
    "key_file_forbidden",
    "unexpected_impersonation",
    "permission_denied",
    "auth_probe_failed",
    "identity_probe_unavailable",
  ])("does not enroll or start a browser for %s", async (code) => {
    const deps = fixture();
    deps.ensure.mockResolvedValue({
      items: [
        { credential: "gcloud", state: "blocked", identity: "", detail: "blocked", code },
      ],
    });
    expect((await run(deps)).localAuthReady).toBe(false);
    expect(deps.enroll).not.toHaveBeenCalled();
    expect(deps.session).not.toHaveBeenCalled();
  });
  it.each(["stale_token", "adc_stale", "adc_missing"])(
    "uses attended recovery only for classified %s then rechecks",
    async (code) => {
      const deps = fixture();
      deps.ensure.mockResolvedValueOnce({
        items: [
          {
            credential: code === "stale_token" ? "gcloud" : "adc",
            state: "blocked",
            code,
            detail: "expired",
            identity: "josiah@pmikcmetro.com",
          },
        ],
      });
      expect((await run(deps)).localAuthReady).toBe(true);
      expect(deps.enroll).toHaveBeenCalledOnce();
      expect(deps.ensure).toHaveBeenCalledTimes(2);
    },
  );
  it("never claims recovery when enrollment fails", async () => {
    const deps = fixture();
    deps.ensure.mockResolvedValue({
      items: [
        {
          credential: "adc",
          state: "blocked",
          code: "adc_stale",
          detail: "revoked",
          identity: "josiah@pmikcmetro.com",
        },
      ],
    });
    deps.enroll.mockResolvedValue(false);
    expect((await run(deps)).localAuthReady).toBe(false);
    expect(deps.session).not.toHaveBeenCalled();
  });
  it("check mode reports revoked credentials without opening attended recovery", async () => {
    const deps = fixture();
    deps.ensure.mockResolvedValue({
      items: [
        {
          credential: "adc",
          state: "blocked",
          code: "adc_stale",
          detail: "revoked",
          identity: "josiah@pmikcmetro.com",
        },
      ],
    });
    expect((await run(deps, true)).localAuthReady).toBe(false);
    expect(deps.enroll).not.toHaveBeenCalled();
  });
  it("blocks wrong GitHub identity without switching credentials", async () => {
    const deps = fixture();
    deps.github.mockResolvedValue({
      state: "blocked",
      code: "github_wrong_identity",
      detail: "wrong",
    });
    expect((await run(deps)).localAuthReady).toBe(false);
    expect(deps.session).not.toHaveBeenCalled();
  });
  it.each([
    "profile_in_use",
    "display_unavailable",
    "wrong_identity",
    "wrong_role",
    "browser_session_error",
  ])("does not misclassify %s as credential expiry", async (code) => {
    const deps = fixture();
    deps.session.mockResolvedValue({ result: "error", code, error: "bounded failure" });
    expect((await run(deps)).localAuthReady).toBe(false);
    expect(deps.session).toHaveBeenCalledOnce();
    expect(deps.enroll).not.toHaveBeenCalled();
  });
  it("waits for a person only after an actual Google challenge and records only verified success", async () => {
    const deps = fixture();
    deps.session.mockResolvedValueOnce({ result: "human_required", reason: "challenge" });
    expect((await run(deps)).localAuthReady).toBe(true);
    expect(deps.session.mock.calls[1][0]).toMatchObject({
      headless: false,
      humanWaitMs: 600000,
    });
    expect(deps.recordEnrollment).toHaveBeenCalledOnce();
  });
  it("reports a check-only human challenge without enrollment", async () => {
    const deps = fixture();
    deps.session.mockResolvedValue({ result: "human_required", reason: "challenge" });
    expect(await run(deps, true)).toMatchObject({ localAuthReady: false, exitCode: 2 });
    expect(deps.session).toHaveBeenCalledOnce();
    expect(deps.recordEnrollment).not.toHaveBeenCalled();
  });
  it("refuses enrollment if another credential contains an unexpected identity", () => {
    expect(
      canEnrollGoogle([
        { credential: "adc", state: "blocked", code: "adc_missing" },
        { credential: "gcloud", state: "ok", identity: "different@pmikcmetro.com" },
      ]),
    ).toBe(false);
  });
  it("verifies GitHub through the API and never returns its raw failure output", () => {
    expect(
      githubIdentity({}, () => ({ status: 0, stdout: "other-account\n" })),
    ).toMatchObject({ code: "github_wrong_identity" });
    expect(
      githubIdentity({}, () => ({ status: 1, stdout: "sensitive-provider-body" })),
    ).not.toHaveProperty("stdout");
  });
});

describe("visible attended display selection", () => {
  it("reuses an actually reachable existing X11 socket", async () => {
    const probe = vi.fn(async () => true);
    expect(
      await resolveAttendedDisplay(
        { DISPLAY: ":3", WSL_DISTRO_NAME: "Ubuntu" },
        probe,
        async () => ({ state: "not_observed" }),
      ),
    ).toMatchObject({ ready: true, source: "existing_x11", env: { DISPLAY: ":3" } });
    expect(probe).toHaveBeenCalledWith("/tmp/.X11-unix/X3");
  });
  it("restores only the child DISPLAY when an existing WSLg socket is reachable", async () => {
    const env = { WSL_DISTRO_NAME: "Ubuntu" };
    expect(
      await resolveAttendedDisplay(
        env,
        async (path) => path === "/mnt/wslg/.X11-unix/X0",
        async () => ({ state: "not_observed" }),
      ),
    ).toMatchObject({ ready: true, source: "existing_wslg", env: { DISPLAY: ":0" } });
    expect(env).not.toHaveProperty("DISPLAY");
  });
  it("classifies an unavailable local display without starting a hidden display", async () => {
    expect(
      await resolveAttendedDisplay(
        { WSL_DISTRO_NAME: "Ubuntu", DISPLAY: "remote:0" },
        async () => false,
        async () => ({ state: "not_observed" }),
      ),
    ).toMatchObject({ ready: false, code: "display_unavailable" });
  });
});

const temporary = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
async function profile() {
  const root = await mkdtemp(join(tmpdir(), "pmi-profile-test-"));
  temporary.push(root);
  const result = join(root, "profile");
  await mkdir(result);
  return result;
}
describe.skipIf(process.platform !== "linux")(
  "actual kernel-backed profile coordination",
  () => {
    it("serializes real independent brokers, names the owner, then reacquires without unlinking its lock", async () => {
      const path = await profile();
      const first = await acquireManagedProfileLease(path, {
        label: "first-owner",
        waitMs: 0,
      });
      try {
        await expect(
          acquireManagedProfileLease(path, { label: "second-owner", waitMs: 30 }),
        ).rejects.toMatchObject({
          code: "profile_in_use",
          owner: { label: "first-owner" },
        });
      } finally {
        await first.release();
      }
      const second = await acquireManagedProfileLease(path, {
        label: "second-owner",
        waitMs: 0,
      });
      await second.release();
      expect(
        JSON.parse(await readFile(`${path}.pmi-session.lock`, "utf8")),
      ).toMatchObject({ label: "second-owner" });
    });
    it("leaves dead native Chromium markers for Chromium's own stale recovery", async () => {
      const path = await profile();
      await symlink(`${hostname()}-2147483646`, join(path, "SingletonLock"));
      expect(await inspectChromiumProfile(path)).toMatchObject({ state: "stale" });
      const lease = await acquireManagedProfileLease(path, { waitMs: 0 });
      await lease.release();
      expect(await inspectChromiumProfile(path)).toMatchObject({ state: "stale" });
    });
    it("refuses an unknown native owner without deleting its marker", async () => {
      const path = await profile();
      await symlink("other-machine-123", join(path, "SingletonLock"));
      await expect(acquireManagedProfileLease(path, { waitMs: 0 })).rejects.toMatchObject(
        { code: "profile_in_use" },
      );
      expect(await inspectChromiumProfile(path)).toMatchObject({
        state: "unknown_owner",
      });
    });
  },
);
