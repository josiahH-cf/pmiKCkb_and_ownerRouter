<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S154 — Every existing lease is freely workable

> Status: IMPLEMENTED / AWAITING RELEASE. Owner-confirmed F03 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and queued for one cumulative release. No provider effect was used; human verdict NOT RUN.

**Goal.**

Staff can open and work any real lease without eligibility, recording-state, or cycle-start barriers.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: The desk and workspace use term classifications, actionable/tracked availability, and explicit cycle setup. The work-status store already operates per lease without creating a cycle.

Required end state: Any lease is workable; classifications inform visibility and filters. Required workspace state is reused or established on the first actual save, with no effect merely from opening.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S103: retain term/cadence context while removing eligibility as an edit barrier.
- S122/S123: retain all-lease visibility and history; remove inspection-only restrictions for the requested ordinary work.

**Actors and entry conditions.**

Any ordinary authorized staff user selecting a real existing lease, including older, completed, periodic/month-to-month, and out-of-window leases.

**What it is / how it functions.**

- **R-S154-1** — Allow ordinary work on real leases outside windows, older leases, completed leases, and periodic/month-to-month leases. Source: U-F03.
- **R-S154-2** — Retain useful classifications, dates, and statuses as context and filters rather than edit eligibility. Source: U-F03.
- **R-S154-3** — Remove explicit start-cycle, reviewed-basis, and enable-recording prerequisites for ordinary recording. Source: U-F03; T-F03.
- **R-S154-4** — Opening performs reads and creates no cycle, staff activity, milestone, or provider effect. Source: U-F03; P-F03.
- **R-S154-5** — Reuse an applicable existing work record; where none applies, establish the required workspace record as part of the first actual save. Source: U-F03; P-F03.
- **R-S154-6** — Keep existing independent lease-bound stores independent, including staff status. Source: P-F03.
- **R-S154-7** — Preserve prior cycles, completion, and historical activity; new work does not rewrite history to create eligibility. Source: U-F03; P-F03.
- **R-S154-8** — Missing inputs for one precise operation do not prevent opening, working edits, notes, or unrelated available actions. Source: U-F03.
- **R-S154-9** — If no actual cycle basis is available, save lease-bound working information without demanding or inventing a date/basis; preserve real historical cycle scope. Source: U-F03; P-F03.

**In scope / out of scope.**

In scope: actual lease entry/workability and save-time work-record establishment. Out of scope: changing lease/provider identity, fabricating a future date, or rewriting historical completion.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual lease identity and existing work history; no reviewed-cycle prerequisite or invented date fills a missing input. A missing real lease prevents that lease operation only. No new live proof or customer effect is needed for the implementation.

**Cross-product impacts.**

lib/lease-renewal/live-desk.ts; lib/firestore/renewal-workspace.ts; lib/firestore/renewal-work-status.ts; S103/S122/S123. Extends S103/S122/S123 and workspace entry. Supplies save-time state to S155/S156; S164 continues independent status storage. Related suites can share a bounded implementation slice without requeueing completed baselines.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                           | Classification                               | Use and limitation                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                             | Router / implementation truth                | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                            |
| U-F03: Confirmed Q6: every lease is workable; window belongs in a table filter; no edit or lock-in modes                        | Owner product decision                       | Supersedes inspection-only and explicit start requirements for ordinary work.                                                                                                                                                                           |
| T-F03: October 1 transcript 00:58:42                                                                                            | Intent evidence                              | Forgotten recording checkbox obstructed work.                                                                                                                                                                                                           |
| P-F03: lib/lease-renewal/live-desk.ts; lib/firestore/renewal-workspace.ts; lib/firestore/renewal-work-status.ts; S103/S122/S123 | Inspected implementation / deployed baseline | Availability and cycle persistence owners; preserve historical cycle meaning and independent status storage.                                                                                                                                            |
| Actual dependent input                                                                                                          | External dependency                          | Actual lease identity and existing work history; no reviewed-cycle prerequisite or invented date fills a missing input. A missing real lease prevents that lease operation only. No new live proof or customer effect is needed for the implementation. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S154-1** — Existing desk and workspace entry resolve the real lease without using renewal classification as an edit grant. A server/entry scenario rejects the current inspection-only barrier for ordinary work.
- **ARCH-S154-2** — The existing workspace store reuses relevant work or establishes necessary state with the first actual save. An entry/first-save scenario distinguishes read-only opening from automatic save-time establishment. No actual basis is fabricated to satisfy the former cycle schema.
- **ARCH-S154-3** — Historical cycles and independent lease-bound stores retain their existing ownership. A completed-cycle/status scenario exposes destructive reuse or a manufactured cycle from a status-only save.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S154-1** — Allow ordinary work on real leases outside windows, older leases, completed leases, and periodic/month-to-month leases. Deterministic observation: Open and edit each boundary class through the actual entry and action paths.
- **BEH-S154-2** — Retain useful classifications, dates, and statuses as context and filters rather than edit eligibility. Deterministic observation: Apply a date/category filter, then open an excluded lease directly and work it.
- **BEH-S154-3** — Remove explicit start-cycle, reviewed-basis, and enable-recording prerequisites for ordinary recording. Deterministic observation: Make a first workspace change without those actions.
- **BEH-S154-4** — Opening performs reads and creates no cycle, staff activity, milestone, or provider effect. Deterministic observation: Observe state and dispatch before and after opening a lease with no workspace.
- **BEH-S154-5** — Reuse an applicable existing work record; where none applies, establish the required workspace record as part of the first actual save. Deterministic observation: Save on a lease with and without relevant existing work and read back its binding.
- **BEH-S154-6** — Keep existing independent lease-bound stores independent, including staff status. Deterministic observation: Save status without a cycle and confirm that no workspace cycle is manufactured.
- **BEH-S154-7** — Preserve prior cycles, completion, and historical activity; new work does not rewrite history to create eligibility. Deterministic observation: Work a completed lease and compare historical records and attribution.
- **BEH-S154-8** — Missing inputs for one precise operation do not prevent opening, working edits, notes, or unrelated available actions. Deterministic observation: Make a working edit and note while an exact provider input is missing.
- **BEH-S154-9** — If no actual cycle basis is available, save lease-bound working information without demanding or inventing a date/basis; preserve real historical cycle scope. Deterministic observation: Save ordinary work with no actual cycle basis and inspect the persisted lease binding and unchanged history.

