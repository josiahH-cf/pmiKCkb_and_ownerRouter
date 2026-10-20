<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->
<!-- owner-amendment: 2026-10-20 -->

# S227 — Completely retire custom maintenance

> Status: DELIVERED — October 20 amendment at 157b6992 / run57e4a1b5; actual resource and human acceptance holds remain scoped in docs/open-blockers.md.

**Goal.**

The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.

**Current state / intended end state.**

Production serves `157b6992279467e73dcf91aa43eb3c247f96ff2f` /
`pmi-kc-app-rmvgyw7tj-a7aa7a96b63a` at 100% canonical traffic. Run
`57e4a1b5-dd25-4302-9cfe-c9962c87d4ae` completed candidate assurance, receipt-bound promotion,
two observation checkpoints in 409,796 ms and all eleven independent readback sections.
The three-item queue is delivered and empty; its permit is consumed. Evidence:
`docs/evidence/application-delivery-2026-10-20.md`.

The owner explicitly amended the earlier October 16 history/unsent-only boundary. This suite owns
its corresponding revision; no older READY row or other program is newly executed.

**Actors and entry conditions.**

Managed staff retain current role/Space/mailbox permissions. Provider connections use the approved
integrations account; WSL CLI/ADC and guarded Admin assurance retain their existing identities.

**What it is / how it functions.**

The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.

**In scope / out of scope.**

Implement this outcome through existing owning boundaries and guarded release. No production purge,
customer/provider proof effect, generic send, maintenance revival, new leasing, protected activation,
identity privilege change, budget change, guessed resource or signature API is granted.

**Open questions & assumptions.**

Normal deployed-app Dotloop refresh at 2026-10-20T18:02:36.963Z verified
`integrations@pmikcmetro.com` and saved a fresh, untruncated observation. The supported individual
profile returned an empty template list; company templates remain access_denied. No supported
selection exists. The reported active template's owning visibility/root cause remains unknown;
no recreation is requested. The owner-reported failing Press & Hold remains a human boundary.
Both Dotloop write keys remain closed. The existing template's sharing/assignment and individual-
profile eligibility need inspection by an already signed-in Dotloop administrator or Dotloop support.

Eight browser-observed Drive PDF references are saved through the normal Admin API and individually
read back at resource version 8, all unverified. The deployed readiness page displays ten form
families across renewal extension, full lease and owner acknowledgment. Actual originals and
reviewed field/signer maps remain unapproved for all ten families. Source presence is not legal,
customer-link or signing approval. Existing drive.file authenticated the integrations account but
returned 404/notFound for a browser-visible source; no scope grant changed.

These limits hold dependent output; implementation and release continue independently.

**Cross-product impacts.**

HTTP/page admission, navigation, shared source projections, renewal communications, existing
connections, form intake/configuration and release assurance must agree. Preserve all eleven Spaces,
runtime identity, Production/Live, Demo=false, Sheet=true and existing secret/cost/security controls.

**Authority and evidence map.**

| Input                                                                        | Classification      | Use and limitation                                                                           |
| ---------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| October 20 owner request and explicit Send/Schedule/Resume reply             | Execution authority | Revises this exact scope through qualification, publication and existing guarded deployment. |
| Current committed code, deterministic tests and direct managed/browser reads | Evidence            | Distinguish fixtures, observations and production effects; detailed material stays private.  |
| Earlier releases and registry metadata                                       | Historical evidence | No backlog execution, renewed permission or present provider success follows.                |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S227-1** — The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S227-1** — The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.

**Human litmus outcome.**

### Completely retire custom maintenance

**If this was built correctly:** The maintenance component, history/reports, obsolete connection wiring, ticket search and vendor operational entry points disappear. Stored records and receipts are not purged; unrelated renewal, knowledge and permissions remain intact.

- Model verdict: PASS — deterministic implementation qualification; guarded delivery and external-resource verification remain separate.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                 | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S227-1 — Remove maintenance/history navigation and redirect legacy page bookmarks without loading records.                                | ARCH-S227-1          | BEH-S227-1       | Completely retire custom maintenance | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-2 — Refuse all retired API namespaces, including historical reads, before handler/provider construction; retain genuine logout only. | ARCH-S227-1          | BEH-S227-1       | Completely retire custom maintenance | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-3 — Remove shared maintenance/vendor search and composition consumers while preserving retained records and receipts.                | ARCH-S227-1          | BEH-S227-1       | Completely retire custom maintenance | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |
| R-S227-4 — Preserve renewal usability, shared provider connections, staff knowledge and standalone Vendoroo without an invented URL.        | ARCH-S227-1          | BEH-S227-1       | Completely retire custom maintenance | tests/unit/oct15-maintenance-retirement.test.ts; tests/unit/oct15-shared-maintenance-workflow.test.ts; tests/unit/oct15-production-effects.test.ts; tests/unit/s203-search-projections.test.ts |

**Preservation set.**

Current authorization, source truth, supported renewal updates, exact receipts/recovery, pending
input semantics, guarded release and both closed Dotloop write keys remain independent requirements.

**Adversarial acceptance checks.**

- **AC-S227-1** — Exercise the actual owning HTTP/service/component boundary and preservation set.
- **AC-S227-2** — Exercise failed/stale/wrong-source, unsupported and ambiguous/recovery variants; unknown is never ready.
- **AC-S227-3** — Verify no customer/provider business effect, production test record or backlog is proof.

**Forbidden actions / hard gates.**

No private provider/customer material or credentials in Git. No direct deployment bypass. Require
actual bash scripts/verify.sh, exact-main green CI, fresh auth/prerequisites/GO, real lock ownership,
one build, zero-traffic smoke, candidate assurance, receipt-bound promotion, at least 300,000 ms
observation with required checkpoints and independent managed/public readbacks.

**Dependencies / sequencing.**

Implement and qualify independently of missing external inputs. Complete only actual owner/provider
steps; never solve the human authentication challenge, infer legal approval or open either write key.

**Standalone delivery contract.**

- **Deliverable now:** The verified code/test/documentation revision and authorized guarded deployment.
- **Consumes, but does not assume:** Real supported resources, current provider access and approved content/maps.
- **Externally blocked effect:** The exact dependent template, legal form or signature step; independent work continues.
- **Produces for downstream suites:** Source-bound checks and honest readiness without new authority.

**Verification and delivery contract.**

1. Preserve baseline failures and prior receipts; verify meaningful focused regressions.
2. Complete canonical/served checks and exact-head CI, inspect scope and publish only green changes.
3. Deliver through existing locked gates and update closure only after independent production proof.

**Ordered prompt sequence.**

1. Read current code and managed state.
2. Implement this exact owner amendment and test refusals/recovery.
3. Qualify, publish, deploy and independently verify.
4. Reconcile concise facts and private receipts to actual outcomes.

**Deletion/merge recommendation.**

Update this existing suite in place; do not duplicate its outcome or rewrite earlier failed evidence.
