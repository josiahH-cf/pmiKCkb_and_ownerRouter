<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S272 — Keep one current renewal message per lease, cycle and audience

> Status: AUTHORING READY, intake 150. Outreach integrity. Implementation and verification
> pending.

**Goal.**

A tenant or an owner receives a renewal message only with wording that matches the lease
facts it was authorized on, and an older message can never go out after a newer one.

**Current state / intended end state.**

Verified on the serving source (`7f4cf234`, application code equal to head `878e00f9`):

- A communication sequence is identified by a client-made id. Its lease is
  `context.entityId`, its audience is `context.purpose` and its cycle is the top-level
  `noticeCycleId`, written only when it is authorized (`lib/gmail-hub/sequence-model.ts`,
  lines 144 to 218). Nothing prevents two sequences for one lease, cycle and audience.
- Resume, Send and Schedule on a sequence that already has an authorization write a new
  authorization that pairs the current material source digest with the stored wording.
  The stored wording is never compared with the current lease facts
  (`lib/gmail-hub/sequence-service.ts`, lines 451 to 481, 512, 552 to 562 and 591 to 619).
- The per-cycle tenant claim is taken only by "send with follow-ups". Plain Send and
  Schedule are checked against it but do not take it, it is never released, and owner
  messages have no equivalent (`lib/gmail-hub/sequence-store.ts`, lines 324 to 366).
- The lease page looks up no earlier sequence on the server. It reuses one id only while
  the page stays mounted (`components/lease-renewal/RenewalPreparedMessage.tsx`, lines 521
  and 729 to 767).
- In the guarded rehearsal of November 12 a tenant offer was scheduled, the working end
  date changed, the worker held the message, a new offer was sent from the lease, and one
  click on "Resume reviewed sequence" then released the old one. The stand-in mailbox held
  two offers with different end dates on one thread. See audit finding A-01 in
  [the staff workflow audit](../evidence/staff-workflow-audit-2026-11-12.md).

Intended end state: wording written before a content fact changed cannot be authorized
again unchanged; one lease, cycle and audience holds at most one message with unsent
authorized work; an authorization older than a newer confirmed send cannot dispatch; and
Communications offers only the actions that can succeed, with the reason for the rest.

**Actors and entry conditions.**

A staff member who is the responsible sender, with the existing `sendEmail` capability and
workflow Space access, acts from the lease or from Communications. The communication
worker acts on due work under the stored authorization. Entry requires an existing
renewal sequence; reply sequences and other lanes keep their current rules.

**What it is / how it functions.**

The authorization keeps the content facts it was reviewed on. Every later Resume, Send or
Schedule of that sequence, every new initial message for the same lease, cycle and
audience, and every worker claim checks three rules in the same transaction that writes
the authorization or the claim. A refusal dispatches nothing, writes nothing and names the
fix.

- **R-S272-1 — Keep the reviewed content basis with each authorization.** On Send,
  Schedule, send with follow-ups and Resume, store beside the authorization (as the notice
  cycle and the authorizing operation already are, so the payload and replay binding do
  not change): a digest of the content basis alone, and the labelled values behind it.
  The content basis is the part of the material source digest that feeds the wording
  (`lib/gmail-hub/sequence-dependencies.ts`, lines 176 to 203): the address and approved
  template hash; for a tenant offer the verified lease end, working rent, start and end,
  applicable charges, insurance transition and offer snapshot hash; for an owner message
  the owner intent, current rent, rent to recommend and range. Recipients, notice identity
  and blockers stay in the existing material source digest. This is an app-owned record
  with no provider effect.
- **R-S272-2 — Refuse wording that predates a content change.** On Resume, Send or
  Schedule of a sequence that already has an authorization, refuse when the current
  content basis differs from the stored one and the stored initial and follow-up wording
  are unchanged since that authorization. Compare with the same legacy or current digest
  choice dispatch uses (`lib/gmail-hub/sequence-service.ts`, lines 965 to 968). The
  refusal reads "This message was written before the lease changed. Update it from the
  lease, or cancel it." and lists each changed value, for example "Term end: 12/31/2027
  in this message, 06/30/2027 on the lease." When staff edited or rebuilt the wording
  after that authorization, the existing one-action Update applies (S192 R-S192-3). An
  older authorization with no stored content basis that is paused as "The lease or
  recipient facts changed" is refused the same way, without values.
