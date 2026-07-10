<!-- spec-shape: overhaul-v1 -->

# S14 — Approval Queue mobile push-button redesign

> New 2026-07-10 (operator note). Owner's #1 target. This suite rebuilds the renewal-flag decision UX
> from a stack of forms into a one-card-at-a-time, push-button, minimal-typing flow that anticipates the
> operator's choice. It reuses the EXISTING resolve + write-back-approve routes and never adds a write
> path. The enabling relaxation (D1, locked 2026-07-10) is encoded verbatim below; it scopes but does
> not remove `Q-PREC-1`.

**Goal.** Today deciding one renewal flag is form-heavy: the run page leads with a 6-metric plumbing
manifest (`components/lease-renewal/LeaseRenewalRunClient.tsx:80-118`), the resolve control is a
Resolution dropdown + a Source dropdown or a corrected-value input + a MANDATORY free-text reason
textarea (`components/lease-renewal/flag-actions.tsx:137-195`), and the Admin write-back approval is a
SECOND mandatory-reason form right under it (`flag-actions.tsx:335-344`). The system already computes
`flag.suggestedWinner` (`lib/lease-renewal/run-view.ts:195-200`) but the operator cannot accept it in
one tap; `ReasonCodeSelect` exists but is optional and stacked ON TOP of the textarea
(`components/lease-renewal/ReasonCodeSelect.tsx:13-30`), so it adds a control instead of removing
typing. After this suite, a reviewer on a phone sees ONE flag card at a time with an N-of-M progress
indicator; for a Low/Medium flag the primary action is a single "Accept suggested source" tap (no
typing), with Reject / Correct / Skip as secondary taps; the plumbing manifest is demoted into a quiet
"Read details" disclosure; a tapped reason code — not free text — is the default governance reason for
Low/Med; and the resolve + write-back-approve double form collapses into one card with a follow-on
one-tap "Approve write-back". High/Blocked flags and any manual override keep the full free-text,
Admin-gated form. The desktop run-page cards, the bulk bar, and every governance invariant are
preserved, never weakened.

**What it is / how it functions.** A new mobile-first decider surface composed over the SAME
server-loaded `RenewalRunView`, mounted as a mode on the two existing authenticated pages (the
simulation run page and the owner-gated live review) so no new data path is introduced. The desktop
`FlagCard` stack (`LeaseRenewalRunClient.tsx:339-433`) and the run-page bulk bar
(`LeaseRenewalRunClient.tsx:188-337`) stay exactly as they are; the decider is an ADDITIONAL surface
over the same `view.groups[].flags` array, so the value-free and act-on-the-run-page sentinels carry
over untouched.

- **Decider shell — `components/lease-renewal/RenewalDecider.tsx` (new).** A pager over the flattened,
  severity-ordered `RenewalFlagView[]` (`lib/lease-renewal/run-view.ts:72-88`). Renders ONE
  `RenewalDeciderCard` at a time with an "N of M" progress label and forward/back controls. Swipe is a
  progressive enhancement; the accessible baseline is buttons. Selection/position is derived on every
  render against the current `view`, mirroring the run-page bulk selection
  (`LeaseRenewalRunClient.tsx:38-53`), so a flag that stops being open drops out.
- **One card — `components/lease-renewal/RenewalDeciderCard.tsx` (new).** Shows the field label,
  severity pill, humanized agreement, candidates, and the `suggestedWinner` line
  (`run-view.ts:195-200`). The 6-metric manifest moves into a `components/ui` `Disclosure summary="Read
details"`, reusing the already-shipped pattern verbatim from
  `components/lease-renewal/LiveRenewalReview.tsx:103-115`.
- **Primary tap — Accept suggested source.** For a Low/Medium flag that has a `suggestedWinner`, one
  button pre-fills and POSTs `{ kind:"pick_source", chosen_source: suggestedWinner.source,
reason_code:"accepted_suggestion" }` to the EXISTING `POST /api/lease-renewal/resolve`
  (`app/api/lease-renewal/resolve/route.ts:15-37`) with NO free-text reason. Reject (`flag_incorrect`),
  Correct (`corrected_value`), and Skip are secondary taps.
