<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S286 — Work renewals on the Renewal Desk: renewal Spaces show guidance and start no runs

> Status: DELIVERED at ba9a64f6, intake 164. Chunk 1 run `a6f14bac-7edd-4db2-ab94-93f0875dc1ee`.

**Goal.**

Renewal work has one place, the Renewal Desk. The three renewal Spaces show their
published process as guidance with a link to the desk, start no checklist runs, and no
longer read as broken or wait on a staffing answer nobody needs.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- Three Spaces map to renewal processes: Lease Renewals, Owner Renewal Outreach + Comp
  Lookup, and Tenant Renewal Notice + DotLoop Follow-Up (`lib/spaces.ts`). Each Space
  page carries the run panel with "Start run" and a step checklist
  (`components/desk/SpaceDeskRunPanel.tsx`).
- A run's checklist repeats the lease path as steps a person ticks by hand, apart from
  the lease's own recorded state. A run's next action also appears on the run page, the
  Space card, the process summary and shared context.
- A new run takes its owner from the definition's default approver
  (`lib/firestore/workflows.ts`). The owner-renewal process is published as Active
  version 1 with six steps, three source links and zero runs, and its owner and default
  approver are still seeded placeholders. A Start is refused while they are, with "This
  process still carries placeholder owner or approver assignments." The Space panel
  shows only "Could not start a run."
- A mapped Space with no stored definition reads "Needs a process" in the blocked tone,
  and the Lease Renewals card keeps that tone under its overridden label "Lease work and
  review" (`lib/space-card-state.ts`).
- The hold B-PROCESS-OWNER asked the client who owns the internal process and who should
  receive newly started owner-outreach checklists.

In the November 12 rehearsal the renewal Spaces showed red "Needs a process" cards beside
a desk that held all the real work, and Start run answered "Could not start a run."
(audit finding A-15).

S241 R-S241-6 and S256 BEH-S256-2 kept runs for the renewal processes. The owner's
November 12, 2026 direction retires them for the three renewal Spaces. S241, S256 and
S267 are amended in place, the hold B-PROCESS-OWNER is retired in the blocker packet,
and each names this suite. Publication, versions and the process content stay.

Intended end state: a renewal Space page reads as "how this work is done" with a link to
the desk; no control or route starts a run for a renewal process; existing runs, if any,
stay readable as records; the cards state the truth in a neutral tone; and nobody is
asked to name a run owner.

**Actors and entry conditions.**

Any staff member with access to a renewal Space reads its guidance. Admins and approvers
keep reviewing and publishing the process content. No capability changes.

**What it is / how it functions.**

- **R-S286-1 — Show the process as guidance.** On the three renewal Spaces the page
  shows the published process's steps and source links read only under "How this work is
  done", with one primary link, "Open the Renewal Desk". There is no Start run control
  and no checklist control. With no published process the page reads "Renewals are
  worked on the Renewal Desk." with the same link.
- **R-S286-2 — Refuse a renewal run on the server.** The run start route refuses the
  three renewal process definitions for every caller with "Renewal work is done on the
  Renewal Desk. This process is guidance." and creates nothing. Every other process
  starts runs as it does today (S283 R-S283-4).
- **R-S286-3 — Keep earlier runs as records.** A run of a renewal process that already
  exists stays readable with its pinned version, steps, checks and history (S241
  R-S241-6). Its checklist is read only and says "This run is kept as a record. Renewal
  work continues on the Renewal Desk." It no longer supplies a next action to My Work,
  the Space card, the process summary or shared context. No run is deleted, completed
  or cancelled by this change.
- **R-S286-4 — Give the renewal Space cards a truthful state.** A renewal Space card
  reads "Guidance" when its process is published and "Worked on the Renewal Desk" when
  it has none, in the neutral reference tone, never "Needs a process" in the blocked
  tone. The connection check keeps its own state and comes first, as today.
- **R-S286-5 — Keep publication and stop asking for a run owner.** Review, publication,
  versions and rollback of the renewal process content are unchanged (S241). On the
  three renewal definitions the form shows the run owner and default approver as "Not
  used: this process starts no runs" and does not require them. Stored values are kept.
- **R-S286-6 — Point newcomers to the desk.** Task navigation offers the Renewal Desk to
  work leases and the matching process to read how the work is done. It no longer says
  the process can be run (S256 BEH-S256-2 as amended).

