<!-- spec-shape: overhaul-v1 -->

# S24 — Workflow Communications retention, artifacts, and AI replies

> New 2026-07-14. Implements R06/R07 and closes the remaining S19 promotion-policy questions.

**Status: Local green — 2026-07-14.** AC-S24-1 through AC-S24-8 are implemented and verified locally.
Live Firestore TTL/scheduler activation, authoritative S25/S26 recipient/value mapping, any Gmail read/
send, Registry promotion, deployment, and production acceptance remain separately gated.

**Goal.** Workflow Communications has explicit deletion/hold behavior, three reviewable versioned V1
base artifacts, and a source-visible AI reply policy that can improve a draft without inventing facts or
commitments. Every outbound message remains a human-reviewed exact payload and every retained record is
bodyless unless Gmail is queried on demand through an authorized workflow link.

**What it is / how it functions.**

- **Retention policy `v1.0`.** Confirmation is usable for 10 minutes and its bodyless record is deleted
  after 30 days; Pub/Sub dedupe state after 7 days; sync audit after 90 days; workflow link 365 days
  after create/last authorized update; bodyless send/write/workflow audit after 7 years. AI output and
  extracted Gmail facts are not persisted in V1. `legal_hold=true` clears deletion eligibility until an
  Admin releases the hold under a later written policy.
- **Deletion engine.** Every expiring record has server-set `expires_at`, policy version, and hold state.
  A pure cleanup planner plus idempotent worker deletes only eligible IDs and writes counts-only audit.
  Confirmation usability and record retention are separate fields. Live Firestore TTL/scheduler setup
  is a deployment gate; tests use a fake clock/worker.
- **Versioned base artifacts.** Register exact current generator behavior as `owner-renewal:v1.0`,
  `tenant-renewal:v1.0`, and `maintenance-owner:v1.0`, with immutable content hash, source path,
  purpose, allowed context, required values, and owner approval date. Existing wording is the approved
  base; a generated instance cannot send until authoritative recipient/mailbox and required values are
  resolved.
- **Value replacement and channel truth.** Deterministic replacement uses authorized Rentvine/owner/
  ticket/workflow values. Missing values remain `Needs Verification` and Blocked. Tenant text's “also
  emailed and messaged” line may use the exact v1.0 wording only after both channel receipts exist;
  otherwise the reviewed instance must rewrite that line to the true channel state.
- **AI reply policy `workflow-reply:v1.0`.** On explicit request, AI may free-draft from the authorized
  assigned workflow thread plus approved workflow facts and artifact. UI shows source context and a
  diff from the base/current text. It cannot add an unsupported amount, date, recipient, legal position,
  promise, vendor choice, approval, completion claim, or channel-success claim. Excluded categories
  still refuse before model construction. Output is transient until the human exact-confirms the send.
- **Exact confirmation.** Actor sees From/To/thread/subject/body/artifact/policy/source context and
  confirms the exact hash. Any edit/source/recipient/policy drift invalidates confirmation. S20 controls
  internal role/risk; S22 controls Vendor/Admin assigned-ticket confirmation.
- **Buildable now (app-plane).** Policy registry, schemas, hashes, cleanup planner/fake worker, legal
  hold state, artifact registry, deterministic rendering, AI guard/diff/provenance, and tests.
- **Gated (owner / vendor).** Firestore TTL/scheduler/deploy, real recipient/source reads, live Gmail,
  and first template/reply sends.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ all listed retention defaults are approved; legal hold and later written
  policy override deletion.
- _Answered 2026-07-14:_ all three current scaffolds are approved as written and versioned v1.0; AI
  rewrites/additional edits may use verified value replacements under the approved reply policy.
- _Answered 2026-07-14:_ AI may free-draft only from authorized assigned context, show sources, invent
  no facts/commitments, and every send is human-reviewed/exact-confirmed.
- _Assumption:_ legal hold is Admin-only, requires reason/case reference, is append-only audited, and
  stores no case narrative or message content.
- _Assumption:_ authoritative recipients are resolved at runtime from the selected workflow's approved
  source adapter; a browser address is never authoritative. Per-system mapping is delivered in S25/S26.
