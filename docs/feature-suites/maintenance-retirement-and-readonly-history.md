<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->

# S227 — Retire custom maintenance and preserve read-only history

> Status: PARTIAL — implementation and scoped checks passed; run a97c579c failed observation and verified rollback; corrected-tree qualification and replacement delivery pending.

**Goal.**

Staff use the renewal and knowledge application without active custom-maintenance intake, vendor operations or maintenance provider effects; authorized historical records remain readable.

**Current state / intended end state.**

Upstream 0b892865 serves maintenance capture, operational queues, policies, vendor work and shared workflow entry points. October 15 30:54–31:32 confirms retirement; Dan's email and Chasity's agreement independently reinforce it. The required end state is the observable goal above, with preserved records and permissions.

**Actors and entry conditions.**

Existing managed staff and authorized historical Vendor readers retain their existing record scope. Operational maintenance/vendor controls are retired for every role; retained history and knowledge keep their original permissions. No role, identity or credential substitute is introduced.

**What it is / how it functions.**

One unconditional retirement policy covers HTTP entry and shared operation admission before any write/provider construction. Retained read handlers keep their original authorization. No production data migration or deletion occurs.

**In scope / out of scope.**

Retire navigation, direct pages, public intake, maintenance/vendor mutation APIs, shared execution admission and background maintenance effects. Keep records, receipts, existing permissions, read-only history/reports, shared knowledge and renewal consumers. Vendoroo remains standalone with no invented URL. Acquisition audit, standalone importer and new leasing are excluded.

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

- **ARCH-S227-1** — One unconditional retirement policy covers HTTP entry and shared operation admission before any write/provider construction. Retained read handlers keep their original authorization. No production data migration or deletion occurs.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S227-1** — Operational pages show a clear retirement notice and a link to authorized read-only history. Retired APIs refuse with a stable 410 and no-store; unknown future mutation routes under the retired namespaces also refuse. Renewal, communications reads/drafts and knowledge continue.

**Human litmus outcome.**

### Retire custom maintenance and preserve read-only history

**If this was built correctly:** Staff use the renewal and knowledge application without active custom-maintenance intake, vendor operations or maintenance provider effects; authorized historical records remain readable.

- Model verdict: PARTIAL — deterministic checks and candidate assurance passed; production delivery remains pending after verified rollback.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                              | Architecture outcome | Behavior outcome | Human litmus                                             | Deterministic evidence / falsification                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R-S227-1 — Hide active maintenance/vendor entry controls and replace direct operational routes with a retirement notice. | ARCH-S227-1          | BEH-S227-1       | Retire custom maintenance and preserve read-only history | tests/unit/oct15-maintenance-retirement.test.ts; proxy integration, navigation, shared-admission and read-only history checks |
| R-S227-2 — Refuse intake, maintenance/vendor mutation, shared workflow execution and job effects before dispatch.        | ARCH-S227-1          | BEH-S227-1       | Retire custom maintenance and preserve read-only history | tests/unit/oct15-maintenance-retirement.test.ts; proxy integration, navigation, shared-admission and read-only history checks |
| R-S227-3 — Retain authorized ticket/history/report/receipt reads and all stored evidence without widening permissions.   | ARCH-S227-1          | BEH-S227-1       | Retire custom maintenance and preserve read-only history | tests/unit/oct15-maintenance-retirement.test.ts; proxy integration, navigation, shared-admission and read-only history checks |
| R-S227-4 — Keep shared renewal, communications and knowledge functionality usable and Vendoroo standalone.               | ARCH-S227-1          | BEH-S227-1       | Retire custom maintenance and preserve read-only history | tests/unit/oct15-maintenance-retirement.test.ts; proxy integration, navigation, shared-admission and read-only history checks |

**Preservation set.**

Existing authorization, exact action gates, receipt/history interpretation, source versions, renewal Focus/Full/working values, permitted Gmail drafts and S182 boundaries remain green separately from the new outcomes. Exact legacy maintenance and vendor-handoff Space IDs must refuse create/edit/publication/start/checklist/outcome changes. Their directory and direct Space views retain knowledge and authorized publication records while removing operational desks and new-process choices; no stored status is rewritten.

**Adversarial acceptance checks.**

- **AC-S227-1** — Exercise the primary workflow/refusal through its real owning boundary; fail against the unchanged baseline for the named reason.
- **AC-S227-2** — Exercise stale, failed, unsupported, direct-route and recovery variants relevant to this scope; no missing evidence becomes success.
- **AC-S227-3** — Preserve authorized reads/history and unrelated renewal/knowledge consumers with no production data or provider mutation as proof.

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
2. Run tests/unit/oct15-maintenance-retirement.test.ts; proxy integration, navigation, shared-admission and read-only history checks; keep preservation results separate.
3. Run bash scripts/verify.sh, inspect the diff, audit scope/PII/secrets/gates and deliver only green source.
4. Report ALL_GATES_GREEN only for actual passed gates; BUDGET_EXHAUSTED only for an explicit budget; BLOCKED names an exact unavailable input after independent work. Local passes do not establish provider/deployment success.

**Ordered prompt sequence.**

1. Recheck current code and available live state.
2. Record fail-first checks and preservation baseline.
3. Implement bounded behavior, refusals and recovery.
4. Verify, reconcile current documentation and perform authorized gated delivery where prerequisites pass.

**Deletion/merge recommendation.**

Retire this narrative only when remaining acceptance and dependency truth is fully represented by tests and current facts.
