<!-- spec-shape: overhaul-v1 -->

# S25 — Lease Renewal V1 execution

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R02. Every row is implemented
> as an application/Test action in V1; each real provider action activates independently after its
> documented contract and configuration are healthy.

**Implementation status (2026-07-18): Working app/Test journey expanded; deployment verification
pending.** The normal Renewals experience creates a canonical invented Firestore Test run, persists
`Created → Reviewed → Approved → Executing → Done` or the terminal `Moved to Move-Out` branch, and
exposes source-backed candidate inclusion, owner direction, channel-separated outreach timing,
conditional-fact review, tenant response, simulated signatures, Test business closeout, and all 11
exact application actions. Every step has a fresh exact confirmation, deterministic bodyless evidence,
refresh-safe progress, and zero provider construction. `Done` is refused until the accepted-renewal
business milestones and all 11 receipts exist; Move-Out closes the renewal lane and points to the
separate Test Move-Out space. Neither Test terminal state claims Live provider or real-world business
completion. The Admin Test workspace remains a diagnostic audit that selects every typed provider
executor against isolated in-memory adapters; it is not the primary user workflow or Live-provider
proof. Live actions retain independent activation/health states.

**Goal.** An authorized renewal workflow can carry verified or invented Test facts from identification
and owner decision through outreach, record correction, renewal record/document creation, and
conditional Boom enrollment. Operators see the exact lane, target, source context, effect, risk, and
receipt. Editors exact-confirm enabled Medium communications; Admin approves High Live system-of-
record/document/enrollment writes. Test actions exercise the same application graph but never contact
external systems.

**What it is / how it functions.**

| R02 group        | Canonical action keys                                                                                       | Risk / V1 behavior                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Gmail renewal    | `gmail.renewal_notice.draft_create`, `gmail.renewal_notice.send`, `gmail.thread.reply`, `gmail.label.apply` | Medium send/reply, Low draft/label; Editor exact-confirms enabled Live actions; isolated Test adapter otherwise |
| Sheet writeback  | `google_sheets.renewal_checklist.writeback`                                                                 | High Live CAS/readback; Admin approval; isolated Test receipt                                                   |
| Rentvine renewal | `rentvine.lease.renewal_writeback`                                                                          | High documented conditional API only; Admin approval; isolated Test receipt                                     |
| Dotloop          | `dotloop.loop.create_from_template`, `dotloop.document.upload`                                              | High exact template/participants/documents; Admin approval; isolated Test receipt                               |
| Portal chat      | `rentvine.renewal.portal_message.send`                                                                      | Medium workflow message; Editor exact confirmation when enabled                                                 |
| SMS              | `sms.renewal_message.send`                                                                                  | Medium documented provider plus verified consent; Editor exact confirmation when enabled                        |
| Boom             | `boom.resident.enroll`                                                                                      | High and conditional; Admin approval when applicable; audited not-applicable terminal state                     |

- **Record/executor lane.** Test run, action input, execution record, idempotency identity, receipt, and audit
  carry `live|test`. Legacy absence resolves to Live. The production Test workspace accepts only Test
  input, canonical invented aliases, and internal Test effects. Its app-plane run/attempt/receipt state
  persists in dedicated Firestore collections whose direct client writes are denied. Normal Live
  orchestration rejects Test input; Test services reject Live input before evidence creation.
- **Orchestrator — `lib/lease-renewal/execution/`.** Uses immutable workflow/action IDs and a dependency
  graph, never a blind batch. Every action has authoritative inputs, exact preview hash, server-owned
  risk, idempotency key, atomic one-attempt claim, receipt/reconciliation, correction/rollback, and
  append-only bodyless audit. A dependency counts only when the same workflow has the expected receipt.
- **S20 bridge/exact schemas.** `lib/external-execution/s20-bridge.ts` projects authority-free values
  into S20 preparation. `lib/integrations/final-v1-action-contracts.ts` defines reviewed fields for all
  actions; missing/extra values block before a provider attempt. Browser authority/risk never applies.
