<!-- spec-shape: overhaul-v1 -->

# S47 — Tokenized resident Maintenance intake and RentVine channel seam

> New 2026-07-28. Implements D-10. Build the app-plane fully; only the documented RentVine
> interactive channel contract may block that provider activation.
> Amended 2026-07-29 (production-unblock audit, live-production phase). Adds D16 — a resident
> privacy notice plus a named PMI KC contact on the intake surface — and D17, where the owner
> CHANGED the recommendation: the resident text channel is RentVine's own resident channel, so this
> suite builds no standalone SMS integration. Activation still requires documented RentVine
> channel/consent/opt-out semantics; this spec makes no unsupported legal allocation. Also promotes the
> approved resident wording from an unrecorded assumption to a NAMED content dependency. New checks:
> AC-S47-9, AC-S47-10, AC-S47-11.

**Goal.** A resident can report and clarify a maintenance issue from a short-lived, single-purpose
link without creating another account. The conversation asks approved troubleshooting questions,
requires appropriate photos, presents the approved possible-charge acknowledgement, and submits a
clear review packet to staff. Before any of that, the resident can see in plain language what is
being collected, who receives it, how long it is kept, and how to reach a named human at PMI KC
instead — because this is the only unauthenticated, resident-facing data-collection point the
product has. The same intake can be initiated through RentVine's own resident portal/text channel
once RentVine confirms the supported interactive endpoint; the resident is already a RentVine
platform user, so this suite never becomes a messaging carrier itself. Until that endpoint is
documented, the tokenized web intake and staff review flow are complete, and the adapter stops at
one named seam rather than guessing an endpoint.

**What it is / how it functions.**

- **Single-purpose invitation.** Staff opens a ticket/intake preview and exact-confirms creation of
  an opaque resident link. The token is random, hashed at rest, bound to one intake/ticket,
  resident/contact reference, environment, purpose, issue category/version, expiry, and revocation
  state. The plaintext appears only in the creation response or approved human-initiated delivery
  path, is `no-store`, and never enters logs/audit/git.
- **No-second-login session.** Redeeming a valid token creates a narrowly scoped, secure,
  same-site/HTTP-only intake session. It cannot enumerate tickets, view staff notes/provider
  diagnostics, change assignments/status, access another intake, or establish a staff/Vendor
  session. Rate limit, attempt bounds, expiry, revoke, and replay handling fail closed.
- **Approved conversation graph.** Category/version selects a deterministic, Admin-published
  troubleshooting graph. Questions can branch on resident answers but an AI cannot invent policy,
  diagnose conclusively, decide urgency, or skip required safety escalation. Emergency/safety
  answers stop normal troubleshooting and display approved emergency directions plus staff
  escalation behavior.
- **Photos.** The graph declares whether photos are required/optional/not appropriate and provides
  plain guidance. Upload enforces type/size/malware/sensitivity rules and stores through the approved
  Maintenance image boundary; photos never enter the KB index. A failed upload is recoverable and
  never silently marks the requirement complete.
- **Possible-charge acknowledgement.** Render the exact Admin-published, versioned wording and a
  required acknowledgement when the graph calls for it. Record wording version, time, intake, and
  acknowledgement only. It is not an admission, price, payment authorization, or automatic
  chargeback decision; missing approved wording blocks that step rather than generating legal copy.
