<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S253 — Confirmed form answers: pet fee and total, owner explanation, tenant initial boxes

> Status: AUTHORING READY: intake 119; implementation merged in PR #185 at `95858eef`. Resumed synthetic UX qualification is recorded on `codex/renewal-one-path-ux`; release pending, human verdict NOT RUN. Real original/map approval and every client answer still open remain in U1, U2 and U4. This specification grants no publication or provider effect.

**Goal.**

The form questions the client answered on November 5 stop holding work. The pet agreement shows
the right fee, deposit and total. The owner acknowledgment carries the explanation staff write for
that lease. The brochure's footer boxes are kept for tenant initials. Each answer still missing is
asked once and holds only its own output.

**Current state / intended end state.**

Verified at `6491c06f`:

- The November 3 run inventoried all eight supplied originals privately (32 static pages, no form
  fields) and prepared proposed maps. Its review stopped on meanings only the business can give.
  The [holds packet](../open-blockers.md) names them under U1: the owner acknowledgment's
  execution date and unlabeled box, the pet agreement's conflicting processing-fee text and its
  animal language, and the brokerage brochure's unlabeled footer boxes.
- The charge policy (`lib/lease-documents/charge-policy.ts`) prices an animal from tiers on weight
  or screening score. Each tier carries a monthly amount, a one-time amount and a refundable
  deposit, and a policy with animal rules must have at least one tier and a treatment for both
  pets and assistance animals. It has no separate processing fee and no form total. The
  November 3 readback found no published charge policy, so every animal reads as needing a rule.
- The static form filler (`lib/lease-documents/static-pdf.ts`) wraps a value inside its reviewed
  region, refuses a value that does not fit and refuses a value with line breaks. The map contract
  (`lib/lease-documents/artifact-intake-contract.ts`) protects signature, initial and signing-date
  areas, and can replace reviewed existing text on an original.
- Packet inputs (`lib/lease-documents/packet-inputs.ts`,
  `components/lease-renewal/PacketInputsEditor.tsx`) hold typed facts per lease. There is no
  per-lease explanation for the owner acknowledgment.

The client's answers, given by Dan and relayed by the owner on November 5, 2026:

| Form and item                             | Answered                                                                                                                                                                                                     | Still open                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pet agreement, fee and blanks             | The ordinary pet processing fee is $50, not $150. The refundable deposit is separate and depends on the pet screening result. The first amount blank is the deposit; the second is the fee plus the deposit. | Which screening result or schedule sets the deposit, who approves it, and whether it is entered by hand. What "every time" covers: each renewal, each agreement, each pet or another event. |
| Pet agreement, assistance animals         | An exception was described for a registered service animal.                                                                                                                                                  | The approved exceptions and their wording, including emotional-support animals. No registration requirement follows from this statement.                                                    |
| Owner acknowledgment, large box           | It holds an explanation written for that lease. Bailey keeps a starting text and edits it for each lease.                                                                                                    | The starting text and one example; the inputs it needs; who writes it, who reviews it and when it is ready.                                                                                 |
| Owner acknowledgment, "Lease executed on" | Nothing settled. Dan called it ambiguous, named the lease start date and the date sent as candidates, and noted the acknowledgment usually goes out before signing.                                          | Which date belongs there.                                                                                                                                                                   |
| Brokerage brochure, footer                | The four boxes are tenant initial boxes.                                                                                                                                                                     | Which tenant uses which box, unused boxes and more than four tenants; the agency selections and signing details, which Dan left to Bailey.                                                  |
| Organization names and signers            | Nothing settled.                                                                                                                                                                                             | Approved form versions, organization names, representatives and authorized signers. The acknowledgment and the brochure print different organization names, and both may be valid.          |

Intended: the settled answers are built and recorded with their source, the proposed maps carry
them, and the open answers appear as one short list that holds nothing else.

**Actors and entry conditions.**

The implementation runner for the policy, calculator, inputs, filler and checks. An Admin for the
existing charge policy publication and map review controls. Renewal staff, who record a pet's
deposit and write the owner explanation on the lease. Dan and Bailey for the remaining answers,
and the document authority Dan names for any change to printed text. Real forms are prepared only
after their original and map are approved under U1; everything here is provable on synthetic forms
of the same shape.

**What it is / how it functions.**

- **R-S253-1 — Answers recorded once, with their limits.** Each answer in the table is recorded in
  the private form review proposal against the exact original it concerns, with who answered, who
  relayed it, the date and the words' scope. The holds packet carries the same settled and open
  split. A later answer replaces only the item it addresses, and a settled item is not asked again.
