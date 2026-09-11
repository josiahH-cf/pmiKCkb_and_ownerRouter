import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDriver,
  resolveWatcherMonitoringConfig,
  resolveWatcherSourceEnvironment,
} from "../../scripts/release-watcher.mjs";
import { recordBrowserEnrollment } from "../../scripts/auth/browser-enrollment.mjs";
import { parseReleaseArgs } from "../../scripts/release-candidate.mjs";

const service = "pmi-kc-app";
const sha = "a".repeat(40);
const revision = `${service}-candidate-isolated`;
const predecessor = `${service}-predecessor-isolated`;
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function harness({
  rollback = false,
  rollbackReplyLost = false,
  initialTraffic,
  reportOverride = {},
  authExitCode = 0,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "pmi-watcher-driver-"));
  roots.push(root);
  writeFileSync(
    join(root, ".env.local"),
    "RENTVINE_API_BASE_URL=https://pmikcmetro.rentvine.com/api/manager\nRENTVINE_API_KEY=isolated-key\nRENTVINE_API_SECRET=isolated-secret\n",
  );
  const checkpointPath = join(root, "checkpoint.json");
  let serving = initialTraffic ?? revision;
  const cp = {
    sha,
    revision,
    predecessor,
    phase: "observe",
    fingerprint: `sha256:${"b".repeat(64)}`,
    baselineTraffic: [{ revision: predecessor, percent: 100 }],
    candidateOrigin: "https://candidate.invalid",
    tag: "cand-isolated",
    suffix: "candidate-isolated",
  };
  const runCommand = vi.fn(async (bin, args) => {
    if (bin === "gcloud" && args.includes("describe") && args.includes("services"))
      return {
        status: 0,
        stdout: JSON.stringify({
          status: { traffic: [{ revisionName: serving, percent: 100 }] },
        }),
      };
    if (bin === "gcloud" && args.includes("update-traffic")) {
      serving = predecessor;
      return { status: rollbackReplyLost ? 1 : 0, stdout: "" };
    }
    if (args.some((arg) => arg.endsWith("observe-production-release.ts"))) {
      if (args.includes("--verify-rollback-recovery"))
        return { status: 0, stdout: "predecessor_recovery_verified" };
      const reportPath = args.find((arg) => arg.startsWith("--report="))?.slice(9);
      if (!reportPath) throw new Error("report path required");
      writeFileSync(
        reportPath,
        JSON.stringify({
          phase: "post_promotion",
          expectedCommit: sha,
          expectedRevision: revision,
          verdict: rollback ? "failed" : "passed",
          observation: {
            decision: rollback ? "rollback_required" : "passed",
            elapsedMs: 300_000,
            rollbackRevision: predecessor,
          },
          ...reportOverride,
        }),
      );
      return { status: rollback ? 1 : 0, stdout: "" };
    }
    throw new Error(`Unexpected isolated command: ${bin}`);
  });
  const ensureAuth = vi.fn(async () => ({ exitCode: authExitCode }));
  const driver = createDriver({
    source: root,
    stateRoot: root,
    checkpointPath,
    adminProfile: join(root, "admin"),
    editorProfile: join(root, "editor"),
    operatorEmail: "alerts@pmikcmetro.com",
    runCommand,
    ensureAuth,
    browserExecutable: () => "/isolated/browser",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ commit: sha, revision: serving, service }),
    }),
  });
  return { root, cp, driver, runCommand, checkpointPath, ensureAuth };
}

