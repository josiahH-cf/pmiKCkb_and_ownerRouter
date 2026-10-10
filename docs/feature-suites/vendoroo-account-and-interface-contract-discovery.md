<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S207 — Verify the Vendoroo account and integration contract

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 079. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Establish a source-backed account/interface contract that either enables a precise Vendoroo integration specification or names the exact missing capability and owner/vendor input.

**Current state / intended end state.**

S133 delivered a bounded assessment, and the October 1 decision previously chose Vendoroo through shared RentVine records with no direct connector. The newer owner direction requests complete Vendoroo integration and supersedes that desired scope. No direct connector exists in current code. Official Vendoroo documentation now describes a company-scoped read-only Rooceptionist MCP, but this account's access and open-work-order coverage are unverified.

Complete a bounded necessary investigation of the actual subscribed modules and approved integration interface, with a field/identity/freshness/effect/retention contract and explicit findings for every required maintenance input. This is READY discovery scope; it is not a disguised finalized S208.

**October 10 execution continuation.** The owner's latest direction makes separate Vendoroo
access conditional on a demonstrated gap; investigate the existing Vendoroo–RentVine integration
first. The approved existing typed RentVine reader passed one bounded 15-order page, 15 status
definitions and one detail. All sampled orders were lease-linked and nine had vendor associations.
This proves current read access only, without historical backfill or a new provider effect. It does
not establish Vendoroo origin, call/transcript/troubleshooting completeness, event/freshness semantics
or staff takeover. Required coverage and ownership must be verified through the real RentVine
projection or, only where a demonstrated gap requires it, an actual supported Vendoroo interface.
No duplicate access request is authorized. S208 remains PENDING until that contract is complete;
direct connector credentials are not assumed to be a universal prerequisite.

**Actors and entry conditions.**

Authorized implementation runner reads official material and harmless approved account surfaces; PMI's account administrator and Vendoroo account manager supply account-specific facts. No browser password/code/passkey, account change or provider action is performed as discovery.

**What it is / how it functions.**

- **R-S207-1 — Identify actual account and modules.** Verify company/account, subscription and enabled Rooceptionist, ResiRoo or other modules from authorized source material. Treat Vendoroo/Roo terminology as one verified product family without assuming every advertised module is subscribed.
- **R-S207-2 — Establish supported interface and application use.** Verify MCP/API/export/webhook availability, credentials, permitted application embedding/server use, tool/schema/version, rate/size limits and account scope. Official company-secret MCP URL access is read-only; do not guess endpoints or infer production-use terms.
- **R-S207-3 — Prove required data coverage and joins.** Inventory call outcomes, transcripts/recording links, troubleshooting attempts, photos, sentiment, escalation/ownership, work-order/property/unit/lease identifiers and timestamps. Establish open-work-order versus close-only availability and stable event identity; distinguish imported provider claims from staff review.
- **R-S207-4 — Own takeover, effects and recovery.** Verify who owns intake, troubleshooting, escalation, resident communication, staff takeover and status; establish duplicate/out-of-order handling and any stateful reads. Preserve the documented ResiRoo stop-on-PM-takeover meaning where applicable.
- **R-S207-5 — Deliver actionable readiness and unblock output.** Produce a counts/enums-only public finding plus private contract evidence and a precise approved-account input list for Dan/provider. S208 becomes authorable only when interface/application permission/open-ticket/identity semantics are established or the owner explicitly selects a narrower supported outcome.

**In scope / out of scope.**

In scope: account/module/interface/data/effect/ownership investigation and an actionable evidence-backed unblock result. Out of scope: integration implementation, phone routing or subscription changes, credential sharing in Git/chat, contacting a guessed recipient, proof records or provider writes.

**Open questions & assumptions.**

The subscribed modules, enabled account interface, permitted application use, actual tool/schema contract, open-work-order coverage and stable identity/event linkage are not established. Those are this investigation's necessary output, not invented assumptions. An exact input may remain externally blocked after all accessible investigation is complete.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `lib/maintenance/external-agent-handoff-assessment.ts`; existing S133 evidence qualification and capability/ownership schema.
- `docs/open-blockers.md`, `docs/integration-architecture.md` and S208 — later verified account holds and integration contract reconciliation.
- Current RentVine reader/chat/link owners — assess actual shared-record coverage without assuming it includes Vendoroo's open-work-order evidence.

**Authority and evidence map.**

