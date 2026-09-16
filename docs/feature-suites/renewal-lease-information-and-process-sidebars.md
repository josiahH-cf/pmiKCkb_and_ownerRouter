<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-operator-hub-v1 -->

# S114 — Independent lease-information and process sidebars

> Status: IMPLEMENTED at `24b0be59`; verify.sh, core E2E and both compiled renewal browser checks passed on the integrated head `b29185a3`. The first production release attempt passed candidate assurance and promotion, then rolled back with verification after the post-promotion observer stalled on the Windows-SDK gcloud runtime; the release is resumed on the native watcher runtime. Human verdict: NOT RUN — no human observer.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).  
**Canonical file:** `docs/feature-suites/renewal-lease-information-and-process-sidebars.md`.  
**Authoring baseline:** `e903b68aa4efa2462f565f225d562924a57ccf8b`; re-read current main before implementation.  
**Requested execution order:** S114 → S115 → S116 → S117 → S118 → S119 → S120. This is feature 1 of 7 in this request, not the earlier September 14 batch.

**Goal.**

Keep the lease facts and process navigation available from anywhere in a renewal workspace, without repeatedly scrolling to the top. Preserve the liked global lease table and its click-back filters while making individual values and complete same-audience contact sets easy to select and copy.

**Current state / intended end state.**

`components/lease-renewal/RenewalWorkspace.tsx` renders the expanded lease/unit/party summary above the work. `components/lease-renewal/RenewalDashboardNavigation.tsx` renders an inline glossary disclosure plus section links. Its existing `focusRenewalDashboardControl` opens enclosing disclosures and focuses an actionable target. `RenewalDeskTable.tsx` supplies unit/contact presentation and the existing desk preserves filters through `desk-view-continuation.ts`.

The transcript explicitly requests **two separate, independent sliding sidebars**: one containing the header's consolidated information, the other containing the process glossary and within-page navigation. A single drawer with two tabs, an inline accordion, or a permanently expanded extra column does not meet that intent. The capture's pages 1–2 illustrate the long top-of-page information and inline glossary being replaced; no customer values from the capture belong in code or this spec.

In the inspected workspace header, only owners receive the constructed party-filter link; do not assume the tenant sidebar counterpart already exists. Preserve working table/owner filters and complete the requested tenant counterpart using the existing party-filter/query contract.

**Actors and entry conditions.**

Existing authorized Renewals readers can inspect, navigate and copy. Editing remains subject to the existing field/action roles; the sidebar itself grants no edit or provider authority. Preserve inspection-only lease behavior and unavailable/stale source indications. Opening a sidebar requires neither a reviewed cycle nor an external provider call.

**What it is / how it functions.**

### R114.1 — Two independent slide-out surfaces

Move the complete expanded header information into a toggleable **Lease information** sidebar and the process glossary/table of contents into a separately toggleable **Process guide** sidebar. Each has its own clearly named open/close control and state; opening or closing one does not silently discard the other's state or the operator's edits. Keep the controls available while the operator is lower on the page. Do not force repeated upward scrolling or move the liked global renewal table into a drawer.

Keep a compact lease identity, Back to renewals, refresh/freshness state and genuinely actionable attention visible in the main workspace. The full property/unit identifiers, lease dates and term, base rent and separately labeled references, owners, tenants and known contacts belong in the information panel. Do not duplicate the full old header in the page body. The later manual-status control belongs with this lease-level information, with its current value discoverable without losing the selected work section.

### R114.2 — Copy exactly the information selected

Represent names, email addresses, telephone values, identifiers, dates and amounts as separately selectable values, not one concatenated paragraph. A double-click on a value must make the intended whole value easy to select/copy, including multi-word names and full addresses/emails rather than only a word fragment. Provide an explicit accessible copy alternative; double-click must not simultaneously navigate away. Reuse existing clipboard feedback/fallback patterns rather than adding a dependency.

