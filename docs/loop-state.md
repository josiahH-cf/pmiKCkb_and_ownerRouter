# Loop state

Last updated: 2026-09-08. Read AGENTS.md, docs/facts.md and docs/open-blockers.md first.

## Objective and release checkpoint

The owner directed pushing all reviewed green work and preparing four Wednesday deliverables.
The one captured-label correction is explicitly owner-approved after private source readback.
The inherited main baseline is 30d21482e3f0fee5cb516f3f6b83c92b1e1f350a; inspect Git for current push state.

- Serving: pmi-kc-app-rmtkmhj1z-8855e4c6dbfb, commit d243911cb20ffb01773072c0e27c723648eeea34, 100%.
- Candidate: pmi-kc-app-rmtq71kjl-bff41bbdb5fa, commit 7b3fdadac134550c24b029034753a38f16e4096b, zero traffic.
- Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- Candidate: https://cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- Candidate fingerprint recorded 2026-09-06:
  sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda.
- 2026-09-08 reads confirm exact versions/traffic, Production + Live, managed runtime, eleven Spaces,
  Sheet switch, false Demo flags, RentVine/RentCast bindings, selection and allowance 50.
  Dotloop client bindings remain absent. Nine authorized domains were reread.
- The candidate carries the completion program, not this readiness change set. No readiness
  deployment or promotion is yet verified; inspect the watcher checkpoint and exact-SHA CI.

## Authentication and watcher

Enrollment: josiah@pmikcmetro.com at 2026-09-08T12:46:45.730Z in the existing WSL store.
After Windows boot at 15:52:10.500Z, CLI/ADC refresh and app preflight passed without login/browser.
The exact ADC file and its local binding stayed unchanged. Subsequent full auth:ensure passed again.
The identity lookup has one bounded retry and accurate blocked guidance; 61 focused auth tests pass.
The required 24-hour elapsed-session proof is pending, earliest 2026-09-09T12:46:45.730Z.
The owner controls session policy. Recovery remains npm run auth:session -- --browser.

The limited PMI KC release watcher task was recovered at 2026-09-08T16:41:36Z after an unexplained
Windows launcher exit left an idle Linux watcher alive. No checkpoint existed during recovery.
Readback confirmed the launcher and one Linux watcher; main 30d2148 was refused as
foundation_not_in_target. Automatic release acceptance is not yet proven.
The watcher now reads MONITORING_OPERATOR_EMAIL from ignored local configuration independently of
the CLI identity. It preserves the existing managed alert recipient and refuses missing/conflicting
configuration. Two new fail-first checks cover this distinction. The idle watcher was restarted with this code/configuration after verifying no release checkpoint;
its task is Running and inherited main remains refused. Never interrupt an in-flight deployment
without its exact checkpoint.

B-AUTH2 still requires existing managed Admin and Editor profiles on both exact origins.
Claim-less managed accounts remain Editor with all Spaces. The receipt recipe is in
docs/environment-handoff.md. Use the new candidate's exact identity/fingerprint if one is deployed.
Promotion, 300,000 ms observation and final readbacks remain separate gates.

## Verification and source review

- B-GOLD1 is CLOSED. Live Sheet values/formulas/link metadata and an exact RentVine lease GET did
  not establish the alleged historical source join. The owner approved removing only that expected
  rent-conflict label. Original capture/worksheet and approval hashes are preserved privately;
  source values, the remaining label, ambiguous-name refusal and all assertions are unchanged.
- Corrected full native units: 6,360 passed, four skipped. Golden harness: 4/4 passed.
  All 21 watcher tests pass in the full suite. 168 Firestore tests and production build pass.
- The native check helper no longer imports .env.local into units; that had changed test defaults
  and enabled unmocked provider reads. CI-style test environment is restored.
- Prior same-day core E2E: 31 passed, 18 emulator-dependent skips under explicit external-source
  refusal. Seven live-source browser smokes still need completion; no live-source pass is claimed.
- Latest directory read: six managed users, three explicit Admin and three default Editor; none
  disabled. Individual role evidence stays private. No roles changed.
- App-recorded September RentCast usage is zero (counter absent); vendor-account usage is not
  independently verified. No comp request was made. A provisional October reading example is selected privately from ten October leases; full workflow readiness is unverified.
- S106 revocation/late-refresh quarantine and S34 exact S21 publication bytes have fail-first and
  deliberate break/restore evidence. Catalog/participant/public packet mappings remain open.
- S100/S98/S108/S110/S111 corrections and fifteen COMPLETE narrative retirements are in the slice.
  The check ledger is docs/evidence/wednesday-readiness-review-2026-09-07.md.

## Next actions and Wednesday package

1. Finish current policy/document gates; audit the whole diff, commit/push green main and inspect CI.
2. The watcher has the reviewed config; verify exact candidate lifecycle and browser gates.
3. Preserve post-reboot proof and complete the elapsed-session check at its actual earliest time.
4. Verify October lease selection and run the live-source browser rehearsal privately.
5. Use docs/plan.md's four deliverables: walkthrough, agenda, decisions/inputs and delivery readout.
   Confirm meeting time/participants and assign owners/dates during the Wednesday session.
6. Follow B-DL1/B-DL2/B-DL3, B-S100 and B-MNT1 from docs/open-blockers.md. S36 still waits on S100.

The earlier deck/PDF need a content refresh; the written readout is current. Presentation authoring
capability is unavailable in this session. Do not claim a refreshed deck or full live completion.
Exclude .claude/settings.local.json, output/, golden-data/, ignored user specifications and scratch,
credentials, provider bodies and customer values from Git/build uploads. Preserve every action and cost boundary.
