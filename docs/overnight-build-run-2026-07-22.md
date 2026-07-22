# Overnight Build Run — 2026-07-22 (decision-complete runbook)

> This is the authoritative, decision-complete runbook for one unattended multi-slice build cycle.
> Every choice below was ruled by the owner in the Round-1 decision packet
> (`docs/audit-2026-07-22.html`), recorded here as authority. The loop follows this file top to
> bottom, updating `docs/loop-state.md` at each slice boundary. Promote durable facts into
> `docs/facts.md` as each slice lands (per the runner Definition of Done).

## Authority + posture (owner-ruled 2026-07-22)

- **Deploy (D01):** authorized to deploy to Cloud Run unattended **after** a green full gate — but
  gated on a fresh `npm run preflight:adc` immediately before deploy. If the token is stale, **do not
  deploy**: leave everything merged + pushed and record "deploy deferred — token stale; owner runs
  `npm run auth:session` + `npm run deploy` in the morning."
- **Auth window (D20):** the owner runs `npm run auth:session` right before leaving, giving a fresh
  ADC window. Live reads (RentVine / Sheets / Vertex) are permitted. Sequence all live-read/live-write
  work **early** (while the token is freshest); the deploy is best-effort at the end.
- **Merge (D02):** worktree → full gate → ff-merge to `main` → build in primary → push both branches.
  Never commit directly to `main`; never leave `main` half-merged.
- **Stop/skip (D03):** prefer progress via best-effort on **reversible/local** uncertainty; but for a
  **genuine blocker** (anything touching a live write/send, an external system, a credential, or an
  unresolvable unknown) record it and **skip to the next safe slice** — never halt the whole run,
  never best-effort-guess a live external effect. Summarize all blockers in the morning report.
- **Must-haves (D04):** the four core build slices are the floor — **Slice 3 (comp), Slice 4 (KB
  transparency), Slice 6 (maintenance owner-notice draft), Slice 7 (add-a-Space)**. Everything else is
  approved and should be built, but these four must land. Docs (Slice 11) are best-effort.
- **Docs (D05):** update **`docs/customer-demo-walkthrough-2026-07-21.html`** only (the "testing
  sheet"); the manual-QA checklist is not required this run.
- **Adversarial pass + demo test-script (owner follow-up 2026-07-22):** Slice 11 (adversarial UI/UX +
  external-browser functional pass) and Slice 12 (rewrite the walkthrough into a morning test script)
  are **REQUIRED**, not best-effort. The owner walks the rewritten walkthrough tomorrow morning to
  confirm the app works, so the doc must carry verified click-paths + expected results, not claims.
- **Budget:** ~$10 ceiling holds. Run `npm run check:live-cost` / `check:budget-guard` before any live
  or deploy step. No Vertex ingestion/re-index overnight (Slice 8 builds the button but never runs it).

## Standing safety invariants (never traded — hold for every slice)

- No autonomous send and no autonomous live system-of-record write. The app may **draft**; a human
  confirms every send and every live write in-app. The builder itself never sends or writes to a real
  provider of record.
- The renewal Sheet stays **read-only augment** to the team's operational sheet; the write-back is
  **append-only** into empty "KB Proposed — <field>" cells, never overwriting team cells, behind the
  confirm-target gate. The **smoke test writes only to a NEW builder-created test sheet**, never the
  operational one.
- RentVine live client stays **GET-only** except through the new, gated, human-confirmed S25 write
  executor (which stays `production_allowed:false` this run — see Slice 9).
- Secrets/tokens/customer PII never enter git, logs, or the walkthrough. No personal
  `josiah.abernathy@gmail.com` in any auth path — `pmikcmetro.com` / `pmi-kc-kb-prod` only.
- The 11-space KB config in `.env.local` (`SPACE_VERTEX_DATA_STORE_IDS` / `SPACE_DRIVE_FOLDER_IDS`)
  must survive the deploy. Deploy with `--budget-confirmed --allow-multiple-spaces`; verify
  `vertex spaces: 11` in the post-deploy smoke. **Do not** regress it to 1.

## Owner pre-departure checklist (only the owner can do these)

1. `npm run auth:session` (refreshes CLI login + ADC; enables the live window + deploy).
2. Confirm the Sheets **write** scope is on the `lease-renewal-reader` SA's DWD grant (Slice 1/2 create
   - write a test sheet). If unsure, the builder will detect the fail-closed and defer with a flag.