Support individual values and the full names/email list for **one selected audience**: all owners or all tenants. Do not silently reduce multiple parties to the first party. Label the audience and any known missing/unverified contact. Keep plain selection usable when clipboard permission is denied; do not log copied data. Copying staff-visible lease details is not an email-completeness approval, a provider write or evidence of delivery. Client-message copy gating is separately owned by S120.

### R114.3 — Retain meaningful navigation and click-back filters

Preserve working owner/table party filters and complete any missing owner or tenant click-back link in the new sidebar through the existing opaque party-filter resolver and canonical desk query. Both audiences must be able to open their relevant leases in the global table; this is not merely preservation of the owner-only header link. Retain the current query/return behavior. Separate data selection/copy affordances from link targets so neither interferes with the other. Expose the currently available lease record, matched Sheet row and other validated destinations in the information panel; use the existing destination builders. S116 repairs destination and Sheet-identity gaps; this feature must not guess a URL to conceal an unavailable destination.

The Process guide is the clickable table of contents for all five current dashboard sections and their real subsections/controls: lease facts/term/cycle, comparison, owner preparation/outreach/response, tenant preparation/delivery/response/form, documents/signatures/follow-up/completion and source updates. Preserve the current nested glossary's coverage rather than replacing it with five inert headings. A selection opens any enclosing disclosure, scrolls to the relevant section and focuses the real target without recording progress. Preserve historical `step` bookmarks, `renewal-section-*`/`renewal-step-*` targets or compatible redirects, desk continuation and browser Back/Forward.

### R114.4 — Usable while working

Use the existing PMI theme, responsive layout and transient-layer/focus conventions. Both panels must have keyboard/touch equivalents, an accessible name and close action, correct focus return and Escape handling appropriate to the existing layer behavior; no hover-only access. On narrow screens, keep the controls reachable and content unclipped without obscuring the chosen action. Opening, closing or navigating must not reset unsaved inputs, change verification/status, create a paid comp request or trigger persistence. Do not persist cosmetic panel state to a new backend service.

**In scope / out of scope.**

This feature owns the two sidebars, their content relocation, value-selection/copy interactions and retained within-page/desk navigation. It does not redesign the global table, change source joins, add source writes, repair every external link, rewrite all instructional content, add a status model or rebuild communications. Those bounded changes have their own files.

**Open questions & assumptions.**

No unresolved product decision remains. Two independent sidebars—not one combined panel—comes directly from the transcript. “Header information” means the existing consolidated lease/unit/party facts, with their source/freshness semantics preserved. Missing resources remain explicitly unavailable; this is not permission to fill them with examples.

**Cross-product impacts.**

Owning surfaces: `components/lease-renewal/RenewalWorkspace.tsx`, `RenewalDashboardNavigation.tsx`, `RenewalDeskTable.tsx`, and the lease page at `app/lease-renewal/live/desk/lease/[leaseId]/page.tsx`. Preserve `lib/lease-renewal/dashboard-sections.ts`, `desk-view-continuation.ts`, `desk-query-v2.ts`, `party-filter-key.ts` and `desk-destinations.ts` contracts. Existing shared UI/layer behavior is in `components/ui/` and `lib/ui/transient-layer.ts`.

Update only the affected navigation instructions and exact control mapping in `docs/products/renewal-operator-guide.md` and the current walkthrough when the implementation changes their controls. No provider configuration, new record store, integration activation or global navigation redesign is part of this change.

**Authority and evidence map.**

