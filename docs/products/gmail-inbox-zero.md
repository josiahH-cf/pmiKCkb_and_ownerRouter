# Gmail Inbox 0 Product Lane

## Current State

Gmail Inbox 0 is the client-facing successor to Owner Router/Dan's AI Assistant. The
pilot starts with Dan's Gmail and all of Dan's email, not only owner email. Existing
Owner Router artifacts in the sibling repo are source material to migrate, rename, or
reference, but the active product lane is Gmail Inbox 0 in this monorepo.

The local Owner Router source package is mapped in
`docs/legacy/owner-router-artifact-source.md`. Use that map before inspecting
`C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`, and treat the sibling
package as historical source material only.

Built locally to the live gate on 2026-07-13: S19
(`docs/feature-suites/gmail-live-per-user.md`) adds a separate per-user Gmail workspace,
server-derived DWD subject, bounded thread reads, defensive MIME parsing, unsent drafts,
exact-payload send confirmation, reply threading, and authenticated watch/history
handling. The new Action Registry keys remain `production_allowed:false`; no live read,
send, Pub/Sub provisioning, promotion, or deploy occurred in this slice. The S15
browser-only simulator and pasted-text tools remain a clearly labeled offline/demo
fallback, not the final product boundary.

## Known Facts

- The product stays Gmail-native for v1.
- The product pilot still targets Dan's workflow, but the first technical live proof is
  one configured authenticated pilot user sending only to the same mailbox. Dan's mailbox
  is not part of that proof without a separate action-time approval.
- The first base layer starts with `Waiting on Outside` and `Waiting on Team`.
- The target label set also includes `Dan Decision` and `Draft Ready`.
- Human send authority remains mandatory: the authenticated user reviews the exact
  message and explicitly confirms Send for that one message.
- The current artifact set includes labels, prompt pack, sanitized scenarios, Drive
  package templates, and optional setup/health Apps Script.
- The sibling Owner Router package can supply source ideas for labels, prompts,
  templates, safe scenarios, and setup helpers, but final Gmail Inbox 0 scope must be
  approved here.
- The workflow must not add autonomous sending or system-of-record writes.
- The 2026-07-13 self-pilot `users.getProfile` proof verified the keyless `gmail.readonly`
  connection for `josiah@pmikcmetro.com`; the read action is allowlisted, while send/reply and
  deployment remain separately gated (`docs/evidence/gmail-read-grant-2026-07-13.md`).
- Gmail Inbox 0 should have a minimal management page inside the KB app from the start.
- KB approval notifications are part of the Gmail Inbox 0 vision: approval work should
  eventually flow between the KB app and Gmail without removing human approval.
- KB approval notification launch recipients are Dan and Josiah's PMI KC account.
- KB approval notifications are sent from `kb-automation@pmikcmetro.com`.
- KB approval notifications should use a clear approval subject line and apply the
  `KB Approval` Gmail label.
- KB approval notification failures should escalate instead of failing silently; the
  exact escalation path is TBD.

## Working V1 Model

- Firebase authentication identifies the signed-in app user; Gmail authorization is a
  separate keyless DWD exchange whose `sub` is that server-verified
  `pmikcmetro.com` email.
- Stage 1 is a bounded, on-demand recent-inbox thread list and bounded thread detail using
  `gmail.readonly`; attachments are metadata only and mailbox content is not sent to
  Gemini automatically.
- Stage 2 is an INBOX-restricted `users.watch`, authenticated Pub/Sub push, transactional
  history cursor/replay state, and bounded resync after expired history. Watch renewal is
  manual until separately approved.
- Drafts are unsent Gmail drafts. New messages and replies may send only after the same
  user reviews From/To/Cc/Bcc/subject/thread/body, receives an exact-payload one-time
  confirmation, and explicitly confirms Send.
- The live verification boundary is self-recipient only. Broader recipients, labels,
  automated classification, model summarization, and learning remain later promotion
  slices.
- Reply construction re-reads the live parent and preserves Gmail `threadId`, matching
  subject, `In-Reply-To`, and `References`.
- The browser simulator and pasted-text draft/summary tools remain offline/demo fallback
  surfaces and make no Gmail mailbox call.

## Connective Architecture

The 2026-07-13 owner direction supersedes the earlier final-state assumption that the
product must remain simulated/pasted-text-only or exclusively in Gmail. The KB-hosted
Gmail Hub is now the approved app surface for each authenticated user's own mailbox;
native Gmail drafts/threads remain the system objects. A future Workspace Add-on may
remain useful, but it is not required for S19.

### Backend to Gmail (how tailoring appears where Dan works)

- Bounded thread reads appear in the authenticated user's KB Gmail Hub workspace.
- Drafts created through the approved compose action appear as native unsent Gmail drafts.
- A user-confirmed new message or reply uses Gmail's native send endpoint and returns only
  Gmail message/thread identifiers to the UI; send/reply actions remain gated pending
  promotion evidence.
- Label application still requires `gmail.modify` and remains outside S19.

### Gmail to backend (how it learns)

