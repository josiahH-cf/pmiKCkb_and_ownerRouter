# PMI KC current plan

Updated: 2026-08-30.

## Outcome

Implement the approved renewal stabilization bundle so an authorized Renewals-space operator can
find and prioritize the correct lease, verify base-rent/source/RentCast evidence, follow the
six-step process and its detailed substeps, record human decisions, exact-preview and create one
unsent Gmail draft, track waiting/completion, attach exact comp evidence when separately authorized,
and reach setup answers without weakening any action, send, write, identity, cost, or protected-path
boundary. No live RentVine record, operating Sheet cell, or client-facing message may be changed by
the specification work or by an unconfirmed effect.

## Completed implementation

1. Triaged all three live support reports and added verified managed-user reporter display.
2. Corrected RentVine Registry metadata without changing `production_allowed:false`.
3. Built auditable Admin rehearsal-Sheet configuration and saved-config proof resolution.
4. Built discrepancy dispositions and kept correction execution source-contract closed.
5. Built the immutable four-lease baseline/evidence/report machinery; secure runtime cohort input and
   value-free output remain active S63 work before the next run.
6. Retired Gmail watch infrastructure; built manual refresh, source-backed follow-up truth, and S75
   versioned policy surfaces with unset-safe behavior.
7. Completed the fixed S36 provider lifecycle and bounded S37 operational page builder.
8. Completed dependency-independent Dotloop, LeadSimple, and RentVine resident-channel lifecycles.
9. Applied and behavior-tested the smallest dependency overrides; the production audit is zero.
10. Authored and registered the approved renewal contracts as standalone feature specifications.
    Registration alone is not implementation evidence; S80's separate implementation is recorded in
    item 14, while the other pending suite behavior remains implementation work.
11. Implemented and deployed S77: one strict draft request/outcome contract, numeric/range
    refusals, input-bound preview state, exact-object confirmation, one-attempt transport recovery,
    and read-only exact Message-ID reconciliation. Focused architecture, behavior, service/route,
    composer, ledger, and send-boundary checks are green; the canonical gate passed 524 unit files
    with one intentional file skip, 115 Firestore tests, and the 104-route build. Exact candidate and
    stable release readback passed.
12. Implemented and deployed S59: one server-derived lease-to-RentCast query basis, verified
    `property.stateID`/`unit.size` mapping with explicit property-type omission, full request cache
    identity, provider subject/comparable evidence, query/base-rent/cache/quota UI, typed refusals,
    and persistence round-trip without offer mutation. A controlled live parity read used one billed
    call and made zero writes.
13. Added `.gcloudignore` after adversarial upload-manifest inspection proved local `.claude/` state
    and user-owned `output/` PDFs would otherwise enter Cloud Build; the hardened manifest excludes
    those paths and all local env files.
14. Implemented the S80 role/Space/effect matrix across every renewal page, API method, and rendered
    control. Canonical access now admits Editors to ordinary work while retaining Approver
    reconciliation, Admin pricing/source approvals and configuration, independent exact-action
    readiness, closed source writes, and permanent in-app-send refusal. Focused and canonical gates
    are green; exact CI, candidate/configuration, promotion, and stable production proof also passed.
15. Implemented and deployed S72: immutable `renewal-v1`, legacy compatibility without live
    migration, stable substep/evidence ids, exact evidence projection, deterministic branch/reopening
    rules, base-rent/charge separation, evidence-gated completion, and a six-step workspace panel.
    The expected four fail-first assertions were captured; focused, canonical, exact-SHA CI,
    candidate/configuration, promotion, and stable production gates are green.
16. Implemented and deployed S75: one provider-free, monotonic follow-up projection now binds exact
    lease/thread/message identity, waiting party, last verified contact, most-specific effective
    timing policy, due/work truth, S72 evidence, and attention state across renewal surfaces. Missing
    or unconfirmed policy, incomplete threads, and stale refreshes fail safely; refresh remains exact,
    targeted, and read-only. App-only dismiss/reopen is audited, and a new policy identity reopens the
    item. Client timing values remain an external input rather than a guessed implementation default.