- **R-S272-3 — Allow one unsent initial message.** When an initial renewal message (not a
  reply) is authorized, refuse while another sequence for the same lease and audience,
  with the same cycle or with no cycle recorded and an open state, holds an authorization
  with unsent work: scheduled and unsent, paused, or with an unconfirmed send. The refusal
  names that communication and its state, for example "A tenant offer for this renewal is
  already scheduled for 11/13/2026, 9:00 AM CST. Open it to update or cancel it.", and
  returns its id for the link. The existing tenant claim (S189 R-S189-8 and R-S189-10)
  keeps its own rule.
- **R-S272-4 — Stop an older authorization after a newer send.** Refuse Resume, Send and
  Schedule on a sequence whose current authorization was granted before another sequence
  for the same lease, cycle and audience recorded a confirmed initial send: "A newer
  message for this renewal was sent on 11/12/2026, 12:23 PM CST. Cancel this one." The
  worker applies the same check before it claims a due occurrence and pauses that
  sequence with a new cause, "A newer message for this renewal was sent". Only "Cancel
  future messages" remains for its unsent work.
- **R-S272-5 — Offer only the actions that can succeed.** In Communications, a sequence
  refused under R-S272-2 shows the reason line, "Update from the lease" and "Cancel future
  messages", and no Resume, Send or Schedule. "Update from the lease" loads the lease's
  current message into this communication's editable draft through the existing
  composition read and sends nothing; the existing one-click Send or Schedule then
  authorizes that exact end state. A sequence refused under R-S272-4 shows the reason
  line, "Open the lease" and "Cancel future messages". Every other state keeps its
  current controls and its one-click actions with no added dialog (S233; S187
  BEH-S187-5). The detail prints the scheduled or held time with its zone, for example
  "Scheduled for 11/13/2026, 9:00 AM CST" (S233 R-S233-6); today it prints "Scheduled".
- **R-S272-6 — Use one typed reason.** The sequences route returns a typed refusal reason
  (wording predates a change, an unsent message exists, a newer message was sent) with
  the related sequence id and changed values. Staff text for the lease and Communications
  derives from that reason in one place beside the existing pause cause labels
  (`lib/gmail-hub/communication-state.ts`).
- **R-S272-7 — Leave unrelated work alone.** Reply sequences, other audiences, other
  cycles, other lanes and drafts with no authorization are unaffected. Two unauthorized
  drafts for one context may still coexist. A staff pause followed by Resume with no
  content change still returns the message to due at once and sends it once.

**In scope / out of scope.**

In scope: the stored content basis, the three refusals at authorization and claim, the
new pause cause, and Communications controls and reason lines. Out of scope: the lease
page's display and its one-step update ([S273](renewal-held-and-outdated-message-visibility.md)),
read settling ([S274](renewal-send-refusal-only-for-real-changes.md)), any new send path,
any confirmation dialog in Communications, and any change to follow-up cadence.

**Open questions & assumptions.**

- Assumption: a second initial message after an earlier one was confirmed sent stays
  allowed, as "Send again" is today. This suite blocks only unsent duplicates and older
  authorizations.
- Assumption: until S274 is implemented, a comparison made on an unsettled lease read
  refuses as it does today. With S274, R-S272-2 runs on the settled read.

**Cross-product impacts.**

Sequence authorization, claim and audit records; the communication worker; the
Communications composer and its Help and control map rows; the sequences route response;
the lease review dialog's refusal text. No Firestore rule, action key or provider scope
changes.

**Authority and evidence map.**

