# Staff workflow audit chunk 1 release attempts

Recorded November 13, 2026 UTC. Chunk 1 carries intakes 152, 153, 155, 157, 160 and 164,
plus the S284 rehearsal tooling. The owner directed the team to ship this chunk while work
on chunk 2 continued. The first main update was a fast-forward.

## First attempt

Main `d00c671c704f427406fdfc360624bae9e85db5f3` passed all seven exact-main CI jobs. Release
run `40ca195b-19fc-455b-bde6-c892267deaca` built
`1a2a914c-d30e-49a1-887b-5e7222d1462a` and held at candidate assurance with
`recovery_build_provenance_unverified`. Canonical traffic stayed on the November 10 revision.
[Exact-main CI 43469676706](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43469676706).

The read-only diagnosis traced the refusal to the managed Cloud Run buildpack response. Its
single shim step names the uploaded archive and the output repository. The Cloud Build storage
source objects were absent, and Cloud Run returned the output repository without the
`:latest` tag reported in the successful build. Fix `a4aafe43` verifies the exact revision,
source archive and generation, claim, build, output repository and image digest. Two regressions
failed first, 207 focused checks passed after the repair, and the corrected proof verified the
held candidate with GET requests. The first checkpoint and admitted permit were preserved.

## Replacement and recovery

Main `a4aafe43b7a886a444b7c3314ee00a64d1ffa7d8` passed all seven exact-main CI jobs and the
full native WSL gate. The latter passed 12,489 unit tests, 618 Firestore tests, the production
build and 65 served E2E checks with four existing skips. All 27 rendered Help scenes matched.
[Exact-main CI 43484324937](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43484324937).

Run `d8c6629d-a8bc-4d73-b48f-376d7bb84165` built
`a1f17107-346c-4bda-afc4-d60a12047300` and passed zero-traffic candidate assurance for
`pmi-kc-app-rmwfc6f2n-22eeca121640`. Candidate receipt
`e5b252bc-ee3e-44bb-be8e-220d0444cb35` issued at `19:09:47.886Z`. Receipt-bound promotion
verified at `19:10:06.850Z`.

The second observation checkpoint held at 409,355 ms with `source_unavailable`. The
independent RentVine and Sheet reads were complete and stable, with 375 source and projected
rows. The rendered reconciliation returned zero rows. All 13 Admin canary routes rendered,
with zero diagnostic or guarded mutation attempts. The candidate had zero 5xx and zero
unresolved effects. The reconciliation desk request returned 200 in 21.214 s. The original
report does not identify which rendered check refused. A later GET-only diagnostic of that
exact, now zero-traffic candidate matched 375 source, projected and rendered rows with zero
discrepancies. The failed observation retains its original result.

After the observation deadline, the watcher used the existing rollback receipt to restore
canonical traffic to `pmi-kc-app-recovery-d8c6629da8bc4d73`. Its first verification failed
on the predecessor baseline during slow cold reads. A warmed read-only Admin canary rendered
13 of 13 routes. A second verification reconciled the same traffic operation and recorded
`ROLLED_BACK_VERIFIED` at `2026-11-13T19:25:24.889Z` under receipt
`34349605-3dec-47b2-a76c-8038f33925f3`. The predecessor source is
`7f4cf234c18c0b80a0ed88bc08d70e174ae9c311`, with the original image digest
`sha256:787a052af6c254650dc136b2ac2df3dceda42492e222f469132d4a3690d31720` and runtime
fingerprint `sha256:ba367a33db4a619ae67c7d9d3e06d27c2b154fa16c9c567f4212fa14f02487d7`.
Independent GETs confirmed 100% canonical traffic on the recovery revision. The annual GET
readiness job is PAUSED and the minute worker is ENABLED with the captured targets and calendars.

## Observation stopped on an expired Admin session

Exact main `231a43d8014c0ba3e59345f74098cd0a9e1f1180` carries the same tested application
source and the previous attempt record. All seven jobs passed.
[Exact-main CI 43493225756](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43493225756).

Run `aea5d595-d8cc-4e00-ba56-d2e575d4cc6f` used the one successful regional build
`d64d7555-55e2-43f1-a634-ca2fb71b3bce` and passed guarded assurance for
`pmi-kc-app-rmwfe8295-0364a58ea817`. Candidate receipt `c7fd7cf5-0c9d-40d5-a2ce-fc3878d2e248`
was used for the promotion verified at `2026-11-13T20:08:40.440Z`.

The first observation checkpoint passed. The second at 348,382 ms failed after
the managed Admin session expired. Twelve route checks detected an authentication mismatch,
and the renewal workspace could not be selected. The browser guard blocked sign-in requests
before they were sent. RentVine and Sheet still read 375 stable source and projected records.
The unsigned browser returned zero rendered rows. There were zero candidate 5xx and zero
unresolved effects.

The same controller shifted canonical traffic to the prepared recovery revision. Its first
receipt verification also encountered the expired browser session. The approved unattended
sign-in reused the existing Google session and established a fresh app session. Under the
existing receipt `a75ba17e-2ac1-4319-bc17-5720e8928a2c`, rollback verification passed at
`2026-11-13T20:22:24.224Z`. Canonical traffic returned to the exact November 10 image and
source via `pmi-kc-app-recovery-aea5d595d8cc4e00`. The failed observation and its traffic operation remain separate
from the recovered verification.

Chunk 1 remains queued. The replacement needs exact-main CI, a fresh permit, one application
build, candidate assurance, receipt-bound promotion, two observation checkpoints and final
readbacks. S284 production counts and human verdict remain NOT RUN.
