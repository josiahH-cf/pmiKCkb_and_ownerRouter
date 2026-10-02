<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S152 — Clear lease workspace with Focus as the default

> Status: SPECIFIED / NOT IMPLEMENTED. Owner-confirmed F01 change; authoring and registration only. Implementation, tests, authentication probes, provider effects, and release were not executed for this intake.

**Goal.**

A staff user opens a lease, recognizes the property and tenant, and can find and perform the relevant action without reading extensive descriptions.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: The inspected RenewalWorkspace and RenewalFocusViewContext already provide Full/Focus and in-pane work. The view context initializes Full, and both switch buttons use the secondary treatment. The October 1 meeting reports clutter, indistinct actions, and headings hidden by sticky navigation. The earlier S143 intake prose describes its pre-implementation baseline; current code and the October 1 facts establish that Focus is deployed.

Required end state: Focus opens by default. Full and Focus are equally workable views with visibly selected controls, a compact identity header, clear actions, and contextual rather than persistent long explanations.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S143/S144: existing Focus and in-pane surfaces; original Full-default and Full-view-preservation instructions are superseded only where this feature changes them.
- S113/S127: existing dashboard, links, and issue disclosures.

**Actors and entry conditions.**

An authorized managed staff user opens any real lease through an existing desk, work item, result link, or workspace route. Opening and switching are reads/presentation changes; no reviewed cycle or edit mode is needed.

**What it is / how it functions.**

- **R-S152-1** — Open each existing lease entry in Focus; visibly distinguish the selected Focus/Full button, including its accessible selected state. Source: U-F01; P-F01.
- **R-S152-2** — Both views support the same ordinary work; neither is an edit, review, or locked mode. Source: U-F01.
- **R-S152-3** — Present property address and tenant identity together in a compact lease heading. Source: T-F01.
- **R-S152-4** — Make current facts, the chosen task, and its actual actions prominent, using concise labels that describe their effects. Source: U-F01; T-F01.
- **R-S152-5** — Remove duplicated descriptions and explanatory walls from the main task area; retain short necessary instructions and put longer explanations in existing appropriate disclosures or supporting areas. Source: U-F01.
- **R-S152-6** — Keep actual freshness, discrepancies, operation failures, and material consequences visible through the existing mechanisms. Source: U-F01; P-F01.
- **R-S152-7** — Make recurring-charge refresh recognizable with the requested orange action treatment and truthful pending/result feedback. Source: T-F01.
- **R-S152-8** — Section navigation exposes the target heading below the sticky header; Focus controls remain reachable inside the pane. Source: T-F01.
- **R-S152-9** — Switching Full/Focus preserves the selected task and entered information and does not dispatch a provider action. Source: U-F01; P-F01.

**In scope / out of scope.**

In scope: presentation across both existing lease views, view default/selection, identity, controls, supporting explanations, and anchor/pane usability. Out of scope: a replacement workflow, new routes, a durable Full/Focus preference, or additional provider capability.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Existing lease identity, tasks, and issue projections; absent facts remain honestly unavailable rather than guessed. No new external effect or input is required. Human observation is NOT RUN unless actually performed; that is not a new delivery gate.

**Cross-product impacts.**

components/lease-renewal/RenewalWorkspace.tsx; components/lease-renewal/RenewalFocusViewContext.tsx; S143/S144. Consumes existing S143/S144 presentation and the S156 advisory-task contract. S153 owns rent meaning, S154 owns workability, S155 owns saves, and S165 owns mobile completion. Work can use their existing compatible interfaces during development; complete program delivery includes their final behavior.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                 | Classification                               | Use and limitation                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                   | Router / implementation truth                | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                               |
| U-F01: Confirmed global UI clarification and Focus-default answer                                                     | Owner product decision                       | Apply the clarity pass to both views; remove edit/lock modes and make the selected view obvious.                                                                                                                                                           |
| T-F01: October 1 transcript 00:24:13, 00:31:25–00:36:11, 00:47:06, 01:00:01–01:01:08                                  | Intent evidence                              | Identity, clutter, orange charge refresh, and unobscured headings; no inferred redesign from the phrase “bring things off screen.”                                                                                                                         |
| P-F01: components/lease-renewal/RenewalWorkspace.tsx; components/lease-renewal/RenewalFocusViewContext.tsx; S143/S144 | Inspected implementation / deployed baseline | Extend the mounted views and existing controls, rather than rebuilding a parallel workspace.                                                                                                                                                               |
| Actual dependent input                                                                                                | External dependency                          | Existing lease identity, tasks, and issue projections; absent facts remain honestly unavailable rather than guessed. No new external effect or input is required. Human observation is NOT RUN unless actually performed; that is not a new delivery gate. |

