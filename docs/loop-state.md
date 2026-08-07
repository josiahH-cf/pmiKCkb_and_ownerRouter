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
implementation_status: S57_S58_S59_S60_S61_DONE
next_suite: S62
next_spec: docs/feature-suites/owner-policy-renewal-pricing.md
session_auth_status: READY_ADC_FRESH_2026_08_06
active_slice: NONE_BETWEEN_SLICES
next_slice: S62_OWNER_POLICY_RENEWAL_PRICING
last_completed_slice: S61_RECIPIENT_FANOUT_AND_SEPARATION
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

Every value the program needs is decided; none is a judgement call. The full table is §6 of
`docs/meta-prompts/renewal-proof-unattended-loop.md` and the exact wording is in the `Q-` rows of
`docs/facts.md`: tolerance ±5% or $50 (larger); comparison basis = the Sheet's Market Value column;
daily owner Bailey → Josiah; owner ordering = portfolio order, first `to`, rest `cc`; separation
assertion built + refuses; trend inline + link; under-market 10%; max lease-data age 15 minutes;
RentCast caching/storage/display permitted; test-window sends compose-and-review only; write-back
backup = owner-verified pinned Drive copy; cohort data split settled. One residual, non-blocking:
what the client's "50/50" meant (MKD has three owner records, no percentages); the S62 rule keys on
`portfolioID` 27 and does not need it.

## Resolved 2026-08-06 (do not re-ask)

Read these fact rows before touching S59, S61, or S62: `F-RENTCAST-KEY-PLACED`,
`F-RENTCAST-API-CONTRACT`, `F-MKD-PORTFOLIO-IDENTIFIED`, `F-OWNER-PERCENT-OWNED-ABSENT`,
`F-MONITORING-CHANNEL-CREATED`. In short: the key is placed, the API contract is researched (use
`/avm/rent/long-term` and `/markets`, and overage bills automatically), MKD is `portfolioID` 27 but no
test lease belongs to it, `percentOwned` is empty across the export, and the alert channel exists.

## Superseded 2026-08-06

The 2026-08-05 premise that MKD owners need no outreach is **withdrawn by owner direction**: MKD
owners are emailed through the normal reviewed process and are in the test set; no skip path.

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

**S57 is DONE** (`F-PORTFOLIO-COMPLETE-READS`, `fb57e0b`) and **S58 is DONE**
(`F-LEASE-DATA-CURRENCY`, `79b820d`): complete paged reads everywhere with portfolio-wide coverage
measured (owner email 305/305, 146/305 multi-owner), and the three-age currency contract (60s TTL /
15-min hard max) with refusals on expired. Known-red carried forward: `test:e2e:core` fails 8
PRE-EXISTING demo-mode tests on main itself (`Q-E2E-DEMO-LANE-RED`).

**S59 is DONE and DEPLOYED** (`F-RENTCAST-ACTIVATION-HARDENED`, commit `0283773`, revision
`pmi-kc-app-rmsi5llfz-8332ff9656c8`, checkpoint `F-CURRENT-SERVING-CHECKPOINT-2026-08-06`): AVM comp
basis, legible refusals, cache + billed-call counter + hard quota stop, health probe, deploy
bindings read back, rollback proven. **OWNER STEP OPEN (`Q-RENTCAST-ACCOUNT-403`)**: the placed key
answers 403 — activate the API plan in the RentCast dashboard, read back the real allowance/overage
(AC-S59-14), re-run `npm run smoke:rentcast-comp`; the parked D12 flip patch
(`docs/temp/rentcast-gate-flip-d12-patch.md`) waits on that smoke evidence.

**S60 is DONE** (`F-COMP-PERSISTENCE-TRUTH`, commit `e83f876`): provider basis persisted beside
typed values, owner draft names its real source, under-market signal internal at the confirmed 10
percent, clamp repaired. LIVE comp evidence still waits on `Q-RENTCAST-ACCOUNT-403`.

**S61 is DONE** (`F-RECIPIENT-FANOUT-SEPARATION`): owner channel fans out to all owners of record
(portfolio order; the route's single-owner join injection deleted for the measured 305/305 export
field), structural channel separation refuses on collision, S24 amended, D57 note updated for the
owner to send.

Start **S62** at `docs/feature-suites/owner-policy-renewal-pricing.md` (MKD = `portfolioID` 27,
`F-MKD-PORTFOLIO-IDENTIFIED`; Admin-approvable suggestion keyed on the portfolio id; never sets the
offered rent; no cohort lease is MKD-owned so S63 yields no live MKD evidence). Then S63. S65 may
interleave whenever no slice is mid-flight. Do not start S64.

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
