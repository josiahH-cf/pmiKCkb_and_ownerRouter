<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S251 — Housing assistance recorded once on the lease, with its own renewal order

> Status: AUTHORING READY: intake 117; implementation merged in PR #189 at `daf8ee05`. Resumed UX repairs and scoped qualification are recorded on `codex/renewal-one-path-ux`; production delivered at `ef81b891`, human verdict NOT RUN. D-OP-9 remains settled: program, owner renewing answer, then rent when a change is proposed. This specification grants no provider effect.

**Goal.**

Staff record once that a tenant is on a housing assistance program, and every renewal of that
lease then leads with the program contact, asks the owner whether to renew the tenant, and brings
in rent only when a change is proposed, without asking anything on leases where it does not apply.

**Current state / intended end state.**

Verified at `6491c06f` and in the November 4, 2026 staff walkthrough:

- There is no lease fact for housing assistance. Staff report that RentVine has no field for it.
- The staff checklist has one late, conditional activity, "Applicable assisted-housing form, owner
  signature and submission follow-up" (`lib/lease-renewal/workspace-state.ts`), which staff mark
  done or not applicable by hand on every lease. Every lease starts at Owner outreach, and the
  standard owner message carries a rent recommendation.
- The target classification sets a lease aside as "Program lease" when RentVine text contains words
  such as "section 8", "voucher" or "hap" (`lib/lease-renewal/cohort.ts`). That removes from the
  worklist a kind of lease staff do renew.
- Walkthrough, confirmed: staff contact the program to ask what its renewal process is, and follow
  that process if the owner wants to renew the tenant. Staff and the owner (Josiah Hunter) agreed
  to capture assistance as a field where rent and charges are set, not as a question every lease
  must answer.
- Walkthrough, not confirmed: the order. On November 4 the standard owner message with a rent
  recommendation was prepared first for an assisted tenant, and the program contact was planned for
  the wait that followed. Nothing in the walkthrough says rent is decided only when needed.
- Owner direction, November 5 (newest, governs): contact the program first, then ask the owner
  whether the tenant is still wanted, then take the owner's rent decision if one is needed.

Intended: an optional lease fact that changes the order of the first steps for that lease, keeps it
in the worklist and holds back paid rent comparison until a rent change is proposed.

**Actors and entry conditions.**

Renewal staff (Editor or higher) set or change the fact on any lease and record each step. Readers
see it. The fact is app-owned and saved on the lease; it is not written to RentVine or the
operating Sheet.

**What it is / how it functions.**

- **R-S251-1 — One optional fact.** A lease has "Housing assistance": not set, No, or Yes with the
  program name and optional contact and notes. Not set is the default and asks nothing.
- **R-S251-2 — Entered where it is first useful.** The field sits on the Check the numbers step and
  in Lease information, saves by itself with who and when, and can be changed at any time. After
  Yes is chosen, Program name is marked required. An empty name explains that the choice is
  waiting to be saved; leaving the field shows the missing-name error beside it. Completing the
  name saves the fact through the existing autosave in either location. Saving is visible; a
  failed save keeps the entry and offers Try again through the same lease-bound save, with
  permission and completeness checks retained.
  The shared S155 retry keeps visible keyboard focus through confirmed success in both locations,
  including when the saved housing choice changes the nearby path.
  The existing saved notice appears and the next Tab continues to the next control.
  An earlier autosave response keeps newer typing in Program name, contact and notes; those
  entries show "Unsaved housing assistance edits" until their own save completes, in both placements.
- **R-S251-3 — Stays with the lease.** The fact carries across renewal cycles until staff change it,
  with its history kept.
- **R-S251-4 — The program first.** With Yes, the step after the numbers check is "Contact
  {program} about the renewal process". Staff record its outcome, the date and what the program
  requires as notes, with the existing activity form. Once the numbers agree, their primary
  action names and opens that next applicable step. The standard path continues to Compare
  market rent; a step outside this lease's path is never its continuation.
