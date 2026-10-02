<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S161 — Editable messages from available working information

> Status: SPECIFIED / NOT IMPLEMENTED. Owner-confirmed F10 change; authoring and registration only. Implementation, tests, authentication probes, provider effects, and release were not executed for this intake.

**Goal.**

Staff immediately have an editable owner/tenant message even when some business values are missing.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Existing preparation/readiness gates editing and outputs on completed inputs, reviewed/saved preparation, and cycle/owner terms. Published supplied templates, saved market evidence, and optional linked refinement exist.

Required end state: Known and working information fills approved templates; missing values are named markers and a concise callout. Authored wording survives refresh and incomplete information.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S113 F3/S129: replace completeness/review/cycle prerequisites while preserving supplied content and communication meanings.

**Actors and entry conditions.**

A staff user opens owner/tenant preparation using actual roster, working/source facts, published approved wording, saved comps, and actual resources.

**What it is / how it functions.**

- **R-S161-1** — Assemble approved existing templates from available facts, working values, applicable saved comps, and verified resources. Source: U-F10; P-F10.
- **R-S161-2** — Tenant preparation uses working terms without a recorded owner-approved outcome. Source: U-F10.
- **R-S161-3** — Expose editable subject/body despite missing business information. Source: U-F10.
- **R-S161-4** — Use named fill-in markers and a concise missing-value callout; preserve markers in output. Source: U-F10; S162.
- **R-S161-5** — Derive known values instead of repeat questions or mandatory verification checkboxes. Source: U-F10.
- **R-S161-6** — Use staff-entered rent/working information in new preparation. Source: T-F10; U-F10.
- **R-S161-7** — Refresh/new preparation does not silently replace existing authored subject/body. Source: U-F10; P-F10.
- **R-S161-8** — Preserve supplied wording/formatting, recurring/one-time charge distinctions, and managed signature. Source: P-F10.
- **R-S161-9** — Missing resources may remain explicit markers, never fabricated links or legal content. Source: P-F10; U-F10.
- **R-S161-10** — Keep relevant source, document, Gmail, and analysis-reference destinations accessible. Source: U-F10.
- **R-S161-11** — Saved RentCast evidence and deliberate lookup are available independently of owner approval; navigation makes no paid call. Source: P-F10; U-F10.
- **R-S161-12** — Preserve RentCast allowance, validation/cache/order, and conditional trend behavior; no new meeting-derived radius/pricing/freshness policy. Source: P-F10.
- **R-S161-13** — Existing linked AI refinement remains optional; primary edit/copy/draft needs no model call. Source: P-F10; U-F10.

**In scope / out of scope.**

In scope: existing owner/tenant preparation, missing values, independent terms/comps, and authored text. Out of scope: new templates, generated legal content, background paid work, reminders, or mandatory model calls.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual publications/facts/resources; absent business values are named markers, while resource-dependent output stays honest. An unavailable resource affects its exact output; business absence does not block editing/copy. Live RentCast/Gmail availability is local to explicit actions.

**Cross-product impacts.**

components/lease-renewal/RenewalMessagePreparation.tsx; lib/lease-renewal/renewal-message-content.ts; lib/lease-renewal/message-readiness.ts; S113 F3; S139. Consumes S153/S155/S156/S157; S163 owns greetings and S162 outputs. Extends S113 F3 and preserves S139.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                                                              | Classification                              | Use and limitation                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                                                                | Router / implementation truth               | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                                |
| U-F10: Confirmed Q3/Q5 and hub-centric direction                                                                                                                   | Owner product decision                      | Editable incomplete messages, named markers, derived known values, and working information.                                                                                                                                                                                                 |
| T-F10: October 1 transcript 01:08:41                                                                                                                               | Intent evidence                             | Entered rent feeds message preparation.                                                                                                                                                                                                                                                     |
| P-F10: components/lease-renewal/RenewalMessagePreparation.tsx; lib/lease-renewal/renewal-message-content.ts; lib/lease-renewal/message-readiness.ts; S113 F3; S139 | Inspected implementation / approved content | Reuse templates, formatting, deliberate comps, and authored-text protection.                                                                                                                                                                                                                |
| Actual dependent input                                                                                                                                             | External dependency                         | Actual publications/facts/resources; absent business values are named markers, while resource-dependent output stays honest. An unavailable resource affects its exact output; business absence does not block editing/copy. Live RentCast/Gmail availability is local to explicit actions. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S161-1** — The composer consumes labeled facts/working terms and exposes editable subject/body with missing markers. A partial-input scenario detects bodyReady/owner-response gating.
- **ARCH-S161-2** — Existing preparation persistence preserves authored text across autosave, changed facts, and refresh. An edited-body scenario detects silent replacement.
- **ARCH-S161-3** — Existing content/resource/comp/refinement integrations stay bounded and provenance-aware. A missing-resource scenario detects invented content or automatic paid/model work.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S161-1** — Assemble approved existing templates from available facts, working values, applicable saved comps, and verified resources. Deterministic observation: Prepare with differing source/working values and inspect labels.
- **BEH-S161-2** — Tenant preparation uses working terms without a recorded owner-approved outcome. Deterministic observation: Prepare with terms and no response.
- **BEH-S161-3** — Expose editable subject/body despite missing business information. Deterministic observation: Edit with several business fields absent.
- **BEH-S161-4** — Use named fill-in markers and a concise missing-value callout; preserve markers in output. Deterministic observation: Inspect and export incomplete text.
- **BEH-S161-5** — Derive known values instead of repeat questions or mandatory verification checkboxes. Deterministic observation: Inspect required interactions with existing known facts.
- **BEH-S161-6** — Use staff-entered rent/working information in new preparation. Deterministic observation: Enter a working rent and prepare the relevant audiences.
- **BEH-S161-7** — Refresh/new preparation does not silently replace existing authored subject/body. Deterministic observation: Edit, refresh facts, and compare exact text.
- **BEH-S161-8** — Preserve supplied wording/formatting, recurring/one-time charge distinctions, and managed signature. Deterministic observation: Render/copy approved content with applicable distinct items.
- **BEH-S161-9** — Missing resources may remain explicit markers, never fabricated links or legal content. Deterministic observation: Prepare with a blank resource and inspect output.
- **BEH-S161-10** — Keep relevant source, document, Gmail, and analysis-reference destinations accessible. Deterministic observation: Open actual destinations from preparation.
- **BEH-S161-11** — Saved RentCast evidence and deliberate lookup are available independently of owner approval; navigation makes no paid call. Deterministic observation: Open/reload, explicitly look up, and reopen saved evidence.
- **BEH-S161-12** — Preserve RentCast allowance, validation/cache/order, and conditional trend behavior; no new meeting-derived radius/pricing/freshness policy. Deterministic observation: Compare existing query/cache behavior and evidence labels.
- **BEH-S161-13** — Existing linked AI refinement remains optional; primary edit/copy/draft needs no model call. Deterministic observation: Use the primary path without refinement.

