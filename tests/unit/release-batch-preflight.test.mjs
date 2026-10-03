import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateBatchPreflight,
  parseAwaitingReleaseQueue,
  renderBatchPreflight,
  watcherTargetSha,
} from "../../scripts/release-batch-preflight.mjs";
import { evaluateRelease } from "../../scripts/release-watcher-plan.mjs";
import { prepareReleasePermit } from "../../scripts/release-control.mjs";

const HEAD = "f45ecd58137a51f59937d0afaa57e8ed19853964";
const OLD = "0bbd95c3dbd8f4a93b4b185b8ba09770170d1ca4";
const NOW = "2026-09-20T16:00:00.000Z";
// Historical admission fixture stays fixed after the actual batch queue is cleared.
const LOOP_STATE = `## Awaiting release (thirteen cumulative features)

1. S128 (F08) pause operating-Sheet writes: code \`31bc9072\`, docs \`0bbd95c3\`, CI 35342904192.
   Recovery preparation passed; the paused candidate still requires assurance and production promotion.
2. S123 (F02) retain unfinished renewals across date changes: \`aa062d8e\`, CI 35505452408.
3. S124 (F03) move-out detection and non-renewal outreach filtering: \`fc03ec55\` plus test fix \`3d4a9e23\`, CI 35508231675.
4. S134 (F14) color-coded lease status with matching sorting and filters: \`136826cc\`, CI 35508545796.
5. S122 (F01) all-lease visibility and explicit worklist views: \`39a7f929\`, CI 35509588537.
6. S125 (F04) thirty-day notice timing review with an explicit date basis: \`41d6e00c\`, CI 35511209348.
7. S126 (F06) consistent month/day/year date presentation: \`7f0ed865\`, CI 35512028503.
8. S127 (F07) clear blockers and exact next-action guidance: \`52286917\`, CI 35513295598.
9. S131 (F11) Rhino-policy conditional logic, ready for approved material upload: \`59ad9224\`, CI 35515037772.
10. S129 (F09) owner and tenant draft workflows, technical readiness for meeting validation: \`009c4414\`, CI 35516040981.
11. S130 (F10) seven-template intake and Dotloop prefill readiness: \`696147f9\`, CI 35517371018.
12. S132 (F12) end-to-end walkthrough preparation and meeting evidence: \`f74468a1\`, CI 35519202311.
13. S133 (F13) external maintenance-agent handoff assessment: \`75c06252\`, CI 35519982150.`;
const CURRENT_LOOP_STATE = readFileSync(
  resolve(process.cwd(), "docs/loop-state.md"),
  "utf8",
);

function ci(sha = HEAD) {
  return {
    headSha: sha,
    headBranch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
    databaseId: 99,
  };
}

function input(overrides = {}) {
  const permit = prepareReleasePermit(HEAD, Date.parse(NOW));
  const value = {
    headSha: HEAD,
    treeClean: true,
    ci: ci(),
    checkpoint: null,
    changedPaths: ["lib/lease-renewal/meeting-walkthrough.ts"],
    foundationPresent: true,
    queue: parseAwaitingReleaseQueue(LOOP_STATE),
    // S159: both env files stage the reviewed candidate value for the operating-Sheet switch.
    envFlags: {
      ".env.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "true",
      ".env.production.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "true",
      ".env.local:ASK_DEMO_MODE": "false",
      ".env.production.local:ASK_DEMO_MODE": "false",
    },
    nowIso: NOW,
    billingReEnabled: true,
    permit,
    prerequisite: {
      schemaVersion: "pmi-kc-release-prerequisites.v1",
      runId: permit.runId,
      sha: HEAD,
      checkedAt: NOW,
      checks: {
        auth_cli_adc: "ready",
        admin_browser: "ready",
        billing: "ready",
        cost_controls: "ready",
      },
    },
    remoteHeadSha: HEAD,
    nativeHeadSha: HEAD,
    sourceHeadSha: HEAD,
    queueAncestry: true,
    nativeTools: true,
    noWatcher: true,
    lockAvailable: true,
    ...overrides,
  };
  return { ...value, mirroredEnvFlags: value.envFlags, ...overrides };
}

function checkOf(result, id) {
  return result.checks.find((row) => row.id === id);
}

