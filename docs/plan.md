# Current plan

Updated: 2026-10-02 (UTC). Batch 004 (S146–S151) and S108's import are verified deployed by runs `98f7e743` and `729d5716`, with its corrective read-order repair by run `0eb2cfeb`, on top of request 001, batches 002–003, the thirteen-feature batch and confirmed adversarial repairs.

## Direct maintenance request 001: released

The owner supplied `pmi-new-features-9-30/001-governance-simplification-and-unattended-auth-renewal.md`
and explicitly directed implementation, push and merge to main, now completed. Scope was existing router,
authentication and runner-local release controls; no application/provider effect is needed.
The source's reported eight-hour failure is not a verified credential lifetime. On this host,
a fresh approved WSL `auth:ensure -- --unattended` verified CLI/ADC refresh and GitHub access
under the exact managed identity. A fresh read-only Cloud Run describe confirmed the recorded
production revision still receives 100% traffic. An earlier failed probe is historical, not
current readiness.

Falsify the correction with focused checks: an older enrollment with currently usable CLI/ADC
must pass release preflight; an empty, duplicate, unordered or non-ancestral queue must still fail,
while a newly authorized one-suite queue can pass. Prepared permits still expire, while one
admitted exact run survives credential renewal. A pre-dispatch authentication hold must park once
and re-probe only after enrollment changes; in-flight effects keep reconciliation and operator
resume. Permission denial and unknown probe failures must not masquerade as token expiry.

Focused tests, `bash scripts/verify.sh` and host read-only checks passed. PR #92 merged at
`41ad65cb` on 2026-09-30. New production dependency resolutions needed for the mandatory audit
require a separately gated Cloud Run release. Its run `dc4e1ac8-d8b9-4090-9258-e2ddb18f119f`
built a zero-traffic candidate and blocked at assurance when live renewal routes exceeded the
30-second canary navigation bound; the admitted permit expired unused. By owner decision on
2026-10-01, PR #107 applied PR #93's 60-second bound to those two routes (PR #93 was closed
unmerged), and run `ab803f8a` released request 001 with batches 002 and 003. The previous
release's consumed permit remains historical.

## Markdown batch 002: released

