<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S224 — Staff business profiles and message signatures

> Status: READY. Saved blank and exact message readiness delivered at `2e5e47a8`, intake 125. November 9 intake 134 is authoring-ready for first-use setup and correct active-sender previews.

**Goal.**

Staff can prepare a message, resolve its actual required inputs and review exactly what will
leave the app. Each managed sender has an explicit saved signature choice, including blank.

**Current state / intended end state.**

The November 7 rehearsal at `ef81b891` showed Send and Schedule in Communications beside a
notice that the managed sender had no approved business profile. The current sequence service
can build a message snapshot with a null signature. The lease kickoff form requires a sender
name for new signature setup. Approved Admin profiles and staff-retained signatures already
exist. The revision provides one sender setup and a shared readiness check on outgoing actions.

The November 9 screenshot pairs a missing setup cue for the current staff member with a
different person's footer in an older tenant message revision. Serving
`lib/lease-renewal/current-renewal-message.ts` can fall back to the saved revision's
signature in composition even where setup evidence is evaluated for the active actor.
It also preserves authored bodies. These are concrete reproduction paths. The screenshot
alone does not distinguish a structured footer from retained authored text or prove a send.

**Actors and entry conditions.**

Authorized managed PMI staff use their existing roles and record/Space scope. Admin manages
organization configuration where stated; business titles do not confer permissions. Vendors are
restricted to their explicit assigned work where a suite enables it. The runner may author this
contract now and may implement only under a later explicit execution instruction. Real source
identities and unavailable provider/configuration inputs must remain distinguishable from local
working data and deterministic test fixtures.

**What it is / how it functions.**

Retain Admin ownership of approved staff business profiles and staff ownership of their own
managed-sender signature. R-S224-1 through R-S224-5 preserve the versioned profile, same-sender
prefill, prior retained values and exact preview. The revision adds the following.

- **R-S224-6 — Save the sender's signature choice.** Put a clear setup or edit action in
  preparation and make the same setting reachable from the sender's profile. Prefill
  available approved business details for that sender and let them save filled fields or
  explicitly save a blank signature. Every visible signature field is optional. The
  managed identity still comes from the session and existing responsibility rules.
  A blank save is versioned and distinguishable from an absent, unreadable or other-sender
  record. Blank inserts no signature text or missing-value marker. A valid existing
  saved signature for the same sender satisfies setup. Approved profile prefill respects
  an explicitly saved blank. Show save, failure and retry state. Return to the same draft
  with edits retained.
- **R-S224-7 — Require only the inputs of the exact outgoing message.** Determine readiness
  from the actual purpose, audience, recipient or reply thread, selected content and any
  attachments in the exact message. Retain verified sender, recipient, source, publication
  and attachment gates where they apply. A rent recommendation requires its rent. A
  renewal offer requires the terms it offers. An assisted renew-or-not message can be
  ready before rent is set. Omit unused optional content before exact review and show
  the same resulting message on each outgoing path. An unresolved required value or
  outgoing placeholder names the fact
  and links to its owner. Text edits do not supply verified facts. Staff can still
  prepare, save, refine and Copy in-app wording, including marked working text. Give
  the same readiness reasons on the lease and in Communications.
- **R-S224-8 — Apply readiness at every supported outgoing boundary.** Apply R-S224-6 and
  R-S224-7 to existing customer-facing Send, Schedule, Resume, linked replies and Create
  Gmail draft paths, including replacement drafts. Check each message being authorized,
  including follow-up wording only when it is in scope. Show the exact payload with its
  signature choice and enforce readiness on the server at review and final claim,
  including scheduled dispatch. Use the existing exact confirmation, one-attempt claim,
  receipt and ambiguity recovery. Changed material inputs require fresh exact review.
  Opening, preparing and checking readiness create no effect.
- **R-S224-9 — Handle existing drafts and schedules explicitly.** Keep historical sends and
  exact approved snapshots readable. A prior schedule can dispatch under its existing
  gates when its immutable authorization proves the required inputs and configured
  signature for its own sender. When that evidence is missing, show the hold and offer
  setup and fresh review or Resume. Preserve approved bytes, timing, counts and receipts.
  A sender takeover rebinds to that person's setup and requires their fresh exact review.
  Reconcile an ambiguous existing attempt through its original receipt flow.

