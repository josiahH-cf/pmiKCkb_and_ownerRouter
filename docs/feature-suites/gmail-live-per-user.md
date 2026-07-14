<!-- spec-shape: overhaul-v1 -->

# S19 — Workflow-linked Gmail per authenticated user

> Re-scoped 2026-07-14. The proven per-user DWD transport and exact-confirmation controls remain;
> the former general mailbox-workspace direction is superseded by a workflow-communication adapter.
> `/gmail-hub` remains as a compatibility URL and is titled “Workflow Communications.”

**Goal.** Gmail supports authorized lease-renewal and maintenance work without becoming a second
inbox. Gmail remains the message system of record. PMI KC stores bodyless links, reviewed workflow
meaning, attention state, and audit context; it does not own mailbox management or infer operational
truth from email without human review.

**What it is / how it functions.**

- **Identity and delegation — `lib/auth/session.ts`, `lib/gmail-runtime/dwd-token.ts`.** Firebase
  authenticates a verified `pmikcmetro.com` app user. A separate keyless DWD exchange acts as that
  same server-verified email. No body/query parameter may choose a mailbox, and Admin does not gain
  cross-mailbox access. The approved scopes remain `gmail.readonly`, `gmail.compose`, `gmail.labels`,
  and `gmail.modify`.
- **Workflow authorization — `lib/gmail-hub/workflow-context.ts` and
  `workflow-authorization.ts`.** Every thread read, link, label, draft, confirmation, reply, and
  reconciliation carries a strict workflow context. The route checks the actor’s space capability
  and referenced entity before constructing the Gmail service. Test/simulation renewal runs are
  read-only and cannot execute Gmail mutations.
- **Bodyless linkage — `lib/gmail-hub/state-store.ts`.** A link stores actor/mailbox keys, workflow
  entity, purpose, Gmail identifiers, template/source references, status, timestamps, expiry, and
  hashes only. Bodies, raw MIME, attachment content, prompts, tokens, and free-text reasons are not
  retained. Direct Firestore access is denied.
- **Targeted reading — `lib/gmail-hub/service.ts`.** The product surface cannot list/search recent
  inbox mail. An operator may deliberately link one opaque Gmail thread ID to an authorized workflow
  with a reason; subsequent reads require the matching link. MIME parsing remains bounded, prefers
  plain text, converts HTML to inert text, and returns attachment metadata only.
- **Governed mutations — `lib/gmail-hub/contracts.ts`, `governed-artifacts.ts`, and the Action
  Registry.** Labels are limited to the four approved values and a fixed manual-review rule plus
  reason. Drafts/replies require a linked thread and an approved versioned template. No production
  workflow reply template exists yet, so those routes fail closed even though the proven transport
  actions remain registered. Generic new-message compose/send is disabled.
- **Human send — `lib/gmail-hub/service.ts`.** Approver/Admin only. The exact reply payload is bound
  to a short-lived one-time confirmation hash and one transaction claim. Payload drift, expiry,
  cross-user reuse, double-clicks, and concurrency make at most one send attempt. Ambiguous outcomes
  are never retried and require RFC Message-ID reconciliation.
- **Targeted receive — `processGmailPushNotification`.** Authenticated Pub/Sub is a mailbox-change
  signal only. Incremental message IDs are matched against existing linked thread IDs; unrelated
  additions cause no thread fetch, model call, task, or notification. History expiry/overflow advances
  via profile cursor only and never scans the inbox. Linked duplicates create one value-free attention
  state.
- **Attention and AI — `lib/gmail-hub/notifications.ts` and
  `app/api/gmail-hub/workflow-analysis/route.ts`.** A linked addition produces a bodyless in-app
  “communication needs review” item. AI runs only when an authorized operator opens one linked thread
  and requests help. Unknown or excluded owner-money/legal/dispute categories refuse before model
  construction; obvious excluded content is checked before the model call. Output is an unpersisted
  `Needs Review` proposal and cannot alter workflow or external state.
- **UI — `components/gmail-hub/LiveGmailWorkspace.tsx` and
  `WorkflowCommunicationPanel.tsx`.** The compatibility hub shows connection/watch health and
  bodyless attention. Thread content and actions live inside the authorized maintenance ticket or
  renewal entity. The primary UI has no recent-inbox list, arbitrary query, generic compose, arbitrary
  label, delete, archive, or settings control. S15 pasted/synthetic tools are Admin-only fallbacks.
- **Renewal and maintenance initiation.** Current visible renewal runs are simulation/sample data,
  so owner/tenant routes are preview-only, unaddressed, and say “do not send.” Maintenance tickets do
  not yet have a verified owner-contact source, so maintenance owner-notice draft creation is Planned.

- **Buildable now (app-plane).** Maintain workflow context/link authorization, targeted reads,
  approved manual labels, bodyless attention, on-demand proposal-only analysis, exact-confirmation
  infrastructure, and negative tests. No live customer or mailbox content is required for verification.
