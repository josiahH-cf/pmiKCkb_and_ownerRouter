# November 13 staff workflow audit chunk 1 delivery

Production serves `ba9a64f6a011d4145e454e94fa0bbfdbff3e364c` / `pmi-kc-app-rmwfg7l0s-307709dd3033` at 100% canonical traffic.
Run `a6f14bac-7edd-4db2-ab94-93f0875dc1ee` consumed its permit after one successful application build `bb3ea21c-6432-404d-aeb9-5d130d103c54`.
Two observation checkpoints passed in 408,062 ms. All 375 source, projected and rendered
lease records matched with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-13T21:08:56Z`.
[Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43501116275)

## What shipped

| Intake | Suite | Delivered scope                                                                             |
| ------ | ----- | ------------------------------------------------------------------------------------------- |
| 152    | S274  | Re-read at confirmation, wait for an in-flight read, and identify a real change.            |
| 153    | S275  | Reply watch, visible Gmail checks, and replies on the lease.                                |
| 155    | S277  | Agreement adoption, explicit equal-amount affirmation, and rent basis. R-S277-2 is partial. |
| 157    | S279  | Lease status shared across staff. R-S279-2 is partial.                                      |
| 160    | S282  | Record an off-cycle end date review and its reason.                                         |
| 164    | S286  | Renewal Spaces show guidance. Earlier runs remain available as records.                     |

The S284 tooling shipped with this chunk. Qualification remains a cumulative engineering gate.
The prior fail-first pass against `edc6e880` reproduced 37 of 252 new tests for the expected
reason. Another 210 encountered missing test dependencies or other unrelated failures, and five
passed. The supplementary pass with the added modules reproduced 110 of 191 for the expected
reason. The exact serving-baseline browser audit reproduced 13 of 14 scenarios, with W12-12
flagged. [Baseline evidence](staff-workflow-audit-baseline-2026-11-13.md).

The owner directed tandem implementation, bulk verification, and delivery as chunks finished.
Chunk 1 was fast-forwarded to main without a pull request. The first head `52031f79` failed
an inventory test. Repair `d00c671c` recorded the emulator-only S284 process seed and passed
[exact-main CI 43469676706](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43469676706).
That first delivery attempt used exact-main CI and release assurance. The earlier handoff skipped
the full local gate, compiled S284 rows, preservation replays, and no-hold proof on `d00c671c`.
The corrected head passed the full native gate (12,489 unit tests, 618 Firestore tests, 65 served E2E checks with four existing skips, all 27 Help scenes and 895 controls, production build and policy checks) and exact-main CI.

W12-03 AC-S274-5 still needs S273 for the lease-page half of the held message. W12-04
AC-S275-5 and the N10-02 stale-page duplicate check still need S272. The scoped early
delivery carries both to the cumulative qualification. The first two release-risk findings
were repaired in `3be98e52` (desk status link and worker completion after a failed watch read).
The mailbox check limit, the S282 oracle's optional reads, and the false Gmail check
failure cue follow in chunk 2. A rollback from this first S282 release to its predecessor
would leave a lease record unreadable on the old parser if staff had saved an off-cycle review
in the interim. Such a record remains durable for a forward fix.

## Held attempt and replacement

Run `40ca195b-19fc-455b-bde6-c892267deaca` at `d00c671c` built
`1a2a914c-d30e-49a1-887b-5e7222d1462a` and reached candidate assurance at zero canonical traffic.
Cloud Build's managed buildpack shim returned no native storage provenance, and its successful
output named the managed image with an explicit `:latest` tag. The old gate refused
`recovery_build_provenance_unverified`. A private GET-only check verified the exact candidate,
managed archive generation and image digest with the repair. Two regressions failed on the old
code and all 207 focused recovery tests passed on the repair. Canonical traffic stayed at 100%
on `pmi-kc-app-rmwcvtvpl-13e72fe3f01f`. The original checkout, checkpoint, admitted permit, claim and receipts retain
their own evidence. The replacement received its own permit and receipts.

Run `d8c6629d-a8bc-4d73-b48f-376d7bb84165` at `a4aafe43` passed candidate assurance
and promotion. Its final observation checkpoint reported zero rendered rows after the
first checkpoint passed. The controller verified receipt-bound rollback to `pmi-kc-app-recovery-d8c6629da8bc4d73`
on the exact November 10 source. The failure report and the terminal rollback are preserved
separately from the later guarded 375-row diagnostic.

Run `aea5d595-d8cc-4e00-ba56-d2e575d4cc6f` passed candidate assurance and promotion.
The second checkpoint lost the existing Admin browser session and triggered receipt-bound
rollback to `pmi-kc-app-recovery-aea5d595d8cc4e00`. Unattended sign-in established a fresh canonical Admin session and
the controller verified the original rollback receipt. The successful run carries the same
application source and the failure record. [Attempt evidence](staff-workflow-audit-chunk1-attempts-2026-11-13.md).

## Verified delivery

- Recovery revision `pmi-kc-app-recovery-a6f14bac7edd4db2` kept the captured predecessor and Sheet=true.
  Its receipt `df32dbcf-5e67-4faa-a860-a6b4465f22ed` and reference `sha256:b905a612b0026db1ee3cb03ae230b9f9d3451c3b312f6a2227060e673f1ab544` bind that recovery.
- Candidate receipt `307ea522-e192-42d3-9b78-328eb35e9976` issued `2026-11-13T21:01:46.427Z`. Promotion verified
  `2026-11-13T21:02:03.574Z`. The controller completed at `2026-11-13T21:08:45Z`.
- Observation matched 375 source, projected and rendered records in two checkpoints
  over 408,062 ms. It recorded zero candidate 5xx, discrepancies, unresolved effects
  and guarded mutation attempts.
- All eleven independent readbacks passed. GET-only Help V5.0 verification covered
  5 pages with zero non-GET attempts and exact version identity before and after.
  All 3 renewal Spaces showed the Renewal Desk link and no Start run control.

The running image `sha256:c7ecbc0cbf45da29e7918193381330eb5dff16eac24fba1e759a189e2138f6da` matches the successful regional build.
Runtime fingerprint `sha256:be0abd6245ab6de98a0f79bcde1d0f174487cb55406350b0f46e4cc87dd0e20c`. Only APP_COMMIT_SHA changed among 54 environment keys.
The managed service identity, eleven paired Space maps, five secret bindings, Production/Live,
Demo=false, Sheet=true and RentCast allowance 50 match reviewed state. The annual GET
readiness job returned to PAUSED, and the minute worker stayed ENABLED with its exact target and calendar.

R-S284-5 production counts: NOT RUN. Human verdict: NOT RUN. The release exercises guarded
reads. Both Dotloop write keys remain closed. Signing stays with staff.
