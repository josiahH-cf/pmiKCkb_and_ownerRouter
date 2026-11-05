<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S252 — One-path renewal walkthrough, action budgets, defect ledger and help update

> Status: AUTHORING READY — intake 118; implementation NOT STARTED. Specification only; it grants no execution, release or provider effect. It runs after the S246–S251 slices it measures and reuses the S238 method.

**Goal.**

Staff take real December and January leases from the desk to a recorded outcome on the one path,
inside stated action budgets, with every problem seen on November 4 closed or named, and with the
in-app manual describing exactly what they see.

**Current state / intended end state.**

Verified at `6491c06f`:

- The November 4, 2026 staff walkthrough was the first time renewal staff worked real leases
  through the app with the owner (Josiah Hunter) present. Its human verdict was never recorded as a
  suite result; S238's staff acceptance remains NOT RUN.
- The in-app guides describe today's journey: "Work a renewal from the desk to a recorded outcome"
  in twelve steps, "Compare rent and record market evidence" in seven, and the owner message guide
  in twelve (`lib/help/content/guides/lease-renewals.ts`,
  `lib/help/content/guides/communications.ts`). The control map holds seventy rows
  (`lib/help/content/renewal-control-map.json`) checked by
  `scripts/smoke-renewal-guide-controls-browser.mjs`.
- The isolated journey `tests/browser/renewal-novdec-journey-browser.mjs` walks thirty-four steps on
  synthetic data.
- Staff and the owner agreed on November 4 to a weekly session, the first on November 10, 2026, to
  take the same leases from owner decision to the next step.

Intended: one measured rehearsal journey on synthetic data, one recorded staff walkthrough on real
work, a closed defect ledger and a manual that matches the new screens.

**Actors and entry conditions.**

The implementation runner for the rehearsal journey, budgets, ledger and help. Renewal staff and
the owner for the walkthrough, on leases they are genuinely renewing. The slices under test are
deployed before the walkthrough; the rehearsal runs before release.

**What it is / how it functions.**

- **R-S252-1 — Action budgets.** The rehearsal journey measures deliberate staff actions (a choice,
  an entry or a confirmation; scrolling is counted separately) and fails outside these budgets:
  - opening Renewals shows the working batch with no action, and one action opens a lease;
  - kickoff for a prepared lease takes at most three actions (open, review and send, confirm) on
    one page, against a starting state of at least eleven actions across three tabs;
  - after a confirmed send the lease reads waiting on the owner with no further action;
  - recording the owner's decision from an observed reply takes at most three actions;
  - no path step needs another page, except the genuine outside handoffs staff choose: Gmail for a
    Gmail draft, Dotloop for signing, RentVine for a provider-owned fix;
  - the stage and the primary action are visible without scrolling at 1280 by 800.
- **R-S252-2 — Rehearsal journey.** One isolated synthetic journey walks desk batch, numbers,
  comparison, owner message, send evidence, owner reply, decision, tenant offer, standing agreement
  variant, housing assistance variant, renewed-in-source closure and reload continuity, with no
  provider call and no production record.
- **R-S252-3 — Defect ledger.** Every problem observed on November 4 has a row with its owning
  requirement and its verified result, or an explicit open reason:

  | Observed on November 4                                              | Owning requirement |
  | ------------------------------------------------------------------- | ------------------ |
  | Leases no longer active appeared in the December list               | R-S246-1, R-S246-4 |
  | A remembered tenant filter was still applied                        | R-S246-9           |
  | Choosing a tenant name filtered the desk instead of opening a lease | R-S246-8           |
  | Saving a shared collection led back without applying it             | R-S246-9           |
  | Leases opened in new tabs until several were open                   | R-S246-8, R-S247-9 |
  | The rent comparison could not be started from the default view      | R-S247-4, R-S249-2 |
  | A finished comparison had to be run again to reach the message      | R-S249-2           |
  | The Gmail draft did not carry the staff member's rent               | R-S249-7, R-S249-9 |
  | The owner message contained an internal sentence                    | R-S249-10          |
  | The AI rewording was not applied and did not say what to do         | R-S249-12          |
  | Save draft stalled until a business profile existed                 | R-S249-11          |
  | The profile form refused to save without saying which fields        | R-S249-11          |
  | The draft time shown was the compose time                           | R-S249-12          |
  | A draft was prepared in the tenant section instead of the owner's   | R-S247-4           |
  | The status control was hard to find                                 | R-S247-8, R-S248-1 |
  | A page reload lost the place                                        | R-S247-9           |
  | The page did not fit the screen                                     | R-S247-10          |
  | A lease under a standing agreement still asked for the owner        | R-S250-3, R-S250-5 |
  | There was nowhere to record housing assistance                      | R-S251-1           |
  | A sent owner message left the lease at Owner outreach               | R-S248-1           |

