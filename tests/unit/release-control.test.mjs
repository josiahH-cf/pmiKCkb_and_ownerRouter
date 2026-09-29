import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  admitReleasePermit,
  assertReleaseAdmission,
  assertReleaseCheckpoint,
  claimApplicationBuild,
  consumeReleasePermit,
  prepareReleasePermit,
  readReleasePermit,
  writeReleasePermit,
} from "../../scripts/release-control.mjs";

const sha = "a".repeat(40);
const now = Date.parse("2026-09-28T12:00:00Z");
const roots = [];
const root = () => {
  const path = mkdtempSync(join(tmpdir(), "release-control-"));
  roots.push(path);
  return path;
};
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
const ready = (permit) => ({
  verdict: "go",
  headSha: sha,
  watcherTargetSha: sha,
  batchSize: 13,
  runId: permit.runId,
  checkedAt: new Date(now).toISOString(),
  checks: [{ id: "complete", state: "ready" }],
});

describe("release admission interlock", () => {
  it("holds missing and malformed durable state without any provider work", () => {
    const stateRoot = root();
    expect(() => assertReleaseAdmission({ sha, stateRoot, nowMs: now })).toThrow(
      "release_held_permit_unavailable",
    );
    writeFileSync(join(stateRoot, "release-permit.json"), "{malformed");
    expect(() => readReleasePermit(stateRoot)).toThrow("release_held_permit_unavailable");
  });
  it("prepared state permits only read-only preflight, while held and consumed never admit effects", () => {
    const permit = prepareReleasePermit(sha, now);
    expect(() => assertReleaseAdmission({ sha, permit, nowMs: now })).toThrow(
      "release_held_not_admitted",
    );
    expect(assertReleaseAdmission({ sha, permit, nowMs: now, prepared: true })).toBe(
      permit,
    );
    for (const state of ["held", "consumed"])
      expect(() =>
        assertReleaseAdmission({
          sha,
          permit: { ...permit, state },
          nowMs: now,
          prepared: true,
        }),
      ).toThrow("release_held_not_admitted");
  });
  it("requires an exact fresh all-ready 13-feature preflight for this prepared run", () => {
    const permit = prepareReleasePermit(sha, now);
    const invalid = [
      { verdict: "owner_action" },
      { headSha: "b".repeat(40) },
      { watcherTargetSha: "b".repeat(40) },
      { batchSize: 12 },
      { batchSize: 14 },
      { runId: "different" },
      { checkedAt: new Date(now - 300001).toISOString() },
      { checkedAt: new Date(now + 1).toISOString() },
      { checks: [{ state: "owner" }] },
      { checks: [] },
    ];
    for (const change of invalid)
      expect(() =>
        admitReleasePermit(permit, { ...ready(permit), ...change }, now),
      ).toThrow("release_fresh_preflight_required");
  });
  it("binds one durable admission to SHA, run and expiry, then consumes it permanently", () => {
    const stateRoot = root();
    const prepared = prepareReleasePermit(sha, now);
    const admitted = writeReleasePermit(
      admitReleasePermit(prepared, ready(prepared), now),
      stateRoot,
    );
    expect(
      assertReleaseAdmission({ sha, runId: admitted.runId, stateRoot, nowMs: now }).state,
    ).toBe("admitted");
    expect(() =>
      assertReleaseAdmission({ sha: "b".repeat(40), stateRoot, nowMs: now }),
    ).toThrow("release_permit_target_mismatch");
    expect(() =>
      assertReleaseAdmission({ sha, runId: "other", stateRoot, nowMs: now }),
    ).toThrow("release_permit_target_mismatch");
    expect(() =>
      assertReleaseAdmission({ sha, stateRoot, nowMs: Date.parse(admitted.expiresAt) }),
    ).toThrow("release_permit_expired");
    consumeReleasePermit({ sha, runId: admitted.runId, stateRoot });
    expect(() => assertReleaseAdmission({ sha, stateRoot, nowMs: now })).toThrow(
      "release_held_not_admitted",
    );
    expect(() =>
      admitReleasePermit(readReleasePermit(stateRoot), ready(prepared), now),
    ).toThrow("release_held_not_admitted");
  });
  it("allows one application build only from the exact admitted in-flight checkpoint", async () => {
    const stateRoot = root();
    const at = Date.now();
    const prepared = prepareReleasePermit(sha, at);
    const admitted = writeReleasePermit(
      admitReleasePermit(
        prepared,
        { ...ready(prepared), checkedAt: new Date(at).toISOString() },
        at,
      ),
      stateRoot,
    );
    const revision = "pmi-kc-app-test-batch";
    const input = {
      sha,
      runId: admitted.runId,
      revision,
      stateRoot,
      assertLock: () => {},
    };
    const checkpoint = { ...input, phase: "deploy", inFlight: "deploy" };
    await expect(claimApplicationBuild(input)).rejects.toThrow(
      "exact_batch_checkpoint_required",
    );
    for (const change of [
      { runId: "other" },
      { sha: "b".repeat(40) },
      { revision: "pmi-kc-app-other" },
      { phase: "prepare" },
      { inFlight: null },
    ]) {
      writeFileSync(
        join(stateRoot, "checkpoint.json"),
        JSON.stringify({ ...checkpoint, ...change }),
      );
      await expect(claimApplicationBuild(input)).rejects.toThrow(
        "exact_batch_checkpoint_required",
      );
    }
    writeFileSync(join(stateRoot, "checkpoint.json"), JSON.stringify(checkpoint));
    const attempts = await Promise.allSettled([
      claimApplicationBuild(input),
      claimApplicationBuild(input),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    await expect(claimApplicationBuild(input)).rejects.toThrow();
  });
  it("refuses a valid admitted build before claim when no kernel descriptor was inherited", async () => {
    const stateRoot = root();
    await expect(
      claimApplicationBuild({ sha, runId: "run", revision: "revision", stateRoot }),
    ).rejects.toThrow("release_kernel_lock_required");
  });
  it("binds promotion to the exact in-flight run and candidate before any forward effect", () => {
    const stateRoot = root();
    const input = {
      sha,
      runId: "run",
      revision: "candidate",
      phases: ["promote"],
      stateRoot,
    };
    const checkpoint = {
      sha,
      runId: "run",
      revision: "candidate",
      phase: "promote",
      inFlight: "promote",
    };
    for (const change of [
      { runId: "other" },
      { sha: "b".repeat(40) },
      { revision: "other" },
      { phase: "deploy", inFlight: "deploy" },
      { inFlight: null },
    ]) {
      writeFileSync(
        join(stateRoot, "checkpoint.json"),
        JSON.stringify({ ...checkpoint, ...change }),
      );
      expect(() => assertReleaseCheckpoint(input)).toThrow(
        "exact_batch_checkpoint_required",
      );
    }
    writeFileSync(join(stateRoot, "checkpoint.json"), JSON.stringify(checkpoint));
    expect(assertReleaseCheckpoint(input)).toEqual(checkpoint);
  });
});