| Source                                                                                                                               | Classification                                               | Application here                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; current committed code and actual readbacks; `docs/facts.md`                                                            | Governing repository boundaries and implementation evidence  | Re-establish current truth before implementation. The earlier September 14 features and S113 are the baseline, not work to repeat. Older contradictory “candidate-only” prose does not override current code and facts.                              |
| The owner's September 15 renewal notes, transcript, summary, mindmap and supplied 19-page application capture                        | Requested product intent and reported behavior               | The requirements below incorporate the relevant details. “Rent volume” is RentVine; the spoken “Excel” is the configured Google operating Sheet. These private source materials need not be imported or available in an implementation conversation. |
| Owner acceptance of Q1A, Q2A and Q3A                                                                                                 | Resolved specification decisions                             | Where relevant, this file states the complete accepted rule. Acceptance was not a live-write, integration-activation or send authorization.                                                                                                          |
| `docs/autonomous-agent-runner.md`, `docs/environment-handoff.md`, `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md` | Existing implementation, specification and release contracts | Use the existing complete loop below. No new release process, extra independent review gate or blanket PR requirement is introduced.                                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S114-1** — The two presentation surfaces consume the same current lease and process projections as the workspace; they do not become independent sources of facts or progress. The component evidence must distinguish their open/close states.
- **ARCH-S114-2** — Value-copy actions and navigation use distinct interactions over existing projected values/destinations, preserving complete party arrays and canonical continuation. A component/route check must expose truncation, accidental navigation or lost return context.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S114-1** — From a lower workflow section, open either sidebar, obtain the relevant information or navigate to the real control, then close it and continue without losing work.
- **BEH-S114-2** — Select/copy one whole value or all names/emails for one audience, including multiple parties; a refused clipboard operation leaves selectable content and understandable feedback.
- **BEH-S114-3** — Keyboard, touch, narrow-screen and historic bookmarked entry preserve the same access and zero-effect navigation behavior.

**Human litmus outcome.**

### Get a contact or jump to a step without scrolling back

**If this was built correctly:** While working near documents, an operator opens lease information, copies all tenant emails, opens the separate process guide and jumps directly to the rent editor. The current lease and return filter are unchanged. Closing a panel does not erase unsaved work, and nothing is sent or recorded by navigation.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement                                                  | Architecture | Behavior / human litmus                  | Evidence / falsification                                                                       |
| ------------------------------------------------------------ | ------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| R114.1 independent sidebars and compact identity             | ARCH-S114-1  | BEH-S114-1; get a contact/jump to a step | Both controls work from a lower section; old full inline blocks are not duplicated; AC-S114-1. |
| R114.2 atomic selection and complete audience copy           | ARCH-S114-2  | BEH-S114-2; get a contact/jump to a step | Multi-word values, multiple recipients and denied clipboard; AC-S114-2.                        |
| R114.3 filters, destinations and exact section navigation    | ARCH-S114-2  | BEH-S114-1, BEH-S114-3                   | Existing filtered desk → lease → nested target → Back retains view; AC-S114-3.                 |
| R114.4 accessible, responsive and state-preserving operation | ARCH-S114-1  | BEH-S114-3                               | Existing focus/layer/viewport checks plus zero persistence/paid calls; AC-S114-4.              |

**Preservation set.**

Preserve the global desk columns/sorting/filtering and all source/progress meaning; the existing `tests/unit/s113-dashboard.test.tsx`, `tests/unit/s82-desk-copy-contract.test.ts`, destination/continuation tests, and the applicable compiled renewal desk/guide controls. Update selectors/copy assertions only where an intentional relocation changes them, not to remove checks. Existing shared layer/theme behavior remains a separate preservation gate.

**Adversarial acceptance checks.**

