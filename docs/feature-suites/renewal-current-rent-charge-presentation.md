<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S153 — Accurate current rent and charge presentation

> Status: IMPLEMENTED / AWAITING RELEASE. Owner-confirmed F02 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and queued for one cumulative release. No provider effect was used; human verdict NOT RUN.

**Goal.**

Staff can distinguish current rent billing from other recurring charges, contractual lease rent, aggregate charges, and unit listing rent.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: RentAndCharges emphasizes the lease contractual base-rent value and displays an inventory of recurring charges. The inventory already classifies rent/non-rent/unknown and current true/false/unknown. The meeting identifies current rent-account charges as the important operational evidence and distinguishes pet/other charges and turnover listing rent.

Required end state: Current rent-account billing is prominent, other amounts retain distinct meanings, and uncertainty is visible without preventing staff from using a working value or another task.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S102: contractual base rent remains a labeled source fact; the new prominent operational presentation supersedes its universal baseRentAmount-first display expectation.
- S113 F2.4: supported charge operations and no unsupported base-rent setter.

**Actors and entry conditions.**

An authorized staff user views the desk/workspace, refreshes charges, prepares a message, or previews a supported source update. Use actual RentVine charge/account/schedule evidence and retained staff working values.

**What it is / how it functions.**

- **R-S153-1** — Use current rent-account recurring-charge evidence prominently for operational current rent. Source: T-F02; P-F02.
- **R-S153-2** — Keep non-rent recurring charges distinct; they must not silently inflate the amount called base rent. Source: T-F02.
- **R-S153-3** — Keep contractual lease amount, aggregate recurring-charge total, and unit listing rent available with distinct labels and meanings. Source: T-F02; P-F02.
- **R-S153-4** — For one identifiable current rent charge, show the actual amount and applicable schedule. Source: T-F02; P-F02.
- **R-S153-5** — For missing dates, unavailable data, or multiple candidates, expose actual evidence and existing attention; do not invent a sum, split, or selected charge. Source: P-F02; U-F02.
- **R-S153-6** — Allow a retained or newly entered working rent; label its provenance and keep unrelated work available. Source: U-F02; S157.
- **R-S153-7** — In Focus emphasize current applicable charges; preserve historical and future charges in reachable supporting detail and Full view. Source: T-F02.
- **R-S153-8** — Display charge billing periods separately from lease dates, using existing date semantics. Source: T-F02; P-F02.
- **R-S153-9** — Desk, workspace, and newly prepared messages use consistent current-rent meaning and working-value precedence. Source: U-F02; P-F02.
- **R-S153-10** — After charge update, report charge readback separately from any continuing contractual-rent discrepancy; never claim an unsupported base-rent setter was used. Source: P-F02.

**In scope / out of scope.**

In scope: rent meaning and presentation and its existing consumers. Out of scope: inventing a pricing/aggregation rule, account creation, a new provider setter, or changing RentCast policy.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual inventory and contractual/listing evidence. Missing or ambiguous entries are displayed as such and do not stop independent work. Unavailable actual charge reads affect live current-billing evidence only; adapters can establish implementation behavior without a paid request or customer write.

**Cross-product impacts.**

components/lease-renewal/RentAndCharges.tsx; lib/lease-renewal/writeback/charge-inventory-model.ts; S102; S113 F2.4. Extends S102 and S113 F2.4. Consumes S157 working values, S152 view presentation, and existing charge inventory. S161 uses the resulting labeled facts; S160 performs actual updates.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                      | Classification                                      | Use and limitation                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                        | Router / implementation truth                       | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                                                |
| U-F02: Confirmed holistic simplification and retained-working-value decisions                                              | Owner product decision                              | Source uncertainty cannot force the whole lease to stop.                                                                                                                                                                                                                                                    |
| T-F02: October 1 transcript 00:37:29–00:45:57                                                                              | Intent evidence                                     | Operational current rent, rent-account charge evidence, separate other charges, current-versus-historical visibility, and actual periods.                                                                                                                                                                   |
| P-F02: components/lease-renewal/RentAndCharges.tsx; lib/lease-renewal/writeback/charge-inventory-model.ts; S102; S113 F2.4 | Inspected implementation / existing effect contract | Use existing classifications and schedule semantics; a recurring-charge success does not prove another contractual field changed.                                                                                                                                                                           |
| Actual dependent input                                                                                                     | External dependency                                 | Actual inventory and contractual/listing evidence. Missing or ambiguous entries are displayed as such and do not stop independent work. Unavailable actual charge reads affect live current-billing evidence only; adapters can establish implementation behavior without a paid request or customer write. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S153-1** — One shared rent presentation consumes actual charge classification/schedule evidence and working-value provenance. A projection scenario distinguishes rent billing, contractual base, aggregate, and listing reference without relabeling amounts.
- **ARCH-S153-2** — The existing charge inventory remains the owner of charge identity and schedule interpretation. Missing/ambiguous and multiple-charge scenarios forbid guessed summation, automatic selection, or aggregate division.
- **ARCH-S153-3** — Desk, workspace, message inputs, and update results consume consistent amount meanings. A cross-consumer scenario detects a total or future amount mislabeled as current rent.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S153-1** — Use current rent-account recurring-charge evidence prominently for operational current rent. Deterministic observation: Provide one identified current rent charge and a different contractual amount; read the labeled display.
- **BEH-S153-2** — Keep non-rent recurring charges distinct; they must not silently inflate the amount called base rent. Deterministic observation: Add applicable pet/insurance/other charges and compare the rent label with the aggregate.
- **BEH-S153-3** — Keep contractual lease amount, aggregate recurring-charge total, and unit listing rent available with distinct labels and meanings. Deterministic observation: Give each amount a different value and inspect the supporting information.
- **BEH-S153-4** — For one identifiable current rent charge, show the actual amount and applicable schedule. Deterministic observation: Read the charge amount and its provider-supported period.
- **BEH-S153-5** — For missing dates, unavailable data, or multiple candidates, expose actual evidence and existing attention; do not invent a sum, split, or selected charge. Deterministic observation: Exercise each ambiguity and inspect both the projection and effect preparation.
- **BEH-S153-6** — Allow a retained or newly entered working rent; label its provenance and keep unrelated work available. Deterministic observation: Use a working value while charge evidence is unresolved.
- **BEH-S153-7** — In Focus emphasize current applicable charges; preserve historical and future charges in reachable supporting detail and Full view. Deterministic observation: Inspect current, historical, and future inventory entries in both modes.
- **BEH-S153-8** — Display charge billing periods separately from lease dates, using existing date semantics. Deterministic observation: Use differing lease and charge dates and read both labels.
- **BEH-S153-9** — Desk, workspace, and newly prepared messages use consistent current-rent meaning and working-value precedence. Deterministic observation: Compare the same lease across the three consumers after an override and refresh.
- **BEH-S153-10** — After charge update, report charge readback separately from any continuing contractual-rent discrepancy; never claim an unsupported base-rent setter was used. Deterministic observation: Return a verified charge change with unchanged contractual rent and inspect the result.

