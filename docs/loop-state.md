# Loop state

Last updated: 2026-10-01 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

RELEASED (interim, owner direction 2026-10-01): S108 and batch 004's S146–S148.
Run 98f7e743-7345-4b74-a6a8-675fe9fac31f; serving SHA 2b53c5d5d889280d1fa0dc6aa1da3dc3e601d9d0.
Revision pmi-kc-app-rmupw50tc-8189b32d3395; tag cand-rmupw50tc-8189b32d3395; traffic 100%.
Fingerprint sha256:dc8804339fe5d29c0c1699e75ce30f40e0c15bf2031989421075ccaf33799da2.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=false.
Its first recovery assurance failed on a cold first render; a read-only diagnostic canary on the
0% recovery target passed and the same-run resume passed every later phase (observation 414,515
ms, 312 of 312 records matched; eleven readback sections, none unverified). Production traffic
never left a verified revision. The full closure of this run's records follows batch 004's second
release; until then status, plan, facts and the handoff still describe run ab803f8a.
Request 001 run dc4e1ac8 (`41ad65cb`) and batch 002 run 6eb157e1 (`b1c6135c`) blocked when live
renewal routes reached the 30-second canary navigation bound; both were archived as superseded.
OWNER DECISION, 2026-10-01: PR #93's 60-second bound for the two live renewal routes only (merged
via PR #107; PR #93 closed unmerged) and one cumulative replacement run for batches 002 and 003.
That run's first recovery assurance failed on a cold first Dashboard render (37.4 s against its
30-second bound); a diagnosed same-run resume passed every later phase.
OWNER UNBLOCK PASS, 2026-10-01: B-MNT2 closed (Vendoroo's ROO via RentVine, no connector).
B-MNT1: owner chose RentVine's per-property maintenance limits (30 of 121); the Admin import
`82e49596` awaits release, then one Admin confirmation. B-S100: owner chose work order 101756
(id 1756); the owner creates its ticket, links id 1756 and syncs once. B-DL1: Dotloop approved API
access on 2026-09-10; the owner creates the integration account and replies. B-AUTH2: probe running.

## Awaiting release

1. S149 Saved and pinned questions (batch 004): `129c833ea54605fc607c825922624439bdc935e9`.
2. S150 Answer reuse and structured rerun without model calls (batch 004): `129c833ea54605fc607c825922624439bdc935e9`.
3. S151 Integrated validation checks and the owner's bounded live check (batch 004): `8552430886d3cd402bd7befda1abc1f86a3f8c24`, `404abdf3e7fa74565d0630c24f89ad12a15d05cf`, `b9d3d1d7bd3f9c28413e9d7edc65ae9a3576098e`.

Run 98f7e743 shipped S108 and S146–S148 by owner direction (2026-10-01), so batch 004 ships in two
candidates. The bounded live check runs after this second release. One candidate carries the
queued items. Admit only after exact main CI on the release head, fresh prerequisites
(a fresh owner WSL enrollment if the 2026-10-01 one has expired) and a new run-bound permit. No
provider effect, key or activation is queued. S121 remains excluded.

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
Intake started no code, release or provider effect; execution waits for the owner's explicit start.

## Verified evidence

Gate on PR head 7a61bf77 (tree-identical to 2ec46806): 7,738 unit tests, four existing skips,
241 backend tests, test:e2e:core 31 passed (18 existing skips), production audit 0 findings.
Exact CI 36860571425 passed on 2ec46806 (quality, unit, firestore, policy-build, verify).
One application build 326619ba-29a6-4aea-b753-bfcac0f543c4, successful at 2026-10-01T12:39:58.352Z.
Candidate receipt 631f297e-bb65-43e8-b625-4fda3bcf6424 issued 2026-10-01T12:46:11.864Z.
Promotion verified 2026-10-01T12:46:30.426Z.
Observation: two checkpoints, 392,911 ms; all 312 records matched, zero discrepancies.
Monitoring: zero candidate 5xx and unresolved live effects during the observed window.
Eleven independent readback sections matched at 2026-10-01T13:02:41Z; exactly one candidate
authorized domain; serving answer/classify model gemini-3.1-flash-lite on the global location.
Production Focus check at 2026-10-01T12:56:15Z: three live lease workspaces, Full view default,
pointer/keyboard/phone round trips unchanged, zero app or write requests, navigations or page
errors, no horizontal scroll at 390 px or 1440 px, zero mutation attempts.
Recovery target pmi-kc-app-recovery-ab803f8a4ffb4568, Sheet=false.
Recovery receipt 17ad830b-c2cc-46b6-aa74-77c0d088237f at 2026-10-01T12:33:52.991Z.
Captured predecessor pmi-kc-app-rmundpf2v-249c945f2220 / c541db723d3622234956a16e95765867733427cf, Sheet=false.
No traffic rollback occurred. Older Sheet=true revisions remain invalid direct restore targets.
Original completed runs and all failed reports remain preserved with their actual outcomes.
Evidence: docs/evidence/renewal-focus-batch-003-validation-2026-10-01.md.
Batch 002 evidence: docs/evidence/connected-ai-batch-002-validation-2026-09-30.md.

## Remaining boundaries

B-DL1, B-DL2, B-DL3, B-S100, B-MNT1 and B-AUTH2 remain open at their exact external or human
boundaries; B-MNT2 closed by owner decision on 2026-10-01. Actual customer draft/form accuracy,
approved notice-timing basis, Rhino wording/applicability, selected real cases, observed
walkthroughs, human screen-reader and desktop full-page zoom verdicts remain unverified. Production
AI inference, signed-in Dashboard parity, live staff-record saves and Gmail or provider effects from
Focus remain unverified. Both Dotloop keys stay closed; signatures and provider acceptance remain
separate. S36 stays behind complete S100. S121 was excluded. Historical K unit-store target/marker
effects remain UNVERIFIED; absent Data Access logs do not prove zero effects. No customer
draft/send, paid comparison, provider-proof rerun or synthetic production record was authorized for
this release.

One earlier development-only moderate Firebase CLI/PubSub/OpenTelemetry advisory chain remained absent
from all 194 runtime traces. PR #95 patched the later `@grpc/grpc-js` production audit failure, and PR #104 a Hono advisory.
Earlier emulator lock contention remains recorded; passing final checks do not establish
a durable flakiness fix or a general production performance SLO.

## Continuation

Next: release the queued S108 import (`82e49596`) under a fresh enrollment; read the B-AUTH2
probe; after the owner's B-S100 ticket, link and sync, verify the resident mapping read-only and
open the bounded draft proof window. Future external/human work requires its actual inputs and
existing exact-effect contracts. Consumed permits and historical receipts cannot admit another
deployment. Batch 004 (S146–S151) is registered and ready; its execution waits for the owner's
explicit start.
