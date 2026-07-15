# PMI KC V1 working-app implementation program

Decision source: the owner's 2026-07-14 Round 3 answers, clarified by the 2026-07-15 working-app
direction. This is the durable, runner-neutral packet for `/loop`, “run the loop,” or “implement the
V1 gaps.” It replaces the former all-providers-live/pre-V1 interpretation. It does not weaken
authorization, confirmation, identity, redaction, or provider-contract boundaries.

## End state

**V1 is the stable production application PMI KC can use now.** S20–S27 application acceptance must
pass, the internal and Vendor user journeys must work, and the production UI must expose visibly
isolated **Live** and **Test** record lanes. Invented Test records may be written to app-owned
Firestore collections, progress through the real workflow to `Done`, and count as evidence that the
application works. They must never contact an external provider or count as Live-provider evidence.

A configured Live action may read or write its real provider only after the action-specific health and
authority checks pass. Every Live write/send shows the exact target and effect, requires the authorized
human's exact confirmation (and Admin approval where S20 classifies it High), makes at most one
attempt, and leaves a bodyless receipt plus reconciliation/correction state. An unavailable provider
action is an explicit activation item, not a reason to label the whole application Pre-V1.

## Locked working-app decisions

- Every record and receipt has a server-owned `live|test` mode. Missing legacy mode resolves to
  `live`; a browser flag cannot change it. Live and Test records are visibly labeled and never share
  an executor, idempotency identity, evidence claim, or provider side effect.
- The canonical invented Test identities are unit `unit:test-maple-204`, displayed as
  `TEST — 204 Maple Court Unit 2`, and Vendor `vendor:test-summit-plumbing`, displayed as
  `Summit Plumbing Test Vendor`, with non-routable email
  `service@summit-plumbing.example.invalid`.
- Test app/Firestore writes are real application behavior. Test provider receipts always say
  `provider_contacted:false` / `liveEvidenceEligible:false`; they can close a Test workflow but cannot
  activate a Live provider.
- Live provider activation is per action: `unavailable → test_ready → live_configured → live_proven →
enabled`, with `suspended` available as a kill state. Application readiness and provider activation
  are reported separately.
- Internal Editors directly execute enabled Low/Medium instances. High/consequential Live writes
  require Admin approval. A technical blocker cannot be waived by approval, and Test mode cannot be
  used to route around a Live blocker.
- Maintenance intake-through-close and external Vendor password/TOTP/assigned-ticket access are V1
  application features. Vendor Test identity uses Firebase password setup plus TOTP and an app-only
  assigned-ticket mailbox. A Live Vendor additionally requires a verified routable email and
  same-address per-vendor Gmail/Workspace OAuth. Vendors never receive DWD, internal roles, or
  cross-ticket access.
- All human messages remain proposal-first and exact-confirmed. No generic compose, autonomous send,
  scheduled send, bulk send/write, guessed endpoint, browser-selected recipient, or blind retry is
  introduced by V1.
- TTL, composite indexes, and a scheduled cleanup worker are optional operational optimizations. The
  canonical retention fields, legal-hold semantics, bounded cleanup code, and manual runbook remain;
  absence of cloud TTL/index/scheduler configuration is not an application-release gate.

## Live and Test execution contract

| Concern         | Production Test lane                                                   | Production Live lane                                                                 |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Records         | Invented aliases only; app-owned Firestore records can reach `Done`    | Authorized PMI KC records from configured sources                                    |
| External calls  | Always zero; only explicitly isolated Test adapters                    | Only the exact enabled action's configured provider adapter                          |
| Confirmation    | Exact effect and Test target shown before simulated write              | Exact effect, real target, source context, risk, and expiry shown before one attempt |
| Receipts        | Persisted Test receipt; `liveEvidenceEligible:false`                   | Provider/bodyless receipt plus readback or reconciliation evidence                   |
| Release meaning | Proves application workflow, roles, state, audit, and failure handling | Proves only that particular provider action is configured and works                  |
| Failure         | Visible Test failure/reconciliation; never fall through to Live        | Visible unavailable/blocked/ambiguous state; never fall back to Test                 |

## Dependency order for `/loop`

