# PMI KC current status

Last updated: 2026-08-29.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtew9a2z-46a2353b6491`, 100% traffic
- Serving commit: `64031f8ee028f09930660060c8f5f627ca5ccde1`
- Descriptor: Production + Live; 11 Spaces; managed runtime identity
- Operating renewal Sheet: read source, write switch off
- Rehearsal Sheet: not configured
- RentVine renewal write: closed and live-unproven
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

S77 and S59 are deployed. S59 passed two canonical local runs and aggregate CI run `33276113459`;
its zero-traffic candidate passed exact identity, bounded-route smoke, and configuration readback
before promotion. The promoted revision was read back at 100% with every runtime invariant preserved.

## Deployed renewal stabilization slice

- S77 now has one strict request/outcome contract used by the browser, route, and service. Preview
  omits confirmation; create carries the exact execution id and preview hash; boolean confirmation,
  invalid/non-finite/non-positive money, and inverted ranges fail closed.
- Preview readiness is bound to every operator-controlled input. A changed offer/channel or changed
  server fact cannot reuse the reviewed execution.
- A timeout/invalid create response retains the exact attempt, disables retry-as-new, and offers only
  read-only RFC Message-ID reconciliation with created/not-found/needs-review outcomes.
- The focused S77 component, contract, route, service, ledger, and send-boundary checks plus TypeScript
  are green. The canonical gate passed 524 unit files with one intentional file skip (4,762 passing
  tests and four skips), 115 Firestore tests, every policy gate, and the 104-route build. Exact
  candidate and stable production readback are green.
- S59 derives the RentCast query server-side from one current lease identity, preserves measured
  RentVine `unit`/`property` facts, and sends only a complete address plus supported bed/bath/positive-
  integer `unit.size` attributes. Property type remains explicitly omitted rather than guessed.
- The S59 cache identity covers address, all unit filters, radius, requested count, subject lookup,
  and provider version. The operator sees source paths/omissions, contractual base rent, returned
  subject/comparable evidence, retrieval/cache/quota state, provider order, and typed refusals; none
  can populate offered rent.
- S59's focused set passed 117 tests and one controlled redacted live parity read returned a usable
  result with one billed call and zero writes. The canonical gate passed 526 unit files with one
  intentional skip (4,783 passing tests and four skips), 115 Firestore tests, every policy gate, and
  the 104-page build. Exact candidate and stable production readback are green.

## S80 ship candidate (not yet production)

- One explicit 16-row role/Space/effect matrix now projects all 10 renewal pages, 19 exported API
  methods, and eight rendered controls. A filesystem-backed inventory fails on an unclassified or
  mismatched future surface.
- Renewals-space Editors can enter the canonical desk/workspace and use ordinary app-owned progress,
  owner-direction, reference-comp, and exact unsent-draft flows. Approver reconciliation and Admin
  pricing/source approvals and configuration retain their stronger route and repository checks.
- The operator UI and direct API refusals explain missing authority and the safe next action. Roles
  never imply an exact key; action closure, suspension, quota, and confirmation are checked
  independently before provider construction.
- RentCast and unsent renewal-draft keys remain open. Screenshot storage, RentVine and operating-Sheet
  writes, and renewal/generic sends remain closed. No protected auth, Registry, action-gate, Rules, or
  budget path changed, and S64 remains absent.
- The final canonical run passed 528 unit files with one intentional file skip (4,795 passing tests
  and four skips), all 115 Firestore tests, every policy/static gate, the production-only
  zero-vulnerability audit, and the 104-page build. Exact commit, CI, candidate, promotion, and stable
  production readback remain pending.

## Verified product state in production

- Complete RentVine and operating-Sheet reads feed renewal reconciliation and Live workspaces.
- RentCast is open for allowance-capped reference reads with deployed server-derived query/evidence
  provenance; provider output cannot set offered rent.
- Renewal Gmail creation is governed, exact-ledger-backed, and unsent-draft-only. The browser,
  route, and service now share exact preview/confirm/reconcile shapes.
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
- S72 must carry the deployed contractual-base-rent/reference-evidence contract through its six-step
  process; recurring charges remain separate.
- The S80 ship candidate implements Editor ordinary app work and exact-confirmed unsent drafts while
  preserving stronger pricing, reconciliation, Admin configuration, exact-action, and source-write
  boundaries; production remains on S59 until the release proof completes.
- Optional AI assistance may tailor approved phrasing only; server facts, recipients, values, dates,
  terms, mandatory copy, evidence, and channel status stay locked.
- The comp screenshot target is one exact receipted Gmail attachment, not a text reference or inline
  image; the separate Drive action remains closed until independently authorized.
- S81 is a narrow task-oriented navigation/readiness change and cannot merge permissions, stores, or
  Admin/Connections authority.
- S77 and S59 are complete and deployed; S80 implementation is canonical-green with release pending;
  S72/S74/S75/S78/S79/S81/S63 and the separately gated S30 effect remain in the ordered bundle.
- S77–S81 and amended S30/S59/S63/S72/S74/S75 are registered as standalone architecture + behavior +
  human-litmus contracts with authority/evidence maps, requirement traceability, independent delivery,
  verification, and terminal-state rules. Registration alone is not implementation or activation
  evidence; S80's separate candidate evidence is listed above.

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
