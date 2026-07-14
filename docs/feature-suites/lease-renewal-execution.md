<!-- spec-shape: overhaul-v1 -->

# S25 — Lease Renewal V1 external execution

> New 2026-07-14. Implements R02. Every row below is required for final V1; none is silently manual or
> later. Undocumented/vendor-blocked actions remain release blockers, not permission to improvise.

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
  cannot claim success until required receipts exist.
- **Authoritative values.** Rentvine read-authoritative lease/tenant/contact/date/rent facts, approved
  owner decision, mapped renewal Sheet cells, approved templates/policy, configured Dotloop template,
  and explicit Boom applicability. Missing/conflicting values remain Blocked.
- **Messages.** Recipient comes from approved source adapter, not browser. Owner/tenant base artifacts
  and AI policy are S24. Email/portal/SMS each receive separate exact confirmation/receipt; tenant text
  can claim other channels only after those receipts.
- **Sheet.** Re-anchor row/cell, compare expected current value, write one cell, read it back, and record
  before/after hashes. Drift creates a new proposal; no blind overwrite/bulk write.
- **Rentvine.** No endpoint guessing, browser automation, or generic record update. Discovery must obtain
  a documented renewal/rent/date/fee contract and preview/rollback semantics before implementation can
  be marked complete.
- **Dotloop/Boom/SMS/portal.** Each provider gets a typed adapter and fake contract tests first. Vendor
  confirmation/approved app/credentials/plan are explicit gates. No email fallback counts as another
  channel.
- **Buildable now (app-plane).** Orchestrator, action schemas/registry entries false, previews, fake
  adapters, UI/queue/audit/reconciliation, and tests per system.
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

- **AC-S25-1** — Registry/catalog and workflow expose exactly the seven R02 groups/action keys with
  dependency, risk, preview, receipt, correction, health, and `production_allowed:false` by default.
  _Verify:_ `npm test -- lease-execution-matrix action-registry-schema`.
- **AC-S25-2** — Editor may exact-confirm valid email/portal/SMS Medium actions; High Sheet/Rentvine/
  Dotloop/Boom enters Admin approval. Missing source, registry gate, connection, or contract is Blocked
  for Admin too. _Verify:_ `npm test -- lease-execution-authority`.
- **AC-S25-3** — Gmail initiation uses authoritative recipient and S24 artifact/policy; unrelated/
  unconfirmed/drifted/duplicate send makes zero provider calls. _Verify:_ `npm test --
lease-gmail-execution gmail-hub-service`.
- **AC-S25-4** — Sheet executor re-anchors, compare-and-sets one cell, reads after write, and refuses row/
  value drift with zero write; ambiguous result requires reconciliation. _Verify:_ `npm test --
renewal-sheet-executor`.
- **AC-S25-5** — Rentvine executor cannot exist behind a generic endpoint; undocumented/mismatched
  contract returns `Blocked: vendor contract required` with zero mutation. Documented fake contract
  proves preview/idempotency/read-after-write/correction. _Verify:_ `npm test -- rentvine-renewal-executor`.
- **AC-S25-6** — Dotloop fake adapter creates one configured loop with exact participants/documents and
  reconciles duplicate/timeout; wrong template/participant/doc blocks before call. _Verify:_ `npm test --
dotloop-renewal-executor`.
- **AC-S25-7** — Portal and SMS have separate exact confirmations/receipts; text never claims email/
  portal success before both receipts, and one channel failure cannot mark outreach complete. _Verify:_
  `npm test -- renewal-channel-execution`.
- **AC-S25-8** — Boom runs only on explicit applicable rule and Admin approval; not-applicable is
  terminal/audited, while missing rule/contract/identity blocks with zero call. _Verify:_ `npm test --
boom-renewal-executor`.
- **AC-S25-9** — E2E fake-provider scenario completes every applicable action in order and leaves
  receipts; injected failure stops dependents and presents correction/retry policy without duplicate
  attempts. _Verify:_ `npm run test:e2e:core -- lease-renewal-execution`.
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
