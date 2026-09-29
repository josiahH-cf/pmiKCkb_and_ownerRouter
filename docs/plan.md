# Current plan

Updated: 2026-09-29 (UTC). All thirteen features remain queued; production still serves S120.

## Outcome

The owner’s 2026-09-29 batch-scoped completion authorization is recorded in AGENTS.md. It permits
necessary Cloud Build/Cloud Run actions, diagnosed and verified repairs, resumes/replacements,
promotion, receipt-bound rollback and documentation closure through verified deployment of all
thirteen features. It supersedes per-attempt approval counts while retaining every technical and
safety gate. No source, checkpoint or receipt from a failed attempt may be rewritten as success.

Run `de37a023-5762-435f-b28b-bd0e724cdd7f` carries all thirteen features at
`565fd837c5df67d4923f91d6b7d1c2b3840da7da`; exact [CI 36603662631](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36603662631)
passed. Recovery receipt `975fe996-26c3-4898-bb6b-e627e2a42a7f` passed at 17:38:55.104Z.
One application build `eae06d16-3911-4d65-8216-b0f0efa29a3d` succeeded at 17:44:17.867568Z.
Candidate `pmi-kc-app-rmumy904w-9cb39576b998` is at zero traffic, Production/Live,
Demo=false and Sheet=false; smoke, fingerprint and domains passed. Assurance is BLOCKED.
An instrumented read-only execution of the formal pipeline reproduced My Work's initial-render
race: two matching headings and an error panel before hydration, without a failed request.
The latest reconciliation matched all 311 records with complete stable sources and zero discrepancies.
Earlier source-unavailable and failed assurance results remain failed. No candidate receipt,
promotion or observation exists; canonical S120 remains at 100%. Keep all thirteen queue entries.

My Work now reports its first read as loading from server render through hydration, retaining
real read failures and explicit read-only Retry. Three new regressions failed on the original
source; the repaired source passed all 23 focused checks in four files. The full repaired-tree
gate passed at 18:35:17.388716Z: 7,433 unit passes, four existing skips, 232 backend passes and all
required checks/build. Replacement exact-head CI remains pending. The prior SDK repair passed 7,430 unit tests,
four existing skips, 232 backend tests, all checks/build and exact 565fd837 CI. Runtime limits,
assurance concurrency/deadlines, safety controls and the frozen admitted checkout remain unchanged.

## Current implementation baseline

