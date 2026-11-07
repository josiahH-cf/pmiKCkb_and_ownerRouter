<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S247 — One renewal path per lease: one page, one current step

> Status: AUTHORING READY: intake 113; implementation merged in PR #187 at `20d55104`. November 6 UX repairs and qualification continue on `codex/renewal-one-path-ux`; release pending, human verdict NOT RUN. D-OP-6 remains settled: Guided is the default, and Focus and Full views, handlers and projections are kept. This specification grants no provider effect.

**Goal.**

Opening any lease shows one page that says where the renewal stands, puts the one step to do now
in front with its controls in place, and keeps every other existing tool one action away with
nothing blocked.

**Current state / intended end state.**

Verified at `6491c06f` and by a read-only production observation of one lease page on November 5,
2026 (no control activated):

- The lease page `app/lease-renewal/live/desk/lease/[leaseId]/page.tsx` opens in Focus view with a
  Focus view and Full view switch (`components/lease-renewal/RenewalFocusViewContext.tsx`). Focus
  shows the chosen task; when its controls are not mounted it reads "This task's controls are shown
  in Full view" (`components/lease-renewal/RenewalFocusViewPane.tsx`).
- Below the Focus pane the page always renders the pricing policy panel, "Suggested next",
  "Recorded renewal work", "Staff status and Status log" and lease follow-up tasks, then five
  sections holding about twenty-five cards (`components/lease-renewal/RenewalWorkspace.tsx`,
  `components/lease-renewal/RenewalManualWorkspace.tsx`, `lib/lease-renewal/dashboard-sections.ts`).
- Three systems each name a next step: desk guidance (`lib/lease-renewal/desk-guidance.ts`), the
  staff activity summary (`lib/lease-renewal/workspace-state.ts`) and the Focus action graph
  (`lib/lease-renewal/renewal-actions.ts`, `lib/lease-renewal/action-graph.ts`). Staff also set a
  separate work status by hand (`lib/lease-renewal/work-status.ts`), and the page shows a lifecycle
  category, an overall status and per-action statuses beside it.
- Observed: one lease named "Owner outreach" as the next step in three places on the same page,
  with "Also ready for you (19)" and "All renewal work (28)". On the desk the same day, one lease
  read "Waiting on: the owner" while its staff status read "Preparing tenant offer".
- The in-app guide (`lib/help/content/guides/lease-renewals.ts`) tells staff to choose Full view as
  its fourth step. Kicking off one lease by the guides takes at least eleven deliberate actions
  across three browser tabs.
- November 4 staff walkthrough: staff could not start the rent comparison from Focus, searched for
  the status control, prepared a draft in the tenant section when they meant the owner section, and
  lost their place when the page reloaded.

Intended: a guided view that is the default for every lease, with a path strip and one "Now" card
that holds the current step's real controls. Focus view and Full view stay beside it as options,
unchanged, and Full view remains the place for every other section and control.

**Actors and entry conditions.**

The same signed-in staff, roles and lease access as today. Every lease is workable (S154). A source
or staff-record read failure shows on the Now card as the thing to resolve; it never blanks the page.

**What it is / how it functions.**

- **R-S247-1 — One path definition.** The renewal path is one ordered definition in code: Check the
  numbers, Compare market rent, Ask the owner, Offer the tenant, Documents and signatures, Finish up
  (RentVine, the operating Sheet and follow-ups), Complete. Each step declares its label, when it
  applies, what the app shows ready, what the person decides, its primary action and existing
  handler, its completion evidence, its waiting state and the step that follows. The definition is
  built over the existing predicates and handlers and stores no new progress.
- **R-S247-2 — Variants are part of the path.** A covered standing agreement replaces Ask the owner
  with a "Covered by agreement" state (S250). A recorded or source non-renewal replaces the later
  steps with the non-renewal handoff. A month-to-month lease shows its review step. Housing
  assistance puts the program contact and the owner's renew-or-not answer ahead of rent (S251). A
  step that does not apply is shown as not part of this lease's path and asks for nothing.
