<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S74 — Renewal copy, constrained AI assistance, and channel truth

> Status: Active; the owner approved optional operator-invoked constrained tailoring, while exact
> owner/tenant base wording and channel-evidence rules still require client approval.

**Goal.**

Let staff prepare clear owner and tenant renewal drafts from approved versioned copy, optionally
improve phrasing with AI, and preserve every authoritative fact, recipient, channel, and delivery
status through exact preview and unsent Gmail draft creation.

**Current state / intended end state.**

Renewal owner/tenant copy is deterministic and carries governed facts, but is hard-coded and not
client-approved as the final operating wording. Renewal drafting does not use the existing bounded AI
draft-assistance pattern. Channel intent and provider evidence are separate in principle, while the
current broken preview lifecycle (S77) prevents reliable end-to-end use. The intended state has
separate approved owner/tenant template versions, a locked fact envelope, optional constrained
phrasing assistance with deterministic fallback, exact re-preview after any edit, and evidence-backed
draft/contact/channel state.

**Actors and entry conditions.**

A Renewals-space Editor or stronger role starts from one current S72 lease step and an approved
template version for the chosen owner or tenant channel. Server-resolved authoritative recipients,
verified base rent/owner decision, lease dates, required evidence, and S77 readiness are mandatory.
AI assistance is optional and operator-invoked; model unavailability must leave the approved
deterministic draft usable.

**What it is / how it functions.**

The server first renders an approved versioned template with an immutable fact envelope. Locked facts
include channel/recipient set, property/lease identity, current base rent, owner-approved offer,
separately labeled charges, dates, required terms/disclosures, source labels, screenshot/attachment
identity, review banner, and any client-approved mandatory sentences/placeholders. The operator may
edit unlocked prose or request one bounded rewrite for tone, clarity, and flow. The model receives
only the minimum needed content, may return only subject/body prose, and cannot change/add a recipient,
number, date, term, commitment, evidence status, or channel state. Deterministic post-validation
reapplies/checks locked facts and rejects omission, mutation, unapproved promise, unresolved
placeholder, cross-channel language, or output outside the governed shape. Every accepted manual/AI
change invalidates the former S77 preview.

The app records intent, prepared preview, unsent Gmail draft receipt, human-reported external action,
and source-backed Gmail-thread evidence as different states. It never calls an app action “sent” or
“contacted” from draft creation alone. Tenant and owner templates, recipients, evidence, and histories
remain structurally separate.

**In scope / out of scope.**

In scope: owner and tenant template versioning/publication status, fact locking, editable preview,
operator-invoked bounded AI rewrite, validation/fallback, exact re-preview, channel/status evidence,
audit, and prompt/data minimization. Out of scope: inventing legal/offer wording, autonomous generation
or send, general inbox drafting, training on client content, recipient discovery outside authoritative
sources, RentVine resident-channel activation, timing policy (S75), or screenshot MIME (S79).

**Open questions & assumptions.**

Client must still approve exact base wording, required/forbidden sentences, editable regions, and the
evidence that may support any non-Gmail channel claim. Until an approved template exists, the channel
is visibly blocked or uses only an explicitly labeled review-only draft; no copy is labeled approved.

**Cross-product impacts.**

Governed template/artifact storage, renewal owner/tenant draft builders, S72 steps, S77
preview-confirm, S79 attachment identity, Gmail draft/thread truth, recipient resolution, model
configuration, audit/redaction, and Admin/template readiness.

**Authority and evidence map.**