- **AC-S114-1** — R114.1 / ARCH-S114-1 / BEH-S114-1: independently operate both slide-out panels from below the fold; a single switched drawer or inline glossary fails. Verify no duplicate expanded header and no lost current section.
- **AC-S114-2** — R114.2 / ARCH-S114-2 / BEH-S114-2: copy an exact multi-word value and multiple same-audience addresses. Check no first-party truncation, no cross-audience message addressing, no double-click navigation, and truthful denied-clipboard fallback.
- **AC-S114-3** — R114.3 / ARCH-S114-2 / BEH-S114-3: nested guide and legacy step links open/focus the correct control; owner/tenant filter links and Back restore their actual desk context. Within the newly relocated sidebar/navigation, never turn an unavailable source into a fake external action. Underlying source and Sheet-link repairs remain S116; keep their honest unavailable state here rather than absorbing that later objective.
- **AC-S114-4** — R114.4 / ARCH-S114-1 / BEH-S114-3: preserve unsaved edits, focus/close behavior, inspection-only access and narrow-screen reachability. Navigation must cause zero application persistence, provider mutation or paid comparison call.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority; the Production + Live boundary; and the distinction between source facts, staff reports and provider-verified effects. Never add autonomous/bulk/model-triggered writes or client sends. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A link, a saved fact, a chosen status or a checked business decision is not a provider-effect receipt.

Do not widen action keys, change protected paths without their separately required authority, manufacture customer values, use test data in production, rerun completed provider proofs, or add new accounts, dependencies, services, background processes or billing headroom. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence remain outside Git. Use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Execute first in this request, after re-establishing the currently deployed baseline. This feature consumes existing source projections and destinations, not another implementation conversation. S115 will apply section-help content to this layout; S116 will repair the underlying source destinations; S119 will insert its lease-level status control. Do not pull those objectives into this release.

**Standalone delivery contract.**

**Deliverable now:** the complete sidebar/selection/navigation slice, its applicable preservation evidence and its own release. **Consumes, but does not assume:** current lease contacts, validated destinations and process targets; absent source values remain labeled rather than invented. **Externally blocked effect:** none is required to implement these read/copy/navigation behaviors. **Produces for downstream suites:** stable, reachable information/process surfaces and compatible control targets over current owning projections, not conversational memory.

**Verification and delivery contract.**

This is a future implementation handoff. Authoring or importing this Markdown is not implementation or release completion.

1. **Re-ground from a fresh context.** Read `AGENTS.md` and `docs/README.md`, then current `docs/facts.md`, `docs/loop-state.md`, `docs/open-blockers.md`, `docs/plan.md`, this file, the relevant owning contracts listed here, and `docs/environment-handoff.md`. Inspect the actual checkout, diff, current main, relevant code and read-only application state; preserve unrelated/user-owned changes. On the approved implementation host run `npm run auth:ensure` using the existing approved identity/store. A human authentication challenge pauses only its dependent phase; never substitute an identity or request secrets. Do not reuse a preceding conversation's source snapshot, lease state, release receipt, candidate or rollback revision.
2. **Establish this feature's evidence.** Record its current behavior and the smallest applicable preservation baseline. Materialize the architecture/behavior falsifications below before the implementation edit, using the existing test harnesses. A requirement already satisfied is preserved, not broken to fabricate fail-first evidence. A historical test-pass claim is not a new result. Implement only this objective, including its applicable error, partial-result and recovery paths.
3. **Run the existing gates for the changed slice.** Run focused tests and an intentional adversarial case, retaining preservation results separately. From the repository root in the documented WSL/native Node environment run:

   ```bash
   bash scripts/verify.sh
   npm run test:e2e:core
   ```

   `scripts/verify.sh` already performs the lockfile install, formatting, lint, type checks, units, Firestore/backend tests, router/falsification/context/path/spec-traceability/copy/redaction gates, budget guard and production build. Keep the documented two-worker Vitest ceiling. Exercise the existing applicable compiled renewal-desk and renewal-guide browser checks; use the existing navbar/theme coverage when this slice touches their shared controls. Do not replace or relax those checks, freshness requirements, role coverage, deadlines or failure accounting. No new blanket test or review program is required by this specification.

