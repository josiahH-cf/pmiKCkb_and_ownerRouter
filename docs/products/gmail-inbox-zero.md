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

## Known Facts

- The product stays Gmail-native for v1.
- The first pilot mailbox is Dan's Gmail.
- The first base layer starts with `Waiting on Outside` and `Waiting on Team`.
- The target label set also includes `Dan Decision` and `Draft Ready`.
- Human send authority remains mandatory for now; Dan presses Send.
- The current artifact set includes labels, prompt pack, sanitized scenarios, Drive
  package templates, and optional setup/health Apps Script.
- The sibling Owner Router package can supply source ideas for labels, prompts,
  templates, safe scenarios, and setup helpers, but final Gmail Inbox 0 scope must be
  approved here.
- The workflow must not add autonomous sending or system-of-record writes.
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

- Automation and Gemini evaluate Dan's incoming email broadly, but rules determine what
  is suggested or applied.
- AI suggests labels and gets smarter from corrections. Auto-labeling is allowed only
  for exact matches or repeated Dan-approved patterns.
- The first active labels separate work that is waiting on someone outside PMI KC from
  work waiting on someone inside PMI KC.
- Drafting should support Gmail drafts and reply composition flows, but Dan sends
  manually during the base layer.
- Drafts use approved reply patterns and the `Draft — Review before sending` boundary.
- Missing facts use `Needs Verification: <fact>`.
- Dan's feedback enters the learning loop when he changes a label or marks a reply good
  or bad. Feedback creates suggested changes; Admin approval is required before rules or
  patterns become active.
- Learning material starts in Gemini Gems and should also be managed through the KB app.

## Connective Architecture

Decided 2026-06-05. This records the intended design; Gmail runtime remains client-gated
and docs-only until access and scope are approved (see Safety Boundaries and Blockers).
The backend never paints its own screen over Gmail. It reaches back into Dan's inbox
through Gmail's own objects plus one sanctioned in-Gmail panel, and it learns by observing
what Dan does to those objects. It is a two-way street on native Gmail surfaces, so Dan
never leaves his inbox.

### Backend to Gmail (how tailoring appears where Dan works)

- Labels applied via the Gmail API appear natively in Dan's sidebar and on threads
  (additive only).
- Drafts created via the Gmail API appear as native unsent `Draft` replies in the thread.
- Decided in-Gmail UI surface: a Google Workspace Add-on contextual card that our backend
  controls, shown in the Gmail side panel when Dan opens a message (suggested label,
  draft-ready, plain-English "why", and feedback controls). This is the target surface for
  the drafting/explainability phase (Phase C+); Phases A and B work with labels and drafts
  alone and do not require the add-on. The add-on path implies a future Workspace
  Marketplace review.

### Gmail to backend (how it learns)

- The backend registers `users.watch` and reads `users.history.list` to observe
  `labelAdded`, `labelRemoved`, message additions, and drafts that became sent messages.
- Implicit signals (kept vs removed label; draft sent as-is, edited, or deleted) plus
  optional explicit thumbs feedback flow back to the backend.

### Learning governance (decided: reuse the KB model)

- Gmail Inbox 0 "learning" is not opaque retraining. It is the KB pattern set growing:
  reply templates, label rules, and sender/category mappings stored in the KB and fed into
  Gemini each time (the same source-backed approach the KB already uses).
- Dan's edits become approval-gated proposed updates through the existing source-state and
  approval-queue model. Nothing self-modifies; improvements are human-confirmed, matching
  the no-autonomous-send philosophy.

### Split-scope safety model

- There is no Gmail OAuth scope that allows labeling/drafting while blocking send, so the
  no-send guarantee is enforced in code, not by a scope.
- Background triage uses `gmail.readonly` + `gmail.labels` only, which have no send
  capability at all.
- Draft creation uses a send-capable scope (`gmail.compose`), but the code never calls the
  send method; Dan presses Send in Gmail.

### Rollout (reversible, opt-in)

- Phase A shadow (classify only, apply nothing) -> Phase B suggest/auto-label exact
  matches -> Phase C drafts -> later phases only after testing and explicit sign-off.
- Back-labeling historical threads is opt-in. Disconnecting the integration stops
  everything; remaining labels are ordinary Gmail labels.

## Discovery Questions (ask Dan first)

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

- No client-approved live Gmail access model.
- No approved Dan mailbox scan and labeling protocol.
- No approved production Drive content.
- No live test-thread protocol.
- No approved Gmail draft/reply creation spec.
- KB approval notification failure-escalation details still need production
  configuration.

## Safety Boundaries

- No autonomous send.
- No Gmail draft creation from this repo unless a future approved spec adds it.
- No Gmail read/modify runtime code until explicitly scoped and approved.
- Optional Apps Script remains limited to setup and health checks unless governance is
  intentionally changed.
- No writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or banks.
- Historical scanning should produce suggestions first. Historical back-labeling requires
  approved rules and explicit client confirmation.
