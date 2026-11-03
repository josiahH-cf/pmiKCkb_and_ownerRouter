<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->
<!-- owner-amendment: 2026-10-20 -->

# S227 — Completely retire custom maintenance

> Status: Original October 20 retirement DELIVERED and carried by November 3 production. A-07 source and local gate QUALIFIED; application delivery PENDING. Exact shared eligibility, action admission and notice-only/410 history refusal passed full06 and focused preservation checks; final v8 runtime scope is recorded in [implementation evidence](../evidence/application-gap-implementation-2026-11-03.md). Stored evidence is preserved; no historical proof or retired action was rerun.

**Goal.**

The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor
operational entry points disappear. Shared active attention surfaces also stop presenting retired
maintenance and completed proof work as current decisions. Stored records and receipts are not
purged; unrelated renewal, knowledge, staff accountability and permissions remain intact.

**Current state / intended end state.**

Delivered by run `57e4a1b5-dd25-4302-9cfe-c9962c87d4ae` at `157b6992` on October 20 (evidence:
`docs/evidence/application-delivery-2026-10-20.md`). Production now serves
`bc97535379dd08deab578455b00a80fc93b8d209` / `pmi-kc-app-rmvzwt7ms-00754475effd` (November 3,
run `d4c109a0`; `docs/evidence/application-delivery-2026-11-03.md`), which carries the original
retirement. The newly assessed A-07 follow-up is not delivered by either receipt.

The owner explicitly amended the earlier October 16 history/unsent-only boundary. This suite owns
its corresponding revision; no older READY row or other program is newly executed.

On November 3, the guarded canonical Admin assessment read `GET /api/dashboard/attention` and
observed two `queue_item` rows linking to retired `/maintenance` routes. Their displayed process
labels identified the earlier S99 create/cancel proofs. They still appeared as actionable
"Waiting on you" cards. The response was separately `partial`, with `renewal_reviews` unavailable;
this does not establish the cause of that feed failure or mean the two old prompts are valid.
Detailed record identifiers and raw readback stay in the private assessment evidence.

The current source explains the projection defect: `lib/approval/needs-decision-inbox.ts` (lines 147-166)
accepts nonterminal queue status and copies the stored action, label and direct link without
retirement eligibility filtering. `lib/attention/attention-queue.ts` (lines 139-159) projects those rows;
`app/api/dashboard/attention/route.ts` (lines 12-18) returns them. Exact workflow, route and operation
retirement helpers already exist in `lib/maintenance/retirement.ts`, but are not applied at that
shared inbox boundary. Historical nonterminal queue state does not grant a new proof or action.

Intended A-07 delta: current-decision eligibility is applied consistently before active rows,
counts and inline capabilities are emitted. Retired maintenance work and already completed proof
actions cannot reappear as current work because an old queue record remains nonterminal. The
underlying record, activity, receipt, original result and permissions remain unchanged.

**Actors and entry conditions.**

Managed staff retain current role/Space/mailbox permissions. Provider connections use the approved
integrations account; WSL CLI/ADC and guarded Admin assurance retain their existing identities.
The A-07 projection uses the authenticated actor's current access and server-owned queue origin,
retirement and linked lifecycle evidence. A title containing "proof" or "maintenance" alone is
not sufficient classification; ordinary authorized knowledge or a staff task is not retired by
word matching.

**What it is / how it functions.**

The delivered retirement remains intact. The A-07 follow-up extends its shared-consumer coverage
through the existing needs-decision eligibility boundary. Reuse exact retired workflow/action/path
identifiers and authoritative linked execution/proof lifecycle where needed. The two observed
retired destinations are already classifiable without changing any record. Diagnose any additional
legacy shape using existing provenance; do not invent a client decision or infer completion from
a label. Unknown origin is not authority to execute or rerun a proof.

Apply one consistent policy to Dashboard attention, the unified Approval Queue decision view,
Notifications decision backlog, assistant approval context and other existing consumers. Remove
excluded rows from active counts and inline approval offers as well as visible links. Preserve
real active renewal decisions, genuine staff-accountability work and permitted knowledge.
Do not close, delete, reassign, relabel, backfill or otherwise mutate old queue/effect records to
make the cards disappear. Preserve partial/unavailable feed states independently of eligibility;
filtering old rows must not turn an unavailable renewal feed into an all-clear verdict.

