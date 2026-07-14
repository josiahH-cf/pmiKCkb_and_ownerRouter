# Workflow Communications Product Lane

> Compatibility filename. The 2026-07-14 workflow-adapter boundary supersedes the former “Gmail
> Inbox 0,” “all of Dan’s email,” and general Gmail-native workspace direction. Historical Owner
> Router artifacts remain source material only; see
> `docs/legacy/owner-router-artifact-source.md`.

## Product boundary

Gmail is PMI KC’s workflow communication adapter and evidence source, not an inbox replacement.
Gmail owns messages, native threads, and unsent drafts. PMI KC owns authorized workflow linkage,
bodyless communication attention, proposed tasks/decisions, reviewed workflow meaning, and audit
context. Rentvine and other external systems retain their existing authority.

The application exposes only:

- bodyless attention for messages on already-linked renewal/maintenance threads;
- targeted reading of a deliberately linked thread inside an authorized workflow entity;
- the four approved labels after explicit human review and a governed rule/reason;
- unsent workflow drafts and exact-confirmed linked replies after an approved versioned template or
  versioned AI-reply policy exists;
- explicit on-demand AI-assisted understanding that returns an unpersisted `Needs Review` proposal.

It does not expose recent-inbox browsing, arbitrary Gmail queries, free-form compose/recipients,
delete/archive/settings/filter operations, attachment retrieval, cross-mailbox access, historical
classification/back-labeling, or automatic model processing.

## Verified foundation

- Firebase end-user authentication and Gmail DWD authorization are separate. DWD acts only as the
  server-verified signed-in `pmikcmetro.com` email; Admin gains no mailbox impersonation.
- The approved scopes remain `gmail.readonly`, `gmail.compose`, `gmail.labels`, and `gmail.modify`.
  Product/action authorization narrows these send-capable technical scopes.
- MIME parsing is bounded, prefers plain text, converts HTML to inert text, and exposes attachment
  metadata only.
- Exact-confirmed linked replies use a short-lived hashed token, exact-payload hash, transaction
  claim, authenticated From, at-most-one attempt, bodyless audit, and no ambiguous retry.
- Authenticated Pub/Sub/history processing is deduplicated and cursor-based. It matches opaque IDs
  only against existing workflow links; it does not fetch unrelated content or invoke AI.
- Firestore Gmail operational collections are server-only and bodyless.

Production Gmail linkage requires the approved 365-day link value in
`GMAIL_WORKFLOW_LINK_TTL_DAYS` plus S24 cleanup/legal-hold implementation. R07 approves the exact
current owner-renewal, tenant-renewal, and maintenance-owner generators as v1.0 base artifacts and the
source-visible human-confirmed AI reply policy; current `governed-artifacts.ts` still returns false, so
reply/initiation paths remain closed until S24 wires the registry and authoritative values.

## Permissions

- Editor: S20 permits read/link, approved labels, governed drafts, and an exact-confirmed linked reply
  when the action, space, workflow context, and approved artifact are enabled. This is Medium
  workflow action authority, not generic compose/send access.
- Approver/Admin: the Editor communication capabilities; Admin additionally approves consequential
  High work and may self-approve with an exact preview and reason.
- Admin: governance/configuration authority with all-risk self-approval; never cross-mailbox access
  outside a separately authorized mailbox connection.
- Vendor (new V1 role): Admin invite + one-time password setup + verified-email TOTP, assigned
  Maintenance tickets only, and the same Gmail/Workspace address through per-vendor OAuth. It never
  receives internal Editor/Admin, DWD, or general inbox access.
- Pub/Sub principal: advance bodyless sync/dedupe state and mark linked attention only; never read
  content, invoke a model, create a task, or send.
- Model: one selected linked thread on explicit request only; output is a proposal, never an action.

## Lease-renewal integration

Owner outreach must originate from a real authorized renewal run and authoritative owner contact.
Owner replies may be read only on the linked run and may yield a proposed owner direction requiring
human confirmation. Tenant email is available only after confirmed owner direction and a verified
tenant recipient. Email never by itself completes portal-chat/SMS outreach, tenant consent, document
buildout, or external writeback.

The current visible renewal desk uses sample/simulation workspaces. Its owner/tenant routes return
unaddressed `preview_only` results, import no Gmail runtime, and explicitly say not to send.

## Maintenance integration

Maintenance-scoped staff may manually link/read an existing owner thread from a ticket they can
access. A linked addition creates value-free in-app attention. On-demand analysis may propose a
summary/waiting party/next action, but current code cannot approve cost, select a vendor, transition
a ticket, or write Rentvine. S22/S26 make an external Vendor's assigned-ticket Gmail workflow a V1
requirement while preserving Vendor/Admin exact confirmation for every AI-assisted send.

The current ticket model does not contain an authoritative owner email. Therefore
`gmail.maintenance_owner_notice.draft_create` is Planned and non-executable. Round 2 selects the
maintenance owner scaffold and requires outbound vendor messaging. R04/R07 now lock the TOTP/per-
vendor OAuth identity and v1.0 artifact/AI policy; S22/S24/S26 implement them and authoritative runtime
recipients before either path may open.

## Source state and governance

Email evidence begins as `Needs Review` with Gmail/workflow provenance. It is not automatically a
Verified Source or authoritative operational fact. Current AI output is transient and unpersisted.
A later confirmed-fact/task/status model requires its own reviewed commit path and must remain inside
PMI KC app state; it cannot directly write an external system of record.

Stored links carry actor/mailbox keys, workflow entity/purpose, Gmail identifiers, approved artifact
references, hashes, status, timestamps, and expiry only. Free-text link/label reasons are hashed for
audit and not retained. S24 retention is confirmation usable 10 minutes/delete 30 days, dedupe 7 days,
sync audit 90 days, link 365 days from last authorized update, bodyless action audit 7 years, and no
persisted V1 AI/extracted Gmail facts, with Admin legal hold/later written policy overriding deletion.
Production link creation remains closed until configured and cleanup/hold are implemented.

## Current implementation dependencies

- Build S20/S22/S24 and the S25/S26 workflow-specific communication actions; current routes remain
  narrower even though the decisions are settled.
- Configure authoritative renewal owner/tenant and maintenance owner/vendor recipient/value adapters;
  a browser-supplied address is never authoritative.
- Separately approve Identity Platform/TOTP, OAuth app/client/redirect/token vault, first Vendor invite/
  consent/read/send, retention TTL/cleanup, registry promotions, deploy, and bounded production proof.
- Josiah owns manual watch/OAuth degraded response; no scheduler is authorized.

## Hard boundaries

- No autonomous send, scheduled send, event-triggered send, model-triggered send, bulk send, or
  retry-on-ambiguity send.
- No automatic Gmail-to-workflow status/task/fact commit.
- No external system-of-record or client Drive write except through the exact S25/S26 action contract
  after it is implemented, tested, registry-reviewed, and explicitly enabled for that live action.
- No raw Gmail/customer content in git, logs, notifications, or persistent Gmail operational state.
- No cross-mailbox browsing or generic inbox management.
- Current runtime has no outbound Vendor communication. S22/S26 may build it locally; live use remains
  separately gated and assigned-ticket/exact-confirmation-only.

The active transport specification is `docs/feature-suites/gmail-live-per-user.md`; S20/S22/S24/S25/
S26 govern its final-V1 authority, Vendor, policy, and workflow execution. S15 remains historical
fallback evidence.
