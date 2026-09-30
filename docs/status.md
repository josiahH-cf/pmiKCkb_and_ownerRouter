# PMI KC current status

Last updated: 2026-09-30 (UTC).

## Serving release

Run `89e38cd9-b6dd-498f-be87-1963e0ed2d03` released all thirteen features and five confirmed adversarial repairs at
`c541db723d3622234956a16e95765867733427cf` / `pmi-kc-app-rmundpf2v-249c945f2220` with 100% production traffic.
Exact [CI 36650984450](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36650984450) passed.
The final application gate passed 7,462 unit tests, four existing skips and all 234 backend tests.
One application build `83925ea5-8230-4796-a2fd-cc4f8674d02f` succeeded at 2026-09-30T01:00:23.252385Z.
Candidate receipt issued 2026-09-30T01:09:42.790Z; promotion verified 2026-09-30T01:10:01.479Z.
Observation passed two checkpoints in 390,918 ms against the required 300,000 ms. All 311
source/projected/rendered records matched with zero discrepancies, candidate 5xx or unresolved live effects.
Eleven independent readback sections and all six guarded remote product checks passed.
The actual uploaded source matched 2,176 exact Git blobs; all thirteen suites were included,
with no unexpected/private file, missing runtime source or .git pointer.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=false are verified.
Tag `cand-rmundpf2v-249c945f2220`; fingerprint `sha256:e6a481aeb691991fe38f89bc0d25f40bb73c67de7d1e639e89f2cb5e8c4d0eaa`.
No business mutation was used as proof. Failed attempts remain failed in their preserved evidence.
Editor browser coverage remains `not_run` under the approved Admin-only contract.

## Current operational maintenance

Request 001, governance simplification and unattended authentication renewal, was authorized for
direct implementation and mainline merge. Focused tests passed. A fresh WSL unattended auth probe
verified both CLI and ADC refresh under the approved managed identity, and a read-only Cloud Run
describe confirmed the documented serving revision still has 100% traffic. The reported eight-hour
failure remains a user observation, not a verified token lifetime. The mandatory production audit
required three patched transitive dependency overrides; its then-current audit had zero production
findings. The earlier full local gate passed 7,470 unit tests (four existing skips), 234 backend tests, all
policy checks and a production build. PR #92 merged at `41ad65cb` on 2026-09-30. Its release run
built a zero-traffic candidate and blocked at assurance when live renewal routes exceeded the
30-second canary navigation bound; production traffic did not change. Draft PR #93 proposes a
60-second bound for those two routes and awaits owner review.
During batch 003 intake, a fresh mandatory production audit failed on four high
`@grpc/grpc-js` findings in Firebase's dependency chain. PR #95 overrode `@grpc/grpc-js` to the
patched 1.14.5 and merged at `dc493dfe` after its full gate and exact CI passed.

## Feature intake

Batch 002 requests 002–008 are recorded in supplied order as S135–S141. On 2026-09-30 the owner
explicitly instructed their execution, then batch 003's, through implementation, mainline merge
and deployment. The owner clarified 006–007 as all existing workflow-linked
draft screens. The deployed Dashboard still handles three operational intents; production answer
and classify settings read back as `gemini-2.5-flash`. Broader retrieval/conversation, model
migration, draft refinement and integrated validation are not yet merged or live-verified.
The overlapping old S88–S93/S101 assistant plans are superseded for this scope. No batch 002
application effect, deployment, or provider activation has occurred.

Batch 003 requests 009–012 are recorded in order as S142–S145, authorized by the same instruction
and not started. The current Full lease dashboard, single next-action
guidance and cycle-bound manual progress are verified code/serving baseline; the derived
multiple-ready projection, separate Focus view, complete in-pane actions and new regression
validation are not implemented. No batch 003 intake question remains. Read-only Cloud Run traffic
still showed `pmi-kc-app-rmundpf2v-249c945f2220` at 100%, and approved WSL CLI/ADC refresh
returned READY. No application mutation or deployment occurred for this intake.
The documentation-specific gates passed; the audit failure that first held this intake was
remediated separately by PR #95.

## Verified corrective review

Five confirmed adversarial findings are repaired and verified deployed: lifecycle uncertainty, policy calendar validation/presentation, source-upload hygiene, vulnerable production dependencies and return-navigation transport. All repairs passed focused regressions, full application verification, exact main CI and cumulative release gates. Independent source/runtime readbacks and all six guarded remote product checks passed. The same runner performed the authorized repairs; this is not an independent second-review signoff. See [the adversary review](evidence/adversary-review-2026-09-29.md).

## Delivered batch

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

## Verification

The final application gate passed 7,462 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

## Remaining operational dependencies

B-DL1, B-DL2, B-DL3, B-S100, B-MNT1, B-MNT2 and B-AUTH2 remain open at their exact
external or human boundaries. Actual customer draft/form accuracy, approved notice-timing basis,
Rhino wording/applicability, selected real cases, observed walkthroughs, human screen-reader and
desktop full-page zoom verdicts remain unverified. Both Dotloop keys stay closed; signatures and
provider acceptance remain separate. S36 stays behind complete S100. S121 was excluded.
Historical K unit-store target/marker effects remain UNVERIFIED; absent Data Access logs do not
prove zero effects. No customer draft/send, paid comparison, provider-proof rerun or synthetic
production record was authorized for this release.

The completed corrective permit is consumed and the Awaiting release queue is empty. No original receipt, completed permit or build claim is reused.
