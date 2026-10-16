<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S109 — Maintenance intake triage and troubleshooting assistant

> Status: DEPLOYED in `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4`. Exact CI 34556917662 and S51/S54 candidate, promotion, observation and readback passed. Bounded structured intake, pure triage and approved matching troubleshooting resources preserve the public route boundary and writer-derived evidence; no upload or provider/draft path is added.
> Current applicability: historical delivery evidence only; operational requirements are superseded by S227. No former maintenance or provider proof is queued.

**Goal.**

Retain the original maintenance/vendor records, receipts, permissions and historical requirement evidence after custom maintenance retirement. S227 owns the current operating contract; Vendoroo remains standalone.

**Current state / intended end state.**

October 15 30:54–31:32 and the confirming maintenance emails retire the custom workflow. The source baseline 0b892865 contains the earlier implementation or proposal recorded below; S227 retires operational entry and preserves authorized read-only history. S227–S229 are under verification, with no new deployment claimed. Earlier authoring and delivery evidence retains its original scope.

**Actors and entry conditions.**

Existing authorized readers retain their current permissions. No new maintenance intake, vendor work, provider action, maintenance draft, integration access request or old proof window may start from this contract. Shared renewal and knowledge behavior remains separately owned.

**What it is / how it functions.**

Read-only retention uses the existing stores and receipt/history readers under their original authorization, with operational requests refused before dispatch. No records are deleted or relabeled. Current maintenance is managed in standalone Vendoroo; no destination URL or integration is invented.

**In scope / out of scope.**

Only retention, historical interpretation and permission compatibility remain applicable. All former operational maintenance/vendor requirements and Vendoroo ingestion work in the historical trace below are superseded by S227. Raw private sources remain outside Git. This file grants no new execution or release authority.

**Open questions & assumptions.**

Former provider/account/policy inputs are not prerequisites for retirement and must not trigger duplicate requests. Fresh read-only provider evidence and deployment are held only by the exact authentication/browser limitations recorded in docs/open-blockers.md. Missing observations are not success.

**Cross-product impacts.**

S227 owns retired HTTP and shared effect admission, authorized history and reports. Existing stores, receipts and permissions remain unchanged. Renewal, workflow-linked unsent communications, search and knowledge retain their independent contracts. The historical architecture below identifies original owners for preservation only; it does not request extensions or integration.

**Authority and evidence map.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Input                                                     | Classification                   | Use and limitation                                                                    |
| --------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| `AGENTS.md`, S47, S100, `maintenance-ai-boundary.test.ts` | Authority / implementation truth | Quarantine-only public writes, no public upload, no AI authority over effects.        |
| Owner package PMI-09                                      | Intent evidence                  | Lightweight intake, flooding/fire handling, realistic expectations, vetted resources. |
| Owner-supplied resource links and evidence table          | External dependency              | Absent inputs disable only resource offers.                                           |

**Architecture outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **ARCH-S109-1** — Triage is a pure module with no model dependency; a flooding fixture fails today
  (no urgency on the public path) and returns `urgent_flooding` after.
- **ARCH-S109-2** — The public route still imports no ticket writer, provider, or messaging module;
  the S47 negative-import scan stays green with the new fields.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S109-1** — A water report without photos records `photos_needed` and a focused photo request
  and is not complete intake.
- **BEH-S109-2** — A fire report returns the emergency-services copy and still records the request;
  a flooding report reaches the urgent path with its evidence.
- **BEH-S109-3** — A normal issue receives realistic copy, becomes a normal ticket on promotion, and
  receives at most one matching reviewed resource; an unknown issue receives none.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

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

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

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

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S109-1** — `ARCH-S109-1`: no model output can downgrade `emergency_fire` or select a resource.
- **AC-S109-2** — `BEH-S109-1`: no path marks intake complete while required evidence is missing.
- **AC-S109-3** — `ARCH-S109-2`: the public route cannot reach a ticket writer, provider, or draft.
- **AC-S109-4** — Oversize or malformed structured fields fail with the existing generic error.

**Forbidden actions / hard gates.**

No public upload, no dispatch, no spending approval, no provider status, no completion promise, no
model-owned rule, no unreviewed link.

**Dependencies / sequencing.**

Use S227 for maintenance retirement and retained read-only compatibility. S228 owns current Dotloop diagnostics and S229 renewal/unsent communications preservation. Do not resume the old maintenance, Vendoroo integration or proof sequence from this historical contract.

**Standalone delivery contract.**

- **Deliverable now:** The S227 retirement/retention slice, preserving original evidence without migration effects.
- **Consumes, but does not assume:** Existing authorized history and exact receipts.
- **Externally blocked effect:** No former maintenance/provider effect is requested. Current live verification holds are in docs/open-blockers.md.
- **Produces for downstream suites:** Original record/receipt meanings and permissions, without new operational authority.

**Verification and delivery contract.**

1. Verify current S227 retirement and read-only retention through the real request, service and authorized reader boundaries.
2. Preserve original requirement IDs, historical verdicts, records and receipt meanings. Do not execute the superseded operational acceptance outcomes or collect retired integration inputs.
3. Use S227-S229 for current focused regressions, required repository checks and authorized gated delivery. Record local, live-provider, human and deployment outcomes separately; missing evidence cannot become success.
4. Report ALL_GATES_GREEN only for actually completed current engineering gates, BUDGET_EXHAUSTED only for an explicit budget, or BLOCKED with its exact unavailable external input after independent work. These terminal states do not resume the superseded operational outcomes.

**Ordered prompt sequence.**

1. Read the current router and S227; verify actual retirement/retention behavior.
2. Use original evidence below only for provenance and preservation scope.
3. Do not execute former operational instructions, collect retired integration inputs or rerun completed proofs.
4. Verify and deliver the currently authorized S227–S229 slice through existing gates.

**Deletion/merge recommendation.**

The original operational contract is superseded by S227. Its historical trace remains temporarily available for native program-ledger consistency; it is not an execution queue. Remove that provenance only with its remaining evidence references reconciled, retaining originals in Git history.