- **Test execution.** The persistent normal Test journey records immutable bodyless business events
  around every application action: candidate inclusion, owner renewal direction, outreach timing,
  conditional facts, one mutually exclusive tenant response, signatures, and Test closeout. The
  accepted branch runs every action against invented values, records exactly one deterministic
  attempt/receipt, and returns duplicate evidence on replay. The Move-Out branch becomes terminal and
  refuses remaining renewal actions. Every event and receipt says `data_mode:test`,
  `provider_contacted:false`, `live_proof_eligible:false`. The Admin diagnostic separately proves typed
  executor selection, schema, authority, and failure behavior. No Test evidence proves provider
  configuration or a real tenant/owner outcome.
- **Live authoritative values.** Configured Rentvine lease/contact/date/rent facts, approved owner
  decision, mapped Sheet cells, approved templates/policy, Dotloop template, and Boom applicability
  supply Live values. Missing/conflicting values block only the affected action.
- **Messages.** Recipient comes from an approved source adapter, never browser input. Gmail send/reply
  binds the provider-fetched canonical payload and exact RFC Message-ID; recipient/sender/subject/body/
  thread/artifact/label/consent drift is ambiguous. SMS binds exact recipient, sender, workflow, and
  provider-verified consent. Each channel gets separate confirmation/receipt; one channel cannot claim
  another succeeded.
- **Sheet.** Re-anchor row/cell, compare current value, require provider-atomic one-cell conditional
  write, read back, and record before/after hashes. Drift creates a new proposal; no bulk/blind
  overwrite or retry.
- **Rentvine.** No endpoint guessing, browser automation, or generic record update. Live execution
  requires the account's documented renewal/rent/date/fee conditional contract, exact pre-read,
  expected-state mutation, exact post-read, and idempotency reconciliation. Test exercises that typed
  boundary without resolving a provider.
- **Dotloop/Boom/SMS/portal.** Each uses a typed interface and isolated Test adapter. A missing provider
  plan/app/credential/contract remains `unavailable`; it does not authorize improvisation and does not
  prevent unrelated application workflows from being V1.
- **Activation model.** Application coverage is `unverified|production_test|live`; provider activation
  is `unavailable|test_ready|live_configured|live_proven|enabled|suspended`. Only `enabled` Live actions
  can construct real executors. Test completion never changes activation.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ all seven R02 groups/all 11 action keys are V1 application features.
- _Answered 2026-07-15:_ all 11 may prove the application through the isolated production Test
  workspace; V1 does not wait for all providers to be Live.
- _Default:_ Dotloop V1 means the approved renewal loop, participants, and required documents; no
  invented reminder/completion rules.
- _Default:_ Boom runs only when an approved workflow rule says enrollment applies; `not applicable`
  is an audited terminal outcome.
- _Operational inputs, not product questions:_ SMS provider and non-secret account/template/mapping
  identifiers are supplied when that Live action is activated. No provider means `unavailable`, not
  permission to choose a paid service or guess an endpoint.

**Cross-product impacts.** Extends lease pipeline/run/decider, S20 authority, S24 artifacts, data-mode
isolation, Action Registry/provider activation, Connector health, Approval Queue, audit/reconciliation,
environment handoff, S27 release reporting, and Admin Test workspace. Supersede markers:
`LEASE-EXTERNAL-EXECUTION-LATER` and `ALL-LEASE-PROVIDERS-LIVE-BEFORE-V1`.

**Adversarial acceptance checks.**

- **AC-S25-1** — Registry/catalog/workflow expose exactly all 11 action keys with exact schema,
  dependency, risk, lane, receipt, correction, health, and separate application/activation state.
  Existing enabled Gmail actions retain their workflow/artifact/confirmation gates; no action can
  inherit activation from another. _Verify:_ `npm test -- lease-execution-matrix
action-registry-schema external-execution-boundary`.
- **AC-S25-2** — Editor may exact-confirm eligible Medium Live actions; High Live actions require Admin
  approval bound to the exact S20 preview/target/source hash. Editors may operate the harmless,
  explicitly marked persistent Test journey; the cross-provider diagnostic harness remains Admin-only.
  Both accept only Test inputs/adapters. Browser authority/risk, missing source, disabled
  Registry action, or contract blocker cannot be waived. _Verify:_ `npm test --
lease-execution-authority external-execution-s20-bridge v1-production-test-workspace-route`.
- **AC-S25-3** — Gmail initiation uses authoritative recipient and S24 artifact/policy. Live send/reply
  requires provider-fetched exact payload/Message-ID; Test uses a non-delivering adapter. Unrelated,
  unconfirmed, drifted, duplicate, or cross-lane sends make at most one corresponding-lane attempt.
  _Verify:_ `npm test -- lease-gmail-execution gmail-hub-service`.
