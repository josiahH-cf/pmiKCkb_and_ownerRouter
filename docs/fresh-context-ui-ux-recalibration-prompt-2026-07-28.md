# Fresh-Context Prompt — Execute UI/UX Recalibration S40–S50

> **Canonical unattended launcher:** start with
> `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`. That meta-prompt makes managed auth,
> budget safety, dirty-worktree discovery, and the complete blocker ledger mandatory Phase 0 work,
> then incorporates this file as the locked product/end-state contract.

Copy this prompt into a new runner context rooted at this repository. It is intentionally
decision-complete. Do not replace it with another audit, ask the owner to reconfirm settled choices,
or treat current UI/governance as the target when it conflicts with the S40–S50 program.

---

You are executing the authorized PMI KC UI/UX recalibration program.

## Authority and flags

The owner reviewed all 42 findings, approved all nine workstreams, settled D-01 through D-14, asked
for implementation-grade specs, directed the autonomous loop to execute them in a fresh context,
and explicitly asked that the gate be opened.

```yaml
program_id: UIUX-RECALIBRATION-2026-07-28
spec_writing_allowed: true
loop_execution_allowed: true
implementation_status: NOT_STARTED
next_suite: S40
runtime_action_gates_preflipped: false
```

The loop flag is open. Begin work. The last value remains false because an action-level
`production_allowed` gate is opened only in the owning implementation slice after its exact
documented endpoint/mapping/identity and full action contract are ready. Pure app-plane work has no
Registry gate and ships when verified.

## Mandatory first read

Read these files completely, in order:

1. `AGENTS.md`
2. `docs/facts.md`
3. `docs/loop-state.md`
4. `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`
5. this prompt
6. the current suite under `docs/feature-suites/`
7. every directly referenced prerequisite spec/fact/module required by that suite

Also inspect `git status`, the current branch/HEAD, recent relevant commits, and the actual code/
tests/routes before planning an edit. Existing deployed behavior and historical facts remain
evidence; the new program controls the target.

If the slice will touch a live Google read or gcloud, run `npm run preflight:adc` first. If stale,
stop and ask the owner to run exactly `npm run auth:session` in their terminal. Never substitute a
personal identity. Do not run live/cloud/cost-bearing/destructive work merely because this prompt
authorizes code execution; follow AGENTS.md owner-run gates.

## The end state you are building

- Demo and Production are independent environments running the same product.
- Demo defaults to realistic invented Demo data. It may expose a separately selected Live
  **read-only** context. Demo and Live-read-only records/counts/receipts never mix.
- Production contains Live data only. Missing/unknown classification fails closed. It has no
  Sample/Test/Demo route, selector, fixture, simulator, or shipped lab.
- Blue/green means Production candidate-revision promotion and rollback, not the Demo/Production
  data boundary.
- Four daily destinations: Console, Renewals, Maintenance, Approvals.
- Spaces remains a first-class Knowledge destination but uses a searchable grouped list/detail
  flow, not equal cards.
- Console owns Ask + bounded Work now; Approvals owns decisions; Notifications owns event history/
  unread; Connections owns provider setup; workflow desks own work status. Share calculation, not
  complete rendered lists.
- Renewals has one environment-appropriate desk and one per-unit workspace: Data check → Owner
  decision → Tenant offer → Build documents. Scoped Editors may use the Live desk and create
  governed drafts; send/write/High authority remains action-specific.
- Every actionable item opens its exact field/evidence/next step and returns to its prior list state.
  Every supported provider has an outbound destination: verified exact record link when documented,
  otherwise an allowlisted generic front door labeled `Exact record link unavailable`. A generic
  link is never evidence.
- Approvals uses one-card decisions on phone and desktop. Filters/selection/bulk are secondary and
  cannot weaken reason/version/risk authority.
- Maintenance uses a focused list/detail with status, assignment, next action, communication,
  evidence/history, close/reopen. No simulator or nineteen-action matrix lives on the ticket.
- Resident Maintenance intake is a no-second-login tokenized conversation with approved
  troubleshooting, appropriate photos, versioned possible-charge acknowledgement, idempotent
  submit, staff review, and a RentVine portal/text adapter built to the documented endpoint seam.
- Communications is workflow-linked only. Connections is provider-focused. Admin is task-based.
  There is no replacement Admin Test Lab.
- Delete shipped browser simulations, hard-coded actors, no-op Sample controls, duplicate readiness
  matrices, and lab handoffs. Keep automated tests/fixtures/emulators, Demo workflow adapters,
  provider seams awaiting real setup, security/TOTP, receipts, kill switches, and rollback tools.
- Removal is two-stage: hide/move/redirect/instrument, then bounded deletion after consumer/role/
  route/test/deploy/rollback proof. Static import reachability is never sufficient.
- Build S37 only after the canonical IA baseline. S50 controls any conflict: the page builder uses a
  fixed inert component library and safe layout regions and cannot alter shell, route ownership,
  authority, required task controls, providers, or external effects.

