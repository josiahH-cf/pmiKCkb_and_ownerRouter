# Application delivery — October 17, 2026

Run `d33c7174-23b1-4126-ac11-657738b1864f` released S227-S229 plus the scoped Notifications latency repair at
`a7bce0981badc7523a6498949b6ea5f2effb198e` / `pmi-kc-app-rmvc9kmq6-1c2699db16f8` with 100% canonical traffic. One application build
`0983c589-af35-4219-9f5f-1bc1018f4043` succeeded at 2026-10-17T10:50:56.561207Z. Candidate receipt
`5b8ba2f6-8531-4936-86d6-5d01d85db110` issued 2026-10-17T10:58:13.931Z; promotion verified
2026-10-17T10:58:38.332Z. Full observation passed two checkpoints in 434,351 ms
against the 300,000 ms minimum and 480,000 ms deadline. All 318 source/projected/rendered
records matched with zero discrepancies, candidate 5xx or unresolved effects. Eleven independent
readback sections matched at 2026-10-17T11:06:16Z. The checkpoint is complete and permit consumed.
Tag `cand-rmvc9kmq6-1c2699db16f8`; fingerprint `sha256:dcbcdd544dd0c6d4d9a294748997aa324aaf2a09008dc1baf0c2aa060dbb1095`.

Captured predecessor: `pmi-kc-app-recovery-a97c579cf11b4d74` / `eb5d35991c3ec128a102e4483d3779af16106821`, Sheet=true.
Run-bound recovery `pmi-kc-app-recovery-d33c717423b14126`, receipt `07b55751-a159-4b01-bb4c-068178f8815b`, reference
`sha256:d376fa106048928a155fc69da5d8588071a1f9c0e45fb3c3ad83a834d418042c`, preserves that actual image/configuration. Its fingerprint
is `sha256:6e57b2a65a60f8e6a218c0b4b0e4cb8db791bad0a8a45a2322457a030393da2c`. The previously authorized tag was separately captured
as bound to `pmi-kc-app-rmvc7c5lz-ec2410dd001a`; canonical serving traffic was not substituted for it.
No traffic rollback was used in this successful run.

## Aggregate application changes

The October 16 implementation c99659d5 and documentation 15648c0e were already on main.
85b7e03c corrected the machine-readable release queue and stale dispatch-resumption instructions;
a7bce098 added the diagnosed Notifications repair and truthful failed-attempt/authentication records.
Custom maintenance/vendor navigation, HTTP/API, shared workflow and worker effects are retired;
authorized records, receipts, knowledge, permissions and read-only history remain. Vendoroo stays
standalone. Renewal Focus/Full/mobile/facts/copy/autosave, supported exact source updates, linked
Gmail reads and permitted unsent drafting are preserved. Sends, schedules, Resume and worker
dispatch refuse at operation admission. Dotloop company/office diagnostics, freshness and
failed/unsupported selection rejection are deployed without opening writes.

## Qualification

The complete corrected-tree bash scripts/verify.sh gate passed 9,590 unit tests across 1,022
files with no local skips, all 455 backend tests across 79 files, lint/typecheck/format, required
policy checks, production build and zero production audit findings. The 79 existing lint warnings
remain. All five exact-main CI jobs passed in run 39024854536 (CI unit: 9,586 passed/four existing
configuration skips; backend: 455 passed). Fresh served core E2E on a7bce098 passed 39 tests with
22 existing configuration skips. Canonical verification used native WSL Node 24/Java 21; the
release controller used native Node 22.23.2 and snap gcloud.

## Failed first attempt and verified repair

The first run a97c579c at 85b7e03c passed build/candidate/promotion, then failed its final
Notifications browser route at 30,006 ms. Observation remains failed (one checkpoint, 477,992 ms),
with all 318 records matched and zero candidate 5xx/unresolved effects. Receipt-bound rollback
verified at 2026-10-17T10:05:14.585Z. Its terminal checkpoint, admitted permit state, claims,
receipts and operation ids were archived byte-for-byte under the real lock before replacement;
none was rewritten or reused. The slow document request took 29.175 seconds. A fail-first test
confirmed independent review/support reads waited behind event reads; the repair starts those
reads together without changing counts, permissions, content or browser bounds.
The final passed Notifications route rendered in 20,805 ms with zero diagnostics.

## Independent verification and remaining limits

Production/Live, the managed runtime service account, eleven Spaces, Demo=false, Sheet=true,
five existing secret bindings (Dotloop client secret version 1), RentCast allowance 50 and existing
cost/security controls are verified. All 54 environment keys match the captured predecessor except
APP_COMMIT_SHA; the five secret bindings and runtime identity match. Both workers' captured target
fields, states and schedules match; the annual GET probe is restored PAUSED. Registry metadata remains
48 exact keys, 18 open/30 closed; operation refusal overrides old send/maintenance metadata.
Editor browser coverage remains not_run under owner-admin-2026-09-10; backend restrictions remain.
Human acceptance and physical-phone checks: NOT RUN — no human observer.

Normal managed Dotloop resource refresh succeeded on production. The supported individual
template list is empty; the company-template read failed as unavailable, which does not prove an
empty company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; no template recreation is requested. The live UI
distinguishes failed and empty reads and excludes unsupported profiles from selection. Both Dotloop
write keys remain closed. Gmail's provider profile read succeeded for the expected managed mailbox;
sync health reports degraded. No customer draft/send, loop, upload, signature, paid comp request or
production test record was verification proof. Normal connection refresh updates only its existing
credential/observation metadata; it is separate from guarded read-only release assurance.

Guarded production checks made zero business mutation attempts. Separate post-release checks
confirmed retirement notices/history at desktop and 390px, no horizontal overflow or operational
history controls, and truthful Dotloop diagnostic UI. Raw provider/customer/authentication material
and detailed execution evidence remain outside Git. Original checkouts and parallel projects were
preserved. A later documentation/test-pin closure commit changes no runtime assets and requires
no new deployment; the deployed source remains a7bce098.

Two supplemental verifier assumptions failed initially: disabled options were counted as selectable,
and a projected Scheduler baseline was compared with a full response. Separate read-only checks
verified disabled state and every captured field; both passed. The original failed artifacts remain
outside Git. No application source or release gate changed to resolve those verification errors.