- **R-S247-3 — One stage and one next step everywhere.** One projection supplies the stage and the
  next step to the desk row, the lease page, assistant answers and My Work links. The stage names
  reuse the existing staff work-status wording. The lifecycle category, overall status and action
  status groups are not shown in the guided view and stay available in the full desk table, Focus
  view and Full view.
- **R-S247-4 — The Now card holds the work.** For every path step the Now card shows what the app
  prepared, the inputs the person decides, one primary action and its secondary actions, using the
  existing controls in place. The primary action follows the heading and any consequential alert;
  supporting next-step and detail text follows the action. No path step sends the person to another view or tab to act.
  The selected step's existing fields and hand records, including the assisted owner/rent choices
  and ordinary working terms, are inside the same visual and named Now card. Their components
  stay mounted at one position across Guided, Focus and Full view, preserving unsaved entries.
- **R-S247-5 — Waiting is a state, not a dead end.** A waiting step states who it waits on, since
  when, the last contact and what the app is watching, and offers the actions that fit: record what
  happened, send again, or work a later step now.
- **R-S247-6 — Nothing is gated.** Any step can be chosen from the path strip and worked at any
  time. Only a step's own real inputs and authority limit its action (S156). The suggestion never
  disables another control.
- **R-S247-7 — Focus view and Full view stay.** The lease view control offers Guided view, Focus
  view and Full view. Guided view is selected on every open. Focus view and Full view keep their
  present content and behavior. The guided view lists the five existing sections as links that open
  Full view at that section, so every existing control stays one action away. Lease information
  stays (D-OP-6).
- **R-S247-8 — Staff status and notes.** The stage is derived. The manual work status stays
  available as "Set status by hand" with the Status log, and a hand-set status that differs from the
  derived stage shows both in one line. "Add a note" sits on the Now card.
- **R-S247-9 — Keeps its place.** A lease opens in the same tab. After a reload or a release the
  page returns to the same view, step and scroll position, and unsaved typing is kept by the
  existing autosave and retained-input behavior. A reload retains the complete focused text
  field in that tab for that lease. A unique visible field name also identifies it when a
  generated ID changes; ambiguous fields keep their current values. If the person resumes typing or navigating before restoration,
  their newer input and focus take precedence. Password and choice controls are never retained.
  The existing Full and Guided financial controls share the latest local working entry for
  their field. A view or step change keeps that entry local; the ordinary completed-field save
  or the message action that uses it persists it. An older acknowledgment confirms only its
  own entry, so newer typing keeps its unsaved feedback until its own save succeeds.
- **R-S247-10 — Fits the screen.** At 1280 by 800 the header, path strip and the Now card's primary
  action are visible without scrolling for the first four steps. At 390 wide the primary action is
  within two screen heights. Both themes, keyboard order and status announcements follow the
  existing design system. Full program names and all existing header controls stay visible as
  they wrap; compact spacing and shared phone-header rows keep the action within these bounds.
- **R-S247-11 — Old links still land.** Older lease links, `step` parameters, section anchors and
  help links keep working: a link that names a path step opens the guided view at that step, and a
  link that names a section or control opens Full view there.

**In scope / out of scope.**

In scope: the path definition, the single stage projection, the guided view with its path strip,
Now card and section links, the three-way view control, link compatibility, layout and continuity. Out of scope: new business rules, new stored
progress, forced stages, removing any control, the rules that derive a stage from evidence (S248),
what is prepared ahead (S249), and Communications scheduling features.

**Open questions & assumptions.**

- D-OP-6 (owner decision, November 5, 2026): the guided page is the default, Focus view and Full
  view remain selectable, and a lease opens in the same tab.
- Assumption: the new view is labeled "Guided view". A view chosen by hand lasts for that visit and
  survives a reload; the next lease opens in Guided view again.
- Consequence to accept: three views of one lease are maintained, documented and tested.
- Assumption: stage names reuse the eleven existing work-status labels so staff vocabulary and
  stored statuses keep their meaning.
- Assumption: "Also needs you" lists only ready work that sits outside the main path (for example
  a source difference to settle), never the nineteen-item list observed today.

**Cross-product impacts.**

