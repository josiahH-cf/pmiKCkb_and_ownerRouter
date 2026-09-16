<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-operator-hub-v1 -->

# S116 — Exact source links, reliable Sheet matching and complete contact emails

> Status: IMPLEMENTED at `7a19d338`; verify.sh, core E2E and both compiled renewal browser checks passed on the integrated head. The serialized production release is in progress. Actual cause of the reported missing-row defect, measured read-only on 2026-09-16 (counts only): the operating tab carries its RentVine links as rich text attached to the cell (146 rows; 0 formulas; 1 bare URL), which the formula-only read could not see. Live email-column synchronization is a named setup dependency until the Sheet manager adds "Owner emails" and "Tenant emails" to the "Lease Renewal" tab. Human verdict: NOT RUN — no human observer.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).  
**Canonical file:** `docs/feature-suites/renewal-source-links-and-sheet-contact-integrity.md`.  
**Authoring baseline:** `e903b68aa4efa2462f565f225d562924a57ccf8b`; re-read current main before implementation.  
**Requested execution order:** S114 → S115 → S116 → S117 → S118 → S119 → S120. This is feature 3 of 7 in this request, not the earlier September 14 batch.

**Goal.**

Make the renewal workspace a trustworthy hub for opening the exact RentVine record, operating Sheet row/cell and communication evidence, and keep all source-backed owner/tenant email addresses in their correct Sheet fields. Prevent an existing or ambiguously matched Sheet row from being treated as permission to append a duplicate.

**Current state / intended end state.**

`lib/lease-renewal/desk-destinations.ts` already builds exact RentVine lease/owner/message destinations and operating Sheet tab/row/cell destinations. `live-desk.ts` still has a RentVine source-link path dependent on a Sheet-provided hyperlink. `sheet-links.ts` pairs evaluated Sheet values with the formula hyperlink layer. `sheet-writeback/workspace-resolution.ts` resolves exact lease links or normal app-row notes and returns a missing-row state when no exact match is found.

The user reports an existing row that “Review Sheet updates” did not find and a RentVine verification link that returned to the app. The supplied capture shows an append proposal, but does not prove the live row's hyperlink representation or the root cause. Specify and repair the actual source-resolution defect without claiming it has already been reproduced.

The current `headers.ts` Renewals schema and `sheet-writeback/field-intent.ts` editable allowlist contain no owner-email or tenant-email fields. The existing recipient resolver already supplies source-bound To/Cc recipients and refuses owner/tenant collisions. The accepted Q3A decision adds two explicit Sheet meanings, not arbitrary column management.

**Actors and entry conditions.**

Authorized Renewals users can inspect/copy permitted source information. Existing Editors prepare ordinary app-owned proposals, existing reconciliation/approval roles retain their authority, and Admins exact-confirm provider/Sheet writes. The server resolves the configured operating Sheet and authenticated lease; the browser must not supply workbook, physical row, arbitrary range or recipient authority.

**What it is / how it functions.**

### R116.1 — Source and action destination contract

| Visible information/action                             | Destination and required distinction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RentVine source/verified badge and lease-record action | The current lease on the configured RentVine tenant host using `buildRentvineRecordDestination` with the validated current lease ID. It must not depend on whether a Sheet row already contains a link. Do not hard-code the example lease from the private capture.                                                                                                                                                                                                                                                                                             |
| Native RentVine scoped/filter navigation               | Preserve the requested ability to open the relevant lease set or context in RentVine when its actual current scoped/filter destination can be verified. Reuse only a documented or directly observed native destination with current source identities. No such filter-URL contract was established at authoring; the implementation must inspect it read-only, not invent query parameters. When unavailable, name that scoped action as unavailable and offer a separately labeled exact-record destination; never claim the record view is a filtered result. |
| Owner record or owner communications                   | The exact current source-resolved owner record/messages destination, separately identified for multiple owners.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Lease messages / tenant communication handoff          | The existing lease-specific RentVine messages destination, adjacent to the relevant copy/preparation action. This is navigation, not chat posting.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Sheet source/badge/value                               | The configured operating spreadsheet, actual tab ID and freshly matched row; include the actual semantic field cell when resolved. A workbook-level fallback is explicitly labeled, never passed off as the matched row.                                                                                                                                                                                                                                                                                                                                         |
| Existing Gmail evidence                                | The exact linked thread/draft when an existing verified destination is available. “Open Gmail Drafts” is honestly labeled as the signed-in managed mailbox's Drafts folder, not as a specific draft. Do not guess message IDs or Gmail URLs from unrelated identifiers.                                                                                                                                                                                                                                                                                          |
| Party/status links in the app                          | The appropriate existing filtered renewal table or real internal field/action, retaining continuation. Never redirect an explicitly external source badge to the same internal page.                                                                                                                                                                                                                                                                                                                                                                             |

