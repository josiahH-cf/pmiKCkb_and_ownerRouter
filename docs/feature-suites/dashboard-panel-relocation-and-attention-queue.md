<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: ai-first-dashboard-batch-004 -->

# S147 — Dashboard panel relocation and compact attention queue

> Intake: ready, batch 004 item 014. Relocation and queue scope over existing destinations; implementation and release not started.

**Goal.**

Operational panels leave the Dashboard for the sections that own them, without losing information or actions, and the Dashboard keeps one compact queue of the signed-in user's genuine approvals and attention items, secondary to AI.

**Current state / intended end state.**

Verified at `23c79dac`: below the composer, `components/console/ConsoleView.tsx` renders `ConsoleActionDeck` (“What needs your attention”: “Needs your decision”, “Connections to set up”, “Process setup”), `ConsoleAnticipatedWork` (“Anticipated work”), `ConsoleProcessStrip` (“Processes”) and `ConsoleLiveDataPanel` (“Live operations”). An earlier owner decision (D-3) kept the decision and setup cards on the Dashboard and mirrored them in Notifications; item 014 supersedes it for the Dashboard. Existing destinations: decisions in `/approval-queue` (renewals scope only) and `/notifications` (which also carries maintenance queue items); connections in `/connections`, which uses verified checks and stored records while the Dashboard card checks only whether settings exist; process setup and processes in `/spaces` (Internal Processes) and `/processes`. Anticipated work renders nowhere else, and Live operations (the first 30 rows of the RentVine export) only on the Dashboard, while the renewal desk is the authoritative view of the same lease facts. The decision count comes from `lib/attention/decision-backlog.ts` through `lib/approval/needs-decision-inbox.ts`, runs only for users with renewals access (others see 0), falls back to the all-clear message when a read fails, and does not refresh after an inline approve. Intended end state: the Dashboard holds the AI workspace (S146) plus one compact attention queue; every moved capability is reachable through ordinary navigation at its owner.

**Actors and entry conditions.**

Signed-in users with their existing roles and Space access. Approve stays limited to the users and items the current rules allow; view access never implies approval authority.

**What it is / how it functions.**

Destinations, decided with current evidence and the owner's 2026-10-01 placement choice:

| Dashboard content                    | Destination                                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Needs your decision                  | Full list stays in `/approval-queue` and `/notifications`. The Dashboard keeps compact entries for the user's actionable or attention items only.                                 |
| Connections to set up, Process setup | `/connections` (verified status is authoritative) and `/spaces` cards. Add a needs-setup view to `/connections` if the summary is otherwise lost. Not attention items by default. |
| Anticipated work                     | Internal Processes (`/spaces`), beside each process's Start run, keeping the caption that the counts use default notice rules (owner decision 2026-10-01).                        |
| Processes                            | `/spaces` and `/processes` already hold a superset; remove the strip and the composer picker (S146).                                                                              |
| Live operations                      | Retire the Dashboard panel; the renewal desk and its navigation carry the same lease facts. Record any detail found to be unique before removing it.                              |

The compact queue reuses the existing eligibility, dedup keys and inline Approve with its server re-check. It shows identity, reason and a link to the normal review surface, covers the user's actual scopes (including maintenance items where today only Notifications shows them) rather than a fabricated zero, keeps empty, unavailable and partial states distinct, refreshes after an inline approve, and never blocks the composer. A capability with no valid destination keeps only the smallest secondary entry point below the AI workspace, recorded here with its reason.

**In scope / out of scope.**

In scope: removing the five panels from the Dashboard, integrating missing information or controls at their owners, the compact queue and its states, and navigation reachability. Out of scope: new approval engines or automatic approvals, a new product area, renaming routes, collapsing panels instead of moving them, and changing the business behaviour of renewal, staff-work, process or Admin screens.

**Open questions & assumptions.**

No intake-blocking question. Owner decision 2026-10-01: Anticipated work moves to Internal Processes. Working assumption: Live operations carries no essential capability beyond the renewal desk; if implementation finds one, the narrow exception applies and is recorded once. “Internal Processes” is the user-facing name for Spaces; routes are not renamed.

**Cross-product impacts.**

