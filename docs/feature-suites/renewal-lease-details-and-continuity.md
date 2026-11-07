<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ux-followup-2026-11 -->

# S258 — Find lease details and resume the same work

> Status: AUTHORING READY, intake 121. This is the third lease-page specification. The accepted two-view transition and continuity checks await implementation.

**Goal.**

Staff can reach any applicable lease detail, evidence or control, then resume the same
lease or list with their place and usable work intact.

**Current state / intended end state.**

The November 7 guarded replay of `ef81b891` found three selectable views. A legacy
`view=focus` URL still chose Focus, whose owner-outreach pane offered "Show this task
in Full view". The Guided "Lease details" link selected Full and focused the expected
section, while the section top remained above the viewport after the transition. The
legacy section hash selected Full directly. A synthetic note typed in Guided survived
reload with its focus and scroll, even though the probe refused its incidental autosave.
The desk table restored its exact explicit scope on return. The prior synthetic review
contains additional typing, focus, source and action recovery cases.

The intended journey has a Guided choice for doing the usual work and a Full choice
for looking up or using specific details. The same control inventory and precise
entry destinations remain reachable. Navigation visibly lands at its target and keeps
the user's work through an ordinary interruption.

**Actors and entry conditions.**

Use the current Renewal roles, lease scope and route guards. A visit can begin on the
desk, a saved or shared scope, a Dashboard or My Work link, a process reference, a Help
step, Communications or a bookmark. The exact accessible record and cycle govern
the destination. An unscoped process page can lead to the desk without guessing a lease.

**What it is / how it functions.**

- **R-S258-1 — Offer Guided and Full.** Guided is the default for a fresh lease open.
  The lease view switch offers Guided and Full. Carry useful Focus context and actions
  into their matching Guided steps or Full sections before retiring its selectable
  choice. Keep Lease information available in both views. Show the active view and
  make the route back to Guided easy to identify. Preserve the deliberate view choice
  for that lease visit.
- **R-S258-2 — Land where the detail link says it will.** Keep the five existing
  section destinations from Guided. Make the applicable action or information
  reachable from its step or one navigation to its owning Full section or control.
  A requested destination puts its heading or control visibly in the viewport after
  layout and focuses it where appropriate, including keyboard navigation. A Guided
  detail link replaces an older fragment with its own destination in the same visit.
  Choosing Guided again clears that detail fragment. Keep the existing control
  identifiers used by Help and tests. Retain applicable nested details,
  confirmations and authority. Compare the full Focus
  action and Help control inventories, including conditional states. If a target is
  unavailable, keep a useful explanation and recovery at its nearest valid section.
- **R-S258-3 — Keep exact links useful.** A recognized step opens Guided there. A
  recognized section or control anchor opens Full at that target. A valid explicit
  target takes precedence over a remembered view. A legacy Focus link or stored
  selection with a specific target maps to its equivalent destination.
  A generic Focus entry opens Guided at the current step. Match only allowed targets.
  Invalid or inaccessible input uses the existing safe route or access explanation.
  Preserve old lease, step, Help, work and source handoff links without adding a
  provider effect to navigation.
- **R-S258-4 — Return to the place staff came from.** Open a lease in the same tab
  from the desk. "Back to renewals" restores the validated desk continuation, including
  its month, group, view, filter, sort, collection selection and position as applicable.
  Preserve normal Back to Dashboard, My Work or the process when that is the actual
  browser origin. Use existing authorized links for Communications, Help, Admin or
  provider handoffs and keep the source lease context when available. A missing or
  invalid continuation uses the safe existing destination. A tab closing or a
  navigation return by itself establishes no business outcome.
- **R-S258-5 — Retain eligible work across an interruption.** Reload, including after
  a release, restores the visit's view, step, scroll and complete supported working text.
  Keep eligible focused text per tab and exact authorized record and cycle where
  applicable. Use a unique visible field identity when generated IDs change. Ambiguous
  fields keep their current values. Passwords, choice controls and another actor's
  fields stay outside retention. Before restoring a target or a draft, recheck its
  scope. A newer edit, view or focus choice wins over delayed restoration. Guided and
  Full share the latest local working entry for the same financial field. An ordinary
  eligible save uses its own exact revision. An older acknowledgment only confirms
  its own entry. Navigation adds no new business save or approval. A stale or refused
  operation retains usable inputs and the current review or recovery route.

**Where to find deferred details.**

