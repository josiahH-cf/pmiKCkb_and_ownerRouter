<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S270 — Move supporting details into named Guided disclosures

> Status: AUTHORING READY, intake 148. Companion Guided journey. Implementation and
> verification pending.

**Goal.**

Guided reads like a short working form. Staff can expand the supporting facts, optional
choices and history they need, while the required action, inputs and material warnings
stay visible.

**Current state / intended end state.**

S247/S258 distinguish Work from read-only Verification and already use named details in
places. The shared RenewalSecondaryWork wrapper opens its groups by default in Guided, and
the tenant editor has an optional charge and origin group. Moving material into a dropdown
without classifying it could hide an actual fix or turn evidence into a second editor. The
intended result has a calmer initial Guided view and precise, usable paths to everything
retained.

**Actors and entry conditions.**

Authorized Renewal staff in Guided or matching Full sections, including keyboard,
narrow-screen and read-only users. They can expand permitted details, inspect supporting
evidence and use the separate existing edit or action. Exact links into a closed group are
supported.

**What it is / how it functions.**

On entry show the current Work and only the decision facts it needs. Secondary Work and
Verification appear as specific closed disclosures when they are optional, with meaningful
labels and a short summary where useful. Open a section to inspect or choose something
deliberate. When a field becomes required or a requested target is inside a group, surface
the same owner and keep the relevant local state.

- **R-S270-1 — Separate support from needed work.** Classify current UI blocks and states
  using the existing Work/Verification ownership and the S269 current-input priority. Move
  dense source/provenance and noncurrent facts into read-only disclosures, optional or
  advanced editable work into named secondary Work, and keep minimum decision cues
  visible. Optional grouped content is closed by default in Guided. Existing Full outcome
  structure and usability remain intact.
- **R-S270-2 — Reveal exact required or requested controls.** A targeted secondary
  control, current required field or governing correction becomes visible through its one
  Work owner. Open only the necessary ancestry on an exact link and focus its
  label/control or clear permission state. Keep a failed, saving, conflicted or unresolved
  action visible as the current work. Retain typed input on expand/collapse and switch,
  with existing save/case lifetime. When content stops governing the current action, it
  may return to its named group without hiding an active error or stealing focus.
- **R-S270-3 — Keep Verification effect-free.** Verification uses permitted source reads
  and verified read-only links. Put edits, retries, paid lookups, send/export, exact
  review confirmations, source writes and process completion in their owning Work.
  Expanding, closing or reading either group does not launch an operation, begin a paid
  lookup or record progress. A link labeled to fix something belongs to Work. A source
  link describes its actual read destination.
- **R-S270-4 — Support keyboard, narrow and exact review.** Use native or equivalent
  accessible disclosure semantics with a named operable summary, visible expanded state
  and sensible focus. Closed descendants do not enter tab order. Collapse restores focus
  to the summary when needed. Direct links open the exact target. Preserve full current
  exact review content when staff review and confirm, with its original consequence cues
  and warnings. Support long labels/wrapping, both themes, existing width/heading/viewport
  budgets and the single sticky header.

### Fixed disclosure placement

Active Work appears first under each outcome heading. Keep the amount, date, party or
short state that governs the current decision, and the actual active inputs and action
with their errors. Then place the named secondary Work disclosure, followed by the named
read-only Verification disclosure. Omit an empty group. Use the same ownership in Full. A
contextual summary can state the actual count or source status when it helps identify what
opens. It cannot repeat the active alert.

| Outcome                  | Secondary Work below the active work                                                                                                                                                                                                                                                | Read-only Verification below Work                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check the numbers        | **Correct other lease facts** contains noncurrent corrections and the optional Housing assistance editor.                                                                                                                                                                           | **Verify lease numbers** contains current source facts, source time and differences, the full recurring charge inventory and read-only source links.                                                          |
| Compare market rent      | **Comparison inputs and deliberate rerun** contains lookup settings and the explicit rerun once a usable result exists.                                                                                                                                                             | **Verify market comparison** contains provider estimate and range, comp rows, dates, report and the current recommendation basis.                                                                             |
| Ask the owner            | **Owner message options and outreach record** contains inactive alternate delivery methods, wording edits, older draft reuse and manual outreach or response paths. Keep the one Working renewal terms editor in this outcome, with its own named reveal when dates are not active. | **Verify owner terms and outreach** contains pricing coverage, owner evidence, earlier wording, outreach history and receipts. Keep the current base and read-only recommendation with its edit link in Work. |
| Offer the tenant         | **Tenant offer options and record of contact** contains optional wording and information form choices, inactive alternate delivery actions and manual records. The current offer-charge selection and exact send/follow-up review stay in Work when active.                         | **Verify offer facts and delivery** contains the underlying charge/source comparison, resource audience evidence, previous sends and replies, and recorded decisions.                                         |
| Documents and signatures | **Other packet and handoff work** contains independent optional packet inputs and existing noncurrent document actions.                                                                                                                                                             | **Verify forms and signing evidence** contains source and map versions, per-family evidence, provider receipts and actual returned-document status.                                                           |
| Finish up                | **Other follow-ups** contains applicable lower-priority tasks and their own actions.                                                                                                                                                                                                | **Verify follow-up and source updates** contains recorded and read-back outcomes, source previews for inspection, and provenance. Exact confirmation stays in Work.                                           |
| Complete                 | No extra group is needed when there is no independent completion task.                                                                                                                                                                                                              | **Verify completion** contains recorded completion or source evidence.                                                                                                                                        |

