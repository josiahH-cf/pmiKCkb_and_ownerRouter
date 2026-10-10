<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S221 — Native emergency handoff and controlled answering cutover

> Intake: PENDING CLARIFICATION, 2026-10-09, intake 093. Not finalized and not ready for unattended implementation. Actual emergency/coverage/contact/consent/provider and cutover inputs remain required after S219.

**Execution dependency readback — 2026-10-10 UTC.** The authorized S219 investigation has
completed accessible evidence review and records precise missing material inputs in its native
specification and `docs/open-blockers.md`. This contract remains PENDING and required in the
overall program. No account-scoped provider interface or material operating policy was supplied
by that review; implementation admission is held for those exact inputs. No duplicate external
request was sent.

**Goal.**

Handoff emergencies according to the actual approved policy and transition only verified replaced answering functions, with working fallback, preserved history and one accountable responder.

**Current state / intended end state.**

Meeting shorthand references emergency categories and existing urgent-call/routine-email practice; it does not supply executable classification, contact availability, dispatch authority or native cutover rules. The owner accepted a native alternative with controlled coexistence and retirement of only verified replaced Vendoroo functions. No actual emergency contacts, policy, channel/phone provider, coverage or cutover values were supplied. The intended outcome remains pending these facts and decisions.

**Actors and entry conditions.**

Residents on approved native coverage; actual assigned maintenance/on-call staff and escalation contacts; the authorized operator who controls routing under verified provider contracts. Emergency/dispatch decisions require actual approved policy; an AI answer or feature registration cannot supply them.

**What it is / how it functions.**

1. **R-S221-1: Use actual approved emergency rules.** Detect and stop routine troubleshooting under the exact approved emergency/uncertainty policy, supported channels and language handling established by S219. Deliver only approved immediate guidance/disclosure. Do not convert 'flood, fire, blood' into invented complete rules, unsafe advice or blanket emergency-service dispatch authority.

2. **R-S221-2: Reach actual escalation with honest failure.** Use the real approved contacts/sequence, coverage, channels, retry/fallback and unavailable-contact rules. Preserve caller/issue context and attempted handoff history under approved consent/privacy. Distinguish notified, acknowledged, accepted and provider-verified outcomes; do not report help dispatched merely because a message was queued or a call attempted.

3. **R-S221-3: Control one responder and preserve history.** Define per-function routing ownership for Vendoroo versus native answering and incident association so only one actor handles a live interaction. Preserve Vendoroo and native histories with their real source attribution and one incident/work-order association. Switching routing cannot delete history, replay old incidents or create duplicate tasks/work orders.

4. **R-S221-4: Cut over only verified replaced functions.** Maintain complete Vendoroo integration alongside the native alternative. Before moving a function, verify its required coverage, consent, troubleshooting/emergency, operational handoff, provider readback, failure fallback and actual cost limits. Use an explicitly approved bounded cutover and rollback procedure from S219. Retire only the individually verified replaced function; retain unmatched Vendoroo capabilities and history. No automatic wholesale migration or retirement is implied.

**In scope / out of scope.**

Intended in scope: approved emergency stop/handoff, actual escalation/failure states, one-responder routing and bounded function-level native cutover/rollback. Out of scope: inventing emergency/medical/legal policy, emergency-service dispatch grants, automatic wholesale Vendoroo retirement, deleting history or historical maintenance backfill.

**Open questions & assumptions.**

Blocking inputs: actual S219 approved emergency/uncertainty/guidance policy; phone/channel/provider and coverage/languages; escalation contacts/sequence/availability; disclosure/consent/history rules; attempt/acknowledgment/failure semantics; one-owner incident/routing contract; actual cutover operator/scope/timing, verification criteria, cost and rollback procedure. All are material.

**Cross-product impacts.**

S219 contract investigation and S220 intake/troubleshooting; complete Vendoroo integration, native channel routing, maintenance incident/history and on-call workflow; current authority, privacy, cost and exact-effect controls.

**Authority and evidence map.**

