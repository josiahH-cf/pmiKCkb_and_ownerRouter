# Loop state

Read `AGENTS.md` and `docs/facts.md` first.

Last updated: 2026-08-26

```yaml
active_program: CLIENT_PROCESS_VALIDATION
implementation_status: CODE_DEPLOYED
documentation_status: CURRENT_AND_VERIFIED
production_service: pmi-kc-app
production_revision: pmi-kc-app-rmtafuqbg-4e2e4ffe0f48
production_commit: 13569183da57c419ac0da279dde5a6d6a0b0da14
production_traffic_percent: 100
environment: production_live
next_slice: CAPTURE_CLIENT_PROCESS_ANSWERS
provider_write_in_flight: false
rentvine_write_allowed: false
operating_sheet_write_allowed: false
rehearsal_sheet_configured: false
s64_authorized: false
```

## Current outcome

Meeting-readiness code is built, fully tested, pushed, and deployed. Production exact-version smoke
is green. RentCast reference reads are live. Current-rent truth, discrepancy language, work details,
rehearsal-copy boundaries, RentVine dry preview, version evidence, agenda, and client action center
are shipped.

The documentation tree has been collapsed to present truth and adversarially verified. Historical
Demo/V1 programs, completed suite narratives, old audits, duplicate roadmaps, and stale launchers
were removed. Their recovery point is Git `1356918`. The active-path gate rejects dangling links and
references to retired governance roots.

The complete unit/eval lane now runs in 94.93 seconds cold and 69.75 seconds warm on the supported WSL
workspace, with all 513 files preserved. CI quality, unit, Firestore, and policy/build lanes run in
parallel behind one aggregate result.

## Next action

1. Capture the client-confirmed six-step renewal process and current-rent definition.
2. Obtain the distinct rehearsal Sheet id and managed sharing; never substitute the operating Sheet.
3. Obtain one unmistakable RentVine test lease/owner; keep the write gate closed meanwhile.
4. Resolve the move-out walkthrough, wrong-resident lease, RentCast operator policy, and exact
   end-of-September scope.
5. Implement only the capability unlocked by each confirmed answer. Do not redeploy
   verification-tooling-only changes; the served application code is unchanged.

## Active product work after this reset

- S72: client-confirmed six-step renewal model.
- S74: tenant offer copy and channel truth.
- S75: follow-up state and per-property timing overrides.
- S76: distinct rehearsal Sheet setup and reversible proof.
- S30: one designated RentVine test-record proof before any gate review.
- S66: approved lease packet/provider catalog.
- S64 remains specified but unauthorized.

## Locked safety

No autonomous client send. No unconfirmed system-of-record write. No operating-Sheet proof. No
guessed endpoint, identity, recipient, mapping, policy, or client value. Secrets and customer data
never enter Git.