3. (Morning) provide/confirm the RentVine field paths flagged by Slice 1, and — if you want RentVine
   write live — the confirmed write endpoint so Slice 9's gate can flip.

---

## Slice queue (ordered; live-dependent work first)

### Slice 0 — Baseline setup (do first)

- **State at handoff.** `main` and `ui-ux-overhaul` are aligned at `0b00e65`, pushed, clean except the
  three uncommitted planning docs in the primary working tree: `docs/loop-state.md` (modified),
  `docs/audit-2026-07-22.html`, `docs/overnight-build-run-2026-07-22.md` (this file).
- **Action.** Land these planning docs on the baseline through the normal discipline: copy them into
  the `ui-ux-overhaul` worktree, commit there
  (`docs(cycle): lock overnight build-run runbook + decision packet`), ff-merge to `main`, so both
  branches are aligned and clean before any feature slice. Then build every feature slice in the
  worktree. Never commit feature code directly to `main`.

### Slice 1 — RentVine field discovery + confirmation (resolves D16; feeds Slices 6 + 9)

- **Objective.** Using the fresh live window, read live RentVine and confirm/discover the exact field
  paths for: (i) renewal recipient(s) + rent [F-LEASE-3], (ii) **property-owner email** [D10, feeds
  Slice 6], (iii) any writable renewal fields + the write endpoint/semantics [D18, feeds Slice 9].
- **Approach.** Read-only. Extend the existing live-read smoke path (`scripts/smoke-rentvine-read.ts`)
  or a new read-only discovery script; print **field paths + presence only, never PII values**. Record
  the confirmed map in `docs/products/lease-renewal-spreadsheet-map.md` / a RentVine field note; flag
  anything unconfirmable for the AM. For the write endpoint: document what the RentVine API exposes
  (read the provider capability); do **not** attempt a write.
- **Skip rule.** If the token is already stale, record "D16 unresolved — live read unavailable" and
  proceed using the export-mapped defaults, flagging every unconfirmed field. Slices 6 + 9 still build;
  their live-correctness is flagged for AM confirmation.
- **Tests.** None (read-only discovery); assertions on the parser if code is added.

### Slice 2 — Sheet write-back live proof (D17)

- **Objective.** Prove the append-only write-back actually executes end-to-end.
- **Approach.** Add `smoke:sheet-write` (`scripts/smoke-sheet-write.ts` + package script). It: creates
  a **new, clearly-named test spreadsheet** ("KB Writeback Smoke — <run>") via the DWD subject, adds a
  "KB Proposed — <field>" column, runs `commitWritebackAtRow` into an empty cell, and asserts
  read-after-write + CAS + block-on-uncertainty. Print the test sheet id; never touch the operational
  sheet.
- **Skip rule.** If the write scope is missing (fail-closed) or the token is stale, keep the harness
  code, skip the live execution, and record "write-back proof deferred — needs write scope / fresh
  token."
- **Tests.** Unit test the harness's row/column resolution against a fake writer; the live run is the
  proof.

### Slice 3 — Comp basis capture + Zillow link (D06 / D07 / D08) — MUST-HAVE

- **Objective.** Capture the operator's comp basis and show it, source-tagged, in the owner email; also
  make it available to the Sheet write-back proposal, gated by the confirm-target flow.
- **Decisions baked.** Inputs = Zillow low + Zillow high + PMI rental-analysis number **+ a
  comps-screenshot URL (the Zillow search URL)**, all optional (D06). Desk gets a **deep Zillow link
  seeded from the property address** (D07). Comp flows into the owner email **and** the write-back
  proposal, **gated by the confirm-target confirmation** (D08).
- **Files.** `lib/lease-renewal/renewal-progress.ts` (extend `RenewalOwnerDecision` with
  `market: { zillowLow?, zillowHigh?, pmiNumber?, compsUrl? }` + `normalizeOwnerDecision` +
  `planRecordOwnerDecision`); `app/api/lease-renewal/renewal-progress/route.ts` (zod);
  `components/lease-renewal/RenewalProgressControls.tsx` (`OwnerDecisionForm` inputs);
  `lib/firestore/lease-renewal-progress.ts` (persist); `lib/lease-renewal/live-desk.ts:370`
  (feed `buildOwnerRenewalDraft({ market })`); `components/lease-renewal/RenewalWorkspace.tsx`
  (Zillow deep link); the write-back proposal path
  (`lib/lease-renewal/sheet-writeback-service.ts`) to allow a "Comp basis" proposed field behind the
  existing gate.
