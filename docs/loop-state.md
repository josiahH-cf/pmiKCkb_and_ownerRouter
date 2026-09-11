# Loop state

Last updated: 2026-09-11 (UTC). Read AGENTS.md and docs/facts.md first.

## Current objective

Finish S113 implementation/review and exact production release; do not stop at a candidate.
Main HEAD is 919a2ae70c23ff304cef7e1699cee1539712e40f. Its CI 34549763928 passed all five jobs.
The initial backend CI run failed 2/201; unchanged retry passed. Full prior baseline 6,513 units /
four skips and all 201 backend tests pass. All earlier 32 review findings are closed.

## Verified release failure

919a2ae candidate pmi-kc-app-rmtw9sc8z-1ffcfff358ae passed candidate v4 assurance (01:48:59 UTC)
and promotion v4 (01:49:17 UTC). Observation failed at 420,140 ms: final Admin routes all passed
with zero diagnostics/mutations, but final reconciliation missed the fixed cutoff. Only one full
checkpoint passed. The real driver rolled back and verified predecessor recovery.
Serving: d243911cb20ffb01773072c0e27c723648eeea34 / pmi-kc-app-rmtkmhj1z-8855e4c6dbfb, 100%.
Checkpoint /home/josiah/.local/state/pmi-kc-release/checkpoint.json is observe, terminalFailure true,
rolled_back_verified. Preserve it and its consumed candidate/promotion/failed observation receipts.
Do not resume/reinitialize this terminal release or claim any final readback/helper has run.

## R33 correction verified locally

Bodyless baseline diagnostic: temp/s113-observation-timing-before.log. Sources-before 30,809 ms;
rendered 112,226 ms including 87,255 ms in 311-row extraction; sources-after 13,973 ms. Complete
source/application reads, stable digests and zero mismatches. Diagnosis cannot authorize promotion.
Working correction adds one coherent browser DOM snapshot; private data stays memory-only, all
prior field/link/cardinality assertions run unchanged, isolated counters aggregate every failure,
and a live row-count reread rejects changing sets. At most three canary pages share one guarded
context; workspace depends only on its actual completed desk. Manifest output order and the exact
serial predecessor exception remain. Shared cancellation, 300,000 ms window and 420,000 ms cutoff
are unchanged. No protected code or provider concurrency/authority changed.
Files: lib/production-assurance/bounded-reads.ts; scripts/production-assurance-dom-snapshot.ts;
scripts/run-production-canary.ts; scripts/run-production-reconciliation.ts; four new unit files.
First row-RPC batch still took60,733 ms. First live snapshot probe failed closed (retained). Its
self-contained iterative browser callback now passes isolated-context tests and live diagnosis.
Final combined diagnostic: canary37,217 ms, source-before30,119 ms, rendered30,863 ms including
row extraction3,581 ms, source-after13,512 ms; 311 rows, complete/stable/zero mismatches.
Log temp/s113-observation-combined-timing-r2.log. Final dependency-aware canary with its own
preflight passes all13 routes/zero diagnostics in42,204 ms, temp/s113-canary-batched-diagnostic.log.
These diagnostics write no receipt and cannot authorize promotion.
All 89 affected tests and current typecheck pass: temp/s113-observation-batched-focused-r5.log.
Initial canonical verification failed two unit pins (date and literal selector), corrected without
assertion changes. Exact native full verify PASS: 6,528 units/four skips, 201 backend tests, policies,
budget and build: temp/s113-observation-full-native.log. Overlay hashes and exit result are retained.
All 33 findings are locally closed. No new code commit yet; fresh exact CI/release remain required.

## Authority and pending closure

Approved existing josiah@pmikcmetro.com CLI/ADC enrollment verified at 01:36 UTC; fresh probes PASS.
No security challenge entered by runner. Admin-only both origins and exact blocked predecessor
POST /api/work reconcile exception remain approved. Candidate/post-promotion zero attempts mandatory.
Owner profile /home/josiah/pmi-assurance/owner-admin; no copies/new identities/roles/IAM/policy changes.
Separate 24-hour longevity restarted/unverified. Existing scheduled watcher stopped/Ready.
Both supplied v2 templates already published/read back; do not republish for proof. Blank resource
inputs remain accepted. No customer completion, Gmail send/draft, paid comp or proof rerun occurred.
S106/S34 normal handoffs implemented; real forms/connection/closed keys remain separate gates.

## Next

1. R33 timing/adversarial/full canonical verification passes; preserve every failed attempt.
2. Update current docs to verified local result; full bash scripts/verify.sh, audit, commit/push green.
3. Archive terminal919 checkpoint honestly ONLY when initializing the next exact-green code SHA.
   temp/s113-release-current.mjs now requires the exact terminal, verified rolled-back919 checkpoint
   before archiving it. Never reuse its receipt for another revision.
4. New exact candidate, aggregate assurance, promotion and full observation must pass.
5. All five temp/s113-close-\*.py and temp/s113-final-readbacks.sh remain guarded to919 and UNAPPLIED.
   Update guards/counts/evidence to the new actually accepted release before using them.
6. After acceptance: fresh cloud/serving/backend reads, two-key descriptive Registry metadata
   backup/CAS/readback (48 keys/16 open unchanged), guarded docs closure, PDFs/render all4pages,
   docs checks, ordinary commit/push, restore/read back the existing watcher. No docs-only deploy.
7. Final confirmation of serving/backend state; only then complete the goal.
