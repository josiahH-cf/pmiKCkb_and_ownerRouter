<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S208 — Vendoroo maintenance ingestion and synchronization contract

> Status: PENDING CLARIFICATION — intentionally not finalized or READY; S207 must establish the material provider contract below.
> Intake: 080. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Execution dependency readback — 2026-10-10 UTC.** The authorized S207 investigation has
completed accessible evidence review and records precise missing material inputs in its native
specification and `docs/open-blockers.md`. This contract remains PENDING and required in the
overall program. No account-scoped provider interface or material operating policy was supplied
by that review; implementation admission is held for those exact inputs. No duplicate external
request was sent.

**Goal.**

Bring verified Vendoroo intake, troubleshooting, escalation and available sentiment/context into PMI KC's maintenance workflow, tied to real work and without duplicate tickets or competing communication ownership.

**Current state / intended end state.**

No direct Vendoroo connector exists. RentVine reads and manual S100 work-order chat sync are implemented; their coverage is not proof of complete Vendoroo data. Public Rooceptionist MCP describes read-only call data; closeout communication logs do not establish open-job troubleshooting availability.

Known owner intent is a complete integrated maintenance experience, using Vendoroo for the subscribed front-line intake/troubleshooting layer and PMI for downstream work. The account/interface/application-use/open-work-order contract is still unknown; this file intentionally preserves that blocker rather than proposing unsupported schemas or completion claims.

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

PMI staff consume verified maintenance evidence; approved service identities may perform only the later documented allowed integration operations. Vendor access remains assigned-ticket-only and does not include raw sentiment/internal conversations.

**What it is / how it functions.**

- **R-S208-1 — Required intake coverage.** Require a finalized field/coverage contract for the actual subscribed modules: call/report source, issue, attempted troubleshooting/outcome, available photos/sentiment/escalation, provenance and real work identities. Distinguish unavailable data from zero/normal/resolved.
- **R-S208-2 — Canonical association and deduplication.** The final design must bind provider account/source identity and verified property/unit/work-order/lease relations; uncertain matches enter review and repeat ingestion cannot create duplicate work or history.
- **R-S208-3 — Freshness and synchronization.** The owner requires low-toil ongoing availability, with source freshness, bounded recovery and monitoring. Choose only an actually supported webhook/API/MCP/export transport and permitted cadence; no arbitrary polling interval is finalized here.
- **R-S208-4 — Staff takeover and sharing.** Preserve Vendoroo/PMI ownership at takeover and prevent duplicate resident communication. Vendors receive staff-reviewed useful troubleshooting context; raw sentiment and internal conversations stay staff-only.
- **R-S208-5 — Honest completion and retention.** Successful integration requires usable open-work data, reliable joins/recovery and retained core evidence; it cannot be satisfied by a connection badge or closed-ticket-only import. Indefinite core facts/artifacts and shorter raw communications remain separate.

**In scope / out of scope.**

Known scope: complete Vendoroo front-line evidence integration, canonical joins, ongoing synchronization, takeover, scoped sharing and history. Unfinalized scope: exact transport/schema/cadence/application permission and supported module coverage. Out of scope: guessed APIs, Vendoroo subscription changes, phone-service replacement owned elsewhere, accounting effects and new message authority.

**Open questions & assumptions.**

BLOCKING: actual Vendoroo company account/subscribed modules; approved enabled interface; application embedding/server-use permission; documented tools/schema/version; open-work-order evidence coverage; stable record/event identifiers; freshness/rate/paging/recovery semantics; takeover/effect contract. S207 establishes these. If unavailable, the owner must choose an explicitly narrower supported outcome before S208 can be finalized. None is silently assumed from acceptance of recommendations.

The unknowns above are material. Known owner intent is retained here for traceability, but conditional design/verification text below is a drafting contract, not a claim that an implementer has a complete interface or permission contract.

**Cross-product impacts.**

