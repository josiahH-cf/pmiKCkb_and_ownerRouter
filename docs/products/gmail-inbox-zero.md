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
