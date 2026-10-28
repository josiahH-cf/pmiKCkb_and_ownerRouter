<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-novdec-2026-10-28 -->

# S233 — Renewal message delivery evidence, reply correlation and observation health

> Status: IN PROGRESS (merged to main at bf0c03f9 and a786fa16, later slices on branch claude/renewal-novdec-remainder-20261028; not served) — R-S233-1 (each attempt and incoming message in one evidence vocabulary, naming lease, notice cycle and audience; refused and unconfirmed attempts visible after refresh), R-S233-2 (delivery reports tied to one attempt by In-Reply-To, a quoted or referenced id or the only attempt in the thread, otherwise "attempt not identified"; the screen writes the quoted labels with a comma instead of an em dash, per docs/voice-and-audience.md) are implemented with tests and merged to main at f1f06bfb by PR #162; R-S233-3, R-S233-6, R-S233-7 and R-S233-8 (deterministic adapter variants and an emulator stale-write case) are implemented with tests; R-S233-5 has open-only worker paging and past-due lag but no worker-health summary yet; R-S233-4 shows the incoming-check age without itemized failure reasons; R-S233-9 remains. Originally finalized 2026-10-28 from the November/December renewal Clarify Features initialization (intake 100). It reuses delivered S187–S192/S229 sending unchanged; real customer sends, controlled-recipient receipt and staff-mailbox verification stay BLOCKED on C11/C12.

**Goal.**

For every scheduled or sent renewal message, staff can see what actually happened — accepted by
Gmail, refused, not confirmed, failed delivery, automatic response or a real reply — tied to the
exact attempt, see how fresh the incoming check is, and know that observation failures hold further
sends. Nothing claims delivery or reading that the provider cannot show.

**Current state / intended end state.**

Inspected at `a1c0fe8c` (source read; dated runtime readback only as recorded in `docs/facts.md`):

- Sending is the delivered S187–S192/S229 contract: `app/api/gmail-hub/sequences/route.ts` saves,
  sends, schedules, resumes, reconciles, pauses, cancels and transfers; only Send dispatches
  immediately. Authorizations bind `deliveryPolicyVersion` `renewal-confirmed-delivery/2026-10-20`
  (`lib/gmail-hub/delivery-policy.ts`), `approvedByUid`, `senderEmail`, `payloadHash`,
  `materialSourceHash` (lease id, channel, to/cc, notice basis, rent, lease end, owner terms,
  charges, form/flyer URLs), one verified "to" address, attachments with `sha256`, signature and
  schedule (`lib/gmail-hub/sequence-model.ts`). Send is one exact click with no extra dialog by
  design (S184/S187); the composer states "Review the recipients, message and attachments before
  Send or Schedule. Replies and failed delivery pause follow-ups; Resume requires a fresh review."
- Sequence states are `draft | active | paused | cancelled | completed | needs_reconciliation`;
  occurrences are `claimed | sent | ambiguous | refused`. "Sent" means Gmail accepted the message
  and a readback found it under SENT by its RFC Message-ID `<pmi-{occurrenceId}@pmikcmetro.com>`;
  `gmailMessageId`, `gmailThreadId` and `sentAtMs` are stored (`lib/gmail-hub/sequence-store.ts`,
  `lib/gmail-hub/sequence-service.ts`). Timeouts, 408/429/5xx and missing readback become ambiguous;
  "Check admitted send" reconciles without resending.
- Inbound classification (`lib/gmail-hub/inbound-classification.ts`) is `human | auto_reply |
bounce | uncertain`; bounce pauses with `bounce`, human with `reply`, uncertain (including an
  address not on the approved To/Cc) with `source_unavailable`; auto-replies are recorded and do not
  pause. Messages before `approvedAtMs` and already-seen ids are skipped. Observation is polling of
  exact linked threads (`getThread`) on each worker visit, twice at dispatch, at Resume and on
  "Refresh linked incoming"; no push watch is registered (the watch route returns 410).