- **Boundary.** The operator enters every number; the app **never invents or suggests** a rent figure
  (D19). No PII in the Zillow URL beyond the property address.
- **Tests.** Planner/normalize, route zod, form render, live-desk feed, write-back-proposal gating.

### Slice 4 — KB answer transparency (D09) — MUST-HAVE

- **Objective.** Show "Answered by `<friendly model>` · N sources" on every Ask result, for everyone.
- **Files.** `lib/config/server.ts` (map `GEMINI_MODEL_ANSWER` → friendly label), the Ask response
  schema (`lib/schemas` / `AskResponse`), the ask route, `components/ask/AskForm.tsx` result panel.
- **Copy-voice.** Client-facing string — no jargon, no em dash. "Answered by Gemini 2.5 Pro · 3 sources".
- **Tests.** Schema carries the model; AskForm renders the line; friendly-label mapping.

### Slice 5 — KB freshness surfacing (D13)

- **Objective.** Surface existing `sources_meta.last_reviewed_at` as "sources last reviewed" (honest;
  no new data dependency).
- **Files.** the source-meta reader path (`lib/retrieval/vertex-search.ts`
  `FirestoreSourceMetaReader`), the Ask/Admin surface that lists sources.
- **Tests.** Renders the reviewed date when present; omits gracefully when absent.

### Slice 6 — Maintenance owner-notice draft + gate flip (D10 / D11) — MUST-HAVE

