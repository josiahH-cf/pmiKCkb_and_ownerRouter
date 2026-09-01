<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: maintenance-intake-v1 -->

# S47 — Tokenized resident maintenance intake

> Status: Complete and deployed for Live tokenized app intake, quarantine, and staff review; RentVine
> work-order chat synchronization and resident-reply drafting are separate S100 scope.

**Goal.**

Accept one bounded maintenance report through a staff-issued link, quarantine it as unverified, and
let an authorized staff member promote or dismiss it without creating any provider effect.

**Current state / intended end state.**

The deployed Live flow lets a managed staff Editor with Maintenance Space access mint a signed
property-scoped intake token. A token bearer may submit bounded text to the one public intake route.
The route writes only an unverified quarantine record after token, replay, revocation, rate, and size
checks. An authorized staff member may atomically promote that record to one app maintenance ticket
or dismiss it with a reason. This suite preserves that behavior as the complete S47 boundary.

The invitation-oriented inert seam in `lib/maintenance/rentvine-resident-channel.ts` is not an active
S47 provider contract and is not a dependency for tokenized intake. S100 replaces that obsolete
future direction with an exact manual RentVine work-order-chat sync and a separate unsent Gmail
resident-reply draft. S47 neither waits for nor infers a RentVine invitation, webhook, or reply API.

**Actors and entry conditions.**

- A managed Editor with `edit` capability and Maintenance Space access may mint a Live token and may
  promote or dismiss quarantined intake. Token minting refuses when the maintenance-intake secrets
  or property key are unavailable or invalid.
- An external resident or reporter may submit only while holding an unexpired, unrevoked,
  property-scoped HMAC token. Possession of the token grants only the bounded quarantine submission;
  it grants no app session, ticket access, unit authority, or provider authority.
- A single-use token is valid for at most seven days and is consumed once. A deliberately reusable
  signage token is valid for at most thirty days and remains subject to the tighter configured daily
  cap. The current property revocation epoch invalidates older tokens.
- Production accepts only `data_mode=live`. Retired Test intake cannot be submitted, promoted, or
  dismissed.

**What it is / how it functions.**

Staff minting returns the exact property key, expiry, single-use state, public submit path, and token
header. The public route accepts `summary`, optional `description`, and optional `contact` under a
16-KiB request-body ceiling. It performs the configured-availability check, token lookup, IP-based
burst pre-gate, HMAC/expiry/epoch validation, bounded body read, strict shape validation, sanitation,
transactional nonce and per-property daily-cap enforcement, then writes one unverified record plus
one activity record. Its `202` response uses a fresh random reference rather than an internal record
id or token nonce.

The quarantine record is not a verified resident, unit, ticket, or RentVine work order. Promotion is
one transaction that creates one Live app ticket and its activity record while changing the intake
state to `promoted`. Staff may confirm an exact unit during promotion. Without that confirmation, the
ticket keeps `unit=null` and a visible `Needs Verification` label. Dismissal changes the intake to
`dismissed`, records the reviewer and reason, and creates no ticket. A second or concurrent promote
or dismiss refuses with no duplicate ticket.

**In scope / out of scope.**

In scope: token minting; expiry and property revocation; single-use replay protection; reusable-link
and daily caps; bounded, sanitized text intake; generic public errors; quarantine retention; staff
review; optional exact-unit confirmation; atomic promotion or dismissal; and app activity evidence.

Out of scope: public file or image upload; resident identity verification from free-form contact
text; automatic unit matching as authority; RentVine chat reads or writes; RentVine work-order
creation or status changes; Gmail drafts or sends; notifications derived from provider chat; and the
obsolete RentVine invitation lifecycle. S100 owns provider chat sync and a resident-reply draft.

**Open questions & assumptions.**

No material product question remains in S47. Configured cap values and secrets remain environment
inputs and must fail closed when absent; their absence does not widen or redesign the contract.

**Cross-product impacts.**

Maintenance page access, public intake routes, quarantine and activity collections, app maintenance
tickets, unit verification, product-record retention, rate/cost controls, Firestore rules, and S100's
downstream mapped-ticket entry condition.