- **R-S252-4 — Outside this bundle, recorded.** Two assistant observations from the same session
  are recorded with their owners and are not fixed here: no sign of progress after a question
  (S171), and an answer that reused an earlier conversation's month (S199). The month answer's
  membership is covered by R-S246-10.
- **R-S252-5 — Staff walkthrough.** Staff work their real leases on the one path in the weekly
  session with the owner observing. Each budget and each ledger row gets a human observation of
  pass or fail with a one-line reason. A real send or update made in that session is real work and
  is never release proof.
- **R-S252-6 — The manual matches.** The renewal guides, screen references, glossary and control map
  are rewritten for the batch, the guided view and its Now card, with the Focus view and Full view
  pages kept current; screenshots are recaptured
  from the rehearsal; the help version increases; "What changed" names the change; and the help
  coverage, control, screenshot and content gates pass.
- **R-S252-7 — Assurance follows the screens.** The release canary landmarks and the reconciliation
  oracle are updated in the same change as the default view and status rules they read, and the
  read-only desk and lease smokes are updated deliberately, never loosened.
- **R-S252-8 — Evidence.** One evidence file records budgets measured, ledger results, journey step
  results, help gate results and the staff verdict or its exact NOT RUN value, with no customer
  value.
- **R-S252-9 — The first full case comes from the cases already chosen.** The staff meeting
  summary reports that two app-based and two regular properties were already selected for testing.
  The first case taken from kickoff to signed documents is reconciled against those four before
  any other is chosen. A private case sheet records, each as confirmed or missing: the property
  and unit, the lease end date, the packet type, the required signers, the fees, the elections and
  the disclosures. The sheet stays outside Git.
- **R-S252-10 — The approval handoff is recorded, not assumed.** Dan did not settle it on November 5. Before a packet is prepared for signature on the first case, the case sheet names who
  approves the exact rent, dates and charges, how that approval arrives and where it is recorded
  (S234), and who may approve or sign for the landlord. Until then the walkthrough covers every
  step before signature and records the approval step as waiting on that answer (holds packet U4).
  A name, a title or a general reply approves no particular terms.
- **R-S252-11 — Reported items are verified before they are scoped.** The same meeting summary was
  generated automatically. Each item it reports is checked against the app before it becomes a
  requirement, and one that cannot be reproduced stays recorded as reported with that result:

  | Reported in the meeting summary        | Check                                                                          | Covered by, once confirmed |
  | -------------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
  | Inactive properties in filters         | Seen read-only on November 5 for closed leases; confirm it is the same report  | R-S246-1, R-S246-4         |
  | Evicted tenants in filters             | Not yet seen; find which source field shows an eviction before changing a rule | R-S246-1, R-S246-4         |
  | Revised pricing not kept in a draft    | Seen on November 4                                                             | R-S249-7, R-S249-9         |
  | Revised recipients not kept in a draft | Not yet seen; reproduce on the rehearsal                                       | R-S249-7                   |
  | Housing assistance handling            | Recorded on November 4                                                         | S251                       |
  | Renewal screen usability               | Recorded on November 4                                                         | S247                       |
  | MKD selection                          | Recorded on November 4                                                         | R-S250-2, R-S250-3         |

  A rent, a date or a recipient used on a test property is never turned into a default for another
  lease, an owner portfolio or the company.

**In scope / out of scope.**

In scope: budgets, the rehearsal journey, the ledger, the staff walkthrough record, the first full
case sheet, the approval handoff record, the reported-item checks, help content
and screenshots, assurance landmark updates and the evidence file. Out of scope: new product
behavior, production test records, a customer send as proof, staff training delivery, and the two
assistant items recorded under R-S252-4.

**Open questions & assumptions.**

- No product decision blocks this suite; D-OP-1 to D-OP-9 were answered by the owner on November
  5, 2026. The weekly session also confirms with staff what "rent if needed" means for an assisted
  tenant (S251).