- **Resident notice slot (D16).** The intake surface carries a short notice above the submit control
  and a named PMI KC contact, rendered from the SAME publication primitive as the troubleshooting and
  possible-charge wording — an Admin-published, immutably versioned, rollback-able content record
  (`lib/publication/*`, S21), not a string literal in a component. The slot is a structured record
  with named required parts, so the loop can build and test it without writing a word of the copy:
  (a) WHAT is collected — the resident's free-text problem description, an optional contact string,
  any photos, and a salted hash of the submitting IP address; (b) WHO receives it — PMI KC staff
  reviewing maintenance, and that it is not a monitored emergency line; (c) HOW LONG — the intake
  record's own retention, which is a code fact, not a guess: `lib/firestore/maintenance-unverified-intake.ts`
  sets `expires_at` from `INTAKE_RETENTION_MS` (90 days of un-triaged intake) and the single-use
  nonce from `NONCE_RETENTION_MS` (30 days); (d) HOW TO REACH A HUMAN INSTEAD — a named PMI KC
  contact route. The optional resident-supplied `contact` value is a bounded free-form return-contact
  string; it is not a phone-number field, an SMS opt-in, or the required PMI KC fallback contact.
  The fallback contact is separately configured from an owner-approved non-secret URL/address so the
  closed-state shell can always show it even when no notice version is Active. Production activation
  refuses if that fallback is absent. Today none of this exists anywhere: a search for
  privacy/consent/terms copy across
  `app/` and `components/` returns no notice, and `app/maintenance/page.tsx` is the staff desk, not a
  resident surface. The slot FAILS CLOSED exactly like the possible-charge wording: in Production,
  an intake whose notice slot has no Active approved version refuses to render the resident form and
  shows the independently configured reach-a-human path only — it never renders draft, placeholder, sample, or
  model-generated text styled as approved copy, and no acceptance test may assert on invented
  wording. Demo may render a Demo-labeled sample that is visibly marked as not the approved notice.
  Whether the retention numbers above are the ones PMI KC wants disclosed is a content question for
  the wording owner; the slot renders whatever the approved record says and the code enforces
  whatever the retention constants say, and a test pins that the two are surfaced from the same
  place rather than drifting.
- **The resident text channel is RentVine's, not ours (D17).** The owner ruled that resident text
  messages go through the RentVine route, so this suite neither builds nor plans a direct SMS/carrier
  integration, a phone-number-specific field, or a PMI KC carrier transport. That product choice does
  not prove who bears consent or messaging-compliance responsibility. The RentVine adapter activates
  only after provider-contract evidence documents the account/channel mapping, consent basis,
  opt-out behavior, permitted interactive use, and which records/receipts PMI KC must retain. It
  reaches residents ONLY through that documented RentVine resident portal/text endpoint, mapping to
  the RentVine-side resident account. If those semantics are never documented, the channel stays
  unactivated — S47 never substitutes a carrier or guesses a legal conclusion. No `sms.*` Action
  Registry key is created, seeded, or flipped by this suite.
- **Review and submit.** Before submission, show answers/photos/acknowledgement in a resident-safe
  summary. One submit creates/updates one app-plane review packet and returns a reference. Staff sees
  a bounded `Resident response ready` item in the Maintenance workspace, reviews it, and explicitly
  decides next action. Resident resubmission follows a defined version/reopen rule, never overwrites
  staff-reviewed history silently.
- **RentVine channel adapter.** Define a provider-neutral invitation/conversation event interface and
  a RentVine implementation using only documented portal/text semantics — RentVine's resident
  channel, per D17, never a carrier. It maps provider identity and delivery receipt to the app intake
  without putting the bearer token in durable provider/log evidence. Inbound events are
  signed/verified, idempotent, replay-safe, and reconcile to one intake.
- **Buildable now (app-plane).** Token lifecycle, resident session, published question/charge
  content, the D16 notice slot and its fail-closed render, conversation graph,
  photo/acknowledgement/submission, staff review, Demo fixtures, security/accessibility tests, and a
  provider-neutral adapter contract.
- **Build to the seam (live provider).** Implement the RentVine adapter, webhook/event validation,
  mapping, idempotency, receipts/readback, monitoring, kill switch, and rollback/correction against
  verified documentation or vendor-provided examples. Do not stop at a fake provider; if exact
  interactive semantics are absent, leave only the transport method unresolved.
- **Owner dependency (the one flip).** RentVine/vendor supplies or confirms the exact supported
  resident portal/text invitation plus interactive reply/webhook endpoint semantics and the
  authorized account/credential mapping, including provider-contract evidence for consent, opt-out,
  permitted use, and required records. After it is documented and configured, the routine
  reviewed gate/allowlist/tests activate that channel. D17 does not change this dependency; it only
  fixes that this IS the resident text route, so there is no second messaging dependency to chase.
