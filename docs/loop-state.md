# Loop State

Single-read resume pointer for the unattended feature loop. Read `docs/facts.md` first. If this file
conflicts with the newest `docs/status.md` entry, correct this file from status. Keep history in status
and this pointer under 140 lines. The runner is `docs/autonomous-agent-runner.md`.

## Snapshot

- Last updated: 2026-07-14
- **ROUND 3 CLOSED; IMPLEMENTATION LOOP READY.** The owner answered R01–R09. No remaining Round 3
  product ambiguity blocks implementation. `F-V1-AUDIT-ROUND3` and the resolved `Q-V1-*` rows are the
  authoritative contract.
- **Active goal:** implement the decision-complete final-V1 gaps through staged local slices, keep
  facts/plan/specs/status/loop synchronized, verify adversarially and end to end, and produce a
  deployment-ready handoff. No live send, external mutation, Vendor invite, mailbox connection,
  configuration, deploy, or smoke is authorized by the goal.
- **Program:** `docs/v1-gap-implementation-program-2026-07-14.md`; executable specs S20–S27 in
  `docs/feature-suites/`. Final V1 includes every R02 Lease and R03 Maintenance action plus the external
  Vendor portal. Intermediate releases are pre-V1.
- **S20 Local green:** immutable action-instance risk/authority, preview-hashed one-attempt execution
  ledger, atomic High Approval Queue linkage, bodyless audit, and Firestore denial are built. Internal
  Editors may exact-confirm already-enabled Medium workflow Gmail actions. Generic send and all
  Registry-closed non-Gmail actions remain closed; no Registry value changed.
- **S21 Local green:** Admin-owned connector/root/Space/scanner policies, bounded file/folder/process
  validation, fail-closed scanners, immutable versions/Active pointers/rollback, bodyless audit,
  authority firewall, direct process publication, and Space/Admin UI are built. The default approval
  detour is removed from the active process-publish surface. Production roots/scanner/import/indexing
  remain gated and no live policy was created.
- **S23 Local green:** server-selected live/test provider mode, scope-filtered operational fields with
  provenance/freshness, visible per-source failure, bounded inert Gmail snippets, on-demand authorized
  full-body fetch, persistent test-data badge, and production cutover refusal of test mode are built.
  Production provider wiring/browser acceptance and every live customer/Gmail read remain gated.
- **S24 Local green:** versioned retention/cleanup/legal hold, exactly three frozen v1.0 artifacts,
  authoritative-value blocking, transient source-visible/no-invention AI replies, and artifact/policy/
  source-bound exact confirmation are built. Full verification, 47 rules tests, and core E2E are green.
  Live TTL/scheduler activation, authoritative S25/S26 value adapters, customer/Gmail reads, sends,
  and deployment remain gated.
- **S22 Local green:** separate verified-email/TOTP Vendor claims/session and enrollment UI,
  assigned-ticket 404 join/routes/pages, exact-confirmed no-password invite boundary, OAuth state/
  PKCE/exact-scope/same-address checks, token-vault interface, Vendor/Admin assigned-thread fake Gmail,
  disable/session/token revocation, bodyless server-only persistence, and 29 focused + 49 rules tests.
  Every Vendor Registry action remains false; no live identity, invite, OAuth app/token/vault, mailbox,
  send, Firebase/Identity Platform config, deploy, or acceptance occurred.
- **S25/S26 Gated; safe local boundaries green:** the complete 11-action Lease and 19-action Maintenance
  graphs, shared preview/authority/dependency/idempotency/one-attempt/receipt/reconciliation kernel,
  typed fake providers, bodyless server ledger/rules, UI readiness, and focused integrated adversarial
  tests are built. All newly added actions remain false; real account contracts, authoritative mappings,
  credentials, permitted proofs, promotion, deployment, and acceptance are absent.
- **S27 Gated; safe local readiness green:** Registry-pinned manifest/verifier, pre-V1 UI, local
  integrated fake E2E, action ledger, monitoring/rollback, and browser plans are built. Live/browser/
  rollback proofs, dependency disposition, and Dan/Josiah acceptance remain pending; V1 is forbidden.

## Next Exact Action — first separately authorized S25 provider proof

No safe local adapter remains without inventing a contract or mapping. From the pre-release report,
prepare `gmail.renewal_notice.draft_create`: confirm mailbox and authoritative recipient/value mapping,
then obtain permission for one bounded proof. Run Google auth preflight just before an authorized read;
otherwise take the next ledger packet without widening another action.

At every slice boundary:

1. Run focused tests and the suite's adversarial checks; run `bash scripts/verify.sh` at program
   milestones.
2. Update `docs/facts.md`, `docs/status.md`, `docs/plan.md`, and this pointer with actual evidence.
3. Keep new/existing Action Registry entries false until the action's documented contract, focused
   acceptance, code review, and exact live authority are present.
