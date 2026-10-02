# Loop state

Last updated: 2026-10-02 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

RELEASED: batch 004 (S146–S151) in two candidates, by owner direction on 2026-10-01.
Run 729d5716-bc5e-4e61-9932-c9107d1954f2; serving SHA 1402e51b4828d407f990a675f16e6a7ba47afb7b.
Revision pmi-kc-app-rmuq2qvcc-8074bfd97707; tag cand-rmuq2qvcc-8074bfd97707; traffic 100%.
Fingerprint sha256:56315f7704e0ef637f1ffd2c490d610a11a048e864241d319b824f39c572adf9.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=false.
Interim run 98f7e743-7345-4b74-a6a8-675fe9fac31f released S108 and S146–S148 at 2b53c5d5 /
pmi-kc-app-rmupw50tc-8189b32d3395 for the owner's client call. Its first recovery assurance failed
on a cold first render; a read-only diagnostic canary on the 0% recovery target passed and the
same-run resume passed every later phase.
Run 0aa79bfe (same code at 19d4590a) rolled back verified when its observation could not finish
inside the 420 s evidence deadline; PR #116 recorded it and run 729d5716 released the code from
1402e51b. That observation passed at 419,630 ms, 0.37 s inside the deadline.
The owner's bounded live check passed on pmi-kc-app-rmuq2qvcc-8074bfd97707: 4 of at most five questions answered and saved to history with 4 model calls; history reopened in a fresh browser context, then save, pin, unpin and one structured rerun with zero model calls; zero business writes and 0 guard refusals.
AF-01 to AF-70: every criterion is Yes or evidenced N/A except AF-67 (No, by the owner's
two-candidate direction). Ledger: docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md.
Independent verification on 2026-10-02 re-derived merges, CI, readbacks, live-check log counts
and each suite's behaviour (one falsification per suite); its corrections are in the ledger.
Production traffic never left a verified revision.
OWNER UNBLOCK PASS, 2026-10-01: B-MNT2 closed (Vendoroo's ROO via RentVine, no connector).
B-MNT1: the Admin import `82e49596` is released (run 98f7e743); one Admin confirmation remains.
B-S100: owner chose work order 101756 (id 1756); the owner creates its ticket, links id 1756 and
syncs once. B-DL1: Dotloop approved API access on 2026-09-10; the owner creates the integration
account and replies. B-AUTH2: the 2026-10-01 probe stopped at its first failure at 16.06 h.

## Awaiting release

None. Runs 98f7e743 and 729d5716 consumed batch 004's queue (S146–S151, with S108 in the interim
run); both permits are consumed. A future authorized batch needs its own exact queue, ancestral
commits, exact main CI, fresh prerequisites and a new run-bound permit. No provider effect, key or
activation is queued. S121 remains excluded.

## Feature intake

Request 001 was supplied from `pmi-new-features-9-30/001-governance-simplification-and-unattended-auth-renewal.md`.
The authorized governance/auth change passed its local gate and PR #92 merged at `41ad65cb` on
2026-09-30. Run ab803f8a released it with its patched dependencies and PR #93's timing change
(applied by owner decision on 2026-10-01). No other suite is thereby resumed. A fresh
approved `auth:ensure` during batch 002 intake returned READY for WSL CLI and ADC under
`josiah@pmikcmetro.com`. A read-only Cloud Run describe still showed the prior verified revision
`pmi-kc-app-rmundpf2v-249c945f2220` at 100% traffic and answer/classify model settings of
`gemini-2.5-flash`. No new product-route assurance or model inference was run for this intake.

Batch 002's seven Markdown files were read in supplied order and registered once as S135–S141
in `docs/feature-suites/README.md`.
The owner clarified that 006–007 apply to all existing workflow-linked draft screens. S110's
three-intent answer path and the earlier draft flows were the serving baseline until the batch 002
release. Overlapping unimplemented S88–S93/S101 plans are superseded for this scope;
S87/S94/S95 remain separate proposals.

