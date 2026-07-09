# Deferred cycle — remaining-slice packet (loop-executable)

_Generated 2026-07-09 from a decision-complete spec pass. Disposable workspace doc (docs/temp). The `/loop` runner reads `docs/loop-state.md` + `docs/facts.md` first, then this packet for the selected slice._

## How the loop uses this
Build ONE slice per branch → PR → CI `verify` → merge, in the recommended order below (all 7 are independent unless a Depends-on says otherwise; the two GOVERNANCE slices A4 and 4a come last). For each slice: build → add/adjust tests → run its Verify list → add the Fact + do the in-place loop-state progress edit → PR → wait green → merge → pull main → next.

## Cross-cutting rules (every slice)
- Every Action Registry entry stays `production_allowed:false` EXCEPT `gmail.renewal_notice.draft_create` (already flipped). Do NOT flip others; do NOT touch the `EXECUTABLE_ALLOWLIST` in `scripts/seed-action-registry.ts` / `lib/admin/migration-readiness.ts`.
- App-plane only: no system-of-record write, no send, no Gmail call.
- New `app/api/**/route.ts` must be authed (`requireCapability`) OR added to the allow-list in `tests/unit/route-auth-boundary.test.ts` (only intake/public is allow-listed today).
- `docs/facts.md` evidence paths must EXIST and must NOT contain a `[bracket]` dynamic-route segment (freshness gate mis-parses `[id]` — cite the covering test file instead).
- `docs/loop-state.md` must stay ≤140 lines: after this repoint it has headroom, but keep progress edits tight.
- copy-voice gate: no `control plane`/`PMI handles`/`source of truth` jargon in app/components/lib; em dashes warn in operator UI.
- Client components import server types via `import type` or a client-safe model module (never value-import a firebase-admin module).
- Live/Firebase-Auth/RentVine reads must degrade non-fatally + be demo-aware if they must render locally.
- Run the slice Verify list; a governance slice (A4/4a) additionally: confirm no superseded marker still reads as active, and PRESERVE the SECRET/no-leak asserts when relaxing a pin.

**Recommended order:** 2a → 1b → 1c → 3a → 3b → A4 → 4a (governance A4, 4a last).

---

## 2a — Unit type-ahead for maintenance
**Cached unit index + edit-gated units/search + shared UnitTypeahead wired into MaintenanceCapture and the intake review**

- Loop-executable: true
- Depends on: F-MAINT-UNIT-MATCHER (M-4, merged): loadLiveUnitCandidates + deriveUnitCandidatesFromExport in lib/maintenance/live-unit-source.ts / lib/maintenance/unit-matche …; F-MAINT-INTAKE-REVIEW (2d, merged): the promote/dismiss writer + UnverifiedIntakeReview — extended here.; lib/connections/verification.ts VERIFICATION_TTL_MS (merged): the cache pattern mirrored by UNIT_INDEX_TTL_MS.

**Objective:** Add a shared unit type-ahead for maintenance: a ~10-min in-process TTL cache over the already-approved RentVine /leases/export read (no per-keystroke live reads, no LLM), an edit-gated GET /api/maintenance/units/search that serves from that cache, and a reusable <UnitTypeahead/> client component wired into MaintenanceCapture's unit field (replacing the manual Find-unit flow) and into the UnverifiedIntakeReview promote flow (optional unit confirmation). App-plane only; no system-of-record write, no send, no Action Registry flip.

**In scope:**
- New lib/maintenance/unit-index.ts: UNIT_INDEX_TTL_MS=10*60*1000 (mirrors lib/connections/verification.ts VERIFICATION_TTL_MS), an in-process cache over loadLiveUnitCandidates() that caches the WHOLE outcome (ok or failure) for the TTL like verification.ts does, a demo-aware short-circuit to synthetic DEMO_UNIT_CANDIDATES when config.localDemoAuth, a clearUnitIndexCache() test seam, and a pure deterministic searchUnits(candidates,query,limit) substring/token filter (NOT the fuzzy join matcher, NOT an LLM).
- New edit-gated GET /api/maintenance/units/search?q= route (requireCapability('edit')) that reads getUnitIndex() and returns { units: [{unitId,label}] }; empty q -> 200 { units: [] }; over-long q -> 400; unavailable index -> 503 with error_type.
- New shared client component components/maintenance/UnitTypeahead.tsx: debounced query against the search endpoint, a clickable suggestion list, non-fatal degrade (503/network -> a note, no crash), Enter suppressed so it never submits an enclosing form, onSelect({unitId,label}|null).
- Wire UnitTypeahead into MaintenanceCapture's unit field, replacing the freeform input + 'Find unit' button + candidate <select>; a picked unit sets unitMatch with confidence 'Verified' (human-picked authoritative unit).
- Wire UnitTypeahead into UnverifiedIntakeReview as an OPTIONAL per-row 'Confirm unit' before Promote; a confirmed unit is passed through the existing optional promote body.
- Extend PromoteIntakeInputSchema + promoteUnverifiedIntake to accept an optional confirmed unit: when present, the promoted ticket carries { unitId, label } and drops the Needs-Verification label; when absent, behavior is UNCHANGED (unit:null + Needs Verification).
- New unit tests for the index, the search route, and the typeahead; updated capture + intake-review tests.
- Add Verified fact F-MAINT-UNIT-TYPEAHEAD and extend F-MAINT-INTAKE-REVIEW; net-zero-line loop-state progress edit.

**Out of scope:**
- Any new connector or connector-catalog entry.
- Per-keystroke live RentVine reads (the endpoint MUST serve from the TTL cache).
- Any LLM/model call for matching (deterministic substring filter only).
- Flipping any Action Registry entry to production_allowed:true or touching EXECUTABLE_ALLOWLIST in scripts/seed-action-registry.ts or lib/admin/migration-readiness.ts.
- Any RentVine write / work-order create / Gmail send / Sheet write.
- Removing or changing the existing POST /api/maintenance/match-unit route or lib/maintenance/unit-matcher.ts (leave them intact and tested; the capture UI simply stops calling match-unit).
- Adding priority controls to the intake-review promote UI (keep its existing no-priority promote).