- Existing `lib/maintenance/external-agent-handoff-assessment.ts` — evidence/readiness qualification, not an implemented connector.
- `lib/firestore/maintenance-tickets.ts`, `maintenance-work-order-links.ts`; S206/S209 — canonical work identity and durable history.
- `lib/maintenance/execution/chat-sync-service.ts` and `app/api/maintenance/work-order-chat/route.ts` — existing consequential read boundary.
- S205/S210–S215 and the communications program — workflow, reviewed handoff, vendor sharing and reporting owners; the actual provider adapter is not yet established.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S208-1** — S207 must establish an actual supported input boundary before a connector owner/schema is selected; reuse the existing maintenance ticket and link owners. Freeze a focused falsification before changing this boundary.
- **ARCH-S208-2** — Consume S209 canonical association and S206 creation identities; exact event identity/reordering rules await S207 rather than being guessed. Freeze a focused falsification before changing this boundary.
- **ARCH-S208-3** — S207 must qualify rate/event/retry/effect semantics. S100 consequential chat reads retain explicit warning/confirmation and cannot become silent background imports. Freeze a focused falsification before changing this boundary.
- **ARCH-S208-4** — Integrate only verified provider takeover behavior with S205/S210/S212; communications execution belongs to its separate approved program. Freeze a focused falsification before changing this boundary.
- **ARCH-S208-5** — S209/S214 own durable facts/reporting, while raw payload retention follows the explicitly approved communications policy; later tests must distinguish engineering adapters from live account readback. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S208-1** — The future UI shows exactly what was imported, from where and when, and which expected evidence could not be obtained.
- **BEH-S208-2** — Staff see one real case with attributable Vendoroo evidence; ambiguous identities do not create or update an arbitrary lease.
- **BEH-S208-3** — The future workspace differentiates current, delayed, partial and unavailable source context; an outage does not erase evidence or claim resolution.
- **BEH-S208-4** — Staff can identify who currently handles the issue, and an assigned vendor sees the reviewed work summary without internal analysis.
- **BEH-S208-5** — Users can trace evidence in the ticket/history and reports without assuming raw source recordings remain indefinitely accessible.

**Human litmus outcome.**

### Bring verified Vendoroo work into the PMI maintenance journey

**If this was built correctly:** Once the actual account and interface contract is finalized, PMI can see the supported Vendoroo report and troubleshooting history attached to the correct work, with source freshness and unresolved associations clearly marked. Until those material inputs are resolved, the spec and integration remain visibly pending rather than appearing complete.

- Model verdict: BLOCKED — accessible investigation is recorded in the native program ledger; required material inputs remain absent. This contract is still PENDING and no implementation or delivery is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                       | Architecture outcome | Behavior outcome | Human litmus                                                  | Acceptance / deterministic falsification                                                                                                                                        |
| ------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S208-1: Required intake coverage                | ARCH-S208-1          | BEH-S208-1       | Bring verified Vendoroo work into the PMI maintenance journey | AC-S208-1: Authoring review fails readiness when module/field/open-work-order evidence is absent; a mock payload cannot establish actual coverage.                              |
| R-S208-2: Canonical association and deduplication | ARCH-S208-2          | BEH-S208-2       | Bring verified Vendoroo work into the PMI maintenance journey | AC-S208-2: Conditional acceptance must include duplicate delivery, reordered updates and same-name/multi-unit ambiguity after the provider identity contract is known.          |
| R-S208-3: Freshness and synchronization           | ARCH-S208-3          | BEH-S208-3       | Bring verified Vendoroo work into the PMI maintenance journey | AC-S208-3: Final contract must test provider outage, partial pages, access revocation and resume against verified limits; unresolved transport semantics keep this row pending. |
| R-S208-4: Staff takeover and sharing              | ARCH-S208-4          | BEH-S208-4       | Bring verified Vendoroo work into the PMI maintenance journey | AC-S208-4: Final acceptance must prove takeover and sharing with the actual subscribed module; inferred stop behavior or blanket raw-log sharing is insufficient.               |
| R-S208-5: Honest completion and retention         | ARCH-S208-5          | BEH-S208-5       | Bring verified Vendoroo work into the PMI maintenance journey | AC-S208-5: A release with only a reachable endpoint or fake adapter remains operationally incomplete; required unavailable provider fields stay explicitly blocked.             |

**Preservation set.**

