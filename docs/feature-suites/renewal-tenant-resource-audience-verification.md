<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S265 — Verify tenant access to renewal offer resources

> Status: AUTHORING READY, intake 143. Thursday fixes. Unverified tenant links are source
> pending.

**Goal.**

A tenant offer links only to the intended current resource with verified access for its
tenant audience. Staff can identify the exact missing resource before sending.

**Current state / intended end state.**

The existing Renewal resource links settings allow blank entries and a verification
checkbox for a safe URL. Current composition uses verified resource URLs and applies
separate RBP, insurance and information-form logic. On the November 10 readback all three
were blank/unverified. A staff-only link opening or a checkbox alone does not establish
tenant access. The intended change ties usable links to current audience evidence.

**Actors and entry conditions.**

A scoped renewal operator reviews the offer and follows a link readiness item. The
existing Admin role owns Connections → Renewal resource links. An authorized resource
owner supplies the approved destination and an appropriate tenant-audience access check.
Read-only staff can see readiness without being offered Admin edits.

**What it is / how it functions.**

Determine whether the exact message includes the information form, an RBP flyer for a new
or changed package or an insurance flyer for an applicable transition. Review the current
audience evidence for each included resource. A missing or stale link points to its
specific Connections entry. After a separately authorized correction, staff reopen and
re-review the same offer.

| Settings entry             | When the exact offer needs it                                                       |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `insurance_flyer`          | An applicable insurance transition or other explicitly included insurance resource. |
| `rbp_flyer`                | A new or changed RBP or other explicitly included RBP resource.                     |
| `renewal_information_form` | The offer includes the optional form and its instructions.                          |

Readiness links to `/connections#renewal-resource-entry-<resourceId>` using the existing
entry IDs and role guards.

After the offer's terms and charges are ready, an included resource lacking evidence shows
the exact resource as the next review fix. Admin reaches its one existing Connections
entry. Other scoped staff see the destination and the Admin handoff. With no usable
information-form link and no explicit inclusion, omit both the form request and its link
from the outgoing offer. A usable form keeps its existing supported inclusion. If staff
elect to include it, require a verified link with its instructions. A missing flyer
required by the current RBP or insurance case keeps that review held. The draft and
unaffected preparation remain available.

- **R-S265-1 — Verify the audience of the exact resource.** Use the existing three entries
  in Connections and extend their existing save/review with the approved destination, who
  checked and when, and evidence the intended tenant audience can reach the correct
  current resource under the applicable access model. Bind minimal evidence to the exact
  destination and document version, resource purpose, audience, proof version and its
  validity. A tenant-wide resource needs a permitted check that proves the intended
  tenant-wide access model. A restricted resource needs evidence that covers the exact
  verified intended recipients who must use it. A staff sign-in, one unrelated tenant's
  access or a safe-looking URL alone is insufficient.
- **R-S265-2 — Apply inclusion to the exact offer.** Require a usable tenant-accessible
  link for the resources the offer includes. A new/changed RBP invokes the current
  conditional flyer requirement. An applicable insurance transition invokes its own flyer
  and wording. An optional information form may be omitted under existing behavior. If
  deliberately included, require verified access and keep its instructions and URL
  together. Preserve S264's material transition hold when applicability or change status
  is unknown. Validate inclusion against the final reviewed content, including supported
  wording edits. An added required clause or link without a current authoritative match
  needs exact review. Placeholder and staff-only links cannot supply that proof.
- **R-S265-3 — Recover and re-review precisely.** Show the exact missing resource in Offer
  the tenant, with the existing scoped Connections destination and a clear handoff for an
  Editor. Changed destination or evidence makes only the affected offer review stale.
  Reopen after a fresh read, with draft wording retained until re-reviewed. If an earlier
  send is uncertain, its original receipt/reconciliation takes precedence.
- **R-S265-4 — Use the same included-resource basis at release.** Freeze the exact
  included resource evidence in the reviewed message and recheck it before its claim
  through the common rules below. Apply this to Gmail draft export and tenant sends
  including scheduled occurrences and any follow-up that uses the resource.

### Resource evidence at review and claim

Use one authoritative basis for each included renewal resource in the exact message. Bind
its ID, purpose, exact HTTPS destination and document version, the exact audience or
applicable tenant-wide access scope, and the current proof identity/version and validity.
A restricted proof must cover the intended audience at this use. Retain the separate exact
recipient and sender checks. Store evidence references within the existing authorized
boundary. No access model is inferred from a URL shape.