Use existing HTTPS/host/record validation and external-link protections. Distinguish “source read from RentVine” from “RentVine and Sheet agree”; a destination must not change evidence meaning. If a real destination is unavailable, say exactly which link is unavailable and retain a useful separately labeled internal comparison; do not render a fake verified link, homepage substitute or self-loop.

S118 owns the RentCast report/search link because it also owns the comparison's query parameters and retained source evidence. Preserve that integration point here instead of inventing a different RentCast source model. Repairs must apply to the main workspace, information sidebar, badges, table source destinations and message handoffs that use the same builders, not only one example record.

### R116.2 — Resolve the reported Sheet-row defect from current evidence

Trace the configured `Renewals` tab through the actual source read, header resolution, hyperlink/formula/value representation, app-row note identity, pipeline join, workspace context and update/append decision. Inspect the relevant row's available hyperlink metadata read-only when the current value/formula layer does not represent its real link. Establish the actual cause; do not assume that a rich-text link, formatting, a name variation or a stale read is the cause from the transcript alone.

An existing row with one valid stable lease association must resolve consistently in the desk, workspace, row/cell links and update preview. Preserve evaluated formula values, actual physical row coordinates, tab identity and normal app-created row notes through filtering/normalization. A section divider, offset header, hidden/blank row, proof-row exclusion or unrelated inserted row must not shift a logical lease onto a different physical write target.

Multiple candidate rows, conflicting lease/property links or notes, unreadable/incomplete metadata and a plausible existing row without sufficient stable association are **not confirmed absence**. Surface the distinction in plain English and block append/update for the affected ambiguous target. Do not solve the defect by authorizing an address/name-only durable join. Use names only as inspection evidence, never as the sole authority for source writes. If the actual source lacks the needed identity, give a precise link to correct the source association through its existing owner-controlled path; do not fabricate one in the app.

Only a fresh, complete one-to-one source check establishing that no operating row represents this exact lease permits the existing normal append preview. Preserve lease-scoped one-attempt/receipt/readback behavior. An uncertain previous append must reconcile before any new append; no second row or proof replay is an acceptable recovery. No new “create anyway” override is requested.

### R116.3 — Accepted Q3A: two complete, audience-separated email fields

The operating `Renewals` tab is to contain **Owner emails** and **Tenant emails**. Each stores the complete current source-backed address set for that lease and audience. Reuse a current column only after its actual meaning is confirmed; do not silently repurpose a generic, ambiguous or unrelated column. The implementation extends only these semantic header mappings, value validation and existing narrow field-update proposal path. This does not make contact identity, formulas, formatting or arbitrary columns editable.

Use deterministic, human-copyable address-list formatting consistent with the application's existing recipient normalization. Preserve all distinct valid addresses, normalize duplicates without dropping different people or inventing values, and visibly identify missing/invalid/unverified source contacts. Do not use a substring, fixed first-recipient slot or existing generic text limit to silently truncate the full set. Preserve the owning source/contact association; a copied Sheet value does not itself confer verified-recipient authority. Never put message bodies or archived correspondence into these columns.

Prepare each changed email field from the current lease roster, not freely typed browser recipient overrides. Preview the exact audience, current Sheet contents and proposed complete contents. Re-read the full current source roster and exact row/header/value before the independently confirmed update; roster or collaborator drift invalidates the preview. Persist the existing claim, receipt and readback and offer a fresh confirmed correction when required. Reads, sidebar opening and draft preparation must not automatically synchronize the Sheet. This is per-lease reviewed work, not a bulk portfolio backfill.

**Missing-column boundary:** inspect before requesting setup. When equivalent columns are absent, identify the two required headers and the configured tab to the owner/Sheet manager. An owner-managed addition of those exact columns, followed by header/readback verification, is the setup dependency. Neither this specification nor Q3A authorizes the runner to create live columns or add an arbitrary column-management feature. Implement the explicit missing-mapping state and preserve all unrelated work. Do not mark live contact synchronization verified before its real columns and exact confirmed write/readback exist.

### R116.4 — Complete recipients in copy and drafts

Expose the complete owner and tenant recipient sets for copying and use the same source-bound recipient resolution for the corresponding message. Preserve the current verified primary To selection and include every additional verified same-audience address in Cc; deduplicate To/Cc without silently dropping additional tenants or owners. Preserve existing approved staff Cc only when its source/configuration resolves; do not invent staff recipients.

Owner and tenant client channels remain separate. A cross-channel address collision or an incomplete required roster refuses the affected final addressed message and routes to source correction; it must not be “fixed” by omitting a party. Source-backed display/copy and verified sending eligibility retain their distinct meanings. No contact edit in RentVine, direct message send or new messaging integration is part of this feature.