- **R-S253-2 — The processing fee is its own published amount.** The charge policy gains one
  ordinary pet processing fee, separate from tier amounts and from any deposit. An Admin publishes
  it through the existing control with a note naming its source; the confirmed value is $50. It is
  never a code constant, a seed or a figure read from a printed form. The policy can be published
  with the fee alone: no deposit schedule and no assistance-animal treatment are needed to publish
  it. What one fee covers (a pet, an agreement or another unit) is a policy value with no default,
  unset until the client confirms it.
- **R-S253-3 — The deposit is recorded for the pet, from the screening result.** Until a schedule
  is confirmed, a pet's refundable deposit is an amount staff record on the lease together with
  where it came from, kept with who recorded it and when. No tier, schedule or printed amount
  supplies it. With no amount recorded the deposit and the total stay empty and the lease names
  what is needed. A confirmed schedule later becomes published policy; hand entry stays available
  for an exception with its reason.
- **R-S253-4 — Total equals fee plus deposit, shown with its parts.** For an ordinary pet the total
  is the published processing fee plus the recorded deposit, exact to the cent. The lease shows
  the fee, the deposit and the total before anything is prepared. On the pet agreement the first
  amount blank takes the deposit and the second takes the total. When either part is missing, no
  total is shown or printed. An agreement that lists more than one ordinary pet holds both blanks
  until the client confirms what one fee covers.
- **R-S253-5 — One fee on the finished form.** Wherever the prepared pet agreement states the
  processing fee it states the published amount, both in what a reader sees and in the text a
  program reads from the file. The original's conflicting $150 text is resolved in one of two
  reviewed ways: the document authority supplies a corrected original, or an approved map region
  replaces that exact text on that exact original. The proposal names the form, page, existing
  text and exact replacement. A prepared file in which the two readings differ, or in which the
  fee differs from the published amount, is refused.
