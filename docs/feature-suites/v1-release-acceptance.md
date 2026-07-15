<!-- spec-shape: overhaul-v1 -->

# S27 — Staged pre-V1 release and final acceptance

> New 2026-07-14. Implements R09 and turns S20–S26 into a falsifiable release contract.

**Implementation status (2026-07-14): Gated — safe local readiness boundary green.** The hardened
manifest verifier, bodyless local manifest report, application-wide and Vendor-wide pre-V1 labels,
integrated actual-adapter synthetic acceptance, local ledger, exact hard-stop packets, monitoring/
rollback plan, and eight-surface browser plan are built. The hermetic cutover rehearsal keeps approval
email delivery off and now requires an exact captured prior Cloud Run revision before it can call the
rollback plan ready; rollback restores traffic and never deletes the service. Deployment, live provider
proofs, pinned deployed role/failure-path browser and rollback acceptance, production evidence/pins, dependency disposition,
and Dan/Josiah signatures remain pending. The application and manifest must continue to say pre-V1.

**Goal.** PMI KC can deploy and validate in bounded pre-V1 slices without mislabeling an incomplete
candidate. The release becomes V1 only after every approved Lease/Maintenance action and the external
Vendor portal pass end to end, all seven tab contracts pass browser acceptance, security/operations/
rollback are ready, Dan signs business acceptance, and Josiah signs technical go-live.

**What it is / how it functions.**

- **Stages.** `pre-v1-foundation` (S20/S21), `pre-v1-data-comms` (S23/S24), `pre-v1-vendor` (S22),
  `pre-v1-renewal` (S25), `pre-v1-maintenance` (S26), then `v1-candidate` integrated acceptance. Every
  deployed intermediate surface visibly says pre-V1 and lists unavailable actions without simulated
  success.
- **Release manifest.** Machine-readable manifest pins commit/revision, production environment,
  schema/rules/index versions, a hash of every normalized operational Action Registry field, the exact
  unique required action set, exact S20–S26 acceptance-ID sets, provider/connection evidence,
  artifact/retention versions, migrations, smoke cases, monitoring, owner, rollback, and acceptance
  status. A V1 result accepts only durable `docs/evidence/` production references whose canonical file+
  anchor identities are globally unique across gates, resolved Registry contracts/health/rollback, and
  the exact named Dan/Josiah acceptances carrying the same non-circular release-identity hash over every
  immutable candidate pin/proof. Local/synthetic/placeholder evidence, path aliases, reused evidence,
  stale signatures, and pin drift fail closed. No secret or
  customer value is stored; `npm run release:manifest-report` emits only counts/gate classes and can
  never report local acceptance.
- **Action proof.** Each required action is `Local green → Gated → Sandbox/reversible proof →
Production allowed → Bounded production proof → Accepted`. `production_allowed:true` requires
  Documented + Approved for Execution evidence and code review. One provider failure cannot be hidden
  by another channel or a manual checkbox.
- **E2E acceptance.** The local synthetic stage traverses the real typed executor boundary for all 11
  S25 and all 19 S26 actions, one attempt/receipt each, plus the S22 invite → verified-email TOTP → exact
  OAuth scopes/same mailbox → assigned-ticket Gmail → exact one-attempt reply → disable/revoke journey.
  It uses invented aliases and zero live provider calls. Vendor sandbox/test tenant comes next where
  available, then separately approved bounded production cases using approved records. Verify preview,
  role/risk, exact confirmation, receipt/read-after-write, reconciliation, audit, rollback/correction,
  and negative cross-scope/idempotency cases at every promoted stage.
- **Tab acceptance.** Console, Spaces, Approval Queue, Workflow Communications, Connections, Admin,
  and Notifications each have purpose, source/failure state, role behavior, mobile/browser scenario,
  and no-dead-end acceptance. Vendor portal is an eighth external surface, and its route-wide layout
  carries the same pre-V1 banner before sign-in as well as after authentication. The emulator-backed
  local desktop/phone render, overflow, readiness, and fresh-log regression is green; it is not the
  pinned deployed role/failure-path result required for acceptance.
