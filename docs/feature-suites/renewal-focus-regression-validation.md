<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-focus-batch-003 -->

# S145 — Validate Focus flow and preserve Full view

> Intake: ready, batch 003 item 012. Evidence join for S142–S144; not an extra approval stage or implementation authorization.

**Goal.**

Demonstrate that the new human-operated Focus path works through real app boundaries and that the existing comprehensive lease dashboard still behaves as before.

**Current state / intended end state.**

S113 full-dashboard, S127 guidance/focus, manual workspace, renewal lifecycle, role and exact-effect checks are deployed. No Focus view or batch 003 integration evidence exists. Prior S111/S132 and release checks cover their stated older scopes; they do not prove this new path or a human verdict. End state: focused dependency, end-to-end and preservation evidence for the actual implementation, with tested environment and any unverified live seams named precisely.

**Actors and entry conditions.**

Use authorized staff/role scopes and current lease/cycle access. Controlled non-production records exercise effects, failures and concurrency. Authorized read-only live checks may confirm serving UI/config only within the execution run; no synthetic production customer or test send.

**What it is / how it functions.**

Before implementation edits, capture the current full-view DOM/control/section/copy behavior with existing fixtures and identify actual lifecycle branches. Build checks with S142–S144 rather than at the end. Exercise all-of/alternative/branch/misordered/cycle/missing-reference graph cases through the shared projection and relevant server preconditions; verify current versus historical cycles, roles, concurrent edits, stale/unavailable sources and independent ready work. Walk applicable current renewal paths from several starting states through in-pane information, preparation, verification, reviewed communication/handoff, manual/external waiting, follow-up and existing completion. Include reload, switch with dirty input, Gmail return, duplicate submission, ambiguous effect and late source refresh. Compare persisted values and completion/evidence meanings between views. Preserve the full dashboard default, sections, TOC, forms, navigation, copy output and responsive/keyboard behavior on the same fixture before/after. Distinguish fixture, backend, compiled browser, live readback and observed human evidence.

**In scope / out of scope.**

In scope: targeted tests and in-batch correction for S142–S144, one evidence map in the existing loop. Out of scope: a separate approval/release program, restart of earlier batches, invented production test data, provider-key activation or permission to send.

**Open questions & assumptions.**

No intake-blocking question. The future implementation run must enumerate supported actual branches and current form controls before claiming coverage. Environment or provider gaps are explicitly unverified, not waived. A human observer is useful for usability but no new mandatory human signoff is created by intake.

**Cross-product impacts.**

Renewal desk/workspace, S142 projection, S143 pane, S144 controls, lease/cycle stores, backend routes, Gmail handoff, existing test/browser facilities, current facts/status/loop records and authorized release gates.

**Authority and evidence map.**

| Input                                           | Classification                | Use and limitation                                                                         |
| ----------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Router, current code/tests and serving revision | Authority / verified baseline | Existing Full view and effect contracts; their past gates do not verify Focus.             |
| Source item 012                                 | Owner intent                  | Required integrated scenarios and regression comparison; no extra phase consent.           |
| Future test/live/human results                  | Required evidence             | Record exact environment, actor, path and limit; mocks cannot prove a production provider. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S145-1** — Tests exercise the shared action projection, actual UI/server/persistence seams and pre-existing Full-view contracts, not a hard-coded demonstration sequence; coverage matrix fails against the current single-view source.
- **ARCH-S145-2** — A single loop evidence map ties every acceptance check to scope, environment, result and residual limit, preserving fixture versus live and staff versus provider distinctions.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S145-1** — Applicable branches progress in pane after confirmed state, survive failures/re-entry/concurrency and agree with Full view without duplicate or unapproved effects.
- **BEH-S145-2** — Full view stays default and preserves content, TOC, copy output, forms, roles and navigation while switch/focus remains accessible and effect-free.

**Human litmus outcome.**

### Complete a renewal and return to the familiar view

**If this was built correctly:** Staff handle current work in Focus, see honest waiting/errors, return to Full view and find the same lease facts and familiar controls; copied lease content is unchanged for the same state. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                                | Architecture outcome | Behavior outcome | Human litmus                                       | Falsification                                                                      |
| ------------------------------------------ | -------------------- | ---------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Real integrated renewal path               | ARCH-S145-1          | BEH-S145-1       | Complete a renewal and return to the familiar view | Shared graph, route, persistence, branches, conflict/recovery and readback matrix. |
| Full-view preservation and honest evidence | ARCH-S145-2          | BEH-S145-2       | Complete a renewal and return to the familiar view | Same-fixture before/after DOM, copy bytes, roles, keyboard and environment record. |

**Preservation set.**

S113/S114–S120 full lease experience, S105 lifecycle/evidence, S107 effect recovery, S123/S124/S127/S128/S134 corrections, source freshness, role checks, action Registry and no-send boundary are independent green gates.

**Adversarial acceptance checks.**

- **AC-S145-1** — Shared all-of/alternative/conditional/acyclic/cycle/missing-edge cases and multiple-ready, historical-cycle, actor/wait/source states match owning server rules, not only UI labels.
- **AC-S145-2** — In-pane actions across applicable stages persist and resume; failure, stale input, duplicate/ambiguous effect and external return do not advance falsely or erase input.
- **AC-S145-3** — Same-fixture Full-view section/TOC/forms/copy/return/role/responsive behavior passes separately; switching is keyboard-usable, preserves or guards edits and has zero effects.
- **AC-S145-4** — Each claimed result names fixture/backend/browser/live/human scope; serving readback is required for a deployment claim and unavailable provider/human outcomes remain unverified.

**Forbidden actions / hard gates.**

No synthetic production customer, client-facing test send, extra provider proof or key opening, stale receipt reuse, silent regression waiver or live completion claim from mocks/build. Existing protected-path and release gates still apply.

**Dependencies / sequencing.**

Intake item 012 consolidates S142–S144 checks as they are built. It does not authorize execution by itself, revive S111/S132, or depend on batch 002 AI. Corrections within the authorized batch belong to their owning suite, not a new queue entry.

**Standalone delivery contract.**

Deliver the integrated evidence matrix and targeted corrections for actual S142–S144 implementation. If a live provider, actor or observer is unavailable, finish independent checks and state the precise remaining cell rather than claiming the entire journey verified.

**Verification and delivery contract.**

Record Full-view preservation baseline and fail-first tests before implementation. Exercise focused graph/action/route/browser checks, then `bash scripts/verify.sh` and the router's exact CI/release gates if the owner explicitly authorizes that delivery. Report `ALL_GATES_GREEN` only for completed declared scope, `BLOCKED` for exact external input or authority after independent work, and `BUDGET_EXHAUSTED` only if a budget was explicitly set. Record human `NOT RUN` when appropriate.

**Ordered prompt sequence.**

1. Recheck exact source, live read-only identity and existing full-view behavior.
2. Pin fail-first graph, UI/server/persistence and preservation checks alongside S142–S144.
3. Exercise each applicable branch and adversarial recovery; fix in-scope failures.
4. Run canonical and authorized serving gates, then update suite/facts/status/loop with exact evidence and limits.

**Deletion/merge recommendation.**

Retire when tested code and current facts own the acceptance matrix and no unverified cell is misreported as completed.
