# Current plan

Updated: 2026-09-30 (UTC). The thirteen-feature batch and confirmed adversarial repairs are verified deployed. The separate 001 dependency release is blocked at assurance; batches 002–003 are owner-authorized for execution.

## Direct maintenance request 001: merged, release pending

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
30-second canary navigation bound; the admitted permit expired unused. Draft PR #93 proposes a
60-second bound for those two routes and awaits owner review. The previous release's consumed
permit remains historical.

## Markdown batch 002: executing

All seven supplied requests 002–008 were read in order, mapped to S135–S141 and registered as
`ready` in `docs/feature-suites/README.md`. The owner clarified that email requests 006–007 cover
all existing workflow-linked draft screens. S110 and the existing email paths are the verified
baseline; the broader AI/model/context/refinement outcomes are not implemented. S88–S93/S101's
overlapping unimplemented plans are superseded for this scope and cannot restart automatically.
Preserve S87/S94/S95 as separate proposals. On 2026-09-30 the owner explicitly instructed
execution of batch 002, then batch 003, through implementation, mainline merge and deployment,
with one cumulative release at the end of each set. PR #95 merged the production audit patch at
`dc493dfe`; the S136, S135/S137/S138 and S139/S140 slices merge next, then S141 validation.

## Markdown batch 003: authorized, follows batch 002

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

## Outcome

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

## Current implementation baseline

The final application gate passed 7,462 unit tests and 234 backend tests, with four existing
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

Collect/read already available approved material first. Keep private sources, customer values and credentials outside Git. Missing inputs block only dependent work; blank resource boxes remain supported and deferred requests are not repeatedly raised. This plan authorizes no external message or live effect.

| Item                             | Owner and next action                                                                                             | Completion evidence                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B-DL1                            | External supplier/owner delivers approved OAuth credentials through the recorded secret path.                     | Non-secret binding/readiness readback; no credential in output or Git.                                                                     |
| B-DL2                            | Owner connects managed account and selects verified office/profile/template/type/status.                          | Authorized resource/connection-generation readback; keys stay closed.                                                                      |
| B-DL3 and supplied-form accuracy | Owner supplies approved material covering seven families; reviewer checks applicable maps/output.                 | Approved versioned originals/maps, actual filled-output comparison and recorded human accuracy verdict; manual fallback where unsupported. |
| Dotloop live execution           | Owner separately authorizes exact-key proof/activation after prerequisites.                                       | Exact confirmation, own attempt receipt and provider readback; signatures stay separate. No live proof in this release.                    |
| B-S100                           | Owner supplies exact work order/resident-message association and verified resident email.                         | Existing warned/confirmed sync, bounded draft proof, mandatory close/readback and separate authorized activation.                          |
| B-MNT1                           | Owner supplies exact properties, amounts and effective dates.                                                     | Human-confirmed preapproval readback and separately authorized routing proof.                                                              |
| B-MNT2                           | Owner/vendor administrator supplies product/account identity, terms, scoped grant and primary interface evidence. | Supported/unsupported findings, reconciliation owner and recorded handoff decision; no implicit connector build.                           |
| Notice timing                    | Authorized policy owner confirms comparison anchor/counting convention using reviewed configuration.              | Exact version/date-basis readback; classifications remain unavailable until approved.                                                      |
| Rhino                            | Material owner supplies/approves applicable policy version and reviewed lease evidence.                           | Actual wording/applicability review; fixtures cannot validate coverage or terms.                                                           |
| Customer drafts/resources        | Staff selects real case, verifies recipients/sender/charges/terms and supplies deferred resources when available. | Recorded accuracy review; any unsent live draft needs its own exact human confirmation and receipt. No send.                               |
| Walkthrough/human verdicts       | Team selects one or two real leases, policy case if supplied, and performs consented walkthrough.                 | Step/actor/time/expected/observed/evidence/owner record; update draft process materials only from observations.                            |
| B-AUTH2                          | Operator observes unchanged enrollment across fresh-shell/reboot and 24-hour elapsed-session checks.              | Timestamped CLI/ADC/browser results without reenrollment resetting the interval; separate from release acceptance.                         |

S36 is queued behind complete S100 and is outside this batch. Closing these holds later still requires their exact inputs and separate effect authorities; tests cannot invent them.

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
