<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ux-followup-2026-11 -->

# S259 - Walk the November 7 renewal journeys on the final candidate

> Status: execution launched, intake 129. Run this engineering litmus last, after intakes
> 121–128 are implemented. The [current evidence](../evidence/renewal-usability-litmus-2026-11-07.md)
> records the engineering verdicts. Staff verdict NOT RUN.

**Goal.**

Verify in the browser that staff can enter Renewals, understand and act on the right lease and
cycle, recognize the recorded result, and return to their work. Verify that the surrounding
collection, message, process, Admin and Help journeys support that outcome. Preserve the owner's
three one-path goals and the existing capabilities and effect boundaries that make the work safe.

**Current state / intended end state.**

The [November 6 S254 report](../evidence/renewal-one-path-litmus-2026-11-06.md) records the
original 71 checks, including the literal L55 count failure and conditional control gaps. The
[November 7 delivery](../evidence/renewal-one-path-delivery-2026-11-07.md) pins the starting
application at `ef81b8917209f4eec3f22097142b559f3cce875b`. The guarded November 7 replay
established specific starting behavior for view entry, stage stability, status discovery,
detail focus, reload and return. It preceded these changes. The intended result is one complete
final candidate run with observed browser transitions, readbacks, recoveries and preserved controls.

**Actors and entry conditions.**

The implementation runner runs S252's engineering walkthrough and repairs its findings. For
the final pass, use a fresh review context with the frozen expectations, the committed candidate
and this handoff. Use Editor for ordinary work, Admin for existing Admin-only tasks, and the
other existing synthetic roles or unauthenticated context for applicable reads and denials.
S252 owns the separate staff observation and verdict.

**What it is / how it functions.**

- **R-S259-1 - Freeze the expectation.** Record the baseline, exact candidate SHA, clean tree,
  fixture and guard versions, Central business date, actor, scope, entry, starting state and
  expected observations for each case before opening it. Compare changed journeys to the
  November 7 baseline where a difference matters. Use the historical S254 starting commit for
  its own comparison checks. Keep fixtures and counting methods equal within each comparison.
  Precompute target membership and independent expected counts from source fixtures and the
  settled rules. Any approved count change must name its rule and expected difference per group.
- **R-S259-2 - Work the rendered application.** Use the real served app and its controls.
  Starting conditions and fault injection may use the rehearsal controls. Choose, type, review,
  confirm or cancel through the browser as the actor. Observe the initial screen, decision,
  pending feedback, result, exact record and cycle, persistence after a fresh read, and the
  next action, return or retry. Use routes, emulator readback and stand-in logs to corroborate
  visible behavior and count effects. A rendered button, a screenshot, source inspection,
  an API success or a unit test alone cannot satisfy a journey.
- **R-S259-3 - Exercise variation and recovery.** Run the full standard Editor path at 1280
  by 800 with pointer. At 390 pixels wide, repeat key entry, status, review, detail and return
  transitions by touch emulation and keyboard as appropriate. Cover light and dark at both
  widths across the suite and include desktop keyboard and a narrow pointer pass. Sample
  wrapping, focus visibility and order, semantic names, contrast and announcements. Exercise
  applicable empty, pending, error, unavailable and disabled states, denied roles, stale
  revisions, cancel, repeated actions, reload, other tabs and safe return. Test at least one
  effective refusal at each changed effect boundary. State the actual role, viewport, theme and
  input mode per case. A viewport run supplies responsive evidence. Record physical device
  and assistive technology separately if actually observed.
- **R-S259-4 - Use one evidence contract.** Keep the [S254 handoff](renewal-one-path-adversary-litmus.md)
  and its original outcomes immutable as November 5 evidence. Version its November 7 candidate
  profile under R-S254-1. Carry forward its unchanged checks and map the affected checks to their
  new requirements and the journey cases below. Record each intentional expectation change and
  its authority before the run. Preserve the historical L55 No. The November 7 count check
  requires exact agreement against the independent current-rule counts, including the named
  voucher-only and retirement rules, and exposes any unexpected change. Carry the S252 action
  budgets, ledger and Help checks into the same run. Link their check evidence from the new rows.