The final exact content determines the included set. Required clauses and supported edits
must resolve to their verified resources. An omitted resource contributes no entry to the
reviewed basis. A later setting change cannot silently add a resource to reviewed content.
The draft-export and send paths use the same inclusion rules and evidence identity for the
same content. They do not compare the global settings version or the URL alone as a
substitute.

Recheck the relevant current proof and exact authorization at the existing durable draft
or message claim, or its equivalent atomic guard. At dispatch use the actual authorized
occurrence. A changed, expired, revoked or insufficient proof holds that unsent occurrence
before dispatch even when the URL is unchanged. An unused resource change does not
invalidate a different otherwise eligible message. The initial send's confirmed acceptance
still governs follow-up eligibility. Existing material terms, sender, recipient, claim and
reply-pause checks continue separately.

Earlier confirmations and uncertain attempts retain their original evidence. For an unsent
legacy authorization that includes an affected resource and lacks the required basis, hold
and re-review the exact current message. Preserve an otherwise eligible legacy message
when its exact stored content proves it omits the resource and its other guards pass.
Reconcile an uncertain prior attempt before acting again.

**In scope / out of scope.**

Tenant accessibility and readiness for the three existing renewal resource types. No new
public sharing, file upload, publishing policy, automated login or provider mutation. Use
the existing legal-form and other resource gates for their distinct purposes.

**Open questions & assumptions.**

- Source pending for the exact current destinations and audience-access evidence for the
  insurance flyer, RBP flyer and renewal information form. Staff must identify the
  resource owner, approved location and successful audience check. On the November 10
  shared settings readback all three entries were blank and unverified.
- The resource owner supplies the applicable tenant-wide or exact recipient evidence. An
  expiring or restricted destination needs proof that covers the actual planned use.
  Missing, stale or revoked proof keeps that resource source pending.

**Cross-product impacts.**

Admin → Connections, the existing shared resource locations record, tenant offer readiness
and composition, exact outbound review, role-scoped navigation, Help, synthetic
screenshots and assurance landmarks.

**Authority and evidence map.**

| Input                                                                                                                                                                             | Classification                  | Use and limitation                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| November 10 Fathom walkthrough 42:59–47:42 and 53:21–56:03, plus accepted Q5                                                                                                      | Intent and owner decision       | Staff raised the form and flyers, when to include them and whether tenants can access them.                  |
| November 10 shared settings readback, S161 and existing exact communications contracts                                                                                            | Verified baseline and authority | The three entries were blank/unverified. Preparation and conditional effects keep their existing boundaries. |
| `lib/lease-renewal/resource-locations.ts`, `lib/firestore/renewal-resource-locations.ts`, `lib/lease-renewal/message-readiness.ts` and `lib/lease-renewal/message-claim-basis.ts` | Committed implementation        | Reuse current Admin surface, entry IDs, review binding and precise links.                                    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S265-1** — Extend the existing versioned resource record and typed
  usable-resource projection. A blank/legacy attestation without audience evidence is
  pending for tenant use. Preserve other purposes and records without promoting their
  scope.
- **ARCH-S265-2** — Apply one inclusion and readiness projection to exact message content,
  including supported edits. Use the same material transition results and named source fix
  as S264. Persist reviewed inclusion rather than regenerating it from unrelated settings.
- **ARCH-S265-3** — Reuse existing resource version/CAS, message readiness destination and
  claim basis. Preserve earlier review bytes and separate a validation failure from an
  uncertain send.

- **ARCH-S265-4** — Use the included-only proof and audience identity in both existing
  Gmail claim and sequence authorization and dispatch paths. Reread the current proof at
  the exact claim, including legacy, same-URL and scheduled cases.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S265-1** — Staff see a verified resource with its check or Source pending with a
  precise reason. A private staff folder, wrong document, placeholder, invalid or replaced
  destination cannot become a usable tenant URL.
- **BEH-S265-2** — Staff can prepare an offer missing one required flyer and see its exact
  pending task. An offer with no triggered flyer and no included optional form proceeds
  under the same existing gates.
- **BEH-S265-3** — The operator sees which link needs a verified source, uses the
  appropriate Admin handoff and resumes the same offer. A stale tab cannot send a replaced
  link.

- **BEH-S265-4** — A proof change at the same link can pause the affected draft export or
  unsent occurrence for review. Staff can continue the otherwise eligible message that
  omits that resource, and past effects retain their evidence.

**Human litmus outcome.**

