<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S159 — Remove Sheet workflow friction and restore supported updates

> Status: SPECIFIED / NOT IMPLEMENTED. Owner-confirmed F08 change; authoring and registration only. Implementation, tests, authentication probes, provider effects, and release were not executed for this intake.

**Goal.**

The operating Sheet cannot govern ordinary lease work, and supported deliberate append/field updates are usable again.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: S128 and sheet-writeback-policy enforce the deployed blanket operating-Sheet pause. Existing exact append/field-update keys remain open, but operation policy refuses writes. Reads/app-owned work are retained. The October 1 ledger still records Sheet=false; no new live readback or policy change occurred during specification.

Required end state: Ordinary work is independent of Sheet agreement/availability. The supported append/recognized-field operations are enabled through the existing narrow runtime and exact-action contracts.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S128: current deployed pause remains a baseline fact until release; this suite is the later explicit resumption specification.
- S98/S113: preserve normal-field at-most-once/receipt/readback/correction contracts.

**Actors and entry conditions.**

An authorized ordinary staff user works a lease or deliberately requests a supported Sheet operation; release operators apply only the specified enablement through the existing release loop.

**What it is / how it functions.**

- **R-S159-1** — Sheet availability, agreement, row match, and pause state do not block working edits, comps, message preparation, copy, usable Gmail drafts, status, or manual progress. Source: U-F08.
- **R-S159-2** — Preserve useful Sheet reads and source links during the transition from Sheet-centered work. Source: U-F08.
- **R-S159-3** — Restore human-initiated renewal-checklist row append and recognized field updates using their existing exact keys. Source: U-F08; P-F08.
- **R-S159-4** — Remove blanket refusal for those operations at runtime/effect boundaries; an open key alone is insufficient. Source: U-F08; P-F08.
- **R-S159-5** — Resolve current targets/values server-side, including eligible S158 bindings. Source: U-F08; P-F08.
- **R-S159-6** — Localize permission, connection, target-conflict, and readback failure to the attempted update. Source: U-F08.
- **R-S159-7** — Keep saved application values and visible unfinished source results after a Sheet failure. Source: U-F08.
- **R-S159-8** — RentVine and Sheet results remain independent; one failure cannot erase the other success or saved app work. Source: U-F08.
- **R-S159-9** — Use the existing owner-approved normal-field contract without requiring a hypothetical provider-owned tombstone/idempotency/isolation seam. Source: P-F08.
- **R-S159-10** — Preserve claims, receipts, readback and separately confirmed correction; old proposals require fresh target/value preview and confirmation, never automatic backlog flushing. Source: P-F08; U-F08.
- **R-S159-11** — Update candidate/current configuration expectations for the approved enablement while preserving the captured predecessor’s actual rollback configuration and evidence. Source: U-F08; P-F08.

**In scope / out of scope.**

In scope: ordinary workflow independence, the existing narrow switch, normal append/recognized-field operation availability, and truthful release/result state. Out of scope: generic writeback keys, arbitrary cells, row deletion, historical restore, proof replay, or Sheet migration.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual configured workbook, current operation target, connection/permissions, and fresh exact preview/confirmation. Unavailable input is local. Actual Google permissions/connection can block the exact live append/update (AC-S159-3), not independent implementation or ordinary work. No new provider proof is authorized or required.

**Cross-product impacts.**