- Gaps found: there is no "received" evidence and a bounce is not tied to a specific attempt;
  refusals default to pause cause `source_unavailable`, so refused, unexpected-sender and outage all
  read "source unavailable"; staff never see refused attempts or attempt reasons; the composer's
  "Incoming evidence is unavailable." shows no age or reason; a mailbox sync failure skips every
  sequence of that staff member for the run without per-sequence visibility.
- The worker (`lib/gmail-hub/sequence-worker.ts`, minute scheduler, 180 s lease) reads 20 records
  per run (max 50) in document-id order and wraps, with no due-time selection, so completed and
  cancelled records lengthen every rotation; run counts (`inspected, observed, sent, held,
failures`) are written only to the lock document. Staff see no lag or freshness.
- `lib/gmail-hub/schedule-calendar.ts` resolves named-zone wall times with `none | gap_forward |
earlier_overlap` (tests prove 2026-11-01 01:30 Central resolves to 06:30Z, the earlier instant),
  but the composer defaults "Timezone" to the browser zone (`components/gmail-hub/CommunicationComposer.tsx`),
  the hub's "Next:" uses browser local time, and the adjustment is never shown.
- Resume re-reviews sender, recipients, source facts, draft hash and a fresh observation and writes a
  new authorization revision; because pauses clear `nextDueAtMs`, the resumed message goes out on the
  next worker run, which the screen does not disclose.
- `tests/browser/operations-communications-browser.mjs` is not wired into a package script and still
  exercises the retired maintenance journey. Missing unit coverage: mailer-daemon/empty Return-Path
  bounce, unexpected-sender pause, reply-before-authorization skip, stale observation write guard,
  reply arriving during Resume.

Intended: the same sending contract with a per-message evidence vocabulary, attempt-correlated
bounces, distinct pause causes, visible observation age and failure reasons, a bounded worker visit
interval with visible health and lag, Central-default scheduling with named-zone display and DST
notes, disclosed Resume timing, and complete variant/browser coverage.

**Actors and entry conditions.**

Renewal staff with `sendEmail` (Editor, Approver, Admin on `pmikcmetro.com`, not a verification
account) acting as the responsible sender for their own mailbox; the managed worker identity;
recipients only from current verified source rosters. Entry for a real send additionally needs the
sender's own mailbox profile to match through the approved delegation (C12) and the owner's exact
scope for a real case (C11). Engineering never sends to a customer.

**What it is / how it functions.**

- **R-S233-1 — Per-message evidence vocabulary.** Each message and attempt shows exactly one of:
  "Accepted by Gmail {time}" (sent occurrence with message, thread and RFC ids), "Failed delivery
  {time}" (correlated bounce), "Reply received {time}" (human reply), "Automatic response {time}",
  "Not confirmed — checking" (ambiguous), or "Not sent: {plain reason}" (refused). "Delivered" and
  "Read" are never shown. Each message names its lease, renewal cycle (from the notice scope) and
  audience. Refused and ambiguous attempts and their reasons are visible after refresh.
- **R-S233-2 — Attempt-correlated bounces.** A bounce (delivery-status report, or mailer-daemon /
  postmaster with empty Return-Path) is tied to the attempt whose RFC Message-ID or linked thread it
  references; when no attempt can be identified it reads "Failed delivery — attempt not identified".
  The `bounce` pause is unchanged.
- **R-S233-3 — Distinct pause causes.** Provider refusal, lease source or recipient facts unreadable,
  a message from an address not on the conversation, and incoming evidence unavailable are separate
  causes with separate plain labels; each still requires a fresh review before Resume.
- **R-S233-4 — Observation freshness and failure.** Each sequence shows "Incoming checked {age} ago";
  when unavailable it shows since when and why (read failure, thread over the 50-message or
  100,000-character bound, mailbox sync failure) and that dependent sends are held. A mailbox sync
  failure marks each affected sequence "not checked this run".
- **R-S233-5 — Bounded visits and visible worker health.** Every active, awaiting or paused-for-review
  sequence is visited within an interval that does not grow with completed or cancelled records,
  using existing Firestore query/index primitives. The last run time, run counts, oldest past-due
  unsent lag and oldest observation age are readable on the communications hub and by the read-only
  assurance; a past-due unsent message shows "Due {time}; not yet sent" with its actual lag.
