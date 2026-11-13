<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S281 — Put the deciding facts first, land every jump, and keep the work on a narrow screen

> Status: AUTHORING READY, intake 159. Working screen. Revised on November 12, 2026 to
> carry four layout changes by owner direction. Implementation and verification pending.

**Goal.**

On each renewal step staff see the facts for the decision before the action and edit
them where they stand, the message and the other ways to send sit in named groups, every
jump lands on its control with a way back, the address names the step shown, a sent
message reads as sent, and the work fits a phone-width screen. No authority or policy
changes, and each field keeps one editor.

**Current state / intended end state.**

Verified by a read-only trace of the serving source. Pixel figures are the audit's
measurements at 1440 by 900 and 390 by 844 and were not re-measured by the trace.

- One component renders every Guided step (`components/lease-renewal/RenewalGuidedView.tsx`,
  lines 1218 to 2067). On Ask the owner the order is: heading, cue, primary button, next
  step line; "Reason to include", the readiness list and the message; Schedule, "Create
  Gmail draft instead", Copy and "Open in Communications"; and only then the facts block
  with the current base rent and the read-only Rent to recommend with its edit link
  (`components/lease-renewal/RenewalWorkspace.tsx`, lines 849 to 860).
- The review dialog's order is title, From, To and Cc, subject, the full body, a line
  "Lease {id} · Cycle {id}", the follow-up option and the schedule fields, then the
  buttons (`components/lease-renewal/RenewalPreparedMessage.tsx`, lines 1331 to 1511). The
  whole dialog scrolls and its action row is not fixed (`app/globals.css`, lines 4214 to
  4218; `styles/interactions.css`, lines 273 to 279).
- One helper performs jumps (`components/lease-renewal/RenewalDashboardNavigation.tsx`,
  lines 413 to 488). The scroll margin protects the focused control, not the label above
  it (`app/globals.css`, lines 2326 to 2331). Only a cross-outcome priority lead records
  an origin, and its return restores the step and focuses the primary
  (`components/lease-renewal/RenewalGuidedView.tsx`, lines 866 to 881). "Return to tenant
  offer" lands on an element that is absent when no value is still marked
  (`components/lease-renewal/RenewalDateProposal.tsx`, lines 71 to 112).
- "Send the renewal information form", "Prepare the required documents" and "Deliver the
  required documents" send and prepare nothing. Each focuses a status select inside a
  closed group far below (`components/lease-renewal/RenewalManualWorkspace.tsx`, lines 897
  to 1086). On Documents the packet tools sit in the Document preparation card that the
  button skips (`components/lease-renewal/RenewalWorkspace.tsx`, lines 1845 to 1913).
- After a confirmed send the primary and the delivery actions are removed, while "Reason
  to include", the readiness list and the full message still render. "Send again" stays
  and is pinned.
- Opening "Compose … message in Communications" creates a draft communication after 650
  ms with no input, with a new id on each open
  (`components/gmail-hub/CommunicationComposer.tsx`, lines 336 to 352 and 448 to 464).
- At phone width the app header is a wrapping row with search forced onto its own row
  (`components/layout/AppShell.tsx`, lines 52 to 77); the audit measured 310 px. The lease
  toolbar is sticky and holds the identity paragraph with one copy button per tenant, the
  RentVine link, the view and panel buttons, Work status and the stage header
  (`components/lease-renewal/RenewalWorkspaceSidebars.tsx`, lines 229 to 286); the audit
  measured 448 px on a five-tenant lease. The monthly table has a minimum width of 54 rem
  inside its scroll region (`app/globals.css`, lines 3020 to 3031), with the Prepare
  button and filters above it; the audit measured the first lease row at 1,672 px.

Four pinned rules held four of the audit's layout proposals: S247 R-S247-14 and S269
gave Rent to recommend one editor that only Compare market rent could show; S270 fixed
one named Work group per outcome; the Guided view tests pinned the address unchanged
when the step advances; and the Working renewal terms editor opened only in Ask the
owner. The owner's November 12, 2026 direction retires those four pins. S247, S269 and
S270 are amended in place and name this suite. What stays: one editor and one save path
per field, S165's contained table scrolling, sticky shared lease header and phone pass
that hides no control, and S246 R-S246-7's one accessible monthly table.