S128; lib/lease-renewal/sheet-writeback-policy.ts; S98/S113 normal-field contract; October 1 facts. Explicitly changes S128 policy while retaining S98/S113 execution integrity. S158 supplies eligible targets; S160 owns staff confirmation/permissions; S156/S161/S162 remove remaining global dependencies.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                     | Classification                                    | Use and limitation                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                       | Router / implementation truth                     | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                                                                               |
| U-F08: Confirmed removal of operating-Sheet gates and direct staff work                                   | Owner product decision                            | Intentionally reverses S128 blanket pause for supported normal operations and removes global workflow gating.                                                                                                                                                                                                                              |
| P-F08: S128; lib/lease-renewal/sheet-writeback-policy.ts; S98/S113 normal-field contract; October 1 facts | Recorded deployment / existing execution contract | Pause is current baseline; normal writes retain precise targets, claims, receipts, readback, and correction.                                                                                                                                                                                                                               |
| Actual dependent input                                                                                    | External dependency                               | Actual configured workbook, current operation target, connection/permissions, and fresh exact preview/confirmation. Unavailable input is local. Actual Google permissions/connection can block the exact live append/update (AC-S159-3), not independent implementation or ordinary work. No new provider proof is authorized or required. |

Meeting source: [Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md](<C:/Users/josia/Downloads/Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md>). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S159-1** — Ordinary action availability and application saves do not depend on Sheet pause/agreement/row-match. A paused/unavailable/conflicting-source scenario exposes a global workflow barrier.
- **ARCH-S159-2** — The existing server-owned LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED policy and effect boundary permit only existing supported normal actions under explicit program execution. A flag/action scenario exposes blanket refusal or widened keys.
- **ARCH-S159-3** — Independent destination results and current runtime/release expectations preserve partial outcomes and actual predecessor recovery. A two-destination/old-proposal scenario detects false completion or automatic backlog dispatch.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S159-1** — Sheet availability, agreement, row match, and pause state do not block working edits, comps, message preparation, copy, usable Gmail drafts, status, or manual progress. Deterministic observation: Exercise each ordinary action with unavailable/conflicting/paused Sheet evidence.
- **BEH-S159-2** — Preserve useful Sheet reads and source links during the transition from Sheet-centered work. Deterministic observation: Read or open the configured Sheet without enabling a mutation.
- **BEH-S159-3** — Restore human-initiated renewal-checklist row append and recognized field updates using their existing exact keys. Deterministic observation: Invoke each supported operation through its normal route with a deterministic provider adapter.
- **BEH-S159-4** — Remove blanket refusal for those operations at runtime/effect boundaries; an open key alone is insufficient. Deterministic observation: With enabled policy and exact authority, inspect actual dispatch eligibility; malformed/unset policy remains honestly off.
- **BEH-S159-5** — Resolve current targets/values server-side, including eligible S158 bindings. Deterministic observation: Prepare and confirm a selected recognized field target and compare actual dispatch.
- **BEH-S159-6** — Localize permission, connection, target-conflict, and readback failure to the attempted update. Deterministic observation: Return each failure and complete another ordinary task.
- **BEH-S159-7** — Keep saved application values and visible unfinished source results after a Sheet failure. Deterministic observation: Fail the write and reopen the saved working information.
- **BEH-S159-8** — RentVine and Sheet results remain independent; one failure cannot erase the other success or saved app work. Deterministic observation: Return different destination outcomes and inspect both receipts/states.
- **BEH-S159-9** — Use the existing owner-approved normal-field contract without requiring a hypothetical provider-owned tombstone/idempotency/isolation seam. Deterministic observation: Exercise the existing at-most-once path with only actual provider capabilities.
- **BEH-S159-10** — Preserve claims, receipts, readback and separately confirmed correction; old proposals require fresh target/value preview and confirmation, never automatic backlog flushing. Deterministic observation: Resume supported availability with saved/old proposals and inspect zero automatic dispatch plus fresh preparation.
- **BEH-S159-11** — Update candidate/current configuration expectations for the approved enablement while preserving the captured predecessor’s actual rollback configuration and evidence. Deterministic observation: Compare intended candidate policy and captured predecessor binding during release preparation.

**Human litmus outcome.**

### Keep working when the Sheet is wrong

**If this was built correctly:** Edit and prepare work while the Sheet is unavailable or disagrees. When you choose a supported Sheet update, see the exact target and result. A failed update leaves your app work intact and does not undo another successful destination.