**In scope / out of scope.**

The A-07 delta covers shared active-decision eligibility, projections/counts/links/capabilities,
non-destructive retention and focused regression evidence. It does not repair an unestablished
renewal-feed outage, change the renewal desk's cohort policy, add a history UI, or initiate queue
transitions. No production purge, customer/provider proof effect, generic send, maintenance revival,
new leasing, protected activation, identity privilege change, budget change, guessed resource or
signature API is granted. The owner launched the A-07 source/focused-check slice; cumulative
qualification and delivery remain pending.

**Open questions & assumptions.**

No new client input or authority is needed to diagnose and specify A-07. Existing approved access
can resolve current queue provenance and retirement mappings. The exact cause of the independently
unavailable renewal-review feed remains unestablished by this finding and must not be attributed
to maintenance filtering. If legacy origin/lifecycle evidence is unavailable, state that bounded
uncertainty without promoting the item to executable work or destroying its evidence.

No material product question remains for the A-07 projection. Preserve settled retirement without
asking Dan or staff to close old proofs as a prerequisite. Dan remains the contact for a genuinely
unresolved PMI business question; technical provenance/eligibility diagnosis belongs to engineering.

Dotloop/template/form and human acceptance dependencies retain their current canonical entries in
`docs/open-blockers.md`; dated October 20 access findings do not create new holds here.

**Cross-product impacts.**

HTTP/page admission, navigation, shared source projections, renewal communications, existing
connections, form intake/configuration and release assurance must agree. Preserve all eleven Spaces,
runtime identity, Production/Live, Demo=false, Sheet=true and existing secret/cost/security controls.

A-07 owners and consumers: `lib/approval/needs-decision-inbox.ts`,
`lib/approval/needs-decision-gather.ts`, `lib/attention/attention-queue.ts`,
`lib/attention/decision-backlog.ts`, `components/approval/ApprovalQueue.tsx`,
`components/console/DashboardAttentionQueue.tsx`, `lib/ask/app-state-context.ts` and
`lib/operational-context/server-context.ts`. The shared policy must cover each active projection
without a parallel retirement list or changes to stored evidence. S232 owns renewal desk/Focus
cohort reasons and remains a preservation contract; it does not own generic legacy queue admission.

**Authority and evidence map.**

| Input                                                                        | Classification      | Use and limitation                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| October 20 owner request and explicit Send/Schedule/Resume reply             | Execution authority | Revises this exact scope through qualification, publication and existing guarded deployment.                        |
| Current committed code, deterministic tests and direct managed/browser reads | Evidence            | Distinguish fixtures, observations and production effects; detailed material stays private.                         |
| Earlier releases and registry metadata                                       | Historical evidence | No backlog execution, renewed permission or present provider success follows.                                       |
| November 3 guarded Admin attention GET and current inbox source              | Live/source finding | Establish A-07's two retired current-decision prompts; no queue transition, execution or proof rerun was performed. |
| Current assessment instruction                                               | Current authority   | Author the bounded follow-up only; does not initiate implementation or a release.                                   |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S227-1** — The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.
- **ARCH-S227-2** — One shared current-decision eligibility rule consumes exact retirement/provenance
  evidence before active attention rows, counts and inline capabilities. All existing inbox consumers
  reuse it; stored nonterminal status cannot revive a retired or completed-proof action.
- **ARCH-S227-3** — Eligibility is a read projection. It preserves records/receipts byte-for-byte,
  current actor admission, renewal-feed completeness state and unrelated knowledge/staff work.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S227-1** — The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.
- **BEH-S227-2** — Opening Dashboard, unified decisions, Notifications or an approval answer shows
  no active prompt, count, retired destination or inline approval for the observed retired proof
  shapes. Real active renewal/staff decisions remain available under their existing permissions.
- **BEH-S227-3** — A nonterminal queue record linked to a completed proof cannot request another
  execution. Reopening/retrying a read never closes or replays it; an unavailable renewal feed
  still reads partial/unavailable after retired rows are excluded.