| Slice | Suite | Working-app outcome                                                                                                    |
| ----- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | S20   | Risk, authority, exact preview/confirmation, one-attempt claim, audit, and correction/reconciliation                   |
| 2     | S21   | Bounded trusted publication with version, rollback, source-state, and production connector health                      |
| 3     | S23   | Side-by-side Live and Test Console projections, scoped detail, provenance, and explicit source failure                 |
| 4     | S24   | Workflow-bounded communication artifacts, retention/legal hold, and exact-confirmed sends; cleanup automation optional |
| 5     | S22   | Firebase Vendor password/TOTP, assignment boundary, Test mailbox, and optional per-Vendor Live OAuth                   |
| 6     | S25   | All 11 renewal actions executable in the isolated Test workspace; Live actions activate independently                  |
| 7     | S26   | Maintenance capture → ticket → assignment → activity/receipts → close in Test; Live actions activate independently     |
| 8     | S27   | Working-app manifest/report, role/mobile/failure browser acceptance, deploy, monitoring, and rollback validation       |

Within S25/S26, every provider action still ships preview, idempotency, receipt/read-after-write or
reconciliation, correction/rollback, audit, failure typing, and tests. An undocumented provider may
remain `unavailable` while its complete Test action works. It may not be presented as Live, enabled
against a guessed contract, or allowed to prevent unrelated application workflows from reaching V1.

## Outside-session operating contract

1. Read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, this packet, then S20–S27.
2. Preserve user work and use the canonical invented aliases whenever customer/provider input is not
   required to prove application behavior.
3. Run `npm run verify:context-freshness` and the focused baseline for the selected suite.
4. Build through application completion without pausing for a blanket approval. Stop only at the
   exact external action that requires a real account, credential, authoritative mapping, or
   consequential human confirmation; keep other slices moving.
5. Before a live Google read, run `npm run preflight:adc`; if stale, ask the owner to run
   `npm run auth:session` in their terminal. Before a cost-bearing cloud action, run the budget guard.
6. Keep Test records in their production Test lane. Never copy a token, secret, Gmail body, customer
   value, or raw provider payload into git, logs, audit, or Test fixtures.
7. For a Live write/send, display its provider, account/record target, exact effect, risk, source,
   expiry, and correction path; require exact human confirmation and produce a receipt.
8. Run focused checks per suite and `bash scripts/verify.sh` at completed milestones. Extend sentinels;
   never weaken them to make a provider look active.

## Completion ledger

Track application coverage separately from provider activation. `App green` means the production code
and Test lane implement the contract; `Live configured/proven/enabled` applies only to a named action.

| Suite | Application state                                                                                                                                 | Provider/operations state                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| S20   | App green                                                                                                                                         | Authority applies whenever an action is enabled                                                        |
| S21   | App green                                                                                                                                         | Production sources/scanners activate per configured source                                             |
| S22   | App deployed; automated Vendor 11/11 and production MFA/TOTP configuration green; private human password/TOTP/assigned-ticket walkthrough pending | Live Vendor OAuth activates per Vendor after routable-email/TOTP/same-address consent and vault health |
| S23   | App deployed/browser-green: Live and Test panels, scoped provenance, bounded message metadata, explicit source failures                           | Rentvine/Gmail reads show `unavailable` until configured; no Test fallback                             |
| S24   | App green                                                                                                                                         | TTL/index/scheduler optional; Live communication transports activate per action                        |
| S25   | App green/Test-ready for all 11 typed actions                                                                                                     | Each Live provider action retains its own activation state and evidence                                |
| S26   | App deployed/Test-green, including persistent invented Maintenance ticket/assignment/receipt/close and all 19 typed Test actions                  | Each Drive/Rentvine/Gmail/LeadSimple/QuickBooks action activates independently                         |
| S27   | Revision/rules/browser/rollback/final-verifier evidence green; only human Test Vendor acceptance remains                                          | Provider activation summary is informational and cannot downgrade app readiness                        |

## Exact activation/blocker packet

When one Live action cannot activate, report only that row: action key and provider; configured/tested
state; missing account, contract, credential, mapping, or human-confirmed record; expected cost;
one-attempt/idempotency plan; monitoring; reconciliation/correction; recommended next command or owner
step; and what remains usable now. Do not turn an unavailable provider row, optional TTL/index/
scheduler optimization, or missing blanket approval into an application-wide blocker.