Meeting source: `Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md` (owner-held meeting notes, kept outside the repository). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S152-1** — The owning view context initializes Focus and projects one accessible selected state into the existing switch. A render/entry scenario distinguishes the current Full default from the required Focus default.
- **ARCH-S152-2** — The mounted workspace preserves task/input identity while compacting the header, action presentation, disclosures, and anchor placement. A switch-and-navigation scenario exposes lost input, hidden headings, or effects from a presentation change.
- **ARCH-S152-3** — Existing issue, source, and destination disclosures remain attached to the relevant work. A material-discrepancy scenario exposes information lost by the visual simplification.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S152-1** — Open each existing lease entry in Focus; visibly distinguish the selected Focus/Full button, including its accessible selected state. Deterministic observation: Open through desk and direct link; read the initial view and selected-control state.
- **BEH-S152-2** — Both views support the same ordinary work; neither is an edit, review, or locked mode. Deterministic observation: Perform a working edit in both views without a mode-enabling action.
- **BEH-S152-3** — Present property address and tenant identity together in a compact lease heading. Deterministic observation: Read the heading on a populated lease and at the mobile viewport.
- **BEH-S152-4** — Make current facts, the chosen task, and its actual actions prominent, using concise labels that describe their effects. Deterministic observation: Find and invoke the intended action without expanding unrelated explanatory sections.
- **BEH-S152-5** — Remove duplicated descriptions and explanatory walls from the main task area; retain short necessary instructions and put longer explanations in existing appropriate disclosures or supporting areas. Deterministic observation: Compare the task surface and its reachable supporting detail for the same lease.
- **BEH-S152-6** — Keep actual freshness, discrepancies, operation failures, and material consequences visible through the existing mechanisms. Deterministic observation: Inject a discrepancy and failed operation; inspect their visible meaning after the clarity changes.
- **BEH-S152-7** — Make recurring-charge refresh recognizable with the requested orange action treatment and truthful pending/result feedback. Deterministic observation: Identify charge refresh and observe pending, successful, and failed outcomes.
- **BEH-S152-8** — Section navigation exposes the target heading below the sticky header; Focus controls remain reachable inside the pane. Deterministic observation: Navigate to comps and another section, then use a pane control with the keyboard and touch.
- **BEH-S152-9** — Switching Full/Focus preserves the selected task and entered information and does not dispatch a provider action. Deterministic observation: Switch with unsaved or failed-save input while observing the action boundary.

**Human litmus outcome.**

### Find the task and use it

**If this was built correctly:** Open a lease and see the address, tenant, current facts, and a clear action in Focus. Enter information, switch to Full, and return without losing it. Find a source difference and its supporting detail without being stopped by a wall of instructions.

- Model verdict: no implementation verdict issued at specification intake. The execution runner records PASS or FAIL with the actual supporting evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus             | Deterministic evidence / falsification                                                              |
| ----------- | -------------------- | ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| R-S152-1    | ARCH-S152-1          | BEH-S152-1       | Find the task and use it | Open through desk and direct link; read the initial view and selected-control state.                |
| R-S152-2    | ARCH-S152-1          | BEH-S152-2       | Find the task and use it | Perform a working edit in both views without a mode-enabling action.                                |
| R-S152-3    | ARCH-S152-2          | BEH-S152-3       | Find the task and use it | Read the heading on a populated lease and at the mobile viewport.                                   |
| R-S152-4    | ARCH-S152-2          | BEH-S152-4       | Find the task and use it | Find and invoke the intended action without expanding unrelated explanatory sections.               |
| R-S152-5    | ARCH-S152-2          | BEH-S152-5       | Find the task and use it | Compare the task surface and its reachable supporting detail for the same lease.                    |
| R-S152-6    | ARCH-S152-3          | BEH-S152-6       | Find the task and use it | Inject a discrepancy and failed operation; inspect their visible meaning after the clarity changes. |
| R-S152-7    | ARCH-S152-2          | BEH-S152-7       | Find the task and use it | Identify charge refresh and observe pending, successful, and failed outcomes.                       |
| R-S152-8    | ARCH-S152-2          | BEH-S152-8       | Find the task and use it | Navigate to comps and another section, then use a pane control with the keyboard and touch.         |
| R-S152-9    | ARCH-S152-2          | BEH-S152-9       | Find the task and use it | Switch with unsaved or failed-save input while observing the action boundary.                       |

**Preservation set.**

- Existing lease routes, task identity, supporting source/document/Gmail links, and historical information.
- Keyboard/accessibility state and truthful operation feedback. Full-default and inspection-only assumptions intentionally change under this program.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S152-1** — With failed autosave input, switch both directions and navigate to a sticky-header section; retained text and a fully visible heading must satisfy ARCH-S152-2 and BEH-S152-8/9.
- **AC-S152-2** — With a fresh discrepancy and an unavailable source, compacting the task surface must retain the actual issue meaning under ARCH-S152-3 and BEH-S152-6.
- **AC-S152-3** — Opening, switching, and selecting a task make zero provider dispatches; charge refresh remains the deliberate read action under BEH-S152-7/9.

**Forbidden actions / hard gates.**

No provider write, paid comp request, draft creation, or workflow milestone from entry or view switching. Preserve real effect boundaries while applying the approved ordinary-work changes. Missing supporting data never becomes fabricated information.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Consumes existing S143/S144 presentation and the S156 advisory-task contract. S153 owns rent meaning, S154 owns workability, S155 owns saves, and S165 owns mobile completion. Work can use their existing compatible interfaces during development; complete program delivery includes their final behavior.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** The existing-view clarity/default slice, input continuity, issue preservation, and corresponding focused evidence and documentation.
- **Consumes, but does not assume:** Existing lease identity, tasks, and issue projections; absent facts remain honestly unavailable rather than guessed.
- **Externally blocked effect:** No new external effect or input is required. Human observation is NOT RUN unless actually performed; that is not a new delivery gate.
- **Produces for downstream suites:** A single clear workspace presentation consumed by all renewal features.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S152-_ to the declared ARCH-S152-_ and BEH-S152-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S152-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
