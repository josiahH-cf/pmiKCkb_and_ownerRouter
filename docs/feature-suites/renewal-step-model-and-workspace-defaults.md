<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S72 — Six-step renewal process and substep evidence model

> Status: The owner approved the six top-level steps, base-rent semantics, and the requirement that
> each step contain operational substeps; the current application still implements a four-step model.

**Goal.**

Make every lease follow one versioned six-step renewal process whose substeps, responsible role,
prerequisites, completion evidence, alternate exits, and downstream reopening rules are explicit.

**Current state / intended end state.**

The workspace currently exposes Data check, Owner decision, Tenant offer, and Build docs. It can save
an owner decision, tenant draft receipt, and broad completion flag, but cannot represent the approved
six-step process or prove the many actions inside each step. The intended state pins every renewal to
an approved process version, computes progress from exact evidence instead of button intent, shows
incomplete/blocking substeps, supports valid non-renewal branches, and prevents later process edits
from silently rewriting earlier leases.

**Actors and entry conditions.**

Renewal operator means an Editor or stronger role with Renewals Space access. Document coordinator
and renewal reviewer are operational responsibilities, not new auth roles or personal-name bindings.
Entry requires one exact Live lease and current source identity. Any provider effect retains its own
role, action key, preview/confirmation, and readiness prerequisites; process position alone grants no
authority.

**What it is / how it functions.**

The approved `renewal-v1` process is:

| Step                                                          | Responsible operational role                                 | Required substeps                                                                                                                                                                                                                                                                                                                                                                                                                                    | Completion evidence / branch rule                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Find and verify the renewal**                            | Renewal operator                                             | Identify current-month/upcoming/tracked-incomplete work; verify lease/property/unit/tenant/owner identity; verify end date and contractual **base rent**; show recurring charges separately; reconcile RentVine/Sheet conflicts or record an exact disposition; confirm data currency/completeness and required recipient/source availability.                                                                                                       | Exact lease/source snapshot is current; base rent is verified by fresh agreement or exact resolution; every blocking conflict is resolved or explicitly held; missing/ambiguous identity remains blocked.                                                                         |
| **2. Analyze market evidence and record the owner decision**  | Renewal operator; human property owner supplies the decision | Run S59 under the two-mile/15-request policy; review query basis/range/comparables and any screenshot; prepare approved owner copy; exact-preview and create an unsent Gmail draft; a person sends in Gmail; deliberately refresh the linked thread; record the actual owner response, approved base rent, separately labeled charges/terms, and evidence source.                                                                                    | Completion requires the human owner's recorded decision and exact values/evidence. Draft creation or a RentCast number alone never completes the step. No response stays waiting.                                                                                                 |
| **3. Prepare the tenant offer and track the decision**        | Renewal operator                                             | Build the offer only from the recorded owner decision; resolve authoritative tenant/co-tenant recipients; render approved copy and optional constrained S74 tailoring; exact-preview/create an unsent Gmail draft; a person sends in Gmail; refresh linked communication; record waiting/last-contact/follow-up truth; record tenant outcome as awaiting response, accepted, counter/change requested, declined/non-renewing, or Needs Verification. | Accepted advances to documents. Counter/change requested reopens the relevant owner-decision substeps and invalidates stale downstream previews. Declined/non-renewing exits to a documented non-renewal handoff rather than Build docs. Awaiting/unknown stays incomplete.       |
| **4. Build the required document packet**                     | Document coordinator                                         | Load the approved S66 artifact/participant/field/signature/form catalog; verify exact parties/property/terms; assemble an immutable hash-bound packet snapshot; surface missing inputs; review/create/read back a Dotloop packet only through S34 when official mappings and authority exist; keep any RentVine source write in the separate S30 lifecycle.                                                                                          | A complete current S66 snapshot plus required artifact/Dotloop readback proves completion. Missing catalog/mapping/OAuth or a closed key is a visible blocker, not locally asserted completion; a RentVine write is not step-completion evidence.                                 |
| **5. Obtain signatures and perform follow-up**                | Document coordinator / renewal operator                      | Track each required signer and artifact; refresh provider state or authoritative signed-artifact evidence; surface waiting party and last verified contact; apply only client-confirmed timing rules; handle correction/reissue through a new exact packet snapshot; retain prior receipts without treating them as current.                                                                                                                         | Every required signature has provider/artifact evidence tied to the current packet version. A proposed “45-day” follow-up remains non-operative until entered as client-confirmed S75 policy. Partial/old signatures do not complete the step.                                    |
| **6. Complete final compliance checks and close the renewal** | Renewal reviewer / operator                                  | Verify all required documents/signatures; pet/animal terms; Rhino/security-deposit applicability; insurance and separately labeled charges; owner-inspection applicability and date/evidence; effective lease dates/terms; unresolved exceptions; exact external write previews where separately authorized; record app completion and audit evidence.                                                                                               | Every required item is Verified or explicitly Not Applicable with source/reason. App completion may be recorded without a provider write. RentVine/Sheet updates remain separate closed/exact actions; “hide row” or provider completion is claimed only from a receipt/readback. |