**In scope / out of scope.**

In scope: the three renewal Space pages and cards, the run start refusal for their
definitions, read-only earlier runs, the two definition fields and the navigation
wording. Out of scope: runs and checklists for every other Space, deleting any run or
definition, the process content and its publication, person assignment for renewals
(S280 uses own sends only), and the desk itself.

**Open questions & assumptions.**

The owner directed that the proposal to retire process runs be carried. The specifics
below are the author's inference and can be changed before a launch:

- Assumption: all three renewal Spaces are covered. The audit named the owner and tenant
  Spaces; Lease Renewals is included because its card already points to lease work.
- Assumption: earlier runs are kept and made read only, not closed. Production held zero
  runs of these processes at the November 4, 2026 readback; the count is read again at
  delivery and reported.
- Assumption: the card wording is "Guidance" and "Worked on the Renewal Desk".

**Cross-product impacts.**

The Spaces page and its cards, the Space desk page and run panel, the run start route,
run pages and their step routes, My Work and shared context next actions, the process
definition form, task navigation and its Help, the blocker packet and the control map.

**Authority and evidence map.**

| Input                                                                                                             | Classification                   | Use and limitation                                                                                         |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Owner direction of November 12, 2026, to carry every audit proposal and retire the rules that held them           | Owner decision                   | Authority to retire run controls for renewals and the hold B-PROCESS-OWNER. The specifics are assumptions. |
| S241 R-S241-6, S256 BEH-S256-2 and S267 R-S267-2 as amended on November 12, 2026                                  | Active contracts                 | Publication and history kept; no new renewal run; navigation points to the desk.                           |
| `lib/spaces.ts`, `lib/space-card-state.ts`, `lib/firestore/workflows.ts`, `components/desk/SpaceDeskRunPanel.tsx` | Committed implementation (trace) | Present Space map, card states, run start and panel. Re-verify before editing.                             |
| Staff workflow audit of November 12, 2026, finding A-15                                                           | Intent evidence only             | Observed on synthetic data in the guarded rehearsal.                                                       |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S286-1** — One list names the process definitions that are guidance only. The
  run start service checks it before any write, and the Space page, the card state and
  the definition form read the same list. A route test that starts a run for a renewal
  definition with real staff recorded fails on the starting state, which creates one.
- **ARCH-S286-2** — A run of a guidance-only definition is excluded from every next
  action projection and its step routes refuse changes, while its read path is
  unchanged.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S286-1** — The Owner Renewal Outreach Space shows its six published steps as
  guidance with "Open the Renewal Desk" and no Start run.
- **BEH-S286-2** — A direct request to start a run for any of the three renewal
  definitions is refused with the staff sentence, and no run exists afterward. A run on
  another Space still starts.
- **BEH-S286-3** — An earlier renewal run opens read only with its history and appears
  in no next action list.
- **BEH-S286-4** — The three renewal cards read "Guidance" or "Worked on the Renewal
  Desk" in the neutral tone, and no renewal card reads "Needs a process".

**Human litmus outcome.**

### One place to work a renewal

**If this was built correctly:** A staff member who opens a renewal Space reads how the
work is done and follows one link to the desk where the leases are. Nothing on that page
asks them to start or tick a second checklist, and no card says a process is missing.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome | Human litmus                | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------- | --------------------------- | --------------------------------------------------------------------------- |
| R-S286-1 process shown as guidance            | ARCH-S286-1          | BEH-S286-1       | One place to work a renewal | AC-S286-1. Rendered Space page with and without a published process.        |
| R-S286-2 renewal run refused                  | ARCH-S286-1          | BEH-S286-2       | One place to work a renewal | AC-S286-2. Route refusal for three definitions; another Space still starts. |
| R-S286-3 earlier runs kept as records         | ARCH-S286-2          | BEH-S286-3       | One place to work a renewal | AC-S286-3. Read path, refused step change and next action lists.            |
| R-S286-4 truthful card state                  | ARCH-S286-1          | BEH-S286-4       | One place to work a renewal | AC-S286-4. Card label and tone in each definition state.                    |
| R-S286-5 publication kept, no run owner asked | ARCH-S286-1          | BEH-S286-1       | One place to work a renewal | AC-S286-5. Publish and rollback still work; fields not required.            |
| R-S286-6 navigation points to the desk        | ARCH-S286-1          | BEH-S286-1       | One place to work a renewal | AC-S286-1. Navigation and Help wording.                                     |
| Safety boundary across the requirements above | ARCH-S286-2          | BEH-S286-3       | One place to work a renewal | AC-S286-6. Nothing is deleted and no send, write or lookup happens.         |

