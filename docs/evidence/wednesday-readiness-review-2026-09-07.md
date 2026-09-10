# Wednesday readiness review

Reviewed through: 2026-09-08. **Local implementation checks pass; live release acceptance remains open.**
The owner explicitly directed pushing the reviewed green work and preparing Wednesday's four
deliverables. This report contains non-secret outcomes; customer evidence stays outside Git.

**Meeting source:** User-supplied meeting identity; not Calendar-verified. Wednesday afternoon,
9 September, is owner-supplied. Start time, duration and attendee list are unverified.

## Current release evidence

| Item                   | Verified result                                                                                                                                                                                | Date and limit                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Serving                | `d243911cb20ffb01773072c0e27c723648eeea34` / `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`, 100% traffic                                                                                                 | Cloud Run and public version readback, 2026-09-08                                             |
| Candidate              | `7b3fdadac134550c24b029034753a38f16e4096b` / `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, zero traffic                                                                                                 | Cloud Run and public version readback, 2026-09-08; does not contain this readiness change set |
| Candidate fingerprint  | `sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`                                                                                                                      | Recorded 2026-09-06; any new candidate requires its own fingerprint                           |
| Runtime                | Production + Live, managed runtime identity, eleven Spaces, Sheet switch on, false Demo flags, RentVine/RentCast bindings, RentCast selected with allowance 50, Dotloop client bindings absent | 2026-09-08 readback; latest template is the candidate, not the serving revision               |
| Monitoring and domains | S51 READY: exact managed channel, metric and four policies; nine authorized domains                                                                                                            | 2026-09-08 read-only readback; no cloud configuration changed                                 |
| Managed directory      | Six managed users: three explicit Admin and three default Editor, none disabled                                                                                                                | 2026-09-08 directory read; individual evidence stays private; no claims changed               |
| RentCast               | App-recorded September counter is absent and reads as zero calls                                                                                                                               | 2026-09-08; not independent vendor-account usage verification; no comp request made           |
| Readiness release      | No deployment or promotion of this change set is verified                                                                                                                                      | Git/CI and the watcher checkpoint own the subsequent push and release result                  |

## Closed findings and implementation scope

- **B-GOLD1 — closed by owner review.** The saved historical Sheet row and current RentVine lease
  do not have a verified source association. Live values, formulas, hyperlink metadata and the
  exact lease GET support that limit. The owner approved removing only the unsupported expected
  rent-conflict label. The original capture and worksheet remain private, all source values and the
  other expected label are unchanged, and no assertion or ambiguous-name refusal was weakened.
  Golden harness: 4/4 passed.
- **Native test environment — corrected.** The helper imported .env.local into units, changing
  provider defaults and enabling unmocked dependency reads. It now uses the caller's environment
  like CI. Runtime rehearsal explicitly loads its own configuration. The corrected full suite passes.
- **Watcher monitoring recipient — corrected.** The watcher incorrectly treated the CLI account as
  the alert recipient. It now requires explicit managed monitoring configuration, rejecting missing
  or conflicting values. The ignored local value preserves the existing channel. Two new tests
  failed before correction and passed after; no authentication identity or cloud channel changed.
- **Authentication — implementation and post-reboot proof passed.** Browser callback enrollment bound
  the approved owner ADC at 2026-09-08T12:46:45.730Z. Windows boot at 15:52:10.500Z followed enrollment.
  Paired CLI/ADC refresh and app preflight passed after boot with the exact unchanged binding and
  without login/browser. Identity lookup gets one bounded retry and honest blocked guidance.
  Sixty-one focused auth tests pass. The 24-hour elapsed-session proof is still pending.
- **S106 — implemented, live lifecycle unverified.** Explicit vault/provider assembly, revocation and
  readback, interrupted-refresh quarantine and late cleanup retention preserve connection generations.
  Ambiguous outcomes retain cleanup references and refuse completion.
- **S34 — bounded implementation complete to external inputs.** Exact active S21 publication metadata,
  hash and bytes are checked before an execution claim. Opaque participant references remain separate
  from resolved email addresses. Approved catalog/participant mappings and the public packet workflow
  caller remain open. Both Dotloop keys remain closed; document identity/name is presence-only evidence.
- **S100/S98/S108 — corrections preserved.** Imported existing-work-order links do not mint provider
  creation receipts; the resident-draft key stays closed. Sheet correction wording reflects append-only
  capability. Optional ticket property identity is server-derived; legacy records are not guessed.
- **S110/S111 and guide — corrections preserved.** Three deterministic read intents report bounded
  coverage/source states. Integrated fixture proof derives rent and ambiguous recovery from owners;
  it is not a live model/provider run. Guide controls use semantic locators and conditional contracts.
- **Rehearsal/session and hydration — corrected.** Local Demo sessions retain their server-gated path
  and effect refusal precedes canary evaluation. Production canary restrictions remain. Dashboard
  hydration uses the existing React server/client snapshot contract.

## Falsification and acceptance ownership

The prior fail-first and deliberate break/restore evidence is preserved for refresh claims,
readiness classification, vault cleanup, resource selection, imported-link property binding,
Sheet correction wording, property/effective-date routing, document evidence and projection,
assistant coverage, integrated rent derivation, semantic controls and callback cleanup. Resumed
mutations detected exact observation identity, browser retry pause, late cleanup, artifact bytes,
participant reference, ADC preflight and rehearsal-session regressions. All originals were restored.

Fifteen COMPLETE narrative retirements retain their criteria and implementation/test ownership in
[the facts ledger](../facts.md#retired-suite-contracts): S37, S52, S56, S59, S72, S74, S77, S78,
S80, S81, S83, S84, S85, S86 and S99. The original narratives remain in Git at inherited main
`30d21482e3f0fee5cb516f3f6b83c92b1e1f350a`. Each removal passed immediate traceability and active-path
checks (30 original successful checks). No blocked or unpromoted suite was retired.

## Verification ledger

| Check                                         | Result                                                                                                                                                       | Practical limit                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Corrected full native unit suite              | 6,360 passed, four skipped                                                                                                                                   | Includes the same excluded owner-reviewed captures used by direct execution                                                               |
| Additional watcher regressions                | Two added tests pass; 21 watcher tests pass in total                                                                                                         | Proves recipient separation, missing/conflicting-config refusal and existing recovery contracts in isolation                              |
| Golden harness                                | 4/4 passed                                                                                                                                                   | One owner-approved expected-label correction; source values and assertions unchanged                                                      |
| Format, lint and typecheck                    | Passed                                                                                                                                                       | Existing lint warnings remain; no lint errors                                                                                             |
| Firestore                                     | 168 passed across 32 files                                                                                                                                   | Local emulator; no production write                                                                                                       |
| Production build                              | Passed                                                                                                                                                       | No live-source completion inferred from compilation                                                                                       |
| Policy, document, redaction and budget checks | Passed in the complete canonical verify run                                                                                                                  | The canonical verify script owns the commit gate                                                                                          |
| Core E2E                                      | 31 passed, 18 emulator-dependent skips                                                                                                                       | Same-day explicit external-source refusal; not live-source assurance                                                                      |
| Seven live-source browser smokes              | Two passed; five remain failed/incomplete                                                                                                                    | Maintenance blocker/intake pass; desk, Dashboard, navbar and theme miss unchanged timing limits; full guide misses owner-phase navigation |
| Local authentication                          | Fresh-shell and paired post-reboot READY                                                                                                                     | Twenty-four-hour elapsed proof and managed app browser assurance remain pending                                                           |
| Watcher host                                  | Running with reviewed code/config; green implementation SHA accepted                                                                                         | Isolated prepare complete; deploy in progress for planned pmi-kc-app-rmtt039q1-c1463245a94c; no promotion claimed                         |
| CI and candidate lifecycle                    | Pushed `6e77d18f6d9916ba94078550d4b5ba73751e86c8`; [all five CI jobs passed](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34262698002) | Watcher completed prepare and entered deploy; candidate and promotion are not yet verified                                                |
| Managed-browser receipt and observation       | Pending                                                                                                                                                      | Owner-approved Admin on both origins, Editor not_run, fresh receipt, exact promotion and 300,000 ms observation required                  |
| Staff walkthrough and live completion         | Pending selected October lease and inputs                                                                                                                    | A runner/fixture never substitutes for human acceptance                                                                                   |

The first canonical verify stopped on the captured expectation and local-environment contamination.
After those corrections, full units, Firestore and build passed. The complete canonical verify run subsequently passed, including current policy/document gates.
The final documentation refresh is checked separately before the diff audit and push. A missing result is never a pass.

The subsequent live-source rehearsal reproduced the Node 24 ArrayBuffer response error. On the
native built app with Node 22, the desk loaded but base-rent sorting exceeded 20 seconds (23.4
seconds); Dashboard navigation exceeded 60 seconds. Maintenance blocker and intake checks passed.
The guide incorrectly sought the native date-filter summary as a button; its exact summary locator
now passes a Chromium positive/negative proof. No application effect, deadline or assertion was
weakened. Full guide and remaining browser outcomes are recorded separately. B-REH1 owns the live
timing hold; it does not invalidate the passing canonical unit/emulator/build results.

## Remaining work and Wednesday package

The four current deliverables are in [the implementation plan](../plan.md):
[walkthrough](../products/renewal-client-walkthrough-2026-09-09.md),
[agenda](../products/client-call-agenda-2026-09-09.md),
[decisions and inputs](../products/wednesday-decisions-and-inputs-2026-09-09.md), and
[written delivery readout](../products/wednesday-delivery-readout-2026-09-09.md).
The existing deck/PDF need a content refresh before presentation.

The client inputs remain approved seven-family forms and mappings (B-DL3), one work order with
resident chat and verified email (B-S100), and exact property preapproval evidence (B-MNT1).
Dotloop credentials (B-DL1) are external; connection/resources (B-DL2) are owner actions.
S36 waits on S100. Fixed-row Sheet correction, resident-draft activation, live Dotloop/signatures,
S95's minimal Dashboard and complete live lease evidence are not ready.

Select the October lease privately, confirm staff access and label the exact demonstration origin.
Use reading and preparation steps if release assurance is incomplete. No demonstration creates a
provider transaction, fictional reply, draft recipient or signature. No support follow-up, client
send, new identity, cloud permission or cost change was performed.