**Human litmus outcome.**

### Completely retire custom maintenance

**If this was built correctly:** The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.

- Model verdict: PASS — deterministic implementation qualification; guarded delivery and external-resource verification remain separate.
- Human verdict: NOT RUN — no human observer

### Current work excludes retired proof prompts

**If this was built correctly:** Staff see actual current decisions on the Dashboard and shared
attention views. Old maintenance proofs do not ask them to approve, create or cancel anything again.
Their real renewal work remains visible, and a failed feed still says that some information is
unavailable. No past evidence has been deleted or rewritten to achieve this.

- Model verdict: NOT RUN — A-07 shared eligibility and immutable action-admission source pass focused checks; cumulative qualification, this model litmus and delivery remain pending. No historical proof was rerun.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                 | Architecture outcome | Behavior outcome       | Human litmus                                | Deterministic evidence / falsification                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S227-1 — Remove maintenance/history navigation and redirect legacy page bookmarks without loading records.                                | ARCH-S227-1          | BEH-S227-1             | Completely retire custom maintenance        | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-2 — Refuse all retired API namespaces, including historical reads, before handler/provider construction; retain genuine logout only. | ARCH-S227-1          | BEH-S227-1             | Completely retire custom maintenance        | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-3 — Remove shared maintenance/vendor search and composition consumers while preserving retained records and receipts.                | ARCH-S227-1          | BEH-S227-1             | Completely retire custom maintenance        | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-4 — Preserve renewal usability, shared provider connections, staff knowledge and standalone Vendoroo without an invented URL.        | ARCH-S227-1          | BEH-S227-1             | Completely retire custom maintenance        | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-5 — Exclude retired maintenance and completed-proof actions before active attention rows, counts, links and inline capabilities.     | ARCH-S227-2          | BEH-S227-2, BEH-S227-3 | Current work excludes retired proof prompts | Extend needs-decision inbox, gather, S147 attention and consumer projection fixtures with the observed legacy shapes and authoritative lifecycle variants.                                     |
| R-S227-6 — Preserve immutable records, real renewal/staff decisions, actor scope and partial-feed truth.                                    | ARCH-S227-3          | BEH-S227-2, BEH-S227-3 | Current work excludes retired proof prompts | Assert no store writes/provider calls; current renewal/generic staff fixtures survive; failed renewal feed remains partial and counts agree across consumers.                                  |

**Preservation set.**

Current authorization, source truth, supported renewal updates, exact receipts/recovery, pending
input semantics, guarded release and both closed Dotloop write keys remain independent requirements.
Preserve `tests/unit/needs-decision-inbox.test.ts`, `tests/unit/needs-decision-gather.test.ts`,
`tests/unit/s147-attention-queue.test.ts`, `tests/unit/dashboard-attention-queue.test.tsx`,
`tests/unit/decision-attention-backlog.test.ts` and the original retirement regressions. S232's
current renewal desk/Focus reasons/counts and ordinary staff-accountability records are separate
preservation obligations. Existing backend retirement refusals remain; hiding a card is not a
replacement for operation-level denial.

**Adversarial acceptance checks.**

- **AC-S227-1** — Exercise the actual owning HTTP/service/component boundary and preservation set.
- **AC-S227-2** — Exercise failed/stale/wrong-source, unsupported and ambiguous/recovery variants; unknown is never ready.
- **AC-S227-3** — Verify no customer/provider business effect, production test record or backlog is proof.
- **AC-S227-4** — Falsify `ARCH-S227-2` / `BEH-S227-2`: in isolated fixtures, reproduce the
  November 3 response shapes with two nonterminal S99-origin queue records whose direct links
  point into retired maintenance routes. The starting implementation emits both; repaired shared
  eligibility emits neither row, count nor inline-approval capability, while retaining an active
  renewal decision. Also test exact legacy workflow/action identifiers and renamed display labels;
  prose matching alone cannot be the classifier.
