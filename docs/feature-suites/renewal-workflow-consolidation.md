<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-consolidation-v1 -->

# S113 — One lease renewal dashboard, source updates, and manual completion

> Status: COMPLETE / DEPLOYED / ALL_GATES_GREEN. The owner accepted F1–F5 and explicitly
> required pre-approved in-app existing-row Sheet updates, a full manual dashboard, and manual
> workflow advancement. This suite is one queue entry with five ordered feature specifications.

**Goal.**

A Renewals operator can open one lease from the monthly desk, inspect and correct its facts, gather
comps, prepare owner/tenant messages, record work done outside the app, and resume through manual
completion without navigating a six-phase barrier or entering internal identifiers.

**Current state / intended end state.**

Implementation started from `c9f46d8ff8718ff319a19581ff1119162d89c120`, preserving supplied work
and all private template evidence. F1-F5 is serving in `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4` at 100% traffic.
Exact CI 34556917662, candidate/config/domain/browser assurance, independent reconciliation, v4 bound
promotion, 300,000 ms observation and serving/backend readback passed. All 33 review findings are
closed. Local and CI units pass 6,528 tests with four existing skips; all 201 backend tests pass.
Production build, core HTTP E2E and all seven compiled browser checks pass, including the 42-step guide.
Both supplied v2 templates are published/read back approved. Human verdict remains NOT RUN.
See [review evidence](../evidence/s113-implementation-review-2026-09-10.md) and [status](../status.md).

| Feature                      | Verified delivered behavior                                                                          | Remaining per-use boundary                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| F1 — Dashboard and facts     | Five connected sections, attributed source values, exact destinations and retained desk context.     | Actual unavailable source evidence stays unavailable.                                    |
| F2 — Corrections and updates | Typed normal Sheet and supported RentVine paths with independent claims/receipts/readbacks.          | Each source write retains exact authorized human confirmation.                           |
| F3 — Comps and messages      | Operator-triggered RentCast preparation, approved rich/plain copy and governed Gmail draft recovery. | Actual recipient/mailbox/resource evidence and per-action confirmation remain required.  |
| F4 — Manual renewal progress | Audited cycles through staff completion, counteroffer, non-renewal and reopening.                    | Staff evidence remains distinct from provider verification.                              |
| F5 — Integrated journey      | Fresh/underway backend journeys, normal S106/S34 handoff and exact deployed acceptance.              | Actual forms/connection/closed-key activation constrain only dependent document effects. |

**Actors and entry conditions.**

- Existing managed identities and Renewals Space access apply. Readers inspect; Editors record
  ordinary app-owned facts, proposals, and manual progress; Approvers retain reconciliation
  authority; Admins retain external-write execution and existing approval/configuration authority.
- Reuse exact action keys, operating spreadsheet/tab, runtime switches, identities, and read paths.
  Pre-approval of the Sheet feature is not execution of any particular customer-value change.
- Missing sources restrict only dependent actions. Inspection and unrelated manual work remain
  usable. An unresolved lease identity cannot receive durable lease-specific updates.
- No new account, role, claim, provider connection, budget, or infrastructure is required by this
  specification. Authentication-dependent release work remains separate from implementation.

**What it is / how it functions.**

## F1 — One dashboard with accurate, connected facts

### F1.1 — Dashboard composition and navigation

Keep the canonical monthly desk and lease routes. The workspace becomes five accessible sections:
**Lease details**, **Comps**, **Owner**, **Tenant**, and **Documents and completion**. Keep the lease
identity, waiting status, next action, and Back to renewals control visible above those sections.
Use ordinary section links/disclosures; opening a section does not verify, complete, or save work.
Required controls remain inspectable even when their execution has an unmet prerequisite.

Translate existing `step` bookmarks: verification to Lease details, owner and tenant phases to their
named sections, and document/signature/compliance phases to their respective subsection in Documents
and completion. Preserve canonical desk query/filter continuation, opaque party tokens, browser
Back/Forward, and existing historical process versions. Remove the six-phase rail as the navigation
barrier; do not delete provider evidence or historical stage meaning.

The next-action control opens and focuses the actual unresolved field, message preparation control,
response control, or checklist item. A verification problem must not send the operator back to the
same unchanged page. A stale-source action requests the existing deliberate refresh, then returns
to the same lease and control. Keyboard activation and narrow-screen navigation must work.

### F1.2 — Shared field inventory and rent semantics

Project these fields once for the desk, dashboard, comps, messages, and update previews:

| Group            | Fields and treatment                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity         | Property address/unit, lease identity, owner and tenant names, verified contacts, property/portfolio references. Identity is source-backed and is not a free-text join key.                       |
| Dates            | Lease start/end, lease term, explicit renewal date, periodic-review date where applicable. Renewal date is not silently inferred from lease end.                                                  |
| Rent and charges | Current contractual base rent, separately labeled lease total and unit reference, proposed renewal rent, owner-approved rent and effective terms; individual recurring charges and one-time fees. |
| Market           | Provider range/estimate, manual supporting range and source, retrieval information, subject attributes, evidence attachments. Market evidence never becomes an approved offer automatically.      |
| Work             | Verification state, current waiting party, last recorded contact, owner/tenant outcomes, document and applicable compliance checklist, manual/provider completion attribution.                    |

Start with S102's shared lease-detail mapping; the meeting's security-balance diagnosis is a report,
not a proven API mapping. Verify its meaning against the active lease and recurring-charge evidence
before accepting it as base rent. Correct the shared mapper if verified evidence disproves it, and
record the non-secret semantic finding in the field-map contract. Do not add a second UI resolver.
Preserve recurring-charge account classification through reads when required for that comparison.
Deposits, pet rent, total charges, unit/market rent, and future offers cannot silently substitute for
base rent. Display conflicting candidates for explicit resolution; blank/unavailable is never zero.

### F1.3 — Source destinations

Each source label is a meaningful link when its destination is verified. Resolve the configured
operating spreadsheet, actual tab id, current matched row, and field column on the server. Open the
relevant Sheet tab/row rather than the workbook landing page. Validate RentVine URLs against the
configured host and exact lease; do not construct guessed provider UI paths. A source without a
verified external destination opens the useful in-app comparison and says what is unavailable.
Status badges such as one-source/needs-input open the corresponding explanation or editor only
when there is an actual action; never style inert text as a link. No customer values enter URLs.

## F2 — Simple corrections and pre-approved in-app source updates

### F2.1 — One value editor

Show observed values with sources beside the field. Let the operator select one or enter a typed
value, identify its source, and choose supported destinations: RentVine, operating Sheet, or both.
Use currency/date/select/checkbox controls appropriate to the semantic field. Prefill known terms;
request only missing business inputs. Optional comments and full audit history stay in disclosure.
Do not ask for Sheet row numbers, internal field names, difference codes, hashes, action keys, or
approval-reference strings. Derive those from the authenticated lease and current source records.

