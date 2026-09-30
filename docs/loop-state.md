# Loop state

Last updated: 2026-09-30 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

RELEASED: all thirteen implementations and all five confirmed adversarial repairs are deployed.
Run 89e38cd9-b6dd-498f-be87-1963e0ed2d03; serving SHA c541db723d3622234956a16e95765867733427cf.
Revision pmi-kc-app-rmundpf2v-249c945f2220; tag cand-rmundpf2v-249c945f2220; traffic 100%.
Fingerprint sha256:e6a481aeb691991fe38f89bc0d25f40bb73c67de7d1e639e89f2cb5e8c4d0eaa.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=false.
Request 001 run dc4e1ac8-d8b9-4090-9258-e2ddb18f119f (`41ad65cb`) built zero-traffic candidate
pmi-kc-app-rmuo61wve-fcdc2fc4b0d0, then blocked at assurance before receipt or promotion: live
renewal routes exceeded the 30-second canary navigation bound. Its admitted permit expired
unused; operator resume is required and failed evidence stays preserved outside Git. Draft PR
#93 proposes a 60-second bound for two renewal routes and awaits owner review.

## Awaiting release

1. 001 governance/auth continuity and patched dependencies: `474e5d7eccc5351a04b0b0dbed3ed8360062d748`, `afb5f92884edb7ea16c2c9f1b89ca12de3297f86`.
   The owner authorized this operational change through mainline delivery; PR #95 patched the
   later production audit failure.
2. S135 Dashboard operational reads without extra AI restrictions: `6b21c7960ec1fa5d962442e98722a5fe40947afd`.
3. S136 supported low-cost Gemini on the global endpoint: `d645168dab2e43f85e2cdfa561b35dca883d9ac6`.
4. S137 shared actor-scoped operational context: `6b21c7960ec1fa5d962442e98722a5fe40947afd`.
5. S138 conversational Dashboard operations: `6b21c7960ec1fa5d962442e98722a5fe40947afd`.
6. S139 linked email draft refinement: `c1bfb09fcdba6047b74ed9a36f46dc87d0162d32`.
7. S140 optional Gemini-in-Gmail hint: `c1bfb09fcdba6047b74ed9a36f46dc87d0162d32`.
8. S141 integrated validation checks and evidence: `49f4a69596159f25bf988bdeed0b6c063e1b908e`.

One cumulative candidate carries all eight items. Admit only after exact main CI on the release
head, archiving blocked run dc4e1ac8 through the reviewed superseded-by procedure, fresh
prerequisites and a new run-bound permit. No provider effect, key or activation is queued.

The prior cumulative corrective queue is cleared and its permit consumed. S121 remains excluded.
Documentation/test-only closure must not start another deployment.

## Feature intake

Request 001 was supplied from `pmi-new-features-9-30/001-governance-simplification-and-unattended-auth-renewal.md`.
The authorized governance/auth change passed its local gate and PR #92 merged at `41ad65cb` on
2026-09-30. Its patched dependencies still need the separately gated Cloud Run release; draft PR
#93 addresses a release timing issue and is not merged. No other suite is thereby resumed. A fresh
approved `auth:ensure` during batch 002 intake returned READY for WSL CLI and ADC under
`josiah@pmikcmetro.com`. A read-only Cloud Run describe still showed the prior verified revision
`pmi-kc-app-rmundpf2v-249c945f2220` at 100% traffic and answer/classify model settings of
`gemini-2.5-flash`. No new product-route assurance or model inference was run for this intake.

Batch 002's seven Markdown files were read in supplied order and registered once as S135–S141
in `docs/feature-suites/README.md`.
The owner clarified that 006–007 apply to all existing workflow-linked draft screens. S110's
three-intent answer path and current draft flows remain the serving baseline until the batch 002
release. Overlapping unimplemented S88–S93/S101 plans are superseded for this scope;
S87/S94/S95 remain separate proposals.