`ConsoleView` and its console components, `app/spaces/page.tsx`, `app/connections/page.tsx`, `app/approval-queue/page.tsx`, `app/notifications/page.tsx`, `lib/anticipation/projection.ts`, `lib/console/rentvine-live-provider.ts`, S84 navigation and terminology tests, console and approve-button tests, and process-audit cases. S95 and the Dashboard row of S87 are superseded by this suite and S146.

**Authority and evidence map.**

| Input                                                                 | Classification                | Use and limitation                                                             |
| --------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Router, console, approval, notification and navigation code and tests | Authority / verified baseline | Current panels, eligibility, dedup and destinations.                           |
| Source item 014 and the owner's 2026-10-01 placement choice           | Owner intent / decision       | Panels move; the queue stays; Anticipated work goes to Internal Processes.     |
| Destination screens at implementation time                            | Implementation evidence       | Confirms each moved function is reachable with the same permissions and links. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S147-1** — Each moved panel's information and actions are owned by its destination and reachable through ordinary navigation; a reachability fixture fails while Anticipated work exists only on the Dashboard.
- **ARCH-S147-2** — The compact queue is a projection of the existing eligibility and dedup rules with distinct empty, unavailable and partial states; a failed-read fixture fails against today's all-clear fallback.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S147-1** — The Dashboard shows only the AI workspace and the compact queue; the named panels are absent, not collapsed.
- **BEH-S147-2** — A queue entry opens its normal review surface, inline Approve works only where the current rules allow it, and the queue refreshes afterwards.

**Human litmus outcome.**

### Find moved work where it belongs

**If this was built correctly:** A staff member sees an uncluttered Dashboard with their real pending decisions, and still finds connections, process setup, anticipated work and live lease detail in the sections they expect. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement            | Architecture outcome | Behavior outcome | Human litmus                     | Falsification                                                                |
| ---------------------- | -------------------- | ---------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| Relocate without loss  | ARCH-S147-1          | BEH-S147-1       | Find moved work where it belongs | Destination reachability, permissions and record links per moved function.   |
| Truthful compact queue | ARCH-S147-2          | BEH-S147-2       | Find moved work where it belongs | Empty, failed, partial, duplicate, view-only and maintenance-scope fixtures. |

**Preservation set.**

Approval eligibility, inline approve request shape and server re-check, Notifications lanes, `/approval-queue`, `/connections` setup controls (Admin-only), Internal Processes run start, the renewal desk, S84 navigation groups and role visibility.

**Adversarial acceptance checks.**

- **AC-S147-1** — Needs your decision, Connections/Setup, Anticipated work, Processes and Live operations are absent from the Dashboard as panels (not hidden or collapsed), and each useful function is reachable at its destination with the same permissions.
- **AC-S147-2** — Any retained Dashboard entry point names a genuinely unmapped essential capability and stays secondary to the AI workspace.
- **AC-S147-3** — The queue lists only eligible, accessible pending items, once each, with correct links and action authority; it never shows setup, planning or process catalogs.
- **AC-S147-4** — Empty, unavailable and partial queue states are distinct, a failed read never shows a fabricated count, and a queue failure never prevents asking AI.

**Forbidden actions / hard gates.**

No new approval engine or automatic approval, no change to who may approve, no business-behaviour change at destinations, no route renames, and no collapsed copies of the old panels.

**Dependencies / sequencing.**

Ships with S146 so no capability loses its only entry point. Independent of S148–S150. S95 and the Dashboard part of S87 are superseded; their files remain provenance only.

**Standalone delivery contract.**

Deliver the relocations, the compact queue and their tests. A destination gap found during implementation is closed at the destination or recorded as the narrow exception.

**Verification and delivery contract.**

Record each panel's current information, actions, permissions and links before code changes, then fail-first reachability, queue-state and dedup tests. Run focused tests and canonical `bash scripts/verify.sh` under an authorized execution run; audit the exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Inventory each Dashboard panel's information, controls, permissions and links at the latest source.
2. Record fail-first reachability, queue-state and duplicate cases.
3. Move Anticipated work to Internal Processes, close destination gaps, build the compact queue and remove the panels.
4. Falsify navigation, permission and queue regressions and report exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after S151 and serving evidence show the relocated functions and the compact queue are owned by code, tests and current facts.