- **AC-S227-5** — Falsify `ARCH-S227-2` / `BEH-S227-3`: a linked authoritative completed-proof
  lifecycle suppresses a stale nonterminal execution prompt without altering its queue status.
  A normal task discussing a proof or maintenance policy remains available. Missing provenance is
  explicit uncertainty, not invented completion or renewed execution authority. No proof is rerun.
- **AC-S227-6** — Falsify `ARCH-S227-3` / `BEH-S227-2` / `BEH-S227-3`: Dashboard GET, unified
  decisions, decision backlog and assistant approval projections agree on eligible rows/counts.
  If renewal reviews fail, `partial` and `unavailableFeeds` remain truthful even when filtered rows
  leave zero current decisions. Assert unchanged fixture records/receipts and zero writer/provider
  calls across success, retry, failed-read and current actor/scope changes.
- **AC-S227-7** — Falsify `ARCH-S227-1` / `BEH-S227-1` through the generic workflow-run page,
  run/checklist GET routes and owning history readers: exact retired machine provenance yields
  only the retirement notice or HTTP 410 before timeline, steps, immutable-version or checklist
  bodies are read/rendered. Both pinned and unpinned retained records stay unchanged. Genuine
  generic staff and renewal runs remain readable; prose mentioning maintenance is not classified
  as retired. This preserves R-S227-1–3 without purging historical evidence or reviving a history UI.

**Forbidden actions / hard gates.**

No private provider/customer material or credentials in Git. No direct deployment bypass. Require
actual bash scripts/verify.sh, exact-main green CI, fresh auth/prerequisites/GO, real lock ownership,
one build, zero-traffic smoke, candidate assurance, receipt-bound promotion, at least 300,000 ms
observation with required checkpoints and independent managed/public readbacks.
The owner has launched implementation and delivery of this follow-up through those gates. Do not
transition a queue record, close/delete historical items, redispatch a completed proof, change
activation or create a production verification record as proof of the repair.

**Dependencies / sequencing.**

Implement and qualify independently of missing external inputs. Complete only actual owner/provider
steps; never solve the human authentication challenge, infer legal approval or open either write key.
For A-07, first trace the existing shared inbox and all active consumers, then materialize the
observed-shape regression and preservation fixtures. Retirement/proof eligibility is team-owned
engineering. Diagnosis of the separate unavailable renewal-review feed may proceed independently;
its success is not assumed or fabricated by this projection change.

**Standalone delivery contract.**

- **Deliverable now:** The original delivered retirement remains evidence-backed. A-07 now
  has implemented shared eligibility with passing focused checks; cumulative qualification and
  delivery remain pending for the bounded slice's shared eligibility,
  consumer consistency, refusal/preservation tests and documentation without deleting records or
  waiting for a client, provider effect or actual proof execution.
- **Consumes, but does not assume:** Real supported resources, current provider access and approved content/maps.
- **Externally blocked effect:** None for the A-07 projection slice. Separate template, legal-form,
  signature and human steps retain only their canonical named holds; they do not block this work.
- **Produces for downstream suites:** Source-bound checks and honest readiness without new authority.

**Verification and delivery contract.**

1. Preserve baseline failures and prior receipts; verify meaningful focused regressions.
2. Complete canonical/served checks and exact-head CI, inspect scope and publish only green changes.
3. Deliver through existing locked gates and update closure only after independent production proof.
4. For the A-07 delta, record expected-failing observed-shape and lifecycle fixtures before code
   changes; run the smallest isolated inbox/gather/attention/consumer checks and separate preservation
   gate. Run canonical checks only for later authorized implementation delivery. Keep original
   delivery, new authoring, implementation verification, deployment and human verdicts distinct.

**Ordered prompt sequence.**

1. Re-read current code/managed state and retain original delivery evidence.
2. For A-07, materialize observed-shape, authoritative lifecycle, shared-consumer and preservation
   checks before implementation; no live proof or queue transition is needed.
3. Implement and verify the bounded shared projection only after execution is requested; qualify
   and deliver through existing gates only when authorized.
4. Reconcile concise facts and private receipts to actual outcomes, preserving the original
   completed release and the follow-up's separate status.

**Deletion/merge recommendation.**

Update this existing suite in place; do not duplicate its outcome or rewrite earlier failed evidence.