- **Operations.** Josiah owns go-live, monitor, rollback, Gmail/OAuth watch and incident handoff. Dan
  owns business/source/template/workflow acceptance. Approval-notification delivery remains disabled in
  the cutover fixture until separately authorized. Cutover requires one canonical GCP/Firebase/runtime/
  Sheets/Gmail project, the exact `us` search location, and a complete Gmail DWD/Pub/Sub quartet whose
  audience is the production push route. Any malformed or conflicting binding/CLI value emits no setup,
  corpus, deploy, or rollback commands. Source-corpus commands also remain empty for unsafe,
  placeholder, unapproved, High-sensitivity, or otherwise non-ready manifests. A rollback report is
  blocked without the captured prior revision and may restore traffic only with `gcloud run services
update-traffic`; deleting the service is not a rollback. Release report records known dependency
  findings; no unowned High finding, failed required check, stale credential/watch, or missing rollback
  is accepted.
- **Buildable now (app-plane).** Manifest/schema/verifier, fake-provider integrated E2E, test-data badge,
  pre-V1 labeling, runbooks, browser scripts/checklists, rollback and acceptance ledgers.
- **Gated (owner / vendor).** Every deployment, cloud config, credential, live read/write/send, smoke,
  traffic promotion, and final acceptance signature.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ staged slices and pre-V1 labels are required; V1 waits for every R02/R03
  app-executed action and Vendor portal E2E.
- _Answered 2026-07-14:_ Dan owns business acceptance; Josiah owns technical go-live, monitoring,
  rollback, and Gmail watch.
- _Answered 2026-07-14:_ a required action may use a vendor sandbox for its first proof, but the current
  V1 verifier permits no production-proof exception: every required action must be Accepted,
  `productionAllowed:true`, Registry-approved, and backed by distinct durable production execution,
  monitoring, and rollback evidence. Any future exception requires an explicit spec/schema/verifier
  change before it can be considered.
- _Assumption:_ the existing deployed service name may remain during pre-V1, but user-facing version and
  manifest cannot say V1 until all gates pass.
- _Client-owned:_ provide explicit per-step live approvals and final acceptance; no additional product
  direction is open.

**Cross-product impacts.** Covers all primary routes/tabs, S20–S26, Action Registry/cutover reports,
environment handoff, status/plan/loop, Cloud Run/Firebase, monitoring, smoke scripts, browser runbooks,
dependency/security reports, and rollback. Supersede marker: `V1-INTERNAL-GMAIL-ONLY-RELEASE`.

**Adversarial acceptance checks.**

- **AC-S27-1** — Manifest verifier requires production stage/environment/pins, exact S20–S26 AC sets,
  exact unique action set, full normalized Registry hash, resolved provider health/rollback contracts,
  globally unique canonical durable production evidence, and exact named acceptances bound to the same
  release identity. Missing/extra/duplicate or path-aliased evidence, stale acceptance hashes,
  local/synthetic markers, Registry drift, or any false/unaccepted required action fails closed.
  _Verify:_ `npm test -- v1-release-manifest v1-manifest-report`; `npm run
release:manifest-report`; `npm run cutover:report -- --help`.
- **AC-S27-2** — Every intermediate deployment renders pre-V1 on internal and all Vendor routes and
  shows unavailable/Blocked actions honestly; no fixture, manual checkbox, or other-channel receipt can
  produce V1/complete state. _Verify:_ `npm test -- release-label vendor-release-label
execution-completion`.
- **AC-S27-3** — Integrated synthetic/emulator acceptance invokes the actual typed executor for all 11
  S25 and all 19 S26 actions plus the complete bodyless S22 Vendor journey; each action leaves exactly
  one attempt/receipt, and injected failure/timeout/drift/revocation stops dependencies without
  duplicate attempts or data leakage. _Verify:_ `npm test -- v1-synthetic-execution`; `npm run
test:e2e:core -- v1-fake-execution`; `npm run test:e2e` in emulator mode when available.
- **AC-S27-4** — Browser checklist covers Console, Spaces, Approval Queue, Workflow Communications,
  Connections, Admin, Notifications, and Vendor portal at desktop/phone widths, correct roles/scopes,
  unavailable sources, and success/failure/reconciliation states. _Verify:_ approved browser runbook.
