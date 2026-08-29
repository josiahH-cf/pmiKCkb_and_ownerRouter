# PMI KC current status

Last updated: 2026-08-29.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtbh280n-61b78ef991cc`, 100% traffic
- Serving commit: `6aea639728efcad70e3e601e7a031c2b35722e08`
- Descriptor: Production + Live; 11 Spaces; managed runtime identity
- Operating renewal Sheet: read source, write switch off
- Rehearsal Sheet: not configured
- RentVine renewal write: closed and live-unproven
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

The closure slice is deployed. The canonical local gate and aggregate CI run `33069769758` are green,
the zero-traffic candidate passed exact identity smoke, and the promoted revision plus rollback/restore
were read back. No new code from the renewal stabilization specifications is deployed.

## Current release candidate

- S77 now has one strict request/outcome contract used by the browser, route, and service. Preview
  omits confirmation; create carries the exact execution id and preview hash; boolean confirmation,
  invalid/non-finite/non-positive money, and inverted ranges fail closed.
- Preview readiness is bound to every operator-controlled input. A changed offer/channel or changed
  server fact cannot reuse the reviewed execution.
- A timeout/invalid create response retains the exact attempt, disables retry-as-new, and offers only
  read-only RFC Message-ID reconciliation with created/not-found/needs-review outcomes.
- The focused S77 component, contract, route, service, ledger, and send-boundary checks plus TypeScript
  are green. The canonical gate passed 524 unit files (4,762 tests), 115 Firestore tests, every policy
  gate, and the 104-route build. Exact zero-traffic release proof remains; none of this candidate is
  production truth yet.

## Verified product state in production

- Complete RentVine and operating-Sheet reads feed renewal reconciliation and Live workspaces.
- RentCast is open for allowance-capped reference reads; provider output cannot set offered rent.
- Renewal Gmail creation is governed, exact-ledger-backed, and unsent-draft-only at the service layer.
  The current browser composer/API confirmation shapes are inconsistent and are active S77 work.
- Gmail continuous watch is retired. Manual refresh fetches only linked threads and derives waiting-on/
  last-contact from provider state; duplicate/out-of-order refreshes are idempotent.
- Admin has versioned global/property/lease timing rules. Unconfirmed policy displays as unset and
  cannot create a timer, reminder, work, draft, or send.
- Renewal screenshot preview/store/receipt/rollback machinery exists behind the closed exact Drive
  key; outgoing renewal Gmail MIME does not yet attach the screenshot.
- Dotloop, LeadSimple, and the preferred RentVine resident channel have complete internal exact-
  lifecycle seams and remain closed until their official external inputs exist.
- The four-lease proof machinery is immutable, read-only against source systems, separates process
  and number criteria, and reports missing evidence honestly. Its current scripts still track/print
  exact case values, so S63 must move those bindings to secure runtime input and redact output before
  the next proof.

## Remaining renewal stabilization implementation

- S72 defines six steps with detailed operational substeps, evidence, alternate exits, and reopening.
- Contractual base rent is the renewal comparison/decision value; recurring charges remain separate.
- RentCast requests a maximum two-mile radius and 15 comparables, retains provider order, applies no
  hidden freshness/selection filter, and remains reference-only.
- Renewals-space Editors may perform ordinary app-owned renewal work and exact-confirm unsent drafts;
  pricing approval, Admin configuration, exact action gates, and source writes retain stronger rules.
- Optional AI assistance may tailor approved phrasing only; server facts, recipients, values, dates,
  terms, mandatory copy, evidence, and channel status stay locked.
- The comp screenshot target is one exact receipted Gmail attachment, not a text reference or inline
  image; the separate Drive action remains closed until independently authorized.
- S81 is a narrow task-oriented navigation/readiness change and cannot merge permissions, stores, or
  Admin/Connections authority.
- S77 implementation is the current unshipped candidate; S59/S72/S74/S75/S78/S79/S80/S81/S63 and the
  separately gated S30 effect remain in the ordered execution bundle.
- S77–S81 and amended S30/S59/S63/S72/S74/S75 are registered as standalone architecture + behavior +
  human-litmus contracts with authority/evidence maps, requirement traceability, independent delivery,
  verification, and terminal-state rules. Their presence is not implementation or activation evidence.

## Remaining blockers

- Client-approved owner/tenant wording, required/forbidden language, and channel-evidence rules.
- Client-confirmed follow-up/timing values and any later RentCast freshness/selection policy.
- Distinct rehearsal Sheet copy and blank proof cell.
- Exact S30 RentVine test lease/owner/field plus a separate protected key review.
- S66 packet catalog and exact Dotloop OAuth/account/template/participant/field/signature/webhook/
  correction mappings.
- Move-out walkthrough, exact wrong-resident lease, other named provider contracts, and real human
  litmus verdicts.

## Locked safety

No autonomous client send, unconfirmed system-of-record write, operating-Sheet proof, test-record
substitution, guessed endpoint/identity/recipient/mapping/customer value, action-gate inference,
personal runtime identity, secret/client evidence in Git, or protected-path push without exact owner
direction.