Maintain separate intents for **correct current facts** and **record renewal terms**. The latter
stores the owner-approved amount/effective terms in app progress and prepares only valid destination
operations; it does not prematurely overwrite Sheet `current_rent`. There is no invented new Sheet
column. Preserve the current reconciliation/approval role boundaries while presenting them through
this same editor and the existing review handoff. A disposition alone never claims a provider write.

### F2.2 — Destination and field contract

| Destination     | In-scope operations                                                                                                | Required boundary                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| RentVine        | Existing exact renewal-date update and recurring-charge create/update contracts.                                   | Resolve the exact lease/charge/account, dates, and reviewed value; unsupported lease-detail setters remain unavailable.          |
| Operating Sheet | Existing missing-row append plus updates to recognized renewal business fields.                                    | Server-selected configured tab, exact current lease/row association, supported semantic column, typed old/new value, and source. |
| Both            | Two separately previewed/confirmed operations using one entered business value where both mappings actually apply. | No cross-provider atomicity claim; each result and remaining action is visible independently.                                    |

Sheet field updates cover the existing Renewals schema's renewal date, current rent, market value,
renewal-letter/response/completion tracking, form, document, signature, insurance, pet, charge,
inspection, filter, and utility follow-ups. Read the current schema and resolve headers rather than
fixing column letters. Do not make tenant/lease identity, links, formulas, formatting, murky columns,
or arbitrary spreadsheet fields editable. Preserve date and checkbox types. Historical numeric
wording in a header is a mapping hint, not a fee policy or a customer amount to apply.

Extend the normal operating-Sheet proposal input with bounded semantic field/value/source intent;
the browser never selects spreadsheet, tab, A1 range, physical row, actor, proof mode, or provenance
hash. Preserve existing propose/status/discard/execute/reconcile callers and historical receipts.
Server-side allowlisting and fresh source validation apply even to a forged direct request.

### F2.3 — Sheet execution and correction

The owner explicitly required normal in-app Sheet updates and rejected a new provider-contract gate.
Replace the blanket `provider_capability_unavailable` refusal for those updates. Reuse the existing
S98 proposal/execution services and `replaceCellIfExactMatch` writer primitive; do not introduce a
fictional provider idempotency/tombstone protocol or wait for one as a feature prerequisite.

Preview the exact lease, field, destination, old/new value, and any remaining external/manual work.
On confirmation, check actor/key/switch/runtime authority, the active proposal generation and expiry,
resolve the exact current lease/row/header, compare the prior value, and claim one attempt durably.
Serialize competing app attempts for the same target. Make one narrow exact-value replacement,
then reread target identity, field semantics, and value before returning success and a receipt.
An app lock does not lock direct collaborator edits in Sheets.

Observed drift before execution requires a fresh preview. Lost responses, unexpected replacement
counts, identity/value mismatch, and partial outcomes enter explicit reconciliation; no blind retry,
silent retargeting, or success based only on finding a matching value. Store before-value and target
evidence privately for correction. Known-success duplicates return the same receipt with fresh
status; an ambiguous attempt cannot be reset by saving a new proposal. In a both-destination request,
a failed second effect does not undo or replay the first automatically.

Offer a new exact-confirmed field correction against freshly read state, with receipted prior values
available for selection. It is a new field update, not automatic historical restore authority. Row
deletion, proof-row recreation, and completed proof mutation remain out of scope. Retain append's
unique note, one-attempt claim, readback, and historical evidence. Refresh shared lease/Sheet state
after confirmed changes using the existing cross-instance freshness barrier.

Google documents atomic application within a batch but allows collaborator changes. Fresh reads and
exact-cell comparison reduce and expose conflicts; they do not establish logical-row transaction
isolation across separate requests. Report a concurrent wrong-target/readback discrepancy as a
failed recovery case, never conceal it or automatically write a guessed correction.

### F2.4 — Exact RentVine scope and post-update meaning

The September 10 unblock review read the current official OpenAPI and ran the existing bodyless
lease-detail probe successfully against two leases. Detail returned numeric baseRentAmount and
rentAmount; recurring-charge reads returned account.isRent. The current public schema describes
rentAmount as the sum of active recurring charges and provides no baseRentAmount setter. Live
read shape establishes field presence, not proof of the formula or the effect of a write.

| Business intent                                                                                                                            | Exact existing operation                                                                                                           | Readback and limit                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct current base-rent billing                                                                                                          | Update the selected current rent-account recurring charge with rentvine.lease.recurring_charge.update.                             | Resolve account.isRent, current schedule and charge identity. Never divide an aggregate among several charges automatically. Read charge detail and refreshed lease detail; report charge success and any unresolved displayed-base-rent discrepancy separately.           |
| Record future approved rent                                                                                                                | Save exact owner-approved terms in app progress; prepare a future recurring-charge change/create only against a reviewed schedule. | Preserve current billing before the effective date. Show each existing-charge end/change and future-charge create separately, including overlap/gap checks. No automatic activation by calendar, assumed end-date inclusivity, or early replacement of current Sheet rent. |
| Change lease renewal dates                                                                                                                 | Existing rentvine.lease.renewal_dates.update over POST /leases/{leaseID}.                                                          | Preserve fresh startDate and untouched fields; change only the supported endDate/increaseEligibilityDate intent. Existing null/date-transition rules still apply.                                                                                                          |
| Change recurring pet, insurance, RBP or utility billing                                                                                    | Existing exact recurring-charge create/update after account and schedule resolution.                                               | A message-template line never creates a charge. A repeated insurance line is one charge, not two. No automatic account creation or fee-policy selection.                                                                                                                   |
| Change market evidence or manual status                                                                                                    | App-owned preparation and supported Sheet field update.                                                                            | No RentVine market-value/status setter is implied.                                                                                                                                                                                                                         |
| Post a one-time processing/pet fee, change parties, ledger history, deposit, lease status, insurance enrollment, or arbitrary lease fields | Outside the three existing exact S97 keys.                                                                                         | Display the precise unsupported operation and verified provider destination. Do not emulate a one-time charge using a recurring schedule or widen a key. Prepare a separately reviewed exact contract only if this capability becomes a required later outcome.            |

The writer uses the documented lease POST and recurring-charge POST paths already in S97. Current
charge create requires accountID, amount, description, dayDue, frequency and startDate; endDate is
optional. These are server-resolved or exact reviewed business inputs, never browser-guessed ids.
Do not use the provider's unrelated notification/payment/status settings to make a renewal complete.
F2 is unblocked for these named operations. A missing setter cannot justify refusing supported rent
charge changes, and a successful charge update cannot justify falsely claiming another field changed.

