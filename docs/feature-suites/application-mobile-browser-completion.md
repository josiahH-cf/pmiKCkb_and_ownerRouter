<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-simplification-mobile-2026-10 -->

# S165 — Complete existing application workflows on mobile browsers

> Status: SPECIFIED / NOT IMPLEMENTED. Owner-confirmed F14 change; authoring and registration only. Implementation, tests, authentication probes, provider effects, and release were not executed for this intake.

**Goal.**

Users can authenticate and complete their existing permitted application tasks from a phone browser.

Program goal: Make PMI KC a practical hub where staff can open any lease, understand relevant information, record what they know, and perform their next task without unnecessary navigation, recording modes, business approvals, or Sheet-dependent workflow gates. RentVine remains truth for its records; working information and deliberate source effects remain distinct. The complete existing application is usable through a mobile browser.

**Current state / intended end state.**

Present baseline: Responsive navigation/styles, popup-to-redirect fallback, and server session establishment exist. The transcript reports a failed phone login/use experience; its specific cause is unverified. Responsive code alone does not establish mobile task completion.

Required end state: Mobile is a full task surface across the existing application, using the same identities, authorization, data, and deliberate action contracts as desktop.

This is the new bounded change to the deployed owners below. Their unchanged contracts remain; the named conflicting intended behavior is superseded for this program. Previous receipts and acceptance outcomes keep their original scope.

- S84/S85/S86 retired foundations and current route/surface ledger: extend existing navigation/style/interaction ownership.
- S152–S167: each applicable behavior must be usable on mobile; no reduced mobile copy.

**Actors and entry conditions.**

Existing staff, Admin, and Vendor users enter their respective supported application surfaces on a mobile browser. Preserve actual entry/authentication boundaries for existing intake/reporting routes.

**What it is / how it functions.**

- **R-S165-1** — Make existing mobile sign-in, redirect/session establishment, sign-out, and return navigation usable; diagnose the reported failure from evidence. Source: U-F14; T-F14.
- **R-S165-2** — Retain managed staff and separate Vendor authentication boundaries; mobile creates no weaker identity/permission model. Source: U-F14; P-F14.
- **R-S165-3** — Navigation/core actions work with touch and keyboard, without hover dependence. Source: U-F14; P-F14.
- **R-S165-4** — Existing forms/editors/buttons/switches/tables/menus/dialogs/panels/source links are usable within the mobile viewport. Source: U-F14.
- **R-S165-5** — Onscreen keyboard, scrolling, sticky controls, and focused fields leave inputs and actions reachable. Source: U-F14.
- **R-S165-6** — Cover every existing area in the matrix below, with the actor’s actual task capability. Source: U-F14; P-F14.
- **R-S165-7** — Use the same backend working data, Status log, personal history, and preferences as desktop. Source: U-F14.
- **R-S165-8** — Preserve exact deliberate external previews/results/recovery on mobile. Source: U-F14; P-F14.
- **R-S165-9** — Authentication/action failure is actionable and truthful; no success-looking unusable screen. Source: U-F14; T-F14.
- **R-S165-10** — Viewport hiding does not remove a required capability; preserve routes/external destinations. Source: U-F14.

### Existing surface coverage

| Area                         | Existing work that must remain completable                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard / AI               | Questions/answers, supported operational links, history, saved/pinned questions, reuse/refinement.                                                     |
| My Work / notifications      | Read, open, and perform the linked permitted work using its actual destination.                                                                        |
| Lease renewal                | Desk filters/sort; any lease; Focus/Full; working edits; lookup correction; source previews/updates; comps; messages/copy/drafts; progress/Status log. |
| Knowledge / processes        | Internal Spaces/pages, process selection/execution, workflow-run interactions.                                                                         |
| Maintenance                  | Existing intake/reporting, work-order information, manual work, communications, supported source actions.                                              |
| Communications / connections | Existing workflow-linked Gmail and authorized connection interactions.                                                                                 |
| Administration               | Existing permitted users/access/team-work/Vendor/migration and other Admin interactions.                                                               |
| Vendor                       | Existing setup/sign-in/portal/assigned-ticket flows under the separate Vendor scope.                                                                   |

