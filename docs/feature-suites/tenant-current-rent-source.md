<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S102 — Tenant current rent from the active RentVine lease

> Status: Implemented and committed on 2026-09-03 (`ff200d3`, exact-SHA CI green), deployed in
> zero-traffic candidate `pmi-kc-app-rmtlsgy0i-ffb8a132da84`, and not promoted. The shared lease view now
> carries `currentRent` from the documented lease detail `baseRentAmount` inside the live lease
> generation, keeps `unit.rent` only as the labelled `unitListedRent` reference, and the S51 oracle,
> live review, console provider, and scripts read the same source. The serving revision still reads
> `unit.rent`, which the owner's review showed moving with the property-level market rent.

**Goal.**

Every renewal surface shows and reasons over the rent the current tenant actually pays under the
active RentVine lease, never a unit or property market value, and a missing value stays visibly
unavailable.

**Current state / intended end state.**

| Package requirement (PMI-01)                                | Classification    | Evidence                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current rent comes from the active lease, not market rent   | Incorrect         | `lib/integrations/rentvine/lease-mapper.ts (unit-rent lift)` lifts `unit.rent` onto the lease view as `currentRent`; `docs/products/rentvine-live-field-map-2026-07-22.md` records 0/306 lease-level rent keys on the export |
| One shared read path feeds table, workspace, proposals, Ask | Already satisfied | `leaseCurrentRent()` is the single reader used by `lib/lease-renewal/live-desk.ts`, `desk-guidance.ts`, the S97 proposal preview, and the owner draft                                                                        |
| Market rent stays separately named                          | Missing           | No projection field distinguishes the unit's listed rent from the tenant's lease rent                                                                                                                                        |
| Missing rent is unavailable, never `$0`                     | Already satisfied | Active S82 remediation keeps missing rent `null` (`docs/feature-suites/guided-renewal-desk-and-workspace.md`, "nullable rent"); `Needs Verification` renders instead of zero                                                 |
| RentVine/Sheet disagreement blocks the renewal              | Already satisfied | S82 rent-verification states `Verified` / `Needs verification` / `Unavailable`; `lib/lease-renewal/effective-data-check.ts` owns the resolution-aware projection                                                             |
| Post-correction refresh shows the same value everywhere     | Already satisfied | `lib/lease-renewal/post-write-freshness.ts` forces a complete post-write source read                                                                                                                                         |

Intended end state: the shared RentVine lease view carries `currentRent` only from a lease-scoped
source, carries the unit value under a separately named reference field, and every consumer keeps
its existing null-safe, discrepancy, and refresh behavior unchanged.

Bodyless discovery on 2026-09-03 (paths and types only, `temp/probe-lease-rent-shape.ts`) proved
the source: the documented lease detail `GET /leases/{leaseID}` (`RentVineClient.getLease`) carries
numeric `baseRentAmount` and `rentAmount` plus `isMonthToMonth`, `monthToMonthStartDate`, and
`hasPendingMonthToMonthConversion`, while the `/leases/export` row's `lease` object carries none of
them and its `unit.rent` is a unit attribute. The lease's recurring charges
(`GET /leases/{leaseID}/recurring-charges?includes=account`) carry `accountID`, `amount`, and an
`account` whose `isRent` flag identifies the rent account; that read is the S97 seam and remains a
cross-check, not the reader.

**Actors and entry conditions.**

A renewal operator (managed staff with Renewals Space access) loads the desk, a lease workspace, an
owner or tenant draft, or a RentVine/Sheet proposal. Entry requires the existing complete paged
RentVine export read and a current live lease generation (`lib/lease-renewal/live-lease-cache.ts`).
No role, key, or write authority changes.

**What it is / how it functions.**

1. **Lease detail enrichment.** Inside the existing live lease generation
   (`lib/lease-renewal/live-lease-cache.ts`), after the complete paged export, read each lease's
   documented detail through `RentVineClient.getLease` with bounded concurrency, the existing 429
   backoff, and a per-lease typed result (`available` | `unavailable`). Lift `baseRentAmount` onto
   the lease view as `currentRent` (finite positive number, else `null`) and keep `rentAmount`,
   `isMonthToMonth`, `monthToMonthStartDate`, and `hasPendingMonthToMonthConversion` on the view for
   S103. A detail failure marks only that lease `unavailable`; portfolio completeness is unchanged.
   Record the discovered field contract in `docs/products/rentvine-live-field-map-2026-07-22.md`.
2. **Lease-scoped reader.** `leaseCurrentRent` returns the enriched `currentRent` only. The export
   `unit.rent`, `rentAmount`, recurring charges, and every lookalike key are removed from the
   `currentRent` field map; `rentAmount` is exposed only as `totalRentAmount` for display beside
   separately labelled charges. The reader is pure over already-read data.
3. **Reference field.** The lease view keeps `unit.rent` as `unitListedRent`. Surfaces that show it
   label it `Unit rent (RentVine)`. It never feeds `currentRent`, the Sheet comparison, base-rent
   evidence, the S97 proposal, or the owner draft.
4. **Consumers unchanged.** Desk table `Current base rent`, workspace verification phase, S82
   rent-verification states, `effective-data-check.ts`, the S97 proposal preview, the owner draft, and
   the S110 assistant adapter read the corrected `currentRent` through the existing function.

**In scope / out of scope.**

In scope: the detail enrichment inside the live lease generation, the mapper, the reference fields,
the field-map document, fixtures, and consumer tests. Out of scope: changing how market rent is set,
deposits, suggested rent, S97/S98 write contracts, or a second resolver.

**Open questions & assumptions.**

