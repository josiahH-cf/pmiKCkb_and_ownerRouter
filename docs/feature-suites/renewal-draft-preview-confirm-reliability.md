<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S77 — Renewal draft preview-confirm reliability

> Status: Active; the live UI/API confirmation contract is internally inconsistent, so the current
> composer cannot complete the already-authorized unsent-draft lifecycle reliably.

**Goal.**

Let an authorized renewal operator enter valid currency values, preview one exact owner or tenant
message, and create exactly one matching unsent Gmail draft, with deterministic recovery when
Gmail's result is uncertain.

**Current state / intended end state.**

The component posts `confirm:false` for preview and `confirm:true` for creation. The route accepts no
confirmation for preview and requires `{ executionId, previewHash }` for creation; the service and
execution ledger already enforce the exact-object contract. Component and route tests pass in
isolation because no check crosses that boundary. Currency controls already parse display strings to
numbers, but the same missing cross-layer check does not prove those numeric fields and confirmation
retain their distinct types. The intended state has one shared request/outcome contract, typed
positive-money validation, input-bound preview state, exact confirmation, one-attempt execution, and
visible reconciliation.

**Actors and entry conditions.**

An Editor, Approver, or Admin with Renewals Space access starts from one current Live lease. The live
RentVine snapshot, authoritative recipient, required offer inputs, Production+Live descriptor,
runtime suspension state, and `gmail.renewal_notice.draft_create` key must all permit the action.
Expired/ambiguous lease truth, an unverified recipient, a closed/suspended action, or a missing
approved template blocks before Gmail construction.

**What it is / how it functions.**

Preview omits `confirm` and returns the server-built recipient, subject, body, `executionId`, and
`previewHash`. The client retains that exact result. Create sends the unchanged offer plus the exact
confirmation object. Any bound-input edit, channel change, server-side fact change, template-version
change, attachment change, or expired snapshot invalidates confirmation and requires a new preview.
An uncertain one-attempt result becomes `needs_reconciliation`; checking that execution reads by its
exact RFC Message-ID and never drafts again.

**In scope / out of scope.**

In scope: shared request/outcome types, composer state, preview invalidation, exact-confirm creation,
blocked/error copy, one-attempt reconciliation UI, route/component integration tests, and removal of
stale boolean-confirm comments/tests. Out of scope: message wording (S74), screenshot MIME delivery
(S79), direct sending, RentVine/Sheet writes, or changing the open action key.

**Open questions & assumptions.**

No product decision blocks this repair. Copy inputs and screenshot availability may block a
particular channel, but the lifecycle must work for every otherwise-ready payload.

**Cross-product impacts.**

Renewal workspace/notices, the S20 external-execution ledger, Gmail runtime draft provider,
governed artifacts, progress stamping, error presentation, and the renewal send-boundary scan.

**Authority and evidence map.**

