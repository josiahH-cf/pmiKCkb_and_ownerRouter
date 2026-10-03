<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S157 — Persistent staff working values with visible discrepancies

> Status: IMPLEMENTED AND DEPLOYED. Owner-confirmed F06 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and released on 2026-10-03 by run `47fabb7c` at `e106a88a`. No provider effect was used; human verdict NOT RUN.

**Goal.**

Staff can keep and use information they know while source disagreements remain visible and do not halt their work.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Existing correction controls use request/review/resolve/proposal flows, and source facts drive current projections. The user confirmed a direct working layer and retention over conflicting refresh.

Required end state: Working values autosave directly, survive later conflicting source reads, and remain visibly distinct from provider values and source-update results.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S113 F2 and S127: replace formal correction/reconciliation prerequisites with direct working edits, preserving source execution contracts.

**Actors and entry conditions.**

An authorized staff user corrects an existing working field or records information from outside the app. The exact business field distinguishes current rent from future terms.

**What it is / how it functions.**

- **R-S157-1** — Edit the relevant existing working field directly, including working rent and renewal information. Source: U-F06.
- **R-S157-2** — Keep current-rent correction and future proposed terms distinct through their business fields. Source: U-F06; P-F06.
- **R-S157-3** — Autosave without formal request, reconciliation approval, or mandatory narrative. Source: U-F06; S155.
- **R-S157-4** — Use actual server actor/time attribution; retain supplied context without inventing a call, message, or observation. Source: U-F06; P-F06.
- **R-S157-5** — Retain working values over later conflicting RentVine or Sheet refresh until staff deliberately change them. Source: U-F06.
- **R-S157-6** — Show the actual difference and source values through existing discrepancy/attention mechanisms. Source: U-F06; P-F06.
- **R-S157-7** — Replace global “resolve before continuing” behavior/language where the discrepancy is advisory for ordinary work. Source: U-F06; P-F06.
- **R-S157-8** — Changing the working value or deliberately adopting an observed source value is an application edit. Source: U-F06.
- **R-S157-9** — Matching source evidence may clear the discrepancy but does not prove this app caused a source change. Source: P-F06.
- **R-S157-10** — New preparation uses current working values; existing manually edited message text is not silently regenerated. Source: U-F06; S161.
- **R-S157-11** — Keep app-saved, source-pending, failed, and verified update states distinct; actual synchronization requires S160. Source: U-F06; P-F06.

**In scope / out of scope.**

In scope: direct working corrections, durable precedence, source/working distinctions, and existing attention. Out of scope: a new review workflow, arbitrary provider fields, or automatic synchronization.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual source snapshots and existing working fields; absence stays explicit and does not block direct working edits. Unavailable source reads affect discrepancy freshness only. No new provider effect is required to save or use a working value.

**Cross-product impacts.**

components/lease-renewal/RenewalCorrections.tsx; lib/lease-renewal/discrepancy.ts; lib/lease-renewal/attention.ts; S113 F2. Extends S113 corrections and existing discrepancy/attention. Consumes S155 saving; S153, S158, S160, and S161 consume its retained-value/provenance behavior.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                             | Classification                | Use and limitation                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                               | Router / implementation truth | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                        |
| U-F06: Confirmed Q4 and Q14, plus outside-call clarification                                                                      | Owner product decision        | Application working correction is separate from source write; keep it until staff change it and use existing attention.                                                                                                                             |
| P-F06: components/lease-renewal/RenewalCorrections.tsx; lib/lease-renewal/discrepancy.ts; lib/lease-renewal/attention.ts; S113 F2 | Inspected baseline            | Use existing corrections, discrepancy categories, and attribution without a new approval workflow.                                                                                                                                                  |
| Actual dependent input                                                                                                            | External dependency           | Actual source snapshots and existing working fields; absence stays explicit and does not block direct working edits. Unavailable source reads affect discrepancy freshness only. No new provider effect is required to save or use a working value. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S157-1** — One lease-bound working projection persists direct edits and source provenance in the existing owning layer. A direct-save scenario exposes request/review dependence or current/future conflation.
- **ARCH-S157-2** — Refresh updates source evidence without overwriting retained working values. A conflicting-refresh/reload scenario exposes silent replacement or fabricated synchronization.
- **ARCH-S157-3** — Existing discrepancy/attention and message consumers use the same working/source distinctions. A cross-consumer scenario detects conflicting precedence or global blocking language.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S157-1** — Edit the relevant existing working field directly, including working rent and renewal information. Deterministic observation: Make the edit without creating a correction request.
- **BEH-S157-2** — Keep current-rent correction and future proposed terms distinct through their business fields. Deterministic observation: Enter future rent and inspect current billing/working-current projection.
- **BEH-S157-3** — Autosave without formal request, reconciliation approval, or mandatory narrative. Deterministic observation: Save a valid working change with no approval/context entry.
- **BEH-S157-4** — Use actual server actor/time attribution; retain supplied context without inventing a call, message, or observation. Deterministic observation: Read back attribution and optional context for a direct edit.
- **BEH-S157-5** — Retain working values over later conflicting RentVine or Sheet refresh until staff deliberately change them. Deterministic observation: Refresh both sources with different values, then reopen.
- **BEH-S157-6** — Show the actual difference and source values through existing discrepancy/attention mechanisms. Deterministic observation: Inspect an override/source mismatch in workspace and desk.
- **BEH-S157-7** — Replace global “resolve before continuing” behavior/language where the discrepancy is advisory for ordinary work. Deterministic observation: Keep a mismatch open and complete another ordinary action.
- **BEH-S157-8** — Changing the working value or deliberately adopting an observed source value is an application edit. Deterministic observation: Adopt a source value and inspect provider dispatch counts.
- **BEH-S157-9** — Matching source evidence may clear the discrepancy but does not prove this app caused a source change. Deterministic observation: Read an externally matching source and inspect receipt/causality claims.
- **BEH-S157-10** — New preparation uses current working values; existing manually edited message text is not silently regenerated. Deterministic observation: Change working rent and compare new preparation with an existing edited body.
- **BEH-S157-11** — Keep app-saved, source-pending, failed, and verified update states distinct; actual synchronization requires S160. Deterministic observation: Save an override, fail an update, and read back both states.