| Input                                                                                                     | Classification                   | Use and limitation                                                                                         |
| --------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AGENTS.md, Permanent safety boundaries                                                                    | Authority                        | Exact source and target checks, one-attempt claims and receipts stay. No new send authority.               |
| S189 R-S189-8 and R-S189-10, S192 R-S192-3 and AC-S192-3, S233 R-S233-3, R-S233-6 and R-S233-7            | Active contracts                 | One initial offer per cycle, one explicit Update after a material change, fresh review before Resume.      |
| `lib/gmail-hub/sequence-service.ts`, `lib/gmail-hub/sequence-store.ts`, `lib/gmail-hub/sequence-model.ts` | Committed implementation (trace) | Present authorization, claim and identity behavior at head `878e00f9`. Re-verify lines before editing.     |
| Staff workflow audit of November 12, 2026, finding A-01                                                   | Intent evidence only             | Observed two offers in the guarded rehearsal. Its proposal to cancel an older message is replaced by S273. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S272-1** — The authorization record carries a content basis digest and its
  labelled values, written in the authorization transaction and absent on older records.
  A store test fails on the starting state because no such field exists.
- **ARCH-S272-2** — The unsent-duplicate and newer-send checks run inside the
  authorization transaction and inside the worker's claim transaction, on stored sequence
  state only. Two concurrent confirmations from two tabs produce exactly one
  authorization.
- **ARCH-S272-3** — One typed refusal reason owns the staff text for the lease and
  Communications. A unit test maps each reason to its text and its available actions.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S272-1** — Schedule a tenant offer, change the working end date, run one worker
  tick (held), then try Resume, Send and Schedule on the held communication. All three
  are refused with both end dates named, and the stand-in mailbox holds no message from
  that sequence. On the starting state Resume succeeds and the next tick sends.
- **BEH-S272-2** — With one tenant offer scheduled, authorizing a second initial offer
  from a new draft is refused and names the scheduled one. After the first is cancelled
  the second proceeds.
- **BEH-S272-3** — With an older paused sequence and a newer confirmed send for the same
  lease, cycle and audience, Resume is refused, the worker never dispatches the older
  one, and the mailbox holds one message.
- **BEH-S272-4** — Schedule, pause by staff and Resume with no content change: the
  message is due at once and one tick sends it once.
- **BEH-S272-5** — The same three refusals hold for an owner message.

**Human litmus outcome.**

### Only the current offer can go out

**If this was built correctly:** A staff member who changes a lease after scheduling an
offer cannot send the old offer by any button. The screen says which fact changed and
offers to update the message or cancel it. The tenant never receives two different offers
for one renewal.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome       | Human litmus                      | Deterministic evidence / falsification                                         |
| --------------------------------------------- | -------------------- | ---------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| R-S272-1 reviewed content basis               | ARCH-S272-1          | BEH-S272-1             | Only the current offer can go out | AC-S272-1. Stored digest and values on a new authorization; absent before.     |
| R-S272-2 refuse wording that predates change  | ARCH-S272-1          | BEH-S272-1, BEH-S272-5 | Only the current offer can go out | AC-S272-1. Three refused actions, named values, zero dispatch.                 |
| R-S272-3 one unsent initial message           | ARCH-S272-2          | BEH-S272-2             | Only the current offer can go out | AC-S272-2. Transaction test with two concurrent confirmations.                 |
| R-S272-4 older authorization after newer send | ARCH-S272-2          | BEH-S272-3             | Only the current offer can go out | AC-S272-3. Refused Resume and a worker claim that pauses with the new cause.   |
| R-S272-5 actions that can succeed             | ARCH-S272-3          | BEH-S272-1, BEH-S272-3 | Only the current offer can go out | AC-S272-5. Rendered controls per state, scheduled time shown, no dialog added. |
| R-S272-6 one typed reason                     | ARCH-S272-3          | BEH-S272-1             | Only the current offer can go out | AC-S272-5. Route payload and text mapping.                                     |
| R-S272-7 unrelated work unchanged             | ARCH-S272-2          | BEH-S272-4             | Only the current offer can go out | AC-S272-4 and AC-S272-6. Pinned tests stay green.                              |

**Preservation set.**