- **R-S251-5 — Then the owner's answer on renewing.** The next step is "Ask the owner whether to
  renew this tenant". Staff record Renew, Do not renew or No answer yet, with who answered, how and
  when. Do not renew moves the lease to the existing non-renewal handoff.
- **R-S251-6 — Rent only when a change is proposed.** The next step asks "Rent for this renewal":
  Keep the current rent, or Propose a change. Keep sets the working rent to the current rent and
  shows the rent comparison and the owner's rent decision as not part of this lease's path. Propose
  a change brings in the standard prepared comparison, recommendation and owner rent decision
  (S249), or the standing agreement's rule where one covers the lease (S250).
- **R-S251-7 — No paid comparison ahead of that choice.** Batch and automatic preparation run no
  billed lookup for a lease marked Yes until Propose a change is chosen. Staff can still run one by
  hand at any time.
- **R-S251-8 — The order is guidance.** Every step can be worked earlier or later (S156). An owner
  answer that already covers the rent, such as an approval of the standard owner message, settles
  the renewing answer and the rent together.
- **R-S251-9 — The later follow-up follows the fact.** With Yes, the assisted-housing form, owner
  signature and submission follow-up is part of the lease's path. With No or not set it reads "Not
  part of this lease's path" and asks for nothing.
- **R-S251-10 — Stays in the worklist.** A lease is no longer set aside as a program lease because
  RentVine text mentions a voucher, Section 8 or a housing assistance payment. Such a mention shows
  as a suggestion, "RentVine mentions housing assistance. Set the field?", and decides nothing.
  Other program and owner-hold reasons keep their meaning.
- **R-S251-11 — Visible on the row.** The desk row carries a "Housing assistance" tag, and the
  batch can be narrowed to tagged leases.
- **R-S251-12 — No hidden rule.** The fact changes the order of steps and what is prepared. It
  changes no rent, charge, recipient or approved message wording by itself.

**In scope / out of scope.**

In scope: the fact, its entry points and history, the changed order of the first steps, the rent
choice, holding back the paid comparison, applicability of the existing follow-up, the
classification change, the tag and filter. Out of scope: program-specific rules, rent splits, forms
or deadlines; contacting a program from the app; new customer-facing wording; writing the fact to
RentVine or the Sheet; any change to other conditional follow-ups.

**Open questions & assumptions.**

- D-OP-9 (owner decision, November 5, 2026): the field is optional, assistance wording no longer
  removes a lease from the worklist, and the order is program, then the owner's answer on renewing,
  then rent if needed.
- Assumption to confirm with staff at the weekly session: "rent if needed" is the staff member's
  choice between Keep the current rent and Propose a change, made after the program contact. No
  choice is preselected.
- Assumption: an owner message that only asks whether to renew the tenant is new customer-facing
  wording. Until that wording is published through the existing template publication, staff record
  the owner contact they made another way, or use the standard owner message.
- The program's own process is an external input recorded as staff notes; nothing about it is
  prescribed or guessed. Program name is free text until staff have entered real programs.

**Cross-product impacts.**

`lib/lease-renewal/cohort.ts`, `lib/lease-renewal/workspace-state.ts`,
`lib/lease-renewal/working-record.ts`, `lib/lease-renewal/renewal-actions.ts`,
`components/lease-renewal/RenewalLeaseInformation.tsx`,
`components/lease-renewal/RenewalManualWorkspace.tsx`, the path definition and Now card (S247), the
batch preparation and rent proposal (S249), the desk tag and filter (S246), the per-reason counts
of S232, the operating Sheet update for the assisted-housing column, and the help guides (S252).

**Authority and evidence map.**

