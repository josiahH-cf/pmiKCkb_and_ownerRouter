<!-- spec-shape: overhaul-v1 -->

# S51 — Production operational readiness

> Status: Active production operating contract with an unreleased assurance remediation. The
> deterministic harness may be proven locally, but neither the remediation nor a release is assured
> until the exact revision completes every managed live gate below.

**Goal.**

Keep Production observable, identity-safe, recoverable, and releaseable, and prove that the exact
served revision works for real Admin and Editor sessions without persisting customer data or
authentication material.

**What it is / how it functions.**

S51 adds a production-assurance lane to the existing zero-traffic candidate and exact-revision
release path. It does not replace the canonical verifier, provider action gates, application error
states, or human confirmation for external effects.

The lane has six ordered parts:

1. Read back the exact candidate commit, immutable Cloud Run revision, zero-traffic state, and
   captured predecessor. Capture one SHA-256 fingerprint over that revision's complete runtime
   configuration, excluding only explicit output-only control-plane fields, and require that exact
   fingerprint in all later candidate and post-promotion reads. Before promotion, prove the exact
   predecessor at 100-percent traffic with its commit, configuration fingerprint, both managed-role
   rollback-phase canaries, and monitoring readiness; persist only those bodyless baseline results.
2. Run the same read-only route manifest with dedicated managed `pmikcmetro.com` Admin and Editor
   browser profiles that are already authenticated on the exact candidate origin. Start each
   persistent browser context offline with Service Workers blocked, install the GET/HEAD-only
   firewall, close restored bootstrap pages, prove no Service Worker survived, and only then bring
   the context online. No form submission, action confirmation, provider write, draft creation, or
   support-report submission is part of a canary.
3. Reconcile fresh complete RentVine, operating-Sheet, current `live-review` resolution, and
   `lease_renewal_progress` reads against an independent source/retention projection and the semantic
   Renewal Desk rendered by that revision. Progress is read directly to derive tracked-incomplete
   retention and expected dispositions; a malformed or duplicate progress identity fails closed.
   Separately validate the app-owned S72 process-status/current-step/current-step-state/waiting
   markers and map them with external source precedence to the exact displayed status and action.
   The exact verified revision supplies the Sheet id, project service account, and managed
   `pmikcmetro.com` delegation subject; ambient local values cannot select a different Sheet or
   identity. Every evaluated and FORMULA values response must echo that exact `spreadsheetId`. Live
   reconciliation refuses emulator routing, key-file credentials, a wrong pinned project/database,
   and any ADC principal outside the managed domain or exact target-project service identities before
   Firestore or provider reads.
4. Read back the exact S51 monitoring resources and require the configured notification channel to
   be enabled and verified. Configuration readback proves configuration, not human receipt of an
   alert.
5. Emit one fresh candidate-assurance receipt only after the exact origin binding, both role
   manifests, source reconciliation, immutable configuration, predecessor identity, and monitoring
   configuration pass. Production promotion accepts no collection of independently invoked commands
   as a substitute for that aggregate receipt. It reserves a new promotion-receipt path before
   traffic changes and durably records the exact promotion coordinates only after 100-percent serving
   readback.
6. After promotion, observe the exact revision over the closed interval from promotion through minute
   five. Run the Admin/Editor canaries and source reconciliation immediately and again at the end,
   then read candidate-revision 5xx and unresolved-live-effect metrics/logs for that exact interval.
   Complete corroborated evidence may pass at minute five. If metric/log ingestion is still missing,
   remain `observing` for at most two additional minutes; missing evidence hard-fails at minute seven.
   The first checkpoint must begin within the fixed immediate grace and the second cannot begin before
   minute five; two back-to-back late checks never count as two checkpoints.

The Admin route manifest covers the Dashboard, My Work, personal Access Center, Connections,
Renewal Desk, one current lease workspace selected from that table, Maintenance, Communications,
Internal Processes, Notifications, the Access Approval Queue, Admin, and People and Access. The
Editor manifest covers the shared routes and proves Admin and People routes remain denied without
enumerating Admin data. The managed actors must already carry the expected roles and required
Renewals/Maintenance scopes; the harness never assigns or requests access.

