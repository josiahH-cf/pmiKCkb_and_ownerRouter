<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ux-followup-2026-11 -->

# S258 — Find lease details and resume the same work

> Status: Guided and Full continuity delivered at `2e5e47a8`, intake 121. November 9 intakes 132 and 136 are AUTHORING READY for the header controls and outcome-led Full sections.

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

On November 9 the screenshots and the serving `RenewalWorkspace.tsx` and
`RenewalGuidedView.tsx` show two view buttons in the header and a duplicate Full section list at the bottom.
RentVine record links are available deeper in the workspace. The new header exposes
one view toggle and the exact RentVine lease record beside the copyable lease identity.

**Actors and entry conditions.**

Use the current Renewal roles, lease scope and route guards. A visit can begin on the
desk, a saved or shared scope, a Dashboard or My Work link, a process reference, a Help
step, Communications or a bookmark. The exact accessible record and cycle govern
the destination. An unscoped process page can lead to the desk without guessing a lease.

**What it is / how it functions.**

- **R-S258-1 — Toggle Full from the header.** Guided is the default for a fresh
  lease open. Expose one labeled Full view toggle with its on/off state in the shared
  sticky header. Off is Guided. The toggle is keyboard-operable, remains visible at
  narrow widths and keeps the current view, step and working input context. Switching
  back restores the prior applicable Guided step and position. Lease information and
  the work controls remain reachable in both views. Remove the generic footer links
  and duplicate view buttons. Keep named, task-specific detail links in their step.
- **R-S258-2 — Land where the detail link says it will.** Preserve the five existing
  Full section destinations through the header toggle and the Full section navigation.
  A Guided link to a source or record opens its exact Verification item. A fix
  link focuses the actual Work control at its owner. Keep either destination usable
  while the other area is collapsed. When switched on without an exact target, Full shows the current step's
  matching section where available. A requested destination puts its heading or
  control visibly in the viewport after layout and focuses it where appropriate.
  A new detail link replaces an older fragment in the visit. Choosing Guided again
  clears the Full fragment. Preserve valid bookmarks, the actual control identifiers
  used by Help/tests, conditional details and permissions. An unavailable destination
  explains its recovery at the nearest valid section.
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

- **R-S258-6 — Open the exact lease in RentVine from the header.** Display Open in RentVine
  next to the lease identifier and its existing copy control in Guided and Full.
  Reuse the verified lease destination resolver and supported shortcut route. Bind
  the source link to the current authorized lease and expected HTTPS provider host,
  with the existing link safety checks. Open in a new tab so the exact lease task and
  pending local input stay in the app tab. If there is no verified link, show a short
  unavailable state and route to the existing source review/refresh. A pasted or
  conflicting link, guessed host/ID or another record cannot become this destination.
  Keep the in-app lease entry and provider link clearly distinct.

- **R-S258-7 — Consolidate the five Full sections around outcomes.** Full applies
  S247 R-S247-14 and R-S247-15 at every section and exact linked outcome. It shows
  more supporting detail and applicable secondary work using the same facts, fields
  and operation owners as Guided. On entry to each section, place the outcome, named
  action or wait, and any blocking or overdue cue before optional details. Keep
  evidence in separate read-only links or disclosures. A named evidence link can
  open the relevant detail on arrival. A named work link lands on the exact control
  or its current refusal/recovery with evidence closed. Each applicable action has
  one owning location. Preserve existing section and control links, including
  legacy Focus links, by routing them to that owner. Do not retain a second editor
  to satisfy an old anchor. Render neutral read-only evidence for eligible readers.
  Hide unrelated inputs by applicability. Keep the current next step available
  while staff inspect a different section.

**Where to find deferred details.**

The five Full destinations use these Work and Verification placements. The Guided
step remains independently workable through the same owner. Entries that depend on
actual evidence or permission have the same reason and next action in both views.

| Existing Full destination              | Work                                                                                                                                                                                                                | Read-only verification                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lease details (`lease-details`)        | Check the numbers and reach the exact current-fact correction, explicit refresh, term, assistance or notice input when it needs staff. A later source update links to Finish up when it belongs there.              | Source values and links, freshness, comparisons, current and historical recurring charges, lease/cycle basis.                                                |
| Market rent comparison (`comps`)       | Run the applicable comparison, use manual input or edit the single Rent to recommend field. Deliberate rerun and inputs stay in secondary Work.                                                                     | RentCast result, input basis, comparable listings, derivation, report links and prior rent.                                                                  |
| Owner approval (`owner`)               | Choose the pricing basis, review the owner message or record the decision. Link to the recommendation editor when a different amount is needed.                                                                     | Actual agreement and approved terms, linked replies and decision attribution.                                                                                |
| Tenant offer and response (`tenant`)   | Review the tenant offer and its optional follow-ups, reconcile delivery or record the response. Keep applicable pause, cancel and Resume with that communication.                                                   | Current verified terms and recipients, last confirmed message, linked replies, schedule and recorded outcome.                                                |
| Documents and completion (`documents`) | Group Documents and signatures, Finish up and Complete under their separate outcome headings within this section. Show the applicable next action, exact source preview/recovery, or staff completion at its owner. | Packet, form and signature evidence under Documents, discrepancies and receipts under Finish up, and recorded disposition and cycle evidence under Complete. |

