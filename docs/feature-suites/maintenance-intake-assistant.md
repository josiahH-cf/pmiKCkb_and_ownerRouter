<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S109 — Maintenance intake triage and troubleshooting assistant

> Status: IMPLEMENTED. The S47 public route accepts bounded structured answers, the pure
> `projectIntakeTriage` owns urgency, required evidence, expectation copy, and completion, the
> reviewed troubleshooting catalog exists and is empty until the owner supplies links, an optional
> model adapter may only suggest a trade, and promotion carries the triage onto the ticket where S108
> reads `photos_needed` as a blocker. Public file upload stays forbidden: the recorded conflict is
> unchanged, and the form states exactly which photos are needed instead. The resident-facing form is
> `app/maintenance/report`, an inert public shell whose bridge clears the fragment-delivered token
> before any request. The owner still supplies the troubleshooting links and any extension of the
> required-evidence table; their absence disables only the resource offer.

**Goal.**

A resident intake gathers the facts the team normally chases, routes active flooding to the urgent
path, tells a fire reporter to call emergency services, sets realistic expectations for ordinary
issues, offers only reviewed troubleshooting resources, and lands in the normal maintenance
workflow with its blockers visible.

**Current state / intended end state.**

| Package requirement (PMI-09)                       | Classification                     | Evidence                                                                                                                               |
| -------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Use the existing resident intake surface           | Already satisfied                  | S47 public route `app/api/maintenance/intake/public/route.ts`, quarantine, staff promotion                                             |
| Structured summary fields                          | Missing                            | Only `summary`, `description`, `contact`                                                                                               |
| Require photos before normal processing            | Conflicting with project authority | S47 forbids public file or image upload; staff photo upload exists (`app/api/maintenance/photo/route.ts`)                              |
| Project-owned urgency and evidence rules           | Partially                          | `MAINTENANCE_EMERGENCY_KEYWORDS` and `inferPriority` (`lib/maintenance/constants.ts`, `work-order-draft.ts`) run only on staff capture |
| Flooding to the urgent path                        | Missing on public path             | Keywords exist; no public-path routing or urgent label                                                                                 |
| Fire: tell the resident to call emergency services | Missing                            | No copy or rule                                                                                                                        |
| Realistic timing language                          | Missing                            | No approved copy; copy-voice gate applies                                                                                              |
| Reviewed troubleshooting catalog                   | Missing                            | None exists                                                                                                                            |
| Save summary, responses, urgency, resource         | Partially                          | Quarantine record holds text only                                                                                                      |
| Hand off to S108 blockers                          | Missing                            | Promotion creates a ticket without triage carry-over                                                                                   |
| Model interprets, rules decide                     | Partially                          | `lib/llm/model-provider.ts` gateway exists; unused in maintenance                                                                      |

Intended end state: a deterministic triage module that owns urgency, evidence, expectation, and
resource selection; an extended bounded intake payload; optional schema-validated model
interpretation of free text; triage carried into the promoted ticket and S108 projection; photos
requested as a visible blocker rather than uploaded publicly.

**Actors and entry conditions.**

An external reporter holding a valid S47 token submits intake. Staff review, promote, and attach
photos through the existing photo action. Production accepts `data_mode=live` only. No provider or
messaging effect occurs on submission.

**What it is / how it functions.**

1. **Structured intake.** Extend `PublicIntakeBodySchema` with optional bounded fields: `issueType`
   (from the existing trade taxonomy in `lib/maintenance/constants.ts`), `location`, `happeningNow`,
   `startedAt`, `damageOrAccess`, `attemptedSteps`; total body stays under the 16-KiB ceiling with the
   existing sanitation. The public page renders these as a few focused questions.
2. **Triage rules.** A pure triage module under the maintenance library: `urgency` = `emergency_fire` when
   fire/smoke/gas/carbon-monoxide terms appear, `urgent_flooding` when active-water terms appear, else
   `normal`; `requiredEvidence` per issue type from a small owner-reviewed table (default: photos for
   water, damage, appliance, pest); `expectationCopy` from approved templates; `resource` from the
   catalog when exactly one entry matches the issue type and urgency is `normal`.
3. **Model interpretation (optional).** When a model provider is configured, map free text to
   `issueType` and urgency hints through `lib/llm/model-provider.ts` with a strict JSON schema and a
   deterministic fallback; rules remain authoritative and the model never selects a resource or
   overrides `emergency_fire`.
4. **Copy.** Fire: `Call 911 now if anyone is in danger. We have recorded your report.` Flooding:
   urgent acknowledgement and immediate-action guidance. Normal: calm acknowledgement without a
   completion promise. All copy passes `verify:copy-voice`.
5. **Catalog.** A reviewed catalog module under the maintenance library holds entries
   `{ id, issueType, title, url, reviewedOnIso }`; empty until the owner supplies links; unknown
   issue types receive none.
6. **Persistence and handoff.** The quarantine record stores the structured summary, urgency,
   required-evidence state (`photos_needed`), and resource id. Promotion copies them into the ticket
   (priority `Emergency` for fire/flooding with `priority_provenance: "auto-inferred"`,
   `photos_needed` as an S108 waiting-on input) and activity.
7. **Recorded conflict.** Public photo upload stays forbidden under S47. The intake explains exactly
   what photos are needed; staff attach them through the existing photo action or the resident sends
   them through the property team's channel; the ticket shows `Photos needed` until then.

**In scope / out of scope.**