describe("batched release preflight: the whole queue rides one candidate", () => {
  it("refuses to admit a completed batch from a cleared queue", () => {
    const queue = parseAwaitingReleaseQueue("## Awaiting release\n\nNone.\n");
    expect(queue).toEqual([]);
    const result = evaluateBatchPreflight(input({ queue }));
    expect(result.verdict).toBe("not_ready");
    expect(result.batchSize).toBe(0);
  });

  it("keeps the current queue empty or uniquely ordered with commit provenance", () => {
    const queue = parseAwaitingReleaseQueue(CURRENT_LOOP_STATE);
    if (queue.length === 0) {
      expect(evaluateBatchPreflight(input({ queue })).verdict).toBe("not_ready");
      return;
    }
    expect(queue.map((entry) => entry.position)).toEqual(
      Array.from({ length: queue.length }, (_, index) => index + 1),
    );
    expect(new Set(queue.map((entry) => entry.suite)).size).toBe(queue.length);
    expect(queue.every((entry) => entry.commits.length > 0)).toBe(true);
  });

  it("parses all thirteen features from the historical admission fixture", () => {
    const queue = parseAwaitingReleaseQueue(LOOP_STATE);
    expect(queue.length).toBe(13);
    expect(queue[0]).toEqual({
      position: 1,
      suite: "S128",
      approval: "F08",
      commits: ["31bc9072", "0bbd95c3"],
    });
    expect(queue.map((row) => row.position)).toEqual(
      queue.map((_row, index) => index + 1),
    );
    expect(queue.map((row) => row.suite)).toContain("S133");
    expect(new Set(queue.map((row) => row.suite)).size).toBe(queue.length);
  });

  it("reports GO and names the batch size when nothing is outstanding", () => {
    const result = evaluateBatchPreflight(input());
    expect(result.verdict).toBe("go");
    expect(result.ownerActions).toEqual([]);
    expect(result.watcherTargetSha).toBe(HEAD);
    expect(result.batchSize).toBe(parseAwaitingReleaseQueue(LOOP_STATE).length);
    expect(checkOf(result, "batch_scope").summary).toMatch(
      /queued items ride this one candidate/,
    );
    expect(renderBatchPreflight(result)).toMatch(/Batched release preflight: GO/);
  });
});

describe("batched release preflight: the stale checkpoint that would split the batch", () => {
  const stale = {
    sha: OLD,
    phase: "prepare",
    blocked: "authentication_required",
    lastDeployedSha: "79493458f641b9710d8c43467e872aa9acf7948e",
  };

  it("mirrors the watcher's own target selection", () => {
    expect(watcherTargetSha(stale, HEAD)).toBe(OLD);
    expect(watcherTargetSha({ ...stale, phase: "complete" }, HEAD)).toBe(HEAD);
    expect(watcherTargetSha({ ...stale, terminalFailure: true }, HEAD)).toBe(HEAD);
    expect(watcherTargetSha(null, HEAD)).toBe(HEAD);
    // The watcher would treat that stale SHA as a releasable head, which is the whole risk.
    expect(
      evaluateRelease({
        sha: OLD,
        ci: ci(OLD),
        changedPaths: ["lib/x.ts"],
        checkpoint: stale,
        foundationPresent: true,
      }),
    ).toEqual({ state: "release", sha: OLD, phase: "prepare" });
  });

  it("refuses GO and names the archive step instead of shipping one old queue item", () => {
    const result = evaluateBatchPreflight(input({ checkpoint: stale }));
    expect(result.verdict).toBe("not_ready");
    expect(result.watcherTargetSha).toBe(OLD);
    const target = checkOf(result, "watcher_target");
    expect(target.state).toBe("owner_action");
    expect(target.summary).toMatch(/stale checkpoint pins the next pass to 0bbd95c3/);
    expect(target.detail).toMatch(/only the features it contains/);
    expect(result.ownerActions.join(" ")).toMatch(/Archive the unfinished checkpoint/);
  });

  it("clears once the checkpoint is complete or terminal at another head", () => {
    for (const checkpoint of [
      { ...stale, phase: "complete" },
      { ...stale, terminalFailure: true },
      null,
    ]) {
      const result = evaluateBatchPreflight(input({ checkpoint }));
      expect(checkOf(result, "watcher_target").state).toBe("ready");
      expect(result.watcherTargetSha).toBe(HEAD);
    }
  });
});

