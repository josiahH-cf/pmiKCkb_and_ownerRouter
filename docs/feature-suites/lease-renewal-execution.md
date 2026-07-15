<!-- spec-shape: overhaul-v1 -->

# S25 — Lease Renewal V1 external execution

> New 2026-07-14. Implements R02. Every row below is required for final V1; none is silently manual or
> later. Undocumented/vendor-blocked actions remain release blockers, not permission to improvise.

**Implementation status (2026-07-15): Gated — safe local boundary green.** The complete 11-action
graph, exact Action Registry preview schemas, typed provider executors, shared one-attempt orchestrator,
UI readiness state, bodyless server ledger/rules, and AC-S25-1..10 local tests are built. Integrated
synthetic acceptance invokes the actual typed executor selected for each of all 11 action keys and
produces exactly one attempt and one bodyless receipt per action with zero live calls. Every new S25
action remains Registry-closed; reused S19 linked reply/label transports stay enabled only inside their
existing workflow/context/artifact/exact-confirmation gates and do not authorize initiation. Real
account contracts, authoritative mappings, permitted-environment
proofs, deployment, and Dan/Josiah acceptance are absent. See
`docs/v1-pre-release-report-2026-07-14.md`; do not call this suite Accepted.
The shared kernel reuses S20 exact-preview authority and revalidates role, scope, confirmation/approval,
Registry, exact preview schema, and preview hash immediately before its atomic claim and again before
reconciliation. The S20 preparation bridge rejects browser-supplied authority/risk, binds High work to
the exact Approval Queue preview and displayed target/source context, uses canonical cross-actor
idempotency, and fences invented aliases/Registry overrides to tests; a bare approver identifier is
never authority.

**Goal.** One authorized renewal workflow can carry verified facts from identification and owner
decision through tenant outreach, record correction, renewal record/document creation, and conditional
Boom enrollment. Operators see exact previews and receipts; Editors directly exact-confirm Medium
communications, while Admin approves every High system-of-record/document/enrollment mutation.

**What it is / how it functions.**

| R02 group        | Canonical action keys                                                                                           | Risk / V1 behavior                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Gmail renewal    | `gmail.renewal_notice.draft_create`, new `gmail.renewal_notice.send`, `gmail.thread.reply`, `gmail.label.apply` | Medium send/reply, Low draft/label; Editor may exact-confirm                         |
| Sheet writeback  | `google_sheets.renewal_checklist.writeback`                                                                     | High; Admin-approved single-cell compare-and-set + read-after-write                  |
| Rentvine renewal | `rentvine.lease.renewal_writeback`                                                                              | High; Admin-approved supported API contract only                                     |
| Dotloop          | `dotloop.loop.create_from_template`, `dotloop.document.upload`                                                  | High; Admin-approved loop/participants/required documents                            |
| Portal chat      | new `rentvine.renewal.portal_message.send`                                                                      | Medium; Editor exact-confirmed workflow message                                      |
| SMS              | new `sms.renewal_message.send`                                                                                  | Medium; Editor exact-confirmed workflow message through documented provider          |
| Boom             | `boom.resident.enroll`                                                                                          | High and conditional; Admin approval when approved workflow facts require enrollment |

- **Orchestrator — `lib/lease-renewal/execution/`.** Uses immutable workflow/action IDs and a dependency
  graph, never a blind batch. Every action has authoritative inputs, preview hash, risk, idempotency key,
  one attempt, receipt/reconciliation, correction/rollback, and append-only bodyless audit. A later step
  cannot claim success until a same-workflow dependency receipt exists and names its expected action.
- **S20 bridge and exact schemas.** `lib/external-execution/s20-bridge.ts` projects authority-free action
  values into S20's server-owned preparation path. `lib/integrations/final-v1-action-contracts.ts`
  defines the exact reviewed fields for every action, so missing or extra executor values block before
  a provider attempt. Immutable server policy prevents callers from lowering risk.
- **Authoritative values.** Rentvine read-authoritative lease/tenant/contact/date/rent facts, approved
  owner decision, mapped renewal Sheet cells, approved templates/policy, configured Dotloop template,
  and explicit Boom applicability. Missing/conflicting values remain Blocked.
