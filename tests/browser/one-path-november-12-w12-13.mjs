// S284 W12-13, "Ask once, record once": the candidate-side acceptance checks of S285 (intake 163)
// for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-owner-ask-rent-term-and-approver.md (S285).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S285-1, AC-S285-2, AC-S285-3, AC-S285-4, AC-S285-5
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   With the new owner wording unpublished, schedule an owner message and confirm it sends as
//   reviewed. Publish the wording as an approver and read the stated count and the held message.
//   Choose the 12 month end date. Read the owner review with the term, then remove a date and
//   read the hold. Deliver the sole owner's reply with the stand-in and record the answer with
//   the owner selected and the broader coverage. Read Documents. Repeat with two owners on one
//   address and with changed dates.
//
// Starting sequence (journeyW1213 in one-path-november-12-journeys.mjs, the fail-first table):
//   Save a renewal start with no end, read the owner review, deliver the sole owner's reply and
//   open the answer. On the baseline: No end date is offered, the message states no term, the
//   coverage opens on base rent only and no owner is selected.
//
// Note: S284 execution order: this row first proves that nothing is held while the new owner
// wording is unpublished, and an approver then publishes it through the existing control. Each
// row starts from the seeded state, so the wording is unpublished when this row starts.
//
// STATUS: stub. It records no acceptance check yet, so W12-13 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-13 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1213 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S285-1 to AC-S285-5 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1213(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
