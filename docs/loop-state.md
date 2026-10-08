# Loop state

Last updated: 2026-10-08 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Fourth release DONE (owner, 2026-10-08: push, merge and deploy everything on main): run e372f7b5-3a1d-4224-945e-148a5f040660
released the release-tooling and audit follow-up at 337ac163c5709381e8db8d2c18810bec357d8a96 / pmi-kc-app-rmuz9g28p-0a2909d490e1, 100% traffic, exact-main CI 37747457191.
NEXT: Dotloop continues at docs/open-blockers.md A1 (B-DL2): a full Dotloop admin must create the Lease
Renewal template and add the integrations login to the office (requested from Dan 2026-10-08),
then the owner selects resources and the runner reads back; B-DL3 packet configuration follows.

COMPLETE: dotloop-pdf-renewal-v1-2026-10, intake 050-054 (S106, S66, S130, S34, S182), under the
owner's 2026-10-06 execution instruction. Finalized spec revisions are committed (`d5478673`);
private reference PDFs stay ignored.
First release: run 5b5c850e-a131-4e37-996a-457f5f9fd62c released the S106 connection slice at
63ed1752, exact-main CI 37610987256.
Second release DONE: run 87920129-23c0-4420-a787-13036029d6f8 released S182, S66, S130 and S34 at
755009bae534cb2699789c1cfd07fa79aad8f94a / pmi-kc-app-rmuy3zv4l-6f09e67bd41a, 100% traffic, exact-main CI 37620419232.
Live connection check PASSED 2026-10-07T12:51Z: owner authorization through the registered callback,
provider-reported scopes `account:*`, `profile:*`, `loop:*`, `contact:*` and `template:*`; the individual profile lists
no templates yet, so resource selection (B-DL2) waits on a full Dotloop admin (F-DOTLOOP-ADMIN-RIGHTS).
Third release DONE (owner's 2026-10-07 unblock request): run 5622decd-0a6d-479a-bb75-545ba4aa0069 released the
S130 stale-value follow-up at 5ee574b2fba81c83fa63086496d7f2ebb299268c / pmi-kc-app-rmuybjtnr-f43dfa3d6d26, 100% traffic, exact-main CI 37650289798.
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

None. OWNER DIRECTION, 2026-10-08: push, merge and deploy everything on main. Run
e372f7b5-3a1d-4224-945e-148a5f040660 delivered S51 (`717eb9ae`, PR #146) and S54 (`b680dd6e`, PR #145;
`ea79bbbf`, PR #147) at 337ac163c5709381e8db8d2c18810bec357d8a96. The exact permit is consumed.
Both Dotloop write keys stay closed; no provider effect, key or activation was queued.
Documentation-only closure does not deploy.

## Verified release and recovery

One application build 6e3cdead-5c8b-4c68-89cd-5d34617d87bb succeeded 2026-10-08T08:25:18.918163Z.
Candidate receipt caaf4096-637a-4534-a998-3eaa567779c2, issued 2026-10-08T08:30:41.068Z;
promotion verified 2026-10-08T08:30:59.978Z. Candidate assurance and reconciliation passed.
Observation passed two full checkpoints in 389677 ms against the required 300,000 ms,
inside the 480,000 ms deadline; all 318 source/projected/rendered records matched,
zero discrepancies/candidate 5xx/unresolved effects. Eleven independent readbacks matched,
completed 2026-10-08T08:37:49Z.
Tag cand-rmuz9g28p-0a2909d490e1; fingerprint
sha256:a52280044bfad3bbf657d03836fedb5c275ec581f6f346bba419d3e341f36960.
Production/Live, managed identity, eleven Spaces, Demo=false, Sheet=true verified; the reviewed
Dotloop client configuration and Secret Manager binding read back by name.

Actual captured predecessor 5ee574b2fba81c83fa63086496d7f2ebb299268c /
pmi-kc-app-rmuybjtnr-f43dfa3d6d26, Sheet=true (S130 stale-value follow-up, run 5622decd). Run-bound recovery
pmi-kc-app-recovery-e372f7b53a1d4224, same fingerprint/configuration and actual true switch;
receipt 8302e68a-646e-4a1b-9abd-5c277e7ed4ad, reference hash
sha256:2110c8a111f007999009daf4891a8c5d22a4a116cd327fca4c3c19e46e25974b. No traffic rollback occurred.

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
