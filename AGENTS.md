# PMI KC Product Agent Router

This is the only authority-bearing runner-neutral router for this repository. Read it before acting.
Current implementation truth lives in `docs/facts.md`; the resume pointer is
`docs/loop-state.md`. Historical documents removed during the 2026-08-26 context reset remain
recoverable in Git at commit `1356918`, but they are not active guidance.

## Truth precedence

When two sources disagree, use this order:

1. this router for authority and safety;
2. live readback plus committed code/tests for implementation truth;
3. `docs/facts.md` for the concise verified ledger;
4. `docs/loop-state.md` and `docs/plan.md` for current work;
5. an active file listed in `docs/feature-suites/README.md`;
6. Git history for provenance only.

Never revive a historical blocker, Demo/Test policy, action grant, or provider claim without checking
the current code and live service. Date-stamped history is not authority.

## Present production truth — 2026-10-05

Run `e372f7b5-3a1d-4224-945e-148a5f040660` released the release-tooling and audit follow-up (two queued items) at
`337ac163c5709381e8db8d2c18810bec357d8a96` / `pmi-kc-app-rmuz9g28p-0a2909d490e1` with 100% production traffic.
S51 (`717eb9ae`, PR #146) warms a possibly cold revision before each candidate, recovery
preparation and rollback canary, predecessor baseline and candidate smoke measures it, and the
post-promotion observation now decides by 480,000 ms. S54 bounds the Firestore lane for
transaction contention (`b680dd6e`, PR #145) and moves Next.js to the patched 16.3.8 for six
production audit advisories (`ea79bbbf`, PR #147).
Exact [CI 37747457191](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/37747457191) passed.
The release head passed lint, typecheck, format, 9,011 unit tests with four existing
configuration skips, all 340 backend tests and the production build; core E2E passed 32 tests with
22 existing configuration skips. The production audit reports zero findings. No phase paused: the
recovery preparation, candidate smoke and canaries ran their warm-ups and passed on the first attempt.
One application build `6e3cdead-5c8b-4c68-89cd-5d34617d87bb` succeeded at 2026-10-08T08:25:18.918163Z.
Candidate receipt `caaf4096-637a-4534-a998-3eaa567779c2` issued 2026-10-08T08:30:41.068Z;
promotion verified 2026-10-08T08:30:59.978Z.
Observation passed two checkpoints in 389,677 ms against the required 300,000 ms,
inside the 480,000 ms deadline. All 318 source/projected/rendered records matched with
zero discrepancies, candidate 5xx or unresolved live effects. All eleven independent readback
sections matched, completed 2026-10-08T08:37:49Z.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=true are verified.
The revision keeps the reviewed Dotloop client configuration with the client secret bound from
Secret Manager version 1. Both Dotloop write keys stay closed.
Tag `cand-rmuz9g28p-0a2909d490e1`; fingerprint `sha256:a52280044bfad3bbf657d03836fedb5c275ec581f6f346bba419d3e341f36960`.
Captured predecessor: `5ee574b2fba81c83fa63086496d7f2ebb299268c` / `pmi-kc-app-rmuybjtnr-f43dfa3d6d26`,
Sheet=true. Run-bound recovery `pmi-kc-app-recovery-e372f7b53a1d4224` preserves that actual configuration;
receipt `8302e68a-646e-4a1b-9abd-5c277e7ed4ad`, reference hash `sha256:2110c8a111f007999009daf4891a8c5d22a4a116cd327fca4c3c19e46e25974b`.
No traffic rollback or business mutation was used as proof.
The bounded live S106 connection check passed on 2026-10-07; the renewal template waits on a full
Dotloop admin and resource selection on the owner (B-DL2, F-DOTLOOP-ADMIN-RIGHTS).
Run `5622decd-0a6d-479a-bb75-545ba4aa0069` released the S130 stale-value follow-up at the captured predecessor;
run `87920129-23c0-4420-a787-13036029d6f8` released the Dotloop PDF renewal v1 second release (S182, S66, S130 and S34),
run `5b5c850e-a131-4e37-996a-457f5f9fd62c` the S106 connection slice and run
`61659874-478d-4135-9810-5033b2f732bf` the batch 005 open-item fixes.
Batch 005 (S168–S175, revised S87 and S176–S181; intake 035–049) was released by run
`8b7dc3f1-4c5b-482a-94ca-26985150c68d` at `fa5b2b27bbfbe13e7f0a9e70367cb3e727fe5a27`; runs
`5d1b4e3a-ef6d-4354-aef1-e9952dd28687` and `7753e5f5-2325-4b19-b83d-dc3475d71b0b` released its verification repairs and follow-up fixes.
Batch 005's 116 requirement records are in [native evidence](docs/evidence/application-usability-batch005.json);
independent verification of it is recorded in F-BATCH-005-VERIFICATION.
The two-item queue is delivered and empty; the exact permit is consumed.
Editor browser coverage remains `not_run` under the approved Admin-only contract.
Human verdicts: **NOT RUN — no human observer**.

The September 30 thirteen-feature gate passed 7,462 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

September 14 Features 1–6 and S113–S120 remain carried in this release.

The owner-requested adversarial review closed five confirmed findings through verified repairs
and a cumulative deployment. The current permit is consumed and the queue is empty; original
completed runs and every failed attempt retain their actual evidence. No technical or safety
gate was lowered. Evidence: `docs/evidence/adversary-review-2026-09-29.md`.

S113 F1-F5 is complete and deployed: one lease dashboard, typed corrections and supported Sheet/
RentVine updates, restored operator-triggered RentCast preparation, supplied formatted/copyable
messages with governed unsent Gmail drafting, audited manual progress and the integrated journey.
Its original verification passed 6,528 unit tests (four existing skips), all 201 backend tests, policy
checks and production build. All 33 in-scope adversarial findings are closed; seven compiled browser
checks passed, including the 42-step guide. Human verdicts remain NOT RUN.

Staff-recorded completion reports actual outside work and remains separate from provider-verified effects. Backend journeys use actual controls, routes, Firestore, claims, receipts and readbacks with deterministic external adapters; no live customer effect was created to demonstrate completion.

Persistent labeled insurance-flyer, renewal-information-form and seven legal-form location boxes accept blank pending-team inputs. Only output requiring a real verified resource waits; placeholders never become customer links or legal content.

S106/S34 normal packet preparation, approval, exact S21 bytes, S20 queue/ledger execution and own-receipt recovery are implemented and deployed. Real approved forms/catalog/mappings, managed Dotloop credentials/connection/selection and separately authorized exact-key activation remain gates. Both Dotloop keys remain closed. Signature work is a human handoff; document presence and submitted content hashes do not prove signatures or provider-owned content verification.

- Project `pmi-kc-kb-prod`, service `pmi-kc-app`, region `us-central1`; canonical https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- Current captured predecessor: `pmi-kc-app-rmuybjtnr-f43dfa3d6d26` / `5ee574b2fba81c83fa63086496d7f2ebb299268c`, Sheet=true. Run-bound recovery: `pmi-kc-app-recovery-e372f7b53a1d4224`, receipt `8302e68a-646e-4a1b-9abd-5c277e7ed4ad`. No traffic rollback occurred. Older false-switch recovery receipts retain their historical meaning.
- Runtime remains Production + Live, managed runtime identity, eleven Spaces, Sheet write-back
  true since the S152–S167 release (run `47fabb7c`; the current recovery target keeps true), false Demo flags, existing RentVine/RentCast secret bindings and RentCast allowance 50.
- S82 conformance, S97 replay/ambiguity integrity, S98 normal append and owner-approved field
  updates, S102-S110/readiness corrections and S51/S54 assurance are serving. Row deletion and
  historical restore/proof mutations remain unavailable. Matching observations cannot establish
  provider creation causality or mint receipt-bound reversal authority.
- S96 and the S83-S86 access/navigation/theme/interaction foundation remain deployed. S97-S99 and
  S100 chat-sync proof-qualified exact keys retain their contracts; completed proofs were not rerun.
- The Registry remains 48 exact keys, 16 open and 32 closed. Only two Sheet descriptive metadata
  entries were aligned with backup, compare-and-set and readback; no activation changed.
- S100 resident-draft activation still needs the exact synchronized resident/verified-email input;
  S36 remains queued behind complete S100. Revised S87 is deployed in batch 005; overlapping S88-S93/S101 and S95 proposals are superseded, while S94 remains unexecuted.
- Existing monitoring and domain gates passed. The managed alert recipient remains unchanged.
  No paid comp request, live customer draft/send, new provider proof or signature effect ran.
- Both private supplied v2 templates are published and read back approved. Private sources and
  customer data remain outside Git. Staff and provider evidence retain their separate meanings.
- Fresh approved WSL CLI/ADC browser flows and identity binding passed at 2026-09-29T20:23:16.794Z; approved-store refresh verified at 20:23:20.424Z. Earlier post-restart probes remain historical evidence. Owner-completed Admin enrollment verified the Admin role at 09:34:11.947Z. Separate 24-hour unchanged-enrollment longevity remains unverified; no identity, IAM or claim changed.

The owner-approved v4 receipt records only the exact blocked predecessor My Work reconcile defect on `d243911cb20ffb01773072c0e27c723648eeea34` / `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` as `failed_known_legacy_defect`. The single request was aborted before dispatch; its matching browser failures remain recorded. Candidate and post-promotion checks passed with zero mutation attempts. Editor browser coverage is `not_run` under the owner-approved Admin-only policy; backend role restrictions remain.

The 919a2ae candidate passed CI 34549763928, candidate assurance and promotion, then failed final observation at 420,140 ms and verified rollback to d243911. Its consumed candidate receipt, promotion receipt, failed observation and terminal rollback checkpoint remain preserved; the failure was never rewritten as a pass.

The earlier 6e77d18, 00836a8 and 297af97 candidates were archived as superseded without claiming their failed
or unfinished assurance passed. Current release evidence is in
`docs/evidence/application-usability-batch005.json`; the earlier batch litmus audit and S113 review retain their own scopes.

## Product boundary

PMI KC is one deployed application with three connected lanes:

- PMI KC KB: source-backed knowledge, Console, Spaces, processes, approvals, and Admin.
- Lease Renewal Agent: complete RentVine/Sheet reads, reconciliation, comps, reviewed drafts, and
  lease-specific work.
- Workflow Communications: workflow-linked Gmail reads, labels, replies, and unsent drafts. It is not
  a general inbox or autonomous messaging product.

Maintenance, resident intake, Vendor work, feedback, and staff work accountability are application
capabilities within those lanes, not separate Demo products.

## Standing authority

The owner has authorized the runner to:

- implement the full application to each real external seam;
- commit and push a green slice directly to `main`;
- deploy a zero-traffic Cloud Run candidate, smoke its exact commit/revision, promote the exact
  revision, and restore the captured predecessor when rollback proof is required;
- configure the application's GCP resources under a managed `pmikcmetro.com` or project service
  identity, including APIs, quotas, IAM required by the app, Pub/Sub, Scheduler, Cloud Run, Cloud
  Functions, budgets, alerts, authorized domains, and OAuth redirects;
- process live resident, owner, lease, and operational data in Production;
- apply a safe documented default and continue when a non-authority question is uncertain;
- authenticate as the designated automation and verification identities without asking, under the
  Authentication section below.

Every cloud mutation must be read back. Record verified non-secret outcomes in `docs/facts.md`.

### Owner-authorized thirteen-feature completion — 2026-09-29 UTC

The owner explicitly authorizes the necessary Cloud Build and Cloud Run release actions,
diagnosed and verified repairs, resumes and replacement cumulative candidates, promotion,
receipt-bound rollback when needed, and documentation closure until the entire thirteen-feature
batch is verified deployed. Do not ask again solely because another repaired attempt is required.
This supersedes the previous one-replacement limit and the count-only stop after two different
failures in one phase. S121 is excluded; authority ends at verified completion or an owner stop.

The runner may implement in-scope repairs, commit/push green slices, preserve and retire failed
attempts through the reviewed procedure, and resume or replace after diagnosis and verification.
Every candidate carries all thirteen features. Keep one watcher on the real release lock, one
application build per run, exact-main green CI, fresh prerequisites and locked preflight GO,
the reviewed Sheet switch value on candidate and promoted revisions (S159: true) with the recovery
target keeping the captured predecessor's actual value, guarded assurance, exact reconciliation,
receipt-bound promotion, the full 300,000 ms observation and independent final readbacks.
Keep the queue until verified delivery. Never alter an admitted checkout, reuse a consumed claim,
reassign an old receipt, guess a host binding, or relabel a failed outcome. Every failed run and its
raw evidence stay immutable outside Git. Preserve actual tag bindings independently of canonical
serving traffic when preparing each new run-bound recovery target and receipt.

Attempt counts alone require no new permission. Diagnose before retrying; unresolved cloud
operations/effects forbid blind redispatch. Continue agent-owned diagnosis and repair under these
boundaries. Ask only when actual owner action or a new authority/input is necessary, including an
authentication challenge, disabled billing, a protected-path/security decision or missing human
information that prevents safe continuation. Fresh GO and each phase's technical gates remain
mandatory; this authority does not make an unknown or failed check pass.

No billing, budget, guardrail, identity, claim, system/security setting, protected-path grant,
Action Registry key, client-send authority or provider-effect boundary changes. Live providers
remain read-only for this release apart from the separately approved notice-invalidation metadata.
Human verdicts, real inputs and provider activations retain their existing scoped holds; they do not
block deployment of the thirteen already-defined implementations or become verified by deployment.

### Feature-run authorization continuity — 2026-09-30 owner direction

An explicit owner instruction to execute a named feature or batch carries that same approved scope
through planning, implementation, verification and its authorized delivery. Do not ask for fresh
consent solely because that run advances a phase, moves between its named features, or reaches an
already authorized deployment. Resolve ordinary technical choices from current evidence; ask once
only when a consequential scope, effect, authority, or human input is genuinely unresolved. Keep the
answer in the current loop state and continue independent authorized work.

Markdown intake alone grants no execution authority. A completed, superseded, historical, or
specified suite cannot start from its registry row or old queue position. The owner explicitly
directed implementation and mainline merge of request 001, governance simplification and unattended
authentication renewal, as operational maintenance. That direction grants no new application
feature, customer/provider effect, target, identity, privilege, or unrelated feature execution.
Patched production dependencies required by the unchanged audit use the existing release gates.
Existing exact-key,
protected-path, release-lock, fresh-GO, receipt and rollback gates still apply when relevant. A
prepared release permit is a technical interlock, not a repeated consent form; an admitted permit
stays bound to the same run/SHA through credential renewal, while a consumed or failed permit never
authorizes new work.

## Authentication — approved local host contract (2026-09-08)

The owner explicitly authorized `josiah@pmikcmetro.com` for local unattended development and
release work on this WSL host. This supersedes the former automation-user/impersonation setup for
this host. Reuse its WSL credential store and ignored provider configuration. Do not create an
account, change IAM or claims, add federation, a private control repository, or a runner environment.
The owner applies an account-scoped Cloud session-policy exception and completes fresh enrollment;
the runner never changes that policy or enters a password, code, passkey, or CAPTCHA.

- `npm run auth:status` inspects without token refresh, repairs, or browser activity. Unprobed
  freshness is unverified, never READY.
- `npm run auth:ensure` verifies the exact local identity and store before ordinary token probes,
  refreshes through Google libraries, and reports one WSL recovery command when a person is needed.
  Run it at the beginning of authorized work and use the actual CLI/ADC refresh probes again before
  dependent release phases. Elapsed enrollment age alone is not a readiness gate or a universal
  credential lifetime. Permission denial and an unknown probe failure are not treated as reauth.
- `auth:session`, `auth:enroll`, and `auth:enroll:wsl` all enroll the WSL CLI and ADC. The PowerShell
  compatibility entry point delegates to WSL. Enrollment reads Google's identity once and binds
  the exact ADC file locally because gcloud leaves its account field empty.
- Personal accounts, unexpected managed accounts, impersonation, key files, and credential/store
  overrides cannot substitute for the approved account. Credentials and enrollment evidence stay
  outside Git and source uploads. Status contains no tokens or provider bodies.
- Existing dedicated verification accounts retain their displayed roles. The server must refuse business
  mutations before execution. Authentication, logout, and genuine reads remain available. No claim
  is granted or changed. Managed claim-less accounts remain Editor with all Spaces by owner decision.
- September 10 owner direction accepts the existing `josiah@pmikcmetro.com` Admin browser session
  for release assurance on both the exact candidate and canonical origins. An Editor browser
  session is not required. Versioned receipts record `owner-admin-2026-09-10` and Editor `not_run`;
  Admin access is not evidence of Editor restrictions. Preserve the complete backend Editor/role
  tests and existing claims. The assurance receipt, promotion, and 300,000 ms observation remain gates.
  The owner account retains ordinary Admin authority. Its assurance runs use the guarded read-only
  browser, including the existing state-changing GET refusals; they do not claim that the owner has
  the dedicated canary accounts' server-side mutation restriction.
- September 10 owner approval permits only the exact predecessor exception below.
  The owner approved only the exact blocked legacy My Work reconcile exception on captured
  predecessor d243911 / pmi-kc-app-rmtkmhj1z-8855e4c6dbfb at the canonical origin. Version 4 receipts
  retain Admin `failed_known_legacy_defect`, Editor `not_run`, and exact blocked-request evidence.
  The guard must successfully abort the single POST /api/work body {action:reconcile} before dispatch;
  all route landmarks, monitoring and other diagnostics must pass. The candidate and post-promotion
  checks still require zero mutation attempts. No business write is allowed by this exception.
- The local release watcher may deploy exact-main-SHA green CI from an isolated clean checkout,
  serialize and resume phases outside Git, and catch up after this host starts. Documentation-only
  commits do not deploy. Missing authentication pauses only the dependent phase; no repeated login
  loop or unverified promotion is allowed. A pre-dispatch authentication hold waits for a change in
  the approved local credential store, then rechecks the same identity and resumes that exact
  checkpoint if usable. An in-flight or ambiguous effect still requires exact reconciliation; store
  change never proves an effect failed or authorizes redispatch. If Google requires a person, the
  owner completes the challenge and independent work continues meanwhile.

Fresh-shell, reboot, and elapsed-session proofs are required to claim those separate behaviors;
they are not repeated release prerequisites without an exact current contract. A policy or
procedure alone does not establish authentication readiness. Independent implementation continues
when Google requires human enrollment. This request authorizes only the scoped local-auth changes;
it does not authorize a session-policy, IAM, claim, or credential-store substitution.

## Permanent safety boundaries

- No model-triggered, unapproved background, generic or bulk client-facing send.
- Under the owner's 2026-10-09 S183–S226 execution instruction, a staff member's explicit Send or
  Schedule authorizes the exact reviewed workflow-linked initial/follow-up content, verified
  recipients, managed sender and schedule. Durable approved occurrences may execute without a
  repeated prompt after the named operation's technical gates and reviewed exact-key activation.
  Changed content, sender, scope or material source facts require a new reviewed authorization.
  Existing unsent Gmail drafts remain available and never become authorization by migration.
- Ordinary supported staff edits use one visible Save/Apply as exact intent. Preserve server-side
  permissions, real target/version/conflict checks, durable one-attempt claims, receipts, readback
  and recovery. A chat-originated explicit supported action uses the same operation service;
  informational model output supplies no execution authority.
- Every live system-of-record write is human-initiated, exact-previewed, exact-confirmed,
  idempotent or at-most-once, receipted, read back, and reversible/correctable. The sole specified
  exception is S100's manual RentVine chat GET: the official provider marks retrieved manager
  messages read and documents no unread restoration. It therefore requires an explicit consequence
  warning and confirmation, one bounded page, honest ambiguous-state reporting, and no claim of
  rollback.
- No sample, synthetic, or test identity/data may become a live draft, send, provider write, or
  production record.
- Secrets, tokens, credentials, client exports, Gmail bodies, customer values, and raw evidence never
  enter Git.
- Staff, runner, Firebase, connector, Cloud Build, and runtime identities must be
  `pmikcmetro.com` or project service identities; local unattended runner work uses only the
  specifically approved account above. Canary identities only verify. Personal identities and
  service-account keys are forbidden.
- The runner never enters a password, one-time code, passkey, or CAPTCHA, and never copies a
  person's cookies or browser profile.
- Do not guess provider endpoints, record identifiers, mappings, recipient addresses, policy, or
  customer values.
- Destructive production data work requires backup, dry-run, exact target, and rollback.
- Every live effect must be bounded and reversible/correctable, except the explicitly warned and
  confirmed S100 manager-read marker described above.

## Action authority

### Owner-approved notice invalidation metadata — 2026-09-29 UTC

For the release-gap repairs, the owner explicitly permits authenticated source reads to update a
durable, lease-bound approval-invalidation marker containing only version/hash/time metadata. Bind
the marker to verified tenancy/cycle scope so a notice observed and later withdrawn cannot revive
an old draft approval, including after restart. This narrow app-owned metadata exception creates
no workflow milestone, provider write, customer draft or send. Other reads retain their existing
contracts. Source absence does not itself prove provider withdrawal; staff-reviewed
withdrawal and provider evidence remain distinct. This is not a new provider-action or role grant.

Production activation is per exact Action Registry key. Never infer a category grant.

Open keys as of 2026-09-02:

- `rentvine.work_order.create`
- `rentvine.work_order.read`
- `rentvine.work_order.update_status`
- `google_sheets.renewal_checklist.row_append`
- `google_sheets.renewal_checklist.field_update`
- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`
- `rentvine.lease.renewal_dates.update` (S97 proof-qualified activation, 2026-09-02)
- `rentvine.lease.recurring_charge.create` (includes only its receipt-bound reversal DELETE)
- `rentvine.lease.recurring_charge.update`
- `rentvine.work_order.chat.sync`

The other 32 keys are closed. In particular:

- `gmail.renewal_notice.send` and `gmail.maintenance_owner_notice.send` remain technically closed
  until the program's reviewed Send/Schedule, durable dispatch, observation and recovery gates
  pass and their exact activation is reviewed. The owner's S183 instruction supersedes D33's
  categorical draft-only restriction for those named workflow operations, not for generic sends;
- `gmail.message.send` remains closed; no arbitrary inbox/send capability is authorized;
- `gmail.maintenance_resident_reply.draft_create` remains closed pending its exact S100 live proof;
- the retired `rentvine.lease.renewal_writeback` compatibility identifier remains closed;
- `google_sheets.renewal_checklist.writeback` remains closed.

A runtime flag or open Registry key alone never outranks an operation-level refusal. The explicit
owner direction below changes the S98 normal-field requirement; it is not inferred from a flag.

### Owner-approved renewal consolidation — 2026-09-09

September 10 unblock amendment: restore/repair the existing RentCast component and its existing
operator-triggered comp/trend integration if hidden, disconnected or deleted. Incorporate the supplied
private email templates/formatting; automatically assemble deterministic, copyable drafts and repair
the existing governed Gmail draft transport. This is not background Gmail creation or send authority.
Scope RentVine effects through the explicit S113 F2.4 matrix. Prepare the S106/S34 document end state
and its deployment continuation when actual capabilities, forms, connection and exact activation gates
are satisfied; manual S113 work proceeds independently. A signature API or approved legal content
must not be invented. This amendment authorizes corresponding in-place handoff reconciliation.
The owner then deferred collection of missing tenant links and legal-form locations: implement
persistent labeled link-entry boxes now, with blank pending-team states. Verified values may be
supplied or hardcoded later when applicable. Missing values do not block S113 implementation/release;
only the exact resource-dependent output waits for real content and its existing execution contract.

S113 (`docs/feature-suites/renewal-workflow-consolidation.md`) is the completed product implementation:
F1 dashboard/facts, F2 corrections/source updates, F3 comps/messages, F4 manual progress, then F5
integrated verification. New automation and Dotloop/signature execution are outside this program;
their existing contracts remain separate. Authentication/release assurance continues independently.

- A full lease dashboard replaces the six-phase navigation barrier while preserving routes,
  source truth, historical process/evidence meaning, permissions and exact execution contracts.
- Audited staff-recorded activity advances the manual workflow through completion. Staff reports
  remain distinct from provider receipts and verified completion; owner approval of exact terms
  remains explicit. No manual marker grants provider execution or invents an effect receipt.
- Normal in-app existing-row Sheet field updates are required and pre-approved. The owner explicitly
  rejected a new provider safety-contract prerequisite. Replace the blanket normal-field refusal
  through existing narrow Sheets primitives, fresh server-resolved target/value checks, exact
  preview/confirmation, a durable one-attempt claim, receipt/readback and separately confirmed
  correction. Do not wait for a hypothetical provider-owned idempotency/tombstone seam or ask again
  for this feature authorization. Actual permissions, connection failures and observed conflicts
  still apply to the exact attempted write; app claims do not establish collaborator isolation.
- Preserve row append. Row deletion and historical proof reruns remain unavailable. A field
  correction is a new current-state preview/confirmation, not automatic historical restore.
- This owner direction authorizes corresponding present-truth/router/spec reconciliation, not new
  roles, identities, action keys, sends, budget changes, customer values or provider-proof targets.

### Owner-authorized activation program — current boundary

The owner directed on 2026-08-31 that the application graduate from categorical read-only posture
to exact human-confirmed source-of-truth updates. S97, S98, S99, and the S100 chat-sync action passed
their bounded per-key proof windows, mandatory close/readback, and separate final activations. An
open key is authority, not proof that the provider currently exposes every safety primitive.
Serving S113 supports normal field updates under the explicit owner-approved contract above.
The S128 batch paused operating-Sheet effects while preserving reads and app-owned saves. S159,
released on 2026-10-03 in run `47fabb7c` (the serving revision reads Sheet=true),
resumes the existing normal append and recognized-field updates through the narrow switch and the
two open exact keys: candidate and promoted revisions read the one reviewed value
(`lib/production-assurance/sheet-writeback-expectation.mjs`, true) and the recovery target keeps the
captured predecessor's actual value. Enablement executes no backlog. Row deletion and historical
restore remain unavailable, and completed receipts retain their original meaning.
No activation is a generic method/path/body, bulk,
autonomous, model-triggered, or send grant.

The sole remaining activation-program key is
`gmail.maintenance_resident_reply.draft_create`. It may receive one bounded proof window only after
the S100 contract resolves a synchronized resident message to a verified resident email, followed by
mandatory close/readback and a separate protected activation only after proof. Its absence blocks
S100 completion and therefore S36, not the already delivered S97-S99 or chat-sync actions.

The broad `rentvine.lease.renewal_writeback` and
`google_sheets.renewal_checklist.writeback` compatibility keys remain closed and are retired rather
than activated as product or proof actions. Completed proof windows used only the exact new key under
proof plus its suite's required runtime switch, and every executed window was closed and read back
before final activation. Receipt-bound reversal under a create/append key is allowed only when that
suite defines the exact inverse operation and the current provider seam can bind it safely; it is not
general delete authority. S98's active correction finds no such fixed-row Sheet seam and refuses it.
`rentvine.work_order.assign_vendor`, RentVine chat posting, attachment upload, direct Gmail sends, and
every unlisted provider key remain closed. S36 separately authorizes one temporary, bounded Space
provision/import/readback/retirement pilot under its exact lifecycle; it is not Action Registry
category authority.

## October operations program authority — 2026-10-09

The owner explicitly started `operations-communications-maintenance-2026-10`, S183–S226,
intake 055–098, including S183's necessary scoped protected governance edits and reviewed exact-key
activation for its specifically defined operations after technical gates. This carries through
implementation, verified repairs and existing delivery without phase-only consent. Authoring
READY is not implementation, activation or delivery. All five PENDING outcomes remain required;
complete accessible bounded investigations and surface genuinely missing material inputs once.
No unrelated key, identity, privilege, budget, destructive data or model-driven effect is granted.
Preserve S182 Dotloop API-origin exclusions; OAuth connection does not prove resource eligibility
or saved supported profile/template/status selection. Both Dotloop write keys remain closed.

## Protected paths

Prepare and surface, but do not push without explicit owner direction:

- `firestore.rules`
- `lib/integrations/action-gate.ts`
- `lib/auth/**`
- any `production_allowed` change in `lib/integrations/action-registry-seed.ts`
- `scripts/check-budget-guard.mjs`
- `infra/budget-guardrail/**`
- `scripts/auth/**`

The owner-directed 2026-08-31 documentation reconciliation authorizes present-truth edits to this
router and `docs/facts.md`. The activation program above is also explicit owner direction for its
remaining resident-draft proof-window and final-activation patches at the gates stated above. It does
not authorize a new identity, safety exception, cost change, premature key opening, or any effect
outside that exact suite contract.

## Cost and cloud controls

The old claim that Production has a $10 hard stop is retired. Current verified controls are the $25
alert, $100 project hard stop, $100 account backstop, and guardrail cap 100. A protected legacy local
planning guard still has a conservative $10 fallback; it is not live Cloud Billing truth. Raising
headroom must move the applicable budget and guardrail together and be read back. Lowering/removing a
safety control, alert, domain in use, or guardrail still requires owner direction.

Routine deployments use the existing production service and reviewed production environment.
Preserve the runtime service account, eleven-Space configuration, secret bindings, Production+Live
descriptor, and reviewed Sheet-write switch (true) unless the requested change explicitly targets one
of them.

## Live-write proof policy

- Production remains Live-only. Do not create a fake person, lease, work order, provider record, or
  customer value for a proof.
- S97's designated-lease proofs, S98's temporary-row append/update/delete proof, S99's work-order
  proofs, and S100's chat-sync proof are complete. Their receipts and final readbacks govern; do not
  rerun or substitute a new proof target.
- Normal S97 and S99 effects remain bounded by their activated exact-key contracts. S98/S113 serves server-derived append, normal Sheet field updates and fresh
  confirmed field corrections under the owner-approved contract above; row delete and historical
  proof mutations remain unavailable. No specification edit itself enables a provider effect.
  S100 synchronization remains manual and discloses that the official read marks manager messages
  read. Missing or ambiguous mappings fail only the exact action.
- The remaining S100 resident-draft proof may use only a synchronized message with an exact mapped
  resident and verified email, and may create only an unsent draft in the signed-in managed mailbox.
  Until that runtime input exists and the key passes proof and activation, it remains unavailable.
- S36 may copy one already-approved source object byte-for-byte into its isolated temporary prefix,
  provision/import/read back one temporary store, retire it, delete only that copied object, and
  prove the original eleven-store/config state restored.
- Every proof and normal write remains exact-previewed, exact-confirmed, at-most-once where the
  provider lacks idempotency, receipted, read back, reversible or separately correctable, and bounded
  by its exact key and suite. S100's disclosed manager-read marker is the one non-reversible stateful-
  read exception above. Until a suite's prerequisites pass, its effects remain unavailable.

## Documentation hygiene

Active documentation is intentionally small. `docs/README.md` is the index.

- Update current documents in place; do not append a second contradictory history.
- `docs/status.md` is a current snapshot, not a changelog.
- `docs/facts.md` contains only present facts, active decisions, and genuinely open questions.
- `docs/loop-state.md` stays under 140 lines and contains only the current resume state.
- Completed program prompts, old audits, Demo/V1 packets, and superseded specs belong in Git history,
  not the active tree.
- If a document becomes false, rewrite or delete it in the same slice. Do not preserve false active
  prose with a warning banner.
- Ignored `docs/temp/` material is local scratch and must never be treated as evidence or read by
  default.
- New specs go only in `docs/feature-suites/`, use the template, and must be registered in its
  README.

## Execution loop

1. Read this file, `docs/facts.md`, and `docs/loop-state.md`; run `npm run auth:ensure`
   (authentication is pre-approved and never a reason to wait).
2. Inspect committed code and live read-only state before accepting a stale claim.
3. Plan one bounded outcome and its falsification.
4. Implement with tests and preserve unrelated/user-owned changes.
5. Run focused adversarial tests, then `bash scripts/verify.sh` for a ship candidate.
6. Audit secrets, PII, gates, runtime config, and diff.
7. Commit/push only a green tree; deploy served runtime or asset changes through zero-traffic
   candidate smoke. Verify runner-local governance/auth/release-tooling changes with focused tests,
   full CI and host readback; they do not by themselves require a Cloud Run revision.
8. Update facts, status, plan, and loop state to the verified result.

No force-push, history rewrite, release tag, or branch deletion. Do not deploy documentation-only
changes unless they alter a served asset.

External and human holds live only in `docs/open-blockers.md`, the unblock packet. A hold blocks
only its named effect. Never stop, wait or ask about one unless the task exercises that effect or
the owner reports its step done; development, tests, merges and releases proceed independently.
When the owner reports a step, perform that row's follow-up and update the packet.

## Current routes

- Documentation index: `docs/README.md`
- Verified facts: `docs/facts.md`
- Current status: `docs/status.md`
- Resume point: `docs/loop-state.md`
- Current plan: `docs/plan.md`
- Product contract: `docs/spec.md`
- Active suites: `docs/feature-suites/README.md`
- Provider/action model: `docs/integration-architecture.md`
- Environment/release: `docs/environment-handoff.md`
- Security/engineering: `docs/engineering.md`
- Client/runtime inputs: `docs/client-checklist.md`

## Per-runner pointers

The repository is runner-neutral. Claude reads `CLAUDE.md`, which points here, and the tracked
`.claude/settings.json`, which only allow-lists the `scripts/auth` commands and runs `auth:ensure`
at session start. Codex uses this file directly and has no repo-tracked harness configuration; its
approval and sandbox settings live in the owner's `~/.codex/config.toml`. Runner-local settings
never widen repository authority.