- **R-S224-10 — Set up the sender on first use.** On the first eligible entry to renewal
  message preparation or the Communications composer with no readable saved choice,
  bring the current sender to their own signature setup with the draft and return context
  retained. Distinguish missing setup from a failed read. The setup/edit action stays
  available on both views, in Communications and from the sender's profile, using the
  same authorized settings destination. Show the managed sender, any same-person
  business-profile prefill and a preview. Staff can save their own fields or Save blank
  signature. Setup is complete only on exact saved readback for that identity. A failed
  or conflicting save keeps fields and offers a retry. Staff can go back to editing or
  Copy without completing setup. The server holds outgoing actions until the supported
  sender choice is saved and all other message-specific facts are ready.
- **R-S224-11 — Attribute and compose for the actual sender.** Resolve the active sender
  through the existing responsibility rules, managed UID and mailbox email. Use only
  that person's configured or proven same-sender retained choice in the active message
  signature. An explicit blank produces no footer. An unset choice gives the setup
  state and omits another staff member's signature from the active preview. The actor
  viewing someone else's owned draft can inspect an attributed snapshot where allowed.
  A permitted takeover explicitly rebinds and re-reviews the current draft before any
  outgoing action. Build the exact plain and rich preview from the same sender-bound
  inputs as final review, including follow-ups. Preserve staff-authored body text and
  the historical revision. Replace a known structured foreign footer through its
  signature owner. If a prior-sender footer is embedded in freeform or unverified
  legacy wording and cannot be separated safely, show that version as prior wording,
  hold the outgoing review, and offer deliberate rebuild or edit and fresh review.
  An authenticated profile change or signature save never silently rewrites another
  person's history, previously accepted send or immutable authorization. Existing
  scheduled and ambiguous records follow R-S224-9.

**In scope / out of scope.**

Business profiles, sender-owned setup, and readiness of already-supported customer-facing
message actions are in scope. The existing managed-mailbox and workflow authority define
each action. Internal transactional notices, document signatures and activity performed
manually in Gmail are separate contracts.

**Open questions & assumptions.**

The owner accepted Q5 and confirmed a saved blank signature and message-specific required
fields. Actual approved profile details, message facts and managed mailbox authority come
from their existing owners. Incomplete drafts remain editable and copyable.

**Cross-product impacts.**

- Admin staff management and existing managed staff identity projection.
- lib/firestore/renewal-sender-signatures.ts; lib/lease-renewal/renewal-message-preparation.ts.
- S187 composer, S188 managed sender ownership, S189–S192 sequence authorization and dispatch,
  S162 draft transport, S249 renewal-message readiness, and S242 Help checks.
- `app/profile/page.tsx`, `lib/gmail-hub/sequence-service.ts`, the linked reply owner and
  `lib/lease-renewal/execution/renewal-notice-draft-service.ts`.

These are evidence-grounded owning areas, not an instruction to create an invented file/schema.
Use the current owning service when the implementation checkout differs.

**Authority and evidence map.**

| Input                                                                              | Classification                                             | Use and limitation                                                                                                                         |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Router; current committed source/tests; fresh readback                             | Current authority and implementation evidence              | Establish current boundaries and starting state; authoring changes no live key, role, setting or provider state.                           |
| October 8 meeting/PDF/images and October 9 owner corrections in this clarification | Confirmed product intent                                   | Establish the desired behavior in the requirement rows. New explicit corrections govern; historical screenshots are not operational proof. |
| Existing native suites and actual provider contracts                               | Compatibility and integration evidence                     | Reuse delivered behavior and exact provider semantics; absent inputs do not become assumed capabilities.                                   |
| November 7 rehearsal and accepted Q5                                               | Browser observation, committed source and confirmed intent | A saved same-sender choice is required, blank is valid, and the exact message determines its required facts.                               |