- The backend registers an INBOX-restricted `users.watch` and reads bounded
  `users.history.list` message-addition events from a stored cursor.
- Push processing stores identifiers, counts, health, and cursors only. It does not store
  message bodies, raw MIME, attachments, prompts, or complete threads.

### Learning governance (decided: reuse the KB model)

- Gmail Inbox 0 "learning" is not opaque retraining. It is the KB pattern set growing:
  reply templates, label rules, and sender/category mappings stored in the KB and fed into
  Gemini each time (the same source-backed approach the KB already uses).
- Dan's edits become approval-gated proposed updates through the existing source-state and
  approval-queue model. Nothing self-modifies; improvements are human-confirmed, matching
  the no-autonomous-send philosophy.

### Split-scope safety model

- `gmail.readonly` is the only S19 read/watch/history scope.
- `gmail.compose` is send-capable. Safety therefore comes from server-derived identity,
  capability and Action Registry gates, self-recipient enforcement, exact-payload
  confirmation, one transactional claim, no ambiguous retry, and bodyless append-only
  audit—not from claiming the scope cannot send.
- `gmail.modify` and `https://mail.google.com/` are forbidden in this slice. Label
  application remains gated.

### Rollout (reversible, opt-in)

- Local fake-transport build -> approved `gmail.readonly` DWD scope -> bounded on-demand
  self-mailbox profile proof (complete 2026-07-13) -> separately approved safe self-thread
  send/reply proof -> optional
  authenticated push proof -> explicit registry promotion/deploy approval.
- Revoke `gmail.readonly`/`gmail.compose`, disable the registry keys, and remove Pub/Sub
  delivery to stop the integration. No historical back-labeling is part of S19.

## Later Workflow Discovery (after the self-only technical proof)

These four high-leverage questions define the initial labels, draft templates, routing,
and exclusions. Each lists the default to assume if Dan is brief.

1. When you open your inbox, what 3-5 piles do you mentally sort mail into? (Defines the
   label taxonomy. Default to validate: Waiting on Outside, Waiting on Team, Dan Decision,
   Draft Ready.)
2. Which kinds of emails do you reply to the same way most of the time? (Defines first
   auto-draft templates and which cases are safe to draft. Default: start with the 2-3
   most repetitive.)
3. Which emails must never be auto-touched? (Defines hard exclusions. Default:
   owner-money, legal/notices, tenant disputes -> label only, never draft.)
4. How do you currently know an email is stuck waiting on someone, and on whom? (Defines
   the follow-up/aging logic and the waiting parties. Default: surface anything in a
   Waiting label with no reply after N days.)

## Management Page

The first KB-hosted Gmail Inbox 0 management page should be Admin-only and include:

- Health/status bar for Gmail connection status and Gemini status.
- Labels.
- Plain-English rules that become structured fields after Admin approval.
- Approved replies to select from.
- History of changes.

The same plain-English-to-structured-rule feedback model should eventually apply across
KB automations.

Initial Admins are Josiah and Dan. Admins may grant the Admin role to additional users
they choose.

## Setup Items To Confirm

- Gmail access model for Dan's mailbox.
- Safe historical scan model for training.
- Whether approved rules may back-label historical threads.
- Whether Gemini Gems are available in the target Workspace plan.
- Minimal Gmail scopes and rollback model.
- Drive folder name, access list, and source-file owners for prompt/rule materials.

## Current Blockers

- `gmail.readonly` is not yet recorded as granted to DWD client
  `104374162913177846911`; the owner must approve/add that exact scope before any live
  read. Rollback is removing that scope from the same client.
- `gmail.mailbox.read`, `gmail.message.send`, and `gmail.thread.reply` remain
  `production_allowed:false`. The safe self-thread proof requires action-time owner
  approval and must record IDs/counts/statuses only.
- The Pub/Sub topic, publisher binding, dedicated OIDC push identity/subscription, and
  manual watch are not provisioned. Cloud Scheduler remains unauthorized.
- Broader recipients, Dan mailbox access, live label modification, historical scans, and
  production deploy remain separate approval decisions.
- KB approval notification failure-escalation details still need production
  configuration.

## Safety Boundaries

- No autonomous send.
- No live Gmail read until the exact `gmail.readonly` grant and action-time test approval
  are recorded. Local runtime/tests use injected transports only.
- No send without an unexpired, unconsumed confirmation bound to the exact payload the
  authenticated user reviewed and explicitly confirms.
- No browser-supplied impersonation subject and no Admin cross-mailbox browsing.
- No background, scheduled, model-triggered, retry-on-ambiguity, or automatic reply.
- No mailbox bodies, raw MIME, attachments, tokens, or complete threads in Firestore or
  logs. No automatic mailbox content to Gemini.
- No `gmail.modify`, delete/trash/settings/filter/delegate/forwarding methods, or
  `https://mail.google.com/` scope.
- Optional Apps Script remains limited to setup and health checks unless governance is
  intentionally changed.
- No writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or banks.
- Historical scanning should produce suggestions first. Historical back-labeling requires
  approved rules and explicit client confirmation.