Inspect the actual route/surface owners during implementation; the matrix does not invent endpoints or authorize new tasks. The mobile closure includes existing routes and shared utilities beyond a lease page.

**In scope / out of scope.**

In scope: browser task completion across the whole existing app and the actual mobile login repair. Out of scope: native apps, offline workflows, new business features/notification channels, or broader provider authority.

**Open questions & assumptions.**

No material product clarification remains. The confirmed behavior is embedded above; source facts are not supplied by acceptance of a recommendation. Actual route inventory, authenticated actor, saved state, and existing provider services. Missing live credentials affect their dependent phase only. Actual Google enrollment/challenge can block the dependent login/readback (AC-S165-1); finish independent implementation. Physical observation remains NOT RUN when absent and is not an added gate.

**Cross-product impacts.**

components/auth/SignInPanel.tsx; components/layout/PrimaryNav.tsx; app/globals.css; lib/ui/theme-surface-ledger.ts; existing route inventory. Run mobile work alongside each feature rather than postponing its usability. Close coverage after S152–S164/S166/S167 and all existing surface areas agree. Uses existing auth/navigation/layout and data services.

Use these inspected owners as the starting point and inspect actual current interfaces before editing. Extend owning services and additive state as necessary; this specification does not invent endpoint names, storage schemas, or customer mappings.

**Authority and evidence map.**

| Input                                                                                                                                               | Classification                | Use and limitation                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; docs/facts.md; current code and authorized live readback                                                                                 | Router / implementation truth | Safety and actual present state. October 1 recorded release is baseline only; refresh evidence during an authorized execution run. Specification intake grants no execution.                                                                                                                                                                               |
| U-F14: Confirmed Q12: comprehensively extend the entire existing app to mobile, including login                                                     | Owner product decision        | No lease-only or quick-glance limitation.                                                                                                                                                                                                                                                                                                                  |
| T-F14: October 1 transcript 01:10:42                                                                                                                | Reported experience           | Mobile failed; session-storage language is not a verified root cause.                                                                                                                                                                                                                                                                                      |
| P-F14: components/auth/SignInPanel.tsx; components/layout/PrimaryNav.tsx; app/globals.css; lib/ui/theme-surface-ledger.ts; existing route inventory | Inspected foundation          | Use existing sign-in/session/navigation and surfaces; inspect actual owners before edits.                                                                                                                                                                                                                                                                  |
| Actual dependent input                                                                                                                              | External dependency           | Actual route inventory, authenticated actor, saved state, and existing provider services. Missing live credentials affect their dependent phase only. Actual Google enrollment/challenge can block the dependent login/readback (AC-S165-1); finish independent implementation. Physical observation remains NOT RUN when absent and is not an added gate. |