- **Named content dependency (distinct from the endpoint).** PMI KC supplies the APPROVED RESIDENT
  WORDING: the D16 privacy/notice text plus the named PMI KC contact, an independently configured
  non-secret fallback contact route for the closed state, and the troubleshooting,
  emergency-direction, and possible-charge copy the graph publishes. The audit found this to be a
  real dependency that the blocker ledger did not carry, so record it as a NAMED item alongside the
  RentVine endpoint rather than leaving it inside a `_Client-owned:_` assumption. It is a CONTENT
  dependency, not an activation flip: it needs no credential, endpoint, scope, or deploy — only an
  Admin publishing approved text through the existing publication path. The two dependencies are
  independent and each fails closed on its own: absent wording blocks only the wording-dependent
  steps (the resident form render in Production, the acknowledgement step), and absent RentVine
  semantics blocks only the channel. Neither blocks the tokenized web intake's build, its tests, its
  staff review flow, or the other dependency. The loop hands back exactly these two named items and
  defers nothing else. The shipping slice is what closes the ledger gap the audit found: it ensures
  the Named external evidence list in `docs/loop-state.md` carries an "S47 approved resident
  wording" row beside the S47 RentVine channel row that list already had at audit time, and adds a
  matching confirm-with-default row to `docs/client-checklist.md`, so the wording is tracked as a
  blocker rather than discovered on the day a real resident opens the link.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-10):_ channel-independent tokenized intake is the product; RentVine is the
  preferred adapter seam.
- _Answered 2026-07-28:_ no second resident login is required.
- _Assumption:_ staff-generated copy/link delivery can support app-plane acceptance before the
  RentVine channel activates; every actual client-facing delivery remains human-initiated and
  exact-confirmed.
- _Assumption:_ approved troubleshooting and charge wording use S21-style versioning/publication.
  The executor may reuse the existing policy store if it has equal validation/version/rollback.
- _Open external evidence B-01:_ exact RentVine interactive endpoint semantics. This is the sole
  provider activation blocker, not a blocker to the web intake or staff review.
- _Answered 2026-07-29 (D16):_ a short notice plus a named PMI KC contact lands on the intake surface
  as part of S47 — not after the first live week. The loop builds the slot, the required parts, the
  fail-closed render, and the tests; PMI KC supplies the words.
- _Answered 2026-07-29 (D17, owner CHANGED the recommendation):_ the recommendation was to defer any
  SMS channel until a consent and opt-out design exists. The owner ruled instead that the text
  messages go through the RentVine route and no standalone PMI KC SMS carrier product is built.
  Consequence for this spec: the resident channel uses only a documented RentVine interactive
  endpoint and no direct-SMS subsystem or `sms.*` action key is added. Provider-contract evidence
  for consent, opt-out, permitted use, and required records remains an activation requirement; the
  product choice is not treated as a legal conclusion.
- _Client-owned (NAMED content dependency, not a soft assumption):_ the APPROVED RESIDENT WORDING —
  the D16 notice text, the named PMI KC contact, the separately configured fallback route, and the
  troubleshooting/emergency/possible-charge copy. The audit found this dependency absent from the
  blocker ledger; the shipping slice adds it.
  Confirm-with-default framing: if PMI KC does not supply wording, Production keeps the resident form
  closed rather than shipping generated copy.
- _Client-owned:_ RentVine credential/endpoint confirmation through normal secure setup.
- _Assumption:_ the notice discloses the retention the code already enforces — 90 days for an
  un-triaged intake record and 30 days for the single-use nonce
  (`lib/firestore/maintenance-unverified-intake.ts`). If PMI KC wants different retention, the
  constants change with the wording in the same slice so the disclosure and the behavior never
  diverge. Record as a `Q-`/`A-` row in `docs/facts.md` at build time.
- _Assumption:_ the notice is presented before submission on every entry path — the tokenized web
  intake and, once activated, the RentVine-initiated one — so a resident who arrives from the
  RentVine channel is not shown less than a resident who arrives from a staff link.
- Decision-complete for build-to-seam.

**Cross-product impacts.**

