# November 10 renewal walkthrough delivery

Production serves `7f4cf234c18c0b80a0ed88bc08d70e174ae9c311` / `pmi-kc-app-rmwcvtvpl-13e72fe3f01f` at 100% canonical traffic.
All eleven intakes 139–149 shipped in one cumulative candidate. Two observation checkpoints
passed in 402,737 ms. All 375 source, projected and rendered records matched, with zero
discrepancies, candidate 5xx, unresolved effects or guarded mutation attempts. All eleven
independent final readbacks passed at `2026-11-12T02:04:06Z`.
[Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43133331913) · [Per-intake qualification](renewal-walkthrough-qualification-2026-11-10.md)

## Exact release record

- **Source and CI.** The application qualified at `c0f6490e8659a3aa684099590efbbbcbef7c6deb`. The
  queue head `6074683015bef54bae4ad80d48be97922e378b64` added only the qualification record. The release head
  `7f4cf234c18c0b80a0ed88bc08d70e174ae9c311` adds one test-only repair described below. Exact push CI
  `43133331913` passed all seven jobs at that head.
- **Local qualification.** Full verification on the qualified source passed 12,073 unit tests in
  1,216 files, 601 Firestore tests in 104 files, the production build and 65 served E2E tests
  with four skips. Core E2E passed 46 with 23 expected skips. S271 private run
  `20261111T164228Z-c0f6490e` on build `EvsdEv_bUWl9gRTP0vv6O` recorded nine Yes rows and a
  separate Thursday Yes with zero refused connections. The S260 replay `20261111T171533Z-c0f6490e`
  recorded twelve Yes rows across ten journeys and three Help roles. Rendered Help V4.0
  matched 27 scenes and 882 controls, and the deliberate drift was rejected.
- **Admission and recovery.** Fresh approved WSL CLI and ADC, guarded Admin, billing and cost
  checks passed. One watcher admitted `943a91a6-c659-4234-95ea-3582d0a4011e` at `2026-11-12T01:41:31.774Z` under locked GO
  for eleven queued intakes. It captured `pmi-kc-app-rmw9w581k-2489abae9071` at
  `0afd020671ea9fbb1f0ee75484943c60e331b91a` serving 100%. The distinct authorized tag `cand-rmw9w581k-2489abae9071` pointed to
  `pmi-kc-app-recovery-d3a71afe65e146fd`. The run-bound recovery `pmi-kc-app-recovery-943a91a6c6594234` preserves
  Sheet=true and normalized fingerprint `sha256:bda4f86d6582874edd25bd04858c269d77bea7c1b79546b5e686427edcb545ec`.
  Receipt `9bb94ac0-76b7-418f-abe0-833568040f03` issued at `2026-11-12T01:44:48.694Z` with reference `sha256:85b7ef76ca4c4abec30c7e9cbbe2ff98d363d740cf81f3d8e9e6f6019af6be86`.
- **Build and candidate.** The one regional build `053961ec-41a0-4553-bc03-f37ecf2d8926` succeeded at `2026-11-12T01:51:30.068Z`.
  The watcher verified candidate `pmi-kc-app-rmwcvtvpl-13e72fe3f01f` with the exact commit under `cand-rmwcvtvpl-13e72fe3f01f` at
  zero traffic, with the predecessor still at 100%. Smoke, domains, guarded Admin, reconciliation and
  monitoring passed. Receipt `ffd145a6-a43a-4b5b-b234-62d6ea08d4ff` issued at `2026-11-12T01:56:40.595Z` and bound the exact
  recovery receipt. Editor browser `not_run` under the existing policy.
- **Promotion and observation.** Promotion consumed the candidate receipt and verified
  canonical traffic at `2026-11-12T01:56:56.292Z`. The full observation passed at `2026-11-12T02:03:32.265Z`
  within the 300,000 to 480,000 ms bounds. All 13 guarded Admin routes rendered without
  diagnostics. The controller completed and consumed the permit.
- **Final configuration.** The running image `sha256:787a052af6c254650dc136b2ac2df3dceda42492e222f469132d4a3690d31720` matches the single successful
  build. The independent runtime fingerprint `sha256:ba367a33db4a619ae67c7d9d3e06d27c2b154fa16c9c567f4212fa14f02487d7` matches the candidate receipt.
  Only APP_COMMIT_SHA changed among 54 environment keys. The existing runtime identity, eleven
  paired Space maps, five secret bindings, Production/Live, Demo=false, Sheet=true and cost
  controls passed. The annual GET readiness job kept its exact target and calendar in PAUSED,
  and the minute worker kept its exact target and calendar and stayed ENABLED.
- **Production Help.** A GET-only check through the guarded Admin profile at `2026-11-12T02:04:48Z` loaded six Help V4.0 pages: the hub, What changed, Work a renewal, the tenant offer, RentVine and Sheet updates, and the new teammate guide. Each returned 200 with this batch's wording, the browser made zero non-GET requests, and the version endpoint matched the exact commit and revision before and after.

## Preserved evidence and remaining boundaries

The first prepare at 17:54 UTC on November 11 stopped at the expired WSL gcloud sign-in before
any permit. The owner signed in again at 00:54 UTC, and every later prerequisite refreshed
unattended.

Run `d3a71afe-65e1-46fd-a2f7-8c69f406e65d` at `6074683015bef54bae4ad80d48be97922e378b64` ([CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43068802565)) prepared and
verified recovery target `pmi-kc-app-recovery-d3a71afe65e146fd` at zero traffic. Its regional
build `b6077224-0d2f-4cb7-892a-ca91739e182d` then failed the production type check. The S254 fence test imported
the S271 compiled stand-in fixture statically, and `.gcloudignore` keeps that fixture out of
every Cloud Run upload, so the full local tree and CI passed while the uploaded source could not
resolve it. No candidate revision was created, canonical traffic never moved and both scheduler
jobs kept their state. The repair `7f4cf234` loads the fixture only when the test runs. On
the exact upload set of 3,485 files, the type check reported the same single error on the queue
head and passed on the repair. The stopped checkpoint and its admitted permit were archived
byte-for-byte under the release lock with their reason. The replacement used its own CI,
permit, build and receipts.

The first replacement watcher, run `c461d88c-3d02-426c-bc24-0aaedf704784`, stopped in inspect before any checkpoint, recovery
or build. Its fetch into the release's disposable bare Git cache passed the 120-second command
limit. The cache has no fetch refspec, so its `main` ref had stayed at an October tip, and every
fetch downloaded about 13,700 objects again. A manual fetch completed. Under the release lock,
the unused admitted permit was archived byte-for-byte, and the cache's `main` advanced to the exact
fetched remote main. The next fetch took under one second. Run `943a91a6-c659-4234-95ea-3582d0a4011e` then started from
a fresh permit.

Thursday's core checkpoint is recorded in its own scope, and the Friday November 13 S271 staff
review stays separate from cumulative admission. Human verdict: NOT RUN — no human observer.
Both Dotloop write keys remain closed. Signing and actual staff acceptance remain human. Fees,
tenant links, Dotloop maps and the program source remain source pending in their owners. No
production dispatch or provider business effect served as qualification evidence.
