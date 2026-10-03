<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S160 — Direct supported source updates for ordinary staff

> Status: IMPLEMENTED / AWAITING RELEASE. Owner-confirmed F09 change; implemented on 2026-10-02 under the owner's execution prompt (program commit `ba3f9719`, merged to main in PR #126) and queued for one cumulative release. No provider effect was used; human verdict NOT RUN.

**Goal.**

Ordinary staff can deliberately update supported RentVine or Sheet records without a business-approval or elevated-role handoff.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Role-action governance assigns source execution to manageAdmin; future rent depends on approved owner terms and tenant acceptance. Exact preview, claims, receipt/readback, ambiguity handling, and narrow provider methods already exist.

Required end state: Staff confirm a clear exact update in context. Removed business/role prerequisites are absent at UI and server boundaries; operation integrity and current/future meanings remain intact.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S97/S98 and S113 F2.4/F2.5: preserve writers/integrity; supersede business approvals, owner/tenant prerequisites, and Admin-only execution.

**Actors and entry conditions.**

An ordinary authenticated managed staff user, including Editor, with actual inputs for an existing supported operation. Verification-only accounts remain effect-refused.

**What it is / how it functions.**

- **R-S160-1** — Ordinary staff execute supported renewal updates without Approver/Admin, pricing, reconciliation, owner-response, tenant-response, or cycle handoffs. Source: U-F09.
- **R-S160-2** — Offer the action beside its working value and avoid retyping the correction into another approval form. Source: U-F09.
- **R-S160-3** — Preview lease, source, field/charge, current/proposed values, timing, and consequence; show selected Sheet location where relevant. Source: U-F09; P-F09.
- **R-S160-4** — Use deliberate human confirmation of the exact update without a separate business approval or attestation workflow. Source: U-F09; P-F09.
- **R-S160-5** — Align UI, route authorization, governance, and execution services; a visible button with an obsolete backend refusal is insufficient. Source: U-F09.
- **R-S160-6** — Future terms preserve current billing and current Sheet rent before their effective date. Source: P-F09; U-F09.
- **R-S160-7** — Show each charge change/create and schedule consequence separately; retain overlap/gap checks, without dividing aggregates or inventing account/schedule inputs. Source: P-F09.
- **R-S160-8** — Renewal-date changes preserve fresh startDate and untouched fields, including existing null/date-transition rules. Source: P-F09.
- **R-S160-9** — Report each destination/effect separately, including charge success with continuing contractual-rent discrepancy. Source: P-F09; U-F09.
- **R-S160-10** — Preserve duplicate protection, response-loss/ambiguity reconciliation, receipt recovery, readback, and applicable separately confirmed correction. Source: P-F09.
- **R-S160-11** — Stay within the operation matrix and recognized-field limits below; explain unsupported precise operations locally with the existing destination. Source: P-F09.

### Supported operation matrix

| Business intent                   | Existing operation                              | Meaning and limit                                                                                                                  |
| --------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Current rent billing              | rentvine.lease.recurring_charge.update          | Resolve the current account.isRent charge/schedule. Refresh charge/lease; report remaining contractual-rent difference separately. |
| Future rent                       | rentvine.lease.recurring_charge.create / update | Actual exact schedule; separate existing changes and future creates. No recorded owner/tenant approval prerequisite.               |
| Other supported recurring billing | Existing recurring-charge create / update       | Resolve actual account/schedule; template text creates no charge or fee policy.                                                    |
| Renewal dates                     | rentvine.lease.renewal_dates.update             | Existing lease POST; supported endDate/increaseEligibilityDate intent; preserve fresh startDate and untouched fields.              |
| Checklist row append              | google_sheets.renewal_checklist.row_append      | Server-resolved append with confirmation, claim, receipt, and readback.                                                            |
| Recognized field update           | google_sheets.renewal_checklist.field_update    | Eligible semantic field/cell with fresh before/proposed values and correction contract.                                            |

Recognized editable Sheet fields: owner pricing confirmed; renewal letter sent; renewal date; current base rent; market value; renewal completed; tenant response; information form sent; information form returned; lease documents sent; applicable Rhino policy renewed; pet registration; electronic signatures completed; additional insured verification; applicable recurring charge recorded; inspection-sheet follow-up; air-filter delivery; utility proof.

Owner/tenant email fields retain their separate verified-roster path; they do not become free-typed recipient updates.