17. Implemented and deployed S78: one canonical role-consistent Live worklist now projects exact
    identity, process, follow-up, conflict, retention, and next-action truth; deterministic URL-backed
    search/filter/sort controls define every missing-value and tie rule; the first-of-month/120-day
    cohort retains tracked incomplete work; attention consumes the same ordered source; and the
    legacy notices route redirects to the canonical desk without a sample-data story.
18. Implemented and deployed S74: separate versioned owner/tenant copy contracts, one server-built
    locked fact/recipient envelope, strict editable regions, deterministic rendering/validation,
    optional constrained assistance, S77-bound template/envelope hashes, and exact channel-evidence
    states. Current copy remains review-only and refuses tailoring/Gmail creation before provider
    construction until client-approved wording and channel rules arrive.
19. Implemented and deployed S79: one current same-Space/lease delivered receipt binds one allowlisted
    image to immutable preview identity, deterministic multipart MIME, exact Gmail raw-draft readback,
    and one-attempt reconciliation. Text-only callers remain compatible; arbitrary Drive refs,
    multiple/inline attachments, sends, and live effects remain unreachable behind the closed key.
20. Implemented and deployed S81: one validated task manifest groups honest Connections status and
    indexes existing Admin controls with stable anchors and capability-matched targets. Read-only
    staff visibility, Admin mutations, closed actions, status-only RentCast verification, direct-route
    guards, active state, focus, keyboard order, and narrow layout remain independently enforced.

## Completed release evidence

1. The last shipped full local gate passed 545 unit files with one intentional skip and 4,983 unit
   tests with four skips; all 115 Firestore tests, policy/static gates, dependency audit, and the
   107-page production build passed.
2. Commit `6aea639728efcad70e3e601e7a031c2b35722e08` was pushed to `main`; aggregate CI run
   `33069769758` passed.
3. Zero-traffic revision `pmi-kc-app-rmtbh280n-61b78ef991cc` passed exact commit/revision smoke, was
   promoted, and was read back at 100% traffic.
4. Traffic was rolled back to version-aware predecessor `pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`,
   smoked, restored to the new revision, and smoked again.
5. S77 commit `2d7903d42dce9dbfad49338b959e467f6c333ccc` was pushed to `main`; zero-traffic revision
   `pmi-kc-app-rmtep3ke9-9d3ecafb0c2e` preserved Production+Live, managed identity, 11 Spaces,
   closed Sheet writeback, allowance, and secret bindings, passed exact candidate smoke, and was
   promoted/read back at 100% traffic. Aggregate CI run `33267458811` passed. Immediate rollback
   target is `pmi-kc-app-rmtbh280n-61b78ef991cc`.
6. S59 implementation commit `c29906b85f2ce3129e35914abecb5bcbf7c2de65` and source-boundary
   commit `64031f8ee028f09930660060c8f5f627ca5ccde1` were pushed to `main`; aggregate CI runs
   `33274833421` and `33276113459` passed. Zero-traffic revision
   `pmi-kc-app-rmtew9a2z-46a2353b6491` preserved Production+Live, managed identity, 11 Spaces,
   closed Sheet writeback, allowance 50, and secret bindings; exact candidate and stable smoke passed
   before/after promotion to 100%. Immediate rollback target is `pmi-kc-app-rmtep3ke9-9d3ecafb0c2e`.
7. S80 commit `d2dfbcc2a865af1f92103083c2a49714c2dc3977` was pushed to `main`; exact-SHA
   aggregate CI run `33280384474` passed. Zero-traffic revision
   `pmi-kc-app-rmtf01asj-4b3665ad072f` preserved Production+Live, managed identity, 11 Spaces,
   closed Sheet writeback, allowance 50, and secret bindings; exact candidate and stable smoke passed
   before/after promotion to 100%. Immediate rollback target is `pmi-kc-app-rmtew9a2z-46a2353b6491`.
8. S72 commit `4131df973ae2593d4f75184513db4366fb56ddae` was pushed to `main`; exact-SHA
   aggregate CI run `33285602786` passed. Zero-traffic revision
   `pmi-kc-app-rmtf4s18h-3813fe5277d5` preserved Production+Live, managed identity, 11 Spaces,
   closed Sheet writeback, allowance 50, and three expected secret references; exact candidate and
   stable canonical-host smoke passed before/after promotion to 100%. Immediate rollback target is
   `pmi-kc-app-rmtf01asj-4b3665ad072f`.