- **R-S253-6 — Assistance animals: nothing is added.** Staff still record whether an animal is a
  pet or an assistance animal. The app adds no registration field, check, document request or
  wording. Until the client's approved rule is published, an assistance animal shows no fee, no
  deposit and no agreement decision, only that the rule is needed; it never reads as charged and
  never as free. The existing generic staff activity is named "Animal follow-up" (formerly "Pet
  registration follow-up"), with its control identity and saved records kept. The legacy readiness
  item is named "Animal charges and agreement" and points to Packet inputs; neither surface
  asserts a registration requirement. Ordinary-pet deposit and agreement tools remain available.
- **R-S253-7 — The owner acknowledgment carries this lease's explanation.** The large box at the
  bottom is filled from an explanation staff write for that lease and renewal cycle. Staff begin
  from the team's starting text when an Admin has saved one, edit it, and see it in the exact
  preview before any file is prepared. The app writes none of it: no generated text, no invented
  starting text and no reuse of another lease's explanation. Paragraphs staff type are kept on the
  form. Text that does not fit the box is refused with how much it is over, never shrunk below the
  reviewed size and never cut. The explanation is saved with who wrote it and when; if the renewal
  terms change afterwards it is flagged "Terms changed after this was written" and kept. While no
  explanation is recorded the owner acknowledgment reads "Needs the explanation for this lease"
  and only that form waits.
- **R-S253-8 — "Lease executed on" has no default.** The app never fills this date: not from the
  lease start date, the send date, a signing date or today. It stays blank on the prepared form,
  and the form's notes say "Lease executed on is left blank until the business confirms which date
  belongs there". When the client confirms the rule, it is recorded with its source and the map
  changes through review.
- **R-S253-9 — The brochure's four footer boxes are tenant initial boxes.** They are mapped as
  protected initial areas for tenant signers, so the app never draws in them, and the form's notes
  say "Tenant initials: four boxes". No tenant is assigned to a particular box and no box is marked
  unused. A lease with more than four tenants shows "More than four tenants: confirm how initials
  are collected" instead of a guess. Agency selections stay unfilled until confirmed for the case.
- **R-S253-10 — Organization names stay per form.** The review proposal lists, per form and page,
  the organization, representative and signer text printed there. A difference between two forms
  is shown as information, not as an error. The app never copies one form's organization name onto
  another and never makes them match. A correction exists only as form, page, existing text,
  exact replacement, signing role and who confirmed it.
- **R-S253-11 — Each open question holds only its own output.** One checked list carries the
  questions below. The app supplies no value for a listed item, and nothing else waits on it. The
  list is kept copy-ready under the S238 client package rules; the app sends nothing.

  | Open question                                                             | Asked of                        | Holds only                                                                | Works meanwhile                           |
  | ------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
  | Deposit schedule, its approver, hand or automatic entry                   | Dan                             | A deposit filled in without staff                                         | A deposit staff record with its source    |
  | What "every time" covers                                                  | Dan                             | Totals for an agreement with more than one ordinary pet                   | One ordinary pet on one agreement         |
  | Assistance-animal exceptions and wording                                  | Dan, or the authority Dan names | Fee, deposit and agreement decision for an assistance animal              | Ordinary pets on the same lease           |
  | Starting text, an example, inputs, author, reviewer and timing            | Bailey                          | A prefilled starting text and any review step                             | Staff write the explanation on the lease  |
  | Which date is "Lease executed on"                                         | Dan                             | Filling that date                                                         | The rest of the owner acknowledgment      |
  | Box order, unused boxes, more than four tenants                           | Bailey                          | Per-tenant initial guidance; a lease with more than four tenants          | All four boxes left for initials          |
  | Agency selections and signing details                                     | Bailey                          | Filled agency choices on the brochure                                     | Choices left for the signer               |
  | Form versions, organization names, representatives and authorized signers | Dan and the document authority  | Any change to printed organization text; approval of that form's original | The per-form list of what each one prints |

- **R-S253-12 — A value from one lease is never a default.** A deposit, an explanation, a date or
  an amount entered on one lease, test leases included, is never suggested on another lease, an
  owner portfolio or the company policy.

**In scope / out of scope.**

In scope: the processing fee and unit in the charge policy, the recorded deposit, the form total,
the fee consistency check, the per-lease explanation and its starting text setting, paragraph
support in the static filler, the brochure's protected initial areas, form notes, the per-form
organization list, the open-question list and its check, and the private proposal updates. Out of
scope: approving or publishing any original or map, choosing a deposit schedule, any
assistance-animal rule or wording, any execution-date rule, changing printed organization text,
agency selections, Dotloop signing placement, and any customer send or provider write.

**Open questions & assumptions.**

- The eight questions in R-S253-11 are open. None is answered here.
- Assumption: until a schedule is confirmed, staff record the deposit by hand with its source.
  This adopts no schedule and names no approver; the owner may strike it, which leaves the total
  empty for every pet.
- Assumption: one ordinary pet on one prepared agreement carries one fee under every reading of
  "every time". Whether an agreement is due at a given renewal stays with the existing form-use
  rule, which is a labeled engineering default.
- Assumption: every owner acknowledgment gets an explanation. Whether any lease legitimately has
  none is asked with the starting text.
- Dan's answers are business answers from the client's question contact. They settle meaning;
  they do not approve an original, a map or legal wording.

**Cross-product impacts.**

`lib/lease-documents/charge-policy.ts`, `app/api/admin/lease-charge-policy/route.ts`,
`components/admin/RenewalPacketPolicyAdminPanel.tsx`, `lib/lease-documents/packet-inputs.ts`,
`components/lease-renewal/PacketInputsEditor.tsx`, `components/lease-renewal/RentAndCharges.tsx`,
`lib/lease-documents/static-pdf.ts`, `lib/lease-documents/artifact-intake-contract.ts`,
`lib/lease-documents/lease-packet-readiness.ts`,
`components/lease-renewal/LeasePacketReadiness.tsx`, the private form review proposals, the holds
packet, the S238 client package and the help guide for packet inputs. S252 uses the result in its
first full case.

**Authority and evidence map.**

| Input                                                       | Classification       | Use and limitation                                                                               |
| ----------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `AGENTS.md` safety boundaries and holds rule                | Authority            | No guessed policy, signer or customer value; holds live only in the holds packet.                |
| Dan's November 5 answers, relayed by the owner              | Client answer        | Settles the listed meanings and the fee. Approves no original, map, wording, schedule or signer. |
| Owner's November 5 instruction to fold them into this batch | Direction            | Scope for this specification; no execution or publication grant.                                 |
| S66, S130 and S235 as delivered                             | Implementation truth | Charge policy, packet inputs, map contract, static filler and readiness display.                 |
| November 3 private inventory and proposed maps              | Evidence             | Exact originals, regions and the conflicting fee text; private, never committed.                 |
| U1 and U2 approvals; the eight open answers                 | External dependency  | Absent: real forms stay unprepared as today, and each open item holds only its row in R-S253-11. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S253-1** — The charge policy schema and its calculator own the processing fee, its unit,
  the deposit source and the form total in one place; a form total is a calculator output, never a
  map formula or a component sum. Fail-first: the schema has no processing fee and refuses a
  policy without tiers.
- **ARCH-S253-2** — The explanation is one per-lease, per-cycle packet input, consumed by the
  owner acknowledgment map as a multi-line region; the filler keeps paragraph breaks and refuses
  overflow. Fail-first: the filler refuses any value with a line break.
- **ARCH-S253-3** — The open questions are one checked data file naming the field or rule each
  holds. The check fails when a map, policy or input supplies a value for a listed item, and when
  a listed item is removed without a recorded answer. Fail-first: no such file exists.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S253-1** — With a published fee of $50 and a recorded deposit for one ordinary pet, the
  lease shows the fee, the deposit and the total; the synthetic pet agreement shows the deposit in
  the first amount blank and the total in the second; the visible and extracted fee agree.
- **BEH-S253-2** — A missing deposit, more than one ordinary pet with the unit unset, or an
  assistance animal with no published rule each show the named need and print no total. Nothing
  reads as zero.
- **BEH-S253-3** — An explanation of two paragraphs appears as two paragraphs inside the box on the
  synthetic owner acknowledgment. A text too long is refused with its overage. With none recorded,
  only the owner acknowledgment waits.
- **BEH-S253-4** — "Lease executed on" is blank on every prepared acknowledgment whatever the lease
  start, send date or current date. The four brochure boxes are untouched on every prepared
  brochure. A five-tenant lease shows the initials question.
- **BEH-S253-5** — Two forms that print different organization text still print it after
  preparation. A value entered on one synthetic lease appears on no other lease, portfolio or
  policy.

**Human litmus outcome.**

### Prepare a pet agreement and an owner acknowledgment for one renewal

**If this was built correctly:** A staff member opens a renewal with one pet, enters the deposit
from the screening result and sees the fee, the deposit and the total add up before anything is
prepared. They write two short paragraphs for the owner and see them in the box on the preview.
The forms say plainly that the execution date and the tenant initials are left blank. Nothing asks
them a question Dan already answered.

- Model verdict: RUN for synthetic forms and per-lease isolation (J16–J18). Real originals, legal and mapping approvals, and open client answers stay unverified. See the [review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and [individual litmus results](../evidence/renewal-one-path-litmus-2026-11-06.md).
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                       | Architecture outcome | Behavior outcome | Human litmus                                                        | Deterministic evidence / falsification                                             |
| --------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| R-S253-1 answers recorded         | ARCH-S253-3          | BEH-S253-4       | Prepare a pet agreement and an owner acknowledgment for one renewal | Open-question file and holds packet agree; a settled item is absent from the list. |
| R-S253-2 processing fee           | ARCH-S253-1          | BEH-S253-1       | Prepare a pet agreement and an owner acknowledgment for one renewal | Policy with the fee alone publishes; starting schema refuses it.                   |
| R-S253-3 recorded deposit         | ARCH-S253-1          | BEH-S253-2       | Prepare a pet agreement and an owner acknowledgment for one renewal | Deposit with source, author and time; none recorded prints no total.               |
| R-S253-4 total and blanks         | ARCH-S253-1          | BEH-S253-1       | Prepare a pet agreement and an owner acknowledgment for one renewal | Cent-exact sum; first blank deposit, second blank total on the synthetic form.     |
| R-S253-5 one fee on the form      | ARCH-S253-1          | BEH-S253-1       | Prepare a pet agreement and an owner acknowledgment for one renewal | Visible and extracted fee compared; a differing file is refused.                   |
| R-S253-6 assistance animals       | ARCH-S253-3          | BEH-S253-2       | Prepare a pet agreement and an owner acknowledgment for one renewal | No registration field exists; an unpublished rule shows the need.                  |
| R-S253-7 owner explanation        | ARCH-S253-2          | BEH-S253-3       | Prepare a pet agreement and an owner acknowledgment for one renewal | Paragraphs kept, overflow refused, missing text holds one form, no generated text. |
| R-S253-8 execution date           | ARCH-S253-3          | BEH-S253-4       | Prepare a pet agreement and an owner acknowledgment for one renewal | Date blank across a matrix of lease start, send and current dates.                 |
| R-S253-9 tenant initial boxes     | ARCH-S253-3          | BEH-S253-4       | Prepare a pet agreement and an owner acknowledgment for one renewal | Four protected areas untouched; five tenants show the question.                    |
| R-S253-10 organization names      | ARCH-S253-3          | BEH-S253-5       | Prepare a pet agreement and an owner acknowledgment for one renewal | Two synthetic forms keep different printed text after preparation.                 |
| R-S253-11 open questions hold one | ARCH-S253-3          | BEH-S253-2       | Prepare a pet agreement and an owner acknowledgment for one renewal | Each listed item blocks only its named output in a fixture matrix.                 |
| R-S253-12 no cross-lease default  | ARCH-S253-2          | BEH-S253-5       | Prepare a pet agreement and an owner acknowledgment for one renewal | Values on one synthetic lease are absent from another lease, portfolio and policy. |

**Preservation set.**

Tier pricing for a policy that uses tiers, the per-lease charge override with its reason, policy
versioning and effective dates, the recorded pet or assistance-animal treatment, every protected
signature, initial and signing-date area, overflow refusal, the original and map approval controls,
the labeled form-use defaults, both closed Dotloop keys, and the rule that a printed amount is
never a published policy.

**Adversarial acceptance checks.**

- **AC-S253-1** — A policy with only the processing fee publishes; the total is the exact sum in
  cents; a missing fee or deposit yields no total; no printed tier is ever used (ARCH-S253-1,
  BEH-S253-1, BEH-S253-2).
- **AC-S253-2** — A prepared pet agreement whose visible fee and extracted fee differ, or whose fee
  differs from the published amount, is refused; the $150 text survives in neither reading
  (R-S253-5, BEH-S253-1).
- **AC-S253-3** — Paragraphs are kept; overflow is refused; a missing explanation holds only the
  owner acknowledgment; no generated, invented or copied text appears; a terms change flags the
  explanation without clearing it (ARCH-S253-2, BEH-S253-3).
- **AC-S253-4** — No input combination fills "Lease executed on"; the brochure boxes are untouched;
  five tenants ask the initials question; adding a registration field or check for assistance
  animals fails the open-question check (ARCH-S253-3, BEH-S253-4).
- **AC-S253-5** — Printed organization text is unchanged per form and never copied between forms;
  no value crosses from one lease to another (BEH-S253-5).
- **AC-S253-6** — No customer value, legal text, private map or organization name enters Git, and
  no original, map or policy is published, approved or sent as proof (R-S253-1, R-S253-10).

**Forbidden actions / hard gates.**

No registration requirement for assistance animals. No default for "Lease executed on". No
organization name copied, normalized or corrected without its form, page, exact replacement and
signing role. No printed fee tier adopted. No test-lease value as a default. No app-written owner
explanation. No original or map approved or published by the runner as proof. No Dotloop key
opened. No customer value in Git.

**Dependencies / sequencing.**

Independent of S246–S252: it changes the documents files and no desk or path file. Consumes S66,
S130 and S235 as delivered. Real form preparation still waits on U1 approval of each original and
map; this suite makes those approvals the only thing left for the settled items. S252's first full
case consumes it when a pet or an owner acknowledgment is in that case.

**Standalone delivery contract.**

- **Deliverable now:** the policy fee and unit, the recorded deposit, the total, the fee
  consistency refusal, the explanation input and starting text setting, paragraph support, the
  brochure's protected areas, form notes, the open-question file and check, and updated private
  proposals, all proven on synthetic forms.
- **Consumes, but does not assume:** an approved original and map per form (absent: that form's
  real output stays held as today); the team's starting text (absent: the starting text is empty);
  a confirmed deposit schedule (absent: hand entry).
- **Externally blocked effect:** preparing the real forms waits on U1; each open answer holds only
  its row in R-S253-11; publishing the fee is a normal configuration step done only under an
  authorized run with Dan's answer as its recorded source.
- **Produces for downstream suites:** a first full case that can include a pet agreement and an
  owner acknowledgment (S252), and readiness rows that name the new needs (S235).

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify the charge policy, packet inputs, map contract and filler at the current source, and
   re-read the holds packet.
2. Materialize the open-question file and its check, the policy fee tests and the filler paragraph
   tests; record fail-first results.
3. Build the fee, unit, deposit and total; the explanation and starting text; paragraph support;
   the brochure areas and form notes; update the private proposals.
4. Falsify, run focused and canonical tests, record evidence without customer values, and ship
   only when authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts, and the eight
open answers are either recorded or carried in the holds packet.
