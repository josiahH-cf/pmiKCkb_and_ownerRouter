<!-- spec-shape: overhaul-v1 -->

# S47 — Tokenized resident Maintenance intake and RentVine channel seam

> New 2026-07-28. Implements D-10. Build the app-plane fully; only the documented RentVine
> interactive channel contract may block that provider activation.

**Goal.** A resident can report and clarify a maintenance issue from a short-lived, single-purpose
link without creating another account. The conversation asks approved troubleshooting questions,
requires appropriate photos, presents the approved possible-charge acknowledgement, and submits a
clear review packet to staff. The same intake can be initiated through a RentVine portal/text
adapter once RentVine confirms the supported interactive endpoint. Until then, the tokenized web
intake and staff review flow are complete, and the adapter stops at one named seam rather than
guessing an endpoint.

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
- **Review and submit.** Before submission, show answers/photos/acknowledgement in a resident-safe
  summary. One submit creates/updates one app-plane review packet and returns a reference. Staff sees
  a bounded `Resident response ready` item in the Maintenance workspace, reviews it, and explicitly
  decides next action. Resident resubmission follows a defined version/reopen rule, never overwrites
  staff-reviewed history silently.
- **RentVine channel adapter.** Define a provider-neutral invitation/conversation event interface and
  a RentVine implementation using only documented portal/text semantics. It maps provider identity
  and delivery receipt to the app intake without putting the bearer token in durable provider/log
  evidence. Inbound events are signed/verified, idempotent, replay-safe, and reconcile to one intake.
- **Buildable now (app-plane).** Token lifecycle, resident session, published question/charge
  content, conversation graph, photo/acknowledgement/submission, staff review, Demo fixtures,
  security/accessibility tests, and a provider-neutral adapter contract.
- **Build to the seam (live provider).** Implement the RentVine adapter, webhook/event validation,
  mapping, idempotency, receipts/readback, monitoring, kill switch, and rollback/correction against
  verified documentation or vendor-provided examples. Do not stop at a fake provider; if exact
  interactive semantics are absent, leave only the transport method unresolved.
- **Owner dependency (the one flip).** RentVine/vendor supplies or confirms the exact supported
  resident portal/text invitation plus interactive reply/webhook endpoint semantics and the
  authorized account/credential mapping. After it is documented and configured, the routine
  reviewed gate/allowlist/tests activate that channel.

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
- _Client-owned:_ approve the exact troubleshooting/emergency/possible-charge content and provide
  RentVine credential/endpoint confirmation through normal secure setup.
- Decision-complete for build-to-seam.

**Cross-product impacts.**

- Likely new boundaries include resident token/session services and routes, conversation schema,
  published intake content, resident UI, review packet persistence, staff review presenter, photo
  storage reuse, RentVine adapter/webhook, receipts/monitoring, and Firestore rules.
- Reuses S21 publication, S22 identity separation principles (without making a Vendor/staff
  principal), S26 Maintenance action contracts, S40 environment, S44 links, and S46 workspace.
- The eventual RentVine effect gets its own narrow Registry key(s); it never opens generic
  messaging or arbitrary resident contact.

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

**Forbidden actions / hard gates.** Never use a guessed RentVine endpoint or browser automation as
the channel contract. Never log/store a plaintext bearer token, expose an intake by enumeration, or
turn the token into a staff/Vendor identity. Never let AI invent troubleshooting policy, emergency
instructions, legal/charge wording, diagnosis, urgency, price, or charge decision. Resident photos
never enter retrieval/indexing. No autonomous client-facing invite/send; exact human confirmation
remains required. The live channel gate stays false until endpoint, credential, mapping, signature,
receipt, monitoring, and rollback evidence exist, then both allowlists and pinned tests change in
the same reviewed slice. Preserve managed identity, secrets in Secret Manager, no PII in git, and
the cost cap.

**Ordered prompt sequence.**

1. _Discovery:_ inspect existing token/API intake, staff review queue, photo store, publication,
   Maintenance schemas/actions, provider Registry, and RentVine docs/evidence; confirm B-01 rather
   than guessing.
2. _Understanding:_ pin the token/session threat model, conversation schema, emergency/photo/
   acknowledgement rules, review lifecycle, provider event mapping, and one external dependency.
3. _Build:_ implement the token lifecycle, resident session/UI, published graph/wording, photos,
   acknowledgement, idempotent submit, and staff review item with Demo fixtures.
4. _Build:_ implement the provider-neutral adapter and all RentVine mapping/signature/idempotency/
   receipt/monitoring/rollback code possible from documented evidence; stop only at the missing
   endpoint/credential values.
5. _Verify:_ run AC-S47-1 through AC-S47-8 and falsify token leakage/replay/enumeration,
   cross-environment access, prompt policy bypass, unsafe upload, missing wording, duplicate submit,
   forged webhook, and provider construction without config.
6. _Gate:_ when and only when B-01 and secure mapping are documented, set the narrow RentVine action
   to approved/documented/`production_allowed:true`, update both executable allowlists and pinned
   Registry/risk tests, and run one authorized Live proof/readback. Otherwise record the exact seam.
7. _Owner:_ request only the documented RentVine semantics/credential mapping and approved content;
   provide exact secure setup fields and validation steps.
8. _Context update:_ record app-plane/build-to-seam/activated facts accurately with AC references,
   update client checklist/environment handoff/manual QA, and advance `docs/loop-state.md` to S48.

**Deletion/merge recommendation.** KEEP this spec as the resident-channel contract. MERGE existing
token intake and staff review primitives where secure. DELETE any duplicate resident prototype only
after S49 proof; never delete the photo/security/provider seam merely because it lacks a page import.