In scope: schema extension, triage module, copy, catalog, model adapter, persistence, promotion
carry-over, tests. Out of scope: repair diagnosis, vendor dispatch, spending approval, public
uploads, concierge assistant, pricing or marketing.

**Open questions & assumptions.**

Troubleshooting links and the required-evidence table are owner inputs; empty inputs disable only
resource offers.

**Cross-product impacts.**

Public intake route and page, quarantine and ticket schemas, promotion transaction, S108 projection,
copy-voice gate, model provider configuration, S111 proof.

**Authority and evidence map.**

| Input                                                     | Classification                   | Use and limitation                                                                    |
| --------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `AGENTS.md`, S47, S100, `maintenance-ai-boundary.test.ts` | Authority / implementation truth | Quarantine-only public writes, no public upload, no AI authority over effects.        |
| Owner package PMI-09                                      | Intent evidence                  | Lightweight intake, flooding/fire handling, realistic expectations, vetted resources. |
| Owner-supplied resource links and evidence table          | External dependency              | Absent inputs disable only resource offers.                                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S109-1** — Triage is a pure module with no model dependency; a flooding fixture fails today
  (no urgency on the public path) and returns `urgent_flooding` after.
- **ARCH-S109-2** — The public route still imports no ticket writer, provider, or messaging module;
  the S47 negative-import scan stays green with the new fields.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S109-1** — A water report without photos records `photos_needed` and a focused photo request
  and is not complete intake.
- **BEH-S109-2** — A fire report returns the emergency-services copy and still records the request;
  a flooding report reaches the urgent path with its evidence.
- **BEH-S109-3** — A normal issue receives realistic copy, becomes a normal ticket on promotion, and
  receives at most one matching reviewed resource; an unknown issue receives none.

**Human litmus outcome.**

### The intake asks the right questions and knows an emergency

**If this was built correctly:** A resident opens the intake link, answers a few questions, and is
told exactly which photos are needed. A flooding report is treated as urgent; a fire report tells them
to call emergency services. Staff see the structured report, the urgency, and the missing photos on
the ticket.

- Model verdict: PASS - why: a fire, smoke, gas, or carbon-monoxide report returns the exact
  emergency-services line and is still recorded; active water reaches the urgent path with immediate
  guidance, and a plain leak escalates only when the reporter says it is happening now; a water or
  appliance report, or any report describing damage, records `photos_needed` with a focused photo
  request and is not complete intake; an ordinary report receives calm copy with no completion
  promise and at most one reviewed resource, and an ambiguous or unknown issue type receives none;
  promotion carries urgency, issue type, and the photo blocker onto the ticket, where the S108
  projection reads `resident` with the photo next action; and a model answer cannot downgrade a fire
  report, select a resource, or return anything but a trade. The rehearsal browser proved the form is
  reachable with no session, that the token never enters a request URL and its fragment is cleared
  before anything can request, that no file input is offered, and that a link with no token refuses
  instead of submitting.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                                               | Deterministic evidence / falsification          |
| ------------------------------------ | -------------------- | ---------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| MAI-01 photos required               | `ARCH-S109-1`        | `BEH-S109-1`     | The intake asks the right questions and knows an emergency | Water-without-photos fixture                    |
| MAI-02, MAI-03 flooding/fire         | `ARCH-S109-1`        | `BEH-S109-2`     | The intake asks the right questions and knows an emergency | Keyword fixtures                                |
| MAI-04, MAI-05 normal/resource       | `ARCH-S109-1`        | `BEH-S109-3`     | The intake asks the right questions and knows an emergency | Catalog match/no-match fixtures                 |
| MAI-06, MAI-07 no authority, handoff | `ARCH-S109-2`        | `BEH-S109-3`     | The intake asks the right questions and knows an emergency | Negative-import scan; promotion carry-over test |

**Preservation set.**

All S47 token, public-route, rate, sanitation, quarantine, review, rules, and negative-import tests;
`maintenance-ai-boundary.test.ts`; copy-voice gate.

**Adversarial acceptance checks.**

- **AC-S109-1** — `ARCH-S109-1`: no model output can downgrade `emergency_fire` or select a resource.
- **AC-S109-2** — `BEH-S109-1`: no path marks intake complete while required evidence is missing.
- **AC-S109-3** — `ARCH-S109-2`: the public route cannot reach a ticket writer, provider, or draft.
- **AC-S109-4** — Oversize or malformed structured fields fail with the existing generic error.

**Forbidden actions / hard gates.**

No public upload, no dispatch, no spending approval, no provider status, no completion promise, no
model-owned rule, no unreviewed link.

**Dependencies / sequencing.**

After S108 projection exists; S111 proves the handoff.

**Standalone delivery contract.**

- **Deliverable now:** schema, triage, copy, catalog scaffold, model adapter, persistence, handoff,
  fixtures.
- **Consumes, but does not assume:** a configured model provider and owner resource links.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** triage fields on quarantine and ticket records.

**Verification and delivery contract.**

1. Freeze triage, route, and promotion fixtures failing for the expected reason.
2. Run focused intake, sanitation, triage, model-adapter, promotion, and copy-voice checks plus a
   rehearsal-browser walk of the public form.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` (not
   expected).

**Ordered prompt sequence.**

1. Re-verify S47 boundaries.
2. Materialize fail-first triage and route fixtures.
3. Implement schema, triage, copy, catalog, adapter, handoff.
4. Run focused and canonical checks; update current docs.

**Deletion/merge recommendation.**

Merge into S47 once deployed and read back.
