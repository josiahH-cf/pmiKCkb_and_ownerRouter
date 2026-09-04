# PMI KC current plan

Updated: 2026-09-03.

## Outcome

Promote the committed S82 conformance, S97 integrity hardening, S98 append integrity plus fixed-row
capability refusal, and S51/S54 assurance correction through its deployed zero-traffic candidate once
the owner-supplied assurance inputs exist, and execute the owner's 2026-09-03 renewal-completion
program (S102-S111, rewritten S34) in dependency order without describing worktree behavior as
production truth.

## Current implementation baseline

Production serves commit `d243911cb20ffb01773072c0e27c723648eeea34` as revision
`pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` at 100% traffic, with immediate rollback
`pmi-kc-app-rmtkgn08q-db89a37c43dc`. It is Production + Live with eleven Spaces, the managed runtime
identity, an enabled operating-Sheet write switch, and 48 Action Registry keys of which 16 are open.

S96, S85, S86, S83, S84, and S99 are complete and deployed. S97 and S98 have deployed,
proof-qualified baselines plus active unreleased integrity hardening. S98's serving baseline still
permits its historical fixed-row path; the correction makes its normal product path append-only and
refuses fixed-row update/delete/restore until a provider-owned stable-row and expected-generation
seam exists. S100's closed-safe workflow and chat-sync action are deployed, proven, and activated; its
resident-draft action remains closed. The original S82 release is deployed, but its conformance was
reopened by the current adversarial review. The S82/S97/S98 corrections in the worktree and the
expanded S51/S54 assurance harness are committed (`e6b76f9`) and deployed as zero-traffic
candidate `pmi-kc-app-rmtmaxi8r-f6190b47628d`; promotion waits on the managed Admin/Editor
browser profiles and the S51 monitoring resource set. S102 (`ff200d3`), S103 (`0158c90`), S104
(`0f01353`), S105 (`13523c5`), and S106 (`af23da4`) are committed and carried by that candidate.

## Active correction slice

1. Finish the S82 fail-first corrections:
   - preserve missing current rent as unavailable rather than `$0` through desk, workspace, and draft;
   - expose typed, privacy-safe auxiliary-read failures rather than turning them into empty success;
   - use one packet/evidence generation across the desk and workspace;
   - render only validated source destinations and keep source-write controls in the owning phase;
   - force a complete post-write source read that cannot reuse pre-write cached/in-flight data;
   - bind every displayed discrepancy decision, queued proposal, Admin approval, preview, and durable
     Sheet claim to the same versioned source-candidate fingerprint and resolution version, rejecting
     drift before persistence or provider execution;
   - use one resolution-aware effective conflict projection for verification, blocker, process,
     status, desk, and workspace truth, while treating legacy or malformed resolution/approval state
     as stale rather than current; and
   - make active scope, counts, filters, validation, loading, target size, zoom, and large-cohort
     behavior observable and testable.
2. Close the S97/S98 active write-integrity gaps without changing action authority:
   - bind RentVine charge-create attempts to an exact pre-attempt matching-charge baseline and a
     proposal-generation attempt id, but never attribute an ambiguous attempt from matching provider
     state alone; without provider-owned causality it cannot mint a success receipt or receipt-bound
     delete authority;
   - require fresh duplicate readback and bind every reversal to the exact forward receipt;
   - derive Sheet append identity and values from fresh server-side RentVine/Sheet joins, scope
     proposals to the exact actor/lease target, transactionally bind proposal/execution/lifecycle,
     generation-bind replay, preserve ambiguous recovery, and archive succeeded evidence before the
     active proposal can be replaced or discarded;
   - refuse normal Sheet field update and every fixed-row delete/restore before writer construction;
     the exact keys stay open for historical receipts, but neither a Registry key nor a prior proof
     overrides the absent provider capability; and
   - keep every completed live proof closed and do not rerun it merely to release this hardening.
3. Finish the S51/S54 deterministic assurance harness: strict bodyless evidence schemas and command
   preflights; managed Admin/Editor read-only route manifests and a GET/HEAD-only browser firewall;
   fatal console/page/first-party/error-boundary classifications; exact source/application/semantic-
   table reconciliation with distinct mismatch and inconclusive states; monitoring/readiness and exact
   rollback predicates; fresh exact candidate and promotion receipts; compensating restoration of the
   captured predecessor when promotion-side readback or receipt persistence fails; a versioned green
   predecessor baseline, one-use candidate receipts, ambiguous-command compensation, atomic pending
   receipt publication, and an observation interval that begins before the traffic attempt;
   immediate-versus-minute-five checkpoint separation, managed ADC/emulator refusal, real
   cancellation at every deadline; and a full 300,000 ms post-promotion observation with a fixed
   420,000 ms evidence deadline.
4. Keep My Work read-only on entry and navigation restoration. Reconciliation and cutoff recovery
   require an explicit button; browser scroll restoration is never an activity heartbeat.
5. Keep the S88-S95 amendments and S101 as specifications only.
6. Run focused adversarial tests, formatting, lint, typecheck, `bash scripts/verify.sh`, and bounded
   core E2E. Audit secrets, customer data, action gates, protected paths, runtime configuration, and
   the complete diff.