describe("release watcher command-path recovery", () => {
  it("passes only reviewed RentVine source settings into isolated assurance and refuses conflicts", async () => {
    const h = harness();
    const supplied = {
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENTVINE_API_KEY: "isolated-key",
      RENTVINE_API_SECRET: "isolated-secret",
    };
    writeFileSync(
      join(h.root, ".env.local"),
      Object.entries({
        ...supplied,
        GOOGLE_APPLICATION_CREDENTIALS: "/forbidden/key.json",
        DATA_CONTEXT: "demo",
      })
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    );
    expect(resolveWatcherSourceEnvironment(h.root, {})).toEqual(supplied);
    expect(() =>
      resolveWatcherSourceEnvironment(h.root, { RENTVINE_API_KEY: "other" }),
    ).toThrow(/disagree/);
    await h.driver.observe(h.cp);
    const call = h.runCommand.mock.calls.find(([, args]) =>
      args.some((arg) => arg.endsWith("observe-production-release.ts")),
    );
    expect(call[2].env).toMatchObject({
      ...supplied,
      DATA_CONTEXT: "live",
      ENVIRONMENT_KIND: "production",
    });
    expect(call[2].env.GOOGLE_APPLICATION_CREDENTIALS).not.toBe("/forbidden/key.json");
  });
  it("refuses partial independent provider configuration before constructing an assurance subprocess", () => {
    const h = harness();
    writeFileSync(
      join(h.root, ".env.local"),
      "RENTVINE_API_BASE_URL=https://pmikcmetro.rentvine.com/api/manager\n",
    );
    expect(() => resolveWatcherSourceEnvironment(h.root, {})).toThrow(/required/);
  });
  it("uses the explicit monitoring recipient independently of the authenticated principal", async () => {
    const h = harness();
    await h.driver.observe(h.cp);
    const [, args] = h.runCommand.mock.calls.find(([, args]) =>
      args.some((arg) => arg.endsWith("observe-production-release.ts")),
    );
    expect(args).toContain("--operator-email=alerts@pmikcmetro.com");
    expect(args).not.toContain("--operator-email=josiah@pmikcmetro.com");
  });
  it("reads only explicit monitoring configuration and rejects missing or conflicting recipients", () => {
    const h = harness();
    expect(() => resolveWatcherMonitoringConfig(h.root, {})).toThrow();
    writeFileSync(
      join(h.root, ".env.local"),
      "MONITORING_OPERATOR_EMAIL=alerts@pmikcmetro.com\nLOCAL_PRINCIPAL=forbidden@pmikcmetro.com\n",
    );
    expect(resolveWatcherMonitoringConfig(h.root, {}).operatorEmail).toBe(
      "alerts@pmikcmetro.com",
    );
    expect(() =>
      resolveWatcherMonitoringConfig(h.root, {
        MONITORING_OPERATOR_EMAIL: "different@pmikcmetro.com",
      }),
    ).toThrow(/disagree/);
    expect(() => createDriver({ operatorEmail: "personal@example.com" })).toThrow();
  });
  it("opens challenged browser profiles once, then waits for attended enrollment", async () => {
    const h = harness({ authExitCode: 2 });
    h.driver.hasExactReceipt = async () => false;
    const first = await h.driver.assurance(h.cp);
    const paused = { ...h.cp, ...first.patch, blocked: first.reason };
    await h.driver.assurance(paused);
    expect(h.ensureAuth).toHaveBeenCalledOnce();
    expect(h.ensureAuth.mock.calls[0][0].canary).toEqual([
      {
        label: "admin",
        profile: join(h.root, "admin"),
        email: "josiah@pmikcmetro.com",
        origin: "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app",
      },
      {
        label: "admin",
        profile: join(h.root, "admin"),
        email: "josiah@pmikcmetro.com",
        origin: h.cp.candidateOrigin,
      },
    ]);

    mkdirSync(join(h.root, "admin"));
    recordBrowserEnrollment(join(h.root, "admin"));
    await h.driver.assurance(paused);
    expect(h.ensureAuth).toHaveBeenCalledTimes(2);
  });
  it("reconciles an ambiguous deploy at its persisted revision without a second release", async () => {
    const h = harness();
    const suffix = "runittest-aabbccddeeff";
    const exact = {
      ...h.cp,
      phase: "deploy",
      suffix,
      revision: `${service}-${suffix}`,
      tag: `cand-${suffix}`,
    };
    let exists = false;
    h.runCommand.mockImplementation(async (bin, args) => {
      if (bin === "gcloud" && args.includes("services"))
        return {
          status: 0,
          stdout: JSON.stringify({
            status: {
              traffic: [
                { revisionName: predecessor, percent: 100 },
                ...(exists
                  ? [
                      {
                        revisionName: exact.revision,
                        tag: exact.tag,
                        percent: 0,
                        url: "https://candidate.invalid",
                      },
                    ]
                  : []),
              ],
            },
          }),
        };
      if (bin === "gcloud" && args.includes("revisions"))
        return exists
          ? {
              status: 0,
              stdout: JSON.stringify({
                metadata: { name: exact.revision },
                spec: { containers: [{ env: [{ name: "APP_COMMIT_SHA", value: sha }] }] },
              }),
            }
          : { status: 1, stdout: "" };
      if (args.some((x) => x.endsWith("/release.mjs"))) {
        expect(parseReleaseArgs(args.slice(2)).errors).toEqual([]);
        expect(args).toContain(`--revision-suffix=${suffix}`);
        exists = true;
        return { status: 1, stdout: "" };
      }
      throw new Error("Unexpected isolated deploy command");
    });
    expect((await h.driver.deploy(exact)).verified).toBe(true);
    expect((await h.driver.deploy({ ...exact, inFlight: "deploy" })).verified).toBe(true);
    expect(
      h.runCommand.mock.calls.filter(([, args]) =>
        args.some((x) => x.endsWith("/release.mjs")),
      ),
    ).toHaveLength(1);
    exists = false;
    expect(await h.driver.deploy({ ...exact, inFlight: "deploy" })).toMatchObject({
      verified: false,
      reason: "deployment_outcome_unresolved",
    });
    expect(
      h.runCommand.mock.calls.filter(([, args]) =>
        args.some((x) => x.endsWith("/release.mjs")),
      ),
    ).toHaveLength(1);
  });
  it("dispatches promotion arguments accepted by the receipt-aware release entry point", async () => {
    const h = harness();
    h.runCommand.mockImplementation(async (bin, args) => {
      if (bin === "gcloud" && args.includes("services"))
        return {
          status: 0,
          stdout: JSON.stringify({
            status: { traffic: [{ revisionName: predecessor, percent: 100 }] },
          }),
        };
      expect(args.some((arg) => arg.endsWith("/release.mjs"))).toBe(true);
      expect(args).toContain("--promote");
      expect(parseReleaseArgs(args.slice(2)).errors).toEqual([]);
      expect(args.some((arg) => arg.startsWith("--editor-profile="))).toBe(false);
      return { status: 1, stdout: "" };
    });
    expect(
      await h.driver.promote({
        ...h.cp,
        baselineTraffic: [{ revision: predecessor, percent: 100 }],
      }),
    ).toMatchObject({ verified: false, reason: "promotion_outcome_unresolved" });
  });
  it("requires the observation report to identify the exact promoted commit", async () => {
    const h = harness({ reportOverride: { expectedCommit: "c".repeat(40) } });
    expect((await h.driver.observe(h.cp)).verified).toBe(false);
  });
  it("records rollback intent before dispatching traffic and retains recovery state", async () => {
    const h = harness({ rollback: true });
    let persisted;
    // Observe the durable checkpoint at the exact traffic dispatch boundary.
    h.runCommand.mockReset();
    h.runCommand.mockImplementation(async (bin, args) => {
      if (bin === "gcloud" && args.includes("update-traffic")) {
        persisted = JSON.parse(readFileSync(h.checkpointPath, "utf8"));
        return { status: 1, stdout: "" };
      }
      if (bin === "gcloud")
        return {
          status: 0,
          stdout: JSON.stringify({
            status: {
              traffic: [
                { revisionName: persisted ? predecessor : revision, percent: 100 },
              ],
            },
          }),
        };
      if (args.includes("--verify-rollback-recovery"))
        return { status: 0, stdout: "predecessor_recovery_verified" };
      const path = args.find((x) => x.startsWith("--report=")).slice(9);
      writeFileSync(
        path,
        JSON.stringify({
          phase: "post_promotion",
          expectedCommit: sha,
          expectedRevision: revision,
          verdict: "failed",
          observation: { decision: "rollback_required", rollbackRevision: predecessor },
        }),
      );
      return { status: 1, stdout: "" };
    });
    const result = await h.driver.observe(h.cp);
    expect(persisted).toMatchObject({
      sha,
      revision,
      rollback: { revision: predecessor },
    });
    expect(result.patch.terminalFailure).toBe(true);
  });
  it("reconciles a lost rollback response by reading traffic before running recovery", async () => {
    const h = harness({ rollback: true, rollbackReplyLost: true });
    expect(await h.driver.observe(h.cp)).toMatchObject({
      reason: "rolled_back_verified",
      patch: { terminalFailure: true },
    });
  });
  it("resumes rollback recovery after reboot without another observation or traffic mutation", async () => {
    const h = harness({ initialTraffic: predecessor });
    const cp = { ...h.cp, rollback: { revision: predecessor } };
    expect(await h.driver.observe(cp)).toMatchObject({ reason: "rolled_back_verified" });
    expect(
      h.runCommand.mock.calls.some(([, args]) =>
        args.some((x) => x.startsWith("--report=")),
      ),
    ).toBe(false);
    expect(
      h.runCommand.mock.calls.some(([, args]) => args.includes("update-traffic")),
    ).toBe(false);
  });
  it("refuses to overwrite an unrelated serving revision during rollback", async () => {
    const h = harness({ rollback: true, initialTraffic: `${service}-another-release` });
    expect(await h.driver.observe(h.cp)).toMatchObject({
      verified: false,
      reason: "rollback_traffic_changed",
    });
    expect(
      h.runCommand.mock.calls.some(([, args]) => args.includes("update-traffic")),
    ).toBe(false);
  });
});