- **R-S233-6 — Central scheduling and named-zone display.** "Timezone" defaults to America/Chicago;
  every due or sent instant shows its zone; the hub's "Next:" uses the sequence's zone; when the wall
  time is a repeated or skipped hour the panel states the adjustment before "Schedule messages"
  (for example, November 1, 2026 1:30 AM is the first 1:30, CDT).
- **R-S233-7 — Disclosed Resume timing.** Before "Resume reviewed sequence" the screen states when the
  next message will go (the next worker run when the pause cleared its due time), the remaining send
  limit and end date, and points to editing and "Schedule" for a different time. Replay protection is
  unchanged.
- **R-S233-8 — Variant coverage.** Deterministic tests cover the mailer-daemon bounce, unexpected
  sender, reply before authorization, stale observation write, reply during Resume (conflict),
  duplicate message ids and out-of-order internal dates.
- **R-S233-9 — Served browser check.** Replace the stale maintenance journey with an effect-refused
  served check of the renewal composer and hub (save, Schedule panel with Central default and DST
  note, refusal under the local effect-refused descriptor, labels after refresh), runnable from an
  existing package script.

**In scope / out of scope.**

In scope: evidence projection, bounce correlation, pause-cause split, freshness and worker-health
display, bounded selection, timezone default and display, Resume disclosure, tests and browser
check. Out of scope: a push watch or Pub/Sub registration, any new send capability, generic or bulk
sends, read receipts or tracking pixels, a confirmation dialog for Send, new mailbox grants or
scopes, model-triggered sends, changes to authorization binding or replay protection.

**Open questions & assumptions.**

- No product decision blocks this slice. "Received" is only evidenced by a reply, an automatic
  response or a permitted controlled-recipient observation; production recipient inboxes are never
  observed.
- Staff mailbox readiness for Bailey/Chasity as senders is unverified (Oct 27 verified only the
  integrations profile); C12 in `docs/open-blockers.md` holds only their real sends.
- Assumption (labeled): current volume is the 374-lease portfolio's renewal sequences; the visit
  bound is proved against a fixture at least ten times that sequence count including terminal
  records.

**Cross-product impacts.**

`lib/gmail-hub/sequence-service.ts`, `lib/gmail-hub/sequence-store.ts`, `lib/gmail-hub/sequence-worker.ts`,
`lib/gmail-hub/sequence-model.ts`, `lib/gmail-hub/inbound-classification.ts`,
`lib/gmail-hub/communication-state.ts`, `lib/gmail-hub/schedule-calendar.ts`,
`components/gmail-hub/CommunicationComposer.tsx`, `components/gmail-hub/WorkflowCommunicationsHub.tsx`,
`app/api/gmail-hub/sequence-worker/route.ts`, `firestore.indexes.json`, read-only release assurance,
S232 notice evidence, S234 approval evidence links, the operator guide.

**Authority and evidence map.**

