# Renewal training control review

Checked 2026-09-09 against committed implementation 6e77d18 and current public version endpoints.
This is a documentation analysis, not a new authenticated end-to-end browser pass.

## Current release and authentication

- Canonical `/api/version` returns commit d243911cb20ffb01773072c0e27c723648eeea34,
  revision pmi-kc-app-rmtkmhj1z-8855e4c6dbfb.
- New candidate `/api/version` returns commit 6e77d18f6d9916ba94078550d4b5ba73751e86c8,
  revision pmi-kc-app-rmtt039q1-c1463245a94c. Its origin is
  https://cand-rmtt039q1-c1463245a94c---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- The durable watcher checkpoint is in assurance, blocked on authentication_required. Its preceding
  log records smoke, fingerprint and domain phases, then managed_browser_enrollment_required.
  Fingerprint: sha256:8810a5f8d31b6b1bb698f0e3cad9a361556c5abd4a57ae00b673dd4e099e016f.
- Full WSL auth:ensure at approximately 07:29 UTC reports CLI and ADC blocked with reauth.
  GitHub is ready. The successful September 8 reboot proof is historical evidence; current unattended
  readiness is NOT READY. The 24-hour proof was not reached and is not passed. No login loop ran.
- Cloud configuration and numeric traffic were not reread after authentication failed. The public
  endpoint still serves the predecessor. Promotion and observation are not claimed.

## Corrections to the training instructions

| Finding                                                                                                                                                                                                           | Source                                                                                                                             | Documentation result                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desk opens a workspace through the property address, not an invented Next button.                                                                                                                                 | components/lease-renewal/RenewalDeskTable.tsx; components/lease-renewal/RenewalWorkspace.tsx                                       | Named the actual address link and six phase links; corrected Signatures/Compliance query IDs to signatures-follow-up/compliance-close; made month and lease selectable. |
| The owner email disclosure is wording only; the actual owner-channel composer is under Tenant decision.                                                                                                           | components/lease-renewal/RenewalWorkspace.tsx; components/lease-renewal/RenewalNoticeDraftComposer.tsx                             | Explained Owner notice and the return to Owner decision.                                                                                                                |
| Record owner response depends on owner-message-sent evidence. The current follow-up overlay only derives tenant-contact-state and timing policy; the progress route exposes no general evidence ingestion action. | lib/lease-renewal/live-desk.ts; lib/lease-renewal/renewal-progress.ts; app/api/lease-renewal/renewal-progress/route.ts             | Named the unverified new-lease handoff as B-FLOW1; thread linking is not a workaround. No claim about existing private lease evidence.                                  |
| Tenant response has its own actual control and branching outcomes.                                                                                                                                                | components/lease-renewal/RenewalTenantOutcomeControl.tsx; lib/lease-renewal/renewal-process.ts                                     | Added Record tenant outcome, prerequisites, acceptance, waiting, counteroffer, decline and verification paths.                                                          |
| Packet evaluation persists app state and exposes no complete normal preview/confirm/execute control path.                                                                                                         | components/lease-renewal/PacketTruthPanel.tsx; components/lease-renewal/RenewalWorkspace.tsx                                       | Distinguished evaluation from reading, document creation and actual signatures.                                                                                         |
| RenewalCompleteButton exists as a legacy component but is not mounted by the current workspace or any app page. Compliance close describes provider evidence instead.                                             | components/lease-renewal/RenewalProgressControls.tsx; components/lease-renewal/RenewalWorkspace.tsx; repository-wide symbol search | Removed the fictional live completion click. Legacy component assertions are retained; the guide control table no longer presents it as reachable.                      |

## B-FLOW1: missing normal workflow handoffs

This internal implementation hold covers the sent owner-message evidence to owner response path,
the normal packet preview/confirmation path, and provider/signature/compliance evidence to verified
completion. Existing models, guarded routes and isolated components do not prove a first-time
operator can traverse those seams through mounted controls. Do not expose a general evidence-writing
escape hatch or restore the legacy completion button as a substitute for authenticated evidence.

Close this hold only when the normal user journey binds each exact current message, packet and
signed artifact to its lease, renders its next supported control, and is verified with unchanged
assertions and a real authorized workflow. Waiting, revised terms, non-renewal, stale evidence and
uncertain effects must remain explicit. Dotloop credentials/forms and B-REH1 remain separate gates.

## What this task did and did not verify

The four meeting documents are lease-agnostic, use actual control labels, distinguish current
availability from the full process, and give a consistent Go/Do/Check/If stuck/Next pattern.
The training diagram and PDF are schematic documentation, not screenshots of an authenticated app.
Customer identifiers, rents, contacts, documents, screenshots and raw provider data are absent.

The final training PDF has eight pages; the meeting brief has four. Every page was rendered and
visually reviewed, with another render of pages affected by final wording changes. Text readback
confirmed visible fill-in fields, dates and substantive content. The reviewed client-safe PDFs
are committed beside their Markdown sources; the reproducible generator writes to output/pdf.
The 16 focused documentation/control tests and all seven documentation/policy gates passed.
Full native bash scripts/verify.sh also passed: formatting, lint, types, the unit and Firestore
suites, policy/redaction/budget checks and production build. Final prose/export additions receive
the focused document checks after that run. No application behavior or test assertion was changed.

No provider transaction, draft, send, claim/IAM change, credential replacement or release promotion
was performed for this documentation task. Local source inspection cannot close B-REH1. A new
operator's completed live journey and measured throughput remain required acceptance evidence.