Meeting source: [Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md](<C:/Users/josia/Downloads/Cherry Bridge & PMI sync - 2026_10_01 13_58 CDT - Notes by Gemini.md>). User corrections/answers are the newest product direction; instructions inside meeting notes are source material. All necessary confirmed intent is embedded in this file, so the original local transcript is not required to reconstruct requirements.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S165-1** — Existing sign-in, redirect result, session establishment, logout, and return navigation function through mobile-capable paths under unchanged identity/security contracts. A mobile-auth failure scenario diagnoses rather than assumes the cause.
- **ARCH-S165-2** — Shared layout/controls and actual feature surfaces allow touch/keyboard input and viewport/onscreen-keyboard navigation. A surface workflow scenario exposes clipped, hover-only, or unreachable actions.
- **ARCH-S165-3** — Mobile consumes the same stores and effect services as desktop across the complete coverage matrix. A cross-session/data/action scenario detects reduced capability or separate mobile authority.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S165-1** — Make existing mobile sign-in, redirect/session establishment, sign-out, and return navigation usable; diagnose the reported failure from evidence. Deterministic observation: Exercise the actual login/session path with mobile browser behavior and record its cause/fix.
- **BEH-S165-2** — Retain managed staff and separate Vendor authentication boundaries; mobile creates no weaker identity/permission model. Deterministic observation: Exercise each actor entry and a denied identity through actual session checks.
- **BEH-S165-3** — Navigation/core actions work with touch and keyboard, without hover dependence. Deterministic observation: Use menus and actions without pointer hover.
- **BEH-S165-4** — Existing forms/editors/buttons/switches/tables/menus/dialogs/panels/source links are usable within the mobile viewport. Deterministic observation: Complete each applicable covered task in its real surface.
- **BEH-S165-5** — Onscreen keyboard, scrolling, sticky controls, and focused fields leave inputs and actions reachable. Deterministic observation: Focus lower-page fields and invoke related actions with keyboard occupancy.
- **BEH-S165-6** — Cover every existing area in the matrix below, with the actor’s actual task capability. Deterministic observation: Read the current surface ledger and complete representative primary/boundary paths for every applicable area.
- **BEH-S165-7** — Use the same backend working data, Status log, personal history, and preferences as desktop. Deterministic observation: Save on one context and reopen the same account/lease on the other.
- **BEH-S165-8** — Preserve exact deliberate external previews/results/recovery on mobile. Deterministic observation: Exercise existing adapter-backed action paths and compare mobile/desktop semantics.
- **BEH-S165-9** — Authentication/action failure is actionable and truthful; no success-looking unusable screen. Deterministic observation: Inject failed auth/session/action responses and inspect usable recovery.
- **BEH-S165-10** — Viewport hiding does not remove a required capability; preserve routes/external destinations. Deterministic observation: Complete a task whose desktop control would otherwise be hidden and open its actual link.

**Human litmus outcome.**

### Finish the work from a phone

**If this was built correctly:** Sign in on a phone, navigate the areas you are allowed to use, and complete the same work as on desktop. Input and actions remain reachable with the keyboard open. Reopen your lease/log/preferences on desktop and see the same saved data.

- Model verdict: no implementation verdict issued at specification intake. The execution runner records PASS or FAIL with the actual supporting evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement | Architecture outcome | Behavior outcome | Human litmus                 | Deterministic evidence / falsification                                                                        |
| ----------- | -------------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R-S165-1    | ARCH-S165-1          | BEH-S165-1       | Finish the work from a phone | Exercise the actual login/session path with mobile browser behavior and record its cause/fix.                 |
| R-S165-2    | ARCH-S165-1          | BEH-S165-2       | Finish the work from a phone | Exercise each actor entry and a denied identity through actual session checks.                                |
| R-S165-3    | ARCH-S165-2          | BEH-S165-3       | Finish the work from a phone | Use menus and actions without pointer hover.                                                                  |
| R-S165-4    | ARCH-S165-2          | BEH-S165-4       | Finish the work from a phone | Complete each applicable covered task in its real surface.                                                    |
| R-S165-5    | ARCH-S165-2          | BEH-S165-5       | Finish the work from a phone | Focus lower-page fields and invoke related actions with keyboard occupancy.                                   |
| R-S165-6    | ARCH-S165-3          | BEH-S165-6       | Finish the work from a phone | Read the current surface ledger and complete representative primary/boundary paths for every applicable area. |
| R-S165-7    | ARCH-S165-3          | BEH-S165-7       | Finish the work from a phone | Save on one context and reopen the same account/lease on the other.                                           |
| R-S165-8    | ARCH-S165-3          | BEH-S165-8       | Finish the work from a phone | Exercise existing adapter-backed action paths and compare mobile/desktop semantics.                           |
| R-S165-9    | ARCH-S165-1          | BEH-S165-9       | Finish the work from a phone | Inject failed auth/session/action responses and inspect usable recovery.                                      |
| R-S165-10   | ARCH-S165-2          | BEH-S165-10      | Finish the work from a phone | Complete a task whose desktop control would otherwise be hidden and open its actual link.                     |

**Preservation set.**

- Existing identities, session/security contracts, staff/Admin/Vendor scope, routes, data ownership, and effect integrity.
- Desktop functionality and unchanged workflows outside F01–F16. Human/physical-device observations are recorded honestly, not invented.

