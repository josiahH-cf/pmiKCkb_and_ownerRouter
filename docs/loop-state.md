# Loop state

Last updated: 2026-10-05 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

COMPLETE: batch 005, application-usability-reliability-2026-10, under the October 4 named owner
instruction. S168–S175, revised S87 and S176–S181, intake 035–049: all 116 engineering traces
and the one cumulative production release are verified. All fifteen finalized spec bytes and
unrelated private files remain preserved. Its four verification repairs were released on
October 5 by run 5d1b4e3a-ef6d-4354-aef1-e9952dd28687 under the owner's instruction of that day;
run 7753e5f5-2325-4b19-b83d-dc3475d71b0b released five follow-up fixes under the same instruction.
Run 61659874-478d-4135-9810-5033b2f732bf released the fixes for the items left open under the owner's later
instruction of that day.
Native evidence: docs/evidence/application-usability-batch005.json.

Serving e8bc616d144c6600da8394313153e1a0c75659da / pmi-kc-app-rmuvf58nk-d45b8bc5347d, 100% traffic,
run 61659874-478d-4135-9810-5033b2f732bf, exact-main CI 37333580981 passed. Approved WSL unattended CLI/ADC
refresh passed before dependent phases; guarded assurance used the existing managed Admin profile.
Batch 005 itself: run 8b7dc3f1-4c5b-482a-94ca-26985150c68d at fa5b2b27, exact-main CI 37250383538;
its first repairs: run 5d1b4e3a at 9e76c14f, exact-main CI 37299720511;
its follow-up fixes: run 7753e5f5 at b2308bc5, exact-main CI 37308062054.
Final focused selection passed 781/104 files. Native full 14 passed 8,753 unit/four existing skips,
325 backend, zero audit findings/all policies/build; core 12 passed 32/22 existing skips.
Compiled matrix 19 passed 438 observations/eight coupled journeys/168 accessibility audits,
zero violations/page errors. Six-owner recovery 6 passed 18 observations/126 intercepted attempts,
zero effects. Publication recovery 2 passed six observations/18 intercepted actions, retaining
the full wrapping hash and uncertain post-commit 409 fence. The separate compiled identity-to-lease
and verified RentVine shortcut journey passed. Counts are scoped actual evidence, not human verdicts.
Inventory: 38 routes, 190 consumers, six cohorts; 812 current plus 81 former content blocks.
Named actual owner/service/compiled checks are separate from source/import topology inspection.

## Independent verification, 2026-10-05

Reproduced at 2495d7bf: native gate, core, compiled matrix, lookup and both recovery checks; serving
readbacks and a guarded 13-route production canary with zero mutation attempts.
Released defects found (F-BATCH-005-VERIFICATION): navigation status on on-screen forms, S178
literal lookup capture, S177 size loss after a stale reload and filter overwrite on resize,
retired queue-email wording and controls in Admin, unknown personal-view surface 500. Repairs and
fail-first regressions merged in PR #130 and are released by run 5d1b4e3a.
Follow-up fixes merged in PR #133 and are released by run 7753e5f5: table cells under their own headers, lease
loading wording, unknown-outcome wording after an elapsed wait, a navigation status that stays in
view, a readable message editor, one primary message action and four visible field labels.
Open-item fixes merged in PR #136 and are released by run 61659874: the worklist stays while a lease
opens, an edited autosave state, download outcome feedback, distinct empty-lookup states, one
wording for a communication's state, residual explanatory copy removed and a remembered
cleared filter. The ledger records this verification apart from the implementation evidence,
with production cold and warm timings.

## Awaiting release

None. OWNER DIRECTION, 2026-10-05: use the recommendations on the open items; fix and deploy.
Run 61659874-478d-4135-9810-5033b2f732bf delivered the seven open-item fixes (S170, S178, S87,
S176, S177, S148, S181) at e8bc616d144c6600da8394313153e1a0c75659da; code slice
49f745f4b6889a9e8b17c0b18f9caf6b283037a2 is its ancestor. Runs 5d1b4e3a and 7753e5f5
delivered the earlier repairs at 9e76c14f and b2308bc5. All three exact permits are consumed.
Documentation-only closure does not deploy. No completed, superseded, historical or deferred suite
restarts from a registry row or consumed permit.