Lease information and the shared status control remain available in the header.
A guidance, settings or provider handoff uses its existing authorized destination
and preserves the source context.

**Journey coverage.**

| Journey                                               | Expected behavior and observable result                                                                                                                                                 | Verification                                                                                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open Full for one fact and return                     | Activate a section link by pointer or keyboard. See its heading and action without a search. Use Guided again and recognize the same current or inspected step.                         | Current replay focused the Full section but left its top above the viewport. Recheck headings, scroll, focus and return in both themes and at both widths.                                              |
| Open an older bookmark or Help step                   | A known step or anchor selects its exact equivalent. A generic Focus bookmark reaches the current step. Invalid and restricted destinations explain or fall back within existing scope. | Replay verified the Full hash and old Focus mode. Verify translations for the control inventory and permission cases after transition.                                                                  |
| Leave a monthly, filtered or shared list              | Open the intended lease in the same tab, then see the original table or batch scope and position on return.                                                                             | Replayed the explicit All leases scope. Verify month, group, filter, sort, shared collection and saved view cases.                                                                                      |
| Follow a message, task, procedure or provider handoff | Recognize the destination and keep the intended record. Return through the named route or normal Back and see the actual status from its owner.                                         | Replayed Dashboard entry, process links and the My Work landing. Exercise a linked task and return from synthetic handoffs on the candidate. No claim from tab closure.                                 |
| Reload, swap views or recover after a failed save     | Restore the same eligible text, view, focus and place. A changed cycle, actor, ambiguous field or newer edit prevents a stale restore. A pending review needs current evidence.         | The note reload and scroll worked in the replay. Prior J06 and recorded races cover long text and delayed saves. Verify same-tab and other-tab cases, delayed acknowledgment and changed generated IDs. |

**In scope / out of scope.**

View choice, outcome-led Full sections, separate Work and Verification destinations,
legacy URLs, safe continuation and working-input recovery. S247 owns the path and primary action. S248 owns evidence and
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

The November 9 “Lease Renewal Page” screenshot marks the copyable lease reference
and the repeated footer links. The owner's confirmation keeps both view modes and
moves their selection and the external lease shortcut into the header.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S258-1** — One view and link resolver maps valid step, section and legacy
  targets to Guided or Full. Check the delivered controls against the candidate map.
- **ARCH-S258-2** — The existing continuation and retained-input owners restore
  authorized view and working state by record, tab and current context. Navigation
  and older acknowledgments cannot publish a business effect or replace newer work.

- **ARCH-S258-3** — Use the existing lease-scoped destination resolver and continuation
  rather than introducing a new provider URL builder or second view state. Fail-first:
  the header has no RentVine record action and the footer duplicates view navigation.

- **ARCH-S258-4** — The five Full destinations map to the same outcome and owner
  contract as Guided. Existing selectors and anchors reach the appropriate Work or
  Verification location. The starting Full section composition exposes evidence and
  work controls in mixed panels. The consolidation check fails if either view keeps
  a parallel editor or hides its required action in optional details.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S258-1** — A person opens exact details from Guided and sees the destination
  immediately. Old entry links reach the same allowed capability.
- **BEH-S258-2** — A person can return to the original lease, selected list or related
  surface and recognize its scope and current state.
- **BEH-S258-3** — A person resumes after a reload or refusal with their usable work
  and focus, or sees why a changed or inaccessible target needs a new selection.

- **BEH-S258-4** — At any scroll position staff can recognize and change the active view
  or open the exact authorized RentVine lease. The app still holds the same work on return.

- **BEH-S258-5** — Staff land in Full and immediately identify the selected outcome,
  the applicable action or its state, and where to check evidence. They can open
  detail without navigating through editing or confirmation. They return to the
  same task and state when they switch back to Guided.

**Human litmus outcome.**

### Find the detail and get back to work

**If this was built correctly:** A staff member can find one fact or control without
opening a second working mode, then return to the same task. After an interruption
they see their original place and eligible text. A bookmarked or Help link still gets
them to the promised control.