**Human litmus outcome.**

### Understand what the tenant is paying

**If this was built correctly:** Open the lease and see current rent billing separately from fees, lease-contract rent, and listing reference. Expand prior/future charges when needed. If the records disagree, retain your working amount and continue with an honest indication of the difference.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                                                   |
| ----------- | -------------------- | ---------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| R-S153-1    | ARCH-S153-1          | BEH-S153-1       | Understand what the tenant is paying | Provide one identified current rent charge and a different contractual amount; read the labeled display. |
| R-S153-2    | ARCH-S153-1          | BEH-S153-2       | Understand what the tenant is paying | Add applicable pet/insurance/other charges and compare the rent label with the aggregate.                |
| R-S153-3    | ARCH-S153-1          | BEH-S153-3       | Understand what the tenant is paying | Give each amount a different value and inspect the supporting information.                               |
| R-S153-4    | ARCH-S153-2          | BEH-S153-4       | Understand what the tenant is paying | Read the charge amount and its provider-supported period.                                                |
| R-S153-5    | ARCH-S153-2          | BEH-S153-5       | Understand what the tenant is paying | Exercise each ambiguity and inspect both the projection and effect preparation.                          |
| R-S153-6    | ARCH-S153-1          | BEH-S153-6       | Understand what the tenant is paying | Use a working value while charge evidence is unresolved.                                                 |
| R-S153-7    | ARCH-S153-2          | BEH-S153-7       | Understand what the tenant is paying | Inspect current, historical, and future inventory entries in both modes.                                 |
| R-S153-8    | ARCH-S153-2          | BEH-S153-8       | Understand what the tenant is paying | Use differing lease and charge dates and read both labels.                                               |
| R-S153-9    | ARCH-S153-3          | BEH-S153-9       | Understand what the tenant is paying | Compare the same lease across the three consumers after an override and refresh.                         |
| R-S153-10   | ARCH-S153-3          | BEH-S153-10      | Understand what the tenant is paying | Return a verified charge change with unchanged contractual rent and inspect the result.                  |

**Preservation set.**

- Existing provider schedule interpretation, charge identities, actual source labels, and date/null handling.
- S113 F2.4 supported source-write meanings, especially charge success versus contractual-field discrepancy.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S153-1** — Multiple current rent candidates plus an aggregate must not yield a fabricated single rent or automatic allocation under ARCH-S153-2 and BEH-S153-5.
- **AC-S153-2** — A future rent charge and current non-rent fees must not change the current-rent label under BEH-S153-2/7/9.
- **AC-S153-3** — A verified charge update with unchanged contractual rent must preserve both the success and discrepancy under BEH-S153-10.

**Forbidden actions / hard gates.**

No guessed account, charge selection, date semantics, aggregate division, or unsupported base-rent write. Reads and display changes create no billing effect. Exact source updates belong to S160.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends S102 and S113 F2.4. Consumes S157 working values, S152 view presentation, and existing charge inventory. S161 uses the resulting labeled facts; S160 performs actual updates.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** The shared rent/charge projection, displays, affected consumers, and uncertainty/readback behavior with focused evidence.
- **Consumes, but does not assume:** Actual inventory and contractual/listing evidence. Missing or ambiguous entries are displayed as such and do not stop independent work.
- **Externally blocked effect:** Unavailable actual charge reads affect live current-billing evidence only; adapters can establish implementation behavior without a paid request or customer write.
- **Produces for downstream suites:** Consistent, source-labeled rent facts for desk, workspace, message preparation, and source-update results.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S153-_ to the declared ARCH-S153-_ and BEH-S153-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S153-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
