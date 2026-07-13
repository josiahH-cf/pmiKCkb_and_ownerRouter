<!-- spec-shape: overhaul-v1 -->

# S19 — Live Gmail per authenticated user

> Owner decision 2026-07-13. This suite supersedes S15/D3 as the Gmail Hub final-state direction,
> while preserving S15 as the shipped pasted-text and browser-only fallback. The owner has now approved
> read, draft, exact-confirmed send/reply, label application, Pub/Sub/watch, deployment, and production
> proof. These are production capabilities, not autonomous-send authority.

**Goal.** Gmail Hub becomes a real, per-user mailbox workspace for the signed-in
`pmikcmetro.com` operator: bounded recent threads, safe thread detail, unsent drafts, and an exact
review-confirm-send flow for a new message or reply. Gmail remains the message system of record and
the authenticated user remains the sender. Sending is never autonomous: one exact payload gets one
short-lived confirmation and at most one Gmail send attempt. The S15 pasted-text tools and synthetic
thread remain clearly separated offline/demo fallbacks.

**What it is / how it functions.**

- **Per-user authorization — `lib/gmail-runtime/dwd-token.ts` + `lib/auth/session.ts`.** Every Gmail
  token uses the server-verified Firebase session email as the DWD `sub`. A browser cannot provide a
  mailbox, subject user, or impersonation target. Non-`pmikcmetro.com` subjects fail before token mint
  or transport work. There is no rollout-only mailbox allowlist: every server-verified
  `pmikcmetro.com` app user operates only their own mailbox. Firebase sign-in and Gmail DWD
  authorization remain separate identity systems.
- **Least-privilege client — `lib/gmail-runtime/*`.** Read methods (`getProfile`, bounded
  `listThreads`, `getThread`, `watchMailbox`, `listHistory`, and RFC Message-ID reconciliation) mint
  `gmail.readonly`; draft/send methods mint `gmail.compose`; user-label discovery/creation uses
  `gmail.labels`; bounded thread-label application uses `gmail.modify`. Safety is enforced by the
  action registry, role capability, exact-message confirmation, idempotency transaction, and
  append-only audit. The client exposes no delete, trash, forwarding, filter, delegate, settings,
  attachment-fetch, or broad `mail.google.com` method.
- **Bounded MIME projection — `lib/gmail-runtime/mime.ts` + `types.ts`.** Message/thread DTOs expose
  only required headers, bounded text, opaque Gmail ids, labels, and attachment metadata. Inline
  `text/plain` is preferred; HTML is converted to inert text. Active HTML is never rendered,
  attachments are never fetched in v1, response/message/thread/part/page limits are deterministic,
  and mailbox content is never sent to Gemini automatically.
- **Authenticated API — `app/api/gmail-hub/*`.** Connection, thread-list, thread-detail, draft,
  confirmation, send, reconciliation, and watch routes derive the subject from `requireUser` /
  capability guards. Strict request schemas reject unknown mailbox/impersonation fields. Read, edit,
  send, and label capabilities are explicit; user-facing routes return 401 before constructing a Gmail
  client. The service-authenticated Pub/Sub route validates signature, audience, verified email, and
  the dedicated push service account before decoding a notification.
- **Human-confirmed send — `lib/gmail-hub/service.ts` + `state-store.ts`.** The server derives From
  and accepts only schema-validated recipients that appear in the exact preview. Reply previews are
  rebuilt from the live Gmail thread, resolve the other participant, and preserve its Subject, `threadId`, `In-Reply-To`, and
  `References`. A random one-time token is stored only as a hash and bound to a hash of the exact
  From/To/Cc/Bcc/Subject/thread/body/RFC-Message-ID payload. A Firestore transaction consumes it once;
  double-clicks, retries, concurrent requests, expiry, payload drift, and cross-user use cannot make a
  second send call. Ambiguous failures are marked for reconciliation and never automatically retried.
- **Minimal state — server-only Firestore collections.** Mailbox watch/cursor health,
  confirmation/idempotency state, Pub/Sub dedupe state, and append-only send/sync audit store ids,
  hashes, counts, timestamps, and statuses only. They never store bodies, MIME, attachments, complete
  threads, model prompts, or bearer tokens. Direct client writes are denied; confirmation consumption,
  cursor advancement, and push dedupe use transactions.
- **Two-stage receive path.** Stage 1 is bounded on-demand `INBOX` reading and works without Pub/Sub.
  Stage 2 uses `users.watch` filtered with `labelFilterBehavior: INCLUDE` + `INBOX`, authenticated
  Pub/Sub push, `history.list`, transactional cursor advance, replay dedupe, and a bounded full resync
  on history 404. Watch renewal is explicit and observable; no email send is coupled to a push event.
- **Live/fallback UI — `components/gmail-hub/LiveGmailWorkspace.tsx`.** Connection identity, bounded
  thread list/detail, compose/reply editor, exact preview, explicit confirmation, send/reconcile
  outcome, and degraded states sit under a visible “Live Gmail” heading. S15 pasted-text tools and
  `SimulatedEmailChain` remain under explicit fallback/demo labels and make no Gmail call.

