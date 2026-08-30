# PMI KC current status

Last updated: 2026-08-29.

This is a present snapshot, not a changelog. Historical implementation detail remains in Git.

## Production

- URL: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`
- Service/project/region: `pmi-kc-app` / `pmi-kc-kb-prod` / `us-central1`
- Serving revision: `pmi-kc-app-rmtf9wrzz-4c981bf57679`, 100% traffic
- Serving commit: `1bd2e8b0446e4e11e632563a9515f0fc8343b4d9`
- Descriptor: Production + Live; 11 Spaces; managed runtime identity
- Operating renewal Sheet: read source, write switch off
- Rehearsal Sheet: not configured
- RentVine renewal write: closed and live-unproven
- Direct client sends: closed; governed initiation ends with an unsent Gmail draft

S77, S59, S80, S72, and S75 are deployed. S75 passed the canonical local gate and exact-SHA
aggregate CI run `33291061530`; its zero-traffic candidate passed exact identity, bounded-route
smoke, and configuration readback before promotion. The promoted revision was read back alone at
100% with every runtime invariant preserved and S72 retained as the exact rollback target.

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

## Deployed S80 role/action governance

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
  production readback all passed.

## Verified product state in production

- Complete RentVine and operating-Sheet reads feed renewal reconciliation and Live workspaces.
- RentCast is open for allowance-capped reference reads with deployed server-derived query/evidence
  provenance; provider output cannot set offered rent.
- Renewal Gmail creation is governed, exact-ledger-backed, and unsent-draft-only. The browser,
  route, and service now share exact preview/confirm/reconcile shapes.
- Gmail continuous watch is retired. Manual refresh fetches only an exact linked thread. One shared
  provider-free projection binds lease/thread/message identity, waiting party, last verified contact,
  effective timing policy, due/work state, and deterministic ordering across all renewal surfaces.
  Duplicate/stale refreshes and incomplete thread history fail safely.
- Admin has versioned global/property/lease timing rules with most-specific-wins resolution.
  Unconfirmed policy displays as unset and cannot create a timer, reminder, work, draft, or send;
  client timing values and override-manager authority remain external inputs.
- Renewal screenshot preview/store/receipt/rollback machinery exists behind the closed exact Drive
  key; outgoing renewal Gmail MIME does not yet attach the screenshot.
- Dotloop, LeadSimple, and the preferred RentVine resident channel have complete internal exact-
  lifecycle seams and remain closed until their official external inputs exist.
- The four-lease proof machinery is immutable, read-only against source systems, separates process
  and number criteria, and reports missing evidence honestly. Its current scripts still track/print
  exact case values, so S63 must move those bindings to secure runtime input and redact output before
  the next proof.

## Deployed S72 six-step process

- New renewal work pins immutable `renewal-v1`: six ordered steps with stable operational substeps,
  roles, exact evidence predicates, dependency blockers, alternate exits, and transitive reopening.
- The workspace shows each role, state, blocker, and next safe action. Coarse intent, a draft, a note,
  or a legacy stage cannot forge completion; base rent and recurring charges remain distinct.
- Accepted moves toward documents, counter/change reopens exact owner work, declined requires a
  non-renewal handoff, and waiting/Needs Verification remains incomplete. Missing copy, timing,
  catalog/mapping, or write authority blocks only its dependent substep.
- Historical unversioned records remain `legacy-four-step-v0` compatibility inputs and are not
  silently migrated. Process state cannot send, write, grant an action, or claim provider success.
- Focused checks passed 14 files/115 tests. The canonical gate passed 531 unit files with one
  intentional skip (4,818 tests and four skips), 25 Firestore files/115 tests, every policy/static
  gate, the zero-vulnerability production audit, and the 104-page build. Exact commit/CI,
  candidate/configuration, promotion, and stable readback passed.

## Deployed S75 follow-up truth

- One provider-free projection now drives the desk, workspace, S72 evidence, and attention state from
  exact lease/thread/message identity, waiting party, last verified contact, effective policy, and
  due/work truth.
- Timing resolves deterministically from global to property to lease. Missing or unconfirmed policy
  stays visibly unset and produces no due time, work item, draft, send, or guessed default.
- Current and Needs Verification states distinguish complete from incomplete provider evidence;
  truncated history cannot claim contact. Timestamp and message-id ordering plus a monotonic store
  reject duplicate/stale inputs and allow recovery after a provider 404.
- `renewal_lease` Gmail context is pinned to the read-only mailbox action. Refresh is exact and manual;
  there is no watch, poll, Scheduler, label, reply, draft, or send side effect.
- App-only attention dismiss/reopen is audited. A new effective policy identity reopens the exact
  attention item; anticipation creates owner work only from exact owner-bound due evidence.
- Focused adversarial checks and the final canonical gate are green: 534 unit files passed with one
  intentional skip (4,842 passing tests and four skips), all 115 Firestore tests, every policy/static
  gate, the production-only zero-vulnerability audit, and the 104-page build. Exact commit/CI,
  candidate/configuration, promotion, and stable production readback passed without a client effect.

## Remaining renewal stabilization implementation

- Deployed S80 permits Editor ordinary app work and exact-confirmed unsent drafts while preserving
  stronger pricing, reconciliation, Admin configuration, exact-action, and source-write boundaries.
- Optional AI assistance may tailor approved phrasing only; server facts, recipients, values, dates,
  terms, mandatory copy, evidence, and channel status stay locked.
- The comp screenshot target is one exact receipted Gmail attachment, not a text reference or inline
  image; the separate Drive action remains closed until independently authorized.
- S81 is a narrow task-oriented navigation/readiness change and cannot merge permissions, stores, or
  Admin/Connections authority.
- S77, S59, S80, S72, and S75 are complete and deployed; S78/S74/S79/S81/S63 and the separately gated
  S30 effect remain in the ordered bundle.
- S77–S81 and amended S30/S59/S63/S72/S74/S75 are registered as standalone architecture + behavior +
  human-litmus contracts with authority/evidence maps, requirement traceability, independent delivery,
  verification, and terminal-state rules. Registration alone is not implementation or activation
  evidence; S80's separate deployed evidence is listed above.

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
