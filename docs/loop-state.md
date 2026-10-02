# Loop state

Last updated: 2026-10-02 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

RELEASED: batch 004 corrective repair (S147 Dashboard lease read order, S151 smoke) on 2026-10-02.
Run 0eb2cfeb-a238-4b37-b35f-f999eadfacff; serving SHA df772b30c60043d5fe4c57ff2275990d18a535b3
(records head; the code is PR #119's, merged at 7d2181bf).
Revision pmi-kc-app-rmur4a2vc-185ba8b9f3b8; tag cand-rmur4a2vc-185ba8b9f3b8; traffic 100%.
Fingerprint sha256:1e4fbc10f3abad951f40b37b07d47d526f67e30334ac237d148b0e7c63a7a6e2.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=false.
Release-check margin restored: the observation decided at 396,284 ms against the 420 s evidence
deadline, and the renewal desk check took 4,838 ms (28,729 ms in batch 004's last release). Batch
004's own runs decided at 414,515 and 419,630 ms, and run 0aa79bfe missed the deadline; the S147
attention queue had started the admitted lease refresh that a desk opened alongside the Dashboard
then waited out.
Run 175fee1d first carried the same code at 7d2181bf and rolled back verified: for up to 46 s after
promotion started, Cloud Run still routed some canonical requests to the untagged predecessor,
which answered them with instant 500s and failed the immediate checkpoint (candidate 5xx zero).
Its records are preserved; its checkpoint and permit are archived as superseded by df772b30.
Batch 004 (S146–S151) shipped in runs 98f7e743 and 729d5716; its AF-01 to AF-70 ledger, the
2026-10-02 independent verification and both corrective runs are in
docs/evidence/ai-first-dashboard-batch-004-validation-2026-10-01.md.

## Awaiting release

1. S113 approval reads join their soft-TTL lease revalidation (notice-safety race): `cc78c127cf4259395617514909130baa5e98467b`.

OWNER DIRECTION, 2026-10-02: close the S113 gap and leave production, `main` and every checkout on
the same code; S152–S167 stay registered and not started. Run 0eb2cfeb consumed its own queue and
permit. Admit only after exact main CI on the release head, fresh prerequisites and a new run-bound
permit. No provider effect, key or activation is queued. S121 remains excluded.

## Feature intake

S152–S167: full owner-confirmed specifications, ready / not implemented. Another session authored
them on 2026-10-02; they were parked as written (`ac2a12bc`) and registered on main the same day.
Canonical program: docs/feature-suites/README.md, handoff renewal-simplification-mobile-2026-10.
No implementation, provider effect or release has started for them. The owner supplies the
execution prompt to start this exact program; completed owners are not requeued.

Request 001 and batches 002–004 (S135–S151) are released; their actual evidence is in docs/facts.md
and the registered evidence ledgers. Focus/in-pane work is deployed; the new program changes its
default, workflow/access gates, working persistence, Sheet policy and whole-app mobile usability.

## Verified evidence

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

Next: release the S113 fix under Awaiting release; S152–S167 wait for the owner's execution
prompt. Owner decisions of 2026-10-02 (Q1–Q4) and every owner step are in
`docs/open-blockers.md`; act on a hold only when the owner reports its step done. Runner
follow-ups with no owner step (the four emulator-only E2E suites, promotion routing skew and cold
recovery verification) are described there. Consumed permits and
historical receipts cannot admit another deployment.
