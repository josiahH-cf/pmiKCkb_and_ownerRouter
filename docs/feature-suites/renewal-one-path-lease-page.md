<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S247 — Open a lease and work the current step

> Status: November 7 intake 121 revision AUTHORING READY. The original three-view delivery shipped at `ef81b891`. This revision owns the Guided journey. S248 owns status and recording. S258 owns access to Full, the Focus transition and continuity.

**Goal.**

A staff member opens the right lease, sees which step needs attention and works it in place.
They can inspect another step and return to the current one without losing the meaning of either.

**Current state / intended end state.**

On the November 7 guarded replay of `ef81b891`, a prepared lease opened in Guided from
the desk table and from a Dashboard answer, both showing "Now: Ask the owner". Selecting
"Offer the tenant" by keyboard moved focus to that step. The stage and next step still
described the owner's message. The tenant action then read "Review and send", the same
wording seen in the prepared owner's step after it loaded. The step heading and recipient
preview therefore matter to distinguish what is being reviewed.

The covered fixture continued to the tenant offer. The assisted fixture led to program
contact. A lease with notice led to the non-renewal handoff. A later source end date offered
"Confirm this renewal is finished". A synthetic source read with a missing status kept
the prepared lease in the working batch and named the unavailable status. A fresh read
restored the status after the refresh window. The prior independent run walked the later
steps through explicit staff completion. That run's conditions and unresolved provider controls
retain their recorded scope. The intended page keeps these useful paths and makes the
current action, its target and its outcome clear with short, state-specific context.

**Actors and entry conditions.**

Existing authorized Renewal staff enter from a scoped desk row, a Dashboard answer, a
linked My Work item, an existing lease URL or a permitted process handoff. A source or
supporting read failure leaves the available lease page intact and labels the affected
part with its available recovery. Every authorized lease remains workable under S154.
The existing lease and operation guards determine who can view or act.

**What it is / how it functions.**

- **R-S247-1 — One path definition.** Use one ordered path: Check the numbers, Compare
  market rent, Ask the owner, Offer the tenant, Documents and signatures, Finish up
  and Complete. Each applicable step declares its existing control and handler,
  prepared facts, staff decision, waiting state, completion evidence and next step.
  Display the lease and unit, current cycle or review basis, and applicable notice or
  source uncertainty near the top so staff can recognize the record before acting.
- **R-S247-2 — Make the applicable path clear.** Show standing agreement coverage
  under S250 and the owner step again when a different rent requires it. Housing
  assistance follows S251's program contact, owner decision and rent sequence. The
  existing month-to-month review policy supplies its review date, eligibility and
  applicable work. Recorded non-renewal or move-out routes to its handoff. A later
  RentVine end date offers the existing confirm-or-keep-working choice. Completed,
  retired, closed, pending and unreadable states keep their own reasons. S255 owns
  retirement. Label which steps apply, including an annual review whose next action
  is a comparison. A step outside this lease's path asks for no action.
- **R-S247-3 — Keep one current recommendation.** Consume the shared evidence-based
  stage and next step owned by S248. On normal entry show the current step. An
  explicit task or a deliberate inspection opens that step with the current next
  step still identifiable and "Show current step" available. While following the
  current step, staff see it move after its evidence changes. Staff inspecting another
  step stay there until they choose to return. Desk, Dashboard, lease and My Work
  use the same lease/cycle and applicable recommendation. Supplemental lifecycle and
  action statuses stay available in Full and the desk table.
- **R-S247-4 — Put the work in the Now card.** Use one main landmark and one named
  Now card. Keep the shown step's actual fields and action owners in the card, including
  working terms and assisted owner and rent choices. Reuse the shared controls and keep
  their usable input when changing views. Place one primary action after the heading and
  any consequential alert. State the specific missing input, decision or effect beside
  the control, including the audience for a shared "Review and send" label. Use one concise
  next-step cue and keep required supporting context close. The current action can
  carry the cue itself when it already states the next step. Keep genuinely secondary
  actions lower. The first four steps use existing numbers, stored comparison, pricing
  basis, prepared messages and exact review under S249 and S224. Later steps expose
  the existing document, signature evidence, source preview and follow-up controls.
  In-app path steps are operable in place. A deliberate external handoff states its
  destination, consequence and next action on return.
