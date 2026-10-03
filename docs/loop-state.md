# Loop state

Last updated: 2026-10-03 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

RELEASED: the S152–S167 program (lease-renewal simplification and mobile) on 2026-10-03 in run
47fabb7c-b26b-4032-b993-f6bc49c66abd at main `e106a88a50d541b4a012111019b09c2183f6ce20`.
Revision pmi-kc-app-rmusp7ehl-7ea8703905ca; tag cand-rmusp7ehl-7ea8703905ca; 100% traffic.
Build e8264109-67cd-4414-9d2b-c897f027c905 at 18:13:16Z; candidate receipt
5b837019-2126-423c-b7fa-70bbbe9b550f at 18:26:00Z; promotion verified 18:26:19Z; observation
passed two checkpoints in 387,784 ms over 13 routes with all 312 records matched and zero
candidate 5xx or unresolved live effects; the checkpoint completed at 18:32:44Z; its permit is
consumed; eleven readback sections matched, last at 18:32:54Z. Fingerprint
sha256:7061589ec47f2338497f9efd9dea1817dfdcc6f2ba4192b30b573e35d725448b.
Captured predecessor pmi-kc-app-rmurivuzf-c061dc669374 (run 3a32f7a2, the S113 approval-read fix
at `090df5e16f54eadbd1a3afbf20836c6677fa2a19`, Sheet=false, fingerprint
sha256:3d341cc428b6006a1e3db858324a3c22ea7357d017957a9cf8b7a1f9b1831b75). Recovery receipt
55c77605-9945-4617-bfab-c160d6ff366a binds pmi-kc-app-recovery-47fabb7cb26b4032, which keeps the
predecessor's Sheet=false.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=true.
A read-only production Focus check passed on three lease workspaces afterwards: Focus view is the
default, with zero mutation attempts.
Run 47fabb7c stopped twice on a cold target (recovery preparation at 18:05Z, candidate assurance
at 18:18Z). Each time a read-only canary passed 13 routes warm, the reconciliation oracle matched
312 records on the candidate, and the same-run resume passed.
Run a83ed59b-d5cc-4922-b736-fe57b86ff2a7 first carried the program at `b11f5fe0` and stopped at
candidate assurance: the release canary required the lease's Full view section navigation on
open, and S152 opens a lease in Focus view. No promotion occurred and traffic never changed. PR
#128 (`1b0df6fd`) gave the canary the Focus-default contract, and the corrected canary passed
read-only on that run's zero-traffic candidate. Its records are preserved; its checkpoint and
permit are archived as superseded by e106a88a.
Earlier serving records (run 3a32f7a2; batch 004's corrective run 0eb2cfeb at df772b30) stand as
history in Git and in docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md.

## Awaiting release

None. Run 47fabb7c consumed its queue (the S152 program item `ba3f9719`, with PR #127's review
repairs and PR #128's canary correction on the release head) and its permit. A future authorized
batch needs its own exact queue, ancestral commits, exact main CI, fresh prerequisites and a new
run-bound permit. No provider effect, key or activation is queued. S121 remains excluded.

## Feature intake

S152–S167: released on 2026-10-03 (run 47fabb7c, above) under the owner's execution prompt
(handoff renewal-simplification-mobile-2026-10; canonical program docs/feature-suites/README.md;
program commit `ba3f9719`). Every suite extends its deployed owner; no provider effect, key or
activation was used. Human verdicts: NOT RUN, no human observer. The optional phone same-tab
redirect (S165) has one owner step, A7 in docs/open-blockers.md.

Request 001 and batches 002–004 (S135–S151) are released; their actual evidence is in docs/facts.md
and the registered evidence ledgers. The released program changed the Focus default,
workflow/access gates, working persistence, Sheet policy and whole-app mobile usability.

## Verified evidence

PR #128 gate on head 1b0df6fd: 8,541 unit tests (four existing skips), 319 backend tests and
test:e2e:core 32 passed (22 existing skips); PR CI and exact main CI 37142116030 passed. The new
Focus-default canary case and its ten refusals are in tests/unit/s113-canary-landmarks.test.ts.
S113 root cause (2026-10-02), two layers. Product: an approval read past the 60 s soft TTL returned
the held lease generation while its own background revalidation's admission raised the notice
floor 5 ms after that read's floor check, so the draft preview's safety check refused it (traced on
the unfixed code). Approval reads (draft preview, notice review) now join that revalidation; display
reads keep stale-while-revalidate, so the release-check margin is unaffected. Test: S124 binds each
admitted generation to the reviewed draft, and the fresh-work journey (80–96 s in full gates)
assumed its save, reload, preview and create shared one generation. It now admits the new
generation at its reload, asserts the review that requires, re-reviews and drafts. No guard or wait
changed. New unit tests fail on the unfixed code and pass with the fix; the journey passes with no
idle, a 70 s stall before the reload and a 30 s idle before the preview.
Gate on PR #119 head 39adfd24: production audit 0 findings, 7,894 unit tests (four existing skips),
273 backend tests and test:e2e:core 32 passed (22 existing skips). The new read-order tests failed
on the unchanged code (5 failures) and pass with the fix. The S151 browser smoke passed 32 of 32
checks, including answer position measured at 1360, 761, 759 and 390 px.
PR #120 (rollback record and unblock packet) merged at df772b30 after its full gate passed on
tree-identical head 14087b40 (fourth run; the first three failed on the S113 race, a load-induced
S130 timeout and a truncated ignored E2E types file) and PR CI 6 of 6; exact main CI 37025320585
passed.
Run 0eb2cfeb: recovery receipt edf82e83-c1fe-4c4b-94d7-7ca532d7b224 binds
pmi-kc-app-recovery-0eb2cfeba2384b37 (its first preparation check stopped on the cold target; a
read-only canary passed 13 routes and the resume passed); build 802d851f-54cb-42a2-aedf-80d04e2142de
at 15:42:16Z; candidate receipt d964c0ca-3337-4caa-9b50-9f4be128b018 at 15:48:28Z; promotion
verified 15:48:53Z; observation passed two checkpoints in 396,284 ms with all 312 records matched
and zero candidate 5xx or unresolved live effects; Cloud Run logged zero 5xx from any revision in
that window; eleven readback sections matched, last at 15:55:53Z. The captured predecessor is
pmi-kc-app-recovery-175fee1d276c4e6f (1402e51b).
Original completed runs and all failed reports remain preserved with their actual outcomes.
Older Sheet=true revisions remain invalid direct restore targets.
Evidence: docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md.
Batch 003 evidence: docs/evidence/renewal-focus-batch-003-validation-2026-10-01.md.

## Remaining boundaries

External and human holds (Dotloop B-DL1–B-DL3, B-S100, B-MNT1, B-AUTH2, the notice-timing basis,
the release Admin browser sign-in and human verdicts) are listed once, with their exact owner
steps and runner follow-ups, in `docs/open-blockers.md`. Each blocks only its named effect; none
blocks development, tests, merges or releases. Historical K unit-store target/marker effects remain
UNVERIFIED; absent Data Access logs do not prove zero effects.

## Continuation

Next: no release is queued. Open items are the two owner decision candidates (an uncertain Sheet
field update that holds a lease's Sheet lane; the document packet's terms source), the optional
phone redirect step A7 and human verdicts, all in `docs/open-blockers.md`; act on a hold only when
the owner reports its step done. Owner decisions of 2026-10-02 (Q1–Q4) are there too. Runner
follow-ups with no owner step (the four emulator-only E2E suites, promotion routing skew and cold
recovery verification) are described there. A change to what a route shows on open must update
the release canary's landmark contract in the same change. Consumed permits and
historical receipts cannot admit another deployment.