**Human litmus outcome.**

### Keep the value you know

**If this was built correctly:** Correct a value, see it saved, refresh the lease, and keep your correction when the source differs. The source difference remains visible. Prepare new work using the correction and choose separately whether to update a supported source.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus            | Deterministic evidence / falsification                                        |
| ----------- | -------------------- | ---------------- | ----------------------- | ----------------------------------------------------------------------------- |
| R-S157-1    | ARCH-S157-1          | BEH-S157-1       | Keep the value you know | Make the edit without creating a correction request.                          |
| R-S157-2    | ARCH-S157-1          | BEH-S157-2       | Keep the value you know | Enter future rent and inspect current billing/working-current projection.     |
| R-S157-3    | ARCH-S157-1          | BEH-S157-3       | Keep the value you know | Save a valid working change with no approval/context entry.                   |
| R-S157-4    | ARCH-S157-1          | BEH-S157-4       | Keep the value you know | Read back attribution and optional context for a direct edit.                 |
| R-S157-5    | ARCH-S157-2          | BEH-S157-5       | Keep the value you know | Refresh both sources with different values, then reopen.                      |
| R-S157-6    | ARCH-S157-3          | BEH-S157-6       | Keep the value you know | Inspect an override/source mismatch in workspace and desk.                    |
| R-S157-7    | ARCH-S157-3          | BEH-S157-7       | Keep the value you know | Keep a mismatch open and complete another ordinary action.                    |
| R-S157-8    | ARCH-S157-2          | BEH-S157-8       | Keep the value you know | Adopt a source value and inspect provider dispatch counts.                    |
| R-S157-9    | ARCH-S157-2          | BEH-S157-9       | Keep the value you know | Read an externally matching source and inspect receipt/causality claims.      |
| R-S157-10   | ARCH-S157-3          | BEH-S157-10      | Keep the value you know | Change working rent and compare new preparation with an existing edited body. |
| R-S157-11   | ARCH-S157-1          | BEH-S157-11      | Keep the value you know | Save an override, fail an update, and read back both states.                  |

**Preservation set.**

- Existing source truth and discrepancy categories, actual attribution, historical evidence, and manual message edits.
- No synchronization or causality claim from an app save or coincidental matching read.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S157-1** — A later conflicting provider refresh and reopened session must not erase the retained value under ARCH-S157-2 and BEH-S157-5.
- **AC-S157-2** — Future terms must not alter current billing, and new preparation must not overwrite existing authored text under BEH-S157-2/10.
- **AC-S157-3** — A matching external value or failed source update must not fabricate an app effect receipt under BEH-S157-9/11.

**Forbidden actions / hard gates.**

No guessed customer value, forged source observation, silent provider update, or new discrepancy approval gate. Concurrent saves follow S155.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends S113 corrections and existing discrepancy/attention. Consumes S155 saving; S153, S158, S160, and S161 consume its retained-value/provenance behavior.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Direct working edits, durable precedence and refresh behavior, shared attention, and consumer consistency.
- **Consumes, but does not assume:** Actual source snapshots and existing working fields; absence stays explicit and does not block direct working edits.
- **Externally blocked effect:** Unavailable source reads affect discrepancy freshness only. No new provider effect is required to save or use a working value.
- **Produces for downstream suites:** Shared retained working information with honest source differences.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S157-_ to the declared ARCH-S157-_ and BEH-S157-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S157-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