- **R-S247-5 — Explain waiting and recovery in place.** Read S248 evidence to distinguish
  waiting on a person, scheduled, draft, delivery failure, ambiguous attempt, held
  input and confirmed completion. Show who needs to act, since when, the last known
  contact and what the app is watching when applicable. Offer the existing exact retry,
  record, review or reconcile action for its state. Show legitimate independent later work while waiting.
  Preserve meaningful warnings about permission, source currency and blocked inputs.
- **R-S247-6 — Keep the path advisory.** Staff may open or work an applicable step in
  any order. Existing required facts, role, operation review and confirmation govern
  its action. Path selection alone changes presentation and grants no effect.
- **R-S247-10 — Fit and focus the work.** At 1280 by 800 the header, path strip and
  primary action fit without scrolling on the first four steps. At 390 pixels wide
  the primary action is within two viewport heights. Test both themes, long program
  names, wrapping and visible keyboard focus. All header controls stay visible as they
  wrap. Selecting a step announces and focuses its heading. A pending action retains
  usable feedback and a visible route to the current step.

**Journey coverage.**

Each row states what staff should be able to do and what a rehearsal must observe. The
current evidence labels distinguish browser replay, prior proof and work still to verify.

| Journey and entry                                                                         | Decision, action and visible result                                                                                                                                                                    | Preserve or disclose                                                                                                                            | Evidence and verification                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find a lease from the desk, a Dashboard answer, a My Work task or an allowed process link | Recognize the lease, cycle and current action. An explicit linked task opens its applicable step and shows how to return to current work.                                                              | Scope and exact lease identity, including saved collection and filtered desk entries. S258 owns the route and return.                           | Desk and Dashboard were replayed. The My Work task route and process handoff use current source contracts and require candidate coverage.                                                                                                           |
| Check the numbers and comparison                                                          | Distinguish current base rent, an actual Sheet discrepancy, working terms and the recommended rent. Reuse the stored comparison or follow the exact permitted missing-input path.                      | Source and date basis, approved allowance, existing own-figures and required review. Details stay in Full or on the exact source control.       | Prior J07 and current prepared fixture. Exercise stale, unavailable and incomplete reads without an automatic lookup in the verification browser.                                                                                                   |
| Review the owner or tenant message                                                        | See who will receive the shown message, the required fields and the action before exact review. A blocked action names the specific input.                                                             | Existing S224 and S249 readiness, exact confirmation and shared wording across routes. Keep secondary Schedule, Gmail draft and Copy reachable. | The current replay reached both audiences using a shared button label. Use prior J07–J11 and test an applicable missing recipient, saved blank signature and stale preview on the candidate.                                                        |
| Apply a standing agreement or program path                                                | Identify why the ordinary owner step is covered, or why program contact comes first. A changed rent exposes the applicable staff decision.                                                             | Existing agreement and assistance scope, choice, readback and the optional outreach tools.                                                      | Both paths were visible in the replay. J13–J14 supply earlier saved, invalid and recovery cases.                                                                                                                                                    |
| Work a non-renewal, annual review or source renewal                                       | Recognize the disposition and its basis before following the handoff, due review or explicit confirm-or-keep-working route.                                                                            | Actual provider status and date, existing notice and review rules, and recorded staff attribution.                                              | Move-out, month-to-month and changed-source examples were opened. In the working batch the unreadable target stayed visible and recovered on a fresh read. Test due and not-due cases, lease-side recovery, and the absence of inferred completion. |
| Finish after tenant work                                                                  | See the next required document or source action, its current input and result. Where a person signs outside the app, return to the same packet and record only actual evidence.                        | S253 approved form requirements, exact handoffs, versioned documents, signatures and receipts.                                                  | Prior J12 followed synthetic stages to staff completion. Real signing and provider effects are separate evidence.                                                                                                                                   |
| Wait, inspect another step or recover                                                     | Recognize the real hold and its next action. Keyboard-select a different step, then use "Show current step". After a failed read or refused action, retain the known state and a scoped retry or exit. | Already available control paths, source authority, role and honest status.                                                                      | Keyboard inspection and stage stability were replayed. Exercise offline/failed, partial, conflicting, empty and restricted cases on the candidate.                                                                                                  |