| Input                                                                                                                                             | Classification                | Use and limitation                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md` communication/data boundaries and `docs/facts.md` approved AI decision                                                                | Authority / product decision  | Operator-invoked constrained prose assistance is allowed; every client-facing application effect ends in an unsent Gmail draft and authoritative values remain server-owned.         |
| Current owner/tenant draft builders, renewal draft route/service, governed artifacts, recipient resolution, and existing bounded AI reply pattern | Verified implementation truth | Deterministic fact-bearing copy exists but is hard-coded/unapproved as final wording; no renewal-specific fact-lock/AI validation/versioned publication contract exists.             |
| Owner/tenant draft, request/service/composer, governed-artifact, AI/redaction, reconciliation, and send-boundary tests                            | Verification baseline         | They anchor current facts and channel isolation; template approval, adversarial model output, and re-preview tests must fail first.                                                  |
| Stabilization intake and meeting template discussion                                                                                              | Intent evidence only          | They establish the need for reliable reusable copy, optional tailoring, and channel-aware follow-up; they do not supply approved legal wording or authorize AI-authored facts/sends. |
| Client-approved owner/tenant wording and evidence rules                                                                                           | External product input        | Exact publication remains blocked until supplied; the versioning, review-only state, validation, fallback, and refusal machinery are independently implementable.                    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S74-1** — Separate immutable/versioned owner and tenant template definitions declare required
  locked facts, mandatory copy, editable regions, approval status, and compatibility; a deterministic
  schema/snapshot check rejects unapproved or cross-channel use.
- **ARCH-S74-2** — One server-built locked fact envelope feeds deterministic render, optional model
  assistance, post-validation, and S77 preview hashing. A structural check proves the browser/model
  cannot supply or alter authoritative recipients/facts.
- **ARCH-S74-3** — The AI adapter is a narrow optional prose transform with allowlisted inputs/outputs,
  timeout/validation fallback, redaction, and no provider effect. Deterministic checks prove identical
  canonical locked values and required sentences survive every accepted output exactly.
- **ARCH-S74-4** — Intent, preview, unsent-draft receipt, human external action, and provider-backed
  channel evidence are distinct states; no transition infers send/contact from button intent.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S74-1** — An approved owner or tenant template renders the exact lease/decision facts and its
  version; missing approval/fact/recipient blocks with a specific explanation.
- **BEH-S74-2** — The operator may edit unlocked prose or request assistance, sees the revised copy,
  and must exact-preview again before draft creation.
- **BEH-S74-3** — A model attempt to alter/omit/add a locked fact, recipient, amount, date, term,
  commitment, mandatory sentence, or channel claim is rejected and the deterministic approved draft
  remains available.
- **BEH-S74-4** — Creating one unsent Gmail draft records only a draft receipt. Contacted/sent/replied
  states change only from the separately allowed human/provider evidence path.
- **BEH-S74-5** — Owner and tenant data/copy never cross, including retries, cache, audit, and
  reconciliation.

**Human litmus outcome.**

### Tailor an approved renewal message safely

**If this was built correctly:** A staff member starts with approved owner or tenant wording, can ask
for clearer phrasing, and sees that the recipient, rent, dates, terms, evidence, and required language
did not change. The result remains an unsent draft until the person sends it from Gmail.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                     | Architecture outcome | Behavior outcome         | Human litmus                                                   | Deterministic evidence / falsification                                                                                                                |
| --------------------------------------------------------------- | -------------------- | ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate approved owner/tenant template versions                | `ARCH-S74-1`         | `BEH-S74-1`, `BEH-S74-5` | Tailor an approved renewal message safely                      | Schema/snapshot/publication tests reject unapproved, incompatible, unresolved-placeholder, and cross-channel templates.                               |
| Immutable server facts and exact re-preview                     | `ARCH-S74-2`         | `BEH-S74-2`              | Rent, dates, recipient, and terms stay fixed through editing   | One-field mutation tests prove browser/model edits cannot change facts and every accepted prose edit changes the fingerprint and clears confirmation. |
| Optional AI changes prose only and fails back deterministically | `ARCH-S74-3`         | `BEH-S74-3`              | Approved deterministic copy remains usable if assistance fails | Adversarial outputs mutate/omit/add every locked class; validation rejects them, records no client effect, and returns the canonical render.          |
| Draft, human action, contact, and reply remain distinct         | `ARCH-S74-4`         | `BEH-S74-4`              | Created means one unsent Gmail draft, not contacted            | State-transition/provider-evidence tests and send-boundary scans reject inferred contact/send/reply.                                                  |

**Preservation set.**

Authoritative recipient/current-rent/owner-decision resolution, owner/tenant separation, governed
artifact requirements, S77 exact confirmation/reconciliation, review banner, Gmail send boundary,
manual thread refresh, model prompt redaction, immutable approval/version history, and no-client-send
rules remain green as a separate gate.

**Adversarial acceptance checks.**

- **AC-S74-1** — `ARCH-S74-1/2` and `BEH-S74-1` prove every rendered message is traceable to one
  approved template version and exact server-side facts.
- **AC-S74-2** — `ARCH-S74-3` and `BEH-S74-3` use adversarial model outputs to prove locked
  facts/mandatory copy cannot be changed, omitted, or supplemented with unsupported promises.
- **AC-S74-3** — `BEH-S74-2` proves manual and AI edits invalidate S77 confirmation and require a new
  exact preview.
- **AC-S74-4** — `ARCH-S74-4` and `BEH-S74-4` prove draft/contact/send/reply states cannot collapse.
- **AC-S74-5** — `BEH-S74-5` proves channel/recipient isolation across normal, failure, retry, and
  reconciliation paths.

**Forbidden actions / hard gates.**

No invented or unapproved legal/offer copy, model-authored recipient/value/date/term/commitment,
autonomous/model-triggered draft or send, false contacted/sent claim, cross-channel content,
unredacted client content in logs/Git, guessed portal/RentVine action, or direct send.

**Dependencies / sequencing.**

Implement after S77 when running the bundle. The template/validation/fallback boundary can be built
and tested independently while exact client wording remains unavailable; production use stays
blocked on an approved template. S72 supplies step facts and S79 supplies attachment identity.

**Standalone delivery contract.**

- **Deliverable now:** separate immutable template/version/publication schemas, review-only state,
  server fact envelope, editable-region rules, bounded AI adapter, post-validation/fallback,
  preview invalidation, channel-state separation, audit/redaction, and tests can reach
  `ALL_GATES_GREEN` with fixture templates that are never published to Production.
- **Consumes, but does not assume:** S77 exact preview and optional S79 attachment identity have
  explicit adapter contracts; until integrated, deterministic render/validation and named readiness
  refusals remain fully testable.
- **Externally blocked effect:** production publication and the approved-copy branch of AC-S74-1 are
  `BLOCKED` until the client supplies exact owner/tenant wording, mandatory/forbidden sentences,
  editable regions, and channel-evidence rules. No runner may promote fixtures or hard-coded copy.
- **Produces for downstream suites:** approved-template/version metadata, immutable fact envelope,
  validated subject/body, preview fingerprint inputs, and evidence-state taxonomy.

**Verification and delivery contract.**

1. Before editing, inventory current hard-coded copy/facts and make publication, fact-lock,
   adversarial-model, and re-preview tests fail for the missing contract; freeze current recipient,
   value, separation, reconciliation, redaction, and send-boundary behavior.
2. Run `npm run test:direct -- tests/unit/lease-renewal-owner-draft.test.ts tests/unit/lease-renewal-tenant-draft.test.ts tests/unit/renewal-draft-request.test.ts tests/unit/renewal-notice-draft-service.test.ts tests/unit/renewal-notice-draft-composer.test.tsx tests/unit/lease-renewal-send-boundary.test.ts` plus new template/AI/adversarial tests.
3. Run `bash scripts/verify.sh`, inspect the diff, and audit prompt/log content, recipients, numeric/date/
   term mutation, template approval history, cross-channel cache/audit, action keys, and provider calls.
4. Report `ALL_GATES_GREEN` for the complete closed/publication-safe implementation;
   `BUDGET_EXHAUSTED` requires an explicit budget. Report `BLOCKED` only for named final-copy/
   channel-evidence publication checks and never fill them with invented language.

**Ordered prompt sequence.**

1. Inventory current owner/tenant copy and freeze exact fact/recipient/send-boundary behavior.
2. Add fail-first template, fact-lock, AI-adversarial, status-truth, and re-preview checks.
3. Build versioned templates, bounded assistance, validation/fallback, editing, and evidence states.
4. Run focused redaction/cross-channel/model-failure tests and the canonical gate; publish no final
   template or channel claim without explicit client approval.

**Deletion/merge recommendation.**

Remove after client-approved owner/tenant template versions, constrained assistance, and channel-
truth behavior are deployed and carried by durable template/product contracts and tests.