None. `baseRentAmount` is the discovered lease-scoped contractual base rent. The per-lease detail
read multiplies provider calls by the portfolio size inside one cached generation; the generation
policy and concurrency bound are implementation choices measured in the focused tests, not product
questions.

**Cross-product impacts.**

Renewal desk and workspace, S97 charge proposals, owner/tenant drafts, S98 append value source, the
S110 assistant renewal adapters, `docs/products/rentvine-live-field-map-2026-07-22.md`, and
`docs/facts.md`.

**Authority and evidence map.**

| Input                                                                       | Classification                   | Use and limitation                                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md` F-RENEWAL-BOUNDARY, committed mapper and tests | Authority / implementation truth | Contractual base rent stays distinct from charges and RentCast; missing or conflicting evidence fails closed.        |
| Owner package PMI-01 and the 2026-09-03 owner direction                     | Intent evidence                  | Establishes that `unit.rent` tracked market rent and that the tenant's lease value is the required source.           |
| Bodyless discovery output (2026-09-03)                                      | Verified provider fact           | Lease detail `baseRentAmount`/`rentAmount` and month-to-month fields exist; the export lease object has no rent key. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S102-1** — One lease-scoped reader owns `currentRent`; a fixture whose `unit.rent` differs
  from the lease-scoped value fails today (mapper returns the unit value) and passes after.
- **ARCH-S102-2** — `unitListedRent` is a separately typed field; a static check proves no consumer
  imports it into base-rent evidence, proposal, draft, or Sheet comparison paths.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S102-1** — With lease rent `1050` and unit rent `1000`, desk, workspace, proposal, draft, and
  assistant show `1050`; a unit-rent change to `1200` changes nothing but the reference label.
- **BEH-S102-2** — With no usable lease-scoped value the lease shows `Needs Verification`, the
  verification phase blocks, and no surface renders `$0`.
- **BEH-S102-3** — With Sheet `1100` and lease `1050` the row is `Needs verification` with both
  values and the exact resolution destination; after an exact resolution and post-write refresh the
  table and workspace agree.

**Human litmus outcome.**

### Current rent matches the lease, not the listing

**If this was built correctly:** An operator opens the renewal table and a lease. The current rent
shown is the amount the tenant is charged on the active lease. Changing the unit's advertised rent in
RentVine does not change it. A lease with no rent shows a needs-verification state instead of zero.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with fixture, desk,
  workspace, and rehearsal-browser evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                                    | Deterministic evidence / falsification                                    |
| ------------------------------------ | -------------------- | ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| RENT-01, RENT-05 lease source wins   | `ARCH-S102-1`        | `BEH-S102-1`     | Current rent matches the lease, not the listing | Differing-values fixture across mapper, desk, workspace, draft, assistant |
| RENT-02 missing stays unavailable    | `ARCH-S102-1`        | `BEH-S102-2`     | Current rent matches the lease, not the listing | Null-rent fixture; `$0` string assertion fails first                      |
| RENT-03, RENT-04 discrepancy/refresh | `ARCH-S102-2`        | `BEH-S102-3`     | Current rent matches the lease, not the listing | Existing S82 verification and post-write freshness suites stay green      |

**Preservation set.**

`tests/unit/rentvine-export.test.ts`, `live-desk.test.ts`, `live-lease-cache.test.ts`,
`s82-desk-guidance.test.ts`, `effective-data-check.test.ts`, `renewal-post-write-freshness.test.ts`,
`s97-writeback-proposal-contract.test.ts`, and `lease-renewal-owner-draft.test.ts` remain green.

**Adversarial acceptance checks.**

- **AC-S102-1** — `ARCH-S102-1`/`BEH-S102-1`: a unit-only fixture cannot produce a verified rent.
- **AC-S102-2** — `BEH-S102-2`: no rendered surface, draft, or proposal contains a zero rent when the
  lease value is absent.
- **AC-S102-3** — `ARCH-S102-2`: a per-lease detail-read failure marks that lease unavailable without
  changing portfolio completeness or another lease's verification.
- **AC-S102-4** — The rehearsal-browser desk smoke shows the RentVine source label on the corrected
  value, and no probe, log, or fixture in Git carries a rent value, id, name, or address.

**Forbidden actions / hard gates.**

No RentVine write, no guessed field or account, no value logging, no new proposal path, no change to
S97/S98 keys, and no RentCast or Sheet value as `currentRent`.

**Dependencies / sequencing.**

First in the renewal-completion order. S103, S104, S105, S110, and S111 consume the corrected reader.

**Standalone delivery contract.**

- **Deliverable now:** discovery extension, reader, reference field, fixtures, consumer tests, and the
  extended desk smoke.
- **Consumes, but does not assume:** the live lease generation and the S97 charge read seam.
- **Externally blocked effect:** none; a failed detail read yields `unavailable`, never a fallback
  to `unit.rent`.
- **Produces for downstream suites:** `currentRent` (lease-scoped, nullable), `totalRentAmount`,
  `unitListedRent`, and the month-to-month detail fields S103 consumes.

**Verification and delivery contract.**

1. Freeze the differing-values, null-rent, and detail-read-failure fixtures failing for the expected
   reason.
2. Run the focused mapper, desk, workspace, draft, proposal, and assistant checks plus
   `npm run smoke:renewal-desk-browser` against the local rehearsal server.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit the diff for values and secrets.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` naming the
   single missing provider fact.

**Ordered prompt sequence.**

1. Re-verify the discovered lease-detail contract and record it in the field-map document.
2. Materialize the fail-first fixtures.
3. Implement the detail enrichment, reader, and reference fields; keep consumers on the existing
   function.
4. Run focused, canonical, and rehearsal-browser checks; update current docs.

**Deletion/merge recommendation.**

Fold into the S82 contract and the field-map document once the corrected source is deployed and read
back.
