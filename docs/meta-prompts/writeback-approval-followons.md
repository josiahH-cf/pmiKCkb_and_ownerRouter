# Meta-Prompt: Write-Back Approval Follow-Ons (queue view + audit trail)

Hand this to a model (or run it through the unattended loop) to build the two read-only, non-executing
follow-ons that sit on top of the shipped lease-renewal write-back approval control plane
(`F-WRITEBACK-APPROVAL`). Both are unblocked and readiness-improving — they harden existing behavior
that will ship to the client-owned environment (operator visibility + auditability of a governance
control), so they pass the Build-to-Seam Gate. Neither executes a system-of-record write,
adds a vendor action, changes `production_allowed` anywhere, or invents product scope. They are
independent; ship either first (Slice B is the smaller one).

```
You are building two small, independently-shippable READ-ONLY slices on top of the shipped
lease-renewal write-back approval control plane (F-WRITEBACK-APPROVAL). Neither executes a
system-of-record write, adds a vendor action, or invents product scope. Work in the smallest safe
slices; follow docs/autonomous-agent-runner.md (verification-and-falsification, stop-and-reset); honor
the $10 cap and the no-SoR-write gate throughout.

STEP 0 — Re-anchor (read-only). Read AGENTS.md, then docs/facts.md (esp. F-WRITEBACK-APPROVAL,
F-WRITEBACK-PROPOSAL, F-RENEWAL-REVIEW-SUBTAB, F-WRITE-GATE), docs/loop-state.md, and the latest
docs/status.md entry. These two slices are local-only, so `npm run preflight:adc` is optional (run it
only if you add a live Google read). CONFIRM the invariants you must preserve — do not break them:
  - production_allowed:false + executed:false on every write-back approval record; NO Sheets/RentVine/
    SoR call may exist in either slice's path (grep the path to prove it).
  - Any queue-adjacent / review board stays VALUE-FREE (no proposed value, reason, or decider).
    tests/unit/renewal-review.test.ts pins the EXACT key set for both the flag AND the run objects and
    asserts no value/reason/decider (SECRET sentinel) ever serializes. Keep those green.
  - Admin-only remains the gate for DECISIONS (decideWritebackApproval). These two slices add NO new
    decision path — they are read / triage / deep-link only. Route-gate them at "read".

REUSE (do not re-implement):
  - lib/firestore/lease-renewal-writeback-approvals.ts — getWritebackApproval,
    listWritebackApprovalsForRun, listWritebackApprovalActivity. The Activity records already carry
    run_id (LeaseRenewalWritebackApprovalActivityRecord.run_id).
  - lib/lease-renewal/run-view.ts — the RenewalFlagView.writebackApproval overlay +
    buildRenewalRunView(run, resolutions, label, approvals).
  - lib/lease-renewal/renewal-review-board.ts — loadRenewalReviewBoard already loads approvals per run.
  - lib/approval/renewal-review.ts — buildRenewalReviewBoard + per-run proposalsAwaitingApproval /
    proposalsApproved counts.
  - components/approval/ApprovalQueue.tsx (tab machinery) + components/approval/RenewalReviewPanel.tsx.

SLICE A — Cross-run "ready-to-write" write-back queue (VALUE-FREE).
  End state: an operator sees, in ONE place, every queued write-back proposal grouped by approval state
  — Awaiting approval / Approved (ready to write, NOT executed) / Returned — across all runs, each row
  deep-linking to its run page to act. It executes nothing.
  Design (pre-decided — do not re-litigate):
   - Surface it as a NEW value-free tab "Write-back queue" in the Approval Queue
     (app/approval-queue/page.tsx + components/approval/ApprovalQueue.tsx), beside "All items" and
     "Renewals" — that is where Dan approves. Grouped by approval STATE (a different lens than the
     Renewals tab's group-by-run), so keep it a separate tab, not a fold-in.
   - Build a NEW pure projection buildWritebackApprovalQueue(views: RenewalRunView[]) in lib/approval/,
     reusing the SAME RenewalRunView[] that loadRenewalReviewBoard already assembles — NO new Firestore
     reads. Each row carries ONLY value-free fields: fieldKey, fieldLabel, severity, runId, runLabel,
     state, href (the run-page deep link). NEVER the proposed value, reason, or decider — those stay
     behind the deep link. Include per-state counts.
   - NO actions on this surface (read + deep-link only), mirroring the renewal review sub-tab's
     read/triage posture (OQ-UI-1). Acting stays on the run page (the Admin control already built).
   Tests: a value-free invariant test (SECRET/reason/decider never serialize; pin the row's EXACT key
   set, as renewal-review.test.ts does) + grouping/counts + a component render test (reuse
   tests/unit/renewal-review-panel.test.tsx patterns). Add fact F-WRITEBACK-QUEUE (evidence + ISO date).

SLICE B — Approval audit-trail on the run page (value-bearing, RUN PAGE ONLY).
  End state: on a lease-renewal run page, a flag whose proposal has a decision history shows the
  append-only Activity trail — each approve / return / revoke, by whom, when, and why — under the
  existing approval control. Read-only; completes the auditability of the governance control.
  Design (pre-decided):
   - Add listWritebackApprovalActivityForRun(user, runId) to
     lib/firestore/lease-renewal-writeback-approvals.ts — ONE where("run_id","==",runId) query (the
     Activity record already has run_id), grouped by source_trigger_key. Do NOT do N per-flag reads.
   - Thread the grouped activity into buildRenewalRunView (new optional param) and onto the flag view's
     approval overlay (e.g. writebackApproval.activity: {action, decidedByUid, reason, createdAt}[],
     newest last). Value-bearing display is allowed on the authenticated run page (design §6.1) — it
     already shows the last decision reason; this shows the full, ordered history.
   - Render a compact timeline under WritebackApprovalControl in
     components/lease-renewal/LeaseRenewalRunClient.tsx. Load the activity on the run page server
     (app/lease-renewal/runs/[runId]/page.tsx), degrading to [] if Firestore is unavailable (mirror the
     existing resolutions/approvals try/catch).
   - The value-free board must STILL NOT carry activity: the board projection already drops the overlay
     — add an assertion that JSON.stringify(board) contains no activity reason.
   Tests: service listWritebackApprovalActivityForRun (fake Firestore, tests/helpers/fake-firestore.ts)
   + run-view overlay carries the grouped activity + the board still doesn't leak it. Extend the
   F-WRITEBACK-APPROVAL evidence with the new files.

STEP FINAL — Verify + hand off (per slice). Run the battery proportional to the change: npm run lint,
npm run typecheck, npm test, npm run verify:falsification, npm run verify:context-freshness, npm run
verify:router-boundary; prettier --check ONLY your touched files (the repo has pre-existing CRLF drift
— never mass-reformat). Run the Verification-and-Falsification phase like an outside reviewer trying to
BREAK it: leak a value into a value-free surface, reach an executing FSM state, bypass the Admin gate,
introduce an N+1 read, drift a doc. Update docs/facts.md, docs/loop-state.md (keep it under the length
cap), and docs/status.md. Prepare a commit queue per slice; do not commit/push/merge unless asked.
STOP when both slices ship or a stop-and-reset condition fires. Neither slice may execute a write, add
a vendor action, touch move-in/move-out, or change production_allowed anywhere.
```