Each substep has `not_started`, `blocked`, `ready`, or `complete` derived from evidence. Manual notes may
explain a state but cannot substitute for required provider/source proof. Changing an upstream fact,
owner/tenant decision, template, attachment, packet snapshot, or process definition invalidates the
affected downstream evidence deterministically.

**In scope / out of scope.**

In scope: versioned definition, six steps, listed substeps/roles/evidence, base-rent semantics,
alternate branches, reopening/invalidation, workspace/desk projection, migration/default behavior,
and audit. Out of scope: inventing approved email/legal wording (S74), timing values (S75), Dotloop
catalog/API mappings (S66/S34), action activation, automated send, or system-of-record write.

**Open questions & assumptions.**

Exact approved owner/tenant copy and S75 timing values remain external inputs. S66/Dotloop mappings
remain provider/client inputs. The named outcome taxonomy is the v1 operational state model; a later
change requires a new process version and explicit migration decision.

**Cross-product impacts.**

Renewal desk/workspace/progress schema, S59 comps, S74 drafts, S75 follow-up, S77 exact confirmation,
S78 triage, S63 proof, S66 packet snapshots, S34 Dotloop, work/attention/reporting, source writes, and
current product/facts documentation.

**Authority and evidence map.**

| Input                                                                                                           | Classification                        | Use and limitation                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` product/write/send boundaries and `docs/facts.md` F-RENEWAL-SCOPE                                   | Authority / approved product decision | Exactly six top-level steps, many explicit substeps, contractual base rent, and human-owned external effects are approved; process position grants no provider authority. |
| Current desk-model, renewal-progress schema/store, process-definition seed, workspace, and decision projections | Verified implementation truth         | The application implements four broad steps and coarse evidence today; these are migration inputs, not the approved end model.                                            |
| Process-definition, progress, workspace, decision, current-rent, provider-boundary, and Firestore tests         | Verification baseline                 | They preserve identity/audit/current behavior while new definition/version/branch/invalidation tests fail against the four-step baseline.                                 |
| Stabilization intake and meeting record                                                                         | Intent evidence only                  | They supply the operational substeps and desired path to documents/Dotloop; they do not approve copy, timing values, provider mappings, writes, or automated sends.       |
| S74, S75, S66, S34, and S30 external inputs                                                                     | Named dependencies                    | Missing copy/policy/catalog/OAuth/mapping/write authority blocks only the exact dependent substep and remains visible.                                                    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S72-1** — One immutable/versioned process definition contains exactly six stable step ids,
  ordered substep ids, responsible operational roles, prerequisites, evidence predicates, branch
  transitions, and reopening dependencies; schema/snapshot tests fail against the four-step baseline.
- **ARCH-S72-2** — Each lease progress record pins a process version and stores/references evidence
  without copying provider truth into unverified flags. A deterministic migration check proves a new
  definition cannot silently reinterpret an existing lease.
- **ARCH-S72-3** — A dependency graph invalidates every downstream preview/evidence state affected by
  an upstream change while leaving unrelated verified evidence intact.
- **ARCH-S72-4** — Process state never imports or implies a Gmail send, RentVine/Sheet write, Dotloop
  execution, action-key grant, or personal-name authority.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S72-1** — The workspace shows all six steps and their substeps, owner role, current state,
  missing evidence, and next safe action in the approved order.
- **BEH-S72-2** — A normal accepted-renewal case cannot advance until each step's exact evidence is
  present; clicking, drafting, or entering a note cannot forge completion.
- **BEH-S72-3** — Counter/change requested reopens owner decision and invalidates stale offer/packet
  work; declined/non-renewing exits to the non-renewal handoff; unknown/no-response remains waiting.
- **BEH-S72-4** — Missing copy, timing policy, packet catalog/provider mapping, or closed write action
  blocks only its dependent substeps and explains the dependency without losing earlier progress.
- **BEH-S72-5** — Base rent is the renewal comparison/decision value; recurring charges display and
  persist separately and cannot silently alter it.

**Human litmus outcome.**

### Work a renewal through six understandable steps

**If this was built correctly:** A renewal operator sees six steps with the real smaller actions
inside each one, understands who owns the next action and what proof is missing, and cannot mark a
lease complete merely by clicking through. A counteroffer reopens the right earlier work, while a
non-renewal leaves the document path honestly.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                    | Architecture outcome       | Behavior outcome         | Human litmus                                                         | Deterministic evidence / falsification                                                                                               |
| -------------------------------------------------------------- | -------------------------- | ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Exactly six versioned steps with operational substeps/evidence | `ARCH-S72-1`, `ARCH-S72-2` | `BEH-S72-1`, `BEH-S72-2` | Work a renewal through six understandable steps                      | Definition snapshots, schema, migration, and UI tests fail on four steps and pass only with the exact table above.                   |
| Upstream changes reopen only affected downstream work          | `ARCH-S72-3`               | `BEH-S72-3`              | Counteroffer visibly reopens the right work                          | Dependency-table tests mutate decision, copy, attachment, packet, and definition inputs one at a time and assert exact invalidation. |
| Missing external inputs stay local and explicit                | `ARCH-S72-2`, `ARCH-S72-4` | `BEH-S72-4`              | Earlier verified work remains while one substep explains its blocker | Branch/readiness tests cover unset copy, timing, catalog, OAuth/mapping, and closed write actions without fabricated completion.     |
| Base rent remains distinct from recurring charges end to end   | `ARCH-S72-1`, `ARCH-S72-3` | `BEH-S72-5`              | Operator sees the exact comparison/decision value                    | Source, display, decision, template/packet, and preview tests reject total-charge substitution.                                      |
| Process evidence never executes an external effect             | `ARCH-S72-4`               | `BEH-S72-2`, `BEH-S72-4` | Clicking completion cannot send or write                             | Static/provider spies prove zero send/write/Dotloop calls from process transitions.                                                  |

**Preservation set.**

Exact lease identity, current-data/currency refusal, base-rent reconciliation, progress audit,
recipient separation, S59 reference-only policy, S75 no-timer-until-confirmed behavior, S66/S34
fail-closed readiness, exact action gates, draft-only Gmail, and source-write refusals remain green as
a separate gate.

**Adversarial acceptance checks.**

- **AC-S72-1** — `ARCH-S72-1` and `BEH-S72-1` prove the six-step/substep contract exactly matches this
  approved v1, including roles and completion evidence.
- **AC-S72-2** — `ARCH-S72-2/3` prove version changes and upstream changes cannot preserve stale
  downstream completion or rewrite historical meaning.
- **AC-S72-3** — `BEH-S72-2/3` cover accepted, counter/change, declined/non-renewing, no-response, and
  missing-evidence cases.
- **AC-S72-4** — `BEH-S72-5` proves base rent and recurring charges remain distinct across source,
  display, decision, template, packet, and write-preview boundaries.
- **AC-S72-5** — `ARCH-S72-4` proves process completion cannot execute or claim a provider/send/write
  effect.

**Forbidden actions / hard gates.**

No hidden auto-completion, invented step evidence/copy/timing/legal rule, personal-name authority,
provider result as decision, automatic or app send, guessed Dotloop/RentVine mapping, source write,
or action-gate inference.

**Dependencies / sequencing.**

S72 can be implemented independently with missing S74/S75/S66/S34 inputs represented as explicit
blocked substeps. Implement S59 base-rent/query truth and S77 exact draft lifecycle first when running
the whole bundle; S78 then projects the model into the canonical desk.

**Standalone delivery contract.**

- **Deliverable now:** immutable `renewal-v1` definition, pinned progress version, evidence predicates,
  alternate branches, dependency invalidation, compatibility/migration plan, workspace projection,
  audit, and fail-closed readiness can reach `ALL_GATES_GREEN` independently.
- **Consumes, but does not assume:** S59/S74/S75/S66/S34/S30 outputs enter through named evidence
  interfaces; when absent, the corresponding substep is `blocked` with its missing dependency and all
  unrelated steps remain functional.
- **Externally blocked effect:** approved copy, confirmed timing, document catalog/OAuth/mappings, and
  write authority may leave named operational substeps `BLOCKED`; they do not block the six-step model
  or permit simulated production completion.
- **Produces for downstream suites:** stable process/step/substep ids, version pin, state/evidence and
  invalidation contracts, branch outcomes, and desk/work-item projection consumed by S75/S78/S63.

**Verification and delivery contract.**

1. Before editing, snapshot the four-step baseline and make exact-definition, version pin, branch,
   and invalidation tests fail for the expected missing six-step behavior; record preservation passes.
2. Run `npm run test:direct -- tests/unit/lease-renewal-progress.test.ts tests/unit/lease-renewal-process-definition-seed.test.ts tests/unit/renewal-workspace-live.test.tsx tests/unit/lease-renewal-decision-projection.test.tsx tests/unit/lease-renewal-rent.test.ts tests/unit/lease-renewal-send-boundary.test.ts` plus new migration/graph tests.
3. Run any required Firestore emulator checks and `bash scripts/verify.sh`; inspect the diff and audit
   live-data migration, PII, process-version compatibility, protected Rules, gates, and provider
   imports before delivery.
4. Report `ALL_GATES_GREEN` only when the independently implementable model and preservation gates
   pass; `BUDGET_EXHAUSTED` requires an explicit budget. Report `BLOCKED` only for exact external
   substep inputs or protected migration delivery, never for the core model.

**Ordered prompt sequence.**

1. Freeze the approved table above and capture the four-step baseline with fail-first definition,
   migration, dependency, and branch tests.
2. Pin progress/current-rent/draft/provider-write preservation separately.
3. Implement the versioned definition, evidence predicates, transitions, invalidation, persistence,
   and UI projection without provider activation.
4. Exercise every primary/alternate/blocked path, run focused and canonical gates, migrate no live
   record without a reviewed compatibility plan, and ship only through the authorized release path.

**Deletion/merge recommendation.**

Remove after `renewal-v1` is deployed, existing lease migration is proven, human litmus passes, and
the durable process contract lives in product/process documentation and deterministic tests.