| Staff need                                       | Entry and destination                                                                                                                                                        | Preservation and tradeoff                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Identify the lease and relevant source fact      | Lease information from either view. Lease details in Full contains the detailed facts, working record and applicable source corrections.                                     | The current cycle and material alerts stay in Guided. Detailed source history and exact edit controls stay in their original owners.           |
| Understand a comparison or a price               | The shown Guided step retains the decision and its basis. The Market rent comparison section and existing Pricing basis control hold saved detail and the rule.              | Keep source date, stored comparison and override choices. Opening details adds no lookup.                                                      |
| Verify an owner or tenant decision               | The relevant step and the Owner approval or Tenant offer and response section lead to the applicable message, evidence and controls. S248's Status log explains attribution. | Keep audience, recorded decision and provider evidence distinct. Communications remains available for its scoped work.                         |
| Find documents, signatures, updates or receipts  | The matching Guided step and Documents and completion in Full lead to the actual file, evidence, preview or reconciliation control.                                          | Full remains longer for purposeful inspection. Current work remains in Guided and historical artifacts stay available in their approved scope. |
| Follow guidance or correct a configuration input | Existing Help steps and authorized process, Admin or Connections links lead to the named destination. Back returns to the source when present.                               | Keep the distinction between guidance and a lease action. A role-restricted or unavailable target offers its actual next route.                |

**Journey coverage.**

| Journey                                               | Expected behavior and observable result                                                                                                                                                 | Verification                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Full for one fact and return                     | Activate a section link by pointer or keyboard. See its heading and action without a search. Use Guided again and recognize the same current or inspected step.                         | Current replay focused the Full section but left its top above the viewport. Recheck headings, scroll, focus and return in both themes and at both widths.                                              |
| Open an older bookmark or Help step                   | A known step or anchor selects its exact equivalent. A generic Focus bookmark reaches the current step. Invalid and restricted destinations explain or fall back within existing scope. | Replay verified the Full hash and old Focus mode. Verify translations for the control inventory and permission cases after transition.                                                                  |
| Leave a monthly, filtered or shared list              | Open the intended lease in the same tab, then see the original table or batch scope and position on return.                                                                             | Replayed the explicit All leases scope. Verify month, group, filter, sort, shared collection and saved view cases.                                                                                      |
| Follow a message, task, procedure or provider handoff | Recognize the destination and keep the intended record. Return through the named route or normal Back and see the actual status from its owner.                                         | Replayed Dashboard entry, process links and the My Work landing. Exercise a linked task and return from synthetic handoffs on the candidate. No claim from tab closure.                                 |
| Reload, swap views or recover after a failed save     | Restore the same eligible text, view, focus and place. A changed cycle, actor, ambiguous field or newer edit prevents a stale restore. A pending review needs current evidence.         | The note reload and scroll worked in the replay. Prior J06 and recorded races cover long text and delayed saves. Verify same-tab and other-tab cases, delayed acknowledgment and changed generated IDs. |

**In scope / out of scope.**

View choice, secondary detail discovery, legacy URLs, safe continuation, and presentation
and working-input recovery. S247 owns the path and primary action. S248 owns evidence and
whether the result counts as work. S201, S224, S246 and S249 retain their own data and
admission contracts.

**Open questions & assumptions.**

The November 7 decision supersedes the selectable Focus part of D-OP-6. The exact
presentation of a Full entry can reuse existing section and anchor patterns. Older
conditionally available controls and provider-bound outcomes retain their declared
evidence limits. Staff observation of the two-view journey remains pending.

**Cross-product impacts.**

`components/lease-renewal/RenewalFocusViewContext.tsx`,
`components/lease-renewal/RenewalFocusViewPane.tsx`,
`components/lease-renewal/RenewalDashboardNavigation.tsx`,
`lib/lease-renewal/desk-view-continuation.ts`, saved desk and collection links,
My Work lease links and the S252 Help and assurance coverage.

**Authority and evidence map.**