### F2.5 — One recording action and explicit source synchronization

Saving a manual fact/activity updates app-owned progress and prepares any matching supported Sheet
proposal from the same typed value; it does not silently execute that proposal. Offer the existing
authorized confirmation in context and keep a visible pending-source-update state until readback.
Do not make staff retype the value in another form. A Sheet failure leaves the recorded activity and
exact unfinished update visible. Desk and workspace use the same projection; staff completion may
coexist with an explicitly labeled pending source update, never with a false synchronized/verified
claim. Existing role handoffs remain visible: Editors prepare and record, existing Approvers review
where required, and Admins execute source writes. The loop must test this actual handoff; it must not
grant roles to remove it.

## F3 — Comps and template-based message preparation

Move comp preparation out of the owner-decision form's prerequisite chain. Display saved RentCast
results, source/retrieval information, subject attributes, and current lookup controls before owner
outreach. Preserve current allowance/configuration, provider ordering, query validation, cache, and
explicit user-triggered calls. Do not adopt a new radius, fee, freshness, or selection policy from a
meeting example. Opening, reloading, or navigating the dashboard makes no paid comp request.

Keep operator-entered ranges, external analysis references, and screenshots distinct from provider
results. Save them as app-owned preparation before an owner decision; use the existing market-basis
types, with additive storage independent of owner approval. Existing saved market basis remains
readable, and an unavailable lookup cannot erase it. No source's amount receives another source's
label. Keep attachments inside the existing authorized evidence/Drive boundaries.

Prefill owner message preparation with verified contacts, address, base rent, selected comp evidence,
and template wording. Prefill tenant preparation from explicit owner-approved terms, verified tenant
contacts, dates, and separately identified recurring/one-time charges. The notes identify multiple
owners and a staff Cc requirement; resolve actual recipients from verified source/configuration and
show them in the preview. Do not infer addresses, recipient fanout, or new fee defaults.

Reuse the existing reviewed-copy selection, manual-copy presentation, and exact-confirmed unsent
Gmail draft service. Keep draft-created, staff-recorded-sent, and Gmail-confirmed-sent distinct.
Surface missing fields next to their inputs. Keep optional AI copy assistance outside the main path;
no new model invocation, mailbox watcher, polling, auto-draft, reply interpretation, or send.
Both current code definitions remain `review_only`. The September 10 PDFs now supply template and
formatting evidence; F3.2–F3.3 require incorporating it and removing the stale missing-wording refusal.
Exact lease-specific charge applicability, recipients, resource links and live mailbox readiness
remain per-action inputs. Preparation and manual workflow do not wait on provider availability.

### F3.1 — Restore the existing RentCast feature as required work

The September 10 source audit found the adapter in
lib/lease-renewal/providers/rentcast-market-comp-provider.ts, the route in
app/api/lease-renewal/market-comps/route.ts, and the mounted call in
components/lease-renewal/RenewalProgressControls.tsx. It is inside OwnerDecisionForm; the adapter is
not deleted. Existing provider/route tests pass. No paid lookup or production comp-health claim
was made in this review.

Repair missing UI mounting, wiring, saved-result loading or regressions as part of F3, including
restoring an actually deleted component from relevant reachable Git history when evidence shows it.
Preserve current AVM estimate/comparables and the existing conditional, separately metered trend
lookup initiated by the same deliberate operator action. This is authorized restoration of existing
integration/automation, not a new scheduler or blanket paid refresh. Display, save and reopen the
actual provider results before owner approval; page navigation makes no paid call.

Separate hidden controls, failed retrieval, unsaved preparation, unavailable retained data, and proven
deletion. Recover retained app/Drive evidence only through its correct lease identity and provenance.
Do not fabricate old results. Acceptance requires a mounted deliberate lookup through the real route
and adapter with deterministic responses, then saved-data reload and honest failures; a source-file
existence check alone does not close the feature.

### F3.2 — Supplied templates and formatting are implementation inputs

The owner supplied email1.pdf (four pages) and email2.pdf (two pages) on September 10. All six pages
were rendered and visually inspected. The PDFs are image-only with no embedded URI annotations.
Private originals, page references, hashes and normalized authoring material are preserved in
docs/client_docs/renewal-template-source-2026-09-10/. That ignored source pack is now available to
the loop; do not ask for the same templates again or keep a blanket "wording never supplied" gate.
Raw correspondence, recipients, amounts and signature contact values stay outside Git/source uploads.
Publish normalized template content through the existing approved content/publication mechanism;
record this user-supplied authority and its version, instead of simply flipping an old unrelated
template to approved. The files do not supply blank legal forms.

Owner copy follows the supplied greeting, property, current base rent, market range, reviewed comp
evidence, consideration paragraph, response request and managed sender signature. Preserve supported
sparse-comps qualification and analysis attachments. Multiple-owner names and the designated staff Cc
are resolved per lease/current managed configuration; forwarded recipients are not a new mailing list.
A qualitative owner response is not exact rent approval.

Tenant copy uses exact approved rent and dates, separately itemized recurring/one-time charges,
applicable insurance-change wording, verified flyer/information-form links and managed signature.
The red text is staff editing instruction and never appears in recipient copy. Orange lines are
conditional charges, not an always-applied bundle. Existing PMI versus third-party lease origin is
one explicit input, not a substitute for charge applicability. De-duplicate insurance and the
unchanged-charges statement; include "other charges stay the same" only after comparing the selected
terms. The supplied assisted-housing example adds an applicable form/owner-signature/submission
follow-up to manual work, without legal inference or automatic agency submission.

Template example amounts are versioned reference inputs, not global defaults. Each included charge
has a source, applicability, amount, cadence and effective date. Reuse verified existing charge/rule
data; prompt beside only the unresolved line. A missing charge amount, long-link destination or
policy applicability limits that exact final export; drafting, other fields and other leases continue.

September 10 link checks: the scanned insurance-flyer destination returned 404 on HEAD and GET;
the RBP flyer returned 200 application/pdf. The transcribed information-form destination also returned
404, but its exact id cannot be established confidently from a scan, so classify it as unverified
rather than proven deleted. A bounded official-site search found no verified insurance replacement.
The owner subsequently deferred Q1/Q2 source collection: deliver labeled URL input boxes for the
insurance flyer, renewal information form and approved legal-form folder/file locations, with the
existing artifact families kept identifiable. Empty values are intentional pending-team placeholders,
not a reason to pause implementation, acceptance of the input controls or deployment of S113.
Use the existing settings/publication ownership and permissions; retain entered values. Show Add link
when empty. Do not place example URLs, unresolved tokens or placeholder legal content in customer
copy or provider packets. Only the exact resource-dependent output remains unavailable until a real
applicable link/content mapping is supplied. The owner permits verified links to be hardcoded later
where appropriate; no advance source request or new approval cycle is needed for these boxes.
A location box does not bypass the existing approved-content, field/participant mapping or provider
execution contract. Test empty, saved, replaced and invalid link states within the existing F3/F5 gates.
Private link readback remains source evidence; reachability does not establish policy applicability.

