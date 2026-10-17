# Loop state

Last updated: 2026-10-17 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Implementation c99659d5 and documentation 15648c0e were already on main. Delivery preparation
85b7e03c supplied the correctly ordered queue and reconciled stale dispatch instructions. Its
complete gate passed 9,589 unit tests, 455 backend tests, required checks/build and zero production
audit findings. All five exact-main CI jobs passed (38957524699). Core served E2E: 39 passed,
22 existing configuration skips on c99659d5; later changes were documentation only.

Run `a97c579c-f11b-4d74-a366-9a7122eb58f7` built and promoted exact main
`85b7e03c5faad8fb9a9cc97f348ed973125edae6` / `pmi-kc-app-rmvc7c5lz-ec2410dd001a`, then failed
post-promotion observation: the final Notifications browser route exceeded its 30-second bound.
The failed report remains failed: one successful checkpoint, 477,992 ms elapsed, all 318 records
matched, zero discrepancies, candidate 5xx or unresolved effects. Receipt-bound rollback verified
at 2026-10-17T10:05:14.585Z. Production serves predecessor commit
`eb5d35991c3ec128a102e4483d3779af16106821` through
`pmi-kc-app-recovery-a97c579cf11b4d74` at 100%; S227-S229 delivery remains pending.
The failed run, original receipts, claims and cloud operations remain immutable outside Git.

The isolated repair removes the Notifications loader's sequential independent read waves.
Its fail-first regression failed on the original source and all 12 hub tests passed after repair.
Run the complete corrected-tree gate and exact-main CI before preparing a replacement. Preserve
the terminal failed checkpoint, permit state, receipts, claims and operation ids byte-for-byte;
prove no process/cloud effect remains unresolved and use the reviewed lock-held retirement path.
Never edit an admitted checkout or reuse the failed run's permit/build claim/receipt.

## Awaiting release

1. S227: Retire custom maintenance and preserve authorized read-only history — `c99659d5`.
2. S228: Bounded Dotloop template visibility/freshness diagnostics; both write keys closed — `c99659d5`.
3. S229: Preserve renewal usability and workflow-linked unsent Gmail; refuse sends/schedules/Resume/dispatch — `c99659d5`.

All three remain queued until verified delivery. The replacement carries the same scope plus the
necessary Notifications latency repair. Require a clean registered pair, fresh credentials/cost/
prerequisites, GO, exact-main CI, one build, zero-traffic assurance, receipt-bound promotion, full
300,000 ms observation with required checkpoints and independent readbacks.

## Current external dependencies

Fresh approved CLI/ADC, GitHub and exact managed-account Admin browser checks passed October 17.
Normal managed Dotloop resource refresh succeeded. The supported individual profile returned an
empty template list; the company template read failed as unavailable, rather than proving an empty
company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; do not request template recreation. Both Dotloop write
keys remain closed. Gmail reads report the expected mailbox connected with degraded sync health.
Normal connection refresh updates credential/observation metadata; no customer/provider business
write, draft, send, loop, upload or signature was verification proof.

## Scope and continuation

Keep renewal Focus/Full/mobile/facts/copy/autosave, supported source-update contracts, linked Gmail
reads/permitted unsent drafting, knowledge, records, permissions and exact receipts. Current source
refuses sends/schedules/Resume and dispatch even when prior Registry metadata remains open.
Vendoroo stays standalone. Old maintenance/integration/native-maintenance-phone work, Shockwave,
standalone importer, Espansr, OA Fable and new leasing are outside this execution.
Human verdict remains NOT RUN. Raw evidence and the private continuation checkpoint remain outside Git.