| Input                                                     | Classification       | Use and limitation                                                                                   |
| --------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; `docs/facts.md` (D-RENEWAL-STAFF-OPERATIONS) | Authority            | Staff knowledge is accepted without a mandatory question; guidance never gates.                      |
| Committed code and tests at `6491c06f`                    | Implementation truth | Present conditional activity, standard first step and program skip signal.                           |
| Owner direction, November 5, 2026                         | Owner decision       | The order of the first steps for an assisted lease; newest instruction.                              |
| November 4 staff walkthrough notes                        | Intent evidence      | Program contact and the owner's wish to renew are confirmed; the order and "rent if needed" are not. |
| The program's actual renewal process                      | External dependency  | Supplied by the program to staff; recorded as notes; nothing is prescribed or guessed.               |
| Approved wording for a renew-or-not owner message         | External dependency  | Absent: staff record outside contact or use the standard owner message.                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S251-1** — The fact is stored on the lease-bound working record with history and read by
  the path projection and the desk row. Fail-first: no such field exists.
- **ARCH-S251-2** — The assisted order is a pure function of the fact, the recorded program
  contact, the owner's renewing answer and the rent choice, built on the existing staff record.
  Fail-first: an assisted fixture starts at Owner outreach with a rent recommendation.
- **ARCH-S251-3** — The classification no longer treats assistance wording as a skip signal and
  exposes it as a suggestion. Fail-first: a fixture lease with voucher wording is skipped.
- **ARCH-S251-4** — Preparation reads the fact and the rent choice before any billed lookup.
  Fail-first: not applicable before S249 exists; with S249, an assisted fixture is looked up.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S251-1** — Setting Yes with a program name makes the program contact the next step and
  tags the desk row.
- **BEH-S251-2** — After the program contact is recorded the next step is the owner's answer on
  renewing; Do not renew moves the lease to the non-renewal handoff.
- **BEH-S251-3** — Keep the current rent leads to the tenant offer at the current rent with no
  comparison and no rent question; Propose a change shows the standard prepared rent steps.
- **BEH-S251-4** — Batch preparation makes no billed lookup for an assisted lease before Propose a
  change is chosen.
- **BEH-S251-5** — The fact is still set when the next cycle starts, and with No or not set nothing
  is asked.
- **BEH-S251-6** — A lease with voucher wording in RentVine stays in the batch and shows the
  suggestion; other program leases keep their reason.
- **BEH-S251-7** — Any step can be worked out of order, and a recorded owner approval of terms
  settles the renewing answer and the rent together.

**Human litmus outcome.**

### Renew a tenant who is on housing assistance

**If this was built correctly:** A staff member marks the tenant as on housing assistance and names
the program. The lease now says to contact the program first. After that it asks whether the owner
wants to renew the tenant, and only brings up rent if the staff member says a change is proposed.
Next year the lease still knows, and leases without assistance never ask.

- Model verdict: RUN for the optional synthetic fact, assisted order and non-renewal (J14). L55's distinct table-count discrepancy remains explicit. See the [review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and [individual litmus results](../evidence/renewal-one-path-litmus-2026-11-06.md).
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                                | Deterministic evidence / falsification                                   |
| ----------------------------------- | -------------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| R-S251-1 one optional fact          | ARCH-S251-1          | BEH-S251-5       | Renew a tenant who is on housing assistance | Store test: three states, optional program, contact and notes.           |
| R-S251-2 entered where useful       | ARCH-S251-1          | BEH-S251-1       | Renew a tenant who is on housing assistance | Field renders on the numbers step and Lease information; autosaves.      |
| R-S251-3 stays with the lease       | ARCH-S251-1          | BEH-S251-5       | Renew a tenant who is on housing assistance | Next-cycle fixture keeps the fact and its history.                       |
| R-S251-4 the program first          | ARCH-S251-2          | BEH-S251-1       | Renew a tenant who is on housing assistance | Assisted fixture: next step is the program contact, with notes saved.    |
| R-S251-5 the owner's answer         | ARCH-S251-2          | BEH-S251-2       | Renew a tenant who is on housing assistance | Renew, Do not renew and No answer fixtures; decline reaches the handoff. |
| R-S251-6 rent only when proposed    | ARCH-S251-2          | BEH-S251-3       | Renew a tenant who is on housing assistance | Keep and Propose fixtures: path steps and working rent.                  |
| R-S251-7 no paid comparison ahead   | ARCH-S251-4          | BEH-S251-4       | Renew a tenant who is on housing assistance | Batch run over an assisted fixture makes zero billed lookups.            |
| R-S251-8 the order is guidance      | ARCH-S251-2          | BEH-S251-7       | Renew a tenant who is on housing assistance | Out-of-order work succeeds; an approval of terms settles both answers.   |
| R-S251-9 follow-up follows the fact | ARCH-S251-2          | BEH-S251-5       | Renew a tenant who is on housing assistance | Yes, No and not set fixtures for the assisted-housing activity.          |
| R-S251-10 stays in the worklist     | ARCH-S251-3          | BEH-S251-6       | Renew a tenant who is on housing assistance | Voucher wording fixture is a target with a suggestion.                   |
| R-S251-11 visible on the row        | ARCH-S251-1          | BEH-S251-1       | Renew a tenant who is on housing assistance | Desk row tag and filter render from the stored fact.                     |
| R-S251-12 no hidden rule            | ARCH-S251-2          | BEH-S251-3       | Renew a tenant who is on housing assistance | Rent, charges, recipients and approved wording unchanged by the fact.    |

