import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDriver,
  resolveWatcherMonitoringConfig,
  resolveWatcherSourceEnvironment,
  selectRecoveryTagBinding,
  childFailureCode,
  bootstrapReleaseCheckpoint,
} from "../../scripts/release-watcher.mjs";
import { recordBrowserEnrollment } from "../../scripts/auth/browser-enrollment.mjs";
import { parseReleaseArgs } from "../../scripts/release-candidate.mjs";
import {
  prepareReleasePermit,
  admitReleasePermit,
  writeReleasePermit,
  assertReleaseCheckpoint,
} from "../../scripts/release-control.mjs";
import { recoveryFixture } from "../helpers/release-recovery-fixture.mjs";
import { executeSafeRecovery } from "../../scripts/release-recovery.mjs";
import {
  buildCandidateAssuranceReceipt,
  writeReceipt,
} from "../../scripts/production-assurance-receipts.mjs";

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
  createCloudClient,
  serviceReadback,
  candidateAssured = false,
  assertLock,
  // S128 (F08): the captured predecessor's operating-Sheet write flag as read back from its revision.
  // Default "false" so existing rollback tests take the ordinary traffic-shift path unchanged.
  predecessorWritebackFlag = "false",
  redeployedWritebackFlag = "false",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "pmi-watcher-driver-"));
  roots.push(root);
  writeFileSync(
    join(root, ".env.local"),
    "RENTVINE_API_BASE_URL=https://pmikcmetro.rentvine.com/api/manager\nRENTVINE_API_KEY=isolated-key\nRENTVINE_API_SECRET=isolated-secret\n",
  );
  const checkpointPath = join(root, "checkpoint.json");
  let serving = initialTraffic ?? revision;
  const recovery = recoveryFixture(root, { prepared: true, serving });
  if (redeployedWritebackFlag !== "false")
    recovery.state.revisions.get(recovery.target).containers[0].env.push({
      name: "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED",
      value: redeployedWritebackFlag,
    });
  const prepared = prepareReleasePermit(sha, Date.now(), recovery.input.runId);
  writeReleasePermit(
    admitReleasePermit(prepared, {
      verdict: "go",
      headSha: sha,
      watcherTargetSha: sha,
      batchSize: 13,
      runId: prepared.runId,
      checkedAt: prepared.preparedAt,
      checks: [{ state: "ready" }],
    }),
    root,
  );
  const cp = {
    runId: prepared.runId,
    recoveryBaseline: recovery.reference,
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
  if (candidateAssured)
    writeReceipt(
      join(root, `candidate-${revision}.json`),
      buildCandidateAssuranceReceipt({
        browserPolicy: "owner-admin-2026-09-10",
        project: "pmi-kc-kb-prod",
        region: "us-central1",
        service,
        candidateOrigin: "https://cand-isolated---pmi-kc-app-isolated.a.run.app",
        canonicalOrigin: recovery.receipt.originalBaseline.canonicalOrigin,
        expectedCommit: sha,
        expectedRevision: revision,
        expectedConfigurationFingerprint: cp.fingerprint,
        predecessorRevision: predecessor,
        predecessorBaseline: recovery.receipt.originalBaseline,
        recoveryBaseline: recovery.reference,
        adminVerdict: "passed",
        editorVerdict: "not_run",
        reconciliationState: "matched",
        monitoringState: "ready",
      }),
    );
  let redeployedRevision = `${service}-rollback-redeploy`;
  const runCommand = vi.fn(async (bin, args) => {
    if (bin === "gcloud" && args.includes("describe") && args.includes("services"))
      return {
        status: 0,
        stdout: JSON.stringify(
          serviceReadback ?? {
            status: { traffic: [{ revisionName: serving, percent: 100 }] },
          },
        ),
      };
    // S128 (F08): revision runtime readback for the rollback write-flag guard.
    if (bin === "gcloud" && args.includes("describe") && args.includes("revisions")) {
      const name = args[args.indexOf("describe") + 1];
      const flag =
        name === predecessor ? predecessorWritebackFlag : redeployedWritebackFlag;
      return {
        status: 0,
        stdout: JSON.stringify({
          metadata: { name },
          spec: {
            containers: [
              {
                image: `us-docker.pkg.dev/pmi-kc-kb-prod/app/img@sha256:${"c".repeat(64)}`,
                env: [
                  { name: "APP_COMMIT_SHA", value: sha },
                  { name: "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", value: flag },
                ],
              },
            ],
          },
        }),
      };
    }
    // S128 (F08): the paused-rollback redeploy reuses the predecessor image with the flag pinned off.
    if (bin === "gcloud" && args.includes("deploy")) {
      serving = redeployedRevision;
      return { status: 0, stdout: "" };
    }
    if (bin === "gcloud" && args.includes("update-traffic")) {
      serving = predecessor;
      return { status: rollbackReplyLost ? 1 : 0, stdout: "" };
    }
    if (args.some((arg) => arg.endsWith("observe-production-release.ts"))) {
      if (args.includes("--execute-safe-recovery")) {
        if (rollbackReplyLost && !recovery.state.patches.length)
          recovery.state.fail = "after";
        else recovery.state.fail = null;
        try {
          await executeSafeRecovery(recovery.reference, {
            client: recovery.client,
            stateRoot: root,
            candidateRevision: revision,
            verifyRecovered: recovery.verifyRecovered,
            assertLock: () =>
              assertReleaseCheckpoint({
                sha,
                runId: prepared.runId,
                revision,
                phases: ["promote", "observe"],
                stateRoot: root,
              }),
            wait: async () => {},
          });
          return { status: 0, stdout: "safe_recovery_verified" };
        } catch {
          return { status: 1, stdout: "" };
        }
      }
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
    ...(createCloudClient ? { createCloudClient } : {}),
    assertLock: assertLock ?? (() => {}),
  });
  return { root, cp, driver, runCommand, checkpointPath, ensureAuth, recovery };
}

describe("release watcher command-path recovery", () => {
  it("the real driver factory refuses direct calls without a kernel lock before client or auth creation", async () => {
    const h = harness();
    const createCloudClient = vi.fn();
    const ensureAuth = vi.fn();
    const driver = createDriver({
      source: h.root,
      stateRoot: h.root,
      checkpointPath: h.checkpointPath,
      operatorEmail: "alerts@pmikcmetro.com",
      createCloudClient,
      ensureAuth,
    });
    expect(await driver.authorize(h.cp)).toBe(false);
    await expect(driver.domains(h.cp)).rejects.toThrow("release_kernel_lock_required");
    await expect(driver.authenticate()).rejects.toThrow("release_kernel_lock_required");
    expect(createCloudClient).not.toHaveBeenCalled();
    expect(ensureAuth).not.toHaveBeenCalled();
  });
  it("refuses an admitted mutation and checkpoint write after losing kernel lock ownership", async () => {
    let held = true;
    const h = harness({
      assertLock: () => {
        if (!held) throw new Error("release_lock_lost");
      },
    });
    held = false;
    expect(await h.driver.authorize(h.cp)).toBe(false);
    await expect(h.driver.deploy(h.cp)).rejects.toThrow("release_lock_lost");
    await expect(h.driver.save(h.cp)).rejects.toThrow("release_lock_lost");
    expect(h.runCommand).not.toHaveBeenCalled();
  });
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
    const h = harness({ candidateAssured: true });
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
    ).toMatchObject({ verified: false, reason: "promotion_preflight_failed" });
  });
  it("requires the observation report to identify the exact promoted commit", async () => {
    const h = harness({ reportOverride: { expectedCommit: "c".repeat(40) } });
    expect((await h.driver.observe(h.cp)).verified).toBe(false);
  });
  it("records rollback intent before the shared receipt-bound recovery executor runs", async () => {
    const h = harness({ rollback: true });
    const result = await h.driver.observe(h.cp);
    expect(JSON.parse(readFileSync(h.checkpointPath, "utf8"))).toMatchObject({
      sha,
      revision,
      phase: "observe",
      inFlight: "observe",
      rollback: { revision: predecessor },
    });
    expect(result).toMatchObject({
      reason: "rolled_back_verified",
      patch: { terminalFailure: true },
    });
    expect(h.recovery.state.patches).toHaveLength(1);
    expect(
      h.runCommand.mock.calls.some(
        ([, args]) => args.includes("update-traffic") || args.includes("deploy"),
      ),
    ).toBe(false);
  });
  it("holds a lost rollback reply then verifies its same target without redispatch", async () => {
    const h = harness({ rollback: true, rollbackReplyLost: true });
    expect(await h.driver.observe(h.cp)).toMatchObject({
      reason: "rollback_recovery_unverified",
    });
    const checkpoint = JSON.parse(readFileSync(h.checkpointPath, "utf8"));
    expect(await h.driver.observe(checkpoint)).toMatchObject({
      reason: "rolled_back_verified",
      patch: { terminalFailure: true },
    });
    expect(h.recovery.state.patches).toHaveLength(1);
  });
  it("resumes terminal readback without a second observation, target or traffic mutation", async () => {
    const h = harness({ rollback: true });
    await h.driver.observe(h.cp);
    h.runCommand.mockClear();
    const checkpoint = { ...h.cp, rollback: { revision: predecessor } };
    expect(await h.driver.observe(checkpoint)).toMatchObject({
      reason: "rolled_back_verified",
    });
    expect(
      h.runCommand.mock.calls.some(([, args]) =>
        args.some((x) => x.startsWith("--report=")),
      ),
    ).toBe(false);
    expect(h.recovery.state.patches).toHaveLength(1);
  });
  it("refuses unrelated traffic, a changed pause and an unbound recovery receipt", async () => {
    const unrelated = harness({
      rollback: true,
      initialTraffic: `${service}-another-release`,
    });
    expect(await unrelated.driver.observe(unrelated.cp)).toMatchObject({
      reason: "rollback_recovery_unverified",
    });
    expect(unrelated.recovery.state.patches).toHaveLength(0);
    const unsafe = harness({ rollback: true, redeployedWritebackFlag: "true" });
    expect(await unsafe.driver.observe(unsafe.cp)).toMatchObject({
      reason: "rollback_recovery_unverified",
    });
    expect(unsafe.recovery.state.patches).toHaveLength(0);
    const missing = harness();
    await expect(
      missing.driver.recoverRollback({
        ...missing.cp,
        recoveryBaseline: undefined,
        rollback: { revision: predecessor },
      }),
    ).rejects.toThrow("recovery_receipt_invalid");
  });
});

