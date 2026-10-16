<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->

# S228 — Diagnose Dotloop renewal-template visibility without opening writes

> Status: PARTIAL - diagnostic repair and local regressions passed; managed connection/cache/absent selection and 401 were read; fresh profile/template visibility and delivery remain BLOCKED.

**Goal.**

An Admin can distinguish unsupported owning-profile visibility, failed provider reads, true empty lists, stale observations and a supported saved renewal selection.

**Current state / intended end state.**

October 15 3:01-8:22 reports an active Lease Renewal loop template visible in Dotloop. An API defect was proposed, not established. Baseline 0b892865 observes only individual/selected profiles; this change adds bounded company/office diagnostics and rejects future or failed account/profile observations. October 16 managed reads found an empty individual-profile cache, an unobserved company-profile template list and no saved renewal selection. The stored access credential is expired; an account GET returned 401 refresh_needed. This confirms the cached coverage gap, not the reported template's current owning profile or an API defect.

**Actors and entry conditions.**

An existing authorized Admin inspects the managed Dotloop connection and its exact profile/template selection. Diagnostic reads do not save a selection, widen supported profile types or grant either write key. Existing staff read scope remains unchanged; no identity or credential substitute is introduced.

**What it is / how it functions.**

Existing typed client and observation store own bounded discovery. The picker and readiness must agree on freshness and only accept current generation, successful account/profile reads and exact supported profile/template/status ids.

**In scope / out of scope.**

Use the documented profile/template GET contract and existing managed connection. Read bounded company/office observations for diagnosis, retain individual-profile loop support, identify read failure/truncation, reject future/stale/failed observations for selection. Keep both Dotloop write keys closed and all S182 AI-origin exclusions. No OAuth reenrollment, resource changes, loop creation, upload or signatures as proof.

**Open questions & assumptions.**

Approved CLI/ADC refresh passes and the current managed connection/cache/selection were read. A bounded account GET returned 401 using the stored expired access credential. No provider token refresh or observation/selection write was diagnostic proof. Current template visibility needs normal managed refresh; the Admin browser currently reaches Google's human password/challenge. Do not request template recreation or claim an API defect from this evidence.

**Cross-product impacts.**

Existing Next request proxy, owning server services, navigation/components, Firestore records, current facts/loop/register and focused deterministic tests. Shared source consumers and safety boundaries remain separately owned.

**Authority and evidence map.**

| Input                                                                        | Classification                           | Use and limitation                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| October 16 prepared application brief, read in full locally                  | Explicit execution instruction           | Carries confirmed scope through implementation and authorized delivery; no customer proof effects.                                          |
| October 15 meeting at the timestamps above and confirming maintenance emails | Intent/reported or demonstrated behavior | Establishes decisions; does not prove API defects, provider success or human acceptance. Private sources stay outside Git.                  |
| AGENTS.md, upstream 0b892865 code/tests and current facts                    | Authority / implementation evidence      | Existing send authority differs from this task's narrower explicit limit. Record the conflict honestly; no protected-key change is implied. |
| October 16 exact managed records, account GET and write-key readbacks        | Current observation                      | Cache omits company templates; selection absent; account GET 401; three records unchanged; both write keys closed.                          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S228-1** — Existing typed client and observation store own bounded discovery. The picker and readiness must agree on freshness and only accept current generation, successful account/profile reads and exact supported profile/template/status ids.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S228-1** — A company/office template may be visible diagnostically while remaining unavailable as a loop target. Empty, failed, skipped and truncated checks are distinct. No template name infers provider eligibility or silently saves resources.

**Human litmus outcome.**

### Diagnose Dotloop renewal-template visibility without opening writes

**If this was built correctly:** An Admin can distinguish unsupported owning-profile visibility, failed provider reads, true empty lists, stale observations and a supported saved renewal selection.