**Human litmus outcome.**

### Prepare without the questionnaire

**If this was built correctly:** Open either message and edit text filled from known information. Missing values are clearly named. Refresh the lease and keep your wording. Use saved comps or explicitly request a lookup when needed.

- Model verdict: no implementation verdict issued at specification intake. The execution runner records PASS or FAIL with the actual supporting evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                      | Deterministic evidence / falsification                           |
| ----------- | -------------------- | ---------------- | --------------------------------- | ---------------------------------------------------------------- |
| R-S161-1    | ARCH-S161-1          | BEH-S161-1       | Prepare without the questionnaire | Prepare with differing source/working values and inspect labels. |
| R-S161-2    | ARCH-S161-1          | BEH-S161-2       | Prepare without the questionnaire | Prepare with terms and no response.                              |
| R-S161-3    | ARCH-S161-1          | BEH-S161-3       | Prepare without the questionnaire | Edit with several business fields absent.                        |
| R-S161-4    | ARCH-S161-1          | BEH-S161-4       | Prepare without the questionnaire | Inspect and export incomplete text.                              |
| R-S161-5    | ARCH-S161-1          | BEH-S161-5       | Prepare without the questionnaire | Inspect required interactions with existing known facts.         |
| R-S161-6    | ARCH-S161-1          | BEH-S161-6       | Prepare without the questionnaire | Enter a working rent and prepare the relevant audiences.         |
| R-S161-7    | ARCH-S161-2          | BEH-S161-7       | Prepare without the questionnaire | Edit, refresh facts, and compare exact text.                     |
| R-S161-8    | ARCH-S161-3          | BEH-S161-8       | Prepare without the questionnaire | Render/copy approved content with applicable distinct items.     |
| R-S161-9    | ARCH-S161-3          | BEH-S161-9       | Prepare without the questionnaire | Prepare with a blank resource and inspect output.                |
| R-S161-10   | ARCH-S161-3          | BEH-S161-10      | Prepare without the questionnaire | Open actual destinations from preparation.                       |
| R-S161-11   | ARCH-S161-3          | BEH-S161-11      | Prepare without the questionnaire | Open/reload, explicitly look up, and reopen saved evidence.      |
| R-S161-12   | ARCH-S161-3          | BEH-S161-12      | Prepare without the questionnaire | Compare existing query/cache behavior and evidence labels.       |
| R-S161-13   | ARCH-S161-3          | BEH-S161-13      | Prepare without the questionnaire | Use the primary path without refinement.                         |

**Preservation set.**

- Published template provenance, supplied formatting, actual resources/recipients.
- RentCast query/cost/cache/order and optional linked refinement.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S161-1** — Missing business fields and no owner response still yield editable marked text under ARCH-S161-1 and BEH-S161-2/3/4.
- **AC-S161-2** — Working rent feeds new preparation without replacing authored text under BEH-S161-6/7.
- **AC-S161-3** — Missing resources/comps do not invent content or trigger background paid/model requests under BEH-S161-9/11/12/13.

**Forbidden actions / hard gates.**

No invented recipient/resource/charge/legal text or autonomous paid lookup/model/draft/send. Existing approved publications remain content sources; no extra user approval.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Consumes S153/S155/S156/S157; S163 owns greetings and S162 outputs. Extends S113 F3 and preserves S139.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Editable partial preparation, working facts, authored-text persistence, retained resources/comps/templates, and local missing states.
- **Consumes, but does not assume:** Actual publications/facts/resources; absent business values are named markers, while resource-dependent output stays honest.
- **Externally blocked effect:** An unavailable resource affects its exact output; business absence does not block editing/copy. Live RentCast/Gmail availability is local to explicit actions.
- **Produces for downstream suites:** Current editable subject/body and missing-value information for S162/S163.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S161-_ to the declared ARCH-S161-_ and BEH-S161-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S161-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