describe("fresh replacement recovery bootstrap", () => {
  const canonical = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";
  const host = "cand-held---pmi-kc-app-kq6wuvpiva-uc.a.run.app";
  const config = () => ({
    authorizedDomains: ["localhost", new URL(canonical).hostname, host],
  });
  const serviceState = () => ({
    metadata: { name: service },
    status: {
      url: canonical,
      traffic: [
        { revisionName: predecessor, percent: 100 },
        { revisionName: revision, percent: 0, tag: "cand-held", url: `https://${host}` },
        {
          revisionName: "pmi-kc-app-old-recovery",
          percent: 0,
          tag: "cand-old",
          url: "https://cand-old---pmi-kc-app-kq6wuvpiva-uc.a.run.app",
        },
      ],
    },
  });
  const bound = () => selectRecoveryTagBinding(config(), serviceState());
  it("selects the actual unique authorized tag, keeping canonical predecessor separate", async () => {
    const cloud = { request: vi.fn(async () => ({ data: config() })) };
    const h = harness({
      serviceReadback: serviceState(),
      createCloudClient: async () => cloud,
    });
    expect(await h.driver.bootstrap(h.cp)).toEqual({
      supersededCandidateHost: host,
      supersededCandidateRevision: revision,
      predecessor,
      baselineTraffic: [{ revision: predecessor, percent: 100 }],
    });
    expect(cloud.request.mock.calls.every(([request]) => request.method === "GET")).toBe(
      true,
    );
    expect(h.runCommand.mock.calls).toHaveLength(1);
  });
  it.each([
    "none",
    "duplicate_domain",
    "foreign_domain",
    "no_canonical",
    "duplicate_tag",
    "duplicate_uri",
    "wrong_uri",
    "missing_revision",
    "latest_revision",
    "traffic_split",
    "wrong_service",
    "wrong_canonical",
  ])("refuses %s without a fallback host", (kind) => {
    const cfg = config(),
      svc = serviceState();
    if (kind === "none") cfg.authorizedDomains.pop();
    if (kind === "duplicate_domain") cfg.authorizedDomains.push(host);
    if (kind === "foreign_domain")
      cfg.authorizedDomains.push("cand-other---foreign.a.run.app");
    if (kind === "no_canonical") cfg.authorizedDomains.splice(1, 1);
    if (kind === "duplicate_tag")
      svc.status.traffic.push({ ...svc.status.traffic[1], url: "https://other.invalid" });
    if (kind === "duplicate_uri")
      svc.status.traffic.push({ ...svc.status.traffic[1], tag: "cand-other" });
    if (kind === "wrong_uri") svc.status.traffic[1].url = "https://foreign.invalid";
    if (kind === "missing_revision") delete svc.status.traffic[1].revisionName;
    if (kind === "latest_revision") svc.status.traffic[1].latestRevision = true;
    if (kind === "traffic_split") svc.status.traffic[0].percent = 99;
    if (kind === "wrong_service") svc.metadata.name = "other";
    if (kind === "wrong_canonical") svc.status.url = "https://other.invalid";
    expect(() => selectRecoveryTagBinding(cfg, svc)).toThrow();
  });
  it("refuses bootstrap read failure or persisted binding drift before preparation commands", async () => {
    const cloud = { request: vi.fn(async () => ({ data: config() })) };
    const h = harness({
      serviceReadback: serviceState(),
      createCloudClient: async () => cloud,
    });
    await expect(
      h.driver.prepare({ ...h.cp, ...bound(), supersededCandidateRevision: predecessor }),
    ).rejects.toThrow("recovery_bootstrap_binding_changed");
    expect(h.runCommand.mock.calls.every(([bin]) => bin === "gcloud")).toBe(true);
    cloud.request.mockRejectedValue(new Error("isolated_read_failure"));
    await expect(h.driver.bootstrap(h.cp)).rejects.toThrow("isolated_read_failure");
  });
  it.each([
    null,
    { phase: "complete", sha: "c".repeat(40), lastDeployedSha: "c".repeat(40) },
  ])(
    "keeps prior checkpoint %s unchanged on a failed read then publishes one complete retry",
    async (previous) => {
      const h = harness({
        serviceReadback: serviceState(),
        createCloudClient: async () => ({
          request: vi
            .fn()
            .mockRejectedValueOnce(new Error("isolated_read_failure"))
            .mockResolvedValue({ data: config() }),
        }),
      });
      // Retain one client so its read failure is transient, as it is in the real driver.
      if (previous) writeFileSync(h.checkpointPath, JSON.stringify(previous));
      const oldBytes = previous ? readFileSync(h.checkpointPath, "utf8") : null;
      const draft = { runId: h.cp.runId, sha: h.cp.sha, phase: "prepare" };
      await expect(bootstrapReleaseCheckpoint(draft, h.driver)).rejects.toThrow(
        "isolated_read_failure",
      );
      expect(
        previous
          ? readFileSync(h.checkpointPath, "utf8")
          : readdirSync(h.root).includes("checkpoint.json"),
      ).toBe(previous ? oldBytes : false);
      const result = await bootstrapReleaseCheckpoint(draft, h.driver);
      expect(result).toEqual({ ...draft, ...bound() });
      expect(JSON.parse(readFileSync(h.checkpointPath, "utf8"))).toEqual(result);
      expect(h.runCommand.mock.calls.every(([bin]) => bin === "gcloud")).toBe(true);
      expect(
        readdirSync(h.root).some((name) => name.startsWith("application-build-")),
      ).toBe(false);
    },
  );
  it("ensures the exact canonical and recovery origin sessions before the isolated recovery command", async () => {
    const h = harness();
    h.runCommand.mockResolvedValue({ status: 0, stdout: "" });
    const cp = { ...h.cp, ...bound(), phase: "recovery" };
    expect((await h.driver.recovery(cp)).verified).toBe(true);
    expect(h.ensureAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        need: ["canary"],
        unattended: true,
        canary: [canonical, `https://${host}`].map((origin) => ({
          origin,
          label: "admin",
          profile: join(h.root, "admin"),
          email: "josiah@pmikcmetro.com",
        })),
      }),
    );
    expect(h.ensureAuth.mock.invocationCallOrder[0]).toBeLessThan(
      h.runCommand.mock.invocationCallOrder[0],
    );
    expect(h.runCommand.mock.calls[0][1]).toContain(
      `--recovery-tag-previous-revision=${revision}`,
    );
    expect(h.runCommand.mock.calls[0][2].env).toMatchObject({
      RENTVINE_API_KEY: "isolated-key",
      ENVIRONMENT_KIND: "production",
      DATA_CONTEXT: "live",
    });
  });
  it("holds a challenged recovery origin without dispatch, and does not retry unchanged enrollment", async () => {
    const h = harness({ authExitCode: 1 });
    const cp = { ...h.cp, ...bound(), phase: "recovery" };
    const result = await h.driver.recovery(cp);
    expect(result.reason).toBe("managed_browser_enrollment_required");
    await h.driver.recovery({ ...cp, blocked: result.reason, ...result.patch });
    expect(h.ensureAuth).toHaveBeenCalledTimes(1);
    expect(h.runCommand).not.toHaveBeenCalled();
  });
  it.each([
    "recovery_preparation_assurance_failed",
    "candidate_assurance_gate_failed",
    "arbitrary_secret_value",
  ])(
    "persists only the allowlisted child failure classification %s",
    async (failureCode) => {
      const h = harness();
      h.runCommand.mockResolvedValue({
        status: 1,
        stdout: "PRIVATE_PROVIDER_BODY",
        stderr: "SECRET_TOKEN",
        failureCode,
      });
      await h.driver.recovery({ ...h.cp, ...bound(), phase: "recovery" });
      const path = readdirSync(h.root).find((name) => name.startsWith("child-failure-"));
      const bytes = readFileSync(join(h.root, path), "utf8");
      const report = JSON.parse(bytes);
      expect(report.code).toBe(
        failureCode === "arbitrary_secret_value"
          ? "unclassified_child_failure"
          : failureCode,
      );
      expect(bytes).not.toMatch(
        /PRIVATE_PROVIDER_BODY|SECRET_TOKEN|arbitrary_secret_value/,
      );
      expect(Object.keys(report).sort()).toEqual(
        [
          "schemaVersion",
          "runId",
          "sha",
          "phase",
          "script",
          "recordedAt",
          "status",
          "timedOut",
          "lockLost",
          "code",
        ].sort(),
      );
    },
  );
  it("never admits arbitrary underscore-only error strings into the failure classifier", () => {
    expect(
      childFailureCode("Production observation refused: sensitive_customer_value."),
    ).toBe("unclassified_child_failure");
    expect(
      childFailureCode("Production observation refused: predecessor_baseline_failed.\n"),
    ).toBe("predecessor_baseline_failed");
    expect(
      childFailureCode(
        "Production observation refused: candidate_assurance_deadline_exceeded.",
      ),
    ).toBe("candidate_assurance_deadline_exceeded");
    for (const code of [
      "recovery_service_controls_changed",
      "recovery_build_provenance_unverified",
    ]) {
      expect(childFailureCode(`Production observation refused: ${code}.`)).toBe(code);
    }
  });
});