- Model verdict: PARTIAL - local repair passed and managed limitations were read; current template visibility and delivery remain unverified.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                         | Architecture outcome | Behavior outcome | Human litmus                                                        | Deterministic evidence / falsification                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| R-S228-1 — Read templates for bounded observed company/office profiles as well as supported individual profiles.                                                    | ARCH-S228-1          | BEH-S228-1       | Diagnose Dotloop renewal-template visibility without opening writes | tests/unit/oct15-dotloop-discovery.test.ts; existing S106 client/readiness/picker, runtime refresh and S182 boundary regressions |
| R-S228-2 — Display visibility/read-failure/truncation evidence without granting unsupported profile eligibility.                                                    | ARCH-S228-1          | BEH-S228-1       | Diagnose Dotloop renewal-template visibility without opening writes | tests/unit/oct15-dotloop-discovery.test.ts; existing S106 client/readiness/picker, runtime refresh and S182 boundary regressions |
| R-S228-3 — Reject future-dated, stale, other-generation or failed account/profile observations consistently.                                                        | ARCH-S228-1          | BEH-S228-1       | Diagnose Dotloop renewal-template visibility without opening writes | tests/unit/oct15-dotloop-discovery.test.ts; existing S106 client/readiness/picker, runtime refresh and S182 boundary regressions |
| R-S228-4 — Recheck the managed live connection and report exact current evidence or the precise unavailable read; never claim the meeting hypothesis as root cause. | ARCH-S228-1          | BEH-S228-1       | Diagnose Dotloop renewal-template visibility without opening writes | tests/unit/oct15-dotloop-discovery.test.ts; existing S106 client/readiness/picker, runtime refresh and S182 boundary regressions |

**Preservation set.**

Existing authorization, exact action gates, receipt/history interpretation, source versions, renewal Focus/Full/working values, permitted Gmail drafts and S182 boundaries remain green separately from the new outcomes.

**Adversarial acceptance checks.**

- **AC-S228-1** — Exercise the primary workflow/refusal through its real owning boundary; fail against the unchanged baseline for the named reason.
- **AC-S228-2** — Exercise stale, failed, unsupported, direct-route and recovery variants relevant to this scope; no missing evidence becomes success.
- **AC-S228-3** — Preserve authorized reads/history and unrelated renewal/knowledge consumers with no production data or provider mutation as proof.

**Forbidden actions / hard gates.**

No production data deletion, credentials/private raw evidence in Git, customer test draft/send, Dotloop writes, identity/permission change, invented Vendoroo URL or unrelated program execution. Protected paths retain their explicit-owner-direction rule. Existing exact-main CI, release lock, fresh prerequisites/GO, candidate assurance, receipt-bound promotion, full observation and independent readbacks remain mandatory.

**Dependencies / sequencing.**

Implementation proceeds independently. Fresh external evidence blocks only the named provider or release verification. Original Windows proposals and all other sessions remain untouched.

**Standalone delivery contract.**

- **Deliverable now:** Complete bounded code/test/documentation slice, including refusal and recovery behavior.
- **Consumes, but does not assume:** Existing managed connections, real source versions and supported exact resources. Missing values remain explicitly unavailable.
- **Externally blocked effect:** Current template visibility needs normal managed resource refresh after the approved Admin browser's Google challenge is completed. Host access and managed record reads pass; account GET returned 401. No template recreation, OAuth reenrollment or write-key activation is requested by this evidence.
- **Produces for downstream suites:** Tested retained contracts and exact truthful evidence; no new execution queue for older suites.

**Verification and delivery contract.**

1. Preserve the baseline and intended failure evidence outside Git before implementation edits.
2. Run tests/unit/oct15-dotloop-discovery.test.ts; existing S106 client/readiness/picker, runtime refresh and S182 boundary regressions; keep preservation results separate.
3. Run bash scripts/verify.sh, inspect the diff, audit scope/PII/secrets/gates and deliver only green source.
4. Report ALL_GATES_GREEN only for actual passed gates; BUDGET_EXHAUSTED only for an explicit budget; BLOCKED names an exact unavailable input after independent work. Local passes do not establish provider/deployment success.

**Ordered prompt sequence.**

1. Recheck current code and available live state.
2. Record fail-first checks and preservation baseline.
3. Implement bounded behavior, refusals and recovery.
4. Verify, reconcile current documentation and perform authorized gated delivery where prerequisites pass.

**Deletion/merge recommendation.**

Retire this narrative only when remaining acceptance and dependency truth is fully represented by tests and current facts.
