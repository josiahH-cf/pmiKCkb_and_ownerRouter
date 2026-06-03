# Gmail Inbox 0 Product Lane

## Current State

Gmail Inbox 0 is the client-facing successor to Owner Router/Dan's AI Assistant. The v1
planning default is owner-email-first. Existing Owner Router artifacts in the sibling
repo are source material to migrate, rename, or reference, but the active product lane
is Gmail Inbox 0 in this monorepo.

## Known Facts

- The product stays Gmail-native for v1.
- Human send authority remains mandatory.
- The current artifact set includes labels, prompt pack, sanitized scenarios, Drive
  package templates, and optional setup/health Apps Script.
- The workflow must not add autonomous sending or system-of-record writes.

## Working V1 Model

- Owner email enters a visible Gmail state queue.
- A human reviews the thread and applies or updates state labels.
- Drafting uses approved reply patterns and the `Draft — Review before sending`
  boundary.
- Missing facts use `Needs Verification: <fact>`.
- Dan/Bailey corrections feed approved reply patterns, tone examples, routing rules, and
  open gaps.

## Setup Items To Confirm

- Final Gmail Inbox 0 label names and whether the existing nine Owner Router labels are
  retained, renamed, or aliased.
- Dan/Bailey accounts included in v1.
- Owner sender/domain criteria.
- Whether Gemini Gems are available in the target Workspace plan.
- Safe live-Gmail testing model.
- Drive folder name, access list, and source-file owners.

## Current Blockers

- No client-approved live Gmail access model.
- No owner sender list.
- No final label naming decision.
- No approved production Drive content.
- No live test-thread protocol.

## Safety Boundaries

- No autonomous send.
- No Gmail draft creation from this repo unless a future approved spec adds it.
- No Gmail read/modify runtime code until explicitly scoped and approved.
- Optional Apps Script remains limited to setup and health checks unless governance is
  intentionally changed.
- No writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or banks.
