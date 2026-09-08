# PMI KC current status

Last updated: 2026-09-08.

## Serving and candidate

Verified CLI readback and public version endpoints reconfirmed these identities today:

- Serving: `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`, commit `d243911cb20ffb01773072c0e27c723648eeea34`, 100% traffic.
- Candidate: `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, commit `7b3fdadac134550c24b029034753a38f16e4096b`, zero traffic.
- Both revisions remain Production + Live under `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`.
- Canonical origin: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`.
- Candidate fingerprint recorded 2026-09-06: `sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`.

The same readback verified eleven Spaces, the enabled Sheet switch, false Demo flags, RentVine
and RentCast secret bindings, RentCast selection/allowance 50 and absent Dotloop client bindings.
Nine domains and monitoring READY were reread on 2026-09-08. The app records zero September
RentCast calls; vendor-account usage is not independently verified. The
candidate carries S82/S97/S98, S51/S54 and S102-S111/S34. It is unpromoted; serving still retains
the historical S98 fixed-row path. The readiness changes have no verified deployment or promotion yet; inspect Git/CI for push state.

## Delivery foundation

The approved local S112 revision is in scope. Browser callback enrollment verified ADC as
`josiah@pmikcmetro.com` in the existing WSL store. Fresh-shell and paired post-reboot
`auth:ensure -- --unattended` exited 0 using the unchanged enrollment, without login or browser.
The app's post-reboot `preflight:adc`, provider configuration and GitHub also passed. The owner
controls the Cloud session-policy exception; the required 24-hour elapsed-session proof is pending.
`auth:session -- --browser` supports Google's callback without copying a code. An unavailable Google
identity lookup now gets one bounded retry and retains accurate blocked guidance; 61 focused auth
tests pass. The default manual enrollment mode remains available.

Verification accounts retain their roles while server boundaries refuse business effects;
authentication, logout and genuine reads remain available. Claim-less managed users remain Editor
with all Spaces by owner decision. No account, IAM or claim was changed.

The limited user task `PMI KC release watcher` is running after a supervised restart. Its Windows
launcher had exited while an idle Linux watcher survived; the exact process was stopped without a
release checkpoint and the task restarted. The prior exit remains unexplained. Readback confirms
the launcher and one Linux watcher. Commit `6e77d18f6d9916ba94078550d4b5ba73751e86c8` is pushed to main and
all five jobs in CI run 34262698002 passed. The watcher completed isolated preparation and entered
deploy for planned revision `pmi-kc-app-rmtt039q1-c1463245a94c`; no new deployment is yet verified. Watcher command-path tests cover exact release
identity, uncertain deploy/rollback responses, restart recovery and browser enrollment pauses.
The watcher now reads its monitoring recipient from explicit ignored configuration independently
of local authentication, preserving the existing channel. Twenty-one watcher tests pass.
Promotion still requires the exact assurance receipt and 300,000 ms observation.

## Current readiness work

The unreleased slice adds S106 vault/refresh/readiness and documented provider revocation/readback.
Interrupted refresh can be quarantined; unknown token outcomes retain credentials and block
completion. Late cleanup cannot revive or affect a replacement connection generation.

S34 resolves exact active validated S21 publication bytes before claiming an upload attempt.
Opaque participant references are checked separately from resolved email addresses.
Approved catalog and participant mappings and the public workflow caller remain unavailable.
Provider document identity/name is presence-only evidence; both Dotloop keys stay closed.

The prepared S100 existing-work-order link, S98 append correction wording, S108 property identity,
S110 bounded answers, S111 derived proof and guide corrections are preserved. S109/S110 remain
deterministic and S111 is isolated composition. S95's minimal Dashboard remains specification-only.
Fifteen eligible COMPLETE narrative removals remain prepared, with acceptance owners recorded in
`docs/facts.md#retired-suite-contracts`. No blocked or unpromoted suite is retired.

## Verification and meeting readiness

The corrected full native suite passes 6,360 unit tests with four skipped; all 21 watcher tests pass. B-GOLD1 is closed after live source readback and the owner's explicit
approval to remove one unsupported historical expected label. The original private capture,
source values, remaining label, ambiguous-name refusal and every assertion are preserved.
The native runner no longer imports application provider configuration into the unit environment.
Formatting, lint, typecheck, 168 Firestore tests and the production build pass. Current policy and
document checks are recorded in docs/evidence/wednesday-readiness-review-2026-09-07.md.

Core E2E passed 31 tests with 18 emulator-dependent skips under explicit external-source refusal.
Two live-source smokes pass: maintenance blockers and intake. Desk sort, Dashboard, navbar and
theme miss their unchanged timing limits; the full guide misses owner-phase navigation. Its native
disclosure locator correction passes an exact Chromium proof. B-REH1 remains open. A provisional
October reading example is selected; full workflow evidence and a complete live renewal remain pending. Directory readback found three managed Admin and three default Editor accounts,
none disabled. No account or claim changed.

The owner directed pushing the reviewed green work and preparing the four deliverables in
docs/plan.md: walkthrough, agenda, decisions/inputs and written delivery readout. The existing
deck/PDF need a content refresh. B-AUTH2 still needs the 24-hour auth proof, existing profiles on
both exact origins and complete release assurance. Dotloop credentials/connection/forms, the
resident-chat input and exact property policy remain open in docs/open-blockers.md.

No source/provider/Sheet write, send, identity/claim/IAM mutation or cost change occurred. Exact-key,
role, human preview/confirmation, receipt, readback and correction gates remain in force.
