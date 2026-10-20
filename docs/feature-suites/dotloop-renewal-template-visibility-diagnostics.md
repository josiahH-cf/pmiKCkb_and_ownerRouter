<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: oct15-application-2026-10-16 -->
<!-- owner-amendment: 2026-10-20 -->

# S228 — Verify approved template visibility and process readiness

> Status: DELIVERED — October 20 amendment at 157b6992 / run57e4a1b5; actual resource and human acceptance holds remain scoped in docs/open-blockers.md.

**Goal.**

The app verifies the approved integrations account, distinguishes failed/empty/stale/truncated reads, accepts only supported current selections, and maps recorded source/form families to their actual packet processes. No source location or provider visibility grants legal approval or write authority.

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

The app verifies the approved integrations account, distinguishes failed/empty/stale/truncated reads, accepts only supported current selections, and maps recorded source/form families to their actual packet processes. No source location or provider visibility grants legal approval or write authority.

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

- **ARCH-S228-1** — The app verifies the approved integrations account, distinguishes failed/empty/stale/truncated reads, accepts only supported current selections, and maps recorded source/form families to their actual packet processes. No source location or provider visibility grants legal approval or write authority.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S228-1** — The app verifies the approved integrations account, distinguishes failed/empty/stale/truncated reads, accepts only supported current selections, and maps recorded source/form families to their actual packet processes. No source location or provider visibility grants legal approval or write authority.

**Human litmus outcome.**

### Verify approved template visibility and process readiness

**If this was built correctly:** The app verifies the approved integrations account, distinguishes failed/empty/stale/truncated reads, accepts only supported current selections, and maps recorded source/form families to their actual packet processes. No source location or provider visibility grants legal approval or write authority.

- Model verdict: PASS — deterministic implementation qualification; guarded delivery and external-resource verification remain separate.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                          | Architecture outcome | Behavior outcome | Human litmus                                              | Deterministic evidence / falsification                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S228-1 — Read the documented account/profile/template contracts through the existing approved connection and identify actual failed versus empty reads.                            | ARCH-S228-1          | BEH-S228-1       | Verify approved template visibility and process readiness | tests/unit/oct15-dotloop-discovery.test.ts; tests/unit/s106-dotloop-connection.test.ts; tests/unit/oct20-template-process-readiness.test.ts; tests/unit/s120-resource-configuration.test.tsx |
| R-S228-2 — Reject stale, future, failed or wrong-generation observations and unsupported profile/template/status selections.                                                         | ARCH-S228-1          | BEH-S228-1       | Verify approved template visibility and process readiness | tests/unit/oct15-dotloop-discovery.test.ts; tests/unit/s106-dotloop-connection.test.ts; tests/unit/oct20-template-process-readiness.test.ts; tests/unit/s120-resource-configuration.test.tsx |
| R-S228-3 — Keep both Dotloop write keys closed, preserve S182 exclusions and retain a human signature handoff.                                                                       | ARCH-S228-1          | BEH-S228-1       | Verify approved template visibility and process readiness | tests/unit/oct15-dotloop-discovery.test.ts; tests/unit/s106-dotloop-connection.test.ts; tests/unit/oct20-template-process-readiness.test.ts; tests/unit/s120-resource-configuration.test.tsx |
| R-S228-4 — Map all ten existing form families to renewal-extension, full-lease or owner-acknowledgment contracts; show source, applicability, mapping and approval holds separately. | ARCH-S228-1          | BEH-S228-1       | Verify approved template visibility and process readiness | tests/unit/oct15-dotloop-discovery.test.ts; tests/unit/s106-dotloop-connection.test.ts; tests/unit/oct20-template-process-readiness.test.ts; tests/unit/s120-resource-configuration.test.tsx |
| R-S228-5 — Verify integrations@pmikcmetro.com before resource discovery or selection; release CLI/Admin identities remain separate.                                                  | ARCH-S228-1          | BEH-S228-1       | Verify approved template visibility and process readiness | tests/unit/oct15-dotloop-discovery.test.ts; tests/unit/s106-dotloop-connection.test.ts; tests/unit/oct20-template-process-readiness.test.ts; tests/unit/s120-resource-configuration.test.tsx |
| R-S228-6 — Expose the existing source-location controls for the additional disclosures, brokerage and insurance families without approving them or inventing customer values.        | ARCH-S228-1          | BEH-S228-1       | Verify approved template visibility and process readiness | tests/unit/oct15-dotloop-discovery.test.ts; tests/unit/s106-dotloop-connection.test.ts; tests/unit/oct20-template-process-readiness.test.ts; tests/unit/s120-resource-configuration.test.tsx |

**Preservation set.**

Current authorization, source truth, supported renewal updates, exact receipts/recovery, pending
input semantics, guarded release and both closed Dotloop write keys remain independent requirements.

**Adversarial acceptance checks.**

- **AC-S228-1** — Exercise the actual owning HTTP/service/component boundary and preservation set.
- **AC-S228-2** — Exercise failed/stale/wrong-source, unsupported and ambiguous/recovery variants; unknown is never ready.
- **AC-S228-3** — Verify no customer/provider business effect, production test record or backlog is proof.

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