**Human litmus outcome.**

### Work the lease you need

**If this was built correctly:** Open an older or completed lease, enter information, and see it saved without activating a recording mode. Open an untouched lease without creating work merely by looking at it. Prior history remains intact.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus            | Deterministic evidence / falsification                                                                       |
| ----------- | -------------------- | ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| R-S154-1    | ARCH-S154-1          | BEH-S154-1       | Work the lease you need | Open and edit each boundary class through the actual entry and action paths.                                 |
| R-S154-2    | ARCH-S154-1          | BEH-S154-2       | Work the lease you need | Apply a date/category filter, then open an excluded lease directly and work it.                              |
| R-S154-3    | ARCH-S154-1          | BEH-S154-3       | Work the lease you need | Make a first workspace change without those actions.                                                         |
| R-S154-4    | ARCH-S154-2          | BEH-S154-4       | Work the lease you need | Observe state and dispatch before and after opening a lease with no workspace.                               |
| R-S154-5    | ARCH-S154-2          | BEH-S154-5       | Work the lease you need | Save on a lease with and without relevant existing work and read back its binding.                           |
| R-S154-6    | ARCH-S154-3          | BEH-S154-6       | Work the lease you need | Save status without a cycle and confirm that no workspace cycle is manufactured.                             |
| R-S154-7    | ARCH-S154-3          | BEH-S154-7       | Work the lease you need | Work a completed lease and compare historical records and attribution.                                       |
| R-S154-8    | ARCH-S154-1          | BEH-S154-8       | Work the lease you need | Make a working edit and note while an exact provider input is missing.                                       |
| R-S154-9    | ARCH-S154-2          | BEH-S154-9       | Work the lease you need | Save ordinary work with no actual cycle basis and inspect the persisted lease binding and unchanged history. |

**Preservation set.**

- Real lease identity, prior cycles, original completion and staff/provider evidence meanings.
- Independent staff-status persistence and useful classification/filter display.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S154-1** — An out-of-window or month-to-month lease opened by a direct link must remain workable under BEH-S154-1/2.
- **AC-S154-2** — Opening and saving staff status must not create a cycle; a first workspace save may establish only necessary current work under BEH-S154-4/5/6.
- **AC-S154-3** — New work on a completed lease must retain old cycle activity and attribution under ARCH-S154-3 and BEH-S154-7.

**Forbidden actions / hard gates.**

No synthetic lease, invented basis/date, automatic provider effect, or silent historical restart. A provider-required date or target remains an input to that exact operation.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends S103/S122/S123 and workspace entry. Supplies save-time state to S155/S156; S164 continues independent status storage. Related suites can share a bounded implementation slice without requeueing completed baselines.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Any-lease entry/actions and the necessary existing-store first-save/reuse behavior, including history and zero-effect entry evidence.
- **Consumes, but does not assume:** Actual lease identity and existing work history; no reviewed-cycle prerequisite or invented date fills a missing input.
- **Externally blocked effect:** A missing real lease prevents that lease operation only. No new live proof or customer effect is needed for the implementation.
- **Produces for downstream suites:** A workable lease and accurate save-time work binding for the remaining program.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S154-_ to the declared ARCH-S154-_ and BEH-S154-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S154-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