**Authority and evidence map.**

| Input                                                            | Classification                | Use and limitation                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md`, and current environment descriptor | Authority / current truth     | Production is Live-only; no public input may create a provider effect, and sample or Test data may not become a production record or draft.                            |
| Public intake token/route, quarantine writer, and review store   | Verified implementation truth | Establish the current token lifetimes, 16-KiB body ceiling, quarantine-only public write, transactional replay/cap checks, and atomic promote/dismiss behavior.        |
| Current maintenance page, role guards, and Firestore tests       | Verification baseline         | Establish Maintenance Space and `read`/`edit` boundaries without converting page visibility into write authority.                                                      |
| S100                                                             | Separate desired contract     | Owns manual RentVine work-order-chat sync and the human-reviewed resident-reply Gmail draft; it cannot be used to reinterpret public intake as verified provider data. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S47-1** — The public route remains structurally isolated from authenticated ticket writers,
  RentVine, Gmail, and provider execution. A negative-import/effect-spy check fails if the public path
  can import or construct any of them.
- **ARCH-S47-2** — Nonce consumption, property/day counting, intake creation, and activity evidence
  remain transactionally bounded. Concurrency tests prove two uses of one single-use token cannot
  create two quarantine records.
- **ARCH-S47-3** — Promotion creates the app ticket, ticket activity, and promoted intake state in
  one transaction. Dismissal writes only dismissal state and activity. A transaction-failure test
  proves neither path can leave a partial transition.
- **ARCH-S47-4** — Token, nonce, unreviewed-intake, and public response identities remain separated;
  secrets, raw IP addresses, token nonces, and internal document ids never enter the public response
  or ordinary logs.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S47-1** — A valid token and bounded valid report return `202 received` with an opaque public
  reference and create exactly one unverified quarantine item, never a ticket or provider record.
- **BEH-S47-2** — Missing/invalid/expired/revoked tokens, replay, retired data mode, oversize or
  malformed bodies, and exhausted burst/daily caps return their existing bounded status and generic
  copy without revealing which secret, record, or identity failed.
- **BEH-S47-3** — An authorized Editor can promote an unreviewed item once, with a confirmed unit or
  `Needs Verification`, or dismiss it once with a reason. Unauthorized, missing, or already-reviewed
  items refuse without another ticket or transition.
- **BEH-S47-4** — Loading or using the intake flow performs no RentVine call, chat read marker,
  work-order/status mutation, Gmail draft, or message send.

**Human litmus outcome.**

### Submit and review one maintenance request

**If this was built correctly:** Staff creates a property-specific intake link. A resident uses it to
submit a short issue and receives a neutral confirmation. Staff sees the report in an unverified
queue and either confirms the unit and promotes it once or dismisses it with a reason. Nothing is
created in RentVine or Gmail.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with bounded-route,
  transaction, role, isolation, and provider-spy evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use
  `Human verdict: NOT RUN — no human observer` and continue unless the owner explicitly makes that
  verdict a completion gate.

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome       | Behavior outcome         | Human litmus                              | Deterministic evidence / falsification                                                                                             |
| -------------------------------------------------------- | -------------------------- | ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Public submissions reach quarantine only                 | `ARCH-S47-1`, `ARCH-S47-4` | `BEH-S47-1`, `BEH-S47-4` | Submit and review one maintenance request | Negative-import scan and provider/ticket spies prove the public writer can touch only quarantine/activity/cap records.             |
| Tokens, replay, revocation, bounds, and caps fail closed | `ARCH-S47-2`, `ARCH-S47-4` | `BEH-S47-1`, `BEH-S47-2` | Submit and review one maintenance request | Token time/epoch, concurrent replay, 16-KiB boundary, malformed-body, and cap tables prove one bounded outcome and generic errors. |
| Promotion/dismissal is authorized and atomic             | `ARCH-S47-3`               | `BEH-S47-3`              | Submit and review one maintenance request | Role/Space, double-click, concurrent transition, transaction-failure, confirmed-unit, and unverified-unit tests.                   |
| S47 creates no external effect                           | `ARCH-S47-1`               | `BEH-S47-4`              | Submit and review one maintenance request | Static imports and RentVine/Gmail/action-executor spies remain zero across mint, submit, review, promote, and dismiss.             |

**Preservation set.**

Maintenance page read/edit guards; intake token, client-IP, rate-limit, sanitation, public-route,
quarantine, review-route, review-store, Firestore-rule, ticket, unit matcher, and Live-only retirement
tests remain green as a separate gate. S100 tests must not be used to substitute for S47 preservation.

**Adversarial acceptance checks.**

- **AC-S47-1** — `ARCH-S47-1/4` and `BEH-S47-1/4` prove the only unauthenticated write remains the
  quarantine path and cannot import ticket creation, RentVine, Gmail, or generic execution.
- **AC-S47-2** — `ARCH-S47-2` and `BEH-S47-2` cover expired, revoked, replayed, reusable, concurrent,
  oversize, malformed, burst-limited, and property/day-limited cases with no information oracle.
- **AC-S47-3** — `ARCH-S47-3` and `BEH-S47-3` prove one atomic staff disposition, including a
  transaction abort and two concurrent reviews of the same item.
- **AC-S47-4** — Free-form `contact` never becomes a verified resident, recipient, unit, provider id,
  or draft address.
- **AC-S47-5** — A Test/legacy record cannot be submitted, promoted, or dismissed into current Live
  product state.

**Forbidden actions / hard gates.**

No provider call, work-order creation/status change, resident invitation, chat sync, Gmail draft or
send, public attachment, guessed resident/unit, direct promotion by a token bearer, Test-to-Live
promotion, secret/token/raw-IP logging, or exposure of internal ids. Do not preserve the obsolete
invitation seam as an S47 dependency or claim that it implements S100.

**Dependencies / sequencing.**

S47 is the deployed app-intake foundation and has no provider dependency. S100 may consume an exact
staff-reviewed app ticket and verified provider bindings, but S100 must not change S47's public route,
turn unverified intake into provider truth, or make sync/draft availability a condition for intake.

**Standalone delivery contract.**

- **Deliverable now:** Preserve the complete tokenized Live intake, quarantine, and staff disposition
  contract and retire S47's obsolete invitation-provider ambiguity in documentation and tests.
- **Consumes, but does not assume:** Runtime secrets, caps, retention policy, and Firestore are current
  environment inputs; absence yields the existing unavailable/refusal state.
- **Externally blocked effect:** None. S47 has no external provider effect. RentVine chat and Gmail
  resident drafts are S100 gates, not S47 blockers.
- **Produces for downstream suites:** One reviewed Live app ticket with explicit unit-verification
  state and immutable intake/activity provenance; it does not produce a resident or work-order map.

**Verification and delivery contract.**

1. Re-read the current token, public-route, quarantine, review, and rules contracts and record the
   preservation baseline before any S47 edit.
2. Run the focused token, public-route, rate, sanitation, quarantine, review, transaction,
   Firestore-rule, role/Space, Live-only, and negative-import/effect-spy checks.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII, public error
   bodies, retention, provider imports, exact action gates, and scope traceability.
4. Report `ALL_GATES_GREEN` only when all S47 architecture, behavior, adversarial, and preservation
   gates pass; use `BLOCKED` only after independent closed-safe work is complete and one exact runtime
   prerequisite remains unavailable. `BUDGET_EXHAUSTED` is available only with an explicit owner-set
   budget. An unavailable runtime secret does not justify widening the route or reviving the
   invitation seam.

**Ordered prompt sequence.**

1. Re-verify tokenized intake and freeze its isolation, role, transaction, and Live-only baselines.
2. Materialize any missing negative-import/provider-spy and concurrent replay/review checks.
3. Preserve the bounded intake and disposition behavior; remove only obsolete S47 invitation
   ownership or ambiguity.
4. Run focused and canonical verification, reconcile current docs, and ship only through the
   authorized release path.

**Deletion/merge recommendation.**

Retain S47 as the active tokenized-intake operating contract until its boundary is fully represented
in current product/engineering documentation and regression tests. Do not merge it into S100: public
quarantine intake and consequential provider chat sync have different actors, authority, and effects.