- **AC-S27-5** — Security release check proves no secrets/customer/mail bodies in git/log/audit, no
  Vendor cross-ticket/internal access, no generic/autonomous send, no unexpected registry key, and no
  production fixture fallback. _Verify:_ `npm run verify:redaction`, router/falsification/security tests.
- **AC-S27-6** — Each live proof has exact approval, budget preflight, non-secret evidence, monitoring,
  correction/rollback, and one accepted result; no action inherits approval from another. _Verify:_
  release manifest/evidence review.
- **AC-S27-7** — Rollback rehearsal is not ready until the currently serving prior Cloud Run revision
  is captured in the expected service-specific format. It restores traffic to that exact revision,
  configuration/Registry/policy, and revokes/disables new provider access without deleting the service
  or audit. Invalid/conflicting project, identity, topic, audience, search-location, or source-manifest
  input is rejected with every generated setup/corpus/deploy/rollback command suppressed. Ambiguous
  external effects use correction/reconciliation, not blind retry. _Verify:_ `npm run cutover:dry-run
-- --json`; cutover/rollback and source-corpus command-boundary tests.
- **AC-S27-8** — Dependency/security findings are regenerated; every High/Critical is remediated, and
  every retained lower-severity finding has an explicit named, time-bounded technical disposition with
  a recheck date. An expected nonzero audit exit is not an acceptance by itself, and no other required
  verification may be red. _Verify:_ `npm audit`, `bash scripts/verify.sh`, release report and
  dependency-disposition review.
- **AC-S27-9** — Final V1 state requires Dan business acceptance and Josiah technical acceptance after
  all other checks; absent signature keeps `v1-candidate`. _Verify:_ manifest schema/test.

**Forbidden actions / hard gates.** This spec never grants live authority. No deploy, traffic change,
cloud/Firebase/OAuth/TTL/Secret Manager config, source import, Gmail read/send, account invite, Drive/
Sheet/Rentvine/Dotloop/Boom/LeadSimple/QuickBooks/SMS/portal mutation, or production smoke without exact
approval and budget preflight. No rollback plan that deletes the Cloud Run service or omits the captured
prior revision, and no project override that conflicts with the reviewed identity set. No approval-notification send enabled merely to make a rehearsal green. No simulated/
manual success, blanket approval, autonomous send, blind retry, customer evidence in git, or V1 label
before all gates. ~$10 cap and kill switch remain.

**Ordered prompt sequence.**

1. _Discovery:_ read Tier 0, implementation program, S20–S26, current cutover/smoke/deploy/evidence
   tooling, environment handoff, browser audit, dependency findings, and rollback history.
2. _Build:_ create release-manifest schema/verifier and completion logic pinned to required ACs/action
   keys/evidence/owners; add pre-V1 UI/version labels.
3. _Build:_ create integrated emulator/fake-provider E2E and failure injection; create tab/Vendor browser
   checklist and non-secret evidence/rollback templates.
4. _Verify:_ run full local verification and security/dependency review; repair in-scope failures and
   keep candidate pre-V1 while any row is missing.
5. _Gate:_ request separate approvals for each cloud config/deploy/live proof; run budget/auth preflight
   immediately before the authorized step and record only non-secret evidence.
6. _Owner:_ obtain Dan business acceptance and Josiah technical acceptance only after every prior row;
   otherwise record exact blocker and safe remaining work.
7. _Context update:_ add per-stage facts and final `F-V1-RELEASE-ACCEPTED` citing AC-S27-1..9; update
   environment/status/plan/loop and mark the release-acceptance milestone complete only after actual
   acceptance. Safe-local implementation goals may close with external rows explicitly gated.

**Deletion/merge recommendation.** KEEP as the release contract through V1. After acceptance, MERGE
operational steps into the standing cutover/runbook and retain this file as versioned release evidence.