**In scope / out of scope.**

Own the exact source-destination repairs, the reported Sheet association/duplicate-append defect, two accepted contact-email Sheet fields and complete recipient projection. Do not add generic spreadsheet editing, automated column creation, arbitrary record relinking, new provider keys, mailbox scraping, background synchronization or bulk contact backfill. S118 owns RentCast links; S120 owns message readiness and downstream layout.

**Open questions & assumptions.**

Q3A is accepted: use Owner emails and Tenant emails with all current source-backed addresses, reusing only confirmed-equivalent existing columns. Missing live columns remain a named setup dependency, not an unresolved schema choice. No authoring question remains. The reported Sheet defect's exact production cause remains an implementation investigation, not a guessed requirement or a claim of correction.

**Cross-product impacts.**

Relevant code: `lib/lease-renewal/desk-destinations.ts`, `live-desk.ts`, `sheet-links.ts`, `headers.ts`, `sheet-writeback/workspace-resolution.ts`, `sheet-writeback/field-intent.ts`, `sheet-writeback/execution-service.ts`, `recipient-resolution.ts`, `execution/renewal-draft-preview.ts`, `execution/supplied-renewal-draft-preview.ts`; `components/lease-renewal/RenewalWorkspace.tsx`, `RenewalDeskTable.tsx`, `OperatingSheetPanel.tsx`, `RenewalMessagePreparation.tsx`; and the owning lease page. Inspect the existing Google Sheets reader only for the source metadata required by the demonstrated resolution gap.

Existing contracts: `docs/products/lease-renewal-spreadsheet-map.md`, `docs/feature-suites/operating-renewal-sheet-writeback.md`, S113 F1.3/F2, and the operator guide. During implementation reconcile those exact source/field meanings and guide controls; do not rewrite unrelated backlog or source truth.

**Authority and evidence map.**

| Source                                                                                                                               | Classification                                               | Application here                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; current committed code and actual readbacks; `docs/facts.md`                                                            | Governing repository boundaries and implementation evidence  | Re-establish current truth before implementation. The earlier September 14 features and S113 are the baseline, not work to repeat. Older contradictory “candidate-only” prose does not override current code and facts.                              |
| The owner's September 15 renewal notes, transcript, summary, mindmap and supplied 19-page application capture                        | Requested product intent and reported behavior               | The requirements below incorporate the relevant details. “Rent volume” is RentVine; the spoken “Excel” is the configured Google operating Sheet. These private source materials need not be imported or available in an implementation conversation. |
| Owner acceptance of Q1A, Q2A and Q3A                                                                                                 | Resolved specification decisions                             | Where relevant, this file states the complete accepted rule. Acceptance was not a live-write, integration-activation or send authorization.                                                                                                          |
| `docs/autonomous-agent-runner.md`, `docs/environment-handoff.md`, `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md` | Existing implementation, specification and release contracts | Use the existing complete loop below. No new release process, extra independent review gate or blanket PR requirement is introduced.                                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S116-1** — Existing destination builders resolve one current source identity independent of unrelated Sheet-link availability, and remain distinct from internal action/continuation links.
- **ARCH-S116-2** — One fresh server-owned lease/row association governs presentation, update and absence-before-append. An incomplete or ambiguous read cannot become a missing-row authorization.
- **ARCH-S116-3** — The two typed email fields and copy/draft recipient sets derive from complete source rosters; only existing exact-confirmed Sheet operations can persist them. Roster drift and channel separation remain enforced.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S116-1** — A source badge opens its actual lease/row/cell/thread where known, including a RentVine-only lease without a Sheet hyperlink.
- **BEH-S116-2** — An existing row is recognized, ambiguous identity is explained without an append offer, and confirmed absence retains the existing safe append path.
- **BEH-S116-3** — Multiple owners/tenants remain present in their separate Sheet email fields and To/Cc preparations; missing mapping or recipient evidence is actionable, not silently omitted.

**Human litmus outcome.**

### Verify the exact source and address everyone in the right audience

**If this was built correctly:** The operator opens RentVine from a source badge and lands on the correct lease, opens the matched Sheet row rather than the workbook homepage, and sees that an existing row will be updated rather than duplicated. All tenants are available in the tenant recipient list; owners remain separate. A missing column or uncertain source match states the specific correction needed without writing anything.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement                                                     | Architecture | Behavior / human litmus                    | Evidence / falsification                                                                               |
| --------------------------------------------------------------- | ------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| R116.1 exact external versus internal destinations              | ARCH-S116-1  | BEH-S116-1; verify source/address everyone | Lease without Sheet link, exact row/cell and managed messaging destinations; AC-S116-1.                |
| R116.2 reliable existing-row resolution and no duplicate append | ARCH-S116-2  | BEH-S116-2                                 | Actual cause plus stable identity, offset/header/metadata and ambiguous/partial-read cases; AC-S116-2. |
| R116.3 complete separated email fields under Q3A                | ARCH-S116-3  | BEH-S116-3                                 | Confirmed/missing headers, multi-address fidelity, drift and exact update readback; AC-S116-3.         |
| R116.4 all same-audience To/Cc recipients                       | ARCH-S116-3  | BEH-S116-3                                 | Multiple parties, duplicates, missing email and cross-channel collision; AC-S116-4.                    |