| Input                                                                                                                                        | Classification              | Use and limitation                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| Router, S143–S145, S152, S164 and S166                                                                                                       | Authority and preservation  | Keep capabilities, scope, and exact action and continuity contracts.                                      |
| Guarded November 7 replay of `ef81b891`                                                                                                      | Current browser observation | Verified the sampled view choices, focus/scroll issue, table return, legacy hash and note reload.         |
| [November 6 UX review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and [litmus](../evidence/renewal-one-path-litmus-2026-11-06.md) | Recorded synthetic evidence | J04–J06 and the recorded typing and recovery repairs. L54 remains scoped.                                 |
| Owner's accepted intake 121 direction and follow-up                                                                                          | Confirmed intent            | Guided replaces the selectable Focus choice. Full, useful controls and older destinations stay reachable. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S258-1** — One view and link resolver maps valid step, section and legacy
  targets to Guided or Full. Check the delivered controls against the candidate map.
- **ARCH-S258-2** — The existing continuation and retained-input owners restore
  authorized view and working state by record, tab and current context. Navigation
  and older acknowledgments cannot publish a business effect or replace newer work.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S258-1** — A person opens exact details from Guided and sees the destination
  immediately. Old entry links reach the same allowed capability.
- **BEH-S258-2** — A person can return to the original lease, selected list or related
  surface and recognize its scope and current state.
- **BEH-S258-3** — A person resumes after a reload or refusal with their usable work
  and focus, or sees why a changed or inaccessible target needs a new selection.

**Human litmus outcome.**

### Find the detail and get back to work

**If this was built correctly:** A staff member can find one fact or control without
opening a second working mode, then return to the same task. After an interruption
they see their original place and eligible text. A bookmarked or Help link still gets
them to the promised control.

- Model verdict: November 7 transition NOT RUN. The replay documents its starting state.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                   | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                                   |
| ----------------------------- | -------------------- | ---------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| R-S258-1 view choice          | ARCH-S258-1          | BEH-S258-1       | Find the detail and get back to work | AC-S258-1. Verify fresh, selected and reload cases with the complete original inventory. |
| R-S258-2 visible destinations | ARCH-S258-1          | BEH-S258-1       | Find the detail and get back to work | AC-S258-1. Check real headings and focus after layout, including conditional controls.   |
| R-S258-3 legacy links         | ARCH-S258-1          | BEH-S258-1       | Find the detail and get back to work | AC-S258-2. Test explicit, generic, invalid and unauthorized destinations.                |
| R-S258-4 safe return          | ARCH-S258-2          | BEH-S258-2       | Find the detail and get back to work | AC-S258-3. Compare original scope and returned context across entrances.                 |
| R-S258-5 working continuity   | ARCH-S258-2          | BEH-S258-3       | Find the detail and get back to work | AC-S258-4. Check text, focus, view, scope, pending feedback and restoration.             |

**Preservation set.**

Preserve the S113 controls, the S145 Focus preservation baseline, the Help control map,
lease information, exact effects and confirmation, role boundaries, browser history,
existing scoped continuation and the complete retained-typing regressions. Check
conditional controls under their actual availability rules. Report unresolved
conditional evidence separately.

**Adversarial acceptance checks.**

- **AC-S258-1** — Compare the original control inventory by identity and real handler.
  Open all five Full sections from Guided and check the visible heading, keyboard focus
  and return. Verify the two choices, useful former Focus actions and all applicable
  conditional controls at desktop and phone widths in both themes.
- **AC-S258-2** — Walk old lease, Focus, step, section and Help links, including an
  exact former Focus target, a generic entry, a malformed target and denied access.
  Verify actual destinations and useful fallback without loss of route guards.
- **AC-S258-3** — Enter from an explicit filtered table, saved view, shared collection,
  batch and Dashboard or My Work record. Return and compare actual query, view, month,
  group and position where applicable. Verify a valid linked handoff return and an
  invalid continuation. Assert that navigation alone created no business effect.
- **AC-S258-4** — Interrupt a fully focused, supported long field and an incomplete
  financial entry. Exercise reload, release, view change, stale review, failed save,
  generated-ID change, ambiguous fields, later typing and delayed prior acknowledgment.
  Verify actual retained text and focus in the same tab and authorized record. Confirm
  actor, record and tab isolation and honest save feedback.

**Forbidden actions / hard gates.**

Use the guarded synthetic rehearsal. Opening, switching and returning are presentation.
Use the existing local retention boundaries, access checks and exact action owners.

**Dependencies / sequencing.**

The delivered Guided and Full surfaces provide the controls for this slice. The
transition can be verified independently of the revised S247 action and S248 header.
Land view removal only after its exact control and route mappings pass.

**Standalone delivery contract.**

Deliver the two-view transition, complete destination and legacy link mapping, return
and restore coverage, and corresponding Help and assurance updates. Use the existing
synthetic records for qualification. A staff walkthrough supplies human evidence.

**Verification and delivery contract.**

1. Pin the starting route, Focus and Help inventories and the retained-input baseline.
2. Run the named failing and preservation cases through the real views and routes.
3. Reconcile Help, read-only assurance and the versioned S254 handoff before the existing
   focused and canonical gates and any authorized delivery.

**Ordered prompt sequence.**

1. Inventory reachable controls, links and the sources of return state.
2. Prove the fail-first focus and compatibility cases and retain verified typing cases.
3. Verify the two choices, actual destinations and interruption recovery before delivery.

**Deletion/merge recommendation.**

Keep this specification until the route and continuity requirements are represented
by code, tests and current evidence.