**Files to create:**
- `lib/maintenance/unit-index.ts` — Server-only ~10-min TTL cache over loadLiveUnitCandidates() plus a pure searchUnits() filter and a DEMO_UNIT_CANDIDATES fallback. Exports: `export const UNIT_INDEX_TTL_MS = 10 * 60 * 1000;`; `export type UnitIndexOutcome = { status: 'ok'; candidates: UnitCandidate[] } | { status: 'not_configured' | 'account_mismatch' | 'auth_error' | 'read_error' };`; `export const DEMO_UNIT_CANDIDATES: readonly UnitCandidate[]` (4 o …
- `app/api/maintenance/units/search/route.ts` — Edit-gated type-ahead endpoint. Mirror app/api/maintenance/match-unit/route.ts auth shape. `import { NextResponse } from 'next/server';` `import { authErrorResponse, requireCapability } from '@/lib/auth/session';` `import { getUnitIndex, searchUnits } from '@/lib/maintenance/unit-index';`. `const MAX_Q = 120;`. export async function GET(request: Request): try { await requireCapability('edit'); } catch (error) { retur …
- `components/maintenance/UnitTypeahead.tsx` — Reusable client type-ahead. 'use client'; `import { useEffect, useRef, useState } from 'react';`. `export interface UnitTypeaheadSelection { unitId: string; label: string; }`. Props: `{ id: string; label?: string; placeholder?: string; onSelect: (unit: UnitTypeaheadSelection | null) => void }` (default label 'Unit / location', default placeholder 'Start typing an address or unit number'). Internal state: query, resul …
- `tests/unit/maintenance-unit-index.test.ts` — Vitest unit test for unit-index. beforeEach clearUnitIndexCache(). Inject deps.load (a vi.fn) + deps.config to avoid module-mocking. Cases: (1) getUnitIndex caches the ok candidate list for the TTL and re-probes after it — load called once at T0, once again at T0+UNIT_INDEX_TTL_MS+1 (mirror connections-verification.test.ts cache test using UNIT_INDEX_TTL_MS and an explicit now arg). (2) config.localDemoAuth:true retu …
- `tests/unit/maintenance-units-search-route.test.ts` — Route test mirroring maintenance-match-unit-route.test.ts. vi.mock('@/lib/maintenance/unit-index', () => ({ getUnitIndex: vi.fn(), searchUnits: (await importActual).searchUnits })) — mock getUnitIndex, keep real searchUnits. setAuthResolverForTest with a pmikcmetro Editor. Cases: (1) 401 before any index read when unauthenticated (getUnitIndex not called). (2) empty q -> 200 { units: [] } and getUnitIndex not called. …
- `tests/unit/maintenance-unit-typeahead.test.tsx` — jsdom component test (@vitest-environment jsdom). Stub fetch to return { units:[{unitId:'unit:456',label:'123 Main Street Unit 2'}] } for a units/search URL. Render <UnitTypeahead id='t' onSelect={spy} />; type '123 Main'; await findByRole('button',{name:/123 Main Street Unit 2/}); click it; assert onSelect called with { unitId:'unit:456', label:'123 Main Street Unit 2' } and the input value becomes the label. Second …

**Files to edit:**
- `components/maintenance/MaintenanceCapture.tsx` — Replace the manual unit flow with the typeahead. (a) Add `import { UnitTypeahead } from '@/components/maintenance/UnitTypeahead';`. (b) Remove `import type { ScoredUnitCandidate } from '@/lib/maintenance/unit-matcher';` (now unused). (c) Delete state: unitLabel, unitCandidates, isMatching. Keep `unitMatch`. (d) Delete the findUnit() and selectCandidate() functions and the match-unit fetch. (e) Replace the JSX block from the `<label htmlFor="mx-unit">Unit / location</label>` through the candidate `<select>` (current lines ~282-335, i.e. the input+Find-unit button and the candidates select) with …
- `tests/unit/maintenance-capture.test.tsx` — Rewrite ONLY the second test ('builds a clean draft after matching the unit'). Stub fetch to branch on URL: when the URL includes '/api/maintenance/units/search' return Response.json({ units: [{ unitId: 'unit:456', label: '123 Main Street Unit 2' }] }); otherwise Response.json({}). Steps: type 'Dishwasher won\'t drain' into 'Issue'; type '123 Main' into the 'Unit / location' input; `await user.click(await screen.findByRole('button', { name: /123 Main Street Unit 2/ }))`; expect findByText(/Matched:/); click 'Build work-order draft'; keep the remaining assertions unchanged (Work-order draft hea …
- `components/maintenance/UnverifiedIntakeReview.tsx` — Add optional unit confirmation to the promote flow. (a) `import { UnitTypeahead } from '@/components/maintenance/UnitTypeahead';`. (b) Add state `const [selectedUnits, setSelectedUnits] = useState<Record<string, { unitId: string; label: string }>>({});`. (c) In each row, above the button row, render `<UnitTypeahead id={`intake-unit-${row.id}`} label="Confirm unit (optional)" onSelect={(unit) => setSelectedUnits((prev) => { const next = { ...prev }; if (unit) next[row.id] = unit; else delete next[row.id]; return next; })} />`. (d) Change the Promote button onClick from `() => act(row.id, 'promo …
- `lib/firestore/maintenance-intake-review.ts` — Extend the promote path to accept an OPTIONAL confirmed unit while preserving the default. (a) PromoteIntakeInputSchema gains `unit: z.object({ unitId: z.string().trim().min(1), label: z.string().trim().min(1) }).nullable().optional(),` with a comment that absence keeps the current behavior and the ticket unit type is just {unitId,label} (no confidence persisted). (b) In promoteUnverifiedIntake, after parsing, `const confirmedUnit = parsed.unit ?? null;` then in the ticket literal set `unit: confirmedUnit,` and `labels: confirmedUnit ? [] : [NEEDS_VERIFICATION_LABEL],`. (c) ticketActivity.text …
- `tests/unit/maintenance-intake-review.test.ts` — PRESERVE all existing tests (the default-promote test at ~lines 70-98 still asserts ticket.unit toBeNull() + labels contains NEEDS_VERIFICATION_LABEL, because it promotes with {} input). ADD one test: promote with `{ unit: { unitId: 'unit:456', label: '123 Main Street Unit 2' } }` -> ticket.unit toEqual { unitId:'unit:456', label:'123 Main Street Unit 2' } and ticket.labels NOT contain NEEDS_VERIFICATION_LABEL; assert the ticket + flipped intake still land atomically.
- `tests/unit/maintenance-intake-review-component.test.tsx` — PRESERVE existing tests (they promote without selecting a unit; the empty-query typeahead never fires a fetch, so the single-Response fetchMock still only sees the promote call). ADD one test: a fetchMock that branches on URL (units/search -> { units:[{unitId:'unit:456',label:'123 Main Street Unit 2'}] }; promote -> 201 { ticket:{ id:'t1' } }); type into the row's 'Confirm unit (optional)' field; click the suggestion; click 'Promote to ticket'; assert the promote fetch was called with a JSON body containing unit: { unitId:'unit:456', label:'123 Main Street Unit 2' }.
- `docs/facts.md` — See governanceChanges: append the new Verified fact F-MAINT-UNIT-TYPEAHEAD as the last Fact-Ledger row (immediately BEFORE the `## Supersede Log` heading at line 126), and amend the F-MAINT-INTAKE-REVIEW row (line 122) in place. No supersede-log row is needed (both are extensions, not replacements).
- `docs/loop-state.md` — Net-zero-line edit only (file is at the 140-line cap). Edit line 53 in place: change the tail from `assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.` to `assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); 2a the edit-gated unit type-ahead over a cached RentVine unit index + optional confirm-on-promote (`F-MAINT-UNIT-TYPEAHEAD`). Remaining: A4, notifications, queue rebuild.` Optionally bump `Last updated:` (line 16) to the run date. Do not add any new line; run `npm run verify:context-freshness` to confirm <=1 …

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
ADD a new Verified fact row as the last row of `## Fact Ledger` (immediately before the `## Supersede Log` heading, line 126), single-space pipe style like rows 42+: `| F-MAINT-UNIT-TYPEAHEAD | Maintenance has a shared unit type-ahead (2a). `lib/maintenance/unit-index.ts` caches the whole outcome of the already-approved read-only RentVine /leases/export read (`loadLiveUnitCandidates`) for ~10 min (`UNIT_INDEX_TTL_MS`, mirrors `VERIFICATION_TTL_MS`) so the picker never fans out a live read per keystroke; `searchUnits` is a pure deterministic substring/token filter (no fuzzy join, no LLM). Edit-gated `GET /api/maintenance/units/search` serves { units } from that cache (401 unauth, 400 over-long q, 503 with error_type when unavailable) and is covered by the route-auth-boundary invariant. The client `UnitTypeahead` (debounced, non-fatal degrade, Enter never submits the form) replaces MaintenanceCapture's manual Find-unit field (a picked authoritative unit is `Verified`) and adds an OPTIONAL unit confirmation to the intake-review promote flow. RentVine read needs RentVine API creds, NOT Google ADC; demo-aware: `config.localDemoAuth` (NODE_ENV-fenced) serves synthetic `DEMO_UNIT_CANDIDATES` so the picker is exercisable with a plain `npm run dev`. App-plane only; no SoR write, no send; match-unit's fuzzy route is retained + still tested. | Verified | `lib/maintenance/unit-index.ts`; `app/api/maintenance/units/search/route.ts`; `components/maintenance/UnitTypeahead.tsx`; `tests/unit/maintenance-unit-index.test.ts`; `tests/unit/maintenance-units-search-route.test.ts` | 2026-07-09 | — | 2026-12-31 |`  (all evidence paths exist post-build; none contain a [bracket] dynamic-route segment.)
```

_[docs/facts.md]_

```
AMEND the F-MAINT-INTAKE-REVIEW row (line 122) IN PLACE. PRESERVE every existing clause (separate module / negative-import isolation, the three edit-gated functions, ONE atomic promote transaction, 404/409 idempotency, priority inference + provenance, dismiss-with-reason, the route list + only /intake/public allow-listed, the UnverifiedIntakeReview panel, app-plane/no-SoR/no-send). CHANGE ONLY the unit sentence: replace `The promoted ticket is `reporter.kind:"external"`, `unit:null`, labelled "Needs Verification", with priority inferred...` so it reads: `By default the promoted ticket is `reporter.kind:"external"`, `unit:null`, labelled "Needs Verification", with priority inferred from the report text (provenance "auto-inferred") unless the operator overrides it ("operator-set"); 2a lets the editor OPTIONALLY confirm the unit at promotion via the shared type-ahead, in which case the ticket carries { unitId, label } and the "Needs Verification" label is dropped (no selection keeps the unchanged default).` APPEND to the evidence cell: `; lib/maintenance/unit-index.ts`. Set verified-on to 2026-07-09. Do NOT add a Supersede Log row (this is an extension, default preserved).
```

_[lib/firestore/maintenance-intake-review.ts]_

```
Governance doc-comment + writer semantics. PRESERVE the default output (unit:null + [NEEDS_VERIFICATION_LABEL] + the same activity text) whenever no unit is supplied, and the atomic transaction / idempotency / priority logic unchanged. Change: PromoteIntakeInputSchema gains optional `unit: z.object({ unitId: z.string().trim().min(1), label: z.string().trim().min(1) }).nullable().optional()`; the writer sets `unit: parsed.unit ?? null` and `labels: (parsed.unit ?? null) ? [] : [NEEDS_VERIFICATION_LABEL]`, and the activity text notes the confirmed unit when present. Update the lines ~13-14 doc-comment to describe this optional confirm path WITHOUT em dashes.
```

_[NONE — Action Registry / EXECUTABLE_ALLOWLIST]_

```
Do NOT modify scripts/seed-action-registry.ts, lib/admin/migration-readiness.ts, or any Action Registry entry. No production_allowed flag flips. Only gmail.renewal_notice.draft_create stays executable; every other entry stays production_allowed:false. This slice adds no executable action and no SoR write.
```

_[docs/loop-state.md]_

```
Net-zero-line in-place edit to line 53 (the 'Deferred cycle IN PROGRESS' bullet): drop `unit type-ahead` from the `Remaining:` list and record 2a as done with `(`F-MAINT-UNIT-TYPEAHEAD`)`. File is at the 140-line cap, so add NO new line; verify with `npm run verify:context-freshness`.
```

**Guardrails:**
- No per-keystroke live RentVine reads: the search endpoint MUST read getUnitIndex() (the TTL cache), never call loadLiveUnitCandidates/RentVine directly; RentVine is read at most once per UNIT_INDEX_TTL_MS per process.
- No LLM/model call anywhere in the index, route, or component — searchUnits is a pure deterministic substring/token filter.
- GET /api/maintenance/units/search MUST be authed via requireCapability('edit') so it satisfies tests/unit/route-auth-boundary.test.ts (do NOT add it to ALLOW_UNAUTHENTICATED).
- UnitTypeahead and both wired components are client components: no value-import of any firebase-admin/server module; use local types or `import type` only (gotcha 4).
- Copy-voice: no 'control plane' / 'PMI handles' / 'source of truth' jargon in app/components/lib, and no em dashes in the new/edited operator strings and the edited lib doc-comment (gotcha 3).
- Preserve the default promote behavior exactly: with no confirmed unit the ticket is still unit:null + [NEEDS_VERIFICATION_LABEL] with the same activity text; only add the optional confirmed-unit branch.
- No system-of-record write, no send, no RentVine work-order create, no Sheet write; the promoted ticket remains an app-plane Firestore ticket.
- Do not touch the EXECUTABLE_ALLOWLIST guards or flip any Action Registry entry to production_allowed:true.
- docs/loop-state.md must stay <=140 lines (edit an existing line, add none).
- docs/facts.md evidence paths must exist on disk and contain no [bracket] dynamic-route segment (cite the created files/tests, not app/api/.../[id]/route.ts).
- Leave POST /api/maintenance/match-unit and lib/maintenance/unit-matcher.ts intact (still imported by lib/maintenance/live-unit-source.ts and still tested).

**Verify:** `npx vitest run tests/unit/maintenance-unit-index.test.ts tests/unit/maintenance-units-search-route.test.ts tests/unit/maintenance-unit-typeahead.test.tsx tests/unit/maintenance-capture.test.tsx tests/unit/maintenance-intake-review.test.ts tests/unit/maintenance-intake-review-routes.test.ts tests/unit/maintenance-intake-review-component.test.tsx tests/unit/route-auth-boundary.test.ts ; npm run typecheck ; npm run verify:copy-voice ; npm run verify:context-freshness ; npm run verify`

**Done when:** On its own branch: `npm run verify` (full sweep: lint, format:check, typecheck, vitest, copy-voice, context-freshness) is green. lib/maintenance/unit-index.ts caches the /leases/export outcome for ~10 min (proven by the cache/TTL test) and short-circuits to DEMO_UNIT_CANDIDATES under localDemoAuth. GET /api/maintenance/units/search is edit-gated (401 unauth, 400 over-long, 503 error_type when unavailable, 200 { units } otherwise) and passes the route-auth-boundary invariant with no allow-list change. UnitTypeahead debounces, degrades non-fatally, and is wired into MaintenanceCapture's unit field (picked unit -> Verified, no blocker) and into UnverifiedIntakeReview's promote flow. promoteUnverifiedIntake stores a confirmed unit + drops the Needs-Verification label when supplied, and is UNCHANGED (unit:null + Needs Verification) otherwise. F-MAINT-UNIT-TYPEAHEAD added Verified; F-MAINT-INTAKE-REVIEW amended (default preserved); docs/loop-state.md updated and still <=140 lines. Then: PR -> CI 'verify' green -> merge.

---

## 1b
**Lease-renewal live-review actionable: extract resolve + approve/return/revoke controls, fix live-review resolve 404**

- Loop-executable: true

**Objective:** Make the owner-gated live renewal review (/lease-renewal/live) actionable by reusing the run-page resolve form and the Admin approve/return/revoke write-back controls, extracted verbatim into a shared client module. Fix the blocker where POST /api/lease-renewal/resolve 404s for live runs (run_id "live-review") because it defaults its run resolver to getSimulationRun: the route now injects a resolver that rebuilds the live run. Queue-only: production_allowed:false, no system-of-record write, no send.

**In scope:**
- Extract FlagResolveForm, WritebackApprovalControl (+ its internal WritebackApprovalTimeline/DECISION_LABEL), and WritebackProposalCard (plus ResolveKind/KIND_LABEL) verbatim from components/lease-renewal/LeaseRenewalRunClient.tsx into a new shared "use client" module components/lease-renewal/flag-actions.tsx; re-import them in LeaseRenewalRunClient so its rendered DOM/labels are byte-identical (bulk test stays green).
- Fix the resolve blocker: add lib/lease-renewal/resolve-run.ts exporting resolveRenewalRun(runId) that rebuilds the live run for the live id and falls back to getSimulationRun otherwise; widen RunResolver in lib/firestore/lease-renewal-resolutions.ts to allow an async resolver and await it; inject resolveRenewalRun in app/api/lease-renewal/resolve/route.ts.
- In lib/lease-renewal/live-review.ts export LIVE_REVIEW_RUN_ID, factor a shared internal run builder, add rebuildLiveRenewalRun(readTimestamp), and add an optional resolutions/approvals/activity overlay param to loadLiveRenewalReview.
- Make LiveRenewalReview reuse the shared controls (new props canResolve/isAdmin/resolutionsError); load the live-review run's resolutions/approvals/activity on app/lease-renewal/live/page.tsx (try/catch degrade) and thread them through the overlay.
- Update tests/unit/live-renewal-review.test.tsx for the actionable surface; add tests/unit/lease-renewal-resolve-run.test.ts.
- Add a Verified F-RENEWAL-LIVE-ACTIONABLE fact row + fold a 1b progress note into docs/loop-state.md in place.

**Out of scope:**
- Any Action Registry flip or change to the EXECUTABLE_ALLOWLIST (stays exactly ["gmail.renewal_notice.draft_create"]).
- Any system-of-record / Sheet / RentVine / Gmail write or send; the actual Sheet write-back execution stays gated (F-WRITE-GATE).
- Bulk write-back decision bar on the live review (bulk stays run-page-only).
- Changes to the writeback-approvals route/data layer (it reads the stored resolution by source_trigger_key and already works for run_id "live-review").
- Any new app/api route or auth-boundary allow-list change.
- The ?flag= highlight/scroll deep-link on the live review (run-page-only).

**Files to create:**
- `components/lease-renewal/flag-actions.tsx` — New shared "use client" module holding the reusable flag actions extracted verbatim from LeaseRenewalRunClient.tsx. Exports: (1) FlagResolveForm({flag: RenewalFlagView, runId: string, canResolve: boolean, isAdmin: boolean}) — encapsulates the FlagCard resolve logic (useState for kind/chosenSource/correctedValue/reason/reasonCode/submitting/error initialized exactly as today; the submit() POST to /api/lease-renewal/re …
- `lib/lease-renewal/resolve-run.ts` — Server-only run resolver injected by the resolve route. Full content: header comment noting keys are derived from runId+field_key only (so a rebuild matches) and that it writes nothing; import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline"; import { LIVE_REVIEW_RUN_ID, rebuildLiveRenewalRun } from "@/lib/lease-renewal/live-review"; import { getSimulationRun } from "@/lib/lease-renewal/simulation"; expo …
- `tests/unit/lease-renewal-resolve-run.test.ts` — Unit test locking the dispatch + non-fatal degrade. Cases: resolveRenewalRun(SIMULATION_RUN_ID) resolves to a run whose runId===SIMULATION_RUN_ID; resolveRenewalRun("does-not-exist") resolves to null; and — guarded by if(!process.env.RENTVINE_API_BASE_URL) so it stays hermetic — resolveRenewalRun("live-review") resolves to null when live sources are unconfigured (proves the live branch degrades, never throws or leaks …

**Files to edit:**
- `lib/firestore/lease-renewal-resolutions.ts` — Widen the resolver type to allow an async resolver and await it. Line 157: change `export type RunResolver = (runId: string) => RenewalRunResult | null;` to `export type RunResolver = (runId: string) => RenewalRunResult | null | Promise<RenewalRunResult | null>;`. In resolveLeaseRenewalFlag (line ~173): change `const run = getRun(parsed.run_id);` to `const run = await getRun(parsed.run_id);`. Keep the default `getRun: RunResolver = getSimulationRun` (pure test seam; do NOT import resolve-run here — avoid coupling the persistence layer to the live network clients). No other logic changes; the 4 …
- `app/api/lease-renewal/resolve/route.ts` — Inject the combined resolver so live-review flags no longer 404. Add import { resolveRenewalRun } from "@/lib/lease-renewal/resolve-run";. Change the call `const resolution = await resolveLeaseRenewalFlag(user, input);` to `const resolution = await resolveLeaseRenewalFlag(user, input, undefined, resolveRenewalRun);` (undefined keeps the getAdminFirestore() default for db). Add a one-line comment explaining the resolver rebuilds the live-review run. Route stays gated by requireCapability("read") — no auth-boundary change.
- `lib/lease-renewal/live-review.ts` — (1) Add `export const LIVE_REVIEW_RUN_ID = "live-review";` and use it in place of the literal runId in the run builds. (2) Factor an internal `async function runLiveReview(readTimestamp): Promise<{status:"ok";result:FullyLiveRenewalRunResult}|{status:Exclude<LiveReviewStatus,"ok">}>` that does buildLiveRenewalConfig() (return {status:config.reason} when !ok), then runFullyLiveRenewalReview with tabTitles: LIVE_REVIEW_TABS, runId: LIVE_REVIEW_RUN_ID, readTimestamp, in a try/catch returning {status: categorizeLiveReviewError(error)}. (3) Add `export interface LiveReviewOverlay { resolutions?: Le …
- `app/lease-renewal/live/page.tsx` — Load the live-review run's persisted decisions and pass the actionable props. Add imports: { can } from @/lib/auth/roles; { listResolutionsForRun } from @/lib/firestore/lease-renewal-resolutions; { listWritebackApprovalsForRun, listWritebackApprovalActivityForRun } from @/lib/firestore/lease-renewal-writeback-approvals; and add LIVE_REVIEW_RUN_ID to the existing import from @/lib/lease-renewal/live-review. After `const user = await requirePageCapability("manageAdmin");`, load (mirroring runs/[runId]/page.tsx): let resolutions=[], approvals=[], activity=new Map(), resolutionsError=false; try { …
- `components/lease-renewal/LiveRenewalReview.tsx` — Make it reuse the shared controls. Add import { FlagResolveForm, WritebackApprovalControl, WritebackProposalCard } from "@/components/lease-renewal/flag-actions";. Change the component signature to Readonly<{ view: RenewalRunView; meta: LiveReviewMeta; canResolve: boolean; isAdmin: boolean; resolutionsError: boolean }>. Render a degrade banner near the top of the stack when resolutionsError: <p className="workflow-blocker">Saved decisions could not be loaded (Firestore unavailable). Items below are shown without their saved resolution; resolving needs a working Firestore connection.</p> (no em …
- `components/lease-renewal/LeaseRenewalRunClient.tsx` — Remove the now-extracted symbols and re-import them. Delete the local definitions of ResolveKind, KIND_LABEL, DECISION_LABEL, WritebackProposalCard, WritebackApprovalControl, WritebackApprovalTimeline, and the inline resolution-display + resolve-form blocks inside FlagCard (current lines ~713-793). Add import { FlagResolveForm, WritebackApprovalControl, WritebackProposalCard } from "@/components/lease-renewal/flag-actions";. In FlagCard, keep header/candidates/suggestedWinner/blockedReason, the WritebackProposalCard render, the bulk checkbox, the highlight/cardRef/scrollIntoView + id={`flag-${ …
- `tests/unit/live-renewal-review.test.tsx` — Update for the actionable surface. Add at top-level: import { vi } from "vitest" (already partly imported — ensure vi is imported) and vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) })); (the shared controls call useRouter). Add canResolve={true} isAdmin={true} resolutionsError={false} to both existing <LiveRenewalReview .../> renders. In the first test, REPLACE the two read-only assertions (queryByRole("button") not present / queryByRole("textbox") not present) with actionable assertions: since SAMPLE_VIEW's flag is High + isAdmin+canResolve true, assert screen.ge …

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
APPEND one new Verified row at the END of the Fact Ledger section (immediately after the F-MAINT-ASSIGNEE row at line 124, before the blank line + `## Supersede Log` at line 126), as a single-line markdown table row (no bracket [id] path in evidence, all paths exist on disk). Row: `| F-RENEWAL-LIVE-ACTIONABLE | The owner-gated live renewal review is ACTIONABLE (slice 1b): the resolve form + the Admin approve/return/revoke write-back controls were extracted verbatim from `LeaseRenewalRunClient` into a shared "use client" module (`components/lease-renewal/flag-actions.tsx`: FlagResolveForm, WritebackApprovalControl, WritebackProposalCard) and reused by `LiveRenewalReview` on the manageAdmin-gated live page. BLOCKER FIXED: `/api/lease-renewal/resolve` defaulted its run resolver to `getSimulationRun`, so a live-review flag (run_id `live-review`) 404'd; the route now injects `resolveRenewalRun`, which rebuilds the live run for `LIVE_REVIEW_RUN_ID` (`rebuildLiveRenewalRun` reuses the SAME tabs+runId as the page so source_trigger_key `lease_renewal:reconcile:live-review:{field}` matches — the key is derived from runId+field_key only, never the read timestamp) and falls back to `getSimulationRun` otherwise; `RunResolver` was widened to an async resolver and the data layer now awaits it. The live page loads the run's resolutions/approvals/activity (try/catch degrade) through a new `loadLiveRenewalReview` overlay; the approve/return/revoke route needed NO change (it reads the stored resolution). Queue-only: production_allowed:false, no system-of-record write, no send; the Action Registry EXECUTABLE_ALLOWLIST is unchanged. | Verified | `components/lease-renewal/flag-actions.tsx`; `components/lease-renewal/LiveRenewalReview.tsx`; `lib/lease-renewal/resolve-run.ts`; `lib/lease-renewal/live-review.ts`; `lib/firestore/lease-renewal-resolutions.ts`; `app/api/lease-renewal/resolve/route.ts`; `app/lease-renewal/live/page.tsx`; `tests/unit/live-renewal-review.test.tsx`; `tests/unit/lease-renewal-resolve-run.test.ts` | 2026-07-09 | — | 2026-12-31 |`. PRESERVE: every existing ledger row, the Supersede Log, and the Open Questions section verbatim; do not renumber or edit other rows.
```

_[docs/loop-state.md]_

```
loop-state.md is EXACTLY at the 140-line cap (139 newlines + trailing newline = split-length 140); adding a physical line trips verify:context-freshness. Therefore FOLD the 1b note into the EXISTING final line of the `Deferred cycle IN PROGRESS (2026-07-09)` bullet (the line ending `assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.`) by editing it IN PLACE to: `assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); 1b made the live renewal review actionable (reused resolve + approve/return/revoke controls; the resolve route rebuilds the live run) (`F-RENEWAL-LIVE-ACTIONABLE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.`. Do NOT add any new line. Keep `Last updated: 2026-07-09` as-is (do not bump; today is 2026-07-09, so loopDate stays >= status.md max). If docs/status.md gets an entry this slice, date it 2026-07-09. PRESERVE all other loop-state content and the total line count (must stay <= 140).
```

**Guardrails:**
- production_allowed:false everywhere; queue-only; NO system-of-record / Sheet / RentVine / Gmail write or send. The actual Sheet write-back execution stays gated (F-WRITE-GATE).
- Do NOT flip any Action Registry entry. EXECUTABLE_ALLOWLIST in scripts/seed-action-registry.ts AND lib/admin/migration-readiness.ts must stay exactly new Set(["gmail.renewal_notice.draft_create"]).
- No new app/api route is added; the resolve route keeps requireCapability("read") and the data layer keeps enforcing approve + manageAdmin (High/Blocked) + mandatory reason. tests/unit/route-auth-boundary.test.ts allow-list is unchanged.
- flag-actions.tsx is a client module: import server types (RenewalFlagView, RenewalWritebackApprovalView, RenewalWritebackApprovalActivityView, WritebackProposal) with `import type` only; never value-import a firebase-admin module (GOTCHA 4).
- Copy-voice (GOTCHA 3): no 'control plane'/'PMI handles'/'source of truth' in any RENDERED string in app/components/lib (those phrases appear only in moved code COMMENTS, which the gate strips); em dashes in operator UI remain warnings, not errors. Add no new jargon in LiveRenewalReview copy.
- Extraction must be behavior-preserving: LeaseRenewalRunClient's rendered DOM, class names, aria-labels, and button/label text must be byte-identical so tests/unit/lease-renewal-run-client-bulk.test.tsx stays green.
- rebuildLiveRenewalRun and loadLiveRenewalReview MUST share the internal runLiveReview builder (identical tabTitles ['Lease Renewal'] + runId LIVE_REVIEW_RUN_ID) so source_trigger_keys line up between page render and resolve-time rebuild.
- Do NOT import resolve-run.ts (or live-config/live network clients) into lib/firestore/lease-renewal-resolutions.ts; keep its default getRun=getSimulationRun (pure test seam). Inject the combined resolver only at the route.
- docs/loop-state.md MUST stay <= 140 lines (it is currently AT the cap) — fold the progress note into an existing line, never add a physical line.
- docs/facts.md evidence paths must exist on disk and contain no [bracket] dynamic-route segment; all cited paths comply (the resolve route path has no bracket; do not cite app/lease-renewal/runs/[runId]/page.tsx).
- Live reads must degrade non-fatally + be demo/degradation-aware (GOTCHA 5): the Firestore overlay load on the live page is wrapped in try/catch (resolutionsError banner), and resolveRenewalRun returns null (never throws / leaks a read error) when live sources are unconfigured.

**Verify:** `npm run typecheck ; npm run lint ; npm test ; npm run verify:context-freshness ; npm run build ; npm run verify`

**Done when:** POST /api/lease-renewal/resolve with run_id \"live-review\" no longer 404s: the route injects resolveRenewalRun, which rebuilds the live run and matches the flag by source_trigger_key (verified by the widened async RunResolver + the new resolve-run unit test + the existing sim-path e2e still green). The live review page renders the reused resolve form and the Admin approve/return/revoke controls (from flag-actions.tsx), manageAdmin-gated, and shows saved resolutions/approvals/activity loaded for run_id live-review with a non-fatal degrade banner on Firestore failure. LeaseRenewalRunClient DOM is unchanged (bulk test green). Governance intact: production_allowed:false, no SoR write/send, EXECUTABLE_ALLOWLIST untouched. docs/facts.md has the new F-RENEWAL-LIVE-ACTIONABLE Verified row and docs/loop-state.md carries the folded 1b note while staying <= 140 lines. Full `npm run verify` sweep (format:check, lint, typecheck, test incl. copy-voice, router-boundary, falsification, context-freshness, redaction, build) is green.

---

## 1c
**Slice 1c — Per-property lease-renewal decision repository + manageAdmin page**

- Loop-executable: true

**Objective:** Add a pure per-property repository that joins each simulation run's ADDRESS-joined reconciliation flags to a canonical property key (deriveAddressKey of the record's join value) and buckets the EXISTING append-only resolution + write-back-approval Activity by property, exposing a strictly value-free payload ({actorUid, action, timestamp, reason}). Surface it on a new manageAdmin-only /lease-renewal/property/[propertyKey] server page. No new Firestore collection or index; app-plane only; production_allowed:false throughout; golden-tested for no cross-property bleed.

**In scope:**
- New pure module lib/lease-renewal/property-repository.ts: types (PropertyActivityEntry with EXACTLY actorUid/action/timestamp/reason; PropertyActivityBucket; PropertyRunActivity input) + buildRunPropertyKeyIndex(run) + listRunPropertyKeys(run) + buildPropertyActivity(runs) + getPropertyActivity(runs, propertyKey). No I/O, no firebase-admin import, no Date.now().
- Minimal additive pipeline change: add optional propertyKey?: string to ReconciledFieldOutcome in lib/lease-renewal/pipeline.ts, populated ONLY for spec.joinKind === 'address' as deriveAddressKey(joinRaw).key (import deriveAddressKey from the already-used @/lib/lease-renewal/join).
- New run-scoped reader listResolutionActivityForRun(actor, runId, db) in lib/firestore/lease-renewal-resolutions.ts mirroring the existing listWritebackApprovalActivityForRun (read-gated; single-field where('run_id','==',runId); no composite index).
- New server page app/lease-renewal/property/[propertyKey]/page.tsx: requirePageCapability('manageAdmin'); iterate listSimulationRuns()->getSimulationRun(runId); fetch resolution + approval Activity per run (try/catch, degrade non-fatally + demo-aware); build buckets via the repository; render one property's value-free decision history inside AppShell with a back-link to /lease-renewal.
- Golden test tests/unit/lease-renewal-property-repository.test.ts: (a) two properties raising DIFFERENT address-fields -> each key attributes to exactly one property, assert NO cross-property bleed; (b) two properties raising the SAME field (shared run+field source_trigger_key) -> attributed to NEITHER; (c) value-free sentinel pinning entry key-set to [action,actorUid,reason,timestamp] and asserting no address/value leak.
- Governance close-out: add Verified fact F-RENEWAL-PROPERTY-REPO to docs/facts.md; edit-in-place progress in docs/loop-state.md (keep <=140 lines); append dated slice-1c entry to docs/status.md.

**Out of scope:**
- Navigation/links INTO the property page (run page, desk, attention fold) — deferred; the page is directly-addressable this slice.
- Attributing NAME-joined fields (renewal_date, current_rent, tenant_responded) — those Renewals-tab records carry no address column, so they have no property; excluded by design.
- Storing the RAW address on the outcome — only the derived deriveAddressKey().key is added.
- Any new Firestore collection, composite index, firestore.rules change, or firestore.indexes.json edit.
- Any Action Registry change or EXECUTABLE_ALLOWLIST edit; any system-of-record write, draft, or send.
- Any change to run-view.ts / the value-free board / queue drafts (propertyKey must NOT be projected onto them).

**Files to create:**
- `lib/lease-renewal/property-repository.ts` — Pure per-property repository. Exports: interface PropertyActivityEntry { actorUid: string; action: string; timestamp: string; reason: string } (EXACTLY these 4 keys — value-free); interface PropertyActivityBucket { propertyKey: string; entries: PropertyActivityEntry[]; resolutionCount: number; approvalCount: number }; interface PropertyRunActivity { run: RenewalRunResult; resolutionActivity: readonly LeaseRenewalReso …
- `app/lease-renewal/property/[propertyKey]/page.tsx` — manageAdmin-only server component (NO 'use client'). Signature: props { params: Promise<{ propertyKey: string }> }. const user = await requirePageCapability('manageAdmin'); const { propertyKey } = await params. Build PropertyRunActivity[] by iterating listSimulationRuns(): for each summary, getSimulationRun(runId) (pure, always available); then try { resolutionActivity = await listResolutionActivityForRun(user, runId …
- `tests/unit/lease-renewal-property-repository.test.ts` — Golden test (Vitest). Helper builds a custom run via runRenewalPipeline({runId:'prop-run', tables:[propertyAttributesGrid], nonSheetCandidates:[...]}) using a Property Attributes grid (reuse the exact header row: ['Property','Unit','Updated to Kwickset Smart Locks','Utilities Needed','Lawn Care','Inspections','Appliances provided','','Notes']) with two data rows for '100 Birchwood Ln' and '2200 Elmgrove'. Test A (no …

**Files to edit:**
- `lib/lease-renewal/pipeline.ts` — 1) Change the join import to `import { deriveAddressKey, proposeJoin, type JoinKind } from "@/lib/lease-renewal/join";`. 2) In interface ReconciledFieldOutcome add an optional field with a doc comment: `/** Canonical property key (deriveAddressKey of the record's join value) for ADDRESS-joined fields; undefined for name-joined fields. In-boundary only; never projected onto the value-free board/queue. */ propertyKey?: string;`. 3) Inside runRenewalPipeline, after `const joinRaw = record.fields[spec.joinFieldKey]?.raw ?? "";` (currently ~line 245) compute `const propertyKey = spec.joinKind === " …
- `lib/firestore/lease-renewal-resolutions.ts` — Add exported async function listResolutionActivityForRun(actor: AuthenticatedUser, runId: string, db: Firestore = getAdminFirestore()): Promise<LeaseRenewalResolutionActivityRecord[]> that assertCan(actor,'read'), queries db.collection(LEASE_RENEWAL_COLLECTIONS.resolutionActivity).where('run_id','==',runId).get(), maps via readRecord<LeaseRenewalResolutionActivityRecord>, and sorts by created_at.localeCompare (mirror the existing listWritebackApprovalActivityForRun; LeaseRenewalResolutionActivityRecord is already imported in this file; the activity write already stamps run_id, so the single-fi …
- `docs/facts.md` — Append one Verified Fact-Ledger row F-RENEWAL-PROPERTY-REPO (exact text in governanceChanges). Evidence cites ONLY existing non-bracket paths (repository, pipeline, firestore reader, golden test) — NOT the bracketed page route, which the freshness gate mis-parses.
- `docs/loop-state.md` — Edit IN PLACE (file is 139 lines; hard cap 140). In the console-overhaul DEFERRED enumeration remove 'per-property repository' from the not-built list, and in the 'Deferred cycle IN PROGRESS (2026-07-09)' bullet fold the shipped slice into the existing sentence (e.g. add '; per-property lease-renewal decision repo + manageAdmin page (F-RENEWAL-PROPERTY-REPO)'). Keep 'Last updated: 2026-07-09'. Net line change must stay <= 140.
- `docs/status.md` — Append a new dated (2026-07-09) append-only entry summarizing slice 1c: the per-property repository, the value-free {actorUid, action, timestamp, reason} payload, the run+field source_trigger_key -> no-bleed-on-collision rule, the manageAdmin page, reuse of existing collections (no new collection/index), and production_allowed:false / app-plane-only posture.

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
ADD one row to the '## Fact Ledger' table (preserve every existing row and the 7-column shape id|claim|status|evidence|verified-on|supersedes|review-by). Row — id: F-RENEWAL-PROPERTY-REPO | claim: 'Per-property lease-renewal decision repository (slice 1c): a pure property-repository joins each simulation run''s ADDRESS-joined flags to a canonical property key (deriveAddressKey of the record''s join value, surfaced as ReconciledFieldOutcome.propertyKey) and buckets the EXISTING append-only resolution + write-back-approval Activity by property. Each surfaced entry is VALUE-FREE — exactly {actorUid, action, timestamp, reason}, never an address / field value / field_key / proposed value (sentinel-pinned). Because a flag''s source_trigger_key is run+field, a key raised by two or more properties is attributed to NEITHER (no cross-property bleed; golden-tested), and NAME-joined fields (no address) are excluded. A new manageAdmin-only /lease-renewal/property/[propertyKey] server page renders one property''s decision history, degrading non-fatally when Firestore is unavailable. Reuses the existing lease_renewal_resolution_activity + lease_renewal_writeback_approval_activity collections via single-field run_id equality reads — no new collection or index. App-plane only: no system-of-record write, no send, production_allowed:false throughout.' | status: Verified | evidence: `lib/lease-renewal/property-repository.ts`; `lib/lease-renewal/pipeline.ts`; `lib/firestore/lease-renewal-resolutions.ts`; `tests/unit/lease-renewal-property-repository.test.ts` | verified-on: 2026-07-09 | supersedes: — | review-by: 2026-12-31. PRESERVE: do not renumber or alter other rows; do not cite the bracketed page path in evidence (freshness gate mis-parses [propertyKey]).
```

_[docs/loop-state.md]_

```
Edit in place only (139/140 lines — do NOT push over 140). Move 'per-property repository' OUT of the console-overhaul DEFERRED 'not built' list and note it shipped in the 'Deferred cycle IN PROGRESS (2026-07-09)' bullet (append '; per-property lease-renewal decision repo + manageAdmin page (F-RENEWAL-PROPERTY-REPO)'). PRESERVE: 'Last updated: 2026-07-09', the <=140-line pointer discipline, and every existing gate/blocker line. Do not append a brand-new bullet if it would exceed 140 lines — fold into an existing line.
```

_[docs/status.md]_

```
Append (append-only; never rewrite history) a 2026-07-09 entry for slice 1c. PRESERVE the append-only nature and keep the newest ISO date <= loop-state 'Last updated' (both 2026-07-09).
```

**Guardrails:**
- MUST NOT flip or add any Action Registry production_allowed, and MUST NOT touch EXECUTABLE_ALLOWLIST in scripts/seed-action-registry.ts or lib/admin/migration-readiness.ts. Only gmail.renewal_notice.draft_create stays executable; everything else remains production_allowed:false.
- MUST NOT create a new Firestore collection or any index. firestore.indexes.json stays []. Only single-field where('run_id','==',runId) equality reads on the existing lease_renewal_resolution_activity + lease_renewal_writeback_approval_activity collections (matches existing readers).
- VALUE-FREE invariant: PropertyActivityEntry exposes EXACTLY {actorUid, action, timestamp, reason}. Never copy address, field value, field_key, propertyKey-raw-address, proposed_value, source_of_value, severity, or reason_code onto an entry. Pin with a sentinel key-set assertion in the golden test.
- NO cross-property bleed: a source_trigger_key raised by 2+ properties (shared run+field key) is attributed to NEITHER property; unattributed Activity records are dropped, never bucketed onto a property. Golden-tested.
- property-repository.ts stays PURE: no I/O, no firebase-admin import (import types only), no Date.now(); it accepts already-fetched runs + Activity as input.
- The new page is a SERVER component (no 'use client'), guarded by requirePageCapability('manageAdmin'), and MUST degrade non-fatally + demo-aware: getSimulationRun is pure so the header always renders; wrap the Firestore Activity reads in try/catch and show an unavailable note instead of throwing.
- propertyKey MUST NOT leak onto the value-free board/queue: run-view.ts and approval-queue-mapping.ts are NOT edited; the outcome field is read only by the repository/page inside the auth boundary.
- Copy-voice: no 'control plane' / 'PMI handles' / 'source of truth' in any rendered string in app/components/lib (comments are exempt); avoid the em dash (U+2014) in the operator-UI page copy (warns).
- facts.md evidence cites existing non-bracket paths only; loop-state stays <= 140 lines (edit in place); preserve production_allowed:false / app-plane-only posture across all docs and code.

**Verify:** `npm run typecheck ; npx vitest run tests/unit/lease-renewal-property-repository.test.ts tests/unit/lease-renewal-pipeline.test.ts tests/unit/lease-renewal-simulation.test.ts ; npm test ; npm run lint ; npm run verify:copy-voice ; npm run verify:context-freshness ; npm run build`

**Done when:** lib/lease-renewal/property-repository.ts, app/lease-renewal/property/[propertyKey]/page.tsx, and tests/unit/lease-renewal-property-repository.test.ts exist; pipeline.ts exposes ReconciledFieldOutcome.propertyKey (populated only for address-joined specs) and lease-renewal-resolutions.ts exposes listResolutionActivityForRun. The golden test proves: correct 1:1 attribution, NO cross-property bleed (both the different-field and same-field/collision cases), and the value-free entry key-set sentinel. All verify commands pass (typecheck, full test suite, lint, copy-voice, context-freshness, build) with no new Firestore collection/index and no Action Registry change. docs/facts.md carries Verified F-RENEWAL-PROPERTY-REPO (non-bracket evidence paths), docs/loop-state.md is updated in place (<=140 lines), and docs/status.md has the dated slice-1c entry. Then: own branch -> PR -> CI 'verify' green -> merge.

---

## 3a
**Anticipatory AI draft-TEXT composer for Gmail Inbox 0 (ModelProvider seam, deterministic spine first)**

- Loop-executable: true
- Depends on: None blocking — independent app-plane slice; reuses existing buildReplyDraft (lib/gmail-inbox-zero/drafts.ts), the ModelProvider seam (lib/llm/model-provider.ts …

**Objective:** Add lib/gmail-inbox-zero/anticipatory-draft.ts: a pure app-plane function composeAnticipatoryReplyDraft that tailors an already-Approved Gmail Inbox 0 reply template for ONE thread through the ModelProvider seam (free local model in dev/test, Gemini in prod, NODE_ENV-fenced). The deterministic buildReplyDraft spine runs FIRST and refuses an unapproved template or a hard-excluded category BEFORE the model is ever called; the verbatim DRAFT_BANNER and "Needs Verification: <fact>" placeholders are re-applied deterministically after the model returns; any model failure degrades non-fatally to the deterministic template draft. Single-thread explicit invoke, under the $10 cap, NO Gmail API call, no send, no Action Registry entry touched. Register the file in CLIENT_DRAFT_FILES so its em dashes hard-fail copy-voice, and record a Verified F-GMAIL-DRAFT-COMPOSER fact + a loop-state progress line.

**In scope:**
- New pure lib module lib/gmail-inbox-zero/anticipatory-draft.ts using the ModelProvider seam via dependency injection (provider + model passed in, exactly like lib/processes/classify.ts — never constructs a provider or reads config)
- Deterministic spine FIRST: call buildReplyDraft (lib/gmail-inbox-zero/drafts.ts) before any model call so an unapproved template or a hard-excluded category (Owner money / Legal/notices / Tenant disputes) is refused with the model never invoked
- Re-apply the verbatim DRAFT_BANNER + UNVERIFIED_PLACEHOLDER deterministically by re-running buildReplyDraft over the model's tailored body (so banner + Needs-Verification lines are byte-identical to the deterministic path); strip a leading banner the model wrongly emits so it is never duplicated
- Non-fatal degrade: any model/setup throw, non-JSON, wrong-shape, or empty body falls back to the deterministic template draft (ok:true, usedModel:false) — never throws, never emits ungrounded model text without the banner
- Structured output {"draft_body": string} via responseJsonSchema + fence-strip + JSON parse, mirroring classify.ts; system instruction forbids inventing facts, forbids the banner/subject/signature in the body, and requires the exact UNVERIFIED_PLACEHOLDER for unknowns
- New unit test tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts with a fake ModelProvider proving: spine-refuses-before-model (call count 0), banner-exactly-once, placeholder re-apply, model-banner-strip, and every degrade path; single-thread invoke = model called exactly once
- Add "lib/gmail-inbox-zero/anticipatory-draft.ts" to CLIENT_DRAFT_FILES in scripts/check-copy-voice.mjs (em dashes in the file then hard-fail)
- Add Verified fact F-GMAIL-DRAFT-COMPOSER to docs/facts.md and fold a 3a progress note into the existing loop-state 'Deferred cycle IN PROGRESS' bullet (in-place, no net new physical line)

**Out of scope:**
- Any Gmail API call, mailbox read, draft create, or label apply (the per-user Gmail runtime stays gated; do NOT use the Gmail MCP tools)
- A new app/api route or React/UI wiring for the composer (no route means no tests/unit/route-auth-boundary.test.ts change; caller wiring is a later slice) — the composer is lib-only with DI provider+model
- Any Action Registry change or production_allowed flip; the gmail.label.apply / gmail.draft.create entries stay Planned/production_allowed:false; EXECUTABLE_ALLOWLIST is untouched
- A whole-inbox / batch sweep, background trigger, Cloud Scheduler, or notifications (3b and later)
- Editing any pinning test, supersede log entry, or governance invariant (this is an additive build, not a governance supersede)
- docs/status.md is append-only history; a one-line entry is optional and gate-neutral, not required by this slice

**Files to create:**
- `lib/gmail-inbox-zero/anticipatory-draft.ts` — Anticipatory AI draft-TEXT composer. EXACT full contents:

// Anticipatory AI draft-TEXT composer for Gmail Inbox 0 (deferred-cycle bullet 3, slice 3a).
// It tailors an ALREADY-APPROVED reply template so it reads naturally for one specific email,
// through the ModelProvider seam so a free local model stands in for Gemini in dev/test and
// Gemini runs in prod (lib/config/server.ts fences the local path out of prod) …
- `tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts` — Unit tests with a fake ModelProvider (no Gmail, no network). EXACT full contents:

import { describe, expect, it } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import {
  composeAnticipatoryReplyDraft,
  type ComposeAnticipatoryDraftInput,
} from "@/lib/gmail-inbox-zero/anticipatory-draft";
import type { ReplyTemplate } from "@/lib/gmail-inbox-zero/drafts";
import type { TriageMessageFacts } from " …

**Files to edit:**
- `scripts/check-copy-voice.mjs` — Add the new composer to the CLIENT_DRAFT_FILES array so its em dashes hard-fail the copy-voice gate. Replace exactly:

export const CLIENT_DRAFT_FILES = [
  "lib/lease-renewal/owner-draft.ts",
  "lib/lease-renewal/tenant-draft.ts",
  "lib/maintenance/owner-notice-draft.ts",
];

with:

export const CLIENT_DRAFT_FILES = [
  "lib/gmail-inbox-zero/anticipatory-draft.ts",
  "lib/lease-renewal/owner-draft.ts",
  "lib/lease-renewal/tenant-draft.ts",
  "lib/maintenance/owner-notice-draft.ts",
];

No other change. tests/unit/check-copy-voice.test.mjs does NOT pin the array contents (it only asserts sca …

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
Append ONE new Verified row to the Fact Ledger, immediately AFTER the F-MAINT-ASSIGNEE row (current line 124) and BEFORE the blank line 125 that precedes '## Supersede Log'. PRESERVE every existing row (do not edit F-MAINT-ASSIGNEE, F-GMAIL-RENEWAL-DRAFT-LIVE, F-GMAIL-RUNTIME-GATED, or any other row) and preserve the Supersede Log unchanged (this is additive; NO supersede entry, NO supersedes pointer). New row (7 columns: id | claim | status | evidence | verified-on | supersedes | review-by):

| F-GMAIL-DRAFT-COMPOSER | The anticipatory AI draft-TEXT composer for Gmail Inbox 0 (deferred-cycle bullet 3, slice 3a) lives at `lib/gmail-inbox-zero/anticipatory-draft.ts` and runs through the ModelProvider seam (`lib/llm/model-provider.ts`), so a free local model stands in for Gemini in dev/test and Gemini runs in prod (NODE_ENV-fenced; provider + model are injected by the caller, never built here — mirrors `lib/processes/classify.ts`). The deterministic `buildReplyDraft` spine (`lib/gmail-inbox-zero/drafts.ts`) runs FIRST: an unapproved reply template or a hard-excluded category (Owner money / Legal/notices / Tenant disputes) is refused with `refusedBeforeModel:true` BEFORE the model is invoked, so the model never sees excluded mail. The verbatim `DRAFT_BANNER` and the `Needs Verification: <fact>` placeholders are re-applied deterministically by re-running `buildReplyDraft` over the model's tailored body, a leading banner the model wrongly emits is stripped so it is never duplicated, and any model/setup throw, non-JSON, wrong-shape, or empty output degrades non-fatally to the deterministic template draft (`usedModel:false`). Single-thread explicit invoke only (one call composes one thread; no batch/inbox sweep), keeping on-demand Flash usage under the $10 cap. The file is registered in `CLIENT_DRAFT_FILES` (`scripts/check-copy-voice.mjs`) so em dashes in it hard-fail copy-voice. Pure app-plane text: NO Gmail API call, no send capability, no Action Registry entry touched (the Gmail Inbox 0 entries stay Planned / `production_allowed:false`; the per-user Gmail runtime stays gated). Verified locally with a fake ModelProvider: spine-refuses-before-model (call count 0), banner-exactly-once, placeholder re-apply, model-banner-strip, and every degrade path; full unit + copy-voice + freshness sweep green. | Verified | `lib/gmail-inbox-zero/anticipatory-draft.ts`; `lib/gmail-inbox-zero/drafts.ts`; `lib/llm/model-provider.ts`; `scripts/check-copy-voice.mjs`; `tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts` | 2026-07-09 | — | 2026-12-31 |

All five evidence paths exist on disk after the slice's files are created and contain NO [bracket] dynamic-route segment, so the freshness gate parses them cleanly. Create the source + test files BEFORE running verify:context-freshness.
```

_[docs/loop-state.md]_

```
IN-PLACE edit of the 'Deferred cycle IN PROGRESS (2026-07-09)' bullet — REPLACE the exact 2 physical lines (current lines 52-53):

DWD grant + live smoke (`F-GMAIL-RENEWAL-DRAFT-LIVE`; gmail.compose only, no send; owner deploy pending); 2b the edit-gated
assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.

with these exact 2 physical lines (line 53 becomes one long line; do NOT introduce a new newline — the file must stay <=140 physical lines; it is currently 139, this edit keeps it 139):

DWD grant + live smoke (`F-GMAIL-RENEWAL-DRAFT-LIVE`; gmail.compose only, no send; owner deploy pending); 2b the edit-gated
assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); 3a the anticipatory AI draft-TEXT composer via the ModelProvider seam (deterministic buildReplyDraft spine refuses excluded categories BEFORE the model runs; DRAFT_BANNER + Needs Verification preserved; single-thread explicit invoke under the $10 cap; NO Gmail call) (`F-GMAIL-DRAFT-COMPOSER`). Remaining: A4, unit type-ahead, notifications, queue rebuild.

PRESERVE: 'Last updated: 2026-07-09' stays as-is (freshness gate needs it >= newest docs/status.md date; today is 2026-07-09). Do NOT touch any other line. Confirm `wc -l docs/loop-state.md` still reports 139 (<=140).
```

**Guardrails:**
- MUST NOT make any Gmail API call, nor use the live Gmail MCP tools (create_draft / search_threads / get_message / label_*) — the composer is pure text over sanitized caller-supplied facts
- MUST NOT add or flip any Action Registry entry; gmail.label.apply and gmail.draft.create stay Planned / production_allowed:false; do not touch EXECUTABLE_ALLOWLIST in scripts/seed-action-registry.ts or lib/admin/migration-readiness.ts
- MUST run the deterministic buildReplyDraft spine and RETURN on !spine.ok BEFORE calling provider.generateText — the excluded-category / unapproved-template refusal must be provable by a fake provider whose call count stays 0
- MUST NOT construct a ModelProvider or read config inside the module — provider + model are injected (DI), exactly like classify.ts, so no route/config coupling and prod/dev fencing stays in lib/config/server.ts
- MUST NOT write any em dash (U+2014) or the forbidden jargon 'control plane' / 'PMI handles' / 'source of truth' in a NON-comment string literal of anticipatory-draft.ts (it is now a CLIENT_DRAFT_FILES member; the banner's em dash reaches runtime only via ${DRAFT_BANNER} interpolation). Reference DRAFT_BANNER / UNVERIFIED_PLACEHOLDER via the imported constants, never re-type the literal banner text
- MUST NOT throw on model failure — degrade to the deterministic template draft (ok:true, usedModel:false); the composer always yields a banner-carrying draft or an explicit spine refusal
- MUST NOT add an app/api route or UI in this slice (keeps tests/unit/route-auth-boundary.test.ts untouched); if a caller is ever wired it must pass config.geminiClassifyModel in prod / config.localModelName in dev (cheap Flash, under the $10 cap), like app/api/processes/classify/route.ts
- MUST keep docs/loop-state.md at <=140 physical lines (edit in place; no net new line) and keep every existing docs/facts.md row and the Supersede Log intact (additive fact only; no supersede)
- Evidence paths in the new fact must EXIST on disk and contain NO [bracket] segment — create the .ts + .test.ts files before running verify:context-freshness

**Verify:** `npm run typecheck ; npm run lint ; npm run build ; npx vitest run tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts tests/unit/gmail-inbox-zero.test.ts tests/unit/check-copy-voice.test.mjs ; npm test ; npm run format:check ; npm run verify:copy-voice ; npm run verify:context-freshness ; npm run check:budget-guard`

**Done when:** lib/gmail-inbox-zero/anticipatory-draft.ts exists and exports composeAnticipatoryReplyDraft with the deterministic-spine-first, banner/placeholder-preserving, non-fatal-degrade behavior; its unit test file passes proving the model is NOT called on an excluded category or unapproved template (call count 0), the banner appears exactly once, Needs-Verification placeholders survive a model that omits them, a model-emitted banner is stripped, and all degrade paths return ok:true/usedModel:false; scripts/check-copy-voice.mjs lists the file in CLIENT_DRAFT_FILES and npm run verify:copy-voice is green (no em dash / jargon in the file); docs/facts.md has the F-GMAIL-DRAFT-COMPOSER Verified row and docs/loop-state.md has the folded 3a note while staying <=140 lines; the full verify sweep (typecheck, lint, build, test, format:check, verify:copy-voice, verify:context-freshness, check:budget-guard) is green; NO Gmail call, NO Action Registry flip, NO new route.

---

## 3b
**In-app notification framework (unified feed + maintenance-ticket notifications, email hard-off, stubbed Gmail families)**

- Loop-executable: true

**Objective:** Ship an app-plane in-app notification framework that unifies the app's per-user notifications into one feed surfaced by the existing NotificationMenu. Add PII-free maintenance-lifecycle notifications written inside the existing ticket transactions, a self-scoped per-user in-app preferences record (email hard-off; KB_APPROVAL_NOTIFICATIONS_ENABLED stays false), and stub the two Gmail-dependent notification families (RentVine replies, Owner replies) as available:false with "Waiting on Gmail access". No system-of-record write, no send, no Action Registry flip.

**In scope:**
- Client-safe notification family catalog (lib/notifications/families.ts): NOTIFICATION_FAMILY_KEYS tuple + NOTIFICATION_FAMILIES (2 available: approval_queue, maintenance_tickets; 2 stubbed available:false with unavailableReason 'Waiting on Gmail access': rentvine_replies, owner_process_replies) + UnifiedNotification / NotificationFamilyView types + buildFamilyViews(mutedFamilies).
- New server module lib/firestore/maintenance-ticket-notifications.ts: MaintenanceTicketNotificationRecord + event type, appendMaintenanceTicketNotification(transaction,db,input) (PII-free, assignee-only, never the actor), listMaintenanceTicketNotifications (self-scoped), markMaintenanceTicketNotificationRead (recipient-only).
- New server module lib/firestore/notification-preferences.ts: NotificationPreferencesRecord (doc id = uid, email_enabled:false literal), getNotificationPreferences (self, default when absent), updateNotificationPreferences (self-scoped write to doc id = actor.uid, filters mutes to available families).
- Pure builder lib/notifications/feed.ts: buildNotificationFeed({approval, maintenance, mutedFamilies, limit}) merges the two per-user lists newest-first, drops muted families, returns {notifications, families}.
- Wire appendMaintenanceTicketNotification into transitionMaintenanceTicket's transaction (status + assign ops only) in lib/firestore/maintenance-tickets.ts.
- Three read-gated routes: GET /api/notifications (unified feed + families), POST /api/notifications/mark-read (source-dispatched read flip), GET+PATCH /api/notifications/preferences (self prefs).
- schemas.ts: NotificationFamilyKeySchema (from NOTIFICATION_FAMILY_KEYS), UpdateNotificationPreferencesInputSchema, MarkNotificationReadInputSchema.
- Rewire NotificationMenu.tsx to the unified /api/notifications feed; render approval + maintenance notifications and the stubbed families with 'Waiting on Gmail access'; minimal per-available-family mute checkbox that PATCHes preferences.
- firestore.rules: two new client-read-only (own-record only) match blocks above the catch-all: maintenance_ticket_notifications, user_notification_preferences.
- Tests: new emulator rules test, unit tests for the two writers + the pure feed builder + preferences, a light route test, and a rewrite of the existing notification-menu component test to the new shape; extend maintenance-tickets.test.ts to assert notification writes fire on status/assign and NOT on create/label/note.
- Governance: add Verified F-NOTIF-FRAMEWORK to docs/facts.md and a line-neutral loop-state progress edit.

**Out of scope:**
- Any email / Gmail send or draft path for notifications (email stays gated OFF; no email channel field).
- Flipping any Action Registry entry to production_allowed:true or touching the EXECUTABLE_ALLOWLIST in scripts/seed-action-registry.ts or lib/admin/migration-readiness.ts.
- Real RentVine-reply or owner-process-reply notification runtime (those families stay stubbed until the client Gmail access model + DWD land).
- Per-ticket deep-link anchor/scroll on /maintenance (maintenance notification href is just /maintenance).
- Cross-notification digests, snooze, notification retention/GC, admin notification-health dashboards.
- Any change to the approval-queue notification writer or its existing routes (they are reused as-is).

**Files to create:**
- `lib/notifications/families.ts` — Client-safe catalog (NO firebase-admin import). Export: `const NOTIFICATION_FAMILY_KEYS = ['approval_queue','maintenance_tickets','rentvine_replies','owner_process_replies'] as const;` and `type NotificationFamilyKey = (typeof NOTIFICATION_FAMILY_KEYS)[number];`. Export `type NotificationSource = 'approval_queue' | 'maintenance_ticket';`. Export `interface NotificationFamily { key: NotificationFamilyKey; label: strin …
- `lib/firestore/maintenance-ticket-notifications.ts` — Server (firebase-admin) writer/reader for the `maintenance_ticket_notifications` collection, PII-FREE. Imports: FieldValue-free ISO strings only (mirror lib/firestore/maintenance-tickets.ts determinism); import type {Firestore, Transaction} from 'firebase-admin/firestore', {v7 as uuidv7} from 'uuid', {can} from '@/lib/auth/roles', {AuthenticatedUser} from '@/lib/auth/session', {getAdminFirestore} from '@/lib/firestor …
- `lib/firestore/notification-preferences.ts` — Server (firebase-admin) self-scoped preferences for `user_notification_preferences` (doc id = uid). Imports mirror the maintenance module; also import {NotificationFamilyKey, NOTIFICATION_FAMILIES} from '@/lib/notifications/families' and {UpdateNotificationPreferencesInputSchema} from '@/lib/firestore/schemas'. `const COLLECTION = 'user_notification_preferences'`. Export `interface NotificationPreferencesRecord { uid …
- `lib/notifications/feed.ts` — Pure, client-safe builder (server-consumed only). Imports value {NOTIFICATION_FAMILY... buildFamilyViews} + types {UnifiedNotification, NotificationFamilyKey, NotificationFamilyView} from '@/lib/notifications/families'; import type {ApprovalQueueNotificationRecord} from '@/lib/firestore/types'; import type {MaintenanceTicketNotificationRecord} from '@/lib/firestore/maintenance-ticket-notifications' (type-only, so no …
- `app/api/notifications/route.ts` — GET unified feed. requireCapability('read'); parse ?unread_only=true|false and ?limit (Number, integer 1..100 else 400 EditableLayerError, matching app/api/approval-queue/notifications/route.ts). Promise.all([getNotificationPreferences(user), listApprovalQueueNotifications(user,{recipientOnly:true, unreadOnly}), listMaintenanceTicketNotifications(user,{unreadOnly})]); return NextResponse.json(buildNotificationFeed({a …
- `app/api/notifications/mark-read/route.ts` — POST source-dispatched mark-read (single static route, no [bracket] segment). requireCapability('read'); input = parseJsonBody(request, MarkNotificationReadInputSchema); if input.source==='approval_queue' -> markApprovalQueueNotificationRead(user, input.id) else markMaintenanceTicketNotificationRead(user, input.id); return NextResponse.json({ok:true}); catch -> apiErrorResponse.
- `app/api/notifications/preferences/route.ts` — GET returns {preferences: getNotificationPreferences(user)}; PATCH input = parseJsonBody(request, UpdateNotificationPreferencesInputSchema) then {preferences: updateNotificationPreferences(user, input)}. Both requireCapability('read'); try/catch -> apiErrorResponse.
- `tests/firestore/notifications.rules.test.ts` — Emulator rules test (copy the structure of tests/firestore/maintenance-intake.rules.test.ts; distinct projectId 'pmi-kc-kb-notif-test'). beforeEach withSecurityRulesDisabled seeds: maintenance_ticket_notifications/notif-1 {id, ticket_id:'t-1', event:'assigned', recipient_uid:'editor-uid', title:'Maintenance ticket assigned', message:'A maintenance ticket was assigned to you.', ticket_status:'Open', href:'/maintenance …
- `tests/unit/maintenance-ticket-notifications.test.ts` — Unit test with an in-memory fake db (copy the fakeDb() from tests/unit/maintenance-tickets.test.ts). Directly exercise appendMaintenanceTicketNotification via a fake transaction {set}: (a) event 'assigned' with a recipient != actor writes one PII-free doc (assert fields exactly: recipient_uid, title, message, ticket_status, href='/maintenance'; assert NO summary/unit/reporter keys present); (b) recipient === actorUid …
- `tests/unit/notification-preferences.test.ts` — Unit test (fake db). getNotificationPreferences returns a default {muted_families:[], email_enabled:false} when absent; updateNotificationPreferences writes to doc id === actor.uid ONLY, keeps only available family keys (a request to mute 'rentvine_replies' is dropped; 'maintenance_tickets' is kept), and the persisted record always has email_enabled:false; a second update preserves created_at and bumps updated_at.
- `tests/unit/notification-feed.test.ts` — Pure-builder test for buildNotificationFeed: merges approval + maintenance into UnifiedNotification, sorts newest-first by created_at, maps approval href to /approval-queue?item_id=..., maps maintenance href to /maintenance, DROPS a notification whose family is muted, respects limit, and families output includes all four with muted flags and the two stubbed families carrying unavailableReason 'Waiting on Gmail access …
- `tests/unit/notifications-route.test.ts` — Light route test using setAuthResolverForTest (mirror an existing *-route.test.ts). GET /api/notifications returns {notifications, families} with families length 4 and the two stubs available:false; unauth (resolver -> null) -> 401; mark-read POST dispatches (assert it calls the right per-source writer via injected/mocked db or a spy, or asserts a 200 ok:true with a seeded record); preferences GET/PATCH round-trip re …

**Files to edit:**
- `lib/firestore/maintenance-tickets.ts` — Import appendMaintenanceTicketNotification + type MaintenanceTicketNotificationEvent from '@/lib/firestore/maintenance-ticket-notifications'. Inside transitionMaintenanceTicket's runTransaction callback, declare `let notificationEvent: MaintenanceTicketNotificationEvent | undefined;` before the switch. In case 'status': set notificationEvent = op.status==='Closed' ? 'closed' : reopening ? 'reopened' : 'status_changed'. In case 'assign': set notificationEvent = op.assigneeUid ? 'assigned' : undefined (unassign emits none). Leave 'label-add'/'label-remove'/'note' with notificationEvent undefined …
- `lib/firestore/schemas.ts` — Add `import { NOTIFICATION_FAMILY_KEYS } from '@/lib/notifications/families';` at top. Add `export const NotificationFamilyKeySchema = z.enum(NOTIFICATION_FAMILY_KEYS);`. Add `export const UpdateNotificationPreferencesInputSchema = z.object({ muted_families: z.array(NotificationFamilyKeySchema).default([]) });`. Add `export const MarkNotificationReadInputSchema = z.object({ source: z.enum(['approval_queue','maintenance_ticket']), id: requiredTextSchema });`. Add the two `export type ... = z.input<typeof ...>` lines. Note z.enum needs a readonly tuple; NOTIFICATION_FAMILY_KEYS is `as const` so …
- `components/layout/NotificationMenu.tsx` — Rewire from the approval-only endpoint to the unified feed. Replace the ApprovalQueueNotificationRecord import with `import type { UnifiedNotification, NotificationFamilyView } from '@/lib/notifications/families';`. State: notifications: UnifiedNotification[]; add families: NotificationFamilyView[]. loadNotifications fetches `/api/notifications?unread_only=true&limit=8` and reads `{ notifications, families }`. unreadCount unchanged (filter !read_at). openNotification(n): POST `/api/notifications/mark-read` with JSON body `{ source: n.source, id: n.id }` (Content-Type application/json), then na …
- `firestore.rules` — Add two match blocks immediately BEFORE the final `match /{document=**}` catch-all (after the maintenance intake blocks). Block 1: `match /maintenance_ticket_notifications/{notificationId} { allow read: if signedIn() && editorOrBetter() && (admin() || ('recipient_uid' in resource.data && resource.data.recipient_uid == request.auth.uid)); allow create, update, delete: if false; }` with a comment noting server-written via Admin SDK, self-scoped read, and in-app-only (email stays gated off). Block 2: `match /user_notification_preferences/{userId} { allow read: if signedIn() && editorOrBetter() && …
- `tests/unit/notification-menu-component.test.tsx` — Rewrite to the unified shape. Mock fetch: `/api/notifications?` -> { notifications: [approvalUnified(), maintenanceUnified()], families: [{key:'approval_queue',label:'Approvals',...,available:true,muted:false},{key:'maintenance_tickets',label:'Maintenance tickets',...,available:true,muted:false},{key:'rentvine_replies',label:'RentVine replies',...,available:false,unavailableReason:'Waiting on Gmail access',muted:false},{key:'owner_process_replies',...available:false,unavailableReason:'Waiting on Gmail access',muted:false}] }; `/api/notifications/mark-read` (POST) -> {ok:true}; `/api/notificati …
- `tests/unit/maintenance-tickets.test.ts` — Extend (do not rewrite) to assert the notification wiring. Add a test: create a ticket, assign it to a DIFFERENT uid than the actor, assert one doc lands in store.get('maintenance_ticket_notifications') with event 'assigned' and recipient = the assignee; a subsequent status transition by the actor writes a 'status_changed' notification to that assignee; a status transition on an UNASSIGNED ticket writes none; create/label/note write none. Existing assertions are unaffected because baseInput has no assignee (no notifications on the current transitions).
- `docs/facts.md` — Append a new Verified row to the Fact Ledger table immediately after the F-MAINT-ASSIGNEE row (line 124), separated by a blank line, before the '## Supersede Log' heading. See governanceChanges for the exact row. All cited evidence paths exist on disk after the build and contain no [bracket] dynamic-route segment (cite the rules test + feed test + lib modules, not app/api/**/route.ts).
- `docs/loop-state.md` — Line-neutral edit ONLY (the file is at the 140-line cap; do NOT add or remove any newline). On the existing physical line ending '...assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.' replace the tail so it reads: '...assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); 3b the in-app notification framework (unified feed + maintenance-ticket notifications, in-app-only, email hard-off, stubbed Gmail-dependent families) (`F-NOTIF-FRAMEWORK`). Remaining: A4, unit type-ahead, queue rebuild.' Keep it a single physical …

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
ADD one Fact Ledger row (after F-MAINT-ASSIGNEE, line 124). id: F-NOTIF-FRAMEWORK | claim: 'An in-app notification framework unifies the app''s notifications (console overhaul Slice 3b): a client-safe family catalog (`NOTIFICATION_FAMILIES`) with two AVAILABLE in-app families (Approvals, Maintenance tickets) and two STUBBED families (RentVine replies, Owner replies) rendered available:false with \'Waiting on Gmail access\'. Maintenance-lifecycle notifications are written PII-FREE (event + ticket status only; no summary/unit/reporter) INSIDE the existing ticket transactions to a new `maintenance_ticket_notifications` collection, for the ticket''s assignee only and never the actor who made the change. A pure `buildNotificationFeed` merges the per-user approval-queue + maintenance notifications newest-first, drops muted families, and returns the family views; read-gated `/api/notifications` serves it, `/api/notifications/mark-read` dispatches the per-source read flip. Per-user in-app preferences live in `user_notification_preferences` (self-scoped, doc id = uid) via `notification-preferences.ts`; the framework is IN-APP ONLY and email stays hard-off (no email path here; KB_APPROVAL_NOTIFICATIONS_ENABLED stays false). Both new collections are server-written via the Admin SDK boundary and client-read-only (own records only) in `firestore.rules`. The `NotificationMenu` reads the unified feed and shows the stubbed families. App-plane only: no SoR write, no send, no Action Registry flip.' | status: Verified | evidence: `lib/notifications/families.ts`; `lib/notifications/feed.ts`; `lib/firestore/maintenance-ticket-notifications.ts`; `lib/firestore/notification-preferences.ts`; `lib/firestore/maintenance-tickets.ts`; `components/layout/NotificationMenu.tsx`; `firestore.rules`; `tests/firestore/notifications.rules.test.ts`; `tests/unit/notification-feed.test.ts`; `tests/unit/maintenance-ticket-notifications.test.ts` | verified-on: 2026-07-09 | supersedes: — | review-by: 2026-12-31. PRESERVE every existing row (esp. F-MAINT-TICKETS, F-MAINT-ASSIGNEE, F-GMAIL-RENEWAL-DRAFT-LIVE) and the Supersede Log / Open Questions sections verbatim; this is an additive row only, no supersede.
```

_[docs/loop-state.md]_

```
EDIT the single physical line 53 tail from '(`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.' to '(`F-MAINT-ASSIGNEE`); 3b the in-app notification framework (unified feed + maintenance-ticket notifications, in-app-only, email hard-off, stubbed Gmail-dependent families) (`F-NOTIF-FRAMEWORK`). Remaining: A4, unit type-ahead, queue rebuild.' MUST stay one physical line (no new newline) so the file stays <= 140 lines. PRESERVE the 'Last updated: 2026-07-09' line and every other line unchanged.
```

_[scripts/seed-action-registry.ts + lib/admin/migration-readiness.ts]_

```
NO CHANGE. Do NOT touch the EXECUTABLE_ALLOWLIST or flip any Action Registry entry; gmail.renewal_notice.draft_create stays the ONLY executable key. This slice adds no registry action (in-app notifications are app-plane, not an external action).
```

**Guardrails:**
- No Action Registry entry is flipped: EXECUTABLE_ALLOWLIST in scripts/seed-action-registry.ts + lib/admin/migration-readiness.ts stays byte-identical; gmail.renewal_notice.draft_create remains the only production_allowed:true key.
- Email stays OFF: the framework has NO email channel, no send, no Gmail call; KB_APPROVAL_NOTIFICATIONS_ENABLED stays false and NotificationPreferencesRecord.email_enabled is the literal-false type (never settable true).
- Maintenance notification copy is PII-FREE: only event label + ticket status + ticket id (uuid) + '/maintenance' href; never summary, description, unit label/address, reporter name/contact, or assignee email/uid in title or message.
- No self-notify and no unassigned-notify: appendMaintenanceTicketNotification is a no-op when recipient is empty OR recipient === actorUid.
- Notifications are self-scoped: list/mark-read enforce recipient_uid === actor.uid; preferences write ALWAYS targets doc id === actor.uid; firestore.rules make both new collections client-read-only to the owner (or Admin) and deny all client writes.
- New app/api routes are authed via requireCapability('read') so the route-auth-boundary invariant passes with no allow-list edit; mark-read is a single static route (no [bracket] segment).
- Client-safety: NotificationMenu imports only client-safe types from lib/notifications/families (import type); lib/notifications/feed.ts imports record types with `import type` only; no firebase-admin value-import reaches a client bundle.
- Copy-voice: no 'control plane' / 'PMI handles' / 'source of truth' jargon and no em dashes in any new app/components/lib string.
- docs/loop-state.md stays <= 140 lines (edit within existing physical lines only); docs/facts.md evidence cites only existing, non-[bracket] paths.
- The maintenance notification write joins the SAME atomic runTransaction as the ticket + activity writes (never a separate best-effort write), preserving the append-only-audit atomicity guarantee.
- No system-of-record write and no send anywhere; the RentVine work-order create and Gmail runtime stay gated; the two Gmail-dependent families stay available:false.

**Verify:** `npm run verify ; npm run verify:copy-voice ; npm run test:firestore`

**Done when:** All gates green: `npm run verify` (format:check, lint, typecheck, `vitest run` unit suite incl. the new feed/preferences/maintenance-notification/route + rewritten menu tests, router-boundary, falsification, context-freshness incl. the new F-NOTIF-FRAMEWORK row and the <=140-line loop-state, redaction, Turbopack build), `npm run verify:copy-voice`, and `npm run test:firestore` (the new tests/firestore/notifications.rules.test.ts passes: own-record reads allowed, other-user reads denied, all client writes denied for both new collections). Behaviorally: transitioning a maintenance ticket's status or assigning it to another user writes exactly one PII-free doc to maintenance_ticket_notifications for the assignee (never the acting user); the NotificationMenu loads a unified feed showing both approval-queue and maintenance notifications, marks one read via /api/notifications/mark-read on open and navigates to its href, and renders the RentVine-replies and Owner-replies families as 'Waiting on Gmail access'; a per-user mute toggle round-trips through /api/notifications/preferences and the muted family drops from the feed; email is never sent and KB_APPROVAL_NOTIFICATIONS_ENABLED / the EXECUTABLE_ALLOWLIST are unchanged.", "dependsOn": []}

---

## A4
**Console act-in-place: inline Approve for queue_item rows (GOVERNANCE)**

- Loop-executable: true

**Objective:** Let the Console action deck approve a queue item IN PLACE — the single app-plane decision — instead of only deep-linking. Add an optional minimal `itemId` to `NeedsDecisionRow` on queue_item rows only, render a canApprove-gated inline Approve on those deck rows that calls the EXISTING authed PATCH /api/approval-queue/:itemId with {action:"approve"} (records status->Approved; no send, no system-of-record write, no external action). Supersede F-CONSOLE-APP-STATE with F-CONSOLE-ACT-IN-PLACE, scope F-PRECUST-WAVE1, and relax exactly three pins while keeping the SECRET no-leak asserts.

**In scope:**
- Add optional `itemId?: string` to NeedsDecisionRow (lib/approval/needs-decision-inbox.ts), set to item.id on queue_item rows ONLY
- New client component components/console/ConsoleApproveButton.tsx that PATCHes the existing /api/approval-queue/:itemId with {action:'approve'} and shows Approve/Approving/Approved + server error inline
- ConsoleActionDeck: add itemId? to ConsoleDeckRow, add optional canApprove prop (default false), render ConsoleApproveButton only when canApprove && row.itemId
- ConsoleView: compute canApprove = can(user.role,'approve'), map itemId into the approvals card rows, pass canApprove to the deck
- Relax the ROW_KEYS pin (kind-aware), the console-view /My approvals/ 'no command button' pin (additive), and the console-action-deck no-approve posture
- Supersede F-CONSOLE-APP-STATE -> F-CONSOLE-ACT-IN-PLACE + supersede-log row; scope F-PRECUST-WAVE1; add net-zero-line loop-state A4 progress line

**Out of scope:**
- Any external action: no send, no Sheet/SoR write, no bulk 'execute' wiring (stays blocked)
- Approve affordance on the value-free triage surfaces: NeedsDecisionInboxPanel (Approval-Queue 'Needs your decision' tab), renewal review board, write-back queue, Spaces card all stay read-only
- return/snooze/disable/assign transitions from the Console (approve only)
- Passing confirm_high_risk from the Console (High-risk stays server-refused, forcing the full surface)
- New app/api routes (reuse the existing authed PATCH)
- Flipping any Action Registry entry (all stay production_allowed:false except the already-flipped gmail.renewal_notice.draft_create)
- router.refresh / client refetch of the deck count (accepted: a reload reflects the new count)

**Files to create:**
- `components/console/ConsoleApproveButton.tsx` — 'use client' in-place Approve for a Console deck queue_item row. On click: fetch PATCH `/api/approval-queue/${encodeURIComponent(itemId)}` with body {action:'approve'}, headers {'Content-Type':'application/json'}. On !response.ok read {error} (apiErrorResponse returns {error}) and show it inline; on success show 'Approved.' via a done state. Props: Readonly<{ itemId: string }>. NO useRouter (avoids jsdom router-conte …

**Files to edit:**
- `lib/approval/needs-decision-inbox.ts` — 1) In `interface NeedsDecisionRow`, after `href: string;` add optional `itemId?: string;` with a comment: set on `queue_item` rows ONLY (the queue item id), never a proposed value/reason/decider/assignee. 2) In step 3 (the queue-item `consider(queueItemTargetKey(item), {...})` block), add `itemId: item.id,` right after the `key:` line. No other row kind gets itemId.
- `components/console/ConsoleActionDeck.tsx` — 1) Add `import { ConsoleApproveButton } from '@/components/console/ConsoleApproveButton';`. 2) Add `itemId?: string;` to `interface ConsoleDeckRow` (comment: approval queue_item rows only; enables in-place Approve). 3) Change the component signature to `({ cards, canApprove = false }: Readonly<{ cards: readonly ConsoleDeckCard[]; canApprove?: boolean }>)`. 4) Inside the row `<li>`, after the detail span, render `{canApprove && row.itemId ? <ConsoleApproveButton itemId={row.itemId} /> : null}`. 5) Extend the file docstring to note the queue_item in-place approve (app-plane, no external action); …
- `components/console/ConsoleView.tsx` — 1) After `const canStartSimulation = can(user.role, 'edit');` add `const canApprove = can(user.role, 'approve');` (`can` already imported). 2) In the `approvals` card's `rows: inbox.rows.map((row) => ({ label, detail, href }))`, add `itemId: row.itemId,` (this map is uniquely anchored by its emptyLabel 'Nothing needs your decision right now.'). 3) Change `<ConsoleActionDeck cards={cards} />` to `<ConsoleActionDeck canApprove={canApprove} cards={cards} />`. Do NOT add itemId to the connections/coverage card maps.
- `tests/unit/needs-decision-inbox.test.ts` — Relax the ROW_KEYS pin (see governanceChanges) and KEEP the SECRET no-leak asserts (the `expect(serialized).not.toContain(...)` block) unchanged — they must still pass because itemId equals item.id ('q1'), never a secret.
- `tests/unit/console-view.test.tsx` — Add a queue_item row (with itemId) to the gatherNeedsDecisionInbox mock and augment the no-click-to-reveal test (see governanceChanges). adminUser is Admin so canApprove is true and the Approve button renders.
- `tests/unit/console-action-deck.test.tsx` — Add two tests exercising canApprove + itemId (see governanceChanges). Existing renders `<ConsoleActionDeck cards={cards} />` need NO change (canApprove defaults to false; existing cards carry no itemId).
- `docs/facts.md` — Supersede F-CONSOLE-APP-STATE -> F-CONSOLE-ACT-IN-PLACE (replace the row in place), add the Supersede Log row, and scope F-PRECUST-WAVE1's trailing clause (all exact strings in governanceChanges).
- `docs/loop-state.md` — Net-zero-line edit to the 'Deferred cycle IN PROGRESS (2026-07-09)' bullet marking A4 done and dropping A4 from Remaining (exact string in governanceChanges). Must add NO physical newline so the file stays <=140 lines; 'Last updated: 2026-07-09' already current.

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
FACT SUPERSEDE (replace the F-CONSOLE-APP-STATE row at line 72 in place with the new row; supersedes column stays '—' because the old id is deleted and pointing at a deleted id trips the gate's 'supersedes unknown id' check — the link is recorded in the Supersede Log, matching the F-OPS-CONSOLE-IA -> F-IA-CONSOLE-HOME precedent). NEW ROW: `| F-CONSOLE-ACT-IN-PLACE | The Console acts in place for exactly ONE app-plane decision (console overhaul A4, supersedes F-CONSOLE-APP-STATE). Everything F-CONSOLE-APP-STATE established still holds: a read-only, non-fatal app-state provider answers approvals / connection-setup gaps / Space process+connection coverage as advisory, deep-linked state; an always-visible, server-rendered action deck surfaces the three areas ("Needs your decision", "Connections to set up", "Space coverage") as clickable cards with each count + the top deep-linked rows (replacing the earlier click-to-reveal buttons and the client refetch of the read-gated /api/ask/app-state route, which still backs API callers), beside a read-only process strip; and Console voice input reuses the prod-fenced STT seam via /api/ask/transcribe (edit-gated). WHAT CHANGED IN A4: the merged needs-decision inbox row (NeedsDecisionRow) carries an OPTIONAL minimal itemId on queue_item rows ONLY (the queue item id, never a proposed value, reason, decider, or assignee), and the deck renders an in-place Approve button for those rows (Approver/Admin only, canApprove-gated) that calls the EXISTING already-authed approval-queue item PATCH (PATCH /api/approval-queue/:itemId) with {action:"approve"}. That transition is app-plane ONLY: it records the approval decision (status to Approved) and NEVER executes an external action (no send, no system-of-record write); High-risk items are refused server-side (they still need explicit confirmation on the full surface), the single "execute" bulk path stays blocked, and every other deck row (writeback / renewal_flag / connections / coverage) stays a deep link with NO approve affordance. The value-free Approval-Queue triage surfaces (unified inbox, renewal review board, write-back queue) and the Spaces card keep their read-only / act-on-run-page posture (F-PRECUST-WAVE1, scoped). Hard gates unchanged (production_allowed:false throughout, no send, no SoR write). | Verified | `lib/approval/needs-decision-inbox.ts`; `components/console/ConsoleActionDeck.tsx`; `components/console/ConsoleApproveButton.tsx`; `components/console/ConsoleView.tsx`; `tests/unit/needs-decision-inbox.test.ts`; `tests/unit/console-view.test.tsx`; `tests/unit/console-action-deck.test.tsx`; `tests/unit/approval-queue-api-routes.test.ts` | 2026-07-09 | — | 2026-12-31 |`. PRESERVE: all app-state-provider / action-deck / process-strip / STT content carried forward verbatim; cite the covering test tests/unit/approval-queue-api-routes.test.ts for the reused route (NOT app/api/approval-queue/[itemId]/route.ts — the freshness gate mis-parses [bracket] evidence paths).
```

_[docs/facts.md]_

```
ADD a Supersede Log row (under '## Supersede Log', append after the SPACETEETH-HARD-GATES row at line 148): `| F-CONSOLE-APP-STATE | F-CONSOLE-ACT-IN-PLACE | 2026-07-09 | `docs/facts.md` | NEVER executes: approvals/sends/writes stay in their own gated surfaces | The Console now acts in place for ONE app-plane decision — approving a queue item via the existing PATCH — so the blanket never-executes framing is retired. No external action is reachable (approve records a decision only; execute stays blocked); every other surface stays read-only/deep-link (A4). |`. The marker `NEVER executes: approvals/sends/writes stay in their own gated surfaces` is a verbatim substring of the deleted F-CONSOLE-APP-STATE claim; it is ABSENT from the ACTIVE_GOVERNANCE set (AGENTS.md, docs/north-star.md, docs/plan.md, docs/implement.md, docs/autonomous-agent-runner.md, docs/ai-execution-workflow.md, docs/products/README.md) — grep-verify absence before commit. The new F-CONSOLE-ACT-IN-PLACE claim deliberately does NOT contain that exact phrase.
```

_[docs/facts.md]_

```
SCOPE F-PRECUST-WAVE1 (line 31): replace the trailing clause `No approve affordance on value-free surfaces; no SoR write; hard gates unchanged.` with `No approve affordance on the value-free Approval-Queue triage surfaces (unified inbox, renewal review board, write-back queue) or the Spaces card; the Console deck's queue_item rows gain an in-place approve in A4 (see F-CONSOLE-ACT-IN-PLACE); no SoR write; hard gates unchanged.` PRESERVE everything else in the F-PRECUST-WAVE1 row (all B/C/D detail, status Verified, evidence, verified-on 2026-07-02, review-by). This is an in-place scoping clarification, not a supersede — F-PRECUST-WAVE1 keeps its id and date.
```

_[tests/unit/needs-decision-inbox.test.ts]_

```
RELAX THE ROW_KEYS PIN. After the line `const ROW_KEYS = ["detail", "href", "key", "kind", "label", "severity"];` add `const QUEUE_ROW_KEYS = ["detail", "href", "itemId", "key", "kind", "label", "severity"];`. Then replace the row-shape loop:
CURRENT: `for (const row of inbox.rows) {\n  expect(Object.keys(row).sort()).toEqual(ROW_KEYS);\n}`
NEW: `for (const row of inbox.rows) {\n  expect(Object.keys(row).sort()).toEqual(row.kind === "queue_item" ? QUEUE_ROW_KEYS : ROW_KEYS);\n  if (row.kind === "queue_item") {\n    expect(row.itemId).toBe(row.key.slice("queue_item:".length));\n  }\n}`. PRESERVE UNCHANGED the SECRET no-leak asserts immediately above (expect(serialized).not.toContain(SECRET / SECRET_REASON / SECRET_DECIDER / "proposedValue" / "candidates" / "assignee")) — they still pass because itemId equals item.id ('q1'), never a secret.
```

_[tests/unit/console-view.test.tsx]_

```
RELAX THE 'NO COMMAND BUTTON' PIN (additive; KEEP the /My approvals/ absence). 1) In the gatherNeedsDecisionInbox mock, add a SECOND row after the renewal_flag row: `{ kind: "queue_item", key: "queue_item:q1", itemId: "q1", label: "Approve renewal package", detail: "Run 1", severity: "Medium", href: "/approval-queue?item_id=q1" }` and set counts to `{ total: 2, renewalFlags: 1, writebacksAwaiting: 0, queueItems: 1 }`. 2) In the 'surfaces the needs-your-decision area...' test, KEEP `expect(screen.queryByRole("button", { name: /My approvals/ })).toBeNull();` and ADD after it: `expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();` and the HARD-STOP `expect(screen.queryByRole("button", { name: /send|execute|write/i })).toBeNull();`. Existing 'Current rent' link assertion still holds.
```

_[tests/unit/console-action-deck.test.tsx]_

```
RELAX THE CONSOLE-ACTION-DECK NO-APPROVE POSTURE (additive). Add inside the `describe("ConsoleActionDeck")` block, after the existing two its: (a) `it("renders an in-place Approve ONLY for a queue_item row (itemId) when the user can approve", () => { ... render(<ConsoleActionDeck canApprove cards={withQueueItem} />); expect(screen.getAllByRole("button", { name: "Approve" })).toHaveLength(1); expect(screen.getByRole("link", { name: "Current rent" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /send|execute|write/i })).toBeNull(); })` where withQueueItem is one approvals card with rows `[{label:"Approve renewal package",detail:"Run 1",href:"/approval-queue?item_id=q1",itemId:"q1"},{label:"Current rent",detail:"Run 2",href:"/lease-renewal/runs/run-2"}]`; (b) `it("shows NO Approve control when the user cannot approve, even for a queue_item row", () => { render(<ConsoleActionDeck canApprove={false} cards={withQueueItemSingle} />); expect(screen.queryByRole("button", { name: "Approve" })).toBeNull(); })`. PRESERVE the existing deep-link, See-all-5, and empty-label ('Every connector is set up.') assertions unchanged.
```

_[docs/loop-state.md]_

```
NET-ZERO-LINE progress edit (add NO newline; file is at the 140-line cap). On the 'Deferred cycle IN PROGRESS (2026-07-09)' bullet, replace `assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.` with `assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); A4 the Console in-place approve of a queue item via the existing PATCH (`F-CONSOLE-ACT-IN-PLACE`, supersedes `F-CONSOLE-APP-STATE`). Remaining: unit type-ahead, notifications, queue rebuild.` Keep it a single physical line.
```

**Guardrails:**
- HARD STOP: never a button/control that executes an EXTERNAL action. The only inline control is Approve, which records an app-plane queue-item decision (status->Approved) via the existing PATCH — verified app-plane: planTransition('approve') only sets status/closed_at + appends activity, and syncProcessDefinitionQueueItemTransition only edits a Firestore process-definition status (no send, no SoR write). Do NOT wire return/snooze/disable/assign/execute; the bulk 'execute' path stays blocked.
- itemId is set on queue_item rows ONLY and equals item.id — NEVER a proposedValue, reason, decider, or assignee. Add no other field to NeedsDecisionRow.
- KEEP the SECRET no-leak asserts in tests/unit/needs-decision-inbox.test.ts unchanged; they must still pass with itemId present.
- NeedsDecisionInboxPanel (Approval-Queue 'Needs your decision' tab), the renewal review board, the write-back queue, and the Spaces card stay read-only with NO approve affordance — they ignore itemId; only the Console deck consumes it.
- Approve is canApprove-gated (Approver/Admin) client-side AND enforced server-side (assertCan('approve') + assertCanApprove per-item + High-risk confirmation). Do NOT send confirm_high_risk from the Console — High-risk must stay refused so the operator uses the full surface.
- Every Action Registry entry stays production_allowed:false except the already-flipped gmail.renewal_notice.draft_create; do NOT flip any other; approving a queue item is not an Action Registry action and adds no EXECUTABLE_ALLOWLIST entry.
- No new app/api route: reuse the existing authed PATCH so tests/unit/route-auth-boundary.test.ts is untouched.
- Client boundary: ConsoleApproveButton value-imports nothing from firebase-admin and takes only itemId:string (no server-type value-import).
- copy-voice: the new component's non-comment copy has no 'control plane'/'PMI handles'/'source of truth' and no em dashes (comments are stripped by the scanner, but keep copy clean).
- docs/facts.md evidence must cite existing, non-[bracket] paths — cite tests/unit/approval-queue-api-routes.test.ts for the reused PATCH, not app/api/approval-queue/[itemId]/route.ts.
- docs/loop-state.md must stay <=140 lines: make the A4 line a net-zero-line in-place edit.
- Supersede marker must not read as active guidance in the ACTIVE_GOVERNANCE set — grep-verify the marker string is absent there before commit; new fact's supersedes column is '—' (old id is deleted).

**Verify:** `npm run test -- needs-decision-inbox console-view console-action-deck ; npm run typecheck ; npm run lint ; npm run verify:copy-voice ; npm run verify:context-freshness ; npm test ; npm run build`

**Done when:** All seven verify commands are green. The Console deck renders an inline Approve ONLY on queue_item rows and ONLY for Approver/Admin (canApprove); clicking it PATCHes the existing /api/approval-queue/:itemId with {action:'approve'} (status->Approved, app-plane, no external action) and shows Approved/error inline while the deep link remains. The three pins are relaxed exactly as specified with the SECRET no-leak asserts intact; F-CONSOLE-APP-STATE is superseded by F-CONSOLE-ACT-IN-PLACE (row replaced in place, supersedes '—') with the Supersede Log row + marker; F-PRECUST-WAVE1 is scoped; loop-state carries the A4 line and stays <=140 lines. verify:context-freshness passes (evidence paths exist, no [bracket] evidence, marker orphan-free, loop-state cap + date OK).

---

## 4a
**Approval-Queue presentation rebuild: unified urgent-first list + "Other views" disclosure (GOVERNANCE)**

- Loop-executable: true
- Depends on: F-PRECUST-CYCLE (B1 unified 'Needs your decision' inbox + buildNeedsDecisionInbox — already shipped); F-RENEWAL-REVIEW-SUBTAB (RenewalReviewPanel/buildRenewalReviewBoard — shipped); F-WRITEBACK-QUEUE (WritebackQueuePanel/buildWritebackApprovalQueue — shipped)

**Objective:** Collapse the Approval Queue's four peer tabs into one always-visible, value-free "Needs your decision" list plus an "Other views" disclosure that holds All items / Renewal reviews / Write-back proposals. Presentation-only: the NeedsDecisionRow data shape (ROW_KEYS pin) is unchanged, existing All-items transitions are reused verbatim, approving/resolving stays on the run page, and every production_allowed:false holds. Governance is recorded (new Verified F-APPROVAL-QUEUE-UNIFIED + a Supersede-Log marker retiring the OQ-UI-1 four-tab layout; F-RENEWAL-REVIEW-SUBTAB and F-WRITEBACK-QUEUE tab wording reconciled).

**In scope:**
- Rewrite the render tree of components/approval/ApprovalQueue.tsx: NeedsDecisionInboxPanel always at top; a <details className="panel ui-collapse"> "Other views" disclosure containing the 3 secondary views, whose inner tablist+panel render only when the disclosure is open.
- Drop the "needs" QueueView; default view="all"; add otherViewsOpen state initialized from Boolean(initialSelectedItemId) so a ?item_id= deep-link opens the disclosure straight to All items.
- Plain-language relabel of the secondary tabs: "Renewals"->"Renewal reviews", "Write-back queue"->"Write-back proposals"; keep "All items".
- Reuse renderAllItemsView() (filter bar, bulk panel, list+detail, approve/return/assign/snooze/bulk transitions) UNCHANGED inside the disclosure.
- Update the 3 component tests (approval-queue-component, renewal-review-panel, writeback-approval-queue-panel) to the new structure, extending not weakening the value-free/no-bulk-on-landing assertions.
- Governance: add Verified F-APPROVAL-QUEUE-UNIFIED, add a Supersede-Log row (OQ-UI-1-TAB-LAYOUT -> F-APPROVAL-QUEUE-UNIFIED), reconcile the tab-layout wording in F-RENEWAL-REVIEW-SUBTAB + F-WRITEBACK-QUEUE, amend the OQ-UI-1 answer in docs/products/v1-process-qa.md, add the loop-state progress line by editing line 53 in place.

**Out of scope:**
- Any change to lib/approval/needs-decision-inbox.ts, renewal-review.ts, writeback-approval-queue.ts or the NeedsDecisionRow shape (the ROW_KEYS pin ['detail','href','key','kind','label','severity'] in tests/unit/needs-decision-inbox.test.ts stays UNCHANGED).
- Adding any approve/return/resolve affordance to the value-free surfaces (inbox / renewal review / write-back queue) — approving stays on the run page.
- Flipping any Action Registry production_allowed (the EXECUTABLE_ALLOWLIST guard is untouched); any system-of-record/Sheet write or send.
- New app/api routes (no route-auth-boundary change needed).
- New CSS (reuse existing .approval-queue-shell, .panel, .ui-collapse, .ui-tablist, .ui-tab, .ui-card-title, .muted).
- Changing app/approval-queue/page.tsx behavior (it passes the same props; unchanged).

**Files to create:**


**Files to edit:**
- `components/approval/ApprovalQueue.tsx` — EDIT 1 (line 40): change `type QueueView = "needs" | "all" | "renewals" | "writeback";` to `type QueueView = "all" | "renewals" | "writeback";`.

EDIT 2 (lines 59-62): replace the 3-line comment + `const [view, setView] = useState<QueueView>(initialSelectedItemId ? "all" : "needs");` with:
```
  // The unified, value-free "Needs your decision" list is always the landing surface (Slice 4a). The
  // other three views live behind an "Other views" disclosure; `view` selects which one renders once it
  // is open. A notification deep-link (`?item_id=`) opens the disclosure straight to "All items" …
- `tests/unit/approval-queue-component.test.tsx` — Test 1 ("lands on the value-free 'Needs your decision' inbox by default"): replace the `getByRole("tab", { name: /Needs your decision/ })` aria-selected assertion (lines 32-36) with `expect(screen.getByText("Other views")).toBeInTheDocument();` (the inbox is no longer a tab; it is the always-visible list, already proven by the deep-link row + no-bulk assertions on lines 38-43, which STAY). The no-bulk assertions still pass because the disclosure is closed on landing so renderAllItemsView is not mounted.

Test 3 ("keeps the inbox stable when the All items list is filtered"): (a) replace BOTH `g …
- `tests/unit/renewal-review-panel.test.tsx` — Add `userEvent` import: change line 4 area to also import it: `import userEvent from "@testing-library/user-event";` (keep the existing `fireEvent` import or drop it if now unused). In the `describe("ApprovalQueue renewal sub-tab")` block:

Test at line 154 -> rewrite as async: assert the inbox deep-link row on landing, then open "Other views" and assert the renamed tab. Replace the body with:
```
    const user = userEvent.setup();
    render(<ApprovalQueue {...baseProps} />);
    // The open renewal flag surfaces on the always-visible inbox as a value-free deep-link row.
    expect(screen.ge …
- `tests/unit/writeback-approval-queue-panel.test.tsx` — Add `import userEvent from "@testing-library/user-event";`. In `describe("ApprovalQueue write-back queue tab")`:

Test line 121 ("offers a Write-back queue tab...") -> rewrite async, rename label:
```
    const user = userEvent.setup();
    render(<ApprovalQueue {...baseProps} />);
    await user.click(screen.getByText("Other views"));
    const tab = screen.getByRole("tab", { name: "Write-back proposals (2)" });
    expect(tab).toHaveAttribute("aria-selected", "false");
    expect(
      screen.queryByRole("heading", { name: /Awaiting approval \(2\)/ }),
    ).not.toBeInTheDocument();
```
(af …
- `docs/facts.md` — See governanceChanges for exact text. (1) Add the new Verified fact F-APPROVAL-QUEUE-UNIFIED as a new one-row table line (with a blank line before/after, matching the F-*-since-line-42 style) immediately BEFORE the `## Supersede Log` heading (after the F-MAINT-ASSIGNEE row). (2) Add the Supersede-Log row after the SPACETEETH-HARD-GATES row, before `## Open Questions`. (3) Reconcile the tab-layout clause inside the F-RENEWAL-REVIEW-SUBTAB and F-WRITEBACK-QUEUE claims (exact substrings, verified unique).
- `docs/products/v1-process-qa.md` — Amend the OQ-UI-1 answer (line 57) — replace the tab-layout clause; exact old/new in governanceChanges. This deletes the old 'dedicated renewal SUB-TAB ... mirrors the Spaces⊇Processes sub-tab pattern' active wording per the supersede rule (delete-from-active-doc).
- `docs/loop-state.md` — Edit line 53 IN PLACE (no net new line — the file is already at the 140-line cap the freshness gate enforces). Exact old/new in governanceChanges. Do NOT change the 'Last updated: 2026-07-09' line (still current vs docs/status.md).

**Governance changes (apply EXACTLY):**

_[docs/facts.md]_

```
ADD new Fact-Ledger row (insert immediately before the `## Supersede Log` line, surrounded by blank lines like the other post-line-42 facts):

| F-APPROVAL-QUEUE-UNIFIED | The Approval Queue collapses its four peer tabs into ONE presentation (Slice 4a, evolves OQ-UI-1 per F-PRECUST-CYCLE): the value-free, attention-ordered "Needs your decision" list is the always-visible landing surface (no longer a tab), and All items + Renewal reviews + Write-back proposals move behind an "Other views" disclosure whose inner tablist + panels render only once it is opened. Plain-language relabel ("Renewals"->"Renewal reviews", "Write-back queue"->"Write-back proposals"); one primary deep-link per inbox row; the existing All-items transitions (approve/return/assign/snooze/bulk) are reused UNCHANGED and a notification deep-link (?item_id=) opens the disclosure straight to All items with the item selected. Presentation-only: no data-shape change (the NeedsDecisionRow ROW_KEYS pin is unchanged), no approve affordance on the value-free surfaces (approving/resolving stays on the run page, OQ-UI-1/Q-PREC-1 posture), no new route, no system-of-record write, no send, every production_allowed:false. The value-free-triage and act-on-the-run-page invariants of F-RENEWAL-REVIEW-SUBTAB and F-WRITEBACK-QUEUE carry over and their sentinel tests are extended, never weakened. | Verified | `components/approval/ApprovalQueue.tsx`; `components/approval/NeedsDecisionInboxPanel.tsx`; `app/approval-queue/page.tsx`; `tests/unit/approval-queue-component.test.tsx`; `tests/unit/needs-decision-inbox.test.ts` | 2026-07-09 | — | 2026-12-31 |

PRESERVE: exactly 7 pipe-delimited cells, no raw '|' inside cells; evidence paths all exist and contain NO [bracket] dynamic-route segment (verified). Do not alter any other ledger row's columns.
```

_[docs/facts.md]_

```
ADD new Supersede-Log row (insert after the SPACETEETH-HARD-GATES row, before `## Open Questions`):

| OQ-UI-1-TAB-LAYOUT | F-APPROVAL-QUEUE-UNIFIED | 2026-07-09 | `docs/products/v1-process-qa.md` | renewal review and write-back queue as peer tabs beside All items | Slice 4a collapses the Approval Queue's four peer tabs into one urgent-first value-free "Needs your decision" list plus an "Other views" disclosure (owner-directed 2026-07-02, F-PRECUST-CYCLE). Only the tab arrangement is retired; the value-free-triage, resolve/approve-on-the-run-page, and ROW_KEYS invariants of F-RENEWAL-REVIEW-SUBTAB / F-WRITEBACK-QUEUE are preserved. |

PRESERVE / CONFIRMED: superseded-id (OQ-UI-1-TAB-LAYOUT) is a synthetic clause id (not a ledger id — matches the SPACETEETH-HARD-GATES precedent); replaced-by-id (F-APPROVAL-QUEUE-UNIFIED) resolves to the new ledger row; where-old-text-lived path exists; the marker 'renewal review and write-back queue as peer tabs beside All items' was grep-verified ABSENT from all 7 ACTIVE_GOVERNANCE files (AGENTS.md, docs/north-star.md, docs/plan.md, docs/implement.md, docs/autonomous-agent-runner.md, docs/ai-execution-workflow.md, docs/products/README.md), so the orphan-marker freshness check passes. 6 pipe-delimited cells; no raw '|' inside cells.
```

_[docs/facts.md]_

```
RECONCILE F-RENEWAL-REVIEW-SUBTAB claim (exact substring, verified unique = 1 occurrence). Replace:
  a "Renewals" tab beside "All items" that groups the deterministic renewal reconciliation flags by run
With:
  a value-free renewal review view (originally a "Renewals" peer tab; moved under the unified queue's "Other views" disclosure by F-APPROVAL-QUEUE-UNIFIED) that groups the deterministic renewal reconciliation flags by run
PRESERVE: the entire rest of the F-RENEWAL-REVIEW-SUBTAB row verbatim (its value-free invariant, resolve-on-run-page/Q-PREC-1 posture, OQ-APPR-1 admin-tier approve, evidence, dates, supersedes='—'). Do not add a '|'.
```

_[docs/facts.md]_

```
RECONCILE F-WRITEBACK-QUEUE claim (exact substring, verified unique = 1 occurrence). Replace:
  a third tab beside "All items" and "Renewals" that consolidates every QUEUED write-back proposal ACROSS ALL RUNS
With:
  a cross-run view (originally a third peer tab; moved under the unified queue's "Other views" disclosure by F-APPROVAL-QUEUE-UNIFIED) that consolidates every QUEUED write-back proposal ACROSS ALL RUNS
PRESERVE: the entire rest of the F-WRITEBACK-QUEUE row verbatim (value-free row-key pin, no-approve-affordance/act-on-run-page posture, evidence, dates). Do not add a '|'.
```

_[docs/products/v1-process-qa.md]_

```
AMEND the OQ-UI-1 answer (line 57, exact substring verified unique). Replace:
  a dedicated renewal SUB-TAB _inside_ the Approval Queue — same space + the built approve/return/assign machinery, but its own logically-organized view for Dan (mirrors the Spaces⊇Processes sub-tab pattern). Not a standalone run page, and not un-organized into the general queue.
With:
  renewal review lives _inside_ the Approval Queue (the built approve/return/assign machinery, its own logically-organized view for Dan, NOT a standalone run page and NOT un-organized into the general queue). Presentation evolved 2026-07-09 (F-APPROVAL-QUEUE-UNIFIED, Slice 4a): it moved from a peer "Renewals" tab to one of the "Other views" behind the unified urgent-first "Needs your decision" list; the value-free-triage and resolve-on-the-run-page invariants are unchanged.
PRESERVE: the leading '**✅ ANSWERED 2026-07-01:' marker and the surrounding question text; only the tab-layout clause changes. (This file is not in ACTIVE_GOVERNANCE, so it is not marker-greped, but the amend is required by pre-customer-refinement step 6.)
```

_[docs/loop-state.md]_

```
EDIT line 53 IN PLACE (no net new line — file is exactly at the 140-line freshness cap). Replace:
  assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`). Remaining: A4, unit type-ahead, notifications, queue rebuild.
With:
  assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); the Approval-Queue presentation rebuild = one urgent-first list + an "Other views" disclosure (`F-APPROVAL-QUEUE-UNIFIED`, Slice 4a). Remaining: A4, unit type-ahead, notifications.
PRESERVE: keep 'Last updated: 2026-07-09' unchanged; do NOT add any new line anywhere (adding one line makes split length 141 and fails verify:context-freshness).
```

**Guardrails:**
- ROW_KEYS pin is UNCHANGED: do not touch lib/approval/needs-decision-inbox.ts or the NeedsDecisionRow interface; tests/unit/needs-decision-inbox.test.ts ROW_KEYS ['detail','href','key','kind','label','severity'] must stay exactly as-is (this slice is presentation-only).
- No approve/return/resolve affordance may be added to the inbox / RenewalReviewPanel / WritebackQueuePanel — approving stays on the run page; only renderAllItemsView keeps its pre-existing queue-item transitions, reused verbatim.
- Do NOT flip any Action Registry production_allowed and do not touch scripts/seed-action-registry.ts or lib/admin/migration-readiness.ts EXECUTABLE_ALLOWLIST; no system-of-record/Sheet write, no send.
- No new app/api route is added, so tests/unit/route-auth-boundary.test.ts needs no change.
- copy-voice gate: new operator copy ('Other views', 'Browse every queue item, renewal review, and write-back proposal.', 'All items', 'Renewal reviews', 'Write-back proposals') contains no forbidden jargon ('control plane'/'PMI handles'/'source of truth') and no em dash — keep it that way.
- ApprovalQueue.tsx keeps `import type` for server types (ApprovalQueueActivityRecord/ItemRecord) — do not value-import any firebase-admin module into this client component.
- EMPIRICALLY VERIFIED jsdom behavior the tests depend on: `fireEvent.click` does NOT toggle a <details>; `userEvent.click` DOES. Every test that must reveal a secondary tab/panel MUST open the disclosure with `await user.click(screen.getByText('Other views'))` (async, userEvent) — never fireEvent.
- Because the 'Needs your decision' inbox is now ALWAYS rendered, field labels like 'Current rent' can appear both in the inbox and in a secondary panel; in the panel tests assert on a UNIQUE token (run label 'Sample renewal run', or 'Renewal date' which is inbox-absent) rather than an ambiguous single-match getByText.
- docs/loop-state.md must stay <= 140 lines (it is exactly 140 now): record the progress by EDITING line 53 in place; add NO net new line.
- Supersede-Log marker must remain absent from the 7 ACTIVE_GOVERNANCE files (verified) so verify:context-freshness passes; do not paste the marker phrase into AGENTS.md/north-star/plan/implement/autonomous-agent-runner/ai-execution-workflow/products/README.
- Reuse existing CSS only (.approval-queue-shell already gives grid gap; .panel .ui-collapse .ui-tablist .ui-tab .ui-card-title .muted all exist) — do not add new CSS.

**Verify:** `npx vitest run tests/unit/approval-queue-component.test.tsx tests/unit/renewal-review-panel.test.tsx tests/unit/writeback-approval-queue-panel.test.tsx tests/unit/needs-decision-inbox.test.ts ; npm run typecheck ; npm run lint ; npm run format:check ; npm run verify:copy-voice ; npm run verify:context-freshness ; npm test ; npm run build`

**Done when:** ApprovalQueue renders the value-free 'Needs your decision' list as the always-visible landing surface with a closed 'Other views' disclosure below it; opening the disclosure reveals the All items / Renewal reviews / Write-back proposals tabs and their existing panels; a ?item_id= deep-link opens the disclosure to All items with the item selected; no approve affordance exists on the value-free surfaces and no bulk machinery is mounted on landing. All three component tests pass with extended (not weakened) value-free/no-bulk assertions and the ROW_KEYS pin untouched. docs/facts.md carries the new Verified F-APPROVAL-QUEUE-UNIFIED row and the OQ-UI-1-TAB-LAYOUT Supersede-Log row, with F-RENEWAL-REVIEW-SUBTAB/F-WRITEBACK-QUEUE tab wording reconciled; docs/products/v1-process-qa.md OQ-UI-1 answer amended; docs/loop-state.md line 53 updated in place (still <=140 lines). The full verify sweep (typecheck, lint, format:check, copy-voice, context-freshness, test, build) is green.

---