- **R-S259-5 - Qualify the fixture and contain effects.** Use the November 5 mix and the smallest
  synthetic additions needed for missing states. Exercise through the existing guarded WSL
  rehearsal and loopback stand-ins. Assert the network guard is loaded on every rehearsal
  process and refuse to start without it. Start only one rehearsal or full gate at a time.
  Keep automatic rent comparison held in every automated run and check the request log after
  resets and at the end. Manual comparison tests use only the stand-in and the existing
  allowance path. Confirm synthetic mail, draft, schedule and source effects against their
  scoped receipts and stand-ins. When a seam is unavailable, prove the actual refusal or
  staff handoff and identify the separate unverified effect. Block outbound browser requests.
- **R-S259-6 - Preserve evidence and classify each result.** Use the existing shared S254/S245
  report format and validator with a separate S259 suite profile and the crosswalk to S254.
  Map PASS to Yes and FAIL to No in the validator's native rows. Each row and its material
  checkpoints record expected and observed results, role, entry, fixture, exact candidate,
  evidence reference, initial failure, repair and remaining gap when applicable. A Yes evidence
  cell starts with Browser outcome and the exact private run and case reference in backticks,
  followed by the observed result. Use
  UNVERIFIED only for a named missing observation and state what would resolve it. Mark
  synthetic provider, responsive, physical-device, assistive-technology and human evidence
  separately. Commit a sanitized evidence report. Keep raw traces, screenshots, logs and
  provider-shaped payloads in private local run state. Confirm cleanup of temporary worktrees,
  processes and fixture overrides. Only approved synthetic Help assets use the normal
  versioned S243 asset workflow.
- **R-S259-7 - Repair and rerun to the same bar.** Record the failing browser checkpoint before
  editing. Repair within the owning specification and rerun the affected case, adjacent
  handoffs, and preservation checks. Keep prior attempts tied to their original SHA. Before
  accepting, run the full matrix again on one exact committed candidate. Any failure, missing
  row, skipped reachable step, unverified engineering prerequisite or false success blocks
  acceptance. An external UNVERIFIED is reportable only with its exact gap and boundary.
  Preserve honest engineering acceptance separately from human/provider completion. Require
  green canonical verification and exact-head CI before authorized delivery.

**In scope / out of scope.**

Integrated qualification of intakes 121–128 and their S162, S250–S254 preservation boundaries.
The litmus owns the run, evidence, gate and repair loop. The owning product suites define
behavior. Production assurance and deployment use their existing separate runbook. Staff
observation, real provider proof, approvals and legal or signing decisions retain their own scope.

**Open questions & assumptions.**

The November 7 scope and sequencing are settled. A runner must qualify its actual fixture,
guard, browser and role setup at the start. Missing tools or a synthetic seam leave an exact
coverage gap. Physical device, real-provider and staff evidence retain independent verdicts.

**Cross-product impacts.**

The lease desk, Dashboard and My Work entries, Guided and Full, collections, Communications,
the Internal Processes directory and Spaces, Admin, Connections, and Help. Reuse
`scripts/run-renewal-one-path-rehearsal.sh`, `scripts/one-path-rehearsal-control.mjs`,
`scripts/run-help-rehearsal.sh`, and `lib/help/litmus.ts`. The final gate consumes existing
read-only canary and independent reconciliation coverage under S252.

**Authority and evidence map.**

| Input                                                        | Classification             | Use and limit                                                                      |
| ------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| AGENTS.md and the active intake registry                     | Authority                  | Roles, safety, release separation and the owner's settled behavior.                |
| S252 and S254                                                | Verification contracts     | Engineering budgets, ledger, versioned preservation checks and honest evidence.    |
| November 7 baseline and guarded replay                       | Observed starting behavior | Compare like for like. Prior reads and fixtures supply no candidate verdict.       |
| Exact candidate browser, readback and bounded fault controls | Candidate evidence         | Proves only the reached synthetic states and observed role, device and input mode. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S259-1** - The shared validator checks the S259 profile and coverage against the
  versioned S254 and S252 references. Removing a required case or leaving a verdict blank fails.