- **Objective.** Wire the authoritative **property-owner email** (from Slice 1's RentVine field) onto
  the maintenance ticket, then flip `gmail.maintenance_owner_notice.draft_create` live — **draft-only,
  never sends**.
- **Files.** the maintenance ticket model + `lib/maintenance/execution/providers.ts:493`
  (`MaintenanceOwnerEmailExecutor`); `lib/integrations/action-registry-seed.ts:863` (set
  `readiness:"Approved for Execution"`, `evidence_status:"Documented"`, `production_allowed:true` for
  `draft_create` **only**); update the pinned gate tests (`action-registry-schema.test.ts`,
  `action-gate.test.ts`, `gmail-hub-action-gate.test.ts`).
- **Hard gate.** The **send** action (`gmail.maintenance_owner_notice.send`) stays
  `production_allowed:false`. Draft creation reuses the existing DWD draft grant; code never sends.
- **Skip rule.** If Slice 1 could not confirm the owner-email field, build the wiring but keep
  `draft_create` **false** with a "pending owner-email field confirmation" note (a genuine data
  dependency — do not flip on a guessed field).
- **Tests.** Owner-email resolution from the authoritative source; draft builds; gate on; send off.

### Slice 7 — Add-a-Space request intake (D12) — MUST-HAVE

- **Objective.** Admin-only "request a new Space" form capturing name/scope/intended sources to
  Firestore, and an output that **auto-generates the exact gcloud/Vertex provisioning commands** for
  the owner to run (no execution).
- **Files.** a new `app/admin/spaces/request` route + component; a Firestore `space_requests`
  collection + rules (Admin create/read); a command-generator util that emits the data-store + Drive
  mapping steps and the `.env.local` lines to add (reinforcing the "must live in `.env.local`" rule).
- **Hard gate.** No live Vertex provisioning (billed) — the form only records intent + prints commands.
- **Tests.** Admin-gated; request persists; command generator output shape.

### Slice 8 — Admin re-index button, cost-gated (D14)

- **Objective.** An Admin "re-index sources" control that is wired but **requires explicit owner
  approval to actually run** (never auto-runs; no ingestion overnight).
- **Files.** an Admin control + a route that stages a re-index request behind an approval/confirmation
  gate; it does **not** call `importDocuments` without an explicit confirmed approval.
- **Hard gate.** The builder never triggers ingestion (cost). The button exists; running it is an owner
  action.
- **Tests.** The control renders; the route refuses to run without approval.

### Slice 9 — RentVine write executor + S25 contract (D18)

- **Objective.** Build the full RentVine renewal write-back executor with the S25 contract (exact
  target/effect preview → human confirm → one-attempt/idempotency → receipt/readback → rollback) and
  the in-app approval/confirmation gate — mirroring the Sheet write-back's confirm-target flow.
- **Governance (the careful part).** The owner **approved RentVine write in principle** (2026-07-22),
  behind app confirm/approval gates. But the runtime gate `production_allowed:true` is schema-blocked
  unless `evidence_status:"Documented"` — i.e. a **confirmed RentVine write endpoint + provider
  semantics**. That confirmation is the unresolved **D16 write-endpoint half**. Therefore: build the
  executor + contract + gate + tests fully; keep the Action-Registry entry **`production_allowed:false`
  pending the documented write endpoint**; record the owner's approval-in-principle in `docs/facts.md`
  (`F-RENTVINE-WRITE-APPROVED`) so the flip is a one-line reviewed change the moment the endpoint is
  confirmed. The executor never runs autonomously; a human confirms every write.
- **Files.** `lib/lease-renewal/execution/providers.ts` (a `RentVineRenewalWriteExecutor` alongside the
  Dotloop pattern); `lib/lease-renewal/execution/matrix.ts` (register keys with rollback notes);
  `lib/integrations/action-registry-seed.ts` (new keys, `production_allowed:false`, `readiness:"Needs
Permission"` or "Planned", `evidence_status` honest); a least-privilege write path (NOT the GET-only
  read client); an app confirm-target UI hook.
- **If** Slice 1 fully documented the write endpoint/semantics **and** `check:live-cost` is clean, the
  loop may set `readiness:"Approved for Execution"` + `evidence_status:"Documented"` +
  `production_allowed:true` (owner pre-approved) — but only with a live **readback/rollback** proven on
  a reversible field, and still human-confirmed in-app. If any of that is not airtight, keep it false
  and flag it. **Never** perform an unproven live write.
- **Tests.** Executor contract (preview/confirm/idempotency/readback/rollback); gate false by default;
  the confirm-gate UI.

### Slice 10 — Dotloop OAuth scaffolding, gated (D15)

- **Objective.** Build the Dotloop OAuth2 integration scaffolding (auth-code flow structure,
  server-side token vault interface, connect/revoke hooks) so the owner can complete real auth in the
  morning. Keep every Dotloop action `production_allowed:false`.
- **Files.** a Dotloop OAuth client + token-vault **interface** (no real client id/secret; env-name
  placeholders only in `.env.example`); wire the existing `DotloopProvider` / `DotloopRenewalExecutor`
  and the draft composer; a `/connections` connect entry that shows "authorize in the morning".
- **Hard gate.** No credentials in git. No live Dotloop call. The owner registers the Dotloop OAuth2
  app + completes auth in the AM (owner's Dotloop account is a personal console step — not recorded
  here).
- **Tests.** Scaffolding compiles; actions gated false; token vault interface contract.

### Slice 11 — Adversarial UI/UX + external-browser functional pass (owner follow-up; REQUIRED)

- **Objective.** Adversarially review and break-test every UI/UX and functional change from Slices
  3–10 by driving the **actual app in a browser** (not just unit tests). Fix clear bugs at source
  (worktree → gate → ff-merge); flag ambiguous ones for the morning.
- **Bring-up (safe sandbox).** Run the local stack on emulators per the QA recipe: Firestore emulator
  **:8090**, **Auth emulator :9099 (REQUIRED — sandboxes `getAuth` away from prod)**, seed, `npm run
dev`; authenticate as the demo Admin. Drive it with the in-app Browser pane (`preview_start` /
  `navigate` / `read_page` / `computer` / `read_console_messages`). Follow the methodology in
  `docs/meta-prompts/qa-audit-and-fix.md` and the click-by-click `docs/manual-qa-walkthrough-2026-07-21.md`.
- **CRITICAL live-data guard.** The local env is **live-connected to real RentVine/Sheet** — every
  walkthrough action is **read-only**: never send a real email, never write the operational Sheet,
  never emit PII. Draft flows stop at the draft; write-back is exercised only against the Slice-2 test
  sheet.
- **Walk + adversarially probe each new flow:** comp capture (enter Zillow low/high + PMI number +
  comps URL → the owner email shows the **sourced** basis, not "Needs Verification"; Zillow deep link
  opens the property; empty/invalid inputs handled; the app never invents a number); KB answer
  transparency line ("Answered by … · N sources"); KB freshness ("sources last reviewed"); maintenance
  owner-notice **draft** (draft is created and **never sends**; owner-email resolves or is flagged);
  add-a-Space intake (Admin-gated; persists; emits provisioning commands); re-index button (present +
  cost-gated; does **not** run ingestion); Dotloop connect entry ("authorize in the morning"; no live
  call); RentVine write UI (confirm/approval gate present; gate OFF). Re-check the auth boundary
  (unauth redirects, sign-in refusal copy), responsive + dark mode, and **zero console errors**.
- **Adversarial lens:** invalid inputs, unauthorized-role access, empty/boundary states, double-submit,
  stale state, and any place a gated or draft-only affordance could actually fire a live effect.
- **Output.** A **PASS/FAIL line per flow** with evidence (screenshot / console / network); fixes
  committed through the worktree; residuals flagged. This evidence feeds Slice 12.

### Slice 12 — Rewrite the walkthrough into a morning test script (D05; owner follow-up; REQUIRED) + facts

- **Objective.** Rewrite `docs/customer-demo-walkthrough-2026-07-21.html` so it doubles as the
  **morning test script** the owner walks to confirm the app works. Organize by the existing demo
  outline (Acts/beats); for **each new or changed process** give: the click-path, the demo talk-track
  beat, and an explicit **Verification** (the expected result to check). Insert every shipped feature
  (comp capture, KB transparency + freshness, maintenance owner-notice draft, add-a-Space, re-index,
  Dotloop "next", RentVine write "approved, gated"). Fold in Slice 11's PASS/FAIL evidence so the doc
  reflects **verified reality, not claims**; mark anything gated/deferred as such and keep the
  talk-track guardrails honest (no overclaim).
- **Boundary + facts.** Record the **negotiation exclusion** as a named boundary in `docs/facts.md`
  (ties `Q-GMAIL-AI-EXCLUSIONS`); promote the run's governance facts (`F-RENTVINE-WRITE-APPROVED`,
  maintenance draft go-live, the overnight-run authorization).