- Model verdict: November 7 transition NOT RUN. The replay documents its starting state.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                            | Architecture outcome     | Behavior outcome       | Human litmus                         | Deterministic evidence / falsification                                                    |
| -------------------------------------- | ------------------------ | ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| R-S258-1 one sticky view toggle        | ARCH-S258-1, ARCH-S258-3 | BEH-S258-1, BEH-S258-4 | Find the detail and get back to work | AC-S258-1. Verify fresh, selected and reload cases with the complete original inventory.  |
| R-S258-2 visible destinations          | ARCH-S258-1              | BEH-S258-1             | Find the detail and get back to work | AC-S258-1. Check real headings and focus after layout, including conditional controls.    |
| R-S258-3 legacy links                  | ARCH-S258-1              | BEH-S258-1             | Find the detail and get back to work | AC-S258-2. Test explicit, generic, invalid and unauthorized destinations.                 |
| R-S258-4 safe return                   | ARCH-S258-2              | BEH-S258-2             | Find the detail and get back to work | AC-S258-3. Compare original scope and returned context across entrances.                  |
| R-S258-5 working continuity            | ARCH-S258-2              | BEH-S258-3             | Find the detail and get back to work | AC-S258-4. Check text, focus, view, scope, pending feedback and restoration.              |
| R-S258-6 verified RentVine header link | ARCH-S258-3              | BEH-S258-4             | Find the detail and get back to work | AC-S258-5. Exact host/lease guard, unavailable recovery, separate tab and work retained.  |
| R-S258-7 outcome-led Full sections     | ARCH-S258-4              | BEH-S258-5             | Find the detail and get back to work | AC-S258-6. Check all five sections, their named outcomes and separate exact destinations. |

**Preservation set.**

Preserve the S113 controls, the S145 Focus preservation baseline, the Help control map,
lease information, exact effects and confirmation, role boundaries, browser history,
existing scoped continuation and the complete retained-typing regressions. Check
conditional controls under their actual availability rules. Report unresolved
conditional evidence separately.

**Adversarial acceptance checks.**

- **AC-S258-1** — Compare the original control inventory by identity and real handler.
  Toggle Full at desktop and phone widths in both themes, then reach all five
  sections via the retained section navigation and actual step links. Check visible
  heading, focus, announced state, view/step restoration, absence of generic footer
  links, useful former Focus actions and all applicable conditional controls.
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

- **AC-S258-5** — In each view, the same lease copy and exact RentVine link are reachable
  in the sticky header and identify the expected lease. Cover a missing destination,
  conflicting lease ID, unexpected host and unauthorized access. The guarded rehearsal
  observes the synthetic destination and new-tab behavior without a provider mutation.
  Returning keeps the original step, work, scroll and authorized desk continuation.

- **AC-S258-6** — Enter each Full section from its navigation, the toggle and an exact
  task or evidence link. For Documents and completion, target all three outcomes
  individually. At both supported widths, with optional details collapsed, verify
  the heading, active Work action or reason and focus before supporting detail. Open
  each read-only evidence region and assert zero action calls. Follow the same
  cross-step correction in Guided and Full and confirm one owning control, shared
  pending/rejected state, same refusal for a read-only actor, one result and exact
  return. A section that retains the old mixed panels or a hidden work action fails
  even if every control is reachable.

**Forbidden actions / hard gates.**

Use the guarded synthetic rehearsal. Opening, switching and returning are presentation.
Use the existing local retention boundaries, access checks and exact action owners.

**Dependencies / sequencing.**

The existing Guided and Full handlers are the starting inventory. The header, exact
link and continuation checks can run independently. Full consolidation consumes S247's
shared Work and Verification rules and S248's single header status. Land any removal
only after its exact owner, route and role mapping passes. Qualify both views together
under S260 N09-10.

**Standalone delivery contract.**

Deliver the consolidated Full sections, shared outcome and action ownership, header
toggle and provider link, destination mapping, return and restore coverage, and
corresponding Help and assurance updates. Use the existing
synthetic records for qualification. A staff walkthrough supplies human evidence.

**Verification and delivery contract.**

1. Pin the starting route, Focus and Help inventories and the retained-input baseline.
2. Run the named failing and preservation cases through the real views and routes.
3. Reconcile Help, read-only assurance and the versioned S254 handoff before the existing
   focused and canonical gates and any authorized delivery.

**Ordered prompt sequence.**

1. Inventory reachable controls, links and the sources of return state.
2. Prove the fail-first focus and compatibility cases and retain verified typing cases.
3. Verify both views, the five outcome-led Full sections, exact destinations and interruption recovery.

**Deletion/merge recommendation.**

Keep this specification until the route and continuity requirements are represented
by code, tests and current evidence.
