<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->

# S229 — Preserve renewal usability and enforce unsent workflow communications

> Status: PARTIAL — implementation and scoped checks passed; run a97c579c failed observation and verified rollback; corrected-tree qualification and replacement delivery pending.

**Goal.**

Staff retain Focus/Full renewal work, readable facts, copy controls, saved working values and governed Gmail drafts while this task performs no client sends or schedules.

**Current state / intended end state.**

October 15 17:42-25:48 demonstrates renewal/search/composer behavior and requests Gmail draft verification; demonstration is not proof. Baseline 0b892865 records human Send/Schedule and two notice send keys enabled under the October 9 program, conflicting with the prepared October 16 brief's unsent-only boundary. Current source refuses those operations while preserving the records, permissions and observable goal above.

**Actors and entry conditions.**

Existing managed staff work on their authorized leases and workflow-linked communications. Existing role, Space, mailbox and source scopes remain enforced. Governed unsent Gmail drafting stays an explicit permitted staff action; no role, identity or credential substitute is introduced.

**What it is / how it functions.**

Production sequence admission and dispatch must refuse sends even when an existing Registry key is open; the HTTP entry and UI project the same restriction. Keep the existing governed draft transport separate from the send pipeline and retain pending/uncertain historical attempts for reconciliation.

**In scope / out of scope.**

Follow the latest explicit task's reads/unsent-draft limit through an operation-level refusal without altering protected Action Registry activation metadata. Preserve linked history/reconciliation, draft editing/transport, permissions, autosave, source update contracts and tested search. Do not create customer drafts as proof or describe scheduling as live. No general inbox, bulk sends, new leasing or provider-key activation.

**Open questions & assumptions.**

Fresh approved CLI/ADC, GitHub and exact managed-account Admin browser checks passed October 17.
Normal managed Dotloop resource refresh succeeded. The supported individual profile returned an
empty template list; the company template read failed as unavailable, rather than proving an empty
company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; do not request template recreation. Both Dotloop write
keys remain closed. Gmail reads report the expected mailbox connected with degraded sync health.
Normal connection refresh updates credential/observation metadata; no customer/provider business
write, draft, send, loop, upload or signature was verification proof.

Run a97c579c failed final Notifications timing and verified rollback. The scoped parallel-read
repair must pass the complete gate, exact-main CI and a fresh guarded delivery. Human verdict NOT RUN.

**Cross-product impacts.**

Existing Next request proxy, owning server services, navigation/components, Firestore records, current facts/loop/register and focused deterministic tests. Shared source consumers and safety boundaries remain separately owned.

**Authority and evidence map.**

| Input                                                                        | Classification                           | Use and limitation                                                                                                                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| October 16 prepared application brief, read in full locally                  | Explicit execution instruction           | Carries confirmed scope through implementation and authorized delivery; no customer proof effects.                                                                |
| October 15 meeting at the timestamps above and confirming maintenance emails | Intent/reported or demonstrated behavior | Establishes decisions; does not prove API defects, provider success or human acceptance. Private sources stay outside Git.                                        |
| AGENTS.md, upstream 0b892865 code/tests and current facts                    | Authority / implementation evidence      | Existing send authority differs from this task's narrower explicit limit. Record the conflict honestly; no protected-key change is implied.                       |
| October 17 approved-Admin managed reads and release receipts                 | Current observation                      | Authentication ready; normal refresh succeeded, supported templates empty, company read failed, selection absent; final observation failed and rollback verified. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S229-1** — Production sequence admission and dispatch must refuse sends even when an existing Registry key is open; the HTTP entry and UI project the same restriction. Keep the existing governed draft transport separate from the send pipeline and retain pending/uncertain historical attempts for reconciliation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S229-1** — Staff can edit, save/copy and explicitly create permitted unsent Gmail drafts. Send, Schedule and Resume are unavailable; an old schedule cannot dispatch on a worker tick. Existing history retains its actual sent/uncertain meaning. Search reflects the real authorized sources and marks retained maintenance results as history.

**Human litmus outcome.**

### Preserve renewal usability and enforce unsent workflow communications

**If this was built correctly:** Staff retain Focus/Full renewal work, readable facts, copy controls, saved working values and governed Gmail drafts while this task performs no client sends or schedules.

