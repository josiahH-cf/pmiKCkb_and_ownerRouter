<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S254 — One-path renewal adversary litmus (machine-run proof of the owner's goals)

> Status: AUTHORING READY — intake 120; implementation NOT STARTED. Specification only; it grants no execution, release or provider effect. Defines the fresh-session verification handoff an outside model runs unattended against the built S246–S253 batch, how its result is recorded, and the repair loop. The checks apply after those suites are built; nothing here claims they are.

**Goal.**

Before the one-path batch is accepted, a model with no memory of this project proves, from a
paste-ready brief and Yes/No checks, that the owner's goals were met and not only that the
specifications were followed: renewal targets are simple and accurate, a lease shows one next
step with nothing locked, the start of a renewal is done before staff arrive, nothing that
existed was lost, and the path holds from the desk to a recorded outcome. It records which checks
passed, failed, were repaired or could not be verified.

**Current state / intended end state.**

Verified at `6491c06f`, with the batch specifications at `546dce53`:

- The owner's November 5 direction names three outcomes and two limits. Outcomes: targets that
  are simple to get into and accurate about what is coming up and what has not been dealt with;
  on a lease, knowing exactly what to do next through one entry point and one route, without
  gating other behavior; and a start (numbers, rent comparison, owner message) that is mostly done
  for staff and obvious to continue, now and for later steps. Limits: no existing surface is
  degraded, and the whole process lines up end to end.
- Starting measurements: the default desk listed 38 rows for five working-month leases, ten of
  them closed; a kickoff took at least eleven deliberate actions across three browser tabs; and a
  sent owner message left the lease at "Owner outreach".
- S252 gives the implementation runner its own budgets, journey and ledger. That is the builder
  checking its own work. No independent check of the batch exists.
- The project already runs an outside-session litmus for the help hub (S245): `lib/help/litmus.ts`
  holds the report template and validator, `tests/unit/s245-help-litmus.test.ts` checks them, and
  the report is committed as `docs/evidence/help-hub-litmus-2026-11-04.md` with raw evidence kept
  outside Git. The validator is bound to the S245 specification path.
- The isolated rehearsal exists: `scripts/run-renewal-novdec-journey.sh` and
  `scripts/run-help-rehearsal.sh` serve a commit from a disposable worktree with a Firestore
  emulator, the synthetic RentVine transport in `tests/browser/renewal-novdec-journey-network.mjs`
  and every other outbound connection refused and logged. The renewal control map lists 70
  controls (`lib/help/content/renewal-control-map.json`).

Intended end state: a fresh session runs the handoff below without supervision, in the rehearsal,
on the starting commit and the candidate. Its console report is saved as
`docs/evidence/renewal-one-path-litmus-<date>.md` with raw screenshots and logs outside Git.
Failures are repaired inside S246–S253 scope and re-run. The batch is accepted only when no check
is No and every UNVERIFIED check names its evidence gap.

**Actors and entry conditions.**

- The runner is a fresh model session with the repository, the isolated rehearsal and the verify
  lanes available. It may run tests, serve the two commits in the rehearsal, create synthetic
  fixtures, temporary helpers and screenshots in a temporary location, and repair failures inside
  S246–S253 scope. It may not deploy, send, write to a provider, run a billed lookup, touch
  production data, enter a password or change a protected path.
- The owner or an engineer launches the run with the candidate commit once the suites it covers
  report `ALL_GATES_GREEN`. Nobody answers questions during the run.
- The human verdict stays separate: staff give it in the weekly session (S252).

**What it is / how it functions.**

- **R-S254-1 — The handoff is a repository artifact, derived from the goals.** The paste-ready
  brief and checks below are the deliverable. Each check states an outcome the owner asked for in
  observable terms, so a suite's own acceptance checks can pass while a litmus check is No. The
  handoff is regenerated when S246–S253 or an owner decision changes.
- **R-S254-2 — One fixture with the November 5 shape.** The rehearsal gains one named synthetic
  desk, "November 5 mix", of 38 leases: five active fixed-term leases ending in the working month,
  four that ended the month before with no recorded completion, twelve ending later, ten closed in
  RentVine, three whose RentVine end date is later than their recorded cycle, three
  month-to-month and one with a move-out notice. The five working-month leases are a prepared
  lease, a covered lease, an assisted lease, a missing-recipient lease and a replied lease, as the
  handoff describes them. Only the counts come from the November 5 observation; every value is
  synthetic. The source leases are plain data in the rehearsal's existing transport format, so the
  same fixture loads on the starting commit and on the candidate.
- **R-S254-3 — Before and after.** The desk checks and the kickoff check run on the starting commit
  `6491c06f` and on the candidate with the same fixture and the same counting rule, so the change
  is measured. On the starting commit the kickoff follows that commit's own in-app guides.
- **R-S254-4 — Unattended execution.** The runner works only in the rehearsal with its local
  roles and stand-ins, never asks a question mid-run, and turns a needed decision into a blocker
  row while it continues with the independent checks. When the owner's audit instruction forbids
  triggering automatic comparisons, use `--hold-automatic-comparison` on the rehearsal. It keeps
  the reviewed setting off after initial seeding and every reset. Report the automatic-start
  observation in L33 as UNVERIFIED with that boundary; the check itself remains unchanged.
- **R-S254-5 — Reporting.** For every check the runner reports Yes or No with concise observed
  evidence, or UNVERIFIED with the reason and what would resolve it. It separates initial
  failures, repairs, final observations and remaining blockers. The report is committed as
  evidence with no customer value and no raw screenshot, using the report template and validator
  shared with S245.
- **R-S254-6 — Repair loop.** The runner repairs observed failures inside S246–S253 scope and
  re-runs the affected checks and the preservation lanes. It never weakens a check, removes a
  review or confirmation to meet a count, disables a gate or invents a product decision.
- **R-S254-7 — Run by goal.** The checks are grouped by the owner's goals. A launch may name one
  group once its suites are built; that is a progress run. Acceptance needs one run that covers
  every check on one commit.

  | Goal group                                         | Checks     | Suites under test |
  | -------------------------------------------------- | ---------- | ----------------- |
  | Targets are simple and accurate                    | L01 to L11 | S246              |
  | One next step, nothing locked                      | L12 to L20 | S247              |
  | The start is prepared and evidence moves the lease | L21 to L45 | S248, S249        |
  | Variants keep one path                             | L46 to L52 | S250, S251        |
  | The whole path holds and nothing is lost           | L53 to L59 | S246 to S253      |
  | November 4 problems and the manual                 | L60 to L62 | S252              |
  | Forms follow the client's answers                  | L63 to L70 | S253              |
  | Cleanup                                            | L71        | This run          |

- **R-S254-8 — Acceptance.** The batch is accepted when the final report covers every check on one
  commit, has no No, every UNVERIFIED names an evidence gap outside the runner's control, and
  `bash scripts/verify.sh` is green on the final tree.
- **R-S254-9 — What a machine cannot prove stays unproven.** The report never claims that staff
  find the work easy, that a real message was delivered or answered, that a billed comparison ran,
  that a document was signed, that RentVine or the operating Sheet was updated, or that production
  data is accurate. Those belong to the weekly session and to real work.

**In scope / out of scope.**

In scope: the handoff text and its maintenance rule, the fixture and its shape check, the before
and after measurement, the execution environment, the report format, the repair loop and the
acceptance rule. Out of scope: human acceptance, production reads or writes, release execution,
new product behavior, verification of unrelated features, and any check not grounded in S246–S253
or the owner's decisions.

**Open questions & assumptions.**

- Assumption: S252's rehearsal provides a mail stand-in and a comparison stand-in. Where one is
  missing the runner adds a temporary synthetic one inside the rehearsal and says so, or reports
  the check UNVERIFIED with that reason.
- Assumption: the assistant can answer in the rehearsal. If it cannot, L10, the assistant part of
  L13 and L44 are UNVERIFIED with that reason and their source data is still compared.
- Assumption: the starting commit still builds in the rehearsal. If it does not, L11 and L24 are
  UNVERIFIED and the checks on the candidate still decide acceptance.
- The split of the sixteen active leases outside the working month (four carried over, twelve
  later) is the fixture's own choice, not a production count.
- No owner decision blocks this suite. It adds no product behavior.

**Cross-product impacts.**

Surfaces: the Renewals desk, the lease page in its three views, the Communications composer, the
Dashboard assistant, Help and the form preparation screens. Stores and providers: none touched
outside the rehearsal. Code: `lib/help/litmus.ts` and `tests/unit/s245-help-litmus.test.ts` are
generalized to serve two handoffs; the rehearsal gains the fixture. Documentation: one evidence
file per run.

**Authority and evidence map.**

| Input                                                      | Classification      | Use and limitation                                                        |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| The owner's November 5 direction and D-OP-1 to D-OP-9      | Authority           | The outcomes every check is derived from.                                 |
| S246 to S253 contracts and the client's November 5 answers | Authority           | Exact labels, counts and limits the checks name.                          |
| The candidate and starting commits in the rehearsal        | Verification target | The only environment the runner exercises; production is never contacted. |
| S245 and its delivered report and validator                | Existing pattern    | Fresh-session handoff, sanitized report in Git, raw evidence outside it.  |
| The November 5 read-only observation                       | Evidence            | Counts only, for the fixture's shape; no customer value.                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S254-1** — A test asserts that the handoff numbers its checks in order, that the goal
  group table covers every check exactly once, and that every suite from S246 to S253 is under
  test in at least one group. Fail-first: no handoff or table exists in code's view.
- **ARCH-S254-2** — One report template and validator serve both S245 and S254, with the fields
  check id, verdict, evidence, repair and blocker; a report missing a verdict for any check fails.
  Fail-first: the validator is bound to the S245 specification path.
- **ARCH-S254-3** — The "November 5 mix" fixture is one data file whose group counts are checked
  and which loads on the starting commit and the candidate. Fail-first: no such fixture exists.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S254-1** — A run on a tree where one outcome is broken, for example a closed lease back
  under "This batch", ends with that check No and, after repair, Yes; the evidence file records
  both states.
- **BEH-S254-2** — A run cannot be marked accepted while any check is No or any check is missing.
- **BEH-S254-3** — A run finishes with no human input: every check ends Yes, No or UNVERIFIED, and
  a needed decision is a blocker row, not a pause.

**Human litmus outcome.**

### Someone who was not here proves the renewal work got simpler

**If this was built correctly:** An outside reviewer with only the brief below opens the
rehearsal, works the renewals, and says for each of the owner's goals whether it holds, with
counts for before and after. The owner reads that report and knows what is proven and what still
needs a person.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                 | Architecture outcome | Behavior outcome | Human litmus                                                 | Deterministic evidence / falsification                                |
| --------------------------- | -------------------- | ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| R-S254-1 handoff artifact   | ARCH-S254-1          | BEH-S254-1       | Someone who was not here proves the renewal work got simpler | Ordered check ids; table covers each check once.                      |
| R-S254-2 fixture            | ARCH-S254-3          | BEH-S254-1       | Someone who was not here proves the renewal work got simpler | Group counts checked; loads on both commits.                          |
| R-S254-3 before and after   | ARCH-S254-3          | BEH-S254-1       | Someone who was not here proves the renewal work got simpler | Both counts in the report for L11 and L24.                            |
| R-S254-4 unattended         | ARCH-S254-2          | BEH-S254-3       | Someone who was not here proves the renewal work got simpler | Report complete with blocker rows and no pause.                       |
| R-S254-5 reporting          | ARCH-S254-2          | BEH-S254-2       | Someone who was not here proves the renewal work got simpler | Validator refuses an incomplete report.                               |
| R-S254-6 repair loop        | ARCH-S254-2          | BEH-S254-1       | Someone who was not here proves the renewal work got simpler | Initial failure and repaired state both recorded.                     |
| R-S254-7 run by goal        | ARCH-S254-1          | BEH-S254-2       | Someone who was not here proves the renewal work got simpler | A progress run is never recorded as accepted.                         |
| R-S254-8 acceptance         | ARCH-S254-2          | BEH-S254-2       | Someone who was not here proves the renewal work got simpler | Acceptance blocked by any No or missing check.                        |
| R-S254-9 unproven by design | ARCH-S254-2          | BEH-S254-3       | Someone who was not here proves the renewal work got simpler | Report carries the human verdict as NOT RUN and no live-effect claim. |

**Preservation set.**

The S252 journey and budgets, the help gates, the existing isolated journey, every
`bash scripts/verify.sh` lane, redaction and copy-voice, and the S245 handoff, its tests and its
committed reports. A run changes none of them except by a deliberate repair inside S246–S253
scope.

**Adversarial acceptance checks.**

- **AC-S254-1** — Removing a goal group's checks, leaving a check outside every group or dropping
  a suite from the table fails the coverage test (ARCH-S254-1).
- **AC-S254-2** — A report with one No, a missing check or only one goal group cannot be recorded
  as accepted, and the S245 reports still validate unchanged (ARCH-S254-2, BEH-S254-2).
- **AC-S254-3** — A count met by removing a review or a confirmation is reported No, because the
  check requires both to be shown (R-S254-6, BEH-S254-1).
- **AC-S254-4** — A fixture with different group counts, or with a value taken from production,
  fails its shape check (ARCH-S254-3).
- **AC-S254-5** — A run makes no provider call, production read or write, send, billed lookup or
  deployment; its temporary outputs are removed; and the report contains no customer value
  (R-S254-4, BEH-S254-3).

**Forbidden actions / hard gates.**

No production reads or writes, sends, billed lookups, deployments, key or role changes. No
weakened check or gate. No review or confirmation removed to meet a count. No raw screenshot or
customer value in Git. No human verdict inferred from the model's run. No password entered.

**Dependencies / sequencing.**

Consumes the built S246–S253 suites and the S252 rehearsal. Runs last in the bundle, after the
suites it covers report green, and again after any change to them. Enables acceptance of the
batch. The handoff, the fixture, the coverage test and the shared validator can be built first.

**Standalone delivery contract.**

- **Deliverable now:** the handoff below, the coverage test, the shared report template and
  validator, and the fixture with its shape check.
- **Consumes, but does not assume:** the built suites; without them the handoff is a
  pre-implementation artifact, a progress run covers only the built groups, and no acceptance is
  recorded.
- **Externally blocked effect:** none for the machine run. The human verdict waits on the weekly
  session.
- **Produces for downstream suites:** the evidence file and the batch acceptance signal.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Build the deliverables, then run the focused checks for every ARCH, BEH and AC row; keep
   preservation separate.
3. After S246–S253 report green at a named commit, paste the handoff into a fresh session with
   the repository and the rehearsal available, and let it execute, repair in scope and re-run.
4. Commit the sanitized report and keep raw evidence outside Git. Report `ALL_GATES_GREEN`,
   `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only on a named owner decision.

**Ordered prompt sequence.**

1. Confirm the suites under test are green at a named commit.
2. Run the handoff below in a fresh session and record the report.
3. Repair and re-run until accepted or blocked on a named owner decision.

**Deletion/merge recommendation.**

Keep while the renewal path keeps changing. Retire when the litmus is a standing release step
with its coverage test in code.

---

## Litmus handoff (paste-ready)

Verify the implementation of the PMI KC lease renewal one-path batch: suites S246 to S253 in the repository `josiahH-cf/pmiKCkb_and_ownerRouter`, whose specifications are under `docs/feature-suites/` and are listed in `docs/feature-suites/README.md` under "November 5 lease renewal one path". Verify the candidate commit named in the launch message against the starting commit `6491c06f3773e92c0bd811d4360371523e24d643`; if the checkout is not the named commit, say so before any check. PMI KC is the staff operations app a property manager's team uses to renew leases: a Renewals desk lists leases, and each lease has a page where staff check the numbers, compare market rent, ask the owner, offer the tenant, handle documents and finish up. The owner asked for three outcomes and set two limits. Outcomes: renewal targets are simple to get into and accurate about what is coming up and what has not been dealt with; on a lease the person knows exactly what to do next, through one entry point and one route, with nothing else locked; and the usual start of a renewal (numbers, rent comparison, owner message) is mostly done before staff arrive and obvious to continue, with later steps prepared the same way. Limits: no existing capability is removed, and the process lines up from the desk to a recorded outcome. These checks test those outcomes; a suite's own tests passing does not make a check Yes.

Terms: the working month is the next calendar month on the Central business date; Guided view is the default lease view, with a path strip of steps and one Now card for the current step; a deliberate action is a choice, an entry or a confirmation, and scrolling and optional edits are not counted. Use the synthetic "November 5 mix" desk this suite adds to the rehearsal: 38 leases, of which five active fixed-term leases end in the working month, four ended the month before with no recorded completion, twelve end later (one with voucher wording in its RentVine text), ten are closed in RentVine, three have a RentVine end date later than their recorded cycle, three are month-to-month and one has a move-out notice. The five working-month leases are the prepared lease (stored comparison, verified owner recipient, signature and approved template; one ordinary pet), the covered lease (an active pre-approved standing agreement on its portfolio; two ordinary pets), the assisted lease (Housing assistance set to Yes with a program name; an assistance animal), the missing-recipient lease (no verified owner recipient; five tenants) and the replied lease (owner message already sent from the app, with an owner reply observed).

Run everything in the isolated synthetic rehearsal (`scripts/run-renewal-novdec-journey.sh` with its browser harness, `scripts/run-help-rehearsal.sh --serve` for inspection, or the entry point S252 added), which serves a commit with a synthetic RentVine transport, a Firestore emulator and every other outbound connection refused and logged. Load the same fixture on the starting commit for the checks that name it. Sends, replies and comparisons use the rehearsal's stand-ins only. Never use production, a real provider or mailbox, a billed lookup or a password, and never deploy. Use the rehearsal's local Editor role unless a check names Approver or Admin. Use a 1280 by 800 window unless a check names another size. You may run tests and create synthetic data, temporary helpers and screenshots in a temporary directory; remove them when done and confirm it. Repair failures inside S246 to S253 scope, then re-run the affected checks and `bash scripts/verify.sh`; never weaken a check, remove a review or a confirmation to meet a count, disable a gate or invent a product decision. Do not stop to ask: report a needed decision as a blocker with the exact question and continue with the other checks. If the launch message names a subset of checks, run and report only those. Report in chat: for each check Yes or No with concise observed evidence, or UNVERIFIED with the reason and what would resolve it; separate initial failures, repairs, final observations and remaining blockers. Do not infer human acceptance. Whether staff find the work easy is decided in their weekly session, and live sends, signatures, billed lookups and production data are outside this run.

- L01 Opening Renewals with no action shows "This batch" for the working month, states that month and the count in words above the list, and lists exactly the five working-month leases under it.
- L02 The four leases that ended the month before with no recorded completion show first under "Carried over", oldest end date first.
- L03 None of the ten closed leases appears under "This batch" or "Carried over"; they are counted under "Not renewal targets" with their RentVine status name, the count opens their rows, and each of them still opens and can be worked.
- L04 The three leases whose RentVine end date is later than their recorded cycle appear under "Renewed in RentVine, confirm and close", each offering to record staff completion with that source evidence or to keep working, and none completes without a staff confirmation.
- L05 "Month-to-month reviews due" shows 3, "Non-renewals to hand off" shows 1 and "Coming up later" shows 12, and each count opens its rows.
- L06 The group counts add up to 38 and every lease is in exactly one group.
- L07 Each row under "This batch" shows the address and unit, the tenant names, the end date, one stage line saying who it waits on and since when, one next-step link and at most three tags, and shows no second status or action wording.
- L08 Choosing a row or its next-step link opens that lease in the same tab at its current step, and going back to Renewals restores the same month, group and scroll position.
- L09 With one lease's RentVine status made unreadable for the test, that lease stays listed with "RentVine status unavailable" and is not moved to an excluded group.
- L10 A Dashboard assistant answer about the working month's renewals names the same five leases and gives the excluded counts by reason.
- L11 The same fixture on the starting commit reproduces the starting problem: its default desk list includes closed leases among its rows. The report states how many rows each commit lists by default.
- L12 Each of the five working-month leases opens on Guided view with a path strip naming Check the numbers, Compare market rent, Ask the owner, Offer the tenant, Documents and signatures, Finish up and Complete (or that lease's stated variant) and one Now card with one primary action.
- L13 For each of those five leases, the stage and the next step read the same on its desk row, on its lease page and in an assistant answer about that lease, and the guided view names no second next step.
- L14 At 1280 by 800 the header, the path strip and the Now card's primary action are visible without scrolling on Check the numbers, Compare market rent, Ask the owner and Offer the tenant; at 390 wide the primary action is within two screen heights.
- L15 Any step chosen from the path strip can be worked while an earlier step is unfinished, and no control is disabled because of the suggested step.
- L16 The lease view control offers Guided view, Focus view and Full view; Guided view is selected on every open; Focus view and Full view show the same content and behave as they do on the starting commit; and the guided view's five section links each open Full view at that section.
- L17 Every path step is worked on its Now card: no step sends the person to another view or tab to act, apart from an outside handoff the person chooses (Gmail for a Gmail draft, Dotloop for signing, RentVine for a provider-owned fix).
- L18 After a reload in the middle of a step, the lease returns to the same view, step and scroll position with typed text kept.
- L19 A waiting step states who it waits on, since when, the last contact and what the app is watching, and offers to record what happened, send again or work a later step now.
- L20 "Set status by hand" and the Status log are available from the guided view, a hand-set status that differs from the derived stage shows both in one line, and "Add a note" is on the Now card.
- L21 On the prepared lease, Check the numbers states "Numbers agree" or the one difference to settle, using RentVine for rent and dates; an operating Sheet value appears only when it differs, and a blank Sheet row is not treated as a difference.
- L22 Opening the prepared lease shows, with no action, the stored comparison (range, comparables and its age), "Rent to recommend" prefilled with its basis in words, and the owner message preview.
- L23 On the prepared lease, the owner message is sent in at most three deliberate actions on one page with no other tab (open the lease, "Review and send", confirm), and the exact review and the confirmation are both shown.
- L24 Following the starting commit's own in-app renewal guides for the same kickoff on the same lease takes more deliberate actions than the candidate and more than one browser tab. The report states both counts.
- L25 Once that send is accepted by the rehearsal's mail stand-in, the lease reads "Waiting on owner response" on its page and its desk row with no further entry, and the record shows the message, time and sender it came from.
- L26 "This was not the renewal outreach" removes that derived record with a reason and returns the step to open.
- L27 Changing "Rent to recommend" or "Reason to include" updates the one message preview, and "Review and send", "Schedule", "Create Gmail draft instead", "Copy" and the Communications composer opened for that lease all show that same message.
- L28 After a Gmail draft is created and the message then changes, the card reads "The Gmail draft is older than this message" and offers "Replace the Gmail draft".
- L29 No owner message produced in the run contains the sentence "The working offer remains a staff decision", and a lease with no rent to recommend is asked for one on the Now card before Send.
- L30 The missing-recipient lease names the missing verified owner recipient on its desk row and on its Now card with the fix in place, and is not listed under "Ready for your review".
- L31 Under "This batch" the prepared lease lists first under "Ready for your review" with a count, leases missing an input follow with the input named, and waiting and finished leases follow those.
- L32 A stored comparison is reused: reaching the owner message needs no second comparison run.
- L33 Opening the batch starts preparation by itself for working-month leases with no stored comparison, requests at most one comparison per lease per cycle from the rehearsal's stand-in, and requests none for the assisted lease.
- L34 With the monthly allowance set as reached for the test, the remaining leases read "Comparison not run: monthly allowance reached" and offer the own-figures entry, and no further comparison is requested.
- L35 Turning the reviewed setting off stops the automatic start without a release, and "Prepare this batch" still runs the same preparation when chosen.
- L36 The replied lease reads "Owner replied {date}" with the reply shown and "Record the owner's decision" as its next step; recording the decision takes at most three deliberate actions and no outcome is preselected.
- L37 A send whose outcome is not confirmed leaves the step open and makes "Check whether the message went out" the next step.
- L38 A failed delivery reads "Delivery failed" and makes "Check the address and send again" the next step.
- L39 A scheduled first message reads "Owner message scheduled for {date}" and is not counted as outreach until it is accepted.
- L40 An unsent Gmail draft reads "Draft waiting in Gmail since {time}" and offers "I sent it from Gmail", which records the outreach as recorded by staff.
- L41 When staff recorded something different after the evidence time, the lease reads "Needs a check" with both facts shown, and neither replaces the other.
- L42 Once the owner's decision is recorded, Offer the tenant shows the tenant offer prepared from the working terms; once the terms are final, Finish up shows the RentVine and operating Sheet update previews; each send and each source update still asks for its own exact confirmation.
- L43 No stage change in the run creates a reminder, a deadline, a follow-up message or a schedule.
- L44 An AI rewording replaces the message body only when "Use this revision" is chosen, and a rejected result keeps the typed instruction, says what to change and leaves the message as it was.
- L45 A staff member with no signature sets one up on the Now card without leaving the lease, and a refused save names the fields that are missing.
- L46 On the covered lease, Ask the owner reads "Covered by {agreement}: no owner message needed", the path continues at Offer the tenant, "Rent to recommend" is the agreement's rule applied to the current rent with its basis shown, and the desk row carries the "Standing agreement" tag.
- L47 Typing a different rent on the covered lease keeps the typed rent and returns the lease to Ask the owner with the reason in words.
- L48 "Pricing basis" on the Now card lists "Owner decides each renewal" and each active agreement by name and rule, and choosing an agreement asks "This lease only" or "Every lease in this owner's portfolio" and saves on one action.
- L49 On the assisted lease the steps after Check the numbers are, in order, "Contact {program} about the renewal process", "Ask the owner whether to renew this tenant" (Renew, Do not renew or No answer yet, none preselected) and "Rent for this renewal" (Keep the current rent or Propose a change, none preselected), and the desk row carries the "Housing assistance" tag.
- L50 Choosing Keep the current rent shows the rent comparison and the owner's rent decision as "Not part of this lease's path", and choosing Propose a change brings in the prepared comparison, the recommendation and the owner's rent decision.
- L51 Recording Do not renew on the assisted lease moves it to the existing non-renewal handoff.
- L52 A lease with Housing assistance not set shows no housing assistance step, and the lease whose RentVine text mentions a voucher stays in its group and shows "RentVine mentions housing assistance. Set the field?" without changing anything.
- L53 The prepared lease can be taken from the desk to Complete on the guided path (numbers, comparison, owner message, owner decision, tenant offer, tenant response, documents, finish up), using the hand records the app offers where a provider step is closed, with exactly one next step named at every point and no visit to another page except a chosen outside handoff.
- L54 Every control in the starting commit's renewal control map (`lib/help/content/renewal-control-map.json`, 70 rows) is found by role and accessible name in Guided view, Focus view or Full view on the candidate, or is listed with its recorded new name; none is gone.
- L55 "All leases and filters" opens the existing table with the same views, columns, filters, sorts, window chip, per-reason counts and URL keys as the starting commit shows for the same fixture.
- L56 A saved view is offered as "Open my saved view" and is not applied by itself on the bare Renewals route, and a shared collection link opens the table filtered to that collection.
- L57 An older lease link that names a path step opens the guided view at that step, and an older link that names a section or a control opens Full view there.
- L58 Every send, schedule, Gmail draft creation and source update made in the run showed its exact review and asked for its own confirmation, and the rehearsal's refused-connection log shows no call to production, a provider or a mailbox.
- L59 The existing isolated renewal journey still passes on the candidate, and `bash scripts/verify.sh` passes on the final tree.
- L60 The S252 defect ledger lists the twenty problems staff met on November 4, each with a result, and no row marked closed is contradicted by what this run observed.
- L61 Following the rewritten renewal guides in Help on the rehearsal completes the kickoff using only controls the guides name, and each guide picture matches the live screen for layout, labels and control placement.
- L62 The staff walkthrough matrix exists with a row for each budget and each ledger row, and its human verdict reads NOT RUN unless a staff session was held.
- L63 With a processing fee of $50 published in the rehearsal by an Admin and a deposit recorded for the prepared lease's one pet, the lease shows the fee, the deposit and their exact sum before anything is prepared, and the synthetic pet agreement shows the deposit in the first amount blank and the total in the second.
- L64 The prepared synthetic pet agreement states the processing fee as the published amount both on the visible page and in its extracted text, "$150" appears in neither, and a file made to differ for the test is refused.
- L65 With no deposit recorded, with the covered lease's two ordinary pets, or with the assisted lease's assistance animal, no total is shown or printed and the lease names what is needed; nothing reads as zero, and no registration field or check for assistance animals exists.
- L66 An owner explanation of two paragraphs appears as two paragraphs inside the large box of the synthetic owner acknowledgment, a text too long is refused with how much it is over, and with none recorded the form reads "Needs the explanation for this lease" while the lease's other forms proceed.
- L67 "Lease executed on" is blank on every prepared owner acknowledgment in the run, and the form's notes say it is left blank until the business confirms which date belongs there.
- L68 The four footer boxes of the synthetic brokerage brochure are untouched after preparation, its notes say "Tenant initials: four boxes", and the missing-recipient lease with five tenants shows "More than four tenants: confirm how initials are collected".
- L69 Two synthetic forms that print different organization names still print them unchanged after preparation.
- L70 A rent, deposit, date, recipient or explanation entered on one lease in the run is suggested on no other lease, on no portfolio and in no policy.
- L71 Temporary fixtures, helpers and screenshots created for this verification are removed and the removal is confirmed, and the report contains no customer value and no raw screenshot.