- Assumption: budgets count deliberate actions and exclude optional edits such as changing the
  suggested rent or adding a reason.
- Assumption: the weekly session is the human observation. When no session is held the verdict
  stays NOT RUN and the engineering slice is not held.
- Open, for Bailey and Dan: which of the four selected properties is the first full case, and its
  lease end date, packet type, signers, fees, elections and disclosures.
- Open, for Dan: who approves the exact rent, dates and charges, how that approval is received and
  recorded, and who may approve or sign for the landlord. Dan found the first-lease question
  unclear on November 5; it is asked again in plain terms with the four selected properties named
  privately.
- The questions for Bailey in S253 (starting text for the owner explanation, tenant initial boxes,
  agency selections) are taken to the same weekly session.

**Cross-product impacts.**

`lib/help/content/guides/lease-renewals.ts`, `lib/help/content/guides/communications.ts`,
`lib/help/content/screens/lease-renewals.ts`, `lib/help/content/renewal-control-map.json`,
`lib/help/content/scenes.json`, `scripts/capture-help-screenshots.mjs`,
`scripts/smoke-renewal-desk-browser.mjs`, `scripts/smoke-renewal-focus-browser.mjs`,
`scripts/smoke-renewal-guide-controls-browser.mjs`,
`tests/browser/renewal-novdec-journey-browser.mjs`, the release canary landmark contract, the
reconciliation oracle and the evidence directory.

**Authority and evidence map.**

| Input                                                             | Classification       | Use and limitation                                                                  |
| ----------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| `AGENTS.md` live-write proof policy and release contract          | Authority            | No production test record; no customer send as proof; gates are never loosened.     |
| S238, S242–S245 delivered methods                                 | Implementation truth | Isolated journey, staff walkthrough matrix, help gates and screenshot capture.      |
| November 4 staff walkthrough notes and November 5 owner direction | Intent evidence      | The observed problems and the weekly session; reported behavior, not root cause.    |
| Staff availability for the weekly session                         | External dependency  | Absent: human verdict NOT RUN; engineering evidence stands on its own scope.        |
| Dan's November 5 answers and the automatic staff meeting summary  | Intent evidence      | The first case and approval handoff stay open; summary items are reports to verify. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S252-1** — The rehearsal journey counts deliberate actions per budget from the driver's own
  step log and fails outside a budget. Fail-first: the kickoff budget fails on the starting source.
- **ARCH-S252-2** — The defect ledger is a checked data file: every row names an existing
  requirement id and carries a result, and the check fails on a missing or unknown id.
  Fail-first: no ledger exists.
- **ARCH-S252-3** — Help content and the control map are validated by the existing help gates
  against the new screens. Fail-first: the gates fail once the screens change and before the
  content is updated.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S252-1** — The rehearsal journey passes every budget in R-S252-1 on synthetic data with no
  provider call.
- **BEH-S252-2** — Every ledger row is closed with evidence or open with a reason; none is silent.
- **BEH-S252-3** — A staff member following the rewritten guide on the rehearsal completes kickoff
  using only controls the guide names, and each picture matches the screen.
- **BEH-S252-4** — The evidence file states the staff verdict or its exact NOT RUN value.

**Human litmus outcome.**

### Work this month's renewals with the manual open

