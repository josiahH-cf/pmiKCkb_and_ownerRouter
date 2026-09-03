<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S110 — Dashboard assistant V1: three read-only intents

> Status: Specified from the 2026-09-03 owner package; not implemented. This is the first executable
> slice of the S88 query boundary, the S90 work adapter, and the S91 renewal adapter, limited to three
> intents. S88–S95 remain the full contracts; S93 streaming and S94 actions stay out.

**Goal.**

A signed-in staff user asks, on the Dashboard, what work is assigned to them today, what renewal
blockers they have, and which renewals come up next month or in another supported near-term period,
and receives the same records as the owning views, with links and honest completeness, without any
write.

**Current state / intended end state.**

| Package requirement (PMI-10)                    | Classification    | Evidence                                                                                                                      |
| ----------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Keep the Dashboard input experience             | Already satisfied | `/` renders `ConsoleView` with `AskForm` (`components/console/ConsoleView.tsx`, `components/ask/AskForm.tsx`)                 |
| Map questions to bounded queries                | Missing           | `/api/ask` answers from Vertex Search and Gemini (`lib/ask/service.ts`); `lib/processes/intent.ts` matches process names only |
| Signed-in assignment scope                      | Already satisfied | `GET /api/work?view=mine` returns the actor's `WorkAccountabilitySnapshot`                                                    |
| Same renewal data, blockers, rent, term, dates  | Partially         | `loadLiveRenewalDesk` and desk query v2 exist; page orchestration is not yet a reusable read service (S91 gap)                |
| Concise results with identity, status, link     | Missing           | `AskResponseSchema` has no structured items                                                                                   |
| One clarification; bounded unsupported response | Missing           | None                                                                                                                          |
| Disclose source failure                         | Partially         | Desk exposes typed auxiliary failures; Ask app-state converts failures to empty                                               |
| Read-only                                       | Partially         | Ask can start a workflow run through the process picker (S88 notes it); V1 path must not                                      |

Intended end state: `runAssistantQuery` (S88 boundary) with a three-intent registry, two adapters
over the owning services, a structured result envelope with links and completeness, and the
Dashboard `AskForm` routing those intents before the knowledge path.

**Actors and entry conditions.**

An authenticated managed Editor, Approver, or Admin with `read`. `renewal.*` intents require
Renewals Space access and produce the existing non-enumerating denial otherwise. The request carries
only the question text.

**What it is / how it functions.**

1. **Intent registry.** `lib/assistant/intents.ts` (versioned, closed): `work.assigned_today`,
   `renewal.blocked`, `renewal.window`. A deterministic matcher with a representative-language
   corpus maps phrasings; `renewal.window` parses `next month`, `this month`, or an explicit
   `YYYY-MM` in the Kansas City calendar; an ambiguous period returns one clarification.
   Anything else returns the bounded unsupported response listing the three question types.
2. **Adapters.** `work.assigned_today` calls `WorkAccountabilityStore.listSnapshot(actor, "mine")`
   and filters to tasks assigned to the actor that are open, due today or overdue, or blocked.
   `renewal.blocked` and `renewal.window` call a new server-only `loadRenewalAssistantSource` that
   extracts the current desk-page orchestration (progress, notice rules, resolutions, packet
   snapshots, follow-up sources) and returns the same `DeskLeaseRow` projection, filtered by
   `isBlocked` or by end date or `nextReviewIso` within the requested month.
3. **Result envelope.** `{ intent, items[], appliedFilters, completeness, sourceState, links }`
   where each item carries the record id, title, the most useful status or date, blocker labels,
   and an exact owning link (`/work`, `/lease-renewal/live/desk?...v2`, workspace href).
   `completeness` is `complete`, `partial`, or `unavailable` from the owning read; a failure is
   never an empty success.
4. **Route and UI.** `POST /api/assistant/query` validates the versioned request, runs the boundary,
   and returns the envelope; `AskForm` submits the question there first and renders items with links
   before falling back to the existing knowledge answer for non-matching questions. No process
   picker or capture applies to a matched intent.
5. **Zero-write proof.** A test spies the action gate, executors, Firestore writers, and Gmail
   clients across all three intents and unsupported input.

**In scope / out of scope.**

In scope: registry, matcher, two adapters, source extraction, envelope, route, form routing, tests.
Out of scope: maintenance, communications, connections, admin, analytics intents, narration,
streaming, actions, transcript retention.

**Open questions & assumptions.**

None. S93/S94/S95 continue to own their later UI and action contracts.