| Input                                                             | Classification       | Use and limitation                                                                                  |
| ----------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md` permanent boundaries, D-SOURCE-OF-TRUTH-UPDATES, S229 | Authority            | Exact staff-confirmed renewal Send/Schedule/Resume only; no generic, bulk or model-triggered sends. |
| Committed code/tests at `a1c0fe8c`                                | Implementation truth | Present states, classification, worker and gaps above.                                              |
| `docs/facts.md` October 27 seam readback                          | Dated runtime        | Worker 60/60 HTTP 200 and integrations profile only; not delivery, staff mailbox or reply proof.    |
| 2026-10-28 Clarify Features initialization (Obsidian inbox)       | Intent evidence      | Accepted/received/bounced/failed/unknown distinctions, freshness, backlog and resume truthfulness.  |
| Real case, recipients and sender mailbox (C11, C12)               | External dependency  | Hold only real sends and receipt proof; deterministic fixtures prove the code.                      |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S233-1** — A per-occurrence evidence projection derives the six displayed outcomes from
  occurrence records and correlated inbound evidence and has no delivered/read state. Fail-first:
  refused/ambiguous attempts are not projected and bounces carry no attempt id.
- **ARCH-S233-2** — Bounce correlation by RFC Message-ID or linked thread and a split pause-cause
  taxonomy (refused, source unavailable, unexpected sender, observation unavailable). Fail-first:
  refusals and unexpected senders both persist `source_unavailable`.
- **ARCH-S233-3** — Worker selection reads only sequences that can act or be observed, within a
  bounded interval independent of terminal records, and persists a readable health record with
  lag and observation age. Fail-first: a fixture with many terminal records delays an active
  sequence's visit past the bound.
- **ARCH-S233-4** — Schedule input defaults to the business zone, and every displayed instant is
  formatted in the sequence's named zone with the resolver's adjustment. Fail-first: browser zone
  default and browser-local "Next:".

**Behavior outcome (deterministic, fail-first).**

- **BEH-S233-1** — After a fixture send the message reads "Accepted by Gmail {time} CT"; a later DSN
  marks that message "Failed delivery"; a human reply reads "Reply received" and pauses follow-ups.
- **BEH-S233-2** — A refusal, an unexpected sender and a source outage read three different causes;
  each Resume requires review.
- **BEH-S233-3** — With observation unavailable the composer shows its age and reason and no send
  dispatches.
- **BEH-S233-4** — The hub shows the worker's last run, counts and any past-due lag; an active
  sequence is visited within the bound despite thousands of terminal records.
- **BEH-S233-5** — Scheduling November 1, 2026 1:30 AM shows the earlier-overlap note and a Central
  default; Resume shows when the next message will go.

**Human litmus outcome.**

### Staff can tell whether each renewal message went out and what came back

**If this was built correctly:** After scheduling or sending, a staff member can see whether Gmail
accepted each message, whether it bounced, whether a person or an auto-responder answered, and when
the inbox was last checked. If checking failed or a send was refused, they see why, that nothing
further will go out, and what Resume will do and when.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                        | Architecture outcome | Behavior outcome | Human litmus                                                            | Deterministic evidence / falsification                                                                                           |
| ---------------------------------- | -------------------- | ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| R-S233-1 evidence vocabulary       | ARCH-S233-1          | BEH-S233-1       | Staff can tell whether each renewal message went out and what came back | Extend `tests/unit/s193-communication-status.test.ts`: six outcomes; never "Delivered"/"Read"; refused/ambiguous visible.        |
| R-S233-2 correlated bounces        | ARCH-S233-2          | BEH-S233-1       | Staff can tell whether each renewal message went out and what came back | Extend `tests/unit/s187-s192-communication-sequence.test.ts`: DSN and mailer-daemon variants map to the right attempt.           |
| R-S233-3 distinct pause causes     | ARCH-S233-2          | BEH-S233-2       | Staff can tell whether each renewal message went out and what came back | Extend `tests/unit/s187-s192-communication-sequence.test.ts`: refusal, unexpected sender, outage persist distinct causes.        |
| R-S233-4 freshness and failure     | ARCH-S233-1          | BEH-S233-3       | Staff can tell whether each renewal message went out and what came back | Extend `tests/unit/s187-communication-composer.test.tsx`: age, reason and held state; per-sequence "not checked this run".       |
| R-S233-5 bounded visits and health | ARCH-S233-3          | BEH-S233-4       | Staff can tell whether each renewal message went out and what came back | Extend `tests/firestore/s188-s191-communication-sequences.test.ts`: visit bound with terminal records; health record readback.   |
| R-S233-6 Central scheduling        | ARCH-S233-4          | BEH-S233-5       | Staff can tell whether each renewal message went out and what came back | Extend `tests/unit/s189-s192-schedule-calendar.test.ts` and the composer test: default zone, labels, overlap/gap notes.          |
| R-S233-7 disclosed Resume timing   | ARCH-S233-4          | BEH-S233-5       | Staff can tell whether each renewal message went out and what came back | Extend `tests/firestore/s193-communication-journeys.test.ts`: Resume shows next instant; no replay of the old attempt.           |
| R-S233-8 variant coverage          | ARCH-S233-2          | BEH-S233-2       | Staff can tell whether each renewal message went out and what came back | New cases in the sequence tests for each listed variant; each fails against a seeded regression.                                 |
| R-S233-9 served browser check      | ARCH-S233-4          | BEH-S233-5       | Staff can tell whether each renewal message went out and what came back | Replace `tests/browser/operations-communications-browser.mjs` with a wired effect-refused renewal check; zero mutation attempts. |

**Preservation set.**

`tests/unit/s186-s192-communication-routes.test.ts` (one immediate dispatch, worker authentication),
`tests/unit/s190-worker-readiness-route.test.ts`, `tests/unit/s190-worker-assurance.test.mjs`,
`tests/firestore/s188-s191-communication-sequences.test.ts` (one Gmail call under concurrent
workers, lease fencing), `tests/unit/s187-s192-communication-sequence.test.ts` (send once with
readback across restart, ambiguous 504 hold and own-receipt settle, sender transfer),
`tests/firestore/s193-communication-journeys.test.ts` (reply governs the follow-up, ambiguity
survives restart), legacy-authorization and retired-maintenance refusals, the
`renewal-confirmed-delivery/2026-10-20` policy binding, and the canonical gate.

**Adversarial acceptance checks.**

- **AC-S233-1** — No state, label or API field shown to staff says delivered or read; an accepted
  message with no reply reads only "Accepted by Gmail" (ARCH-S233-1, BEH-S233-1).
- **AC-S233-2** — Two sends then one DSN referencing the second's RFC Message-ID marks only the
  second as "Failed delivery" and pauses; an unidentifiable DSN reads "attempt not identified"
  (ARCH-S233-2, BEH-S233-1).
- **AC-S233-3** — Refusal, unexpected sender and source outage produce three distinct persisted
  causes and labels; none dispatches and each Resume demands a fresh review (ARCH-S233-2,
  BEH-S233-2).
- **AC-S233-4** — Observation unavailable or a mailbox sync failure holds every dependent send and
  shows age and reason; a stale observation result never overwrites a newer one (ARCH-S233-1,
  BEH-S233-3).
- **AC-S233-5** — With 4,000 terminal fixture records, an active sequence due now is visited and
  sent within the declared bound, exactly once under concurrent workers (ARCH-S233-3, BEH-S233-4).
- **AC-S233-6** — November 1, 2026 1:30 AM Central schedules 06:30Z with the overlap note; a browser
  set to another zone still defaults to America/Chicago; displayed instants name their zone
  (ARCH-S233-4, BEH-S233-5).
- **AC-S233-7** — The served browser check runs with zero mutation attempts and no provider call
  (preservation of the effect-refused descriptor).

**Forbidden actions / hard gates.**

No customer or test send from engineering, no Gmail draft or message in a live mailbox for proof,
no push watch, new scope, grant or mailbox access, no generic `gmail.message.send`, no change to the
delivery-policy binding or replay protection, no customer content in Git or logs.

**Dependencies / sequencing.**

Consumes S187–S192/S229 sending, S188 ownership/transfer and the Gmail runtime. Produces sent and
reply evidence consumed by S232 (notice timing), S234 (approval evidence link) and S238 (acceptance
rows). Independently buildable.

**Standalone delivery contract.**

- **Deliverable now:** R-S233-1 to R-S233-9 with fixtures, tests, browser check and operator-guide
  wording.
- **Consumes, but does not assume:** real staff mailbox readiness (unset → staff sees the existing
  sender refusal); scheduler health (absent run → health shows no recent run).
- **Externally blocked effect:** a genuine renewal send, controlled-recipient receipt and real reply
  handling need the owner's exact scope and permitted recipients (C11, C12) — `BLOCKED` until then.
- **Produces for downstream suites:** per-attempt evidence ids and outcomes, observation age and
  worker health.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH/BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets, PII, keys, runtime
   configuration and diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only for
   the named live effect after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code, worker readiness GET and assurance read-only.
2. Materialize the ARCH/BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the projection, correlation, causes, freshness, bounded selection, zone display and Resume
   disclosure.
4. Falsify, run focused and canonical tests, update the operator guide, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S187–S192
and S229 history unchanged.