The two managed sessions are release prerequisites, not credentials the harness creates. Each must
be an explicit profile directory outside the repository, carry exactly the expected current role and
Space access, and prove authentication on the tagged zero-traffic candidate origin. A session that
works only on the canonical production hostname, a copied cookie, a default or guessed browser
profile, Demo auth, password/MFA automation, or one actor standing in for both roles is not candidate
evidence.

The offline-first browser startup is part of the safety boundary rather than a test convenience. The
context launches with network offline, `serviceWorkers: "block"`, extension/sync/background-network
features disabled, and no restored page permitted to run online. The GET/HEAD route interceptor is
installed while offline; any surviving Service Worker or interceptor-installation failure closes the
context without enabling the network. Once online, every other browser method is aborted and counted
as a symbolic mutation attempt.

Each route fails on an app-origin console error, uncaught page exception, first-party failed request,
unexpected first-party HTTP error, rendered route/global error boundary, attempted non-read browser
request, authentication/role mismatch, missing required landmark, or unresolved loading state.
Third-party text and raw browser diagnostics are not allow-listed evidence.

Renewal reconciliation distinguishes `matched`, `mismatch`, `inconclusive_source_changed`, and
`inconclusive_source_unavailable`. It independently reads RentVine lease facts, pairs operating-Sheet
evaluated values with FORMULA links, excludes marked proof rows, and reads exact `live-review`
current-rent decisions plus tracked-incomplete progress without importing the application's desk
mapper, cohort classifier, progress projector, or resolution projector. It
compares that oracle with value-free DOM markers for source currency/read completeness, row and lease
identity, rent verification, resolution-difference state, overall status, blocked state, workspace
eligibility, independent disposition, blocker count, action kind, and destination kind. It also
requires exact link cardinality and exact same-origin workspace/phase/access destinations or the
independently read RentVine source URL.

Overall-status and action parity intentionally have a split trust boundary. External reads establish
lease/source/disposition/retention/rent holds. The rendered S72 process markers establish only the
app-owned process projection used by desk guidance; the runner rejects missing, malformed, or
inconsistent markers and deterministically checks their resulting status/action phase. This does not
claim that S51 independently re-reads actor-scoped Gmail, notice-policy, or packet stores; their
source truth remains covered by S72's focused and browser route gates.

RentVine, Sheet, `live-review` decision, and progress inputs are read before and after the rendered
application projection. Drift is `stable` only when every required source read is complete and both
bounded digests agree. Any partial/unavailable source or application state,
stale/expired/refetching/failed source-currency marker, malformed/duplicate decision or progress
identity, absent Sheet identity echo, or unknown drift is inconclusive and cannot be an empty or
matched success. Source changes between the reads never become a false mismatch. RentVine/Sheet
disagreement is not itself an application defect when the product renders the independently expected
verification/conflict state; a wrong disposition, retention, Ready/Verified/blocked state, missing
causal link, extra or missing destination, omitted/duplicate row, or field mismatch is a definite
application mismatch when sources are complete and stable.

Revision binding is exact and immutable. The runner reads the Cloud Run v2 resource for the explicit
project, region, service, and revision, verifies its full resource name, and recomputes the required
configuration fingerprint before it resolves source coordinates. The three renewal-Sheet settings
must each appear once as plaintext revision configuration, name the exact operating Sheet, a service
account in the target project, and a managed `pmikcmetro.com` subject. These sensitive coordinates
remain process-memory-only and are not serialized into assurance evidence.

The bodyless diagnostic/report artifact uses `pmi-kc-production-assurance.v1`. Its exact allowlist is
build identity, phase, actor role, symbolic route key, status class, elapsed time, boolean landmark,
diagnostic counts, source-state/count results, monitoring counts/state, observation decision/reason,
the count of successful full checkpoints (exactly two for success), and the exact rollback revision
when required. It contains no screenshots, raw URL/query, email,
UID, DOM, console string, stack, cookie, token, mailbox content, provider payload, lease identifier,
tenant/owner/address, rent, date, or Sheet value. Profile directories live outside the repository and
are supplied explicitly at runtime.