- **Approved production surface.** `gmail.mailbox.read`, `gmail.draft.create`, `gmail.message.send`,
  `gmail.thread.reply`, and `gmail.label.apply` are separately documented and executable. Live proof
  remains synthetic/self-addressed, but the product supports reviewed third-party recipients.
- **Still prohibited.** Autonomous/background/model-triggered send, cross-mailbox browsing,
  attachment fetch, delete/trash, forwarding/settings mutation, broad `mail.google.com`, and any
  customer-content evidence in git or logs.

**Open questions & assumptions.**

- _Answered 2026-07-13:_ Gmail Hub's final state is live-connected per authenticated
  `pmikcmetro.com` user. It may read that user's mailbox and may send only after that same user
  reviews and confirms the exact message. It never autonomously sends. S15 remains fallback/history.
- _Answered 2026-07-13:_ continue keyless DWD; Firebase authentication identifies the app user while
  Workspace DWD separately authorizes Gmail access as that user.
- _Answered 2026-07-13:_ production compose supports reviewed To/Cc/Bcc recipients; the activation
  proof remains self-addressed so no third party receives a test message.
- _Answered 2026-07-13:_ DWD client `104374162913177846911` carries `gmail.readonly`,
  `gmail.compose`, `gmail.labels`, and `gmail.modify`; no broad mail/settings/delete scope is present.
- _Answered 2026-07-13:_ Editors, Approvers, and Admins may send from their own mailbox after exact
  confirmation. Viewer-only access does not gain compose authority.
- _Answered 2026-07-13:_ Pub/Sub uses a dedicated no-key push service account, exact OIDC audience,
  and Gmail's documented publisher principal. Resource identifiers are non-secret handoff data.

**Cross-product impacts.** Touches `lib/gmail-runtime/`, new `lib/gmail-hub/`, `app/api/gmail-hub/`,
`components/gmail-hub/`, `lib/auth/roles.ts`, `.env.example`, `firestore.rules`,
`lib/integrations/action-registry-seed.ts`, and Gmail/cutover docs. It preserves the renewal-only
`gmail.renewal_notice.draft_create` approval exactly. It supersedes S15/D3 only as final-state
direction; S15's shipped pasted/synthetic tools remain valid fallback behavior. Delete-on-supersede is
recorded as `GMAIL-HUB-SIMULATOR-FINAL` in `docs/facts.md`.

**Adversarial acceptance checks.**

- **AC-S19-1** — Every user-facing Gmail route returns 401 before token mint, transport, or state work;
  a wrong-domain session returns 403; strict schemas reject `userEmail`, `mailbox`, `subjectUser`, and
  `impersonationSubject`. _Verify:_ `npm test`; keep `tests/unit/gmail-hub-live-routes.test.ts` and
  `tests/unit/auth-session.test.ts` green.
- **AC-S19-2** — Read methods request `gmail.readonly`, compose/send requests `gmail.compose`, label
  discovery/creation requests `gmail.labels`, label application requests `gmail.modify`, and no exported delete/trash/settings/forwarding/attachment-fetch method or
  `mail.google.com` scope exists. _Verify:_ `npm test`, `npm run verify:router-boundary`; keep
  `tests/unit/gmail-runtime-client.test.ts` green.
- **AC-S19-3** — Bounded parsing prefers text/plain, converts HTML to inert text, strips active content,
  caps body/thread/parts/attachments, and never fetches an attachment. _Verify:_ `npm test`; keep
  `tests/unit/gmail-runtime-mime.test.ts` green.
- **AC-S19-4** — One signed-in user cannot read, draft, confirm, reconcile, or send as another; From is
  server-derived and every To/Cc/Bcc value is schema-validated and bound to the exact confirmation.
  Read, edit, and `sendEmail` capability denials are independently observable. _Verify:_ `npm test`; keep
  `tests/unit/gmail-hub-service.test.ts` and `tests/unit/auth-session.test.ts` green.
- **AC-S19-5** — Send requires one unexpired, unconsumed confirmation bound to the exact payload hash;
  payload drift, stale tokens, double-clicks, retries, and concurrent requests result in at most one
  `sendMessage` call. The audit stores no body/MIME/token. _Verify:_ `npm test`; keep
  `tests/unit/gmail-hub-service.test.ts` green.
- **AC-S19-6** — A Gmail/network outcome that could be ambiguous records `ambiguous`, makes no automatic
  retry, and exposes an explicit RFC Message-ID reconciliation step. A found message closes the audit;
  no match leaves the send blocked. _Verify:_ `npm test`; keep
  `tests/unit/gmail-hub-service.test.ts` green.
- **AC-S19-7** — A reply preview contains the live thread id, exactly matching subject,
  `In-Reply-To`, and accumulated `References`; the send result exposes Gmail message/thread ids without
  exposing the body. _Verify:_ `npm test`; keep `tests/unit/gmail-hub-service.test.ts` green.
