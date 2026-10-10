<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S220 — Native call intake and approved troubleshooting

> Intake: PENDING CLARIFICATION, 2026-10-09, intake 092. Not finalized and not ready for unattended implementation. Actual channel/phone/provider, coverage, policy, consent and source-of-truth contracts must be established by S219.

**Execution dependency readback — 2026-10-10 UTC.** The authorized S219 investigation has
completed accessible evidence review and records precise missing material inputs in its native
specification and `docs/open-blockers.md`. This contract remains PENDING and required in the
overall program. No actual source schema, provider/phone interface, business financial or consent
policy was supplied by that review; implementation admission is held for those exact inputs.

**Goal.**

Handle the confirmed native answering coverage with accurate tenant/issue intake, approved bounded troubleshooting and a traceable handoff into the existing maintenance workflow.

**Current state / intended end state.**

Vendoroo currently supplies answering/troubleshooting according to meeting evidence, while exact account/API behavior needs verification in its owning integration suites. A native alternative is now in scope, but no actual phone provider, channels, language/schedule, troubleshooting policy or recording/consent inputs are established. Desired direction: reliable intake/troubleshooting that coexists through controlled routing and never duplicates the same incident actor or work order. The concrete contract is pending.

**Actors and entry conditions.**

Tenants/residents on actually approved channels and coverage; existing maintenance staff receiving handoffs; actual provider/system identities once verified. Verification/test identities cannot become production resident interactions. Channel disclosure/consent and tenant/property identity rules must be explicit before entry can be finalized.

**What it is / how it functions.**

1. **R-S220-1: Enter only confirmed native coverage.** Accept interactions only from the actual channels/numbers, schedule/languages and routing selected through S219. Enforce the approved disclosure, recording/transcript/consent and authentication/identity rules. Missing or unsupported coverage follows its actual fallback contract; no universal 24/7/all-language or recording policy is presumed.

2. **R-S220-2: Capture accurate issue and tenant context.** Record the caller's stated issue, verified property/resident association when available, time and permitted contact details with provenance and uncertainty. Distinguish statements from verified source facts. Handle unknown/multiple possible matches through approved clarification/handoff, not guessed identity. Required fields and privacy/retention semantics depend on actual S219 inputs.

3. **R-S220-3: Apply only approved bounded troubleshooting.** Use the actual approved category-specific steps, stop conditions, prohibited advice and escalation policy established by S219. Preserve the interaction history and distinguish caller-reported resolution from verified repair/provider completion. Emergency indicators transfer to S221's approved handoff rather than continuing routine troubleshooting.

4. **R-S220-4: Handoff once into existing maintenance work.** Associate the native interaction and troubleshooting history with the correct existing maintenance incident/work order or its explicitly supported creation contract. Respect Vendoroo ownership and route identity; no second responder or duplicate work order is created. Staff receive truthful intake/resolution/handoff status, and provider outcomes use real receipt/readback rather than transcript claims.

**In scope / out of scope.**

Intended in scope: actual native coverage intake, approved troubleshooting and existing-maintenance handoff. Exact channels, policy, fields and provider operations remain unresolved. Out of scope: universal answering coverage, invented safety advice, independent emergency policy, wholesale Vendoroo replacement or historical maintenance backfill.

**Open questions & assumptions.**

Blocking inputs: S219 selected real phone/channel/provider and authentic event contract; schedules/languages; tenant/property association requirements; approved intake fields, disclosure/recording/consent/retention; troubleshooting and stop/escalation policy; emergency interface; incident identity/deduplication; actual create/update/readback authority and fallback contracts.

**Cross-product impacts.**

Actual phone/channel integration once identified; existing maintenance intake/history/work-order projections; Vendoroo coexistence and S221 emergency route; current privacy/source/action boundaries. No invented endpoint, schema or phone resource is asserted.

**Authority and evidence map.**

| Input                                                                 | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                  | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| Meeting native-answering discussion and S219 bounded investigation    | Project evidence                 | Establishes desired direction; does not supply executable coverage, consent or troubleshooting policy.                                                                                                                                 |
| Owner's 2026-10-09 clarification and accepted recommendations         | Confirmed desired behavior       | Include native answering/troubleshooting as a controlled alternative, preserving full Vendoroo integration and avoiding duplicate actors.                                                                                              |
| Actual S219 provider, coverage, policy, consent and handoff contracts | Blocking finalization dependency | Missing inputs prevent a finalized call-intake specification; research proceeds in S219 without starting live answering.                                                                                                               |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S220-1** — The future intake boundary must verify actual channel event authenticity, coverage and consent policy before storing or acting. Exact event/schema/provider and policy inputs are prerequisites, not implementation defaults.
- **ARCH-S220-2** — The future incident representation must retain source/verification state and bind to a stable interaction identity under approved storage/retention. It cannot invent a resident or target based on partial speech.
- **ARCH-S220-3** — The future troubleshooting policy boundary must use versioned approved content and deterministic escalation/stop rules outside model discretion. Without actual content and emergency limits no complete acceptance contract exists.
- **ARCH-S220-4** — The future handoff must bind interaction/incident identity, actual actor and exact supported source-of-truth operation semantics. Idempotency, retry and duplicate-source behavior must be established from real provider contracts.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S220-1** — A caller knows the approved answering/disclosure context and receives the appropriate supported experience or honest fallback.
- **BEH-S220-2** — Staff receive the actual reported issue and known association, can see what remains uncertain and do not inherit fabricated details.
- **BEH-S220-3** — The caller receives permitted useful troubleshooting, can reach staff under the approved rule, and is never told a reported resolution proves a verified repair.
- **BEH-S220-4** — Maintenance staff find one coherent history and one accountable incident, with unresolved work visible; an outage or lost response does not cause duplicate creation.