- **AC-S25-4** — Live Sheet executor re-anchors, conditionally writes one cell, reads back, and refuses
  concurrent drift; Test produces an isolated receipt with no Sheets call. Ambiguity requires
  reconciliation, not retry. _Verify:_ `npm test -- renewal-sheet-executor`.
- **AC-S25-5** — Live Rentvine executor remains unavailable without the documented conditional
  contract. Test proves exact typed precondition/mutation/readback/reconciliation shape without
  constructing a Rentvine provider. _Verify:_ `npm test -- rentvine-renewal-executor`.
- **AC-S25-6** — Dotloop Test adapter proves exact configured loop/participants/documents and duplicate/
  timeout handling; Live blocks wrong or missing template/participant/document before a call. _Verify:_
  `npm test -- dotloop-renewal-executor`.
- **AC-S25-7** — Portal and SMS have separate exact confirmations/receipts; SMS Live requires verified
  consent. Test receipts cannot claim either Live channel and one channel cannot mark another complete.
  _Verify:_ `npm test -- renewal-channel-execution`.
- **AC-S25-8** — Boom runs only on explicit applicability plus Admin approval in Live; not-applicable is
  terminal/audited; missing rule/identity blocks. Test covers both terminal paths with zero Boom call.
  _Verify:_ `npm test -- boom-renewal-executor`.
- **AC-S25-9** — The normal production Test journey persists candidate, owner, outreach/fact, tenant,
  signature, and closeout milestones plus all 11 actions, deterministic one-attempt/receipt evidence,
  dependency stops, refresh-safe progress, and Done with zero Live-provider calls. The mutually
  exclusive Move-Out response closes the renewal branch, provides a Test Move-Out handoff, and blocks
  remaining renewal actions. Duplicate requests return the original evidence. The Admin diagnostic
  invokes all 11 typed executor selections and verifies failure/reconciliation boundaries. Every Test
  terminal explicitly denies Live-evidence and real-business-completion eligibility. _Verify:_ `npm test -- lease-renewal-test-workflow
lease-renewal-test-workflow-routes lease-renewal-test-workflow-component v1-synthetic-execution
v1-production-test-workspace-route`; `npm run test:firestore`.
- **AC-S25-10** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run verify:redaction`, `npm run build`, `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** No Test-to-Live fallback, Test external call, Test receipt reported
as Live, endpoint guessing/RPA, browser recipient/risk/lane, bulk write/send, autonomous send, retry on
ambiguity, false cross-channel success, or customer values in git/audit/log. A Live action may execute
only when its own contract, identity, connection, Registry state, preview, authority, exact
confirmation, and correction/reconciliation path pass. Unavailable actions remain visible. ~$10 cap.

**Ordered prompt sequence.**

1. _Application acceptance:_ create a persistent normal Test run, refresh, record the business
   milestones, execute all 11 action keys on the accepted branch, refresh, reach Done, and verify exact
   events/receipts plus zero Live-provider calls. Separately prove the mutually exclusive terminal
   Move-Out branch and handoff. Retain the Admin typed-adapter run as a diagnostic falsification check.
2. _Workflow acceptance:_ verify the renewal UI exposes lane, provider activation, target/effect/risk,
   approval/confirmation, dependency, completion, and correction/reconciliation without dead ends.
3. _Live activation:_ for each action actually used, capture only the official/account contract and
   authoritative mapping, configure its identity/credential, enable that Registry row, and perform one
   bounded reversible proof with receipt/monitoring. Do not wait on unrelated providers.
4. _Verify:_ run matrix/authority/mode/failure/idempotency/redaction tests and full verification.
5. _Context update:_ record application coverage separately from each provider activation and never
   restore an all-providers-live V1 gate.

**Deletion/merge recommendation.** KEEP as the canonical V1 Lease execution spec. MERGE older
discovery specs as evidence only; provider-specific runbooks may activate incrementally without
changing the working-app definition.