Two separate local release-coordination artifacts use strict exact-key schemas: a short-lived,
exclusive candidate-assurance receipt and a promotion receipt. They contain only project/region/
service, candidate and canonical origins, expected commit/revision/configuration fingerprint, exact
predecessor baseline, issued/expiry, a unique one-use receipt id, promotion-start time, promotion-
verification time, and symbolic passed states. They contain no actor
identity, profile path, customer value, browser content, provider payload, secret, or credential;
paths are explicit, outside Git, mode-restricted, create-only, and never silently overwritten.
The candidate receipt is durably claimed exactly once immediately before the first traffic attempt;
an attempted promotion consumes it permanently, including when traffic is restored. The promotion
receipt is written and synchronized only to a non-consumable pending artifact, then atomically
published. No persistence or rollback failure can leave a schema-valid final receipt.

Promotion may proceed only from a fresh exact candidate receipt. Immediately before mutation the
release runner rechecks the currently serving predecessor and the candidate's exact version. It
reserves the promotion receipt path before traffic changes. If the traffic command returns but exact
100-percent readback or durable receipt persistence fails, the same runner restores the captured
predecessor, reads it back at 100 percent, and reports failure; an unverified restoration can never be
reported as a safe rollback. Free-form predecessor and promotion timestamps are not accepted by the
observer, which consumes the exact promotion receipt instead.

The traffic command is an ambiguous external-effect boundary from the instant it is attempted, not
only when its process exits successfully. Any error, timeout, or lost response after invocation
forces authoritative readback and exact-predecessor restoration; the runner never infers that the
provider made no change. Monitoring begins at the recorded pre-invocation promotion start, not the
later serving-readback time, so incidents during cutover are inside the closed interval. A traffic
restoration becomes a recorded recovery only after the receipt-bound predecessor commit,
configuration, 100-percent traffic, both role canaries, and monitoring gate pass again; otherwise it
remains an unresolved production failure and forward recovery requires a new candidate assurance.

Every assurance deadline is a cancellation boundary. One shared deadline signal reaches browser,
HTTP, monitoring, and source reads; browser contexts and Firestore clients close in `finally` paths.
A timeout cannot return while a late-created browser, Firestore client, socket, or non-cancellable
child process continues running or later emits evidence.

During post-promotion observation, any of
the following attributable to the candidate requires restoration of the exact captured predecessor:

- observed revision, 100% traffic, or verified runtime configuration differs from the promoted
  target;
- either role canary fails or produces any classified browser diagnostic;
- complete stable sources produce any definite application reconciliation mismatch;
- candidate-revision 5xx count is greater than zero;
- unresolved-live-effect count is greater than zero; or
- monitoring configuration cannot be verified, or metric/log corroboration remains incomplete at
  the minute-seven ingestion deadline.

A changed or unavailable provider source without a candidate-attributable application failure is a
hold/inconclusive result, not an invented success or automatic claim that rollback fixes the
provider. Before promotion, record a predecessor recovery baseline using the exact predecessor
commit, revision, configuration fingerprint, 100% traffic, both managed-role manifests, and
monitoring configuration. After an exact rollback, repeat that versioned predecessor gate before
recovery is recorded. The rollback-only canary may fall back from the new workspace-eligibility
marker to the predecessor's existing lease link, but candidate and post-promotion canaries may not.
Candidate-era Renewal Desk semantic reconciliation is not retroactively required from an older
predecessor that does not publish those markers. Forward restoration requires a new green release
decision.

Scope includes the assurance contracts, read-only browser/data/monitoring runners, exact decision
state machine, and privacy-safe evidence. It excludes new analytics, synthetic Production data,
provider effects, automatic client communication, credential bootstrapping, role changes, loosening
route guards, modifying action keys, and hidden autonomous rollback. The observation runner reports
the exact required predecessor; the existing authorized release mechanism owns the traffic change
and readback.

**Open questions & assumptions.**