- **ARCH-S259-2** - A guarded exact-SHA browser driver and its readback correlate an actor's
  action with the observed record and effect. Missing guard, wrong commit or automatic lookup
  invalidates the run.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S259-1** - A reviewer can follow the full ordinary path and every batch intake's
  applicable journey through an actual result and return, across allowed roles and variants.
- **BEH-S259-2** - Broken navigation, stale data, refused actions, duplicated effects or
  hidden pending state produce a specific failure even when components and routes exist.
- **BEH-S259-3** - The final record shows precisely what passed, failed, was repaired or
  still needs external evidence and keeps human acceptance separate.

**Human litmus outcome.**

### Reach a recorded outcome and return to the same work

A staff member can explain where they are, what needs attention, what the action will do,
and how they know it worked. They can recover after an interruption and find related
information without losing the lease or list context. S252 supplies the staff session.

- Model verdict: PASS on `4b31d89b` in the synthetic engineering scope. See the current evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                     | Architecture outcome     | Behavior outcome       | Human litmus                                         | Verification                                                |
| ------------------------------- | ------------------------ | ---------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| R-S259-1 expectations           | ARCH-S259-1              | BEH-S259-3             | Reach a recorded outcome and return to the same work | AC-S259-1, case setup and counts.                           |
| R-S259-2 rendered journey       | ARCH-S259-2              | BEH-S259-1             | Reach a recorded outcome and return to the same work | AC-S259-2, action through reload and readback.              |
| R-S259-3 variation and recovery | ARCH-S259-2              | BEH-S259-2             | Reach a recorded outcome and return to the same work | AC-S259-3, role, viewport and failure coverage.             |
| R-S259-4 one evidence contract  | ARCH-S259-1              | BEH-S259-3             | Reach a recorded outcome and return to the same work | AC-S259-1 and AC-S259-4, preserve history and exact checks. |
| R-S259-5 containment            | ARCH-S259-2              | BEH-S259-2             | Reach a recorded outcome and return to the same work | AC-S259-5, guard and dispatch evidence.                     |
| R-S259-6 classification         | ARCH-S259-1              | BEH-S259-3             | Reach a recorded outcome and return to the same work | AC-S259-4, complete truthful report.                        |
| R-S259-7 repair and repeat      | ARCH-S259-1, ARCH-S259-2 | BEH-S259-2, BEH-S259-3 | Reach a recorded outcome and return to the same work | AC-S259-6, failed attempt then one full candidate.          |

**Preservation set.**

Preserve all settled November 5 and November 7 requirements, including the exact current-cycle
target rules, remaining controls and full historical inventory, saved views, collections, old
links, explicit reviews and confirmations, permissions, provider seams, all S252 budgets and
the unmodified S254 historical handoff and results. The accepted change to the selectable
Focus mode retains its useful capabilities and links under S258. Retain every verification
lane, independent reconciliation bound and the existing Help, copy and redaction contracts.

**Adversarial acceptance checks.**

- **AC-S259-1** - Validate all intake and preserved check references. A missing case,
  post-observation expectation or unexplained count change prevents acceptance.
- **AC-S259-2** - Follow the standard synthetic lease from a fresh desk through exact
  outreach, reply, decision, tenant work, documents, finish and persistent completion.
  Match the recorded result back to the desk. A control that opens but cannot finish
  the applicable action fails.
- **AC-S259-3** - Replay a changed control and handoff by keyboard and at narrow width,
  and exercise stale saves, repeat confirmation, missing data and denied roles. A lost
  draft, hidden destination, duplicate action or false success fails with its checkpoint.
- **AC-S259-4** - The report validator rejects incomplete or duplicate verdicts, a Yes
  without browser outcome evidence, a hidden failure, and unsupported human or real
  provider claims. The existing S254 and S245 reports still validate.
- **AC-S259-5** - Prove refusal without the guard, zero automatic comparison during
  automation, and exact scoped receipts or no effects after cancel/refusal. Confirm
  external requests were refused and inspect the refusal log for unexpected attempts.
- **AC-S259-6** - Preserve a failed run, repair its owning slice, then pass the affected
  journey and the whole candidate matrix on the final SHA. An earlier pass or a mixed
  collection of partial runs cannot qualify the final candidate.

**Forbidden actions / hard gates.**

