# Loop State

Single-read resume pointer for the feature loop. Read `docs/facts.md` first. If this file conflicts
with the newest `docs/status.md` entry, correct this pointer from status. Keep history in status and
this file under 140 lines. The runner is `docs/autonomous-agent-runner.md`.

## Snapshot

- Last updated: 2026-07-15.
- R01–R09 are decision-complete. S20–S27 and
  `docs/v1-gap-implementation-program-2026-07-14.md` are the final-V1 implementation contract.
- Safe local/emulator implementation is exhausted through S27. Commit `0dc0c7aa` is deployed as Pre-V1
  revision `pmi-kc-kb-demo-00021-bj8` at 100%; `pmi-kc-kb-demo-00020-24d` is the captured prior revision.
- The release remains **Pre-V1**. Product inclusion is not operational authority, and no S20–S27 suite
  is Accepted.

## Evidence Vocabulary

- **Local green:** deterministic code plus fake/emulator/synthetic evidence only.
- **Gated:** a named external contract, mapping, permission, configuration, proof, or acceptance is
  missing; keep the production action closed.
- **Live-proven:** the exact production behavior has bounded, durable evidence. The 2026-07-13 S19 Gmail
  transport baseline is Live-proven; deploying the newer S20–S27 code is not proof of its gated actions.
- **Accepted:** all suite evidence and named acceptance are complete. None of S20–S27 is Accepted.

## Safe-Local Completion

- **S20 Local green:** immutable risk/authority, actor-independent external-action identity, frozen exact
  preview/target context, exact Medium confirmation, one-attempt bodyless ledger, atomic High Approval
  Queue target-bound flow, reconciliation, and client-denied execution state. Registry-closed work stays
  non-executable.
- **S21 Local green:** bounded streaming intake, declared/actual length checks, hash-verified 384 KiB
  content chunks, immutable content-reference reuse on rollback, and a fake scanner fenced to local
  non-production plus a loopback emulator. Production roots/scanners/import/indexing are Gated.
- **S22 Local green:** invite, verified-email TOTP claims, assigned-ticket 404 boundary,
  PKCE/exact-scope/same-mailbox OAuth/vault seam, assigned-ticket Gmail, and disable/session/token
  revocation work over in-memory providers. Activation and every active access also require the verified
  token email to equal the invited Vendor record, so a changed/reverified login cannot retain access.
  OAuth start/callback/pre-vault/final-save recheck that equality; mid-flight drift destroys a newly
  created secret and saves no connection. Live identity, invite, OAuth, vault, mailbox, and acceptance
  are Gated.
- **S23 Local green:** server-selected live/test mode, provenance/freshness, bounded inert snippets,
  authorized on-demand body fetch, persistent test badge, and production fixture refusal. The eight
  surfaces render locally at desktop/phone widths against an isolated emulator. Candidate code is
  deployed; live adapters, approved records, and deployed role/failure-path browser acceptance are Gated.
- **S24 Local green:** exact retention/artifact/AI policy, bounded indexed cleanup, transactional recheck,
  canonical Date/Timestamp TTL plus numeric query expiry, dual-null legal hold, crash-resumable bodyless
  frozen-run progress with complete processed/failed accounting, counts-only audit, seven-year cleanup-
  run retention, and an emulator-only worker. Production all-eight indexes, legacy-record migration,
  TTL, scheduler/identity, monitoring, live mappings, and acceptance are Gated.
- **S25/S26 Local green, externally Gated:** exact Registry schemas, immutable risk, same-workflow
  dependency receipts, S20 queue bridge, one provider claim, reconciliation/correction, and action-level
  readiness cover every 11 Lease and 19 Maintenance action. Production rejects fake executors, synthetic
  refs, Registry overrides, and risk/schema lowering.
- **S27 Local green, externally Gated:** only an exact production manifest can pass. Local/synthetic
  all-green input remains Pre-V1. Production evidence is canonicalized and globally unique; Dan/Josiah
  acceptance binds to the same candidate release-identity hash. Cutover fixtures keep notification email
  off and require matching project-bound GCP/Firebase/runtime/Sheets/Gmail values, an audience-bound Gmail
  quartet, and exact `us` search location. Invalid/conflicting bindings or unsafe/non-ready corpus input
  emit no setup/corpus/deploy/rollback commands. Rollback requires a captured prior revision plus traffic
  restoration, never service deletion. Three Moderate dev-only
  `firebase-tools` dependency findings require named disposition without force/downgrade. Revision
  `00021-bj8` passed public/auth-boundary smoke; signed-in role/failure-path browser, manifest-bound
  deployment evidence, and rollback rehearsal to captured prior revision `00020-24d` remain Gated.

