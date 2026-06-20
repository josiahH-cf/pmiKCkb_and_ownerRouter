# Lease Renewal — Build Plan & Next-Iteration Guidance

Status: **Active build plan** (authored 2026-06-20 by a multi-agent map → synthesize → adversarial
falsify workflow; the review's corrections are folded in). This is the "continue with feature
development" entry point: the next loop reads [`../loop-state.md`](../loop-state.md) → this file →
the design docs, then builds the next zero-cost Phase-1 unit.

Grounds in (read for detail): [`lease-renewal-connector-design.md`](lease-renewal-connector-design.md)
· [`lease-renewal-agent.md`](lease-renewal-agent.md) · [`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md)
· [`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) ·
[`move-in-move-out-process.md`](move-in-move-out-process.md) ·
[`../integration-architecture.md`](../integration-architecture.md) ·
[`../autonomous-agent-runner.md`](../autonomous-agent-runner.md) · [`../../AGENTS.md`](../../AGENTS.md).

---

## 1. Where we are (plain English)

- **KB Ask app: live in production** on Cloud Run under `pmi-kc-kb-prod` (`pmikcmetro.com` org),
  sign-in locked to `pmikcmetro.com`, $10 budget alert, Firestore Native + 12 seeded spaces. The
  **canonical auth host is `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`** (Cloud Run's
  `status.url`); the project-number URL only redirects, and authorizing only the redirecting host
  was the prior auth-loop root cause — always authorize the canonical host in Firebase.
- **Prod is NOT complete — it is source-blocked.** All 11 spaces in the production manifest are
  still `Unreviewed` placeholders (Dan has not delivered/approved real sources), and Firestore
  rules/indexes are not yet deployed (needs host `firebase login`). See §7 OQ-PROD-1/2/3/4.
- **Tests:** **387/387 unit tests pass** (48 files). This count does **not** include
  `test:firestore` (needs the emulator), the e2e suite, or full `bash scripts/verify.sh` — confirm
  those before claiming full migration-ready state.
- **Demo cloud lane retired**, single `pmikcmetro.com` identity enforced (see
  [`../demo-lane-retirement.md`](../demo-lane-retirement.md), [`../auth-identity-and-access-strategy.md`](../auth-identity-and-access-strategy.md)).
- **Lease Renewal Agent is in design, not runtime.** The connector spec is complete and
  adversarially reviewed: an 8-stage deterministic, fail-closed Phase-1 read→reconcile→flag
  pipeline; Phase-2 write-back is the single new write surface and is **admin-enabled (flag off by
  default), console-user-scoped, suggest-then-button-press** (§4.0) with no trust-based auto-write.
- **Lease-renewal code is foundation-only:** `lib/lease-renewal/constants.ts`, `facts.ts`
  (`evaluateRenewalFactGates`), `process-template.ts`, and the foundation test. The deterministic
  Phase-1 modules and the `google_sheets.renewal_checklist.*` registry entries described in the
  design **do not exist in code yet** — they are the buildable bulk of Phase 1 (§3).
- **Cost note:** `npm run smoke:ask-live` is **cost-bearing** (it sets `ASK_DEMO_MODE=false` and
  invokes live Gemini retrieval). It is past green evidence, not a freely re-runnable check; any
  re-run is an approval-gated, `--budget-confirmed` action under the $10 guard. Only the
  mocked/deterministic checks in §3 are truly no-cost.

## 2. Done-state definition (trust-gated phasing; augment, never replace)

- **Phase 1 — read + reconcile + flag (no writes).** Read the sheet via the `pmikcmetro.com`
  connector (tabs 4 & 7 hard-excluded), fingerprint all tabs by content, resolve headers
  position-independently, normalize every cell to a typed `NormalizedValue` (confidence + raw +
  cell coordinate), derive fuzzy-join candidates without auto-merge, reconcile each field against
  Rentvine (read-authoritative) + building-level + the Google Form, route severity
  (High/Blocked/Medium/Low), emit a counts-only `IngestManifest`, and surface conflicts on the
  KB-owned workflow-run page / Approval Queue with deep links + plain-English actions.
  **Exit milestone (Admin decision, not auto-unlock):** over a real sample the connector catches
  what the team missed, Dan finds the flags accurate, **zero false all-clear** on the
  inherited-tenant deposit/lead-paint/LLC failure modes, and an acceptable false-positive rate.
- **Phase 2 — approval-gated sheet write-back.** An Admin enables the off-by-default feature flag
  and assigns per-console-user suggest/approve permissions; the connector writes only an agreed
  resolved value back to the originating cell via the structural cell map (re-anchored
  `sheet_row_index` + compare-and-set + read-after-write + single-cell atomicity +
  `Blocked`-on-uncertainty) with a **per-write human button-press for every write**. Exit: a
  sustained record of correct, verified writes with zero wrong writes.
- **Phase 3 — backing DB + automatic Rentvine pull (LAST, optional).** Only after 1–2 are stable.
  Replacing the sheet is never the first move.
- **Out of scope until vendor-confirmed:** Rentvine renewal write-back stays a non-executable
  "fix in Rentvine" flag pending OQ-RV-1 + an approved per-action spec.

## 3. Build now at zero external cost — the Phase-1 deterministic units

These are pure functions / rule-tables tested with **synthetic, sanitized, committable** fixtures —
no live calls, no credentials, no Gemini/Vertex spend. They compose with the existing
`lib/lease-renewal/{constants,facts,process-template}.ts` and the injected-transport / mocked
pattern in `tests/helpers/mock-connectors.ts`. Module/test paths below are **proposed**, consistent
with the current layout.

| #   | Unit (stage)                                                                           | Proposed module                                       | Tested by                                                                                          |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Credential-tab hard-exclusion + emit scrubber (B)                                      | `lib/lease-renewal/ingest.ts`                         | `lease-renewal-ingest.test.ts` (sanitized tab 4/7 + false-positive guards)                         |
| 2   | Table fracturing / divider-drop / re-stitch (C)                                        | `ingest.ts`                                           | grid fixtures incl. fractured 6-col Renewals fragment                                              |
| 3   | Content-keyed tab fingerprinting (D)                                                   | `lib/lease-renewal/fingerprint.ts`                    | fixtures for all 18 tabs; UNRECOGNIZED on below-threshold                                          |
| 4   | Position-independent header resolution (E)                                             | `lib/lease-renewal/headers.ts`                        | email-in-date, FALSE/blank header, off-by-one fixtures                                             |
| 5   | Per-cell typed normalization (F)                                                       | `lib/lease-renewal/normalized-value.ts`               | one fixture per type class; confidence ladder; `Conflict` never set at ingest                      |
| 6   | Fuzzy-join key derivation, no auto-merge (G/H)                                         | `lib/lease-renewal/join.ts`                           | address-variance + name-format fixtures; ambiguous → review                                        |
| 7   | Record assembly + counts-only `IngestManifest` (G/I)                                   | `ingest.ts`                                           | multi-row fixtures; row-conservation reconciles or `Blocked`                                       |
| 8   | Severity-routing rule table (§3.3, first-match)                                        | `lib/lease-renewal/severity.ts`                       | specimen facts; cadence Medium unless $130 owner charge → High                                     |
| 9   | Per-field reconciliation + worked cases (§3.2)                                         | `reconciliation.ts` + `field-reconciliation-rules.ts` | HOA-vs-tenant High, cadence Medium, date mismatch; unlisted → `Blocked`                            |
| 10  | Conflict → Approval-Queue mapper                                                       | `lib/lease-renewal/approval-queue-mapping.ts`         | queue fixed-field mapping + deep links; PII stays in-boundary                                      |
| 11  | Write-back cell-map + state machine + read-after-write (§4.1–4.3) **mock/design only** | `lib/lease-renewal/writeback.ts`                      | `lease-renewal-writeback-safety.test.ts` over an in-memory mock sheet; low-cardinality + row-shift |
| 12  | Action Registry entries `renewal_checklist.{read,reconcile,writeback}`                 | `lib/integrations/action-registry-seed.ts`            | seed dry-run asserts all `production_allowed:false`; `validatePreviewPayload`                      |
| 13  | Mocked Rentvine + Sheets health/read smokes                                            | uses `createMockHealthCheckTransport`                 | mocked lease-list read + sheet-structure read; no live transport default                           |
| 14  | Governance-clean synthetic fixture corpus                                              | `tests/fixtures/lease-renewal/`                       | inputs to all above; falsification asserts no PII/secrets                                          |

Notes (review corrections):

- **Registry status:** `google_sheets.renewal_checklist.*` is described in the connector design's
  registry table but is **NOT yet in `action-registry-seed.ts`** (today only `audit_snapshot.append`
  exists for `google_sheets`). Adding the three entries (unit 12) is itself the first buildable
  slice; the seed dry-run must keep all entries `production_allowed:false`.
- **Reconciliation suggested-winner** logic (unit 9) ships **suggestion-only** and is gated on Dan
  confirming the §3.4 precedence table (OQ-PREC-1); until then every unlisted field-type pair →
  `Blocked "no precedence rule"`. Phase-1 ingest still proceeds.
- **Governance (AGENTS.md §5):** fixtures committed to git must be **synthetic/sanitized**. Real
  client data may be used as local test/training input only and must never land in git, the
  manifest beyond counts, or model output without approval.

## 4. The Rentvine-API + Google-Sheet path to "done" (cost-gated)

1. **Zero-cost, no credentials (the bulk of Phase 1):** build units 1–14 against fixtures; verify
   with `npm run verify:falsification`, `npm run lint`, `npm run typecheck`, `npm test`,
   `npm run check:budget-guard`. Needs no client answer.
2. **Client/vendor answers (no cost, in parallel):** Dan confirms §3.4 precedence (OQ-PREC-1),
   in-scope sheet IDs/tabs + §7 interpretations (OQ-SHEET-1), staff lexicon (OQ-LEX-1), address
   canonicalization (OQ-JOIN-1). These flip reconciliation from `Blocked` to active suggestions.
3. **First live read (uses the existing RentVine credential — owner decision 2026-06-20: use it, do
   NOT rotate; OQ-SEC-1 resolved).** The credential must still be loaded from `.env.local` / Secret
   Manager and never committed, echoed, or written to a tracked doc (AGENTS.md no-secrets rule). A
   single read-only Rentvine lease-list (candidate filter, ~free) and a single read of the approved
   sheet via the `pmikcmetro.com` connector (free Sheets quota) validate
   fingerprinting/normalization against real structure, tabs 4 & 7 excluded.
4. **Phase-1 accuracy milestone (no write):** run reconciliation over a real sample on the
   workflow-run page; Dan reviews via the Approval Queue (see §6 — that surface may itself be an
   unbuilt dependency). This is the Admin's evidence to consider Phase 2, not an auto-unlock.
5. **Phase-2 enablement (approval-gated):** after OQ-WB-1/OQ-APPR-1, an Admin flips the
   off-by-default flag, assigns permissions; writes go through re-anchor + compare-and-set +
   read-after-write + per-write button-press.
6. **Phase 3 (later, optional):** backing DB + automatic Rentvine pull.

## 5. Agentic pipeline wiring — how "continue with feature development" works

`AGENTS.md` (router) → `docs/autonomous-agent-runner.md` (runner) → `docs/loop-state.md`
(single-read resume). Each slice = pick the next decision-complete, **zero-cost**,
readiness-improving Phase-1 unit from §3, build it as pure functions, validate every preview
against the **Action Registry** schema (`lib/firestore/action-registry.ts`, governed read-only),
test deterministically through the runner's Verification-and-Falsification phase, and update
`loop-state.md` at the boundary. The registry is the spine: an action is executable only when its
entry is `Approved for Execution` + `Documented` + `production_allowed` — and **every entry is
`production_allowed:false` today**, so the loop builds and tests against the catalog with zero write
risk. Stop at any Approval Gate (cost, keys, Gmail, SoR write) or when only client-owned blockers
remain → route to client-unblock.

## 6. Dependencies not yet built (flag before promising the Phase-1 milestone)

- **Lease-renewal workflow-run page / Approval-Queue surface.** A general Approval Queue exists in
  the app, but a lease-renewal-specific **workflow-run page where flags render for Dan to review**
  is not listed among the foundation code or the §3 units — treat it as an **unbuilt UI dependency**
  for the Phase-1 accuracy milestone (the flags need somewhere to be reviewed). (OQ-UI-1)
- **Recurring read cadence.** The done-path uses a one-shot real sample; **recurring** reconciliation
  needs a current Rentvine snapshot at cadence (polling vs LeadSimple sync — OQ-LS-1). Not a blocker
  for the one-shot accuracy milestone; required before continuous operation.

## 7. Open questions & blockers register

Grouped by who unblocks. Most do **not** block Phase-1 deterministic build (§3); they gate
reconciliation finalization, live reads, write-back, or prod completion.

### Client / Dan (business logic & approvals)

- **OQ-PROD-1** — Deliver + explicitly approve real production sources for all 11 spaces. _Blocks:_
  prod cutover completion (the #1 prod blocker).
- **OQ-PROD-4** — Explicit per-step go-ahead for each cost-bearing cutover step (under the $10
  guard). _Blocks:_ any cost-bearing cutover step.
- **OQ-PREC-1** — Confirm the §3.4 source-precedence defaults per field type. _Blocks:_ automatic
  High-severity resolution / suggested winners (else `Blocked "no precedence rule"`).
- **OQ-APPR-1** — Secondary approver(s) + admin-unavailable rule (route vs hold). _Blocks:_ queue
  routing/escalation.
- **OQ-WB-1** — Who holds the §4.0 write-back flag, who assigns suggest/approve permissions, and the
  accuracy evidence gate. _Blocks:_ Phase-2 enablement (Phase-1 unaffected).
- **OQ-SHEET-1** — Exact in-scope sheet IDs/tabs + §7 header interpretations + credential-tab
  boundary. _Blocks:_ live read connector scope finalization.
- **OQ-LEX-1** — Complete staff lexicon for assignee extraction. _Blocks:_ assignee calibration
  (Phase-1 proceeds: unknown → `possible_assignee` + Needs Review).
- **OQ-TMPL-1** — Approved owner/tenant/build-out templates (~2026-06-23, into a Drive folder).
  _Blocks:_ template auto-draft lane (not Phase-1/connector).
- **OQ-MO-1** — Move-out specifics (Dotloop set, "4265" trigger, deposit/lock/collections/relisting,
  SLAs). _Blocks:_ move-out recommender (low priority vs renewal).
- **OQ-QB-1** — QuickBooks access status/location. _Blocks:_ QuickBooks integration completeness.
- **OQ-GMAIL-1** — Gmail Inbox 0 safe test-thread protocol + approval sender/recipients. _Blocks:_
  Gmail Inbox 0 live runtime.
- **OQ-PERM-1** — Which internal updates may execute pre-Dan-approval vs require Admin review; and
  the product success definition for renewal-team cutover. _Blocks:_ approval-queue permission model.

### Build-decision (Josiah / deploy-time)

- **OQ-PROD-2** — The canonical Cloud Run host to authorize in Firebase Auth (use `status.url`, not
  the redirecting project-number URL). _Blocks:_ production sign-in + auth smoke.
- **OQ-JOIN-1** — Canonical address/name normalization rules. _Blocks:_ optimizing join match rate
  (Phase-1 proceeds: ambiguous → review).
- **OQ-SRC-1** — Source-of-truth folder location + file-type handling + team roster + the low-cost
  Drive→Cloud Storage copy automation to build first. _Blocks:_ source sync/indexing architecture.
- **OQ-UI-1** — Build (or confirm) the lease-renewal workflow-run page / Approval-Queue review
  surface (§6). _Blocks:_ Phase-1 accuracy milestone review.

### Owner (host / credentials)

- **OQ-PROD-3** — Provide host ADC (`firebase login` / `gcloud auth`) so Firestore rules/indexes
  deploy + live preflight run. _Blocks:_ rules/indexes deploy + live readiness.
- **OQ-SEC-1 — RESOLVED (owner decision 2026-06-20):** the existing RentVine API key/secret is
  **used as-is, NOT rotated** — no longer a blocker. Still required: load it from `.env.local` /
  Secret Manager and keep it out of git, tracked docs, and model output (AGENTS.md no-secrets rule).
  The credential remains the one shared in the local tool-access sheet.

### Vendor

- **OQ-RV-1** — Rentvine private/vendor-confirmed renewal-write endpoint? _Blocks:_ Rentvine
  renewal-writeback (standing gate; not Phase-1 or Sheets write-back).
- **OQ-RV-2** — Exact Rentvine click-paths (renewal, move-in create, move-out close). _Blocks:_
  accurate future write modeling (low risk now, read-only).
- **OQ-LS-1** — LeadSimple Operations plan active + Rentvine sync? _Blocks:_ event-ingestion cadence
  (§6) and `leadsimple.*` readiness.

## 8. Production cutover — two tracks (do NOT promise completion by a date)

Completion bottlenecks on **OQ-PROD-1** (client-owned, no committed ETA per
[`../client-checklist.md`](../client-checklist.md)). Frame it as two tracks; Track B is
"ready-to-execute within hours once OQ-PROD-1/2/3/4 clear," not an end-of-week deliverable.

**Track A — achievable now (no client input, no/zero cloud cost):**

1. `npm run cutover:report -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --json`
   — regenerate the readiness report (dry-run).
2. `npm run check:budget-guard` — confirm posture before any live step.
3. Once **OQ-PROD-3** (host ADC) clears: `firebase login` then
   `npm exec firebase -- deploy --only firestore:rules,firestore:indexes --project pmi-kc-kb-prod`
   (zero cloud spend, needs credential).

**Track B — client-gated cutover completion (starts only after OQ-PROD-1):**

4. Create `.env.production.local` with approved values — **gated on OQ-PROD-2 (canonical host) +
   OQ-PROD-4**; sequence after approvals are collected.
5. `npm run preflight:production -- --env-file=.env.production.local` (dry-run).
6. Dan fills + explicitly approves the 11 spaces' sources; Josiah converts to `.txt`. **Governance:**
   converted client text stays **out of git** unless sanitized/approved (AGENTS.md §5); the manifest
   carries metadata/counts, not client content.
7. `npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --dry-run`
   → require `readiness.ok===true`, no placeholders, all `Approved`.
8. **Cost-bearing (approval-required):** re-run `npm run check:budget-guard` immediately before;
   upload to `gs://pmi-kc-kb-prod-sources-558870356522/`, `npm run import:agent-search -- …`, seed
   `sources_meta`. Cheap-live (Flash + scale-to-zero) under $10; abort if the budget alert fires.
9. **Authorize the canonical Cloud Run host** (`status.url`, e.g.
   `pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`) in Firebase Auth **first**, then deploy and run the §7
   production smoke checklist (sign-in + cited Verified Source + citations). Record the result in
   `loop-state.md` / `status.md`.

> Every cost-bearing step uses the `--budget-confirmed` flag, re-checks the budget guard immediately
> before running, and stops on any budget-alert trip. Rollback commands are in the `cutover:report`
> output.
