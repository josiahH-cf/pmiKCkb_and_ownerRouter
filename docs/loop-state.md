# Loop state

Last updated: 2026-09-30 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

RELEASED: all thirteen implementations and all five confirmed adversarial repairs are deployed.
Run 89e38cd9-b6dd-498f-be87-1963e0ed2d03; serving SHA c541db723d3622234956a16e95765867733427cf.
Revision pmi-kc-app-rmundpf2v-249c945f2220; tag cand-rmundpf2v-249c945f2220; traffic 100%.
Fingerprint sha256:e6a481aeb691991fe38f89bc0d25f40bb73c67de7d1e639e89f2cb5e8c4d0eaa.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=false.
Checkpoint complete; permit consumed; no blocked, in-flight or rollback phase.

## Awaiting release

1. 001 governance/auth continuity and patched dependencies: merged main
   `41ad65cbccf89fdd248cd82088496470d90e057b`, exact CI 36723410549 passed. Run
   `dc4e1ac8-d8b9-4090-9258-e2ddb18f119f` is blocked at assurance after a zero-traffic build;
   no candidate receipt or promotion exists. Candidate `pmi-kc-app-rmuo61wve-fcdc2fc4b0d0` has 0%,
   predecessor `pmi-kc-app-rmundpf2v-249c945f2220` has 100%. Preserve the run and its claims.
   Draft PR 93 passes CI but changes a two-route timing threshold; owner direction is pending.
   Do not resume the old exact-SHA checkpoint with replacement source. No provider effect or other
   suite is in this queue.

The prior cumulative corrective queue is cleared and its permit consumed. S121 remains excluded.
Documentation/test-only closure must not start another deployment.

## Feature intake

Request 001 was supplied from `pmi-new-features-9-30/001-governance-simplification-and-unattended-auth-renewal.md`.
The owner explicitly directed this operational governance/authentication change through
implementation and mainline merge. It remains a ready intake item with implementation merged and
release pending. Its release is blocked as described above. No provider effect is admitted. The
registered suite order does not resume other work; future requests still require explicit execution
direction.
At intake initialization, GitHub CI 36650984450 read back successful at the exact release SHA.
The first WSL CLI/ADC probe required reauthentication, then a fresh approved unattended probe
verified both usable under `josiah@pmikcmetro.com`. A fresh read-only Cloud Run service describe
confirmed `pmi-kc-app-rmundpf2v-249c945f2220` still has 100% traffic. A prior public HEAD timed
out. Subsequent guarded candidate canary samples have exact passed and failed scopes above; neither
issued a release assurance receipt.

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

One development-only moderate Firebase CLI/PubSub/OpenTelemetry advisory chain remains absent
from all 194 runtime traces. A compatible upstream fix is the supported follow-up; production audit
is clean. Earlier emulator lock contention remains recorded; passing final checks do not establish
a durable flakiness fix or a general production performance SLO.

## Continuation

Request 001 remains queued behind the blocked assurance and reviewed repair decision. Future
external/human work requires its actual inputs and existing exact-effect contracts. Diagnosed-repair
governance retains every technical and safety gate; consumed permits and historical receipts cannot
admit another deployment.
