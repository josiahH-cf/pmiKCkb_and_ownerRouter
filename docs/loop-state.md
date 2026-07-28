# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.

Last updated: 2026-07-28.

```yaml
last_updated: 2026-07-28
active_program: UIUX-RECALIBRATION-2026-07-28
program_suites: S40-S50
spec_writing_allowed: true
loop_execution_allowed: true
spec_package_status: READY_FOR_EXECUTION
implementation_status: NOT_STARTED
next_suite: S40
next_spec: docs/feature-suites/environment-deployment-separation.md
runtime_action_gates_preflipped: false
```

## Authority

- Owner accepted all 42 UI/UX audit findings and all nine workstreams, settled D-01–D-14, asked for
  hyper-specific fresh-context specs, and explicitly directed the loop flag to open.
- Controlling program:
  `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`.
- Canonical unattended fresh-context entry:
  `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`.
- Locked product/end-state contract:
  `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md`.
- Fact: `F-UIUX-RECALIBRATION-AUTHORIZED`.
- S28–S39 remain authorized provider/capability seams. S40–S50 now control environment, IA,
  workflow consolidation, tool retirement, and S37 sequencing.

## Current truth

- Repository baseline at spec authoring: `main` / `b048043`; the S40–S50 documentation changes are
  uncommitted until the owner chooses the normal commit flow.
- No S40–S50 application code, cloud resource, record migration, action gate, deploy, send, or
  external write was performed by the 2026-07-28 spec cycle.
- Current Production still has verified Live+Test behavior
  (`F-PRODUCTION-DUAL-DATA-LANES`). That remains current-state evidence until S40’s backed-up,
  owner-run migration/cutover; it is no longer the target.
- Current serving checkpoint remains the last verified row
  `F-CURRENT-SERVING-CHECKPOINT-2026-07-23`; do not infer deployment from later git history.

## Locked target

- Separate managed Demo and Production environments, same product behavior.
- Demo owns realistic invented Demo data/effects; optional Live read-only is explicit, non-mixing,
  and non-mutating. Production is Live-only and has no Demo/Test product tools.
- Blue/green is Production candidate revision promotion/rollback, not environment separation.
- Four daily destinations plus primary non-card Spaces; split attention ownership.
- One Renewal desk/unit/four-stage flow with scoped Editor desk/draft access.
- Exact field/evidence/return links; verified exact provider URL or honestly labeled allowlisted
  generic front door.
- One-card Approvals; focused Maintenance; tokenized resident intake/RentVine seam.
- Workflow-only Communications; provider Connections; task Admin; no replacement Test Lab.
- Remove shipped simulations/no-op Sample/Test tools; retain tests, Demo parity, security, rollback,
  and real provider seams.
- Two-stage compatibility retirement; S37 executes only after the canonical baseline under S50.

## Dependency order

1. S40 environment/deployment separation.
2. S41 shell/navigation/vocabulary.
3. S42 attention ownership + Spaces flow.
4. S44 evidence/provider backlinks.
5. S43 canonical Renewal workspace.
6. S45 Approval one-card consolidation.
7. S46 Maintenance operator workspace.
8. S47 resident Maintenance intake.
9. S48 Communications/Connections/Admin/tool retirement.
10. S49 compatibility/code/QA retirement.
11. S50 S37 builder recalibration.

S43 and S45 may run independently only after S40/S41/S44. S50 waits for its prerequisite canonical
owner ledger. Interleave S28–S39 only when a named provider dependency lands and no S40–S50 slice is
left half-applied.

## Named external evidence

- S40 activation: exact independent Demo project/service/database/storage/queue/OAuth/runtime
  identity values plus owner-run provision/migration/deploy.
- S43 template-dependent output only: Chasity’s exact updated renewal artifact.
- S47 RentVine channel only: documented resident portal/text interactive endpoint/vendor semantics
  and secure account mapping.
- Exact provider record URLs enhance S44; reviewed generic provider front doors ship without them.
- S49 generates its own usage/consumer proof; ambiguous candidates keep redirects.

## Gate meaning

- Program/spec/loop flags are OPEN.
- Pure app-plane features have no Action Registry gate and ship when verified.
- `runtime_action_gates_preflipped:false` is intentional. A provider action flips in its owning
  implementation slice only when endpoint/mapping/identity/full contract are documented; update the
  seed, both executable allowlists, and pinned tests together.
- Never leave a finished documented action preview-only by habit; never flip an undocumented action.

## Next exact actions

1. Documentation-only validation is green: format, diff check, router boundary, falsification,
   copy voice, context freshness, feature-suite shape (149 tests), and spec traceability (292 IDs).
2. In a fresh context, launch
   `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`: complete its auth/budget/worktree/
   blocker-ledger Phase 0, then execute S40’s discovery/test-first app-plane slice and continue
   through safe dependency-ready suites. Do not provision cloud resources or delete/migrate
   Production records until the exact owner-run packet is green.

## Locked safety

- No autonomous/scheduled/bulk/model-triggered client-facing send. Every client-facing send or
  system-of-record write is human-initiated and exact-confirmed.
- No guessed endpoint/record URL/customer value; generic provider navigation is never evidence.
- No Demo/Production resource, record, credential, effect, or receipt crossing; unknown mode fails
  closed.
- No personal auth, secret/PII/customer content/token/photo in git or release evidence.
- Every Live effect is one-attempt, idempotent, receipted/read back, monitored, and reversible.
- No big-bang deletion; static reachability alone never removes provider/security/rollback code.
- Approximately $10 total cost cap remains binding.

## Resume

Use `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`; it incorporates
`docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md` as the end-state contract. Begin at S40
unless a later verified fact and this file record a completed suite. Do not reopen D-01–D-14 or
mistake current Production Live+Test behavior for the target.