Render one content model as safe HTML and equivalent plain text. Use normal paragraph spacing,
readable body text, linked resources, clearly separated charge groups, and one managed signature.
Keep signature name emphasis and approved brand role color; exclude print headers, quoted threads,
forwarding metadata and editing colors. Inline screenshots and analysis attachments must be actual
reviewed artifacts. No recipient copy may claim an attachment that is absent.

### F3.3 — Deterministic preparation, stable Gmail drafting, always-available copy

Automatically assemble/recompute draft content from the operator's current reviewed facts and
template selection. This means deterministic preparation, with no new model or background provider
call. Preserve deliberate edits across refresh; changing source terms marks dependent edits for
review instead of silently erasing them. Separate body readiness from mailbox readiness so a
disconnected Gmail account cannot prevent a useful local preparation.

Repair the existing Gmail composer/service/preview/MIME path first. Current raw-message generation
is plain text and supports a governed attachment; rich formatting is an implementation requirement,
not already delivered. Add safe multipart/alternative HTML/plain-text support and, when present,
the reviewed attachment structure. Preserve legacy raw-message compatibility, exact preview identity,
at-most-once attempts and ambiguous-draft reconciliation. Hash and verify both rendered representations
and every reviewed recipient/attachment; no invisible HTML facts or unreviewed attachment bytes.

Always offer Copy subject, Copy formatted body and Copy plain text from the same reviewed content.
A clipboard denial leaves selectable text available. Clipboard HTML is not proof an attachment was
copied: supply reviewed downloadable files and an explicit manual-attachment step when necessary.
If Gmail is unavailable, keep preparation/copy usable and say no Gmail draft was created. If a
creation response is ambiguous, preserve exact-attempt recovery and warn against creating a duplicate;
copy access does not reset or replay that attempt. A draft/copy action never marks sent.

Preserve existing tenant portal-chat/text preparation and manual channel status. Do not add portal
posting, text delivery, automatic Gmail creation, sending, inbox polling or automatic reply decisions.
Draft publication/transport must no longer be blocked solely by the stale claim that template
wording was never provided; the remaining exact live prerequisites are validated source terms,
recipients/content, the connected managed mailbox, existing action authority and release readiness.

## F4 — Audited manual progress through completion

Add versioned app-owned manual activity beside the existing evidence map. An event records the lease,
step/activity, outcome, actor and recording time, source/channel, relevant terms or evidence, and an
optional actual occurrence time. Record what the staff member attests; do not generate provider ids,
verification receipts, or fake message evidence. Use existing Editor app-write capabilities, with
server validation, expected-version concurrency, and duplicate submission protection.

Track owner outreach, response and exact approved terms; tenant offer/response; document preparation
and delivery; signature completion; and applicable insurance/pet/charge/inspection/filter/utility
follow-ups. Checklist outcomes are not started, waiting, done, or not applicable where permitted.
An operator-selected not-applicable decision is audited; it cannot waive owner approval or turn a
provider action into a verified success. Approved terms and tenant outcomes retain their existing
typed branches. A non-renewal exits through the existing non-renewal handoff without new move-out,
legal, notice, or calculation behavior.

Manual sent/received events advance the manual checklist without a Gmail receipt. Received does not
mean approved: tenant-offer preparation requires the explicit owner outcome and exact terms.
Missing provider/template prerequisites constrain the corresponding external action, not unrelated
manual recording. Do not allow a receipt-dependent executor to consume a staff marker as a receipt.

Project one shared manual waiting/next-action summary for dashboard and desk filters. Late-stage
sections stay inspectable, and work begun outside the app can be recorded in its actual order. Terms
changes invalidate affected previews/approvals; past event history remains visible and is not rewritten.
Completion requires all applicable manual checklist obligations and the relevant outcome branch.
Show **Completed — recorded by staff** separately from **Verified complete**. Do not set the existing
provider-verification completion flag from manual events. Reopening or correcting a staff event is
audited and recomputes the next action.

Use additive progress/preparation fields and retain existing APIs, records, and process versions.
Absent fields in old records mean unknown/not recorded; no bulk backfill marks them done. Explicit
staff completion is the new manual lane, not removal of the existing provider evidence contracts.
New automation and Dotloop/signature execution remain separate suites, not prerequisites to this lane.

### F4.1 — Renewal cycles and applicable closeout

Bind new manual/preparation records to the lease plus an explicit renewal/review cycle identity,
derived from verified term/review context and versioned in app state. Changing an approved effective
date revises the current cycle; starting a subsequent renewal requires an explicit new-cycle event.
No calendar job starts one. Prior approvals, sent markers and completion remain historical and do
not satisfy the new cycle. If a legacy record cannot be assigned unambiguously, retain it as history
and ask the operator only to select the current reviewed cycle.

Use the existing S66 artifact predicates and typed outcome branches for checklist applicability.
Required manual obligations are exact owner terms before tenant offer, recorded tenant outcome,
required document/delivery/signature steps for that outcome, and applicable follow-ups. Non-renewal
uses its handoff; unknown applicability remains Needs input. Staff can choose Not applicable only
where the existing predicate/authorized policy permits, with an audit reason. Assisted-housing work
is included when verified applicable, but the PDF example does not invent agency rules or forms.
Do not add mandatory invented checks to ordinary renewals, silently waive required items, or require
provider receipts for staff attestation. Separate manual completion, source-update status and verified
provider completion in both desk and workspace.

## F5 — Integrated operator journey, documentation, and release

Exercise the real mounted dashboard through the owning projection, stores, and execution services.
Use deterministic provider doubles for effects; testing must not depend on seeded success flags.
Cover a renewal started from scratch and one already in progress outside the app, including separate
owner approval, tenant response, applicable manual closeout, source changes, and return to the same
filtered desk. Include declining/revised terms and incomplete/missing data without false completion.

Rewrite the operator guide and its semantic-control mapping only when matching controls exist. The
current guides continue to describe current software until implementation changes them. Update
current facts/status/loop state after each evidenced slice; distinguish source findings, local tests,
candidate availability, and serving behavior. Documentation-only slices do not deploy. A runtime
release retains the current exact-SHA and managed-browser assurance gates; S113 does not close B-REH1,
authentication, live draft, or Dotloop holds merely by passing mocked integration tests.

### F5.1 — Prepared Dotloop end state and exact continuation