9. S75 commit `1bd2e8b0446e4e11e632563a9515f0fc8343b4d9` was pushed to `main`; exact-SHA
   aggregate CI run `33291061530` passed. Zero-traffic revision
   `pmi-kc-app-rmtf9wrzz-4c981bf57679` preserved Production+Live, managed identity, 11 Spaces,
   closed Sheet writeback, allowance 50, and three expected secret references. Its normalized
   configuration matched the predecessor; exact candidate and stable canonical-host smoke passed
   before/after promotion to 100%. Immediate rollback target is
   `pmi-kc-app-rmtf4s18h-3813fe5277d5`.
10. S78 commit `9912ef2ff27c9a73a37e71f1ad54ef754af5e8d5` was pushed to `main`; exact-SHA
    aggregate CI run `33294476282` passed. Zero-traffic revision
    `pmi-kc-app-rmtfd7hvu-a310a0d0db6b` preserved Production+Live, managed identity, 11 Spaces,
    closed Sheet writeback, allowance 50, and three expected secret references. Its normalized
    configuration matched the predecessor; exact candidate and stable canonical-host smoke passed
    before/after promotion to 100%. Immediate rollback target is
    `pmi-kc-app-rmtf9wrzz-4c981bf57679`.
11. S74 commit `2745cdbbf0a0bf14320a6dde6c63128134f6d807` was pushed to `main`; exact-SHA
    aggregate CI run `33300119902` passed. Zero-traffic revision
    `pmi-kc-app-rmtfk9fln-c9af498cb9c5` preserved Production+Live, managed identity, 11 Spaces,
    closed Sheet writeback, allowance 50, and three expected secret references. Its normalized
    configuration matched the predecessor; exact candidate and stable canonical-host smoke passed
    before/after promotion to 100%. Immediate rollback target is
    `pmi-kc-app-rmtfd7hvu-a310a0d0db6b`.
12. S79 commit `4a05462065bcad6433574cc7d7a6f4801b7311eb` was pushed to `main`; exact-SHA
    aggregate CI run `33307517553` passed. Zero-traffic revision
    `pmi-kc-app-rmtfp5ac4-8824eb39358b` preserved Production+Live, managed identity, 11 Spaces,
    closed Sheet writeback, allowance 50, three expected secret references, and closed/unconfigured
    renewal-comp Drive state. Its normalized configuration matched the predecessor; exact candidate
    and stable root/sign-in/Ask/Admin/version smoke passed before/after promotion to 100%. Immediate
    rollback target is `pmi-kc-app-rmtfk9fln-c9af498cb9c5`.
13. S81 commit `7aa4fd439998c2c1d17d53dbb83eab79273ff0bb` was pushed to `main`; exact-SHA
    aggregate CI run `33310823319` passed. Zero-traffic revision
    `pmi-kc-app-rmtfrv9zf-456d0c8fdc83` preserved Production+Live, managed identity, 11 Spaces,
    closed Sheet writeback, allowance 50, three expected secret references, and closed/unconfigured
    renewal-comp Drive state. After excluding only the expected image and exact commit identity, its
    normalized configuration matched the predecessor; exact candidate and stable root/sign-in/
    Connections/Admin/version smoke passed before/after promotion to 100%. Immediate rollback target
    is `pmi-kc-app-rmtfp5ac4-8824eb39358b`.

## Current closure sequence

The contracts are frozen as follows:

- **S77:** complete and deployed with canonical, exact candidate, configuration, promotion, and
  stable readback proof.
- **S59:** complete and deployed with measured RentVine mapping, server-owned query truth, complete
  cache/evidence provenance, approved two-mile/15-request policy, and base-rent/reference separation.
- **S80:** complete and deployed with canonical, exact-SHA CI, candidate/configuration, promotion,
  stable production, and rollback-target readback proof.
- **S72:** complete and deployed with versioned six-step process, detailed substeps/evidence,
  compatibility, branches/reopening, canonical, exact CI, candidate/configuration, and stable proof.
- **S75:** complete and deployed with one shared exact-identity follow-up projection, unset-safe
  most-specific timing, monotonic manual refresh, S72/attention parity, canonical/CI/candidate/config/
  stable proof, and no client effect. Confirmed timing values remain an external policy input.