**Preservation set.**

- `tests/unit/s241-process-content-and-conflict.test.ts`,
  `tests/unit/s241-publication-readback.test.ts` and
  `tests/unit/s241-publication-byte-review.test.ts`: content review, publication, the
  pinned version and its readback.
- `tests/unit/workflow-run-step-checks.test.ts` and
  `tests/unit/workflow-run-scope-access.test.ts`: checklists and access on every other
  Space.
- `tests/unit/space-card-state.test.ts`: every card state outside the renewal Spaces.
  The cases that expect "Needs a process" or a run-based state for a renewal Space are
  rewritten on purpose for R-S286-4.
- `tests/unit/space-desk.test.tsx` and `tests/unit/workflow-run-next-action.test.tsx`:
  the run panel and the next action for other Spaces. Cases that start or project a
  renewal run are rewritten on purpose for R-S286-1 and R-S286-3.

**Adversarial acceptance checks.**

- **AC-S286-1** — Falsify ARCH-S286-1 and BEH-S286-1. For each renewal Space, with a
  published process and with none, the page shows the guidance or the desk sentence, the
  desk link works, and no Start run or checklist control is in the page for Editor,
  Approver or Admin. Navigation and Help say read, not run.
- **AC-S286-2** — Falsify BEH-S286-2. Post a start for each renewal definition with
  placeholder staff and with real staff recorded: both are refused with the staff
  sentence and zero runs are created. A start on a non-renewal Space creates one run.
- **AC-S286-3** — Falsify ARCH-S286-2 and BEH-S286-3. Seed an open renewal run in the
  rehearsal. It opens with its pinned steps and history, a step change is refused, and
  it is absent from My Work, the Space card, the process summary and shared context.
  Its stored record is unchanged byte for byte.
- **AC-S286-4** — Falsify BEH-S286-4. With no definition, a draft, a published and a
  retired definition, each renewal card shows its label in the neutral tone. A missing
  connection still shows the connection state first. Other Spaces keep their states.
- **AC-S286-5** — Falsify R-S286-5. Save, publish and roll back a renewal definition
  with the two fields empty: accepted. The stored placeholder values of the existing
  definition are unchanged. A non-renewal definition still requires its fields.
- **AC-S286-6** — Safety. Count runs, definitions and versions before and after: equal.
  No message is sent and no provider is called by any check above.

**Forbidden actions / hard gates.**

No deletion, completion or cancellation of a run. No change to a published version or
its history. No run for a renewal process from any caller. No change to runs on other
Spaces. No person assignment invented. No protected path edit.

**Dependencies / sequencing.**

Standalone. S283 R-S283-4 covers the run start for Spaces that still run. S280 lists
renewal work for a person from their own sends. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The guidance page, the route refusal, read-only earlier runs, the
  card states, the definition fields and the navigation wording, with tests, Help rows
  and control map rows, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** A published process. Without one the page shows the
  desk sentence.
- **Externally blocked effect:** None. The staffing answer that B-PROCESS-OWNER asked
  for is no longer needed.
- **Produces for downstream suites:** One list of guidance-only definitions.

**Verification and delivery contract.**

1. Before editing, prove BEH-S286-1, BEH-S286-2 and BEH-S286-4 fail on the starting
   state for the expected reason, and record the preservation baseline separately.
2. Run focused unit, route and rendered checks for every ARCH, BEH and AC row on
   synthetic data.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates. Read
   and report the production count of runs for the three definitions.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the Space map, the card states, the run start and the panel.
2. Materialize the failing checks and the preservation baseline, including the pinned
   cases this suite rewrites on purpose.
3. Add the guidance-only list and the route refusal, then the Space page and cards, then
   read-only earlier runs, the definition fields and the navigation wording.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the guidance page, the refusal and the card states are represented by
verified code, tests and current facts.