- _Client-owned:_ a later written legal policy may replace periods; until then `v1.0` is operative.

**Cross-product impacts.** Evolves S19 Gmail state/service/artifacts, S22 vendor Gmail, S25/S26 message
initiation, Firestore schemas/rules/indexes/TTL handoff, template generators, AI safety, redaction, and
Admin policy UI. Supersede markers: `GMAIL-RETENTION-OPEN` and `WORKFLOW-TEMPLATES-UNAPPROVED`.

**Adversarial acceptance checks.**

- **AC-S24-1** — Fake-clock cleanup selects confirmation 30d, dedupe 7d, sync 90d, link 365d-from-last-
  update, and audit 7y exactly; 10m confirmation usability expires independently. _Verify:_ `npm test --
communications-retention`.
- **AC-S24-2** — Held records are never selected by TTL/worker; hold/release is Admin-only, reasoned,
  audited, and idempotent. Release recomputes expiry from policy without restoring deleted data.
  _Verify:_ `npm test -- communications-legal-hold`; `npm run test:firestore`.
- **AC-S24-3** — The registry exposes exactly three immutable `v1.0` base artifact hashes matching the
  current generator behavior; unknown/modified/unversioned artifacts fail closed. _Verify:_ `npm test --
governed-artifacts owner-draft tenant-draft owner-notice-draft`.
- **AC-S24-4** — Missing recipient/mailbox/required value or a `Needs Verification` send field is
  Blocked before confirmation/provider construction. Tenant cross-channel success copy is used only
  with corresponding receipts. _Verify:_ `npm test -- workflow-artifact-rendering`.
- **AC-S24-5** — AI receives only authorized thread/context and produces transient source-visible
  proposal/diff; excluded or unsupported fact/commitment output is refused or replaced with `Needs
Verification`, with zero persistence/provider mutation. _Verify:_ `npm test -- workflow-ai-reply`.
- **AC-S24-6** — Exact confirmation invalidates on actor/mailbox/recipient/thread/body/artifact/policy/
  source drift and makes at most one attempt; audit stores hashes/IDs/status only. _Verify:_ `npm test --
gmail-hub-service vendor-gmail-send`; `npm run verify:redaction`.
- **AC-S24-7** — No AI output, extracted body/fact, prompt, MIME, or attachment content appears in
  Firestore/log/notification/audit snapshots. _Verify:_ `npm run verify:redaction`; `npm run
test:firestore`.
- **AC-S24-8** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run verify:spec-traceability`, `npm run build`.

**Forbidden actions / hard gates.** No autonomous/event/scheduled/bulk send; no persist-AI-by-default;
no browser-authoritative recipient; no invented fact/commitment/channel receipt; no legal-hold bypass;
no live TTL/scheduler/policy deployment, Gmail read/send, source read, or production smoke. No raw content
in retention/audit records or git. Existing no-model exclusions remain. ~$10 cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory all Gmail state collections/timestamps, confirmation flow, artifact generators,
   AI safety, rules, TTL config, and redaction tests.
2. _Build:_ encode retention policy `v1.0`, fake-clock eligibility, legal hold, cleanup planner/worker
   interface, and counts-only audit.
3. _Build:_ register exact three base generator versions/hashes and required runtime recipient/value
   checks; keep sample/test artifacts non-production.
4. _Build:_ add `workflow-reply:v1.0` authorized-context builder, source panel, diff, unsupported-claim
   validator, transient output, and exact-hash confirmation.
5. _Verify:_ falsify every expiry boundary, hold race, template drift, missing value, false channel claim,
   excluded category, hallucinated commitment, confirmation drift, and storage leak; run full checks.
6. _Gate:_ stop before live TTL/scheduler, source/Gmail access, send, deploy; issue separate approval
   packets for configuration and each first action.
7. _Context update:_ add `F-COMMUNICATIONS-POLICY-BUILT` citing AC-S24-1..8 and update environment,
   facts/status/plan/loop.

**Deletion/merge recommendation.** KEEP as the policy/versioning spec. MERGE shipped Gmail mechanics
into S19 and Vendor mechanics into S22 without deleting the v1.0 policy history.