- **Gated (owner / vendor).** R01–R09 are settled; S20/S22/S24/S25/S26 implement risk authority,
  retention/artifacts/AI policy, authoritative workflow values, multichannel actions, and external
  Vendor TOTP/OAuth. Live configuration, mailbox access, sends, and any scheduler remain separately gated.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ the product boundary is workflow-linked Gmail, not “all of Dan’s email” or a
  general Gmail-native inbox.
- _Answered 2026-07-14:_ S20 target gives internal Editors direct enabled Low/Medium execution,
  including exact-confirmed workflow communication; consequential High work requires Admin; Admin may
  self-approve every risk. S20 is now Local green: internal Editors have `sendEmail` only through the
  strict workflow-context/exact-confirmation routes; generic compose/send remains forbidden.
- _Answered 2026-07-14:_ the legacy event-triggered approval Gmail sender is disabled; approval
  attention is in-app only.
- _Answered 2026-07-14:_ S24 retention is 10m/30d confirmation, 7d dedupe, 90d sync, 365d link, 7y
  bodyless audit, no persisted V1 AI facts, with legal hold/later policy override. Production link
  creation remains closed until cleanup/hold/config are implemented.
- _Answered 2026-07-14:_ exact current owner-renewal, tenant-renewal, and maintenance-owner generators
  are v1.0 base artifacts; S24 governs verified value replacement/source-visible AI rewrite. Runtime
  authoritative recipient/value adapters still must be configured in S25/S26.
- _Open:_ define when email + portal chat + SMS count as renewal outreach/agreement complete. Email
  alone is not assumed sufficient.
- _Open:_ identify the maintenance owner-contact source and when an owner notice is required.
- _Answered 2026-07-14:_ Josiah owns manual Gmail watch renewal and degraded-watch response. No
  scheduler is assumed.
- _Answered for V1 2026-07-14:_ add no AI exclusions; keep owner money, legal/notices, and tenant
  disputes excluded before model construction.
- _Answered 2026-07-14:_ S22 uses Admin invite, one-time password setup, verified-email TOTP,
  assigned-ticket-only frontend, and the same Vendor Gmail/Workspace address through per-vendor OAuth,
  never DWD. Vendor/Admin exactly confirms every AI-assisted send.

**Cross-product impacts.** This suite governs `app/api/gmail-hub/`, `components/gmail-hub/`,
`lib/gmail-hub/`, `lib/gmail-runtime/`, notification feed/mark-read paths, `lib/auth/roles.ts`,
`firestore.rules`, the Action Registry, renewal sample-draft routes, maintenance tickets, and the
Workflow Communications compatibility/admin pages. Lease Renewal and maintenance retain their own
status/source-state gates. No email interpretation writes Rentvine, Sheets, LeadSimple, Dotloop,
QuickBooks, Boom, Drive, or another system of record. Supersede marker:
`GMAIL-GENERAL-INBOX-TO-WORKFLOW-ADAPTER` in `docs/facts.md`.

**Adversarial acceptance checks.**

- **AC-S19-1** — No workflow UI/API lists recent inbox mail, accepts an arbitrary Gmail query, or
  exposes generic compose. A valid unrelated thread cannot be read until deliberately linked to an
  authorized entity. _Verify:_ `npm test`; keep `gmail-hub-live-routes.test.ts`,
  `gmail-live-workspace.test.tsx`, and `gmail-hub-home.test.tsx` green.
- **AC-S19-2** — The Gmail subject equals the server-verified Firebase email and approved scopes stay
  separate; body/query impersonation values fail closed. _Verify:_ `npm test`,
  `npm run verify:router-boundary`; keep `auth-session.test.ts`, `gmail-runtime-client.test.ts`, and
  `gmail-hub-live-routes.test.ts` green.
- **AC-S19-3** — Workflow context/entity/space authorization occurs before Gmail construction;
  maintenance-scoped users cannot access renewals and simulations cannot mutate Gmail. _Verify:_
  `npm test`; keep `gmail-hub-live-routes.test.ts` green.
- **AC-S19-4** — Only the four approved labels, fixed governed rule, non-empty human reason, and an
  approved versioned template pass. Invalid artifacts cause zero Gmail mutations. _Verify:_ `npm test`;
  keep `gmail-hub-service.test.ts` and `action-registry-schema.test.ts` green.
- **AC-S19-5** — Historical baseline superseded only on role disposition by AC-S20-3: exact-confirmed
  linked replies make at most one send attempt under drift, expiry, reuse, concurrency, and ambiguity.
  S20 now also permits an internal Editor to perform that enabled Medium action; the same
  route/artifact/confirmation gates remain. _Verify:_ `npm test`; keep `gmail-hub-service.test.ts`,
  `gmail-hub-capabilities.test.ts`, and `execution-risk-policy.test.ts` green.