No product decision remains open. Exact candidate-origin Admin and Editor managed sessions, current
provider credentials, an exact internal monitoring-channel address, the candidate origin, immutable
configuration fingerprint, and explicit external receipt paths are runtime inputs. Promotion time
and captured predecessor come only from the bound receipts. Their
absence blocks only live assurance and cannot be bypassed with canonical-host-only auth, Demo auth,
fixture data, a personal identity, ambient Sheet coordinates, or a shorter window.

**Cross-product impacts.**

Cloud Run release evidence, Firebase sessions, all authenticated staff surfaces, RentVine and the
operating renewal Sheet, Cloud Monitoring/Logging, incident response, S52 budget alerts, and the
S54 verification inventory. It changes no product route, stored customer record, provider contract,
role, Space grant, action key, or client-send boundary.

**Adversarial acceptance checks.**

- **AC-S51-1** — A candidate receives zero traffic until exact commit/revision and full immutable
  configuration fingerprint readback pass; a missing, malformed, stale, or changed fingerprint
  refuses before source reconciliation.
- **AC-S51-2** — Promotion targets one exact revision and captures one distinct exact predecessor
  before traffic changes.
- **AC-S51-3** — Both managed-role manifests pass against the exact candidate origin and promoted
  revision; an absent/wrong role, scope, route landmark, Admin denial, canonical-host-only session, or
  reused/guessed profile fails closed.
- **AC-S51-4** — The managed context stays offline until Service Workers are blocked and absent,
  restored pages are closed, and the GET/HEAD firewall is installed; every other method is aborted
  and records only a symbolic mutation-attempt count.
- **AC-S51-5** — Injected console errors, page exceptions, failed first-party requests, unexpected
  responses, and route/global error boundaries each fail the appropriate route and release decision.
- **AC-S51-6** — A complete stable source snapshot passes only when independent RentVine, revision-
  bound Sheet, `live-review` decision, and tracked-progress projections agree with the DOM source
  markers, row facts, and disposition/retention, and when valid S72 process markers map to the exact
  status/blocked/action phase, resolution state, link cardinality, and destinations with zero missing,
  unexpected, duplicate, field-mismatch, or invalid-destination counts. This is not independent
  corroboration of Gmail/policy/packet content.
- **AC-S51-7** — Before/after source drift, source unavailability, absent/mismatched `spreadsheetId`,
  malformed decisions or progress, and stale/expired/refetching/failed application source state
  produce an inconclusive result and never collapse into zero records, a definite mismatch, or
  success.
- **AC-S51-8** — Evidence validation rejects every unknown field and deterministic privacy tests
  prove forbidden browser, identity, credential, and customer values cannot serialize.
- **AC-S51-9** — Live monitoring readback requires exact managed resources and a verified internal
  channel; an incomplete read is never treated as an empty healthy state.
- **AC-S51-10** — Post-promotion success requires two green role/reconciliation passes, a closed
  300,000 ms observation interval, complete corroborated monitoring, zero candidate 5xx, and zero
  unresolved live effects. Complete evidence may pass at 300,000 ms; with monitoring configuration
  ready, missing metric/log corroboration stays `observing` through 419,999 ms and becomes
  `rollback_required` at 420,000 ms. A missing second successful checkpoint also becomes
  `rollback_required` at 420,000 ms. Unready monitoring configuration fails immediately.
- **AC-S51-11** — Every rollback predicate returns only the exact captured predecessor; missing,
  malformed, equal-to-candidate, or drifted targets refuse.
- **AC-S51-12** — A predecessor baseline and post-rollback recovery check both require the same exact
  predecessor commit/revision/configuration, 100% traffic, both managed-role manifests, and ready
  monitoring. Only `phase=rollback` may use the predecessor-compatible lease-link fallback; it does
  not claim that an older revision implements the candidate's new semantic reconciliation schema.
- **AC-S51-13** — Production promotion refuses a missing, expired, malformed, reused, wrong-origin,
  wrong-commit/revision/configuration, wrong-predecessor, or incomplete candidate receipt and refuses
  a pre-existing promotion-receipt path. After the traffic command returns, any serving-readback or
  receipt-persistence failure restores and verifies the exact predecessor before surfacing failure.