- Likely new boundaries include resident token/session services and routes, conversation schema,
  published intake content, resident UI, review packet persistence, staff review presenter, photo
  storage reuse, RentVine adapter/webhook, receipts/monitoring, and Firestore rules.
- Reuses S21 publication, S22 identity separation principles (without making a Vendor/staff
  principal), S26 Maintenance action contracts, S40 environment, S44 links, and S46 workspace.
- The eventual RentVine effect gets its own narrow Registry key(s); it never opens generic
  messaging or arbitrary resident contact.
- D16 touches the real collection path already shipped as `F-MAINT-INTAKE-PUBLIC`:
  `app/api/maintenance/intake/public/route.ts` (the app's one unauthenticated write endpoint, whose
  `PublicIntakeBodySchema` accepts `summary` / `description` / `contact`),
  `lib/firestore/maintenance-unverified-intake.ts` (persists `contact`, `ip_hash`, and `expires_at`
  from `INTAKE_RETENTION_MS`), `lib/maintenance/intake-sanitize.ts`,
  `lib/maintenance/intake-client-ip.ts` (the salted IP hash the notice must disclose), and the
  staff-side review surface `components/maintenance/UnverifiedIntakeReview.tsx` /
  `app/maintenance/page.tsx`. The notice record itself is new content under `lib/publication/*`.
- D17 records a decision rather than moving code: this suite has no SMS module to delete, and none
  may be added. The scope of D17 as applied here is the RESIDENT text channel that S47 owns; any
  other suite's messaging row remains that suite's record, and S47 neither activates nor depends on
  one.
- Consumes the S40 environment classification for the Production-versus-Demo notice behavior, so a
  Demo sample notice can never render in Production.

**Adversarial acceptance checks.**

- **AC-S47-1** — A valid token establishes access only to its one intake; expired, revoked, reused
  beyond policy, malformed, cross-environment, wrong-purpose, or enumerated tokens reveal no ticket
  existence and create no session/write. Plaintext token is absent from storage/log/audit.
  _Verify:_ token/session/security/redaction tests.
- **AC-S47-2** — The published graph asks the required branch, stops on emergency conditions, cannot
  skip required photos/acknowledgement, and never lets model output alter policy, urgency, legal
  wording, or completion gates. _Verify:_ graph/property and prompt-bypass tests.
- **AC-S47-3** — Photo upload enforces limits/scanning/storage binding, remains excluded from the KB
  index, and a failed scan/upload leaves the intake safely resumable. _Verify:_ photo, scanner,
  storage, and indexing sentinels.
- **AC-S47-4** — Possible-charge acknowledgement stores the exact published version/time and no
  amount/admission/payment authorization; absent/retired wording blocks acknowledgement and no copy
  is invented. _Verify:_ publication and schema/copy tests.
- **AC-S47-5** — One submit creates one immutable-versioned resident response/review item; retry is
  idempotent, staff review is explicit, and later resident edits cannot silently overwrite reviewed
  history. _Verify:_ concurrency and review lifecycle tests.
- **AC-S47-6** — Demo completes the whole intake/review with Demo data and zero Live client. The
  built RentVine adapter refuses before construction while its exact endpoint/mapping is absent;
  after stubbed documented contract injection, signature/replay/idempotency/receipt/readback/kill
  switch tests pass. _Verify:_ adapter contract and provider-construction sentinels.
- **AC-S47-7** — Resident UI is mobile-first, keyboard/screen-reader usable, plain-language,
  resumable, and exposes no staff shell, provider diagnostics, other resident data, or unsafe
  customer content in URLs. _Verify:_ 390×844 browser and object-level authorization tests.