4. **Review and record the bounded result.** Audit the diff, secrets/PII, source destinations, exact action gates, runtime configuration, protected paths and rollback. Update only documentation made inaccurate by this feature, including its named operator/control references and the existing facts/status/plan/loop-state records. Do not claim deployed behavior before release. Keep private source captures and receipts outside Git.
5. **Integrate a green feature.** The router permits a green commit/push directly to `main`. When the actual checkout uses a feature branch, complete its applicable existing merge/integration path into `main`; do not invent a mandatory PR or bypass an applicable repository restriction. Preserve unrelated changes and never force-push, rewrite history, delete branches or create a release tag. Require successful CI for the exact integrated main SHA, not merely the branch or PR SHA.
6. **Complete this feature's serialized release.** Reuse the existing release watcher and lock described in `docs/environment-handoff.md`; do not start a competing watcher. `npm run release:watch:dry-run` is the documented print-only inspection. The existing watcher, or its documented `npm run release:watch:once` single-pass path only when it can run without competing ownership, carries the exact-main green change through the established driver. Follow that handoff's current arguments rather than inventing candidate identifiers. The required sequence is print-only plan, captured predecessor/configuration, zero-traffic Cloud Run candidate, exact commit/tag/revision anonymous smoke, authorized-domain and runtime readback, complete Admin assurance plus independent source reconciliation and monitoring, a fresh aggregate candidate-assurance receipt, then receipt-bound exact-revision promotion and 100% traffic readback. Production is project `pmi-kc-kb-prod`, region `us-central1`, service `pmi-kc-app`. Preserve its reviewed runtime identity, eleven Spaces, provider bindings, Sheet switch and allowance unless this feature explicitly changes a named business default in application code.
7. **Reach the actual completion boundary.** Complete the canonical-origin 300,000 ms observation with its immediate and end checkpoints and the bound promotion receipt. Independently read back `/api/version`, Ready state, exact serving commit/revision, traffic, runtime configuration, action state and the feature's applicable owning-page evidence. The current approved browser policy uses the enrolled owner Admin session and records Editor `not_run`; backend Editor/role tests remain required. Candidate and post-promotion assurance remain read-only with zero mutation attempts. The old exception for one exact historical predecessor is not reusable for a new failure. A required rollback must restore and verify the receipt-bound predecessor through the existing recovery path; preserve failed receipts/checkpoints and resume this same feature's loop, not the next feature. Diagnostics alone do not replace aggregate receipts or observation.
8. **Close and only then advance.** Record verified present truth in `docs/facts.md`, `docs/status.md`, `docs/plan.md`, `docs/loop-state.md` and this suite's status/evidence as applicable. Use `ALL_GATES_GREEN` only for passed applicable implementation and release gates; use `BLOCKED` for an exact unresolved required input/authority after independent fail-closed work, and `BUDGET_EXHAUSTED` only with an explicit user budget. Separately identify a resource-dependent live effect not exercised; do not call it operationally verified. A documentation-only import does not deploy an app, but the code/UI changes requested here do require their own release. Complete this feature's applicable cycle before beginning the next objective, then re-read the updated repository and project state as a fresh-context model.

**Ordered prompt sequence.**

1. Re-read the current context and inspect the actual inline summary/glossary, continuation and layer controls.
2. Establish the independent-panel, exact-copy and target-focus falsifications and preservation baseline.
3. Implement only this relocation and interaction objective; retain existing source/refusal semantics.
4. Complete the full verification, integration, deployment, observation and readback contract above. Re-ground afresh before S115.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` when importing it; use the suite ID, canonical path and sequence given above without replacing unrelated queue rows or marking work complete. No registration or queue edit has been performed by specification authoring. After implementation and applicable release completion, follow the repository's existing retirement rule only when every remaining requirement/dependency is represented by code, tests and current facts. Do not merge these features into one implementation followed by a single final deployment.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S114 | `docs/feature-suites/renewal-lease-information-and-process-sidebars.md` | SPECIFICATION READY; feature 1 of 7 in renewal-operator-hub-v1; implementation/release not started. |
```
