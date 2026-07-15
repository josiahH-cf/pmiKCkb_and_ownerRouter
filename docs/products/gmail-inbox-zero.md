# Workflow Communications Product Lane

> The filename is retained for compatibility. The product is not a general Gmail inbox.

## Working V1 Boundary

Gmail is a workflow communication adapter and evidence source for authorized renewal and
maintenance entities. Gmail owns messages, threads, and native drafts. PMI KC owns bodyless
workflow links, attention, reviewed meaning, exact action confirmation, and audit context.

The app exposes only:

- bodyless attention for a message on an already-linked workflow thread;
- targeted read inside an authorized renewal/maintenance entity;
- approved labels after human review and a governed rule/reason;
- governed unsent drafts and exact-confirmed linked replies;
- explicit, transient, source-visible AI understanding marked `Needs Review`.

It does not expose recent-inbox browsing, arbitrary queries/recipients/compose, delete/archive,
settings/filters, attachment content, cross-mailbox Admin access, back-labeling, or automatic model
processing.

## Identity and Transport

- Staff Firebase authentication and Gmail DWD are separate. DWD acts only as the server-verified
  signed-in `pmikcmetro.com` user; Admin cannot impersonate another mailbox.
- Exact technical scopes are `gmail.readonly`, `gmail.compose`, `gmail.labels`, and `gmail.modify`;
  workflow/role/action authorization narrows them.
- MIME parsing is bounded and inert; attachments are metadata-only.
- Authenticated Pub/Sub/history advances cursor/dedupe state and matches opaque IDs only against
  active links. It fetches no unrelated content and invokes no model.
- Gmail operational Firestore collections are server-only and bodyless.

## Human-Confirmed Effects

Every send/reply is initiated by a permitted human from an authorized workflow. Confirmation binds
actor, mailbox, recipient, thread, exact content, artifact/policy, source context, expiry, and one
attempt. Drift, reuse, concurrency, or ambiguity cannot cause an automatic retry.

No V1 capability sends on a schedule, in bulk, from a model, from a background event, or as an
approval notification. In-app attention is the default notification lane.

## Staff and Vendor

- Editor/Approver/Admin may use enabled workflow actions within role and Space scope.
- Admin manages governance and High decisions but gains no cross-mailbox content authority.
- A Live Vendor uses a separate verified-email/TOTP principal and the same-address OAuth mailbox,
  limited to assigned-ticket threads.
- The canonical Test Vendor uses Firebase password/TOTP but an app-only Firestore mailbox. The Test
  principal is rejected before OAuth/Gmail client construction. Draft, label, and exact-confirmed
  simulated reply receipts say `externalEffect:false` and `liveEvidenceEligible:false`.

## Lease and Maintenance Context

Renewal outreach begins from authoritative run facts and recipient sources. A Gmail receipt does not
claim portal/SMS/document/writeback success.

Maintenance communication begins from a persisted in-scope ticket and authoritative assignment.
AI may propose a summary/waiting party/next action but cannot approve cost, select a Vendor, change
ticket state, or write a provider.

## Retention

Versioned V1 policy uses:

- confirmation: usable 10 minutes, bodyless record deletion at 30 days;
- Pub/Sub dedupe: 7 days;
- sync audit: 90 days;
- workflow link: 365 days from last authorized update;
- bodyless action audit: 7 years;
- no persisted V1 AI output or extracted Gmail facts;
- Admin legal hold overriding deletion.

The production safe default is bounded on-demand cleanup with visible health. Firestore TTL and a
Scheduler job are optional optimizations, not conditions for using the product.

## Provider Activation

Existing configured workflow Gmail actions keep their exact Live activation evidence. New renewal,
maintenance-owner, or Live Vendor communication activates per action only after authoritative
recipient/mailbox values, exact provider identity/scopes, confirmation, one-attempt receipt,
monitoring, and rollback are verified.

Test communications can close application workflow evidence but cannot claim a Live Gmail action.

## Hard Boundaries

- No autonomous send. Every send/reply is an exact, permitted, human-confirmed workflow action.
- No autonomous/scheduled/event/model/bulk send or retry on ambiguity.
- No automatic email-to-workflow fact/status/task commit.
- No raw Gmail/customer content in git, logs, notifications, URLs, or bodyless audit.
- No generic inbox, cross-mailbox browsing, or arbitrary compose.
- No Live external effect outside the exact S20/S22/S24/S25/S26 action contract and preview.

## Acceptance

- Wrong role/Space/mailbox/workflow/recipient/source/confirmation fails before Gmail construction or
  provider claim.
- One exact-confirmed reply produces at most one transport attempt and a bodyless receipt.
- Test Vendor mailbox runs fully without OAuth/Gmail and cannot produce Live evidence.
- Legal hold and bounded cleanup preserve bodyless policy.
- Signed-in desktop/phone surfaces make workflow context and Test/Live state obvious.

Durable supporting contracts: `docs/feature-suites/gmail-live-per-user.md` governs the staff
per-user transport boundary. `docs/legacy/owner-router-artifact-source.md` is historical source
material only and grants no current mailbox or send authority.