## Synthetic Acceptance Boundary

- `lib/release/synthetic-execution.ts` is the canonical alias catalog:
  `admin-synthetic`, `workflow-synthetic@pmikcmetro.com`, `example.invalid` tenant/owner/Vendor
  addresses, and invented lease, ticket, unit, Vendor, folder, thread, work-order, process, task,
  account, and document references.
- The local harness traverses real S22 domain services and all typed S25/S26 adapters. It produces one
  bodyless receipt/attempt per action and reports zero live provider calls.
- These aliases are for local/emulator regression only. Never map them into production, treat them as
  provider proof, or let a production manifest accept them.
- Current-worktree milestone verification is green: the all-in-one verifier passed clean install,
  format, lint (zero errors/eight existing warnings), typecheck, 286 unit files / 1,984 tests, production
  build, and all governance gates. Separate Firestore acceptance passed 16 files / 56 tests; core E2E
  passed 8 files / 32 tests with 3 files / 18 scenarios intentionally skipped. Cutover rehearsal is
  green. The code-only deployment and boundary smoke are green; the release remains Pre-V1 with 169 gates.

## Next Exact Action

Open `docs/v1-client-unblock-checklist-2026-07-14.md` and work one independently authorized row at a
time. Recommended first packet: **Trusted publication / `app.content.publish`** because it can prove a
harmless synthetic file without sending a message or mutating an operating system of record. Josiah +
the PMI KC Admin return the non-secret connector/root/Space IDs and official scanner contract/version;
keep the production scanner unavailable and publication fail-closed until that packet is complete.

If that row is not authorized, take the first client-selected row from the checklist without widening
another action. Every row already names the required non-secret evidence, responsible role, credential
location label, recommended closed default, first proof, and correction/rollback evidence.

At each row boundary:

1. Run the focused synthetic/emulator regression before any permitted external proof.
2. Obtain exact environment/data/action authority; run Google ADC and budget preflights only when the
   chosen proof actually needs them.
3. Make at most one provider attempt, capture only bodyless IDs/hashes/status/timestamps, reconcile any
   ambiguity, and prove monitoring plus correction before Registry review.
4. Promote only the exact reviewed Registry action; do not infer sibling-action or future authority.
5. Update facts, status, plan, this pointer, the suite ledger, and the unblock checklist with dated
   evidence. Keep the candidate Pre-V1 until S27 is fully Accepted.

## Locked Safety Contract

- Editor direct execution is limited to already-enabled Low/Medium instances. Consequential High work
  requires exact reasoned Admin approval; Admin may self-approve. Technical Blocked conditions cannot be
  approved away.
- Immediate publication requires configured root/connector, Editor scope, type/size, scanner/
  sensitivity, immutable version/rollback, and audit. Content cannot grant authority.
- Vendor requires Admin invite, one-time setup, verified-email TOTP before detail, assigned-ticket-only
  authorization, and the Vendor's own Gmail OAuth. Admin support cannot consent-connect that mailbox.
- Gmail remains workflow-linked and exact-confirmed. Generic compose/send, autonomous/background/
  scheduled/model-triggered/bulk send, unrelated inbox browsing, and automatic ambiguous retry remain
  absent.
- QuickBooks post/approve/pay, Drive replace/delete, guessed provider endpoints, and unapproved
  system-of-record writes are outside authority, not blockers to work around.

## Live And External Hard Gates

The active goal and green aliases do not authorize further cloud/Firebase/Workspace/OAuth/Secret Manager/TTL/
scheduler/Drive/root/role configuration; live client/provider reads; invites; mailbox consent/tokens;
imports; writes; uploads; labels; drafts; sends; deployments; smokes; or traffic changes.

Before an authorized Google read, run `npm run preflight:adc`; if stale, the owner runs
`npm run auth:session` in their own terminal. Before authorized cost-bearing work run
`npm run check:budget-guard`. Never use a personal identity, raw customer content, or a demo fallback.

## Stop And Resume

- Continue automatically through safe verification, repair, documentation, and exact packet preparation.
- Stop at a selected external row until its named authority/evidence exists; continue another independent
  checklist row only when it is safely authorized.
- Do not mark final V1 Accepted until every S20–S27 release gate is actually satisfied. A scoped safe-
  local implementation goal may complete after its code/docs/verification/publish deliverables are
  done and all irreducible external gates are preserved in the exact unblock checklist.
- Resume by reading `AGENTS.md`, `docs/facts.md`, this file, the newest status entry, and
  `docs/v1-client-unblock-checklist-2026-07-14.md`; inspect branch/worktree and preserve user changes.