- **AC-S47-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:spec-traceability`, and
  `npm run build` pass; keep auth/session, S26, upload, publication, redaction, idempotency,
  environment, and action-gate sentinels green.
- **AC-S47-9** (D16 notice renders) — With an Active approved notice version published, the resident
  intake surface renders, above the submit control and before any field is submitted, the four
  required parts as separate addressable elements: what is collected (naming the description, the
  optional bounded return-contact string, photos, and the stored IP hash), who receives it, the retention period, and a
  named PMI KC contact that is reachable as a link or a rendered contact string. The rendered text is
  byte-identical to the published record; no test fixture supplies wording that also appears in
  product code. The rendered retention string is derived from the same constants the writer uses, so
  changing `INTAKE_RETENTION_MS` without republishing fails a drift test rather than shipping a false
  disclosure. At 390×844 the notice is readable without horizontal overflow and is reachable by
  keyboard and screen reader before the submit control. _Verify:_
  `npm test -- tests/unit/maintenance-intake-public-route.test.ts`, the notice publication/render
  tests, and the 390×844 authenticated-free resident browser task; keep the publication and redaction
  sentinels green.
- **AC-S47-10** (D16 fail-closed, no invented copy) — In Production, an intake whose notice slot has
  no Active approved version renders no resident form and no submit control; the response shows the
  independently configured reach-a-human path and returns a non-2xx or an explicitly closed state,
  and `POST` to the intake
  endpoint in that condition creates zero `maintenance_unverified_intake` records. A retired or
  draft-only version behaves the same as absent. A Demo-mode notice sample renders only under the
  Demo environment classification, carries a visible Demo label, and a Production render of that
  sample record is refused. A negative test asserts that no notice, contact, or consent string is
  produced by a model, template default, or hard-coded fallback anywhere in `app/` or `components/`.
  _Verify:_ notice publication/environment tests, `npm run test:firestore`; keep the S40 environment
  and S21 publication sentinels green.
- **AC-S47-11** (D17 RentVine-only channel, two independent dependencies) — A negative-import and
  configuration test shows the resident text path resolves only through the RentVine adapter: no
  carrier/SMS SDK is imported, no phone-number-specific field exists on any resident schema or form,
  and the Action Registry seed contains no `sms.*` key added by this suite. The adapter refuses
  activation unless a documented provider-contract reference covers account mapping, consent basis,
  opt-out semantics, permitted interactive use, and required receipts/records. Dependency independence
  is observable: with RentVine endpoint
  configuration absent but approved wording present, the tokenized web intake completes end to end
  and only the channel refuses before construction; with wording absent but RentVine configuration
  present, the channel adapter still constructs and its signature/replay/idempotency tests pass while
  only the resident form stays closed. Neither absence degrades staff review. _Verify:_
  `npm test -- tests/unit/route-auth-boundary.test.ts`, the adapter contract and
  provider-construction sentinels, and the Registry seed/allowlist pinned tests.

**Forbidden actions / hard gates.** Never use a guessed RentVine endpoint or browser automation as
the channel contract. Never log/store a plaintext bearer token, expose an intake by enumeration, or
turn the token into a staff/Vendor identity. Never let AI invent troubleshooting policy, emergency
instructions, legal/charge wording, diagnosis, urgency, price, or charge decision — and per D16 that
now explicitly includes the privacy notice, the consent framing, and the named contact: a
placeholder, sample, drafted, or model-generated notice rendered to a resident as though approved is
itself a falsification, and a Production intake with no approved notice must close the form rather
than collect. Never present a Demo sample notice outside the Demo environment. Never build a
standalone SMS or carrier integration, collect a resident phone number for direct messaging, or add
an `sms.*` Registry key under this suite: per D17 the resident text channel is RentVine's and is
reached only through its documented interactive endpoint. Never infer from that routing choice that
RentVine bears every consent/compliance duty; activation requires the provider-contract evidence
named above. Never let the RentVine endpoint/contract dependency and the approved-wording/fallback
dependency be collapsed into one blocker or used to excuse each other. Resident photos never enter
retrieval/indexing. No autonomous CLIENT-facing invite/send; exact human confirmation remains
required (internal-staff notifications may auto-send per `D-AUTOMATION-LINE`, and generic
non-workflow `gmail.message.send` stays Registry-closed). The live channel gate stays false until
endpoint, credential, mapping, signature, receipt, monitoring, and rollback evidence exist, then both
allowlists and pinned tests change in the same reviewed slice. Preserve the standing NEVERs: no
personal account in any auth path; managed identity and secrets in Secret Manager; no secrets, PII,
or guessed endpoint in git; every live effect one-attempt, idempotent, receipted, and reversible,
with every client-facing send OR system-of-record write additionally human-confirmed. Routine
application deploy, smoke, and traffic promotion may run under D05 after the full gate, fresh auth
and budget preflights, prior-revision capture, and rollback smoke; credentials, scopes, IAM/billing,
and destructive operations remain owner-run. This suite stays inside the production cost ceiling
defined by S52.

**Ordered prompt sequence.**

1. _Discovery:_ inspect existing token/API intake, staff review queue, photo store, publication,
   Maintenance schemas/actions, provider Registry, and RentVine docs/evidence; confirm B-01 rather
   than guessing.
2. _Understanding:_ pin the token/session threat model, conversation schema, emergency/photo/
   acknowledgement rules, review lifecycle, provider event mapping, and one external dependency.
3. _Build:_ implement the token lifecycle, resident session/UI, published graph/wording, photos,
   acknowledgement, idempotent submit, and staff review item with Demo fixtures.
4. _Build:_ D16 — add the notice content record to the publication path with its four named required
   parts, add the independently configured fallback contact used by the closed-state shell, render it
   above the submit control on every entry path, derive the retention string from
   `INTAKE_RETENTION_MS` so disclosure and behavior cannot drift, and make the Production render fail
   closed when no Active approved version exists. Write the AC-S47-9/AC-S47-10 failing tests first,
   including the negative test that no notice wording originates in `app/` or `components/`.
5. _Build:_ implement the provider-neutral adapter and all RentVine mapping/signature/idempotency/
   receipt/monitoring/rollback code possible from documented evidence; stop only at the missing
   endpoint/credential/contract values. Per D17, add no carrier path, no phone-number-specific field,
   and no `sms.*` Registry key; require a contract reference covering consent/opt-out/permitted use,
   and prove both properties with AC-S47-11.
6. _Verify:_ run AC-S47-1 through AC-S47-11 and falsify token leakage/replay/enumeration,
   cross-environment access, prompt policy bypass, unsafe upload, missing wording, duplicate submit,
   forged webhook, provider construction without config, a Production form rendering with no approved
   notice, a Demo sample notice leaking into Production, and either dependency being used to excuse
   the other.
7. _Gate:_ when and only when B-01 and secure mapping are documented, set the narrow RentVine action
   to approved/documented/`production_allowed:true`, update both executable allowlists and pinned
   Registry/risk tests, and run one authorized Live proof/readback. Otherwise record the exact seam.
   Publishing the approved notice is not a gate flip — it is an Admin publication action with no
   Registry entry.
8. _Owner:_ request exactly two named items and nothing else: the documented RentVine
   semantics/credential mapping plus provider-contract evidence, and the APPROVED RESIDENT WORDING
   (notice text, named PMI KC contact, separately configured fallback route,
   troubleshooting/emergency/possible-charge copy). Provide exact secure setup fields and
   validation steps for the first, and the structured slot with its required parts for the second so
   PMI KC fills in words rather than authoring a document.
9. _Context update:_ record app-plane/build-to-seam/activated facts accurately with AC references
   (AC-S47-1 through AC-S47-11), ADD the missing "S47 approved resident wording" row to the Named
   external evidence list in `docs/loop-state.md` and the matching confirm-with-default row to
   `docs/client-checklist.md`, record the D17 answer so the SMS question is not re-opened, update
   environment handoff/manual QA, and advance `docs/loop-state.md` to S48.

**Deletion/merge recommendation.** KEEP this spec as the resident-channel contract. MERGE existing
token intake and staff review primitives where secure. DELETE any duplicate resident prototype only
after S49 proof; never delete the photo/security/provider seam merely because it lacks a page import.
Per D17, DELETE on sight any text in this suite's scope that implies a standalone SMS channel with
its own carrier integration — the resident text channel is RentVine's — and never re-add it. Preserve
the provider-contract evidence requirement for consent/opt-out/permitted use; routing is not a legal
waiver. KEEP the notice slot even before wording arrives: an
unpublished slot that closes the Production form is the safe state, and deleting it would silently
re-open collection without disclosure.