- **AC-S19-6** — Unrelated push additions and cursor-only resync cause zero thread fetches, model
  calls, tasks, and attention; a linked duplicate produces one bodyless attention state. _Verify:_
  `npm test`; keep `gmail-hub-pubsub.test.ts` green.
- **AC-S19-7** — Gmail-derived summaries/actions remain unpersisted `Needs Review` proposals with
  provenance and cannot change a workflow or system of record. _Verify:_ `npm test`; keep
  `gmail-workflow-analysis-route.test.ts` green.
- **AC-S19-8** — Unknown/excluded category aliases refuse before Gmail/model construction, and
  detected excluded content refuses before the model call. _Verify:_ `npm test`; keep
  `gmail-workflow-analysis-route.test.ts` and `gmail-draft-safety.test.ts` green.
- **AC-S19-9** — Persisted Gmail operational records contain no body, MIME, attachment content,
  prompt, token, or free-text reason; Firestore clients cannot access them. _Verify:_
  `npm run verify:redaction`, `npm run test:firestore`; keep `gmail-hub.rules.test.ts` and
  `gmail-hub-service.test.ts` green.
- **AC-S19-10** — Renewal sample routes never construct Gmail, accept browser recipients, or become
  executable from a registry toggle; email alone cannot mark multichannel outreach/consent complete.
  _Verify:_ `npm test`; keep `owner-notice-draft-route.test.ts` and
  `tenant-notice-draft-route.test.ts` green.
- **AC-S19-11** — A maintenance reply cannot choose a vendor, approve cost, transition a ticket, or
  write Rentvine. Maintenance owner initiation remains Planned until recipient evidence exists.
  _Verify:_ `npm test`, `npm run verify:spec-traceability`; keep Action Registry and maintenance tests
  green.
- **AC-S19-12** — Value-free Gmail attention is self-mailbox, space-scoped, deduplicated, and
  mark-readable without exposing Gmail/message identifiers or content. _Verify:_ `npm test`; keep
  `gmail-workflow-notifications.test.ts` and notification feed/menu tests green.

Full verification: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run test:e2e:core`, `npm run verify:router-boundary`, `npm run verify:falsification`,
`npm run verify:context-freshness`, `npm run verify:spec-traceability`, `npm run verify:redaction`,
`npm run build`, and `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** No general inbox browsing/search/management; no cross-mailbox
access; no browser-supplied recipient for workflow initiation; no autonomous, scheduled,
event-triggered, model-triggered, bulk, or retry-on-ambiguity send; no attachment fetch; no
delete/trash/settings/filter/delegate/forwarding; no historical scan/back-label; no automatic model
processing or workflow status change; no raw Gmail/customer content in git/logs/notifications/state;
no system-of-record or client Drive write; no outbound vendor communication; no new scope; no Cloud
Scheduler; no deploy/live proof in an unattended loop; the ~$10 cap remains binding.

**Ordered prompt sequence.**

1. _Discovery:_ Read Tier 0, S15/S19, Gmail product/auth/integration docs, renewal/maintenance docs,
   runtime, Action Registry, rules, and adversarial tests.
2. _Understanding:_ Verify identity/scope/transport controls separately from product authorization;
   identify sample or missing authoritative workflow sources before any mutation path.
3. _Build:_ Require strict workflow context/entity authorization, bodyless expiring links, and
   targeted thread reads; remove recent-inbox/query/compose UI/API exposure.
4. _Build:_ Enforce labels/rules/templates against machine schemas; apply S20's direct internal
   Low/Medium and Admin-approved High decision; retire the legacy automatic approval sender.
5. _Build:_ Match Pub/Sub IDs only against existing links and create value-free attention; use
   cursor-only recovery and no background model/content fetch.
6. _Build:_ Add explicit on-demand, exclusion-first, proposal-only analysis and keep results
   unpersisted until a separately approved human-confirm workflow fact model exists.
7. _Build:_ Integrate maintenance ticket context and simulation-only renewal containment; add no
   owner/vendor initiation without verified recipient sources.
8. _Verify:_ Run focused tests, then the complete verification list; scan stored/logged records for
   prohibited content.
9. _Gate:_ Stop before production linkage until retention and first approved templates/sources are
   owner-confirmed. Stop before any vendor or system-of-record action.
10. _Context update:_ Update product docs, Action Registry, facts/status/plan/loop state and record
    superseded general-inbox direction once verification is green.

**Deletion/merge recommendation.** KEEP S19 as the active workflow-linked Gmail specification. KEEP
S15 as historical evidence for the Admin-only pasted/synthetic fallback. Retain `/gmail-hub` and the
legacy product filename only as compatibility paths; active copy and requirements use Workflow
Communications.