`components/lease-renewal/RenewalWorkspace.tsx`, `components/lease-renewal/RenewalFocusViewPane.tsx`,
`components/lease-renewal/RenewalFocusViewContext.tsx`,
`components/lease-renewal/RenewalWorkspaceSidebars.tsx`,
`components/lease-renewal/RenewalDashboardNavigation.tsx`,
`components/lease-renewal/RenewalManualWorkspace.tsx`,
`components/lease-renewal/RenewalWorkStatusControl.tsx`, `lib/lease-renewal/renewal-actions.ts`,
`lib/lease-renewal/desk-guidance.ts`, `lib/lease-renewal/lease-work-status.ts`,
`lib/lease-renewal/workspace-state.ts`, `lib/lease-renewal/renewal-process.ts`, the assistant's
renewal adapter, My Work lease links, the control map `lib/help/content/renewal-control-map.json`,
the Focus and guide-control smokes, the release canary landmarks and the help content (S252).

**Authority and evidence map.**

| Input                                                             | Classification       | Use and limitation                                                                   |
| ----------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| `AGENTS.md`, `docs/facts.md` (D-RENEWAL-STAFF-OPERATIONS, F-S156) | Authority            | Guidance is advisory; no forced stage, approval or role handoff returns.             |
| Committed code and tests at `6491c06f`                            | Implementation truth | Present views, three next-step systems, sections and handlers.                       |
| Read-only production lease observation, November 5, 2026          | Bounded observation  | One lease page's presentation; not a proof of failure handling or every state.       |
| November 4 staff walkthrough notes and November 5 owner direction | Intent evidence      | One entry, one route, the next step evident, nothing gated.                          |
| Human acceptance                                                  | External dependency  | Staff verdict stays NOT RUN until S252 runs it; the code slice does not wait for it. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S247-1** — One path definition and one stage projection are consumed by the desk row, the
  lease page and the assistant. Fail-first: a fixture where the staff summary, desk guidance and
  action graph name different next steps renders all three.
- **ARCH-S247-2** — The Now card mounts the existing controls for path steps, Focus view and Full
  view are unchanged, and every row of the control map stays reachable from the guided view in at
  most one action. Fail-first: path steps whose controls are reachable only through Full view.
- **ARCH-S247-3** — The path stores nothing and gates nothing: no new progress field, and no control
  is disabled because of path position. Fail-first: not applicable to storage; the gating check is a
  preservation of S156 that must stay green.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S247-1** — Opening a lease with nothing recorded shows the first applicable step on the Now
  card with its controls usable in place.
- **BEH-S247-2** — Choosing a later step from the path strip and completing it works with earlier
  steps unfinished.
- **BEH-S247-3** — Every control in the control map is reachable through the Now card or Full view,
  Focus view and Full view render as before, and older links and anchors open the matching step or
  section.
- **BEH-S247-4** — For fixtures at every stage, the desk row, the lease page and the assistant show
  the same stage and next step.
- **BEH-S247-5** — After a reload the page shows the same view, step and position, with unsaved
  typing kept.

**Human litmus outcome.**

### Open a lease and know what to do