4. Continue to the next safe local slice without routine owner review. Stop only on a gate below, a
   repeated quality failure, context reset, or genuine missing external contract/credential/mapping.

## Locked Product Contract

- Editor direct: enabled Low/Medium. Consequential High: Admin approval. Admin may self-approve every
  risk. Technical Blocked conditions cannot be approved away. Exact-confirmed workflow email/portal/SMS
  is Medium; SoR/document/account/accounting writes are High.
- Immediate publication: configured root/connector + Editor scope + type/size + malware/sensitivity +
  immutable version/rollback + audit; content cannot grant authority.
- Vendor: Admin invite, one-time password setup, verified-email TOTP before detail, assigned-ticket-only,
  own Gmail/Workspace through per-vendor OAuth, no DWD, every send exactly confirmed by Vendor/Admin.
- Retention: confirmation usable 10m/delete 30d; dedupe 7d; sync 90d; link 365d; bodyless audit 7y; no
  persisted V1 AI/extracted Gmail facts; Admin legal hold/later written policy overrides deletion.
- Artifacts: exact current owner-renewal, tenant-renewal, maintenance-owner base generators are v1.0.
  AI may source-visible free-draft from authorized context, invent no facts/commitments, and every send
  is exact-confirmed.
- Console: metadata + bounded snippet inline; full body only in authorized workflow panel; production
  live-only and visibly unavailable; fixtures only local/emulator/explicit non-production with badge.
- Release: staged/pre-V1 until every R02/R03 action and Vendor portal pass E2E; Dan business acceptance,
  Josiah technical go-live/monitoring/rollback/Gmail-OAuth watch.

## Active Implementation Dependencies

These are not unanswered product questions. Build local contracts/fakes first, then stop at the exact
external gate:

- Admin-configured production source roots/Space mappings and malware/sensitivity provider.
- Live Identity Platform TOTP, Firebase invitation delivery, Google OAuth consent/client/redirect,
  token-vault resources, and first approved Vendor acceptance identity/ticket for the Local-green S22 seam.
- Authoritative recipient/value mappings for renewal and maintenance instances.
- Documented/account-specific contracts, plan/permissions, and non-secret mappings for Rentvine renewal
  writeback/portal, Dotloop, SMS, Boom, LeadSimple, QuickBooks, Drive, and operating Sheet writes.
- Per-action Action Registry promotion, first live proof, monitoring, and rollback/correction.
- Browser acceptance of seven internal tabs plus Vendor portal; final Dan/Josiah acceptance.
- `Q-ABC-1` remains undefined but must not be used by S20–S27.

## Live And External Hard Gates

Product inclusion is not standing operational authority. Stop and issue a separate exact packet before:

- cloud/Firebase/Workspace/OAuth/Secret Manager/TTL/scheduler/Drive/root/role configuration;
- any live Google/Gmail/Rentvine/Sheet/Drive/Dotloop/Boom/LeadSimple/QuickBooks/SMS/portal read that the
  current session has not explicitly authorized;
- any external account invite, mailbox consent/token, source import/index, write, upload, label, draft,
  send, status change, document/accounting action, deploy, smoke, or traffic change.

The packet names action key/environment/data, permission/credential, cost, evidence, one-attempt plan,
rollback/correction, owner, and safe remaining work. Run `npm run check:budget-guard` before authorized
cost-bearing work. Before live Google reads run `npm run preflight:adc`; if stale, ask the owner to run
`npm run auth:session` in their own terminal. Never use a personal account.

## Stop-Condition State

- **GO for safe local implementation.** No owner-decision stop remains. `/loop`, “run the loop,”
  “continue,” or “implement” should start S22 and continue in the program order.
- Stop at a specific live/provider gate, not at the existence of eventual external work; continue other
  safe slices when dependencies permit.
- Stop if the same root issue survives two repair cycles, required checks stay red, scope would be
  invented, context drifts, or no safe readiness-improving slice remains. Record exact next action here.
- Do not mark the active goal complete until S20–S27 are actually accepted and no required work remains.

## Resume Here

1. Read `AGENTS.md`, `docs/facts.md`, this file, `docs/autonomous-agent-runner.md`, the newest status
   entry, and `docs/v1-gap-implementation-program-2026-07-14.md`. A copy-ready outside-window handoff
   also lives at `docs/fresh-context-v1-implementation-prompt-2026-07-14.md`.
2. Inspect `git status`, branch, and recent commits; preserve all user work and confirm S24 is committed.
3. Run `npm run verify:context-freshness`, then prepare the first S25 Gmail renewal draft proof packet
   from the pre-release ledger. Do not access Google or live data until that exact step is authorized.
4. Continue independent permitted proof packets one action at a time; update the spine at every boundary.
5. Never infer live action authority from R01–R09, the active goal, `/loop`, a green fake-provider test,
   an existing OAuth/DWD grant, or a prior deployment.