**If this was built correctly:** In the weekly session a staff member opens Renewals, works three
real leases to their next step, and at no point asks where to click. The printed guide beside them
shows the same screens. Everything that went wrong on November 4 either no longer happens or is on
a short list with a reason.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                 | Architecture outcome | Behavior outcome | Human litmus                                    | Deterministic evidence / falsification                                                  |
| --------------------------- | -------------------- | ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| R-S252-1 action budgets     | ARCH-S252-1          | BEH-S252-1       | Work this month's renewals with the manual open | Journey step log counts per budget; starting source fails kickoff.                      |
| R-S252-2 rehearsal journey  | ARCH-S252-1          | BEH-S252-1       | Work this month's renewals with the manual open | Named journey steps with a zero provider-call network boundary.                         |
| R-S252-3 defect ledger      | ARCH-S252-2          | BEH-S252-2       | Work this month's renewals with the manual open | Ledger check: every row has a known requirement id and a result.                        |
| R-S252-4 outside, recorded  | ARCH-S252-2          | BEH-S252-2       | Work this month's renewals with the manual open | Two rows carry their owning suite and an open reason.                                   |
| R-S252-5 staff walkthrough  | ARCH-S252-2          | BEH-S252-4       | Work this month's renewals with the manual open | Walkthrough matrix with a human result per budget and row, or NOT RUN.                  |
| R-S252-6 the manual matches | ARCH-S252-3          | BEH-S252-3       | Work this month's renewals with the manual open | Help coverage, control, screenshot and content gates; guide-control smoke.              |
| R-S252-7 assurance follows  | ARCH-S252-3          | BEH-S252-1       | Work this month's renewals with the manual open | Canary landmark contract and oracle updated; release assurance unchanged in strictness. |
| R-S252-8 evidence           | ARCH-S252-2          | BEH-S252-4       | Work this month's renewals with the manual open | Evidence file present, complete and free of customer values.                            |
| R-S252-9 first full case    | ARCH-S252-2          | BEH-S252-4       | Work this month's renewals with the manual open | Evidence names the case as one of the four selected, or NOT RUN with the reason.        |
| R-S252-10 approval handoff  | ARCH-S252-2          | BEH-S252-4       | Work this month's renewals with the manual open | Approval step recorded with its answer, or as waiting on U4; never inferred.            |
| R-S252-11 reported items    | ARCH-S252-2          | BEH-S252-2       | Work this month's renewals with the manual open | Each reported row has a check result; no cross-lease default on the rehearsal.          |

**Preservation set.**

The S238 journey's existing steps, the help gates' rules, the screenshot rules (rehearsal captures,
no production values), the release gates and their thresholds, the control map's coverage of every
developed control, and the human verdict vocabulary.

**Adversarial acceptance checks.**

- **AC-S252-1** — The kickoff budget fails on the starting source and passes after S246–S249; no
  budget is met by removing a confirmation or a review (ARCH-S252-1, BEH-S252-1).
- **AC-S252-2** — Removing a ledger row, pointing it at an unknown requirement or leaving its
  result empty fails the ledger check (ARCH-S252-2, BEH-S252-2).
- **AC-S252-3** — A guide step that names a control absent from the screen, or a picture that does
  not match, fails the help gates (ARCH-S252-3, BEH-S252-3).
- **AC-S252-4** — The evidence file and every fixture contain no customer value, and no production
  record or customer send is created for proof (R-S252-5, R-S252-8).
- **AC-S252-5** — A reported row with no check result fails the ledger check; a rent, date or
  recipient entered on one rehearsal lease is suggested on no other lease, portfolio or policy;
  and the evidence never records an approval the case sheet does not name (R-S252-9, R-S252-10,
  R-S252-11, BEH-S252-2, BEH-S252-4).

**Forbidden actions / hard gates.**

No production test record. No customer send, draft or provider write as proof. No loosened release
gate, canary bound or help rule. No fabricated human verdict. No customer value in evidence,
fixtures or screenshots. No test-property value as a default. No approval or signing authority
taken from a name or a title.

**Dependencies / sequencing.**

Consumes S246–S251 as delivered; a slice that is not delivered leaves its budget and ledger rows
open with that reason. Consumes S253 only when the first full case includes a pet agreement or an
owner acknowledgment. Reuses S238 and S242–S245. Runs last in the bundle and can run again after
each weekly session.

**Standalone delivery contract.**

- **Deliverable now:** the ledger file and its check, the budget counters in the journey driver and
  the walkthrough matrix template, each failing for the stated reason before S246–S251 land.
- **Consumes, but does not assume:** each of S246–S251 (absent: its rows stay open with the reason).
- **Externally blocked effect:** the staff verdict waits on a held weekly session; the matching
  check stays NOT RUN and nothing else waits. The first full case's signature step waits on the
  approval handoff answer (U4); every earlier step runs without it.
- **Produces for downstream suites:** measured budgets, the closed ledger and the updated manual.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify the delivered state of S246–S251 and the current help gates.
2. Materialize the budget counters, the ledger check and the walkthrough matrix; record fail-first
   results.
3. Extend the rehearsal journey, rewrite the guides and control map, and recapture screenshots.
4. Falsify, run focused and canonical tests, record the evidence file, and ship only when
   authorized; record the staff verdict after the weekly session.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests, the evidence file and current
facts, and the staff verdict is recorded.
