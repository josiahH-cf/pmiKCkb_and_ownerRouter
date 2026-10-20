<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->

# S229 — Preserve renewal usability and enforce unsent workflow communications

> Status: COMPLETE — bounded implementation and engineering/release gates verified deployed in run d33c7174; external resource limits and human NOT RUN remain explicit.

**Goal.**

The separately approved October 19 follow-up restores the existing governed unsent-draft entry
point and original-receipt recovery, preserves editable wording during source holds, and retains
actual source freshness for decisions. Focused application proof passed; later refusal-classification
and CI-isolation changes still await full qualification and integration. A later canonical
snapshot passed install/audit/format/lint/typecheck, but its whole unit inventory was interrupted
by the shared deadline; later inventories/build were not reached. This follow-up is not
deployed and preserves the Send/Schedule/Resume refusal and non-dispatching worker.

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

Normal managed Dotloop resource refresh succeeded on production. The supported individual
template list is empty; the company-template read failed as unavailable, which does not prove an
empty company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; no template recreation is requested. The live UI
distinguishes failed and empty reads and excludes unsupported profiles from selection. Both Dotloop
write keys remain closed. Gmail's provider profile read succeeded for the expected managed mailbox;
sync health reports degraded. No customer draft/send, loop, upload, signature, paid comp request or
production test record was verification proof. Normal connection refresh updates only its existing
credential/observation metadata; it is separate from guarded read-only release assurance.
All guarded release gates and independent production readbacks passed; human verdict remains NOT RUN.

**Cross-product impacts.**

Existing Next request proxy, owning server services, navigation/components, Firestore records, current facts/loop/register and focused deterministic tests. Shared source consumers and safety boundaries remain separately owned.

**Authority and evidence map.**

| Input                                                                        | Classification                           | Use and limitation                                                                                                                                             |
| ---------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| October 16 prepared application brief, read in full locally                  | Explicit execution instruction           | Carries confirmed scope through implementation and authorized delivery; no customer proof effects.                                                             |
| October 15 meeting at the timestamps above and confirming maintenance emails | Intent/reported or demonstrated behavior | Establishes decisions; does not prove API defects, provider success or human acceptance. Private sources stay outside Git.                                     |
| AGENTS.md, upstream 0b892865 code/tests and current facts                    | Authority / implementation evidence      | Existing send authority differs from this task's narrower explicit limit. Record the conflict honestly; no protected-key change is implied.                    |
| October 17 first attempt and managed reads                                   | Historical observation                   | Authentication/resource reads succeeded; first run a97c579c failed observation and verified rollback. Its actual evidence remains unchanged.                   |
| October 17 run d33c7174 and independent production checks                    | Current observation                      | Exact a7bce098 candidate, promotion, full two-checkpoint observation and eleven independent sections passed; bounded provider resource limits remain explicit. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S229-1** — Production sequence admission and dispatch must refuse sends even when an existing Registry key is open; the HTTP entry and UI project the same restriction. Keep the existing governed draft transport separate from the send pipeline and retain pending/uncertain historical attempts for reconciliation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S229-1** — Staff can edit, save/copy and explicitly create permitted unsent Gmail drafts. Send, Schedule and Resume are unavailable; an old schedule cannot dispatch on a worker tick. Existing history retains its actual sent/uncertain meaning. Search reflects the real authorized sources and marks retained maintenance results as history.

**Human litmus outcome.**

### Preserve renewal usability and enforce unsent workflow communications

**If this was built correctly:** Staff retain Focus/Full renewal work, readable facts, copy controls, saved working values and governed Gmail drafts while this task performs no client sends or schedules.

- Model verdict: ALL_GATES_GREEN — bounded diagnostic/preservation implementation and guarded production delivery passed; no human or provider business-effect acceptance is inferred.
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
- **Externally blocked effect:** Delivered implementation/release has no authentication hold. Template/selection-dependent Dotloop output waits on real supported resources and both closed keys; Gmail sync health is degraded. Human acceptance remains NOT RUN. No customer effect is proof.
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