**In scope / out of scope.**

This suite owns orientation, the Guided path and the in-place next action. S248 owns
stage evidence and the header's recording interaction. S258 owns detailed work, view
choice, legacy routing and continuity. S246 and S256 own desk and process navigation
changes. Existing business decisions, permissions and effect owners supply the controls.

**Open questions & assumptions.**

Owner decisions D-OP-2 through D-OP-9 and the accepted November 7 direction are settled.
A shorter decision cue is an evidence-informed design choice. The staff walkthrough
tests whether newcomers can recognize the next action from the page. Fixture coverage
does not stand in for a human verdict or actual provider evidence.

**Cross-product impacts.**

`components/lease-renewal/RenewalWorkspace.tsx`,
`components/lease-renewal/RenewalGuidedView.tsx`,
`components/lease-renewal/RenewalManualWorkspace.tsx`, the shared lease-stage and desk
projection, My Work and Dashboard lease links, Help and the R-S252-7 read-only assurance
landmarks.

**Authority and evidence map.**

| Input                                                                                                                                     | Classification              | Use and limitation                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, D-RENEWAL-STAFF-OPERATIONS and F-S156                                                                                        | Authority                   | Work remains advisory and effect-specific.                                                            |
| November 7 replay of `ef81b891`                                                                                                           | Browser observation         | Direct entries, current and inspected steps, and the sampled variant labels.                          |
| [November 6 review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and [litmus](../evidence/renewal-one-path-litmus-2026-11-06.md) | Recorded synthetic evidence | J04–J05 and J07–J15 establish their named outcomes. L54's conditional gaps are still open.            |
| Accepted intake 121 and follow-up split                                                                                                   | Confirmed intent            | Keep one ordinary path and move evidence recording and view continuity into their own specifications. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S247-1** — One path definition consumes the shared stage and cycle. A conflicting
  input fixture still yields one recommendation on the lease, desk and assistant.
- **ARCH-S247-2** — The Now card owns the shown step's real controls and exact action
  context. Switching to another step changes the target without moving the recorded stage.
- **ARCH-S247-3** — Opening and inspecting are read/presentation paths. Admission remains
  in the underlying handler. Preserve zero navigation-created domain or provider effects.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S247-1** — A staff member can identify the lease, current step and one primary
  action on entry or understand why the current state needs no immediate action.
- **BEH-S247-2** — The correct controls and target are available for a different
  applicable step. The current recommendation stays visible.
- **BEH-S247-4** — Each variant and recovery state names its actual reason, action and
  applicable next step, with desk and assistant parity.

**Human litmus outcome.**

### Find and work the next lease step

**If this was built correctly:** A staff member opens a lease, can tell which record and
cycle they are working, sees who or what needs attention, and can explain what the main
action will do. On an assisted or non-renewal lease they can tell why the action differs.
They can inspect another step, work it if permitted, and return to the current step using
the page itself.

- Model verdict: November 7 revised requirements NOT RUN. The guarded replay is starting-state evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome       | Human litmus                      | Deterministic evidence / falsification                                                       |
| ----------------------------------- | -------------------- | ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| R-S247-1 path and identity          | ARCH-S247-1          | BEH-S247-1             | Find and work the next lease step | AC-S247-1. Resolve the seven steps and one scoped recommendation.                            |
| R-S247-2 variants                   | ARCH-S247-1          | BEH-S247-4             | Find and work the next lease step | AC-S247-5. Variant matrix includes actual due basis, disposition and the available controls. |
| R-S247-3 one current recommendation | ARCH-S247-1          | BEH-S247-4             | Find and work the next lease step | AC-S247-1 and AC-S247-3. Compare entry, inspection and return.                               |
| R-S247-4 work in Now                | ARCH-S247-2          | BEH-S247-1, BEH-S247-2 | Find and work the next lease step | AC-S247-2. Each path step has its actual control and named target in place.                  |
| R-S247-5 waiting and recovery       | ARCH-S247-2          | BEH-S247-4             | Find and work the next lease step | AC-S247-5. Exercise known, unavailable and unresolved states with precise next actions.      |
| R-S247-6 advisory path              | ARCH-S247-3          | BEH-S247-2             | Find and work the next lease step | AC-S247-3 and AC-S247-4. Check ordering, permissions and no effect on navigation.            |
| R-S247-10 viewport and focus        | ARCH-S247-2          | BEH-S247-1             | Find and work the next lease step | AC-S247-6. Verify the existing bounds at both sizes in both themes.                          |

**November 5 requirement references.**

These identifiers keep the delivered evidence and defect ledger resolvable. Each revised
behavior has one active owner.

| Delivered identifier | Active owner for intake 121                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **R-S247-7**         | [S258](renewal-lease-details-and-continuity.md) R-S258-1 and R-S258-2 for the view choice and control inventory. |
| **R-S247-8**         | [S248](renewal-evidence-driven-stage.md) R-S248-13 and R-S248-14 for header recording, log and feedback.         |
| **R-S247-9**         | S258 R-S258-4 and R-S258-5 for same-tab navigation, restoration and retained work.                               |
| **R-S247-11**        | S258 R-S258-3 for legacy destinations and fallback.                                                              |

**Preservation set.**

S113 capabilities, S142 dependency facts, S144 in-pane handlers, S145 coverage, S152–S167
behavior, S176 concise copy, S232 issue resolvers and S234–S237 controls. Keep each exact
confirmation, receipt and role check. S258 verifies the full control inventory, including
the originally conditional cases, independently from the primary Guided walkthrough.

**Adversarial acceptance checks.**

- **AC-S247-1** — From desk, Dashboard and an explicit task link verify the same lease,
  cycle and authoritative next step. Run a conflicting evidence fixture and compare the
  lease, desk and assistant without a second competing recommendation.
- **AC-S247-2** — Each applicable step exposes its real in-app action. Inspect owner and
  tenant steps where the action label is shared. Verify the audience and exact review
  target before confirmation. Exercise the forms, source proposal and completion entries.
- **AC-S247-3** — With the owner response unfinished, inspect and work the tenant offer,
  source updates and completion with their real prerequisites. The current stage stays
  identifiable throughout. Return to the current step and confirm no path-order restriction.
- **AC-S247-4** — Opening a lease, selecting a step, and showing the current step cause
  zero navigation-created records or provider effects. Existing exact authority remains.
- **AC-S247-5** — Exercise the journeys above with covered, assisted, notice, due annual
  review, changed source end, closed or pending, completed, unavailable and permission
  fixtures. Match each actual blocker and its recovery. Missing evidence never reads as
  verified progress.
- **AC-S247-6** — Check first-four-step geometry at 1280 by 800 and at 390 pixels wide in
  both themes. Use a full program name, keyboard selection and a pending or refused action.
  Preserve focus, no horizontal page overflow, and the original primary-action bounds.

**Forbidden actions / hard gates.**

Use isolated synthetic rehearsal evidence, with automatic comparison held. Existing
review, exact confirmation, recipient, scope, action-key and provider contracts govern
effects. Opening or inspecting a step is a read.

**Dependencies / sequencing.**

Consumes existing S248 evidence, S249 preparation and S250/S251 variants. The Guided
improvements work with the delivered header and view switch. S258 consumes the same
existing Guided controls for its view transition. The follow-up keeps S246 and S255
outcomes independently verifiable.

**Standalone delivery contract.**

Deliver scoped Guided orientation, primary action, waiting and recovery improvements
with synthetic browser checks and corresponding Help. The existing switch and detailed
controls serve as the baseline for S258. Staff observation is separate.

**Verification and delivery contract.**

1. Observe the current entry and action journeys in the guarded rehearsal.
2. Run the named acceptance cases, preserving ordinary work and exact-effect admission.
3. Update the Help map and the read-only canary and reconciliation checks where rendered
   landmarks change. Run focused and canonical gates before authorized delivery.

**Ordered prompt sequence.**

1. Pin the current action inventory and entry outcomes.
2. Falsify the orientation, audience, variant and recovery cases on that baseline.
3. Verify the Guided changes and preservation cases using the actual routes and controls.

**Deletion/merge recommendation.**

Keep the spec until its revised acceptance cases and the delivered requirement references
are represented by current implementation and evidence.
