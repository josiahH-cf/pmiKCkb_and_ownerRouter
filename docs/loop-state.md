# Loop state

Last updated: 2026-10-07 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

IN PROGRESS: dotloop-pdf-renewal-v1-2026-10, intake 050-054 (S106, S66, S130, S34, S182), under the
owner's 2026-10-06 execution instruction: implementation, verification, mainline delivery and
release through the existing process, plus the bounded company connection, callback and scope
check. Finalized spec revisions are committed (`d5478673`); private reference PDFs stay ignored.
First release: the S106 connection slice, so the registered callback can be checked. Next: the
bounded live connection check, then S182 access/AI boundaries, S66 terms, S130 PDF filling and S34
handoff in the second release. Both Dotloop write keys stay closed; no loop, upload, signature
send, demo or activation is authorized.

Previous: batch 005 COMPLETE. Serving e8bc616d144c6600da8394313153e1a0c75659da /
pmi-kc-app-rmuvf58nk-d45b8bc5347d, 100% traffic, run 61659874-478d-4135-9810-5033b2f732bf,
exact-main CI 37333580981 passed. Native evidence: docs/evidence/application-usability-batch005.json.
Since 10:42Z on 2026-10-07 the same code and configuration serve from run 01efe066's run-bound
recovery clone pmi-kc-app-recovery-01efe06679764647 at 100% (verified rollback; see Awaiting release).

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

1. S106 company Dotloop connection repair and the October 6 audit patch: `cca7aa14`, `bf448460`.
   Validated Connect navigation, an actor-bound single-use callback with a safe return, labeled
   generation-bound readiness and the mounted resource picker, a bounded shared transport,
   single-flight refresh, honest quarantined-disconnect receipts, and the S182 removal of Dotloop
   verdicts from AI context.

OWNER DIRECTION, 2026-10-06: the Dotloop PDF renewal v1 execution prompt (handoff
dotloop-pdf-renewal-v1-2026-10) authorizes this delivery. The runtime receives the reviewed Dotloop
configuration staged in both production env files. Admit only after exact main CI on the release
head, fresh prerequisites and a new run-bound permit. Both Dotloop write keys stay closed; no
provider effect, key or activation is queued. Assurance stays read-only; the connection check runs
separately after verified delivery.

Run 01efe066-7976-4647-b26d-da887b7a2df2 first carried this item at `19f343b8` and rolled back
verified, with production served throughout. Recovery preparation paused once on the new recovery
instance's cold first Dashboard render (42.3 s against the 30-second bound, every request 200); two
guarded 13-route diagnostics passed and the same run resumed. The build, candidate smoke,
assurance and promotion passed and the immediate observation checkpoint passed. Inside the final
checkpoint, at 10:41:37Z, the Admin assurance profile's eight-hour app session for the canonical
origin expired (redirects to sign-in, then auth_mismatch on four routes, and nothing rendered for
reconciliation), so the observer returned rollback_required at 10:42:17Z. The candidate served zero
5xx. Traffic moved to the run-bound recovery target, whose first verification failed on the same
expired session; an unattended
`auth:ensure` re-signed the profile at 10:45Z, a read-only rollback canary passed 13 routes, and
the same-run resume recorded ROLLED_BACK_VERIFIED at 10:47:32Z. `auth:ensure` had accepted the
still-valid session before admission, so the replacement run starts with the session's remaining
lifetime checked. Its checkpoint and permit are archived as superseded by this record's head, which
carries one replacement run of the same code.

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
