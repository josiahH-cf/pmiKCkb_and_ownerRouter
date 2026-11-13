// S284 R-S284-4 and AC-S284-4: the S252 pins the November 12 qualification reads as changed, each
// with the suite that changed it. The qualification driver (one-path-november-12-qualification-
// driver.mjs) passes this list to scoreQualification: an S252 check or budget outside its bound
// passes only when it is listed here, and the report lists every entry under "Changed pins".
//
// Each entry is { pin, suite }: pin is the S252 check or budget id exactly as
// tests/browser/one-path-journey-driver.mjs names it (journey.json), suite the suite whose
// requirement replaced that bound. A suite of this batch that changes an S252 bound adds its entry
// here, with the bound it replaced named in its spec; nothing else is ever listed to make a replay
// pass.
//
// Carried from the S271 qualification (docs/evidence/renewal-walkthrough-qualification-2026-11-10.md,
// "S252 owner-decision budget" and "S252 first screen on Check the numbers"):
//   journey.owner-decision  recording the owner's answer takes five deliberate actions against the
//                           bound of three, because S262 requires Outcome, Amount approved, the
//                           evidence, review and save. S262 governs.
//   journey.layout-steps    on Check the numbers the primary action sits below the 1280 by 800
//                           screen measured from the page top; S269 measures from the heading.
//                           S269 governs.
export const CHANGED_PINS = Object.freeze([
  Object.freeze({ pin: "journey.owner-decision", suite: "S262" }),
  Object.freeze({ pin: "journey.layout-steps", suite: "S269" }),
]);