7. Commit and push only a green tree, require exact-SHA CI, then deploy a zero-traffic candidate.
   Prove exact commit/revision/configuration and run the candidate assurance gates before promotion.
8. Promote only the exact green revision. Run immediate and end-of-window Admin/Editor canaries,
   source reconciliation, monitoring, and metrics. Restore only the captured predecessor when an
   exact rollback predicate fires.
9. Reconcile the router, facts, status, plan, and loop state to the observed result. Never insert a
   future commit, revision, test count, CI result, or deployment claim before readback.

## Authority and closed decisions

- Production remains Live-only; no fake identity, lease, work order, provider record, or customer
  value may be used for a live effect.
- Completed S97-S99 and S100 chat proofs are not rerun or reassigned to substitute records.
- Every normal live write remains human-initiated, exact-previewed and confirmed, one-attempt where
  required, receipted, read back, and reversible/correctable. A normal Sheet append is manually
  correctable from its receipt/destination; the app does not automate an unsafe fixed-row delete.
- The S100 manager-read marker is the sole specified non-reversible stateful-read exception. The
  resident reply may be only an unsent draft in the signed-in managed mailbox.
- No direct send, RentVine chat post, Vendor assignment, attachment upload, generic/bulk effect,
  autonomous/model-triggered effect, self-granted access, or personal runtime identity is allowed.
- Dotloop is now scoped by S106/S34 under D-RENEWAL-COMPLETION; LeadSimple remains deferred.
- `.claude/settings.local.json`, `output/`, ignored `temp/`, credentials, bodies, provider payloads,
  and customer evidence remain outside Git and build uploads.

## Canonical closure sequence

The only executable order is in `docs/feature-suites/README.md`:

1. S96 — safe connector disconnect and reconciliation. COMPLETE.
2. S85 — global theme and visual system. COMPLETE.
3. S86 — action feedback, help, and safe recovery. COMPLETE.
4. S83 — capability-guided Admin access requests and approvals. COMPLETE.
5. S84 — navbar dropdown navigation. COMPLETE.
6. S82 — table-first renewal desk and guided lease workspace. Baseline deployed; conformance
   remediation active.
7. S97 — governed RentVine renewal writeback. Baseline deployed; integrity remediation active.
8. S98 — operating renewal Sheet append and fixed-row capability boundary. Baseline deployed;
   append-only remediation active.
9. S99 — RentVine Maintenance work-order writeback. COMPLETE.
10. S100 — RentVine work-order chat sync and resident draft. BLOCKED on the resident-draft runtime
    input; chat sync complete.
11. S51/S54 — production assurance expansion. Committed; owns the shared release gate for steps 6-8.
12. S102 — tenant current rent from the RentVine lease detail. Committed and candidate-deployed,
    not promoted.
13. S103 — lease term and renewal eligibility. Committed and candidate-deployed, not promoted.
14. S104 — renewal desk and workspace parity closure. Committed and candidate-deployed, not
    promoted.
15. S105 — end-to-end renewal lifecycle closure. Committed and candidate-deployed, not promoted;
    its Dotloop phase link waits on S106 and S34.
16. S106 — Dotloop connection and renewal readiness. Committed and candidate-deployed, not
    promoted; only its live readiness check is blocked on the owner's OAuth application and
    connected account.
17. S34, S107, S108, S109, S110, S111 — the rest of the renewal-completion program in that order
    (owner direction 2026-09-03).
18. S36 — temporary Space provisioning pilot and exact retirement. S36 is queued behind complete S100.
19. S88, then S89 — deterministic assistant foundation, privacy, observability, cancellation, and
    cost controls.
20. S90 and S91 — Work/access and renewal query adapters.
21. S92 — knowledge and bounded grounded narration.
22. S94 — human-confirmed renewal-to-self task action against strict S93-slot fixtures.
23. S93 — streaming/linked-result UI, followed by the single S93/S94 integration gate.
24. S95 — atomic minimal Dashboard composition and relocation.
25. S87 — final six-cohort product-wide content reconciliation and end-to-end verification.
26. S101 — post-S87 read-only cross-application assistant expansion.

The correction slice is an explicit S82 conformance, S97/S98 integrity, and release-assurance
intercept; it does not pretend a dependent feature suite advanced. Default to serialization. Only
bounded S90/S91 domain work may run in isolated worktrees after its prerequisites, with shared
registries/schema/delivery serialized. No dependent starts after a failed gate.

## Per-suite delivery rule

For each code suite, re-read current code and live read-only state, freeze fail-first and preservation
evidence, implement closed before effect activation, run focused adversarial tests,
`bash scripts/verify.sh`, and `npm run test:e2e:core`, then audit secrets, PII, protected paths,
runtime configuration, effects, and diff. Commit/push only green work, require exact-SHA aggregate
CI, and release served code through zero-traffic candidate smoke, candidate assurance, exact
promotion/readback, observation, and the captured rollback contract. Read back every cloud/provider/
config mutation and reconcile facts, status, this plan, and loop state before advancing.

Each suite terminates only as `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` when the user supplied an explicit
budget, or `BLOCKED` on one exact unavailable runtime input after all independent closed-safe work is
green. The full initiative completes only after S87 and final end-to-end verification are green and
current docs match deployed/live readback.
