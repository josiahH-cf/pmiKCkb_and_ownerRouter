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
implementation_status: S57_DONE
next_suite: S58
next_spec: docs/feature-suites/live-lease-data-currency.md
session_auth_status: READY_ADC_FRESH_2026_08_06
active_slice: NONE_BETWEEN_SLICES
next_slice: S58_LIVE_LEASE_DATA_CURRENCY
last_completed_slice: S57_PORTFOLIO_COMPLETE_LEASE_READS
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
- Golden capture RE-RUN after S57 (`capture-2026-08-06T20-35-30-564Z`, gitignored): 305 live
  candidates, 20 High candidate flags portfolio-wide. The earlier 25-row capture is superseded.
- Portfolio-wide coverage now measured (S57): tenant email 302/305, owner email 305/305, 146/305
  leases with more than one owner email. Prior 1–25 figures were unrepresentative rather than wrong.

## Test cohort (resolved 2026-08-06)

Sheet rows 507–510 joined to RentVine lease ids **278, 279, 280, 297**. Detail is gitignored at
`temp/test-cohort/cohort-resolution.json`. Lease 297 ends 2026-10-10 (not 09-30) and reads a zero
current rent in RentVine against a non-zero Sheet figure — a real day-zero discrepancy, kept as test
finding number one. Leases 279 and 280 share one street address, so records key on lease id.

## Owner values — ALL ANSWERED 2026-08-06

Every value the program needs is decided. Read the `Q-` rows in `docs/facts.md` for the exact wording;
none of these is a judgement call any more.

- Tolerance: plus-or-minus 5 percent or 50 dollars, whichever is larger.
- Comparison basis: the Sheet's own Market Value column, all four leases (`F-TESTSET-COMPARISON-BASIS`).
- Daily owner: Bailey, escalating to Josiah.
- Owner ordering: the portfolio's own owner order, first to `to`, rest to `cc`.
- Channel separation assertion: build it, refuse on violation.
- Trend presentation: rendered range inline plus a source link. No attachment.
- Under-market threshold: 10 percent below the provider point estimate.
- Max lease-data age: 15 minutes.
- RentCast terms: caching, storage, and owner-facing display are expressly permitted.
- Test-window sends: compose-and-review only.
- Sheet write-back backup: a Drive copy pinned to a named revision, owner-verified first.
- Cohort data split, evidence in-app, MKD cohort membership: all settled.

One residual, non-blocking: what the client's "50/50" referred to, given MKD carries three owner
records and no ownership percentages. It blocks nothing, because the rule keys on `portfolioID` 27.

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

**S57 is DONE** (`F-PORTFOLIO-COMPLETE-READS`, AC-S57-1..10): complete paged read, three callers
switched, honest Console cap, incomplete-read state, sentinel falsified, field discovery + golden
capture re-run portfolio-wide (305/305 complete; tenant email 302/305, owner email 305/305, 146/305
multi-owner-email; capture 305 candidates, 20 High flags). Known-red carried forward:
`test:e2e:core` fails 8 PRE-EXISTING demo-mode tests on main itself (`Q-E2E-DEMO-LANE-RED`),
identical on a clean-HEAD baseline; not S57 fallout and not this program's work.

Start **S58** at `docs/feature-suites/live-lease-data-currency.md` (max lease-data age 15 minutes is
decided policy, `Q-LEASE-DATA-MAX-AGE`). Then S59 → S60 → S61 → S62 → S63. S65 may interleave
whenever no slice is mid-flight. Do not start S64.

**Correction note: DONE 2026-08-06.** The client correction note at
`docs/temp/client-correction-note-2026-08-06.md` was reviewed and sent by the owner. It corrected four
statements made on the 2026-08-05 call that the app does not do: reply self-updating, RentVine write
being a toggle, notification email, and per-item approval relaxation. Do not re-send it. The client
now knows the four leases are not visible until S57 lands.

**RentCast key: PLACED and verified 2026-08-06** (`F-RENTCAST-KEY-PLACED`). S59's remaining owner
dependency is the reviewed D12 seed patch plus the deploy-wrapper binding, not the credential.

**Environment note:** `node_modules` in the primary tree is installed for linux-x64, so `tsx` scripts
fail in the Windows shell. Run them through WSL, exporting
`GOOGLE_APPLICATION_CREDENTIALS=/mnt/c/Users/josia/AppData/Roaming/gcloud/application_default_credentials.json`
for Google reads. Do not run `npm ci` on Windows.
