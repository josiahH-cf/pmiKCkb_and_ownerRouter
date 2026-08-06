# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

Last updated: 2026-08-06.

```yaml
last_updated: 2026-08-06
active_program: S57_S63_RENEWAL_PROOF
program_suites: S57-S63 (+S65 independent; S64 specified but NOT authorized)
spec_writing_allowed: true
loop_execution_allowed: true
loop_commit_push_allowed: true
loop_deploy_allowed: true
provider_interleave_allowed: true
spec_package_status: COMPLETE
implementation_status: NOT_STARTED
next_suite: S57
next_spec: docs/feature-suites/portfolio-complete-lease-reads.md
session_auth_status: READY_ADC_FRESH_2026_08_06
active_slice: NONE_NOT_STARTED
next_slice: S57_PORTFOLIO_COMPLETE_LEASE_READS
last_completed_slice: S55_STAGE_TWO_OLD_SERVICE_RETIRED
runtime_action_gates_preflipped: false
```

## Authority

- The Renewal Proof Program Authorization in `AGENTS.md` (owner, 2026-08-06) opens S57–S63, scoped to
  the four-lease test set, RentCast, recipient handling, and owner-policy rules.
- S64 is specified and **not authorized**: it falls outside all four scope items and needs an
  explicit grant extension naming it. The owner DID settle its design question (per person), recorded
  as `F-APPROVAL-RELAXATION-AXIS` independently of the spec.
- S65 is authorized narrowly by the owner's direct instruction to add feedback closure.
- All prior grants stand unchanged: D05 deploy, D12 protected paths, the Cloud Automation Grant, the
  S52 ceiling (alert `$25`, hard stop `$100`), D33 draft-only notice initiation.
- Activation remains per exact Action Registry key, never by category or inference.

## Why S57 is first

A live read-only probe on 2026-08-06 found RentVine's `/leases/export` is page-limited and every
production caller passes no page parameter. The desk has been reading **25 of 305 leases**. `pageSize`
is the honoured parameter; `limit` is accepted and ignored. **None of the four test leases is inside
the default page**, so no later slice is reachable until this lands.

## Hard refresh completed 2026-08-06

- RentVine field map re-derived live; zero drift against the 2026-07-22 map. Tenant email
  `tenants[].email`, owner email `portfolio.owners[].email`, lease end `endDate`, rent `currentRent`.
- Live Sheet read green: 27 tabs, 26 in scope, `Lease Renewal` 520 rows.
- Fresh golden capture `capture-2026-08-06T12-08-22-192Z` written gitignored. **Re-run after S57** —
  it captured the 25-row default page.
- All prior live-read coverage figures in this repo were measured on leases 1–25 and are
  unrepresentative rather than wrong.

## Test cohort (resolved 2026-08-06)

Sheet rows 507–510 joined to RentVine lease ids **278, 279, 280, 297**. Detail is gitignored at
`temp/test-cohort/cohort-resolution.json`. Lease 297 ends 2026-10-10 (not 09-30) and reads a zero
current rent in RentVine against a non-zero Sheet figure — a real day-zero discrepancy, kept as test
finding number one. Leases 279 and 280 share one street address, so records key on lease id.

## Open owner values (do not invent)

Each has a `Q-` row in `docs/facts.md` with its documented safe default.

1. `Q-TESTSET-TOLERANCE` — the rent-comparison tolerance. **No default.** S63 criterion 3 reads
   `not_evaluated` until answered.