- **Reason-code-first entry (D1).** `ReasonCodeSelect` becomes the FIRST-class control, not an add-on
  under the textarea. The free-text textarea appears only on the paths that still require it (see D1
  rule). The taxonomy gains one additive, value-free code `accepted_suggestion` ("Accepted the
  suggested source") in `lib/lease-renewal/reason-codes.ts:10-29`, used as the one-tap default.
- **Collapsed double form + follow-on approve.** When a Low/Med accept queues a write-back, the card
  shows a single follow-on "Approve write-back" button (Admin) that reuses the resolve step's
  reason_code and POSTs to the EXISTING `POST /api/lease-renewal/writeback-approvals`
  (`app/api/lease-renewal/writeback-approvals/route.ts:15-26`) with NO second textarea. The two
  decisions stay DISTINCT records with their own decider + timestamp (`OQ-APPR-1`).
- **Inline one-tap on safe inbox rows — `components/approval/NeedsDecisionInboxPanel.tsx`.** A
  `queue_item` row (the app-plane approval-queue kind, already carrying `itemId`) that is safe
  (Low/Med, status Ready for Approval, an eligible approver, not self-assigned) gets an inline approve
  reusing `components/console/ConsoleApproveButton.tsx:10-56` semantics (PATCH `action:"approve"` to the
  existing route), matching the shipped in-place Console approve (`F-CONSOLE-ACT-IN-PLACE`).
  Renewal-flag and write-back rows stay deep-link-only.
- **Per-user swipe/skip progress — `lib/firestore/renewal-decider-progress.ts` (new).** Mirrors
  `lib/firestore/workflow-run-step-checks.ts:31-124` exactly: collections `renewal_decider_progress` +
  `renewal_decider_progress_activity`, deterministic doc id `${uid}:${run_id}:${source_trigger_key}`,
  gated at the `edit` capability, current-state doc + append-only Activity twin in one transaction.
  Records a per-user "deferred/seen" marker so Skip advances N-of-M without a resolution and the skipped
  card does not re-surface in the session.

- **Buildable now (app-plane).**
  - **B1 — Decider shell + one card.** `RenewalDecider` / `RenewalDeciderCard` over the existing
    `RenewalRunView`; N-of-M progress; the manifest demoted into "Read details". No new route data;
    mounted as a mode on the existing run + live-review pages. (slice 1, 3)
  - **B2 — One-tap Accept suggested source.** Primary Low/Med action posting the pre-filled
    `pick_source` body through the existing `/resolve` route; Reject/Correct/Skip secondary. (slice 2)
  - **B3 — Reason-code-first entry + D1 conditional-reason.** Relax
    `ResolveLeaseRenewalFlagInputSchema.reason` to optional and enforce the D1 requirement in a pure
    `resolutionReasonRequirement` helper; add `accepted_suggestion`; stamp the code label verbatim as
    the persisted reason on the code-only path. (slice 4)
  - **B4 — Collapsed resolve + write-back-approve card.** One card, follow-on one-tap "Approve
    write-back" reusing the resolve reason_code, no second textarea; two decisions stay distinct
    records. Parallel conditional-reason relaxation on `DecideWritebackApprovalInputSchema`. (slice 5)
  - **B5 — Inline one-tap on safe `queue_item` inbox rows.** Value-free `canApproveInline` boolean
    computed upstream in `buildNeedsDecisionInbox`; inline approve only on safe queue rows. (slice 6)
  - **B6 — Per-user skip/progress persistence.** `renewal-decider-progress.ts` + a read-gated
    `POST /api/lease-renewal/decider-progress` write at `edit`; `firestore.rules` client-read-own.
    (slice 7)
- **Gated (owner / vendor).**
  - Any write-back EXECUTION — the actual append to the operating Sheet (`F-WRITE-GATE`,
    `Q-WRITEBACK-METHOD`, `OQ-RV-1`). Approving still only records authorization for the future,
    separately-gated write.
  - Autonomous send of any kind.
  - Relaxing the self-approval bar (`lib/approval/queue.ts:107-109`) or the Admin-for-High resolve gate
    (`lib/firestore/lease-renewal-resolutions.ts:186-194`) — both are owner invariants, unchanged here.
  - Flipping any Action Registry entry to `production_allowed:true`.
  - Deploy (owner-run) and any smoke against the deployed endpoint.

**Open questions & assumptions.**

- _Answered 2026-07-10:_ **D1 (the enabling relaxation).** A tapped `reason_code` SATISFIES the
  mandatory-reason governance requirement for Low/Medium-severity flags; the code's label text is
  stamped verbatim onto the persisted `reason` field of both the resolution record and its append-only
  Activity twin (`lib/firestore/lease-renewal-resolutions.ts:210-247`). Free-text reason stays REQUIRED
  for High/Blocked severity AND for any manual override of the suggested source or value. This scopes
  but does not remove `Q-PREC-1` (reason mandatory + logged; Admin-gated for High).
- _Answered 2026-07-10:_ the D1 free-text-required rule, stated precisely so a builder needs no further
  ruling: free text (non-blank) is required when severity is `High` or `Blocked`; OR `kind` is
  `corrected_value`; OR `kind` is `flag_incorrect`; OR `kind` is `pick_source` with `chosen_source !==
suggestedWinner.source`. Otherwise (Low/Med accept-suggested) a `reason_code` is required instead and
  its label is stamped as the reason.
- _Assumption:_ the one-tap accept default code is a NEW additive taxonomy member `accepted_suggestion`
  (value-free category, safe for the H1 metrics and H3 distillation). Reusing `stale_source` was
  considered and rejected as presumptuous about the losing source.
- _Assumption:_ Skip is a per-user session deferral, NOT a governance decision, so it requires no reason
  (unlike `workflow_run_step_checks`' `Skipped`, which does at `workflow-run-step-checks.ts:58-60`). It
  drives N-of-M and suppresses re-surfacing only.
- _Assumption:_ the mobile decider COEXISTS with the desktop run-page cards (an additional mode over the
  same `RenewalRunView`); it does not replace them, so the act-on-the-run-page and bulk-bar sentinels
  are preserved.
- _Open:_ the gesture affordance (swipe-to-decide vs a button stack). Spec ships buttons as the
  accessible baseline and treats swipe as progressive enhancement; not a blocker, not an owner decision.
- _Client-owned:_ none new. The write-back EXECUTION method stays tracked at `Q-WRITEBACK-METHOD` /
  `OQ-RV-1`; nothing in this suite touches it.

**Cross-product impacts.** New `components/lease-renewal/RenewalDecider.tsx` +
`components/lease-renewal/RenewalDeciderCard.tsx`; edits to
`components/lease-renewal/flag-actions.tsx` (reason-code-first ordering, conditional textarea, follow-on
approve) and `components/lease-renewal/ReasonCodeSelect.tsx` (promote to first-class);
`components/lease-renewal/LeaseRenewalRunClient.tsx` + `components/lease-renewal/LiveRenewalReview.tsx`
(mount the decider mode, reuse the `components/ui` `Disclosure`); `components/approval/NeedsDecisionInboxPanel.tsx`

- `lib/approval/needs-decision-inbox.ts` (value-free `canApproveInline` on safe queue rows);
  `lib/lease-renewal/reason-codes.ts` (additive `accepted_suggestion`); `lib/lease-renewal/run-view.ts`
  (carry `suggestedWinner.source` where the planner needs it) + `lib/firestore/lease-renewal-resolutions.ts`
  (schema + pure `resolutionReasonRequirement` + `ResolvableFlag.suggested_source`); `lib/firestore/lease-renewal-writeback-approvals.ts`
  (parallel conditional-reason relaxation); new `lib/firestore/renewal-decider-progress.ts` + new
  `app/api/lease-renewal/decider-progress/route.ts` + `firestore.rules`; `app/globals.css` (the new
  `.lr-decider*` classes). It reuses the EXISTING `app/api/lease-renewal/resolve/route.ts` and
  `app/api/lease-renewal/writeback-approvals/route.ts` unchanged in contract. **Supersede:** this
  mobile-first approval spec SUPERSEDES the scattered desktop-list approval-queue prose in `docs/plan.md`
  (the "Approval Queue behavior / model" lines) and `docs/product-definition-gap-plan.md` (the
  per-action-approval / list-UX prose); apply the delete-on-supersede when B1 ships (a `docs/facts.md`
  Supersede Log row with a unique marker + point the new fact's `supersedes` at the retired framing). It
  evolves `F-APPROVAL-QUEUE-UNIFIED` and `F-RENEWAL-LIVE-ACTIONABLE`; the `F-RENEWAL-REVIEW-SUBTAB` /
  `F-WRITEBACK-QUEUE` value-free-triage, act-on-the-run-page, and ROW_KEYS invariants carry over and their
  sentinel tests are extended, never weakened.

**Adversarial acceptance checks.**

- **AC-S14-1** — The decider renders exactly ONE flag card at a time: the DOM contains a single
  `.lr-decider-card`, a progress label whose rendered text reads `1 of {M}` for M open flags, and a Next
  control that advances to `2 of {M}`. _Verify:_ `npm test -- renewal-decider`; keep
  `tests/unit/lease-renewal-run-client-bulk.test.tsx` ("run-page bulk write-back decisions") green.
- **AC-S14-2** — For a Low/Medium flag with a `suggestedWinner`, tapping "Accept suggested source" issues
  ONE `POST /api/lease-renewal/resolve` whose JSON body is `{ kind:"pick_source", chosen_source ===
suggestedWinner.source, reason_code:"accepted_suggestion" }` with NO `reason` key, and the request
  resolves 200. _Verify:_ `npm test -- renewal-decider`, `npm test -- lease-renewal-resolutions`.
- **AC-S14-3** — Governance refusal: `POST /api/lease-renewal/resolve` for a High or Blocked flag, OR for
  `kind:"corrected_value"`, OR for a `pick_source` whose `chosen_source !== suggestedWinner.source`, with
  a `reason_code` but a blank/absent free-text `reason`, is refused with HTTP 400 and error text
  containing "A plain-English reason is required." _Verify:_ `npm test -- lease-renewal-resolutions`; keep the
  Admin-for-High resolve test green.
- **AC-S14-4** — Persisted audit: after a Low/Med code-only accept, the resolution record AND its
  append-only Activity twin carry `reason_code:"accepted_suggestion"` and a `reason` equal verbatim to
  the code label "Accepted the suggested source" — no empty reason is ever written. _Verify:_ `npm test
-- lease-renewal-resolutions`, `npm run verify:copy-voice`.
- **AC-S14-5** — The 6-metric plumbing manifest (`tabsRecognized`, `tabsUnrecognized`, `totalRecords`,
  `credentialTabsExcluded`, `credentialScrubHits`, `dividerRowsDropped`) is absent from the card's
  initial visible presentation and available only inside a collapsed `<details>`/Disclosure "Read details", matching
  `LiveRenewalReview.tsx:103-115`. _Verify:_ `npm test -- renewal-decider`.
- **AC-S14-6** — After a Low/Med accept queues a write-back, the card shows a single "Approve write-back"
  button and NO `.lr-approve-form` textarea; tapping it POSTs to `/api/lease-renewal/writeback-approvals`
  reusing the resolve reason*code, and the resolution record and the write-back-approval record persist
  as DISTINCT records, each with its own `decided_by_uid`/`resolved_by_uid` and timestamp (`OQ-APPR-1`).
  \_Verify:* `npm test -- writeback-approval`, `npm test -- renewal-decider`.
- **AC-S14-7** — Skip persistence: tapping "Skip" advances N-of-M WITHOUT any `/resolve` POST and writes
  one `renewal_decider_progress` doc (+ Activity twin) keyed `${uid}:${run_id}:${source_trigger_key}` at
  the `edit` capability; re-mounting the decider in the same session does not re-surface the skipped
  card. _Verify:_ `npm test -- renewal-decider-progress`.
- **AC-S14-8** — Self-approval bar preserved: on the mobile card and on any inline inbox approve, a
  non-Admin whose only claim is their OWN assigned item sees the read-only "An Admin approves the queued
  write-back proposal." message / no inline approve, and `queueActionAvailability` still returns
  `approveReason:"You cannot approve your own assigned item."` _Verify:_ `npm test -- approval-queue`;
  keep `tests/unit/approval-queue.test.ts` ("derives action availability from role, status, and
  ownership") green.
- **AC-S14-9** — Inline one-tap only on SAFE queue rows: a `NeedsDecisionRow` of kind `queue_item` that
  is Low/Med + Ready + approvable + not self-assigned renders an inline approve (PATCH the existing
  `/api/approval-queue/{id}`), while a High-risk or self-assigned or non-`queue_item` row renders NO
  inline approve and only its deep link; the value-free ROW*KEYS pin still holds (the added
  `canApproveInline` is a boolean capability, never a client value). \_Verify:* `npm test --
needs-decision-inbox`, `npm test -- approval-queue-component`; keep
  `tests/unit/needs-decision-inbox.test.ts` ("never leaks a value, reason, decider, or assignee uid, and
  pins the row shape") and `tests/unit/approval-queue-component.test.tsx` ("lands on the value-free
  'Needs your decision' inbox by default") green.

_Verify (whole suite):_ `npm run typecheck`, `npm run lint`, `npm test`, `npm run verify:copy-voice`,
`npm run verify:spec-traceability`, `npm run verify:context-freshness`, and `bash scripts/verify.sh`.
Named sentinels to keep green throughout: `tests/unit/approval-queue.test.ts` (self-approval),
`tests/unit/approval-queue-component.test.tsx` (value-free landing / act-in-place),
`tests/unit/needs-decision-inbox.test.ts` (ROW_KEYS + value-free), `tests/unit/renewal-review.test.ts`
("never leaks candidate or suggested VALUES into the value-free board"),
`tests/unit/lease-renewal-run-client-bulk.test.tsx` (act-on-the-run-page bulk),
`tests/unit/live-renewal-review.test.tsx` (live review actionable), and
`tests/unit/feature-suite-spec-shape.test.mjs` (this spec's shape gate).

**Forbidden actions / hard gates.** App-plane only. The existing Action Registry executable allowlist
stays unchanged; this suite flips no entry. No autonomous send. No system-of-record write (RentVine / Sheet /
QuickBooks / bank / client Drive) — a resolve QUEUES an append-only proposal and an approve RECORDS
authorization; neither executes, and this suite adds NO new write path (it reuses `/resolve` +
`/writeback-approvals` unchanged in contract). No new Google scope. No Cloud Scheduler. No client data
on GitHub (a `reason_code` is a category, never a client value; the new progress records store no
value/field/address). ~$10 budget cap. Deploy stays owner-run. Suite-specific hard stops, a violation of
which is itself a falsification: (a) the self-approval bar (`lib/approval/queue.ts:107-109`) and the
Admin-for-High resolve gate (`lib/firestore/lease-renewal-resolutions.ts:186-194`) are NOT relaxed;
(b) D1's code-only reason path is confined to Low/Med accept-suggested — free text stays required for
High/Blocked and every manual override; (c) inline approve appears ONLY on `queue_item` inbox rows,
never on renewal-flag or write-back rows; (d) no value ever reaches the value-free inbox or its new
boolean.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `LeaseRenewalRunClient.tsx:339-433`, `flag-actions.tsx:42-204` + `:255-384`,
   `run-view.ts:72-88` + `:195-200`, `lease-renewal-resolutions.ts:38-133` + `:186-247`, and
   `LiveRenewalReview.tsx:103-115`; confirm the current mandatory-reason schema
   (`lease-renewal-resolutions.ts:44`, `lease-renewal-writeback-approvals.ts:44`) and the
   `workflow-run-step-checks.ts` persistence pattern.
2. _Build:_ B3 first (pure core) — relax `ResolveLeaseRenewalFlagInputSchema.reason` to optional; add the
   pure `resolutionReasonRequirement(flag, input)` helper enforcing the D1 rule; extend `ResolvableFlag`
   with `suggested_source`; add `accepted_suggestion` to `reason-codes.ts`; stamp the code label as the
   persisted reason on the code-only path. Golden-data-first unit tests for every D1 branch
   (satisfies AC-S14-3, AC-S14-4).
3. _Build:_ B1 + B2 — `RenewalDecider` / `RenewalDeciderCard` over the existing `RenewalRunView`; N-of-M
   progress; manifest demoted into "Read details"; the one-tap Accept + Reject/Correct/Skip taps
   (AC-S14-1, AC-S14-2, AC-S14-5). Mount as a mode on the run + live-review pages without touching their
   data loaders or the desktop `FlagCard`/bulk-bar.
4. _Build:_ B4 — collapse the resolve + write-back-approve double form into one card with the follow-on
   one-tap "Approve write-back" reusing the resolve reason_code; apply the parallel conditional-reason
   relaxation to `DecideWritebackApprovalInputSchema`; keep the two decision records distinct (AC-S14-6).
5. _Build:_ B5 — compute the value-free `canApproveInline` boolean in `buildNeedsDecisionInbox`, extend
   `QUEUE_ROW_KEYS` in the sentinel to add it (extend, never weaken), and render the inline approve only
   on safe `queue_item` rows via `ConsoleApproveButton` semantics (AC-S14-9, AC-S14-8).
6. _Build:_ B6 — `renewal-decider-progress.ts` + `POST /api/lease-renewal/decider-progress` (write at
   `edit`) + `firestore.rules` client-read-own; wire Skip to it (AC-S14-7).
7. _Verify:_ each slice runs `npm run typecheck`, `npm run lint`, `npm test`, `npm run verify:copy-voice`
   - a falsification pass; extend — never weaken — the named sentinels; end-of-suite `bash
scripts/verify.sh`.
8. _Owner:_ hand back for the gated tier — no write-back execution, no self-approval/Admin-gate
   relaxation, no registry flip, deploy owner-run; owner-approved redeploy + a phone walkthrough of the
   decider with Dan's Admin session against the deployed endpoint.
9. _Context update:_ promote the shipped slices to a `docs/facts.md` `F-*` row (e.g.
   `F-RENEWAL-DECIDER-MOBILE`) citing AC-S14-1..AC-S14-9, with `supersedes` pointed at the retired
   desktop-list approval framing; add the Supersede Log row + unique marker for the `docs/plan.md` /
   `docs/product-definition-gap-plan.md` prose (delete-on-supersede at B1); amend `Q-PREC-1`'s Open
   Questions note to record the D1 scoping; and update `docs/loop-state.md` at every slice boundary
   (keep it under its line cap).

**Deletion/merge recommendation.** KEEP this suite as the tracked spec for the owner's #1 target; the
disposable `docs/temp/approval-queue-mobile-plan.md` packet (if authored) stays local-only evidence.
This suite EVOLVES `F-APPROVAL-QUEUE-UNIFIED` and `F-RENEWAL-LIVE-ACTIONABLE` in place rather than
forking them, and it SUPERSEDES the scattered desktop-list approval prose in `docs/plan.md` and
`docs/product-definition-gap-plan.md` (delete-on-supersede at B1). Do not run it as a parallel track to
S13; it builds on S13's shipped shared `flag-actions.tsx`, `NeedsDecisionInboxPanel`, and reason-code
taxonomy.
