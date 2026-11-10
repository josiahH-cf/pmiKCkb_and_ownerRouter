# November 10 renewal walkthrough baseline

Source under test is `9b3bb69e2694d72c8312c4c8a5e42cb984f895aa`, the exact remote main at intake
on November 10 (22:05 UTC). The serving revision recorded in the router is
`pmi-kc-app-rmw9w581k-2489abae9071` at `0afd0206`; `9b3bb69e` adds only the November 9
documentation closure. The eleven transferred working-tree specifications and the November 10
registry section matched the authoring files byte for byte before any application change.
Earlier S254, S259 and S260 reports keep their original source, scope and verdicts.

## Case map before implementation

The acceptance identifiers come from
[S271](../feature-suites/renewal-november-10-walkthrough-qualification.md). Browser work uses the
existing loopback-only rehearsal with the November 5 mix. Consequential actions are read back from
the owning emulator record or synthetic adapter. Baseline observations stay in the private
rehearsal run directory. Fail-first expectations below are not results.

| Case   | Requirements                                     | Fail-first condition on the baseline                                                                          | Preservation to check on the candidate                                                                             |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| N10-01 | R-S261-1 through 4                               | No read-only recommendation with an exact edit link in Ask the owner; base and payment total share one label  | S153 base resolver and labels, S249 one recommendation owner, no lookup on open, exact saved draft and comparison  |
| N10-02 | R-S262-1 through 5                               | No Amount approved field; recommendation and approved base share one working value; no cycle binding on reads | S234 one outcome and coverage, S250 standing agreement, uncertain-send reconciliation, legacy coverage             |
| N10-03 | R-S263-1 through 4                               | No next-day choice and no Return to tenant offer route from a date fix                                        | Current lease versus working dates, S103 term review, existing date validation and executed-on hold                |
| N10-04 | R-S264-1 through 7                               | No Review offer charges in Work, no Admin offer charge mappings, family-only charge rows                      | S161 incomplete preparation, S189 one initial send and follow-up gate, S153 inventory, S253 fee boundary           |
| N10-05 | R-S265-1 through 4                               | Resource entries carry no tenant-audience evidence; a URL with a checkbox counts as usable                    | Blank entries, Admin ownership, conditional flyer inclusion, existing claims, receipts and reconciliation          |
| N10-06 | R-S271-3                                         | Not a code check. Human verdict starts NOT RUN.                                                               | Earlier meeting feedback and model checks stay separate from the observed verdict                                  |
| N10-07 | R-S269-1 through 4                               | Active inputs sit below a generic button and stacked ready facts                                              | Seven outcomes, five Full sections, one Work status, Full toggle, legacy links, both widths and themes             |
| N10-08 | R-S270-1 through 4, N09-10                       | Secondary Work groups open by default in Guided; S270 disclosure names absent                                 | Read-only Verification, one owner per control, exact review content, keyboard and focus                            |
| N10-09 | R-S266-1 through 3, R-S267-1 through 3           | No source readiness contract for a future program source; no trainee walkthrough in Help                      | S251 Not set, explicit No and program Yes, program-first ordering, existing roles and no implicit recipients       |
| N10-10 | R-S268-1 through 3, AC-S264-6 packet discrepancy | No Source pending handoff with form, missing evidence and responsible role in Documents and signatures        | Per-family readiness, protected signing regions, both closed Dotloop keys, returned-document evidence and handoffs |

The cross-surface cases in S271 are fail-first by construction on this source: it has no
current-cycle binding for future terms, no distinct charge rows through composition, no offer
snapshot bound to an owner or tenant answer, no material transition decision and no
included-resource proof at the draft, send or scheduled claim. Each slice adds its focused
fail-first tests before its product change and records the failing reason in its commit.

## Observed before implementation

The rendered probe is `tests/browser/one-path-november-10-baseline-driver.mjs`. It signs in
with the local demo roles, refuses every write and every off-origin request, and records
`november-10-baseline.json` in the rehearsal run directory. The results follow the first
completed run.