2. `Q-TESTSET-NEGOTIATED` — which two leases are already negotiated, and their agreed rents.
3. `Q-TESTSET-DAILY-OWNER` — who checks the test each day.
4. `Q-OWNER-ORDERING` — what orders owner recipients, now that `percentOwned` is measured empty.
5. `Q-CHANNEL-SEPARATION-ASSERTION` — default: build it and refuse on violation.
6. `Q-COMP-TREND-PRESENTATION` — source resolved (`/markets`); presentation still open.
7. `Q-UNDER-MARKET-THRESHOLD` — provisional 10 percent.
8. `Q-LEASE-DATA-MAX-AGE` — provisional 15 minutes.
9. `Q-RENTCAST-PLAN-TERMS` — the terms-of-service half only; the numbers are resolved.
10. `Q-TESTSET-OWNER-SEND` — whether "email the MKD owners" means a real human send in the window.
11. `Q-SHEET-WRITEBACK-BACKUP` — what the required backup actually is.
12. `Q-COHORT-ADDRESS-RECORDING` — confirm the committed-versus-gitignored split.
13. `Q-TESTSET-EVIDENCE-IN-APP` — whether Dan inspects evidence in-app.
14. `Q-MKD-PORTFOLIO-ID` — id resolved (27); what the client's "50/50" refers to is still open.

## Resolved 2026-08-06 (do not re-ask)

Read these fact rows before touching S59, S61, or S62: `F-RENTCAST-KEY-PLACED`,
`F-RENTCAST-API-CONTRACT`, `F-MKD-PORTFOLIO-IDENTIFIED`, `F-OWNER-PERCENT-OWNED-ABSENT`,
`F-MONITORING-CHANNEL-CREATED`. In short: the key is placed, the API contract is researched (use
`/avm/rent/long-term` and `/markets`, and overage bills automatically), MKD is `portfolioID` 27 but no
test lease belongs to it, `percentOwned` is empty across the export, and the alert channel exists.

## Superseded 2026-08-06

The 2026-08-05 premise that MKD owners need no outreach is **withdrawn by owner direction**. MKD owner
recipients are emailed through the normal reviewed process and are included in the test set. No
outreach-skip path may be built.

## Locked safety

- No autonomous, scheduled, bulk, or model-triggered client-facing send.
- Renewal and maintenance notice initiation stays draft-only under D33.
- Nothing in this program sends to an owner or a resident.
- No guessed endpoint, record URL, identity, or customer value.
- No personal account in an auth path; managed organization or service identities only.
- No secret, token, PII, Gmail body, customer content, or photo in git or evidence.
- The RentCast key lives in Secret Manager only; never a file, command line, log, or fixture.
- D12 protected changes (the RentCast `production_allowed` flip, new `firestore.rules` declarations,
  any `lib/auth/**` edit) are prepared and surfaced, never pushed.

## Resume

**Fresh-context launcher:** `docs/meta-prompts/renewal-proof-unattended-loop.md`. Hand that whole file
to a new session to run this program unattended.

Start **S57** at `docs/feature-suites/portfolio-complete-lease-reads.md`. Build the paged complete
read, switch the three no-param callers, make the Console display cap honest, render the
incomplete-read state, add the paging boundary test, falsify it, then re-run field discovery and `golden:capture` live across the full portfolio
and record real coverage.

Then S58 → S59 → S60 → S61 → S62 → S63. S65 may interleave whenever no slice is mid-flight. Do not
start S64.

**Correction note: DONE 2026-08-06.** The client correction note at
`docs/temp/client-correction-note-2026-08-06.md` was reviewed and sent by the owner. It corrected four
statements made on the 2026-08-05 call that the app does not do: reply self-updating, RentVine write
being a toggle, notification email, and per-item approval relaxation. Do not re-send it. The client
now knows the four leases are not visible until S57 lands.

**RentCast key: owner action IN FLIGHT.** The owner is placing `RENTCAST_API_KEY` in Secret Manager
per `docs/rentcast-setup-runbook.md`. Until it is confirmed placed AND the reviewed D12 seed patch
lands, S59 stops at its named dependency and S63's number criterion stays `not_evaluated`. S57 and
S58 do not wait on it.

**Environment note:** `node_modules` in the primary tree is installed for linux-x64, so `tsx` scripts
fail in the Windows shell. Run them through WSL, exporting
`GOOGLE_APPLICATION_CREDENTIALS=/mnt/c/Users/josia/AppData/Roaming/gcloud/application_default_credentials.json`
for Google reads. Do not run `npm ci` on Windows.
