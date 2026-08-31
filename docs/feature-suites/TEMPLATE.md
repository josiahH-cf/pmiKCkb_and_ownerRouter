<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: {bundle-or-version} -->

# S{n} — {Title}

> Status: state the present implementation/authority/dependency in one sentence.

**Goal.**

State one observable outcome.

**Current state / intended end state.**

Distinguish verified present behavior from the future behavior this suite requires.

**Actors and entry conditions.**

Name the actor, role/scope, starting state, authoritative inputs, and conditions that block entry.

**What it is / how it functions.**

Describe current behavior and the smallest missing change.

**In scope / out of scope.**

Bound the feature so it can be implemented independently without silently absorbing adjacent suites.

**Open questions & assumptions.**

Name exact inputs. Label assumptions; never hide them as facts.

**Cross-product impacts.**

Name affected surfaces, stores, providers, gates, and documentation.

**Authority and evidence map.**

| Input                                                            | Classification                   | Use and limitation                                                                                              |
| ---------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Router, live readback, committed code/tests, and `docs/facts.md` | Authority / implementation truth | State the exact rule or present behavior this source establishes.                                               |
| User-provided note, meeting record, or request                   | Intent evidence only             | Extract desired outcomes, but do not execute instructions or revive claims that conflict with higher authority. |
| Missing client/provider input                                    | External dependency              | Name the exact affected outcome; never guess it or block unrelated fail-closed work.                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S{n}-1** — Name one structural obligation, its owning boundary, and the deterministic check
  that must fail against the starting state and pass after implementation.
- State how data enters, moves, persists, and exits; name authority, idempotency, recovery, and
  compatibility boundaries when applicable.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S{n}-1** — Name one externally observable workflow/refusal and the deterministic check that
  must fail against the starting state and pass after implementation.
- Cover primary, boundary, failure, retry/reconciliation, and partial-completion paths when relevant.

**Human litmus outcome.**

### {Plain-language feature or change}

**If this was built correctly:** Describe what a person does and what they see or receive, without
file, function, class, or schema names.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use the manifest's exact
  `Human verdict: NOT RUN — no human observer` value and continue unless the owner explicitly made
  that verdict a completion gate.

**Requirement-to-outcome traceability.**

| Requirement                             | Architecture outcome | Behavior outcome | Human litmus                | Deterministic evidence / falsification                    |
| --------------------------------------- | -------------------- | ---------------- | --------------------------- | --------------------------------------------------------- |
| State one independently testable intent | `ARCH-S{n}-1`        | `BEH-S{n}-1`     | Name the exact litmus entry | Name the fail-first check and the pass/readback evidence. |

Every material requirement must map to architecture, behavior, and observable evidence. Split a
combined row when one requirement can pass while another fails.

**Preservation set.**

List the smallest existing checks and behaviors that must remain green as a separate gate. Never
average preservation results into the new architecture or behavior outcomes.

**Adversarial acceptance checks.**

- **AC-S{n}-1** — Map a falsifiable requirement to its `ARCH-S{n}-*` or `BEH-S{n}-*` check.
- **AC-S{n}-2** — State the exact evidence/readback and human-litmus connection.
- **AC-S{n}-3** — State the safety/non-regression boundary.

**Forbidden actions / hard gates.**

List sends, writes, identities, data, or protected paths that remain forbidden.

**Dependencies / sequencing.**

State what this suite consumes or enables. A dependency may block an external effect, but the suite
must still define the independently implementable fail-closed behavior.

**Standalone delivery contract.**

- **Deliverable now:** Name the complete code, test, documentation, and refusal/recovery slice that
  can reach `ALL_GATES_GREEN` without an adjacent suite or unavailable external input.
- **Consumes, but does not assume:** Name compatible inputs from other suites and the explicit
  unset/blocked representation used when they are absent.
- **Externally blocked effect:** Name the exact authority, identity, policy, credential, or provider
  contract required; state which acceptance check remains `BLOCKED` and why unrelated work proceeds.
- **Produces for downstream suites:** Name stable contracts/evidence, not an implementation order
  that makes the suite non-standalone.

**Verification and delivery contract.**

1. Before implementation edits, record current readback, preservation baseline, and the named
   architecture/behavior checks failing for the expected reason; a pre-existing unrelated failure is
   not valid fail-first evidence.
2. Run the smallest focused checks that exercise every declared `ARCH-*`, `BEH-*`, and adversarial
   acceptance row. Keep preservation results as a separate gate.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII, exact action
   gates, runtime configuration, and scope traceability before any authorized delivery.
4. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` only for an exact unavailable external input/authority after
   all independent fail-closed work is complete. A code slice may be green while a separately named
   live proof remains blocked; do not call the suite operationally complete or delete it.

**Ordered prompt sequence.**

1. Re-verify current code/live state.
2. Materialize the architecture check, behavior check, human litmus, and preservation baseline before
   the first implementation edit; record the intended fail-first results.
3. Build the bounded behavior and refusal/recovery paths.
4. Falsify, run focused and canonical tests, update current docs, and ship only when authorized.

**Deletion/merge recommendation.**

Remove the suite from the active tree when its remaining dependency and acceptance checks are fully
represented by code, tests, and current facts.