## Verified release and recovery

One application build f0fe9c5e-aecc-4a18-a2d4-12c47d0c055b succeeded 2026-10-05T15:59:30.830221Z.
Candidate receipt bf944845-2472-44dc-83b0-3c968863077c, issued 2026-10-05T16:10:48.079Z;
promotion verified 2026-10-05T16:11:07.983Z. Candidate assurance and reconciliation passed.
Observation passed two full checkpoints in 415448 ms against the required 300,000 ms,
inside the 420,000 ms deadline; all 318 source/projected/rendered records matched,
zero discrepancies/candidate 5xx/unresolved effects. Eleven independent readbacks matched,
completed 2026-10-05T16:18:32Z.
Tag cand-rmuvf58nk-d45b8bc5347d; fingerprint
sha256:f360625f1af6999d709db77e1fa920c8b4ff0a20977a7ef9cb2722d82ad8e8d6.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=true verified.

Actual captured predecessor b2308bc506132853ebd54e4ba0678abbf853fce0 /
pmi-kc-app-rmuv84r3a-f9fac2efc1af, Sheet=true (follow-up fixes, run 7753e5f5). Run-bound recovery
pmi-kc-app-recovery-61659874478d4135, same fingerprint/configuration and actual true switch;
receipt 4a82f3b8-2115-4aed-93de-efa81fa0d81c, reference hash
sha256:c64195ee2b907be4ce080b552ebdd4d69ebd379b69e81fdc6eef62f238647198. No traffic rollback occurred.
Initial recovery aggregate assurance failed before the application build: the new recovery
instance took 48.1 s for its first Dashboard render against the 30-second route bound, with every
request answered 200. The target read back healthy/zero traffic/configuration matched. Two separate
guarded 13-route diagnostics passed with zero errors/mutation attempts, then the same run resumed
assurance on the existing target. The first candidate smoke then failed: the zero-traffic candidate
answered its first request, the correct sign-in redirect, in 43.8 s against the 30-second probe
timeout. Two read-only smoke diagnostics passed with exact identity and the same run resumed.
Both original failures remain failed. No ambiguous operation was blindly redispatched or gate
lowered. Runs 5d1b4e3a and 7753e5f5 met the same first-render bound the same way.

## Feedback and accepted distinctions

Start and end feedback reconciled nine reports: six new/two acknowledged/one resolved. End
read at 2026-10-05T01:51:17.325Z matched the batch 005 version then serving; original body/identity/retention/hold/status
hashes preserved. All 312 accessible rows and 308 dated rows were retained and sorted
in both directions, with zero mutation attempts. Reported identities remain linked to actual
accessible records or honest absence; absence is not deletion evidence. No report status changed.
Deferred: rental permits, move-out business workflow redesign and the public website shortcut.
Feedback grants no deletion, status transition, reporter message or automatic scope expansion.
Clear filters retains sort/layout; Reset view restores the current table's defaults.
Responsive clamping never overwrites saved desktop sizing. S177 extends S166 account-owned views
with typed searches and desktop sizes, uid/private scope, CAS and explicit-link precedence.
Personal-view expiresAt TTL read back ACTIVE; runner wrote no production app record as proof.
Identity lookup uses accessible real app lease links and only verified exact RentVine shortcuts.
Human verdicts remain NOT RUN — no human observer; Editor browser is not_run under Admin-only policy.

## Remaining boundaries and continuation

Exact external/human holds remain in docs/open-blockers.md: Dotloop B-DL1–B-DL3, B-S100, B-MNT1,
B-AUTH2, notice-timing basis, optional phone redirect A7 and human observations. They hold only
their named effects. Historical K target/marker effects remain UNVERIFIED; absent logs prove no
outcome. No protected-path authority, identity/IAM/claim/permission, action key, client send,
budget or provider-effect change occurred. Exact preview/confirmation, one-attempt claim,
receipt/readback/correction contracts remain. Raw data, captures, credentials and failures stay
outside Git; original failures and superseded local verification attempts retain actual outcomes.

ALL_GATES_GREEN applies to verified batch 005 engineering and cumulative deployed release only.
No unfinished delivery remains. Documentation updates alone never issue a permit, build or
candidate.