On 2026-09-30 the owner explicitly instructed execution of batch 002 (S135–S141), then batch 003
(S142–S145), through implementation, mainline merge and deployment, with one cumulative release at
the end of each set. PR #95 (production audit patch and S113 journey settle fix) merged at
`dc493dfe`. S136 (PR #96), S135/S137/S138 (PR #98) and S139/S140 (PR #99) merged at `f43629aa`
after full local gates and exact CI. S141's local rehearsal evidence is in
`docs/evidence/connected-ai-batch-002-validation-2026-09-30.md`; production inference cells were not run.

Batch 003's four files 009–012 are registered once as S142–S145, covered by the same instruction
after batch 002. No prior-batch intake question remained; the owner accepts earlier
defaults. Serving Full view, one linked next action and cycle-bound manual progress are baseline;
multiple-ready dependency projection, separate Focus pane, in-pane lifecycle and its regression
validation are new work. Fresh read-only traffic check still showed the documented serving revision
at 100%; a newer candidate was not serving. `auth:ensure` returned READY for approved WSL CLI/ADC.
No Focus code, provider effect or deployment was started by this intake. Batch 003 has since
merged (PRs #101–#103, #105); its FV-01 to FV-102 ledger is in the batch 003 evidence map.
Spec-shape, traceability, active-path, freshness, policy, redaction and formatting checks passed.
The production audit failure that first held these docs was remediated by PR #95 (`dc493dfe`).

Batch 004's six files 013–018 (`pmi-new-features-9-30/feature-batch-004-ai-first-dashboard-and-query-history/`) are registered once as
S146–S151, all ready. Baseline: S138's conversation engine and the existing approval, connection,
process and renewal screens. New: an AI-first Dashboard without a process step, five panel moves
with one compact attention queue, owner-scoped history, saved and pinned questions, a model-free
structured rerun and integrated validation. Owner decisions 2026-10-01: Anticipated work moves to
Internal Processes; the post-deployment check may ask at most five read-only questions as the owner.
The owner started execution on 2026-10-01; all six are merged (PRs #111–#113 and #115) and
released (runs 98f7e743 and 729d5716).

## Verified evidence

Gate on PR head d5b6967b (release head 1402e51b adds only docs): 7,887 unit tests, four existing skips,
273 backend tests, test:e2e:core 32 passed (22 existing skips), production audit 0 findings.
The docs-only merge heads de36d59f, 50801b7b and 2316dbb7 (trees of 2b53c5d5, 1402e51b and main)
merged on docs gates and exact CI; on 2026-10-02 the full gate passed on each (2316dbb7 on its third run, after two failures of the known S113 journey flake).
The first gate runs on b7bf7b14 and d5b6967b each failed one pre-existing backend-lane test (an S113 journey; an S145 Focus journey at 5,328 ms against the 5,000 ms default) and passed on one unchanged rerun.
Exact CI 36929714817 passed on 1402e51b (quality, unit, firestore, policy-build, verify).
One application build a3736e14-99d5-428f-bc0c-74673f48cdc1, successful at 2026-10-01T22:09:48.058Z.
Candidate receipt 0917204b-1fb4-4e62-8989-f97273ef9e8e issued 2026-10-01T22:14:46.913Z.
Promotion verified 2026-10-01T22:15:27.458Z.
Observation: two checkpoints, 419,630 ms; all 312 records matched, zero discrepancies.
Monitoring: zero candidate 5xx and unresolved live effects during the observed window.
Eleven independent readback sections matched at 2026-10-01T22:22:18Z; exactly one candidate authorized
domain; serving answer/classify model gemini-3.1-flash-lite on the global location.
Live check at 2026-10-01T22:22:51.669Z: version verified before and after; 4 questions asked (limit five), 4 answered and 4 saved to history, 4 model calls in the question window (at most one per question); after a fresh browser context the history listed 3 of the three new conversations and reopened 2 stored turns, all labelled historical, with 0 model calls; one structured saved question was saved, pinned and unpinned and stayed listed, with 0 model calls; one current run answered through `stored_plan` with 0 model calls and 1 `stored_plan` log line, keeping the earlier answer; requests: 101 reads, 4 questions, 8 history writes, 3 saved-question writes, 1 run and 0 refused; no other write left the browser.
Recovery target pmi-kc-app-recovery-729d5716bc5e4e61, Sheet=false.
Recovery receipt 6017fa6e-dd24-451e-b234-4f14119986b0 at 2026-10-01T22:05:19.378Z.
Captured predecessor pmi-kc-app-recovery-0aa79bfe784c47d2 / 2b53c5d5d889280d1fa0dc6aa1da3dc3e601d9d0, Sheet=false.
Interim run 98f7e743: build 75cc1c9b-0bac-48de-a762-ef3a39dbbbf6 (2026-10-01T19:11:40Z), candidate
receipt 06c73cc7-4a80-4229-925f-f0478e3300de, promotion verified 2026-10-01T19:18:35.092Z,
observation 414,515 ms with 312 of 312 records, readbacks 2026-10-01T19:27:07Z.
Run 729d5716 needed no traffic rollback; run 0aa79bfe's verified rollback is recorded above.
Older Sheet=true revisions remain invalid direct restore targets.
Original completed runs and all failed reports remain preserved with their actual outcomes.
Evidence: docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md.
Batch 003 evidence: docs/evidence/renewal-focus-batch-003-validation-2026-10-01.md.

## Remaining boundaries

B-DL1, B-DL2, B-DL3, B-S100, B-MNT1 and B-AUTH2 remain open at their exact external or human
boundaries; B-MNT2 closed by owner decision on 2026-10-01. Actual customer draft/form accuracy,
approved notice-timing basis, Rhino wording/applicability, selected real cases, observed
walkthroughs, human screen-reader and desktop full-page zoom verdicts remain unverified. Live
staff-record saves and Gmail or provider effects from Focus remain unverified. Batch 004's human
verdicts are NOT RUN and live knowledge answers were outside its bounded live check. Release
observation margin: run 729d5716 passed 0.37 s inside the fixed 420 s evidence deadline and run
0aa79bfe missed it; the slow live-source routes predate batch 004 (owner decision to change). Both Dotloop keys stay closed; signatures and provider acceptance remain
separate. S36 stays behind complete S100. S121 was excluded. Historical K unit-store target/marker
effects remain UNVERIFIED; absent Data Access logs do not prove zero effects. No customer
draft/send, paid comparison, provider-proof rerun or synthetic production record was authorized for
this release.

One earlier development-only moderate Firebase CLI/PubSub/OpenTelemetry advisory chain remained absent
from all 194 runtime traces. PR #95 patched the later `@grpc/grpc-js` production audit failure, and PR #104 a Hono advisory.
Earlier emulator lock contention remains recorded; passing final checks do not establish
a durable flakiness fix or a general production performance SLO.

## Continuation

Next: the owner's one Admin confirmation of the released S108 import (B-MNT1); the owner's B-AUTH2
decision (probe stopped at 16.06 h; WSL CLI/ADC re-enrolled 2026-10-02 about 08:24Z); after the owner's B-S100 ticket, link and sync, verify the resident mapping read-only and
open the bounded draft proof window. Future external/human work requires its actual inputs and
existing exact-effect contracts. Consumed permits and historical receipts cannot admit another
deployment. No feature batch is queued; batch 004 is released and verified.