S113 keeps manual completion independently usable and prepares the dashboard handoff into S106/S34.
The owner now explicitly requests the technical end state and deployment path once its capabilities
and inputs exist. The existing S106/S34 suites own delivery; do not create a sixth S113 feature or
leave background document work as an unnamed future project.

The September 10 official Dotloop Public API v2 reread supports OAuth, selected profile/template,
loop creation with participants/property data, folder/document upload and metadata readback.
The current client/provider/runtime and verified S21 publication-byte resolver already exist.
Remaining agent work is the real catalog/participant/field resolver, normal mounted packet
preview/confirmation path, exact execution links, recovery and returned-artifact/completion handoff.
Credential arrival alone does not implement these controls.

Public documentation has no signature-send/status endpoint or document-signature completion event.
The deployable end state with current capabilities is prepare/upload the exact packet, open its
verified Dotloop URL for a person to send for signature, and reconcile manually returned signed
artifacts through existing evidence. Do not treat a loop status or webhook HMAC signature as an
electronic signature. Full in-app signature execution remains an external capability dependency.
If a new official capability is supplied, verify its exact operations, consent/recipient effects,
status/artifact access and correction contract, then amend the owning suite and protected exact key
before activation; never simulate readiness or silently switch signature providers.

External inputs are approved Dotloop client credentials, managed account consent and resource
selection, and approved blank forms with participant/field mappings. Required form families remain
standard lease, renewal extension, animal agreement, lead disclosure, city addendum, HOA artifact
and owner acknowledgment, with applicability governed by the catalog. Supplied emails are not forms.
Actual managed Dotloop credentials, connection/selection and approved resources remain missing
inputs. The normal application handoff and deterministic provider checks are implemented and
release-verified with S113. Production binding, live lifecycle proof and separately authorized exact
activation remain gates for dependent effects; no connection or signature result is inferred.

For an available capability, finish agent-owned wiring and tests, publish actual approved artifacts,
connect/select verified resources, complete separately authorized exact-key activation requirements,
and run exact-SHA CI/candidate/browser/promotion/observation gates. Existing standing release authority
applies when those gates pass; no new generic deployment permission round is required. Preserve the
current closed Dotloop keys until their exact activation direction and evidence exist.

**In scope / out of scope.**

In scope: F1–F5 above, additive app state, supported exact source updates, current source-mapping
corrections, targeted documentation alignment, and preservation/release verification. The primary
interface is for ordinary Renewals staff, not a provider/debug console.

Out of scope: new automation, autonomous/scheduled/bulk/model-triggered effects, client sends,
new signature-provider execution, broad Dashboard redesign, unrelated maintenance work, arbitrary
Sheet fields or destructive row work, invented fees/policies/recipient addresses, and historical
proof reruns. This is not authority to widen roles, claims, action keys, or cost controls.

**Open questions & assumptions.**

Major scope decisions are closed: full manual dashboard/advancement, in-app Sheet updates, repair of
the existing RentCast integration, deterministic copyable drafts and preparation of the Dotloop end
state. F2.4–F5.1 resolve operation mapping, status synchronization, cycle identity, applicability and
capability ownership for the loop. Existing-row Sheet updates are required, not a future option.

Template bodies/formatting are supplied in the private September 10 pack. Remaining live inputs are
exact lease/charge/recipient/resource mappings, current mailbox/auth readiness and Dotloop credentials,
consent and approved forms. The reported security-balance root cause is not established; RentCast's
adapter/route/mount exist, with repair acceptance now explicit. The six-step provider evidence model remains compatibility state.
No numeric time, token, cost, iteration, throughput, or meeting-deadline promise is invented.

**Cross-product impacts.**

Owning surfaces are the existing renewal workspace/desk components, shared live-desk/guidance/source
projections, discrepancy/reconciliation and source-update routes/services, comp and copy preparation,
Firestore progress/preparation/attempt stores, source destinations, and operator-guide/browser tests.
S82/S104 own shared navigation/parity preservation; S102 owns rent-source semantics; S97/S98 own
provider execution integrity; S75/S105/S107 own existing progress/evidence and recovery; S51/S54 own
release assurance. S113 changes their specific user-facing composition, manual-lane, and Sheet-update
requirements without cloning those services or absorbing S34/S106 provider implementation.

**Authority and evidence map.**

| Input                                                                  | Classification                                            | Use and limitation                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner's current request and accepted planning answers                  | Explicit authority                                        | Full manual dashboard; manual advancement; in-app Sheet updates pre-approved without a new provider-contract gate; write native specs now, not product code.                                                       |
| September 9 training notes/transcript                                  | Supplied intent evidence                                  | Manual information gathering, base-rent/charge separation, exact owner approval, comps, templates, status tracking, and UI friction. Meeting assignments and speculative diagnoses are not execution instructions. |
| September 9 workflow-consolidation note and four annotated screenshots | Supplied intent evidence                                  | One lease workspace, fewer exposed internals, working next actions/source links, minimal correction form, visible comps, and stable existing integrations. No private screenshot values are copied here.           |
| Supplied feature handoff outline                                       | Requested authoring process                               | Three outcomes, fail-first deterministic checks, separate preservation gate, consolidated litmus, linear loop, and honest delivery. The latest request selects project-native specs as the deliverable.            |
| `AGENTS.md`, `docs/facts.md`, current code and tests                   | Project authority / implementation evidence               | Preserve remaining boundaries and separate current candidate behavior from newly authorized desired behavior.                                                                                                      |
| Google Sheets batchUpdate documentation                                | Bounded primary-source research performed during planning | Atomic batch application does not guarantee isolation from collaborators; no new approval or fictional API capability is inferred.                                                                                 |

Source access is not required to reconstruct this spec: material intent is embedded above. Keep the
original customer notes, raw source values, screenshots, and correspondence outside Git.
Primary API reference: <https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate>.

Input coverage: goal derived from supplied intent and confirmed answers; project evidence inspected;
bounded official-provider research and the September 10 source-grounded unblock review performed; human litmus and new
acceptance checks model-derived, not human-approved test code; preservation set project-derived;
native feature process verified; remaining runtime/capability inputs localized in F2.4–F5.1. Skeptical author review is not an
independent review or an implementation test result.

**Architecture outcome (deterministic, fail-first).**

Create separate runnable architecture checks before product edits. Each named obligation must be
tested at its actual owning boundary; use import/dataflow checks and dependency spies rather than
requiring a particular private function layout. Record new obligations failing for the right reason.

- **ARCH-S113-1** — `shared_dashboard_facts`: one projection feeds desk, dashboard, drafts, comps,
  and update inputs; distinct rent/charge sources cannot be replaced by a component-local resolver.