- **Messages.** Recipient comes from approved source adapter, not browser. Owner/tenant base artifacts
  and AI policy are S24. Gmail send/reply binds an exact RFC Message-ID and authoritative provider-
  fetched canonical payload; recipient/sender/subject/body/thread/artifact/label/consent drift is
  ambiguous even when the Message-ID matches. SMS also binds the exact recipient, sender, workflow,
  and provider-verified consent reference. Email/portal/SMS each receive separate exact confirmation/
  receipt; tenant text can claim other channels only after those receipts.
- **Sheet.** Re-anchor row/cell, compare expected current value, require a provider-atomic conditional
  write of one cell against that value, read it back, and record before/after hashes. A provider that
  cannot supply a conditional/versioned operation remains closed. Drift creates a new proposal; no
  blind overwrite/bulk write.
- **Rentvine.** No endpoint guessing, browser automation, or generic record update. The typed boundary
  performs an exact pre-write lease/current-rent read, requires a provider-atomic conditional renewal
  against that state, verifies exact rent/effective/end/fee post-read, and reconciles by idempotency key;
  any drift or mismatched readback makes zero additional mutation.
  Discovery must still obtain the account's documented renewal/rent/date/fee contract and correction
  semantics before production can be enabled.
- **Dotloop/Boom/SMS/portal.** Each action is bound to a typed provider interface and deterministic fake
  contract tests. Vendor confirmation/approved app/credentials/plan remain explicit gates. No email
  fallback counts as another channel.
- **Built locally (app-plane).** Orchestrator, exact action schemas/Registry entries false, previews,
  typed executors and synthetic providers, S20 queue bridge, UI/queue/audit/reconciliation, and tests
  per system.
- **Gated (owner / vendor).** Provider contract/plan/app/credential setup, registry promotions, live
  reads where required, every first write/send, deploy, and production acceptance.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ all seven R02 groups execute in V1.
- _Answered 2026-07-14:_ internal communications are Medium/exact-confirmed; Sheet/Rentvine/Dotloop/
  Boom are consequential High actions requiring Admin approval under R01.
- _Assumption:_ Dotloop V1 means create the approved renewal loop, participants, and required documents;
  it does not invent e-sign reminders or completion rules absent a documented contract.
- _Assumption:_ Boom executes only when an approved workflow rule says the resident must be enrolled;
  “not applicable” is an audited terminal outcome, not a missing action.
- _Assumption:_ the SMS provider is selected from PMI KC's documented operating provider/contract
  during adapter discovery. No provider means Blocked final V1, not permission to choose a paid service.
- _Client-owned:_ provide non-secret provider/account/template identifiers and grant credentials only
  at each exact setup gate. No further product decision is needed.

**Cross-product impacts.** Extends lease pipeline/run/decider, S20 authority, S24 artifacts, Action
Registry, connector health, Approval Queue, audit/reconciliation, provider clients, environment handoff,
and release acceptance. Supersede marker: `LEASE-EXTERNAL-EXECUTION-LATER`.

**Adversarial acceptance checks.**

