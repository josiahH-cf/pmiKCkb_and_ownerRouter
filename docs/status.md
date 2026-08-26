# PMI KC current status

Last updated: 2026-08-26.

This is a current snapshot, not a chronological log. Use Git history at `1356918` for the removed
implementation history.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service: `pmi-kc-app`, project `pmi-kc-kb-prod`, region `us-central1`
- Revision: `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`, 100% traffic
- Code: `13569183da57c419ac0da279dde5a6d6a0b0da14`
- Descriptor: Production + Live
- Runtime identity: managed project service account
- Spaces: 11
- Demo auth and Ask Demo: off
- Operating Sheet write-back: off
- Rehearsal Sheet: not configured
- Provider secrets: RentVine and RentCast are Secret Manager-bound

The exact candidate smoke passed root 307, sign-in 200, protected route 307, and version 200. Stable
readback matched the exact commit, revision, service, and production environment. The predecessor
`pmi-kc-app-rmt99ltia-9119a24bf706` is the captured rollback target; the release wrapper printed the
exact rollback command. A rollback traffic switch was not run during the time-boxed meeting release.

## What works now

- Complete paginated RentVine lease reads and live renewal desk.
- Renewal Sheet reads, source reconciliation, discrepancy classification, and fail-closed rent badges.
- RentCast reference comps through the approved exact read key.
- Lease-specific draft preparation with all-owner/all-tenant recipient handling and human review.
- Gmail workflow reads, replies, labels, renewal drafts, and maintenance owner drafts under exact
  action gates.
- Console, Spaces, processes, approvals, Admin, Maintenance, feedback, resident intake seam, Vendor
  seam, and work accountability.
- Work tasks carry job location, materials needed, and materials bought/on hand.
- Exact public build identity at `/api/version`.
- One view-only operating-Sheet Admin link and a separate, deployment-managed rehearsal-copy
  configuration; Admin cannot currently paste or save the rehearsal link in the app.
- RentVine renewal dry preview with exact proposed and rollback payloads but no executable caller.

## Closed safety state

- Direct renewal/maintenance/generic Gmail sends are closed.
- RentVine renewal write is closed.
- Operating Sheet write-back is closed.
- Local Live-read-only rehearsal refuses effects.
- No product Demo/Test records or fake effects exist in Production.
- No RentVine record or operating Sheet cell changed during the 2026-08-26 work.

## Deployed release verification

The deployed code tree passed:

- 512 unit files / 4,948 tests;
- 25 Firestore files / 115 tests;
- 31 core browser tests with 18 intentional skips and zero failures;
- format, lint, typecheck, router, falsification, context, spec, copy, redaction, and budget gates;
- production build with 99 static pages;
- exact candidate and stable-version smoke.

## Documentation-reset verification

The current present-truth tree passed:

- 513 unit/eval files / 4,641 outcomes in one complete run: 4,637 passing and four intentional skips,
  with no worker-start or assertion failure;
- 25 Firestore files / 115 assertions;
- format, lint (0 errors), typecheck, router boundary, falsification, context freshness,
  active-document paths, spec traceability, copy voice, redaction, budget, and diff checks; and
- a fresh 99-page production build.

The reset and verification acceleration change documentation, test tooling, tests, and CI only; they
do not change served application behavior. Production therefore remains on the exact deployed
revision above and does not require a tooling-only redeploy.

## Verification performance

The prior full unit lane took 2,885.73 seconds on the WSL-mounted workspace and still produced worker
startup timeouts. The accelerated lane preserves all 513 files and per-file isolation while moving
test reads/temp files to a disposable native Linux worktree and using a bounded eight-thread pool.
Measured end-to-end wall time is 94.93 seconds with an empty dependency cache and 69.75 seconds warm.
CI now runs quality, unit, Firestore, and policy/build jobs in parallel behind one aggregate `verify`
result.

## Adversarial completion verdict

The dependency-independent meeting release is complete. The full original operational outcome is
not. The 2026-08-26 closure audit found both external dependencies and internal work:

- the rehearsal Sheet is not configured and its reversible write/read/clear proof has not run;
- no designated RentVine test record has been supplied, so no write proof was attempted;
- the source discrepancies are visible and fail closed, but have not been corrected at either source;
- all eight model litmus rows pass, while every human verdict remains blank; and
- all three live support reports remain `new` with zero transitions. Reporter records did not verify
  the literal attribution to Chastity.

Use `docs/pmi-kc-completion-blocker-audit-2026-08-26.html` as the controlling completion and blocker
report.

## Current external dependencies

1. Client-confirmed six-step renewal process.
2. Client definition of current rent.
3. Distinct rehearsal Sheet copy and sharing.
4. One designated RentVine test lease/owner.
5. Move-out deposit-disposition walkthrough.
6. Exact lease for the wrong-resident report.
7. RentCast search-radius/comparable policy.
8. Approved tenant wording and channel-evidence rules.
9. Waiting-on, follow-up, and property/lease timing policy.
10. Exact end-of-September scope.
11. Approved S66 lease packet/provider catalog.
12. Provider-specific credentials/contracts for Dotloop, LeadSimple, and the preferred RentVine
    resident channel.
13. Explicit owner decision on S64 per-person approval authority.

These block only their named capability.

## Current internal obligations

1. Triage all three live support reports and record truthful transitions.
2. Reconcile the stale RentVine Action Registry readiness description without opening its gate.
3. Decide and implement, or explicitly reject, in-app Admin rehearsal-Sheet configuration.
4. Complete the eight human-verification verdicts.
5. Convert the discrepancy queue into governed source corrections after the client defines current
   rent and a safe transaction contract exists.
6. Complete the four-lease proof, Gmail-watch reversal/follow-up integration, S36/S37 disposition,
   unlocked provider work, and a controlled rollback rehearsal.
7. Disposition the four transitive production dependency advisories reported by
   `npm audit --omit=dev` through a bounded upgrade or a documented reachability decision.

## Documentation state

Active context was reset and verified on 2026-08-26. Old Demo/V1 packets, completed program prompts,
closed audits, historical HTML reports, duplicate roadmaps, and completed suite narratives were
removed from the tracked tree. Current routing is `docs/README.md`; the active-path gate checks 75
present-context files. Ignored `docs/temp/` remains local scratch and is not evidence.
