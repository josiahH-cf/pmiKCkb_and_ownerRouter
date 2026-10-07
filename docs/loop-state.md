# Loop state

Last updated: 2026-10-07 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

IN PROGRESS: dotloop-pdf-renewal-v1-2026-10, intake 050-054 (S106, S66, S130, S34, S182), under the
owner's 2026-10-06 execution instruction: implementation, verification, mainline delivery and
release through the existing process, plus the bounded company connection, callback and scope
check. Finalized spec revisions are committed (`d5478673`); private reference PDFs stay ignored.
First release DONE: run 5b5c850e-a131-4e37-996a-457f5f9fd62c released the S106 connection slice at
63ed175205621b5886a1339c5608428f5f951eb0 / pmi-kc-app-rmuy0dupk-d13d423ba53c, 100% traffic, exact-main CI 37610987256.
Live connection check: waiting on the owner's company Dotloop authorization (Connections, Connect
with Dotloop); no connection or OAuth state existed after the release.
Next: the second release (S182 access/AI boundaries, S66 terms, S130 PDF filling, S34 handoff).
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

None. OWNER DIRECTION, 2026-10-06: the Dotloop PDF renewal v1 execution prompt (handoff
dotloop-pdf-renewal-v1-2026-10) authorized this delivery. Run 5b5c850e-a131-4e37-996a-457f5f9fd62c delivered the S106
connection slice (`cca7aa14`, `bf448460`) at 63ed175205621b5886a1339c5608428f5f951eb0; code slice
a297f90635bbbe71060830b7fbecf596d91d0a49 is its ancestor. The exact permit is consumed. Both Dotloop write keys
stay closed; no provider effect, key or activation was queued. The second release's items are
queued with their code, not here. Documentation-only closure does not deploy.
Run 01efe066 first carried the slice and rolled back verified when the Admin assurance
session expired inside its final observation checkpoint (zero candidate 5xx); its checkpoint and
permit are archived as superseded.

## Verified release and recovery

One application build 215da673-0c95-4557-b786-02113d474d00 succeeded 2026-10-07T11:28:27.517435Z.
Candidate receipt 7ecfea37-4060-4bed-93e1-1dc75c4ac897, issued 2026-10-07T11:34:09.211Z;
promotion verified 2026-10-07T11:34:34.159Z. Candidate assurance and reconciliation passed.
Observation passed two full checkpoints in 396797 ms against the required 300,000 ms,
inside the 420,000 ms deadline; all 318 source/projected/rendered records matched,
zero discrepancies/candidate 5xx/unresolved effects. Eleven independent readbacks matched,
completed 2026-10-07T11:42:44Z.
Tag cand-rmuy0dupk-d13d423ba53c; fingerprint
sha256:87ad565a894d9e08d4a58c812c6fdd14736d2bc821093c69987c048b998f507b.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=true verified; the reviewed
Dotloop client configuration and Secret Manager binding read back by name.

Actual captured predecessor e8bc616d144c6600da8394313153e1a0c75659da /
pmi-kc-app-recovery-01efe06679764647, Sheet=true (open-item fixes, run 61659874, serving from run 01efe066's
recovery clone). Run-bound recovery
pmi-kc-app-recovery-5b5c850ea1314e37, same fingerprint/configuration and actual true switch;
receipt cac7db10-f3fc-43d3-8232-a260ed7a09b2, reference hash
sha256:f1fa1087f40d307e81e5e223829daa5796009456ded72981773c4f21ba0f42c0. No traffic rollback occurred.
Initial recovery aggregate assurance failed before the application build: the new recovery
instance took 39.7 s for its first Dashboard render against the 30-second route bound, with every
request answered 200. A separate guarded 13-route diagnostic passed with zero errors or mutation
attempts, then the same run resumed and recovery assurance passed at 2026-10-07T11:22:33.238Z.

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