| Input                                                                            | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`                      | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                                                                                                                                                                                                      |
| Owner clarification on 2026-10-09                                                | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                                                                                                                                                                                                           |
| October 8 meeting intake and feedback aliases MF-20261008-A/B                    | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects.                                                                                                                                                                                    |
| WSL main `43bad3ad`; recorded serving `337ac163`                                 | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                                                                                                                                                                                                                |
| Vendoroo official Rooceptionist MCP, ResiRoo and communication-log documentation | External dependency                        | Primary references: https://vendoroo.freshdesk.com/support/solutions/articles/158000457207-connect-rooceptionist-to-your-ai-assistant-mcp- ; https://vendoroo.freshdesk.com/support/solutions/articles/158000402697-resiroo-resident-facing-ai ; https://vendoroo.freshdesk.com/support/solutions/articles/158000403412-escalations-communication-logs-and-live-support-chat . Public descriptions establish available product claims, not this account's entitlement or app integration terms. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S207-1** — Extend the evidence/ownership structures in `external-agent-handoff-assessment.ts`; bind each conclusion to source/date/account scope with secrets kept private. Freeze a focused falsification before changing this boundary.
- **ARCH-S207-2** — Document a concrete interface contract only from primary material/authorized harmless inspection; store credential references privately and redact secret URLs from artifacts. Freeze a focused falsification before changing this boundary.
- **ARCH-S207-3** — Produce a field/direction/freshness/identity matrix with real documented sample topology kept private; evaluate verified RentVine overlap without double-counting. Freeze a focused falsification before changing this boundary.
- **ARCH-S207-4** — Create an evidence-backed responsibility/recovery map, separating provider behavior from proposed PMI behavior and S100's known read marker. Freeze a focused falsification before changing this boundary.
- **ARCH-S207-5** — Validate discovery completeness using the existing assessment schema, with supported/unsupported/inconclusive states; do not create an invented connector to satisfy an evidence row. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S207-1** — The finding names the subscribed modules or the exact missing account evidence; marketing is not reported as enabled capability.
- **BEH-S207-2** — The implementer can tell which interface may be used by this application and which usage/transport is still unsupported.
- **BEH-S207-3** — The contract states which required inputs are obtainable while a job is open and how they join to real work; missing fields remain missing.
- **BEH-S207-4** — Staff and implementer can identify who acts at each handoff and what constitutes receipt versus uncertain delivery.
- **BEH-S207-5** — Each missing input has an owner and affected outcome; unrelated maintenance development continues; no fictional integration is called complete.

**Human litmus outcome.**

### Know exactly what the actual Vendoroo account can support

**If this was built correctly:** PMI reviews a clear account-backed coverage matrix showing which intake, call, troubleshooting and open-work data the subscribed Vendoroo service can supply, which interface the app is allowed to use, and precisely what account or provider input is still needed. Public marketing or a test adapter does not make the integration ready.

- Model verdict: PARTIAL INVESTIGATION — accessible repository, authorized reply and bounded live reads are complete; actual missing account/source/coverage contract inputs remain required. No invented interface, policy or completion.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                 | Architecture outcome | Behavior outcome | Human litmus                                              | Acceptance / deterministic falsification                                                                                                                                                 |
| ----------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S207-1: Identify actual account and modules               | ARCH-S207-1          | BEH-S207-1       | Know exactly what the actual Vendoroo account can support | AC-S207-1: Supply marketing-only, conflicting and actual account evidence; only the account-backed conclusion may establish subscription.                                                |
| R-S207-2: Establish supported interface and application use | ARCH-S207-2          | BEH-S207-2       | Know exactly what the actual Vendoroo account can support | AC-S207-2: A valid documentation page without account entitlement or application permission cannot make readiness true; an unavailable interface produces an exact unblock request.      |
| R-S207-3: Prove required data coverage and joins            | ARCH-S207-3          | BEH-S207-3       | Know exactly what the actual Vendoroo account can support | AC-S207-3: Check same-name residents, multiple leases, absent stable IDs and close-only communication logs; none silently establishes a reliable join or timely open-ticket integration. |
| R-S207-4: Own takeover, effects and recovery                | ARCH-S207-4          | BEH-S207-4       | Know exactly what the actual Vendoroo account can support | AC-S207-4: Run documentary/tabletop cases for delayed events, takeover, revoked access, partial fetch and missing read-effect terms; unknown semantics stay explicit.                    |
| R-S207-5: Deliver actionable readiness and unblock output   | ARCH-S207-5          | BEH-S207-5       | Know exactly what the actual Vendoroo account can support | AC-S207-5: Review the matrix against every required input; incomplete account/API evidence leaves S208 PENDING CLARIFICATION and preserves native status.                                |

**Preservation set.**

S133 evidence-schema/capability/ownership validation, `tests/unit/maintenance-ai-boundary.test.ts`, S99/S100 no-guessed-provider and consequential-read contracts, private-evidence/no-secret hygiene.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S207-1** — R-S207-1, ARCH-S207-1, BEH-S207-1: Supply marketing-only, conflicting and actual account evidence; only the account-backed conclusion may establish subscription.
- **AC-S207-2** — R-S207-2, ARCH-S207-2, BEH-S207-2: A valid documentation page without account entitlement or application permission cannot make readiness true; an unavailable interface produces an exact unblock request.
- **AC-S207-3** — R-S207-3, ARCH-S207-3, BEH-S207-3: Check same-name residents, multiple leases, absent stable IDs and close-only communication logs; none silently establishes a reliable join or timely open-ticket integration.
- **AC-S207-4** — R-S207-4, ARCH-S207-4, BEH-S207-4: Run documentary/tabletop cases for delayed events, takeover, revoked access, partial fetch and missing read-effect terms; unknown semantics stay explicit.
- **AC-S207-5** — R-S207-5, ARCH-S207-5, BEH-S207-5: Review the matrix against every required input; incomplete account/API evidence leaves S208 PENDING CLARIFICATION and preserves native status.

**Forbidden actions / hard gates.**

No API/secret URL guessing, new subscription/key/account, browser-driven provider write, synthetic production example, or claim that public MCP documentation proves open-work-order integration. Any separately authorized Dan message must use a verified recipient and actual missing-input list.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

First dependency for S208 final authoring. May proceed alongside S205/S206/S209–S215. S133 is reused as evidence structure, not revived as an independent old integration program.

**Standalone delivery contract.**

- **Deliverable now:** Complete bounded discovery matrix, source-qualified ownership/data/recovery findings and exact unblock request; validated even when a capability honestly reads Not established.
- **Consumes, but does not assume:** Official documents, actual approved company account materials and account-manager inputs; absence is preserved at the affected matrix cell.
- **Externally blocked effect:** Account-only inspection/schema and entitlement confirmation wait for actual approved account access/vendor response; no provider proof is authorized or needed by this suite.
- **Produces for downstream suites:** Exact provider/account/field/identity/effect contract or named evidence gaps that determine S208's next clarification.

**Verification and delivery contract.**

1. Re-read current owners and refresh the baseline before implementation. Materialize the named architecture, behavior and acceptance falsifications; record pre-existing unrelated failures separately.
2. Exercise every row with service/transaction and rendered journeys appropriate to the outcome, including denial, interruption, concurrency and partial completion. Use isolated local fixtures and deterministic external adapters; keep the preservation result separate.
3. Read back saved artifacts/state and reconcile them with the acted-on identity/version. A UI success label, supplied example or passing adapter cannot establish live provider success.
4. Run focused checks, then `bash scripts/verify.sh` and applicable compiled-browser checks for any later ship candidate. Audit secrets/PII, authority, runtime configuration and cross-suite traceability.
5. A later authorized implementation reports ALL_GATES_GREEN only for completed declared engineering checks; a named live/account proof remains separately BLOCKED when its input is missing. BUDGET_EXHAUSTED applies only to an explicit budget. Never label the whole operational outcome complete from a partial green slice.
6. Authoring registration/validation is documentary only. Commit, push, deployment, implementation-loop start and external communication require their own explicit instruction.

**Ordered prompt sequence.**

1. Re-verify current source, accepted decisions, dependency contracts and relevant read-only state.
2. Freeze the requirement/architecture/behavior/acceptance matrix and preservation baseline before implementation.
3. Implement the bounded owner and all unavailable/recovery paths; reuse existing services and keep adjacent suite ownership explicit.
4. Falsify every row, read back persisted results, run focused/canonical checks, update verified current documentation and deliver only when separately authorized.

**Deletion/merge recommendation.**

Merge verified findings into the finalized S208 contract and current integration/open-blocker facts when supported. Keep S208 pending for any remaining material gap; discovery completion never implies connector completion.

## Execution investigation readback — 2026-10-10 UTC

The available authorized managed-mail reply was checked without an outbound message. It supplies no account-scoped application interface, entitlement, stable maintenance joins or takeover/recovery contract. The outstanding access/integration request was not duplicated. Three official public documents distinguish read-only call-history MCP, resident-facing intake/work orders, and communication logs available at work-order closeout; none establishes this account’s open-work integration readiness. Public sources are listed in the native program evidence ledger.

The implemented pure evidence/topology assessor refuses marketing-only, duplicate/conflicting account, incomplete join, missing read-effect and recovery evidence. Its tabletop cases cover duplicate/out-of-order events, missing joins, takeover, revocation, partial retrieval and close-only logs. These are documentary/local checks, not an account capability probe or live provider success. Actual account evidence remains absent, so S208 stays PENDING and remains in the required program. Exact missing material is recorded in B-VENDOROO-CONTRACT.
