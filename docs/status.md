# PMI KC current status

Last updated: 2026-09-28 (UTC).

## Current feature

**BLOCKED — thirteen-feature batched release.** Billing is enabled and approved CLI/ADC
authentication works. The cumulative head `f85abacc771dc0f85c2f7bf69af3d05d8402e88e` is present
in both checkouts and remote main; exact-SHA CI 35549486717 passed. Native batch preflight read GO
with thirteen entries and the current head as watcher target before these documentation edits.
Independent code review nevertheless found release-safety and litmus gaps, so no batch candidate,
promotion or observation is claimed. Owner direction on repair or stopping is pending.

The thirteen queued features remain S128, S123, S124, S134, S122, S125, S126, S127, S131, S129,
S130, S132 and S133. Their individual commit/CI evidence is in `docs/loop-state.md` and
`docs/facts.md`. They must ship together through `docs/release-batch-runbook.md` after repairs,
verification and all existing gates. S121 remains separate and unscheduled.

Current audit: [batch litmus evidence](evidence/batch-litmus-audit-2026-09-28.md).
Confirmed gaps are pause-unsafe promotion compensation, receipt-incompatible paused observer
rollback, unintegrated notice-withdrawal history, incomplete manual non-renewal draft refusals and
notice-review invalidation, raw ISO/impossible dates in move-out labels, automatic Sheet proposal
preparation and stale pause-resume confirmations, and unintegrated actual template filling. These findings prevent claiming every supplied litmus criterion passes.
PDF manual completion is an allowed fallback; missing real forms and provider activation remain
separate dependencies.

Focused verification passed 194 tests in 37 files. Full verify.sh passed: formatting, lint,
TypeScript, 6,953 unit tests in 773 files, 216 backend tests in 38 files, all seven policy/document
gates, configuration guard and production build. Core E2E passed 31 tests in eight files;
18 tests in four Firestore-only files were intentionally skipped by core mode. The earlier
missing-Java-PATH attempt remains preserved; the complete rerun passed with installed Java 21.
Compiled feature browser smokes and human verdicts for this batch remain NOT RUN. Admin browser
authentication is UNVERIFIED after two 60-second sign-in navigation timeouts with no observed challenge; canonical sign-in HTTP 200
does not establish an authenticated session.

## Cancelled stale attempt and watcher

A preexisting watcher started an S128-only build from `0bbd95c3` at 20:58:24.661Z on
2026-09-28. The runner stopped it and cancelled Cloud Build
`57f23335-8f8b-490e-b18e-5d6d4b1db564`; its terminal readback is CANCELLED at 21:01:53.995Z.
Candidate `pmi-kc-app-rmu82xj2c-fa2fae08b587` is absent, and traffic did not change.
The attempt was not relabeled successful.

The stale checkpoint is preserved verbatim with a reason outside Git. The active checkpoint now
names the last completed S120 release. Zero watcher processes and a free lock were read back;
the unchanged scheduled task remains Ready. Recheck the process and lock before any later start.

## Serving release

Production serves `79493458f641b9710d8c43467e872aa9acf7948e` as
`pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Canonical/tagged versions and sign-in returned HTTP 200 after billing recovery; both versions name the exact serving SHA/revision. Authorized domains contain exactly one candidate entry for the old S120 release plus canonical.

Read-back configuration: Production + Live, managed runtime identity, eleven Space maps,
Demo false and operating-Sheet write-back **true**. The S128 pause is staged false in both ignored
env files in both checkouts, but it has not reached the serving revision.

S120's recorded tag is `cand-rmu4wevd9-d89996133320`; freshly read-back configuration fingerprint is
`sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568`.
Its historical exact CI 35173497243, candidate assurance receipt at 02:27:49Z, promotion verified
at 02:28:06Z, two-checkpoint observation of 372,944 ms and completion at 02:34:15Z on 2026-09-17
remain evidence for that release. They do not verify the queued batch.

## Authentication and cost controls

Approved `josiah@pmikcmetro.com` WSL CLI/ADC authentication passed on 2026-09-28.
Billing is enabled on the expected account. The unchanged controls read back as alert 25 USD,
project hard stop 100 USD, account backstop 100 USD and ACTIVE Node.js 22 guardrail with cap 100.
The hard-stop Pub/Sub configuration is present, and both alerts retain two channels.
No billing, budget, IAM, claim, identity or security setting was changed.
Elapsed-session longevity remains separate; a stale enrollment requires the owner's attended step.

## Delivered baseline and open dependencies

S113 F1-F5 and S114-S120 remain the delivered baseline: the dashboard, typed corrections,
governed source updates, operator-triggered comps, reviewed unsent draft preparation, audited manual
progress and operator workspace improvements. Staff completion remains distinct from provider
receipts and signatures. Blank resource inputs remain supported; only dependent outputs wait.

B-DL1, B-DL2 and B-DL3 remain open for approved Dotloop credentials, managed connection/selection,
and real forms/mappings. Both Dotloop keys remain closed. B-S100 still needs the exact synchronized
resident and verified email; S36 remains queued behind complete S100. B-MNT1 and B-MNT2 remain
open for preapproval proof inputs and external maintenance-agent evidence. No meeting or
customer-specific verdict is inferred from engineering tests.

No live customer draft/send, source write, paid comparison, historical proof rerun or signature
effect was performed for this release check. Candidate receipts and observation for the batch
remain NOT RUN.