- `tests/browser/one-path-guided-path-driver.mjs`: "Resume preserves the reviewed schedule
  and exact message with no immediate effect" (one click, no dialog, unchanged facts).
- `tests/unit/s265-send-resource-guards.test.ts`: "re-review after a pause freezes the
  current proof and the occurrence then sends".
- `tests/unit/s187-s192-communication-sequence.test.ts`: the exact reviewed revision
  binding, the changed authoritative target hold, the transfer and the stale Resume
  version conflict.
- `tests/firestore/s188-s191-communication-sequences.test.ts`: one initial offer across
  two drafts and two dispatchers, one provider attempt under concurrent workers, and the
  pause ordering around claim.
- `tests/unit/s233-communication-timing-and-labels.test.ts` and
  `tests/unit/s176-residual-instructions.test.tsx` ("Resume requires a fresh review.").

**Adversarial acceptance checks.**

- **AC-S272-1** — Falsify ARCH-S272-1 and BEH-S272-1. For a tenant offer and an owner
  message, change each content basis value in turn (rent, start, end, an applicable
  charge, the approved template) after authorization. Resume, Send and Schedule with
  unchanged wording are refused with that value named and nothing dispatched. A recipient
  or notice-only change is not refused by this rule. Edited wording is authorized through
  the existing Update.
- **AC-S272-2** — Falsify ARCH-S272-2 and BEH-S272-2 against the Firestore emulator.
  Confirm two initial messages for one lease, cycle and audience at the same time: exactly
  one authorization exists. Repeat with the first scheduled, paused and unconfirmed. After
  cancel, the second confirms.
- **AC-S272-3** — Falsify BEH-S272-3. Seed an older paused sequence and a newer confirmed
  send. Resume, Send and Schedule on the older one are refused. Make the older one due and
  race the worker: zero provider attempts, state paused with the new cause.
- **AC-S272-4** — Run the preservation set and BEH-S272-4. A staff pause and Resume with
  unchanged facts sends once.
- **AC-S272-5** — Render the composer for each refusal and each ordinary state. Assert the
  controls, the reason line, the scheduled time with its zone and the absence of any new
  dialog. "Update from the lease" changes the draft only.
- **AC-S272-6** — An authorization with no stored content basis: paused for changed facts
  it is refused without values; paused by staff it resumes as today. A reply sequence and
  two unauthorized drafts are unaffected.

**Forbidden actions / hard gates.**

No customer send as test proof. No new send path, generic send, background or
model-triggered send. No change to `lib/integrations/action-gate.ts`, to any
`production_allowed` value, to `firestore.rules` or to role capabilities. No deletion of
sequence history. If an implementation step appears to need a protected path, stop and
surface it.

**Dependencies / sequencing.**

Standalone on the current sequence engine. S273 consumes the stored values and the typed
reasons. S274 supplies the settled read this suite compares on. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The stored content basis, the three refusals at authorization and
  claim, the new pause cause, Communications controls and reason lines, tests and Help
  rows, reaching `ALL_GATES_GREEN` without S273 or S274.
- **Consumes, but does not assume:** S274's settled read. Without it an unsettled read
  refuses as today.
- **Externally blocked effect:** None. Staff observation of the new reason lines is a
  separate human verdict.
- **Produces for downstream suites:** Stored reviewed values and typed refusal reasons
  for S273 and S274.

**Verification and delivery contract.**

1. Before editing, record the serving and source identities and prove BEH-S272-1 to
   BEH-S272-3 fail for the expected reason on the starting state in the guarded
   rehearsal with the mail stand-in. Record the preservation baseline separately.
2. Run the focused unit and Firestore checks for every ARCH, BEH and AC row. Keep
   preservation results as their own gate.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification on the exact build and follow the current
   release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the cited code and the rehearsal reproduction on the current source.
2. Materialize the failing architecture and behavior checks and the preservation baseline.
3. Add the stored content basis, then the three refusals, then the composer states.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the refusals, the stored basis and the composer states are represented
by verified code, tests and current facts.
