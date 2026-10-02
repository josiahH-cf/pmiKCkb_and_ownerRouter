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

1. S147 Dashboard lease read order (batch 004 corrective repair; release-check margin): `ad230cde51035a8da67f84fa23a2cad9c695f108`.
2. S151 browser smoke measures answer position: `c547302daa5a2956276ce67899deb0d3563cf265`.

OWNER DIRECTION, 2026-10-02: clear the remaining blockers and leave production on `main`. One
candidate carries both items; runs 98f7e743 and 729d5716 consumed batch 004's own queue and
permits. Admit only after exact main CI on the release head, fresh prerequisites and a new run-bound
permit. No provider effect, key or activation is queued. S121 remains excluded.

## Feature intake

S152–S167: full owner-confirmed specifications, ready / not implemented. Canonical program:
docs/feature-suites/README.md, handoff renewal-simplification-mobile-2026-10.
October 2 request is authoring/registration plus an outside-model prompt; no implementation,
auth/test/live probe, provider effect, commit/push or release was performed for this intake.
The owner supplies the execution prompt to start this exact program; completed owners are not requeued.
Existing awaiting-release repairs and their run/lock/permit remain separate and must be preserved.

Request 001 and batches 002–004 (S135–S151) are released; their actual evidence is in docs/facts.md
and the registered evidence ledgers. Focus/in-pane work is deployed; the new program changes its
default, workflow/access gates, working persistence, Sheet policy and whole-app mobile usability.

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
deployment. Batch 004 is released and verified; its corrective repair waits under Awaiting release.