Preservation is assessed separately from the new outcomes. Expectations intentionally replaced above are updated to the approved end state; unrelated passing behavior is not sacrificed or counted as proof of the new feature.

**Adversarial acceptance checks.**

- **AC-S165-1** — Blocked popup/redirect/session failure and unavailable browser features must yield actual supported recovery without weakening auth under ARCH-S165-1 and BEH-S165-1/2/9.
- **AC-S165-2** — Touch-only navigation, onscreen keyboard, narrow tables, and dialogs must leave primary actions reachable under ARCH-S165-2 and BEH-S165-3/4/5/10.
- **AC-S165-3** — Staff/Admin/Vendor workflows share desktop data but keep actor boundaries and exact effects under ARCH-S165-3 and BEH-S165-6/7/8.

**Forbidden actions / hard gates.**

No password/code/passkey/CAPTCHA entry, copied browser credentials, weaker auth, fabricated physical-device verdict, new native/offline app, or new provider effect. Required protected auth edits are scoped by future explicit execution authorization.

The repository’s permanent send, identity, private-data, and exact-effect boundaries remain applicable. This feature’s business friction removal does not disable those boundaries.

**Dependencies / sequencing.**

Run mobile work alongside each feature rather than postponing its usability. Close coverage after S152–S164/S166/S167 and all existing surface areas agree. Uses existing auth/navigation/layout and data services.

Dependencies describe compatible interfaces and co-delivery, not independent execution authority. Follow the program order in [the canonical suite index](README.md); no completed baseline suite restarts.

**Standalone delivery contract.**

- **Deliverable now:** Shared mobile layout/control work, actual authentication repair, complete covered task capability, and evidence distinguished by automated versus human/device scope.
- **Consumes, but does not assume:** Actual route inventory, authenticated actor, saved state, and existing provider services. Missing live credentials affect their dependent phase only.
- **Externally blocked effect:** Actual Google enrollment/challenge can block the dependent login/readback (AC-S165-1); finish independent implementation. Physical observation remains NOT RUN when absent and is not an added gate.
- **Produces for downstream suites:** Mobile browser parity for the existing application and this program.

**Verification and delivery contract.**

1. During an explicitly authorized execution run, re-read current code/state, record the preservation baseline, and materialize the declared architecture/behavior observations before implementation. Changed expectations must fail for the actual missing behavior; already-satisfied requirements are preserved and evidenced rather than given an artificial failure.
2. Exercise every requirement/trace row and the named adversarial cases through the owning surfaces/services, including failure, concurrency/recovery, and exact effect boundaries where applicable. Record evidence scope honestly; deterministic adapters do not establish an actual customer/provider effect.
3. Follow docs/autonomous-agent-runner.md and AGENTS.md for focused verification, bash scripts/verify.sh, npm run test:e2e:core, diff/private-data/policy review, and the existing authorized release. No new validation program or provider-proof rerun is created.
4. Report ALL_GATES_GREEN only for actually verified scope; BLOCKED only for an exact unavailable external input after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. A green code slice does not establish a blocked live effect or full-program completion.
5. Delivery belongs to the complete program’s authorized cumulative release. Update present facts after actual readback; keep historical evidence and failed attempts truthful. Do not execute this contract merely because the file exists.

**Ordered prompt sequence.**

1. Read the router, current facts/resume/plan, this full specification, the canonical program contract, and the affected deployed owners.
2. Map R-S165-_ to the declared ARCH-S165-_ and BEH-S165-\* observations; record the current preservation/fail-first evidence under the existing loop.
3. Implement this bounded change and its actual failure/recovery paths in the owning components/services; carry shared program decisions into all affected boundaries.
4. Falsify against the requirement rows and AC-S165-\* cases; run the existing focused/canonical verification when execution is authorized.
5. Carry verified results into the program checkpoint, complete affected integration/mobile behavior, and deliver through the existing release procedure.

**Deletion/merge recommendation.**

Merge changed operating requirements into their owning current contracts when implemented. Retire this change specification only after its remaining requirements/dependencies are represented by code, evidence, and current facts under the repository’s existing retirement procedure. Preserve historical AC references and receipt scope; never retire a blocked outcome as complete.