S99/S100 identity/claim/receipt/read-marker checks, `tests/unit/maintenance-ai-boundary.test.ts`, existing vendor assigned-ticket scope and communications retention; no independent competing status or provider reader.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S208-1** — R-S208-1, ARCH-S208-1, BEH-S208-1: Authoring review fails readiness when module/field/open-work-order evidence is absent; a mock payload cannot establish actual coverage.
- **AC-S208-2** — R-S208-2, ARCH-S208-2, BEH-S208-2: Conditional acceptance must include duplicate delivery, reordered updates and same-name/multi-unit ambiguity after the provider identity contract is known.
- **AC-S208-3** — R-S208-3, ARCH-S208-3, BEH-S208-3: Final contract must test provider outage, partial pages, access revocation and resume against verified limits; unresolved transport semantics keep this row pending.
- **AC-S208-4** — R-S208-4, ARCH-S208-4, BEH-S208-4: Final acceptance must prove takeover and sharing with the actual subscribed module; inferred stop behavior or blanket raw-log sharing is insufficient.
- **AC-S208-5** — R-S208-5, ARCH-S208-5, BEH-S208-5: A release with only a reachable endpoint or fake adapter remains operationally incomplete; required unavailable provider fields stay explicitly blocked.

**Forbidden actions / hard gates.**

Do not label S208 READY/final, implement an assumed provider adapter, activate a key or call a connector 'complete' from public marketing/MCP availability. No silent S100 read-marking sync or raw sentiment exposure to vendors.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

S207 is a material specification dependency, not merely a runtime credential hold. S209 is the intended canonical history owner. Other maintenance app slices proceed while this document remains pending.

**Standalone delivery contract.**

- **Deliverable now:** A precise pending specification with confirmed intent, material input list and traceable downstream conditions; no implementation admission or fabricated final integration contract.
- **Consumes, but does not assume:** S207 actual account/interface/coverage findings and confirmed owner outcome; no guessed endpoint/schema replaces them.
- **Externally blocked effect:** Final S208 authoring and any integration execution remain blocked on the material provider contract; independently authored app/history/vendor/reporting work continues.
- **Produces for downstream suites:** Known coverage/association/freshness/takeover/retention obligations for a later finalized S208, with pending status preserved.

**Verification and delivery contract.**

This pending contract cannot enter implementation. After factual resolution and legitimate READY
registration, the future authorized run must report `ALL_GATES_GREEN`, `BLOCKED` for an exact
unavailable input after independent work, or `BUDGET_EXHAUSTED` only under an explicit budget.
No terminal implementation verdict is claimed by this draft.

1. Re-read current owners and refresh the baseline before implementation. Materialize the named architecture, behavior and acceptance falsifications; record pre-existing unrelated failures separately.
2. Exercise every row with service/transaction and rendered journeys appropriate to the outcome, including denial, interruption, concurrency and partial completion. Use isolated local fixtures and deterministic external adapters; keep the preservation result separate.
3. Read back saved artifacts/state and reconcile them with the acted-on identity/version. A UI success label, supplied example or passing adapter cannot establish live provider success.
4. Run focused checks, then `bash scripts/verify.sh` and applicable compiled-browser checks for any later ship candidate. Audit secrets/PII, authority, runtime configuration and cross-suite traceability.
5. Do not admit S208 for implementation or report ALL_GATES_GREEN while the material provider contract remains unresolved. S207 results must update this document and its native registration through a later specification-authoring pass.
6. Authoring registration/validation is documentary only. Commit, push, deployment, implementation-loop start and external communication require their own explicit instruction.

**Ordered prompt sequence.**

1. Re-verify current source, accepted decisions, dependency contracts and relevant read-only state.
2. Freeze the requirement/architecture/behavior/acceptance matrix and preservation baseline before implementation.
3. Resolve S207's provider/account/interface findings, bring them back through clarification, and finalize the exact supported S208 contract before implementation.
4. Falsify every row, read back persisted results, run focused/canonical checks, update verified current documentation and deliver only when separately authorized.

**Deletion/merge recommendation.**

Retain this suite until its full behavior, remaining dependencies and acceptance evidence are represented in current code/tests/facts. Then merge its operating contract into current maintenance documentation; preserve historical evidence without keeping duplicate active instructions.