- **AC-S51-14** — Post-promotion observation accepts only the fresh exact promotion receipt; free-form
  predecessor or promotion time is rejected, so the closed interval and rollback target cannot be
  rebound by the caller.
- **AC-S51-15** — Candidate assurance records a green versioned predecessor baseline before it emits
  a receipt. Every rollback repeats that exact commit/revision/configuration/traffic/Admin/Editor/
  monitoring gate; revision-only traffic readback is restoration evidence, not a healthy-recovery
  claim.
- **AC-S51-16** — A traffic command that errors, times out, or loses its response after invocation is
  treated as an attempted effect, consumes its candidate receipt, and drives exact-predecessor
  restoration. The monitoring interval begins at the pre-invocation timestamp and includes every
  cutover request.
- **AC-S51-17** — Checkpoint one starts within the fixed immediate grace and checkpoint two starts at
  or after minute five. A late-start observer or two consecutive checks after minute five cannot
  produce a passed observation.
- **AC-S51-18** — Live reconciliation refuses before source reads when emulator/key-file state,
  project/database drift, or a non-managed ADC principal is present. Deadline tests prove timed-out
  browsers, Firestore clients, HTTP requests, and child work are aborted/closed with no late evidence.

**Forbidden actions / hard gates.**

No to-latest promotion; no personal or synthetic Production identity; no automated password/MFA;
no Demo auth in Production; no production cookie or customer-value artifact; no screenshots or raw
diagnostic capture; no browser POST/PATCH/PUT/DELETE; no provider write or draft; no missing-source
success; no ambient/local Sheet selection; no partial monitoring success; no guessed predecessor; no
independent command transcript in place of the aggregate candidate receipt; no overwriting or
reusing a receipt path or candidate receipt; no inference that a failed traffic command had no
effect; no observation interval beginning after the traffic attempt; no two late checkpoints; no
emulator, key-file, or unverified ADC source read; no uncancelled work after a deadline; no
observation shorter than five minutes; no ingestion wait beyond minute seven; and no claim that
configuration readback proves alert delivery.

**Ordered prompt sequence.**

1. Freeze the route/role manifest, evidence allowlist, reconciliation states, and rollback predicates
   in pure tests.
2. Run focused tests, typecheck, the canonical verifier, core E2E, and fixture-only browser failure
   injection under S54.
3. Resolve two explicit managed profiles that are authenticated on the exact candidate origin and
   verify their current role/Space truth without changing it.
4. Deploy the exact zero-traffic candidate; read back commit/revision/predecessor; capture its full
   immutable configuration fingerprint; and verify the revision-bound Sheet coordinates and managed
   identities without serializing them.
5. Run both offline-first candidate canaries, independent
   RentVine/Sheet/`live-review`/tracked-progress reconciliation, Sheet response-identity checks, and
   monitoring configuration readback. Run the exact predecessor's rollback-phase role/traffic/
   configuration baseline. Hold on any failed or inconclusive mandatory result, and emit one fresh,
   uniquely identified aggregate candidate receipt only after all mandatory results pass.
6. Promote only with an atomic one-use claim on that receipt and a new reserved promotion-receipt
   path. Recheck the predecessor and candidate, record the start time before the traffic attempt, move
   traffic, read back 100 percent, and atomically publish the verified promotion receipt. Treat any
   attempted-command or later failure as ambiguous and compensate to the exact predecessor.
7. Run immediate and end-of-window
   candidate gates and corroborated metric/log reads. Allow only the bounded minute-five-to-minute-
   seven ingestion grace. On a rollback predicate, restore only the captured predecessor through the
   existing release mechanism and repeat its versioned recovery gate. Never reuse the consumed
   candidate receipt for forward recovery.
8. Record only the allowlisted non-secret outcome in current truth documents.

**Deletion/merge recommendation.**

Keep as the sole S51 production-assurance and rollback contract. Retire any older live-auth artifact
instructions that treat screenshots/raw events or merely reaching `/ask` as release proof once the
managed canary has passed its live rollout gate.