| Input                                                                                                                                | Classification                | Use and limitation                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` and `docs/facts.md`                                                                                                      | Authority                     | Renewal draft creation may end only in one unsent Gmail draft under the exact open key; direct application sends remain closed.                                       |
| `RenewalNoticeDraftComposer.tsx`, the renewal-notice-draft route, `renewal-draft-request.ts`, and the draft service/execution ledger | Verified implementation truth | The component emits booleans while the route/service require the execution-id/preview-hash object; this measured mismatch is the defect, not an inferred redesign.    |
| Existing composer, request, route, service, execution, and send-boundary tests                                                       | Verification baseline         | They prove each local layer but currently do not prove the real component payload crosses the route contract.                                                         |
| Stabilization intake and meeting notes                                                                                               | Intent evidence only          | They establish that draft back-and-forth and input handling must be reliable; they do not authorize sending, browser-owned facts, or retries after uncertain effects. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S77-1** — One exported renewal-draft request/outcome contract is consumed by the component,
  route, and service boundary. A deterministic contract test rejects boolean confirmation and proves
  preview omission plus exact-object confirmation while keeping offer currency fields numeric.
- **ARCH-S77-2** — The client state machine carries the preview execution/hash and an input
  fingerprint; a deterministic state test proves every bound mutation removes create readiness.
- **ARCH-S77-3** — Creation and reconciliation share one execution identity and RFC Message-ID. A
  structural send-boundary check continues to prove that renewal modules cannot import or invoke a
  Gmail send operation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S77-1** — Previewing valid tenant and owner positive currency inputs—including formatted and
  decimal input—returns a visible exact preview without calling Gmail; booleans, non-finite values,
  zero/negative values, malformed currency, or blocked inputs explain the refusal.
- **BEH-S77-2** — Confirming the unchanged preview creates one unsent draft. A changed offer, channel,
  recipient/fact snapshot, template, or attachment returns a stale/mismatched refusal and creates
  nothing until re-previewed.
- **BEH-S77-3** — Timeout/uncertain execution disables retry-as-new, exposes “Check exact attempt,”
  and resolves to created/not-found/needs-review without a duplicate draft.

**Human litmus outcome.**

### Preview and create one renewal draft

**If this was built correctly:** A renewal operator previews a message, reviews the recipient and
copy, chooses Create Gmail draft, and finds one matching unsent draft. Editing the offer after preview
forces a fresh review, and an uncertain result offers a check rather than another create attempt.

- Model verdict: PASS - why: the fail-first boolean/object, stale-input, range, and uncertain-attempt
  cases now pass through the shared contract; the focused S77 set, one-attempt ledger/send-boundary
  preservation, 524-file canonical unit gate, 115 Firestore tests, and 104-route build are green.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                     | Architecture outcome       | Behavior outcome         | Human litmus                                                | Deterministic evidence / falsification                                                                                                                             |
| --------------------------------------------------------------- | -------------------------- | ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One real preview/create request contract                        | `ARCH-S77-1`               | `BEH-S77-1`, `BEH-S77-2` | Preview and create one renewal draft                        | Cross-layer test sends the component-produced payload through route parsing; boolean confirmation fails before the repair.                                         |
| Numeric offer fields remain numeric and independently validated | `ARCH-S77-1`, `ARCH-S77-2` | `BEH-S77-1`, `BEH-S77-2` | Enter currency values and review the exact rendered numbers | Boundary tables cover formatted/decimal valid values and boolean, string-at-API, NaN/infinite, zero, negative, and range inversion refusals with zero Gmail calls. |
| Any material input edit invalidates approval                    | `ARCH-S77-2`               | `BEH-S77-2`              | Editing after preview requires review again                 | State-table tests mutate each bound field independently and prove zero Gmail calls until re-preview.                                                               |
| One uncertain attempt is reconciled, never repeated             | `ARCH-S77-3`               | `BEH-S77-3`              | “Check exact attempt” replaces retry-as-new                 | Execution/Message-ID tests cover created, not found, ambiguous, repeated check, and duplicate-confirm paths.                                                       |
| Draft truth never becomes send/contact truth                    | `ARCH-S77-3`               | `BEH-S77-1`, `BEH-S77-2` | Gmail contains one unsent matching draft                    | Send-boundary scan plus receipt assertions prove no send import/call and no “sent” outcome.                                                                        |

**Preservation set.**

Draft service/route ledger tests, live recipient/current-rent refusals, Gmail runtime draft tests,
lease data-currency checks, role/Space checks, the renewal send-boundary scan, and canonical unit/type
gates remain green separately.

**Adversarial acceptance checks.**

- **AC-S77-1** — `ARCH-S77-1` proves the real component payload parses through the shared route
  contract; separate mocks that merely agree with themselves are insufficient.
- **AC-S77-2** — `ARCH-S77-2` and `BEH-S77-2` prove exact preview invalidation and zero Gmail calls on
  every stale-confirmation variant.
- **AC-S77-3** — `ARCH-S77-3` and `BEH-S77-3` prove one-attempt reconciliation and no duplicate draft.
- **AC-S77-4** — Both channels preserve authoritative server-side recipients and facts; the browser
  cannot substitute either.
- **AC-S77-5** — Created means an unsent Gmail draft receipt, never sent/contacted/delivered.
- **AC-S77-6** — `ARCH-S77-1/2` and `BEH-S77-1/2` prove positive currency values survive the real
  component/route/service boundary as numbers, owner range low cannot exceed high, and no boolean or
  invalid numeric value is coerced into an offer or confirmation.

**Forbidden actions / hard gates.**

No Gmail send, boolean confirmation compatibility shim, client-supplied recipient/current-rent,
automatic retry after an uncertain effect, action-key change, or synthetic production draft.

**Dependencies / sequencing.**

Implement independently before S74 or S79 so those suites can bind their template and attachment
inputs to a reliable preview. S74/S79 absence must produce a normal deterministic payload or a clear
blocked state, not prevent S77 tests from completing.

**Standalone delivery contract.**

- **Deliverable now:** shared typed request/outcome contract, input fingerprint/invalidation state,
  exact-confirm UI, one-attempt reconciliation UI, cross-layer tests, and corrected operator copy can
  all reach `ALL_GATES_GREEN` with deterministic Gmail fixtures.
- **Consumes, but does not assume:** S74 template metadata and S79 attachment identity are optional
  hash-bound inputs; absent inputs use the current approved deterministic payload or a named readiness
  refusal without weakening confirmation.
- **Externally blocked effect:** none for implementation. A live Gmail smoke may be `BLOCKED` by
  runtime readiness, but no acceptance check requires creating a production draft to prove the code.
- **Produces for downstream suites:** the stable preview response, exact confirmation object,
  invalidation inputs, receipt outcome, and reconciliation contract consumed by S74 and S79.

**Verification and delivery contract.**

1. Before editing, make the component-to-route contract test fail specifically because creation
   sends a boolean; separately record the current request/service/send-boundary preservation pass.
2. Run `npm run test:direct -- tests/unit/renewal-draft-request.test.ts tests/unit/renewal-notice-draft-route.test.ts tests/unit/renewal-notice-draft-service.test.ts tests/unit/renewal-notice-draft-composer.test.tsx tests/unit/lease-renewal-send-boundary.test.ts` and any new state/cross-layer test.
3. Run `bash scripts/verify.sh`, inspect the exact diff, and audit recipients, customer values,
   Message-IDs, action keys, runtime descriptors, and logs before authorized delivery.
4. Report `ALL_GATES_GREEN` only when architecture, behavior, human-model evidence, and preservation
   gates pass; use `BUDGET_EXHAUSTED` only for an explicit budget, or `BLOCKED` only for a named
   external live-smoke prerequisite after the standalone implementation is green.

**Ordered prompt sequence.**

1. Reproduce the component-to-route boolean/object failure and record the fail-first check.
2. Freeze draft/reconciliation/send-boundary preservation results.
3. Unify the contract, implement invalidation and reconciliation UI, and remove stale comments/tests.
4. Run focused adversarial tests and the canonical gate; ship only through the authorized release
   path.

**Deletion/merge recommendation.**

Remove after the shared contract, exact-confirm UI, reconciliation behavior, and cross-layer tests are
deployed and represented in current product/engineering documentation.