The November 9 “Lease Renewal Page” note and Q7 confirm automatic first-use setup,
per-sender ownership and an explicitly saved blank. `RenewalSenderSignatureForm.tsx`,
the sender-signature API and the existing choice store are the normal save path.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S224-1** — Attach versioned business presentation fields to a verified existing staff identity through an Admin-only service and clear UI labels.
- **ARCH-S224-2** — Support title, display name and optional approved business phone/hours through existing signature-compatible validation and an audited normal save.
- **ARCH-S224-3** — Resolve a profile only for the current managed sender, prefill the signature and show exact rich/plain preview in the composer.
- **ARCH-S224-4** — Record the signature version/content in the prepared message; later profile edits apply to new preparation and require the normal explicit schedule update to change an approved schedule.
- **ARCH-S224-5** — Preserve prior actor-owned signature values, make conflicts with Admin profile visible, and choose current profile for new prefill without rewriting prior snapshots.

- **ARCH-S224-6** — The sender identity and signature owner distinguish a saved blank from
  absent and unreadable state. Fail-first: an empty form cannot save setup or an absent
  signature can authorize an outgoing message.
- **ARCH-S224-7** — One exact-payload readiness decision is shared by the lease, composer,
  preview and final claim owners. Fail-first: an unused lease field blocks a path or a direct
  request bypasses a required input.
- **ARCH-S224-8** — Signature and required facts bind to immutable outgoing authorization.
  Fail-first: a changed sender or legacy snapshot without proof can reach a provider claim.

- **ARCH-S224-9** — One sender-bound setup/readiness and composition contract serves lease
  preview and Communications. Fail-first: a second actor with no saved choice sees
  another actor's structured footer in the active preview, or first composer entry
  lacks a direct setup path. Foreign legacy body/authorization handling is explicit.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S224-1** — Manage business title separately from access role. Changing a title such as Property Manager changes presentation only; Admin/Editor permissions and claims remain unchanged. Invalid or unknown staff identities cannot be assigned profiles.
- **BEH-S224-2** — Retain approved contact details without fabricating missing values. A blank optional field is omitted from the signature rather than replaced with a guessed number/hours; authorized changes persist after reload.
- **BEH-S224-3** — Use the responsible sender’s profile for future composition. Two staff users see their own correct signature; takeover loads the new responsible staff profile and never borrows another mailbox identity.
- **BEH-S224-4** — Keep prepared and approved message content stable. An Admin title change does not mutate a queued exact message or historical send; new composition can deliberately use the current profile.
- **BEH-S224-5** — Migrate existing retained signatures without losing useful staff data. Existing staff can inspect their prior signature and current profile; migration/retry cannot delete history or silently change a sent/approved payload.

- **BEH-S224-6** — A new sender saves blank once, returns to the same draft and proceeds
  when the required inputs are ready. Missing and unavailable states point to their
  remedies. Preview shows exactly the choice that was saved.
- **BEH-S224-7** — Copy and in-app editing work with incomplete information. Each outgoing
  route names only its required inputs and refuses consistently at the server. A held
  legacy schedule shows the reason and the existing review path.

- **BEH-S224-8** — A new sender reaches their setup from the first draft, saves filled
  or blank, and returns to the exact same work with the correct sender shown. Two
  users can work the same lease in sequence and distinguish current and prior senders.

**Human litmus outcome.**

### Staff business profiles and message signatures

**If this was built correctly:** A new staff member opens a prepared message, saves a blank
signature and returns to the same wording. They can resolve a missing recipient or lease
fact from the action that needs it. They can edit or copy their work. Final review shows
the exact outgoing message and its destination.

- Model verdict: November 7 revision NOT RUN. The original profile contract has scoped
  engineering and delivery evidence in run `5b3dfb90`.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                      | Architecture outcome | Behavior outcome | Human litmus                                   | Deterministic evidence / falsification                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S224-1: Manage business title separately from access role.                     | `ARCH-S224-1`        | `BEH-S224-1`     | Staff business profiles and message signatures | `AC-S224-1`: Changing a title such as Property Manager changes presentation only; Admin/Editor permissions and claims remain unchanged. Invalid or unknown staff identities cannot be assigned profiles. |