For month-to-month, assisted and non-renewal variants, use the equivalent verification
label with the actual term, program or handoff evidence and keep the variant's optional
work only when applicable. Keep the single sticky Work status, note and history entry.
Current decision context can link to it. Status history has no second editor or duplicate
panel in the outcome.

### Opening, promotion and return

- Start unrelated optional groups and Verification closed on ordinary entry, switching
  view or moving to another outcome. An exact deep link opens the named group and only the
  ancestors needed for the target. Staff can open two independent groups when useful. The
  editor remains with its one owner, and entered values retain the existing lifetime.
- A current required field, failed or pending save, or governing reconciliation belongs in
  visible Work. Keep it open through a view switch until the staff member resolves it or
  leaves the case. A field may return to secondary Work after the save or task is resolved
  and focus has left it. Keep the exact next fix visible while a source remains pending.
  Opening or closing Verification does not move active Work.
- Use semantic summaries, with no closed descendants in tab order. Focus the precise owner
  when a user follows an exact link. Closing a group with focus inside returns focus to
  its summary. Scope denial leads to the permitted role handoff. Support narrow layout,
  wrapping and keyboard access in both themes.
- In exact review keep the actual proposed terms, selected charges and totals, text,
  recipients and sender, applicable links, follow-up scope and consequential warnings
  visible in their existing review. Sources can be inspected separately. The staff member
  can review and confirm without opening a supporting disclosure.
- Verification never hosts an editable control, refresh that operates on the case, retry,
  paid lookup, export, dispatch, confirmation or completion. Actual alternate effects
  remain under their existing Work control and review. The single primary recovery
  occupies Work when dispatch is unresolved. No stale or disabled Send competes with it.

**In scope / out of scope.**

Progressive disclosure inside the renewal journey, with exact access, keyboard use and
preserved Full. The change organizes visible information and optional work. No new data
entry types, policy, provider authority or unrelated UI redesign.

**Open questions & assumptions.**

- A dropdown here is the named disclosure in the outcome map. Actual form choices, money,
  dates and notes keep their existing input types.
- Use the labels and content placement above in the UI, Help and control map. Empty and
  inapplicable groups have no placeholder button.

**Cross-product impacts.**

Guided and shared Work/Verification layout, exact legacy links, existing field and
evidence panels, Help versioned guides, control maps, synthetic screenshots and guarded
assurance landmarks.

**Authority and evidence map.**

| Input                                                                                                                                                          | Classification           | Use and limitation                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Owner’s November 10 follow-up on fields and dropdowns                                                                                                          | Explicit new scope       | Show less supporting information inline and make current data entry more prominent.                                          |
| November 10 Fathom walkthrough 14:01–14:45, 39:20–42:59 and 45:13–49:25                                                                                        | Demonstrated friction    | Followed scroll and view changes to reach precise controls and charge evidence.                                              |
| S247/S258 and S260 N09-10                                                                                                                                      | Preservation contracts   | Retain named read-only verification, exact work links and one action owner across both views.                                |
| `components/lease-renewal/RenewalGuidedView.tsx`, `components/lease-renewal/RenewalWorkspace.tsx` and `components/lease-renewal/RenewalMessagePreparation.tsx` | Committed implementation | Existing verification and secondary group defaults and the buried lease/charge details provide a falsifiable starting state. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S270-1** — Use one classification and the existing owners in the shared renderer.
  Opening a group does not instantiate a second form or cause a duplicate save. Reuse
  current evidence landmarks.
- **ARCH-S270-2** — Reuse exact anchor navigation, state ownership and current issue
  projection. Neither disclosure state nor focus overrides current permissions, ready
  state or case revision.
- **ARCH-S270-3** — Use presentational disclosures on current data/read-only routes.
  Capture browser network and adapter traces to distinguish allowed inspection from any
  mutating or paid call.
- **ARCH-S270-4** — Reuse shared UI tokens and focus restoration, and actual current
  review surfaces. Layout qualifies with S252 budgets and semantic order as well as
  visibility.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S270-1** — Staff scan the field and action without the recurring charge inventory,
  full comparable history or unused controls taking the first view. They can find a
  specific supporting fact from its label.
