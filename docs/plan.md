# Current plan

Updated: 2026-10-04 (UTC). Batch 005 is active under the named owner implementation and cumulative-release instruction. The S152–S167 program is verified deployed by run `47fabb7c`. Batch 004 (S146–S151) and S108's import are verified deployed by runs `98f7e743` and `729d5716`, with its corrective read-order repair by run `0eb2cfeb` and the S113 approval-read fix by run `3a32f7a2`, on top of request 001, batches 002–003, the thirteen-feature batch and confirmed adversarial repairs.

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
Revised S87 is active under the named batch 005 execution; S94 stays a separate proposal and S95 is superseded by S146/S147. On 2026-09-30 the owner explicitly instructed
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

## October lease-renewal simplification and mobile: released

S152–S167 are owner-confirmed full change specifications under renewal-simplification-mobile-2026-10 in docs/feature-suites/README.md. They extend the deployed owners; completed suites are not requeued. Product decisions are embedded, including intentional Sheet-policy and ordinary-staff access changes.

The owner's execution prompt of 2026-10-02 started the program. It was built in the registered dependency order on one branch (S167 access, S154/S155 workability and autosave, S157 working values, S158 Sheet lookup, S159 switch and tooling, S156 staff lane, S160 source actions, S153 rent meanings, S152 views, S161–S163 messages, S164 Status log, S166 links and preferences, S165 mobile throughout) by eleven bounded worker slices merged into the program head `ba3f9719`. Shared foundations: a lease-bound working record (`lease_renewal_working_records`), `effectiveRenewalTerms` (working values over recorded owner terms), `operationalCurrentRent` (working, single rent charge, then contractual), the `s156-staff-lane` desk row contract that the production reconciliation oracle verifies, and `lib/production-assurance/sheet-writeback-expectation.mjs` as the one reviewed Sheet switch expectation. Removed gates: cycle start and reviewed-cycle checkboxes, Save buttons for ordinary fields, business approvals (`approve_pricing_suggestion`, `resolve_reconciliation`, `approve_source_write`, `execute_source_write` are Editor work), owner/tenant acceptance prerequisites for RentVine future rent, the blanket Sheet pause, the Sheet-first ordering of the retired generic write-back route (now Admin-only `google_sheets.renewal_checklist.writeback`), and per-Space staff allowlists. Kept: exact preview and confirmation of every external effect, target/value/timing checks, one-attempt claims, receipts, readback and recovery; Admin user management; Vendor scope; verification-account refusals; private account records; closed and retired keys closed; `firestore.rules` deny-all with the new collections' rules.

Release: run `47fabb7c` shipped the program on 2026-10-03 in one cumulative candidate at `e106a88a` through the existing machinery after exact main CI. The promoted revision reads `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=true` and the recovery target keeps the captured predecessor's actual value (false). Run `a83ed59b` had stopped at candidate assurance because the release canary still required the lease's Full view on open; PR #128 corrected that contract and the stopped run is archived as superseded. No provider mutation, live customer draft, paid comp request, synthetic production record or new proof target was part of the release. Independent readbacks passed and the suite dispositions are in docs/feature-suites/README.md. Remaining: the owner's optional phone redirect step (A7) and the two owner decision candidates in docs/open-blockers.md.

## Application usability and reliability — batch 005: active

The owner accepted all October 4 recommendations, then supplied the named implementation and
cumulative-release launch. Canonical handoff: application-usability-reliability-2026-10 in
docs/feature-suites/README.md, intake orders 035–049. Selected specs are S168–S181 and revised S87
(fifteen changes, 116 traceable requirements). Authoring started no execution; the later named
launch now authorizes this program through its existing engineering and release gates;
the released queue is empty and its permits remain consumed.

Current input evidence: source/tests, a completed guarded Admin pass reading the e106a88a serving
version with zero mutation attempts, a bounded read of nine feedback records and successful approved
WSL CLI/ADC refresh. Initial screens establish no benchmark, persistence/failure/AI/human verdict.
The program's current evidence limits and all accepted product decisions are in its canonical
section. Preserve deployed S135–S167 behavior, ordinary-staff renewal work, private account scope,
Focus default, working values/autosave, Status log, true Sheet switch and all exact action contracts.

Execution design: S180 feedback intake and S181 checks begin with S168 measurement; S169 establishes
shared state before S170/S171 consumers; S172 guides S173/S174, with S177 preference schemas designed
alongside resizing; S175 and revised S87/S176 make current workflows readable; S178 lookup and S179
legacy setup retirement close their own deltas. Finish S180 feedback reconciliation and S181
integration. Use green bounded slices and one cumulative gated production release carrying all
selected changes, never fifteen releases. Every missing behavior gets expected fail-first evidence;
already-satisfied requirements get preservation evidence. Existing release-canary opening landmarks
change in the same slice as route defaults.

