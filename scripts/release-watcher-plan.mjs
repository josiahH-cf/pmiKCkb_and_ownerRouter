// Pure release decisions. The driver owns durable writes and bounded existing release commands.
export const RELEASE_PHASES = Object.freeze([
  "prepare",
  "deploy",
  "smoke",
  "fingerprint",
  "domains",
  "assurance",
  "promote",
  "observe",
  "complete",
]);

export function classifyReleaseChanges(paths) {
  return paths.some(
    (path) =>
      !/^(?:docs\/|AGENTS\.md$|CLAUDE\.md$|README\.md$|tests\/|\.claude\/)/.test(path),
  );
}

/** A challenged managed browser is retried only after attended enrollment changes its marker. */
export function browserEnrollmentChanged(checkpoint, enrollmentVersion) {
  return (
    checkpoint?.blocked !== "managed_browser_enrollment_required" ||
    checkpoint.browserEnrollmentVersion !== enrollmentVersion
  );
}

export function evaluateRelease({
  sha,
  ci,
  changedPaths,
  checkpoint,
  foundationPresent,
}) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? ""))
    return { state: "blocked", reason: "exact_main_sha_required" };
  if (!ci || ci.headSha !== sha || ci.headBranch !== "main" || ci.event !== "push") {
    return { state: "blocked", reason: "exact_sha_ci_required" };
  }
  if (ci.status !== "completed" || ci.conclusion !== "success")
    return { state: "blocked", reason: "ci_not_successful" };
  if (checkpoint?.sha === sha && checkpoint.terminalFailure)
    return { state: "blocked", reason: "rolled_back_verified" };
  if (checkpoint?.sha === sha && checkpoint.phase === "complete")
    return { state: "current" };
  if (
    checkpoint &&
    !checkpoint.terminalFailure &&
    checkpoint.phase !== "complete" &&
    checkpoint.sha !== sha
  )
    return { state: "resume", sha: checkpoint.sha, phase: checkpoint.phase };
  if (!classifyReleaseChanges(changedPaths)) return { state: "documentation_only" };
  if (!foundationPresent) return { state: "blocked", reason: "foundation_not_in_target" };
  return {
    state: "release",
    sha,
    phase:
      checkpoint?.sha === sha && !checkpoint.terminalFailure
        ? checkpoint.phase
        : "prepare",
  };
}

/** Never advance a phase on a command's optimistic text: each driver effect includes readback. */
export async function advanceRelease(checkpoint, driver) {
  if (!RELEASE_PHASES.includes(checkpoint.phase))
    throw new Error("unknown_release_phase");
  if (checkpoint.phase === "complete") return checkpoint;
  if (!(await driver.authenticate(checkpoint.phase)))
    return { ...checkpoint, blocked: "authentication_required" };
  const phase = checkpoint.phase;
  if (phase === "promote" && !(await driver.hasExactReceipt(checkpoint))) {
    return { ...checkpoint, blocked: "exact_candidate_receipt_required" };
  }
  // Persist intent before dispatch. On restart every effect is reconciled at the same exact target.
  await driver.save({ ...checkpoint, inFlight: phase, blocked: undefined });
  const evidence = await driver[phase](checkpoint);
  if (!evidence?.verified)
    return {
      ...checkpoint,
      ...evidence?.patch,
      inFlight: phase,
      blocked: evidence?.reason ?? `${phase}_unverified`,
    };
  const next = {
    ...checkpoint,
    ...evidence.patch,
    phase: RELEASE_PHASES[RELEASE_PHASES.indexOf(phase) + 1],
    inFlight: undefined,
    blocked: undefined,
  };
  await driver.save(next);
  return next;
}