There is no baseRentAmount setter in scope. A supported rent-account charge may be updated even when refreshed contractual rent differs. Do not emulate a one-time fee with a recurring schedule or change parties, deposits, ledger history, lease status, insurance enrollment, or arbitrary lease fields.

Existing create inputs accountID, amount, description, dayDue, frequency, startDate, and optional endDate come from actual server-resolved or exact reviewed business inputs. Browser-guessed identifiers and unrelated provider settings remain forbidden.

**In scope / out of scope.**

In scope: ordinary-staff entry/confirmation for existing exact operations and affected backend policy. Out of scope: new keys/methods, generic writes/deletes, autonomous execution, signatures, or unrelated administration.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual current targets/dates/schedules, recognized fields, credentials, and human confirmation; missing inputs remain local. Actual connection/permission or missing target blocks only that live operation (AC-S160-3). Activated keys need no proof rerun; independent work proceeds.

**Cross-product impacts.**

lib/lease-renewal/role-action-governance.ts; lib/lease-renewal/source-update-preview.ts; S97/S98; S113 F2.4/F2.5. Extends S97/S98/S113. Consumes S156 working terms, S157 values, S158 bindings, S159 Sheet enablement, and S167 access. Existing technical writers remain owners.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                   | Classification                                  | Use and limitation                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                     | Router / implementation truth                   | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                            |
| U-F09: Confirmed Q4, approval-mechanism removal, and Q10                                                                | Owner product decision                          | Separate app edits from deliberate source updates; remove owner/tenant/role handoffs.                                                                                                                                                                                                   |
| P-F09: lib/lease-renewal/role-action-governance.ts; lib/lease-renewal/source-update-preview.ts; S97/S98; S113 F2.4/F2.5 | Existing implementation / exact effect contract | Supported date/charge/Sheet methods and target/value/timing/receipt/recovery; no invented setter.                                                                                                                                                                                       |
| Actual dependent input                                                                                                  | External dependency                             | Actual current targets/dates/schedules, recognized fields, credentials, and human confirmation; missing inputs remain local. Actual connection/permission or missing target blocks only that live operation (AC-S160-3). Activated keys need no proof rerun; independent work proceeds. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S160-1** — Existing governance, routes, controls, and stores apply ordinary-staff capability consistently while preserving exact-key and verification-account boundaries. An Editor actual-route scenario detects residual Admin/business approval.
- **ARCH-S160-2** — Existing preparation resolves actual target, fresh before/proposed values, timing, and untouched fields from the same working intent. A current/future/multiple-charge scenario exposes misapplied values or guessed targets.
- **ARCH-S160-3** — Existing at-most-once/idempotent execution, receipts, readback, and ambiguity recovery remain per effect/destination. A lost-response/partial-destination scenario detects replay or false synchronized success.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S160-1** — Ordinary staff execute supported renewal updates without Approver/Admin, pricing, reconciliation, owner-response, tenant-response, or cycle handoffs. Deterministic observation: Exercise supported routes as Editor with those records absent.
- **BEH-S160-2** — Offer the action beside its working value and avoid retyping the correction into another approval form. Deterministic observation: Save working information and compare its prepared update value.
- **BEH-S160-3** — Preview lease, source, field/charge, current/proposed values, timing, and consequence; show selected Sheet location where relevant. Deterministic observation: Compare visible preview and actual target before dispatch.
- **BEH-S160-4** — Use deliberate human confirmation of the exact update without a separate business approval or attestation workflow. Deterministic observation: Complete the visible confirmation sequence.
- **BEH-S160-5** — Align UI, route authorization, governance, and execution services; a visible button with an obsolete backend refusal is insufficient. Deterministic observation: Invoke the actual route rather than only its UI projection.
- **BEH-S160-6** — Future terms preserve current billing and current Sheet rent before their effective date. Deterministic observation: Schedule future terms and inspect current values.
- **BEH-S160-7** — Show each charge change/create and schedule consequence separately; retain overlap/gap checks, without dividing aggregates or inventing account/schedule inputs. Deterministic observation: Prepare future rent with several charges and ambiguous account evidence.
- **BEH-S160-8** — Renewal-date changes preserve fresh startDate and untouched fields, including existing null/date-transition rules. Deterministic observation: Preview endDate/increaseEligibilityDate changes and compare untouched data.
- **BEH-S160-9** — Report each destination/effect separately, including charge success with continuing contractual-rent discrepancy. Deterministic observation: Return differing provider results and inspect separate claims.
- **BEH-S160-10** — Preserve duplicate protection, response-loss/ambiguity reconciliation, receipt recovery, readback, and applicable separately confirmed correction. Deterministic observation: Lose the dispatch response and reconcile without blind redispatch.
- **BEH-S160-11** — Stay within the operation matrix and recognized-field limits below; explain unsupported precise operations locally with the existing destination. Deterministic observation: Attempt an unsupported setter/cell/one-time-fee intent and continue other work.

