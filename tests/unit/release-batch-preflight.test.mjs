import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENROLLMENT_BUDGET_HOURS,
  evaluateBatchPreflight,
  parseAwaitingReleaseQueue,
  renderBatchPreflight,
  watcherTargetSha,
} from "../../scripts/release-batch-preflight.mjs";
import { evaluateRelease } from "../../scripts/release-watcher-plan.mjs";

const HEAD = "f45ecd58137a51f59937d0afaa57e8ed19853964";
const OLD = "0bbd95c3dbd8f4a93b4b185b8ba09770170d1ca4";
const NOW = "2026-09-20T16:00:00.000Z";
const LOOP_STATE = readFileSync(resolve(process.cwd(), "docs/loop-state.md"), "utf8");

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
  return {
    headSha: HEAD,
    treeClean: true,
    ci: ci(),
    checkpoint: null,
    changedPaths: ["lib/lease-renewal/meeting-walkthrough.ts"],
    foundationPresent: true,
    queue: parseAwaitingReleaseQueue(LOOP_STATE),
    envFlags: {
      ".env.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "false",
      ".env.production.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "false",
      ".env.local:ASK_DEMO_MODE": "false",
      ".env.production.local:ASK_DEMO_MODE": "false",
    },
    enrolledAtIso: "2026-09-20T15:00:00.000Z",
    nowIso: NOW,
    billingReEnabled: true,
    ...overrides,
  };
}

function checkOf(result, id) {
  return result.checks.find((row) => row.id === id);
}

describe("batched release preflight: the whole queue rides one candidate", () => {
  it("parses every queued feature from the live loop state", () => {
    const queue = parseAwaitingReleaseQueue(LOOP_STATE);
    expect(queue.length).toBeGreaterThanOrEqual(13);
    expect(queue[0]).toEqual({ position: 1, suite: "S128", approval: "F08" });
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
      /queued features ride this one candidate/,
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
    expect(result.verdict).toBe("owner_action_required");
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
  it("blocks a release that would carry the operating-Sheet write flag enabled", () => {
    const result = evaluateBatchPreflight(
      input({
        envFlags: {
          ".env.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "false",
          ".env.production.local:LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED": "true",
          ".env.local:ASK_DEMO_MODE": "false",
        },
      }),
    );
    expect(result.verdict).toBe("not_ready");
    expect(checkOf(result, "sheet_pause").state).toBe("blocked");
    expect(checkOf(result, "sheet_pause").detail).toMatch(/ENABLED/);
    expect(result.ownerActions.join(" ")).toMatch(
      /LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false/,
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

  it("never assumes billing is back and never assumes a fresh enrollment", () => {
    const unknown = evaluateBatchPreflight(input({ billingReEnabled: undefined }));
    expect(unknown.verdict).toBe("owner_action_required");
    expect(checkOf(unknown, "billing").state).toBe("owner_action");
    expect(checkOf(unknown, "billing").detail).toMatch(/runner never changes billing/);

    const stale = evaluateBatchPreflight(
      input({ enrolledAtIso: "2026-09-20T05:00:00.000Z" }),
    );
    expect(checkOf(stale, "auth_enrollment").state).toBe("owner_action");
    expect(checkOf(stale, "auth_enrollment").summary).toMatch(
      new RegExp(`past the ${ENROLLMENT_BUDGET_HOURS} h budget`),
    );
    expect(
      checkOf(evaluateBatchPreflight(input({ enrolledAtIso: null })), "auth_enrollment")
        .state,
    ).toBe("unknown");
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
});