- **AC-S25-1** — Registry/catalog and workflow expose exactly the seven R02 groups/all 11 action keys
  with exact preview schemas, dependency, risk, receipt, correction, and health. Every action newly
  introduced by S25 defaults to `production_allowed:false`; reused S19 `gmail.thread.reply` and
  `gmail.label.apply` retain only their existing workflow/context/artifact/exact-confirmation gates and
  cannot authorize notice initiation. _Verify:_ `npm test -- lease-execution-matrix
action-registry-schema external-execution-boundary`.
- **AC-S25-2** — Editor may exact-confirm valid email/portal/SMS Medium actions; High Sheet/Rentvine/
  Dotloop/Boom enters Admin approval bound to the exact S20 preview and target/source-context hashes.
  Browser authority/risk, synthetic aliases outside tests, missing source, Registry gate, connection,
  or contract are Blocked for Admin too. _Verify:_ `npm test -- lease-execution-authority
external-execution-s20-bridge`.
- **AC-S25-3** — Gmail initiation uses authoritative recipient and S24 artifact/policy, and send/reply
  requires exact RFC Message-ID plus provider-fetched canonical payload readback; unrelated,
  unconfirmed, payload-drifted, or duplicate send cannot be accepted. _Verify:_ `npm test --
lease-gmail-execution gmail-hub-service`.
- **AC-S25-4** — Sheet executor re-anchors, passes the exact before value to a provider-atomic one-cell
  conditional write, reads after write, and refuses row/value/concurrent drift without overwrite;
  ambiguous result requires reconciliation. _Verify:_ `npm test --
renewal-sheet-executor`.
- **AC-S25-5** — Rentvine executor cannot exist behind a generic endpoint; undocumented/mismatched
  contract returns `Blocked: vendor contract required` with zero mutation. The invented-alias contract
  proves exact pre-read, provider-atomic expected-state mutation, preview/idempotency, full post-read,
  idempotency-key reconciliation, and correction boundaries. _Verify:_ `npm test --
rentvine-renewal-executor`.
- **AC-S25-6** — Dotloop fake adapter creates one configured loop with exact participants/documents and
  reconciles duplicate/timeout; wrong template/participant/doc blocks before call. _Verify:_ `npm test --
dotloop-renewal-executor`.
- **AC-S25-7** — Portal and SMS have separate exact confirmations/receipts; SMS requires provider-
  verified consent bound to exact recipient/sender/workflow. Text never claims email/portal success
  before both receipts, and one channel failure cannot mark outreach complete. _Verify:_
  `npm test -- renewal-channel-execution`.
- **AC-S25-8** — Boom runs only on explicit applicable rule and Admin approval; not-applicable is
  terminal/audited, while missing rule/contract/identity blocks with zero call. _Verify:_ `npm test --
boom-renewal-executor`.
- **AC-S25-9** — Integrated synthetic acceptance invokes the actual typed executor for all 11 actions
  in order and leaves one attempt/receipt each; injected failure stops same-workflow dependents and
  presents correction/reconciliation without a duplicate attempt. This proves only the local provider
  boundary, never a vendor contract or live result. _Verify:_ `npm test -- v1-synthetic-execution`;
  `npm run test:e2e:core -- lease-renewal-execution`.
- **AC-S25-10** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run verify:redaction`, `npm run build`, `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** No registry flip, credential/plan/app creation, live source read,
Sheet/Rentvine/Dotloop/Boom mutation, Gmail/portal/SMS send, deploy, or smoke without exact action
approval. No endpoint guessing/RPA, browser recipient/risk, bulk write/send, autonomous send, retry on
ambiguity, false cross-channel success, or customer values in git/audit/log. ~$10 cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory current renewal pipeline, mapped Sheet/CAS design, draft routes, Action
   Registry, provider research, and tests; create a contract/evidence row for every action above.
2. _Build:_ implement shared orchestrator/ledger/preview/reconciliation over fake executors, with all
   new registry entries false and S20 authority.
3. _Build:_ deliver Gmail, then Sheet, then Rentvine, then Dotloop, then portal, then SMS, then Boom as
   separate slices; each must pass its focused AC before the next begins.
4. _Understanding:_ for undocumented/vendor-confirmation actions, obtain official/account contract and
   update evidence; never infer an endpoint from UI or marketing.
5. _Verify:_ run matrix/authority/failure/idempotency/redaction tests and fake-provider E2E after every
   adapter; run full verification at suite completion.
6. _Gate:_ request setup and first-live execution approval separately per action key, with data/cost/
   rollback/proof. Promotion requires Documented + Approved for Execution + code review.
7. _Owner:_ Dan accepts workflow/business results; Josiah accepts technical monitoring/rollback.
8. _Context update:_ add one fact per live-proven action plus `F-LEASE-V1-EXECUTION-BUILT` citing
   AC-S25-1..10; update registry evidence/environment/status/plan/loop at every slice.

**Deletion/merge recommendation.** KEEP as the canonical final-V1 lease execution spec. MERGE older
draft/discovery specs as evidence only; delete active “later/manual” wording once the corresponding
action is genuinely shipped, not merely specified.