describe("batched release preflight: safety and owner inputs", () => {
  it("blocks a release whose operating-Sheet switch differs from the reviewed candidate value", () => {
    const result = evaluateBatchPreflight(
      input({
        envFlags: {
          ".env.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "true",
          ".env.production.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "false",
          ".env.local:ASK_DEMO_MODE": "false",
        },
      }),
    );
    expect(result.verdict).toBe("not_ready");
    expect(checkOf(result, "sheet_switch").state).toBe("blocked");
    expect(checkOf(result, "sheet_switch").detail).toMatch(/DIFFERS/);
    expect(result.ownerActions.join(" ")).toMatch(
      /LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=true/,
    );
  });

  it("blocks an unclean tree and a head without its own green push CI", () => {
    expect(
      checkOf(evaluateBatchPreflight(input({ treeClean: false })), "main_head").state,
    ).toBe("blocked");
    expect(
      checkOf(
        evaluateBatchPreflight(input({ ci: { ...ci(), conclusion: "failure" } })),
        "exact_sha_ci",
      ).state,
    ).toBe("blocked");
    const unread = evaluateBatchPreflight(input({ ci: undefined }));
    expect(checkOf(unread, "exact_sha_ci").state).toBe("owner_action");
    expect(unread.verdict).not.toBe("go");
    expect(unread.ownerActions.join(" ")).toMatch(
      /Confirm the exact-SHA CI run is green/,
    );
  });

  it("never assumes billing is back and uses fresh credential probes instead of enrollment age", () => {
    const unknown = evaluateBatchPreflight(input({ billingReEnabled: undefined }));
    expect(unknown.verdict).toBe("owner_action_required");
    expect(checkOf(unknown, "billing").state).toBe("owner_action");
    expect(checkOf(unknown, "billing").detail).toMatch(/runner never changes billing/);

    const oldEnrollment = evaluateBatchPreflight(
      input({ enrolledAtIso: "2026-09-19T00:00:00.000Z" }),
    );
    expect(oldEnrollment.verdict).toBe("go");
    expect(checkOf(oldEnrollment, "auth_enrollment")).toBeUndefined();
    const failedProbe = input();
    failedProbe.prerequisite.checks.auth_cli_adc = "blocked";
    expect(evaluateBatchPreflight(failedProbe).verdict).not.toBe("go");
  });

  it("prints every outstanding owner step and no secret value", () => {
    const rendered = renderBatchPreflight(
      evaluateBatchPreflight(
        input({
          billingReEnabled: undefined,
          checkpoint: { sha: OLD, phase: "prepare" },
        }),
      ),
    );
    expect(rendered).toMatch(/OWNER/);
    expect(rendered).toMatch(/Before you start:/);
    expect(rendered).toMatch(/Archive the unfinished checkpoint/);
    expect(rendered).toMatch(/re-enable billing/);
    // Built from parts so this negative assertion carries no literal secret shape itself.
    for (const shape of [
      "AIza",
      `${"-".repeat(5)}BEGIN`,
      ["client", "secret"].join("_"),
      "Bearer ",
    ])
      expect(rendered).not.toContain(shape);
  });
  it.each([
    { queue: [] },
    { queueAncestry: false },
    { remoteHeadSha: OLD },
    { nativeHeadSha: OLD },
    { sourceHeadSha: OLD },
    { permit: null },
    { prerequisite: null },
    { nativeTools: false },
    { noWatcher: false },
    { lockAvailable: false },
    { mirroredEnvFlags: {} },
  ])("refuses unknown or incomplete batch prerequisite %j", (change) => {
    expect(evaluateBatchPreflight(input(change)).verdict).not.toBe("go");
  });
  it("requires a nonempty, ordered, unique, ancestral queue and both env files at the exact reviewed value", () => {
    const ready = input();
    for (const queue of [
      ready.queue.slice(1),
      [...ready.queue, ready.queue[0]],
      ready.queue.map((row, i) => (i ? row : { ...row, position: 2 })),
      ready.queue.map((row, i) => (i ? row : { ...row, commits: [] })),
    ])
      expect(evaluateBatchPreflight(input({ queue })).verdict).not.toBe("go");
    for (const invalid of [undefined, "", "TRUE", " true ", "false"]) {
      const envFlags = {
        ...ready.envFlags,
        ".env.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": invalid,
      };
      expect(evaluateBatchPreflight(input({ envFlags })).verdict).not.toBe("go");
    }
  });
  it("accepts a future single explicitly queued suite without a historical F label", () => {
    const queue = parseAwaitingReleaseQueue(
      "## Awaiting release\n\n1. S135 governance-safe feature: commit `31bc9072`.\n",
    );
    expect(queue).toEqual([
      { position: 1, suite: "S135", approval: null, commits: ["31bc9072"] },
    ]);
    expect(evaluateBatchPreflight(input({ queue })).verdict).toBe("go");
  });
  it("accepts a numbered intake maintenance item only with exact commit provenance", () => {
    const queue = parseAwaitingReleaseQueue(
      "## Awaiting release\n\n1. 001 governance maintenance: commit `31bc9072`.\n",
    );
    expect(queue).toEqual([
      { position: 1, suite: "001", approval: null, commits: ["31bc9072"] },
    ]);
    expect(evaluateBatchPreflight(input({ queue })).verdict).toBe("go");
    expect(
      evaluateBatchPreflight(input({ queue: [{ ...queue[0], suite: "001-old" }] }))
        .verdict,
    ).not.toBe("go");
  });
});