// An owner re-enrollment while the watcher is mid-release replaces the refresh token behind the
// process-lifetime Identity Platform client. The domains phase must recover with a fresh client
// instead of failing every pass until the process is restarted (seen 2026-09-16, S114 attempt 3).
describe("release watcher identity client lifecycle", () => {
  const superseded = "cand-stale---pmi-kc-app-kq6wuvpiva-uc.a.run.app";
  const nextHost = "cand-isolated---pmi-kc-app-kq6wuvpiva-uc.a.run.app";
  const domainsCheckpoint = (cp) => ({
    ...cp,
    phase: "domains",
    supersededCandidateHost: superseded,
    candidateOrigin: `https://${nextHost}`,
  });
  it("recreates the cloud client once after a credential refresh failure and completes the domain swap", async () => {
    const staleClient = {
      request: vi.fn(async () => {
        const error = new Error("invalid_grant: reauth related error (invalid_rapt)");
        error.response = { status: 401 };
        throw error;
      }),
    };
    let authorizedDomains = ["localhost", superseded];
    const freshClient = {
      request: vi.fn(async ({ method, data }) => {
        if (method === "PATCH") authorizedDomains = data.authorizedDomains;
        return { data: { authorizedDomains: [...authorizedDomains] } };
      }),
    };
    const createCloudClient = vi
      .fn()
      .mockResolvedValueOnce(staleClient)
      .mockResolvedValueOnce(freshClient);
    const h = harness({ initialTraffic: predecessor, createCloudClient });
    const result = await h.driver.domains(domainsCheckpoint(h.cp));
    expect(result.verified).toBe(true);
    expect(createCloudClient).toHaveBeenCalledTimes(2);
    expect(staleClient.request).toHaveBeenCalledTimes(1);
    expect(authorizedDomains).toEqual(["localhost", nextHost]);
  });
  it("does not replace the client for a failure that is not a credential refresh", async () => {
    const client = {
      request: vi.fn(async () => {
        const error = new Error("identity platform unavailable");
        error.response = { status: 503 };
        throw error;
      }),
    };
    const createCloudClient = vi.fn(async () => client);
    const h = harness({ initialTraffic: predecessor, createCloudClient });
    await expect(h.driver.domains(domainsCheckpoint(h.cp))).rejects.toThrow(
      "identity platform unavailable",
    );
    expect(createCloudClient).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledTimes(1);
  });
});