- **ARCH-S113-2** — `actionable_destinations`: old phase URLs and next/source actions resolve through
  verified section/source destinations, with no navigation persistence or provider effects.
- **ARCH-S113-3** — `server_owned_corrections`: typed business intent flows through authenticated
  field/lease/source resolution, existing role approvals, and per-destination execution contracts.
- **ARCH-S113-4** — `sheet_update_attempt`: supported field updates reach the existing narrow writer
  after one durable generation-bound claim; ambiguous recovery cannot mint another attempt.
- **ARCH-S113-5** — `predecision_preparation`: comp/preparation storage and rendering do not require
  owner approval; messages consume governed facts/templates and existing transport only.
- **ARCH-S113-6** — `manual_evidence_separation`: versioned staff events feed manual progress but
  cannot enter provider receipt/verified-completion inputs; old records remain compatible.
- **ARCH-S113-7** — `mounted_journey`: integrated tests exercise mounted controls and real owning
  services across all five features; direct fixture completion flags cannot satisfy the journey.
- **ARCH-S113-8** — `one_message_content_model`: preview, HTML/plain-text copy and Gmail MIME consume
  one reviewed fact/template/attachment model; provider readiness does not own local preparation.
- **ARCH-S113-9** — `capability_owned_handoffs`: supported RentVine operations and S106/S34 packet
  handoffs use their existing exact owners; no generic setter, fake signature API or duplicate executor.

**Behavior outcome (deterministic, fail-first).**

Create separate deterministic behavior checks from the external UI/API contracts, with controlled
time and provider doubles. Record expected/actual results and intended failing baselines.

- **BEH-S113-1** — `facts_and_source_links`: rent/deposit/charges/market/offer distinction, missing and
  conflicting facts, verified Sheet tab/row and RentVine links, useful unavailable destinations.
- **BEH-S113-2** — `navigate_and_resume`: exact next-control focus, keyboard/mobile access, section
  inspection, legacy deep links, reload and browser history, and desk filter/state parity.
- **BEH-S113-3** — `correct_without_internal_fields`: choose/enter a value and source without row or
  schema entry; show exact permitted destinations, role handoffs, comments, and before/after preview.
- **BEH-S113-4** — `confirmed_sheet_and_both`: an existing-row update actually calls the writer once,
  verifies the correct cell/identity and returns a receipt; both destinations expose separate results.
- **BEH-S113-5** — `write_failure_and_recovery`: forged intent, identity/header/value drift, formulas,
  blank/checkbox/date/currency handling, cancellation, expired previews, competing actors, replay,
  response loss, moved rows and readback mismatch, partial success, and fresh corrective confirmation.
- **BEH-S113-6** — `comps_and_copy`: comps before outreach; saved manual/provider evidence survives
  reload/failure; no page-triggered paid call; correct sourced message facts/recipients/charge labels;
  missing template inputs and an unsent draft never display as sent.
- **BEH-S113-7** — `manual_progress`: outside work advances waiting/next action; response is not
  approval; revised terms invalidate dependent previews; old records are not backfilled complete;
  staff completion, provider completion, non-renewal and reopened work remain distinct.
- **BEH-S113-8** — `full_operator_path`: new and externally started renewals traverse all in-scope
  manual handoffs through mounted controls, supported writes, recovery and matching desk state;
  unavailable live integrations remain explicitly unverified.
- **BEH-S113-9** — `source_template_and_copy`: supplied-template paragraph/charge/link/signature
  structure, conditional omission, no editing text or duplicated insurance, no false attachment
  claims, rich/plain copy parity, denied clipboard fallback, Gmail-unavailable preparation and exact
  MIME readback/replay compatibility pass. Use sanitized fixtures; raw emails stay private.
- **BEH-S113-10** — `rentcast_restoration`: mounted lookup reaches the existing route/adapter once
  per explicit intent, preserves its separately metered conditional trend read, and restores saved
  evidence before owner decision; hidden UI and simulated results cannot pass as restored integration.
- **BEH-S113-11** — `cycle_and_source_progress`: one value creates app progress plus a pending
  confirmed Sheet proposal without retyping; failure remains visible; next-cycle activity cannot
  reuse old approval/completion and applicability/assisted-housing branches are explicit.
- **BEH-S113-12** — `provider_scope`: current versus future charge schedules, displayed-rent
  readback divergence, one-time-fee refusal, named Dotloop readiness/packet handoff and absent
  signature capability produce the exact F2.4/F5.1 outcomes without disabling unrelated work.

**Human litmus outcome.**

These entries are authored before implementation. The implementation runner fills model verdicts
with concrete observations; human verdicts remain unfilled for batch review. If reporting requires
a human status without an observer, use `Human verdict: NOT RUN — no human observer`, not a fabricated
PASS. Human review does not interrupt independent implementation or substitute for deterministic gates.

### H1 — Understand one lease and inspect its sources

**If this was built correctly:** I can see who the renewal concerns, its dates, base rent, separate
charges, and waiting status, then open the exact source or a useful comparison.

- Model verdict: PASS - evidence: The compiled full-cohort desk and five-section guide verify distinct rent facts, exact source controls, inspection-only refusal and desk/workspace term parity.
- Human verdict: NOT RUN - no human observer

### H2 — Reach the next action and return to my list

**If this was built correctly:** The next-action control takes me to something I can actually do.
I can inspect later work, use an old link, and return to the same filtered renewal list.

- Model verdict: PASS - evidence: The complete compiled desk smoke verifies keyboard navigation, every dashboard section, historical URLs, exact filtered return and browser Back; the rebuilt history trace confirms restored route state.
- Human verdict: NOT RUN - no human observer

### H3 — Correct a value without technical form filling

**If this was built correctly:** I select a shown value or enter a correction and its source. I see
where it can be applied and exactly what will change without finding a row number or internal code.

- Model verdict: PASS - evidence: The mounted correction control and visible compiled guide reach the typed value/source/destination editor without row numbers or provider identifiers; forged-target and role tests pass.
- Human verdict: NOT RUN - no human observer

### H4 — Update the Sheet and understand separate outcomes

**If this was built correctly:** I can confirm an existing-row Sheet change in the app and see its
read-back result. When updating both systems, I can tell which succeeded and which still needs work.

- Model verdict: PASS - evidence: The mounted fresh journey executes a typed Sheet proposal through the actual route, durable claim, receipt, readback and reload. Separate destination outcomes and pending synchronization are verified with deterministic external adapters.
- Human verdict: NOT RUN - no human observer

### H5 — Recover without repeating an uncertain write

**If this was built correctly:** A changed or interrupted update explains the observed problem and
offers the correct review/recovery action. I do not accidentally repeat a completed change.

