# Meta-Prompt: S13 Wave 2 — Space Teeth (Move-In, Move-Out, Tenant Notice, Owner Outreach)

Hand this to a model (or run it through the unattended loop) to build S11/`space-teeth` — the
reusable per-Space desk, the two V1 desks it powers (Move-In, Move-Out + Deposit Disposition), and
two Draft process definitions that wrap already-built draft composers (Tenant Renewal Notice +
Dotloop follow-up; Owner Renewal Outreach). E1–E4 are fully unblocked and unattended-safe (local
code, dry-run seed validation, no live Google/RentVine read required); E5 (the live seed) is
owner-run, not agent-executable. The decision-complete cycle packet with full research evidence is
`docs/temp/wave2-space-teeth-plan.md` — read it first if anything below is ambiguous.

```
You are building S13 Wave 2 (space-teeth, S11): a reusable per-Space desk generalized from the
Renewal Desk shape, wired to two V1 desks (Move-In, Move-Out + Deposit Disposition), plus two Draft
process definitions that wrap already-built draft composers (Tenant Renewal Notice, Owner Renewal
Outreach). Work in the smallest safe slices; follow docs/autonomous-agent-runner.md
(verification-and-falsification, stop-and-reset); honor the $10 cap and the no-SoR-write gate
throughout. E1-E4 are unattended-authorized; E5 (the live seed) is owner-run — do not attempt it.

STEP 0 — Re-anchor (read-only). Read AGENTS.md, then docs/facts.md (esp. F-PRECUST-CYCLE,
F-PRECUST-WAVE1), docs/loop-state.md, the latest docs/status.md entry, docs/feature-suites/
space-teeth.md, and docs/temp/wave2-space-teeth-plan.md (the full cycle packet — it has the exact
research evidence, file paths, and code shapes this prompt summarizes). Then read BOTH source docs
in FULL and build from them VERBATIM, not from memory: docs/products/move-in-move-out-process.md
(the 10 Move-In / 11 Move-Out steps) and docs/products/v1-process-qa.md (the answered Q&A — several
answers OVERRIDE the process doc's own printed defaults). CONFIRM the invariants you must preserve:
  - Move-In Q2 OVERRIDES the process doc's e-sign/certified-funds "gate" framing: NO hard blocking
    gates in V1 — every move-in step is a tracked checklist flag. Do not build any blocking
    mechanism for Move-In.
  - Move-Out Q1 NARROWS the trigger: a manual "Start move-out" button is the ONLY V1 trigger — no
    automatic Renewals-handoff wiring.
  - Move-Out Q3 OVERRIDES "no app math": the app DOES compute a SUGGESTED deposit deduction from
    operator-entered evidence. Binding guardrails — never final, requires owner approval, shows
    evidence + arithmetic transparently, NEVER posts to a ledger/bank/QuickBooks, NEVER invents the
    statutory deadline or legal wording (Move-Out Q2 stays a literal `Needs Verification:`
    placeholder).
  - Every Action Registry entry stays production_allowed:false; no autonomous send; no
    system-of-record write; Dan-owned/unknown values (deposit ledger location, dollar threshold,
    smart-lock demo detail) render as literal "Needs Verification:" strings, never invented.
  - grep the diff at the end of every slice to PROVE no RentVine/Sheets/Dotloop/QuickBooks write
    call and no send call exists anywhere in the new code.

REUSE (do not re-implement):
  - lib/lease-renewal/process-definition-seed.ts — the shared idempotent writer
    seedProcessDefinition() and the assertNoExecutableReferences() governance guard; every new
    domain's seed function delegates to these, exactly as lib/maintenance/process-definition-seed.ts
    already does.
  - scripts/seed-process-definitions.ts — the CLI's dry-run/live/--force/--json plumbing; add new
    {name, record, seed} entries to its `definitions` array, no other script changes needed.
  - lib/firestore/types.ts ProcessDefinitionRecord / ProcessDefinitionStep / CreateProcessDefinition
    InputSchema (lib/firestore/schemas.ts) — the exact shape every new process-template.ts must
    produce.
  - lib/spaces.ts LaunchSpace + launchSpaces — move-in, move-out-deposit-disposition,
    tenant-renewal-notice, and owner-renewal-outreach entries ALREADY EXIST with no
    processDefinitionId; just set the field. lib/space-card-state.ts computeSpaceCardState() then
    auto-upgrades the card with zero further code changes.
  - app/api/process-definitions/[definitionId]/test-runs/route.ts + startWorkflowTestRun() in
    lib/firestore/workflows.ts — the FULLY BUILT "start a run" path. Reuse it for both desks' "Start
    a run" control; do not build a second run-starting mechanism.
  - lib/lease-renewal/owner-draft.ts (buildOwnerRenewalDraft, formatUsd, DraftFact/FactConfidence
    types) and lib/lease-renewal/tenant-draft.ts (buildTenantOfferDraft) — both fully built, pure,
    literal production_allowed:false/send_allowed:false. E3/E4 call these AS-IS; do not rewrite.
  - lib/maintenance/owner-notice-draft.ts — the clearest existing template for a NEW notice/draft
    composer: reuse the DraftFact TYPE (not any function), the NEEDS_VERIFICATION/missingInputs
    idiom, and the subject+body composition shape.
  - lib/integrations/action-registry-seed.ts's two existing Dotloop entries
    (dotloop.loop.create_from_template, dotloop.document.upload, both readiness:"Needs Permission")
    — E3's Dotloop follow-up references these by key; do NOT author new registry metadata.
  - lib/firestore/lease-renewal-resolutions.ts (LeaseRenewalResolutionRecord + its append-only
    Activity twin) — the exact pattern the new per-step checklist record (E2b) mirrors: natural-key
    upsert-by-set() (never .update()), one transaction writing both the current-state doc and an
    activity doc, stripUndefined before every write, read-back via a dedicated getter after commit.
  - components/lease-renewal/RenewalDesk.tsx — the shape to generalize: PageHeader(title/subtitle/
    ModeChip) + a Stepper-driven workflow-steps section + a "connected tools + status" block +
    a single "Next action" pointer. components/ui/Stepper.tsx is already a pure, reusable
    {steps, currentIndex} primitive — reuse it directly.
  - tests/helpers/fake-firestore.ts — the fake-Firestore test harness every existing Firestore
    service test uses; reuse it for the new step-check service's tests.

SLICE E1 — Move-In + Move-Out Draft process-definition seeds.
  End state: `npm run seed:process-definitions -- --dry-run --json` prints two new Draft
  definitions (move-in, move-out-deposit-disposition) with the exact step text from the process
  doc; both Spaces' processDefinitionId is wired.
  Design (pre-decided in docs/temp/wave2-space-teeth-plan.md — do not re-litigate):
   - lib/move-in/process-template.ts (buildMoveInProcessTemplate) + lib/move-in/
     process-definition-seed.ts (MOVE_IN_DEFINITION_ID="move-in", buildMoveInDefinitionRecord,
     seedMoveInDefinition delegating to the shared writer) — 10 ProcessDefinitionStep entries
     quoting move-in-move-out-process.md §3 verbatim (intake form, collect docs/screening, build
     lease doc set, deposit-posture flag, e-signature, certified-funds, inspection setup, key
     handoff, welcome comms, disable listing). Trigger = Q1's manual-start wording. NO
     action_reference may have readiness "Approved for Execution".
   - lib/move-out/process-template.ts + lib/move-out/process-definition-seed.ts
     (MOVE_OUT_DEFINITION_ID="move-out-deposit-disposition") — 11 steps quoting §4 verbatim
     (notice/exit trigger, vacate dates, Dotloop doc set, conditional 4265 charge, move-out
     inspection, RentVine close-out/reporting, lock change + owner charge, deposit disposition,
     conditional Rhino claim, collections, final/relisting). Trigger = Q1's "Start move-out"
     wording, verbatim.
   - Register both in scripts/seed-process-definitions.ts's `definitions` array. Set
     processDefinitionId on the move-in and move-out-deposit-disposition LaunchSpace entries in
     lib/spaces.ts. Add both ids to SPACE_CONNECTOR_IDS (rentvine + google_sheets — mirrors
     lease-renewals, since both content-key off the renewal sheet's Tab 1/Tab 2).
  Tests: pure builder unit tests (mirror the maintenance process-template test shape); extend
  space-card-state.test.ts for both Spaces flipping "needs-a-process" -> "has-a-process" once
  seeded. Add fact rows F-MOVEIN-1 / F-MOVEOUT-1 when this slice ships.

SLICE E2 — The reusable per-Space desk + the two V1 desks. Build in this internal order:
  E2a Desk shell: a new components/desk/SpaceDesk.tsx (server component) generalizing RenewalDesk's
    shape — PageHeader, a Stepper fed from ProcessDefinitionRecord.steps, a connected-tools+status
    block reading lib/connections/connector-presence.ts for the Space's SPACE_CONNECTOR_IDS, one
    "Next action" pointer. No new I/O beyond what the page already loads (definition + presence).
  E2b Checklist persistence: new lib/firestore/workflow-run-step-checks.ts —
    WorkflowRunStepCheckRecord {id, run_id, definition_id, step_id, step_title, status:
    "Unchecked"|"Checked"|"Skipped", checked_by_uid?, checked_at?, reason? (required when
    Skipped), created_at, updated_at} keyed by deterministic id `${run_id}:${step_id}`, plus its
    append-only WorkflowRunStepCheckActivityRecord twin, in new collections
    workflow_run_step_checks / workflow_run_step_check_activity. Write function
    setWorkflowRunStepCheck(actor, input, db) gates at "edit" capability (app-plane bookkeeping,
    NOT the Admin-only write-back approval tier), validates run_id exists and step_id is one of the
    run's definition's steps, one transaction writes both docs (full .set(), never .update()), a
    listStepChecksForRun() query helper. New route app/api/workflow-runs/[runId]/step-checks/
    route.ts (POST to set, GET to list).
  E2c Start-a-run control: a client component on the desk that POSTs the EXISTING
    /api/process-definitions/{id}/test-runs route, then renders the checklist for the returned run
    via E2b/GET.
  E2d Wiring: route move-in and move-out-deposit-disposition through the new desk (extend
    app/spaces/[spaceId]/page.tsx's branching, or add dedicated routes + spaceHref entries
    mirroring lease-renewals/maintenance-work-order-intake — pick whichever keeps the diff smaller).
    Every OTHER Space keeps its current behavior unchanged.
  E2e Move-In domain core: lib/move-in/welcome-draft.ts — email + portal-chat welcome composer
    mirroring owner-notice-draft.ts's NEEDS_VERIFICATION/missingInputs idiom, reusing DraftFact
    from owner-draft.ts; fees render as "see RentVine" placeholders, NEVER a hard-coded dollar
    figure; a deposit-posture read (cash vs. deposit-replacement) — confirm the Missouri 2x-rent
    reference's existing source location before citing it, do not re-derive the number. Render as a
    Card on the Move-In desk, prepending the literal DRAFT_BANNER (lib/constants.ts) for UI
    consistency, alongside the typed production_allowed:false/send_allowed:false fields.
  E2f Move-Out domain core: lib/move-out/evidence-packet.ts — assembles operator-entered evidence
    lines (inspection charges, vendor bids, RentVine ledger refs, lock-change/4265 charge) and a
    PURE, deterministic suggested-deduction calculator: sum the entered lines, each line shows its
    source, the total is labeled "Suggested deduction — SUGGESTION ONLY, owner approval required".
    The statutory deadline and any legal wording render as the LITERAL string "Needs Verification:"
    plus context — never computed, never generated. "Disposition sent" and "everything finalized"
    are ordinary E2b checklist steps, same model as every other step — do not build a second state
    machine or a hard block for either.
  Tests: a desk-shell render test; a fake-Firestore service test for the step-check layer covering
  the edit-gate, the transaction/upsert-by-natural-key behavior, the Skipped-requires-reason rule,
  and that re-checking the same (run,step) overwrites rather than duplicates (mirror
  lease-renewal-writeback-approvals.test.ts's shape); a route test; pure builder tests for both
  domain cores; an evidence-packet arithmetic test with fixed inputs -> an exact total (no floating
  drift). Falsify: can a step check be written without "edit"? does ANY new code path touch
  process_definitions or a system of record? does the suggested-deduction total ever render without
  its evidence lines and the SUGGESTION-ONLY label?

SLICE E3 — Tenant Renewal Notice + Dotloop follow-up Draft definition.
  End state: the tenant-renewal-notice Space shows the SAME reusable desk (E2a) with its own
  process steps; starting a run walks gather-facts -> tenant offer draft -> Dotloop follow-up
  draft -> human approval, all draft-only.
  Design:
   - New lib/lease-renewal/dotloop-followup-draft.ts (buildDotloopFollowUpDraft) mirroring
     owner-notice-draft.ts's pattern (reuse the DraftFact TYPE; NEEDS_VERIFICATION markers for any
     unresolved participant/template/property field); its output references the two EXISTING
     Dotloop action-registry keys (dotloop.loop.create_from_template, dotloop.document.upload) as
     its action_references — do not author new registry entries; both stay readiness:"Needs
     Permission".
   - lib/lease-renewal/tenant-renewal-notice/process-template.ts + process-definition-seed.ts
     (TENANT_RENEWAL_NOTICE_DEFINITION_ID="tenant-renewal-notice") — step sequence: gather facts ->
     compose via the EXISTING buildTenantOfferDraft (call it, do not reimplement) -> compose via
     the new E3 Dotloop follow-up composer -> human approval/send gate (unsent-draft model per S13
     decision 3 — a human clicks Send, never the app). Register in the seed script; set
     processDefinitionId on the existing tenant-renewal-notice LaunchSpace entry.
   - No new desk component — this Space reuses E2a as-is; that reuse IS the acceptance criterion
     for "the desk pattern generalizes."
  Tests: pure builder test for the new Dotloop composer (value-free where required, Needs-
  Verification markers present for unresolved fields); seed dry-run validation;
  assertNoExecutableReferences still passes.

SLICE E4 — Owner Renewal Outreach Draft definition.
  End state: the owner-renewal-outreach Space shows the same reusable desk; starting a run walks
  gather-facts -> owner outreach draft -> Dan approves -> human sends.
  Design:
   - lib/lease-renewal/owner-renewal-outreach/process-template.ts + process-definition-seed.ts
     (OWNER_RENEWAL_OUTREACH_DEFINITION_ID="owner-renewal-outreach") wrapping the EXISTING
     buildOwnerRenewalDraft verbatim — gather facts (rent, market comps) -> compose -> Dan
     approves -> human sends. Register in the seed script; set processDefinitionId on the existing
     owner-renewal-outreach LaunchSpace entry.
   - No new desk component — reuses E2a.
  Tests: seed dry-run validation; confirm the step sequence actually calls buildOwnerRenewalDraft
  (no re-implementation) via a unit test asserting the composed draft's facts match a known input.

STEP FINAL — Verify + hand off (per slice). Run the battery proportional to the change: npm run
lint, npx tsc --noEmit, npm test, npm run verify:falsification, npm run verify:context-freshness,
npm run verify:router-boundary, npm run verify:copy-voice; prettier --check ONLY your touched files
(the repo has pre-existing CRLF drift — never mass-reformat). Run the Verification-and-Falsification
phase like an outside reviewer trying to BREAK it: leak a value into a value-free surface, bypass
the edit-capability gate on a checklist write, reach any RentVine/Dotloop/Sheet/ledger write call,
invent a dollar figure or a legal deadline, drift a doc, introduce an N+1 Firestore read. Update
docs/facts.md (F-MOVEIN-*/F-MOVEOUT-*/a desk-pattern fact), docs/loop-state.md (keep it under the
140-line cap), and docs/status.md at each slice boundary. Prepare a commit queue per slice; do not
commit/push/merge unless asked.

STOP when E1-E4 all ship (E5 is owner-run — hand it back as the next Tier-0 step, do not attempt
it) or a stop-and-reset condition fires. No slice may execute a write to RentVine/Dotloop/Sheets/a
ledger/QuickBooks, send anything autonomously, invent a Dan-owned value, or add a hard blocking
gate anywhere in Move-In (per the Q2 override) or a NEW blocking mechanism in Move-Out beyond the
uniform checklist model.
```