On 2026-09-30 the owner explicitly instructed execution of batch 002 (S135–S141), then batch 003
(S142–S145), through implementation, mainline merge and deployment, with one cumulative release at
the end of each set. PR #95 (production audit patch and S113 journey settle fix) merged at
`dc493dfe`. S136 (PR #96), S135/S137/S138 (PR #98) and S139/S140 (PR #99) merged at `f43629aa`
after full local gates and exact CI. S141's local rehearsal evidence is in
`docs/evidence/connected-ai-batch-002-validation-2026-09-30.md`; production cells wait for the release.

Batch 003's four files 009–012 are registered once as S142–S145, covered by the same instruction
after batch 002. No prior-batch intake question remained; the owner accepts earlier
defaults. Serving Full view, one linked next action and cycle-bound manual progress are baseline;
multiple-ready dependency projection, separate Focus pane, in-pane lifecycle and its regression
validation are new work. Fresh read-only traffic check still showed the documented serving revision
at 100%; a newer candidate was not serving. `auth:ensure` returned READY for approved WSL CLI/ADC.
No Focus code, provider effect or deployment was started by this intake.
Spec-shape, traceability, active-path, freshness, policy, redaction and formatting checks passed.
The production audit failure that first held these docs was remediated by PR #95 (`dc493dfe`).

## Verified evidence

Final full gate: 7,462 unit tests, four existing skips, 234 backend tests, all checks/build.
Exact CI 36650984450 passed. All 13 correction Git blobs matched tested application/document snapshots.
One application build 83925ea5-8230-4796-a2fd-cc4f8674d02f, successful at 2026-09-30T01:00:23.252385Z.
Candidate receipt issued 2026-09-30T01:09:42.790Z.
Promotion verified 2026-09-30T01:10:01.479Z.
Observation: two checkpoints, 390,918 ms; all 311 records matched, zero discrepancies.
Monitoring: zero candidate 5xx and unresolved live effects during the observed window.
Eleven independent readback sections matched; exactly one candidate authorized domain.
Uploaded source: 2176 exact Git blobs, zero unexpected/private files, no missing runtime source
or .git pointer; all fourteen implementation commits for thirteen suites included.
Six guarded remote product checks passed, including native filtered/sorted desk return;
zero mutation attempts/diagnostics, exact pre/post binding and profile/process cleanup.
Recovery target pmi-kc-app-recovery-89e38cd9b6dd498f, Sheet=false.
Recovery receipt 4cc6d657-5f3e-4c54-bfff-48f8fd614d34 at 2026-09-30T00:54:59.331Z.
Captured predecessor pmi-kc-app-rmunbakkw-d2963016189e / 81c770fcb698b6650771f9a28c65c32a42060062, Sheet=false.
No traffic rollback occurred. Older Sheet=true revisions remain invalid direct restore targets.
Original completed runs and all failed reports remain preserved with their actual outcomes.
Evidence: docs/evidence/adversary-review-2026-09-29.md.
Original 118-reference scope: docs/evidence/batch-litmus-audit-2026-09-28.md.

## Remaining boundaries

B-DL1, B-DL2, B-DL3, B-S100, B-MNT1, B-MNT2 and B-AUTH2 remain open at their exact
external or human boundaries. Actual customer draft/form accuracy, approved notice-timing basis,
Rhino wording/applicability, selected real cases, observed walkthroughs, human screen-reader and
desktop full-page zoom verdicts remain unverified. Both Dotloop keys stay closed; signatures and
provider acceptance remain separate. S36 stays behind complete S100. S121 was excluded.
Historical K unit-store target/marker effects remain UNVERIFIED; absent Data Access logs do not
prove zero effects. No customer draft/send, paid comparison, provider-proof rerun or synthetic
production record was authorized for this release.

One earlier development-only moderate Firebase CLI/PubSub/OpenTelemetry advisory chain remained absent
from all 194 runtime traces. PR #95 patched the later `@grpc/grpc-js` production audit failure.
Earlier emulator lock contention remains recorded; passing final checks do not establish
a durable flakiness fix or a general production performance SLO.

## Continuation

Next: the batch 002 cumulative release, which carries 001's merged changes; batch 003 follows
with its own. The blocked run must be archived through the reviewed superseded-by procedure
before a new run. Future external/human work
requires its actual inputs and existing exact-effect contracts. Consumed permits and historical
receipts cannot admit another deployment.