### Verify the tenant can use the links in this offer

**If this was built correctly:** A staff member can explain which resource belongs in the
offer, see which one needs a tenant-access check, and reopen the corrected preview at the
same work without sharing a private link.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome | Behavior outcome | Human litmus                                      | Deterministic evidence / falsification                                                       |
| -------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R-S265-1 Verify the audience of the exact resource       | ARCH-S265-1          | BEH-S265-1       | Verify the tenant can use the links in this offer | AC-S265-1. Versioned settings and usable-link decisions with synthetic destination/readback. |
| R-S265-2 Apply inclusion to the exact offer              | ARCH-S265-2          | BEH-S265-2       | Verify the tenant can use the links in this offer | AC-S265-2. Composition and exact admission with no global optional-form gate.                |
| R-S265-3 Recover and re-review precisely                 | ARCH-S265-3          | BEH-S265-3       | Verify the tenant can use the links in this offer | AC-S265-3. Compiled navigation, revision readback and send fence.                            |
| R-S265-4 Use the same included-resource basis at release | ARCH-S265-4          | BEH-S265-4       | Verify the tenant can use the links in this offer | AC-S265-4. Same-URL, wrong-audience and omitted-resource checks on both paths.               |

**Preservation set.**

- Existing blank location support and Admin ownership, resource-specific navigation and
  precise conditional inclusion.
- Staff preparation with missing facts and exact outgoing review, sender/recipient,
  existing claims, receipts and uncertainty handling.
- No cross-purpose approval of legal originals or unrelated resource settings.

**Adversarial acceptance checks.**

- **AC-S265-1** — Try blank and legacy records, malformed URL, a redirect to inaccessible
  or wrong content, staff-only access and a real-format synthetic audience proof. Verify
  editor permission, stale save and persisted version.
- **AC-S265-2** — Drive a matrix of changed/unchanged RBP, applies/does not apply
  insurance transition, optional form included/omitted, manually edited resource wording
  and all evidence states. Inspect preview and exact reviewed payload. An unset optional
  form yields neither an outgoing placeholder nor a blocking Guided alert. An included
  unverified flyer or form shows its own fix before review. Exercise an authored resource
  clause or changed URL. A material unknown transition remains held even with an otherwise
  verified link.
- **AC-S265-3** — Use two sessions to revise one resource while a review is open. Verify
  exact target, working draft retention, invalidated included resource and independent
  path for offers that omit it.

- **AC-S265-4** — Use exact reviewed content to exercise the real draft claim, immediate
  send and scheduled worker with guarded adapters. Change or revoke proof at the same URL
  after review or scheduling. Test expiry and a restricted proof covering a different
  recipient. Each affected unclaimed effect refuses and keeps its exact review recovery.
  Change an omitted resource and verify no invalidation or automatic inclusion. Include a
  legacy authorization with no sufficient proof, a confirmed initial send with an
  unaffected authorized follow-up, and an unresolved attempt that can only reconcile.
  Preserve prior receipts and bytes.

**Forbidden actions / hard gates.**

No publishing links, changing sharing permissions, creating a resource, reusing a
staff-only destination or making a live send as proof. Existing roles, scoped effects,
exact-target authorization, claims and receipt/reconciliation gates remain in force.

**Dependencies / sequencing.**

Consumes exact inclusion conditions from S264 or existing explicit staff choices. Uses
current source-pending state independently of external evidence. Any later verified
location is bound through the same setting, with no new independent registry.

**Standalone delivery contract.**

- **Deliverable now.** Audience evidence and included-only proof validation in settings,
  offer, Gmail draft and send paths, exact recovery and Help.
- **Consumes, but does not assume.** Approved destinations and audience evidence where
  available. Blanks and old entries lacking this evidence remain source pending for tenant
  use.
- **Externally blocked effect.** AC-S265-2 holds only the effect that includes an
  unverified required resource. An otherwise eligible offer that omits the optional form
  keeps its existing path.
- **Produces for downstream suites.** The exact reviewed resource proof for the existing
  message claims, unaffected omission and S271 qualification.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run resource schema/CAS, target URL and audience fixtures, exact claim basis and
   compiled conditional link/return checks. Use synthetic fixtures for effects and guarded
   read-only production probes where authorized. Run the affected Help and control-map
   checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Baseline the three exact entries and conditional message cases without attempting a
   real send.
3. Add evidence to the existing resource flow and verify every inclusion, omission and
   stale review branch.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
