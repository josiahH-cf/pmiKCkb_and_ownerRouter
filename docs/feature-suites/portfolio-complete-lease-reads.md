<!-- spec-shape: overhaul-v1 -->

# S57 — Portfolio-complete live lease reads

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`. This suite exists
> because a live read-only probe on 2026-08-06 found that the Live Renewal Desk has been showing
> **25 of 305 leases** since it shipped. It is the first slice of the program because no other slice
> in it is reachable until this is fixed: none of the four named test leases is inside the page the
> app currently reads.

**Goal.** When an operator opens the Live Renewal Desk, they see every lease in the portfolio that
falls inside the desk's window, not an arbitrary first slice of it. Today the desk reads the first
25 leases by id and silently presents that as the portfolio. After this suite, a read that cannot
return the whole set says so loudly instead of quietly truncating, and an automated test makes a
silent truncation impossible to reintroduce.

**What it is / how it functions.** RentVine's `/leases/export` is page-limited and the application
never passed a page parameter. Measured live on 2026-08-06 against `pmikcmetro.rentvine.com`:

| Call                                | Rows returned        |
| ----------------------------------- | -------------------- |
| `listLeasesExport()` (no params)    | 25 (lease ids 1–25)  |
| `listLeasesExport({limit:500})`     | 25 (`limit` ignored) |
| `listLeasesExport({page:2})`        | 25                   |
| `listLeasesExport({pageSize:500})`  | 305                  |
| `listLeasesExport({pageSize:1000})` | 305                  |
| `listLeasesExport({pageSize:2000})` | 305                  |

`pageSize` is the parameter RentVine honours. `limit` is accepted and ignored, which is the trap:
a caller that passes `limit` believes it widened the read and did not.

- **The defect — three production callers pass no params.**
  `lib/lease-renewal/live-lease-cache.ts:46` (`leaseViewsFromExport(await reader.listLeasesExport())`)
  feeds the Live Renewal Desk and the per-lease workspace. `lib/console/rentvine-live-provider.ts:50`
  feeds the Console live projection. `lib/maintenance/live-unit-source.ts:38` feeds the maintenance
  unit matcher. `lib/lease-renewal/live-run.ts:82` already threads an optional `listParams`, so the
  seam exists and is simply unused.
- **A complete read, not a bigger page.** Add `listAllLeasesExport()` to
  `lib/integrations/rentvine/client.ts` beside the existing `listLeasesExport`. It pages with an
  explicit `pageSize`, advancing `page` until a page returns fewer rows than requested, and returns
  `{ rows, pages, complete }`. A hard page cap prevents an unbounded loop against a misbehaving
  provider; reaching the cap sets `complete:false` rather than returning a short set as if it were
  whole. Deduplicate by lease id across pages, because `page`/`pageSize` interaction is provider
  behavior we observed rather than contract we were given.
- **Truncation becomes visible, never silent.** `complete:false` surfaces as an explicit
  desk-level state. The desk must not render a partial portfolio as if it were the portfolio. It
  renders the rows it has plus an unmistakable notice that the read was incomplete, and the count it
  displays is labeled as partial.
- **A sentinel forbids the bare call in production paths.** A boundary test
  (`tests/unit/lease-export-paging-boundary.test.ts`, following the repository's existing
  `*-boundary.test.ts` convention) asserts that no module under `app/` or `lib/` — excluding the
  client itself and test helpers — calls `listLeasesExport` without a page parameter. This is the
  invariant that keeps the defect from returning through a fourth caller written later.
- **A second, independent truncation on the Console path.**
  `lib/console/rentvine-live-provider.ts:11` declares `const MAX_ROWS = 30;` and applies it at `:52`
  via `.slice(0, MAX_ROWS)`. Paging the underlying read does **not** fix that caller: it would go
  from "the first 25 leases" to "the first 30 of 305". The decision taken here is to keep a display
  cap on the Console projection — it is a summary surface, not the desk — but to make it honest: the
  cap is applied **after** a complete read, and the projection states that it is showing a capped
  subset of a known total. The maintenance unit matcher has no such cap and simply receives the full
  set. A cap that hides its own existence is the same defect in miniature.
- **The 120-day window is unchanged by this suite.** `WINDOW_DAYS = 120` at
  `app/lease-renewal/live/desk/page.tsx:14` stays as-is. Widening the read from 25 to 305 leases is
  already a large behavior change for the desk; changing the window in the same slice would make the
  two effects impossible to separate during verification.
- **Evidence re-baselining.** Every prior live-read measurement in this repository was taken on the
  default page, i.e. leases 1–25 only, and is therefore a non-random sample rather than portfolio
  coverage. This includes the 25/25 tenant- and owner-email coverage recorded in
  `docs/products/rentvine-live-field-map-2026-07-22.md` and re-measured on 2026-08-06. Those numbers
  are not wrong; they are unrepresentative. The suite re-runs field discovery and
  `npm run golden:capture -- --live` across the full portfolio and records the real coverage.

Buildable now (app-plane): all of the above. Build to the seam (live provider): the paging read
itself, which is a read against an already-configured provider with existing credentials. Owner
dependency (the one flip): none. No Action Registry key governs a RentVine read; `rentvine.lease.read`
is already active in production.

**Open questions & assumptions.**

- _Assumption:_ 305 is the current full lease set. Three page sizes (500, 1000, 2000) all returned
  305 distinct ids, which is strong evidence but is not a documented provider contract. The
  `complete` flag exists precisely so this assumption cannot silently fail.
- _Assumption:_ `pageSize` remains the honoured parameter. If RentVine changes it, the completeness
  assertion fails loudly rather than truncating.
- _Open:_ whether the Console live projection and the maintenance unit matcher want the full
  portfolio on every request or a narrower read. Default taken: both get the complete read, because
  both are currently wrong in the same way and a partial answer is the defect being fixed. Revisit
  under S58 if latency warrants.
- _Answered 2026-08-06 (owner):_ cohort scoping stays procedural (Q12), so this suite deliberately
  adds no lease filter. Widening the read is correct even though it shows the operator more leases.

**Cross-product impacts.**

- `lib/integrations/rentvine/client.ts` — new `listAllLeasesExport`; `listLeasesExport` retained.
- `lib/lease-renewal/live-lease-cache.ts`, `lib/console/rentvine-live-provider.ts`,
  `lib/maintenance/live-unit-source.ts` — switch to the complete read.
- `lib/lease-renewal/live-run.ts` — existing `listParams` seam reconciled with the new call.
- `components/lease-renewal/RenewalDesk.tsx` — incomplete-read notice.
- `docs/products/rentvine-live-field-map-2026-07-22.md` — corrected: it records the owner channel as
  resolving 0/25, which is stale (it resolves on 2026-08-06), and its coverage figures are relabeled
  as default-page rather than portfolio.
- Interacts with **S58** (refresh and caching of the now-larger read), **S59** (comps run per lease),
  **S63** (the test cohort is only reachable after this ships).
- Supersedes no active governance text. No `docs/facts.md` Supersede Log marker is required, because
  the stale coverage claim lives in a product reference doc rather than in the active governance set.

**Adversarial acceptance checks.**

- **AC-S57-1** — `listAllLeasesExport()` against the live tenant returns at least 300 distinct lease
  ids together with `complete:true`. A run that returns 25, or that returns a short set while
  reporting `complete:true`, fails. _Verify:_ `npm run discover:rentvine-fields -- --live` printing
  both the distinct-id count and the completeness flag.
- **AC-S57-2** — Lease ids `278`, `279`, `280`, and `297` are all present in the desk's loaded lease
  set. Before this suite all four are absent. _Verify:_ `npm test -- live-lease-cache`.
- **AC-S57-3** — With a stubbed transport that returns exactly `pageSize` rows on every page, the
  reader stops at the page cap and returns `complete:false`. It never returns a short set with
  `complete:true`. _Verify:_ `npm test -- rentvine-client`.
- **AC-S57-4** — With a stubbed transport whose pages overlap, the returned set contains no duplicate
  lease id. _Verify:_ `npm test -- rentvine-client`.
- **AC-S57-5** — When `complete:false`, the Live Renewal Desk renders a visible incomplete-read
  notice and labels its lease count as partial. A partial read never renders as a normal desk.
  _Verify:_ `npm test -- RenewalDesk`.
- **AC-S57-6** — An architecture test fails if any module under `app/` or `lib/`, excluding
  `lib/integrations/rentvine/client.ts`, calls `listLeasesExport` with no page parameter. Deliberately
  reintroducing a bare call turns the test red. _Verify:_ `npm test -- lease-export-paging-boundary`.
- **AC-S57-7** — A fresh `npm run golden:capture -- --live` records a live RentVine candidate count
  equal to the full portfolio rather than 25, and the capture draft is written gitignored with
  counts-only stdout. _Verify:_ run it and read the printed `liveRentvineCandidates`.
- **AC-S57-8** — Field discovery re-run across the full portfolio reports a scanned-row count of at
  least 300 and records coverage for `lease.tenants[].email` and `portfolio.owners[].email` as
  present/of counts over that full set, including the count of leases carrying more than one owner
  email. A run reporting fewer than 300 rows fails. _Verify:_
  `npm run discover:rentvine-fields -- --live`, recorded as a `docs/facts.md` row.
- **AC-S57-9** — The Console live projection receives the complete lease set before its display cap
  is applied, and renders the cap explicitly as a subset of a stated total. A projection that shows
  30 rows with no indication that more exist fails. _Verify:_ `npm test -- rentvine-live-provider`.
- **AC-S57-10** — The maintenance unit matcher receives the complete lease set with no row cap.
  _Verify:_ `npm test -- live-unit-source`.

Keep green: `tests/unit/action-registry-schema.test.ts`, `tests/unit/plan-status-sync.test.mjs`,
`feature-suite-spec-shape.test.mjs`, plus `npm run verify:context-freshness` and
`npm run verify:spec-traceability`.

**Forbidden actions / hard gates.** No autonomous client-facing send; generic non-workflow
`gmail.message.send` stays Registry-closed; no personal account in any auth path; no secret, token,
PII, or guessed endpoint in git; the S52 production cost ceiling stands. This suite performs
**reads only** and must not add, open, or prepare any write or send capability. It must not flip any
`production_allowed` value, and it must not widen the RentVine credential's scope. The complete read
must not be used to enumerate or export customer records into git or into evidence; counts,
identifiers, and coverage only. A partial read must never be presented as complete, and rendering
`complete:false` as a normal desk is itself a falsification of this suite.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `lib/integrations/rentvine/client.ts` `listLeasesExport` and every caller;
   confirm the three no-param call sites and the one `listParams` seam.
2. _Understanding:_ confirm against the live tenant that `pageSize` is honoured and `limit` is not,
   using a read-only probe that prints counts only.
3. _Build:_ add `listAllLeasesExport` with paging, dedupe, page cap, and the `complete` flag.
4. _Build:_ switch the three production callers; reconcile `live-run.ts`'s `listParams`.
5. _Build:_ render the incomplete-read state on the desk.
6. _Build:_ add the architecture sentinel forbidding bare `listLeasesExport` in production paths.
7. _Verify:_ falsify by restoring a bare call and observing the sentinel fail, then restore and
   observe it pass.
8. _Gate:_ `npm run format:check`, `lint`, `typecheck`, `npm test`, `npm run test:e2e:core`,
   `verify:falsification`, `verify:context-freshness`, `verify:spec-traceability`, `npm run build`.
9. _Verify:_ re-run field discovery and `golden:capture` live; record portfolio-wide coverage.
10. _Context update:_ correct `docs/products/rentvine-live-field-map-2026-07-22.md`; promote a
    `docs/facts.md` `F-` row citing AC-S57-1 through AC-S57-8; update `docs/loop-state.md` and
    `docs/status.md`.

**Deletion/merge recommendation.** KEEP. This file is the durable record of a real production defect
and the invariant that prevents its return. The disposable cycle packet `docs/temp/portfolio-complete-lease-reads-plan.md` is CREATED AT SLICE START, not by this spec.
