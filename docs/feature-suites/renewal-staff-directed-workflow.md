<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S156 — Staff-directed renewal work without forced stages

> Status: IMPLEMENTED AND DEPLOYED. Owner-confirmed F05 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and released on 2026-10-03 by run `47fabb7c` at `e106a88a`. No provider effect was used; human verdict NOT RUN.

**Goal.**

Staff can perform the task their actual lease workflow requires, with useful guidance and no artificial sequence or business-approval handoff.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Existing dependency projections, workspace terms, and future-rent controls couple availability to cycle state, owner-approved terms, and matching tenant acceptance. Some source issues are projected as blockers to composing or recording.

Required end state: Guidance is advisory. Working terms and tasks are independent of recorded approvals; actual inputs constrain only the action that consumes them.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S142/S127: retain guidance/issue ownership while superseding compulsory prerequisite and source-agreement gates for these tasks.
- S113 F2/F3/F4: preserve evidence meanings while removing business-approval dependencies.

**Actors and entry conditions.**

An authorized staff user chooses existing owner/tenant preparation, working corrections, comps, progress, or a supported source action on any real lease.

**What it is / how it functions.**

- **R-S156-1** — Provide useful next-action guidance without requiring a prescribed sequence. Source: U-F05.
- **R-S156-2** — Owner preparation, tenant preparation, working corrections, comps, status, and manual activity are independently available when their own inputs permit. Source: U-F05.
- **R-S156-3** — Accept staff knowledge from calls and outside work without requiring system-visible email evidence or a mandatory narrative. Source: U-F05.
- **R-S156-4** — Persist working renewal terms independently of an owner-approved outcome; do not manufacture a response to hold those values. Source: U-F05; P-F05.
- **R-S156-5** — Remove recorded owner approval and matching tenant acceptance as prerequisites for existing future-rent preparation and execution. Source: U-F05.
- **R-S156-6** — Remove equivalent pricing, reconciliation, review, role, and cycle barriers across affected controls, projections, and server rules. Source: U-F05; P-F05.
- **R-S156-7** — Do not replace removed business gates with mandatory attestations or approval checkboxes. Source: U-F05.
- **R-S156-8** — Keep actual responses and manual progress accurate; an edit, source update, or draft does not imply approval, acceptance, signature, or outside completion. Source: U-F05; P-F05.
- **R-S156-9** — Localize missing verified resources or precise operation inputs to their consuming outcome. Source: U-F05.
- **R-S156-10** — Preserve independent successful progress and source results when another action is unfinished or fails. Source: U-F05.

**In scope / out of scope.**

In scope: ordinary renewal sequencing, terms coupling, task readiness, and business-approval rules. Out of scope: new automation, fee/radius/timing policy, signatures, or expanded provider methods.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Existing action handlers and actual working/source evidence; absent resource is explicit and local. Only the exact resource/provider operation can remain unavailable for actual missing input. All independent preparation and progress implementation proceeds.

**Cross-product impacts.**

lib/lease-renewal/workspace-state.ts; components/lease-renewal/RenewalFutureRent.tsx; lib/lease-renewal/renewal-issues.ts; S142/S113. Extends S142/S113 and future-rent state. Consumes S154/S155/S157; S160 applies the revised effect entry rules and S161/S162 apply message availability. Cross-cutting changes must agree at program delivery.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                                       | Classification                | Use and limitation                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                                         | Router / implementation truth | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                      |
| U-F05: Confirmed Q1–Q3; explicit removal of owner/tenant approval mechanism                                                                 | Owner product decision        | Follow staff workflow, accept outside knowledge, and remove sequencing/approval toil without forging outcomes.                                                                                                                                                    |
| P-F05: lib/lease-renewal/workspace-state.ts; components/lease-renewal/RenewalFutureRent.tsx; lib/lease-renewal/renewal-issues.ts; S142/S113 | Inspected baseline            | Current terms/approval coupling and task projection; extend owning state and routes.                                                                                                                                                                              |
| Actual dependent input                                                                                                                      | External dependency           | Existing action handlers and actual working/source evidence; absent resource is explicit and local. Only the exact resource/provider operation can remain unavailable for actual missing input. All independent preparation and progress implementation proceeds. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S156-1** — Existing workspace state supports working terms independently of an approved owner response. A no-response terms/save scenario detects forged approval or continued coupling.
- **ARCH-S156-2** — The owning task and issue projections share the revised ordinary-work rules with action routes. An independent-action scenario detects a removed UI barrier still enforced server-side.
- **ARCH-S156-3** — Actual response/activity and effect evidence retain their meanings. A missing-resource/partial-result scenario exposes global blockers or invented completion.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S156-1** — Provide useful next-action guidance without requiring a prescribed sequence. Deterministic observation: Choose a different available task from the suggested task and perform it.
- **BEH-S156-2** — Owner preparation, tenant preparation, working corrections, comps, status, and manual activity are independently available when their own inputs permit. Deterministic observation: Exercise each action with unrelated workflow steps unfinished.
- **BEH-S156-3** — Accept staff knowledge from calls and outside work without requiring system-visible email evidence or a mandatory narrative. Deterministic observation: Enter working terms received outside the app without an observed message.
- **BEH-S156-4** — Persist working renewal terms independently of an owner-approved outcome; do not manufacture a response to hold those values. Deterministic observation: Save rent/dates with no owner response and inspect the stored evidence meanings.
- **BEH-S156-5** — Remove recorded owner approval and matching tenant acceptance as prerequisites for existing future-rent preparation and execution. Deterministic observation: Prepare and confirm the supported update without those records.
- **BEH-S156-6** — Remove equivalent pricing, reconciliation, review, role, and cycle barriers across affected controls, projections, and server rules. Deterministic observation: Exercise the ordinary-staff route without each removed gate.
- **BEH-S156-7** — Do not replace removed business gates with mandatory attestations or approval checkboxes. Deterministic observation: Complete the task while inspecting the actual control sequence.
- **BEH-S156-8** — Keep actual responses and manual progress accurate; an edit, source update, or draft does not imply approval, acceptance, signature, or outside completion. Deterministic observation: Perform each action and compare unrelated evidence/status fields.
- **BEH-S156-9** — Localize missing verified resources or precise operation inputs to their consuming outcome. Deterministic observation: Leave a document location or provider target absent and perform another task.
- **BEH-S156-10** — Preserve independent successful progress and source results when another action is unfinished or fails. Deterministic observation: Return one success and one failure and inspect saved work and result attribution.