Never open the production Renewals desk during the litmus, contact a real provider or mailbox,
create a customer send, draft, schedule, provider write, production record or billed lookup, or
trigger an automatic comparison in automation. Preserve review, exact authority, budgets,
guardrails, credentials, roles, security and registry keys. Do not push protected paths. Keep
customer values, raw screenshots, traces and private evidence out of Git. Never invent a human
verdict or client answer.

**Dependencies / sequencing.**

Build and verify intakes 121–128, including the Help gate and its assets. Run S252 engineering
coverage and the versioned S254 profile on the candidate. Then run all S259 journeys, which
can reference the same observed browser actions when the role, fixture and evidence match.
S259 is the final batch acceptance gate. S252's real staff session remains separate.

**Standalone delivery contract.**

The authoring artifact is runnable guidance. The later execution delivers one validated,
sanitized report in `docs/evidence/` under a new S259 report prefix, with exact source, full
coverage and a repair history. The driver and profile reuse the existing harness and report
mechanisms. No runtime feature comes from publishing this spec.

**Verification and delivery contract.**

1. Pin the fixtures, baseline, candidate and the test matrix. State expected results before
   observation. Run one guarded rehearsal at a time.
2. Run the handoff below, satisfy the S252 and S254 preservation gates, and validate the report.
3. Run focused tests and `bash scripts/verify.sh`. Prove exact-head CI through the repository's
   normal PR workflow before merging. Keep release admission and independent readback separate.
4. Record `ALL_GATES_GREEN` for the actual engineering scope, `BLOCKED` for an exact unresolved
   prerequisite, or `BUDGET_EXHAUSTED` only under an explicit budget. External evidence keeps its
   actual classification.

**Ordered prompt sequence.**

1. Materialize the crosswalk, fixture matrix, guard and shared report profile.
2. Observe the baseline where comparison matters and drive the candidate to actual outcomes.
3. Repair, rerun the whole final candidate, validate, and report the exact remaining holds.

**Deletion/merge recommendation.**

Keep S259 as the final acceptance contract while the November 7 batch is active. Preserve the
validated result and the separately scoped S252 and S254 records in Git history.

| Goal group                               | Checks     | Suites under test                  |
| ---------------------------------------- | ---------- | ---------------------------------- |
| Target discovery and scoped collections  | L01 to L03 | S246, S201, S256                   |
| Do the current work and return           | L04 to L07 | S247, S248, S258, S224, S249, S162 |
| Handle variants and finish               | L08 to L10 | S250, S251, S255, S253, S248       |
| Reach adjacent tasks and trust the guide | L11 to L13 | S256, S257, S242, S243, S252       |
| Preserve and qualify the whole batch     | L14        | S252, S254                         |

The [versioned November 7 profile](../renewal-usability-litmus-profile-2026-11-07.md) maps all 71
S254 checks to the final journeys and records the authorized expectation changes.

## Litmus handoff (paste-ready)

Use this runbook after implementation of intakes 121–128 on the final committed candidate.
It verifies suites S162, S201, S224, S242 to S243, S246 to S258. Use the starting commit
`ef81b8917209f4eec3f22097142b559f3cce875b` for November 7 comparisons. Freeze the matrix under
R-S259-1, then work the signed-in rendered app. Reuse the versioned S254 expectations and the
S252 ledger and action budgets. Each check below is an integrated journey group. Record each
material checkpoint and aggregate the group's verdict without hiding any failure or evidence gap.