Clear filters removes typed searches/filter criteria and keeps sort/layout. Reset view restores the
current table and related layout, not other tables or data. Typed searches and desktop sizing are
private account-owned additions to S166; responsive clamping never saves over desktop intent.
Identity lookup returns all relevant accessible lease matches with real app links and only trusted
RentVine shortcuts; no name-based provider join or guessed URL. Feedback never queues unrelated work
or silently removes inactive records. Rental permits, move-out business workflow redesign and a
public website shortcut are accepted next-batch deferrals.

No new provider activation, protected-path grant, identity/claim, send, budget/guardrail or external
proof target is part of this program. Missing inputs and human observations retain scoped states;
independent work proceeds. No material product clarification remains. Final focused/native full/core gates, whole-route/zoom/accessibility matrix and six-owner/publication recovery pass. All independent engineering requirements are verified; green main/exact CI and the cumulative release/end-feedback/deployed closure remain. Actual scope/results are in docs/evidence/application-usability-batch005.json.

## Outcome

Run `47fabb7c-b26b-4032-b993-f6bc49c66abd` released the S152–S167 program (one queued item: lease-renewal simplification and mobile, sixteen suites) at `e106a88a50d541b4a012111019b09c2183f6ce20` / `pmi-kc-app-rmusp7ehl-7ea8703905ca` with 100% production traffic.
Run `a83ed59b` first carried the program at `b11f5fe0`; it stopped at candidate assurance because the release canary still required the lease's Full view on open while S152 opens a lease in Focus view. It never changed traffic and is archived as superseded; PR #128 corrected the canary's lease-workspace contract.
The release before it, run `3a32f7a2` (the S113 approval-read fix at `090df5e16f54eadbd1a3afbf20836c6677fa2a19` / `pmi-kc-app-rmurivuzf-c061dc669374`, 2026-10-02), is this run's captured predecessor.
Exact [CI 37142116030](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/37142116030) passed.
The gate on tree-identical PR head `1b0df6fd` passed 8,541 unit tests, four existing skips, all 319 backend tests and 32 core E2E tests.
One application build `e8264109-67cd-4414-9d2b-c897f027c905` succeeded at 2026-10-03T18:13:16.303Z.
Candidate receipt issued 2026-10-03T18:26:00.305Z; promotion verified 2026-10-03T18:26:19.642Z.
Observation passed two checkpoints in 387,784 ms against the required 300,000 ms, inside the 420,000 ms evidence deadline. All 312
source/projected/rendered records matched with zero discrepancies, candidate 5xx or unresolved live effects.
Eleven independent readback sections matched, last at 2026-10-03T18:32:54Z. A read-only production Focus check then passed on
three lease workspaces: Focus view is the default, with zero mutation attempts.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=true are verified.
Tag `cand-rmusp7ehl-7ea8703905ca`; fingerprint `sha256:7061589ec47f2338497f9efd9dea1817dfdcc6f2ba4192b30b573e35d725448b`.
No business mutation was used as proof. Failed attempts remain failed in their preserved evidence.
Editor browser coverage remains `not_run` under the approved Admin-only contract.

## Current implementation baseline

Run `47fabb7c` added the S152–S167 program; the gate on its tree-identical PR head passed 8,541
unit tests and 319 backend tests.
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
contracts. S159 supersedes S128's global pause: production reads the reviewed true switch for normal
Sheet append/recognized-field updates under existing exact contracts; it refuses row deletion and historical restore. Both Dotloop keys remain closed.
Document presence is not verified provider content or signature completion.

- S128: Historical operating-Sheet pause, superseded by released S159; reads and app-owned work remain.
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

1. The current S152–S167 release at e106a88a passed the full application/core-E2E gate and exact
   main CI 37142116030. Earlier G1–G7 and 118 litmus references retain their actual evidence scopes;
   no completed proof or historical failure is relabelled.
2. Run 47fabb7c's exact-run permit, release lock and one-build claim governed recovery preparation,
   zero-traffic candidate smoke/configuration/domains, Admin assurance, source reconciliation,
   receipt-bound promotion and the full two-checkpoint observation (387,784 ms). Failed cold-target
   attempts and the superseded a83ed59b run retain their actual records.
3. Current independent canonical/tagged identity, 100% traffic, reviewed fingerprint,
   Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=true matched. The recovery
   target keeps the captured predecessor's actual Sheet=false. All 312 records and eleven readback
   sections matched; guarded Focus checks passed with zero mutation attempts.
4. That queue and permit are consumed. Batch 005 is active under its named launch and
   needs its own exact green cumulative queue, fresh prerequisites/locked GO and run-bound permit.
   A documentation-only authoring commit does not deploy.

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
and documentation closure through the thirteen-feature batch's achieved verified delivery. The October 4 named launch separately carries batch 005 scope under the current feature-run continuity rule. Another repaired attempt alone
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
S87 — final six-cohort product-wide content reconciliation is active in batch 005; the accepted current scope retires its old fixed block manifest and S36/S88–S95 dependencies. Preserve deployed Dashboard composition and delegate renewal copy to S176.
S36 is queued behind complete S100; S121 was not included in the deployed thirteen-feature batch.