| R-S224-2: Retain approved contact details without fabricating missing values.    | `ARCH-S224-2`        | `BEH-S224-2`     | Staff business profiles and message signatures | `AC-S224-2`: A blank optional field is omitted from the signature rather than replaced with a guessed number/hours; authorized changes persist after reload.                                             |
| R-S224-3: Use the responsible sender’s profile for future composition.           | `ARCH-S224-3`        | `BEH-S224-3`     | Staff business profiles and message signatures | `AC-S224-3`: Two staff users see their own correct signature; takeover loads the new responsible staff profile and never borrows another mailbox identity.                                               |
| R-S224-4: Keep prepared and approved message content stable.                     | `ARCH-S224-4`        | `BEH-S224-4`     | Staff business profiles and message signatures | `AC-S224-4`: An Admin title change does not mutate a queued exact message or historical send; new composition can deliberately use the current profile.                                                  |
| R-S224-5: Migrate existing retained signatures without losing useful staff data. | `ARCH-S224-5`        | `BEH-S224-5`     | Staff business profiles and message signatures | `AC-S224-5`: Existing staff can inspect their prior signature and current profile; migration/retry cannot delete history or silently change a sent/approved payload.                                     |

Later requirements for November 7 intake 125 and November 9 intake 134. The rows
above retain the original October program's requirement identities.

| Requirement                                   | Architecture outcome     | Behavior outcome | Human litmus                                   | Deterministic evidence / falsification                                                    |
| --------------------------------------------- | ------------------------ | ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `R-S224-6` saved sender setup                 | ARCH-S224-6              | BEH-S224-6       | Staff business profiles and message signatures | AC-S224-6. Compare absent, unreadable, retained, explicitly blank and wrong-sender cases. |
| `R-S224-7` message-specific inputs            | ARCH-S224-7              | BEH-S224-7       | Staff business profiles and message signatures | AC-S224-7. Exercise required and omitted facts for each message type.                     |
| `R-S224-8` outgoing admission                 | ARCH-S224-7, ARCH-S224-8 | BEH-S224-7       | Staff business profiles and message signatures | AC-S224-8. Exercise every supported action, exact claim and refusal.                      |
| `R-S224-9` existing drafts and schedules      | ARCH-S224-8              | BEH-S224-7       | Staff business profiles and message signatures | AC-S224-9. Use snapshots with and without provable readiness and a changed sender.        |
| `R-S224-10` first use and saved readback      | ARCH-S224-6, ARCH-S224-9 | BEH-S224-8       | Staff business profiles and message signatures | AC-S224-10. First entry, direct edit, blank and failure paths.                            |
| `R-S224-11` sender-bound preview and recovery | ARCH-S224-8, ARCH-S224-9 | BEH-S224-8       | Staff business profiles and message signatures | AC-S224-11. Two actors, legacy body, takeover and immutable receipts.                     |

**Preservation set.**

Managed-domain identities, existing authentication/roles, own-sender signature ownership, prior message snapshots and signatures, ordinary profile access control and audit. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S224-1** — Falsify `ARCH-S224-1` / `BEH-S224-1`: Changing a title such as Property Manager changes presentation only; Admin/Editor permissions and claims remain unchanged. Invalid or unknown staff identities cannot be assigned profiles.
- **AC-S224-2** — Falsify `ARCH-S224-2` / `BEH-S224-2`: A blank optional field is omitted from the signature rather than replaced with a guessed number/hours; authorized changes persist after reload.
- **AC-S224-3** — Falsify `ARCH-S224-3` / `BEH-S224-3`: Two staff users see their own correct signature; takeover loads the new responsible staff profile and never borrows another mailbox identity.
- **AC-S224-4** — Falsify `ARCH-S224-4` / `BEH-S224-4`: An Admin title change does not mutate a queued exact message or historical send; new composition can deliberately use the current profile.
- **AC-S224-5** — Falsify `ARCH-S224-5` / `BEH-S224-5`: Existing staff can inspect their prior signature and current profile; migration/retry cannot delete history or silently change a sent/approved payload.

- **AC-S224-6** — As a managed sender with no setup, inspect the same blocked action on
  the lease and in Communications. Save blank, reload, and compare preview and adapter
  payload. Exercise failed save, unavailable read and another sender. Confirm identity
  and permissions (ARCH-S224-6, BEH-S224-6).
- **AC-S224-7** — Check each existing message type. Omit an optional detail and an
  unused resource. Remove a required recipient, rent, offer term, resource or selected
  attachment in its applicable scenario. Only applicable deficiencies hold the action
  and each points to its owner. Copy and edit in every case (ARCH-S224-7, BEH-S224-7).
