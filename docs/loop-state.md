# Loop state

Last updated: 2026-10-02 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

ROLLED BACK (verified), 2026-10-02: run 175fee1d-276c-4e6f-8ba5-569b336a40d8 carried the batch 004
corrective repair at 7d2181bf9a9209734f9e37ae1becc66061496359 (candidate
pmi-kc-app-rmur0tbib-a9b9f1768907). Recovery preparation, the one build, smoke, configuration,
domains, candidate assurance and promotion passed. The observation's immediate checkpoint then
failed 4 of 13 routes: for up to 46 s after promotion started, Cloud Run still routed some canonical
requests to the predecessor pmi-kc-app-rmuq2qvcc-8074bfd97707, which (with no traffic and no tag)
answered them with instant 500s. The candidate served zero 5xx, all 312 records matched and its
renewal desk rendered in 4,524 ms (15.5–28.7 s in batch 004's releases), so the repair works.
Traffic returned to the run-bound recovery target pmi-kc-app-recovery-175fee1d276c4e6f
(1402e51b, Sheet=false); its first verification timed out on a cold instance (32.4 s version read
against a 30 s timeout), and after a warm read-only rollback canary passed 13 of 13 routes the
same-run resume verified it (ROLLED_BACK_VERIFIED). Production serves batch 004's code, as before
the run. The watcher refuses a rolled-back SHA, so this records commit heads the replacement run;
the released code is unchanged. Until its closure, status, plan, facts and the handoff still
describe run 729d5716.
Batch 004 (S146–S151) shipped in runs 98f7e743 and 729d5716; its AF-01 to AF-70 ledger and the
2026-10-02 independent verification are in
docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md.

## Awaiting release

1. S147 Dashboard lease read order (batch 004 corrective repair; release-check margin): `ad230cde51035a8da67f84fa23a2cad9c695f108`.
2. S151 browser smoke measures answer position: `c547302daa5a2956276ce67899deb0d3563cf265`.

OWNER DIRECTION, 2026-10-02: clear the remaining blockers and leave production on `main`. One
candidate carries both items; runs 98f7e743 and 729d5716 consumed batch 004's own queue and
permits, and run 175fee1d's permit is archived as superseded after its verified rollback. Admit
the replacement only after exact main CI on its release head, fresh prerequisites and a new
run-bound permit. No provider effect, key or activation is queued. S121 remains excluded.

## Feature intake

Request 001 and batches 002–004 (S135–S151) are released; their evidence is in docs/facts.md and
the registered evidence ledgers. An S152–S167 intake (renewal simplification and mobile, F01–F16)
was authored uncommitted in the Windows checkout on 2026-10-02 by another session. By owner
decision it is parked unchanged on that checkout's local branch `intake/s152-s167` (`ac2a12bc`,
not pushed), so it is not registered on main. Merge it with main before executing it; it starts
only from the owner's execution prompt.

## Verified evidence

Gate on PR #119 head 39adfd24: production audit 0 findings, 7,894 unit tests (four existing skips),
273 backend tests and test:e2e:core 32 passed (22 existing skips). The new read-order tests failed
on the unchanged code (5 failures) and pass with the fix. The S151 browser smoke passed 32 of 32
checks, including answer position measured at 1360, 761, 759 and 390 px.
PR CI passed 6 of 6; PR #119 merged at 7d2181bf; exact main CI 37013612502 passed.
Run 175fee1d: recovery receipt 253b6179-61ed-4daf-a31a-bae2f97d78d8 (its first preparation check
stopped on the cold target; a read-only diagnostic canary passed 13 routes and the resume passed);
build afe46e73-f4d6-4e5a-a6c2-a307fc427ff2 succeeded at 14:05:05Z; candidate receipt
22543dd6-a820-4439-a592-464e67846849 issued at 14:12:07Z; promotion started 14:12:24Z and was
verified at 14:12:30Z; the immediate checkpoint failed at 139,964 ms (admin_canary_failed,
browser_diagnostic); ROLLED_BACK_VERIFIED at 14:22:55Z. Cloud Run request logs attribute every
observed 500 to the predecessor, the last 46 s after promotion started.
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

Next: the replacement run for the two queued items from this records commit, per
docs/release-batch-runbook.md (archive run 175fee1d's terminal checkpoint and permit, prepare,
prerequisites, preflight, admit). Owner decisions of 2026-10-02 (Q1–Q4) and every owner step are in
`docs/open-blockers.md`; act on a hold only when the owner reports its step done. Runner
follow-ups with no owner step, including promotion routing skew, are described there. Consumed
permits and historical receipts cannot admit another deployment.