**Human litmus outcome.**

### Choose the task that fits the work

**If this was built correctly:** Open a lease, enter terms learned on a call, prepare either message, and record progress without completing an imposed chain. A missing document affects only its own output. Actual approvals and completed work are recorded only when they happened.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                            |
| ----------- | -------------------- | ---------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| R-S156-1    | ARCH-S156-2          | BEH-S156-1       | Choose the task that fits the work | Choose a different available task from the suggested task and perform it.         |
| R-S156-2    | ARCH-S156-2          | BEH-S156-2       | Choose the task that fits the work | Exercise each action with unrelated workflow steps unfinished.                    |
| R-S156-3    | ARCH-S156-1          | BEH-S156-3       | Choose the task that fits the work | Enter working terms received outside the app without an observed message.         |
| R-S156-4    | ARCH-S156-1          | BEH-S156-4       | Choose the task that fits the work | Save rent/dates with no owner response and inspect the stored evidence meanings.  |
| R-S156-5    | ARCH-S156-2          | BEH-S156-5       | Choose the task that fits the work | Prepare and confirm the supported update without those records.                   |
| R-S156-6    | ARCH-S156-2          | BEH-S156-6       | Choose the task that fits the work | Exercise the ordinary-staff route without each removed gate.                      |
| R-S156-7    | ARCH-S156-2          | BEH-S156-7       | Choose the task that fits the work | Complete the task while inspecting the actual control sequence.                   |
| R-S156-8    | ARCH-S156-3          | BEH-S156-8       | Choose the task that fits the work | Perform each action and compare unrelated evidence/status fields.                 |
| R-S156-9    | ARCH-S156-3          | BEH-S156-9       | Choose the task that fits the work | Leave a document location or provider target absent and perform another task.     |
| R-S156-10   | ARCH-S156-3          | BEH-S156-10      | Choose the task that fits the work | Return one success and one failure and inspect saved work and result attribution. |

**Preservation set.**

- Actual historical owner/tenant responses and staff/provider evidence distinctions.
- Exact target/value/timing confirmation and recovery for external effects; resource-dependent output remains honest.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S156-1** — With no owner response or tenant acceptance, working terms and supported future-rent action must work without fabricated response records under BEH-S156-4/5/8.
- **AC-S156-2** — An expired source snapshot or missing resource must not prevent unrelated app edits, copy, or status under ARCH-S156-2/3 and BEH-S156-2/9.
- **AC-S156-3** — A UI-ready action rejected by an obsolete backend business gate fails BEH-S156-6; a partial provider failure cannot erase an independent saved result under BEH-S156-10.

**Forbidden actions / hard gates.**

No fabricated approval, provider receipt, legal resource, or signature. Keep exact external-effect inputs and confirmation; missing business prerequisites are not reintroduced as attestations.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends S142/S113 and future-rent state. Consumes S154/S155/S157; S160 applies the revised effect entry rules and S161/S162 apply message availability. Cross-cutting changes must agree at program delivery.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Decoupled working terms, advisory task projection, matching route rules, and truthful response/partial-result handling.
- **Consumes, but does not assume:** Existing action handlers and actual working/source evidence; absent resource is explicit and local.
- **Externally blocked effect:** Only the exact resource/provider operation can remain unavailable for actual missing input. All independent preparation and progress implementation proceeds.
- **Produces for downstream suites:** Shared ordinary-work readiness and independently usable working terms.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S156-_ to the declared ARCH-S156-_ and BEH-S156-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S156-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