**Preservation set.**

Existing recorded assisted-housing activity outcomes and their history, the other conditional
follow-ups, owner-hold and non-assistance program reasons, S156 advisory guidance, S234 approval
evidence, the standard path for every lease without the fact, autosave behavior, and the working
record's other fields.

**Adversarial acceptance checks.**

- **AC-S251-1** — An assisted fixture leads with the program contact, then the owner's answer on
  renewing, then the rent choice, and a lease without the fact follows the standard path unchanged
  (ARCH-S251-2, BEH-S251-1, BEH-S251-2).
- **AC-S251-2** — No lease is asked the question; not set renders no prompt, blocker or required
  mark, and no step in the assisted order disables another (R-S251-1, BEH-S251-7).
- **AC-S251-3** — A lease with assistance wording in RentVine is a renewal target and shows a
  suggestion only; the fact stays not set until staff set it (ARCH-S251-3, BEH-S251-6).
- **AC-S251-4** — With Keep the current rent no comparison is run or requested and the working rent
  equals the current rent; preparation makes no billed lookup for an assisted lease before Propose
  a change (ARCH-S251-4, BEH-S251-3, BEH-S251-4).
- **AC-S251-5** — Setting the fact causes no send, no provider write and no change to rent, charges
  or approved message wording (R-S251-12).

**Forbidden actions / hard gates.**

No assistance status inferred and saved from RentVine text, a name or a message. No write to
RentVine or the Sheet from the field. No mandatory question. No invented program rule or
customer-facing wording. No customer value in fixtures, tests or documentation.

**Dependencies / sequencing.**

Consumes the lease-bound working record (S157) and the existing staff record. Feeds the S247 path,
the S249 preparation and the S246 row tag, each optional: without them the field shows in Lease
information and the assisted steps appear in the existing staff checklist in this order.
Independently buildable.

**Standalone delivery contract.**

- **Deliverable now:** R-S251-1 to R-S251-12 with store, projection, classification, preparation
  and row tests.
- **Consumes, but does not assume:** S247 (absent: existing checklist), S249 (absent: no automatic
  lookup exists to hold back), S246 (absent: the tag shows in the existing lease cell).
- **Externally blocked effect:** a prepared renew-or-not owner message waits on approved wording;
  the step works without it by recording outside contact. Program process detail waits on the
  program and is never prescribed.
- **Produces for downstream suites:** the assistance fact, the assisted order and the rent choice.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and the present skip-signal behavior.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the fact and its entry points, the assisted order and rent choice, the preparation rule
   and the classification change.
4. Falsify, run focused and canonical tests, update help content, and ship only when authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts.