| Input                                                                                   | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                                    | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| Meeting emergency/native-answering discussion and S219 investigation contract           | Project evidence                 | Supports intended emergency handling and controlled alternative; does not establish contacts, dispatch rights or operational cutover values.                                                                                           |
| Owner's 2026-10-09 clarification and accepted recommendations                           | Confirmed desired behavior       | Preserve full Vendoroo capability/history while moving only demonstrably replaced functions through controlled single-owner routing.                                                                                                   |
| Actual approved emergency/contact/provider/consent and function-level cutover contracts | Blocking finalization dependency | No unattended-ready emergency or cutover behavior can be claimed until these are supplied and verified.                                                                                                                                |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S221-1** — The future emergency boundary must consume approved versioned policy and stop/handoff conditions independently of model improvisation. Classification, safe guidance and uncertainty rules are blockers until actual policy is provided.
- **ARCH-S221-2** — The future handoff contract must bind verified destinations, actual contact coverage and documented provider attempt/acknowledgment/reconciliation semantics. Missing contacts or unavailable fallback prevent activation.
- **ARCH-S221-3** — The future routing/association boundary must have one authoritative current function owner and a compatible history/interaction identity contract. Exact routing provider/configuration is pending S219.
- **ARCH-S221-4** — The future cutover interlock must require the actual function-level acceptance set, current config/version and verified fallback/rollback; a staged capability or general feature test cannot substitute. Actual operator, schedule and cutover limits remain blockers.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S221-1** — A caller with an emergency or uncertain high-risk issue leaves routine troubleshooting promptly under the actual policy and receives its approved next step.
- **BEH-S221-2** — Staff and caller receive an honest handoff state; failure follows the actual approved fallback without silently abandoning the incident or inventing acceptance.
- **BEH-S221-3** — Staff see one accountable responder and a continuous attributed history across transition; old work is not restarted or duplicated.
- **BEH-S221-4** — The operator knows exactly what is moving, can verify one working route and fallback, and can restore the approved prior route if the new function fails without losing incident history.

**Human litmus outcome.**

### Handle the emergency and switch one proven function safely

**If this was built correctly:** An emergency caller reaches the real approved escalation path with an honest handoff status. When one native answering function has proved its actual coverage and fallback, an operator moves just that function while other Vendoroo capabilities and all history remain available. The actual policy, contacts and switch contract still need to be established.

- Model verdict: BLOCKED — accessible investigation is recorded in the native program ledger; required material inputs remain absent. This contract is still PENDING and no implementation or delivery is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                           | Architecture outcome | Behavior outcome | Human litmus                                               | Deterministic evidence / falsification                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S221-1: Use actual approved emergency rules         | ARCH-S221-1          | BEH-S221-1       | Handle the emergency and switch one proven function safely | AC-S221-1: PENDING: use actual approved emergency, borderline, denied-advice and language cases; assert correct stop/handoff and no improvised policy or dispatch.                                                                                                                               |
| R-S221-2: Reach actual escalation with honest failure | ARCH-S221-2          | BEH-S221-2       | Handle the emergency and switch one proven function safely | AC-S221-2: PENDING: instantiate real private contacts/coverage and provider contracts, then test unavailable primary/backup, disconnected caller, duplicate delivery, lost response and acknowledgment failure. No live emergency is used as proof.                                              |
| R-S221-3: Control one responder and preserve history  | ARCH-S221-3          | BEH-S221-3       | Handle the emergency and switch one proven function safely | AC-S221-3: PENDING: use verified routing/event/incident identity contracts to test overlapping delivery, switch in-flight, repeated events, reopened old incident and current history readback.                                                                                                  |
| R-S221-4: Cut over only verified replaced functions   | ARCH-S221-4          | BEH-S221-4       | Handle the emergency and switch one proven function safely | AC-S221-4: PENDING: finalize actual acceptance/rollback and cost contracts; exercise partial native coverage, failed fallback, stale routing preview, missing policy/contact, wrong function retirement and rollback readback. No live routing mutation is performed by specification authoring. |

**Preservation set.**

Complete Vendoroo integration, actual source-attributed maintenance history, existing emergency staff responsibility, one responder/incident, private data, approved cost controls and exact effect boundaries. No historical maintenance backfill.

**Adversarial acceptance checks.**