**If this was built correctly:** A staff member opens a lease and can say in one breath where it
stands and what to do next. The thing to do is on the screen with its button. They can jump to any
other step or tool without being stopped, and after a refresh they are where they left off.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                       | Architecture outcome | Behavior outcome | Human litmus                     | Deterministic evidence / falsification                                        |
| --------------------------------- | -------------------- | ---------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| R-S247-1 one path definition      | ARCH-S247-1          | BEH-S247-1       | Open a lease and know what to do | Definition test: seven steps, each with handler and completion predicate.     |
| R-S247-2 variants in the path     | ARCH-S247-1          | BEH-S247-4       | Open a lease and know what to do | Agreement, non-renewal, month-to-month and assistance fixtures.               |
| R-S247-3 one stage everywhere     | ARCH-S247-1          | BEH-S247-4       | Open a lease and know what to do | Parity test across desk row, lease page and assistant for each stage.         |
| R-S247-4 the Now card holds work  | ARCH-S247-2          | BEH-S247-1       | Open a lease and know what to do | Each path step's primary action is operable on the Now card in a browser run. |
| R-S247-5 waiting is a state       | ARCH-S247-1          | BEH-S247-4       | Open a lease and know what to do | Waiting fixtures render party, since, last contact and offered actions.       |
| R-S247-6 nothing is gated         | ARCH-S247-3          | BEH-S247-2       | Open a lease and know what to do | Complete a later step with earlier steps unfinished; no disabled-by-order.    |
| R-S247-7 Focus and Full view stay | ARCH-S247-2          | BEH-S247-3       | Open a lease and know what to do | Control-map reachability over every row; Focus and Full view render parity.   |
| R-S247-8 staff status and notes   | ARCH-S247-3          | BEH-S247-4       | Open a lease and know what to do | Hand-set status differing from the stage shows both; log entries unchanged.   |
| R-S247-9 keeps its place          | ARCH-S247-2          | BEH-S247-5       | Open a lease and know what to do | Reload during typing restores view, step, scroll and text.                    |
| R-S247-10 fits the screen         | ARCH-S247-2          | BEH-S247-1       | Open a lease and know what to do | Viewport checks at 1280 by 800 and 390 wide in both themes.                   |
| R-S247-11 old links still land    | ARCH-S247-2          | BEH-S247-3       | Open a lease and know what to do | Older lease URL, each `step` value and each section anchor.                   |

**Preservation set.**

Focus view and Full view themselves (S143, S152) with the S145 validation ledger, every S113
section and control, the S144 in-pane handlers and their completion predicates, S142 dependency
facts as inputs, S152–S167 behavior, S176 concise copy, S232 issue resolvers and links,
S234 approval evidence, S235–S237 panels, control identifiers used by help and tests, the staff
work status and Status log records, exact confirmation and receipt contracts for every external
effect, and role checks.

**Adversarial acceptance checks.**

- **AC-S247-1** — A fixture built so the three existing next-step sources disagree renders exactly
  one stage and one next step on the desk row, the lease page and the assistant (ARCH-S247-1,
  BEH-S247-4).
- **AC-S247-2** — Every row of the control map is reachable and operable from the guided view in at
  most one action, no path step reads that its controls are elsewhere, and Focus view and Full view
  render as they did before this suite (ARCH-S247-2, BEH-S247-3).
- **AC-S247-3** — With no owner response recorded, the tenant offer, the source updates and
  completion can each be worked from the path strip; no control is disabled by order
  (ARCH-S247-3, BEH-S247-2).
- **AC-S247-4** — Opening, choosing a step, switching views and reloading cause zero domain or
  provider effects (BEH-S247-5).

**Forbidden actions / hard gates.**

No forced stage, approval checkbox or attestation. No removed control or view. No new stored step
counter. No data change from viewing, choosing a step or switching views. No protected-path change.

**Dependencies / sequencing.**

Consumes S142 and S156 projections, S232 guidance, and S246 for the desk row. S248 supplies the
evidence rules that move the stage; S249 supplies what the first steps show ready; S250 and S251
supply variants. Each of those degrades cleanly when absent: the stage then follows the staff
record alone and the Now card shows the existing controls.

**Standalone delivery contract.**

- **Deliverable now:** R-S247-1 to R-S247-11 with the path definition, projection parity tests,
  browser checks, updated smokes and canary landmarks.
- **Consumes, but does not assume:** S248 evidence (absent: staff record only), S249 prepared
  content (absent: existing controls), S250 and S251 variants (absent: standard path).
- **Externally blocked effect:** none for the code slice; the staff verdict waits for S252.
- **Produces for downstream suites:** the path definition, the stage projection and the Now card
  slots that S248–S251 fill.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and take a read-only lease page observation.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the path definition and projection, then the guided view over the existing controls,
   leaving Focus view and Full view as they are.
4. Falsify, run focused and canonical tests, update smokes, canary landmarks and help content, and
   ship only when authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts. Focus view and
Full view remain delivered contracts; keep S142–S145, S152 and S156 history.