**Human litmus outcome.**

### Update a supported source directly

**If this was built correctly:** Correct a working value, choose RentVine or the Sheet, inspect exactly what changes and when, and confirm it yourself. See each actual result and remaining discrepancy. Recover an uncertain effect without blindly sending it again.

- Model verdict: PASS on the full local gate and exact main CI for the program head (unit, backend, core E2E; counts in docs/facts.md, Current feature). Per-suite evidence is the F-row for this suite in docs/facts.md. Live verification follows the release.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                          |
| ----------- | -------------------- | ---------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| R-S160-1    | ARCH-S160-1          | BEH-S160-1       | Update a supported source directly | Exercise supported routes as Editor with those records absent.                  |
| R-S160-2    | ARCH-S160-2          | BEH-S160-2       | Update a supported source directly | Save working information and compare its prepared update value.                 |
| R-S160-3    | ARCH-S160-2          | BEH-S160-3       | Update a supported source directly | Compare visible preview and actual target before dispatch.                      |
| R-S160-4    | ARCH-S160-1          | BEH-S160-4       | Update a supported source directly | Complete the visible confirmation sequence.                                     |
| R-S160-5    | ARCH-S160-1          | BEH-S160-5       | Update a supported source directly | Invoke the actual route rather than only its UI projection.                     |
| R-S160-6    | ARCH-S160-2          | BEH-S160-6       | Update a supported source directly | Schedule future terms and inspect current values.                               |
| R-S160-7    | ARCH-S160-2          | BEH-S160-7       | Update a supported source directly | Prepare future rent with several charges and ambiguous account evidence.        |
| R-S160-8    | ARCH-S160-2          | BEH-S160-8       | Update a supported source directly | Preview endDate/increaseEligibilityDate changes and compare untouched data.     |
| R-S160-9    | ARCH-S160-3          | BEH-S160-9       | Update a supported source directly | Return differing provider results and inspect separate claims.                  |
| R-S160-10   | ARCH-S160-3          | BEH-S160-10      | Update a supported source directly | Lose the dispatch response and reconcile without blind redispatch.              |
| R-S160-11   | ARCH-S160-2          | BEH-S160-11      | Update a supported source directly | Attempt an unsupported setter/cell/one-time-fee intent and continue other work. |

**Preservation set.**

- Exact-key methods, actual target/value/timing, current/future billing, untouched fields, and charge/account identity.
- Claims/idempotency, response-loss recovery, receipts, readback, and correction; verification accounts stay read-only.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S160-1** — Editor without approval/acceptance reaches supported execution; verification accounts and unsupported keys cannot dispatch under ARCH-S160-1 and BEH-S160-1/5/11.
- **AC-S160-2** — Future rent, multiple charges, and base-rent mismatch retain current billing and separate meanings under BEH-S160-6/7/8/9.
- **AC-S160-3** — Lost response and a failed destination do not duplicate effects or fabricate all-destination completion under ARCH-S160-3 and BEH-S160-9/10.

**Forbidden actions / hard gates.**

No send, new key, compatibility action, guessed target/value, arbitrary cell, row delete, historical restore/proof replay, or general delete authority. Exact preview/confirmation and effect integrity remain. Protected policy changes need the future prompt’s explicit execution direction; authoring alone does not push them.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Extends S97/S98/S113. Consumes S156 working terms, S157 values, S158 bindings, S159 Sheet enablement, and S167 access. Existing technical writers remain owners.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Staff controls and matching governance/routes, precise previews, execution/recovery, documentation, and evidence without customer proof effects.
- **Consumes, but does not assume:** Actual current targets/dates/schedules, recognized fields, credentials, and human confirmation; missing inputs remain local.
- **Externally blocked effect:** Actual connection/permission or missing target blocks only that live operation (AC-S160-3). Activated keys need no proof rerun; independent work proceeds.
- **Produces for downstream suites:** A common deliberate source-update experience with separate honest results.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S160-_ to the declared ARCH-S160-_ and BEH-S160-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S160-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
