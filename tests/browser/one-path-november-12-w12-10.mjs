// S284 W12-10, "See what I need, where I landed": the candidate-side acceptance checks of S281
// (intake 159) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-work-area-facts-landings-and-narrow-screens.md (S281).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S281-1, AC-S281-2, AC-S281-3, AC-S281-4, AC-S281-5, AC-S281-6, AC-S281-7, AC-S281-8,
//   AC-S281-9, AC-S281-10
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Open Ask the owner at 1440 by 900 and 1280 by 800. Edit Rent to recommend in place. Open the
//   named groups. Open each review mode. Follow every fix link and return. Advance a lease and
//   read the address. Enter the dates on the Offer step. Open and close the composer. Repeat the
//   desk and one five-tenant lease at 360, 390 and 430 px.
//
// Starting sequence (journeyW1210 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the Communications composer from a lease, wait two seconds and close it. On the
//   baseline: One new draft communication.
//
// Note: The driver opens every page at 1280 by 800; set other sizes on the page
// (page.setViewportSize) or a new page.
//
// STATUS: stub. It records no acceptance check yet, so W12-10 scores UNVERIFIED (never Yes) until
// this file returns its checks. The contract is the qualification driver's "W12 CHECK CONTRACT"
// (one-path-november-12-qualification-driver.mjs); the function below states it in brief.

/**
 * W12-10 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1210 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S281-1 to AC-S281-10 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1210(ctx, page, start) {
  ctx.record({
    candidateChecks: "not written yet",
    startingSequence: start.error ? "stopped" : "completed",
  });
  return {};
}