- **AC-S221-1** — PENDING: use actual approved emergency, borderline, denied-advice and language cases; assert correct stop/handoff and no improvised policy or dispatch. This falsifies ARCH-S221-1 / BEH-S221-1 and the named human litmus.
- **AC-S221-2** — PENDING: instantiate real private contacts/coverage and provider contracts, then test unavailable primary/backup, disconnected caller, duplicate delivery, lost response and acknowledgment failure. No live emergency is used as proof. This falsifies ARCH-S221-2 / BEH-S221-2 and the named human litmus.
- **AC-S221-3** — PENDING: use verified routing/event/incident identity contracts to test overlapping delivery, switch in-flight, repeated events, reopened old incident and current history readback. This falsifies ARCH-S221-3 / BEH-S221-3 and the named human litmus.
- **AC-S221-4** — PENDING: finalize actual acceptance/rollback and cost contracts; exercise partial native coverage, failed fallback, stale routing preview, missing policy/contact, wrong function retirement and rollback readback. No live routing mutation is performed by specification authoring. This falsifies ARCH-S221-4 / BEH-S221-4 and the named human litmus.

**Forbidden actions / hard gates.**

No guessed emergency classification/contact, improvised safety advice, real emergency proof, phone/call/message/dispatch/routing effect, automatic cutover or general Vendoroo retirement. No implementation-ready claim while the material values above remain missing.

**Dependencies / sequencing.**

S222 is the shared owner of approved emergency classification, guidance and versioned policy
configuration. This suite consumes that policy and actual contacts/provider constraints discovered
by S219; it owns handoff delivery, acknowledgement/fallback and controlled cutover rather than a
separate emergency decision table. Missing approved content remains a blocker for the affected
native advice/escalation behavior.

S219 provides actual emergency/provider/coverage/transition contracts; finalized S220 supplies the routine-to-emergency boundary. Vendoroo integrations remain separately complete; a native plan never retroactively retires their responsibilities.

**Standalone delivery contract.**

- **Deliverable now:** A pending intent/blocker specification only, with no executable emergency or cutover contract claimed.
- **Consumes, but does not assume:** Actual approved policy, real private contacts and verified provider/routing/fallback contracts when resolved.
- **Externally blocked effect:** Emergency-handling/cutover implementation admission and every live handoff/routing/retirement effect until the material policy/provider inputs are finalized.
- **Produces for downstream suites:** After finalization/implementation, verified handoff states and function-level controlled transition evidence with preserved history. Current authoring grants no effect.

**Verification and delivery contract.**

1. This specification is PENDING CLARIFICATION, not finalized and not ready for unattended implementation. First obtain the prerequisite investigation's actual source/provider contracts and the missing owner business/policy decisions listed above.
2. Revise this file in the native authoring mechanism with concrete in-scope objects, inputs, boundaries and acceptance fixtures; preserve valid settled intent. Do not invent the missing values or hide them as nonblocking assumptions.
3. Once legitimately READY and separately execution-authorized, record real starting-state readback, fail-first architecture/behavior cases and preservation results; test every acceptance row through actual boundaries, run focused checks and `bash scripts/verify.sh`, audit the diff and deliver through existing gates.
4. At present, the downstream suite's terminal state is `BLOCKED` on the named contract inputs; do not report `ALL_GATES_GREEN` or operational readiness from this placeholder. `BUDGET_EXHAUSTED` applies only to an explicit budget. Investigation completion and document authoring are not implementation proof.

**Ordered prompt sequence.**

1. Keep this suite out of any unattended implementation queue while its named inputs remain unresolved.
2. Consume the prerequisite investigation's verified contracts and obtain the remaining explicit business/policy decisions.
3. Finalize the actual boundaries, mappings, failures and observable checks in this native file; run authoring validators and mark READY only when no material gap remains.
4. Under later separate implementation authority, record fail-first checks and preservation, build the bounded slice, falsify its edge cases and deliver through existing gates.

**Deletion/merge recommendation.**

Retire or merge only after code, tests and current facts own every requirement and preservation check, with actual delivery evidence. Do not retire because a related suite is deployed or the spec is registered.