- **AC-S19-8** — Pub/Sub rejects missing/invalid OIDC, wrong audience, wrong service-account email,
  wrong-domain notifications, and malformed data before Gmail work. Replay is idempotent;
  cursor advance + dedupe completion are transactional; history 404 triggers only a bounded resync.
  _Verify:_ `npm test`; keep `tests/unit/gmail-hub-pubsub.test.ts` green.
- **AC-S19-9** — Firestore rules deny direct client reads/writes to confirmation, idempotency, dedupe,
  and audit collections. No stored record schema includes body, raw, MIME, attachment content, prompt,
  or token fields. _Verify:_ `npm run test:firestore`, `npm run verify:redaction`.
- **AC-S19-10** — Gmail Hub renders connected identity, bounded list/detail, new/reply editor, exact
  preview, confirmation, send/reconciliation result, and honest gated/error states under “Live Gmail”; the
  synthetic chain remains “Browser only” and makes no Gmail/app call. _Verify:_ `npm test`,
  `npm run test:e2e:core`; keep `tests/unit/gmail-live-workspace.test.tsx` and
  `tests/unit/gmail-hub-simulated-email-chain.test.tsx` green.
- **AC-S19-11** — The registry separately governs `gmail.mailbox.read`, `gmail.draft.create`,
  `gmail.message.send`, `gmail.thread.reply`, and `gmail.label.apply`; all five are Approved for
  Execution and join the existing renewal draft allowlist. _Verify:_
  `npm test`, `npm run verify:spec-traceability`; keep
  `tests/unit/action-registry-schema.test.ts` and `tests/unit/action-gate.test.ts` green.
- **AC-S19-12** — Full local verification is green. Production evidence records only non-secret
  resource names, revision, statuses, counts, expirations, and synthetic Gmail identifiers. A
  self-addressed new message and explicit reply share one Gmail thread id; a user label and mailbox
  watch are observable without committing message content.
  _Verify:_ `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:router-boundary`, `npm run verify:falsification`,
  `npm run verify:context-freshness`, `npm run verify:spec-traceability`, `npm run verify:redaction`,
  `npm run build`, `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** No autonomous, background, model-triggered,
scheduled, or automatically retried send. No cross-mailbox Admin browsing. No client-supplied
impersonation subject. No `mail.google.com`, delete/trash/settings/forwarding,
attachment fetch, unbounded scan, raw MIME/body persistence or logs, or automatic Gemini processing.
The five Inbox 0 actions are approved; exact-confirmation and action-specific scope boundaries remain.
The existing renewal unsent-draft approval is unchanged.
The ~$10 cap and budget guard bind every future cloud/live step.

**Ordered prompt sequence.**

1. _Discovery:_ Read Tier 0, S15, Gmail product/auth/integration docs, runtime and adversarial tests;
   verify Gmail API behavior from official Google documentation only.
2. _Context update:_ Record the 2026-07-13 owner decision, correct `gmail.compose` send capability,
   delete simulated-only final-state guidance, and register S19 without rewriting S15 history.
3. _Build:_ Add explicit types, bounded transport/MIME parsing, read/compose client methods, subject
   validation, and scope-placement sentinels with fake transports only.
4. _Build:_ Add disabled read/send/reply registry records and distinct read/edit/send capability gates.
5. _Build:_ Add strict authenticated connection/thread/draft/confirmation/send/reconcile routes. Build
   the transaction-backed one-time confirmation and bodyless append-only audit.
6. _Build:_ Add watch/history client behavior, authenticated Pub/Sub validation, dedupe/cursor
   transactions, and bounded history-404 recovery; do not provision resources.
7. _Build:_ Add the Live Gmail UI and retain the S15 pasted/synthetic fallback distinction.
8. _Verify:_ Run focused adversarial tests, then the complete AC-S19-12 command list; repair supported
   defects and update `docs/facts.md`, `docs/loop-state.md`, `docs/status.md`, and `docs/plan.md`.
9. _Gate:_ COMPLETE 2026-07-13 — the owner approved the four exact Gmail scopes, five Inbox 0
   actions, Pub/Sub/watch, deployment, production smoke, and repository publication.
10. _Production:_ Provision the dedicated push identity/topic/subscription, deploy, seed registry
    metadata, start the watch, and run a self-addressed new-message/reply/label proof.
11. _Verify:_ Confirm the two synthetic messages share one Gmail thread id, label application is
    visible, watch expiration is future, and push authentication rejects untrusted callers.
12. _Context update:_ Record only non-secret resource names, ids, counts, statuses, and revision.

**Deletion/merge recommendation.** KEEP S19 as the active live Gmail specification. KEEP S15 as the
historical shipped pasted-text/simulator fallback spec, with a superseded-final-state note. Do not merge
the two: their acceptance evidence and permission boundaries are intentionally different.