- L01 As Editor, open the bare desk on a fixed Central date. Read the month and counts, scan the Working batch table, open every group, change month and switch to All leases and filters. Compare exact membership and reason counts to the independently computed fixture, including the voucher-only case, source status warning and fresh-read recovery. Open saved views explicitly, use an old filtered link and an empty result, then return to the original view, scope and position.
- L02 Open a prepared row in the same tab, return, and compare the same lease and cycle through a Dashboard month answer and an explicit My Work item. Verify counts and next action agree, a new bare entry has the normal month, and a restricted or missing entry gives a safe exit without exposing other records.
- L03 Create a named collection from a clean form and from an authorized result. Compare Choose leases with Match a period, including an explicitly chosen out-of-period lease. Review and save the exact difference, refresh statuses without changing membership, reopen as a second permitted actor, open it on the desk, and return. Exercise stale or lost saves, a revoked member, repeat confirmation, reload and cancel with the saved set intact unless a new change is confirmed.
- L04 Open the prepared lease in Guided. Check numbers and stored comparison, recommendation and audience. Inspect an applicable later step by keyboard, work an independent control with its own prerequisites, and return to the current step. Test missing inputs and narrow layout. Measure S252's original action and layout budgets with review and confirmation still present.
- L05 Read the header stage and open Record work for a real synthetic staff event. Cancel once, then complete its exact permitted record. Compare the saved evidence and resulting next step across lease, desk and Dashboard after a fresh read. Exercise a note, a conflict, a stale or refused save, and a successful correction. Check focus and usable text after failure.
- L06 Open each Full detail from Guided, verify the visible destination and keyboard focus, and return to the same step. Walk exact old Focus, step, section and Help links, plus a malformed or denied target. Interrupt a long supported text entry or incomplete financial field, then reload or switch views. Verify usable text and position, newer edits winning a delayed acknowledgment, and isolation across lease, cycle and tab.
- L07 In the lease and Communications, prepare the same owner or tenant message. Save an explicitly blank signature and return to the draft, compare exact reviewed content with Copy and the supported outgoing routes, and preserve required message-specific facts. Exercise absent and wrong-sender setup, missing recipient or required terms, an assisted message without unused rent, stale previews, a replacement draft, Schedule, Resume, a linked reply and a refused or ambiguous result. Use only local stand-ins and verify at most one authorized effect and exact readback. History and prior schedules retain their own authorization.
- L08 Work the standing-agreement and assisted variants through the applicable decisions. See why covered work moves to the tenant, try a different rent and review Pricing basis and scope. On the assisted lease, record program contact and test the renew, no answer and do-not-renew routes with the applicable rent path. Include the source-only voucher hint, the month-to-month review and a notice/move-out handoff. Compare the resulting status and next action with the desk.
- L09 Retire an actually inactive synthetic cycle with a reason after review. Exercise pending schedule or ambiguous dispatch refusal, cancel and stale version. Confirm it leaves the working batch, stays findable with counted reason and history, and remains the same in collections, lease and Dashboard. Restore it through exact review and verify the recalculated scope after reload. Confirm the next cycle and source status stay independent.
- L10 Finish the ordinary prepared lease after accepted synthetic send, linked reply and explicit decision. Exercise separate draft, schedule, failed delivery and ambiguity variants and see the correct current action. Review the tenant response, per-lease synthetic documents and actual evidence entries, source proposals and precise confirmations. Verify the S253 required and missing form inputs, approved sums, untouched fields and no cross-lease leakage. Reach explicit completion and verify it persists on reopen and on the desk. Treat a human signing handoff and provider receipt as separate evidence.
- L11 Start from Operations, a Dashboard scoped lease answer, an explicit task answer, and the Internal Processes directory. Follow the named renewal work, procedure and evidence destinations including an old route. Complete a representative applicable task or find the exact next handoff, then return to the original lease or work list. Verify a different actor's private or unauthorized data remains inaccessible.
- L12 As Admin, enter a named task and a named connection directly and via an old link. Read the displayed connection health and scope, exercise a real synthetic task and a stale, partial or failed read with retry, then return to the task index or originating lease. Check loading and focus at narrow width. As Editor or signed-out actor, use the same protected entry and verify the refusal and absence of a write.
- L13 Find the appropriate Help guide, follow its real controls through a representative kickoff and recovery, then return with context. Check legacy Help links, matching pictures and the print path. Prove normal required verification detects rendered control drift and material stale scenes, offers reviewable synthetic replacement evidence, and succeeds after the correct versioned recapture. Run injected drift in a disposable copy and preserve the final candidate. Preserve the S252 ledger, budgets and staff verdict.
- L14 Reconcile the results against the complete versioned S254 handoff and original control inventory, and verify the S252 and canonical gates. List before and after measures where required. Record the exact final SHA and carry forward prior failures and external gaps. Inspect the guard, comparison and effect logs, then verify cleanup. Only a complete final candidate with each reachable requirement passing can be accepted.