- **AC-S224-8** — Use deterministic adapters for Send, Schedule, Resume, linked reply and
  Gmail draft creation/replacement. Missing setup or a required fact refuses a direct
  request before an effect. Change inputs after exact review and verify conflict. With
  a saved blank and ready facts, assert exact confirmation, identical authorized and
  resulting content, one effect and its receipt (ARCH-S224-7, ARCH-S224-8).
- **AC-S224-9** — Dispatch a previously authorized and provably ready snapshot with its
  approved bytes. Hold a snapshot that lacks required proof. Verify sender takeover,
  pause, Resume, restart and ambiguous-attempt recovery preserve history and require
  the applicable fresh review (ARCH-S224-8, BEH-S224-7).

- **AC-S224-10** — Enter the lease and Communications as a staff sender with missing,
  unreadable, filled and saved blank choice. Check the first-use setup and later
  edit link, readback after reload, cancel/return to exact draft, denied cross-user
  update, failed save and retry. Assert the actual outgoing server guard while setup
  is unresolved, including direct API attempts, and keep in-app editing and Copy usable.
- **AC-S224-11** — Seed sender A's structured footer and an authored body with an embedded
  previous footer. Open as authorized sender B with no choice, a blank and a filled
  choice. Confirm the active preview, plain/rich exact review and app-owned draft
  use the valid responsible identity. Check explicit takeover/review, unresolved
  legacy content hold, rebuild/edit, and no changes to sender A's historical bytes.
  Exercise immediate and recurring S189 messages with a mismatched signature and a
  changed sender between review and claim. Assert no provider call on refusal.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Consumes S188 sender identity, S187 exact preview, and the existing authorization, dispatch
and draft owners. S183 preserves role distinction. This suite supplies the shared readiness
contract to S162 and S249.

**Standalone delivery contract.**

- **Deliverable now:** A future authorized implementation can produce the complete bounded
  behavior, migration/refusal/recovery paths, tests and documentation for the requirements above.
  This authoring deliverable is the finalized registered specification only.
- **Consumes, but does not assume:** Neighboring projections and actual runtime inputs named above;
  unavailable values remain explicitly unset/blocked, never fabricated.
- **Externally blocked effect:** Missing actual provider connection, capability, exact activation or
  reviewed operational input blocks only its named effect. Record the affected acceptance case;
  complete independent behavior and do not call the whole suite operationally complete prematurely.
- **Produces for downstream suites:** The stated behavior, stable owning-service contracts and
  separate architecture, behavior, preservation and integration evidence.

**Verification and delivery contract.**

1. Re-verify current source/live state and the existing preservation checks before implementation.
   Materialize an expected-failing check for each missing requirement; already delivered behavior
   gets a passing preservation baseline, not a manufactured failure.
2. Verify each `ARCH-S224-*`, `BEH-S224-*` and `AC-S224-*` scenario, including the row's failure,
   boundary and recovery case. Use compiled browser checks for material UI journeys and backend
   tests for real access/intent/persistence boundaries; adapter tests do not prove live effects.
3. Run the native canonical verification and authoring/reference checks required by the affected
   slice. Run `bash scripts/verify.sh` for implementation delivery, inspect the mechanical diff and
   preserve privacy, exact provider gates and unrelated work. No deployment is part of authoring.
4. Report `ALL_GATES_GREEN` only for the actual verified scope; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` for an exact unresolved input/authority after independent
   work is complete. Keep code readiness, live proof and human observation separately truthful.

**Ordered prompt sequence.**

1. Read this contract, S183 and its named dependencies; verify the real source and baseline.
2. Establish each architecture/behavior falsification and the independent preservation gate.
3. Implement the bounded owning-service and UI changes with recovery/migration as required.
4. Exercise all requirement rows, verify integration and report exact readiness/limitations.
5. Update the existing native state/evidence only during authorized implementation; deliver through
   the existing process only when the owner has explicitly instructed execution.

**Deletion/merge recommendation.**

Do not retire this unimplemented suite. After verified delivery, consolidate only when each
requirement, preservation obligation and remaining dependency has a current code/test/fact owner;
retain historical failure/effect meaning and the native intake status.