- Model verdict: PASS - evidence: Actual source-update and S20 backend paths refuse stale/formula/ambiguous targets, preserve receipts, prevent duplicate attempts and require a new confirmed correction; Gmail and packet recovery use their own retained attempt evidence.
- Human verdict: NOT RUN - no human observer

### H6 — Gather comps and prepare messages

**If this was built correctly:** I gather and retain comps before contacting the owner, see a
source-filled message preview, and prepare the tenant message using the exact approved rent and
separate charges. The supplied template formatting is preserved, staff editing notes are absent,
and I can copy the reviewed message when Gmail is unavailable. A draft is not called sent.

- Model verdict: PASS - evidence: Mounted RentCast comp/trend preparation persists before owner contact; supplied v2 rich/plain preparation, conditional charges, clipboard fallback and governed Gmail draft/reconnect/recovery pass. No live draft or send is used as proof.
- Human verdict: NOT RUN - no human observer

### H7 — Record outside work and finish the manual workflow

**If this was built correctly:** I record actual sent/received messages, approval, documents and
applicable follow-ups, close the page, and resume at the right task. My completion is labeled as
recorded by staff, and correcting a previous answer reopens the affected work. Pending Sheet updates
stay visible without retyping, and a later renewal does not inherit the old completed checklist.

- Model verdict: PASS - evidence: Fresh and underway Editor journeys persist actual manual events through staff completion, reload and independent desk projection; counteroffers, non-renewal, reopening, pending Sheet work and cycle isolation pass. Staff reports never become provider receipts.
- Human verdict: NOT RUN - no human observer

### H8 — Follow the whole journey with an honest guide

**If this was built correctly:** I can follow the guide from a fresh or already-started renewal
through manual completion, with working controls and clear limits for unavailable integrations.

- Model verdict: PASS - evidence: All seven applicable compiled browser checks and mounted fresh/underway backend journeys pass. The guide exposes required link boxes and normal S106/S34 continuation; missing actual forms/connection/keys remain explicit resource-dependent gates.
- Human verdict: NOT RUN - no human observer

**Requirement-to-outcome traceability.**

| Requirement                               | Authority                                               | Architecture             | Behavior    | Human litmus / falsification                                                                                 |
| ----------------------------------------- | ------------------------------------------------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------ |
| F1 shared facts and sources               | Notes/screenshots; existing source contracts            | ARCH-S113-1              | BEH-S113-1  | H1; swapped amount source or wrong destination fails.                                                        |
| F1 dashboard/navigation                   | Owner accepted full dashboard                           | ARCH-S113-2              | BEH-S113-2  | H2; inert next action, blocked inspection or lost list context fails.                                        |
| F2 minimal editor                         | Notes/screenshots                                       | ARCH-S113-3              | BEH-S113-3  | H3; internal identifier entry or forged target acceptance fails.                                             |
| F2 in-app Sheet and both                  | Explicit owner correction                               | ARCH-S113-4              | BEH-S113-4  | H4; refusal-only or hidden partial-success implementation fails.                                             |
| F2 failure/correction                     | Preserved execution boundaries                          | ARCH-S113-3, ARCH-S113-4 | BEH-S113-5  | H5; replay, false success or guessed repair fails.                                                           |
| F3 comps/messages                         | Notes; existing transport and copy boundaries           | ARCH-S113-1, ARCH-S113-5 | BEH-S113-6  | H6; owner-prerequisite cycle, erased evidence, invented copy/recipient or false sent state fails.            |
| F4 manual advancement                     | Owner accepted manual advancement                       | ARCH-S113-6              | BEH-S113-7  | H7; provider receipt required for manual work, missing explicit approval or manufactured verification fails. |
| F5 journey/release                        | Accepted outline; repository delivery rules             | ARCH-S113-7              | BEH-S113-8  | H8; service-only fixtures passing while mounted flow fails is insufficient.                                  |
| Supplied-template rendering and transport | September 10 PDFs and owner direction                   | ARCH-S113-8              | BEH-S113-9  | H6; editing notes, duplicate charges, formatting/content mismatch or Gmail-only preparation fails.           |
| Existing RentCast restoration             | Owner annotation and current component/adapter evidence | ARCH-S113-5              | BEH-S113-10 | H6; merely finding the old source file is insufficient.                                                      |
| Cycle and synchronized manual work        | Source-grounded unblock review; additive safe defaults  | ARCH-S113-6              | BEH-S113-11 | H7; previous-cycle approval or hidden pending Sheet update fails.                                            |
| Exact provider capability guidance        | Owner annotations; official schemas and current code    | ARCH-S113-9              | BEH-S113-12 | H8; invented setters/signature effects or unnamed future ownership fails.                                    |

**Preservation set.**

Pin the existing focused tests for S102 rent/detail mapping, desk query/identity/parity, source
destinations, renewal process/progress/outcomes, role-action governance, copy/send boundary, comp
query/limits, S97/S98 proposal/claim/receipt/recovery, and post-write freshness before edits. Run them
as a separate gate. Preserve unknown/partial reads, old records/URLs, masked party filters, exact
keys/roles/runtime controls, no sends, no proof reruns, and no secrets/customer values in Git.

Explicitly amended expectations are the six-phase presentation/inspection barrier, provider-only
manual advancement, and S98 blanket normal-field refusal. Record each old assertion replaced and
its new acceptance owner; do not preserve obsolete requirements as permanent regressions and do not
weaken unrelated identity/freshness/receipt checks. Pre-existing failures are recorded separately.

**Adversarial acceptance checks.**

- **AC-S113-1** — ARCH-S113-1 and BEH-S113-1 pass through actual mapper/projection consumers; wrong
  rent source, absent detail, extra charges and mismatched source rows cannot be hidden by a label.
- **AC-S113-2** — ARCH-S113-2 and BEH-S113-2 pass mounted semantic-control/browser checks, including
  keyboard focus, existing deep links, source destinations and zero-effect navigation.
- **AC-S113-3** — ARCH-S113-3 and BEH-S113-3 reject client-selected physical targets and preserve
  role handoffs while presenting the simple business-field editor.
- **AC-S113-4** — ARCH-S113-4 and BEH-S113-4 demonstrate actual normal Sheet field execution through
  the existing adapter and independent RentVine/Sheet results, not a permanently disabled control.
- **AC-S113-5** — BEH-S113-5 exercises claim races, stale rows/values, formulas, type representation,
  duplicate confirmations, after-apply timeout, readback mismatch and fresh correction. An app lock
  or matching amount is never asserted to prove collaborator isolation or causality.
- **AC-S113-6** — ARCH-S113-5 and BEH-S113-6 prove pre-owner preparation, persistence, exact source
  attribution, missing-template behavior, verified recipients and no automatic provider effects.