Production serves `79493458f641b9710d8c43467e872aa9acf7948e` as `pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic. Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app. The audit read back Production + Live, managed runtime identity, eleven Space maps, Demo false and Sheet write-back true. S128 is false in both ignored env files and the current de37 recovery/candidate revisions. The pause has not been promoted.

Serving S113 supports normal Sheet append/field updates and refuses row deletion and historical restore. S96 — safe connector disconnect and reconciliation remains deployed. S82/S97/S98 conformance, S102-S110, S106/S34 handoff and S114-S120 operator improvements remain the delivered baseline. Both Dotloop keys remain closed. Document presence is not verified content or signature completion.

## Canonical closure sequence

Stages 1–5 retain their implemented engineering contracts and scoped evidence in the batch audit.
Stage 6 is blocked in candidate assurance by the reproduced initial-render race. Verify the My Work loading
repair, preserve/retire the failed run under the release lock, and require a new exact-head GO.
The existing owner authorization covers this diagnosed replacement; no gate or old result changes.

### 1. Hold the release safely and resolve browser readiness

- Re-read process, lock and checkpoint state. The unchanged scheduled task can restart the watcher; a stopped process is not a durable hold. Acquire the existing release lock before installing or publishing repair code. Reconcile any in-flight phase first.
- Add a local release hold and one-run permit outside Git, honored by the PowerShell launcher, watcher and direct release commands. Missing, malformed, held, expired or wrong-SHA permission refuses new forward effects. Bind permission to the reviewed main SHA and run. Separate prepared permission (read-only preflight only) from admitted permission (forward effects); atomically admit only after fresh GO while retaining the release lock. Every entry point checks that admission. Consume it on completion and recheck before mutations. A hold must still permit already-authorized receipt-bound safe recovery. Keep Task Scheduler and security settings unchanged.
- Hold the existing lock throughout installation because the old runner ignores the new hold. Never forge a completed checkpoint or use a rollback-success flag to represent a hold. Preserve the stale archive and cancelled-build evidence verbatim.
- Diagnose Admin browser timeouts with sanitized navigation milestones, native executable/profile/lock checks and DNS/TLS/redirect checks. Locate failure before sign-in, during assets/Google navigation or after callback. Use the existing guarded browser and approved identity. Do not copy profiles, edit protected auth code, relax deadlines, log credentials or repeat login blindly. An observed challenge/expired enrollment requires owner-attended enrollment. Verify actual identity/role, not HTTP 200.

**Exit:** restart and competing-launch tests prove partial work cannot deploy; evidence remains intact; canonical guarded Admin authentication passes or has a concrete owner-attended blocker. Browser diagnosis may continue alongside independent implementation, but release requires actual readiness and sufficient fresh-enrollment time.

### 2. Repair both rollback paths and admission — G6, G7

Principal files: `scripts/release.mjs`, `scripts/release-watcher.mjs`, `scripts/release-watcher-plan.mjs`, `scripts/release-batch-preflight.mjs`, `scripts/production-assurance-receipts.mjs`, `scripts/observe-production-release.ts` and `lib/production-assurance/revision-configuration.ts`.

- Prepare a recovery-only zero-traffic revision before promotion. Reuse the original predecessor's resolved image digest and full immutable runtime configuration; do not rebuild or inherit the candidate's current service template. Preserve containers, commands, env/secret references, identity, maps, volumes, resources, probes, scaling and networking. Change only Sheet=false and necessary revision identity. Reject unexplained or unsupported differences.
- Persist the intended revision name before dispatch; preserve explicit serving traffic and use service-version conflict checks. Reconcile lost responses against the same target. Read back Ready, exact commit/digests/configuration, false Sheet flag, zero traffic and unchanged serving/security state. This safety prerequisite adds no second application build or preliminary production promotion.
- Capture the original baseline first. For zero-traffic recovery assurance, reuse its already-authorized candidate hostname through a bounded tag reassignment, recording both bindings. Verify the exact recovery revision with guarded Admin assurance and monitoring. Separate zero-traffic checks from canonical recovery checks. If the existing domain/tag contract cannot support this safely, stop with the concrete decision required.
- Issue an immutable versioned supplemental recovery receipt binding run/service, original and prepared revisions, digests, fingerprints, allowed difference, tag binding, readiness, assurance and times. New candidate/promotion receipts reference its identity and hash. Preserve original receipts and historical readers; the zero-traffic target is not the original canonical baseline.
- Replace raw predecessor restoration and on-demand redeployment with one shared recovery executor. Persist one globally shared durable attempt claim, intent and operation/reconciliation state before traffic mutation. Both promotion compensation and observer rollback consume the same receipt, recheck pause/configuration/identity, reconcile ambiguous operations and verify canonical 100% traffic on that exact target. Never create another target or blindly redispatch after a lost response; unchanged traffic does not prove the first request was never dispatched. Terminal readback must be idempotent. Unexpected traffic or expired auth holds the same intent. Emit ROLLED_BACK_VERIFIED only after traffic, configuration, version, Admin assurance and monitoring pass.
- Harden preflight: unknown is not GO. Require exactly thirteen expected suites with ancestor commits, matching checkout/remote target, exact green push CI, both expected env files with explicit false flags, approved fresh auth, native tools, correct checkpoint/lock and exact run permit. Evaluate the watcher's actual target, not only local HEAD. Initial GO admits recovery preparation and the application candidate; a separate promotion gate requires completed recovery evidence plus current candidate assurance. Avoid a circular gate.
- Immediately before consuming the candidate receipt or issuing the first promotion traffic command, re-read the original 100% baseline and the recovery target's Ready state, digest, configuration and Sheet=false. Require fresh version-bound supplemental evidence; earlier preparation checks alone cannot admit promotion.

**Exit:** both callers pass adversarial tests using real receipt validators, including different predecessor/candidate configurations; true/missing/malformed flags; wrong digests/targets; receipt substitution/replay; lost responses; every persistence/dispatch/readback crash boundary; auth expiry; unexpected traffic; failed monitoring; and restart with an existing operation. Invalid queue/env/CI/checkpoint/permit and unknown preflight cases refuse forward execution. Do not mock unconditional recovery success. Reconcile the runbook before use.

### 3. Repair renewal evidence, draft refusal, dates and pause — G1–G4

**G1: notice history and honest withdrawal review** (litmus 19, 25). Extend the existing workspace/cycle/activity transaction. An explicit review/save records server-resolved lease/cycle identity, verified provider flags, validated dates, actual source age, evidence hash and monotonic review generation through the existing operation ID, expected revision, actor, idempotency and readback. Feed that evidence into desk and message projections. Store pre-cycle reviewed evidence at the existing lease workspace scope without auto-starting a cycle; bind it to verified tenancy and explicitly associate it when applicable. Never carry prior evidence into a different tenancy or newer cycle by lease identity alone. Opening and refreshing never record workflow progress or reviewed notice history. Under the explicit owner approval below, authenticated provider-read generations may update only the separate approval-invalidation marker; filtering, sorting and copying do not create workflow records.

A recorded positive followed by fresh clear evidence becomes a withdrawal-review case. The provider has no established cancellation field: null/absence/time cannot prove provider withdrawal. An explicit staff-reviewed withdrawal stays staff evidence, with both source observations visible. Missing/stale/failed evidence remains unknown; manual non-renewal stays independent. Do not claim durable history for unrecorded read-only observations or infer events the provider never supplied. Align labels, guidance and active suite prose with this boundary.

**G2: non-renewal refusal and review invalidation** (litmus 22, 25, 58). Centralize the outreach decision from current provider evidence, recorded notice generation and current owner/tenant disposition. Enforce both audiences at preview, confirmation and final S20 claim. Include tenant response, manual disposition and notice generation in the workspace message basis; include stable normalized notice facts and evidence-version identity in the source basis. Validate actual source age separately; hashing a continuously changing age would invalidate every request. Transactionally reread workspace/preparation/snapshot at claim. A changed recorded generation requires fresh review even when fields return to former values. Returning to an earlier status cannot revive an invalidated approval. Preserve immutable snapshots and identifier-only recovery of an already-dispatched draft, without granting another creation.

**Owner-approved G2 design, 2026-09-29 UTC:** cover saved review -> positive notice seen only in a read -> notice clears -> former fingerprint returns, including restart and an older browser's confirmation. The owner explicitly permits authenticated source reads to update a durable lease-bound version/hash/time approval-invalidation marker, with no workflow milestone, provider write or customer draft. Before a genuinely new provider read, durably invalidate existing review markers; refuse the fetch if that admission fails. Bind resolution to the admitted source generation and exact verified tenancy/cycle. The final S20 transaction must reread and match marker version/hash and source freshness along with workspace/preparation/snapshot. Previously issued approvals cannot revive when source values return to an old state. Explicit staff review remains separate and audited. Test failed persistence, restart, concurrent reads and confirmation races. Unobserved provider history must never be claimed as known.

Owning seams: `lib/firestore/renewal-workspace.ts`, `lib/firestore/renewal-message-claim.ts`, `lib/lease-renewal/move-out-disposition.ts`, `lib/lease-renewal/current-renewal-message.ts`, `lib/lease-renewal/message-claim-basis.ts` and workspace/message-preparation routes.

**Final source-read coherence follow-up:** compiled verification exposed independent page/API caches
serving older source generations after another runtime advanced durable invalidation metadata.
Use managed-reader metadata floors and exact admitted membership for both lease and status reads,
with one initial pass and at most one catch-up pass for only the lagging source. Feed the same final
source pair into the desk/detail facts, packet selection and notice projection. Preserve the existing
post-write freshness barrier. If coherence or status is unavailable, retain already-readable lease
facts and explicitly refuse notice readiness. Do not manufacture portfolio reservations or reviewed
history. Reproduce cross-runtime, multi-lease recovery and a concurrent second advance; then require
the unchanged 20-second compiled notice gate and real desk readback.

**G3: calendar validation and display** (litmus 32, 33, 37). Use the shared parser/formatter for every app-authored calendar label, including move-out, withdrawal and all `lib/lease-renewal/cycle-source-date.ts` branches. Reject impossible dates; invalid evidence cannot become explicit absence. Preserve ISO storage, source text, hashes, provider payloads and chronological sorting. Missing/invalid values get an explicit unavailable or data-check state. Inventory both visible and accessible labels.

**G4: proposal-free pause and fresh confirmation** (litmus 47, 48, 51). Check pause before automatic and explicit proposal creation at route and service boundaries. App saves persist legitimate app-owned values without Sheet proposal/execution records and read back “Saved in app; Sheet updates paused.” Keep historical proposals/receipts/ambiguous outcomes readable with their original meaning and read-only recovery. Bind new executable proposals/confirmations to trusted server runtime revision and enabled-policy identity; reject legacy-unbound/missing/mismatched bindings during validation, transactional claim and immediately before dispatch. Existing Cloud Run K_REVISION avoids a new cloud setting; tests use an isolated injected identity. Keep historical schema readers. A future separately authorized resume must use a fresh revision and fresh target review/confirmation, never reactivate an old enabled revision or flush accumulated changes. Every deployment conservatively invalidates unexecuted proposals.

**S127 AC-S127-5 repair:** successful app-owned issue saves now bind the next-control focus intent to authoritative readback and the completed router transition. Lease/cycle/revision mismatches, failed or unchanged refreshes retire the intent; later ordinary reloads cannot revive it. Unrelated unsaved input is preserved. Reads, refused/conflicting saves, provider execution and recovery do not request advancement; exact PDF inspection/approval keeps its specific flow. Mounted tests and independent review pass, and build K's actual compiled save/readback focus passed. That focus result retains its exact-build scope; the reservation repair's compiled follow-up exercises the affected notice/cohort source path and is not a new focus verdict. The narrower litmus 40/42 checks do not waive this suite requirement.

**Exit:** actual route/store/claim tests cover notice -> failure -> clear, wrong lease/cycle, pre-cycle review without cycle creation, same-lease new-cycle/old-tenant exclusion, the read-only notice round trip above, concurrent reviewers, duplicate/lost saves, both manual declines against both audiences, decline between preview and claim, stale tabs, and withdrawal with manual non-renewal. Reads create no workflow/history records; only the explicitly approved invalidation metadata may persist. Date tests cover leap/impossible dates, zone/day boundaries and rendered labels. Pause tests prove zero proposals from saves/legacy callers, immediate pre-dispatch refusal, rejection of unexpired old confirmations after restart/resume, and intact historical recovery. Browser checks use actual controls/readback. Extend S123/S124/S126/S128/S129 and S98/S113 coverage.

### 4. Produce and verify actual filled output — G5

Litmus 67, 69 and 74 require actual saved output. Choose bounded server-side AcroForm PDF filling because the current Dotloop adapter has no established field-write/read API. Static/unsupported forms and native templates retain honest prepared-values/manual handoff until their actual seam is verified.

- Select and pin a compatible dependency after primary-documentation, license, provenance and advisory review. Resolve approved original S21 bytes and parse the actual field inventory. Initially support reviewed text, checkbox and enumerated-selection fields. Reject encrypted, corrupt, XFA, active/script-bearing and otherwise unsupported content. Leave signature fields untouched; reject overflow, unsupported glyphs/options, ambiguous names and insufficient repeated-party capacity. Never invent legal wording or mappings.
- Fill actual bytes, save through existing private integrity-checked content storage, reopen and compare every approved field. Keep originals immutable. Record original version/hash, mapping version/hash, reviewed input snapshot, adapter version, actual output hash, content reference, comparison and preparer/reviewer/approval identities/times. Separate byte identity from provenance-envelope identity.
- Integrate preparation, actual download/inspection, comparison and separate exact-output approval into existing artifact/packet controls and routes. Reload reads saved output; GET generates nothing. Original/map/parties/terms/dependent-input changes invalidate unexecuted preparation. Preserve roles and Space boundaries without protected auth or Firestore-rule changes.
- Extend S21 derived-content ownership and S34 packet/action binding to transport the approved derivative's actual bytes/hash. Recheck bytes, current mappings/snapshot and approval before dispatch. Preserve at-most-once claims, duplicate/partial-upload recovery and closed keys. Local byte equality is local evidence; provider presence and signature completion retain their existing meanings.

Principal seams: `lib/lease-documents/artifact-intake.ts`, `lib/lease-documents/approved-artifact-content.ts`, `lib/lease-documents/dotloop-packet-binding.ts`, `lib/lease-renewal/execution/normal-packet-action.ts`, `lib/publication/content.ts` and `app/api/lease-renewal/document-artifact/route.ts`.

**Exit:** a nonlegal synthetic form traverses actual local/emulator publication, mapping, approval, preparation, storage, download, independent-parser extraction and packet/adapter submission. Compare every expected value in downloaded bytes, including repeated parties/animals, zeros, dates, checked/unchecked states and selections. Submitted bytes match that download; the original hash stays unchanged. Render/inspect for clipping and unintended changes outside filled regions. Test stale inputs, wrong hashes/roles/Space, forged approval, corrupt storage, concurrent review and response loss. No synthetic artifact enters production. Actual supplied-form accuracy/provider acceptance remain separately owned below.

### 5. Prove the entire batch and reconcile all litmus rows

1. Reproduce each original gap with a failing regression, then exercise its fix through actual route/store/claim/receipt boundaries. Independently review G1–G7 and update their evidence rows.
2. Run all thirteen suites, `bash scripts/verify.sh` and `npm run test:e2e:core` in native WSL with Node 22 and installed Java 21. Run changed emulator/backend journeys with Firestore coverage; intentional core skips cannot substitute for them. Preserve failed reports unchanged.
3. Run the seven compiled smokes on the native local read-only rehearsal: navbar, dashboard-assistant, renewal-desk, renewal-guide-controls, maintenance-blockers, maintenance-intake and theme. Add actual-control journeys for G1–G4 and artifact download/approval; run Work regression where release/recovery changes touch it. Keep synthetic fixtures local/emulated, source freshness/deadlines intact and live adapters read-only.
4. Reconcile every litmus index and the S121 exclusion against exact tests, browser reports and pending remote readbacks. Each row names scope, evidence, SHA and remaining input. A helper or neighboring pass cannot close a row. Audit roles, exact keys, secrets/PII, private inputs, dependency changes and the complete diff.
5. Keep the hold while committing/pushing green slices. Explicitly stage files to preserve unrelated private inputs. Require final exact-main push CI. Reconcile `docs/release-batch-runbook.md`, suite acceptance statements and delivery evidence with the final implementation. Prepare the one-run permit only for that reviewed head and all thirteen entries; it remains non-executable until stage 6 admits it after fresh GO under the lock.

**Exit:** G1–G7 engineering gaps closed, required tests/browser reports and exact-main CI passed, external holds explicitly scoped. Local passes never substitute for deployed evidence.

The shared audit's **Remaining executable checks and external holds** inventory maps the final
replacement checks to the pasted indexes. The historical Sheet-proposal/resume
browser branch now passed the isolated compiled component fixture recorded above; actual provider
mutations and production pause changes were excluded. Recheck applicable actual-source views, notice/date/readiness and
lifecycle surfaces on the exact remote replacement, retaining aggregate-only diagnostics.

### 6. Release once, read back and close documentation

**Current replacement:** de37 passed recovery and one application build, then failed assurance.
The formal-pipeline diagnostic reproduced the My Work initial-render race. Finish full verification of the My Work
loading repair and exact main CI before safely retiring de37 and admitting a new cumulative run.
The earlier SDK and build-provenance repairs retain their scoped evidence in the batch audit.
Follow the repaired ordered runbook. Re-read billing/cost controls and fresh approved auth; inspect checkpoint/archive/lock and both false local flags. Acquire the free release lock for admission and repeat native preflight until GO names the reviewed head and exactly thirteen suites. Atomically admit the prepared permit while retaining that lock, then hand lock ownership to exactly one native-snap-gcloud watcher without an unguarded launch window. The runner revalidates the admission itself; the scheduled task cannot race ahead of preflight. Follow independent phase readbacks: prepared recovery receipt, candidate build/smoke/configuration/domains, guarded Admin assurance, reconciliation, exact promotion and the full 300,000 ms observation. Diagnose failures before retry; preserve every attempt.

Run `~/pmi-kc-work/scripts/s120-readbacks.sh <head-sha> <revision>`. Independently verify canonical/tagged identity, 100% traffic, Production + Live, ASK_DEMO_MODE=false, LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false, reviewed fingerprint/configuration, runtime identity, eleven Space maps, secret bindings, monitoring and exactly one candidate authorized domain. Prepared/actual rollback targets must also read Sheet=false. Recheck applicable read-only feature surfaces on the exact deployed release; fixtures do not prove customer effects.

Only a successful observed release clears Awaiting release. Update facts, loop-state, status, plan, handoff and audit in place. Run pinned environment-handoff-provider-table and plan-status-sync tests, Prettier and all document gates; commit/push documentation-only closure. Consume the permit and read back terminal watcher/checkpoint state without disabling the task. Report RELEASED, ROLLED_BACK_VERIFIED or BLOCKED with SHA, revision, tag, fingerprint, receipt times, observation/readbacks, documentation commit and every remaining hold.

### External and human closure work

Collect/read already available approved material first. Keep private sources, customer values and credentials outside Git. Missing inputs block only dependent work; blank resource boxes remain supported and deferred requests are not repeatedly raised. This plan authorizes no external message or live effect.

| Item                             | Owner and next action                                                                                             | Completion evidence                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| B-DL1                            | External supplier/owner delivers approved OAuth credentials through the recorded secret path.                     | Non-secret binding/readiness readback; no credential in output or Git.                                                                     |
| B-DL2                            | Owner connects managed account and selects verified office/profile/template/type/status.                          | Authorized resource/connection-generation readback; keys stay closed.                                                                      |
| B-DL3 and supplied-form accuracy | Owner supplies approved material covering seven families; reviewer checks applicable maps/output.                 | Approved versioned originals/maps, actual filled-output comparison and recorded human accuracy verdict; manual fallback where unsupported. |
| Dotloop live execution           | Owner separately authorizes exact-key proof/activation after prerequisites.                                       | Exact confirmation, own attempt receipt and provider readback; signatures stay separate. No live proof in this release.                    |
| B-S100                           | Owner supplies exact work order/resident-message association and verified resident email.                         | Existing warned/confirmed sync, bounded draft proof, mandatory close/readback and separate authorized activation.                          |
| B-MNT1                           | Owner supplies exact properties, amounts and effective dates.                                                     | Human-confirmed preapproval readback and separately authorized routing proof.                                                              |
| B-MNT2                           | Owner/vendor administrator supplies product/account identity, terms, scoped grant and primary interface evidence. | Supported/unsupported findings, reconciliation owner and recorded handoff decision; no implicit connector build.                           |
| Notice timing                    | Authorized policy owner confirms comparison anchor/counting convention using reviewed configuration.              | Exact version/date-basis readback; classifications remain unavailable until approved.                                                      |
| Rhino                            | Material owner supplies/approves applicable policy version and reviewed lease evidence.                           | Actual wording/applicability review; fixtures cannot validate coverage or terms.                                                           |
| Customer drafts/resources        | Staff selects real case, verifies recipients/sender/charges/terms and supplies deferred resources when available. | Recorded accuracy review; any unsent live draft needs its own exact human confirmation and receipt. No send.                               |
| Walkthrough/human verdicts       | Team selects one or two real leases, policy case if supplied, and performs consented walkthrough.                 | Step/actor/time/expected/observed/evidence/owner record; update draft process materials only from observations.                            |
| B-AUTH2                          | Operator observes unchanged enrollment across fresh-shell/reboot and 24-hour elapsed-session checks.              | Timestamped CLI/ADC/browser results without reenrollment resetting the interval; separate from release acceptance.                         |

S36 is queued behind complete S100 and is outside this batch. Closing these holds later still requires their exact inputs and separate effect authorities; tests cannot invent them.

## Authority and closed decisions

Completed S97-S99 and S100 chat proofs are not rerun. Permitted live writes retain exact human preview/confirmation, bounded execution, receipt/readback and correction requirements. Live providers stay read-only for this release. No customer draft/send, synthetic production record, paid comparison, signature effect, new action grant or maintenance connector is part of the repair run.

Do not change billing, budgets, guardrails, system/security settings or protected paths. If a protected change proves necessary, surface the concrete patch and stop before push; never weaken the control. Never enter a password/code/passkey/CAPTCHA. Use the approved managed identity. No force-push, history rewrite, release tag or branch deletion.

Admin-only assurance remains; Editor browser coverage is not_run with full backend role restrictions. Historical exceptions do not widen candidate gates. Keep dependent release actions held until their checks pass. Diagnose and repair agent-owned failures without another approval solely for attempt counts. Stop for disabled billing, expired enrollment requiring a person, auth-held rollback, an unshippable cumulative batch or a required lowering of a safety control. Independent work may continue while external inputs are held; dependent deployment/effects cannot.

## Per-suite delivery rule

Only actual passed gates receive ALL_GATES_GREEN. The local engineering gate passed; the batch has no completed release verdict. Engineering completion requires G1–G7 acceptance and full litmus traceability; deployment additionally requires the one exact release and readbacks. Full operational validation also requires each applicable real-input/provider/human row above. Staff evidence never becomes a provider receipt or signature. Unobserved outcomes retain explicit verdicts. S87 — final six-cohort product-wide content reconciliation retains its existing dependencies.