- Model verdict: PARTIAL — deterministic checks and candidate assurance passed; production delivery remains pending after verified rollback.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                 | Architecture outcome | Behavior outcome | Human litmus                                                          | Deterministic evidence / falsification                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S229-1 — Refuse new Send/Schedule/Resume and worker dispatch before a provider effect while preserving old receipts and read-only reconciliation.         | ARCH-S229-1          | BEH-S229-1       | Preserve renewal usability and enforce unsent workflow communications | unsent-only HTTP/factory/UI regression; focused renewal Focus/Full, working-value/autosave/copy, Gmail draft/recovery, search and permissions preservation |
| R-S229-2 — Expose usable unsent draft, copy and history controls with truthful delivery wording.                                                            | ARCH-S229-1          | BEH-S229-1       | Preserve renewal usability and enforce unsent workflow communications | unsent-only HTTP/factory/UI regression; focused renewal Focus/Full, working-value/autosave/copy, Gmail draft/recovery, search and permissions preservation |
| R-S229-3 — Verify renewal Focus/Full/mobile facts/copy/autosave/source-update preservation with existing meaningful checks and repair any confirmed defect. | ARCH-S229-1          | BEH-S229-1       | Preserve renewal usability and enforce unsent workflow communications | unsent-only HTTP/factory/UI regression; focused renewal Focus/Full, working-value/autosave/copy, Gmail draft/recovery, search and permissions preservation |
| R-S229-4 — Check global search against actual source/index/authorization code rather than treating the meeting demonstration as proof.                      | ARCH-S229-1          | BEH-S229-1       | Preserve renewal usability and enforce unsent workflow communications | unsent-only HTTP/factory/UI regression; focused renewal Focus/Full, working-value/autosave/copy, Gmail draft/recovery, search and permissions preservation |

**Preservation set.**

Existing authorization, exact action gates, receipt/history interpretation, source versions, renewal Focus/Full/working values, permitted Gmail drafts and S182 boundaries remain green separately from the new outcomes.

**Adversarial acceptance checks.**

- **AC-S229-1** — Exercise the primary workflow/refusal through its real owning boundary; fail against the unchanged baseline for the named reason.
- **AC-S229-2** — Exercise stale, failed, unsupported, direct-route and recovery variants relevant to this scope; no missing evidence becomes success.
- **AC-S229-3** — Preserve authorized reads/history and unrelated renewal/knowledge consumers with no production data or provider mutation as proof.

**Forbidden actions / hard gates.**

No production data deletion, credentials/private raw evidence in Git, customer test draft/send, Dotloop writes, identity/permission change, invented Vendoroo URL or unrelated program execution. Protected paths retain their explicit-owner-direction rule. Existing exact-main CI, release lock, fresh prerequisites/GO, candidate assurance, receipt-bound promotion, full observation and independent readbacks remain mandatory.

**Dependencies / sequencing.**

Implementation proceeds independently. Fresh external evidence blocks only the named provider or release verification. Original Windows proposals and all other sessions remain untouched.

**Standalone delivery contract.**

- **Deliverable now:** Complete bounded code/test/documentation slice, including refusal and recovery behavior.
- **Consumes, but does not assume:** Existing managed connections, real source versions and supported exact resources. Missing values remain explicitly unavailable.
- **Externally blocked effect:** Authentication is ready. Template/selection-dependent output remains unavailable: supported templates empty, company read failed, saved selection absent. Both write keys stay closed. Release latency repair/qualification is runner-owned, not a human-authentication hold.
- **Produces for downstream suites:** Tested retained contracts and exact truthful evidence; no new execution queue for older suites.

**Verification and delivery contract.**

1. Preserve the baseline and intended failure evidence outside Git before implementation edits.
2. Run unsent-only HTTP/factory/UI regression; focused renewal Focus/Full, working-value/autosave/copy, Gmail draft/recovery, search and permissions preservation; keep preservation results separate.
3. Run bash scripts/verify.sh, inspect the diff, audit scope/PII/secrets/gates and deliver only green source.
4. Report ALL_GATES_GREEN only for actual passed gates; BUDGET_EXHAUSTED only for an explicit budget; BLOCKED names an exact unavailable input after independent work. Local passes do not establish provider/deployment success.

**Ordered prompt sequence.**

1. Recheck current code and available live state.
2. Record fail-first checks and preservation baseline.
3. Implement bounded behavior, refusals and recovery.
4. Verify, reconcile current documentation and perform authorized gated delivery where prerequisites pass.

**Deletion/merge recommendation.**

Retire this narrative only when remaining acceptance and dependency truth is fully represented by tests and current facts.
