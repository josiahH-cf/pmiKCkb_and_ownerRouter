# Loop state

Last updated: 2026-09-09. Read AGENTS.md, docs/facts.md and docs/open-blockers.md first.

## Current objective

The owner asked for a very simple lease-agnostic training guide, visual workflow, agenda,
blocker communication and delivery readout. The four documents have been rewritten from current
code and public version readback. No new provider transaction or completed renewal is claimed.

## Release checkpoint

- Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- Public version: d243911cb20ffb01773072c0e27c723648eeea34 /
  pmi-kc-app-rmtkmhj1z-8855e4c6dbfb, reread 2026-09-09.
- Candidate: https://cand-rmtt039q1-c1463245a94c---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- Public version: 6e77d18f6d9916ba94078550d4b5ba73751e86c8 /
  pmi-kc-app-rmtt039q1-c1463245a94c, reread 2026-09-09.
- Watcher fingerprint:
  sha256:8810a5f8d31b6b1bb698f0e3cad9a361556c5abd4a57ae00b673dd4e099e016f.
- Watcher checkpoint: assurance, inFlight assurance, blocked authentication_required.
  Preceding log reports smoke, fingerprint, domains and managed_browser_enrollment_required.
- Predecessor is the canonical revision above. Promotion/observation remain unverified.
  Last direct numeric traffic/config read was September 8; no fresh authenticated read is claimed.
- Implementation CI 34262698002 and docs CI 34263680762 passed all five jobs.
  Documentation changes do not deploy.

## Current authentication

Enrollment at 2026-09-08T12:46:45.730Z used only josiah@pmikcmetro.com and its bound WSL store.
Fresh-shell and paired post-reboot CLI/ADC/app probes passed September 8 with unchanged enrollment.
On September 9 around 07:29 UTC, full auth:ensure reported BOTH CLI and ADC blocked with reauth.
GitHub remains ready. Current unattended authentication is NOT READY.
The original 24-hour threshold was 12:46:45.730Z September 9; it was not reached or passed.
A new enrollment would restart its elapsed proof; never reuse the old timestamp for that proof.
The owner controls session policy. Recovery: npm run auth:session -- --browser.
No repeated login loop, credential substitution, IAM or claim change is authorized.
Existing managed Admin/Editor profiles still need both exact origins and a bound assurance receipt.
Do not interrupt or restart the watcher during its persisted phase merely to retry authentication.

## Training findings and implementation holds

B-FLOW1 now names missing normal handoffs:

- owner-message-sent evidence to the conditional Record owner response form;
- mounted normal packet preview/confirm path;
- verified provider/signature/compliance evidence to completion.
  Thread linking derives contact evidence, not owner-message-sent. No general evidence-injection
  UI or route is established. The legacy RenewalCompleteButton is not mounted by the workspace.
  The guide now names actual tenant outcome controls, correct phase IDs, optional source changes,
  and the packet evaluation's app-state effect. It does not promise a complete live click path.

B-REH1: two of seven previous live-source browser smokes passed. Desk, Dashboard, navbar, theme
and full guide failures remain. Documentation corrections do not close this hold.
B-DL1/B-DL2/B-DL3, B-S100 and B-MNT1 retain their exact provider/owner inputs. S36 waits for S100.
B-GOLD1 stays CLOSED with the owner's exact label correction; source values, original capture
and every assertion remain unchanged. Prior verification: 6,360 unit passed / four skipped,
168 Firestore tests, build and 21 watcher tests passed.

## Next work

1. The eight-page training PDF and four-page meeting PDF are reviewed; full native verification
   and focused documentation checks passed. Inspect Git/CI for the documentation push; it does not deploy.
2. Owner recovery unblocks authentication-dependent release work; complete actual elapsed proof,
   managed browser receipt, promotion and 300,000 ms observation only at their gates.
3. Implement B-FLOW1 under the existing evidence contracts; resolve B-REH1 on the intended origin.
4. Use the four documents in docs/plan.md for Wednesday. Assign people and dates during the call.
5. Verify completion and throughput with new operators on applicable real cases; no invented proof.

Maintainer evidence: docs/evidence/renewal-training-control-review-2026-09-09.md.
PDF source generator: docs/products/build-renewal-handouts.py; local outputs are in output/pdf.
All customer values, screenshots, raw evidence, credentials and private policy inputs stay out of Git.