**Cross-product impacts.**

Dashboard/Ask form, new assistant route, work accountability read, desk-page orchestration
(extracted, unchanged behavior), S88/S90/S91 status, S111 proof.

**Authority and evidence map.**

| Input                                                    | Classification                   | Use and limitation                                                        |
| -------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `AGENTS.md`, S88, S90, S91, committed Ask/work/desk code | Authority / implementation truth | Closed intents, actor-scoped adapters, zero mutation, owning-page parity. |
| Owner package PMI-10 and 2026-09-03 direction            | Intent evidence                  | Exactly three read-only intents now.                                      |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S110-1** — One `runAssistantQuery` boundary and closed registry; a fixture asking an
  unsupported question fails today (routes to the knowledge answer) and returns the bounded response
  after.
- **ARCH-S110-2** — `loadRenewalAssistantSource` and the desk page share one orchestration; a parity
  test comparing desk rows to adapter items fails until extracted.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S110-1** — `What work is assigned to me today?` returns the actor's My Work records and
  links.
- **BEH-S110-2** — `What renewal blockers do I currently have?` returns the desk's blocked rows with
  the same blocker labels; `next month` returns the same rows as the desk `month` filter including
  periodic-review rows.
- **BEH-S110-3** — Phrasing variations map to the same intent; a source failure reports
  `unavailable`; no write occurs.

**Human litmus outcome.**

### Ask the Dashboard three questions

**If this was built correctly:** A staff member types a question about their work today, their
renewal blockers, or next month's renewals and gets a short list with links to the same items they
would find on the work page or the renewal table. Other questions get a short note listing the three
supported questions.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with parity, corpus,
  zero-write, and rehearsal-browser evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                           | Architecture outcome | Behavior outcome | Human litmus                      | Deterministic evidence / falsification |
| ------------------------------------- | -------------------- | ---------------- | --------------------------------- | -------------------------------------- |
| AIV1-01 my work                       | `ARCH-S110-1`        | `BEH-S110-1`     | Ask the Dashboard three questions | Snapshot parity fixture                |
| AIV1-02, AIV1-03 renewals             | `ARCH-S110-2`        | `BEH-S110-2`     | Ask the Dashboard three questions | Desk parity fixtures                   |
| AIV1-04, AIV1-05 phrasing/unsupported | `ARCH-S110-1`        | `BEH-S110-3`     | Ask the Dashboard three questions | Corpus and unsupported fixtures        |
| AIV1-06, AIV1-07 failure/zero write   | `ARCH-S110-2`        | `BEH-S110-3`     | Ask the Dashboard three questions | Failure and spy fixtures               |

**Preservation set.**

Ask service, route, form, capture, and live-target tests; work accountability store and privacy
sentinel; desk page and query suites; `tests/e2e/ask.e2e.test.mjs`.

**Adversarial acceptance checks.**

- **AC-S110-1** — `ARCH-S110-1`: the client cannot supply actor, role, Space, intent, or filters.
- **AC-S110-2** — `BEH-S110-3`: no intent path invokes a write, run start, draft, or provider call.
- **AC-S110-3** — `ARCH-S110-2`: an actor without Renewals access receives no lease count or label.
- **AC-S110-4** — A failed renewal read cannot render `no renewals`.

**Forbidden actions / hard gates.**

No natural-language write, no workflow start, no generic query language, no model-authored fact,
no transcript retention.

**Dependencies / sequencing.**

After S102–S104 and S108 projections; before S111. Consumes S103's periodic-review rows.

**Standalone delivery contract.**

- **Deliverable now:** registry, matcher, adapters, source extraction, envelope, route, form
  routing, tests.
- **Consumes, but does not assume:** a configured model provider (not needed).
- **Externally blocked effect:** none.
- **Produces for downstream suites:** the S88 boundary and S91 read service for S92–S95.

**Verification and delivery contract.**

1. Freeze parity, corpus, unsupported, and zero-write fixtures failing for the expected reason.
2. Run focused assistant, work, desk, and form checks plus a rehearsal-browser question walk.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` (not
   expected).

**Ordered prompt sequence.**

1. Re-verify Ask, work, and desk orchestration.
2. Materialize fail-first fixtures.
3. Implement boundary, adapters, envelope, route, form routing.
4. Run focused and canonical checks; update S88/S90/S91 status and current docs.

**Deletion/merge recommendation.**

Merge into S88/S90/S91 once those suites absorb the delivered slice.