- **AC-S113-7** — ARCH-S113-6 and BEH-S113-7 prove manual resumption/completion, branch handling,
  explicit owner approval, terms invalidation and non-interchangeable staff/provider evidence.
- **AC-S113-8** — ARCH-S113-7 and BEH-S113-8 pass from the mounted operator path; every H1–H8 model
  verdict cites observations and the guide matches actual controls.
- **AC-S113-9** — All new checks and the separately pinned preservation set pass, mechanical diff
  traceability and redaction pass, and release status is reported only to the verified environment.

- **AC-S113-10** — ARCH-S113-8 and BEH-S113-9 pass for the private source-derived structure with
  sanitized fixtures and real composer/MIME/clipboard owners; live inputs do not block local copy.
- **AC-S113-11** — BEH-S113-10 proves restoration through the mounted component, actual route,
  adapter, retained state and error path, preserving existing comp/trend allowance behavior.
- **AC-S113-12** — BEH-S113-11 proves source-update visibility, no duplicate entry, reviewed
  applicability and isolation between renewal cycles alongside ARCH-S113-6 preservation.
- **AC-S113-13** — ARCH-S113-9 and BEH-S113-12 implement the exact operation matrix and downstream
  packet readiness. S34/S106 release/activation checks remain their own obligations, not a mock PASS.

**Forbidden actions / hard gates.**

No direct/autonomous sends, new automation, proof reruns, arbitrary provider/range mutations, row
deletion, fabricated source/customer/template/recipient data, or fake provider evidence. Exact source
writes still need human initiation, preview/confirmation, role/key/runtime permission, bounded
attempts, receipt/readback and correction. Normal Sheet field updates are already authorized and
must not be parked for another provider-contract approval. Preserve protected paths outside this
specific authority, identities, budgets, eleven Spaces, bindings, and historical evidence.

**Dependencies / sequencing.**

One serialized suite: F1 shared facts/dashboard → F2 corrections/Sheet updates → F3 comps/messages →
F4 manual progression → F5 integrated verification. Use current implementations of the owning
suites; do not rerun completed suites or require their provider-dependent future phases first.
S113 is the next product implementation before new automation and Dotloop execution. Authentication
recovery and release assurance may proceed independently; no subagents or new runner machinery is
required. S36 remains dependent on complete S100; that separate queue is not widened here.

**Standalone delivery contract.**

- **Deliverable now:** implemented F1-F5 dashboard and backend paths, this verified contract,
  consolidated litmus, current operator guide and synchronized authority/plan. Live acceptance is
  reported only after the remaining exact release gates pass.
- **Implementation deliverable:** working dashboard, supported source writes including in-app
  existing-row Sheet updates, predecision preparation, audited manual lane, recovery, checks and
  matching operator documentation. Every change maps to F1–F5 or a named preservation obligation.
- **Consumes, but does not assume:** current source/configuration, existing permissions, approved
  templates and live provider/browser readiness. Missing data is typed/visible and localizes the stop.
- **Externally constrained effects:** Gmail live creation requires exact verified terms/recipients,
  published supplied copy and managed mailbox readiness; copyable preparation remains required.
  Release auth/browser holds affect live assurance. S106/S34 own Dotloop deployment once their exact
  prerequisites pass. A manual Sheet handoff is not an acceptable substitute for F2.
- **Produces for downstream suites:** shared dashboard facts, attributed preparation, separate
  manual/provider status, exact source-write results and recovery history, and a verified guide.

**Verification and delivery contract.**

The seven kickoff inputs are fixed here: model-derived acceptance obligations; project-derived
preservation set; existing structural owners plus additive state; separate deterministic architecture
and behavior checks with human litmus residue; real files/mechanical Git extraction; no invented
numeric budget; and batch human review after implementation. Freeze those inputs before product edits.

1. Record HEAD/status, reachable history and prior-attempt/generated residue without deleting or
   rewriting it. Establish the actual starting state and pre-existing failures in one linear record.
2. Materialize architecture checks, behavior checks, preservation baseline and H1–H8 before the first
   product edit. Demonstrate each new obligation failing for its intended reason. Existing invariants
   remain preservation, not artificial fail-to-pass work.
3. Make one coherent change; rerun applicable gates. Feed the next iteration each named failure,
   requirement, exact input/target, expected/actual result and diagnostic. Track remaining obligations.
4. Review adversarially for wrong targets, stale terms, state conflation, lost preparation, caller/
   consumer omissions, privacy leakage, mocks bypassing real services and missing recovery. Repair
   in-scope findings and rerun affected checks; amendments are explicit and evidence-backed.
5. Run focused tests, `bash scripts/verify.sh` and applicable core E2E/browser checks for a ship
   candidate. Run native spec shape/traceability/freshness/path and format/redaction checks for
   current documentation too. A document check is not product acceptance.
6. Extract and inspect the mechanical Git diff from the recorded start; include new files, exclude
   scratch/private/unrelated changes, and check clean reapplication where feasible. Report exactly
   what was checked. Never substitute a hand-authored prose diff for actual changed files.
7. Ship green authorized slices only. Code release requires exact-SHA CI, zero-traffic candidate,
   configuration/domain and managed-browser assurance, exact promotion and 300,000 ms observation.
   Read back cloud mutations; documentation-only changes do not deploy.
8. Report implementation `ALL_GATES_GREEN` only when architecture, behavior, preservation,
   traceability, mechanical delivery and applicable integration/documentation gates pass and model
   litmus entries contain evidence. Report `BUDGET_EXHAUSTED` only at an actual explicit/platform
   limit; `BLOCKED` names an exact external dependency after independent work is complete. Separate
   code readiness, live acceptance, human observation and production deployment; never self-certify
   unperformed checks or call a partially blocked suite operationally complete.

**Ordered prompt sequence.**

1. Read the router/current facts/resume point and this spec; verify the starting evidence and freeze
   the checks above. Implement F1 using existing shared readers and navigation contracts.
2. Implement F2 with simple typed intent and actual pre-approved Sheet field updates; preserve
   source execution integrity and test conflict/partial/ambiguous outcomes.
3. Implement F3 preparation before owner approval, retaining actual template/publication boundaries.
4. Implement F4's manual lane, additive compatibility, explicit outcomes and truthful completion.
5. Execute F5's full mounted journey, adversarial and preservation checks, guide alignment and
   applicable release gates. Report the evidence and exact remaining external inputs together.

**Deletion/merge recommendation.**

Retain S113 until all five feature acceptance groups and separately named live gates have owners in
code/tests/current facts. Then merge surviving contracts into those owners and retire this narrative
to Git history. F1–F5 are not separately enqueued suites; the consolidated H1–H8 checklist is the
single human review artifact. Do not retire S98 evidence, S34/S106 dependencies, or unrelated work.
