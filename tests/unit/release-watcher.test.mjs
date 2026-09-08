import { describe, expect, it, vi } from "vitest";
import {
  advanceRelease,
  classifyReleaseChanges,
  evaluateRelease,
  browserEnrollmentChanged,
} from "../../scripts/release-watcher-plan.mjs";
const sha = "a".repeat(40);
const ready = {
  sha,
  ci: {
    headSha: sha,
    headBranch: "main",
    event: "push",
    status: "completed",
    conclusion: "success",
  },
  changedPaths: ["app/page.tsx"],
  foundationPresent: true,
};
describe("local watcher exact-SHA release gates", () => {
  it.each(["failure", "cancelled", "timed_out", null])("refuses %s CI", (conclusion) => {
    expect(evaluateRelease({ ...ready, ci: { ...ready.ci, conclusion } }).state).toBe(
      "blocked",
    );
  });
  it("refuses green CI belonging to another SHA or branch", () => {
    expect(
      evaluateRelease({ ...ready, ci: { ...ready.ci, headSha: "b".repeat(40) } }).state,
    ).toBe("blocked");
    expect(
      evaluateRelease({ ...ready, ci: { ...ready.ci, headBranch: "other" } }).state,
    ).toBe("blocked");
  });
  it("does not redeploy an already completed exact commit", () => {
    expect(
      evaluateRelease({ ...ready, checkpoint: { sha, phase: "complete" } }).state,
    ).toBe("current");
  });
  it("does not deploy documentation-only changes or a target without the server canary guard", () => {
    expect(evaluateRelease({ ...ready, changedPaths: ["docs/facts.md"] }).state).toBe(
      "documentation_only",
    );
    expect(evaluateRelease({ ...ready, foundationPresent: false }).reason).toBe(
      "foundation_not_in_target",
    );
    expect(classifyReleaseChanges(["public/brand/logo.svg"])).toBe(true);
  });
  it("resumes an unfinished exact revision before considering newer main", () => {
    expect(
      evaluateRelease({ ...ready, checkpoint: { sha: "b".repeat(40), phase: "smoke" } }),
    ).toEqual({ state: "resume", sha: "b".repeat(40), phase: "smoke" });
  });
  it("does not dispatch a phase when credentials are unavailable", async () => {
    const deploy = vi.fn();
    const save = vi.fn();
    const result = await advanceRelease(
      { sha, phase: "deploy" },
      { authenticate: async () => false, deploy, save },
    );
    expect(result.blocked).toBe("authentication_required");
    expect(deploy).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("does not repeatedly open challenged profiles without new human enrollment", () => {
    const cp = {
      blocked: "managed_browser_enrollment_required",
      browserEnrollmentVersion: "prior",
    };
    expect(browserEnrollmentChanged(cp, "prior")).toBe(false);
    expect(browserEnrollmentChanged(cp, "enrolled-again")).toBe(true);
    expect(browserEnrollmentChanged({}, "prior")).toBe(true);
  });
  it("never promotes without an exact candidate assurance receipt", async () => {
    const promote = vi.fn();
    const result = await advanceRelease(
      { sha, phase: "promote" },
      { authenticate: async () => true, hasExactReceipt: async () => false, promote },
    );
    expect(result.blocked).toBe("exact_candidate_receipt_required");
    expect(promote).not.toHaveBeenCalled();
  });
  it("keeps ambiguous deployment at the same phase for exact readback on restart", async () => {
    const saved = [];
    const checkpoint = { sha, phase: "deploy", revision: "isolated-exact-revision" };
    const result = await advanceRelease(checkpoint, {
      authenticate: async () => true,
      save: async (x) => saved.push(x),
      deploy: async () => ({ verified: false, reason: "deployment_ambiguous" }),
    });
    expect(saved[0]).toMatchObject({ ...checkpoint, inFlight: "deploy" });
    expect(result.phase).toBe("deploy");
    expect(result.inFlight).toBe("deploy");
    const deploy = vi.fn(async (same) => ({
      verified: same.revision === checkpoint.revision,
    }));
    const resumed = await advanceRelease(result, {
      authenticate: async () => true,
      save: async () => {},
      deploy,
    });
    expect(resumed.phase).toBe("smoke");
    expect(deploy).toHaveBeenCalledOnce();
  });
});
