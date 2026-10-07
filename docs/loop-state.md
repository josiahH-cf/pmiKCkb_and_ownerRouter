# Loop state

Last updated: 2026-10-07 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

COMPLETE: dotloop-pdf-renewal-v1-2026-10, intake 050-054 (S106, S66, S130, S34, S182), under the
owner's 2026-10-06 execution instruction. Finalized spec revisions are committed (`d5478673`);
private reference PDFs stay ignored.
First release: run 5b5c850e-a131-4e37-996a-457f5f9fd62c released the S106 connection slice at
63ed1752, exact-main CI 37610987256.
Second release DONE: run 87920129-23c0-4420-a787-13036029d6f8 released S182, S66, S130 and S34 at
755009bae534cb2699789c1cfd07fa79aad8f94a / pmi-kc-app-rmuy3zv4l-6f09e67bd41a, 100% traffic, exact-main CI 37620419232.
Live connection check PASSED 2026-10-07T12:51Z: owner authorization through the registered callback,
provider-reported scopes `account:*`, `profile:*`, `loop:*`, `contact:*` and `template:*`; the individual profile lists
no templates yet, so resource selection (B-DL2) waits on the owner.
Follow-up (owner's 2026-10-07 unblock request): the two S130 stale-value limits the second
release recorded are fixed and queued below as a third release.
Both Dotloop write keys stay closed; no loop, upload, signature send, demo or activation is
authorized.

Previous: batch 005 COMPLETE; its open-item fixes were released by run 61659874-478d-4135-9810-5033b2f732bf
at e8bc616d, exact-main CI 37333580981. Native evidence: docs/evidence/application-usability-batch005.json.

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

1. S130 `a090eee4`, `fef53994`: replacement text that a structure element gives a filled
   value is refused, and an unfilled single AcroForm field holding an earlier value is cleared.

OWNER DIRECTION, 2026-10-06: the Dotloop PDF renewal v1 execution prompt (handoff
dotloop-pdf-renewal-v1-2026-10) authorizes this delivery; on 2026-10-07 the owner asked to
unblock the remaining work. Runs 5b5c850e and 87920129 delivered the bundle; this release closes
the two S130 limits they recorded. Admit only after exact main CI on the release head, fresh
prerequisites and a new run-bound permit. Both Dotloop write keys stay closed; no provider
effect, key or activation is queued. Assurance stays read-only.

## Verified release and recovery

One application build e4e49e3b-6c34-447d-a821-b5f693c75c68 succeeded 2026-10-07T13:10:08.492195Z.
Candidate receipt 3d237be5-466c-44d3-9f52-6d0279892d3e, issued 2026-10-07T13:16:06.983Z;
promotion verified 2026-10-07T13:16:30.578Z. Candidate assurance and reconciliation passed.
Observation passed two full checkpoints in 411502 ms against the required 300,000 ms,
inside the 420,000 ms deadline; all 318 source/projected/rendered records matched,
zero discrepancies/candidate 5xx/unresolved effects. Eleven independent readbacks matched,
completed 2026-10-07T13:23:29Z.
Tag cand-rmuy3zv4l-6f09e67bd41a; fingerprint
sha256:c5f8019f1d9c639ce453ae5fcca338cd01e447457b51cebd28e2b10f6b5ed12a.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=true verified; the reviewed
Dotloop client configuration and Secret Manager binding read back by name.

Actual captured predecessor 63ed175205621b5886a1339c5608428f5f951eb0 /
pmi-kc-app-rmuy0dupk-d13d423ba53c, Sheet=true (S106 connection slice, run 5b5c850e). Run-bound recovery
pmi-kc-app-recovery-8792012923c04420, same fingerprint/configuration and actual true switch;
receipt e7dec18c-d56a-456e-b3e7-46708ddbfd33, reference hash
sha256:967c7519c3662a1e19c9952ced91b22b2561f90b17494ca974f60faf74d8be78. No traffic rollback occurred.
Initial recovery aggregate assurance failed before the application build: the new recovery
instance took 39.1 s for its first Dashboard render against the 30-second route bound, with every
request answered 200. A separate guarded 13-route diagnostic passed with zero errors or mutation
attempts, then the same run resumed and recovery assurance passed at 2026-10-07T13:03:13.726Z.

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

Exact external/human holds remain in docs/open-blockers.md: Dotloop B-DL2–B-DL3, B-S100, B-MNT1,
B-AUTH2, notice-timing basis, optional phone redirect A7 and human observations. They hold only
their named effects. Historical K target/marker effects remain UNVERIFIED; absent logs prove no
outcome. No protected-path authority, identity/IAM/claim/permission, action key, client send,
budget or provider-effect change occurred. Exact preview/confirmation, one-attempt claim,
receipt/readback/correction contracts remain. Raw data, captures, credentials and failures stay
outside Git; original failures and superseded local verification attempts retain actual outcomes.

ALL_GATES_GREEN applies to verified batch 005 engineering and cumulative deployed release only.
No unfinished delivery remains. Documentation updates alone never issue a permit, build or
candidate.