**Preservation set.**

Preserve existing `tests/unit/s82-desk-destinations.test.ts`, Sheet join/header/workspace-resolution and execution tests, recipient/channel-separation checks, existing normal append/readback/correction behavior, and independent release reconciliation. The compiler/browser destination reader must still verify source identity independently; do not modify it to accept any URL merely to make a badge pass.

**Adversarial acceptance checks.**

- **AC-S116-1** — R116.1 / ARCH-S116-1 / BEH-S116-1: a RentVine source badge works with no Sheet link; exact host/lease mismatch, unsafe URL and unknown message identity are refused. Sheet links follow freshly resolved coordinates; a generic Drafts folder is not labeled an exact draft. Verify any native RentVine scoped/filter destination before exposing it; an unavailable scoped action has its precise limitation and separately labeled record fallback, not guessed parameters.
- **AC-S116-2** — R116.2 / ARCH-S116-2 / BEH-S116-2: reproduce the demonstrated source-representation problem with a sanitized deterministic fixture. Existing row, normal app-row note, duplicate/conflicting identities, incomplete metadata, header/row offsets and uncertain prior append cannot create a duplicate. Record the actual cause; do not claim live reproduction without evidence.
- **AC-S116-3** — R116.3 / ARCH-S116-3 / BEH-S116-3: verify both exact email semantics, a complete multiple-address list, missing-column refusal, source/header/value drift and preview-confirm-claim-readback/correction. No read-triggered or bulk write and no silent truncation are allowed.
- **AC-S116-4** — R116.4 / ARCH-S116-3 / BEH-S116-3: additional tenants and owners appear in their correct Cc sets; no cross-audience leakage or fabricated address. Incomplete/ambiguous recipient evidence refuses final addressing rather than dropping the person.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority; the Production + Live boundary; and the distinction between source facts, staff reports and provider-verified effects. Never add autonomous/bulk/model-triggered writes or client sends. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A link, a saved fact, a chosen status or a checked business decision is not a provider-effect receipt.

Do not widen action keys, change protected paths without their separately required authority, manufacture customer values, use test data in production, rerun completed provider proofs, or add new accounts, dependencies, services, background processes or billing headroom. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence remain outside Git. Use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Start only after S115 completes its applicable release. Consume the current sidebars/help and existing exact destination/Sheet/recipient services from repository code. S117 and S118 consume the corrected row association and normal typed update path; S120 consumes complete audience destinations/recipients. A missing real email column gates only that source-dependent effect and must not be mistaken for an unfinished specification or silently satisfied by a test fixture.

**Standalone delivery contract.**

**Deliverable now:** the repaired destination/row-resolution behavior, typed email synchronization with honest missing-setup refusal, complete recipient projection and its standalone release. **Consumes, but does not assume:** the actual configured tab/header metadata and fresh source contacts. **Externally blocked effect:** live email-column synchronization when the two confirmed columns are absent; owner/Sheet manager supplies those headers, then the implementation reads them back and follows normal per-use exact confirmation. Automated acceptance can cover both ready and unavailable states without creating live columns. **Produces for downstream suites:** authoritative current row/cell targets, complete audience email sets and stable source/message links. Code readiness does not certify a live email write.

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

1. Re-ground and inspect exact current destinations, source metadata and reported existing-row behavior; do not infer the cause from the old screenshot.
2. Establish independent destination, row-identity/absence and recipient-preservation falsifications.
3. Repair only this source hub/Sheet/contact slice, including Q3A mappings and its missing-column state.
4. Complete the existing development, integration and release loop, preserving any honestly gated live setup, then re-ground before S117.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` when importing it; use the suite ID, canonical path and sequence given above without replacing unrelated queue rows or marking work complete. No registration or queue edit has been performed by specification authoring. After implementation and applicable release completion, follow the repository's existing retirement rule only when every remaining requirement/dependency is represented by code, tests and current facts. Do not merge these features into one implementation followed by a single final deployment.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S116 | `docs/feature-suites/renewal-source-links-and-sheet-contact-integrity.md` | SPECIFICATION READY; feature 3 of 7 in renewal-operator-hub-v1; implementation/release not started. |
```
