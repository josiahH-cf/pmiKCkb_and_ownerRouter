// S284 W12-14, "One place to work a renewal": the candidate-side acceptance checks of S286
// (intake 164) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-spaces-guidance-without-runs.md (S286).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S286-1, AC-S286-2, AC-S286-3, AC-S286-4, AC-S286-5, AC-S286-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Open each renewal Space and its card. Request a run start for each renewal process. Open a
//   seeded earlier run and read My Work. Start a run on another Space.
//
// Starting sequence (journeyW1214 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the Owner Renewal Outreach Space and click Start run. Read the renewal Space cards. On
//   the baseline: "Could not start a run." and a card that reads "Needs a process".
//
// STATUS: stub. It records no acceptance check yet, so W12-14 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-14 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1214 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S286-1 to AC-S286-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1214(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
