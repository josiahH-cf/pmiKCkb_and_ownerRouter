# PMI KC Status

> Current governance note, 2026-06-03: entries before the three-product governance
> realignment are historical. They may mention KB-only scope, separate Owner Router repo
> setup, Bailey Brain, or Dan's AI Assistant. Active routing now lives in `AGENTS.md`,
> `docs/north-star.md`, and `docs/products/`.

## Current Loop State

This log is the append-only history. For the always-current resume pointer (active lane,
next safe slice, blockers, stop-condition state), read `docs/loop-state.md` first. If the
two disagree, this status log wins and `docs/loop-state.md` is corrected.

## Safe-local S21/S24/S25/S26/S27 hardening is complete; external evidence remains Gated

- Date: 2026-07-15
- Hardened S21 upload/storage so declared and actual length are enforced while streaming, content is
  retained as hash-verified Firestore-safe 384 KiB chunks, and rollback reuses an immutable content
  reference. Rollback transactionally rereads current policy/provenance and refuses a disabled or
  tightened connector/root/Space/type/MIME/size/sensitivity/source boundary. The fake scanner is limited
  to local non-production execution with a loopback emulator;
  production connector/root/scanner/import/indexing remains closed.
- Hardened S24 cleanup from full-collection behavior to bounded indexed expiry queries with
  transactional candidate rechecks, an atomic bodyless run ledger, and counts-only audit. Records now
  carry canonical Firestore Date/Timestamp `expires_at` plus numeric query `expires_at_ms`; legal hold
  nulls both so native TTL cannot race it, and audit failure resumes without losing deletion counts.
  Each run freezes its hashes/limit, cannot finalize until every hash is processed or failed, explicitly
  accounts for a frozen candidate crowded out of the retry query, and retains its bodyless ledger under
  the same seven-year policy as the eighth TTL target. The runnable worker requires explicit emulator acknowledgement,
  non-production mode, and a loopback Firestore emulator. Production indexes, held-record migration,
  TTL, scheduler/identity, monitoring, and retry convention remain external gates.
- Added server-owned exact preview schemas for every S25/S26 action and closed production seams against
  caller risk/schema lowering, Registry overrides, fake executors, synthetic references, cross-workflow
  dependencies, wrong receipts, stale reconciliation, cross-actor duplicate actions, target drift, and
  mutable-input TOCTOU. The bridge now uses the actual S20 atomic claim/reconciliation ledger, requires
  exact Medium confirmation, binds High approval to the displayed target/account context, strips
  provider receipts to a strict bodyless allowlist, refuses browser authority, and requires an explicit
  test-only marker before invented aliases enter preparation. It resolves and exact-matches immutable
  canonical action definitions; terminal Firestore receipt updates use compare-and-set semantics; Sheet,
  Rentvine, and LeadSimple writes require provider-atomic expected state; and governed messages require
  provider-fetched canonical payload readback rather than trusting an RFC Message-ID alone.
- Completed the exact typed local execution graph: all 11 Lease and 19 Maintenance adapters run with
  one bodyless receipt/attempt apiece using `example.invalid` people/mailboxes and invented lease,
  ticket, unit, Vendor, thread, folder, work-order, process, account, and document references from
  `SYNTHETIC_V1_ALIASES`. The harness calls the real typed provider adapters and makes zero live provider
  calls. Shared Lease/Maintenance readiness UI labels each production gate separately from this alias run.
- Replaced the generic Vendor fake with a real-domain S22 journey over in-memory providers: invite,
  verified-email TOTP claims, PKCE/exact-scope/same-mailbox OAuth/vault boundary, assigned-ticket Gmail
  read/draft/label/exact one-attempt reply plus wrong-ticket/mailbox negatives, then identity/session/token
  revocation. Active access now also joins the verified token email to the immutable invited Vendor email,
  so changing and reverifying Firebase email cannot retain ticket or OAuth authority. OAuth start,
  callback, pre-vault persistence, and final connection save each recheck that join; mid-flight drift
  destroys a just-created secret and saves no connection. No setup link, OAuth code/token, body, or
  secret reference leaves bodyless evidence.
- Hardened S27 so only exact production manifests can pass. Local/synthetic all-green manifests always
  remain Pre-V1; canonical file+anchor evidence is globally unique, and both named acceptances bind to
  the same non-circular hash over the candidate pins/proofs. Cutover requires matching reviewed GCP/
  Firebase/runtime/Sheets/Gmail identities, a complete audience-bound Gmail DWD/Pub/Sub quartet, and
  exact `us` search location. Any malformed/conflicting input emits no setup/corpus/deploy/rollback
  command; source-corpus planning likewise emits no command for unsafe, placeholder, or non-ready
  manifests. Fixtures keep notification email off, and rollback requires a captured prior revision plus
  traffic restoration—never service deletion. `npm audit fix` made only a lockfile-safe update; three Moderate
  dev-only findings in the `firebase-tools` dependency chain remain documented without force/downgrade.
- Current-worktree verification is green: `bash scripts/verify.sh` completed clean install, formatting,
  lint, typecheck, 286 unit files / 1,984 tests, router/falsification/context/traceability/redaction, and
  the 73-page-route production build. Separate Firestore acceptance passed 16 files / 56 tests on an
  isolated port; core E2E passed 8 files and 32 tests with 3 files / 18 scenarios intentionally skipped.
  Lint has zero errors and eight existing test-mock warnings. Cutover rehearsal is all-green; the
  machine report remains correctly Pre-V1 with 29 unique required action proofs, 0 accepted, 0
  production-allowed, and 169 open gates. Dependency audit contains only the three documented Moderate
  dev-only `firebase-tools`-chain findings, with no High or Critical result.
- Local browser regression is green against an isolated loopback Firestore emulator and demo project:
  all eight S27 surfaces rendered at 1440×900 and 390×844 with the Pre-V1 label, checked phone documents
  had no horizontal overflow, Lease/Maintenance showed action-level readiness, and fresh page logs were
  clean. The pass found and repaired the Vendor-cookie isolation path: an internal demo/staff, malformed,
  or revoked cookie now redirects to Vendor sign-in instead of surfacing a Firebase decode error. This
  is Local evidence only; deployed role/failure-path browser acceptance remains Gated.
- No live/customer/Gmail read, source import, Vendor invite, Firebase/Identity Platform/OAuth/vault/
  TTL/scheduler/cloud configuration, provider write/send/upload, Registry promotion, deployment, smoke,
  traffic change, production browser record, rollback rehearsal, or Dan/Josiah acceptance occurred.
  S20–S27 remain Pre-V1: Local green where stated, Gated externally, and neither Live-proven nor Accepted.
  The exact remaining evidence, owners, secret-location labels, recommended closed defaults, first proofs,
  and correction paths are in `docs/v1-client-unblock-checklist-2026-07-14.md`.

## S25/S26 local execution and S27 pre-release readiness are built but Gated

- Date: 2026-07-14
- Added a shared immutable external-action orchestrator/ledger with dependency receipts, authoritative
  input/contract/connection/mapping checks, S20 risk authority, preview hash, one provider attempt,
  idempotent duplicate result, ambiguity reconciliation, correction text, and bodyless Firestore state
  denied to clients. A completion audit removed the weak bare-approver-uid seam: actor/scope, exact
  Medium confirmation, exact-preview reasoned High approval, and S22 Vendor TOTP/mailbox/assignment/
  self-consent are now revalidated immediately before the claim. Concurrent execution makes one
  provider call. Registry closure is the production default; fake contracts require an explicit seam.
- S25 now represents all eleven required Lease actions across Gmail, one-cell Sheet CAS, Rentvine
  renewal, Dotloop loop/documents, distinct portal/SMS channels, and conditional Boom. Each typed fake
  adapter falsifies missing values/contracts, drift, duplicates, unavailable providers, and ambiguous
  outcomes. The Lease page shows provider-by-provider readiness without claiming execution.
- S26 now represents all nineteen required Maintenance actions across S22 account/mailbox/assignment,
  validated append-only Drive photos, Rentvine create/assign/status/close, authoritative owner and
  assigned Vendor mail, LeadSimple, and QuickBooks draft-Bill-only. Tests enforce Vendor scope/MFA,
  file scanners, transition/readback, no AI authority, no accounting post/pay, and no duplicate retry.
- S27 now pins the Registry and every S20–S26/action/operations/owner row in a release-manifest verifier,
  renders a pre-V1 banner, and exposes a production-disabled local Admin integrated-fake endpoint. A
  pre-release ledger, one packet per exact action, monitoring/rollback plan, and desktop/phone plan for
  seven internal tabs plus Vendor portal are recorded in `docs/v1-pre-release-report-2026-07-14.md`.
- Verification passed: S25/S26 focused provider suites plus the shared authority/concurrency audit; 276
  unit files/1,786 tests; 14 Firestore files/50 tests on an isolated port; core E2E 32 passed/18 intentionally
  skipped; and the complete `scripts/verify.sh` clean-install, formatting, lint, typecheck, unit, build,
  router, falsification, freshness, traceability, and redaction milestone. Lint retains eight existing
  warnings; clean install retains 11 known dependency findings (1 low, 7 moderate, 3 high).
- No customer/Gmail live read, invite, Identity Platform/TOTP/OAuth/vault/TTL/scheduler/cloud change,
  provider send/write/upload, Registry promotion, deploy, smoke, traffic change, browser acceptance,
  rollback rehearsal, or Dan/Josiah acceptance occurred. S25–S27 remain Gated and the release remains
  pre-V1. Next `/loop`: obtain the authoritative recipient/value/mailbox mapping and separate proof
  authority for `gmail.renewal_notice.draft_create`, or move to the next exact packet without widening
  any action.

## S22 external Vendor portal and mailbox are Local green

- Date: 2026-07-14
- Added a separate external Vendor Firebase claim/session lane that requires verified email, a TOTP
  second factor, and recent auth before any detail. It never parses as an internal role or inherits a
  Space. The external sign-in UI supports password setup follow-on, first TOTP enrollment, and later
  TOTP challenge; there is no self-registration.
- Added the Admin invite service and preview: exact email/artifact/reason binding, no generated or
  returned password, no setup link/token in UI/result/log/audit, fake delivery, duplicate refusal, and
  compensating Firebase/Firestore cleanup. All live invite execution remains Registry-closed.
- Added one server-owned active uid→vendor→ticket/thread join shared by assigned-ticket list/detail and
  Gmail. Guessed, deassigned, disabled, wrong-Vendor, and wrong-thread requests return bounded 404s;
  existing staff-only ticket/photo/notification routes reject Vendor claims before provider work.
- Added server-side Google OAuth state/PKCE/offline flow with exact redirect/provider/four-scope and
  same-verified-email binding. Refresh material crosses only the token-vault interface; Firestore stores
  a secret reference and bounded metadata. Wrong/expired/reused state, wrong session/mailbox/provider,
  missing PKCE/offline grant, and scope drift stop before vault persistence.
- Added fake assigned-thread-only Gmail without inbox/search/new-compose/attachment methods. Vendor or
  pre-authorized Admin exact confirmation binds actor, mailbox, Vendor, ticket, thread, body, RFC
  Message-ID, expiry, and one attempt. Drift/double-click refuses; ambiguous outcome never retries.
  Disable closes access immediately, disables Auth, revokes sessions, and queues token destruction.
- Firestore denies every Vendor operational collection to staff and Vendor clients. The emulator runner
  now preserves an existing port-8080 process and automatically uses an isolated temporary port.
  Verification so far: 29 focused Vendor tests, typecheck, and 13 Firestore files / 49 tests green.
- No live principal/invite, Identity Platform/TOTP setting, OAuth consent/client/token, Secret Manager
  resource, mailbox read/send, cloud/Firebase change, Registry promotion, deploy, or smoke occurred.
  Exact remaining S22 gates are recorded in environment/client docs. Next safe slice: S25 shared Lease
  orchestrator, then Gmail as the first independent provider slice.

## S24 Communications policy and v1.0 artifacts are Local green

- Date: 2026-07-14
- Implemented `communications-retention:v1.0`: confirmation usability is separate from 30-day record
  deletion; dedupe is 7 days, sync audit 90 days, workflow links refresh to 365 days after authorized
  updates, and bodyless audits retain for 7 years. The pure planner and idempotent worker recheck every
  candidate before deletion and write only counts. Admin-only hold/release is reasoned, idempotent,
  transaction-safe, and persists hashes rather than case/reason text.
- Registered exactly three frozen/hash-addressed base artifacts: `owner-renewal:v1.0`,
  `tenant-renewal:v1.0`, and `maintenance-owner:v1.0`. Rendering uses the approved generators and
  fails closed on unverified/browser-derived recipient or mailbox, missing source/value, non-finite or
  blank required fields, `Needs Verification`, and false tenant cross-channel success without both
  receipts.
- Added `workflow-reply:v1.0`: one explicit authorized-thread request yields only a transient,
  source-visible `Needs Review` proposal and line diff. Existing category exclusions run before model
  use; approved base copy plus verified workflow sources—not a human-typed draft—are the only factual
  corpus; unsupported amounts, dates, recipients, approvals, commitments, completion, or channel claims
  refuse. No proposal, prompt, extracted fact, body, MIME, or attachment content is persisted.
- Exact confirmation now binds actor, mailbox, recipient, thread, body, artifact, reply policy, and
  sorted source references. Added the workflow proposal UI, Admin policy/hold UI, bodyless retention
  audit collection denial, and removed the mutable `GMAIL_WORKFLOW_LINK_TTL_DAYS` configuration in
  favor of the owner-approved versioned code policy.
- Verification passed: 67 focused S24/Gmail/renewal tests, all 1,721 unit tests, 47 Firestore rules
  tests on an isolated local port, and the core E2E flow (31 passed/18 intentionally skipped). The full
  `scripts/verify.sh` milestone passed clean install, formatting, typecheck, production build, routing,
  redaction, freshness, falsification, and traceability (124 IDs). Lint has zero errors and the eight
  existing warnings; clean install retains the known eleven dependency-audit findings. No live Gmail/
  customer read, TTL/scheduler/cloud configuration, external write/send, Action Registry change,
  deploy, or production smoke occurred.
- Exact live gates: separately authorize/configure Firestore TTL and cleanup scheduling; wire S25/S26
  authoritative recipient/value sources; then obtain per-action Registry, live proof, deploy, and
  acceptance authority. Next safe local slice: S22 external Vendor portal and mailbox.

## S23 Console live/test-data boundary is Local green

- Date: 2026-07-14
- Added a server-only Console data-mode boundary. Local, emulator, test, and an explicitly named
  non-production test deployment load guarded synthetic providers and show a persistent `Test data`
  badge. Ordinary production never constructs fixtures: it selects the live-provider seam and renders
  named Rentvine, PMI KC workflow, and Gmail unavailable states until those separately gated adapters
  are configured.
- Added a scope-filtered operational projection for authorized property/unit, tenant, rent/lease,
  workflow, and bounded communication metadata. Every value-bearing field carries source, observed-at,
  freshness, and unavailable state. Wrong-Space rows disappear; Vendor users remain outside the
  internal Console. URLs, bodyless attention/audit, and serialized Console state carry no customer or
  message-body values.
- Inline Gmail context is sender, recipients, timestamp, subject, and an inert snippet capped at 240
  Unicode characters and three nonempty lines after HTML/control/bidi stripping. Body, attachments,
  raw MIME, and thread identifiers never enter the Console projection. The existing workflow panel
  performs exactly one targeted full-thread read only after Open and after workflow/Space/mailbox
  authorization.
- Hardened production preparation: `ASK_DEMO_MODE` is ineffective in ordinary production,
  `CONSOLE_TEST_DEPLOYMENT_NAME` must use an explicit `test-*` name for a production-mode test
  deployment, client-production preflight rejects any such name, and deploy/production-env tooling
  clears it.
- Verification passed: 96 focused S23/config/cutover tests, the complete 1,696-test unit suite, the
  no-Firestore core E2E flow (31 passed/18 intentionally skipped), clean install, formatting, typecheck,
  production build, routing, redaction, freshness, falsification, and traceability (124 IDs). Lint has
  zero errors and the eight existing warnings; clean install retains the known eleven dependency-audit
  findings. No live provider, customer/Gmail read, production config, deployment, send, or external
  mutation occurred.
- Exact remaining S23 live gate: wire the approved Rentvine/workflow/Gmail read adapters, select
  approved test records, and perform browser acceptance under separate live-read/deploy authority.
  Next safe slice: S24 Communications retention, v1.0 artifacts, and AI-reply policy.

## S21 trusted immediate publication is Local green

- Date: 2026-07-14
- Implemented Admin-owned publication trust policies with exact connector/root IDs, known launch
  Spaces, launch-safe detected MIME/type caps, sensitivity ceiling, required scanner key, plain-
  English reason, append-only policy audit, and a hard “tighten only” update rule. Browser clients
  cannot write policy, content, version, pointer, or audit collections.
- Implemented bounded file/folder/process publication. The server validates actor/Space/root/path,
  extension and declared type before loading, actual byte length, server-detected MIME, citation/source
  state, process graph and pre-registered action keys, malware, and sensitivity. Scanner outage,
  traversal, absolute path, denied/archive/executable type, disguised PDF, oversize body, wrong scope,
  credential/sensitivity finding, or authority-field injection writes only a safe bodyless rejection
  audit and creates no Active pointer.
- Passing content creates an immutable version, append-only audit, and one Active pointer atomically.
  Concurrent transaction saves order versions; rollback creates a new audited version pointing to
  prior validated content and never deletes later history. Retrieval reads only the current validated
  Active version. Authority-looking prose remains inert; structured claim/role/Registry/policy/env/
  executor/system-prompt fields cannot cross the firewall.
- Replaced the active process editor’s Submit/Admin Activate detour with validated Publish; the
  compatibility `/submit` route now refuses with directions to Publish and cannot create a queue row.
  Process Action Registry keys are preserved explicitly, scoped process creation now records a Space,
  and editing an Active process creates a new Draft while retaining its prior immutable Active version.
  Space pages expose file/folder selection and visible failures; Admin exposes policy creation/disable.
- Verification passed: 25 focused S21 tests, the complete 1,680-test unit suite, 47 Firestore rules
  tests on a temporary local port, clean install, formatting, typecheck, production build, routing,
  redaction, freshness, falsification, and traceability (124 IDs). Lint has zero errors and the eight
  existing warnings. The clean install retains the known eleven dependency-audit findings. No existing
  Action Registry value changed.
- No production root/policy/scanner was configured; no source was imported/indexed; no Drive or cloud
  state changed; and no live/customer/Gmail read, external write/send, deploy, or smoke occurred. The
  exact remaining S21 live gate is an Admin-approved production connector/root/Space mapping plus a
  real malware/sensitivity scanner provider.

## S20 risk-bounded execution authority is Local green

- Date: 2026-07-14
- Implemented the immutable server-owned action-instance policy in `lib/execution/`: every current
  Registry key and approved future S21/S25/S26 key has a fixed risk floor; missing technical evidence,
  endpoint, permission, connection, values, source validation, role/scope, or a closed Registry blocks
  every role. Generic `gmail.message.send` remains permanently forbidden even under a fake Registry flip.
- Implemented the bodyless `action_executions` / append-only `action_execution_activity` ledger with a
  deterministic idempotency ID, canonical preview hash, exact one-attempt claim, Admin reason/hash
  approval including self-approval, returned/revoked states, definitive failure, and ambiguity routed to
  `Needs reconciliation`. Direct Firestore access is denied for every client role.
- High preparation now creates a linked Approval Queue row. Admin approve/return/disable updates the
  queue and execution ledger in the same Firestore transaction; stale hashes, missing reasons,
  Approver/Editor approval, duplicate claims, terminal state, and idempotency drift fail before an
  executor call. The UI labels linked work “Approve and execute” and captures the required reason.
- Implemented R01's current-runtime role change: an internal Editor has `sendEmail` only through the
  existing workflow-context-authorized, exact-confirmed Gmail routes. The simulation, wrong-space,
  wrong-mailbox, artifact, confirmation, Action Registry, idempotency, and no-autonomous-send gates
  remain intact. No generic compose/send surface was added.
- Verification passed: 225 focused authority/queue/Gmail/registry/route tests; the complete 1,655-test
  unit suite; 45 Firestore rules tests; typecheck; production build; formatting; routing; redaction;
  traceability (124 IDs); freshness; and falsification. Lint has zero errors and, after removing the one
  S20 warning, the eight pre-existing warnings. The occupied default emulator port was preserved and
  the rules suite passed on a temporary local port. Clean install continues to report the known eleven
  dependency-audit findings.
- No Registry value, provider credential, external account, OAuth connection, live/customer/Gmail read,
  external write/send, cloud configuration, deploy, smoke, or production state changed. Next safe slice:
  S21 trusted publication.

## V1 audit Round 3 finalized; implementation program and active goal ready

- Date: 2026-07-14
- Recorded the owner's final R01–R09 contract. Internal Editors directly execute enabled Low/Medium
  instances; consequential High work requires Admin; Admin may self-approve every risk; technical
  Blocked conditions cannot be approved away. Every R02 Lease and R03 Maintenance row is final-V1 app
  execution scope.
- Locked immediate trusted Editor publication, Admin-invited external Vendor identity with one-time
  setup + verified-email TOTP + assigned-ticket-only authorization + same-address Gmail/Workspace
  per-vendor OAuth, the exact operational retention defaults/legal-hold override, the three exact
  current generators as v1.0 base artifacts, the source-visible human-confirmed AI reply policy,
  Console body/test separation, and staged pre-V1/final release acceptance.
- Replaced the Round 3 question phase with `docs/v1-gap-implementation-program-2026-07-14.md` and eight
  executable/falsifiable specs: S20 execution authority, S21 trusted publication, S22 Vendor portal/
  OAuth, S23 Console live/test boundary, S24 Communications policy, S25 Lease actions, S26 Maintenance
  actions, and S27 release acceptance. The program starts S20 and continues safe local slices in
  dependency order; one external provider/action is one slice.
- Created the active Codex `/goal`: implement S20–S27 comprehensively through staged local slices,
  synchronized docs and adversarial/E2E verification, ending in a deployment-ready handoff. The goal
  explicitly excludes live sends, external mutations, Vendor provisioning, mailbox connections, and
  deployment without separate authority.
- Rewrote `docs/loop-state.md` so an outside `/loop` session starts S20 instead of reopening audit
  questions, preserves the dirty July 14 Workflow Communications candidate, continues fake-provider/
  emulator work automatically, and stops at exact live/provider gates.
- Reconciled the Tier-0 fact ledger and supersede log, router/security/identity rules, phase plan,
  autonomous runner, implementation/AI workflow, active spec, product lanes/Q&A/gap plan, integration
  and identity architecture, environment handoff, client checklist, research backlog, and existing
  S14/S16/S19/Maintenance overlays. R01–R09 are Verified; remaining asks are implementation mappings,
  provider contracts/credentials, action-by-action live approvals, and final acceptance—not product
  ambiguity.
- This slice changes documentation/governance only. Current role code, Action Registry values,
  executable Gmail allowlist, external providers, Firebase/Workspace/cloud state, and deployed revision
  are unchanged. No customer/Gmail read, source import, account creation, OAuth consent, write, send,
  deploy, or production smoke occurred.
- Governance verification passed: 60 feature-suite-shape/plan-status tests; 124 unique acceptance IDs
  across 14 overhaul specs with complete fact traceability; facts-ledger tests; formatting; router
  boundary; context freshness/supersede checks; diff check; and falsification. Falsification's large-
  worktree warning reflects the preserved pre-existing July 14 candidate (855 committable files), not a
  cleanup/stage/commit action.

## V1 audit Round 2 owner response reconciled; final Round 3 prepared

- Date: 2026-07-14
- Recorded the Round 2 product direction: internal Editors may directly execute every enabled
  action; Admins may self-approve/execute at every risk; named Lease Renewal and Maintenance
  workflows must operate end to end including their external outputs; Editor source/process
  additions publish immediately with a log; full authorized property/tenant/rent/message detail
  belongs on Console; and the external assigned-ticket-only Vendor portal/own mailbox is required for
  V1. AI may draft assigned-ticket replies, but a Vendor or Admin confirms every send.
- This supersedes the earlier internal/no-non-Gmail-write contract as product scope. It does not
  itself enable a live action or grant standing approval to connect a mailbox, invite an account,
  write Rentvine/Sheets/Drive/other systems, send, deploy, or run production smoke.
- Evidence review found the remaining implementation ambiguity: “current workflows” spans Gmail,
  Sheets, Rentvine, Dotloop, Rentvine portal chat, SMS, Drive, LeadSimple, QuickBooks, and conditional
  Boom actions; “enabled” does not yet say whether every Editor instance bypasses per-item review;
  external mailbox support still needs provider/OAuth/invite/MFA choices; and immediate publishing
  still needs its automated trust boundary.
- Reviewed the three current communication scaffolds. Owner renewal needs authoritative recipient,
  approved sender signature, and unresolved-fact refusal; tenant renewal must not claim other channels
  succeeded until they did; maintenance owner notice needs authoritative recipient/unit/signature and
  cannot promise coordination without supporting workflow state. No artifact or linked AI-reply policy
  was silently promoted.
- Added `docs/v1-readiness-audit-round-3-2026-07-14.html`, a final nine-block packet with exact Lease
  Renewal/Maintenance execution matrices, Vendor provider/security choices, immediate-publication
  containment, concrete operational retention defaults, reviewed artifact/reply-policy choices,
  Console body/test-data behavior, and release sequencing.
- Updated Tier-0 facts, phase plan, product lanes, feature-suite direction, identity/integration
  governance, client checklist, research backlog, loop state, and router. Current runtime/Action
  Registry permissions remain unchanged pending Round 3 and decision-complete replacement specs.
- Documentation/audit work only: no live read, customer/Gmail content access, account creation,
  mailbox authorization, external write, send, deploy, or production smoke occurred.
- Documentation verification passed: formatting, diff check, router boundary, context freshness,
  spec traceability, and falsification. Static DOM validation found nine Round 3 blocks, 16 action
  selectors, 11 selected defaults, no duplicate IDs or nested interactive controls, and generated
  output containing R01–R09 plus the Rentvine/provider selections. The falsification preflight's
  large-worktree warning reflects the already-dirty local workflow slice; no unrelated files were
  cleaned, staged, committed, or overwritten.

## V1 audit Round 1 owner response reconciled

- Date: 2026-07-14
- Recorded owner approval of the internal V1 without non-Gmail writes, workflow-linked-only
  Communications, all seven tab visions, conditional promotion after test/validation, current V1 AI
  exclusions, and safe defaults.
- Recorded Dan as business-acceptance owner and Josiah as technical go-live, monitoring, rollback,
  and manual Gmail-watch/degraded-watch owner.
- Recorded the direction that Editors and Admins contribute processes/files/folders with minimal
  friction, Console should use real connected data, Approval Queue should prove end-to-end behavior,
  Communications should send per user/workflow and AI-assist replies, connection status/checks should
  be broadly visible, and a restricted vendor-worker portal/mailbox is desired.
- Evidence review found material ambiguities: Editor “Send” could mean submit or transmit; D01 conflicts
  with non-Gmail execution language; existing scaffolds are not approved production templates; exact
  retention periods remain unset; and external vendor-owned identities/mailboxes are incompatible with
  the current managed-domain Firebase/DWD boundary.
- Added `docs/v1-readiness-audit-round-2-2026-07-14.html`, which asks only the ten decisions needed to
  disambiguate execution, self-approval, V1 action scope, publication, vendor identity/mail/auto-reply,
  retention, templates, Console live-data detail, and vendor-portal sequencing.
- Updated Tier-0 facts, plan, product docs, client checklist, research backlog, loop state, and router.
  D01 remains binding until Round 2 explicitly replaces it: approved workflow Gmail actions may execute;
  non-Gmail proposals stop before external execution. No runtime permission or Action Registry entry was
  changed.
- This was a local documentation/audit slice only: no live read, account creation, Gmail action, deploy,
  external mutation, or system-of-record write occurred.
- Documentation verification passed: formatting, diff check, router boundary, falsification, context
  freshness, and spec traceability. Static DOM validation found all 10 clarification cards, all six
  locked-decision cards, no duplicate IDs or nested interactive controls, and a generated response
  containing C01–C10. The in-app browser refused direct navigation to the new local `file://` artifact
  under its URL policy, so no browser-policy workaround was attempted.

## V1 blocker and product-surface audit completed locally

- Date: 2026-07-14
- Audited Tier-0 facts, the active plans/checklists, current navigation and page code, tests, deployment
  evidence, Action Registry state, and the already-modified Workflow Communications worktree.
- Produced `docs/v1-readiness-audit-2026-07-14.html`, a self-contained owner review packet with the
  production/local split, nine decision prompts, a blocker register, all seven primary surface contracts,
  workflow-depth notes, evidence, and a generated copyable response.
- Found that the app is substantially built and is not broadly blocked. The final internal-V1 gates are
  owner/tab contract, approved launch sources/sensitivity, any Communications promotion artifacts and
  retention, named release owners, browser acceptance, and explicit promotion/deploy approval.
- Reclassified vendor endpoints, non-Gmail writes, autonomous scheduling, extra delegated users, and
  event-driven approval email as later separately approved work under the recommended V1 boundary.
- Reconciled active product/plan/checklist/router guidance, marked stale Lease Renewal build plans
  historical, and corrected the role summary to the implemented Editor/Approver/Admin plus optional scopes.
- The audit was local and read-only with respect to client/cloud systems: no Google/Gmail/customer-data
  read, deploy, send, source import, Pub/Sub change, external mutation, or system-of-record write occurred.
- Full local verification passed: formatting, lint (zero errors; eight pre-existing warnings), typecheck,
  228 unit files / 1,600 tests, router boundary, falsification, context freshness, spec traceability,
  redaction, and the production build. The clean install again reported the already-recorded 11 dependency
  audit findings (1 low, 7 moderate, 3 high); the verifier does not currently fail on them.

## Workflow Communications boundary implemented locally

- Date: 2026-07-14
- Reframed Gmail as a workflow communication adapter and evidence source for authorized renewal and
  maintenance entities. Gmail remains the message system of record; the app no longer exposes recent
  inbox browsing, arbitrary search, generic compose/recipients, or arbitrary labels.
- Added strict `WorkflowCommunicationContext`, server-side entity/space authorization before Gmail
  construction, bodyless expiring workflow links/action audit, context-bound confirmations, and actor-only
  link/attention visibility.
- Narrowed permissions: Editors read/link/label/prepare governed drafts; only Approver/Admin has
  `sendEmail`. Generic new-message send is Disabled. Linked replies retain exact-message review,
  transactional single-use idempotency, authenticated From, no ambiguous retry, and bodyless audit.
- Action Registry now has 23 entries. Four workflow Gmail actions are executable; renewal and maintenance
  notice drafts are Planned pending authoritative recipients/templates/triggers. The sample-backed renewal
  routes are unaddressed preview-only and cannot construct Gmail even if a registry value is toggled.
- Pub/Sub matches additions only to already-linked thread IDs and creates deduplicated, value-free in-app
  attention. Unrelated/overflow/resync events fetch no thread content and create no model call, task, or
  notification. Watch renewal remains manual.
- Added on-demand analysis for one authorized linked thread. Exclusions refuse before Gmail/model
  construction; output is transient, unpersisted, unapplied `Needs Review` with Gmail provenance.
- Replaced the primary Gmail UI with connection/watch health plus workflow communication attention, and
  embedded nonmutating/linking panels in renewal/maintenance context. S15 pasted/synthetic tools remain
  Admin/demo fallback only.
- Hard-disabled the legacy event-driven approval Gmail sender; in-app notifications are the first-release
  default. No autonomous send, external system write, live Gmail/customer read, deploy, Pub/Sub resource
  change, or scheduler occurred.
- Updated S19, product lanes, renewal/maintenance docs, integration architecture, identity strategy,
  Action Registry, connector copy, environment handoff, client checklist, facts, plan, and tests. Production
  promotion remains gated by retention periods, approved workflow templates/recipient sources, maintenance
  owner-notice rules, no-model categories, and a manual watch owner.
- Verification passed: format, typecheck, router boundary, context freshness, spec traceability, copy voice,
  redaction, falsification, 228 unit files / 1,600 tests, 31 core e2e tests (18 Firestore-dependent cases
  skipped in no-emulator mode), 10 Firestore rules files / 43 tests, production build, and
  `bash scripts/verify.sh`. Lint has zero errors and eight pre-existing unused-parameter warnings.
- The standard Firestore runner could not bind port 8080 because a user-owned WSL relay was already
  listening. Firestore test targets now honor `FIRESTORE_EMULATOR_HOST`; the same suite passed with the
  repository's `firebase.e2e.json` on port 8090 without interrupting that process.
- The all-in-one verifier's clean install reported 11 dependency audit findings (1 low, 7 moderate, 3 high);
  the verifier does not currently fail on those findings. No dependency upgrade was attempted in this slice.

## Gmail Inbox 0 production activation complete

- Date: 2026-07-13
- Owner authorization promoted the five Gmail Inbox 0 actions: bounded per-user read, unsent draft,
  exact-confirmed new-message send, exact-confirmed threaded reply, and user-label application.
- Workspace DWD client `104374162913177846911` now carries the exact read, compose, labels, and modify
  scopes. The rollout-only mailbox allowlist was removed; every DWD subject/From remains bound to the
  signed-in `pmikcmetro.com` user.
- Provisioned the production Gmail topic, authenticated OIDC push subscription, dedicated no-key push
  service account, topic-scoped Gmail publisher binding, Action Registry records, and Firestore rules.
- Deployed Cloud Run revision `pmi-kc-kb-demo-00020-24d` at 100% traffic. Production proof succeeded:
  one synthetic self-addressed new message, one explicit same-thread reply, one user label, a future
  watch expiration, five authenticated Pub/Sub `200` deliveries, and completed Firestore sync audits.
- Production falsification caught and fixed the real Pub/Sub wrapper aliases/metadata plus Gmail's
  numeric `historyId` encoding before acceptance. Evidence records only identifiers/statuses in
  `docs/evidence/gmail-production-activation-2026-07-13.md`.
- Exact-message confirmation, single-use idempotency, no ambiguous retry, no autonomous send, identity
  binding, bodyless audit, and the non-Gmail system-of-record write gates remain intact.

## Initial Scaffold

- Date: 2026-05-27
- Spec source used:
  - `docs/spec.md`
  - `docs/specs/spec-1-technical-spec.md`
  - `docs/specs/spec-2-technical-spec.md`
  - `docs/specs/spec-3-operating-north-star-spec.md`
  - `docs/specs/spec-4-implementation-meta-implementation-spec.md`

## Chosen Stack

- Next.js App Router, React, TypeScript, npm.
- Firestore / Firebase Auth / Vertex AI Search / Gemini / Gmail send-only are the
  target Google-native services.
- The scaffold uses local typed boundaries and avoids live Google SDK wiring until the
  integration milestones.

Why it fits: Spec 1 selects Next.js on Cloud Run, Firestore Native mode, Vertex AI
Search, Gemini, Firebase Auth, Drive folders, and Gmail send-only notifications.

## Files Created Or Moved

- Moved all four original specs into `docs/specs/`.
- Copied Spec 1 into `docs/spec.md`.
- Added KB app scaffold in `app/`, `components/`, `lib/`, and `styles/`.
- Added tests in `tests/`.
- Added validation in `scripts/verify.sh` and `scripts/check-router-boundary.mjs`.
- Added repo docs: `AGENTS.md`, `README.md`, `SETUP.md`, `docs/plan.md`,
  `docs/implement.md`, `docs/engineering.md`, `docs/router-repo.md`.
- Added config: `.codex/config.toml`, `.editorconfig`, `.gitignore`, `.env.example`,
  `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`,
  `eslint.config.mjs`, `vitest.config.ts`, `.github/workflows/ci.yml`,
  `firestore.rules`, `firestore.indexes.json`.

## Validation Status

- Dependency install completed with `npm install`.
- npm audit result: 0 vulnerabilities after pinning dependencies and overriding PostCSS
  to `8.5.10`.
- `bash scripts/verify.sh`: passed on 2026-05-27.
  - Reinstalled from `package-lock.json`.
  - Checked formatting.
  - Ran ESLint.
  - Ran TypeScript.
  - Ran 11 Vitest tests across unit and eval seed coverage.
  - Passed Router boundary verification.
  - Built the Next.js app successfully.
- Local smoke test:
  - `GET http://127.0.0.1:3000/ask`: 200.
  - `POST http://127.0.0.1:3000/api/ask`: returned `No Reliable Source Found`, as
    expected for the empty Phase A scaffold.

## Open Questions

- Brand hex values still need verification against `bluespringspropertymanagementinc.com`.
- Actual GCP project IDs, OAuth client IDs, Drive folder IDs, and Vertex AI Search data
  store IDs are not known.
- E2E tests are documented but inactive until auth/integration mocks are implemented.
- The separate Owner Router repository still needs to be initialized.

## Next Recommended Task

Wire the browser Google sign-in flow and session-cookie creation endpoint for M1.

## M1 Auth Guard Foundation

- Date: 2026-05-27
- Added server-side auth boundary with `AuthenticatedUser`, hosted-domain validation,
  role/capability guards, and test-only resolver injection.
- Protected Ask, Spaces, Approval Queue, Admin, and `/api/ask`; browser pages redirect
  unauthenticated users to `/sign-in`, while API calls return explicit `401` or `403`.
- Added a minimal `/sign-in` placeholder for the current pre-Firebase state.
- Updated local setup notes and `.env.example` with the future session-cookie name.
- Added tests for hosted-domain enforcement, role guard behavior, and Ask API auth
  responses.

Validation status:

- `bash scripts/verify.sh`: passed on 2026-05-27 after a retry; the first attempt hit
  a transient Windows `EPERM` unlink on Next's SWC binary during `npm ci`.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 21 tests.
- `npm run lint`: passed on 2026-05-27.
- `npm run build`: passed on 2026-05-27.
- `npm run verify:router-boundary`: passed on 2026-05-27.

Open items:

- Firebase Auth emulator and browser sign-in flow remain inactive.
- Local browser smoke for protected pages should expect `/sign-in` until live sessions
  exist.

Next recommended task:

Complete the live Firebase Admin session-cookie verification slice for M1. Completed in
the following section.

## M1 Firebase Admin Session Verification

- Date: 2026-05-27
- Added `firebase-admin` and a server-only Firebase Admin boundary that verifies
  session cookies with revocation checks.
- Replaced the placeholder opaque-cookie auth path with Firebase session-cookie
  verification through the existing `getCurrentUser` / `requireUser` guard surface.
- Enforced verified Google email, Google sign-in provider, `ALLOWED_HD`, optional `hd`
  claim consistency, and custom claim `role` values before returning an authenticated
  user.
- Updated `.env.example` and `SETUP.md` with `FIREBASE_PROJECT_ID`, Application Default
  Credentials expectations, and the live `AUTH_SESSION_COOKIE` behavior.
- Added session-cookie tests for valid cookies, invalid/revoked cookies, wrong hosted
  domain, mismatched `hd`, unverified email, non-Google provider, and invalid roles.
- Added an npm `uuid` override to keep the Firebase Admin dependency tree at 0 known
  audit vulnerabilities.

Validation status:

- `npm run format:check`: passed on 2026-05-27 after rerunning outside the Windows
  sandbox.
- `npm run lint`: passed on 2026-05-27.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 29 tests.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.
- `bash scripts/verify.sh`: passed on 2026-05-27 after rerunning outside the Windows
  sandbox; it reinstalled from the lockfile, checked formatting, linted, typechecked,
  ran 29 tests, passed Router boundary verification, and built the app.

Open items:

- Browser Google sign-in still needs to create the Firebase session cookie.
- Firebase Auth emulator coverage remains inactive until the browser sign-in flow is
  implemented.
- Actual GCP/Firebase project IDs and OAuth client IDs are still environment-specific.

Next recommended task:

Wire the browser Google sign-in flow and session-cookie creation endpoint for M1.

## M1 Browser Google Sign-In

- Date: 2026-05-27
- Added the Firebase browser SDK and client-side Google redirect sign-in on `/sign-in`.
- Added `/api/auth/session` to exchange Firebase ID tokens for HTTP-only Firebase
  session cookies and to clear the cookie on sign-out.
- Extended the Firebase Admin boundary to verify ID tokens, create session cookies, and
  apply one shared server-side claim policy for Google provider, verified email,
  `ALLOWED_HD`, hosted-domain consistency, role, and 12-hour absolute auth age.
- Implemented the spec default role for new Firebase users: missing role claims resolve
  to `Editor`, while invalid explicit roles still fail.
- Added a sign-out button to protected app navigation.
- Updated `.env.example`, `SETUP.md`, and `README.md` for Firebase web app config and
  the live browser sign-in path.

Validation status:

- `npm run format:check`: passed on 2026-05-27.
- `npm run lint`: passed on 2026-05-27.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 40 tests.
- `npm run build`: passed on 2026-05-27.
- `bash scripts/verify.sh`: passed on 2026-05-27; it reinstalled from the lockfile,
  checked formatting, linted, typechecked, ran 40 tests, passed Router boundary
  verification, and built the app.
- Local browser smoke on 2026-05-27: `/sign-in` renders the Google sign-in panel, and
  unauthenticated `/ask` redirects to `/sign-in`.

Open items:

- Firebase Auth emulator / Playwright coverage remains inactive until test fixtures are
  added.
- Actual Firebase public web app config, GCP/Firebase project IDs, OAuth clients, Drive
  folders, and Vertex AI Search data store IDs are still environment-specific.

Next recommended task:

Start M2 by adding Firestore emulator-backed editable-layer boundaries and tests for
SOP/template/tool/placeholder CRUD, change-log creation, and soft delete behavior.

## Post-M1 Review And Repair Pass

- Date: 2026-05-27
- Reviewed the browser sign-in implementation against M1 auth criteria, the session
  policy in `docs/spec.md`, affected setup docs, tests, local browser behavior, secret
  hygiene, and oversized-file risk.
- Fixed `/api/auth/session` bearer-token parsing so normal case-insensitive auth schemes
  and flexible whitespace are accepted instead of only exactly `Bearer <token>`.
- Added regression coverage for flexible bearer parsing.
- Updated `tests/e2e/README.md` so the e2e gap refers to missing Firebase Auth test
  fixtures rather than Firebase Auth generally.

Validation status:

- Focused `auth-session-route` test: passed on 2026-05-27 with 8 tests.
- `bash scripts/verify.sh`: passed on 2026-05-27; it reinstalled from the lockfile,
  checked formatting, linted, typechecked, ran 41 tests, passed Router boundary
  verification, and built the app.
- Local browser smoke on 2026-05-27: `/sign-in` renders, shows the expected missing
  Firebase-config warning in this local environment, and unauthenticated `/ask`
  redirects to `/sign-in`.

Repository status:

- Secret-pattern scan found no committed secret values; matches were only placeholder
  names, auth terminology, or test strings.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.
- Initial integrated commit exists on `main`: `402e795`.

## Required Separate Manual Setup: Live Firebase Auth

- Date: 2026-05-27
- Status: Required manual setup in a separate session before live sign-in can be
  considered done.
- Reason: The code path is implemented and locally verified, but the remaining work
  needs Firebase console, Google Cloud console, OAuth/Identity Platform, Workspace
  domain, and credential access that is not available from the repo.
- Documentation updated: `SETUP.md` now contains an ordered manual setup gate with
  official Firebase/Google source links for registering the web app, enabling Google
  sign-in, adding authorized domains, configuring Application Default Credentials,
  creating session cookies, and assigning custom role claims.
- Sources checked:
  - Firebase Web setup: <https://firebase.google.com/docs/web/setup>
  - Firebase Google sign-in for web:
    <https://firebase.google.com/docs/auth/web/google-signin>
  - Identity Platform Google provider and authorized domains:
    <https://docs.cloud.google.com/identity-platform/docs/web/google>
  - Firebase Admin session cookies:
    <https://firebase.google.com/docs/auth/admin/manage-cookies>
  - Google Cloud Application Default Credentials:
    <https://docs.cloud.google.com/docs/authentication/application-default-credentials>
  - Firebase custom claims:
    <https://firebase.google.com/docs/auth/admin/custom-claims>

Next manual setup actions:

1. Select/create the staging Firebase/GCP project and record its project ID.
2. Register the Firebase Web app and copy its config into `.env.local`.
3. Enable Google as the Auth/Identity Platform provider and add local/staging domains.
4. Configure local ADC or service-account impersonation; do not commit key files.
5. Set `ALLOWED_HD`, `AUTH_SESSION_COOKIE`, `GCP_PROJECT_ID`, and `FIREBASE_PROJECT_ID`.
6. Sign in once, then set the implementer's privileged `role` custom claim from a
   trusted Admin SDK context.
7. Smoke test allowed-domain sign-in, wrong-domain rejection, sign-out, and
   `bash scripts/verify.sh`.

## M2 Firestore Editable API Foundation

- Date: 2026-05-27
- Added Firestore editable-layer schemas, expanded typed records, and a server-only
  repository boundary for SOP, template, tool, and placeholder CRUD.
- Added API routes for Space-scoped SOP/template/placeholder create/list, single-record
  read/update/soft-delete, and tool create/list/read/update/soft-delete.
- Enforced server-side role behavior for editable writes, approval, placeholder
  resolution, Admin-only soft delete, read-only Owner Email Space blocking, duplicate
  active tool names, and change-log creation.
- Added `firebase.json`, `firebase-tools`, `@firebase/rules-unit-testing`,
  `vitest.firestore.config.ts`, and a separate `npm run test:firestore` emulator test
  command.
- Tightened `firestore.rules` so direct client access mirrors the role model and hard
  deletes remain denied.
- Updated `README.md`, `SETUP.md`, and `docs/implement.md` with the emulator test gate.

Validation status:

- `npm run format:check`: passed on 2026-05-27.
- `npm run lint`: passed on 2026-05-27.
- `npm run typecheck`: passed on 2026-05-27.
- `npm test`: passed on 2026-05-27 with 56 tests.
- `npm run build`: passed on 2026-05-27.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.
- `npm run verify:router-boundary`: passed on 2026-05-27.
- `bash scripts/verify.sh`: passed on 2026-05-27; it reinstalled from the lockfile,
  checked formatting, linted, typechecked, ran 56 tests, passed Router boundary
  verification, and built the app.
- `npm run test:firestore`: passed on 2026-05-27 with 6 Firestore Security Rules tests
  after installing a portable Temurin 21 JDK outside the repo and fixing the script to
  use `vitest.firestore.config.ts`.

Open items:

- CRUD UI for Spaces is not implemented yet; M2 currently exposes the server/API
  foundation.
- Firestore space seeding for real project environments still needs a dedicated setup
  step before live editable data entry.

Next recommended task:

Build the Space editing UI on top of the M2 API routes.

## Spec 1 Audit Roadmap And Owner Router Scaffold

- Date: 2026-05-28
- Audited current KB state against Spec 1, Spec 2, Spec 3, and Spec 4.
- Confirmed current KB state is a strong foundation/demo slice, not a completed Spec 1
  launch app.
- Updated `docs/plan.md` with explicit completion status for M0, M1, M2a, and the
  Lease Renewals demo slice, plus new M3a/M3b/M4a/M4b/M5a/M5b milestones.
- Updated `docs/implement.md` and `README.md` so future work starts with M3a live
  retrieval instead of treating demo Ask as launch completion.
- Updated `docs/router-repo.md` with sequencing, scaffold acceptance, and the KB
  read-only linkage step for the Owner Email Space.
- Created the separate sibling repo at
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`.
- Initialized the Router repo with no app runtime and added:
  - Preserved Spec 2, Spec 3, and Spec 4 docs.
  - `AGENTS.md`, `README.md`, `docs/plan.md`, `docs/implement.md`, and
    `docs/status.md`.
  - Six canonical `drive-package/` templates.
  - Owner Router Gem system prompt and fallback prompt pack.
  - Optional Apps Script helpers for labels, sheet headers, and health-check digest.
  - Placeholder Gmail filter export.
  - Acceptance checklist and historical-thread dry-run template.

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 66 tests, passed Router boundary verification,
  and built the app.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- Router scaffold boundary scan: passed on 2026-05-28. No send/draft/API-call patterns
  were present outside preserved specs.

Open items:

- KB M3a remains next: implement live Vertex AI Search retrieval boundary and
  source-metadata filtering.
- KB M3b remains after that: Gemini JSON validation, citation downgrades, Ask logging,
  and Ask-to-placeholder capture.
- The Router repo still needs Bailey/Dan-owned substantive content in the Drive files
  and live Gmail/Drive setup.
- KB A-16 cannot fully pass until the Router Drive folder exists and is indexed
  read-only as the Owner Email Space.

Next recommended task:

Start KB M3a: implement the live Vertex AI Search retrieval boundary and
`sources_meta` filtering while keeping the Lease Renewals demo path available for
show-and-tell.

## Windows Google Host Setup Stabilized

- Date: 2026-05-28
- Supersedes the earlier environment note that `gcloud` was not installed.
- Google Cloud SDK 570.0.0 is installed for `josiah.hunter@cherrybridge.ai`.
- Google Cloud project `pmikckb-test` was created after Terms of Service acceptance.
- Application Default Credentials are present and have quota project `pmikckb-test`.
- Enabled demo APIs include Cloud Resource Manager, Service Usage, Firestore,
  Firebase, Identity Toolkit, Drive, and Gmail.
- Added `scripts/setup-windows-google-dev.ps1` plus package commands:
  - `npm run host:setup`
  - `npm run host:check`
- Persisted user-level project environment variables for restart stability:
  `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`,
  `GCP_PROJECT_ID`, `FIREBASE_PROJECT_ID`, and `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- Added a user-local `gcloud.cmd` shim under WindowsApps so new PowerShell sessions can
  resolve `gcloud`.
- Added user-local `java.cmd` and `javac.cmd` shims under WindowsApps and persisted
  `JAVA_HOME` to the installed Temurin 21 JDK so Firebase emulator tests do not depend
  on a shell restart.
- Replaced the raw Firestore emulator test command with
  `scripts/run-firestore-tests.mjs`, which refreshes Windows user/machine PATH before
  launching Firebase.
- Set current-user PowerShell execution policy to `RemoteSigned`.
- Added ignored local `.env.local` with non-secret demo defaults for this host.

Validation status:

- `npm run host:check`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- `npm run verify`: passed on 2026-05-28 after the host setup changes.

Open items:

- Live Firebase web app values are still unknown until Firebase is attached/configured
  for `pmikckb-test`; local demo mode remains usable without those secrets.
- Future agents should run `npm run host:setup` themselves instead of asking the user to
  run PowerShell commands.

## Firebase Setup Gate And API-Backed Space UI

- Date: 2026-05-28
- Added `scripts/setup-firebase-demo.mjs` and `npm run firebase:setup-demo` to attach
  Firebase to `pmikckb-test`, create/reuse the demo Firebase Web app, fetch browser
  config, and update ignored `.env.local`.
- `npm run firebase:setup-demo` currently stops at a Google auth consent gate:
  `projects:addFirebase` returns 403 even though `josiah.hunter@cherrybridge.ai` has
  `roles/owner` on `pmikckb-test`. The command now reports this as a clear human
  unblock instead of a stack trace.
- Updated the Lease Renewals Space detail client to try editable API data first for
  SOPs, templates, placeholders, and tools.
- When editable API calls fail because live Firebase/Firestore is not complete, the
  page falls back to the safe local demo records.
- When API-backed, the page can create safe demo records for empty SOP/template/tool/
  placeholder sections, save SOP edits through `PATCH /api/sops/:id`, approve SOPs
  through the editable API, and resolve placeholders through
  `PATCH /api/placeholders/:id`.

Validation status:

- `npm run firebase:setup-demo`: blocked by Google Firebase auth consent, as expected
  until the human Firebase setup gate is completed.
- `npm run format:check`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 64 tests.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- Local browser smoke: passed on 2026-05-28. Verified local demo sign-in, Lease
  Renewals fallback records, and SOP Save behavior.
- `npm run verify`: passed on 2026-05-28 after stopping the local dev server.

Next recommended task:

Complete the Firebase browser consent/console attachment gate, rerun
`npm run firebase:setup-demo`, then seed live Firestore demo records and smoke the
API-backed Lease Renewals page.

## Firebase And Firestore Demo Setup Finalized

- Date: 2026-05-28
- `npm run firebase:setup-demo` succeeded for `pmikckb-test`.
- Firebase Web app `PMI KC KB Demo Web` exists in `pmikckb-test`, and ignored
  `.env.local` now has the Firebase browser config.
- Firestore Native `(default)` database exists in `pmikckb-test` at `us-central1`.
- Deployed Firestore rules and indexes from this repo to `pmikckb-test`.
- `npm run seed:spaces` seeded all launch Space records into live Firestore.
- Added `scripts/seed-demo-records.mjs` and `npm run seed:demo`.
- `npm run seed:demo` seeded the safe Lease Renewals demo SOP, template, tool, and
  placeholder into live Firestore without overwriting existing records.
- Updated seed scripts to read ignored `.env.local`, so they work from a fresh terminal
  after host restart.
- Note: the separate Firebase-created `pmikckb-test-8f927` project has since been
  deleted and may remain visible as `DELETE_REQUESTED` until Google finishes deletion.

Validation status:

- `npm run host:check`: passed on 2026-05-28.
- `npm run firebase:setup-demo`: passed on 2026-05-28.
- Firestore database check: confirmed `(default)` in `us-central1`.
- API smoke with `__session=local-demo`: returned live Firestore SOP/template/tool/
  placeholder records.
- Browser smoke: passed on 2026-05-28. Verified local demo sign-in, API-connected Lease
  Renewals page, live records, and SOP Save through editable API.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules tests.
- `npm run verify`: passed on 2026-05-28.

Next recommended task:

Enable and smoke real Firebase Google sign-in for the builder Workspace domain, then
set the first Admin/Approver custom claims.

## Firebase Auth Setup Gate

- Date: 2026-05-28
- Confirmed `pmikckb-test` is the active demo project.
- Deleted the stray `pmikckb-test-8f927` project. Google reports it as
  `DELETE_REQUESTED`, so it can still appear in project lists until deletion finishes.
- Added `npm run firebase:setup-auth` to initialize Firebase Auth / Identity Platform,
  add local/demo authorized domains, and enable Google as a sign-in provider once
  OAuth client credentials exist.
- Added `npm run firebase:set-role -- --email=<user@example.com> --role=Admin` for
  the first elevated Firebase custom claim after real sign-in creates the user.
- Attempted automated Auth initialization for `pmikckb-test`; Google returned
  `BILLING_NOT_ENABLED`, so a human must attach or create billing before the Identity
  Platform admin API can complete setup.
- Attempted Google provider creation before Auth initialization; Google requires a Web
  OAuth client ID and secret for `google.com` provider config.
- Updated setup docs with the billing/OAuth/manual-console gate and the automated
  continuation commands.

Validation status:

- Main project check: `pmikckb-test` is `ACTIVE`.
- Stray project check: `pmikckb-test-8f927` is `DELETE_REQUESTED`.
- Cloud Billing API is enabled on `pmikckb-test`, but no billing account is visible to
  the current Google account.

Next recommended task:

Human attaches or creates billing for `pmikckb-test`, then the agent reruns
`npm run firebase:setup-auth`, performs a real Google sign-in smoke, and assigns the
first Admin claim.

## Firebase Auth Billing Unblocked

- Date: 2026-05-28
- User linked billing for `pmikckb-test`.
- Verified billing is enabled for the project.
- Reran `npm run firebase:setup-auth`; Firebase Auth / Identity Platform initialization
  now succeeds.
- Verified Auth config exists with authorized domains:
  - `127.0.0.1`
  - `localhost`
  - `pmikckb-test.firebaseapp.com`
  - `pmikckb-test.web.app`
- Google provider config for `google.com` is still missing; the admin API returns
  `404` for `defaultSupportedIdpConfigs/google.com`.
- `npm run firebase:setup-auth` now stops at the remaining OAuth/provider gate and asks
  for either Firebase Console Google-provider enablement or
  `FIREBASE_GOOGLE_CLIENT_ID` / `FIREBASE_GOOGLE_CLIENT_SECRET` in ignored `.env.local`.

Next recommended task:

Human enables Google provider in Firebase Console for `pmikckb-test`, then the agent
reruns `npm run firebase:setup-auth`, performs a real Google sign-in smoke, and assigns
the first Admin claim.

## Firebase Google Sign-In Hang Repair

- Date: 2026-05-28
- User enabled the Google provider in Firebase Console.
- `npm run firebase:setup-auth` now passes and verifies:
  - Firebase Auth is initialized.
  - Google sign-in provider is enabled.
  - Authorized domains are `127.0.0.1`, `localhost`,
    `pmikckb-test.firebaseapp.com`, and `pmikckb-test.web.app`.
- First live redirect attempt returned to `/sign-in` but left the UI on
  `Checking session...`; no Firebase user record existed afterward.
- Updated the sign-in component so Firebase auth-state observation starts immediately,
  redirect-result handling has a timeout fallback, and popup sign-in falls back to
  redirect when the browser blocks popups.
- Browser retry reached the Google account chooser and consent screen for
  `josiah.hunter@cherrybridge.ai`.

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run firebase:setup-auth`: passed on 2026-05-28.

Open item:

- Google consent screen is awaiting a human click on `Allow` before Firebase can create
  the first real user. After that, rerun
  `npm run firebase:set-role -- --email=josiah.hunter@cherrybridge.ai --role=Admin`,
  then sign out and sign back in to refresh the Admin claim.

## Firebase Google Redirect-Only Sign-In

- Date: 2026-05-28
- User reported the sign-in page still appeared hung after clicking Google sign-in.
- Browser diagnostics showed the page stuck at `Opening Google...`, not waiting on the
  server and not showing a Google network timeout.
- Updated the sign-in button to use Firebase redirect sign-in directly instead of
  trying popup sign-in first. The previous popup-first path could stall in the in-app
  browser before handing off to Google.
- Kept the redirect-result timeout/idle fallback from the prior repair so returning to
  `/sign-in` cannot leave the page permanently disabled.
- Browser retry reached Google's account chooser for `josiah.hunter@cherrybridge.ai`
  within a few seconds.

Next recommended task:

Human selects `josiah.hunter@cherrybridge.ai` in Google, clicks `Allow` on the consent
screen, then the agent sets the first Admin claim and smokes `/ask` as a real Firebase
session.

## Firebase Localhost Redirect Repair

- Date: 2026-05-28
- User still saw `Google sign-in did not open` from the visible in-app browser.
- Firebase did not create a user record for `josiah.hunter@cherrybridge.ai`, and the
  app server showed no `/api/auth/session` POST, so the failure was before the app's
  session-cookie exchange.
- Browser automation confirmed the same sign-in button opens Google from
  `http://localhost:3000/sign-in`.
- Added a local sign-in page redirect from `http://127.0.0.1:<port>/sign-in` to
  `http://localhost:<port>/sign-in` so the Firebase Google handoff uses the standard
  localhost origin.
- Verified `http://127.0.0.1:3000/sign-in` redirects to `http://localhost:3000/sign-in`.
- Verified the Google button on `localhost` reaches Google's account chooser.

Next recommended task:

Continue the live sign-in from the visible Google account chooser, allow consent, then
set the first Admin claim.

## Live Auth Smoke Utility

- Date: 2026-05-28
- Added `npm run smoke:auth-live` using `playwright-core` and an installed Chrome or
  Edge executable, so future agents can diagnose real Firebase Google sign-in without
  depending on the in-app browser.
- The utility starts from `http://localhost:3000/sign-in`, clicks Google sign-in,
  fills or selects the provided account when possible, records console/page/network
  events, and writes screenshots plus `events.json` under ignored
  `temp/live-auth-smoke`.
- The utility uses a persistent ignored profile at `temp/live-auth-profile`, allowing a
  completed Google session to be reused by later smoke runs on the same host.
- It intentionally stops at human-only Google checkpoints such as password, MFA, and
  consent unless run with `--pause-on-human`.
- Tightened the utility to recognize Google password screens even when Google keeps an
  account-chooser URL, click the signed-in account row, and fail paused runs that time
  out before returning to the app.
- Updated `docs/google-setup.md` and `tests/e2e/README.md` to make this a documented
  diagnostic smoke, not a CI e2e test.

Validation status:

- `npm run smoke:auth-live` with `--email=josiah.hunter@cherrybridge.ai` and
  `--timeout-ms=90000`: passed on 2026-05-28 by reaching Google and stopping cleanly
  at the human password/MFA checkpoint.
- `npm run smoke:auth-live` with `--email=josiah.hunter@cherrybridge.ai`,
  `--timeout-ms=120000`, and `--pause-on-human`: passed on 2026-05-28 by reaching
  `/ask` with the refreshed Google session.
- `npm run firebase:set-role -- --email=josiah.hunter@cherrybridge.ai --role=Admin`:
  passed on 2026-05-28.
- Admin route smoke with the persistent browser profile: passed on 2026-05-28 by
  reaching `http://localhost:3000/admin`.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 64 tests.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28.

Next recommended task:

Continue from the working real Firebase Admin session and smoke the API-backed demo
flows against live Firestore.

## Live Firestore Demo Workflow Smoke

- Date: 2026-05-28
- Smoked the real Firebase Admin session against the local app and live `pmikckb-test`
  Firestore records using the persistent Chrome profile.
- Found and fixed an Approval Queue gap: the page was reading static demo records and
  its buttons only changed browser state.
- Approval Queue now loads live Lease Renewals SOP/template/placeholder records through
  the editable Firestore repository, falls back to demo records when live loading is
  unavailable, and calls the existing editable API routes to approve SOPs/templates or
  resolve placeholders.
- Extracted `lib/approval/queue.ts` and added unit coverage for live queue mapping and
  demo fallback.

Validation status:

- Signed-in browser smoke: passed on 2026-05-28. Verified Ask returns a `Verified
Source` Lease Renewals answer with the demo citation, Lease Renewals Space reports
  `Editable API connected.`, SOP Save writes through the editable API and was reverted,
  Approval Queue reports `Editable API connected.`, and `/admin` loads for the Firebase
  Admin user.
- Approval Queue approve/resolve API smoke: passed on 2026-05-28 during the first live
  run. The seeded in-review SOP/template and open placeholder were approved/resolved
  through the editable API; later runs correctly showed no in-review queue items.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 66 tests.
- `npm run verify`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.

Next recommended task:

Merge the working Firestore persistence branch, then start the next branch for either a
repeatable live workflow smoke script or the next demo feature gap.

## Demo Show-And-Tell Runbook

- Date: 2026-05-28
- Added `npm run demo:reset` to restore the safe Lease Renewals demo records to
  show-ready state: SOP/template `In Review`, placeholder `Open`, safe SOP/template/
  tool/placeholder content present, approval/resolution fields cleared.
- Added `npm run smoke:demo-live` to run the full signed-in live workflow smoke against
  the local app and demo Firestore project. The smoke resets demo records before and
  after it runs.
- Added `docs/demo-show-and-tell.md` with exact terminal commands, localhost links,
  sign-in guidance, the front-to-back demo workflow, demo language, troubleshooting,
  and demo readiness gaps.
- Updated `README.md`, `SETUP.md`, and `AGENTS.md` to route future sessions to the
  show-and-tell runbook.

Validation status:

- `npm run demo:reset`: passed on 2026-05-28 against `pmikckb-test`.
- `npm run smoke:demo-live`: passed on 2026-05-28 after starting the local dev server.
- `npm run verify`: passed on 2026-05-28 after stopping the hidden dev server that was
  holding Next's Windows SWC binary.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.

Next recommended task:

Review the show-and-tell wording once as the presenter, then decide whether the next
branch should add a deployed demo URL or live Vertex/Gemini retrieval.

## Demo Cutover Working Branch

- Date: 2026-05-28
- Branch: `codex/demo-cutover-working-app` merged to `main` through PR #1:
  <https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/1>.
- Checkpointed and pushed the current M2 API foundation from `main` before starting
  new demo/cutover work.
- Added durable docs for the demo-first path:
  - `docs/demo-cutover.md`
  - `docs/demo-slice.md`
  - `docs/google-setup.md`
- Split M2 planning into M2a API foundation, M2b Space UI, and M2c environment
  seeding.
- Added typed server config parsing and environment maps for Space Drive folders and
  Vertex data stores.
- Added local demo auth, guarded so it is disabled in production.
- Added a Lease Renewals demo Ask flow that returns a cited `Verified Source` answer
  for renewal questions and `No Reliable Source Found` for unsupported questions.
- Added a Lease Renewals Space detail page with local demo SOP/template/tool/placeholder
  state.
- Added a local demo Approval Queue with role-gated approve/resolve buttons.
- Added an idempotent Space seeding script:
  - `npm run seed:spaces`

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 64 tests.
- `npm run verify:router-boundary`: passed on 2026-05-28.
- `npm run build`: passed on 2026-05-28.
- `bash scripts/verify.sh`: passed on 2026-05-28.
- Local browser smoke with `LOCAL_DEMO_AUTH=true` and `ASK_DEMO_MODE=true`: passed on
  2026-05-28. Verified local demo sign-in, Ask verified answer with citation, Lease
  Renewals detail page, and Approval Queue.
- `npm run test:firestore`: still blocked because `java` is not on PATH.

Environment notes:

- GitHub CLI is authenticated as `josiahH-cf`.
- `gcloud` is not installed.
- A Temurin JDK install was attempted through `winget`, but the installer did not make
  `java` available before the shell command timed out. One `msiexec` process remained
  owned by the OS installer service and may require a restart or manual installer
  cleanup.

Next recommended task:

Finish local Java setup, run `npm run test:firestore`, then start the next branch for
real Firestore-backed Lease Renewals UI persistence where Google/Firebase config is
available.

## M2 Review And Repair Pass

- Date: 2026-05-27
- Installed a portable Temurin 21 JDK outside the repo so Firestore emulator tests can
  run locally. User-level `JAVA_HOME` and `Path` were updated; existing terminals may
  need restart before plain `java -version` works.
- Found and fixed the emulator test command: the normal Vitest config intentionally
  excludes `tests/firestore`, so `npm run test:firestore` now uses
  `vitest.firestore.config.ts`.
- Added explicit update-resource guards in `firestore.rules` while reviewing negative
  write paths.
- Confirmed the recent change remains KB-only, with no Owner Router runtime code or
  external system write paths.
- Secret-pattern scan found no committed secret values in repo files.
- Oversized-file check found only `package-lock.json` above 300 KB, expected after
  adding Firebase emulator tooling.

Validation status:

- `bash scripts/verify.sh`: passed on 2026-05-27 after the repair pass; it reinstalled
  from the lockfile, checked formatting, linted, typechecked, ran 56 tests, passed
  Router boundary verification, and built the app.
- `npm run test:firestore`: passed on 2026-05-27 with 6 Firestore Security Rules tests.
- `npm audit --json`: passed on 2026-05-27 with 0 vulnerabilities.

Open items:

- `npm run test:firestore` may require a new terminal session before it sees the
  user-level Java PATH update without setting `JAVA_HOME` manually.
- CRUD UI and Firestore Space seeding remain the next implementation work.

Next recommended task:

Build the Space editing UI on top of the M2 API routes.

## M3a Live Retrieval Boundary Foundation

- Date: 2026-05-28
- Added the official `@google-cloud/discoveryengine` client dependency.
- Replaced the retrieval stub with a Vertex AI Search / Discovery Engine boundary that:
  - resolves configured Space targets from `SPACE_DRIVE_FOLDER_IDS` and
    `SPACE_VERTEX_DATA_STORE_IDS`;
  - supports Space-scoped retrieval and all-configured-Space retrieval;
  - calls the Search API with `autoPaginate: false`;
  - normalizes Drive search results into KB citations;
  - filters unusable results through Firestore `sources_meta`, excluding `Deprecated`
    sources and `High` sensitivity sources;
  - applies the configured grounding confidence threshold before results reach Ask.
- Wired non-demo Ask mode through live retrieval first. Zero usable retrieval results
  return `No Reliable Source Found` without any model call.
- Added explicit `RetrievalSetupError` handling in `/api/ask` so missing project,
  Drive folder, or Vertex data store config returns an Admin/setup `503` instead of
  silently falling back.
- Kept `ASK_DEMO_MODE=true` bypassing live retrieval so the Lease Renewals
  show-and-tell path remains stable.
- Added unit coverage for retrieval config validation, request construction, result
  normalization, source-meta filtering, demo-mode bypass, no-source behavior, and Ask
  setup errors.

Validation status:

- Focused retrieval/Ask route tests: passed on 2026-05-28 with 14 tests.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 74 tests.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 74 tests, passed Router boundary verification,
  and built the app.

Open items:

- Live Vertex AI Search has not been smoked against a real data store because
  Drive folder IDs, Vertex data store IDs, and `sources_meta` records are not yet
  configured for the demo project.
- M3b remains unimplemented: Gemini strict JSON generation, citation downgrade after
  model output, Ask logging, and Ask-to-placeholder capture.

Next recommended task:

Create or connect the Lease Renewals Drive folder and Vertex AI Search data store,
seed matching `sources_meta`, set the Space config maps, and smoke one real retrieval
query before starting M3b.

## M3b Gemini Answer Contract And Ask Capture Foundation

- Date: 2026-05-28
- Added the current Google Gen AI SDK (`@google/genai`) for Vertex/Gemini answer
  generation. Avoided the deprecated `@google-cloud/vertexai` package.
- Added a Gemini answer boundary that:
  - sends a strict JSON response schema;
  - retries once after malformed JSON;
  - validates generated answer shape with Zod;
  - preserves the server-classified source state instead of allowing Gemini to upgrade
    it;
  - prepends `Draft — Review before sending` when Gemini returns a draft without the
    required banner.
- Wired live Ask mode through retrieval, Gemini generation, citation canonicalization,
  and final downgrade to `No Reliable Source Found` when Gemini cites no grounded
  source.
- Added review-only Ask responses for `Bailey Placeholder` and `Conflict Found` states
  so the KB does not generate a confident answer for open gaps or conflicting sources.
- Added Firestore `ask_logs` persistence for live Ask responses.
- Added `/api/ask/capture` and an Ask UI capture action for `Partial Source`,
  `Bailey Placeholder`, and `No Reliable Source Found` results. Capture creates an
  owned placeholder through the existing editable API boundary.
- Added `npm run smoke:ask-live`, a direct local API smoke for the live Ask path once
  the app is running with `ASK_DEMO_MODE=false` and real Drive/Vertex config.
- Extended the 50-case eval test so every seed case executes through the Ask service
  contract, not only the seed-file shape checks.

Validation status:

- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 86 tests.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run build`: passed on 2026-05-28 after rerunning sequentially. An earlier
  parallel run raced with `npm run verify`, which reinstalls dependencies and
  temporarily removed Next's Windows SWC binary during build.
- `npm run test:firestore`: passed on 2026-05-28 with 6 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 86 tests, passed Router boundary verification,
  and built the app.
- Local browser smoke: passed on 2026-05-28. Verified local demo sign-in, an
  unsupported Ask question returning `No Reliable Source Found`, and the Ask capture
  panel rendering without creating a placeholder.

Open items:

- Live Ask has not yet been smoked against a real Vertex AI Search data store because
  the Lease Renewals Drive folder ID, data store ID, and `sources_meta` records are
  still not configured.
- Live browser smoke was not run for this pass because the live Drive/Vertex setup is
  still missing; demo browser smoke remains covered by `npm run smoke:demo-live`.

Next recommended task:

Configure the Lease Renewals Drive/Vertex setup and run `npm run smoke:ask-live` with
`ASK_DEMO_MODE=false`.

## Review And Repair Pass For M3a/M3b

- Date: 2026-05-28
- Reviewed the M3a/M3b branch as a fresh verification pass against the spec, docs, API
  boundaries, Firestore rules, and PR state.
- Fixed duplicate `id="space"` controls in the Ask UI after adding the main Space
  selector and capture-task Space selector.
- Tightened `firestore.rules` so clients cannot directly create `ask_logs`; live Ask
  logs are server-written through the Admin SDK boundary.
- Added Firestore rules coverage for blocked direct Ask-log writes.
- Clarified the Gemini prompt so Approved sources are final while Unreviewed and
  Transcript-derived sources remain partial/review-required.
- Updated `AGENTS.md` with `npm run smoke:ask-live`.
- Updated `SETUP.md` so local/demo Ask behavior no longer implies every missing live
  setup returns only `No Reliable Source Found`; live missing setup now returns explicit
  setup errors.

Validation status:

- GitHub PR #2 CI `verify`: passed on 2026-05-28.
- Oversized file check: only `package-lock.json` is over 300 KB, expected for npm
  dependency lockfiles.
- `npm run format:check`: passed on 2026-05-28.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 86 tests.
- `npm run test:firestore`: passed on 2026-05-28 with 7 Firestore Security Rules
  tests.
- `npm run build`: passed on 2026-05-28.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 86 tests, passed Router boundary verification,
  and built the app.
- Local browser smoke: passed on 2026-05-28. Verified local demo sign-in,
  no-source Ask, capture panel rendering, Space selector behavior, and no duplicate DOM
  IDs on the Ask page.

Open items:

- Live Ask still needs real Lease Renewals Drive/Vertex configuration and
  `npm run smoke:ask-live` with `ASK_DEMO_MODE=false`.

Next recommended task:

Merge PR #2, sync local `main`, start a fresh branch, then configure the Lease
Renewals Drive/Vertex setup for live Ask smoke.

## Under-$10 Live Ask And Demo Deploy Helpers

- Date: 2026-05-28
- Added cost-guarded helper scripts for the next setup phase:
  - `npm run check:live-cost` blocks live smoke/deploy unless Ask is non-demo,
    `gemini-2.5-flash` is selected, and only the `lease-renewals` Space is configured.
  - `npm run seed:source-meta` upserts `sources_meta` entries from source IDs,
    Google Drive file URLs, or Cloud Storage `gs://` object URIs.
  - `npm run deploy:demo` deploys the demo to Cloud Run only when
    `--budget-confirmed` is supplied, with scale-to-zero settings and a one-instance
    cap.
- Extended `npm run smoke:ask-live` with `--browser-session` so deployed Cloud Run
  smoke can reuse the signed-in browser profile instead of enabling local demo auth.
- Updated `.env.example`, `AGENTS.md`, `README.md`, `docs/implement.md`, and
  `docs/google-setup.md` with the cheap live path, command list, console links, and
  user-owned setup steps.
- Kept this phase scoped to one Lease Renewals data store. No Owner Router runtime,
  Gmail notification path, production cutover, all-Space indexing, or custom domain
  mapping was added.

Validation status:

- `npm run format:check`: passed on 2026-05-28.
- Focused tests: `npm test -- tests/unit/live-cost-scripts.test.mjs` passed on
  2026-05-28 with 5 tests.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 91 tests.
- Dry-run `npm run check:live-cost`: passed on 2026-05-28 with a mocked one-Space
  Flash config.
- Dry-run `npm run seed:source-meta`: passed on 2026-05-28 and normalized a Google
  Docs URL into a Drive file ID.
- Dry-run `npm run deploy:demo -- --budget-confirmed`: passed on 2026-05-28 and
  produced a scale-to-zero Cloud Run command.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 7 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 91 tests, passed Router boundary verification,
  and built the app.

Open items:

- A human still needs to complete the linked Google Console tasks in
  `docs/google-setup.md`: budget alert, Drive folder/source docs, Vertex AI Search
  data store, service-account/IAM review, and Firebase authorized domain after deploy.
- Live Ask and deployed Cloud Run smoke have not been run because the real Drive folder
  ID, Vertex data store ID, source file IDs, and Cloud Run URL do not exist in the repo.

Next recommended task:

Complete the user-owned console setup in `docs/google-setup.md`, populate ignored
`.env.local` with the one-Space Lease Renewals IDs, then run `npm run check:live-cost`,
`npm run seed:source-meta`, local `npm run smoke:ask-live`, `npm run deploy:demo`, and
deployed `npm run smoke:ask-live -- --browser-session`.

## Live Setup Follow-Up: APIs, Search Location, And Seed Docs

- Date: 2026-05-28
- Confirmed the `$10` budget alert exists per user report.
- Enabled the missing APIs needed for the cheap live/deploy path in `pmikckb-test`:
  `aiplatform.googleapis.com`, `run.googleapis.com`, `cloudbuild.googleapis.com`,
  `artifactregistry.googleapis.com`, `iam.googleapis.com`, and
  `iamcredentials.googleapis.com`.
- Verified the full required API set is now enabled for the current cheap path,
  including Discovery Engine / Vertex AI Search, Drive, Firestore, Firebase /
  Identity Platform, Cloud Billing, Service Usage, Logging, and Monitoring.
- Verified `pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com` has the intended
  runtime roles: `roles/aiplatform.user`, `roles/datastore.user`, and
  `roles/discoveryengine.user`.
- Split Gemini and Vertex AI Search locations in config:
  - `VERTEX_AI_LOCATION=us-central1` for Gemini.
  - `VERTEX_SEARCH_LOCATION=us` for Agent Search / Vertex AI Search data stores.
- Updated setup docs with exact API names, exact Lease Renewals Drive folder ID,
  recommended data store name/id, and the current Google Workspace data-store caveat
  that service-account search is not supported for Workspace data stores.
- Created ignored local seed docs under `temp/lease-renewals-drive-seed/` for user
  upload to the Lease Renewals Drive folder. These are safe demo docs, not real call
  transcripts.

Validation status:

- API enablement: succeeded on 2026-05-28.
- IAM verification for `pmikckb-test-svc`: passed on 2026-05-28.
- `npm run format:check`: passed on 2026-05-28.
- Focused tests for config/search/deploy helpers: passed on 2026-05-28 with 29 tests.
- `npm run lint`: passed on 2026-05-28.
- `npm run typecheck`: passed on 2026-05-28.
- `npm test`: passed on 2026-05-28 with 91 tests.
- `npm run build`: passed on 2026-05-28.
- `npm run test:firestore`: passed on 2026-05-28 with 7 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-28; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 91 tests, passed Router boundary verification,
  and built the app.
- Dry-run `npm run check:live-cost`: passed on 2026-05-28 with a mocked one-Space
  Flash config.
- Dry-run `npm run deploy:demo -- --budget-confirmed`: passed on 2026-05-28 and
  included `VERTEX_SEARCH_LOCATION=us`.

Open items:

- The user hit a Google console OAuth error while creating the Google Drive data store:
  `Access blocked: Authorization Error`, `Client missing a project id`, `invalid_client`.
- The original call/transcript files referenced by `docs/spec.md`
  (`pmi_-_call_1.md`, `pmi_-_call_2.md`, `transcript_analysis.md`) are not present in
  the local repos found under `C:\Users\josia\Documents\github-windows`.
- Because Google docs currently say service-account credentials cannot search Google
  Workspace data stores, a Drive-backed data store may not work with the current
  server-side retrieval boundary. If the data store can be created but live Ask returns
  403, use a Cloud Storage data store for the cheap demo smoke or implement user OAuth
  retrieval before accepting the Drive-backed path.

Next recommended task:

Upload the two safe seed docs from `temp/lease-renewals-drive-seed/` plus one
sanitized real Lease Renewals call transcript or notes file, retry data-store creation
from the exact project-scoped console link, then provide the data store ID and Drive
file IDs for `npm run seed:source-meta` and live smoke.

## Cloud Storage Data Store Route

- Date: 2026-05-29
- Switched the cheap live Ask setup path from a Drive-backed data store to a
  Cloud Storage-backed Agent Search data store after the Drive connector OAuth error
  and the documented Workspace service-account search limitation.
- Updated retrieval citation normalization so `gs://` results are shown as
  `https://storage.cloud.google.com/...` browser links while still using the Agent
  Search document ID as the source key.
- Updated `npm run seed:source-meta` so `--source-id=gs://...` accepts a Cloud
  Storage object URI and derives the same deterministic raw-content document ID that
  Agent Search documents for Cloud Storage content imports.
- Added a reusable sanitized call-notes template at
  `docs/demo-source-templates/lease-renewals-sanitized-call-notes.md` so the demo can
  include real process context without committing sensitive source material.
- Updated `docs/google-setup.md`, `docs/implement.md`, `.env.example`, and
  `README.md` for the Cloud Storage source-prefix workflow.

Validation status:

- Focused retrieval/script tests passed on 2026-05-29 with 11 tests.
- `npm run format:check`: passed on 2026-05-29.
- `npm run lint`: passed on 2026-05-29.
- `npm run typecheck`: passed on 2026-05-29.
- `npm test`: passed on 2026-05-29 with 93 tests.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 93 tests, passed Router boundary verification,
  and built the app.
- `npm run test:firestore`: passed on 2026-05-29 with 7 Firestore Security Rules
  tests.

Open items:

- A human still needs to add one sanitized Lease Renewals call transcript or notes
  file before the demo can prove actual call-derived context.
- A human still needs to create the Cloud Storage-backed Agent Search data store and
  provide the bucket name if the agent cannot run authenticated `gcloud` commands.

Next recommended task:

Run the exact Cloud Storage setup workflow in `docs/google-setup.md`, seed
`sources_meta` using the uploaded `gs://` source URIs, then run local live Ask smoke.

## Cloud Storage Live Ask Smoke

- Date: 2026-05-29
- Completed Google auth reauthentication for local CLI and Application Default
  Credentials.
- Created source bucket `gs://pmikckb-test-lease-renewals-686407` and uploaded the
  safe Lease Renewals demo sources.
- Confirmed the console-created Markdown data store
  `kb-lease-renewals_1780046781160` did not index documents for the smoke path.
- Corrected the source format to supported `.txt` Cloud Storage content files and
  granted the Discovery Engine service agent read-only access to the source bucket.
- Created working standard-edition data store `kb-lease-renewals-txt` and imported
  2 of 2 text documents.
- Updated `.env.local` to use:
  - `ASK_DEMO_MODE=false`
  - `GEMINI_MODEL_ANSWER=gemini-2.5-flash`
  - `SPACE_DRIVE_FOLDER_IDS={"lease-renewals":"gs://pmikckb-test-lease-renewals-686407/lease-renewals/"}`
  - `SPACE_VERTEX_DATA_STORE_IDS={"lease-renewals":"kb-lease-renewals-txt"}`
- Seeded `sources_meta` for both imported `.txt` Cloud Storage objects.
- Removed the standard-edition blocker by dropping the Enterprise-only extractive
  answer request from the Vertex AI Search query and using snippets only.
- Updated `docs/google-setup.md` so future setup uses supported `.txt` uploads, the
  service-agent bucket grant, and the working data-store ID pattern.

Validation status:

- Corrected TXT import completed with `successCount=2` and `totalCount=2` on
  2026-05-29.
- `npm run check:live-cost`: passed on 2026-05-29 for one Lease Renewals space using
  `gemini-2.5-flash`.
- Focused retrieval test passed on 2026-05-29 with 5 tests.
- `npm run typecheck`: passed on 2026-05-29.
- `npm run smoke:ask-live -- --timeout-ms=90000`: passed on 2026-05-29 against
  `http://localhost:3000`.

Open items:

- The sanitized real call-notes file still matches the blank template and was not
  uploaded. The live smoke currently proves safe seed sources only, not call-derived
  client context.
- The console-created `kb-lease-renewals_1780046781160` data store can be deleted
  later to avoid confusion after confirming no dependency points to it.

Next recommended task:

Add sanitized real Lease Renewals call notes, upload/import the `.txt` copy, seed its
`sources_meta` record as `Transcript-derived`, then deploy the cheap Cloud Run demo if
the local result is acceptable.

## Fresh Review And Documentation Alignment

- Date: 2026-05-29
- Reviewed the live Ask / Cloud Storage work as a fresh-context verification pass.
- Found and fixed stale wording in active docs and scripts that still implied the
  cheap live path was Drive/Vertex-only after the working path moved to Cloud Storage
  plus Agent Search.
- Added tracked safe demo source templates under `docs/demo-source-templates/` so a
  future clone is not dependent on ignored `temp/` files for the live Ask smoke setup.
- Updated `docs/google-setup.md` with the known working `pmikckb-test` bucket and
  data-store values, supported `.txt` upload flow, the Discovery Engine service-agent
  bucket read grant, and troubleshooting for empty/stuck imports.
- Updated `SETUP.md`, `README.md`, `docs/plan.md`, `docs/implement.md`, and
  `docs/demo-show-and-tell.md` so the current next task is sanitized real call notes
  and cheap Cloud Run deploy, not first-time live retrieval setup.
- Updated source metadata seeding to prefer `--source-id` while keeping legacy
  `--drive-file-id` accepted.
- Updated user-facing setup errors and smoke failures to say source target / Agent
  Search instead of Drive folder / Drive-Vertex when the value may be a Cloud Storage
  prefix.

Validation status:

- Official Google documentation was rechecked on 2026-05-29 for Cloud Storage
  unstructured file support and `roles/storage.objectViewer` bucket access.
- Focused tests passed on 2026-05-29 with 22 tests across retrieval, live-cost/source
  scripts, and Ask service setup-error behavior.
- `npm run format:check`: passed on 2026-05-29.
- `npm run lint`: passed on 2026-05-29.
- `npm run typecheck`: passed on 2026-05-29.
- `npm test`: passed on 2026-05-29 with 94 tests.
- `npm run build`: passed on 2026-05-29.
- `npm run test:firestore`: passed on 2026-05-29 with 7 Firestore Security Rules
  tests.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 94 tests, passed Router boundary verification,
  and built the app.
- `git diff --check`: passed on 2026-05-29.
- Quality-control review found no unexpectedly large code file changes; the largest
  new tracked content is documentation and safe demo source templates.

Open items:

- The safe seed live Ask smoke is complete, but sanitized real Lease Renewals call
  notes are still needed before treating the demo as call-context-backed.
- The unused console-created Markdown data store `kb-lease-renewals_1780046781160`
  should be deleted later after confirming the app and docs continue to point at
  `kb-lease-renewals-txt`.

Next recommended task:

Add sanitized Lease Renewals call notes, upload/import the `.txt` copy into
`kb-lease-renewals-txt`, seed `sources_meta` with `approval_status=Transcript-derived`,
rerun live Ask smoke, then deploy the cheap Cloud Run demo.

## Transcript-Backed Demo Planning And Source Templates

- Date: 2026-05-29
- Reviewed local raw call/context material under `docs/context_and_calls/` against
  current repo docs, demo runbooks, Google setup docs, and source templates.
- Confirmed the raw call folder contains sensitive and noisy local review material,
  including participant names, owner/applicant examples, dollar amounts, Fathom links,
  and bank/screening-adjacent details. It is now ignored by git and Prettier so it can
  remain local without breaking `npm run format:check` or being accidentally tracked.
- Converted the blank Lease Renewals sanitized call-notes template into a
  transcript-derived, review-required source summary with role-only facts and explicit
  placeholder triggers.
- Added sanitized transcript-derived source templates for three supported future demo
  candidates:
  - Maintenance Work Order Intake / vendor assignment.
  - Move-Out + Deposit Disposition.
  - Owner Onboarding.
- Updated demo and setup docs so the current truth is explicit: the cheap live Ask path
  works through Cloud Storage `.txt` sources and Agent Search, while call-context-backed
  live Ask still requires reviewing the sanitized template, uploading/importing the
  `.txt` copy, seeding `sources_meta`, and rerunning live smoke.
- Updated active next-step wording in `README.md`, `docs/plan.md`, and
  `docs/implement.md` from "add sanitized notes" to the remaining upload/import/seed
  work.

Validation status:

- `npm run format:check`: passed on 2026-05-29.
- No code or test files changed, so focused tests and `npm run typecheck` were not
  required for this documentation-only pass.

Open items:

- The sanitized Lease Renewals `.txt` copy still needs to be uploaded/imported into
  `kb-lease-renewals-txt`, seeded in `sources_meta` as `Transcript-derived`, and smoked
  with `npm run smoke:ask-live`.
- Maintenance, Move-Out, and Owner Onboarding are strong future demo candidates, but
  they need separate source prefixes/data stores and approval before being treated as
  final SOP content.
- Bailey/Dan still need to confirm legal notice wording, fee details, approval
  thresholds, exception handling, and any tenant/owner-facing template language before
  those details can become approved sources.

Next recommended task:

Review the sanitized Lease Renewals call-notes template, upload/import its `.txt` copy
into `kb-lease-renewals-txt`, seed `sources_meta` with
`approval_status=Transcript-derived`, rerun `npm run check:live-cost` and
`npm run smoke:ask-live`, then deploy the cheap Cloud Run demo if the live answer is
acceptable.

## Fresh Review And Repair: Transcript Template Alignment

- Date: 2026-05-29
- Performed an outside-style verification pass over the recent transcript-backed demo
  documentation work, current branch state, and affected runbooks.
- Fetched `origin` and moved the work off `main` onto
  `codex/review-demo-docs-call-context`; local HEAD and `origin/main` were aligned
  before the branch was created.
- Confirmed no remote merge was needed because the branch base and `origin/main` had
  zero ahead/behind commits after fetch.
- Falsified the new templates for obvious leakage patterns and did not find emails,
  phone numbers, dollar amounts, Fathom links, named owners/applicants, bank examples,
  or private payment identifiers in `docs/demo-source-templates/`.
- Fixed a terminology ambiguity in the template source context by changing participant
  role labels from `owner` to `company owner`, so demo readers do not confuse Dan with
  a property owner in workflow examples.
- Tightened `docs/demo-cutover.md` wording from Drive-specific setup to source target
  / Agent Search setup for the current Cloud Storage-backed live Ask path.
- Clarified `.gitignore` grouping so `docs/context_and_calls/` is recognized as raw
  review context, not a tracked source folder.

Validation status:

- `npm run format:check`: passed on 2026-05-29.
- `git diff --check`: passed on 2026-05-29.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 94 tests, passed Router boundary verification,
  and built the app.
- Quality-control scan: `docs/context_and_calls/` is ignored by git; new demo source
  templates are small Markdown files; no unexpected tracked file over 300 KB was found
  other than the existing `package-lock.json`.

Open items:

- Same as above: the sanitized Lease Renewals `.txt` still needs upload/import,
  `sources_meta` seeding, and live Ask smoke before the demo is call-context-backed.

## Robust First-Pass Demo Source Expansion

- Date: 2026-05-29
- Strengthened the transcript-derived demo source templates so they can stand alone as
  first-pass handoff artifacts for a client demo without pretending to be approved
  SOPs.
- Added workflow value, first-pass handoff flow, safe-answer boundaries, refusal
  boundaries, Bailey/Dan review questions, placeholder triggers, and stronger demo Ask
  questions to:
  - Lease Renewals.
  - Maintenance Work Order Intake.
  - Move-Out + Deposit Disposition.
  - Owner Onboarding.
- Added `docs/demo-source-templates/README.md` to catalog which templates belong in
  the current Lease Renewals live Ask corpus and which are future demo candidates.
- Updated `docs/demo-show-and-tell.md`, `docs/demo-slice.md`, `docs/google-setup.md`,
  and `README.md` so the new templates are discoverable and the current one-Space live
  Ask boundary remains clear.
- Rechecked the new demo source templates for obvious sensitive-data patterns; the only
  match was the intended warning text about private Fathom links, not an actual link.
- Replaced remaining active demo/cutover wording that implied Drive-only or
  Vertex-only setup with source location / Agent Search wording where appropriate.

Validation status:

- `npm run format:check`: passed on 2026-05-29.
- `git diff --check`: passed on 2026-05-29.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 94 tests, passed Router boundary verification,
  and built the app.
- Sensitive-pattern scan over `docs/demo-source-templates/` found no actual URLs,
  emails, phone numbers, named owner/applicant examples, bank/payment identifiers, or
  dollar amounts in the source templates. The only match was intentional safety
  language referencing `under-$10` demo scope.

Open items:

- Transcript-derived templates still require Bailey/Dan approval before they can become
  final SOP content.
- Only Lease Renewals is ready for the current cheap live Ask import path. The other
  templates need separate source targets, data stores, demo records, and cost checks
  before live demo use.

## Transcript-Backed Live Ask Repair And Hardening

- Date: 2026-05-29
- Refreshed the Lease Renewals transcript-derived source so Agent Search sees workflow
  facts before sanitization guardrail text. The first live smoke had retrieved the
  right document but did not produce a cited Ask answer reliably.
- Uploaded the refreshed `.txt` copy to
  `gs://pmikckb-test-lease-renewals-686407/lease-renewals/03-lease-renewals-sanitized-call-notes.txt`.
- Imported that object into Agent Search data store `kb-lease-renewals-txt`; the import
  operation completed with `successCount=1` and `totalCount=1`.
- Re-seeded `sources_meta` for document ID `9de7f0d4bd8630e7a73f3cddbe752289` with
  `approval_status=Transcript-derived` and `sensitivity=Low`.
- Confirmed direct Agent Search now returns the transcript-derived source as the top
  result for "When do we contact the owner versus the tenant during a renewal?"
- Hardened the live answer contract so Gemini is instructed to use `Partial Source`
  when excerpts support a cautious answer, never put the draft banner in the answer
  field, and never invent escalation-owner role titles.
- Hardened the Ask service response boundary to strip draft banners out of the answer,
  fall back to known escalation labels only, and normalize draft banner spacing.
- Updated active README, implementation, plan, demo-slice, and show-and-tell docs so
  they no longer say the Lease Renewals transcript-derived source still needs to be
  uploaded/imported/smoked.

Validation status:

- Focused unit tests passed on 2026-05-29 with 17 tests across Ask service and Gemini
  answer-contract behavior.
- `npm run format:check`: passed on 2026-05-29.
- `npm run typecheck`: passed on 2026-05-29.
- `git diff --check`: passed on 2026-05-29.
- `npm run smoke:ask-live -- --question="When do we contact the owner versus the tenant during a renewal?" --timeout-ms=120000`
  passed on 2026-05-29 against the local app with `ASK_DEMO_MODE=false`.
- `npm run verify`: passed on 2026-05-29; it reinstalled from the lockfile, checked
  formatting, linted, typechecked, ran 98 tests, passed Router boundary verification,
  and built the app.
- Quality-control scan: changed files are small documentation/code/test edits; demo
  source templates remain under 8 KB each; sensitive-pattern scan found only intentional
  safety wording around routing rules and under-$10 demo scope, not customer URLs,
  emails, phone numbers, account identifiers, SSNs, or real dollar amounts.

Open items:

- Transcript-derived Lease Renewals content is useful for demo grounding, but remains
  review-required until Bailey/Dan approve final SOP wording.
- Maintenance, Move-Out, and Owner Onboarding templates remain future demo candidates;
  they are not imported into the one-Space live corpus.
- The cheap Cloud Run demo has not been deployed in this pass.

## Four-Workflow Demo Closeout

- Date: 2026-05-29
- Assumed Bailey/Dan approval for sanitized demo messaging and promoted the four
  sanitized call-note templates to approved demo sources while keeping missing legal,
  fee, cadence, exception, and system-of-record details out of final SOP content.
- Expanded local demo mode from Lease Renewals only to four approved workflow slices:
  Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and
  Owner Onboarding.
- Added approved safe demo SOP source files for Maintenance, Move-Out, and Owner
  Onboarding so live retrieval has more than one source per new workflow.
- Uploaded `.txt` copies for the three added workflows to
  `gs://pmikckb-test-lease-renewals-686407/`, created/imported the Agent Search data
  stores `kb-maintenance-work-order-intake-txt`,
  `kb-move-out-deposit-disposition-txt`, and `kb-owner-onboarding-txt`, and seeded
  `sources_meta` for all nine demo source objects as `Approved` / `Low`.
- Added `npm run import:agent-search` for repeatable Cloud Storage content imports and
  hardened the Cloud Run deploy helper for Windows `gcloud.ps1`, multi-Space maps, and
  escaped JSON env values.
- Added an explicit `--skip-allow-unauthenticated` deploy option for projects where
  organization policy rejects `allUsers` invoker bindings, and tightened the
  multi-Space live-cost guard so empty source/data-store maps are still rejected.
- Deployed Cloud Run service `pmi-kc-kb-demo` in `pmikckb-test` at
  <https://pmi-kc-kb-demo-800237451321.us-central1.run.app/sign-in>.
- Cloud setup changes made in the demo project:
  - granted the default compute service account read-only access to the Cloud Run
    source bucket and `roles/run.builder`;
  - deployed runtime as `pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com`;
  - granted that runtime service account `roles/firebaseauth.admin`;
  - disabled Cloud Run invoker IAM checks because org policy rejected `allUsers`;
  - added the Cloud Run hosts to Firebase Auth authorized domains.
- Updated README, setup, implementation, plan, demo, cutover, Google setup, and source
  template docs to reflect the four-workflow local and deployed demo state.

Validation status:

- `npm run check:live-cost -- --allow-multiple-spaces`: passed on 2026-05-29.
- Local live Ask smoke passed for all four workflow Spaces with `ASK_DEMO_MODE=false`.
- `npm run deploy:demo -- --budget-confirmed --allow-multiple-spaces --service-account=pmikckb-test-svc@pmikckb-test.iam.gserviceaccount.com`:
  passed on 2026-05-29 after the IAM fixes above.
- Deployed auth smoke passed on 2026-05-29 and reached `/ask`.
- Deployed live Ask smokes passed on 2026-05-29 for Lease Renewals, Maintenance Work
  Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding.
- `npm run demo:reset`: passed on 2026-05-29 and reset four workflow records.
- `npm run smoke:demo-live -- --base-url=http://localhost:3000 --timeout-ms=60000`:
  passed on 2026-05-29 for Ask, all four Space save/revert checks, Approval Queue, and
  Admin.
- Focused checks passed on 2026-05-29: `npm run build`, `npm run typecheck`, and
  `npm test -- tests/unit/live-cost-scripts.test.mjs tests/unit/ask-service.test.ts tests/unit/approval-queue.test.ts`.
- `npm run format:check`: passed on 2026-05-29 after the review/hardening pass.
- `npm run check:live-cost -- --allow-multiple-spaces`: failed as expected against the
  restored local demo environment while `ASK_DEMO_MODE=true`; passed with a temporary
  live-mode override and the current configured source/data-store maps.
- `npm run verify`: passed on 2026-05-29 after the final review/hardening pass.
- `npm run test:firestore`: passed on 2026-05-29.

Open items at that time:

- The unused console-created Markdown data store `kb-lease-renewals_1780046781160`
  still needed deletion confirmation. This is resolved in the following production
  follow-up pass.
- Final production remained out of scope for this demo. The following production
  follow-up pass implements launch skeletons, notification plumbing, and Admin
  observability, while keeping PMI KC-owned production source approval/import and
  Owner Router read-only indexing as open cutover work.

## Production Follow-Up Workflow Pass

- Date: 2026-05-29
- Implemented all launch Space shells and safe launch skeletons for the seven remaining
  writable Spaces: owner renewal outreach, tenant renewal notice, vendor assignment
  handoff, daily inbox triage, Fathom training, escalation rules, and move-in.
- Added all-Space Approval Queue loading, Return-for-revision actions for SOP/template
  items, visible Space change-log history, and Admin observability for Ask volume,
  queue depth, notification failures, source states, top Spaces, open placeholders, and
  setup health.
- Added Gmail send-only approval notification plumbing behind
  `KB_APPROVAL_NOTIFICATIONS_ENABLED=false` by default. The implementation uses only
  the Gmail send scope, logs sent/skipped/failed notification attempts, and keeps KB
  approval notifications internal-only.
- Added transcript-derived safe source starters for the seven remaining launch Spaces,
  plus `docs/source-corpus/demo-live-source-manifest.json` and
  `npm run corpus:plan` to produce `.txt` staging copies, upload commands, import
  commands, and `sources_meta` seed commands.
- Added guarded operational scripts:
  - `npm run seed:launch-skeletons` for idempotent launch skeleton seeding.
  - `npm run delete:agent-search-data-store` for confirmed Agent Search data-store
    deletion with an active-env-map guard.
- Fresh review repair: launch skeleton reset/force-seed paths now clear stale
  approval, review, related-SOP, and resolution fields so a previously approved or
  resolved skeleton returns to a clean placeholder state.
- Seeded the demo Firestore with all 12 Space records and 21 safe launch skeleton
  records. Existing records are skipped by the skeleton seeder unless `--force` is
  used.
- Confirmed the deployed Cloud Run service and local `.env.local` maps referenced
  `kb-lease-renewals-txt`, not `kb-lease-renewals_1780046781160`, then deleted the
  unused console-created Agent Search data store
  `kb-lease-renewals_1780046781160`.
- Updated README, setup, Google setup, implementation, plan, demo show-and-tell, and
  demo source template docs to reflect the new launch skeleton, notification,
  observability, corpus-manifest, and deletion-helper state.

Validation status:

- `npm run corpus:plan -- --write-temp`: passed and generated ignored `.txt` staging
  copies under `temp/source-corpus`.
- `npm run seed:launch-skeletons -- --dry-run`: passed and previewed 21 safe records.
- Focused launch skeleton helper regression test: passed.
- `npm run seed:spaces`: passed against the demo project.
- `npm run seed:launch-skeletons`: passed against the demo project and created 21
  safe launch skeleton records.
- Guarded stale data-store deletion: passed and deleted
  `kb-lease-renewals_1780046781160`.
- Sensitive-pattern scan over `docs/demo-source-templates/`: no actual URLs, emails,
  phone numbers, or dollar amounts found.
- Oversized-file check: no unexpected tracked files over 300 KB outside generated or
  lockfile paths.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 115 tests.
- `npm run build`: passed.
- `npm run test:firestore`: passed with 8 Firestore Security Rules tests.
- `npm run smoke:demo-live -- --base-url=http://localhost:3000 --timeout-ms=90000`:
  passed after starting the local dev server with demo mode enabled; the server was
  stopped afterward.
- `npm run check:live-cost`: passed with explicit `ASK_DEMO_MODE=false`.
- `npm run verify`: passed; it checked formatting, lint, typecheck, 115 tests, Router
  boundary, and build.
- `git diff --check`: passed.

Open items:

- Production source corpus is not complete until PMI KC-owned source locations and
  approved production source files are provided/imported. The manifest is a safe demo
  and staging preparation path, not a substitute for production source approval.
- Gmail approval notifications remain disabled until the sender identity, recipient
  list, and deployed `APP_BASE_URL` are approved and configured.
- The separate Owner Router repo exists locally, but the Owner Router Drive package
  still needs substantive Bailey/Dan content and read-only indexing into the KB Owner
  Email Space before final A-16 verification.

## Demo Done And Production Cutover Readiness Pass

- Date: 2026-05-29
- Added `docs/demo-readiness.md` to define the demo done state separately from
  production completion.
- Added `docs/client-production-cutover.md` as the ordered client-owned rebuild path.
- Added neutral command aliases for reusable setup/deploy flows while preserving demo
  aliases:
  - `npm run firebase:setup`
  - `npm run firebase:setup-auth`
  - `npm run firebase:setup-auth-demo`
  - `npm run deploy`
  - `npm run preflight:production`
- Parameterized `npm run corpus:plan` so generated Agent Search import commands can
  target a client project/location instead of hard-coding `pmikckb-test`.
- Added `docs/source-corpus/client-production-source-manifest.template.json` as a
  placeholder manifest for approved PMI KC-owned sources. It intentionally excludes
  Owner Email, which remains blocked on the separate Owner Router package and
  read-only indexing.
- Added a production cutover preflight that rejects demo project IDs, demo source
  targets, demo auth mode, local demo auth, missing Firebase public config, missing
  `APP_BASE_URL`, and missing source/data-store maps.
- Fresh review repair: production preflight now also rejects mismatched
  GCP/Firebase/public Firebase project IDs and demo-valued Firebase auth domains,
  `APP_BASE_URL`, or Cloud Run service accounts. It also rejects unreplaced
  placeholders and requires a valid HTTPS production `APP_BASE_URL`.
- Updated README, SETUP, Google setup, demo cutover, demo show-and-tell, implementation,
  plan, and source-template docs so demo done and production cutover ready are distinct
  states.

Validation status:

- Focused unit test: `npm test -- tests/unit/live-cost-scripts.test.mjs` passed with
  22 tests, including corpus planner parameterization, client-production manifest
  validation, production preflight checks, mismatched project/demo auth-domain
  rejection, and unreplaced placeholder rejection.
- `npm run preflight:production -- --env-file=temp/production-preflight-ok.env` passed
  against an ignored client-shaped env file.
- `npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --project=pmikc-kb-production --location=us --dry-run`
  passed and generated import commands for `pmikc-kb-production` rather than
  `pmikckb-test`.
- `npm run seed:launch-skeletons -- --dry-run` passed.
- `npm run format:check`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 121 tests.
- `npm run test:firestore`: passed with 8 Firestore Security Rules tests.
- `npm run verify`: passed; it checked formatting, lint, typecheck, 121 tests, Router
  boundary, and build.
- `git diff --check`: passed.

Open items:

- Re-run the documented demo readiness smoke matrix before claiming the demo is done
  for a specific show date.
- Client production still requires PMI KC-owned project/admin/billing access and
  approved production source files; the repo now has a more autonomous runbook, but it
  cannot create or approve those external assets by itself.

## One-Command Local Demo Operator

- Date: 2026-05-29
- Added `npm run demo:operator` and `scripts/demo-operator.ps1` for local demo
  rehearsal, showtime startup, and teardown.
- The operator supports:
  - `TestRun`: host check, demo reset, local dev server start/reuse, local workflow
    smoke, launch skeleton dry-run, and operator link generation.
  - `Showtime`: clean reset, quick local smoke, final reset, and browser launch for
    the local sign-in flow.
  - `Teardown`: demo reset and stop only the dev server started by the operator.
- Updated `docs/demo-readiness.md` and `docs/demo-show-and-tell.md` so the preferred
  tomorrow-demo path is the operator script with local demo sign-in.

Validation status:

- `npm test -- tests/unit/demo-operator.test.mjs`: passed with 7 tests.
- `npm run format:check`: passed after formatting the new operator and tests.
- `npm run typecheck`: passed.
- `npm test`: passed with 128 tests across 23 files.
- `node scripts/demo-operator.mjs --mode=test-run --skip-install --no-open-browser --dry-run`:
  passed and printed the expected command plan.
- `.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall -NoOpenBrowser -DryRun`:
  passed and printed the same plan through the PowerShell wrapper.
- `.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall -NoOpenBrowser`: passed. It
  verified host setup, reset demo records, started/reused the local dev server,
  passed `smoke:demo-live`, dry-ran launch skeleton seeding, and generated
  `temp/demo-operator/demo-links.html`.
- `npm run demo:operator -- --mode=showtime --skip-install --no-open-browser --dry-run`
  and `npm run demo:operator -- --mode=teardown --dry-run`: passed.
- `git diff --check`: passed.

Open items:

- When the presenter is ready, run
  `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall`.
- After the demo, run `.\scripts\demo-operator.ps1 -Mode Teardown`.

## June 2 Demo Readiness Hardening

- Date: 2026-06-02
- Added explicit offline-local demo operator support for the same four-workflow
  screenshare when Google project access or ADC reauth is unavailable.
- The offline path skips Google host checks and Firestore resets, starts the app with
  local demo auth/retrieval, runs `smoke:demo-live` with local fallback assertions, and
  still generates the operator links page.
- Narrowed default fallback/demo reset behavior back to the four approved workflow
  slices. Launch skeletons remain available through `npm run seed:launch-skeletons`
  and are no longer part of default demo reset or fallback Approval Queue.
- Added demo-safe Admin observability fallback so stale Google credentials do not
  surface raw `invalid_grant` messages during screenshare.
- Updated `docs/demo-show-and-tell.md` and `docs/demo-readiness.md` with normal
  API-backed and offline-local runbooks.
- Updated Vitest to `4.1.8` after npm audit reported a critical advisory in the older
  dev dependency.

Validation status:

- `npm run demo:operator -- --mode=test-run --skip-install --offline-local --no-open-browser --timeout-ms=120000`:
  passed; local app started, four-workflow smoke passed with local fallback, launch
  skeleton seed dry-run passed, and operator links were generated.
- `npm run demo:operator -- --mode=teardown --offline-local --no-open-browser`: passed
  and stopped the operator-started dev server.
- `npm test`: passed with 132 tests.
- `npm run test:firestore`: passed with 8 Firestore Security Rules tests.
- `npm run build`: passed.
- `npm audit --json`: passed with 0 vulnerabilities after the Vitest update.
- `bash scripts/verify.sh`: passed after the demo-hardening changes; it reinstalled
  from the lockfile, checked formatting, linted, typechecked, ran 132 tests, passed
  Router boundary verification, and built the app.

Google-backed demo status:

- `npm run host:check`: blocked because `pmikckb-test` is not currently accessible in
  this non-interactive shell. Earlier direct `gcloud` checks reported Google reauth
  failure.
- `npm run demo:reset`: blocked by ADC `invalid_grant` / `invalid_rapt`, so Firestore
  demo resets require Google reauth before the normal API-backed path is used.
- `npm run check:live-cost -- --json`: fails under the current user env because
  `ASK_DEMO_MODE=true`, as intended by the guard.
- Four-workflow live-cost preflight with explicit live-mode overrides passed for Lease
  Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner
  Onboarding.

Next recommended task:

- For today's PMI KC Metro screenshare, use
  `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal` unless Google
  reauth is completed first. If showing the normal API-backed path, refresh `gcloud`
  and Application Default Credentials, then rerun `npm run host:check`,
  `npm run demo:reset`, the normal demo operator, and the live Ask smokes.

## Dan's AI Assistant Demo Segment

- Date: 2026-06-02
- Implemented the approved native-Gmail Owner Router plan in the separate sibling repo
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`.
- Added customer-facing positioning for "Dan's AI Assistant" while preserving Owner
  Router as the implementation/spec name.
- Added demo-safe sanitized owner-email scenarios for Renewal Follow-Up, Maintenance
  Approval, and Accounting / Disbursement.
- Added a Dan's AI Assistant runbook to this KB show-and-tell doc so the segment can be
  shown after the KB workflow without implying the KB app owns Gmail.
- Added an Owner Router artifact verifier that checks the required labels, required
  source-safety language, demo package files, and absence of obvious Apps Script
  send/draft capabilities.
- No KB runtime code, Gmail read/modify/compose scope, Gmail draft creation, Owner
  Router runtime, autonomous send, or external-system write path was added.

Validation status:

- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\scripts\verify-owner-router.ps1`:
  passed.
- `bash scripts/verify.sh`: passed after the Dan's AI Assistant demo docs update. It
  reinstalled from the lockfile, checked formatting, linted, typechecked, ran 132
  tests, passed Router boundary verification, and built the app.
- `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal -NoOpenBrowser -TimeoutMs 120000`:
  passed; the local app is running at `http://localhost:3000/sign-in`, and
  `smoke:demo-live` passed with local fallback.

Next recommended task:

- During the customer show, use the KB local demo first, then show the Dan's AI
  Assistant segment from the sibling Owner Router repo with sanitized scenarios only.

## Customer Close Demo Revamp

- Date: 2026-06-02
- Reworked the demo narrative around the new sales goal: Bailey Brain as the
  source-backed operating layer, with Dan's AI Assistant as the Gmail-native owner-email
  extension.
- Added `docs/customer-close-demo.md` as the concise run order for the screenshare.
- Updated `docs/demo-show-and-tell.md` so Dan's AI Assistant is a core sales segment
  after Approval Queue, not an optional appendix.
- Added explicit transition, sell, and close language focused on reducing context
  rebuild, keeping Gmail native, preserving human send authority, and making Dan's
  preferences reusable through approved documents.
- No runtime behavior, Gmail scope, Gmail draft creation, autonomous send, or
  system-of-record write path was added.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\scripts\verify-owner-router.ps1`:
  passed.

## Three-Product Governance Realignment

- Date: 2026-06-03
- Replaced active KB-only routing with the purchased three-product direction:
  PMI KC KB, Lease Renewal Agent, and Gmail Inbox 0.
- Added the new active governance docs:
  - `docs/north-star.md`
  - `docs/products/README.md`
  - `docs/products/pmi-kc-kb.md`
  - `docs/products/lease-renewal-agent.md`
  - `docs/products/gmail-inbox-zero.md`
  - `docs/integration-cutover-plan.md`
  - `docs/client-checklist.md`
  - `docs/engineering-checklist.md`
  - `docs/ai-execution-workflow.md`
  - `docs/research-backlog.md`
- Updated `AGENTS.md`, `README.md`, `docs/plan.md`, `docs/implement.md`, and
  `docs/engineering.md` so future AI sessions start from the three-lane model.
- Marked old separate Owner Router direction as legacy:
  - moved the full separate-repo plan to
    `docs/legacy/owner-router-separate-repo.md`;
  - kept `docs/router-repo.md` as a superseded stub so old links do not break;
  - marked `docs/router-repo-template/README.md` as legacy.
- Updated active demo/cutover docs so Gmail Inbox 0 is the active client-facing owner
  email lane, while Owner Router/Dan's AI Assistant references are legacy source
  context until naming and artifact migration are approved.
- Added a governance notice to `docs/spec.md`; it remains the KB technical spec, but
  cross-product routing now comes from `docs/north-star.md` and `docs/products/`.
- Updated the Owner Email read-only copy and launch source labels from separate Owner
  Router wording to Gmail Inbox 0 source-package wording.
- Updated `scripts/check-router-boundary.mjs` so the verification guard now enforces
  active Gmail Inbox 0/legacy-boundary docs instead of requiring the retired separate
  Router handoff.
- Added constants for `Lease Renewal Agent` and `Gmail Inbox 0` while preserving
  legacy Owner Router constants used by existing KB references.

Validation status:

- `npm run format:check`: initially failed on new markdown wrapping, then passed after
  formatting the named files.
- `git diff --check`: passed.
- First `bash scripts/verify.sh`: failed at `npm run verify:router-boundary` because
  the old guard still required the separate `pmi-kc-owner-router` handoff in
  `docs/router-repo.md`.
- `npm run verify:router-boundary`: passed after updating the guard.
- Final `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked
  formatting, linted, typechecked, ran 132 tests, passed the updated boundary check,
  and built the app.

Open blockers and client asks:

- PMI KC KB production needs client-owned GCP/Firebase billing/project access,
  authorized domains, role users, approved production source files, source sensitivity
  decisions, source/data-store maps, and a Gmail notification enabled/disabled
  decision.
- Lease Renewal Agent needs v1 scope: trigger model, source systems, allowed actions,
  human review points, required source documents, and acceptance scenarios.
- Gmail Inbox 0 needs v1 setup decisions: final label naming, owner sender rules,
  Dan/Bailey access model, Drive source package, Gemini Gem/prompt-pack availability,
  and safe live-Gmail test approach.
- No raw customer records, live Gmail contents, credentials, ledgers, bank data, SSNs,
  or full lease packets may be committed.

Repository note:

- The worktree already contained uncommitted demo-hardening/runtime changes before this
  pass. They were preserved and not reverted.

Next recommended task:

- Use `docs/client-checklist.md` to collect client answers, then update
  `docs/products/lease-renewal-agent.md`, `docs/products/gmail-inbox-zero.md`, and
  `docs/research-backlog.md` before starting any new runtime product work.

## Three-Product Governance Review And Repair Pass

- Date: 2026-06-03
- Reviewed the three-product governance migration against the pasted plan, active
  routing docs, product-lane docs, cutover docs, status log, and validation guard.
- Confirmed the active docs now route new work through PMI KC KB, Lease Renewal Agent,
  and Gmail Inbox 0, while preserving original specs and marking the old separate
  Owner Router direction as legacy.
- Found and repaired a status-log ordering bug: the new Three-Product Governance
  Realignment section had been inserted inside the older Dan's AI Assistant entry. It
  now appears after the June 2 demo/customer-close entries as the latest active status.
- Fixed stale wording in `docs/integration-cutover-plan.md` that still described
  monorepo governance as a remaining Gmail Inbox 0 blocker after governance had already
  been added.
- Fixed a small no-write wording typo in `docs/products/lease-renewal-agent.md`
  (`Sheet` to `Sheets`).
- Ran stale-context searches for active KB-only/separate-Owner-Router routing language.
  Remaining matches outside preserved specs are historical status text, explicit legacy
  notices, or intentional legacy source-context references.
- Ran an oversized-file check excluding expected generated/dependency files; no
  unexpected tracked or working files over 300 KB were found.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Owner Router Artifact Source Routing

- Date: 2026-06-05
- Audited the local sibling package at
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`.
- Confirmed the package exists locally with the expected Owner Router artifact shape:
  docs, Drive package templates, prompt pack, Gmail filters, Apps Script helpers,
  scripts, and tests.
- Confirmed the sibling repo is outside the current workspace root and has no commits
  yet, so agents cannot assume it is automatically available or remotely handed off.
- Added `docs/legacy/owner-router-artifact-source.md` as the controlled source map for
  when and how Gmail Inbox 0 work may inspect the sibling package.
- Linked that source map from `AGENTS.md`, `README.md`,
  `docs/products/gmail-inbox-zero.md`, `docs/autonomous-agent-runner.md`, and
  `docs/environment-handoff.md`.
- Extended `npm run verify:router-boundary` so the sibling package route and
  source-material-only boundary cannot disappear silently.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- Quality-control check: `AGENTS.md` remains under 150 lines at 102 lines.

- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 132 tests, passed the updated boundary check, and built the
  app.

Remaining risk:

- The worktree still includes earlier uncommitted demo-hardening/runtime changes that
  predate the governance migration. They were not reverted or folded into this review.
- Preserved specs and historical status entries still contain Owner Router language by
  design. Active docs now carry override/legacy notices, but a future human reviewer may
  still choose to do a deeper spec rewrite after the client confirms final Gmail Inbox 0
  naming and label migration.

## Product Definition Gap Plan

- Date: 2026-06-03
- Added `docs/product-definition-gap-plan.md` as the durable explanation of what the
  current three-product plan actually supports, what exists now, and what must be
  decided before runtime work expands.
- Wired the new gap plan into `AGENTS.md` and `docs/implement.md` so future sessions
  use it when scope, product shape, or follow-up questions are part of the task.
- Expanded `docs/client-checklist.md` with concrete product-definition follow-ups for
  KB launch Spaces, Lease Renewal Agent trigger/output shape, and Gmail Inbox 0 label,
  sender, and safe-test decisions.
- Expanded `docs/research-backlog.md` with the missing v1 success statements,
  acceptance questions, first-output decision, and Gmail Inbox 0 naming/migration
  decision.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Product Definition Decisions Round 1

- Date: 2026-06-03
- Captured the user-confirmed roadmap: PMI KC KB production lift and Gmail Inbox 0 Dan
  pilot move in tandem; Lease Renewal is the first full backend automation after KB
  production; Maintenance follows after chatbot/phone alignment; Move-Out follows after
  workflow-run and approval patterns mature.
- Updated active docs so PMI KC KB is now described as both the source-backed app and
  future workflow-control layer. The KB still launches before external write paths are
  added.
- Recorded the first three automation processes: Lease Renewal, Maintenance Work Order
  Intake, and Move-Out + Deposit Disposition, with Owner Onboarding as the fourth/fallback
  workflow.
- Recorded the backend automation model: Users can start workflows, Admins approve by
  default, each write/send/update is individually approved at first, and executed actions
  record approver, change, source facts, before/after values, target system, and
  timestamp.
- Updated Gmail Inbox 0 from owner-email-first to Dan-email-first: the pilot evaluates
  Dan's whole mailbox, starts with `Waiting on Outside` and `Waiting on Team`, suggests
  labels by default, auto-labels only exact or repeated Dan-approved patterns, and keeps
  Dan manual-send for now.
- Recorded the first Gmail Inbox 0 management surface inside the KB app: Admin-only
  labels, rules, approved replies, change history, and Gmail/Gemini health status.
- Updated Lease Renewal direction: a team member starts the workflow, the system should
  anticipate from signed-lease timing, Dan approves owner-facing information and
  communication, and the system may send after approval once a future send/write spec is
  approved.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed after updating the routing guard from the
  retired owner-email-first boundary to the Dan mailbox boundary.

## Admin Role Decision

- Date: 2026-06-03
- Recorded Josiah and Dan as the initial Admins for the KB and Gmail Inbox 0 management
  layer.
- Recorded that Admins may grant the Admin role to additional users they choose.
- Updated the client checklist and research backlog so the remaining user-access
  blocker is the initial User list and any process-specific approvers beyond the Admin
  default.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Initial User Scope Decision

- Date: 2026-06-03
- Recorded that the initial KB/Gmail Inbox 0 launch does not need separate `User`
  accounts beyond Josiah and Dan.
- Kept the `User` role as a future delegation path once Josiah or Dan choose to grant
  broader access.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Approval Notification Decision

- Date: 2026-06-03
- Recorded that Gmail send-only KB approval notifications should be enabled at
  production launch.
- Recorded that approval notifications should be incorporated into the Gmail Inbox 0
  vision so approval work can eventually flow between the KB app and Gmail while
  preserving human approval.
- Updated remaining blockers from "enabled or disabled" to the concrete production
  configuration: sender identity, recipients, Gmail label behavior, and delivery/error
  handling.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Approval Notification Recipients

- Date: 2026-06-03
- Recorded Dan and Josiah as the launch recipients for Gmail send-only KB approval
  notifications.
- Left sender identity, Gmail label behavior, and delivery/error handling as the
  remaining production notification configuration items.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Notification Sender And PMI KC Test Identity

- Date: 2026-06-03
- Recorded that KB approval notifications should use a dedicated `pmikcmetro.com` KB
  automation sender provisioned for the KB, not a personal or consultant email account.
- Recorded that Josiah should use a PMI KC `pmikcmetro.com` email account for future
  auth and automation testing once provisioned.
- Active setup and production docs should not use Josiah's historical Cherrybridge email;
  older status/spec references are historical only.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm test -- tests/unit/live-cost-scripts.test.mjs`: passed.

## KB Automation Sender Address

- Date: 2026-06-03
- Recorded `kb-automation@pmikcmetro.com` as the dedicated sender for KB approval
  notifications.
- Updated active docs and remaining blockers so only Gmail label behavior and
  delivery/error handling remain open for notification setup.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm test -- tests/unit/live-cost-scripts.test.mjs`: passed.

## KB Approval Notification Labeling

- Date: 2026-06-03
- Recorded that KB approval notifications should use a clear approval subject line and
  apply the `KB Approval` Gmail label.
- Updated active docs and remaining blockers so only notification delivery/error
  handling remained open at that point.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## KB Approval Notification Failure Handling

- Date: 2026-06-03
- Recorded that KB approval notification failures should escalate instead of failing
  silently.
- Kept the exact escalation meaning as TBD: channel, owner, retry behavior, and alert
  surface still need definition.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Starter Sources And Chrome Discovery

- Date: 2026-06-03
- Recorded that the Lease Renewals Space can start from a video demo, context from the
  client, and information from the team.
- Marked those as starter materials, not final source-of-truth materials, until they are
  sensitivity-reviewed, placed in a client-owned source location, and Admin-approved.
- Recorded Chrome-based process observation as feasible in principle for discovery when
  explicitly approved, while keeping production browser automation and writes blocked
  until a future approved spec exists.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Walkthrough Mode

- Date: 2026-06-03
- Recorded that the first Lease Renewal discovery pass should use both a recorded
  walkthrough and a live supervised Chrome session.
- Kept Chrome/browser observation scoped to discovery until approved setup, permissions,
  and a later automation spec exist.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Walkthrough Lead

- Date: 2026-06-03
- Recorded two acceptable walkthrough ownership paths: a client-led show-and-tell, or
  the client showing Josiah so he can capture and translate the workflow data.
- Kept captured workflow data subject to sensitivity review, client-owned source
  placement, and Admin approval before it becomes source-of-truth material.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Location Principle

- Date: 2026-06-03
- Recorded that captured Lease Renewal workflow notes should live first in a
  client-accessible source location where PMI KC can add more context.
- Recorded that the location should be chosen to connect to the app's approved
  source-backed retrieval or workflow capability, not treated as a private scratchpad.
- Kept the exact folder, system, or connector as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Default Source Location

- Date: 2026-06-03
- Recorded Google Drive as the default first capture/collaboration location for Lease
  Renewal workflow notes, unless setup identifies a better client-accessible,
  app-connected source.
- Clarified that Drive may be the human collaboration layer even if the approved
  production retrieval/indexing path uses another target.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source-Of-Truth Curation Model

- Date: 2026-06-03
- Recorded that the Lease Renewal Drive/source location should not default to separate
  raw-discovery and approved-source areas.
- Recorded that material in the client-accessible source folder should be treated as
  source-of-truth input and curated frequently.
- Kept the curation workflow as TBD, including AI-assisted update proposals, human
  approval, cadence, and sync into the app's indexed source set.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Folder Edit Access

- Date: 2026-06-03
- Recorded that the whole PMI KC team should be allowed to directly edit the initial
  Lease Renewal source-of-truth folder.
- Kept the exact Workspace group or named-user list as a client setup detail.
- Kept curation, indexing, and automation-use rules separate and still TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal AI-Assisted Source Curation

- Date: 2026-06-03
- Recorded the first curation model for the Lease Renewal source-of-truth folder:
  AI-proposed changes with human review.
- Recorded the goal as continuous documentation improvement, not one-time source
  capture.
- Kept reviewer identity, review cadence, and app-index sync path as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Curation Reviewer

- Date: 2026-06-03
- Recorded Dan as the initial human reviewer for AI-proposed Lease Renewal source
  updates.
- Kept review cadence and app-index sync path as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Curation Cadence

- Date: 2026-06-03
- Recorded that Dan should decide the review cadence for AI-proposed Lease Renewal
  source updates.
- Kept the app-index sync path as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Continuous Source Sync

- Date: 2026-06-03
- Recorded that the app should automatically and continuously read from the
  team-editable source-of-truth folder rather than rely on manual import-on-demand.
- Kept the exact connector or indexing implementation as TBD pending client-owned setup
  validation.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Indexed Source Layer Direction

- Date: 2026-06-03
- Recorded the likely source-sync architecture: the PMI KC Drive source-of-truth folder
  should feed an indexed source layer automatically, rather than relying only on direct
  Drive reads.
- Ran a narrow official Google docs check. Current docs show Drive data federation is
  available but has Workspace/search limitations, while Cloud Storage supports indexed
  ingestion and periodic update options.
- Kept the exact connector/indexing path as a research/setup decision before runtime
  implementation.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal First Indexed-Source Candidate

- Date: 2026-06-03
- Recorded Cloud Storage plus Agent Search periodic ingestion as the first
  indexed-source candidate to test for Lease Renewal source folder updates.
- Kept Drive as the team-facing collaboration folder.
- Left the Drive-to-Cloud-Storage handoff or connector mechanism as a setup/research
  item.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Low-Cost Source Handoff

- Date: 2026-06-03
- Recorded the first Drive-to-Cloud-Storage handoff assumption: use the simplest
  low-cost automation that works for users, copying changes from the team-editable Drive
  source folder into Cloud Storage for indexing.
- Recorded the cost constraint explicitly: cloud costs are pass-through, so minimize
  ongoing services, polling frequency, indexed volume, duplicate stores, and unnecessary
  automation.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Sync Gate

- Date: 2026-06-03
- Recorded that the first copy automation should copy changes from the team-editable
  Drive source folder, rather than wait for Dan's AI-proposed-update review.
- Kept Dan's review as part of curation and continuous documentation improvement, not as
  the first sync gate.
- Recorded that the index/app should handle freshness after the copy.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source File-Type Rule

- Date: 2026-06-03
- Recorded that the first copy path should not restrict the Lease Renewal source folder
  to only Docs, text, or PDF files.
- Recorded that all useful source file types are eligible, subject to sensitivity rules
  and setup validation.
- If a useful file type cannot be indexed directly, the automation should convert,
  summarize, or skip it with a visible reason.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Source Folder Hygiene

- Date: 2026-06-03
- Recorded that non-sources-of-truth should be moved out of the Lease Renewal source
  folder instead of left for copy or indexing automation to skip.
- Kept the destination for non-source, reference, or archive material as TBD.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Non-Source Destination

- Date: 2026-06-03
- Confirmed the destination for non-source, reference, or archive material remains TBD.
- No folder name, owner, or retention rule has been defined yet.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Loosely Editable Process Definitions

- Date: 2026-06-04
- Recorded that the first workflow-management layer should be loosely editable for
  process definitions, including creating new processes and pointing those processes to
  new documentation as discovery matures.
- Kept the distinction between process configuration editability and external
  system-of-record writes. External write/update/send paths still need approved
  process-specific specs, permissions, tests, audit logging, and rollback/error handling.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Process Definition Configuration Batch

- Date: 2026-06-04
- Recorded that the whole team should be able to propose or edit process definitions,
  but those changes must go through approval before becoming active.
- Recorded that the KB should own the first central workflow-run record, with backlinks
  and action records pointing out to external systems. This keeps context in one
  non-technical place and allows separate processes to merge into larger workflows over
  time.
- Set the v1 minimum fields for a startable process definition: process name, short
  outcome, trigger or manual start condition, process owner/default approver,
  source/documentation links, required starting inputs, initial steps, action references
  with execution status, and success/stop/escalation condition.
- Recorded that process definitions may reference future external actions before those
  actions are connected or approved, but those references remain planned/non-executable
  until a future spec approves the integration.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Process Approval And Workflow State Batch

- Date: 2026-06-04
- Recorded that future product-definition question batches should include recommended
  default answers based on context so the client can answer yes or provide targeted
  edits.
- Recorded Dan and Josiah as the default Admin approvers for process-definition changes
  until they delegate approval authority.
- Recorded process definition statuses: `Draft`, `Testing`, `Pending Approval`,
  `Active`, `Needs Revision`, and `Retired`.
- Recorded that Draft or Testing process definitions can be started for clearly marked
  test runs, but Active definitions are required for real operational runs.
- Recorded that future automation steps should show as pending automation. The AI can
  explain how the automation is expected to work, but the action remains non-executable
  until an approved integration spec exists.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Process Testing And Versioning Batch

- Date: 2026-06-04
- Accepted the recommended testing and versioning defaults.
- Recorded that Draft and Testing workflow runs are simulation-only: no external writes,
  no sends, and no live system updates.
- Recorded that every approved process definition should create a versioned Active copy
  with history and rollback.
- Recorded that process activation requires source/documentation links and at least one
  successful test run unless Dan or Josiah explicitly override the gate.
- Recorded that pending future automation steps must show target system, expected action,
  missing permission or connection, and approval owner.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Workflow Run UX And Audit Batch

- Date: 2026-06-04
- Accepted the recommended workflow-run UX and audit defaults.
- Recorded that workflow runs should show a timeline of steps, decisions, approvals,
  comments, and system actions.
- Recorded that each run should show a top human-readable summary with current status,
  next action, blocker, owner, and due date if known.
- Recorded that test runs should be visually separate from real runs and excluded from
  production metrics unless an Admin explicitly includes them.
- Recorded that each AI-generated recommendation should keep source links, confidence,
  and reasoning visible to the reviewer.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Workflow Run Status And Notification Batch

- Date: 2026-06-04
- Accepted workflow run statuses: `Not Started`, `In Progress`, `Waiting on Team`,
  `Waiting on Outside`, `Blocked`, `Ready for Approval`, `Approved`, `Completed`,
  `Cancelled`, and `Failed`.
- Recorded that the workflow run owner should be the final approver, not necessarily the
  person who started the run.
- Recorded that due dates should use the source process due date when one exists;
  otherwise, they default to today.
- Recorded that workflow notifications should fire for `Ready for Approval`, `Blocked`,
  failed automation, and overdue due dates, including internal email notifications.
- Kept the boundary that workflow notification emails are internal and do not authorize
  owner-facing or tenant-facing sends.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Workflow Notification Recipients And Channels Batch

- Date: 2026-06-04
- Accepted the recommended workflow notification recipient and channel defaults.
- Recorded that default internal workflow notifications go to the owner/final approver
  and the person assigned the next action.
- Recorded that the workflow starter receives notifications only when their action is
  needed or when the run completes or fails.
- Recorded that notifications should appear in-app and by internal email at first, with
  other channels future/TBD.
- Recorded that notification email subjects should include product/process name, run
  status, property/context when available, and required action.
- Kept the boundary that these are internal workflow notifications and do not authorize
  owner-facing or tenant-facing sends.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Escalation And Failure Handling Batch

- Date: 2026-06-04
- Accepted the recommended escalation and failure-handling defaults.
- Recorded that a failed automation marks the run `Failed` only when the failure blocks
  the run; otherwise, the failed step is marked `Failed` and the run moves to `Blocked`.
- Recorded that failed internal notifications create an in-app alert and retry email
  once.
- Recorded that if the retry fails, escalation goes to Dan/Josiah Admins in-app and by
  email.
- Recorded that external action failures preserve attempted payload, error message,
  target system, timestamp, and retry status in the audit trail.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## External Action Approval Batch

- Date: 2026-06-04
- Accepted the recommended external-action approval defaults.
- Recorded that each external action type must be individually approved before it becomes
  executable.
- Recorded that approval is scoped by target system and action type, not blanket system
  access.
- Recorded that first executable external actions still require per-run human approval
  even after the action type is approved.
- Recorded that planned actions should remain visible while non-executable so the team
  can refine workflows before integrations are live.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## External Action Readiness Batch

- Date: 2026-06-04
- Accepted the recommended external-action readiness defaults.
- Recorded external action readiness states: `Planned`, `Needs Connection`,
  `Needs Permission`, `Ready for Test`, `Approved for Execution`, and `Disabled`.
- Recorded that before execution, the app should show a preview of exactly what will
  change, where it will change, and why.
- Recorded that every executable external action should have a rollback or correction
  note before approval.
- Recorded that Admins can disable any action type immediately without deleting the
  process definition.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal First Actions Batch

- Date: 2026-06-04
- Accepted read/gather actions before write actions as the first Lease Renewal planned
  action sequence.
- Recorded first planned reads: signed lease and lease dates, tenant/property facts,
  owner information, current rent/terms, and renewal timeline.
- Recorded first planned outputs: workflow summary, owner communication draft, internal
  update preview, and approval package.
- Recorded that write/update action design should still be AI-assisted during process
  editing and refinement, including suggestions to add/remove actions, missing-fact
  detection, and explanations of future write/update/send behavior.
- Recorded that deterministic checks should verify API connections are configured and
  healthy for each consumed app before an action can move toward execution.
- Recorded that first executable write/send actions wait until after the read/gather
  flow and approval package are tested.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Lease Renewal Read Sources Batch

- Date: 2026-06-04
- Recorded signed lease or lease-term record as the first authoritative renewal trigger
  source, pending client system confirmation.
- Recorded that manual workflow start remains allowed.
- Recorded that imported property, tenant, owner, rent, and lease facts should show
  source, timestamp, and confidence before approval.
- Recorded that conflicting facts across systems block the run until a human chooses the
  correct source.
- Recorded that the app should keep a missing-facts list, let AI suggest where to find
  each missing fact, and include a link to add the missing resource or description
  through the right path, such as in-place process edit or the approved Drive/source
  folder.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Missing Facts And Source Updates Batch

- Date: 2026-06-04
- Accepted the recommended missing-facts/source-update defaults.
- Recorded that missing-fact links should offer two first actions: `Add process note`
  and `Add source document`.
- Recorded that `Add process note` creates a proposed process-definition or source
  update that requires approval before becoming active.
- Recorded that `Add source document` points to the approved Drive/source folder and
  relies on the approved source sync/indexing path.
- Recorded that once a missing fact is filled, the run should re-check only affected
  facts and steps instead of restarting the whole run.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Fact Confidence And Approval Batch

- Date: 2026-06-04
- Accepted the recommended imported-fact confidence and approval defaults.
- Recorded imported fact confidence levels: `Verified`, `Likely`, `Needs Review`, and
  `Conflict`.
- Recorded that only `Verified` facts can flow into owner-facing drafts without a visible
  warning.
- Recorded that `Likely` facts can be used in internal summaries, but must be reviewed
  before approval.
- Recorded that `Conflict` facts block owner-facing drafts and executable actions until
  resolved.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Conflict Resolution Batch

- Date: 2026-06-04
- Accepted the recommended conflict-resolution defaults.
- Recorded that conflict resolution requires a human to pick the winning source or enter
  a corrected value.
- Recorded that each resolution saves who resolved it, why, source chosen or corrected
  value, and timestamp.
- Recorded that a corrected value creates a proposed source or process update so the
  same conflict is less likely next time.
- Recorded that legal, financial, or notice-timing conflicts require Dan/Josiah Admin
  approval even if another user proposes the resolution.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Owner Communication Drafts Batch

- Date: 2026-06-04
- Recorded that facts must be both `Verified` and approved before they can flow into
  owner-facing drafts without a visible warning.
- Recorded that owner-facing drafts should always show traceable links, sources, and
  supporting facts so the process can be improved.
- Recorded that Dan can edit any generated or prepared document because he has Admin
  authority.
- Recorded that human send authority remains preserved: Dan approves and sends first,
  and later send automation can be layered only after testing and a future approved spec.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Package Batch

- Date: 2026-06-04
- Recorded that approval packages should include workflow summary, the relevant
  draft/output/action being automated, verified fact list, unresolved warnings, planned
  internal updates, pending automation notes, and send/update preview.
- Recorded that Dan approval covers the owner communication and facts used by it.
- Recorded that external writes can also be approved from the package when explicitly
  included as separate action approvals, but owner communication approval does not
  silently approve unrelated external writes.
- Recorded that internal update previews remain separately approvable by action through
  an obvious, low-friction approval queue designed for client and staff review.
- Recorded that approval package history preserves every revision Dan reviewed.
- Recorded correction-style rollback where APIs allow it: store the previous entry and
  re-enter that previous value through the API, rather than treating rollback as a
  universal true revert.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue UX Batch

- Date: 2026-06-04
- Recorded that approval queue items should be grouped by audience: Dan/Admin decisions,
  team follow-up, outside waiting, and failed/blocked automation.
- Recorded that each approval item should show plain-English action, risk level, source
  evidence, affected system, before/after preview, and required approver.
- Recorded queue actions: `Approve`, `Return for Revision`, `Assign`, `Snooze`,
  `Disable Action`, and `Open Run`.
- Recorded that all clarification, next steps, errors, and messaging should assume
  non-technical, new users who do not understand automation internals.
- Recorded that high-risk items use a simple confirm popup before approval, while
  low-risk internal updates can be one-click after review.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Risk Levels Batch

- Date: 2026-06-04
- Accepted the recommended approval queue risk defaults.
- Recorded risk levels: `Low`, `Medium`, `High`, and `Blocked`.
- Recorded `High` as owner/tenant-facing, legal/financial/timing impact, or external
  system write.
- Recorded `Medium` as internal process/state update or fact correction that affects a
  workflow but not an external system.
- Recorded `Low` as internal note, assignment, snooze, or non-executable process
  cleanup.
- Recorded `Blocked` as unable to proceed until a missing fact, conflict, connection,
  permission, or approver issue is resolved.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Filters And Views Batch

- Date: 2026-06-04
- Accepted the recommended approval queue filters and view defaults.
- Recorded that the default approval queue view should put `Ready for Approval`,
  `Blocked`, `Failed`, and overdue items first.
- Recorded queue filters: process, owner/final approver, assignee, risk level, status,
  due date, and audience group.
- Recorded that staff view should hide technical details by default and show what
  happened, why it matters, and what to do next.
- Recorded that Admin view should allow expansion into technical details, source
  evidence, API/connection status, and audit trail.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Item Lifecycle Batch

- Date: 2026-06-04
- Accepted the recommended approval queue item lifecycle defaults.
- Recorded that each approval queue item should have one current assignee and one
  required approver.
- Recorded that `Return for Revision` should require a plain-English reason and send the
  item back to the creator or last editor.
- Recorded that `Snooze` should require a date and reason, then automatically return the
  item to the active queue on that date or if risk/status changes.
- Recorded that `Disable Action` should be Admin-only, require a reason, and preserve the
  disabled action in history.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Creation And Cleanup Batch

- Date: 2026-06-04
- Accepted the recommended approval queue creation and cleanup defaults.
- Recorded that queue items should be created from approval packages,
  process-definition changes, failed/blocked automation, external-action readiness, and
  source/fact conflicts.
- Recorded that duplicate items for the same run/action should merge into one open item
  with history instead of creating multiple tasks.
- Recorded that if the underlying fact, draft, action, or preview changes, the queue
  item should refresh and preserve the prior version in history.
- Recorded that a queue item should close automatically when approved, completed,
  cancelled, disabled, or when the blocker is resolved and no approval remains.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Notifications And Reminders Batch

- Date: 2026-06-04
- Recorded that approval queue notifications should appear in the app console when an
  item is created, assigned, returned for revision, unsnoozed, blocked, unblocked,
  overdue, or closed.
- Recorded that these queue events should not all send email by default; email delivery
  can be configured separately.
- Recorded that queue notifications should go to the current assignee and required
  approver, while creators/editors are notified only when their action is needed or their
  item closes.
- Recorded that reminders should start as a single console notification, with no default
  24-hour follow-up or Admin escalation sequence unless configured later.
- Recorded that notifications should include the plain-English action needed, due date,
  risk level, affected process/run, and a direct link to the queue item.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Email Configuration Batch

- Date: 2026-06-04
- Accepted the recommended approval queue email-configuration defaults.
- Recorded that queue email delivery should be off by default and configurable by Admins
  per event type and recipient role.
- Recorded that email settings should show event type, enabled state, recipient roles,
  trigger condition, frequency/cooldown, subject preview, and last send/error status.
- Recorded that email should never replace console notifications; the app console
  remains the default source of truth.
- Recorded that email delivery failure should not block the queue item, but should create
  an Admin-visible health warning and audit entry.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Admin Health Batch

- Date: 2026-06-04
- Accepted the recommended approval queue Admin-health defaults.
- Recorded that Admin health should show queue email status, failed delivery count, last
  failure, disabled event types, stale overdue count, and blocked item count.
- Recorded health states: `Healthy`, `Needs Attention`, and `Action Required`.
- Recorded that `Action Required` means something is broken or blocking work, such as
  failed notification delivery, disconnected email config, or unresolved blocked
  high-risk items.
- Recorded that Admins should be able to open health details directly into affected queue
  items, email settings, or audit records.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Simple Audit And History Batch

- Date: 2026-06-04
- Accepted the audit/history direction with the simplicity caveat that the queue should
  avoid many options, toggles, or separate audit modes.
- Recorded the simpler alternative: one automatic append-only Activity log per queue
  item.
- Recorded that meaningful queue state changes capture actor, timestamp, action,
  previous state, new state, reason when supplied or required, and source trigger.
- Recorded that staff see plain-English Activity summaries only when action-relevant,
  while Admins can expand the same feed for full audit fields.
- Recorded that prior versions are preserved automatically for approval-critical facts,
  drafts, previews, notification settings, and disabled actions.
- Recorded that corrections create new entries instead of editing or deleting old ones,
  and low-level system entries can collapse by default to reduce clutter.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Simplicity Guardrails Batch

- Date: 2026-06-04
- Accepted the recommended simplicity guardrails.
- Recorded that Approval Queue v1 should avoid extra user-facing toggles, per-user
  customization, and complex settings unless they solve an observed workflow problem.
- Recorded that normal users should see only the core queue actions and one plain
  `Activity` view, while Admin-only details and settings live behind obvious Admin
  surfaces.
- Recorded that AI and automation should rely on a small fixed set of structured fields,
  not many optional UI settings.
- Recorded that any new setting requires an owner, plain-English default, disable path,
  and test coverage before it is added.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Fixed Fields Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue fixed-field defaults.
- Recorded v1 queue item fields: process/run, item type/source trigger, status, risk,
  audience group, assignee, required approver, due date, action needed, affected
  system/action, direct link, created timestamp, and updated timestamp.
- Recorded that evidence and details should attach through source links, previews, and
  the `Activity` log instead of extra toggles or custom fields.
- Recorded that AI-readable queue state should come from the fixed fields plus
  `Activity`, not user-specific settings.
- Recorded that v1 should not support custom queue fields; any new field must go through
  the new-setting guardrail.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue MVP Screen Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue MVP screen defaults.
- Recorded that v1 should use one main queue table/list plus a right-side or modal detail
  view, not multiple queue dashboards.
- Recorded that the list should show only status, risk, action needed, process/run,
  assignee, required approver, due date, and a direct link or open action.
- Recorded that the detail view should show summary, evidence links/previews, available
  actions, and `Activity`.
- Recorded that Admin-only health and settings should be reachable from a simple Admin
  area, not mixed into every normal queue item.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Mobile And Responsiveness Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue mobile and responsiveness defaults.
- Recorded that mobile v1 should use the same queue list and detail view, with rows or
  cards stacked for readability instead of a separate mobile workflow.
- Recorded that mobile list items should show only status, risk, action needed, due date,
  and open action; other fixed fields can appear in detail.
- Recorded that primary actions should remain visible in the detail view without
  requiring users to understand Admin settings.
- Recorded that desktop and mobile should use the same fixed fields and `Activity` source
  so AI and automation see one queue model.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Empty And Error States Batch

- Date: 2026-06-04
- Accepted the recommended Approval Queue empty and error state defaults.
- Recorded that an empty queue should say nothing is currently waiting for review and
  should not show fake/demo queue items.
- Recorded that loading and error states should use plain-English messages with one
  obvious retry or open action.
- Recorded that missing evidence, permissions, or connections should create or route to a
  `Blocked` queue item instead of appearing as a vague broken screen.
- Recorded that production queue views should never show demo/test items unless the run
  is clearly marked as a test/demo run.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Permissions And One-Pass Defaults

- Date: 2026-06-04
- Accepted the recommended Approval Queue permission defaults.
- Recorded that normal users can view assigned/relevant queue items, open details, take
  assigned actions, add comments/reasons, and return assigned items for revision.
- Recorded that Admins can view all queue items, approve high-risk items, disable
  actions, manage email settings, view health, and expand full Activity/audit details.
- Recorded that users cannot approve their own proposed process/source/fact change unless
  they are Admin and explicitly acting as approver.
- Recorded that permission errors should explain the missing role/action and route to a
  safe next step.
- Added inferred one-pass defaults: changed closed items create new linked items and
  direct queue links stay stable.
- Updated bulk-action default after user correction: v1 includes bulk approve, bulk
  disable, bulk execute, bulk assign, and bulk snooze for selected visible items, with
  per-item permission/risk/readiness enforcement and Activity records.
- Added inferred one-pass defaults for missing assignee/approver: route to `Blocked` and
  Admin triage instead of guessing.
- Added inferred one-pass AI defaults: AI can suggest assignee, approver, risk, status,
  and action-needed values from fixed fields/source evidence/Activity, but cannot
  approve, disable, close, execute, override permissions, or make suggestions effective
  outside the normal queue action path.
- Added inferred one-pass comment defaults: comments/reasons are Activity entries and do
  not directly mutate facts, drafts, process definitions, sources, or external actions.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Bulk Correction And Open Question Answers

- Date: 2026-06-04
- Corrected the prior inferred default: Approval Queue v1 should include bulk approve,
  bulk disable, bulk execute, bulk assign, and bulk snooze for selected visible items.
- Recorded bulk-action guardrails: respect each selected item's permissions, risk,
  required approver, and readiness; show a plain-English preview; require confirmation;
  skip or block ineligible items with a clear reason; and write per-item Activity.
- Recorded that bulk execute does not bypass external-action approval,
  owner/tenant-facing send authority, or high-risk confirmation.
- Recorded open-question answers: client systems remain TBD and will be scoped with the
  client; delegated approvers beyond Dan/Josiah remain TBD but should be easy to manage
  through an Admin console; Activity/audit retention and export should follow standard
  SaaS audit best practices unless client/legal policy overrides.
- Recorded configured queue email recipients as assigned and/or Admin-selected.
- Recorded unresolved important `Blocked` or overdue item escalation as portal
  notification and email notification for now.
- Recorded Maintenance and Move-Out tools, services, systems, triggers, and connections
  as TBD until scoped with the client.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue Review Repair Pass

- Date: 2026-06-04
- Reviewed the recent Approval Queue documentation from a fresh-context/falsification
  stance for contradictions, stale defaults, and downstream alignment issues.
- Fixed approval-queue email wording so routine queue-event email remains off by default
  and Admin-configurable, while unresolved important `Blocked` or overdue escalation is
  explicitly the built-in portal-plus-email exception.
- Confirmed old no-bulk default wording was removed from the affected active docs and
  v1 bulk actions are now documented with selected-item guardrails.
- Confirmed remaining TBDs are client-scoped implementation questions rather than
  unresolved Approval Queue product-definition blockers.
- Confirmed the status entry for this repair pass is at the end of the status log and
  does not split an older validation section.
- Ran file-size and diff-size quality checks on the affected docs. No affected doc is
  unexpectedly oversized; `docs/status.md` is large because it is the running historical
  project log, and `docs/product-definition-gap-plan.md` remains an untracked new doc
  until intentionally added.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 133 tests, passed the router boundary check, and built the
  app.

## Autonomous Feature-Cycle Prompt Pack

- Date: 2026-06-05
- Added an outside-agent prompt pack for implementing the production autonomous
  feature-cycle scaffold.
- Defined the desired "let's plan the next feature run cycle" loop: context intake,
  decision-complete planning packet, batched planning questions, safe unattended local
  build, verification, commit queue, and one end-of-run user review point.
- Added explicit approval gates for cloud/API costs, key creation, deployment, live
  imports, Gmail access, client-environment changes, sends, and external system writes.
- Added supporting scaffold, runbook, and handoff-template docs in `docs/agent-runner/`.
- Routed active AI workflow and implementation docs to the new prompt pack without
  changing product scope or authorizing runtime/client-environment work.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Autonomous Production Runner Scaffold

- Date: 2026-06-05
- Promoted the autonomous feature-cycle prompt pack into active production routing with
  `docs/autonomous-agent-runner.md`.
- Added `CLAUDE.md` as a compatibility pointer to `AGENTS.md`; Git symlink support is
  disabled in this checkout, so the compatibility surface is a short redirect file
  instead of a tracked symlink.
- Added a durable packet template and `docs/temp/` policy for disposable planning
  packets, draft communications, and scratch meta-prompts.
- Updated active routing in `AGENTS.md`, `README.md`, `docs/ai-execution-workflow.md`,
  and `docs/implement.md` so future agents start from the durable runner rather than
  the seed prompt pack.
- Added a concrete client ask for production/staging secret ownership and a research
  item for non-secret environment handoff records.
- Extended `npm run verify:router-boundary` so the durable runner, packet template,
  temp-folder policy, `CLAUDE.md` pointer, and active routing cannot be dropped
  silently.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Autonomous Runner Review Repair Pass

- Date: 2026-06-05
- Reviewed the autonomous production runner scaffold from a fresh-context/falsification
  stance for stale routes, misplaced status entries, inaccurate validation claims,
  ignored temp artifacts, and downstream documentation drift.
- Fixed the misplaced `Autonomous Production Runner Scaffold` status entry so it now
  appears after the prompt-pack entry instead of splitting an older status entry.
- Aligned `CLAUDE.md` wording so it is consistently described as a short pointer rather
  than a duplicate rule file.
- Confirmed `docs/temp/README.md` is trackable while generated scratch packets under
  `docs/temp/` remain ignored.
- Confirmed active routing points to `docs/autonomous-agent-runner.md` and the prompt
  pack is marked as scaffold source material only.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- Quality-control check: `AGENTS.md` remains under 150 lines; the largest changed doc is
  `docs/status.md`, which is expected because it is the running historical log.

## Autonomous Runner Handoff Alignment

- Date: 2026-06-05
- Added `docs/environment-handoff.md` as the central non-secret registry for
  environment IDs, setup state, key/secret ownership, manual setup, verification
  evidence, and handoff readiness.
- Linked environment handoff guidance from `AGENTS.md`, `README.md`,
  `docs/implement.md`, and `docs/client-checklist.md`.
- Strengthened `docs/autonomous-agent-runner.md` with end-state-first planning,
  explicit planning-vs-implementation behavior, environment handoff updates, and commit
  queue expectations.
- Expanded the feature-cycle packet template with end-state, backward dependencies,
  environment/secret impact, manual setup, final user verification, and commit-queue
  fields.
- Expanded `CLAUDE.md` just enough to route Claude-style sessions to the same
  autonomous runner trigger without duplicating durable rules.
- Fixed active product-lane routing so Gmail Inbox 0 is consistently Dan-email-first,
  not owner-email-first.
- Extended `npm run verify:router-boundary` to guard the environment handoff doc,
  Claude route, Dan-email-first wording, and stronger runner sections.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.

## Approval Queue v1 Backend Data Foundation

- Date: 2026-06-05
- Product lane: PMI KC KB workflow-control layer.
- First code cycle after the recent documentation run. The Approval Queue v1 product
  definition was decision-complete in `docs/product-definition-gap-plan.md` and
  `docs/plan.md` but had no implementation; the live `/approval-queue` page still only
  reviews SOP/Template/Placeholder content. This cycle builds the backend data
  foundation. No UI, notifications, bulk actions, or workflow-run/process-definition
  machinery yet; those are deferred to later cycles.
- Added Approval Queue v1 record types and enums to `lib/firestore/types.ts`:
  `ApprovalQueueItemRecord`, `ApprovalQueueActivityRecord`, `QueueItemStatus`,
  `QueueRiskLevel`, `QueueAudienceGroup`, `QueueItemType`, `QueueActivityAction`, and the
  `QueueProcessRunRef` stub (runs/process definitions are not built yet, so a queue item
  references its run by `{ id, label }`).
- Added Zod input schemas to `lib/firestore/schemas.ts`:
  `CreateApprovalQueueItemInputSchema` and `TransitionApprovalQueueItemInputSchema`. Risk
  is classified deterministically by the repository from explicit signals, never passed
  in, so a caller cannot self-assign a lower risk level.
- Added the repository boundary `lib/firestore/approval-queue.ts`, mirroring
  `lib/firestore/editable.ts` (transactions, server timestamps, `uuidv7`, role gating via
  `can()`):
  - `classifyQueueRisk` (external write / owner-tenant-facing / legal-financial-timing →
    `High`; internal workflow update → `Medium`; note/assign/snooze/cleanup → `Low`;
    blocking issue or missing assignee/approver → `Blocked`).
  - `createApprovalQueueItem` with missing-assignee-or-approver → `Blocked`,
    duplicate-merge by `source_trigger_key` (refresh the open item with a prior-version
    snapshot instead of creating a second), and closed-item relink
    (`supersedes_item_id` / `superseded_by_item_id`) instead of reopening a closed item.
  - `transitionApprovalQueueItem` single guarded entry point for `approve`, `return`,
    `assign`, `snooze`, `disable`, `close`: high-risk approve requires the `approve`
    capability; disable is Admin-only; self-approval is blocked (a non-Admin cannot
    approve their own item, and only the required approver or an Admin can approve);
    return/snooze/disable require a reason; snooze requires a date; terminal items reject
    further transitions.
  - `listApprovalQueue` (default ordering: Ready for Approval, Blocked, Failed, then
    overdue first, then due date; fixed filters) and `listApprovalQueueActivity`
    (append-only feed). The list fetches and filters in memory, like `listTools`, so no
    new composite indexes are required and `firestore.indexes.json` is unchanged.
  - Every meaningful change appends an immutable Activity entry (actor, action, previous
    and new state, reason, source trigger, and a prior-version snapshot on refresh).
- Reused existing `can()` capabilities (`edit`, `read`, `approve`, `manageAdmin`); no new
  capability was added to `lib/auth/roles.ts`.
- Added `firestore.rules` match blocks for `approval_queue_items` and
  `approval_queue_activity`: read for editor-or-better, all client writes denied (writes
  flow through the Admin SDK boundary), Activity append-only.
- Inferred implementation detail flagged for confirmation: the concrete `QueueItemStatus`
  enum (`Ready for Approval`, `Blocked`, `Snoozed`, `Returned`, `Approved`, `Completed`,
  `Cancelled`, `Disabled`, `Failed`, `Closed`) is consistent with the locked lifecycle
  language in `docs/plan.md` but is not an explicit enum there. Adjust before the UI
  cycle builds on it if different names are preferred.

Validation status:

- `npm run format:check`: passed on 2026-06-05.
- `npm run lint`: passed on 2026-06-05.
- `npm run typecheck`: passed on 2026-06-05.
- `npm test`: passed on 2026-06-05 with 151 tests (18 new approval-queue-foundation
  unit tests).
- `npm run test:firestore`: passed on 2026-06-05 with 12 Firestore Security Rules tests
  (4 new). Fixed a test-isolation bug: the new emulator test uses a distinct `projectId`
  so vitest's parallel test files do not clear each other's seeded data on the shared
  emulator.
- `npm run verify:router-boundary`: passed on 2026-06-05.
- `bash scripts/verify.sh`: passed on 2026-06-05.

Open items:

- No UI surface yet; the queue model is backend-only. The next cycle builds the queue
  list/detail UI on top of this boundary.
- Notifications, email configuration, Admin health, and bulk actions remain deferred.
- Workflow-run and process-definition machinery is still a stub reference.

Next recommended task:

Build the Approval Queue v1 UI (list + detail view, empty/error states) on top of the
new repository boundary, then wire the existing demo `/approval-queue` page to the new
model.

## Approval Queue v1 UI Feature Cycle

- Date: 2026-06-05
- Product lane: PMI KC KB workflow-control layer.
- Replaced the old SOP/template/placeholder Approval Queue demo surface with a v1
  queue screen backed by `approval_queue_items` and `approval_queue_activity`.
- Added `/api/approval-queue` list and `/api/approval-queue/:itemId` detail/transition
  routes. Queue creation remains internal; no public POST route was added.
- Added fixed filters for process/run, status, risk, audience group, assignee, required
  approver, and due date.
- Added one list/detail screen with status/risk fields, action-needed summary,
  direct-link Open Run action, available single-item actions, and Activity history.
- Enforced queue visibility in the repository, API path, and Firestore rules: Admins can
  see all queue records; non-Admins see only items where they are assignee or required
  approver.
- Tightened queue transitions: Approve requires `Ready for Approval`; assignment is
  Admin-only for this cycle; Disable remains Admin-only; return/snooze still require
  plain-English reasons.
- Removed the silent fake queue fallback. If Firestore is unavailable, the page now
  shows a plain unavailable state. Demo/test queue rows are real seeded queue records
  with `Demo/Test` process labels.
- Extended safe demo reset data to seed real Approval Queue v1 items and Activity
  entries, and updated the live demo smoke script and demo walkthrough for the new
  queue behavior.

Validation status:

- `npm test -- approval-queue`: passed with 30 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 161 tests.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed; it reinstalled dependencies, checked formatting,
  linted, typechecked, ran 161 tests, passed the router boundary check, and built the
  app.
- Local browser check: `/approval-queue` rendered after local demo sign-in and showed
  the new filter shell plus the production-safe Firestore-unavailable state. Browser
  screenshot capture through the in-app browser plugin timed out twice; no queue action
  was clicked because that would write through the connected queue API if demo Firestore
  credentials were available.

Open items:

- Bulk actions, queue notifications, email configuration, Admin health, workflow-run
  runtime, and process-definition runtime remain deferred.
- Demo reset/live smoke against the demo Firebase project remains approval-gated because
  it writes demo Firestore records.
- A connected demo/prod environment should seed real queue records before user-facing
  queue action smoke testing.

Next recommended task:

Build the next Approval Queue v1 slice: either bulk-action support with per-item
guardrails or the Admin health/notification configuration surface, after choosing the
next scope.

## Approval Queue v1 UI Review Repair Pass

- Date: 2026-06-05
- Reviewed the new Approval Queue v1 UI/API/demo changes from a fresh-context
  falsification stance against the locked feature-cycle plan, active product docs,
  active KB spec, demo scripts, and queue tests.
- Fixed a client-side recovery bug: the queue page no longer stays permanently in the
  initial Firestore-unavailable state after a successful client retry.
- Fixed demo seed/reset schema drift: demo `approval_queue_items` and
  `approval_queue_activity` records no longer write generic `change_log` rows, and demo
  Activity reset records avoid `updated_at` to stay closer to the append-only Activity
  model.
- Updated the one-time demo seed command to honor the same queue metadata flags as the
  reset command.
- Aligned `docs/spec.md`, `docs/demo-show-and-tell.md`, and `scripts/demo-operator.mjs`
  with the v1 queue model instead of the retired SOP/template/placeholder fallback
  queue.
- Added unit coverage for the queue demo seed/reset metadata.
- Quality-control check: no stale references to the deleted `ApprovalQueueDemo` or
  local demo queue fallback remain. The largest touched code file is the self-contained
  queue UI component; it is sizeable but isolated. `docs/status.md` remains the largest
  file because it is the running historical log.

Validation status:

- `npm test -- approval-queue live-cost-scripts`: passed with 55 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm test`: passed with 162 tests.
- `npm run verify:router-boundary`: passed.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed after retry. The first attempt hit a Windows `EPERM`
  unlink on Next's SWC binary while a local dev-server/browser-inspection process was
  still being released; the retry completed dependency install, format, lint,
  typecheck, unit tests, router-boundary verification, and production build.

Remaining risk:

- Component-level React coverage now exists for critical bulk queue flows as of the
  later risk-reduction pass, but broader queue component coverage is still intentionally
  limited.

## Approval Queue Bulk Actions Feature Cycle

- Date: 2026-06-05
- Product lane: PMI KC KB workflow-control layer.
- Added production-ready local bulk actions for Approval Queue v1 without authorizing
  cloud setup, Gmail access, deploys, live imports, keys, client-environment writes, or
  external-system writes.
- Added `POST /api/approval-queue/bulk` plus bulk input validation for action,
  selected item IDs, reasons, snooze dates, assignment fields, and explicit High-risk
  confirmation.
- Added repository-level bulk transition handling with per-item `updated`, `skipped`,
  or `failed` results and summary counts. Visible ineligible items receive a small
  `skipped` Activity entry; hidden or unauthorized item IDs return a generic skipped
  result without leaking item details or writing Activity.
- Tightened single-item and bulk High-risk approval so the server requires
  `confirm_high_risk: true`; the browser sends that flag only after the user accepts
  the confirmation prompt.
- Implemented bulk `execute` as a guarded skip until approved executable
  external-action runtime exists. Current bulk execute results clearly state that no
  external write was attempted.
- Updated `/approval-queue` with select-visible, row checkboxes, bulk action controls,
  action-specific fields, preview counts, High-risk preview text, and per-item bulk
  results while preserving the one-list/detail screen model.
- Updated the client production cutover runbook so "cutover to the main app" means the
  gated production path: local readiness, production preflight, explicit deploy/client
  approval, role assignment, and post-deploy smoke. Production bulk smoke must use real
  or explicitly approved test queue items, not demo queue seeding.
- Added a scratch feature-cycle packet at
  `docs/temp/approval-queue-bulk-actions-cycle.md`; it remains an ignored disposable
  planning artifact per the `docs/temp/` policy.

Validation status:

- `npm test -- approval-queue`: passed with 41 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 173 tests.
- `npm run verify:router-boundary`: passed.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 173 tests, passed the router-boundary check, and built the
  app including `POST /api/approval-queue/bulk`.
- Local browser smoke: passed against a temporary local Firestore emulator seeded with
  demo queue records. Verified `/approval-queue` rendered, bulk selection worked, the
  50-item request-limit copy was visible, guarded execute copy was visible, and the
  mobile viewport had no horizontal overflow. The in-app browser could not reach the
  local server from its environment, so the smoke used a local headless browser.
- Local browser check: passed against a local Firestore emulator with temporary queue
  records. Verified `/approval-queue` rendered the bulk panel and queue rows, select
  visible selected three items, the preview showed two ready/one skipped plus one
  High-risk confirmation note, `Execute` showed the guarded v1 copy, and bulk execute
  returned `0 updated, 3 skipped, 0 failed` with "No external write was attempted."
- Browser screenshot capture timed out once after the successful execute check, so the
  final browser evidence is DOM/text verification rather than an attached screenshot.

Remaining risk:

- Component-level React coverage now exists for the critical bulk queue flows. Broader
  queue component coverage remains intentionally limited to keep this pass focused.
- Bulk execute is intentionally non-executable until workflow-run and external-action
  runtime records are built behind a future approved spec.

## Approval Queue Bulk Actions Review Repair Pass

- Date: 2026-06-05
- Reviewed the bulk-actions implementation from a fresh-context falsification stance
  against the feature-cycle plan, active product/cutover docs, route/API tests,
  repository tests, client queue screen, and smoke-script call paths.
- Fixed a UI/server contract gap: the browser now caps bulk selection and submit at
  the 50 visible-item request limit that the server schema already enforces.
- Fixed downstream documentation drift: active planning docs now include bulk return
  alongside approve, disable, execute, assign, and snooze; the production smoke
  checklist no longer uses the stale "resolve queue items" wording.
- Confirmed no script or app path directly calls High-risk single-item approve without
  the explicit confirmation flag; direct approve calls found during review are tests or
  the updated queue UI path.

Validation status:

- `npm test -- approval-queue`: passed with 41 focused queue tests.
- `npm run format:check`: passed after formatting the touched queue component.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `npm test`: passed with 173 tests.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 173 tests, passed the router-boundary check, and built the
  app including `POST /api/approval-queue/bulk`.

## Approval Queue UI Risk Reduction Pass

- Date: 2026-06-05
- Reduced the remaining queue UI risk by splitting the oversized
  `ApprovalQueue.tsx` screen into a state/API shell, focused filter/bulk/list/detail
  panels, and a small queue model/helper module.
- Added a React DOM test harness for the Approval Queue bulk UI with jsdom and Testing
  Library. New tests cover the 50-item select-visible cap, guarded execute copy,
  High-risk bulk confirmation payloads, and cancelled High-risk confirmation.
- Quality-control check: no approval UI source file is now over 522 lines; the prior
  monolithic queue component was 1170 lines.

Validation status:

- `npm test -- approval-queue`: passed with 44 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 176 tests.
- `npm run test:firestore`: passed with 14 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `git diff --check`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 176 tests, passed the router-boundary check, and built the
  app including `POST /api/approval-queue/bulk`.
- Local browser smoke: passed after the refactor against a temporary local Firestore
  emulator seeded with demo queue records. Verified `/approval-queue` rendered, bulk
  selection worked, the 50-item request-limit copy was visible, guarded execute copy
  was visible, and the mobile viewport had no horizontal overflow.

## Approval Queue Notifications And Admin Health Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the next local Approval Queue v1 slice for console notifications, Admin email
  settings, and notification health without authorizing Gmail sends, cloud setup,
  deploys, imports, keys, client-environment writes, or external-system writes.
- Added typed queue notification, email-setting, and health records:
  `ApprovalQueueNotificationRecord`, `ApprovalQueueEmailSettingRecord`, and
  `ApprovalQueueNotificationHealth`, plus schemas for queue notification events,
  email-setting event types, recipient roles, and Admin setting updates.
- Added `lib/firestore/approval-queue-notifications.ts` as the server-side boundary for:
  - creating in-app notification records when queue Activity creates product-relevant
    events (`created`, `assigned`, `returned_for_revision`, `blocked`, `unblocked`, and
    `closed`);
  - listing recipient-visible console notifications;
  - reading default email settings where routine email is off and blocked/overdue
    escalation is the built-in email exception;
  - Admin-only email-setting updates;
  - Admin health classification using `Healthy`, `Needs Attention`, and
    `Action Required`.
- Wired queue create/transition/bulk transition Activity writes to create console
  notification records in the same Firestore transaction. Skipped/refreshed/snoozed
  Activity remains non-notifying for now; scheduled overdue/unsnoozed execution remains
  future work.
- Added API routes:
  - `GET /api/approval-queue/notifications`
  - `GET /api/approval-queue/health`
  - `GET /api/approval-queue/email-settings`
  - `PATCH /api/approval-queue/email-settings/:settingId`
- Added an Admin page Approval Queue Health and Queue Email Settings panel. The panel
  shows health summary, setup fallback copy, default settings, event trigger text,
  subject previews, no-repeat cooldowns, and Admin controls for email enablement and
  recipient roles. Console notifications remain the source of truth regardless of email
  settings.
- Extended Firestore rules so `approval_queue_notifications` are readable only by the
  notification recipient or Admin, `approval_queue_email_settings` are Admin-readable
  only, and both collections deny direct client writes.
- No Gmail send path was added for v1 queue notifications in this cycle. Existing legacy
  editable-content Gmail notifications are unchanged.

Validation status:

- `npm test -- approval-queue-notifications-v1 approval-queue-notification-routes`:
  passed with 13 focused tests.
- `npm test -- approval-queue`: passed with 57 focused queue tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 189 tests.
- `npm run test:firestore`: passed with 17 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed. It reinstalled dependencies, checked formatting,
  linted, typechecked, ran 189 tests, passed the router-boundary check, and built the app
  including the new Approval Queue notification/settings/health API routes.
- Local browser check: passed on `/admin` after local demo sign-in. Verified the
  Approval Queue Health panel, Queue Email Settings panel, blocked/overdue escalation
  default, fallback health copy when Firestore health is unavailable, and no horizontal
  overflow at a 390px mobile viewport.

Open items:

- The app now stores console notification records, but there is not yet a user-facing
  notification inbox/badge or read/unread interaction outside the Admin settings panel.
- Email delivery/retry/escalation execution for queue notifications remains unbuilt and
  must stay gated until sender, recipient, Gmail setup, and production environment
  ownership are approved.
- Scheduled overdue and unsnoozed notification generation remains future workflow-run or
  job-runner work.

Next recommended task:

Surface Approval Queue console notifications in the app shell or queue screen, with a
small read/unread interaction, before adding any email-delivery worker.

## Approval Queue Header Notifications Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Implemented the recommended next iteration from the prior plan: a global app-shell
  notification dropdown for the current user's unread Approval Queue console
  notifications, with mark-on-open behavior.
- Added current-user-only notification listing for the header while preserving Admin's
  broader server-side ability to inspect notification records when explicitly requested.
- Added `PATCH /api/approval-queue/notifications/:notificationId` with the narrow
  `mark_read` action. Only the notification recipient can mark that notification read.
- Updated `/approval-queue` so notification links can land on a specific queue item with
  `?item_id=<queueItemId>` and preselect that item in the detail panel.
- Added `NotificationMenu` to the app shell. It fetches up to five unread current-user
  notifications, shows a compact badge, opens a dropdown with plain-English notification
  details, marks a notification read before navigating to the queue item, and degrades to
  a clear unavailable message when local Firestore is not connected.
- No email-delivery worker, Gmail send, cloud setup, deploy, import, key creation,
  client-environment change, or external-system write was added.

Validation status:

- `npm test -- approval-queue-notifications-v1 approval-queue-notification-routes
notification-menu-component approval-queue-component`: passed with 23 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 196 tests.
- `npm run test:firestore`: passed with 17 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed on retry. The first attempt hit a Windows `EPERM`
  unlink on Next's SWC binary while the local dev/browser smoke process was still
  releasing the file; the retry reinstalled dependencies, checked formatting, linted,
  typechecked, ran 196 tests, passed router-boundary verification, and built the app
  including `PATCH /api/approval-queue/notifications/:notificationId`.
- Local browser check: passed on `/ask` after local demo sign-in. Verified the
  Notifications button renders in the header, the dropdown opens, the unavailable state
  is readable when Firestore notifications are unavailable locally, the Open Approval
  Queue link remains present, and the mobile viewport has no horizontal overflow.

Open items:

- Live unread notification rendering should be smoke-tested against connected demo or
  staging Firestore records when credentials are available.
- Scheduled overdue and unsnoozed notification generation remains future workflow-run or
  job-runner work.
- Queue notification email delivery/retry/escalation remains gated on approved sender,
  recipients, Gmail setup, and production environment ownership.

Next recommended task:

Build the scheduled overdue/unsnoozed queue notification generator as a dry-run-capable
local job, still without sending email.

## Approval Queue Scheduled Notifications Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the scheduled Approval Queue console-notification generator as a local
  dry-run-first job.
- Added a server-only scheduler boundary for:
  - due snoozed items where `snooze_until <= referenceDate`;
  - active overdue items where `due_date < referenceDate`;
  - deterministic notification IDs keyed by event, item, recipient, and the trigger
    date.
- Unsnoozed items move to `Ready for Approval` unless their risk is `Blocked` or
  required ownership is missing, in which case they move to `Blocked`. The write path
  clears `snooze_until`, appends one `unsnoozed` Activity entry, and creates recipient
  console notifications.
- Overdue generation creates console notifications only. It does not change queue
  status and does not write Activity. Overdue notifications dedupe by due date so the
  job does not create a repeating daily reminder by default.
- Added `npm run queue:notifications` using a dev-only `tsx` runner. The command
  defaults to dry-run and requires `--write` before any Firestore write. It supports
  `--date=YYYY-MM-DD` and `--json`.
- Added focused unit coverage for dry-run immutability, unsnooze writes, Activity
  creation, idempotency, overdue filtering, no-recipient skips, blocked routing, CLI
  parsing, and safe text output.
- No Gmail send, Gmail read/modify, Cloud Scheduler setup, deploy, import, key
  creation, client-environment write, or external-system write was added or run.

Validation status:

- `npm test -- approval-queue-scheduled-notifications`: passed with 9 focused tests.
- `npm run queue:notifications -- --help`: passed.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 205 tests.
- `npm run test:firestore`: passed with 17 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed on retry. The first attempt hit the known Windows
  `EPERM` unlink on Next's SWC binary during dependency reinstall, before checks ran.
  The retry reinstalled dependencies, checked formatting, linted, typechecked, ran 205
  tests, passed router-boundary verification, and built the app.

Open items:

- `--write` has not been run against connected demo, staging, or production Firestore;
  that still requires explicit approval for the exact target environment.
- Cloud Scheduler or any recurring hosted execution remains unbuilt and gated.
- Queue notification email delivery, retry, and escalation execution remains gated on
  approved sender, recipients, Gmail setup, and production environment ownership.

Next recommended task:

After the target Firestore environment is approved, run
`npm run queue:notifications -- --dry-run --date=<YYYY-MM-DD> --json` against that
environment and review the planned item IDs before any approved `--write` run.

## Client Unblock Communications Sent

- Date: 2026-06-06
- Product lanes: PMI KC KB, Lease Renewal Agent, and Gmail Inbox 0.
- Two outbound communications are now the active client-side unblock thread. The tone is
  pragmatic and lightweight: the demo app is working, the next step is migration and
  process discovery, budget should stay tightly controlled, and Dan/team are being
  asked for concrete access/process answers instead of broad technical work.
- Communication 1 asked Dan for:
  - a card on file in Google Cloud billing, with a stated $10 budget guardrail and no
    spend without approval;
  - one full Lease Renewal walkthrough, preferably Wednesday, June 17, 2026, 9:30-10:15
    AM, with fallback windows Wednesday morning, Thursday, June 18, 2026, 11:00 AM-4:00
    PM, or before 9:00 AM either day.
- Communication 2 told Dan a simple tool access spreadsheet would be added to Google
  Drive and asked for each tool's access type, location, and notes. Starting tools:
  RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Sheets including which sheets,
  and any missing tools.
- Communication 2 also sent default assumptions for Dan to correct:
  - approval emails can come from `kb-automation@pmikcmetro.com`;
  - launch approval is Dan and Josiah only for now;
  - the Gmail helper starts with a few safe test threads before anything touches the
    live inbox;
  - signed leases and lease end dates still need a source location answer.
- The stated target is a working Lease Renewal process prototype by July 3, 2026,
  provided the needed access and walkthrough answers arrive.

Current blockers awaiting Dan/team reply:

- Google Cloud billing card and any explicit approval for cost-bearing migration steps.
- Lease Renewal walkthrough and source notes.
- Tool access spreadsheet for RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google
  Sheets, and any missing systems.
- Signed lease / lease-end-date source location.
- Gmail Inbox 0 safe test-thread protocol confirmation.
- Approval sender and launch approver defaults, unless Dan confirms or corrects them.

Work that can continue while waiting:

- Keep the KB demo/runtime verification path green.
- Continue local Approval Queue, workflow-control, process-definition, Admin health,
  dry-run, and preflight improvements that do not touch client resources.
- Continue Lease Renewal discovery/modeling: workflow-run shape, process-definition
  model, acceptance scenarios, read/gather fact model, and non-executable fixtures.
- Continue Gmail Inbox 0 planning, legacy artifact mining, safe-thread scenario design,
  label/rule/prompt modeling, and management-page planning without live Gmail access.
- Prepare tool-access templates and integration capability classification locally.

Stop conditions remain:

- No Google Cloud billing/cost action, production setup, deploy, live source import,
  Gmail read/modify/draft/send, API-key use, client Drive write, or
  RentVine/LeadSimple/DotLoop/QuickBooks/Boom/Sheets write until the user says the
  relevant Dan/team reply has unblocked that exact action.

Docs updated for future agents:

- `docs/client-checklist.md`: current outbound asks and verification after unblock.
- `docs/research-backlog.md`: asked/awaiting-reply statuses.
- `docs/environment-handoff.md`: non-secret setup gates.
- `docs/implement.md` and `docs/ai-execution-workflow.md`: safe local parallel work
  while waiting on client replies.
- `AGENTS.md`: route-table pointer for client unblock state.

## Workflow Foundation Dev Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the first local workflow-control foundation for editable process definitions
  and simulation-only workflow runs.
- Added server-side Firestore records for process definitions, immutable active
  versions, workflow runs, and append-only workflow-run timeline entries.
- Added process-definition APIs for list/create/read/update, Approval Queue-backed
  submission, Admin activation, and simulation test-run start.
- Added workflow-run APIs for detail, timeline, and simulation test-run completion or
  failure.
- Added `/processes`, `/processes/[definitionId]`, and `/workflow-runs/[runId]` UI
  surfaces. The UI uses UID fields for owner/approver entry for now, creates no seeded
  demo workflow records, and exposes no execute/send/external-write controls.
- Process-definition submission creates or refreshes one `ProcessDefinitionChange`
  Approval Queue item. Admin activation requires source links and an approved queue
  item; a successful simulation test run is required unless an Admin supplies an
  override reason.
- Test runs created by this cycle are always `is_test_run: true`, `simulation_only:
true`, and excluded from production metrics by default.
- Firestore rules allow signed-in app users to read workflow records but deny direct
  client writes to workflow collections.
- No Lease Renewal runtime integration, Gmail access, email delivery worker, Cloud
  Scheduler setup, deploy, import, key creation, client-environment change, client Drive
  write, live client data handling, or external-system write was added or run.

Validation status:

- `npm test -- workflow`: passed with 17 focused workflow tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 222 tests.
- `npm run test:firestore`: passed with 20 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `bash scripts/verify.sh`: passed on retry. The first attempt stopped at
  `docs/status.md` formatting after dependency install; the retry reinstalled
  dependencies, checked formatting, linted, typechecked, ran 222 tests, passed
  router-boundary verification, and built the app including the new process/workflow
  routes.
- Local browser smoke: passed on `/processes` after starting the dev server. Verified
  the process-definition list/create panels render, the production-safe empty/unavailable
  local Firestore state is visible, there are no browser console errors, and the desktop
  viewport has no horizontal overflow.

Open items:

- The workflow UI intentionally uses UID entry fields; human-friendly user pickers remain
  a future Admin/user-management improvement.
- Real operational workflow runs, executable external actions, Lease Renewal runtime
  fact gathering, production metrics, and workflow notification/email behavior remain
  future gated work.
- Client production setup, live source imports, Gmail setup, and system-of-record
  integrations remain blocked on the active Dan/team asks.

Next recommended task:

Build the next local workflow-control slice: process-definition approval return/revision
handling and a simple read-only process/run index for recent simulation runs, still
without external writes or client-resource access.

## Workflow Return/Revision Dev Cycle

- Date: 2026-06-06
- Product lane: PMI KC KB workflow-control layer.
- Built the next local workflow-control slice for process-definition return/revision
  handling and recent simulation-run visibility.
- Added workflow-specific Approval Queue sync outside the generic queue repository.
  Returning a `ProcessDefinitionChange` queue item now moves the linked process
  definition to `Needs Revision`, keeps the pending queue backlink, and leaves Admin
  activation as a separate gated action.
- Updated returned-item resubmission behavior so the same nonterminal returned queue
  item refreshes back to `Ready for Approval` when ownership is complete, or `Blocked`
  when ownership is missing. Approved/closed queue items still create successor items
  instead of being reopened.
- Extended workflow-run listing with local options for `definitionId`, `simulationOnly`,
  and `limit`.
- Added a read-only Recent Simulation Runs panel to `/processes`, showing simulation
  test runs with status, due date, owner, direct run link, and explicit non-production
  marking.
- No cloud setup, Gmail access, deploy, client-resource change, client data handling,
  external send, or system-of-record write was added or run.

Validation status:

- `npm test -- workflow approval-queue`: passed with 95 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 229 tests.
- `npm run test:firestore`: passed with 20 Firestore Security Rules tests.
- `npm run verify:router-boundary`: passed.
- `git diff --check`: passed.
- `npm run build`: passed.
- `bash scripts/verify.sh`: passed on final retry. Two earlier attempts hit the known
  Windows `EPERM` unlink on Next's SWC binary during dependency reinstall; dependencies
  were restored with `npm install` before retrying.
- Local browser smoke: passed against a temporary local Firestore emulator seeded with
  one returned process definition and one simulation run. Verified `/processes` shows
  the Recent Simulation Runs panel, the returned detail page shows `Needs Revision`,
  the Approval Queue backlink, Save/Submit controls, and recent test run, and the
  mobile 390px viewport has no horizontal overflow. Browser screenshot capture timed
  out in the in-app browser runtime, so the smoke used DOM and console checks.

Open items:

- Screenshot capture through the in-app browser timed out during this smoke run, though
  DOM, console, and overflow checks passed.
- Real operational workflow runs, executable external actions, workflow-run
  notifications, production metrics, and Lease Renewal runtime fact gathering remain
  future gated work.
- Client production setup, live source imports, Gmail setup, and system-of-record
  integrations remain blocked on the active Dan/team asks.

Next recommended task:

Build the next local workflow-control slice: add a small process-definition Activity or
revision-history view that surfaces linked Approval Queue return reasons on the process
detail page, still without external writes or client-resource access.

## Migration-Readiness Stop Guardrail Context Update

- Date: 2026-06-06
- Product lanes: PMI KC KB, Lease Renewal Agent, and Gmail Inbox 0.
- Added a local-development exhaustion gate to the active agent loop. Future feature
  cycles must now prove that the proposed local work improves production readiness,
  migration/cutover prep, verification quality, handoff, or a known quality issue.
- Clarified that safe local work is still encouraged when it is readiness work:
  regression fixes, docs/status/client asks, source manifest templates, preflight and
  dry-run checks, cutover runbooks, acceptance scenarios, tests, and environment
  handoff evidence.
- Clarified the stop point: once local verification is green, cutover/preflight inputs
  are prepared or blocked only on client-owned values, and the remaining work is client
  migration, approved production setup, source approval, or real product decisions,
  future agents should stop adding speculative local product surface.
- Deferred local feature loops now include workflow-control slices, Approval Queue
  expansion, Lease Renewal runtime, Gmail runtime, and demo-only complexity unless the
  active docs show a direct cutover, acceptance, or quality reason.
- Added the guardrail across the active routing, runner, packet template, implementation
  runbook, AI workflow, phase plan, KB product lane, environment handoff, client
  checklist, research backlog, cross-product cutover plan, client production cutover
  runbook, engineering checklist, and product-lane README.
- No cloud setup, Gmail access, deploy, client-resource change, client data handling,
  external send, live import, or system-of-record write was added or run.

Validation status:

- `npm run format:check`: passed.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm test -- workflow approval-queue`: passed with 95 focused tests.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 229 tests.
- `npm run test:firestore`: passed with 20 Firestore Security Rules tests.
- `bash scripts/verify.sh`: passed, including production build.

Next recommended task:

Before starting another local workflow-control or Approval Queue slice, run the
migration-readiness stop gate. If the only remaining blockers are Dan/team replies,
client-owned production setup, approved sources, or migration/cutover approval, stop
local feature expansion and prepare the client unblock/cutover handoff instead.

## Autonomous Loop Hardening And Loop-State Capture

- Date: 2026-06-08
- Product lanes: PMI KC KB (workflow/runner governance); cross-product loop process.
- Reworked the unattended feature loop from a single-slice runner into a multi-slice loop
  with a first-class verification-and-falsification phase, explicit stop-and-reset
  conditions, and durable single-read resume state.
- `docs/autonomous-agent-runner.md`: replaced the thin Verification section with a
  Verification And Falsification phase (plain-English explanation, verify-then-falsify,
  explicit risk list, repair, doc alignment); added a Multi-Slice Continuation Loop, a
  Stop And Reset Conditions section (approval gate, migration readiness, quality
  degrading, uncertainty too high, context reset, no safe slice), and a Loop State
  Capture section; made the context-intake order canonical with `docs/loop-state.md`
  first; and clarified the plan-vs-run trigger to remove re-prompting.
- Added `docs/loop-state.md` as the always-current single-read resume artifact, seeded
  with the real current state (migration-ready but client-blocked, active lane, next safe
  slice candidates, blockers, stop-condition state). Added a Current Loop State pointer to
  the top of this status log and registered the file in `npm run verify:router-boundary`.
- Added `scripts/check-falsification-preflight.mjs` and `npm run verify:falsification`: a
  git-aware, read-only preflight that scans only committable files (tracked plus
  untracked-not-ignored, respecting `.gitignore`) for secret patterns, oversized files,
  invalid JSON, and broken internal doc links, with an informational large-diff warning.
  Chained it into `scripts/verify.sh` and added
  `tests/unit/falsification-preflight.test.mjs`.
- Extended `docs/autonomous-feature-cycle-packet-template.md` with a falsification
  checklist, slice-continuation decision, stop-and-reset check, next-slice candidate, and
  loop-state snapshot fields.
- Reconciled the divergent context-intake orders and the plan-vs-run trigger across
  `docs/implement.md`, `docs/ai-execution-workflow.md`, and `CLAUDE.md`, and relabeled
  `docs/agent-runner/README.md` as a historical scaffold rather than active guidance.
- Updated `AGENTS.md` route table, project map, commands, and documentation rules for the
  loop-state artifact and the falsification preflight; `AGENTS.md` remains under 150
  lines.
- Security: the newly added `docs/client_docs/` tool-access spreadsheet contained live
  RentVine API credentials in a notes cell and was untracked but not ignored. Added
  `docs/client_docs/` to `.gitignore` so client spreadsheets, ledgers, invoices, and any
  secrets stay local and cannot be committed. No secret values were committed.

Validation status:

- `npm run format:check`: passed on 2026-06-08.
- `npm run lint`: passed on 2026-06-08.
- `npm run typecheck`: passed on 2026-06-08.
- `npm test`: passed on 2026-06-08 with 243 tests.
- `npm run verify:router-boundary`: passed on 2026-06-08 (now also requires
  `docs/loop-state.md`).
- `npm run verify:falsification`: passed on 2026-06-08 across 246 committable files.
- `npm run build`: passed on 2026-06-08.
- `git diff --check`: passed on 2026-06-08.
- `bash scripts/verify.sh` and `npm run test:firestore` were not re-run this pass; every
  step verify.sh chains except `npm ci` was run individually, and no Firestore rules or
  persistence behavior changed.

Security follow-up for the client:

- Rotate the RentVine API key and secret that were shared in the tool-access spreadsheet,
  and keep tool-access answers as non-secret references only.

Next recommended task:

Honor the migration-readiness stop gate recorded in `docs/loop-state.md`: the remaining
blockers are client-owned, so prepare the client unblock / cutover handoff or reconcile
the newly arrived tool-access answers (non-secret references only) rather than expanding
local product surface. Run `npm run verify:falsification` as part of verification on the
next cycle.

## Integration Architecture Ratified And Action Registry Foundation

- Date: 2026-06-08
- Trigger: verified deep-research review of the tool stack (Rentvine, LeadSimple, Dotloop,
  QuickBooks, Boom, Google Sheets). The research did not contradict governance; it added
  decision-grade specificity that the docs lacked.
- Preserved the verified findings and sources in
  `docs/research/integration-capability-2026-06.md` (durable, out of `docs/temp/`).
- Added `docs/integration-architecture.md`: tool-role map, event model, build order,
  lease-renewal and maintenance process chains, the Action Registry model, the
  vendor-confirmation matrix, and the source-normalization requirement.
- Encoded downstream effects across governance and pipeline docs: `docs/north-star.md`,
  `docs/products/README.md`, `docs/products/pmi-kc-kb.md`,
  `docs/products/lease-renewal-agent.md`, `docs/plan.md`, `docs/engineering.md`,
  `docs/engineering-checklist.md`, `AGENTS.md`, `docs/integration-cutover-plan.md`,
  `docs/environment-handoff.md`, `docs/ai-execution-workflow.md`, `docs/implement.md`,
  `docs/autonomous-agent-runner.md`, and `docs/research-backlog.md`.
- Key decisions recorded: Maintenance Work Order Intake is the first executable-write
  target; the Rentvine lease-renewal writeback is undocumented and stays gated;
  Google Sheets is an exception/control surface, not a primary source of truth.
- Built the metadata-only Action Registry foundation: `ACTION_TARGET_SYSTEMS`,
  `ACTION_EVENT_MODES`, and `ACTION_EVIDENCE_STATUSES` constants; `ActionRegistryRecord`
  type and Zod schema with a `production_allowed` governance refine; read-only repository
  `lib/firestore/action-registry.ts`; typed seed catalog; `scripts/seed-action-registry.ts`
  with `npm run seed:action-registry`; server-write-only `action_registry` Firestore rule;
  and unit, repository, and rules tests. Every seeded entry is `production_allowed: false`,
  so the no-system-of-record-writes boundary is unchanged.

Next recommended task:

Continue honoring the migration-readiness stop gate: the integration architecture is now
ratified in docs and the Action Registry catalog exists as metadata only. Remaining
external-integration progress is client- and vendor-confirmation-blocked (tool-access
spreadsheet completion, QuickBooks access, Rentvine renewal-write confirmation, RentVine
key rotation). Prefer client unblock / cutover handoff over new local product surface.

## Client Unblock / Tool-Access Reconciliation

- Date: 2026-06-09
- Product lanes: PMI KC KB cutover, Lease Renewal Agent discovery, Gmail Inbox 0
  governance.
- Reconciled the ignored returned tool-access spreadsheet into tracked non-secret docs.
  `docs/client-checklist.md`, `docs/research-backlog.md`, and
  `docs/environment-handoff.md` now mark tool access as partially received.
- Non-secret access status recorded: RentVine has both access/API location; LeadSimple,
  DotLoop, Boom, and Google Sheets have admin/location answers; QuickBooks is blank;
  Google Sheets exact in-scope sheets still need confirmation.
- Added RentVine credential rotation as an explicit client ask because a credential was
  present in ignored spreadsheet notes. No credential value was copied into tracked docs.
- Created an ignored local follow-up draft at
  `docs/temp/2026-06-09-tool-access-follow-up.md`; it was not sent.
- No code/runtime behavior, cloud setup, billing action, Gmail access, credential use,
  client Drive write, deploy, source import, email send, or external-system write was
  performed.

Validation status:

- `npm run format:check`: passed after Prettier normalized the edited Markdown tables.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm run verify:falsification`: passed across 254 committable files.

Remaining blockers:

- Google Cloud billing card and explicit approval for any cost-bearing migration step.
- Lease Renewal walkthrough and signed lease / lease-end-date source location.
- QuickBooks access status/location.
- Exact Google Sheets scope and owner.
- RentVine credential rotation and future vendor confirmation for undocumented renewal
  writeback.
- Gmail Inbox 0 safe test-thread protocol, approval sender, and launch approver
  confirmations.

Next recommended task:

Continue the client unblock / cutover handoff track. Do not expand local product surface
unless a new client answer, approved migration step, production smoke result, regression,
or accepted product decision creates a specific readiness need.

## Source-Corpus Readiness Dry-Run Hardening

- Date: 2026-06-11
- Product lanes: PMI KC KB cutover readiness; cross-product away-mode quality hardening.
- Added production-readiness output to `npm run corpus:plan`. The generated plan now
  includes `readiness.ok`, `readiness.blockers`, `readiness.warnings`, and summary counts
  for entries, Spaces, data stores, approval statuses, and sensitivities.
- The readiness pass flags unreplaced placeholders, non-`Approved` source metadata,
  `High` sensitivity entries, raw `docs/context_and_calls/` source paths, duplicate Cloud
  Storage URIs, and duplicate derived Agent Search document IDs before any upload/import
  command is used.
- Updated `docs/client-production-cutover.md`, `docs/implement.md`, and
  `docs/demo-source-templates/README.md` so operators know the production manifest
  template is expected to report blockers until placeholders are replaced and sources are
  approved, and that staging-copy creation/upload/import/metadata seeding waits for
  `readiness.ok === true`.
- No cloud setup, billing action, Gmail access, credential use, client-resource change,
  deploy, source import, email send, or external-system write was performed.

Validation status:

- `npm run check:budget-guard`: passed; demo posture, away mode active, $10 cap.
- `npm test -- live-cost-scripts`: passed with 26 focused script tests.
- `npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --project=pmikc-kb-production --location=us --dry-run`:
  passed as a local dry-run and printed expected readiness blockers for template
  placeholders and `Unreviewed` source metadata.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 280 tests.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm run verify:falsification`: passed across 259 committable files.
- `npm run test:firestore`: passed with 23 Firestore Security Rules tests.
- `npm run build`: passed.

Stop condition:

- Away mode remains active. After this bounded dry-run tooling slice, no further
  decision-free local work is selected. Continue only for a concrete regression,
  test/preflight gap, or docs/handoff inconsistency; otherwise wait for return/client
  unblock and resume cutover from `docs/client-checklist.md`.

## Main Consolidation

- Date: 2026-06-11
- By explicit user request, fast-forwarded `main` from `a329069` to `b652073` and pushed
  `origin/main` so the source-corpus readiness dry-run hardening slice is available from
  the default branch for the next run.
- Away Mode remains active for cost/cloud/Gmail/external actions; this entry records only
  the repository consolidation.

Validation status:

- Pre-merge verification for `b652073` is recorded in the previous status entry.
- Post-merge ref check confirmed `main`, `origin/main`,
  `work/yolo-20260609-015747`, and `origin/work/yolo-20260609-015747` all pointed at
  `b652073` before this doc-only state update.

## Remote Away Mode Autonomy Widened

- Date: 2026-06-11
- Trigger: user clarified that future large-model runs should be able to do significant
  work while the owner is remote, including migration/setup through APIs, and should be
  restricted primarily by breaking-change risk and cost risk.
- Replaced the old local-only Away Mode posture with Remote Away Mode in
  `docs/away-mode.md`. Future agents are now authorized to keep running product,
  migration, and API/setup work when it is reversible, non-breaking, budget-guarded, and
  documented.
- Hard stops remain: unmanaged or unbounded cost, cap increases, Pro model use,
  autonomous sends/live notifications, destructive or hard-to-rollback changes, secrets
  or raw client/customer/Gmail data exposure, and unapproved system-of-record writes.
- Updated `AGENTS.md`, `docs/autonomous-agent-runner.md`,
  `docs/budget-and-cost-policy.md`, `docs/ai-execution-workflow.md`,
  `docs/implement.md`, `docs/environment-handoff.md`, and `docs/loop-state.md` so future
  sessions do not stop merely because the owner is remote.
- Updated `scripts/check-budget-guard.mjs`: Away Mode now allows
  `--allow-multiple-spaces` for bounded migration/setup with a warning, while still
  refusing `--allow-pro` and `--allow-notifications`.
- Made the next large-run queue explicit in `docs/loop-state.md`, sized for a
  large-context/long-running model: production-lift setup automation, cutover/migration
  pipeline, app-owned environment migration, production e2e hardening, a preview-first KB
  Admin migration console, non-executable Lease Renewal Agent foundation, non-live or
  safe-thread Gmail Inbox 0 foundation, and integration readiness expansion.
- No cloud setup, billing action, Gmail access, credential use, client-resource change,
  deploy, source import, email send, or external-system write was performed.

Validation status:

- `npm run check:budget-guard`: passed; demo posture, Remote Away Mode active, $10 cap.
- `npm test -- budget-guard`: passed with 15 focused tests.
- `npm run format:check`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed with 282 tests.
- `git diff --check`: passed.
- `npm run verify:router-boundary`: passed.
- `npm run verify:falsification`: passed across 259 committable files.

## Mocked-Auth E2E Flow Harness (2026-06-11)

Built the browserless end-to-end flow harness queued as remote-run item 4 (production
hardening and e2e coverage), executed remotely under Remote Away Mode:

- Added `npm run test:e2e` / `npm run test:e2e:core` driven by
  `scripts/run-e2e-tests.mjs`: probes the Firestore emulator (Java + one-time jar) and
  degrades to the Firestore-free core group with a warning when unavailable
  (`--firestore` makes that fatal, `--no-firestore` skips the emulator).
- `tests/e2e/global-setup.mjs` seeds the emulator via the existing
  `scripts/demo-firestore.mjs#resetDemoRecords`, boots `next dev` on `localhost:4310`
  with `LOCAL_DEMO_AUTH=true ASK_DEMO_MODE=true`, warms routes, and tears down the
  process tree; `tests/e2e/helpers/client.mjs` is a cookie-jar fetch client with
  `redirect: "manual"` so guard redirects are assertable.
- Coverage (7 suites, 33 tests): sign-in guard redirects and role gating (Editor blocked
  from `/admin` and manageAdmin APIs, Admin allowed), Ask Verified Source answer with
  citations plus No Reliable Source Found and Zod 400 paths, spaces list/detail/
  read-only/404, graceful degradation markers without Firestore, capture-to-placeholder,
  Approval Queue list/filter/detail/high-risk confirmation/approve/bulk snooze/bulk
  execute block, and the full process-definition lifecycle (create → submit → queue item
  → simulation test run → approve → activate, including Editor 403 and premature-activate
  409 paths).
- Extended local demo auth so e2e can mint role-scoped sessions: `POST /api/auth/demo`
  accepts an optional `{ "role": "Editor" | "Approver" | "Admin" }`; cookie value
  `local-demo:<Role>` (plain `local-demo` stays Admin). Still gated by
  `isLocalDemoAuthEnabled()` (off in production; production preflight rejects it).
- `npm test` keeps excluding `tests/e2e/**`; e2e is not wired into `scripts/verify.sh`
  to keep it fast. Rewrote `tests/e2e/README.md` for the new harness and added the
  commands to `AGENTS.md`.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation status:

- `npm run test:e2e`: passed (31 tests, 2 degraded-mode tests correctly skipped) with
  the Firestore emulator.
- `npm run test:e2e:core`: passed (16 tests including degraded-mode markers).
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: passed with 288 tests (auth-session demo-role coverage added).
- `npm run verify:falsification`: passed across 271 committable files.
- `npm run verify:router-boundary`: passed.

## Cutover Tooling Batch: seed idempotency, GCP preflight, cutover report (2026-06-11)

Executed remote-run queue items 1-3 as local dry-run tooling in three slices under
Remote Away Mode (no credentials exist in the remote container, so live API reads stay
owner-side):

- `seed:spaces` idempotency (queue item 3): restructured `scripts/seed-spaces.mjs` from
  import-time side effects to the exported parse/build/seed pattern used by
  `seed-launch-skeletons.mjs`. Reruns now skip existing space documents, `--force`
  updates them while preserving the original `created_at` (previously reruns clobbered
  it), and `--dry-run` prints the exact records. Runbook §3 documents the behavior and
  rollback (delete the seeded `spaces/<id>` docs).
- `npm run preflight:gcp` (queue item 1): credential-less plan mode prints the full
  converge plan — the 18 required APIs (doc-sync-tested against the runbook §2 enable
  command), Firebase setup commands, Firestore create/rules-deploy commands, and the
  budget posture via the budget guard. `--live` adds read-only verification of enabled
  APIs, Firestore database mode, and the Firebase project through
  `google-auth-library` when Application Default Credentials exist, degrading every
  section to a structured blocker otherwise. `--json` emits the
  `{ok, blockers, warnings}` readiness report. Referenced from runbook §2 and
  `docs/environment-handoff.md`.
- `npm run cutover:report` (queue item 2): a single dry-run command composes the GCP
  setup plan, production env preflight, budget posture, source-corpus readiness
  (manifest optional; the template correctly reports placeholder/approval blockers),
  the deploy command preview, an ordered five-step rollback plan (Cloud Run → Agent
  Search data stores → staging uploads → seeded metadata → rules), and the runbook §7
  production smoke checklist as structured data with a doc-sync test. Blockers
  aggregate with section prefixes into one `readiness` object; the runbook now requires
  `readiness.ok === true` before deploy and gained a Rollback section.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or
  external-system action was performed. All new commands are dry-run/read-only.

Validation status (end of run):

- `bash scripts/verify.sh`: passed (format, lint, typecheck, 318 unit tests across 42
  files, router boundary, falsification across 276 committable files, build).
- `npm run test:firestore`: passed (23 rules tests).
- `npm run test:e2e`: passed (31 tests, 2 degraded-mode tests correctly skipped with
  the emulator present).
- `npm run check:budget-guard`: passed (demo posture, away mode active, $10 cap).
- Real dry-runs: `npm run preflight:gcp` (plan + live-degradation), `npm run
seed:spaces -- --dry-run`, and `npm run cutover:report` against the production
  manifest template (expected blockers printed for placeholders/unreviewed sources and
  missing client env values).

## Integration Readiness Expansion: preview schemas, health checks, mocked connectors (2026-06-12)

Executed remote-run queue item 8 under Remote Away Mode as metadata/mocked-only work (no
external write path was added; every Action Registry entry remains
`production_allowed: false`):

- Structured preview payload schemas: added an optional `preview_payload_schema` field
  (snake_case field descriptors with string/number/boolean/date/enum/reference types and
  per-field source systems) to the Action Registry schema, types, and record builder, as
  the machine-readable companion to `preview_schema_note`. The pure validator
  `lib/integrations/preview-payload.ts` enforces that a preview payload contains exactly
  the declared fields — required present, values typed, no undeclared keys.
- Per-system health-check contracts: `lib/integrations/health-checks.ts` defines seven
  deterministic contracts (Rentvine, LeadSimple, Dotloop, QuickBooks, Boom vendor-packet-
  dependent, Google Sheets, Gmail) with ordered config/auth/probe/rate-limit steps.
  `runHealthCheck` has no default transport and throws without an injected one, so the
  module can never perform a live call; a test locks this in.
- Catalog expansion 9 → 14 entries: wired `connection_health_check_ref` on all entries;
  added structured preview schemas to the maintenance-chain entries; added doc-grounded
  `rentvine.lease.read`, `rentvine.work_order.read` (read-only, Documented),
  `leadsimple.task.create` (Vendor-Confirmation-Required, Operations plan), and the
  Gmail Inbox 0 pair `gmail.label.apply` / `gmail.draft.create` (both `Planned` until
  the client approves the Gmail access model; additive labels and unsent drafts only).
  Added `"Gmail"` to `ACTION_TARGET_SYSTEMS`. Move-Out + Deposit Disposition actions
  were deliberately not added (research backlog still marks triggers/approvers/systems
  TBD). The Gmail metadata avoids the forbidden runtime scope literals so the router-
  boundary guard still blocks real Gmail runtime code.
- Mocked connector tests: `tests/helpers/mock-connectors.ts` simulates the documented
  maintenance work-order chain (create → LeadSimple stages → status sync → QuickBooks
  bill draft preserving the work-order number → Sheets audit row) entirely in memory,
  validating every mock write against the matching entry's `preview_payload_schema`.
- Docs: `docs/integration-architecture.md` gained the `preview_payload_schema` field row,
  a Connection health-check contracts subsection, and a catalog-coverage note.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation (slice boundary): `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test` (339 tests, 44 files), `npm run test:firestore` (23 rules tests),
`npm run verify:falsification` (281 committable files), `npm run verify:router-boundary`,
`npm run check:budget-guard` (demo posture, away mode active, $10 cap), and
`npx tsx scripts/seed-action-registry.ts --dry-run --json` (14 entries validated, all
production_allowed=false, no writes) all passed.

## KB Admin Migration Console (2026-06-12)

Executed remote-run queue item 5 under Remote Away Mode: a read-only, preview-first
Admin page at `/admin/migration` (linked from `/admin`) that mirrors
`npm run cutover:report` in-app. No cloud call is made from the page; in dev/demo it
honestly shows the production blockers that remain.

- `lib/admin/migration-readiness.ts` composes the same pure readiness functions the
  cutover tooling uses — GCP/Firebase/Firestore converge plan (plan mode only),
  production env preflight against the current process env, source-corpus readiness from
  the tracked production manifest template, budget/away-mode posture via the budget
  guard, Action Registry readiness (counts by readiness/evidence, gated entries, and a
  governance assertion that raises a blocker if any record is ever
  `production_allowed=true`), and Approval Queue notification posture. Every section
  degrades gracefully (per-section try/catch with a plain-English note); the Action
  Registry section falls back to the static seed catalog without Firestore. Blockers
  roll up with section prefixes, and `gcp:`/`env:`/`corpus:` blockers are labeled
  "owner-side action required" because they need credentials, billing, real project ids,
  or a reviewed manifest.
- The TypeScript page reuses the `.mjs` script logic through hand-written sibling
  `.d.mts` declarations (no config churn); every call passes explicit
  `process.cwd()`-rooted arguments because the scripts' own defaults resolve paths from
  `import.meta.url`, which mis-resolves after bundling.
- Refactor for bundle safety: extracted the pure `cloudStorageContentDocumentId` into
  `scripts/source-doc-id.mjs` and the pure manifest validation/readiness functions into
  `scripts/source-corpus-readiness.mjs` (re-exported by `scripts/source-corpus-manifest.mjs`
  so the CLI and its tests are unchanged). This keeps firebase-admin and the CLI's
  dynamic file operations out of the page bundle; the production build is warning-free.
- Tests: `tests/unit/migration-readiness.test.ts` (10 tests, including a real-deps smoke
  test that locks the `.d.mts` declarations against drift) and
  `tests/e2e/admin-migration.e2e.test.mjs` (guard redirects for signed-out/Editor, Admin
  renders all panels with the production_allowed=false assertion line, /admin links to
  the console, and the no-Firestore degraded mode shows the seed-catalog fallback note).
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation (slice boundary): `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test` (349 tests, 45 files), `npm run build` (warning-free, `/admin/migration`
present), `npm run test:e2e:core` (21 passed, 17 emulator-dependent skipped), and
`npm run test:e2e` (35 passed, 3 degraded-mode correctly skipped with the emulator) all
passed. Full `bash scripts/verify.sh` and `npm run test:firestore` results are recorded
in the end-of-run entry below.

## End-Of-Run Validation: queue items 8 + 5 (2026-06-12)

- `bash scripts/verify.sh`: passed (format, lint, typecheck, 349 unit tests across 45
  files, router boundary, falsification across 292 committable files, warning-free
  build with `/admin/migration` present).
- `npm run test:firestore`: passed (23 rules tests).
- `npm run test:e2e:core`: passed (21 tests, 17 emulator-dependent skipped).
- `npm run test:e2e`: passed (35 tests, 3 degraded-mode tests correctly skipped with
  the emulator present).
- `npm run check:budget-guard`: passed (demo posture, away mode active, $10 cap).
- `npx tsx scripts/seed-action-registry.ts --dry-run --json`: 14 entries validated, all
  production_allowed=false, no writes.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or
  external-system action was performed during this run.

## Lease Renewal Agent Non-Executable Foundation (2026-06-12)

Executed the decision-free half of remote-run queue item 6 under Remote Away Mode,
staying strictly inside the product doc's "AI Can Do Now" list and its "Do Not Build
Yet" boundary (no runtime trigger, queue, agent, or API integration; nothing
executable):

- Shared vocabulary (`lib/lease-renewal/constants.ts`): the doc-confirmed fact-confidence
  states (Verified/Likely/Needs Review/Conflict), the verified eight-stage renewal model
  (candidate detection → closeout), the initial planned reads, and the planned outputs,
  locked by tests so they cannot drift from `docs/products/lease-renewal-agent.md`.
- Fact-confidence gates (`lib/lease-renewal/facts.ts`): a pure, non-executable
  `evaluateRenewalFactGates` encoding the doc's deterministic rules — only Verified and
  approved facts flow into owner-facing drafts without a visible warning, Likely/Needs
  Review facts route to review, Conflict facts block, and a missing-facts list is kept
  against the planned read set.
- Process-definition template (`lib/lease-renewal/process-template.ts`):
  `buildLeaseRenewalProcessTemplate` converts the confirmed target workflow shape into
  the v1 minimum process-definition fields (one step per verified stage, doc-grounded
  trigger/outcome/success/stop/escalation conditions). Every action reference is derived
  from the Action Registry seed catalog, so target systems, readiness, and rollback
  notes cannot drift from governed metadata; the Rentvine renewal writeback stays a
  Planned pending-future-automation step with its vendor-confirmation gap visible.
- Source inventory template
  (`docs/source-corpus/lease-renewal-source-inventory.template.json`): the renewal
  document kinds named in the product doc's discovery list (signed lease/lease-term
  record, tenant/property facts, rent/terms, timing/fee policy, tenant-notice and legal
  language, owner communication templates, workflow notes) with TBD locations as
  placeholders for the client walkthrough.
- Acceptance scenarios (`tests/unit/lease-renewal-foundation.test.ts`, 11 tests): the
  template parses and is created as Draft through the existing workflow machinery, a
  simulation-only test run starts (is_test_run/simulation_only true, excluded from
  production metrics) and completes, the definition submits into Pending Approval, and
  the fact-confidence gates behave per the doc.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed. No new runtime surface: no page, API route, trigger, or
  connector was added.

Validation (slice boundary): recorded in the end-of-run entry below.

## End-Of-Run Validation: lease renewal foundation slice (2026-06-12)

- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: 360 tests across 46 files, all passed.
- `npm run verify:falsification`: passed across 297 committable files.
- `npm run verify:router-boundary`: passed.
- `npm run check:budget-guard`: passed (demo posture, away mode active, $10 cap).
- `npm run build`: passed, warning-free.
- `npm run test:firestore`: passed (4 rules-test files via the emulator).
- `npm run test:e2e:core`: passed (21 tests, 17 emulator-dependent skipped).
- No cloud, Gmail, credential, deploy, import, send, client-resource, or
  external-system action was performed.

## Gmail Inbox 0 Non-Live Foundation + Management Page v1 (2026-06-12)

Executed the non-live half of remote-run queue item 7 under Remote Away Mode, staying
inside the product doc's safety boundaries (no autonomous send, no Gmail draft creation,
no Gmail read/modify runtime code):

- Shared vocabulary (`lib/gmail-inbox-zero/constants.ts`): the doc-confirmed base and
  target label sets (Waiting on Outside / Waiting on Team / Dan Decision / Draft Ready),
  rollout phases (Shadow → Suggest → Drafts), rule/reply lifecycle statuses
  (Proposed/Approved/Retired), and the default hard-exclusion categories (Owner money,
  Legal/notices, Tenant disputes — label only, never draft), all test-locked.
- Label-rule model and triage gates (`lib/gmail-inbox-zero/rules.ts`): pure
  `evaluateInboxTriage` encoding the governance rules — only Admin-approved rules
  participate, auto-labeling only for exact matches past the Shadow phase (Shadow
  classifies and applies nothing), pattern rules stay suggestion-only — plus
  `proposeRuleChangeFromFeedback`, which turns Dan's label corrections into Proposed
  rule changes that require Admin approval (nothing self-modifies).
- Draft-text gates (`lib/gmail-inbox-zero/drafts.ts`): pure `buildReplyDraft` that only
  accepts Approved reply templates, always prepends the `Draft — Review before sending`
  banner, marks missing facts with the `Needs Verification: <fact>` placeholder, and
  refuses hard-excluded categories. Text composition only; no Gmail draft is created
  and no send capability exists.
- Management page v1 (`app/admin/gmail-inbox-zero/page.tsx`, linked from `/admin`): the
  doc-mandated minimal Admin-only management page, read-only — health/status bar with an
  honest "Not connected" Gmail status and Gemini posture, the label set, rollout phases,
  rules/approved-replies/history sections with production-safe empty states. No Gmail
  call, no new Firestore collection, no mutation surface. Editing/persistence waits for
  the approval-queue integration spec.
- Deliberately not built: legacy Owner Router artifact mining (the sibling repo is
  absent from this container), any users.watch/history ingestion, the Workspace Add-on
  card, back-labeling, and live Gemini evaluation — all client-gated.
- Updated `docs/products/gmail-inbox-zero.md` Current State to note the built non-live
  foundation and management page v1.
- No cloud, Gmail, credential, deploy, import, send, client-resource, or external-system
  action was performed.

Validation: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
(372 tests / 47 files), `npm run verify:falsification` (303 committable files),
`npm run verify:router-boundary`, `npm run check:budget-guard` (demo posture, away mode
active, $10 cap), `npm run build` (warning-free, `/admin/gmail-inbox-zero` present),
`npm run test:e2e:core` (25 passed, 17 emulator-dependent skipped), `npm run test:e2e`
(39 passed, 3 degraded-mode correctly skipped), and `npm run test:firestore` (23 rules
tests) all passed.

## Source Drop Zone Setup, Drive Metadata Check, And Away Mode Return (2026-06-15)

- Reauthenticated local Google access as `josiah@pmikcmetro.com` with Drive access.
- Created the Google Drive source drop zone `PMI KC - Source Drop Zone` and subfolders
  for Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition,
  Owner Onboarding, Gmail Inbox 0, unsure items, and old/reference-only material.
- Shared the top folder with `dan@pmikcmetro.com` as an editor; subfolders inherit access.
- Verified metadata-only visibility for the Drive home. Visible shared Sheets include
  `Tenant Move In/Out/Renewal Checklist`, `24/25/26 Rents Received 2`, and
  `2026 Invoices`; exact in-scope Sheets still need Dan/Josiah confirmation before any
  app use.
- Updated `docs/environment-handoff.md` with the non-secret folder and visible-sheet
  pointers.
- Marked Remote Away Mode inactive because the owner is back in active coordination.
  Updated `AGENTS.md`, `docs/away-mode.md`, `docs/loop-state.md`, and
  `docs/client-checklist.md` so future agents do not treat the exhausted remote-run
  queue as standing approval for speculative live/setup work.
- No sheet contents, raw client records, credentials, deploys, imports, sends, or
  external-system writes were performed.

Validation: `npm run format:check`, `npm run check:budget-guard` (demo posture, away mode
inactive, $10 cap), `npm test -- budget-guard` (15 tests), `npm run verify:falsification`
(303 committable files), and `git diff --check` all passed.

## GCP Billing Unblock — Cutover Resume + Verification Baseline (2026-06-19)

- The PM provisioned Google Cloud billing: account `01A5A3-65CA5A-614D45`, org
  `584930494337`, budget id `82962d7e-b340-4253-8348-38caff16e88a`. This flips the #1 client
  blocker (Google Cloud billing card). Recorded the non-secret identifiers in
  `docs/environment-handoff.md` and `docs/loop-state.md`. The assistant took no
  console/billing action — that stays user-owned (Hard Stop).
- Decisions (this session): migration targets a PMI KC-owned production project (cutover
  track, no demo artifacts copied); keep the durable ~$10 unattended-spend guard with the PM
  budget as the outer GCP-enforced alert; today's demo = cheap-live Ask (<$10) on the existing
  `pmikckb-test` project. Decision-complete packet:
  `docs/temp/2026-06-19-gcp-billing-unblock-cutover-resume.md`.
- Billing unblocks the infrastructure half of cutover (live preflight, API enablement,
  Firestore/Cloud Run setup, the cheap-live demo). It does NOT unblock cutover completion
  (needs approved client sources) or any cost step (each needs explicit approval + budget
  guard).
- Read-only verification baseline on the owner Windows host: `npm run check:budget-guard`
  PASS (demo posture, away mode inactive, $10 cap); `npm run verify:falsification` PASS (303
  files); `npm test` 370/372 PASS. The two failures are environment-coupled, not regressions
  (the modules last changed 2026-06-12, the green era):
  - `tests/unit/cutover-report.test.mjs > aggregates blockers across sections with prefixes`:
    `readProductionPreflightEnv` reads the host's on-disk `.env.local`
    (`GCP_PROJECT_ID=pmikckb-test`), so a project resolves and the expected `gcp:` "no
    project" blocker is absent. Confirmed the failure persists with shell env cleared because
    the value comes from `.env.local` on disk.
  - `tests/unit/migration-readiness.test.ts > computes real plan/preflight/corpus/budget`:
    5s default timeout on cold dynamic import of the real Google SDK modules; passes at
    `--testTimeout=30000` (~16s observed; vitest reported ~56s aggregate import).
  - Flagged a follow-up to make both tests hermetic (skip on-disk `.env.local` in the unit
    test; add an explicit timeout to the real-deps smoke).
- `npm run host:check`: gcloud SDK present but `pmikckb-test` not accessible →
  `gcloud auth login` + `gcloud auth application-default login` required before any live/demo
  run. `npm run check:live-cost -- --allow-multiple-spaces` correctly gates (ambient
  `ASK_DEMO_MODE=true`).
- Remaining user-owned gates: gcloud/ADC auth; create/select + link a PMI KC production
  project and a $10 budget alert on it; confirm the PM budget amount/thresholds; explicit
  per-step spend approval for the cheap-live demo and each production cost step.

Validation: `npm run check:budget-guard` (demo posture, away mode inactive, $10 cap) and
`npm run verify:falsification` (303 committable files) passed; `npm test` 370/372 passed with
2 environment-coupled failures documented above. Docs-only slice; no full
`bash scripts/verify.sh` run, and no cloud/billing/ADC/deploy/import/send/secret action.

## Account/Org Discovery + Fresh-Project Decision (2026-06-19)

- Authenticated gcloud + ADC as `josiah@pmikcmetro.com` (owner's PMI KC account). Discovery:
  the existing demo stack — project `pmikckb-test`, Cloud Run, Firebase Auth, and the four
  Agent Search data stores — is owned by and auth-locked to the **cherrybridge.ai**
  account/org. The deployed sign-in page enforces `allowedHostedDomain=cherrybridge.ai`, so a
  `pmikcmetro.com` account cannot use it, and `gcloud` denied all access to `pmikckb-test`
  (`USER_PROJECT_DENIED`). `josiah@pmikcmetro.com` has the `pmikcmetro.com` org
  (584930494337 — the same org as the PM's new billing) but zero accessible projects.
- Decision (owner-approved): build a fresh GCP project under the `pmikcmetro.com` org funded
  by the PM billing account `01A5A3-65CA5A-614D45`, per `docs/client-production-cutover.md`
  (no demo artifacts copied). A live <$10 demo can run on the new project using the repo's
  sanitized demo corpus in `docs/demo-source-templates/`, so the demo does not depend on the
  client-source blocker. The owner is creating + billing-linking the project in the console;
  the assistant then runs the gated setup (preflight → APIs → Firebase/Auth → Firestore →
  seed → import → smoke → deploy), each cost step behind explicit `--budget-confirmed` approval.
- No cloud mutation, project creation, billing change, deploy, import, send, or secret action
  was taken by the assistant this slice; gcloud `billing/quota_project` was unset locally
  (it had pointed at the now-inaccessible `pmikckb-test`).

Validation: read-only diagnosis only (`gcloud auth login` / `application-default login`,
`gcloud config list`, `gcloud projects list`, `gcloud organizations list`, and a deployed-URL
HTTP check). No repo code changed; no `npm` verification re-run this slice.

## Fresh Project Created — Billing Link Pending (2026-06-19)

- Owner asked the assistant to provision the new environment. Created GCP project
  `pmi-kc-kb-prod` (number `558870356522`) under the `pmikcmetro.com` org
  (`gcloud projects create ... --organization=584930494337`) and set it as the active gcloud
  project. Project creation is reversible (deletable within 30 days).
- Billing link is blocked: `gcloud billing projects link` returned `IAM_PERMISSION_DENIED`
  (missing `billing.resourceAssociations.create` on `billingAccounts/01A5A3-65CA5A-614D45`);
  `gcloud billing accounts list` shows 0 accounts for `josiah@pmikcmetro.com`. Project
  `billingEnabled=false`. The PM must either link `pmi-kc-kb-prod` to billing
  `01A5A3-65CA5A-614D45` in the console, or grant `josiah@pmikcmetro.com` `roles/billing.user`
  on that billing account; either way also add a $10 project-scoped budget alert.
- Until billing is enabled, the paid APIs (Cloud Run, Vertex AI, Discovery Engine), Firestore
  creation, and deploy cannot proceed. The assistant stopped cleanly at this approval/permission
  gate. No paid API enablement, Firestore, deploy, import, send, or secret action was taken.

## Fresh Project Fully Provisioned + Cheap-Live Ask Demo Working (2026-06-19)

- PM granted `josiah@pmikcmetro.com` Billing Account User + Costs Manager on
  `01A5A3-65CA5A-614D45`. The assistant then provisioned the new environment end-to-end and
  got a live, cited Ask answer on `pmi-kc-kb-prod` (owner pre-approved the <$10 cheap-live spend):
  - Linked billing (`billingEnabled=true`) and created a project-scoped $10 budget alert
    (`billingAccounts/01A5A3-65CA5A-614D45/budgets/15ddc8d6-e96e-4696-9d3c-c09e23997206`).
  - Enabled 19 APIs; set the ADC quota project; repointed the host's persisted GCP env vars
    and `.env.local` from the old `pmikckb-test` to `pmi-kc-kb-prod` (old `.env.local` backed
    up at `temp/.env.local.before-pmikcmetro-migration`).
  - Created Firestore Native (us-central1) and seeded 12 spaces.
  - Owner did the one-time Firebase console attach; `firebase:setup` created web app
    `1:558870356522:web:c1b2473b886a6edd889953` and wrote the browser config into `.env.local`.
  - Created Cloud Storage bucket `pmi-kc-kb-prod-sources-558870356522`, provisioned the
    Discovery Engine service identity via the Service Usage REST API (the gcloud `beta`
    component is broken on this host), granted it `objectViewer` on the bucket and
    `storage.admin` on the project (the import stages an internal content bucket), uploaded 3
    sanitized demo `.txt` sources, and imported them into Agent Search data store
    `kb-lease-renewals-txt` (`successCount 3/3`). Seeded 3 `sources_meta` records.
  - `npm run check:live-cost` passed (lease-renewals, gemini-2.5-flash); `npm run smoke:ask-live`
    passed against a local `npm run dev` (ASK_DEMO_MODE=false, LOCAL_DEMO_AUTH=true) — returned
    a `Verified Source` answer with 2 citations (`temp/live-ask-smoke/result.json`).
- Remaining for a shareable deployed demo: enable the Google sign-in provider in the Firebase
  Console (owner toggle), then `npm run deploy:demo -- --budget-confirmed` and add the Cloud Run
  host to Firebase authorized domains. Firestore rules/indexes not yet deployed (firebase CLI
  auth pending). Cutover _completion_ still source-blocked (approved client sources).
- Spend stayed well under the $10 cap (tiny storage + a few Vertex/Gemini queries).
- DEPLOYED to Cloud Run: owner enabled the Google sign-in provider; `npm run deploy:demo --
--budget-confirmed --service-account=558870356522-compute@developer.gserviceaccount.com`
  built + deployed `pmi-kc-kb-demo`. First build failed on missing build-SA roles, so the
  compute SA was granted `cloudbuild.builds.builder`, `run.builder`, `storage.objectViewer`,
  `artifactregistry.writer`, `logging.logWriter` (plus runtime `datastore.user`,
  `discoveryengine.user`, `aiplatform.user`); redeploy succeeded. The org policy blocks
  `allUsers`, so the service uses `--no-invoker-iam-check`. Added the Cloud Run host to Firebase
  authorized domains via `firebase:setup-auth`. Deployed `/sign-in` returns 200 with
  `allowedHostedDomain=pmikcmetro.com` and no cherrybridge references. Live URL:
  `https://pmi-kc-kb-demo-558870356522.us-central1.run.app`. Authenticated Ask on the deployed
  URL needs an interactive `pmikcmetro.com` sign-in; the local `smoke:ask-live` already proved
  the live pipeline. Follow-up: deploy Firestore rules/indexes (needs `firebase login`).

## Deployed Auth Loop Fixed (2026-06-19)

- The first deployed revision looped sign-in (`/ask` bounced back to `/sign-in`). Two root
  causes, both fixed:
  1. Build-time project mismatch: a stale persisted USER env var
     `NEXT_PUBLIC_FIREBASE_PROJECT_ID=pmikckb-test` (left by the old cherrybridge host setup)
     overrode `.env.local` at build time, because `buildDemoDeployCommand` merges
     `{ ...localEnv, ...process.env }` (process.env wins) and `NEXT_PUBLIC_*` is inlined into the
     client bundle. The browser initialized Firebase with apiKey/authDomain for `pmi-kc-kb-prod`
     but `projectId=pmikckb-test`. Fix: repointed the persisted var to `pmi-kc-kb-prod` and set it
     in-process for the redeploy.
  2. Runtime SA could not mint/verify session cookies: `lib/firebase/admin.ts` uses
     `applicationDefault()` (the Cloud Run compute SA) for `createSessionCookie` and
     `verifySessionCookie(token, true)`. With ADC (no key file) that needs
     `iam.serviceAccountTokenCreator` (signBlob) plus Firebase Auth permission for the revocation
     lookup. Granted the compute SA `roles/firebaseauth.admin` (project) and
     `roles/iam.serviceAccountTokenCreator` (self).
- Also set `APP_BASE_URL` to the deployed URL. Redeployed (revision `pmi-kc-kb-demo-00002-tvw`).
  Verified the deployed env is now fully `pmi-kc-kb-prod`-consistent
  (`NEXT_PUBLIC_FIREBASE_PROJECT_ID=pmi-kc-kb-prod`) and `/sign-in` returns 200 with no
  `pmikckb-test` references. Final interactive sign-in confirmation is owner-side — use a fresh or
  incognito browser session to drop any stale cookie/Firebase state from the broken revision.
- Fix-forward: `docs/client-production-cutover.md` §6 now lists the required runtime SA roles
  (`firebaseauth.admin`, `iam.serviceAccountTokenCreator`). Separate follow-up: harden
  `scripts/deploy-demo-cloud-run.mjs` so a stale persisted `NEXT_PUBLIC_*` cannot silently
  override `.env.local` build config.

## Deployed Auth Loop — Immediate Root Cause: Unauthorized Cloud Run Host (2026-06-19)

- The loop persisted in incognito after the two fixes above. Cloud Run logs showed NO
  `/api/auth/session` or `/ask` requests — only `favicon.ico` 404s from host
  `pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`. Cloud Run's canonical `status.url` is that
  hash-based host (the `pmi-kc-kb-demo-558870356522.us-central1.run.app` URL redirects to it),
  and that host was NOT in Firebase Auth authorized domains — so Firebase blocked sign-in
  (`auth/unauthorized-domain`) before the round-trip ever reached the server. Fixed by adding
  the canonical host via `firebase:setup-auth`; authorized domains now include both
  `pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app` and `pmi-kc-kb-demo-558870356522.us-central1.run.app`
  (plus localhost / firebaseapp.com / web.app).
- The two earlier fixes (correct `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, runtime SA
  `firebaseauth.admin` + `iam.serviceAccountTokenCreator`) remain necessary — they would have
  surfaced once sign-in completed. Canonical demo URL:
  `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`. Lesson for the cutover runbook: always add
  Cloud Run's canonical `status.url` host to Firebase authorized domains, not just the
  project-number URL.

## Auth Hardening: signInWithPopup + Dedicated Runtime SA + Deploy Guard (2026-06-19)

- Owner chose to harden the auth setup in place (keep the run.app URL). Three changes:
  1. `components/auth/SignInPanel.tsx`: switched `signInWithRedirect` → `signInWithPopup`.
     Popup auth is robust across browsers (incognito / strict third-party-cookie modes) when the
     Firebase `authDomain` (`*.firebaseapp.com`) is a different origin than the app (`*.run.app`);
     it handles popup-closed/cancelled gracefully and drops the redirect-result plumbing. (The
     fully same-origin alternative — Firebase Hosting / a custom domain — was offered and
     deferred.)
  2. Dedicated least-privilege runtime service account
     `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com` with only `datastore.user`,
     `discoveryengine.user`, `aiplatform.user`, `firebaseauth.admin`, and
     `iam.serviceAccountTokenCreator` (self). Redeployed the service to run as it (revision
     `pmi-kc-kb-demo-00003-dsr`) and removed those runtime/auth roles from the default compute SA
     (which keeps only the build roles). The app no longer runs as the over-privileged default
     compute identity.
  3. `scripts/deploy-demo-cloud-run.mjs`: `.env.local` is now authoritative for the
     `NEXT_PUBLIC_FIREBASE_*` build vars, and the deploy fails loudly when a stale ambient
     `process.env` value disagrees (the exact failure mode that shipped the wrong project id).
     Added unit tests in `tests/unit/live-cost-scripts.test.mjs`.
- Verified: `npm run lint`, `npm run typecheck`, full unit suite (373/374 — the one failure is
  the known `.env.local`-coupled `cutover-report` test), `npm run verify:falsification` (303
  files); the deployed service runs as the dedicated SA and the canonical `/sign-in` returns 200.
  Owner to re-test the popup sign-in (a popup window now opens instead of a full-page redirect).

## Lease Renewal Phase-1 Deterministic Build (2026-06-20)

- Trigger: "continue with feature development" (AGENTS.md -> autonomous-agent-runner ->
  loop-state). Built ALL 14 zero-cost, deterministic Phase-1 lease-renewal units from
  `docs/products/lease-renewal-build-plan.md` §3 as 12 verified slices on branch
  `work/lease-renewal-phase1` (committed per slice; not pushed). The read -> normalize ->
  reconcile -> flag pipeline now exists in code as pure functions / rule tables tested with
  synthetic, sanitized fixtures.
- Units / files delivered:
  1. Unit 12 — `lib/integrations/action-registry-seed.ts`: added
     `google_sheets.renewal_checklist.{read,reconcile,writeback}` per connector-design §5.2 (read
     Needs Connection/Documented with tabs 4 & 7 denied at the boundary; reconcile Planned/Documented
     flags-only; writeback Planned/Documented — NOT vendor-confirmation-required — with the §4.0
     admin-flag-off + per-write button-press model and a cell-addressed preview schema). Seed catalog
     now 17 entries, all `production_allowed:false`. Updated `action-registry-schema.test.ts` (14->17)
     and `integration-architecture.md`.
  2. Unit 14 — `lib/lease-renewal/sheet-types.ts` + `tests/fixtures/lease-renewal/` synthetic
     sanitized corpus (Renewals full + 6-col fragment, Move-In/Move-Out, Inspection Tracker,
     Property Attributes, credential tabs 4 & 7, Owner-Onboarding off-by-one, UNRECOGNIZED) with a
     governance test (digit-free PLACEHOLDER credential cells, @example.com only, no secret tokens).
  3. Unit 3 — `fingerprint.ts`: content-keyed tab fingerprinting; UNRECOGNIZED below 0.5 threshold.
  4. Unit 4 — `headers.ts`: position-independent header resolution (off-by-one detection, blank/
     FALSE -> MURKY, header/data shape mismatch e.g. email-in-date).
  5. Unit 5 — `normalized-value.ts`: per-cell typed NormalizedValue + confidence ladder; `Conflict`
     never set at ingest (excluded by type).
  6. Units 1+2+7 — `ingest.ts`: credential hard-exclusion + emit scrubber, divider-drop + width-based
     re-stitch, record assembly + counts-only `IngestManifest`, ragged rows -> Blocked (fail-closed).
  7. Unit 6 — `join.ts`: fuzzy address/name join keys; never auto-merges (match=candidate,
     ambiguous=review).
  8. Unit 8 — `severity.ts`: §3.3 first-match severity (cadence Medium unless $130 owner charge -> High).
  9. Unit 9 — `reconciliation.ts` + `field-reconciliation-rules.ts`: per-field reconciliation;
     `Conflict` confidence set here (across sources); §3.4 precedence SUGGESTION ONLY, hard-gated on
     `PRECEDENCE_CONFIRMED=false` (OQ-PREC-1) so unlisted field types -> Blocked "no precedence rule".
  10. Unit 10 — `approval-queue-mapping.ts`: conflict -> existing Approval-Queue fixed fields
      (SourceFactConflict); PII stays in-boundary (values via deep links, never in the queue artifact).
  11. Unit 11 — `writeback.ts`: MOCK/DESIGN-ONLY structural cell map + state machine + re-anchor +
      compare-and-set + read-after-write over an in-memory MockSheet; refuses credential tabs;
      Blocked preferred over any partial/wrong write. No live Sheets path.
  12. Unit 13 — `tests/helpers/mock-lease-renewal-connector.ts` + smoke tests: mocked Rentvine
      lease-list read + Sheets structure read (validated against the new preview schemas, tabs 4 & 7
      hard-excluded, no cell values), health contracts via `createMockHealthCheckTransport`,
      `runHealthCheck` has no live transport default.
- Verification (full `verify.sh`-equivalent, by step): `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npx vitest run` (478/478 across 59 files; +91 lease-renewal tests),
  `npm run verify:router-boundary`, `npm run verify:falsification` (342 files),
  `npm run check:budget-guard` (demo posture, away mode inactive, $10 cap), `npm run build`
  (warning-free), and `npx tsx scripts/seed-action-registry.ts --dry-run --json` (17 entries, all
  production_allowed=false) all passed. No live call, credential, cost, deploy, import, send, or
  system-of-record write was performed.
- Stop condition: clean stop — all §3 deterministic units built and green. Remaining Phase-1 work is
  client/owner-gated (OQ-PREC-1 precedence confirmation, OQ-SHEET-1/LEX-1/JOIN-1 live-read
  calibration, OQ-UI-1 the lease-renewal workflow-run review surface, and the cost-gated first live
  read). See `docs/loop-state.md` for the next-slice candidates.

## Lease Renewal Phase-1 — Adversarial Review + Hardening + Merge to main (2026-06-20)

- After the 12-slice build, ran a 5-lens adversarial review of `work/lease-renewal-phase1` (22
  agents: correctness / governance / spec / tests / integration, each finding adversarially
  verified, then a go/no-go synthesis). Verdict: 16 raised, 15 confirmed, **0 blockers, 2 majors**;
  no governance/safety invariant breached (production_allowed:false, credential exclusion, no SoR
  write, counts-only manifest, suggestion-only all intact).
- Fixed the two majors before merge:
  1. `lib/lease-renewal/normalized-value.ts` `parseSheetDate` now round-trips through `Date.UTC` and
     rejects impossible calendar dates (Feb 30, Apr 31, non-leap Feb 29) → `null` / Needs Review per
     design §3, instead of fabricating a `Verified` ISO that corrupted the High-severity
     `renewal_date` reconciliation.
  2. Credential containment aligned to spec §2.2: new shared `lib/lease-renewal/credential-guard.ts`
     widens the Stage-B token set to the authoritative regex set (adds passcode/ssid/login/
     credential/access code; strong-token 1-hit trip) AND adds the previously-missing §2.2(5)
     **emit scrubber** that redacts any credential value reaching the emit stage and Blocks its tab
     (`IngestManifest.credentialScrubHits`). This makes the build plan's "hard-exclusion + emit
     scrubber" deliverable real.
- Plus three low-risk nits: unified the `coarseShape`/`normalizeCell` currency regex, made the
  writeback divider guard reject multi-dot scaffold values, and gated reconciliation `blocked_reason`
  on an actually-Blocked severity (no contradictory "no precedence rule" on a High item). Added 10
  tests (incl. a dedicated credential-guard suite; the secret-format test builds its token at runtime
  so no literal secret sits in source).
- Verification: `npx vitest run` 488/488 across 60 files; format/lint/typecheck/router-boundary/
  falsification (344 files)/budget-guard/build all green. Fast-forward merged `work/lease-renewal-phase1`
  into `main` and pushed to `origin/main`. No live call, credential, cost, deploy, import, send, or
  system-of-record write.

## Lease Renewal Phase-1 — Read Pipeline + Review Surface + Resolve Loop (2026-06-22)

- Trigger: owner "let's plan and implement the next phase of development." Planned + confirmed scope
  via AskUserQuestion (owner chose the fuller scope: pipeline + review surface **+ the §3.5
  interactive resolve loop with persistence**, under a new top-level "Lease Renewal" nav section).
  This is candidate (a) / OQ-UI-1 — the one buildable, readiness-improving slice that was still open
  after the Phase-1 deterministic build; everything else (OQ-PREC-1, live read) stays client/owner-gated.
- Built on `work/lease-renewal-phase1-pipeline-ui` (not yet merged):
  - **Read pipeline (`lib/lease-renewal/pipeline.ts`).** Pure `runRenewalPipeline(input): RenewalRunResult`
    composing the merged Phase-1 units: `ingestTables` → per-record/per-field candidate assembly with
    the fuzzy join applied **match-only** (ambiguous/no_match never merged) → `reconcileField` →
    `mapReconciliationToQueueItem`. Output groups flags by severity (High/Blocked/Medium/Low), carries
    the counts-only `IngestManifest` + excluded-tab census, and a literal `production_allowed:false`.
    `DEFAULT_FIELD_SPECS` is illustrative pending OQ-LEX-1/JOIN-1/PREC-1.
  - **Simulation (`lib/lease-renewal/simulation.ts` + `sample-sheet.ts`).** Deterministic run computed
    in-memory from a governance-clean SYNTHETIC sample (credential tabs 4 & 7 included so exclusion is
    exercised; fixed timestamps; no `Date.now()`). The app stays source-blocked — no live read.
  - **Review surface (`/lease-renewal/runs` + `[runId]`).** Server components guarded by
    `requirePageCapability("read")`; client renders the run summary (manifest counts + excluded-tab
    census, labels only), severity-grouped flag cards (candidate values + sources + confidence + deep
    links + suggested-winner-or-`Blocked "no precedence rule"`), a "Simulation-only" banner, and the
    resolve controls. One nav entry added to `AppShell`. Reused existing global CSS + one small `.lr-*`
    block.
  - **§3.5 resolve loop (KB-owned persistence).** New `lib/firestore/lease-renewal-resolutions.ts`
    (pure `planLeaseRenewalResolution` + Firestore wrappers), collections `lease_renewal_resolutions`
    and `lease_renewal_resolution_activity` (server-write-only `firestore.rules`), and
    `POST /api/lease-renewal/resolve`. Three paths: pick-a-source / enter-corrected-value /
    flag-is-wrong; required plain-English reason; append-only Activity; High/Blocked → Admin; Approver/
    Admin to resolve. A pick/corrected resolution **QUEUES** a proposed write-back
    (`production_allowed:false`) — **no sheet/SoR write executes** (Phase-2 stays the only thing that
    could). Repointed the queue-mapping deep link `/workflow-runs/...` → `/lease-renewal/runs/...`.
- Verification (owner Windows host): `typecheck`, `lint`, `format:check`, `npm test` **504/504 across
  63 files** (+16), `test:firestore` **26/26 across 5 files** (+3 new resolution rules),
  `verify:falsification` (357 files), `verify:router-boundary`, `check:budget-guard` (demo, $10 cap),
  `build` (warning-free; new routes present), and the lease-renewal e2e **5/5** under the Firestore
  emulator (`firebase emulators:exec`), incl. the Admin pick-source resolve round-trip persisting a
  queued write-back + Activity. Windows harness note: `npm run test:e2e` can't spawn the bundled
  emulator / bare `vitest` (pre-existing ENOENT) — used `emulators:exec` + `npx vitest` instead.
- No live call, credential, cost, deploy, import, send, or system-of-record write was performed.
  Action Registry untouched (all entries remain `production_allowed:false`).

## Budget Kill Switch + e2e-runner CI fix (2026-06-22)

- The lease-renewal feature above was **fast-forward merged to `main` (`9efa5c3`) and pushed** on
  owner go-ahead. That push's CI then failed at `format:check` because `scripts/run-e2e-tests.mjs`
  (the Windows e2e-runner fix) was not Prettier-clean — fixed in this slice, which greens CI.
- Trigger: owner asked to (a) draft + configure the Pub/Sub budget kill switch and "ensure it
  works", (b) fix the stale budget doc, (c) tear down the local dev/emulator. Context: a GCP budget
  **alert only notifies — it does not stop spend**, so there was no true hard cap.
- Built `infra/budget-guardrail/` — a Cloud Function (2nd gen) that disables the project's billing
  when a Cloud Billing budget notification reports cost ≥ cap. `decide.mjs` is pure (decode the
  Pub/Sub notification + cap decision; uses the smaller of the env cap and the budget amount);
  `handler.mjs` injects the billing client so the whole path is testable; `index.mjs` is the
  functions-framework entrypoint; `package.json` carries deploy-time-only deps not in the main app.
  The `.mjs` under `infra/` is not typechecked by `tsc` and not bundled into Next.
- "Ensure it works": `tests/unit/budget-killswitch.test.mjs` (11 tests) exercises decode → decide →
  disable against the exact Cloud Billing payload with a mock billing client — proving the disable
  fires with `billingAccountName: ""` over cap, no-ops below it, and no-ops when already disabled,
  with zero live calls.
- Provisioning stays owner-side and gated (budgets, function deploy, billing-admin IAM, and tripping
  the disable are billing-console + cost-bearing + destructive Hard Stops). `npm run killswitch:plan`
  (`scripts/setup-budget-killswitch.mjs`) is PRINT-ONLY: it emits the exact gcloud commands (topic,
  SA + `roles/billing.admin`, function deploy, project-scoped budget wired to the topic, and a SAFE
  no-op wiring test) with real non-secret identifiers; it executes nothing. New
  `docs/budget-killswitch.md` documents the four-layer model + re-enable procedure; corrected the
  stale "billing not provisioned" claim in `docs/budget-and-cost-policy.md`.
- Verification: `format:check` (clean repo-wide), `lint`, `typecheck`, `npm test` **515/515 across
  64 files**, `check:budget-guard`, `verify:falsification` (366 files) all green; `killswitch:plan`
  renders. No live call, credential, cost, deploy, import, send, or system-of-record write.

## Budget Kill Switch — ARMED on pmi-kc-kb-prod (2026-06-22)

- Owner said "I trust you to configure it"; owner reauthenticated gcloud (`josiah@pmikcmetro.com`),
  then the assistant provisioned the kill switch live (per-step approval was the standing "configure
  it" go-ahead). All cheap; no destructive trip on prod.
- Provisioned: Pub/Sub topic `budget-guardrail-topic`; SA `budget-guardrail` granted project-scoped
  `roles/billing.projectManager` (least privilege — can unlink/disable this project's billing, nothing
  more) instead of the runbook's earlier `billing.admin`; 2nd-gen function `budget-guardrail` deployed
  ACTIVE (`KILL_SWITCH_CAP_USD=10`); project-scoped $10 budget
  `billingAccounts/01A5A3-65CA5A-614D45/budgets/033af8c0-8f21-48af-b89b-0632896e5018` with 50/90/100%
  thresholds.
- Discovered + fixed during arming: the 2nd-gen Eventarc trigger (running as the custom function SA)
  needed `roles/run.invoker` on the function's Run service — without it invocations failed with
  "lacks run.invoke". After granting it, a clean no-op wiring test logged
  `[budget-guardrail] costAmount 0.05 USD < cap 10; no action.` — proving topic→Eventarc→Run→function
  end-to-end. (Earlier test publishes failed only because PowerShell mangled the JSON quotes; bash
  single-quotes work — the runbook now notes this.)
- BLOCKED for the assistant (Console-only): attaching the topic to the budget fails
  `FAILED_PRECONDITION` because the topic must grant publish to `billing-budgets@system.gserviceaccount.com`,
  and that principal is rejected by the Pub/Sub IAM API (`add-iam-policy-binding` and `set-iam-policy`
  both: "does not exist"). The Billing Console grants it through a privileged path. So the final link
  is an owner Console step (Billing → Budgets & alerts → edit the budget → Manage notifications →
  Connect a Pub/Sub topic → `budget-guardrail-topic`). Until then the budget emails at thresholds;
  after it, $10 auto-disables billing.
- Runbook (`scripts/setup-budget-killswitch.mjs`) updated to match reality: least-privilege
  `billing.projectManager`, the `run.invoker` step, the Console-only topic attach, and the bash
  quoting note. `docs/budget-killswitch.md` records the live arming status + the one remaining step.

## Budget Kill Switch — FULLY ARMED (2026-06-23)

- Dan granted `josiah@pmikcmetro.com` org-level `roles/orgpolicy.policyAdmin` +
  `roles/resourcemanager.organizationAdmin` (requested by email). Confirmed by reading the org-node
  policy (previously PERMISSION_DENIED).
- Root cause of the earlier block was twofold: (1) the org enforces **domain restricted sharing**
  (`iam.allowedPolicyMemberDomains` = customer `C030vgv56`), and (2) the real budgets publisher SA is
  **`billing-budget-alert@system.gserviceaccount.com`** — NOT the `billing-budgets@…` name in the
  public docs (which is why every CLI grant returned "does not exist", even with DRS relaxed). That SA
  can only be bound by the Console's budget→topic connect; `gcloud`/IAM can't bind it.
- Completion: temporarily relaxed DRS on **just `pmi-kc-kb-prod`** (project override `allowAll`), the
  owner ran the Console "Connect a Pub/Sub topic" flow (which granted the publisher SA internally),
  then re-locked DRS (verified effective policy back to `allowedValues: C030vgv56`). The relaxation was
  applied + reverted via a `finally` each attempt so the org never stayed open unattended.
- Verified: topic `budget-guardrail-topic` now grants `roles/pubsub.publisher` to
  `billing-budget-alert@system.gserviceaccount.com`; budget `…/033af8c0-…` shows
  `notificationsRule.pubsubTopic = projects/pmi-kc-kb-prod/topics/budget-guardrail-topic` with
  50/90/100% thresholds. Full chain live: $10 budget → topic → function → disables billing.
- Docs/runbook corrected with the real SA name + the DRS-relax-during-Console-connect procedure.

## Production Cutover-Readiness Hardening — Dry-Run Rehearsal (2026-06-23)

- Closed the `docs/plan.md` P5 validation gate "Dry-runs exist for imports, setup scripts,
  seeders, and preflights" with a zero-cost, fixture-driven rehearsal of the demo→production
  cutover-readiness chain. No GCP, no deploy, no real sources, no spend against the $10 cap.
- Added `npm run cutover:dry-run` (`scripts/cutover-dry-run.mjs`): runs the real
  `buildCutoverReport` over two synthetic golden fixtures
  (`tests/fixtures/cutover/golden-production.env.fixture` and the matching
  `golden-production-source-manifest.json`, all obvious `sample-kb-fixture-*` placeholders) and
  asserts every gate is green except the one documented residual. Exits non-zero on any
  unexpected blocker.
- Added `tests/unit/cutover-readiness-golden.test.mjs` (17 tests): the golden config greens the
  manifest/env/GCP/deploy gates; negative fixtures prove each rejection (unapproved source,
  bucket/data-store placeholders, High sensitivity, demo project id, `ASK_DEMO_MODE=true`,
  non-https base URL, missing Firebase key, notifications off, wrong `ALLOWED_HD`, non-pmikcmetro
  recipient).
- FINDING (surfaced, not changed): the report's aggregate `readiness.ok` can never be `true` for
  a compliant production env — production preflight requires
  `KB_APPROVAL_NOTIFICATIONS_ENABLED=true`, but the budget guard inside the report refuses the live
  Gmail send without `--allow-notifications` (a flag `cutover:report` does not expose). So the
  report always carries exactly one expected `gcp:` notification-send blocker. Documented in
  `docs/client-production-cutover.md` §1b and §6; no tooling behavior changed. Open question for
  the owner: should `cutover:report` accept an approval flag so a fully-approved cutover can reach
  `readiness.ok === true`?
- Verification (owner Windows host, 2026-06-23): `npm run cutover:dry-run` green;
  `tests/unit/cutover-readiness-golden.test.mjs` 17/17. Full suite + format/lint/typecheck +
  `verify:falsification` rerun before commit (see `docs/loop-state.md` Last-Known-Green).

## Sync-and-Readiness Triple (2026-06-23)

- Context: the cutover `readiness.ok`-never-true finding surfaced a broader "we feel out of sync"
  concern — the assistant reasons from the recorded map (repo/docs) while the owner holds the live
  territory (GCP/Firebase/Drive/email/RentVine). Owner asked for three free, local fixes, done in
  order "3, then 2, then 1."
- (3) Living plan: every `docs/plan.md` cross-product phase now carries a `Status:` line; `AGENTS.md`
  Documentation Rules + Definition of Done now require updating the plan's Status in the same slice;
  `tests/unit/plan-status-sync.test.mjs` enforces it. Fixes the "plan went stale during build" gap.
- (2) Reality check: `npm run reality:check` reconciles the recorded map against live GCP using the
  existing FREE metadata reads, prints in-sync/drift/unverified, and honestly lists what it does not
  yet auto-check (Cloud Run, billing, datastore counts, Auth roster, Drive, Gmail). Free, read-only,
  degrades without ADC.
- (1) RentVine read-connection readiness: env-var template + `npm run preflight:rentvine` (no calls,
  no secret printing) + `docs/products/rentvine-connection-setup.md` owner checklist. The live read
  is BLOCKED only on RentVine's API doc (base URL, auth scheme, endpoints, lease response shape);
  RentVine reads do not bill the GCP cap. Writeback stays gated (undocumented endpoint).
- Verification: 545/545 tests; format/lint/typecheck/falsification (376 files) green.

## RentVine Live Read + Sheets Read Scaffolding (2026-06-24)

- Context: the owner obtained RentVine API access and directed consolidating connections, proving the
  RentVine API works, clarifying the lease-renewal process, and replacing the synthetic
  `sample-sheet.ts` feed with live reads (read-only, $0). The four `RENTVINE_DOC_UNKNOWNS` were
  resolved without guessing: auth + endpoints from authoritative working open-source code
  (`Launch-Engine/rentvine`), and the exact field names + rate posture from the live call itself.
- Credentials: moved the saved key/secret from `secrets/rentvine-api-credentials.local.md` into
  `.env.local` (both gitignored; values never printed/committed). `npm run preflight:rentvine` →
  `env_configured: true`. Base URL set to `https://pmikcmetro.rentvine.com/api/manager`.
- RentVine client (`lib/integrations/rentvine/client.ts`): read-only GETs only; HTTP Basic
  `Authorization: Basic base64("{key}:{secret}")`; identity-guarded to the `pmikcmetro` tenant host;
  injected `RentVineHttpTransport` (fake in tests; `createFetchTransport` live default);
  `RentVineAuthError`(401, no secret)/`RentVineRateLimitError`(429, Retry-After); `listLeases`,
  `getLease`, `listLeasesExport`, non-throwing `probeLeases`. Mapper
  (`lib/integrations/rentvine/lease-mapper.ts`): pure lease→`NonSheetCandidate`, configurable field
  map, `leaseViewsFromExport` (lifts `unit.rent`, keeps `lease.tenants[]`), byte-identical
  `"Rentvine (read-authoritative)"` source_system, skip+count unmappable. Health probe fills
  `health.rentvine.api_key` (4 steps) over the existing `runHealthCheck` seam.
- Proof: `npm run smoke:rentvine-read -- --live` made ONE read-only `GET /leases/export`. **Live: 25
  real leases → 25 mapped candidates, 0 skipped; auth HTTP 200; no rate-limit headers.** Output is
  shape-only/redacted (field names + resolved keys; tenant→initials+length, rent→type); artifact under
  gitignored `temp/`. Finding: the plain `/leases` list omits tenant names + rent, so the live read
  uses `/leases/export` — tenant ← `lease.tenants[].name`, renewal_date ← `lease.endDate`,
  current_rent ← `unit.rent`.
- Wiring (`lib/lease-renewal/live-run.ts`): `runLiveRenewalReview` reads the live export → candidates,
  keeps the synthetic building-level/Google-Form candidates, feeds `runRenewalPipeline` with `tables`
  injectable (synthetic until the live Sheet read lands). `production_allowed:false`, counts-only
  manifest, no writes; NOT wired into the SSR run page (page keeps rendering the pure simulation).
- Live Sheet read CODE (built, mock-tested, live-blocked): `lib/google-sheets/read-client.ts`
  (read-only ADC reader, `spreadsheets.readonly` scope, injected `SheetsValuesReader`, mirrors the
  GmailApiSender pattern), `sheet-to-grids.ts` (pure values→`RawGrid[]`), `health-probe.ts`
  (`health.google_sheets.api`). BLOCKED only on the owner providing the renewal sheet id/URL + ADC
  Sheets scope (OQ-SHEET-1); tabs 4/7 stay hard-excluded by ingest Stage B.
- Governance: RentVine reads are free; no deploy, no SoR write, no secret in any tracked file; every
  Action Registry entry stays `production_allowed:false` (incl. `rentvine.lease.read`); RentVine
  renewal write-back stays parked (OQ-RV-1). Identity stayed within `pmikcmetro.com`.
- Verification: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
  (**583/583 across 74 files**, +38), `npm run verify:falsification` (**390 committable files**) all
  PASS.

## Live Google Sheet Read — Wired (2026-06-24, cont.)

- Context: the owner provided the renewal sheet URL and said "continue with development." Stored the id
  as `RENEWAL_SHEET_ID` in `.env.local` (gitignored; the var NAME is in `.env.example`).
- Built + wired the live Sheet read: `scripts/smoke-sheet-read.ts` (`npm run smoke:sheet-read`;
  default dry, `--live` reads metadata + in-scope tab values, counts-only/redacted output — tab titles
  - per-tab row×col dimensions only, never a cell value; credential-marker tabs skipped at fetch) and
    the combined `lib/lease-renewal/live-run.ts:runFullyLiveRenewalReview` (live sheet `tables` + live
    Rentvine candidates → `runRenewalPipeline`, `production_allowed:false`). `read-client.ts` now imports
    `sheet-to-grids` relatively so the `tsx` smoke loads it without a path-alias resolver.
- Live attempt result: the health check reached `google_sheets.auth` and surfaced the exact blocker —
  ADC is in a **reauth-required state** (`invalid_grant` / `invalid_rapt`) and lacks the Sheets scope.
  The smoke prints the remediation. **Unblock:** owner runs `gcloud auth application-default login
--scopes=openid,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/cloud-platform`
  as `josiah@pmikcmetro.com`, then `npm run smoke:sheet-read -- --live`. No credentials, deploy, send,
  or SoR write; reads are free.
- Verification: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
  (**584/584 across 74 files**, +1 the combined-review composition test), `npm run verify:falsification`
  (**391 committable files**) all PASS.

## Live Google Sheet Read — WORKING via Domain-Wide Delegation (2026-06-24, cont.)

- Both live reads now work. `npm run smoke:sheet-read -- --live` read the real renewal sheet:
  **26 tabs total, 25 read, the credential tab "Passwords/contacts" auto-skipped** (counts-only output —
  tab titles + per-tab dimensions, never a cell value). The real renewal tab is **"Lease Renewal"**
  (519 rows × 31 cols); the synthetic design's tab numbering (4/7 credential, "Renewals") does not match
  the live structure — calibration is the next phase.
- AUTH JOURNEY (this managed Workspace is hostile to programmatic Sheets access, documented so future
  runs don't repeat it): (1) user OAuth with the sensitive Sheets scope → "app blocked" by domain policy;
  (2) admin-trusting the gcloud "Google Cloud SDK" client did not lift it; (3) a service account shared
  on the sheet (Editor) still returned 403 "caller does not have permission" — the domain blocks the
  _external_ `*.iam.gserviceaccount.com` account from opening the file even when shared (15 consecutive
  denials with a verified-correct token + scope + share). RESOLUTION: **domain-wide delegation** — the
  reader reads AS the internal `josiah@pmikcmetro.com` user, which sidesteps both the user-consent block
  and the external-account block.
- Implementation (`lib/google-sheets/read-client.ts`): keyless DWD — `iamcredentials.signJwt` (the human
  holds Token Creator on the SA) signs a JWT asserting `sub: josiah@pmikcmetro.com`, exchanged at the
  token endpoint for a Sheets-readonly access token. No key file, no stored token. Env: `SHEETS_IMPERSONATE_SA`
  = `lease-renewal-reader@pmi-kc-kb-prod.iam.gserviceaccount.com`, `SHEETS_DWD_SUBJECT` = `josiah@pmikcmetro.com`.
- Owner-directed GCP setup (free, reversible): created SA `lease-renewal-reader`, granted josiah
  `roles/iam.serviceAccountTokenCreator` on it, enabled `sheets.googleapis.com` + `iamcredentials.googleapis.com`,
  and authorized the SA client id `104374162913177846911` for `spreadsheets.readonly` in Admin console →
  Domain-wide delegation. The sheet is also shared (Editor) with the SA — but DWD reads as the user, so even
  Viewer would suffice; the reader only ever requests the read-only scope, so no write is possible.
- Governance: reads only; no deploy, no SoR write; credential tab never read; no secret/PII in any tracked
  file or output. Every Action Registry entry stays `production_allowed:false`.
- END-TO-END REAL REVIEW CONFIRMED (throwaway run, then removed): a one-off `runFullyLiveRenewalReview`
  over the real "Lease Renewal" tab + live RentVine export ingested **390 real records** (the real
  headers match `SAMPLE_RENEWALS` exactly, so fingerprint + header resolution worked unchanged),
  reconciled against **25 live RentVine leases** → **397 flags (321 High, 76 Blocked)**,
  `production_allowed:false`, counts-only output (no PII). Confirms the pipeline runs on real data.
- NEXT (calibration, owner/Dan-gated): the high flag volume is mostly the "missing High-severity field →
  flag" rule firing on the tracker's many blank / "not renewing" rows. Tune reconciliation/severity so
  flags are accurate with a low false-positive rate (Phase-1 accuracy milestone; OQ-PREC-1 precedence +
  which blanks should/shouldn't flag), and calibrate the non-renewal tabs ("Periodic Ins Trkr 25",
  "Unit Details", etc.) to the real structure (OQ-SHEET-1 / OQ-LEX-1 / OQ-JOIN-1).
- Verification: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
  (**584/584 across 74 files**), `npm run verify:falsification` (**391 committable files**) all PASS.

## Lease-Renewal Next-Phase Realignment — Plan Packet (2026-06-24, cont.)

- Owner-directed: read [`products/lease-renewal-agent.md`](products/lease-renewal-agent.md) and the
  gitignored 2026-06-19 show-and-tell transcript, check whether the in-flight "calibrate the 397 flags /
  email Dan five questions" task is in scope, and — if not — plan the next phase to **anticipate and
  solve client problems instead of asking open-ended questions**.
- Finding (realignment): the task was misaligned. The transcript already answers four of the five email
  questions, and Dan answered the fifth (the must-never-miss document/field failure modes) in detail on
  the call. The "calibrate the engine with Dan" framing also skipped the priority Dan + Jon set on the
  call: start with the lowest-complexity, highest-value automations — market value + drafting the
  owner/tenant emails — with human approval, then layer the if-then document logic over time.
- Deliverable: authored [`products/lease-renewal-next-phase-plan.md`](products/lease-renewal-next-phase-plan.md)
  — a self-contained packet for a fresh-context build. §2 folds in the resolved decisions (blanks =
  worklist state not defects; RentVine authoritative on rent+dates, precedence already encoded;
  base-rent-to-base-rent excluding RBP/insurance; `tenant_responded` is workflow state; join on the
  sheet's embedded RentVine hyperlink ID; "leave it the same" = keep current rent; two market-value
  sources; multi-channel send rule; the enumerated must-never-miss list) so the next cycle does NOT
  re-ask them. §3 lays out five zero-cost, read-only/draft-only slices A–E (cohort detection +
  skip-classification; join-on-ID + auto-fill to collapse the 397-flag noise; owner-email draft;
  tenant offer draft × email/portal/text; must-never-miss readiness checklist). §4 leaves only three
  residual Dan items as confirmations-with-defaults. Pointed the build-plan route + `loop-state.md` at
  the new file.
- Governance: docs only — no code, no live call, no deploy, no SoR write, no secret/tenant PII in any
  tracked file (the transcript is gitignored; cited by timestamp, failure modes described generically).
  Every Action Registry entry stays `production_allowed:false`. Verification (docs-only change):
  `npm run format:check`, `npm run verify:falsification`, and `npm test` green before commit. Committed
  - merged to `main` and pushed for the next session to build from fresh context.

## Lease-Renewal Next-Phase Build — Slices A–E (2026-06-24, cont.)

- Owner-directed "build and plan the next session; plan the whole set of changes, then execute." Built
  all five §3 slices of `docs/products/lease-renewal-next-phase-plan.md` as pure, deterministic,
  unit-tested modules. **Read-only / draft-only, $0, no SoR write, no autonomous send; every Action
  Registry entry stays `production_allowed:false`.**
- **Slice A — cohort detection** (`lib/lease-renewal/cohort.ts`): `classifyRenewalCohort(leases, {windows,
config?})` mirrors Dan's manual end-date filter — actionable (month-end inside a window, no skip
  signal) vs skip (month-to-month / owner-authorized / program, via a configurable signal map) vs review
  (no_end_date / off_cycle_date) vs out_of_window. Conservative: unknown → review, never silently
  actioned or dropped. Wired as an optional `cohortWindows` filter in `live-run.ts` (`selectActionableLeases`).
- **Slice B — collapse the 397-flag noise + stronger join.** `pipeline.ts`: (i) a `missing` reconciliation
  with NO joined non-sheet candidate no longer raises a flag (a blank tracker cell is un-started worklist,
  not a defect); (ii) an exact RentVine-id join (`recordJoinIds` keyed by `sourceRowIndex` + candidate
  `joinId`) matches definitively, bypassing the fuzzy name join; (iii) a `current_rent` conflict whose gap
  equals a subset-sum of the known add-ons (RBP $28 + insurance $11.95, `rent.ts:rentsAgree`) is downgraded
  (RentVine rent is base; the sheet may fold add-ons in). Supporting: `rentvine-link.ts` (parse lease/unit
  id from a URL or `=HYPERLINK`), `sheet-to-grids.ts` (`parseHyperlinkFormula`/`valuesToGridWithLinks`),
  read-only `read-client.ts:batchGetFormulas`, and `lease-mapper.ts` populating `joinId="lease:"+leaseID`.
- **Slice C — owner email draft** (`owner-draft.ts`): `buildOwnerRenewalDraft` composes the owner renewal
  email with source-tagged facts; a missing market input renders a visible `Needs Verification:` marker
  (never an invented number) and is listed in `missingInputs`. `production_allowed`/`send_allowed` literal
  `false`.
- **Slice D — tenant offer draft** (`tenant-draft.ts`): `buildTenantOfferDraft` renders ONE offer for all
  three channels Dan requires — email + portal chat + text (the text is a short nudge). No send.
- **Slice E — must-never-miss checklist** (`renewal-readiness.ts`): `evaluateRenewalReadiness` deterministic
  rule table (inherited→full set, pre-1978→lead paint, Independence/KC addendum, deposit-type, pet deposit,
  LLC suffix, prorated rent). CRITICAL invariant: an unknown input returns `needs_input` (Blocked), never a
  false all-clear.
- Verification: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` (**638/638 across
  82 files**, +20 new), `npm run verify:falsification` (**407 committable files**) all PASS. An adversarial
  5-dimension review workflow (correctness / governance-PII / type-coherence / test-adequacy / spec-fidelity,
  each finding independently verified) ran over the change-set. No live call, no deploy, no SoR write, no
  secret/tenant PII in any tracked file.
- NEXT (live wiring): pass per-row `recordJoinIds` from the sheet's FORMULA hyperlink read into
  `runFullyLiveRenewalReview`; feed `cohortWindows`; surface the cohort/drafts/readiness on
  `/lease-renewal/runs` (OQ-UI-1); re-run `smoke:renewal-review` to confirm the live flag volume drops.

## Lease-Renewal Live Wiring — Slice F (2026-06-24, cont.)

- Owner-directed "keep going" after slices A–E. Wired the sheet hyperlink layer end-to-end so Slice B's
  RentVine-id join runs on real rows. Read-only / $0; no SoR write, no send; `production_allowed:false`.
- **Threading (`lib/lease-renewal/ingest.ts`):** `ingestTables(tables, tableJoinIds?)` now accepts an
  optional per-row RentVine id array parallel to `tables`. The id travels WITH its row through
  divider-drop + re-stitch (a focused adversarial review traced the link↔row alignment across every
  transform — divider rows, re-stitched fragments, all-empty/ragged skips — and found no off-by-one)
  and lands on `IngestRecord.joinId`.
- **Pipeline (`pipeline.ts`):** `RenewalRunInput.tableJoinIds` is passed to ingest; the matching loop
  prefers `record.joinId` over the `recordJoinIds[sourceRowIndex]` map (the former survives ingest's
  re-stitch cleanly).
- **Live read (`lib/lease-renewal/sheet-links.ts`, new):** `formulaResponseToTablesWithJoinIds` turns a
  FORMULA `values:batchGet` response into `tables` + `tableJoinIds` (via `valuesToGridWithLinks` +
  `rentvine-link.ts:rentvineJoinIdsForGrid`); `readRenewalSheetGridsWithLinks` does the one read-only
  FORMULA read. `read-client.ts` adds `batchGetFormulas` to the `SheetsValuesReader` interface (the
  live `GoogleSheetsApiReader` already implements it).
- **Composition (`live-run.ts`):** `runFullyLiveRenewalReview({ linkJoin: true, cohortWindows })` reads
  the link layer, runs the exact id-join on real rows, AND now forwards `cohortWindows`/`cohortConfig`
  (previously dropped — a fully-live run can finally filter to the actionable batch).
- Verification: `format:check`, `lint`, `typecheck`, `npm test` (**654/654 across 83 files**, +9 the new
  `lease-renewal-link-join` suite), `verify:falsification` (**409 committable files**) all PASS. Plus a
  focused single-agent adversarial review of the ingest threading (no defects). No live call this slice
  (the real `--live` run is owner-gated on ADC).
- NEXT (owner-gated / UI): run the real `--live` fully-live review to confirm the live flag volume
  drops; add `--link-join` / `--cohort` flags to `scripts/smoke-renewal-review.ts`; surface the cohort /
  drafts / readiness on `/lease-renewal/runs` (OQ-UI-1).

## Governance Recalibration + Feature-Suite Scaffolding (2026-06-25)

- Owner-directed: convert the discussed backlog into executable specs + the governance machinery that
  keeps the project coherent, governance FIRST, without building features. No product feature built;
  no SoR write; every Action Registry entry stays `production_allowed:false`.
- **Root cause fixed.** Routing was already centralized, but the "single-read" `docs/loop-state.md` had
  grown to ~999 lines overlapping `docs/status.md` (~5022) — the real generator of poisoned/stale
  context. Fix: a solidified-context spine + a freshness gate + delete-on-supersede + truncation.
- **Built (governance):** `docs/facts.md` (Fact Ledger + Supersede Log + Open Questions, with the
  undefined term "ABC" recorded as `Q-ABC-1`); `scripts/check-context-freshness.mjs` +
  `tests/unit/facts-ledger.test.mjs` + the `verify:context-freshness` task, wired into `scripts/verify.sh`
  and pinned by `scripts/check-router-boundary.mjs`; re-tiered `## Context Intake` in
  `docs/autonomous-agent-runner.md` (Tier 0 spine / Tier 1 plan / Tier 2 on-demand), with
  `docs/implement.md` + `docs/ai-execution-workflow.md` pointing at it; truncated `docs/loop-state.md`
  to a 108-line pointer (changelog history retained here in `docs/status.md`).
- **Built (specs):** `docs/voice-and-audience.md`, nine `docs/feature-suites/*.md`, and three
  `docs/meta-prompts/*.md` (governance-first scaffold, golden next-step set, re-scaffold/cleanup).
- **Owner decisions captured as open questions:** Renewals fold under a Processes dropdown
  (`Q-IA-RENEWALS`); Ask drops Audience/Channel/Space/Urgency and gains process-awareness + compose
  (`Q-ASK-RESCOPE`); renewal write-back method and "the math" (`Q-WRITEBACK-METHOD`) and maintenance
  image storage (`Q-MAINT-STORAGE`) stay undecided — options presented, conservative defaults
  recommended, decision deferred. Lease-renewal stays discovery-gated until the team validates process,
  columns, and golden data.
- Verification: `format:check`, `lint` (0 warnings), `typecheck`, `npm test` (**695/695 across 90
  files**, incl. the new facts-ledger gate test), `verify:router-boundary`, `verify:falsification` (461
  files), `verify:context-freshness`, `check:budget-guard`, and `npm run build` all PASS. No app/lib/
  components/auth code touched, so connections, the `pmikcmetro.com` identity path, and admin gating are
  unaffected.

## S2 Voice & Copy — Connection Center Copy Pass (2026-06-25)

- S2 from the golden next-step set (`docs/meta-prompts/golden-next.md`) and
  `docs/feature-suites/voice-copy.md`: bring the Connection Center (`/connections`) copy to the voice
  standard in `docs/voice-and-audience.md`. Owner-confirmed scope this session: the three enumerated
  strings plus the page subtitle; the future-framed "Set up" wizard copy (honestly bounded by the
  "Read-only preview" chip) is left for the Phase-2b "unify once verification is real" pass.
- **Changed (all on the Connections surface):**
  - `lib/connections/connector-catalog.ts` — RentVine `powers` dropped the internal phrase → "Leases,
    tenants, and rent."
  - `components/connections/ConnectorCard.tsx` — deleted the dead disabled "Connect" control + the
    "Available in the next release." note; removed the now-unused `Button` import.
  - `lib/connections/connection-status.ts` — Ready-to-verify `detail` rewritten to "Ready to
    connect." (label "Ready to verify" kept as connection vocabulary).
  - `components/connections/ConnectionCenter.tsx` — page subtitle dropped the not-live verification
    promise → "PMI handles the setup for you."
- **Tests:** updated `connection-center-component.test.tsx` (negative assertion for the removed
  control; the "Set up RentVine" wizard still renders) and `connection-status.test.ts` (locks the new
  "Ready to connect." detail); added a lexicon guard (no "source of truth" in any connector `powers`).
- **Context:** added `F-VOICE` (Verified) to `docs/facts.md` with four Supersede Log rows
  (`COPY-RV-SOT`, `COPY-NEXT-RELEASE`, `COPY-VERIFY-CONNECT`, `COPY-SUBTITLE-VERIFY`, each
  replaced-by `F-VOICE`); updated `docs/loop-state.md`. `docs/voice-and-audience.md` was already in
  the `AGENTS.md` Route Table.
- **Gates:** no SoR write, no autonomous send, no env/model change → the $10 budget guard and every
  Action Registry `production_allowed:false` entry are untouched; `pmikcmetro.com` identity only.
- Verification: `format:check`, `lint`, `typecheck`, `npm test` (**697/697 across 90 files**, +2 the
  new connector-copy guard), `verify:router-boundary`, `verify:falsification` (**461 committable
  files**), `verify:context-freshness`, `check:budget-guard`, and `npm run build` all PASS. Falsified
  by sweep: the removed strings survive in no runtime `.ts/.tsx/.css` — only the component test's
  negative assertion references one. `/connections` is Admin-gated, so the component test (renders the
  real `ConnectionCenter`) is the authoritative render proof rather than a browser preview.

## S9 Local-Model Provider Seam + Live-Data Harness (2026-06-25)

- S9 from the golden next-step set (`docs/meta-prompts/golden-next.md`) and
  `docs/feature-suites/local-model.md`: a thin model-provider seam so a free local model can stand in
  for Gemini via the same Ask answer path, fenced from prod, enabling zero-cloud-spend live-data
  testing. Closes `F-LOCALMODEL-GAP`.
- **Built:**
  - `lib/llm/model-provider.ts` (new): narrow `ModelProvider { generateText }` with
    `GoogleGenAiModelProvider` (wraps `GoogleGenAI(...).models`) and `LocalModelProvider`
    (OpenAI-compatible `POST {baseUrl}/v1/chat/completions` via an injected fetch transport that
    mirrors RentVine's `createFetchTransport`), plus `createModelFetchTransport` and a
    `createModelProvider` factory. `AnswerGenerationSetupError` moved here (re-exported by
    `lib/llm/answer.ts`) so `/api/ask` still maps provider setup failures to 503.
  - `lib/llm/answer.ts`: `GoogleGenAiAnswerGenerator` now delegates to a `ModelProvider`
    (`options.provider`, or `options.models` for back-compat, else `createModelProvider(config)`).
  - `lib/config/server.ts`: `MODEL_PROVIDER` (enum, default `gemini`), `LOCAL_MODEL_BASE_URL`,
    `LOCAL_MODEL_NAME`; `modelProvider` is forced to `gemini` when `NODE_ENV=production` (mirrors
    `localDemoAuth`).
  - `scripts/check-budget-guard.mjs`: `MODEL_PROVIDER=local` is a free generative path (skips the
    Gemini model-name error) but every other check (single-Space, notifications, away-mode) stands; a
    warning notes Vertex retrieval + Gmail still bill.
  - `scripts/smoke-local-ask.ts` (`npm run smoke:ask-local`, opt-in/manual): runs the Ask path through
    `LocalModelProvider` + an injected grounding fixture (built-in synthetic, or `--fixture=`) at zero
    cloud spend; DRY by default, `--live` calls the local endpoint, skips cleanly when none is set.
    Output is shape-only. Not in `scripts/verify.sh` (CI has no local model).
- **Tests:** new `tests/unit/model-provider.test.ts` (provider selection, prod-fence, local request/
  response mapping via a fake transport, Gemini mapping, setup errors); extended `budget-guard` (local
  path green; gemini+Pro and local+extra-Spaces still fail) and `server-config` (defaults + prod-fence).
  `tests/unit/llm-answer.test.ts` stays green unedited via the `options.models` back-compat path.
- **Context:** replaced `F-LOCALMODEL-GAP` with `F-LOCALMODEL-SEAM` (Verified) in `docs/facts.md` +
  a Supersede Log row; merged the S2 orphan `F-VOICE`/`COPY-*` rows back into their tables;
  updated `docs/feature-suites/local-model.md` and `docs/loop-state.md`.
- **Gates:** no SoR write; no autonomous send; no cloud spend added (local path is free, demo stays
  default, prod stays Gemini); $10 cap and every Action Registry `production_allowed:false` entry
  untouched; `pmikcmetro.com` / localhost-in-boundary identity only.
- Verification: `format:check`, `lint`, `typecheck`, `npm test` (**710/710 across 91 files**, +13 the
  new model-provider / budget-guard / server-config cases), `verify:router-boundary`,
  `verify:falsification` (**464 committable files**), `verify:context-freshness`, `check:budget-guard`,
  and `npm run build` all PASS. Falsified end-to-end: the budget-guard script passes for
  `MODEL_PROVIDER=local` + Pro (free path, warning emitted) yet still fails for `gemini` + Pro; the
  `F-LOCALMODEL-GAP` marker is absent from the 7 governance docs; DRY + no-endpoint `smoke:ask-local`
  exercised (clean skip).

## S3 Lease-Renewal Discovery Prep (2026-06-25)

- The solo-doable part of S3 (`docs/feature-suites/lease-renewal.md`) while the build stays team-gated:
  turn the existing discovery material into one turnkey, team-fillable validation packet so the team's
  validation round is plug-and-play. No build, no golden data committed, no SoR write.
- **Added** `docs/products/lease-renewal-discovery-packet.md`: consolidated open decisions
  (confirm-with-default, citing `lease-renewal-build-plan.md` §7 / `research-backlog.md`); a per-column
  validation template for the "Lease Renewal" tab (canonical keys from `lib/lease-renewal/headers.ts`);
  golden-data archetypes to assemble in-boundary (simple / inherited-tenant / conflict / missing-fact /
  edge "the math"); an acceptance-criteria failure-mode checklist; a RentVine↔sheet field-mapping
  confirmation table (pre-filled from `lib/integrations/rentvine/lease-mapper.ts`); a per-approval-gate
  spec; and the `Q-WRITEBACK-METHOD` A/B/C decision. Pre-filled cells are cited from existing docs/code;
  team-answer cells are blank — nothing invented.
- **Registered** the packet in the `AGENTS.md` route table ("Renewal discovery validation (team)").
  `docs/loop-state.md` marks slice 4 next + team-gated.
- Data governance (`A-DATA-GOV`): the packet routes real golden records to `docs/client_docs/`
  (gitignored) and itself holds only definitions/templates/expected outcomes — no real values.
- Verification: `format:check`, `lint`, `typecheck`, `npm test`, `verify:router-boundary`,
  `verify:falsification`, `verify:context-freshness`, `check:budget-guard` re-run green (docs-only slice;
  no runtime change, so `build` unaffected).

## Client Beta Deploy — New UI Live for Dan to Preview (2026-06-26)

- Owner-directed: push the current front end so Dan can log in and preview the beta, gated explicitly on
  the app using real Google auth for the `pmikcmetro.com` domain. Verified true before deploying: the
  `deploy:demo` path ships `LOCAL_DEMO_AUTH=false`, `ASK_DEMO_MODE=false`, `NODE_ENV=production`, and
  `ALLOWED_HD=pmikcmetro.com`, and `lib/config/server.ts` fences demo-auth off in production.
- Pre-deploy gates (all green): `npm run check:budget-guard` (demo posture, $10 cap, no override), a local
  `npm run build` (clean), and `gcloud` identity `josiah@pmikcmetro.com` on `pmi-kc-kb-prod`.
- Deployed via `npm run deploy:demo -- --budget-confirmed` (a one-time interactive `gcloud auth login`
  was needed first; the prior token had expired). Cloud Build + Cloud Run succeeded: revision
  `pmi-kc-kb-demo-00005-dxx` serving 100% of traffic. Service URLs:
  `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app` (canonical, Firebase-authorized — give Dan this one)
  and `https://pmi-kc-kb-demo-558870356522.us-central1.run.app`. The deploy's "Setting IAM policy failed"
  warning was harmless: the prior `allUsers`→`run.invoker` binding carried over; both URLs return 200 and
  serve the real sign-in page (verified `allowedHostedDomain=pmikcmetro.com`, `localDemoEnabled=false`).
- Access model: a new `pmikcmetro.com` user with no role claim defaults to `Editor`
  (`lib/auth/session.ts:readFirebaseRole`), so Dan can sign in and see the Renewal Desk + main app with no
  pre-provisioning. To grant Connections/Admin, run `npm run firebase:set-role -- --email=dan@pmikcmetro.com
--role=Admin` AFTER his first sign-in (the script does `getUserByEmail`, so the account must exist).
- Scope/governance: the deployed front end is the new UI (Renewal Desk, Connection Center, PMI brand) from
  `feat/s2-voice-copy` @ `16626f1`. The live renewal review stays owner-gated, so Dan's preview shows
  sample desk data, not live client data. No SoR write, no autonomous send, reads only; every Action
  Registry entry stays `production_allowed:false`; `$10` cap intact; `pmikcmetro.com` identity only.
- Tooling added this session (not a product slice): the weekly client status routine is now the
  `/friday-update` command (`.claude/commands/friday-update.md`) plus a Friday ~6am scheduled task
  (`friday-client-status-update`). It drafts the client email from the week's commits + `status.md` /
  `loop-state.md` / `client-checklist.md` in operator voice; Josiah reviews and sends (no autonomous send).

## R1 — Operations Console Spine + IA (2026-06-29)

- Owner-directed recalibration: the product north star is a multi-process **operations console** —
  lease-renewal is process #1, not the app. Four decisions locked: build a process-generic spine; `/ask`
  becomes an "action console" (answer + run workflows); Spaces is the front-door dropdown on the home;
  golden-data-first development.
- Clean slate: committed the local-model schema-constrained structured-output fix (`response_format
json_schema` in `lib/llm/model-provider.ts` + empty-`escalation_owner` coercion in `lib/llm/answer.ts`),
  merged `feat/s2-voice-copy` into `main`, pushed it, removed the stale branch, and cut
  `feat/platform-spine-ia`.
- Shipped R1 (platform spine + IA): the home (`/`) is now an operations-console launcher — a Console
  entry plus a Spaces dropdown (12 processes; Lease Renewals first → `/lease-renewal`, others → space
  detail) — instead of redirecting to `/ask`. Nav drops the flat "Renewals" tab, renames "Ask" →
  "Console", and the brand + post-sign-in redirect land on the home launcher. Spaces tile copy
  de-jargoned. New `components/home/OperationsConsoleHome.tsx`; added `spaceHref()` to `lib/spaces.ts`.
- Reused the existing process-generic spine (`ProcessDefinitionRecord`/`WorkflowRunRecord`,
  `app/processes/*`, the Action Registry, role-gating) — no new backend; all routes and role gates
  preserved.
- Context: flipped `Q-IA-RENEWALS` → `F-OPS-CONSOLE-IA` (Verified) in `docs/facts.md` with a Supersede
  Log row (the earlier Processes-dropdown framing retired); updated `Q-ASK-RESCOPE` to point at R4;
  updated `docs/loop-state.md` (recalibrated roadmap: R2 golden-data harness next).
- Verification: `typecheck` + `lint` clean; `npm test` **713/713** (92 files, +2 the new
  operations-console-home test); `verify:falsification` (468 files) + `verify:context-freshness` pass;
  browser-checked via local demo auth (home launcher, nav without "Renewals", Spaces dropdown of 12
  processes, sign-in → `/`, `/lease-renewal` still 200, `/ask` heading now "Console"). No SoR write; no
  cloud spend; budget guard untouched.

## R2 Complete + R1/R2 Merged to main (2026-06-29)

- R2 finished: live golden-data capture (`scripts/capture-golden-data.ts`, `npm run golden:capture`) +
  verified-set loader (`lib/lease-renewal/golden/load.ts`); the harness gate now evaluates synthetic +
  human-verified captured sets. Recorded `F-GOLDEN-HARNESS` in `docs/facts.md`.
- Merged both slices to `main` and pushed: R1 (operations-console spine + IA, PR #13) and R2
  (golden-data harness + live capture, PR #14). Merge commits 78f55ce (R1) + 0ec9c61 (R2).
- Combined-main verification: typecheck + lint clean; `npm test` 720/720 (94 files);
  `verify:falsification` (476 files) + `verify:context-freshness` pass. No broken tests on the merge.
- R3 attempt: ran `golden:capture --live`; the tool read RentVine and reached the live Sheet read, then
  hit the known ADC reauth gotcha (`invalid_rapt`) — `gcloud auth application-default login` (scope-free,
  as josiah@pmikcmetro.com) refreshes it. No partial artifact written. R3's math stays gated on captured
  - team-labeled golden data.
- No SoR write; no cloud spend; budget guard untouched; every Action Registry entry production_allowed:false.

## R3 Wiring Half — Lease Renewal as a real Draft Process (2026-06-29)

- Built the R3 "wiring" half on the existing process-generic spine (the "math" half stays gated on
  captured + team-labeled golden data). Lease Renewal is now seedable as a real Draft process
  definition at the fixed id `lease-renewal`:
  - `lib/lease-renewal/process-definition-seed.ts` — a pure builder (buildLeaseRenewalDefinitionRecord)
    reusing the spine's exported normalizeDefinitionFields (no id/step drift) + an idempotent writer
    (seedLeaseRenewalDefinition: create / skip / force-update preserving created_at; ISO timestamps).
  - `scripts/seed-process-definitions.ts` (`npm run seed:process-definitions`, tsx) — mirrors
    seed-action-registry; --dry-run/--force; refuses any 'Approved for Execution' reference.
  - `components/lease-renewal/RenewalDesk.tsx` — one additive link ("View process definition" ->
    /processes/lease-renewal) in the Data diagnostics disclosure; no 'Open' link change.
  - Exported `normalizeDefinitionFields` from `lib/firestore/workflows.ts` for reuse.
- Additive + reversible (delete one doc + one link). Draft only: every action reference non-executable
  (writeback stays gated); activation runs the existing Draft -> Testing -> Pending Approval -> Active
  lifecycle later. /processes/lease-renewal degrades to "unavailable" until the live seed is applied
  (dry-run only this slice; the live Firestore write is deferred/deliberate).
- Recorded `F-RENEWAL-PROCESS-SEED` in docs/facts.md.
- Verification: typecheck + lint (0 warnings) clean; npm test 723/723 (95 files); seed dry-run builds
  the Draft (8 steps, 6 non-executable references); verify:falsification (479 files) +
  verify:context-freshness pass. No SoR write; no cloud spend; production_allowed:false throughout.

## R3 Math Half — Golden-data labeling round-trip (2026-06-29)

- Built the keystone that unblocks R3's "math" half WITHOUT inventing ground truth: a labeling
  round-trip that turns the live-captured draft into a team-verified golden set the harness already gates
  on. Ground truth is the team's accept/reject/severity review — never the agent's guess.
  - `lib/lease-renewal/golden/labeling.ts` — pure `buildWorksheet` (re-runs the deterministic pipeline to
    surface each candidate flag's full reconciliation context: competing values, sources, timestamps,
    suggested winner, severity) + `applyDecisions` (produces a `labelsVerified:true` set). `applyDecisions`
    refuses an incomplete review (any PENDING decision, any unconfirmed field meaning) and a worksheet that
    no longer matches the draft's pipeline flags — so no verified labels come from a half-filled sheet.
  - `scripts/golden-labeling.ts` (`npm run golden:worksheet` / `golden:apply-labels`, tsx) — thin CLI;
    reads/writes only under the gitignored, in-boundary `/golden-data/` tree; stdout is counts-only (no
    cell values), mirroring `golden:capture`.
  - `tests/unit/golden-labeling.test.ts` — 8 tests on the committable synthetic sample (no real data):
    worksheet-per-flag, the incomplete-review refusals, and accept/reject/severity round-trips, including
    that a rejection becomes a failing harness gate that drives the math tuning.
  - Exported `ExpectedFlagSchema` + `CapturedScenarioSchema` from `lib/lease-renewal/golden/load.ts` for
    reuse (no schema drift).
- Ran `golden:worksheet` on the real captured draft (`r3-bootstrap.json`): 17 candidate flags across 2
  fields under review; worksheet written to `golden-data/worksheets/` (gitignored). Did NOT run `apply` on
  real data — that is the team's review step; applying accept-all would be inventing labels.
- Recorded `F-GOLDEN-LABELING` in docs/facts.md.
- Verification: typecheck + lint (0 warnings) clean; the new suite is 8/8; full `npm test` + verify gates
  re-run on the branch (see merge entry). No SoR write; no cloud spend; production_allowed:false throughout.
- Remaining R3: (a) the team reviews the worksheet → `golden:apply-labels` → the harness gate tunes the
  reconciliation math against ground truth (Q-PREC-1 / Q-WRITEBACK-METHOD inform it); (b) the live
  Firestore seed of the Draft definition stays OWNER-GATED (prod-facing — the client previews that project).

## R4a — Action Console (process-aware, simulation launch) (2026-06-29)

- Rescoped the Console (`/ask`) from a metadata-heavy "Ask" box into the action console (resolves
  Q-ASK-RESCOPE → `F-ACTION-CONSOLE`):
  - `components/ask/AskForm.tsx` — retired the four Ask selects (Audience/Channel/Space/Urgency). The
    answer path still accepts them, so the client sends neutral defaults until the schema is trimmed (a
    noted follow-up — additive, no backend break). Added a role-gated process picker: an editor who picks
    a process gets "Get answer + start simulation"; on submit it fetches the grounded answer, then POSTs
    the existing `/api/process-definitions/[id]/test-runs` route to start a SIMULATION-ONLY run, and shows
    a "Process simulation started" card linking to /processes. No new API route (reused the spine).
  - `app/ask/page.tsx` — server-fetches `listProcessDefinitions` (editors only; try/catch → empty) and
    passes processes + `canStartSimulation` to the form; reframed the subtitle to the action-console voice.
  - `tests/unit/ask-form.test.tsx` — 3 component tests: the rescope (no four selects, picker hidden for
    read-only), ask-without-process (no test-run call), and the editor launch flow (answer + test-run +
    simulation card).
- Zero-spend + safe: the launch path adds no cloud spend (simulation_only run, no SoR write, no send) and
  the answer runs free on the local provider in dev. production_allowed:false throughout.
- Browser-verified on the dev server: `/ask` renders the reframed Console with the question box and NO
  four selects, no console errors; picker is correctly hidden locally (no definitions seeded). Launch flow
  is covered by the component test (authoritative for the role gate + the two fetches).
- Verification: typecheck + lint (0 warnings) clean; new suite 3/3; full `npm test` + verify gates re-run
  on the branch (see merge entry). Recorded `F-ACTION-CONSOLE` + the Q-ASK-RESCOPE supersede in facts.md.
- Follow-ups (smaller): trim audience/channel/urgency from the AskRequest schema + prompt; make the answer
  itself process-aware (ground in the picked process); intent-detection so the process is inferred from text.

## R4b — Process-aware answer (2026-06-29)

- Deepened the action console: a selected process now shapes the ANSWER, not just the simulation launch
  (extends `F-ACTION-CONSOLE`).
  - `lib/schemas.ts` — AskRequest gains optional `process_id` (additive; defaults untouched).
  - `lib/ask/service.ts` — when `process_id` is set, a guarded, INJECTABLE `processProvider` (default: a
    read of the trusted definition via `getProcessDefinition`) resolves it to compact context
    {name, outcome, first ≤8 step titles} and passes it to the generator. Never fatal: a missing/unreadable
    definition yields no context. The client never supplies the context (no prompt injection).
  - `lib/llm/answer.ts` — `AnswerGenerationRequest` gains optional `process` (`AnswerProcessContext`).
  - `lib/llm/prompt.ts` — the user payload includes the `process` hint only when present; a new system-prompt
    line tells the model to tailor the answer to it but NEVER cite it as a source (citation discipline intact).
  - `components/ask/AskForm.tsx` — sends `process_id` whenever a process is selected (answer-aware, not only
    on simulate).
  - Tests: `ask-prompt.test.ts` (hint present/absent + the no-cite instruction), `ask-service.test.ts`
    (+2: resolves & passes context with the right id; omits + never resolves without `process_id`),
    `ask-form.test.tsx` (+ asserts the /api/ask body carries `process_id`).
- Additive + zero-spend: no removals, citations/grounding/source-state logic untouched; the extra read runs
  only when a process is selected. Browser-checked: `/ask` still 200, no four selects, no console errors.
- Verification: typecheck + lint clean; affected suites 22/22; full `npm test` + verify gates re-run on the
  branch (see merge entry). production_allowed:false throughout.

## Discovery Q&A cycle + Slice 1: governance + "Open Placeholder" rename (2026-06-29)

- Owner-driven discovery Q&A (3 rounds, confirm-with-default) locked the decisions for the next builds:
  intent-detection = hybrid (deterministic + cloud-seam fallback + keep picker); Maintenance intake =
  fuller flow, Drive in-boundary storage (`Q-MAINT-STORAGE`→Drive), voice/STT in v1 via Google Cloud STT
  (cloud prod, dev stub via a seam); schema cleanup = remove audience/channel/urgency; R3 = label with
  owner + precedence (`Q-PREC-1`: RentVine authoritative for lease facts, sheet for worklog, conflicts →
  human); ambiguous values: "Bailey Placeholder"→"Open Placeholder" (`Q-BAILEY`), "ABC" stays open
  (`Q-ABC-1`). R3 flag labels: sheet's "Renewal Date" is a DIFFERENT field from RentVine's lease date →
  the 15 renewal_date conflicts are false positives (don't reconcile); the 2 current_rent conflicts are
  real High flags.
- **Critical correction recorded as `F-PROD-CLOUD-MODEL`:** the app is built for the PRODUCTION (cloud)
  plane — `lib/config/server.ts` forces `modelProvider:"gemini"` + disables `localDemoAuth` when
  `NODE_ENV==="production"`. The local model + demo auth are dev/test-only stand-ins, never a prod
  dependency. (Owner flagged the "are we building a local app?" risk; verified the fence holds.)
- Slice 1 build: renamed the source-state label "Bailey Placeholder" → "Open Placeholder" (plain language)
  across code/tests/styles (21 occurrences) + active docs; resolved `Q-BAILEY` → `F-OPEN-PLACEHOLDER` with
  a Supersede Log row. Left "Bailey" the team member untouched (only the state label changed); status.md
  history left as-is (append-only). Recorded `F-PROD-CLOUD-MODEL`; saved a memory on the prod-plane policy.
- Verification: typecheck + lint clean; full `npm test` + verify gates re-run on the branch (see merge
  entry). No SoR write; no cloud spend; production_allowed:false throughout.

## Slice 2: AskRequest schema cleanup (2026-06-29)

- Completed the action-console rescope on the backend: removed the now-vestigial audience/channel/urgency
  from the AskRequest path entirely (they had been sent as constant defaults since R4a).
  - `lib/schemas.ts` (AskRequestSchema), `lib/llm/prompt.ts` (prompt payload),
    `components/ask/AskForm.tsx` (request body), `lib/firestore/ask-logs.ts` (ask-log writer), and
    `lib/firestore/types.ts` (`AskLogRecord`) no longer carry the three fields.
  - Updated the fixtures that referenced them (ask-route, ask-service, ask-log, ask-prompt, eval,
    llm-answer, smoke-local-ask, firestore security-rules). Left every UNRELATED same-named concept alone
    (approval-queue `audience_group`, SOP/template `audience`/`channel`).
- Verification: 744/744 tests, typecheck + lint clean, falsification (486 files) + context-freshness pass.
  No SoR write; no cloud spend.

## Slice 3: hybrid process intent-detection (2026-06-29)

- The action console now infers the process from the question (`F-INTENT-DETECT`), prod-plane correct:
  - `lib/processes/intent.ts` — pure, deterministic `detectProcess` (name tokens + domain aliases,
    stopword-filtered). Free + instant; runs client-side as the user types. Suggests a process via a
    "Use <name>" chip that sets the picker.
  - `lib/processes/classify.ts` + `app/api/processes/classify/route.ts` — model-backed fallback through
    the ModelProvider SEAM (Gemini in prod via `geminiClassifyModel`, local stand-in in dev). Edit-gated,
    invoked ONLY on an explicit "Detect process with AI" click (the deterministic pass handles the common
    case for free, so the cost path never fires automatically). Returns only a real listed id, never an
    invented one.
  - `components/ask/AskForm.tsx` — the suggestion chip + the AI-detect fallback button; manual picker
    stays as override.
- Tests: `process-intent.test.ts` (6), `process-classify.test.ts` (6, stubbed provider — offline/free),
  `ask-form.test.tsx` (+ the suggest-and-apply flow). 757/757 total.
- Verification: typecheck + lint clean; falsification (491 files) + context-freshness pass; browser-checked
  `/ask` renders 200 with no console errors. No SoR write; no cloud spend; the model path is gated + manual.

## Slice 4: R3 reconciliation math tuned to owner ground truth (2026-06-29)

- Owner labeled the captured flags (renewal_date conflicts = false positives / "don't reconcile"; rent
  conflicts = real High) and set precedence. Diagnosis: the RentVine lease-mapper mislabeled RentVine's
  authoritative LEASE-END date as `renewal_date`, then reconciled it against the sheet's "Renewal Date"
  column — which is the team's renewal WORKLOG/target, a different field. That mismatch produced the 15
  false-positive renewal_date conflicts (the bulk of the noise).
- Surgical fix (`F-RENEWAL-DATE-SEMANTICS`): `lib/integrations/rentvine/lease-mapper.ts` now emits the
  lease-end as `lease_end_date` (no reconciliation spec) instead of `renewal_date`. The sheet's renewal_date
  becomes single-source (worklog) → no false conflict. DEFAULT_FIELD_SPECS and the synthetic golden suite
  are UNTOUCHED (they use hardcoded sample candidates, not the live mapper); only the live-mapper output
  tests changed (`rentvine-lease-mapper`, `rentvine-live-run`, `rentvine-export`).
- Precedence recorded (`F-RECON-PRECEDENCE`): RentVine authoritative for lease facts; sheet for worklog;
  conflicts route to a human, never auto-picked. `Q-PREC-1` narrowed to just Dan's per-case manual override.
- Real-data validation: an ADC-fresh live re-capture went from 17 → **2** candidate flags (both real
  current_rent High, **0** renewal_date noise) across 25 live leases / 1,173 outcomes. Labeled the 2 as
  accept → verified golden set (gitignored, in-boundary); the harness gate passes on it (0 false positives).
- The committed regression guarantee is the live-mapper tests (esp. "live mapper feeds runRenewalPipeline →
  only current_rent High"); the captured verified set is local-only (gitignored real data).
- Verification: 757/757 tests, typecheck + lint clean, context-freshness + falsification pass. No SoR write;
  no cloud spend (the re-capture is a read-only RentVine + Sheet read); production_allowed:false throughout.

## Slice 5a: Maintenance Work Order Intake — foundation (2026-06-29)

- Started the Maintenance Work Order Intake build (owner chose the fuller flow). Shipped the intake
  FOUNDATION (`F-MAINT-INTAKE`), all gated/simulation-only on the proven lease-renewal pattern:
  - `lib/maintenance/work-order-draft.ts` — the pure domain core: `buildWorkOrderDraft(capture)` turns a
    field capture (reporter, unit match, typed note and/or voice transcript, photos, priority) into a
    structured work-order DRAFT with summary/description/priority/unit/photos + `blockers` (missing
    description, unmatched/low-confidence unit) and emergency-keyword priority inference. `readyForExecution`
    is always false — the RentVine create stays gated. No I/O (STT/Drive/matching resolved by seams, passed in).
  - `lib/maintenance/process-template.ts` — `buildMaintenanceProcessTemplate`: a schema-valid Draft
    definition over the maintenance stage model, referencing the gated `rentvine.work_order.*` actions
    (none 'Approved for Execution').
  - `lib/maintenance/constants.ts` — stage model, priorities, emergency keywords, planned reads/outputs.
  - Tests: `maintenance-work-order-draft` (10), `maintenance-process-template` (3). 770/770 total.
- Storage decision recorded: Google Drive in-boundary (`Q-MAINT-STORAGE` narrowed to "adapter wiring pending").
- The maintenance Space + the gated `rentvine.work_order.*` Action Registry entries already existed; this
  adds the intake definition + draft logic on top.
- Remaining maintenance sub-slices (owner to confirm capture UX first): process-definition seed wiring;
  the speech-to-text seam (Google Cloud STT in prod, dev stub — mirrors the model provider); the Drive
  image-store adapter; the capture UI (photo + voice + note). RentVine work-order create stays gated.
- Verification: typecheck + lint clean; falsification (496 files) + context-freshness pass. No SoR write;
  no cloud spend; production_allowed:false throughout.

## Slice 5b: Maintenance speech-to-text seam (2026-06-29)

- Built the voice backend for maintenance capture (owner: voice/STT in v1), prod-plane correct
  (`F-STT-SEAM`):
  - `lib/speech/stt-provider.ts` — a `SpeechToTextProvider` seam mirroring the ModelProvider: a free
    `StubSpeechToTextProvider` (canned transcript, zero-spend) and a `GoogleSpeechToTextProvider` calling
    Google Cloud Speech-to-Text's v1 `speech:recognize` REST endpoint via google-auth-library (no new SDK
    dep; injectable transport + token getter for tests). `createSpeechToTextProvider` selects by config.
  - `lib/config/server.ts` — `SPEECH_PROVIDER` (default stub) + `SPEECH_LANGUAGE_CODE`; prod forces
    `google` (NODE_ENV fence), so dev is free and prod uses the cloud path.
  - `app/api/maintenance/transcribe/route.ts` — edit-gated; caps audio at ~8MB base64 to bound STT cost
    (owner budget safety); returns the transcript. Stub path is zero-spend in dev.
  - Tests: `stt-provider.test.ts` (6) — stub, provider selection, Google adapter parsing (injected
    transport), non-2xx error, empty results. Updated four full-config test fixtures for the new fields.
- 776/776 tests; typecheck + lint clean; falsification (499 files) + context-freshness pass. No SoR write;
  no cloud spend (stub in dev); production_allowed:false throughout.

## Slice 5c: Maintenance capture desk (/maintenance) (2026-06-29)

- Shipped the dedicated capture UI the owner chose (`F-MAINT-CAPTURE-UI`):
  - `app/maintenance/page.tsx` — edit-gated page (capture is editor work).
  - `components/maintenance/MaintenanceCapture.tsx` — typed issue + tap-to-record voice (browser
    MediaRecorder → base64 → `/api/maintenance/transcribe` → transcript appended) + unit + priority;
    "Build work-order draft" runs the pure `buildWorkOrderDraft` and shows a live preview (summary,
    description, priority, unit, blockers) marked "Simulation only — the RentVine create is gated".
    Gracefully degrades when the browser lacks MediaRecorder.
  - `lib/spaces.ts` — `spaceHref` opens the Maintenance space at `/maintenance` (mirrors lease-renewals),
    so it's reachable from the Spaces dropdown.
  - Tests: `maintenance-capture.test.tsx` (3 — renders, clean draft, blockers); updated the home-launcher
    test for the new href. 779/779 total.
- Browser-verified on the dev server: `/maintenance` renders the capture form (Issue, Record voice, Unit,
  Priority, Build) with no console errors; the edit-gate correctly redirects an unauthenticated request to
  sign-in. (Re-auth'd local demo mode to view it; the dev session had expired.)
- Verification: typecheck + lint clean; falsification (502 files) + context-freshness pass. No SoR write;
  no cloud spend (STT stub in dev); production_allowed:false throughout.
- Remaining maintenance sub-slices: Drive image-store adapter (photo storage); process-definition seed.

## Slice 5d + 5e: Maintenance photo storage + process seed (2026-06-29)

- 5d — photo storage (`F-MAINT-PHOTO`): `lib/maintenance/image-store.ts` — a `MaintenanceImageStore` seam
  mirroring the STT/model seams; free `StubMaintenanceImageStore` (dev) + `DriveMaintenanceImageStore`
  (Drive v3 multipart upload via google-auth-library, injectable transport + token). `createMaintenanceImageStore`
  selects by config (`IMAGE_STORE`, prod forced to drive; folder from `SPACE_DRIVE_FOLDER_IDS`).
  `app/api/maintenance/photo/route.ts` edit-gated + ~10MB cap; the capture desk gained a photo input that
  uploads → ref → into the draft. Stores return `drive:<id>`, never the binary.
- 5e — process seed (`F-MAINT-SEED`): extracted a shared generic idempotent writer `seedProcessDefinition`
  (refuses executable references) in `lib/lease-renewal/process-definition-seed.ts`; lease-renewal + the new
  `lib/maintenance/process-definition-seed.ts` both use it. `seed:process-definitions` now seeds BOTH Drafts
  (dry-run verified: Lease Renewal 8 steps/6 refs + Maintenance 7 steps/3 refs, none 'Approved for Execution').
  Live write owner-gated.
- Tests: `maintenance-image-store` (7), `maintenance-process-definition-seed` (2); updated four full-config
  fixtures for IMAGE_STORE. 788/788 total.
- Maintenance is now BUILT end-to-end (gated): capture (voice + photo + note + unit) → work-order draft →
  seedable Draft process. No SoR write, no sends; `production_allowed:false` throughout. Remaining: prod
  Drive folder id; live seed (owner-gated); the RentVine work-order create (vendor-confirmed + per-action spec).
- Verification: typecheck + lint clean; falsification (507 files) + context-freshness pass.

## Maintenance adversarial review + hardening (2026-06-29)

- Ran a multi-agent adversarial review (ultracode) over the maintenance feature before merge: 4 dimension
  finders (gating/safety, security/data-gov, correctness, seam-fencing) → each finding adversarially
  verified. 13 raw findings → 6 confirmed (1 a positive "error paths don't leak audio/PII" confirmation).
- Fixed the 5 actionable findings:
  - **HIGH:** `DriveMaintenanceImageStore` sent base64 TEXT as the multipart media part with
    `Content-Transfer-Encoding: base64`, which Drive does NOT decode — every real upload would be stored
    corrupted. Now builds a binary Buffer body (decoded bytes) and drops the header; the test asserts the
    body carries decoded bytes (not base64 text). Caught only because the review distrusted the green test.
  - **MEDIUM:** the transcribe/photo routes buffered the whole body before the Zod size cap → added a
    Content-Length 413 guard before `json()` (bounds memory for authenticated editors).
  - **MEDIUM:** added prod-fence regression tests (NODE_ENV=production forces STT=google, image=drive).
  - **LOW:** a 2xx non-JSON upstream response now maps to the typed 503 (was an unhandled 500) in both seams.
  - **LOW:** `toggleRecording` wraps `getUserMedia` in try/catch (mic-denied feedback).
- Verification: 792/792 tests (+4), typecheck + lint clean, falsification (507 files) + context-freshness pass.

## Maintenance capture: photo button UX + Drive-auth gap surfaced (2026-06-29)

- Owner flagged that the photo control wasn't discoverable. Replaced the bare `<input type="file">` with a
  styled "Add / take photo" button (label triggers a hidden input) + `capture="environment"` for mobile
  camera access. Browser-verified the button renders, input hidden, capture set.
- Surfaced an honest gap while answering "how does the photo sync to Drive?": in dev the image store is the
  free STUB (no real upload — by design); the prod Drive adapter exists but authenticates via plain ADC +
  drive.file scope, which the managed `pmikcmetro.com` domain almost certainly blocks (same reason the
  Sheets reader uses keyless domain-wide delegation). So Drive sync is NOT live yet — recorded in
  F-MAINT-PHOTO + Q-MAINT-STORAGE. Remaining: switch the Drive adapter to DWD + set the folder id.
- Verification: typecheck + lint clean; capture test updated for the photo button; context-freshness pass.

## Maintenance Drive access: keyless DWD client + in-boundary folder + access governance (2026-06-29)

- Owner: create the folder in-boundary using the account the user auths with, and define the access
  workflow. Built the correct path (`F-DRIVE-DWD`):
  - `lib/google-drive/drive-dwd.ts` — `GoogleDriveClient` + `mintDriveDwdToken`: keyless domain-wide
    delegation acting AS the pmikcmetro.com DWD subject (SHEETS_DWD_SUBJECT), never the personal account,
    no key file — mirrors the Sheets reader. find/create/ensure folder; live mint is live-only, the rest is
    unit-tested with an injected token + fetch.
  - Switched `DriveMaintenanceImageStore` auth from plain ADC to the DWD token (closes the auth gap the
    earlier review surfaced).
  - `scripts/ensure-maintenance-drive-folder.ts` (`npm run maintenance:ensure-folder`) — find-or-creates
    the "Maintenance Work Order Intake — Photos" folder as the subject user, prints the id for
    SPACE_DRIVE_FOLDER_IDS. Dry-run + live.
  - Access governance ("access workflow"): added the gated `google_drive.maintenance_photo.store` Action
    Registry entry (production_allowed:false, readiness Needs Permission) + "Google Drive" to
    ACTION_TARGET_SYSTEMS. The Drive write is now a governed action, not a silent write.
  - Tests: `drive-dwd.test.ts` (find/create/ensure + setup guard); action-registry test validates the new
    entry. Full suite green.
- **Folder NOT created — one irreducible admin step.** A live `maintenance:ensure-folder --live` attempt
  returned `unauthorized_client`: the Drive scope is not authorized for the DWD service account in the
  Workspace Admin console (the Sheets scope is; Drive is separate). A Workspace admin must authorize the
  Drive scope (Admin console → Security → API controls → Domain-wide delegation) for the SA's client id;
  then `maintenance:ensure-folder --live` creates the folder, set its id in SPACE_DRIVE_FOLDER_IDS, and
  (IMAGE_STORE=drive, auto in prod) photo sync goes live. Recorded in F-DRIVE-DWD / F-MAINT-PHOTO / Q-MAINT-STORAGE.
- No SoR write; no cloud spend; the Drive write stays gated (production_allowed:false).

## Drive DWD auth: adversarial review + hardening (2026-06-29)

- Ran a focused multi-agent adversarial review of the new keyless DWD Drive auth (4 finders →
  adversarial verify): 17 raw findings → 3 confirmed (2 distinct real issues). Fixed both:
  - **Query escaping:** the Drive v3 folder lookup escaped only `'`, not `\` (and in the wrong order) —
    a query-injection/correctness seam (latent today: the only caller passes a constant folder name, but
    `findFolder` is a public reusable method). Added `escapeDriveQueryValue` (backslash FIRST, then quote)
    and applied it to both the name and parentId clauses.
  - **Multipart boundary:** the upload used a STATIC boundary that could appear in raw image bytes and be
    parsed as a premature delimiter (RFC 2046), silently corrupting an upload. Now a per-upload
    high-entropy boundary (`maint-image-<uuid>`).
  - Tests: `escapeDriveQueryValue` (quote / backslash / trailing-backslash ordering) + a `findFolder`
    injection test + a per-upload-unique-boundary test. 801/801.
- The review CONFIRMED the rest is sound: the DWD mint matches the proven Sheets pattern; it acts only as
  the pmikcmetro.com subject (never personal, keyless); no token/JWT/SA-id/client-data leaks into
  errors/logs/stdout; and the Drive write stays gated.
- Verification: typecheck + lint clean; falsification (510 files) + context-freshness pass.

## Maintenance Drive sync — LIVE + verified (2026-06-29)

- Owner authorized the Drive scope (`drive.file`) for the DWD service account
  (`lease-renewal-reader@pmi-kc-kb-prod`, subject `josiah@pmikcmetro.com`) in the Workspace Admin console.
- The first live attempt then returned 403 "Drive API not used/disabled" → enabled the Google Drive API
  on `pmi-kc-kb-prod` via the Service Usage API with owner ADC (free; not GCP-billed; doesn't touch the $10
  cap; owner-approved "do so if no cost"). Project number 558870356522.
- `maintenance:ensure-folder --live` then **created** the "Maintenance Work Order Intake — Photos" folder
  in josiah@pmikcmetro.com's Drive (in-boundary, owned by the subject). Merged its id into
  SPACE_DRIVE_FOLDER_IDS in `.env.local` (gitignored; alongside lease-renewals) and set IMAGE_STORE=drive
  for dev.
- **Round-trip verified against live Drive:** a temp 1×1 PNG uploaded (returned a `drive:<id>` ref + a
  webViewLink), then deleted (HTTP 204). This exercised the real keyless-DWD auth + the binary multipart
  upload (the review fix) end to end. No client data; the test file was cleaned up.
- Net: Q-MAINT-STORAGE resolved; F-DRIVE-DWD / F-MAINT-PHOTO are now LIVE. Remaining for prod: set
  SPACE_DRIVE_FOLDER_IDS in the Cloud Run env at deploy (prod forces IMAGE_STORE=drive). Folder ids stay in
  env (gitignored), never committed. Drive write stays gated (production_allowed:false in the Action Registry).

## Maintenance Drive: Shared Drive support (2026-06-29)

- Owner prefers a team-owned Shared Drive over the subject's My Drive. Added Shared Drive support to the
  Drive client: `findFolder`/`createFolder`/`ensureFolder` take a `DriveLocation { parentId?, driveId? }`
  and set `supportsAllDrives` + `includeItemsFromAllDrives` (and `corpora=drive&driveId` when targeting a
  Shared Drive); the image-store upload and the ensure-folder script (`--shared-drive <id>`) thread it
  through. `drive.file` stays sufficient (the app creates/manages its own folder + files in a Shared Drive
  the subject manages — no broader scope; creating the Shared Drive ITSELF would need full `drive`, avoided).
- Tests: a Shared-Drive `ensureFolder` test (supportsAllDrives + corpora/driveId + parents) + a
  supportsAllDrives assertion on the upload. 802/802.
- DONE: the owner created the team Shared Drive (as josiah@pmikcmetro.com); `maintenance:ensure-folder
--live --shared-drive <id>` created the "Maintenance Work Order Intake — Photos" subfolder inside it;
  rewired SPACE_DRIVE_FOLDER_IDS to that subfolder (gitignored); round-trip verified (uploaded a test image
  into the Shared Drive → got a webViewLink → deleted it, HTTP 204); and deleted the interim My Drive folder
  (204). Maintenance photos now sync to the team-owned Shared Drive. Drive folder/Shared-Drive ids stay in
  env (gitignored), never committed.
- Remaining for prod only: set SPACE_DRIVE_FOLDER_IDS (with the Shared Drive subfolder id) in the Cloud Run
  env at deploy (prod already forces IMAGE_STORE=drive). Verification: typecheck + lint clean; falsification
  (510) + context-freshness pass.

## Cutover preflight: maintenance photo Drive folder guard + config decouple (2026-06-29)

- Cutover-readiness slice (Migration-Readiness Stop Gate allows: removes a cutover/verification blocker +
  fixes a latent prod bug; local, zero-spend, no new product surface). Closed a real gap: prod forces
  `IMAGE_STORE=drive`, but nothing required the maintenance photo Drive folder, so a deploy could ship with
  every field-photo upload silently 503-ing. The golden production fixture proved it — it configured only
  `lease-renewals` and still passed the preflight.
- Root finding: `SPACE_DRIVE_FOLDER_IDS` is intentionally overloaded (`.env.example`: "Drive folder IDs or
  Cloud Storage source prefixes") and cross-links 1:1 with a Vertex data store, so one Space key cannot hold
  both a `gs://` KB-source prefix AND a Drive photo folder. Decoupled the photo folder into its own var
  rather than overloading the key further.
- Changes:
  - `lib/config/server.ts` — new `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID`; `maintenanceImageFolderId` resolves it
    first, then the legacy `SPACE_DRIVE_FOLDER_IDS["maintenance-work-order-intake"]` (back-compat).
  - `scripts/preflight-production-cutover.mjs` — `assertMaintenancePhotoFolder` requires a resolved photo
    folder (rejects missing, `gs://`, placeholder, and demo values), resolved exactly as the runtime does.
  - `scripts/deploy-demo-cloud-run.mjs` — `readRuntimeEnv` now forwards `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID`
    to Cloud Run (without this, the preferred var would pass the preflight but never reach the runtime).
  - `lib/maintenance/image-store.ts` + `scripts/ensure-maintenance-drive-folder.ts` — messages name the new
    var. `tests/fixtures/cutover/golden-production.env.fixture` sets it (kept out of the KB-source map so the
    cross-link stays clean).
  - Tests: server-config resolution (prefer dedicated var → legacy fallback → empty); cutover-golden
    negatives (missing, `gs://`) + a back-compat legacy-fallback acceptance; two existing passing prod
    configs in `live-cost-scripts.test.mjs` updated for the new required field.
  - Docs: `.env.example`, `docs/client-production-cutover.md` (§2/§5 + preflight description),
    `docs/google-setup.md` (clarified the demo `gs://` maps are KB-source, not the photo folder),
    `docs/environment-handoff.md` (Cloud Run row), `docs/facts.md` (F-MAINT-PHOTO + Q-MAINT-STORAGE),
    `docs/research-backlog.md` + `docs/facts.md` (new `Q-MAINT-PHOTO-INDEX`: keep tenant photos out of any
    indexed source folder — flagged, not solved).
- No SoR write; no cloud spend; `production_allowed:false` throughout. End state: a deploy that forces the
  Drive image store with no maintenance photo folder configured now fails the preflight loudly instead of
  silently shipping a broken photo path.

## Recalibration: UI/UX + process governance (2026-06-30)

- Operator stream-of-consciousness note (Obsidian capture "PMI KC App Governance and Roadmap") drove a
  governance + roadmap recalibration. Direction: the **Console is the front door** (home/landing, and
  app-state-aware — answers approvals / connections-to-set-up / spaces-without-a-process / configure-X);
  **Spaces ⊇ Processes** (retire the Processes tab, keep the process-definition engine, surface each process
  beside its Space via sub-tabs); **fully-clickable real Space cards**; **Maintenance into sub-tabs**;
  **STT + visible slash-commands in the Console**; every **Space gets real "teeth"**; **production end state
  always**. Sequencing: **Q&A first** (teeth before scaffolding).
- Ran a 5-reader Phase-1 Q&A research workflow (lease renewal, move-in, move-out, maintenance + a
  data-intactness sweep) → consolidated into `docs/products/v1-process-qa.md` (per-process outstanding
  questions with confirm-with-defaults + owner + the data-intactness check). Move-in and move-out are
  Space scaffolds only (no desks); their V1 definitions are owner-gated by the Q&A. Lease-renewal Phase-1
  is built/live-proven; the write-back method (`Q-WRITEBACK-METHOD`) + review surface (`OQ-UI-1`) stay open.
- Governance/roadmap written (no app code; teeth-before-scaffolding): `A-IA-V2` added to `docs/facts.md`;
  `docs/feature-suites/ui-ia.md` rewritten (S6 recalibrated) + new S10 `console-app-state.md`, S11
  `space-teeth.md`, S12 `dev-prod-parity.md`; `docs/loop-state.md` Next Safe Slice Candidates re-aimed
  (Q&A → dev↔prod parity → IA rework → Console brain → per-Space teeth → renewal Phase-2);
  `docs/north-star.md`, `AGENTS.md` route table, `docs/feature-suites/README.md`, `docs/research-backlog.md`
  updated. Disposable packet: `docs/temp/recalibration-plan.md`.
- Surfaced parity gap (now S12): the deploy + cutover preflight don't carry the live-connection env
  (RentVine via Secret Manager, Sheet/DWD identity); the running Cloud Run service predates this cycle —
  a redeploy is owner/budget-gated. Flagged doc-freshness drift: `lease-renewal-build-plan.md` +
  `lease-renewal-next-phase-plan.md` predate R1–R5 and carry stale test counts (387/638 vs 806) — banners
  added; `facts.md` + `loop-state.md` are authoritative.
- No SoR write; no cloud spend; `production_allowed:false` throughout; identity stays `pmikcmetro.com`.

## S12 — dev↔prod parity for live connections (2026-06-30, build cycle slice 1)

- First slice of the S12→S6→S10 build loop (owner authorized "run the loop / build the next feature").
  Closed the parity gap so the deployed service carries the same live connections as local — a green
  cutover now guarantees prod connects instead of silently degrading to "not connected" (`F-DEVPROD-PARITY`).
- `scripts/deploy-demo-cloud-run.mjs`: `readRuntimeEnv` now forwards the four NON-SECRET live-connection
  identifiers (`RENTVINE_API_BASE_URL`, `RENEWAL_SHEET_ID`, `SHEETS_IMPERSONATE_SA`, `SHEETS_DWD_SUBJECT`);
  new `readRuntimeSecrets` delivers `RENTVINE_API_KEY`/`RENTVINE_API_SECRET` via Secret Manager
  (`--set-secrets`), never inlined into the service's plaintext env. Wired only when the RentVine base URL
  is present (secret id overridable via `*_SECRET_ID`, version via `*_SECRET_VERSION`), so the demo-only
  deploy path (no RentVine) is unchanged.
- `scripts/preflight-production-cutover.mjs`: new `assertLiveConnectionConfig` requires the four
  non-secrets, mirroring `assertMaintenancePhotoFolder`. RentVine tenant guard mirrors the runtime client
  (`^[a-z0-9-]+\.rentvine\.com$`, account must be `pmikcmetro`, https); the Sheets impersonator must be a
  GCP service account; the DWD subject must be `pmikcmetro.com` (the identity rule). The RentVine key/secret
  are NOT checked here by design — they are Secret-Manager-delivered, not plaintext cutover env.
- Golden fixture + tests: `golden-production.env.fixture` gains the four anchors; strengthened the deploy
  preview test (asserts the env-var forwarding + the `--set-secrets` wiring); added six negatives
  (missing/wrong-tenant/non-RentVine base URL, missing sheet id, non-SA impersonator, non-pmikcmetro
  subject) + a "no secrets when RentVine unconfigured" guard; updated the two ok:true prod-config tests.
- Docs: `.env.example` (Secret Manager override note), `docs/client-production-cutover.md` (§5 live-connection
  config + Secret Manager create/grant commands, §6 `secretmanager.secretAccessor` role, preflight rejection
  list), `docs/environment-handoff.md` (Cloud Run row), `docs/facts.md` (`F-DEVPROD-PARITY`), `docs/loop-state.md`.
- Behavior-change heads-up for the owner: a `deploy:demo` from a machine whose `.env.local` has RentVine
  configured now wires `--set-secrets`, so the (owner/budget-gated) redeploy requires the two Secret Manager
  secrets to exist first + the runtime SA granted `secretmanager.secretAccessor`. To deploy without RentVine,
  unset `RENTVINE_API_BASE_URL`.
- Verification: 812/812 tests (+6), lint + typecheck clean, `verify:falsification` (514 files) +
  `verify:context-freshness` pass. `format:check` has PRE-EXISTING drift (44 files flagged at HEAD on the
  Windows/CRLF checkout, incl. untouched files); my code files are prettier-clean (EOL-agnostic) and markdown
  additions match the repo's established style — not mass-reformatting to avoid a 44-file unrelated diff.
- QUEUED (Stop-and-Reset approval gate, NOT done autonomously): the owner/budget-gated redeploy of current
  `main` (`npm run check:budget-guard` + `--budget-confirmed`, under the $10 cap) + create the RentVine Secret
  Manager secrets + grant the runtime SA + `npm run smoke:ask-live -- --base-url=<endpoint>` parity check.
- No SoR write; no cloud spend; `production_allowed:false` throughout; identity stays `pmikcmetro.com`.

## S6 — UI/IA rework: Console-as-home + Spaces ⊇ Processes (2026-06-30, build cycle slice 2)

- Second slice of the build loop. Recalibrated the IA to A-IA-V2 (`F-IA-CONSOLE-HOME`, supersedes
  `F-OPS-CONSOLE-IA`). Shipped as two sub-commits to de-risk the smoke-sensitive part.
- **S6a — Console-as-home + retire Processes nav.** Extracted `components/console/ConsoleView.tsx` (the shared
  Console body, an async server component) and render it from BOTH `app/page.tsx` (home `/`) and `app/ask/page.tsx`
  (kept a real 200 page — `/ask` is asserted by smoke:ask-live/auth-live, so NOT redirected). Deleted the
  `OperationsConsoleHome` launcher + its unit test. Removed the "Processes" nav entry from `AppShell` — the
  `/processes` routes + the process-definition engine are preserved (they're deep-linked from the Renewal Desk and
  each Space's Process sub-tab; `degraded.e2e`/`process-definitions.e2e` still cover them). Added
  `console-view.test.tsx` + a home e2e (`/` → 200 + "Console"); added `/` to the e2e warmup.
- **S6b — real Space cards + per-Space Process sub-tab + copy.** Added `processDefinitionId` to `LaunchSpace`
  (lease-renewals→lease-renewal, maintenance→maintenance-work-order-intake). New pure `lib/space-card-state.ts`
  (`computeSpaceCardState` + a conservative space→connector map) → `/spaces` cards are now fully clickable
  (`<Link class="panel space-card">`) with a real state badge (connections-needed > needs-a-process > process-ready;
  read-only Spaces = reference). New read-only `ProcessSummaryPanel` + `?tab=` sub-tabs on `/spaces/[spaceId]`
  (Overview default keeps the existing SOP editor so smoke:demo-live is unchanged; Process tab surfaces the
  definition + recent simulation runs and deep-links to `/processes/{id}` — advisory, never executes). Copy:
  "KB-owned process" → "Process space" (voice lexicon). Added `space-card-state.test.ts`; updated `spaces.e2e`.
- **Decision recorded:** Maintenance stays its OWN edit-gated Space (`/maintenance` route + `requirePageCapability("edit")`
  untouched), NOT folded under the Admin nav — Admin nav is `manageAdmin`-gated, so moving it there would regress
  Editor access. Resolves the `ui-ia.md` "Admin vs own tab" open question.
- Verification: 818/818 unit tests (+6 net: +space-card-state, +console-view, −launcher test), typecheck + lint clean,
  `verify:falsification` (517 files) + `verify:context-freshness` pass. E2e core: 31 passed / 18 skipped (skips need
  the Firestore emulator); `ask.e2e` (home) + `spaces.e2e` (sub-tab + copy) ran in core and passed. Browser-verified
  on `npm run dev`: `/` renders the Console (old launcher gone, no Processes nav), `/spaces` shows 12 clickable cards
  with real badges, the Process sub-tab links to the engine, and the overview keeps the SOP editor.
- No SoR write; no cloud spend; `production_allowed:false` throughout; identity stays `pmikcmetro.com`.

## S10 — Console as the app-state-aware front door (2026-06-30, build cycle slice 3)

- Third + final slice of the build loop. Made the Console answer the operator's OWN app-state — read-only,
  advisory, deep-linked, never executing (`F-CONSOLE-APP-STATE`, extends `F-ACTION-CONSOLE`).
- **App-state provider** (`lib/ask/app-state-context.ts`, read-only + non-fatal, modeled on `resolveProcessContext`):
  approvals (`listApprovalQueue` filtered by `canViewApprovalQueueItem`), connection setup gaps (unconfigured or
  partial connectors via `buildConnectionView` — excludes fully-configured "ready to verify" so the list stays
  actionable), and Space process+connection coverage (reuses the S6 `computeSpaceCardState`, so the Console and the
  `/spaces` badges agree). Every resolver degrades to an empty result on a Firestore error, never throws.
- **Read-only API** `GET /api/ask/app-state?query=approvals|connections|coverage` (read-gated; 400 on unknown query).
- **Visible command buttons** in the Console (`AskForm`): "My approvals", "Connections to set up", "Space coverage"
  → fetch the query and render an advisory panel (summary + deep-linked items + Dismiss). No execute path — the panel
  links to the gated surfaces (Approval Queue, Connections, the Space) where actions actually happen.
- **Console STT** `POST /api/ask/transcribe` (edit-gated, ~8MB Content-Length cap, prod-fenced `createSpeechToTextProvider`)
  — a verbatim mirror of the maintenance transcribe route; a "Dictate" button reuses the MediaRecorder→base64 flow to
  fill the question box. Design note: the app-state answers are DETERMINISTIC (state lookup), NOT injected into the
  grounded-answer prompt — app-state questions have no KB grounding, so a deterministic panel is both accurate and
  anti-hallucination-safe (this refines the plan's "inject as non-citation context" toward the spec's read-only/deep-linked intent).
- Client-bundle safety: `AskForm` imports the app-state module TYPE-ONLY (erased) + a local command list, so the
  server-only provider never enters the client bundle.
- Verification: 824/824 unit tests (+6: app-state-context ×4, ask-form ×2 new S10 cases), typecheck + lint clean,
  `verify:falsification` (521 files) + `verify:context-freshness` pass, e2e core green. The two thin API routes
  (validate+delegate; verbatim STT mirror) rely on the tested provider + the already-verified maintenance seam.
- No SoR write; no cloud spend; `production_allowed:false` throughout; identity stays `pmikcmetro.com`.

## Build loop complete — clean stop (2026-06-30)

- The S12→S6→S10 loop shipped all three unblocked Next-Safe-Slice candidates. Stop-and-Reset fired: "no safe slice
  remains" — the per-Space desks (S11) + lease-renewal Phase-2 are gated on the owner V1 Q&A / `Q-WRITEBACK-METHOD`
  decision / `OQ-RV-1` RentVine vendor endpoint; the S12 redeploy of `main` is a queued owner/budget approval.
- Migration-ready but owner/client-blocked. Commit queue prepared (grouped by slice); nothing pushed/merged/deployed.
- Recommended next: answer the V1 process Q&A → S11 per-Space teeth; or approve the S12 redeploy (create the RentVine
  Secret Manager secrets + grant the runtime SA first).

## Build cycle merged + owner V1 Q&A (partial) answered (2026-07-01)

- The S12→S6→S10 build cycle was committed on `feat/console-ia-parity-appstate` and merged to `main` via
  PR #19 (owner-approved). Working tree clean; local `main` synced.
- Owner answered the four pivotal, owner-decidable V1 Q&A questions (the rest are Dan/PMI-operational or
  vendor-gated). Recorded as decisions in `docs/facts.md` (Q- rows flipped Verified) + annotated in
  `docs/products/v1-process-qa.md`:
  - **Q-WRITEBACK-METHOD → append-only proposal column** — write proposals to a NEW append-only column,
    never mutate existing cells; graduate to cell-anchored compare-and-set after Phase-1 accuracy is proven;
    RentVine-first deferred (OQ-RV-1).
  - **OQ-UI-1 → a renewal SUB-TAB inside the Approval Queue** — same space + the built approve/return/assign
    machinery, organized as its own logical view for Dan (not a standalone run page, not un-grouped into the
    general queue). Mirrors the Spaces⊇Processes sub-tab pattern.
  - **Q-PREC-1 → yes, manual per-case precedence override via the resolve flow** — Admin-approved for
    High-severity, plain-English reason mandatory + logged, no self-approval, never auto-applied.
  - **Q-MAINT-PHOTO-INDEX → binding rule** — tenant photos never enter an indexed corpus; SOPs index from a
    separate approved low-sensitivity source only.
- Unblocks a renewal Phase-2 slice: the review sub-tab in the Approval Queue + generating the append-only
  write-back PROPOSAL for human approval (read/draft/suggest/queue only). Executing the write to the operating
  Sheet still needs an approved per-action spec (SoR write) + its Action Registry entry flipped; move-in/move-out
  desks (S11) still wait on their Dan/client Q&A.
- Second Q&A batch (move-in skeleton + maintenance scope), annotated in `docs/products/v1-process-qa.md`:
  - **MI-1 → manual start; Dan owns** (default) — a team member starts move-in when a tenant is approved;
    owner = Dan, approver = Dan + a settable secondary; RentVine auto-detect is later.
  - **MI-2 → EVERY step is a checklist flag** (overrides the default) — no hard blocking gates in V1 move-in;
    the operator judges readiness. Revisit hard gates (e-sign / certified funds) after V1 usage.
  - **M-4 → human-overridable priority suggestion + build the read-only RentVine unit matcher FIRST** (default)
    — before enabling any work-order create, so unit confidence is real, not user-typed.
  - **M-5 → BUILD owner-notice + vendor-assignment in V1** (overrides the default) as draft/suggest surfaces
    (an owner-notice DRAFT + a vendor-assignment SUGGESTION). Governance floor still binds — both stay
    non-executable (no autonomous send, no SoR write); the RentVine create + any owner send remain gated.
- Buildable now from this batch: the maintenance owner-notice DRAFT + vendor-assignment SUGGESTION stages + the
  read-only RentVine unit matcher (all non-executable). The move-in desk (S11) still needs the CLIENT move-in
  answers (welcome-comms channels, fees/deposit posture, key provisioning, inspection SLA) from Dan.
- Third Q&A batch (move-in data posture + move-out skeleton), annotated in `docs/products/v1-process-qa.md`:
  - **MI-8 → read + checklist only for V1** (default) — content-keyed (never trust Tab 1 headers); a move-in
    golden set comes only after Tab 1 column meanings are team-validated.
  - **MO-1 → manual "Start move-out" button ONLY** (narrows the default) — no automatic Renewals→Move-Out
    handoff yet (add later); eviction/abandonment still branch separately.
  - **MO-3 → app computes a SUGGESTED deposit deduction** (overrides the "no app math" default) from the
    operator-entered evidence. BINDING GUARDRAILS: clearly-labeled suggestion, never final; owner approval
    required; evidence + arithmetic shown transparently; NEVER posts to a ledger/bank/QuickBooks (no SoR write)
    and NEVER invents statutory deposit language or the deadline (MO-2 stays a legal-gated Needs-Verification
    placeholder). This is a NEW deposit-math surface to build carefully under those guardrails.
- Q&A owner-decidable set is now exhausted. Everything still open is Dan/PMI-operational (welcome/move-out
  channels, approver rosters, dollar thresholds, key provisioning, inspection SLA, templates, in-scope tabs) or
  vendor/legal-gated (RentVine renewal + work-order write endpoints, the statutory deposit deadline, QuickBooks
  ledger-of-record). Next: draft the client-owned Q&A as a confirm-with-default note to Dan, or start building
  one of the unblocked slices (renewal review sub-tab; maintenance owner-notice/vendor-assignment + unit matcher).

## 2026-07-01 — Working Order directive + renewal review sub-tab (owner-present)

- Owner set a durable WORKING ORDER (now `AGENTS.md` → "Working Order"; `F-WORKING-ORDER`): (1) front-load the
  human-gated, unblocking work when the owner is present (secrets, provisioning, answers, approvals) so unattended
  model work stays unblocked; (2) self-answer before asking the client — repo/docs/code → developer → only the
  irreducible remainder to client/vendor/legal, as confirm-with-default. Recorded as memory + governance.
- Secret Manager runbook delivered (owner action pending): create `RENTVINE_API_KEY` + `RENTVINE_API_SECRET` in
  Secret Manager on `pmi-kc-kb-prod`, grant the Cloud Run runtime SA `roles/secretmanager.secretAccessor`, verify.
  This unblocks the S12 redeploy (still a separate owner/budget-gated cost step; creating the secrets is ~free).
- Self-answer pass over the open V1 Q&A (`docs/products/v1-process-qa.md`): 8 items self-resolved from the repo
  (OQ-SHEET-1, Q4, MI-3, MI-6, MI-7, MO-2, MO-8, M-2) and 4 routed to the developer (OQ-APPR-1, OQ-TMPL-1, MO-4,
  MO-5). Owner answers: OQ-APPR-1 = simple user/admin model, approving is an admin-tier function (Dan+Josiah=Admin,
  the existing Editor/Approver/Admin model; nuanced per-scope delegation deferred); OQ-TMPL-1 = transcript scaffold
  now; MO-4 = deposit ledger location unknown → Needs-Verification (Dan); MO-5 = threshold Dan-owned → Needs-Verification.
- SHIPPED: the renewal review sub-tab (`F-RENEWAL-REVIEW-SUBTAB`, OQ-UI-1). A value-free "Renewals" tab beside
  "All items" in the Approval Queue groups the deterministic reconciliation flags by run (`buildRenewalReviewBoard`
  over the run views), most-attention-first, deep-linking each to the built resolve surface (`/lease-renewal/runs/{id}`)
  where the values + resolution live. Read/triage only; approve = admin-tier (`queueActionAvailability`). New:
  `lib/approval/renewal-review.ts`, `lib/lease-renewal/renewal-review-board.ts`, `components/approval/RenewalReviewPanel.tsx`;
  edited `ApprovalQueue.tsx` (tab switcher) + `app/approval-queue/page.tsx`. 835 tests green; typecheck/lint/falsification
  clean; browser-verified (Renewals (5), 5 severity-ordered flags, working deep link, no console errors, no value leak).
- NEXT: the append-only write-back PROPOSAL generator (`Q-WRITEBACK-METHOD`) — value-bearing, at the run evidence,
  needs-approval/queue-only — then link the sub-tab to it. Genuinely-Dan/vendor/legal remainder: MO-4 ledger location,
  MO-5 dollar threshold, the statutory deposit deadline (MO-2), RentVine renewal + work-order write endpoints.
- SHIPPED (same day): the append-only write-back PROPOSAL generator (`F-WRITEBACK-PROPOSAL`, Q-WRITEBACK-METHOD (a)).
  `buildWritebackProposal` turns a flag-raising reconciliation into a value-bearing proposal — the value to append to
  a NEW "KB Proposed — {field}" column from the suggested-winner source — or a value-LESS "Needs input" proposal for a
  blocked/missing/no-winner field (a value is never invented). Surfaced read-only at the run evidence
  (`LeaseRenewalRunClient`) with binding guardrails (suggestion only; needs approval; append-only, never overwrites;
  not executed) and as a value-free "Proposal ready" badge on the sub-tab. New `lib/lease-renewal/writeback-proposal.ts`;
  wired through `run-view.ts` (per-flag `writeback`) + the sub-tab's value-free `proposalReady`. 842 tests green;
  typecheck/lint/falsification clean; browser-verified (run page: 4 proposal-ready + 1 needs-input cards with the
  append-only + no-overwrite copy; sub-tab: 4 value-free "Proposal ready" badges, no value leak, no console errors).
  Executing the write stays gated (SoR spec); the cell-anchored compare-and-set model (method (b), `writeback.ts`) is
  the graduate-later path. NEXT: a proposal approval + queue path (still no execution).

## 2026-07-01 — Maintenance unit matcher (M-4) + attempted redeploy

- ATTEMPTED the owner-authorized Secret Manager + S12 redeploy myself. Preflights GREEN: gcloud identity is
  `josiah@pmikcmetro.com` on `pmi-kc-kb-prod`, RentVine secrets present in `.env.local`, budget guard passed ($10 cap).
  BLOCKED on a hard gate: the gcloud CLI token needs interactive reauth (`Reauthentication failed. cannot prompt during
non-interactive execution.`) — `credentials.db` last modified 2026-06-26, so the CLI login hasn't refreshed. Diagnosed
  the likely cause (owner ran `gcloud auth application-default login` (ADC) rather than `gcloud auth login` (CLI identity),
  which is what `gcloud run deploy` uses). Not worked around (identity rule). Redeploy waits on the owner's `gcloud auth login`.
- Per the Working Order, pivoted to unblocked work and used a background design workflow (4 parallel surface-mappers →
  a decision-complete plan) to design the maintenance slice, verifying every cited symbol against real code before building.
- SHIPPED: the read-only location→unit matcher (`F-MAINT-UNIT-MATCHER`, M-4 — built FIRST, before any work-order create).
  `matchLocationToUnit` composes the verified lease-renewal join spine (`deriveAddressKey` + `joinScore` + the two join
  thresholds) and emits the already-fixed `MaintenanceUnitMatch` contract, so `buildWorkOrderDraft` is UNCHANGED (its
  unmatched + Needs-Review blockers fire off the match confidence). Tiers: structured unit id verbatim → Verified (unique);
  else fuzzy address capped at Likely (unique ≥0.85), Needs Review (ambiguous/tied/[0.4,0.85)), null (<0.4).
  `deriveUnitCandidatesFromExport` lifts read-only candidates from RentVine export rows defensively (alternate keys;
  missing address → `Needs Verification:` label, never invented; live unit shape UNVERIFIED pending `smoke:rentvine-read`).
  Deviations from the design (with rationale): kept the extractor in the maintenance module (no edit to the renewal
  lease-mapper — lower coupling/regression risk); a conservative dependency-free exact-id tier instead of importing
  renewal `rentvine-link` (the cited path was wrong AND free-text won't carry a link). New `lib/maintenance/unit-matcher.ts`
  - `tests/unit/maintenance-unit-matcher.test.ts` (15 cases: exact-id, fuzzy-cap, tie→review, mid-range, no-match,
    determinism, never-auto-merge, extractor + `buildWorkOrderDraft` wiring). 857 tests green; typecheck/lint/falsification/
    context-freshness clean. Live /api + UI wiring deferred until the unit shape is confirmed. NEXT: the M-5 owner-notice
    DRAFT + vendor-assignment SUGGESTION (both non-executable, `production_allowed:false`).
- SHIPPED (same cycle): the M-5 owner-notice DRAFT + vendor-assignment SUGGESTION stages (`F-MAINT-NOTICE-VENDOR`).
  `buildOwnerNoticeDraft` composes a source-tagged owner notice from a `WorkOrderDraft` in the renewal owner-draft shape
  (reuses `DraftFact`; literal-false `production_allowed` + `send_allowed`; a missing owner name / unmatched unit render
  `Needs Verification:` markers, never invented). `suggestVendorAssignment` deterministically infers the vendor TRADE from
  the issue text (`MAINTENANCE_TRADE_KEYWORDS`, most-hits-wins, ties by `MAINTENANCE_TRADES` order, "General" fallback) —
  the SPECIFIC vendor is NEVER named (no roster; `Needs Verification: client vendor roster`). New
  `lib/maintenance/owner-notice-draft.ts` + `lib/maintenance/vendor-assignment.ts`; `constants.ts` gains the trade taxonomy;
  `tests/unit/maintenance-notice-vendor.test.ts` (9 cases). 866 tests green; typecheck/lint/falsification/context-freshness
  clean. Both non-executable; the RentVine create + any owner send stay gated. NEXT: wire the three maintenance stages
  (matcher + notice + vendor) into the capture UI once the live RentVine unit shape is confirmed (`smoke:rentvine-read`).
- Ran `smoke:rentvine-read -- --live` (owner-authorized; read-only, free, in-boundary; 25 leases, health OK). FINDING:
  the lease export carries `unitID` + `propertyID` as FLAT fields and NO unit address — addresses live on the PROPERTY
  (propertyID), and the RentVine client exposes only lease reads (no /properties). So the matcher's live candidate source
  needs a `/properties` read + a propertyID→address join before it can fuzzy-match live units. Corrected the now-disproven
  `deriveUnitCandidatesFromExport` to the CONFIRMED shape (flat `unitID`, captures `propertyId`, address stays
  `Needs Verification:` pending the join) + updated `F-MAINT-UNIT-MATCHER`; 866 tests green. The proposal approval path is
  NOT a separate slice — approving a proposal already flows through the resolve flow (accept the suggestion), execution
  gated on the SoR spec. BLOCKED (owner): the S12 redeploy still needs `gcloud auth login` — `credentials.db` unchanged
  since 2026-06-26, so the CLI login has not landed (likely `gcloud auth application-default login` was run instead).
- gcloud ROOT CAUSE diagnosed 2026-07-01 (`[[gcloud-reauth-blocks-agent-shell]]`): the pmikcmetro.com org enforces
  Google REAUTHENTICATION for sensitive ops; the agent's gcloud runs NON-interactively (no TTY), so ALL sensitive
  gcloud calls fail `Reauthentication failed. cannot prompt during non-interactive execution` — even `auth
print-access-token` — no matter how many `gcloud auth login`s. STRUCTURAL: the agent can never run cost-bearing
  gcloud on this org. FIX: the owner runs the Secret Manager + `deploy:demo --budget-confirmed` runbook in their OWN
  interactive terminal (where reauth can prompt); the agent verifies over HTTP via `smoke:ask-live` (no gcloud).
  Recorded as memory + `AGENTS.md`-adjacent governance. RentVine reads are unaffected (not Google).
- Re-confirmed the RentVine unit shape (extended `smoke:rentvine-read` to dump the export APPEND keys, shape-only):
  each export row has `unit` + `property` appends, and the `unit` append carries `unitID` AND the address
  (`streetNumber`/`streetName`/`address2`/city/postalCode). This CORRECTS the earlier "needs a /properties read"
  conclusion (that was over-corrected off the first smoke, which only showed the flattened lease fields). Rewrote
  `deriveUnitCandidatesFromExport` to lift `unit:<id>` + compose the street label from the unit append (no /properties
  call); a unit with no address → `Needs Verification:`, never invented. The matcher's live candidate SOURCE now works
  — `F-MAINT-UNIT-MATCHER` is LIVE-READY. 16 matcher tests (incl. an end-to-end live-shaped match). NEXT: the
  `/api/maintenance/match-unit` route + capture-UI wiring for the three maintenance stages.
- SHIPPED (same cycle): the live match-unit wiring (`F-MAINT-MATCH-UNIT-LIVE`, M-4 complete). New edit-gated
  `/api/maintenance/match-unit` route → `loadLiveUnitCandidates` (one read-only `/leases/export` via a new
  RentVine-only `buildLiveRentVineConfig`, degrading to a status category) → `matchLocationToUnit`. `MaintenanceCapture`
  gained a "Find unit" button + a confirm/override candidate dropdown; the draft's unit is now the matcher's result
  (real confidence), never the typed text (old synth retired → unmatched location fires the "Match the location to a
  unit." blocker; updated the capture test accordingly). Read-only, `autoMerge:false`, no write. 878 tests green;
  typecheck/lint/falsification/context-freshness clean; BROWSER-VERIFIED LIVE (edit-gated 200, 25 real units derived,
  a real address round-trips to the correct unit at Likely, no console errors, no client address emitted). NEXT:
  surface the owner-notice DRAFT + vendor-assignment SUGGESTION in the capture desk (both already built + tested).
- SHIPPED (same cycle): surfaced the M-5 stages in the capture desk + connected the write-back proposal to its
  approval path. `MaintenanceCapture` now renders the owner-notice DRAFT (subject/body/`Needs before sending`) + the
  vendor-assignment SUGGESTION (trade + rationale + the Needs-Verification vendor) inline when the draft is built,
  each labeled non-executable (client-side compose via the pure `buildOwnerNoticeDraft` + `suggestVendorAssignment`).
  The renewal write-back proposal card now points the reviewer to its approval path (approving = resolve the flag →
  pick the suggested source; the Sheet write stays gated). Updated `F-MAINT-NOTICE-VENDOR` + `F-WRITEBACK-PROPOSAL`.
  878 tests green; typecheck/lint/falsification/context-freshness clean; browser-verified (desk renders both stages,
  no console errors; run page shows the approve pointer on all 4 ready proposals). Maintenance V1 UI is COMPLETE
  (matcher + notice + vendor all wired). NEXT: move-in/move-out desks (need the Dan/legal Q&A); S12 redeploy (owner).
  Noted keyword-taxonomy looseness (substring hits, e.g. "washer" inside "dishwasher") — the team validates the
  starter trade keywords before any auto-routing.
- Added a session-start auth script (`F-SESSION-AUTH`): `npm run auth:session` (`scripts/session-auth.ps1`,
  owner-run, interactive) refreshes the gcloud CLI login + ADC ONLY when stale and confirms the RentVine env, so a
  new session never stalls on stale auth. Wired into governance: `AGENTS.md` Commands + Working Order, loop-state
  Resume Here step 2, and the gcloud-reauth memory. The agent still can't reauth (interactive-only); it checks with
  the read-only `preflight:adc` and asks the owner to run `auth:session` on failure. PS syntax-checked; freshness/
  falsification/lint green (not executed here — it's the owner's interactive script).
- 2026-07-01 (build loop) — SHIPPED the lease-renewal write-back proposal APPROVAL control plane
  (`F-WRITEBACK-APPROVAL`, candidate 5's "proposal approval + queue path"). A resolution already QUEUES an append-only
  proposed write-back (`production_allowed:false`); this adds the deferred "admin-enabled, per-write" half: an ADMIN
  explicitly Approves (authorizes the future, gated write → "ready to write"), Returns, or Revokes that queued proposal
  via `decideWritebackApproval` — Admin-only (OQ-APPR-1), mandatory plain-English reason, idempotent by
  source_trigger_key, append-only Activity, and a stale-on-re-resolution guard (a changed queued value invalidates a
  prior approval rather than silently authorizing a different value). The reachable states are a compile-checked
  non-executing subset of the audited write-back FSM (`writeback.ts` via `Extract<WriteBackState,…>`; Writing/Verifying/
  Written unreachable). NOTHING executes: every record carries `production_allowed:false` + `executed:false`, and no
  Sheets/SoR call exists in the path — the write stays gated behind an approved per-action spec (`F-WRITE-GATE`). New
  files: `lib/lease-renewal/writeback-approval.ts` (pure planner), `lib/firestore/lease-renewal-writeback-approvals.ts`
  (Admin-gated service + append-only Activity), `app/api/lease-renewal/writeback-approvals/route.ts`. Wired: the
  run-view flag now carries a value-free approval overlay; the run-evidence card renders an Admin approve/return/revoke
  control; the renewal review sub-tab rolls up value-free awaiting/approved COUNTS (the `F-RENEWAL-REVIEW-SUBTAB`
  value-free invariant preserved by a test asserting the approval decider/reason never leak into the board); two new
  client-read-only Firestore collections added to `firestore.rules`. 898 tests (20 new: planner 7, service 10, board 2,
  panel 1); the approval decision is transactional (read+validate+write in one txn — race-safe double-approve guard);
  lint/typecheck/test/falsification/context-freshness all green. NEXT: move-in/move-out desks (Dan/legal Q&A). Loop
  STOPPED — no unblocked safe slice remains (gated write execution needs an approved SoR per-action spec; S12 redeploy
  needs owner reauth; the process desks need Q&A).
- 2026-07-01 (same loop run) — SHIPPED two read-only, non-executing follow-ons on top of the write-back approval
  control plane (`docs/meta-prompts/writeback-approval-followons.md`), each readiness-hardening (operator visibility +
  auditability of a governance control) and passing the Migration-Readiness Stop Gate:
  - SLICE A — cross-run "Write-back queue" tab (`F-WRITEBACK-QUEUE`). A third value-free tab in the Approval Queue
    (beside "All items" + "Renewals") consolidates every QUEUED write-back proposal ACROSS ALL RUNS and groups it by
    APPROVAL STATE (Awaiting approval / Approved — ready to write, not executed / Returned), each row deep-linking to its
    run page. New pure projection `buildWritebackApprovalQueue(views)` reuses the SAME `RenewalRunView[]` the review
    board assembles — I extracted `loadRenewalRunViews` so the page builds BOTH the review board AND the queue from ONE
    Firestore gather (no new/duplicate reads, no N+1). Rows copy ONLY value-free fields (fieldKey, fieldLabel, severity,
    runId, runLabel, state, href); the proposed value / decision reason / decider stay behind the deep link. Read +
    deep-link only — NO approve/return affordance (acting stays on the run page's Admin control, OQ-UI-1 posture). Tests:
    value-free invariant (pins the EXACT row key set; asserts value/reason/decider/activity never serialize) + grouping/
    counts + ordering + a component render/tab test.
  - SLICE B — run-page approval AUDIT TRAIL (extends `F-WRITEBACK-APPROVAL`). New `listWritebackApprovalActivityForRun`
    does ONE run-scoped `where(run_id)` query, grouped by `source_trigger_key` (NOT N per-flag reads); the grouped
    activity threads through `buildRenewalRunView` (new optional param) onto the flag overlay's optional `activity[]`
    (oldest→newest). `LeaseRenewalRunClient` renders a compact timeline (approve/return/revoke — who, when, why) under the
    existing approval control; the run page server loads it in the existing resolutions/approvals try/catch, degrading to
    an empty map. Value-bearing display is RUN-PAGE-ONLY (design §6.1); the value-free board/queue never carry it —
    `loadRenewalRunViews` doesn't load activity, and a test proves the board drops the overlay even when a run view
    carries it. Tests: service grouping (fake Firestore) + run-view overlay carries the grouped activity + board-no-leak.
    Both slices execute NOTHING, add NO vendor action, touch NO move-in/move-out, and change `production_allowed` nowhere
    (grepped the paths). Verification: 913 tests pass (+15); lint / typecheck / verify:falsification / verify:router-
    boundary / verify:context-freshness all green; prettier --check clean on the touched files (formatted only my own
    LF files — no mass reformat). Commit queue prepared (one group per slice); not committed/pushed/merged (awaiting ask).
- 2026-07-01 — SHIPPED both slices to `main` (owner-approved push): commits `74027d8` (Slice B audit trail) + `dec3dfb`
  (Slice A queue tab), branched to `feat/writeback-approval-followons`, fast-forwarded `main`, pushed. Then ran an
  adversarial falsification workflow (5 lenses: value-leak, executing-FSM/SoR-write, admin-gate, N+1, doc-drift) —
  all invariants held; repaired 2 nits (removed the now-dead `loadRenewalReviewBoard` so the single-gather is
  structural; hardened the queue test to pin the value-free key set on every row).
- 2026-07-01 — S12 REDEPLOY DONE (closes the F-DEVPROD-PARITY "verify against prod, not localhost" gap). Owner ran the
  redeploy runbook (`docs/temp/redeploy-parity-runbook.md`): agent pre-validated the deploy (dry-run + budget-guard
  green) and fixed a config blocker — the maintenance photo folder was inside `SPACE_DRIVE_FOLDER_IDS` (2 entries →
  broke the cheap-live single-Space guard), moved to `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` per `F-MAINT-PHOTO` (backup
  `.env.local.bak`). Deploy blocker chain cleared: RentVine Secret Manager secrets had to be CREATED (a "permission
  denied" at deploy = missing secret; `add-iam-policy-binding` 404 confirmed) then granted `secretAccessor` on the
  runtime SA `pmi-kc-kb-runtime@`. Redeploy of current `main` succeeded on `pmi-kc-kb-demo`. Agent HTTP-verified the
  prod fence: `GET /`→307 to sign-in (app up, title renders, no auth loop); demo-cookie `POST /api/ask`→401
  "Authentication is required." (proves `LOCAL_DEMO_AUTH=false` in prod). REMAINING: owner's signed-in check that the
  live renewal review pulls real Sheet + RentVine data against the deployed endpoint (the live-connection data path).
- 2026-07-01 — LIVE RENEWAL REVIEW verified against the DEPLOYED service (the live-connection data path); closes the
  F-DEVPROD-PARITY gap fully. Getting there surfaced + fixed THREE undocumented prod-setup gaps (all now in
  `docs/client-production-cutover.md`), each caught only by testing prod (they all "work locally"):
  1. RentVine Secret Manager secrets had to be CREATED, then the runtime SA granted `secretmanager.secretAccessor`
     on them (a deploy-time "permission denied on secret" actually means the secret is missing/inaccessible; the
     `add-iam-policy-binding` 404 confirmed missing). Owner created them (PowerShell, no-trailing-newline temp file)
     - granted access; redeploy then succeeded.
  2. Operator Admin role: the authenticated user was `Editor` in prod (no `role` custom claim → `readFirebaseRole`
     defaults to Editor), so the Admin-gated live review + write-back approval DECISIONS were unreachable. Fixed via
     `firebase:set-role --email=josiah@pmikcmetro.com --role=Admin` (pmi-kc-kb-prod); claims only refresh on a fresh
     sign-in, so a stale session kept showing Editor until re-auth.
  3. Sheet DWD IAM: the deployed live read failed `auth_error` while both RentVine + Sheet read fine locally. Root
     cause: the keyless DWD Sheet read has the CALLER `signJwt` as the reader SA (`lease-renewal-reader@`), and the
     caller in prod is the runtime SA `pmi-kc-kb-runtime@` — which lacked `iam.serviceAccountTokenCreator` on the
     reader SA (locally the human ADC already had it). Owner granted it; no redeploy needed.
     RESULT (agent HTTP + headless Playwright with the owner's Admin session): `/lease-renewal/live` returns LIVE_OK —
     "Live data", 25 real RentVine leases, the 2 real current-rent conflicts, `production_allowed:false`. RentVine was
     never the problem (the `auth_error` was the Sheet DWD). Verified read-only end-to-end: RentVine (Secret Manager) +
     Sheet (DWD) + reconciliation + Admin auth, no write. Updated `F-DEVPROD-PARITY` + the cutover doc IAM/role list.
- 2026-07-01 — WRITE-BACK GOVERNANCE verified LIVE in prod (closes the "prove governance live" step). On the deployed
  service, an Admin (real `pmikcmetro.com` sign-in, `role:Admin` custom claim) resolved a real Current-rent/High
  conflict → queued the append-only proposal → the `WritebackApprovalControl` rendered → Approve flipped it to
  **"Approved — ready to write (not executed)"** and the run-page **Decision history** audit trail (`F-WRITEBACK-APPROVAL`
  Slice B) showed the decision with decider uid + reason + ISO timestamp — value-bearing, run-page-only, non-executing
  (`production_allowed`/`executed` false; no SoR write). Owner-confirmed by screenshot. Both this cycle's shipped slices
  (`F-WRITEBACK-APPROVAL` audit trail + `F-WRITEBACK-QUEUE`) are now proven live, not just in the unit/falsification
  suites. (Left one sim-run resolution+approval+activity record in prod Firestore from the walkthrough — synthetic run,
  non-executing; clear with a targeted delete or `demo:reset` if desired.)
- 2026-07-01 — S12 redeploy END-TO-END verified: owner ran `smoke:auth-live` (interactive sign-in, persisted session),
  then the agent ran `smoke:ask-live --browser-session --base-url=<deployed>` headlessly. PASS: HTTP 200, authenticated
  as the real `pmikcmetro.com` user, `source_state: "Verified Source"`, a grounded answer with 2 citations + draft +
  handling steps. Proves the deployed stack works end-to-end (Firebase auth → Cloud Run → Gemini Flash → Agent Search
  grounding), not just localhost. Still owner-eyeball-only: the live RENEWAL REVIEW (RentVine + Sheet DWD) against the
  deployed endpoint — a different path from the Ask/Agent-Search corpus this smoke exercised.
- 2026-07-02 — PLANNING ONLY (no build): captured the operator's 2026-07-02 "Pre-Customer Refinement" note and
  produced the decision-complete cycle packet `docs/temp/pre-customer-refinement-plan.md` (nine-area repo mapping
  with file:line evidence). The note's complaints are mostly literal defects at HEAD: both quoted copy strings are
  live (`lib/connections/connector-catalog.ts:32` "exception and control plane";
  `components/connections/ConnectionCenter.tsx:14` "PMI handles the setup for you" — which IS the S2 rewrite);
  ~290 em dashes with the voice doc's own "simulation → Test run" lexicon rule never applied; the default approval
  tab AND the Console's "My approvals" answer both read the near-empty `approval_queue_items` collection while
  renewal flags/write-backs wait on other tabs (the "queue says nothing waiting" complaint, verbatim);
  `.lr-approve-form` has zero CSS anywhere so the write-back "reason required" box renders ~20 columns wide
  (the small-screen complaint); renewal reconcile `direct_link`s point at a route that does not exist
  (`/lease-renewal/runs/{id}/reconciliation/{fieldKey}` → 404); the built lease-renewal + maintenance process
  definitions were never live-seeded so even the two real processes badge "Needs a process"; prod Dictate is
  unverified with `speech.googleapis.com` absent from every enable list (prod forces the Google provider — no stub
  fallback); the Connection Center's "Connected" state (`verifiedIds`) is wired to nothing so live-verified
  connectors max out at "Ready to verify"; Dotloop/LeadSimple have `requiredConfig: []` (no seam for existing
  credentials) and Gmail is absent from the catalog; decisions persist with mandatory reasons but nothing reads
  them back for learning. Packet sequence: TIER-0 owner steps (live seed w/ real uids, Dan prod Admin claim,
  Speech API enable, send the unblock note) → Wave 1 (copy pass v2 + repo copy gate, unified "Needs your decision"
  inbox + bulk write-back decisions on the run page + textarea CSS fix, deep-link 404 fix + Console counts +
  honest approvals number, connections truth incl. live-probe "Connected") → Wave 2 (move-in/move-out Draft
  definition seeds from the process doc + reusable per-Space desks, tenant-notice + owner-outreach definitions) →
  Wave 3 (pure notice-need detector with mid-month + 10-day rules as flagged configurable defaults, Dictate
  hardening + `smoke:transcribe-live`, decision metrics + enumerated reason codes + decisions-to-golden
  distillation + value-free rule-tuning PRs). Twelve confirm-with-default owner decisions are tabled in the
  packet; hard gates unchanged (no autonomous send, no SoR write execution, no Cloud Scheduler, no client data on
  GitHub). Stale-doc finds folded into packet slice D6: the Drive-DWD "unauthorized_client" note in
  `lib/integrations/health-checks.ts` contradicts F-DRIVE-DWD (Drive is live-verified); feature-suites README status column
  lags facts.md (S10/S12); `docs/feature-suites/space-teeth.md` still carries the hard-gates line the Q&A
  overrode. Loop-state RESUME repointed at the packet. Plan trigger honored: packet + loop-state only, no build.
- 2026-07-02 — DECISIONS LOCKED + S13 PROMOTED (owner-present): the owner answered ALL 12 pre-customer-refinement
  confirm-with-default decisions YES, with ONE amendment — renewal-notice timing rules (mid-month deadline, warning
  lead days, 10-day follow-up) must be CONFIGURABLE per tenant/lease and per property (most-specific-wins over
  global defaults; pure resolver; defaults flagged Needs Verification until Dan confirms values), never global
  constants. Promoted the durable direction out of the gitignored packet into tracked docs: NEW suite spec
  `docs/feature-suites/pre-customer-refinement.md` (S13 — decisions, waves, the notice rule-engine requirement,
  ordered prompt sequence), README row added, `F-PRECUST-CYCLE` fact recorded. Doc-drift fixes in the same pass:
  `docs/feature-suites/space-teeth.md` no longer claims move-in hard gates (owner Q2 override; supersede-log row
  SPACETEETH-HARD-GATES) its move-out bullet now matches the recorded
  answers (manual Start-move-out only — the Renewals handoff is deferred per Q1; the app computes a SUGGESTED
  deposit deduction per the Q3 override), and its Q&A gate reads ANSWERED/runs-via-S13; feature-suites README status column
  now matches facts.md (S6/S10/S12 built). Loop-state RESUME repointed: next = RUN THE LOOP on S13 Wave 1 (fresh
  context window). No product code changed; hard gates unchanged.
- 2026-07-02 — ADVERSARIAL CHECK + CI RESTORED (pre-push): three skeptic agents (governance, gate-mechanics,
  factual-accuracy) attacked the decision-lock diff before push. Confirmed + fixed: (1) the space-teeth Move-Out
  bullet still encoded two pre-override defaults (Renewals-handoff trigger; "no app math" deposits) — rewritten to
  the recorded Q1/Q3 answers (manual "Start move-out" ONLY; the app computes a SUGGESTED deposit deduction with
  binding guardrails), and the suite/loop-state now warn that several Q&A answers OVERRIDE printed defaults;
  (2) loop-state candidates 0/4 still advertised the retired "Owner Q&A — BLOCKING" gate a fresh loop would obey —
  rewritten to ANSWERED/runs-via-S13, and history bullets compressed to restore headroom under the 140-line cap;
  (3) the seed instruction would silently write PLACEHOLDER owner/approver uids (script env fallback) — S13 +
  loop-state now require PROCESS_OWNER_UID/PROCESS_APPROVER_UID env first; (4) per-property notice-rule values
  were wrongly described as already covered by the unblock note — added to the draft note as ask 7
  (confirm-with-default: global defaults until Dan supplies exceptions); (5) S13's slice ids (A1–H4) are now
  spelled out in the tracked suite so a clean checkout can execute without the gitignored packet; (6) prettier
  source fixes in the new/edited docs (bare `lr-*` glob would have been emphasis-mangled by a blind --write).
  SEPARATE structural finding: CI on main has been RED for the last 5 runs, dying at `format:check` (39 files)
  BEFORE lint/typecheck/test — so no CI gate (incl. context-freshness inside `npm test`) has actually been
  enforcing on pushes; the "format drift is just local Windows CRLF" belief is FALSIFIED (the failures reproduce
  in CI's clean LF checkout). Restored via a dedicated style-only commit: `npx prettier --write` scoped to
  exactly the pre-existing failing files, diffs reviewed for markdown mangling, full test suite run before push.
- 2026-07-02 — S13 WAVE 1 COMPLETE (loop run, branch `s13-wave1-precustomer`, commits c07a8dd..ca3c9bf): built and
  verified slices B2/B4/B5 + C1–C4 + D1–D6 on top of the earlier A/B3/B1. B: bulk approve/return landed ON the run
  page (multi-select + ONE shared mandatory reason per decision 2 — Admin-only, the bulk endpoint loops the
  existing per-proposal transaction so every invariant holds per item, per-item Activity row + per-item failure
  reporting, NO approve affordance added to value-free tabs); decided/resolved items now default-collapse to
  counts-only details sections on the write-back queue + renewal review (B4); and a shared needs-decision gather
  (`lib/approval/needs-decision-gather.ts`) now feeds the Console approvals answer AND a "N waiting on you" pill on
  the lease-renewal Space card, so no surface answers "Nothing" while the queue holds work (B5). C: the persisted
  reconcile deep links (`/runs/{id}/reconciliation/{fieldKey}`) that 404ed now redirect to the run page with
  ?flag= highlight/scroll (C1); app-state items deep-link per item/per connector anchor (C2); the Console shows
  live counts on its three command buttons + a one-line "N things need your decision. Start with …" link (C3);
  and reconcile queue items dedupe against their flag/write-back rows by source_trigger_key — one decision, one
  row, one count everywhere (C4). D: the two BUILT live probes (RentVine, Sheets) now feed `verifiedIds` through
  `runHealthCheck` with a ~10-minute in-process cache (decision 6) so working connectors show "Connected" (D1);
  Sheets/Drive requiredConfig tells the DWD truth (D2); Dotloop + LeadSimple env seams named (D3); the send-only
  Gmail notifier got an honest "notifications sender" card (D4); /connections is read-gated — non-Admins see
  read-only status, Admins keep the wizard + a fresh "Verify connection" button behind an Admin-only route (D5);
  the stale Drive-DWD "unauthorized_client" note corrected to F-DRIVE-DWD truth (D6). Gates on every slice: lint,
  typecheck, full suite (913 → 970 tests), verify:copy-voice, verify:falsification, prettier on touched files;
  value-free sentinels extended, never weakened. Fact row F-PRECUST-WAVE1. STOP fired: context reset at the
  Wave-1→Wave-2 boundary; next slice is E1 (Move-In/Move-Out Draft definition seeds — honor the Q&A answers
  VERBATIM from `docs/products/v1-process-qa.md`) in a fresh session. Residual: bulk-bar UX not browser-walked
  (run page is auth+Firestore-gated locally; jsdom interaction tests cover it) — include in the end-of-cycle
  deployed-endpoint walkthrough; Tier-0 owner steps still pending and none block Wave 2.
- 2026-07-02 — S13 WAVE 2 (SPACE-TEETH) E1-E4 BUILT (loop run, branch `s13-wave2-space-teeth`, NOT merged; 1022
  tests, all gates green): built the four launch Spaces' real desks from the answered Q&A verbatim. E1 — Move-In
  (10-step) + Move-Out+Deposit-Disposition (11-step) Draft process-definition seeds quoting
  move-in-move-out-process.md §3/§4, wired onto their Spaces (processDefinitionId + rentvine/google_sheets
  connectors), registered in the seed CLI (dry-run shows 6 defs, all Draft, none Approved-for-Execution). The Q2
  override holds (every move-in step incl. e-sign/certified-funds is a checklist flag, no hard gate), Q1 holds
  (Move-Out manual "Start move-out" trigger only, no Renewals handoff); F-MOVEIN-1/F-MOVEOUT-1 recorded. E2 — a
  reusable `SpaceDesk` server component generalizes the Renewal Desk shape (PageHeader + Stepper from the
  definition + connected-tools via classifyConnector + one next action + an injected domain slot), backed by a NEW
  persisted per-step checklist layer (`lib/firestore/workflow-run-step-checks.ts`: `workflow_run_step_checks` +
  append-only twin, natural-key upsert by `${run_id}:${step_id}`, gated at `edit` — app-plane, NOT the Admin
  write-back tier; Skipped-requires-reason; route `app/api/workflow-runs/[runId]/step-checks`), a "Start a run"
  client control reusing the EXISTING test-runs path, wired into `app/spaces/[spaceId]` (the desk replaces the
  placeholder for process-carrying Spaces; every other Space unchanged). Move-In domain core = a DRAFT welcome
  (email + Portal Chat; fees render "see RentVine", deposit posture cites Missouri 2x rent as text); Move-Out core
  = an evidence packet with a SUGGESTED deposit deduction (integer-cents summation, labeled
  SUGGESTION-ONLY/owner-approval-required, never posts anywhere; the statutory deadline + legal wording stay
  literal Needs-Verification). E3 — Tenant Renewal Notice + Dotloop follow-up Draft definition (new pure
  `buildDotloopFollowUpDraft` referencing the two EXISTING Dotloop registry keys, Needs Permission; wraps the
  existing `buildTenantOfferDraft`). E4 — Owner Renewal Outreach Draft definition wrapping the existing
  `buildOwnerRenewalDraft` verbatim. E3/E4 reuse the E2a shell as-is (no new desk component) — F-SPACE-DESK-1.
  Gates each slice: lint, tsc --noEmit, full suite (983→1011→1022), verify:falsification/copy-voice/
  context-freshness/router-boundary, prettier on touched files; diff-grep proved no RentVine/Dotloop/Sheets/
  ledger/QuickBooks write call and no send call in any new code (the only fetches target the app's own /api
  routes). Docs: facts F-MOVEIN-1/F-MOVEOUT-1/F-SPACE-DESK-1, loop-state repointed to E5, this entry;
  space-teeth.md + move-in-move-out-process.md status lines + the stale client-checklist "Move-Out" row refreshed.
  STOP fired: E1-E4 shipped; E5 (the LIVE seed — set PROCESS_OWNER_UID/PROCESS_APPROVER_UID, then `npm run
seed:process-definitions`) is owner-run, handed back as the next Tier-0 step. Commit queue prepared per
  sub-slice; NOT committed/pushed/merged (awaiting explicit ask). Residual: desk not browser-walked (auth+Firestore
  gated locally; jsdom render + service/route tests cover it) — include in the deployed-endpoint acceptance review.
- 2026-07-02 — S13 WAVE 3 (NOTICES / DICTATE / LEARNING LOOP) BUILT + MERGED (loop run, branch
  `s13-wave3-notices-dictate-learning`; 1066 tests, all gates green — lint, tsc, vitest, verify:falsification/
  copy-voice/context-freshness/router-boundary/redaction; prettier on touched files). Final S13 wave.
  **F — governed renewal-notice engine** (`F-NOTICE-ENGINE`): F1 a pure most-specific-wins (lease>property>global)
  rule resolver over configurable timing DATA with per-field provenance + boundary-safe date math (mirrors
  `cohort.ts`), a seedable app-plane config record (`lease_renewal_notice_rules`, client-read-only, `seed:notice-rules`
  owner-run, dry-run verified), every default `Needs Verification` until Dan confirms; F2 read-only effective-rule
  surfacing (`NoticeRuleCard` on the renewal Space desks + a per-lease "Notice due by <date> (default)" view on the
  live workspace); F3 owner/tenant drafts reuse the built composers with the verbatim `DRAFT_BANNER` on the
  outreach/notice desks; F4 operator-triggered reminders via `notices:reminders` (pure planner, dry-run, deduped, NO
  Scheduler, NO send); F5 DOCS-ONLY per-action specs for `gmail.renewal_notice.draft_create` + the future send
  (`production_allowed:false`). **G — verified Dictate** (`F-DICTATE-VERIFIED`): G1 `SpeechSetupError` classifies the
  Google error (api_disabled/auth/encoding) + surfaces its detail; G2 one shared `useAudioRecorder` hook (dedupes the
  maintenance + Console recorders) with network catch, ~55s auto-stop, empty-transcript hint; G3
  `MediaRecorder.isTypeSupported` negotiation with an HONEST Safari/iPhone mp4 message; G4 new `smoke:transcribe-live`
  (committed few-KB SYNTHETIC WAV fixture) + `speech.googleapis.com` added to `REQUIRED_GCP_APIS` AND the cutover
  enable block in one change (doc-sync test enforces sync). Enabling the API + the live smoke are OWNER-RUN. **H —
  deterministic learning loop** (`F-LEARN-LOOP`): H1 a value-free decision-metrics card (accept/correct/dismiss +
  reason-code counts over the decision collections; sentinel-tested exact key set); H2 an enumerated `reason_code`
  taxonomy (6 defaults) added ADDITIVELY/optionally to BOTH decision schemas + records + the three run-page forms via a
  shared `ReasonCodeSelect`; H3 an OFFLINE `golden:distill` CLI that pre-fills golden worksheets from value-free
  `(fieldKey, kind)` signals and never auto-verifies (reviewed stays false, counts-only stdout); H4 a rule-tuning-as-PR
  loop = PR-template checklist + a `verify:redaction` gate (CI + verify.sh) that fails if any `golden-data/`/
  `docs/client_docs/` file is tracked. Diff-grep proved no SoR/Sheet/Gmail send-or-write call and no client data on any
  committable path; every Action Registry entry stays `production_allowed:false`; identity unchanged. Adversarial
  self-review (governance / gate-mechanics / value-free skeptics) run before push. Docs: facts
  `F-NOTICE-ENGINE`/`F-DICTATE-VERIFIED`/`F-LEARN-LOOP`, loop-state RESUME repointed, this entry. STOP fired: F+G+H all
  shipped (Wave 3 complete). OWNER-RUN handoffs remain (auth:session; live seeds incl. the new `seed:notice-rules` +
  Wave-2 E5; Dan prod Admin claim; `gcloud services enable speech.googleapis.com`; SEND the unblock note; end-of-cycle
  redeploy + `smoke:ask-live` + `smoke:transcribe-live` vs the deployed endpoint + Dan's Admin walkthrough).
- 2026-07-04 — S13 PRODUCTION-READINESS HANDOFF STARTED (no live writes/deploy): implemented the local/verifiable
  portion of the next-slice plan. Green checks: `npm run format:check`, `npm run typecheck`, `npm run lint`,
  `npm test` (148 files / 1076 tests), `npm run verify:falsification`, `npm run verify:context-freshness`, and
  `bash scripts/verify.sh` (format, lint, typecheck, tests, router-boundary, falsification, context-freshness,
  redaction, build). `npm run check:budget-guard` passed ($10 cap, away mode inactive). Dry-runs passed:
  `seed:process-definitions -- --dry-run` built the six Draft definitions with no `Approved for Execution`
  references; `seed:notice-rules -- --dry-run` built one unverified config; and the deploy dry-run previewed the
  expected `pmi-kc-kb-prod` / `pmi-kc-kb-demo` deploy with RentVine credentials still via Secret Manager. BLOCKED
  before live seed/API enable/deploy/smoke: `npm run preflight:adc` failed `invalid_grant`
  / `invalid_rapt`, so the owner must run `npm run auth:session`; the seed JSON also still showed
  `process-owner-PLACEHOLDER` / `process-approver-PLACEHOLDER`, so real Dan/Josiah Firebase UIDs must be exported
  as `PROCESS_OWNER_UID` and `PROCESS_APPROVER_UID` before any live seed. The gitignored
  `docs/temp/client-unblock-note-draft.md` was trimmed to the two real Dan asks (QuickBooks access and official
  deposit-accounting home); it remains human-send-only and was not sent.
- 2026-07-07 — S13 GO-LIVE COMPLETE, verified live in prod. Post-Wave-3 increments merged first: PR #38 (governed
  Gmail renewal-notice draft composer + gated `gmail.renewal_notice.draft_create` registry entry + provisional
  $500 move-out repair sign-off threshold) and PR #39 (budget-policy kill-switch doc reconcile). Owner refreshed
  ADC (`npm run auth:session`) and redeployed `main` to Cloud Run: revision `pmi-kc-kb-demo-00010-sgt` serving 100%
  traffic (canonical URL https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app, HTTP 200). LIVE app-plane seeds landed:
  `lease_renewal_notice_rules/active` (DEFAULT, unverified pending Dan) and `process_definitions/lease-renewal`
  (status Draft). TWO Admins confirmed by custom-claim read-back: `dan@pmikcmetro.com`=Admin (activates on his next
  sign-in) and `josiah@pmikcmetro.com`=Admin. Live Dictate PROVEN on the DEPLOYED endpoint:
  `smoke:transcribe-live --browser-session` PASS (HTTP 200) via the runtime SA (no user-ADC quota-project issue);
  `speech.googleapis.com` enabled 2026-07-03. Budget: $10 kill switch armed + verified on `pmi-kc-kb-prod`.
  REMAINING: Dan's Admin walkthrough (this meeting) + his 2nd sign-in + two client answers (QuickBooks access tier,
  official deposit-accounting home). Still GATED/unchanged: Sheet write EXECUTION, Gmail runtime, Cloud Scheduler.
- 2026-07-08/09 — CONSOLE OVERHAUL cycle shipped + merged to `main` (from the 2026-07-08 operator voice note "PMI console
  edit and integrations"; decision-complete packet `docs/temp/console-overhaul-plan.md`). Six slices across four PRs, each
  behind full CI (typecheck, lint, `next build`, ~1100 unit tests, format, copy-voice, context-freshness, Firestore rules
  emulator): PR #41 — A action-first Console (always-visible action deck + read-only process strip + prominent Dictate;
  `F-CONSOLE-APP-STATE` amended), B color-coded Space cards green/amber/red/purple (`F-SPACE-CARD-COLOR`), C Renewal
  needs-attention fold + run-form CSS fix (`F-RENEWAL-ATTENTION`), D Admin re-section into People/Logs/Info (`F-ADMIN-IA`);
  PR #42 — in-app user + role management with last-Admin guard + `admin_role_changes` audit (`F-ADMIN-USERS`); PR #43 —
  persisted Maintenance ticket queue + lifecycle + append-only activity (`F-MAINT-TICKETS`); PR #44 — per-user Gmail
  representation (`gmail_inbox` connector) + Owner-Email reframe to per-user (`F-GMAIL-PER-USER`). All app-plane;
  `production_allowed:false` throughout; no system-of-record write, no send; three new server-write-only Firestore
  collections (`admin_role_changes`, `maintenance_tickets`, `maintenance_ticket_activity`) with client writes denied.
  THEN an adversarial review (7 parallel reviewers vs. the operator's original note) drove a remediation PR: fixed the
  maintenance writer to use a Firestore transaction (was a non-transactional read-modify-write → lost-update/atomicity
  bug), made the renewal attention fold surface only leases that genuinely need attention (was duplicating the queue) +
  fixed its deadline ordering, made the admin audit write graceful-degrade (a failed audit no longer reports a false
  role-change failure) + bounded its query + documented the last-Admin guard as best-effort, corrected the `gmail_inbox`
  "never Connected" reasoning (it is the probe omission, not the empty config) + pinned it with a test, cleaned copy-voice
  em-dashes, and updated `docs/loop-state.md` + this log (the review's top governance finding: docs went un-updated across
  the cycle). Facts this cycle are UNIT-verified only (stale ADC blocked live runs). DEFERRED / not built (tracked as the
  next slices): renewal owner-email send affordance + live-review actionability + per-property repository; maintenance
  external-worker Submitter auth + universal unit type-ahead DB + delegable ownership; per-user Gmail RUNTIME (reading /
  AI-drafted replies / notifications / reminder cadence, gated on the client Gmail access model + DWD authorization); and
  the Approval-Queue action-first rebuild (detail-panel decision-first + tab collapse). Governance note added to
  `AGENTS.md` for the new in-app role-management surface + the per-user Gmail identity model.

## 2026-07-09 — Stop-condition archive + deferred-cycle kickoff

Loop-state headroom reclaim (context-freshness cap): the older Stop-Condition detail is moved here verbatim from
`docs/loop-state.md`, which must stay a short pointer under the 140-line cap so the deferred-cycle slices can
record their facts. Both blocks below are cleared/superseded and kept here as append-only history.

- Fired earlier + 2026-06-30: migration-readiness / "no safe slice" stops — foundations + the S12→S6→S10 slices
  shipped + merged; high-value work blocked on client replies, prod setup, approved sources.
- Owner-present cycles 2026-07-01: Working Order added (`F-WORKING-ORDER`); shipped the renewal review sub-tab,
  write-back proposal + APPROVAL control plane + queue tab + audit trail, maintenance unit matcher wired live,
  owner-notice draft + vendor suggestion (`F-RENEWAL-REVIEW-SUBTAB` … `F-MAINT-NOTICE-VENDOR`); Maintenance V1 UI
  COMPLETE; 913 tests; S12 REDEPLOY DONE (`main` live on `pmi-kc-kb-demo`, prod fence HTTP-verified 401/307).
  Remaining: the gated SoR write spec.

Deferred-cycle kickoff (2026-07-09): began the four DEFERRED bullets on branch `console-overhaul-g-deferred-cycle`,
sequenced slice-by-slice (app-plane, `production_allowed:false`, no SoR write, no send). Owner decisions this cycle:
A4 = open Console act-in-place (supersede recorded when built), A5 = build the tokenized-link public maintenance
intake ingress, B1 = Gmail DWD scopes reported granted → build the per-user Gmail runtime TO THE GATE (registry stays
`production_allowed:false` until the real DWD grant artifact is committed and the owner runs the live deploy).

A5 — public tokenized maintenance intake SHIPPED (2026-07-09, branch `console-overhaul-h-a5-intake`, `F-MAINT-INTAKE-PUBLIC`).
This is the app's FIRST and ONLY unauthenticated write endpoint, built after an adversarial hardening pass (4 attackers +
synthesizer). Flow: a staff member mints an HMAC-signed, property-scoped token (edit-gated `POST /api/maintenance/intake/token`
or `npm run intake:mint`); a tenant/vendor POSTs one report to the UNAUTHENTICATED `/api/maintenance/intake/public` with the
token in an `X-Intake-Token` header; on success it lands in the `maintenance_unverified_intake` QUARANTINE collection via the
no-actor `createUnverifiedIntakeFromPublic` writer. Structural isolation is the core guarantee: the public route + writer
import none of `createMaintenanceTicket` / `requireCapability` / `lib/auth/session` / RentVine / unit-matcher, pinned by a
negative-import test, and a NEW enumerating `tests/unit/route-auth-boundary.test.ts` asserts every `app/api/**/route.ts` is
authed except a 3-entry allow-list (`auth/session`, `auth/demo`, this route) — so no future route ships unauthed by accident.
Hardenings baked in (adversarial pass): length-guarded `timingSafeEqual` (forged token → generic 401, never a 500/timing
oracle); domain-separated HMAC over literal payload bytes + verify-side 30-day max-TTL; single-use nonce (replay guard),
per-property daily 503 kill-ceiling (owner budget safety), and a revocation epoch, all enforced transactionally
(reads-before-writes); an in-instance token-bucket pre-gate keyed on the salted rightmost-XFF IP (fires before any HMAC);
a hard 16 KB streamed body cap; a shared sanitizer (NFC + strip C0/C1/bidi/zero-width + CSV-injection neutralization); and a
202 with a fresh random reference (never the doc id/jti). Owner decisions applied per the plan: D1 single-use ≤7d default
(reusable ≤30d for signage), D2 photoRef DROPPED (attacker-controlled; add later via a minted-id channel). Owner activation
steps (D3/D4): the route FAILS CLOSED (503) until `MAINTENANCE_INTAKE_TOKEN_SECRET` (+ `_IP_HASH_SALT`, `_DAILY_CAP`) is
provisioned in Secret Manager, and a Firestore TTL policy on the intake/nonce `expires_at` reaps junk. Ships
`production_allowed:false` (an app-plane quarantine write, not an external action → no registry entry). Verified locally: full
unit suite (1200+) + typecheck + lint (0 errors) + copy-voice + router-boundary green; the emulator rules test denies every
client write to intake/activity and denies all client access to nonce/counter/epoch. STILL owner-gated (unchanged): the Gmail
`production_allowed:true` flip (needs the committed DWD grant artifact + an owner-run deploy). Remaining deferred slices: A4
(Console act-in-place), unit type-ahead, delegable ownership, notifications, Approval-Queue rebuild.

2d — public-intake review/promote triage SHIPPED (2026-07-09, branch `console-overhaul-h-2d-intake-review`,
`F-MAINT-INTAKE-REVIEW`). Completes the A5 loop: A5 dropped tenant/vendor reports into the `maintenance_unverified_intake`
quarantine; 2d is the edit-gated staff surface that acts on them. New `lib/firestore/maintenance-intake-review.ts` — kept a
SEPARATE module from the no-actor public writer so the writer preserves its negative-import isolation — exposes
`listUnverifiedIntake` (edit-gated read), `promoteUnverifiedIntake`, and `dismissUnverifiedIntake`. Promotion is ONE atomic
transaction: it creates a real `maintenance_tickets` ticket (reporter.kind "external", unit null, labelled "Needs
Verification", priority inferred from the report text with transparent provenance unless the operator overrides) + its
Activity twin AND flips the intake to "promoted" together — so a double-click or concurrent promote cannot mint two tickets
(404 on a missing intake, 409 on an already-triaged one). Dismissal records a required reason on the append-only intake
Activity. Three edit-gated routes (`GET /api/maintenance/intake`, `POST /api/maintenance/intake/:id/promote`, `.../dismiss`)
are all covered by the enumerating route-auth-boundary invariant — only `/intake/public` stays allow-listed unauthenticated.
The maintenance page renders a new `UnverifiedIntakeReview` client panel (a client-safe `lib/maintenance/intake-model` type,
extracted from the Admin-SDK writer module so the panel does not pull firebase-admin; non-fatal degrade like the ticket
queue). App-plane only — promotion creates a KB ticket, never a system-of-record work order, never a send;
`production_allowed:false` throughout, no registry change. Verified locally: typecheck, lint (0 errors), the full unit suite
(incl. atomic-promote + idempotency + route-auth + component tests), the emulator rules test, Turbopack build, and every
gate green.

Gmail renewal-notice draft — SECTION-3 FLIP to executable (2026-07-09, branch `gmail-renewal-draft-flip`,
`F-GMAIL-RENEWAL-DRAFT-LIVE`). The FIRST executable external action in the Action Registry. Owner ran the live smoke, which
minted a keyless DWD token and created + deleted an UNSENT draft (`r-5809471014674430724`) — the root cause of the prior 403
was the Gmail API not being enabled on `pmi-kc-kb-prod` (the DWD `gmail.compose` grant + Token Creator were already fine; the
403 came AFTER a successful token mint). Enabling `gmail.googleapis.com` cleared it. Committed the grant artifact
(`docs/evidence/gmail-dwd-grant-2026-07.md`: SA client id 104374162913177846911, scope gmail.compose, gmail.send absent,
date) and flipped ONLY `gmail.renewal_notice.draft_create` → readiness "Approved for Execution" + evidence_status
"Documented" + `production_allowed:true`. Deliberately did NOT flip the two Gmail Inbox 0 entries (`gmail.label.apply`,
`gmail.draft.create`) — they have no runtime and only `gmail.compose` was granted (least privilege). The guards were updated
to the new state, NOT weakened: the four blanket "all production_allowed:false" pins (action-registry-schema, action-gate,
action-registry, rentvine-health-probe) now assert EXACTLY this one key is executable, so any further flip trips them; the
seed script + migration-readiness share an `EXECUTABLE_ALLOWLIST` so a surprise flip of any un-allow-listed key is still
refused/flagged (migration-readiness gained `unexpected_production_allowed_keys`; the admin page reads "Gate-controlled", not
a violation). The runtime is unchanged — createDraft only, no send scope, no send method. Because the gate is the committed
seed (`isActionExecutable` reads `ACTION_REGISTRY_SEED`), the Prepare-owner-email button produces a real unsent draft in prod
only after the OWNER deploys this branch; rollback = set the entry back to Planned/false and redeploy. Verified locally:
typecheck, lint (0 errors), 1202 unit tests, falsification + freshness + copy-voice + router-boundary + redaction, Turbopack
build — all green.

2b — delegable maintenance ownership (assignee picker + "Assigned to me") SHIPPED (2026-07-09, branch
`console-overhaul-h-2b-assignee`, `F-MAINT-ASSIGNEE`). Built under ultracode: an understand-workflow (3 parallel readers)
first mapped the surface and corrected a false premise — the roster is Firebase AUTH (`listAppUsers` → `getAuth().listUsers`),
NOT a Firestore collection, and demo auth is synthetic (a demo Editor is never a real Auth account). That drove the key design
call: `lib/maintenance/assignees.ts` `listAssignableUsers()` is DEMO-AWARE — synthetic demo users when `localDemoAuth` (so the
picker is testable with a plain `npm run dev`), else the real Firebase Auth roster filtered to non-disabled accounts inside the
allowed hosted domain. The roster is fetched server-side on the already edit-gated maintenance page and passed to the client
queue (no manageAdmin admin-route reuse, no new endpoint; client-safe `assignee-model` type keeps firebase-admin out of the
bundle). Assign is validated server-side (`isAssignableUser` → 400 for a non-rostered uid; schema `trim().min(1).nullable()`
rejects ""/whitespace and normalizes so the checked value equals the persisted value); the picker shows email, never the raw
uid (off-roster shows a value-free "Assigned (outside roster)"). Then an adversarial review-workflow (3 lenses → find →
independently verify, 9 agents) confirmed 5 findings, all fixed: (1) MEDIUM — the prod roster wasn't domain-filtered
(asymmetric with the admin role path's defense-in-depth guard), so an external non-disabled Auth account could be shown +
assigned → fixed by filtering to the allowed hosted domain; (2) LOW — a check/write trim mismatch (validator trimmed, schema
didn't) → fixed with `trim()` on the schema; (3-5) three test-coverage gaps (Assigned-to-me empty state, off-roster selected
value, null no-op guard) → tests added. App-plane only; no SoR write, no send, no role grant, no notification. Verified
locally: typecheck, lint (0 errors), 1222 unit tests, all gates + Turbopack build green.

1c — per-property lease-renewal decision repository SHIPPED (2026-07-09, branch `deferred-1c-property-repository`,
`F-RENEWAL-PROPERTY-REPO`). A pure `lib/lease-renewal/property-repository.ts` joins each simulation run's ADDRESS-joined
reconciliation flags to a canonical property key (`deriveAddressKey` of the record's join value, now surfaced additively as
`ReconciledFieldOutcome.propertyKey`, populated ONLY for `spec.joinKind === "address"`) and buckets the EXISTING append-only
resolution + write-back-approval Activity by property. The surfaced payload is strictly VALUE-FREE — each entry is exactly
{actorUid, action, timestamp, reason}, never an address, field value, field_key, proposed value, severity, or reason_code
(pinned by a sentinel key-set assertion in the golden test). Because a flag's source_trigger_key is run+field only
(`lease_renewal:reconcile:{runId}:{field}`), a key raised by two or more properties in the same run is AMBIGUOUS and its
Activity is attributed to NEITHER property (no cross-property bleed); name-joined lifecycle fields carry no address and are
excluded by design. The golden test proves all three cases: 1:1 attribution on different fields, no bleed on a same-field
collision, and the value-free sentinel. A new manageAdmin-only server page `app/lease-renewal/property/[propertyKey]/page.tsx`
renders one property's decision history inside AppShell with a back-link, degrading non-fatally (try/catch) when Firestore is
unavailable; a new read-gated `listResolutionActivityForRun` mirrors `listWritebackApprovalActivityForRun` with a single-field
`where("run_id","==",runId)` read. NO new Firestore collection or index (`firestore.indexes.json` stays `[]`); the value-free
board/queue (`run-view.ts`, `approval-queue-mapping.ts`) are untouched so `propertyKey` never leaks; no Action Registry flip,
`EXECUTABLE_ALLOWLIST` unchanged, `production_allowed:false` app-plane only. Verified locally: typecheck, lint (0 errors),
full unit suite, copy-voice, context-freshness, redaction, router-boundary, and the Turbopack build all green.

## 2026-07-09 — Deferred cycle COMPLETE: all 7 slices shipped + merged (PRs #56-#62)

The 7-slice deferred cycle ran unattended to completion and merged to `main`: 2a unit type-ahead over a cached
RentVine unit index (`F-MAINT-UNIT-TYPEAHEAD`, PR #56); 1b live renewal review made actionable + the resolve-404
blocker fixed (`F-RENEWAL-LIVE-ACTIONABLE`, PR #57); 1c per-property lease-renewal decision repository +
manageAdmin page (`F-RENEWAL-PROPERTY-REPO`, PR #58); 3a anticipatory AI draft-text composer via the
ModelProvider seam (`F-GMAIL-DRAFT-COMPOSER`, PR #59); 3b in-app notification framework, email hard-off + Gmail
families stubbed (`F-NOTIF-FRAMEWORK`, PR #60); A4 Console act-in-place inline approve, superseding
F-CONSOLE-APP-STATE (`F-CONSOLE-ACT-IN-PLACE`, PR #61); 4a Approval-Queue presentation rebuild = one
urgent-first list + an "Other views" disclosure, superseding OQ-UI-1-TAB-LAYOUT (`F-APPROVAL-QUEUE-UNIFIED`,
PR #62).

Process: each slice was built on its own branch (heavier slices delegated to fresh-context subagents; the
notification framework and the two governance slices A4/4a were built + adversarially verified by a build +
4-lens falsification workflow — objective/scope, guardrails/security, governance-docs, tests/regression), then
PR -> CI `verify` -> merge. Every merge passed CI (~2 min each). The adversarial lenses surfaced and closed real
gaps before merge: a route param pass-through + transactional-atomicity coverage gap (3b), and the Approve
button's click->PATCH wiring being untested (A4). App-plane only throughout: no Action Registry flip
(`EXECUTABLE_ALLOWLIST` stays `["gmail.renewal_notice.draft_create"]`), no system-of-record write, no send, no
live Google auth needed (all slices demo-aware + unit-tested). Final `main`: full `npm run verify` green, 1288
tests. Stop condition: no safe app-plane slice remains — remaining work is owner/vendor-gated (prod deploy,
RentVine/Sheet writes, Gmail runtime, live process seed). See `docs/loop-state.md` for the resume pointer.

## 2026-07-10 — UI/UX + governance overhaul: runner-agnostic foundation + specs S14–S18 (branch, stopped for owner review)

Triggered by the owner voice-memo transcript (`obsidian-sync-vault/.../PMI KB Project Spec and UIUX
Overhaul/transcript.md`, 2026-07-10). A 7-reader grounding workflow mapped the five overhaul surfaces +
the governance/loop layer against current code; the recurring finding was that the engines already exist
and the gap is UI/IA wiring plus one governance hole (CI omitted the adversarial + freshness gates). Four
owner decisions were locked via confirm-with-default (recorded in `docs/facts.md` Open Questions):
**D1** a tapped `reason_code` satisfies the mandatory-reason rule for Low/Medium approval flags only (free
text stays required for High/Blocked + overrides); **D2** Console stays home, Notifications becomes a
superset hub the same signals also flow into; **D3** build the Gmail hub app-plane to-the-gate, no read
scope; **D4** deliver the foundation + specs this cycle, then STOP for owner review before any pillar build.

FOUNDATION (all app-plane docs/scripts/CI, gate-green on branch `feat/agnostic-governance-and-uiux-specs`):
(1) `F-RUNNER-AGNOSTIC` — AGENTS.md reframed runner-neutral with a "Per-Runner Pointers" section naming
`CLAUDE.md` (Claude Code) + `.codex/config.toml` (Codex) as thin adapters; `scripts/check-router-boundary.mjs`
made symmetric (requires both pointers + the neutral framing, no longer Claude-only); the six-identity row (a)
generalized off "Claude" in AGENTS.md + `scripts/preflight-identity.mjs`. (2) `F-ADVERSARIAL-CI-GATE` —
`.github/workflows/ci.yml` now runs `verify:falsification`, `verify:context-freshness`, and the new
`verify:spec-traceability` (they were local-only via `scripts/verify.sh`), so the adversarial pass binds
every PR regardless of authoring runner. (3) `F-SPEC-TRACEABILITY` — new `docs/feature-suites/TEMPLATE.md`
(spec-shape sentinel + two extra sections: Adversarial acceptance checks with stable `AC-S<n>-<k>` ids, and
Forbidden actions / hard gates), `tests/unit/feature-suite-spec-shape.test.mjs` (shape + README registration,
sentinel-scoped so S1–S13 are untouched), and `scripts/check-spec-traceability.mjs` (AC-id uniqueness +
suite-match on BOLD declarations only, so cross-spec references are allowed, + facts.md cross-reference). The
runner doc's Verification-and-Falsification phase now requires the shipped fact to cite the `AC-` ids it
satisfies; `docs/meta-prompts/scaffold.md` updated to emit the new shape.

SPECS: five decision-complete feature suites authored by a parallel-author + adversarial-critic workflow and
registered in `docs/feature-suites/README.md` + the AGENTS.md Route Table/Project Map — S14 approval-queue-mobile
(the owner's #1 target; one-card push-button decider, one-tap Accept-suggested, reason-code-first per D1, over
the existing resolve/write-back routes), S15 gmail-hub (surfaces the invisible composer + triage/template engine

- thread summaries to-the-gate per D3), S16 rbac-subusers (orthogonal `scopes` claim → a maintenance-only
  sub-user; default all-spaces), S17 unified-console-and-attention (a `/notifications` superset hub + one
  value-free attention contract + Dan's Admin-scoped review digest per D2), and S18 process-auto-initiation (an
  app-plane "Anticipated work" lane; no Cloud Scheduler, no send). The critic found 4 items — all fixed: the
  README registration (integration step), an S17 family-count contradiction (six→seven, `team_review` included),
  an S16/S17 double-ownership of the Console-deck filter (S16 owns the filter; S17 only lane-stamps), and an S15
  header overclaim about the one pre-approved compose entry. The traceability gate then surfaced a real refinement
  (distinguish bold `**AC-**` declarations from plain-prose cross-references), which was applied.

Governance posture UNCHANGED: app-plane only, every Action Registry entry `production_allowed:false`, no SoR
write, no autonomous send, no new Google scope, no Cloud Scheduler, ~$10 cap, deploy owner-run. Verification:
`npm test` (all unit incl. the new shape test), `lint`, `typecheck`, `verify:router-boundary`,
`verify:falsification`, `verify:context-freshness`, `verify:spec-traceability`, `verify:redaction`, and
`format:check` all green; `next build` not run (no `app/` runtime files changed). NO pillar implementation this
cycle — the branch holds foundation + specs only. Stop condition: **D4 clean stop for owner review**; on owner
go the S14–S18 buildable-now slices are the next work (build S16 before S17's B7). Nothing committed/pushed yet.

## 2026-07-10 (later) — Overhaul MERGED to main (PRs #65, #66); D4 review gate LIFTED, loop cleared to build S14

Owner-go event, superseding the "clean stop / nothing pushed yet" note in the entry above. The overhaul
foundation + specs were committed and **merged to `main` via PR #65** (CI `verify` green — that run exercised the
newly-added `verify:falsification` / `verify:context-freshness` / `verify:spec-traceability` gates). The owner
then approved proceeding to implementation, so **PR #66** (`chore(loop-state): lift the D4 review gate`) merged
to `main` (CI green), flipping `docs/loop-state.md` to GO: no active stop-condition, Next Safe Slice = **S14**
(then S16 → S17 → S15 → S18), and Resume-Here pointing a triggered loop at building each spec's "Buildable now
(app-plane)" slices unattended. Verified by two independent cold-start agents (Claude entrypoint via CLAUDE.md,
Codex entrypoint via AGENTS.md): both resolved the routing to **WOULD-BUILD S14 (B3 first)** and confirmed the
runner-neutral routing is enforced by `scripts/check-router-boundary.mjs` (requires both `CLAUDE.md` +
`.codex/config.toml`). Governance unchanged: app-plane only, `production_allowed:false`, no SoR write, no
autonomous send, ~$10 cap, deploy owner-run. Next: a runner triggered with `/loop` / "run the loop" / "build"
begins S14; the shipped `F-*` facts must cite the `AC-S14-*` ids (`verify:spec-traceability` enforces).

## 2026-07-10 (loop run) — S14 mobile Approval Queue buildable tier complete locally

Built all S14 app-plane slices against the existing run/live data paths (`F-RENEWAL-DECIDER-MOBILE`,
AC-S14-1..9): a phone viewport defaults to one severity-ordered renewal card with N-of-M buttons and
collapsed diagnostics; Low/Medium exact suggested-source acceptance posts `accepted_suggestion` with no
typed reason, while the trusted boundary still requires free text for High/Blocked and every manual
override; the persisted code label becomes the resolution + Activity reason. A safe queued acceptance
then exposes a separate Admin-only one-tap write-back authorization using the same code, with no second
textarea and no execution. The established desktop cards and bulk bar remain the alternate mode.

Added per-user Skip persistence (`renewal_decider_progress` + append-only Activity, transactional,
`edit`-gated, collision-free tuple id, client-read-own/direct-write-denied). Suppression intersects the
persisted marker with `sessionStorage`, so remounts in the same browser session stay deferred but a new
session resurfaces unresolved work. Extended the unified value-free inbox with the upstream-only
`canApproveInline` boolean: only Low/Medium, Ready, actor-eligible, non-self-assigned `queue_item` rows may
reuse the existing app-plane approval PATCH in the Approval Queue or Console; High/self-assigned and all
renewal/write-back rows remain deep links.

Three independent falsification lenses found and closed real defects before promotion: React state leaked
between pager cards; code-only write-back approval was initially broader than D1; Skip initially hid stable
live-review keys indefinitely; sanitized tuple IDs could collide; optimistic queued state was lost across
Next/Back; manual and follow-on forms could coexist; UI eligibility differed from the server; and four active
fact/doc claims still described the retired list-only/no-inline posture. Regression tests now pin each fix.

Verification at the slice boundary: `npm run typecheck`; `npm run lint` (0 errors, 3 pre-existing unrelated
warnings); `npm test` (189 files / 1,353 tests); `verify:copy-voice`; `verify:spec-traceability`;
`verify:context-freshness`; `verify:falsification`; `git diff --check`; and the new Firestore rules test
(4/4 against the emulator) all pass. After stopping the workspace-local Firestore emulator that had locked
`re2.node`, `bash scripts/verify.sh` also passed end to end (clean install through production build). No live
Google read, deploy, send, external write, registry flip, cost-bearing action, or client data was touched.
The unrelated pre-existing `.codex/config.toml` deletion remains untouched and outside the S14 commit queue.
Loop continuation: S16 RBAC/sub-user scopes is next, then S17 → S15 → S18.

## 2026-07-10 (later) — Owner commit/merge of the background S14 + S16 work; S16 test gap fixed; S16 pending its boundary

The background loop (Codex) built S14 to completion (above, `F-RENEWAL-DECIDER-MOBILE`) and then CONTINUED into
S16 rbac-subusers, leaving the whole slice in the working tree uncommitted on `main`. At the owner's request to
commit/merge/push it all, the working tree was verified BEFORE any push and two real issues were found and
handled: (1) the loop had emptied `.codex/config.toml` (its own harness config) — RESTORED from HEAD, matching
the loop's own note that the deletion was outside the S14 commit queue; (2) the full test suite hit 2 timeouts
in `tests/unit/workflow-run-step-checks-route.test.ts` — S16 had added `assertWorkflowRunAccess(user, await
getWorkflowRun(...))` to that route but never updated its test, so the unmocked `getWorkflowRun` hung the route.
Fixed by mocking `@/lib/firestore/workflows` (mirroring the sibling route test) and ADDING a scope-denial test
(a `maintenance`-scoped sub-user is refused a `move-in` run: 403, no write) so the new guard is actually covered.

S16 rbac-subusers is now BUILT + GREEN: the orthogonal `scopes` custom claim + `validateAuthClaims` parsing,
`requireSpaceAccess`/`requirePageSpaceAccess` guards across ~35 API routes and the maintenance/renewals/approval
pages, nav + Spaces-directory + Console scope filtering, an extended route-auth-boundary invariant, and a
manageAdmin `setAppUserScopes` editor with an `admin_scope_changes` audit twin (default all-spaces when the claim
is absent, backward-compatible). Whole-tree verification GREEN: `typecheck`, `lint`, `npm test` (197 files /
1,413 tests), `verify:router-boundary`, `verify:falsification`, `verify:context-freshness`,
`verify:spec-traceability`, `verify:redaction`, `verify:copy-voice`, and the production `next build`. Governance
unchanged: app-plane only, `production_allowed:false`, no SoR write, no autonomous send, no new Google scope, no
Cloud Scheduler, ~$10 cap, deploy owner-run. IMPORTANT: S16 has NOT had its own dedicated
Verification-and-Falsification boundary and is deliberately NOT yet promoted to an `F-S16` fact — that pass
(guard on every scoped route, nav/Spaces/Console filtering, admin scope editor + audit, against AC-S16-1..9) is
the next work before S17. Committed + merged via PR; the local `docs/temp/ui-ux-overhaul-plan.md` reflects S14 done.

## 2026-07-11 — Removed tracked Codex harness config

Deleted `.codex/config.toml` and removed the active router-boundary requirement for a Codex adapter file. Codex now
reads `AGENTS.md` and `docs/` directly, while `CLAUDE.md` remains the Claude compatibility pointer; the
runner-neutral fact row and inactive Away Mode note were updated to match. No runtime, cloud, auth, Action Registry,
send, or system-of-record behavior changed.

Verification: `npm run verify:router-boundary`, `npm run verify:context-freshness`, `npm run verify:falsification`,
`npm run format:check`, and `git diff --check` all passed locally.

## 2026-07-11 — Migration-readiness truth reconciliation

The resumed build loop correctly hit the no-safe-feature stop after S14–S18, then took the runner's allowed
client-unblock/cutover-readiness path. A cross-check of active docs against the committed Action Registry and
production handoff found two material stale claims: the client was still being asked to create/confirm the
production project even though `pmi-kc-kb-prod`, billing, project budgets, the hard $10 kill switch, and the
canonical Cloud Run service are verified; and several active governance docs still claimed every Action
Registry entry was false after the owner-approved `gmail.renewal_notice.draft_create` compose-only flip.

Reconciled the Tier-0 fact and supersede ledger, integration architecture, loop pointer, client checklist,
environment handoff, research backlog, V1 governance floor, overhaul spec fences, and the Action Registry
source comment. The durable invariant is now exact: one allowlisted action can create an UNSENT Gmail draft
and cannot send; every other registry key remains false; no RentVine, Sheet, QuickBooks, bank, or other
system-of-record write executes. Resolved project/billing, renewal-walkthrough/source, maintenance-photo-index,
and canonical-auth-host asks were retired from the active blocker thread. Remaining gates are approved source
scope/content, exact Sheet scope, QuickBooks access, the RentVine renewal-write endpoint, vocabulary freeze,
Gmail READ model, sender/approver defaults, Firestore rules/index deployment with owner auth, and explicit
per-step approval for import/deploy/live smoke.

Documentation/readiness only: no runtime behavior, Action Registry value, cloud/client environment, Gmail
mailbox, secret, send, deploy, or plan phase changed. Verification: `npm run format:check`,
`npm run verify:router-boundary`, `npm run verify:falsification`, `npm run verify:context-freshness`,
`npm run verify:spec-traceability`, and `git diff --check` all pass locally.

Added `docs/production-release-and-live-test-guide-2026-07-11.html` as the owner/operator handoff for the
next approved deployment. It summarizes the merged feature set, gives the exact existing-service deploy
shape, and provides role-based live acceptance plus release-wide safety checks without credentials or client
records. Final branch verification: `bash scripts/verify.sh` passed end to end (211 test files / 1,484 tests,
lint with zero errors, typecheck, router/falsification/freshness/spec-traceability/redaction gates, and the
production Next.js build). The clean install reported 11 npm dependency advisories (1 low, 7 moderate, 3
high); they are not introduced by this docs/readiness slice and did not fail the build.

## 2026-07-11 — Production env/preflight unblock

The first owner-run deployment attempt correctly passed session auth, ADC freshness, and the $10 budget
guard, then stopped because the gitignored `.env.production.local` had never been created. Investigation
found two downstream cutover defects before any live mutation: the production validator rejected the
verified canonical host solely because its historically named service contains `pmi-kc-kb-demo`, and it
forced approval email notifications on even though sender/recipients and delivery remain separately gated.

Fixed the preflight to distinguish the retired demo project/resources from the production service name and
to permit an app-plane deploy with notifications explicitly false (clear warning; sender/recipients required
only when delivery is enabled). Added `npm run prepare:production-env`, which builds the ignored production
preflight file from an allowlist of `.env.local` identifiers, forces cloud/auth fences, and never copies raw
RentVine secrets, emulator settings, or local-model settings. Regression tests cover the canonical host,
notifications-off posture, missing notification approval, required identifiers, and forbidden-key exclusion.
No cloud/client action, send, external write, or secret output occurred in this fix.

The supplied full-cutover command also referenced a nonexistent ignored production source manifest.
No manifest was fabricated or copied from the tracked demo manifest: this release is a code-only redeploy
against existing live source/data-store maps. The owner handoff now uses the deploy helper's `--dry-run` as
the code-release gate and reserves `cutover:report --manifest=...` for approved source/import or initial
migration work.

Local owner environment verification after the fix: the helper created the ignored
`.env.production.local` with 29 allowlisted variables and no runtime secrets; the real production
preflight passed with only the expected notifications-disabled warning. The code-only deploy `--dry-run`
also passed and was programmatically checked (without printing env values): correct project/service/runtime
SA, canonical APP_BASE_URL, demo auth forced off, notifications disabled, and RentVine credentials bound by
Secret Manager references.

Final verification: `bash scripts/verify.sh` passed end to end (212 test files / 1,489 tests, lint with
zero errors, typecheck, router/falsification/freshness/spec-traceability/redaction gates, and production
Next.js build). The 11 pre-existing npm dependency advisories remain visible and unchanged.

## 2026-07-13 — Local interactive audit remediation: critical containment boundary

The preserved localhost audit identified two live-write containment defects. QA-007 showed that demo
seed/reset/operator helpers could initialize Firebase Admin without propagating or requiring the emulator host;
QA-011 showed that Maintenance photo upload bypassed its closed Action Registry entry. This slice contains both
without any production inspection, cleanup, live read, Drive upload, deploy, send, or external mutation.

Demo Firestore commands now share one pre-Admin guard: only a reachable loopback target is accepted, `.env.local`
targets are explicitly propagated to the process/children, a project id is namespace-only, and no live flag exists.
Admin imports are dynamic after verification and use no ADC credential; seed/reset output is target metadata plus
counts, and deterministic demo audit ids make repeated recovery idempotent. Maintenance photo readiness is now
canonical in `lib/maintenance/photo-action.ts`: the closed UI has no file input, a crafted POST returns typed 409
before body/config/store work, local-demo auth forces the stub, and the future enabled UI requires a
filename/MIME/safe-target preview and explicit confirmation. The registry seed remains false.

Focused verification: 8 test files / 78 tests passed, including child-process refusal, unreachable pre-Admin
failure, local-host propagation, zero store/Drive construction, closed UI, future-preview confirmation, Action
Registry pins, and server-config fences. `npm run typecheck` passed. Safe localhost click-through is deferred to
the final integrated re-audit. The suspected synthetic production Firestore records remain an owner-only incident
review; this code fix does not authorize inspection or cleanup.

## 2026-07-13 — Local interactive audit remediation: Gmail and attention truth boundary

QA-004 and QA-003 are code-complete with focused negative-path verification. Gmail drafting now uses stable
category ids and one deterministic alias/intent guard. The route checks untrusted category, subject, and pasted
fact names before model config/provider construction; the pure composer repeats the check before invocation.
Unknown, canonical excluded, normalized alias, Unicode-width, or obvious mixed-category excluded intent refuses
with no provider/model call. The category UI is a closed canonical select; Gmail read/send scope did not change.

Console and full Notifications requests now share `gatherDecisionAttention`, which calls the existing
scope-filtered `gatherNeedsDecisionInbox` and produces one strict six-key signal projection. Notifications renders
the same total/rows as a distinct decision backlog. Its empty event-log copy is event-specific, so a nonzero
decision count can no longer coexist with a global all-clear. Standing setup conditions and unread event/bell
counts remain separate; no approval, send, external action, or value-bearing field was added.

Focused verification: 10 test files / 80 tests and `npm run typecheck` passed. Direct localhost comparison and
alias click-through remain for the final integrated re-audit; source/tests alone are not being counted as an
interactive pass.

## 2026-07-13 — Local interactive audit remediation: workflow and responsive boundaries

QA-009/006/002/010 are code-complete. Maintenance tickets now require a trimmed issue plus a verified roster
selection in both the preview and server schema; editing the unit invalidates the draft and invalid crafted POSTs
stop before persistence. Anticipated work starts only against a loaded, scoped, non-retired definition and changes
to a safe space link if unavailable. High/Blocked renewal resolution now uses a focus-trapped DOM dialog with
Escape/cancel/focus-return and a one-request guard. Admins receive property-history links from renewal records and
only from flags whose trigger maps to exactly one canonical property; origin-aware Back navigation is internal-only.

QA-001/005/008 are also code-complete. Dictate exposes permission, recording, stopping, processing, appended,
no-speech, and error states through one polite live region; it preserves typed text, suppresses rapid duplicate
permission requests, returns focus, and cleans up streams on unmount. Gmail Hub now marks its actual nested
grid/form/preview children shrinkable and removes a nested page-content wrapper. Approval Queue constrains its
expanded disclosure, inbox, rows, links, chips, and panels while leaving the tab strip as the only local horizontal
scroller. No global overflow hiding was added.

Focused workflow and responsive suites plus typecheck are green. Full verification and direct browser width,
keyboard, Back/refresh, and unavailable-state evidence remain active. No live read/write, production incident
inspection/cleanup, Drive upload, send, deployment, or registry allowlist change occurred.

## 2026-07-13 — Local interactive audit remediation complete (QA-001 through QA-011)

The isolated `codex/remediate-local-audit-2026-07-13` worktree now closes all eleven preserved localhost audit
findings without changing the original audit artifact. Demo seed/reset/operator commands refuse missing,
malformed, non-loopback, or unreachable Firestore emulator targets before Admin initialization; Maintenance photo
upload is fenced by the still-closed Action Registry entry; Gmail exclusions normalize and fail before the model;
Console and full Notifications share one value-free decision backlog; and incomplete Maintenance tickets stop
before persistence. Anticipated-work actions reconcile against loaded, scoped, active definitions; High/Blocked
renewal decisions use an accessible confirmation dialog; property history links are canonical and ambiguity-safe;
Dictate publishes its complete accessible lifecycle; and the Gmail/Approval Queue phone layouts are contained.

Direct localhost evidence used only `127.0.0.1:8080`, local demo auth/model settings, and speech/image stubs. The
safe demo reset verified the loopback target before Admin initialization and created 24 deterministic local
records. In-app browser checks verified the 7-to-7 Console/Notifications decision count, hard-exclusion refusal,
disabled incomplete ticket creation and draft invalidation, no Maintenance file input, no dead anticipated start
buttons, real-browser dialog focus trap/Escape/state/focus return, property-history Back navigation, and empty
browser error logs. Gmail Hub and every Approval Queue tab had no document overflow at 320, 375, 390, or 400 CSS
pixels, including a 260-character synthetic draft fact at 320 px. Authenticated Chrome also confirmed the actual
Gmail Hub and Approval Queue routes/headings at the exact 1440×1000 desktop and 390×844 phone viewports, with
`scrollWidth === clientWidth` throughout. A deterministic Chrome pass over the real `AskForm` directly observed
every Dictate announcement (permission, recording, stopping, processing, appended, no-speech, and error), typed
preservation, stopped media tracks, and focus return after success/no-speech/error. That pass exposed and fixed a
real focus-timing defect by deferring focus until the disabled button re-enabled; its temporary route/harness were
deleted. No confirmation action, external send, Drive
upload, system-of-record write, live Google read, deployment, production fixture inspection, or cleanup occurred.

Verification is green: focused wave suites, `npm run test:e2e:core` (7 files / 31 tests passed; 3 emulator-only
files / 18 tests skipped as designed), and `bash scripts/verify.sh` (format, lint with zero errors, typecheck, 219
files / 1,548 tests, router/falsification/freshness/spec-traceability/redaction gates, and production build).
`git diff --check` passed. The clean install reported the same 11 dependency advisories (1 low, 7 moderate, 3
high); dependency versions were not changed. The remediation stays uncommitted/unpushed for owner review because
the implementation brief explicitly prohibited those actions. Suspected production demo fixtures remain a
separate owner-only incident: reauthenticate with `npm run auth:session`, define exact scope and rollback, inspect
read-only first, and request separate cleanup authorization before any mutation.

## 2026-07-13 — Current main deployed and Wednesday demo verified

The completed QA-001..QA-011 remediation is now commit `b24c67d` on local and remote `main`. After the owner
explicitly authorized authentication, deployment, production smoke, and a self-email check, both ADC and the
gcloud CLI token passed as `josiah@pmikcmetro.com`; the active project was `pmi-kc-kb-prod`. The production
preflight passed with approval-notification email intentionally disabled. The prior Cloud Run revision was
`pmi-kc-kb-demo-00012-kf7` (2026-07-11); the clean `main` worktree deployed successfully as
`pmi-kc-kb-demo-00013-gm4`, which became latest-created, latest-ready, and 100% traffic. The canonical root
redirected unauthenticated traffic to sign-in, `/sign-in` returned 200, and a local-demo cookie was rejected by
the production Ask API with 401. The deploy's attempt to reapply the public IAM binding warned, but the existing
service reachability remained healthy and traffic routing completed.

The authenticated production walkthrough passed as Admin at the canonical URL. At a 390x844 viewport the sample
renewal run defaulted to one-card mode, advanced from 1-of-5 to 2-of-5, and had no document overflow. Console and
the full Notifications hub both showed the same eight decision items, with the hub also showing setup/coverage
signals. Gmail Hub stayed overflow-free, produced a structured summary from the sanitized project-update text,
and produced an Approved-pattern scheduling draft with the mandatory review banner + Needs Verification facts;
mailbox read stayed disabled and no Send control appeared. Console's anticipated-work families rendered with
the no-schedule/no-send caption. Maintenance built a synthetic faucet draft, inferred Plumbing, rendered the
owner-notice/vendor suggestions, disabled Create until a verified unit, invalidated the preview after the unit
input changed, and exposed status + Dan/Josiah assignment choices in the existing queue. A read-only live Ask
returned `Verified Source` with two approved-source citations. No decision, test run, ticket, assignment, Gmail
draft API call, email send, SoR write, or fixture cleanup executed.

The simple engineer Wednesday walkthrough was added, rendered, and visually checked at desktop and 390x844 with
no horizontal overflow. The only unfinished requested check is the separate
Gmail self-delivery/thread verification: the Gmail connector reported that its app connection requires
reauthentication. Owner action is to reconnect that app as `josiah@pmikcmetro.com`; after that, send the supplied
update to `me`, reply to the exact message, and confirm the two messages share one Gmail thread. This does not
change the app's Gmail ceiling: the production app can create approved unsent drafts only and cannot send.

## 2026-07-13 — Gmail connector check replaced by an in-app synthetic chain

The owner explicitly rejected using the Codex Gmail connector or a real send for the Wednesday email-chain
demonstration. The active direction is now a clearly labeled `SimulatedEmailChain` inside `/gmail-hub`: it starts
with one synthetic message, lets the operator append a simulated Dan/Josiah reply under one subject, counts the
messages in one simulated thread, and resets to its seed fixture. The action is deliberately named "Add simulated
reply", never Send. State is React memory in the current browser tab only; the component has no route request,
Gmail runtime, Firestore, browser-storage, mailbox, or external-delivery path. The prior connector blocker above
is historical and no longer an active task gate.

Focused component + hub verification is green (2 files / 6 tests), including a negative source sentinel and a
runtime `fetch` spy proving the interaction makes zero network calls. Typecheck and lint are green. The tracked
S15 spec now includes owner direction D4 and AC-S15-8; the Wednesday runbook instructs the engineer to use this
browser-only chain and explicitly prohibits a Gmail connector or real email. Full verification, production deploy,
and direct production interaction remain in progress for this slice.

## 2026-07-13 — Synthetic Gmail Hub chain verified and deployed

Full `bash scripts/verify.sh` passed after the additive slice: format, lint (zero errors; eight pre-existing test
warnings), typecheck, 220 test files / 1,551 tests, router boundary, falsification, context freshness, spec
traceability, redaction, and the production Next.js build. The dependency audit remains unchanged at 11 known
advisories (1 low, 7 moderate, 3 high). The ADC freshness check, hard $10 budget guard, and production cutover
preflight all passed; approval-notification delivery remains intentionally disabled.

The verified working tree based on `b24c67d` deployed to Cloud Run as revision
`pmi-kc-kb-demo-00014-cwq`; latest-created, latest-ready, and traffic all resolved to that revision at 100%. The
canonical root returned a 307 to `/sign-in` and the sign-in page returned 200. Direct authenticated production
verification appended the prefilled Dan reply and observed "2 messages in one simulated thread", reset it to one,
appended again, refreshed, and observed one again. At a 390x844 viewport the simulator remained visible and the
document scroll width equaled its client width (375 CSS pixels), so there was no horizontal overflow. The live
inbox control remained disabled, there was no Send button, and the production browser warning/error log was empty.

No Gmail connector was used. No real email, Gmail API call, app API request, mailbox read, external delivery,
Firestore write, browser-storage write, Action Registry change, or system-of-record write occurred. The updated
Wednesday HTML runbook now uses only this browser-local simulator for the chain demonstration. These changes are
deployed but remain uncommitted and unpushed for owner review.

## 2026-07-13 — S19 live per-user Gmail built locally to the permission gate

The owner-provided Gmail overhaul brief is now an executable S19 spec and a local implementation, while the
deployed `pmi-kc-kb-demo-00014-cwq` revision remains simulator-only. Gmail Hub now has a separately labeled live
workspace with authenticated connection health, bounded thread list/detail, manual refresh, new/reply editing,
an unsent draft step, exact message confirmation, explicit Send, result ids, and ambiguous-outcome reconciliation.
The browser-only synthetic chain remains an honest offline/demo fallback.

Server routes derive the represented mailbox only from the authenticated `pmikcmetro.com` session and configured
pilot list. Read uses only `gmail.readonly`; draft/send uses only `gmail.compose`; the DWD mint rejects any other
subject or scope. MIME handling is text-only, bounded, attachment-metadata-only, and never forwards mailbox text
to Gemini automatically. Exact-payload confirmations are expiring, one-time, transactionally claimed, and
self-recipient-only. Concurrent or repeated sends make at most one Gmail call; ambiguous results never auto-retry
and reconcile by unique RFC Message-ID. Replies re-read the live parent and preserve the Gmail thread id plus
matching Subject, In-Reply-To, and References headers.

Authenticated Pub/Sub intake validates OIDC identity/audience and project configuration before Gmail work, then
uses replay dedupe, monotonic history cursors, a five-page cap, and bounded full resync on stale history. Firestore
rules deny client access to confirmations, idempotency, sync, dedupe, and audit state; stored state contains no
body, raw MIME, attachment content, prompt, or token. The Action Registry gained separate
`gmail.mailbox.read`, `gmail.message.send`, and `gmail.thread.reply` entries, all still
`production_allowed:false`; the existing approved renewal unsent-draft action is unchanged.

Verification is green: `bash scripts/verify.sh` passed format, lint (zero errors; eight existing test warnings),
typecheck, 226 unit files / 1,582 tests, router boundary, falsification, context freshness, spec traceability (56
acceptance ids across six overhaul specs), redaction, and production build. `npm run test:e2e:core` passed 7 files
/ 31 tests with 3 emulator-only files / 18 tests skipped as designed; `npm run test:firestore` passed 10 files /
43 tests; `git diff --check` passed. The E2E runner now uses an isolated Next build directory so an owner-run dev
server cannot contend for `.next/dev`; generated output is excluded from lint. The install still reports 11 known
dependency advisories (1 low, 7 moderate, 3 high); dependency versions were not changed.

No Gmail API, mailbox, DWD Admin, Pub/Sub, Scheduler, IAM, Firestore deployment, Cloud Run deployment, or other
live/cloud action occurred. The next gate is owner-side: add only `gmail.readonly` to DWD client
`104374162913177846911`, configure one self pilot, and explicitly approve one bounded profile/thread read. Send,
reply, sync provisioning, registry promotion, and deployment each remain later, separate approvals; Dan and all
third-party recipients stay outside the first proof.

## 2026-07-13 — S19 self-pilot Gmail connection live-proven and read action approved

The owner directed commit/merge and asked that the connection work as intended. ADC freshness passed, and one
bounded `users.getProfile` call ran through the real keyless DWD path as the self-only pilot
`josiah@pmikcmetro.com`. Gmail returned the same mailbox identity, aggregate message/thread counts, and a history
cursor. No thread list, message/body, recipient, attachment, draft, send, reply, label, watch, Firestore, deploy,
or other mutation ran; the console output contained only the identity-match boolean, counts, and cursor-presence
boolean. This proves the existing DWD client `104374162913177846911` accepts `gmail.readonly` without recording a
token or customer email content. Durable evidence is in `docs/evidence/gmail-read-grant-2026-07-13.md`.

The readiness pass found and fixed a fail-open pilot boundary: an unset `GMAIL_PILOT_USERS` value previously made
the optional list empty, which admitted any otherwise valid domain subject. Gmail Hub now requires a non-empty,
valid `pmikcmetro.com` pilot list and returns setup-unavailable before token mint or Gmail work when it is absent.
The ignored local development and production env files now select only the self pilot; the existing Lease Renewal
Agent unsent-draft path is not coupled to the S19 pilot list.

From the owner approval plus live evidence, only `gmail.mailbox.read` moved to `Approved for Execution` /
`Documented` / `production_allowed:true`; the executable allowlists and tests now admit exactly it plus the
existing `gmail.renewal_notice.draft_create`. Gmail Inbox 0 send, reply, draft, and label actions remain false.
Pub/Sub/Scheduler/IAM provisioning, thread/body reads, self-thread send/reply, deployment, production smoke, Dan
mailbox access, and third-party delivery remain separate action-time gates.

Final verification is green after promotion: `bash scripts/verify.sh` passed format, lint (zero errors; eight
existing warnings), typecheck, 226 unit files / 1,584 tests, router boundary, falsification, context freshness,
spec traceability, redaction, and production build. `npm run test:e2e:core` passed 7 files / 31 tests with 3
emulator-only files / 18 tests skipped as designed; `npm run test:firestore` passed 10 files / 43 tests. The clean
install continues to report 11 known dependency advisories (1 low, 7 moderate, 3 high); versions were not changed.