All seven supplied requests 002–008 were read in order, mapped to S135–S141 and registered as
`ready` in `docs/feature-suites/README.md`. The owner clarified that email requests 006–007 cover
all existing workflow-linked draft screens. S110 and the existing email paths are the verified
baseline until the batch 002 release. S88–S93/S101's
overlapping unimplemented plans are superseded for this scope and cannot restart automatically.
Preserve S87/S94/S95 as separate proposals. On 2026-09-30 the owner explicitly instructed
execution of batch 002, then batch 003, through implementation, mainline merge and deployment,
with one cumulative release at the end of each set. PR #95 merged the production audit patch at
`dc493dfe`; S136 (PR #96), S135/S137/S138 (PR #98) and S139/S140 (PR #99, `f43629aa`) merged
after full local gates and exact CI. S141's local evidence is recorded. Run `ab803f8a` released
batch 002 with batch 003 on 2026-10-01; S141's production inference cells were not run.

## Markdown batch 003: released

S142–S145 are merged (PRs #101, #102, #103 and #105) and the acceptance run's FV-01 to FV-102
ledger is in `docs/evidence/renewal-focus-batch-003-validation-2026-10-01.md`. By owner decision on 2026-10-01, batches 002 and 003 shipped in one
cumulative replacement run with PR #93's two-route 60-second canary bound: run `ab803f8a` at
`2ec46806`. The read-only production Focus check (`scripts/check-production-focus.ts`) passed on
the exact serving revision with zero mutation attempts.

The four supplied requests 009–012 were read in order and registered as S142–S145, all `ready`.
S113/S127, the evidence process, manual cycle state and existing action services are the verified
baseline; the new graph projection, additive Focus view, in-pane execution and regression pass are
the remaining delta. No earlier completed/superseded suite restarts, and S135–S141 AI work is not
a dependency. The owner's 2026-09-30 instruction carries its clarified scope through
implementation and authorized delivery without per-feature consent, subject to router gates and
actual external-effect inputs. Its work starts in an isolated checkout once batch 002 is released
or under observation.
The documentation checks passed. The production dependency audit failure that first held this
intake was remediated separately by PR #95 before it was committed. Do not use the pending 001
release permit as an intake approval.

## Markdown batch 004: released

The six supplied requests 013–018 were read in order and registered as S146–S151, all `ready`, on
2026-10-01. S138's conversation engine, S135/S137 access and context, S136's model, the knowledge
path and the existing approval, connection, process and renewal screens are the verified baseline.
The delta is an AI-first Dashboard without a process step (S146), five panel moves with one compact
attention queue (S147), owner-scoped server-side history (S148), saved and pinned questions (S149),
a model-free structured rerun (S150) and integrated validation (S151). Build order: S146 with S147,
then S148, S149 and S150, with S151's checks built alongside; one cumulative release was planned at the end.

Owner decisions on 2026-10-01: Anticipated work moves to Internal Processes, and the
post-deployment check may ask at most five read-only questions as the owner. Constraints recorded
at intake: `/api/assistant/query` stays a read, persistence uses separate owner-scoped routes,
verification accounts stay effect-free, and `firestore.rules` and `lib/auth` do not change. The
owner started the run on 2026-10-01.

S146/S147 (PR #111), S148 (PR #112), S149/S150 (PR #113) and S151 (PR #115) merged after full
local gates on their exact heads and exact CI. During the run the owner directed an interim
no-downtime release for a client call: run `98f7e743` shipped S108 and S146–S148 at `2b53c5d5`,
and run `729d5716` shipped S149–S151 at `1402e51b`. The owner's bounded live check passed on that
revision; run `0eb2cfeb` released the corrective read-order repair on 2026-10-02. The AF-01 to AF-70 ledger is in
`docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md`; AF-67 (one cumulative
candidate) is No by the owner's direction.

## October lease-renewal simplification and mobile: implemented, awaiting release

S152–S167 are owner-confirmed full change specifications under renewal-simplification-mobile-2026-10 in docs/feature-suites/README.md. They extend the deployed owners; completed suites are not requeued. Product decisions are embedded, including intentional Sheet-policy and ordinary-staff access changes.

The owner's execution prompt of 2026-10-02 started the program. It was built in the registered dependency order on one branch (S167 access, S154/S155 workability and autosave, S157 working values, S158 Sheet lookup, S159 switch and tooling, S156 staff lane, S160 source actions, S153 rent meanings, S152 views, S161–S163 messages, S164 Status log, S166 links and preferences, S165 mobile throughout) by eleven bounded worker slices merged into the program head `9439c0fc`. Shared foundations: a lease-bound working record (`lease_renewal_working_records`), `effectiveRenewalTerms` (working values over recorded owner terms), `operationalCurrentRent` (working, single rent charge, then contractual), the `s156-staff-lane` desk row contract that the production reconciliation oracle verifies, and `lib/production-assurance/sheet-writeback-expectation.mjs` as the one reviewed Sheet switch expectation. Removed gates: cycle start and reviewed-cycle checkboxes, Save buttons for ordinary fields, business approvals (`approve_pricing_suggestion`, `resolve_reconciliation`, `approve_source_write`, `execute_source_write` are Editor work), owner/tenant acceptance prerequisites for RentVine future rent, the blanket Sheet pause, the Sheet-first ordering of the retired generic write-back route (now Admin-only `google_sheets.renewal_checklist.writeback`), and per-Space staff allowlists. Kept: exact preview and confirmation of every external effect, target/value/timing checks, one-attempt claims, receipts, readback and recovery; Admin user management; Vendor scope; verification-account refusals; private account records; closed and retired keys closed; `firestore.rules` deny-all with the new collections' rules.

Release plan: one cumulative run through the existing machinery after exact main CI on the merged head, with the candidate and promoted revision reading `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=true` and the recovery target keeping the captured predecessor's actual value. No provider mutation, live customer draft, paid comp request, synthetic production record or new proof target is part of the release. After verified completion: independent readbacks, the suite dispositions in docs/feature-suites/README.md, and the owner's optional phone redirect step (A7).

## Outcome

Run `0eb2cfeb-a238-4b37-b35f-f999eadfacff` released batch 004's corrective repair (two queued items: the S147 Dashboard lease read order and the S151 answer-position smoke) at `df772b30c60043d5fe4c57ff2275990d18a535b3` / `pmi-kc-app-rmur4a2vc-185ba8b9f3b8` with 100% production traffic.
Run `175fee1d` first carried the same code at `7d2181bf`; its immediate observation checkpoint failed while Cloud Run still routed some requests to the untagged predecessor, which answered them with 500s, so it rolled back (verified, no downtime).
Batch 004 itself (S108 and S146–S151) shipped in runs `98f7e743` and `729d5716`; the batch 004 evidence ledger records those runs and run `0aa79bfe`'s verified rollback.
Exact [CI 37025320585](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/37025320585) passed.
The gate on tree-identical PR head `14087b40` passed 7,894 unit tests, four existing skips, all 273 backend tests and 32 core E2E tests.
One application build `802d851f-54cb-42a2-aedf-80d04e2142de` succeeded at 2026-10-02T15:42:16.516Z.
Candidate receipt issued 2026-10-02T15:48:28.020Z; promotion verified 2026-10-02T15:48:53.296Z.
Observation passed two checkpoints in 396,284 ms against the required 300,000 ms, inside the 420,000 ms evidence deadline. All 312
source/projected/rendered records matched with zero discrepancies, candidate 5xx or unresolved live effects.
Eleven independent readback sections matched, last at 2026-10-02T15:55:53Z. The owner's bounded AI history live check
passed on batch 004's revision `pmi-kc-app-rmuq2qvcc-8074bfd97707` and was not rerun.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=false are verified.
Tag `cand-rmur4a2vc-185ba8b9f3b8`; fingerprint `sha256:1e4fbc10f3abad951f40b37b07d47d526f67e30334ac237d148b0e7c63a7a6e2`.
No business mutation was used as proof. Failed attempts remain failed in their preserved evidence.
Editor browser coverage remains `not_run` under the approved Admin-only contract.

## Current implementation baseline

Run `0eb2cfeb` added batch 004's corrective repair; the gate on its release head passed 7,894 unit
tests and 273 backend tests. Runs `98f7e743` and `729d5716` added S108 and batch 004
(S146–S151); the gate on the final batch 004 head passed 7,887 unit tests and 273 backend tests. Run `ab803f8a` added request 001 and
S135–S145 to the deployed baseline; the gate on its
tree-identical PR head passed 7,738 unit tests and 241 backend tests. For the thirteen-feature
batch, the final application gate passed 7,462 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

S113's full lease dashboard and S114–S120 remain carried in the deployed batch. S96 — safe connector disconnect and reconciliation remains deployed. S82/S97/S98 and S102–S110 retain their
contracts. The app preserves normal Sheet append/field-update implementation but S128 pauses its
dispatch; it refuses row deletion and historical restore. Both Dotloop keys remain closed.
Document presence is not verified provider content or signature completion.

- S128: Pause operating-Sheet writes while retaining reads and app-owned work.
- S123: Retain unfinished renewal cycles when source dates change.
- S124: Review move-out notices and prevent non-renewal outreach.
- S134: Show, sort and filter color-coded lifecycle status with text labels.
- S122: Expose all authorized leases and explicit worklist views.
- S125: Review notice timing using an explicitly approved date basis.
- S126: Present dates consistently as month/day/year.
- S127: Explain blockers and focus the next permitted action after a verified save.
- S131: Prepare conditional Rhino-policy support for approved material.
- S129: Prepare governed owner/tenant drafts for real-case review.
- S130: Prepare approved form bytes, comparison, download and exact-output approval.
- S132: Prepare walkthrough preflight, scripts and evidence recording.
- S133: Provide the bounded external maintenance-agent assessment and decision packet.

## Verified corrective review

Five confirmed adversarial findings are repaired and verified deployed: lifecycle uncertainty, policy calendar validation/presentation, source-upload hygiene, vulnerable production dependencies and return-navigation transport. All repairs passed focused regressions, full application verification, exact main CI and cumulative release gates. Independent source/runtime readbacks and all six guarded remote product checks passed. The same runner performed the authorized repairs; this is not an independent second-review signoff. See [the adversary review](evidence/adversary-review-2026-09-29.md).

All four original corrections and A06 passed focused falsification, full verification, exact
CI and cumulative deployment. The final guarded browser supplement passed the native
return path. Independent readbacks bind the serving revision to the exact tested source.

## Canonical closure sequence

1. Completed G1–G7 repairs and all 118 litmus references retain exact engineering and compiled
   evidence in the batch audit. The final full application gate and exact-main CI passed.
2. The release lock, admitted exact-run permit, one-build claim and immutable failed evidence
   governed the cumulative replacement. The final run passed recovery preparation, candidate
   smoke/configuration/domains, Admin assurance, source reconciliation, receipt-bound promotion
   and the complete observation. No old failed result or frozen source was substituted.
3. Independent canonical/tagged identity, 100% traffic, reviewed fingerprint, Production/Live,
   eleven paired Space maps, Demo=false, Sheet=false and one candidate domain passed readback.
   The guarded supplement passed inventory, dates, lifecycle controls, notice evidence,
   issue/pause presentation and native return navigation with its exact query and zero diagnostics. No live business effect was
   needed to demonstrate the engineering contracts.
4. The cumulative corrective queue is cleared after independent final verification. Pinned tests,
   Prettier and document gates govern its documentation/test-only closure commit; the release
   classifier must read no deployable changes. The completed permit stays consumed.

### External and human closure work

External and human holds (Dotloop B-DL1–B-DL3, B-S100, B-MNT1, B-AUTH2, the notice-timing
basis, the release Admin browser sign-in and human verdicts) are listed once, with their exact
owner steps and runner follow-ups, in `docs/open-blockers.md`. Each blocks only its named effect;
none blocks development, tests, merges or releases.
Closing a hold still requires its actual input and separate effect authority; tests cannot
invent them.

## Authority and closed decisions

The September 29 owner authorization covers necessary Cloud Build/Cloud Run release actions,
diagnosed and verified repairs, resumes, cumulative replacements, promotion, receipt-bound rollback
and documentation closure through this batch's verified delivery. Another repaired attempt alone
does not require renewed approval. All technical and safety gates remain mandatory.

Completed S97-S99 and S100 chat proofs are not rerun. No customer send, synthetic production
record, paid comparison, signature claim or new action-key grant is part of this release.
The only approved source-read persistence is lease-bound version/hash/time approval invalidation;
it records no workflow milestone, provider write or customer draft. Provider effects otherwise
retain exact human preview/confirmation, one bounded attempt, receipt/readback and correction.

Do not alter billing, budgets, guardrails, security settings, identity or claims to remove friction.
Never handle a password, code, passkey or CAPTCHA. A genuine enrollment challenge needs the owner;
an unresolved cloud operation needs diagnosis, not redispatch. Protected-path rules remain.
Admin-only browser assurance retains Editor `not_run` and all backend role restrictions.

## Per-suite delivery rule

ALL_GATES_GREEN applies to the batch's verified engineering and release scopes. Actual customer
accuracy, legal/policy input, provider acceptance and human observations retain their independent
verdicts and owners above. Staff evidence never becomes a provider receipt or signature proof.
S87 — final six-cohort product-wide content reconciliation retains its existing dependencies.
S36 is queued behind complete S100; S121 was not included in the deployed thirteen-feature batch.