- **BEH-S270-2** — An operator opens a link to a buried correction or earlier permitted
  draft, reaches that exact editor and returns to the current task. If a link becomes the
  critical fix, it is visible without opening evidence.
- **BEH-S270-3** — Staff can read why an amount or state is shown and close the detail
  without sending anything. To correct it they use the clearly distinct Work action.
- **BEH-S270-4** — A keyboard user can open a named group and return to the main work. A
  narrow screen still shows the exact current fix or waiting state first. The confirmation
  shows all relevant terms, charges, links, recipient and follow-up choices.

**Human litmus outcome.**

### Expand the details without losing the work

**If this was built correctly:** A staff member can see the input that needs attention,
look up the supporting evidence by a familiar label and return to the same input. The
group opens cleanly with a keyboard, and reviewing details never runs an action.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                          | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification                                                        |
| ---------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| R-S270-1 Separate support from needed work           | ARCH-S270-1          | BEH-S270-1       | Expand the details without losing the work | AC-S270-1. Compiled collapsed/expanded DOM, focus order and live-owner checks.                |
| R-S270-2 Reveal exact required or requested controls | ARCH-S270-2          | BEH-S270-2       | Expand the details without losing the work | AC-S270-2. Compiled navigation and recovery with same working revision and owner.             |
| R-S270-3 Keep Verification effect-free               | ARCH-S270-3          | BEH-S270-3       | Expand the details without losing the work | AC-S270-3. Network and provider guard, old bytes and status readback.                         |
| R-S270-4 Support keyboard, narrow and exact review   | ARCH-S270-4          | BEH-S270-4       | Expand the details without losing the work | AC-S270-4. Rendered landmarks and accessible interaction with preserved exact review payload. |

**Preservation set.**

- S247/S258 one owner, full list of exact destinations and reachable permitted controls,
  and S248 one header status/history.
- Exact existing reviews, message sender and terms evidence, cost controls, authorized
  independent work and source/receipt refusal.
- S252 Help/control map and layout budgets and S260 recorded evidence with new candidate
  checks separate.

**Adversarial acceptance checks.**

- **AC-S270-1** — Start each standard and applicable variant with evidence and secondary
  groups closed. Assert the named group order and which values appear inline, and reject
  old stacked sections, duplicated warnings/editors or missing retained routes. Inspect
  matching Full ownership and verify an empty group has no control.
- **AC-S270-2** — Drive deep links to closed Work, direct evidence links, a field that
  becomes invalid after change, a failed save, and a role-ineligible target. Assert exact
  focus, retained value and clear refusal. After a view change verify active Work stays
  visible while unrelated groups close, and collapsing a focused group returns focus to
  its summary.
- **AC-S270-3** — Exercise every named disclosure, including prior evidence and provider
  links, under a guard. Fail on effectful GETs, hidden editable controls, paid or mutation
  attempts and spurious stage changes.
- **AC-S270-4** — Test keyboard and screen reader names/states, hidden descendants, long
  content, narrow/desktop geometry and an exact review after a disclosure interaction.
  Retain read-only access where authorized.

**Forbidden actions / hard gates.**

No hidden governing fix, duplicate editor, effectful Verification, hidden material
confirmation fact, disclosure-triggered operation or role expansion. Existing roles,
scoped effects, exact-target authorization, claims and receipt/reconciliation gates remain
in force.

**Dependencies / sequencing.**

Uses the existing Work and Verification split and S269’s active input contract. Supporting
fact presentation can be checked independently on current inputs. Run cumulative
disclosure and review verification in S271 after the companion changes.

**Standalone delivery contract.**

- **Deliverable now.** Named accessible disclosures, precise promotion/reveal, safe work
  and read-only separation, updated Help and control continuity.
- **Consumes, but does not assume.** Current case and form states and existing permitted
  evidence. Missing data stays honestly unavailable and the existing manual resolution
  remains reachable.
- **Externally blocked effect.** No external effect is needed. AC-S270-3 retains the exact
  underlying effect holds and distinguishes read-only inspection.
- **Produces for downstream suites.** Auditable control-to-group map and rendered
  disclosure, review and navigation evidence for S271.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run current S247/S258/S252 tests, compiled disclosure and focus checks with synthetic
   cases, exact review assertions and a guarded effects trace. Use synthetic fixtures for
   effects and guarded read-only production probes where authorized. Run the affected Help
   and control-map checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Inventory the real primary, secondary and evidence controls by outcome and verify their
   existing handlers.
3. Apply named collapse/reveal and focus behavior and falsify hidden fixes, cloned editors
   and effectful evidence.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