Intended end state: facts lead on Ask the owner and Rent to recommend is edited there in
place; the message and the other ways to send are named groups; the renewal dates open
in place on the Offer step; the address names the step shown; the dialog keeps its
decision and its buttons in view; a sent step shows the send; a manual record is a
control in view; jumps land and return; opening the composer writes nothing; and at
phone width the header, the pinned toolbar and the table leave room for the work.

**Actors and entry conditions.**

Renewal staff use Guided and Full views at desktop and phone widths, in both themes, with
keyboard and pointer. Entry requires only existing access.

**What it is / how it functions.**

- **R-S281-1 — Lead Ask the owner with its facts.** In Guided Work and the matching Full
  section the order is: outcome heading and cue; one facts line (Current base rent with
  its basis, the market range with comparable count and date, Rent to recommend with its
  basis and "Edit"); the recipients line; the primary action; then the named groups of
  R-S281-12. The facts block stays in Work above the named groups.
- **R-S281-2 — Keep the decision and the buttons in view in the review dialog.** The
  dialog shows, in order: title; From, To and Cc; subject; the amounts and dates the
  message states; the schedule date and time and the follow-up option when the mode has
  them; then the message body in its own scroll area. The action row stays visible at
  1280 by 800 and at 390 by 844. The lease and cycle read in staff terms ("101 Sample
  Pl, renewal for the lease ending 12/31/2026"); the internal ids are available in the
  step's Verification disclosure. Everything S270 requires in exact review stays visible
  without opening a disclosure.
- **R-S281-3 — Show a sent step as sent.** After a confirmed send, the readiness list and
  "Reason to include" are not rendered for that message. The exact sent message is read
  only inside the step's Verification disclosure with its receipt. The existing sent
  line and "Send again" stay where they are.
- **R-S281-4 — Put a manual record in view.** While a manual activity is the current
  need, its status control is shown in Work, as S270's promotion rule provides for a
  current required field, and the primary focuses it there. After the status saves,
  focus moves to the Now card's next action. On Documents, when packet inputs or packet
  evaluation are the current need, the primary lands on the Document preparation card's
  first control.
- **R-S281-5 — Land with the label visible and offer the way back.** A jump scrolls so
  the target's label or legend is fully below the sticky toolbar. Every fix link followed
  from the Now card records its origin and offers "Return to {step}", which restores the
  step and focuses the control the jump started from. "Return to tenant offer" lands on
  the Offer step's primary action when its earlier landing element is absent.
- **R-S281-6 — Write nothing when the composer opens.** Opening the Communications
  composer from a lease creates no communication record until the staff member types,
  attaches a file or changes a recipient. Closing an untouched composer leaves no draft.
- **R-S281-7 — Fit the app header in one row on phones.** At 760 px and narrower the app
  header is one row of at most 64 px: Menu, the product name, a search trigger that
  opens the search field in place, and Notifications. No control is removed, and the
  phone pass still uses no rule that hides a control.
- **R-S281-8 — Keep the pinned lease header compact.** At 760 px and narrower the lease
  toolbar stays sticky and shows at most two lines: the address with the tenant count
  and a "Lease details" disclosure holding the tenant names, copy buttons, RentVine link
  and view controls; and the stage with Work status. Its pinned height is at most 112 px
  at 390 by 844 for any tenant count.
- **R-S281-9 — Show lease identity and next action without sideways scrolling.** At 430
  px and narrower the monthly table shows the lease identity and Next action columns
  together without horizontal scrolling; the other columns stay in the contained scroll
  region of the one table. With default filters at 390 by 844 the first lease row's
  address and next action are within the first screen: the Prepare block and the filters
  each take one expandable row.
- **R-S281-10 — Show the current action first on a phone.** At 390 by 844, after opening
  a lease from the desk, the Now card's outcome heading, cue and primary action are
  visible without scrolling, including on a five-tenant lease. S247 R-S247-10's
  two-screen budget remains the outer bound for the other steps.
- **R-S281-11 — Edit Rent to recommend where the owner ask needs it.** On Ask the owner
  in Guided, "Edit" on the facts line opens the one Rent to recommend editor in place
  under that line, with its basis phrase and its existing Save. Saving re-derives the
  message and the readiness list exactly as a save from Compare market rent does today,
  and focus returns to the primary action. The editor is mounted once on a page. In
  Guided it is on the step shown: first on Compare market rent (S269), in place on Ask
  the owner. In Full it stays in Market rent comparison, and "Edit" in Owner approval
  scrolls to it with the return of R-S281-5.
- **R-S281-12 — Name the message and the other ways to send.** On Ask the owner and on
  Offer the tenant, below the primary action, Work has three named groups, closed on
  entry, in place of one. "Message" holds the current wording, its readiness list and
  "Reason to include"; it opens on its own when a wording or readiness fix leads the
  step. "Other ways to send" holds Schedule, "Create Gmail draft instead", Copy and
  "Open in Communications". "Outreach record" on Ask the owner holds older draft reuse
  and the manual outreach and response paths; "Record of contact" on Offer the tenant
  holds the information form choices and the manual records. The primary still opens
  the exact review with the whole message. The read-only Verification group keeps its
  name and place. After a confirmed send, R-S281-3 governs and the first two groups are
  not rendered.
- **R-S281-13 — Keep the address on the step shown.** When an action advances the lease
  and the view follows to the new current step, the `step` value in the address is
  replaced with that step and no history entry is added. An explicit visit to another
  step still writes that step and still offers "Show current step". A link that names a
  step opens that step. Reload shows the step in the address, and Back returns to where
  staff came from with the desk's month, group and scroll (S246 R-S246-8).
- **R-S281-14 — Enter the renewal dates where the offer needs them.** On Offer the
  tenant in Guided, "Enter renewal start date" and "Enter renewal end date" open the one
  Working renewal terms editor in place on that step, with the next-day start (S263) and
  the end choices (S285), and focus on the named field. Save keeps staff on the step and
  returns focus to its primary action. The editor is mounted once on a page: on Ask the
  owner when that step is shown, on Offer the tenant when opened there. In Full it stays
  in Owner approval, and the Offer section's links scroll to it with the return of
  R-S281-5.

**In scope / out of scope.**

In scope: order within Work on Ask the owner, in-place editing of Rent to recommend and
of the renewal dates, the named groups, the address, the review dialog's layout, the
sent state, promotion of the current manual record, jump landing and return, the
composer's first save, and the phone-width header, toolbar and table. Out of scope: a
second editor or save path for any field, any change to what a control saves or sends,
and cards in place of the monthly table (S246 R-S246-7, which R-S281-9 works within).

**Open questions & assumptions.**

- The owner directed on November 12, 2026 that the four layout proposals be carried. The
  specifics are the author's inference and can be changed before a launch: the group
  names "Message", "Other ways to send", "Outreach record" and "Record of contact"; the
  in-place editors in Guided with a scroll and return in Full; and a history replace for
  the address.
- Assumption: R-S281-9 and R-S281-10 tighten the existing budgets on purpose. If either
  cannot be met without breaking a pinned contract, the implementer reports the measured
  result and the conflicting pin instead of weakening either.
- Visual polish, dark theme and a physical phone were not assessed by the audit and are
  left to staff review.

**Cross-product impacts.**

The Guided Now card and Full sections, the prepared message block, the confirmation
dialog styles, the navigation helper, the manual activity forms, the Communications
composer, the app shell header, the lease toolbar, the monthly table, the S165 and S247
viewport checks, Help captures and the control map.

**Authority and evidence map.**

| Input                                                                                                                        | Classification                   | Use and limitation                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| S247 R-S247-10 and R-S247-14, S269 and S270 as amended on November 12, 2026, S246 R-S246-7 and R-S246-8, S165, S189 R-S189-8 | Active contracts                 | Viewport budgets, one editor per field, the named groups, one table, phone rules, exact lease and cycle shown. |
| Owner direction of November 12, 2026, to carry every audit proposal and retire the rules that held them                      | Owner decision                   | Authority for the in-place editors, the named groups and the address. The names are assumptions.               |
| `components/lease-renewal/RenewalGuidedView.tsx`, `components/lease-renewal/RenewalPreparedMessage.tsx`, `app/globals.css`   | Committed implementation (trace) | Present order, dialog and styles. Re-verify lines before editing.                                              |
| `docs/voice-and-audience.md`                                                                                                 | Authority for copy               | Technical values stay out of the daily operator surface.                                                       |
| Staff workflow audit of November 12, 2026, findings A-09 and A-10                                                            | Intent evidence only             | Measured positions and the four layout proposals now carried.                                                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S281-1** — The Ask the owner Work area renders its facts line before its primary
  action from the existing projections, with the facts block still above the named
  group. A rendered-order test fails on the starting state.
- **ARCH-S281-2** — The navigation helper owns landing and return for every Now card fix
  link: it measures against the label and records the origin. No caller scrolls on its
  own.
- **ARCH-S281-3** — The composer's first save is caused by a staff input event. A test
  that mounts the composer, waits past the autosave delay and counts requests fails on
  the starting state.
- **ARCH-S281-4** — The phone-width rules live with the existing S165 block and add no
  rule that hides a control.
- **ARCH-S281-5** — Rent to recommend and Working renewal terms each have one editor
  component and one save path. The Guided renderer mounts it on the step shown, no page
  holds two mounted instances, and unsaved input follows the editor when it moves (S269
  ARCH-S269-2 and ARCH-S269-3). A rendered test that expects an amount input on Ask the
  owner fails on the starting state, which renders a link.
- **ARCH-S281-6** — The address is written by one function of the step shown. A followed
  advance uses a history replace and an explicit selection uses the existing write.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S281-1** — At 1440 by 900, opening Ask the owner shows the status, the three
  amounts and the primary action without scrolling.
- **BEH-S281-2** — In the review dialog the buttons, the recipients, the amounts and any
  schedule fields are visible without scrolling the page at both sizes, and no internal
  id is shown.
- **BEH-S281-3** — After a confirmed send the step shows the sent line, no readiness
  list and no "Reason to include"; the sent message is in Verification.
- **BEH-S281-4** — "Send the renewal information form" focuses a control in the first
  screen; saving it moves focus to the next action.
- **BEH-S281-5** — Every fix link lands with its label visible and returns to the
  control it started from.
- **BEH-S281-6** — Opening and closing the composer untouched leaves the count of
  communications unchanged.
- **BEH-S281-7** — At 390 by 844 the first lease's address and next action are in the
  first screen of the desk, the pinned toolbar is at most 112 px on a five-tenant lease,
  and the Now card's primary action is in the first screen.
- **BEH-S281-8** — On Ask the owner, "Edit" opens the amount in place. Saving $1,425.00
  updates the facts line and the message, and one editor is mounted on the page.
- **BEH-S281-9** — Ask the owner shows "Message", "Other ways to send" and "Outreach
  record" closed under the primary action. A wording fix opens "Message" on its own.
- **BEH-S281-10** — After the owner's answer is saved and the lease advances, the address
  names Offer the tenant, a reload shows Offer the tenant, and Back goes to the desk.
- **BEH-S281-11** — On Offer the tenant with no dates saved, "Enter renewal start date"
  opens the dates on that step. Saving keeps the step and makes the review available.

**Human litmus outcome.**

### See what I need, where I landed

**If this was built correctly:** On Ask the owner a staff member sees the current rent,
the market range and the recommended rent before the button, and changes the recommended
rent right there. The message and the other ways to send are one click away under their
own names. Any "fix this" button puts the field in front of them with its name showing
and offers a way back. On a phone the address and the next action are on the first
screen.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                               | Architecture outcome | Behavior outcome | Human litmus                    | Deterministic evidence / falsification                                   |
| ----------------------------------------- | -------------------- | ---------------- | ------------------------------- | ------------------------------------------------------------------------ |
| R-S281-1 facts lead Ask the owner         | ARCH-S281-1          | BEH-S281-1       | See what I need, where I landed | AC-S281-1. Rendered order and first-screen check.                        |
| R-S281-2 review dialog in view            | ARCH-S281-1          | BEH-S281-2       | See what I need, where I landed | AC-S281-2. Both sizes, each mode, no internal id.                        |
| R-S281-3 sent step shows the send         | ARCH-S281-1          | BEH-S281-3       | See what I need, where I landed | AC-S281-3. Rendered sent state and Verification content.                 |
| R-S281-4 manual record in view            | ARCH-S281-2          | BEH-S281-4       | See what I need, where I landed | AC-S281-4. Focus target position and focus after save.                   |
| R-S281-5 landing and return               | ARCH-S281-2          | BEH-S281-5       | See what I need, where I landed | AC-S281-4. Label fully visible and exact return for every link.          |
| R-S281-6 composer writes nothing          | ARCH-S281-3          | BEH-S281-6       | See what I need, where I landed | AC-S281-5. Request count on open, wait and close.                        |
| R-S281-7 one-row phone header             | ARCH-S281-4          | BEH-S281-7       | See what I need, where I landed | AC-S281-6. Header height and reachable controls at three widths.         |
| R-S281-8 compact pinned lease header      | ARCH-S281-4          | BEH-S281-7       | See what I need, where I landed | AC-S281-6. Pinned height for one and five tenants.                       |
| R-S281-9 table without sideways scroll    | ARCH-S281-4          | BEH-S281-7       | See what I need, where I landed | AC-S281-6. Visible columns and first-row position.                       |
| R-S281-10 current action first            | ARCH-S281-4          | BEH-S281-7       | See what I need, where I landed | AC-S281-6. Now card heading, cue and primary in the first screen.        |
| R-S281-11 edit Rent to recommend in place | ARCH-S281-5          | BEH-S281-8       | See what I need, where I landed | AC-S281-7. In-place save, one mounted editor, Full scroll and return.    |
| R-S281-12 named message and send groups   | ARCH-S281-1          | BEH-S281-9       | See what I need, where I landed | AC-S281-8. Group names, order, closed state and promotion on both steps. |
| R-S281-13 address on the step shown       | ARCH-S281-6          | BEH-S281-10      | See what I need, where I landed | AC-S281-9. Address, history length, reload and Back after an advance.    |
| R-S281-14 renewal dates on the Offer step | ARCH-S281-5          | BEH-S281-11      | See what I need, where I landed | AC-S281-10. In-place dates, focus, saved step and one mounted editor.    |

**Preservation set.**

- `tests/unit/s269-guided-field-first.test.tsx` and
  `tests/unit/s269-guided-priority.test.ts`: one mounted Rent to recommend editor and the
  priority order. The cases that expect a read-only amount with a link on Ask the owner,
  a route to another step for a missing renewal date on Offer the tenant, and the earlier
  group name lists are rewritten on purpose for R-S281-11, R-S281-14 and R-S281-12.
- `tests/unit/s270-guided-disclosures.test.tsx`: groups closed on entry, no closed
  descendant in tab order, one Verification group per outcome and the facts block in
  Work above the groups. The one-group-per-outcome case for Ask the owner and Offer the
  tenant is rewritten on purpose for R-S281-12.
- `tests/unit/s247-guided-view.test.tsx`: an explicit step selection writes that step,
  and each date has one mounted editor. The case that expects the address unchanged when
  the step advances is rewritten on purpose for R-S281-13.
- `tests/unit/s165-mobile-layout-contract.test.ts`: contained table scrolling, the sticky
  shared header on phones and no hiding rule in the phone pass.
- `tests/unit/s271-reconcile-without-send-again.test.tsx`: "Send again" is present after
  a send and absent during reconciliation.
- `tests/browser/one-path-guided-path-driver.mjs`: the existing viewport budgets.

**Adversarial acceptance checks.**

- **AC-S281-1** — Falsify ARCH-S281-1 and BEH-S281-1 at 1440 by 900 and 1280 by 800 in
  both themes: the status, Current base rent, the market range, Rent to recommend and the
  primary are within the first screen, in that order, and the facts block is in Work
  above the group. Exactly one Rent to recommend editor exists on the page.
- **AC-S281-2** — Falsify BEH-S281-2 for Send, Schedule and send with follow-ups at both
  sizes with a long message: the action row is visible without scrolling the page, the
  body scrolls in its own area, and the dialog shows the address and lease end, not an
  internal id.
- **AC-S281-3** — Falsify BEH-S281-3 for an owner and a tenant send: no readiness list,
  no "Reason to include", the sent line present, the sent message and receipt inside
  Verification, and "Send again" still present.
- **AC-S281-4** — Falsify ARCH-S281-2, BEH-S281-4 and BEH-S281-5. For every fix and enter
  link on every Guided step, the target's label is fully visible after landing and the
  return restores the step and focuses the originating control. The three manual
  primaries focus a control within the first screen.
- **AC-S281-5** — Falsify ARCH-S281-3 and BEH-S281-6: open the composer from an owner and
  a tenant step, wait two seconds and close. Zero save requests and zero new records.
  Type one character: one draft is saved.
- **AC-S281-6** — Falsify ARCH-S281-4 and BEH-S281-7 at 360, 390 and 430 px: header at
  most 64 px with every control reachable; pinned toolbar at most 112 px for one and five
  tenants; the address and next action visible together in the table; the first row and
  the Now card's primary within the first screen at 390 by 844. The S165 contract test
  stays green.
- **AC-S281-7** — Falsify ARCH-S281-5 and BEH-S281-8. In Guided on Ask the owner, open
  "Edit", type an amount and switch to Full and back: the typed value is kept and one
  editor is mounted at every point. Save: the facts line, the message and the readiness
  list show the new amount and focus is on the primary. A stale read refuses the save
  with the existing recovery. In Full, "Edit" lands on the editor in Market rent
  comparison with its label visible and returns to Owner approval.
- **AC-S281-8** — Falsify BEH-S281-9 on Ask the owner and Offer the tenant in both views
  and both themes. The three named groups follow the primary in order and are closed on
  entry, no closed descendant takes focus, each named control is inside its group, and a
  failing readiness line opens "Message" with the fix in view. A link to a control
  inside a group opens only that group. After a confirmed send the first two groups are
  absent.
- **AC-S281-9** — Falsify ARCH-S281-6 and BEH-S281-10. Advance a lease from each step by
  its own action: the address names the step shown and the history length is unchanged.
  Select an earlier step: the address names it and "Show current step" is offered.
  Reload at each point shows the named step. Back from the lease restores the desk's
  month, group and scroll.
- **AC-S281-10** — Falsify BEH-S281-11. On Offer the tenant with a missing start, a
  missing end and both missing, the named link opens the dates on that step with focus
  on the named field, the next-day start and the end choices are offered, and Save keeps
  the step with focus on its primary. One Working renewal terms editor is mounted. In
  Full the link lands in Owner approval and returns to the Offer section.

**Forbidden actions / hard gates.**

No second mounted editor and no second save path for any field. No hidden control on
phones. No change to what a control saves or sends. No history entry added by a followed
advance. No provider effect. No protected path edit.

**Dependencies / sequencing.**

Standalone. S277 supplies the basis phrases the facts line shows; without it the line
shows the amounts. S285 supplies the end-date choices the in-place dates show; without
it the editor shows the next-day start and manual entry. S282 adds one readiness row and
a fix link that this suite's landing rule covers. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The Work order, the in-place editors, the named groups, the
  address rule, the dialog layout, the sent state, promoted manual records, landing and
  return, the composer's first save and the phone-width rules, with tests, Help captures
  and control map rows, reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S277's basis phrases and S285's end-date choices.
- **Externally blocked effect:** None. Staff observation of the layout is a separate
  human verdict.
- **Produces for downstream suites:** A landing and return rule every later fix link
  inherits.

**Verification and delivery contract.**

1. Before editing, record the measured starting positions for BEH-S281-1 and BEH-S281-7,
   and prove those checks and BEH-S281-8 to BEH-S281-11 fail for the expected reason.
   Keep preservation separate.
2. Run focused rendered and browser checks for every ARCH, BEH and AC row in both
   themes and at the listed sizes.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the render order, the dialog, the helper and the phone-width rules.
2. Materialize the failing checks and the preservation baseline.
3. Build the Work order, the named groups and the dialog, then the in-place editors and
   the address rule, then landing and return, then the composer and the phone-width
   rules.
4. Falsify, run focused and canonical checks, update Help captures and current docs.

**Deletion/merge recommendation.**

Keep active until the order, the in-place editors, the named groups, the landings and the
phone-width rules are represented by verified code, tests and current facts.