- **Copy-voice.** The walkthrough is a doc (the copy-voice gate does not scan docs), but keep any
  client-facing draft/operator strings jargon-free and em-dash-free.

---

## Close-out (end of run)

1. Full gate in the worktree: `typecheck`, `test`, `lint` (0 errors), `format:check` (fix via
   `npx prettier --write`), `verify:copy-voice`, `verify:falsification`, `verify:context-freshness`,
   `verify:spec-traceability`, `build`. Per-slice adversarial falsification pass.
2. ff-merge worktree → `main`; build in primary; push both branches.
3. `npm run check:live-cost` → `npm run preflight:adc`.
   - **Fresh:** `npm run deploy -- --budget-confirmed --allow-multiple-spaces`; pin traffic to the new
     revision; capture serving + rollback revisions; HTTP-smoke the auth boundary + confirm
     `vertex spaces: 11` + the writeback flag. Record the serving checkpoint.
   - **Stale:** skip deploy; record "deploy deferred — token stale" for the AM.
4. Update `docs/loop-state.md`, `docs/status.md`, `docs/facts.md`. Write the morning report: what
   shipped, what deferred/flagged (esp. D16 field confirmations, RentVine-write flip, Dotloop auth,
   write scope), the serving/rollback revisions, and the exact AM owner steps.

## Residual risks (surface in the morning report)

- **Live deploy pre-demo.** The overnight deploy ships to the live demo instance without a human eye
  before the demo. Mitigation: strong gate + adversarial pass + pinned traffic + retained rollback
  revision. The owner verifies + can roll back in one step in the AM.
- **Token staleness.** Live reads/writes/deploy degrade gracefully to "deferred + flagged" if the ADC
  token expires mid-run. Nothing half-writes.
- **D16 unresolved.** Maintenance owner-email (Slice 6) and RentVine write live-flip (Slice 9) both
  depend on confirmed fields; both stay safe (gated/flagged) rather than guessing a live effect.