- **S78:** complete and deployed with one exact-source canonical worklist, deterministic URL-backed
  search/sort/filter/null/cohort rules, shared attention ordering, role-consistent routing, canonical
  and exact-SHA CI gates, candidate/configuration/promotion/stable proof, and no client effect.
- **S74:** complete and deployed with versioned owner/tenant copy, a locked server envelope,
  constrained editable/AI phrasing, S77 hash binding, exact channel truth, canonical/CI/candidate/
  configuration/stable proof, and review-only refusal until approved wording/evidence arrives.
- **S79:** complete and deployed with receipt-bound download, one-image MIME, exact raw-draft
  readback/reconciliation, canonical/CI/candidate/configuration/stable proof, and a closed Drive key.
- **S81:** complete and deployed with a capability-validated task manifest, grouped honest status,
  stable Admin anchors/back-links, role/direct-route/API preservation, accessibility checks,
  canonical/CI/candidate/configuration/stable proof, and no authority/store/provider merge.
- **S63/S30:** four-lease source-read-only proof with exact app evidence, and separately blocked one-
  record RentVine write proof.

Each suite is independently implementable and owns separate deterministic architecture and behavior
outcomes, one or more plain-language human litmus entries, a preservation gate, refusal/recovery behavior, and
explicit dependencies and non-goals. New obligations fail first against the starting state;
already-correct safety facts stay in preservation rather than being rewritten as feature work.

1. Re-read current authority, facts, live version, working tree, and all registered suite contracts;
   record pre-existing failures and user-owned changes.
2. Preserve the deployed S77 contract as the draft/template/attachment foundation; do not reopen its
   exact-confirm or one-attempt boundaries while implementing downstream suites.
3. Preserve deployed S59 mapping, cache, query/evidence, allowance, and reference-only contracts as
   downstream suites consume them.
4. Preserve deployed S80 role/Space/effect parity and its exact closed-key/send boundaries while
   downstream suites consume the matrix.
5. Preserve deployed S72 and S75 process/follow-up projections and their unset-safe, manual-read-only
   boundaries.
6. Preserve deployed S78's canonical desk, exact identity/query/cohort contract, role routing, and
   shared attention source while downstream suites consume its lease links.
7. Preserve deployed S74's versioned template/fact-lock/channel-state boundary and review-only
   provider refusal while downstream suites bind its exact envelope identity.
8. Preserve deployed S79's receipt/MIME/readback/reconciliation and text-compatibility contracts;
   keep its Drive action closed unless separately authorized.
9. Preserve deployed S81's task manifest, grouped status, anchors, capability parity, and explicit
   status-versus-authority boundary while downstream work links to renewal and Admin surfaces.
10. Remove S63's tracked cohort/operator literals, require secure exact-four runtime bindings, and
    make terminal output value-free before its fresh source-read-only proof after applicable S59/S72 changes;
    keep S30 dry and closed until the exact external designation and protected owner direction exist.
11. For every coherent green code slice, run focused adversarial checks and `bash scripts/verify.sh`,
    audit secrets/PII/gates/config/diff, and use the authorized commit/push and zero-traffic candidate
    smoke path. Do not deploy documentation-only changes.
12. Use the native presentation authoring capability to create an editable 16:9, 8–10 slide customer
    readout from final deployed evidence; export and visually inspect every slide.
13. Run the existing eight-row human litmus and every new named suite-level entry with the owner,
    including S63's separate process and number/read-only entries; record real dated PASS/FAIL
    observations and repair every FAIL.

## Completion rule

`ALL_GATES_GREEN` requires every applicable architecture and behavior outcome, the separate
preservation gate, canonical verification, scope traceability, and model-filled evidence to pass;
human-verdict fields remain blank until the owner performs the consolidated litmus. Keep iterating on
any remaining in-scope implementation failure; `BUDGET_EXHAUSTED` is valid only when an explicit
budget was supplied and must name exact failing obligations. A genuine external input or protected-
path authority gap yields `BLOCKED` for only the dependent effect, never false completion and never
license to weaken or guess around it.

Internal closure also requires the served revision and rollback proof, delivered customer deck, no
blank required human verdict, and a blocker report containing external owners and inputs only.
Approved wording/channel rules, timing values, the distinct rehearsal Sheet, the exact S30 test
record/field, and S66/Dotloop mappings/OAuth remain external until received and read back.