- Model verdict: no implementation verdict issued at specification intake. The execution runner records PASS or FAIL with the actual supporting evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                                                                     |
| ----------- | -------------------- | ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| R-S159-1    | ARCH-S159-1          | BEH-S159-1       | Keep working when the Sheet is wrong | Exercise each ordinary action with unavailable/conflicting/paused Sheet evidence.                                          |
| R-S159-2    | ARCH-S159-1          | BEH-S159-2       | Keep working when the Sheet is wrong | Read or open the configured Sheet without enabling a mutation.                                                             |
| R-S159-3    | ARCH-S159-2          | BEH-S159-3       | Keep working when the Sheet is wrong | Invoke each supported operation through its normal route with a deterministic provider adapter.                            |
| R-S159-4    | ARCH-S159-2          | BEH-S159-4       | Keep working when the Sheet is wrong | With enabled policy and exact authority, inspect actual dispatch eligibility; malformed/unset policy remains honestly off. |
| R-S159-5    | ARCH-S159-2          | BEH-S159-5       | Keep working when the Sheet is wrong | Prepare and confirm a selected recognized field target and compare actual dispatch.                                        |
| R-S159-6    | ARCH-S159-3          | BEH-S159-6       | Keep working when the Sheet is wrong | Return each failure and complete another ordinary task.                                                                    |
| R-S159-7    | ARCH-S159-3          | BEH-S159-7       | Keep working when the Sheet is wrong | Fail the write and reopen the saved working information.                                                                   |
| R-S159-8    | ARCH-S159-3          | BEH-S159-8       | Keep working when the Sheet is wrong | Return different destination outcomes and inspect both receipts/states.                                                    |
| R-S159-9    | ARCH-S159-2          | BEH-S159-9       | Keep working when the Sheet is wrong | Exercise the existing at-most-once path with only actual provider capabilities.                                            |
| R-S159-10   | ARCH-S159-3          | BEH-S159-10      | Keep working when the Sheet is wrong | Resume supported availability with saved/old proposals and inspect zero automatic dispatch plus fresh preparation.         |
| R-S159-11   | ARCH-S159-3          | BEH-S159-11      | Keep working when the Sheet is wrong | Compare intended candidate policy and captured predecessor binding during release preparation.                             |

**Preservation set.**

- Actual Sheet reads/configuration, exact-key execution integrity, receipts, uncertain-effect reconciliation, and fresh confirmed correction.
- Historical pause/failed/successful evidence remains unchanged; no backlog executes by enablement alone.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S159-1** — Pause, source disagreement, and unresolved row matching must not disable unrelated work under ARCH-S159-1 and BEH-S159-1.
- **AC-S159-2** — Enabling normal operations must not flush old proposals or allow a legacy generic key under BEH-S159-3/4/10.
- **AC-S159-3** — A Sheet failure after a verified RentVine result must retain both true results and saved app data under BEH-S159-6/7/8; rollback keeps the actual captured predecessor configuration under BEH-S159-11.

**Forbidden actions / hard gates.**

Only google_sheets.renewal_checklist.row_append and field_update under existing contracts; broad compatibility keys stay closed. No delete, historical restore, proof rerun, autonomous dispatch, guessed correction, or relabeled rollback evidence.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Explicitly changes S128 policy while retaining S98/S113 execution integrity. S158 supplies eligible targets; S160 owns staff confirmation/permissions; S156/S161/S162 remove remaining global dependencies.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Normal-operation unblocking, revised shared policy/availability and release configuration contracts, localized results/recovery, and corresponding evidence.
- **Consumes, but does not assume:** Actual configured workbook, current operation target, connection/permissions, and fresh exact preview/confirmation. Unavailable input is local.
- **Externally blocked effect:** Actual Google permissions/connection can block the exact live append/update (AC-S159-3), not independent implementation or ordinary work. No new provider proof is authorized or required.
- **Produces for downstream suites:** Usable supported Sheet operations and Sheet-independent lease work.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S159-_ to the declared ARCH-S159-_ and BEH-S159-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S159-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