**Human litmus outcome.**

### One useful call history and one maintenance handoff

**If this was built correctly:** On an approved native channel, a tenant receives the actual approved intake/troubleshooting experience. Staff see the accurate issue and steps in one maintenance history, with a clear unresolved handoff and no duplicate Vendoroo responder. The factual coverage and policy still need to be established before this behavior can be finalized.

- Model verdict: BLOCKED — accessible investigation is recorded in the native program ledger; required material inputs remain absent. This contract is still PENDING and no implementation or delivery is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                           | Architecture outcome | Behavior outcome | Human litmus                                        | Deterministic evidence / falsification                                                                                                                                                                                               |
| ----------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S220-1: Enter only confirmed native coverage        | ARCH-S220-1          | BEH-S220-1       | One useful call history and one maintenance handoff | AC-S220-1: PENDING: define actual provider events and coverage/consent fixtures, then test invalid origin, unsupported language/time, consent decline and unavailable channel without live customer effects.                         |
| R-S220-2: Capture accurate issue and tenant context   | ARCH-S220-2          | BEH-S220-2       | One useful call history and one maintenance handoff | AC-S220-2: PENDING: use actual channel/transcript/identity contract to exercise unclear speech, disconnected call, conflicting matches, repeated interaction and partial-source outage.                                              |
| R-S220-3: Apply only approved bounded troubleshooting | ARCH-S220-3          | BEH-S220-3       | One useful call history and one maintenance handoff | AC-S220-3: PENDING: instantiate approved routine/emergency/refusal scenarios and policy versions; test stop requests, failed steps, disconnected interaction, unsupported issue and prohibited advice.                               |
| R-S220-4: Handoff once into existing maintenance work | ARCH-S220-4          | BEH-S220-4       | One useful call history and one maintenance handoff | AC-S220-4: PENDING: instantiate the actual handoff and operation contracts, then test Vendoroo/native duplicate events, repeated delivery, lost response, ambiguous provider effect and source outage; retain one accountable actor. |

**Preservation set.**

Complete Vendoroo integration and retained history; existing maintenance waiting-on/status/receipt meaning; one accountable actor/incident; no historical backfill, private evidence and current identity/action controls.

**Adversarial acceptance checks.**

- **AC-S220-1** — PENDING: define actual provider events and coverage/consent fixtures, then test invalid origin, unsupported language/time, consent decline and unavailable channel without live customer effects. This falsifies ARCH-S220-1 / BEH-S220-1 and the named human litmus.
- **AC-S220-2** — PENDING: use actual channel/transcript/identity contract to exercise unclear speech, disconnected call, conflicting matches, repeated interaction and partial-source outage. This falsifies ARCH-S220-2 / BEH-S220-2 and the named human litmus.
- **AC-S220-3** — PENDING: instantiate approved routine/emergency/refusal scenarios and policy versions; test stop requests, failed steps, disconnected interaction, unsupported issue and prohibited advice. This falsifies ARCH-S220-3 / BEH-S220-3 and the named human litmus.
- **AC-S220-4** — PENDING: instantiate the actual handoff and operation contracts, then test Vendoroo/native duplicate events, repeated delivery, lost response, ambiguous provider effect and source outage; retain one accountable actor. This falsifies ARCH-S220-4 / BEH-S220-4 and the named human litmus.

**Forbidden actions / hard gates.**

No native live calls, recording, troubleshooting advice, provider creation, emergency dispatch or routing cutover from this pending file. Do not invent phone/provider/channels/languages/contacts/consent or assume a credential grants effect authority.

**Dependencies / sequencing.**

Use S222 as the unified reviewed emergency classification/guidance and policy-version owner.
Native intake consumes that same policy and its unknown/expired states; it cannot rebuild a
different classifier from informal meeting shorthand. S219 establishes the actual channel and
coverage constraints, and S221 owns delivery/escalation/cutover.

S219 must establish actual contracts; S221 owns emergency handling/controlled transition. Vendoroo integration remains a complete parallel capability with explicit routing ownership, not a duplicate actor.

**Standalone delivery contract.**

- **Deliverable now:** An honest pending desired outcome and blocking-input specification only.
- **Consumes, but does not assume:** Actual selected coverage, provider events and approved policy once S219 resolves them; absent values are not safe defaults.
- **Externally blocked effect:** All native intake/troubleshooting implementation admission and live interactions until the material provider/policy inputs are finalized.
- **Produces for downstream suites:** After finalization/implementation, one provenance-backed native interaction history and controlled maintenance handoff. No live capability is claimed now.

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