## Settled interpretations — do not reopen

1. “Demo can have live data too” means an explicit mutually exclusive Live-read-only context with a
   persistent banner and zero mutation/provider effect. It never means mixed queues or shared
   credentials/stores.
2. “Always link to provider” means documented exact URL first, otherwise a reviewed generic provider
   front door with honest labeling. Never guess a record path.
3. “Delete all Test tools” means shipped tools/surfaces, not automated testing, Demo product parity,
   security, rollback, or real provider seams.
4. “Spaces remains primary” and “four daily destinations” coexist: the four are the Work group;
   Spaces is the separate first-class Knowledge destination. On compact mobile it is pinned first in
   the disclosure.
5. The Editor contradiction is settled: implement scoped Live-desk access and draft creation.
6. Do not invent a self-registration product from dormant TOTP/verification helpers. Existing Vendor
   TOTP remains.

## Dependency order

Execute one bounded suite/slice at a time:

1. S40 `environment-deployment-separation.md`
2. S41 `shell-navigation-vocabulary.md`
3. S42 `attention-and-spaces-flow.md`
4. S44 `evidence-provider-backlinks.md`
5. S43 `lease-renewal-canonical-workspace.md`
6. S45 `approval-queue-consolidation.md`
7. S46 `maintenance-operator-workspace.md`
8. S47 `resident-maintenance-intake.md`
9. S48 `admin-connections-tool-retirement.md`
10. S49 `compatibility-code-qa-retirement.md`
11. S50 `nocode-builder-recalibration.md`

S43 and S45 may proceed independently only after S40/S41/S44. Do not start S50 before its
prerequisite ledger is green. Interleave an older S28–S39 provider activation only when its named
dependency arrives and doing so does not leave the active S40–S50 slice half-applied.

## Per-slice execution contract

For the current suite:

1. Discover actual routes, services, schemas, role/environment gates, imports, tests, facts, and
   deployed/current behavior. Treat filenames in the spec as examples; meet the observable end state
   using coherent current boundaries.
2. Convert every relevant acceptance criterion into a test/measurement plan. Add or pin tests before
   changing risky behavior.
3. Implement the smallest complete vertical slice that satisfies named ACs. Do not stop at a fake
   provider or preview if a documented dependency already exists. Do stop at the single named
   external dependency if it truly does not.
4. Preserve human send/write authority, environment isolation, managed identity, secrets/PII
   exclusion, provider truthfulness, idempotency, receipts/readback, monitoring, rollback, and the
   approximately $10 cap.
5. Falsify adversarially: wrong role/scope/environment; missing/unknown mode; stale/duplicate request;
   cross-record link; browser-forged return/context; Demo provider construction; guessed URL/
   endpoint; absent template; mobile overflow/overlay/focus; scanner/provider outage; rollback.
6. Run focused checks, then the suite’s exact full command list. Fix failures caused by the slice.
   Do not erase unrelated user changes.
7. For any live external action completed to its documented seam, open
   `production_allowed` in the same reviewed slice only if all gate evidence exists; update both
   executable allowlists and pinned schema/risk tests. Never leave a finished provider gated by
   habit and never preflip an undocumented action.
8. Update the suite status, add/replace the authoritative `F-*` fact with AC references, add
   Supersede Log entries for claims the shipped behavior actually replaced, update relevant product/
   guide/manual-QA/environment docs, and rewrite `docs/loop-state.md` to the exact next safe slice.
9. Commit/push/deploy only under the repository’s normal authority. Cloud provisioning, credential/
   scope grants, Production record deletion, traffic promotion, and signed-in owner walkthrough are
   owner-run. Produce exact commands/reports; do not fake completion.

## External evidence that may remain

- S47 RentVine resident interactive endpoint/vendor confirmation: blocks only the RentVine channel
  activation.
- S43 Chasity renewal template artifact: blocks only template-dependent output activation.
- Exact provider record URL documentation: exact-link enhancement only; S44 generic front doors
  still ship.
- Compatibility usage proof: generated by S49 stage one; ambiguous candidates keep redirects.
- Provider credentials/scopes already named in S28–S39: block only their specific activation.

Report a blocker as: missing item; exact slice/effect blocked; evidence already completed; exact
owner step; safe work that continues. Never say an entire suite is “pending” because its last
external flip is missing.

## Stop conditions

Stop cleanly only when:

- the current bounded slice is verified, documented, and resumable;
- a named owner-only operation is the sole remaining step for that effect;
- the approximately $10 cost ceiling would be exceeded; or
- a safety/identity/source contradiction remains after repository/code evidence is exhausted.

Do not stop merely because the work is large, a provider is external, an old doc says Test is
required in Production, or a route/component location differs from a spec example.

Begin with S40 unless `docs/loop-state.md` records a later verified resume point.

---
