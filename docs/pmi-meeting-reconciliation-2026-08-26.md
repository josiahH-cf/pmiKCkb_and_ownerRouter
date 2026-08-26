# PMI KC meeting reconciliation — Wednesday, August 26, 2026 at 2:00 p.m. Central

Prepared on 2026-08-26 for the organizer-supplied meeting time. This replaces the pre-implementation
August 25 assessment. The exact serving commit and Cloud Run revision must be read from the public,
bodyless [`/api/version`](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/version) response after the
release is promoted; a timestamp-only deployment inference is no longer accepted.

Client handoffs:

- [`pmi-kc-client-action-center-2026-08-26.html`](pmi-kc-client-action-center-2026-08-26.html) — the
  plain-language client action, testing, blocker, and ownership page.
- [`pmi-kc-meeting-agenda-2026-08-26.html`](pmi-kc-meeting-agenda-2026-08-26.html) — the presenter’s
  one-page, time-boxed agenda.
- [`pmi-kc-meeting-readiness-human-litmus-2026-08-26.md`](pmi-kc-meeting-readiness-human-litmus-2026-08-26.md)
  — the frozen model/human acceptance checklist.

## 1. Outcome

The dependency-independent meeting work is built. The product now:

1. refuses to call conflicted or stale current rent “Verified”;
2. applies a recorded rent resolution only to the exact lease/row that produced it;
3. uses one current-rent extraction precedence and records the live field-shape diagnostic without
   client values;
4. accepts normal human money formats such as `$1,500.25` at the operator forms and rejects ambiguous,
   negative, or partial values;
5. exposes the operating renewal Sheet as view-only in Admin and a separately configured rehearsal
   copy as the only allowed write-test target;
6. gives work assignments optional job location, materials needed, and materials already bought/on
   hand, addressing the actionable work-screen support request;
7. hides the unbacked Workflow Communications compatibility Space from normal product directories;
8. activates only the approved, read-only RentCast reference-comp action;
9. exposes exact commit/revision/service/environment identity at `/api/version` and requires the
   candidate smoke to match it before traffic promotion; and
10. hard-bounds the E2E probe, run, HTTP warmups, and teardown so a gate cannot hang indefinitely.

The safe stop is equally important: the renewal write action in RentVine remains closed, the operating
Sheet write-back action remains closed, the move-out deposit-disposition report remains acknowledged
and waiting for the offered client walkthrough, and no discrepancy is automatically “fixed.”

## 2. External-effect boundary

No live RentVine `POST`, `PUT`, `PATCH`, or `DELETE` was made in this run. No operating Google Sheet
cell was written or cleared. The live diagnostic used reads only.

### RentVine

RentVine’s published Manager API now documents two relevant updates:

- update the selected lease with `POST /api/manager/leases/{leaseID}`; and
- update one existing recurring charge with
  `POST /api/manager/leases/{leaseID}/recurring-charges/{chargeID}`.

The current credential’s broader write role is owner-attested, not live-proven. A new write client is
kept separate from the GET-only read client and exposes only those two documented POST operations. It
accepts only allowlisted lease-date or existing-charge fields, uses the managed account host, emits no
secret-bearing errors, and has no delete, create-charge, status-change, arbitrary-route, or generic
request surface. A dry-run provider produces the two-step proposed change and rollback payload and
throws if asked to execute. `rentvine.lease.renewal_writeback` therefore stays
`production_allowed:false` until a dedicated test record, exact preview/confirm, live readback,
receipt, and rollback proof are reviewed.

### Renewal Sheet

`RENEWAL_SHEET_ID` continues to identify the operating read source.
`RENEWAL_REHEARSAL_SHEET_ID` is a different, optional configuration value for a verbatim copy. Equal
ids are a hard refusal. The operator proof is dry by default and, in live mode, requires an exact
confirmation bound to the copy and cell. It proves:

`blank → synthetic compare-and-set write → exact readback → exact clear → blank readback`.

The proof cannot run until the client creates and shares the distinct copy. A missing copy is a named
setup dependency, never permission to target the operating file.

## 3. Current-rent findings and correction policy

The bodyless diagnostic at
[`evidence/current-rent-bodyless-diagnostic-2026-08-26.md`](evidence/current-rent-bodyless-diagnostic-2026-08-26.md)
read the complete 306-row RentVine export and the renewal Sheet without printing record values.

| Current-rent outcome               | Count |
| ---------------------------------- | ----: |
| Sources agree                      |    14 |
| Sources conflict                   |    20 |
| Only one source is present         |   140 |
| Both sources missing or not joined |   216 |
| High current-rent flags            |    20 |

The export-shape result was unambiguous for this capture: all 306 rows carried `unit.rent`; zero
carried a lease-level rent key. Both code paths now resolve `unit.rent`, then `lease.currentRent`, then
`lease.rent`, and a differing-values fixture prevents them from silently diverging again.

The 20 conflicts are examples to review in the authenticated tool, not a claim that RentVine has 20
bad values. Each must be classified as one of:

- actual source conflict;
- RentVine only or Sheet only;
- both missing;
- intentional semantic difference (especially base rent versus total monthly charge);
- stale snapshot; or
- ambiguous lease identity/join.

Until a fresh agreement or exact record-specific resolution exists, the draft shows Needs
Verification. A resolution changes the proposed draft only; it does not write RentVine or the Sheet.

## 4. RentCast activation

The exact key `rentcast.rental_listings.search` is now `readiness:"Approved for Execution"`,
`evidence_status:"Documented"`, and `production_allowed:true`, and is included in both executable
allowlists. This is the owner-approved D12 change for the read-only reference-comps path only.

The activation is grounded in the existing evidence: managed Secret Manager binding, active account
plan and measured allowance, controlled HTTP 200 provider probes, bounded cache, persisted usage
counter, and hard allowance stop. The request carries address/unit filters only and never fills
`offeredRent` or writes a system of record. All other newly considered external write keys remain
unchanged.

## 5. Support-report reconciliation

Three fresh reports were read. Two were attributed by the support queue to the same managed teammate:

- **Work page:** asked for what materials are needed/bought and address/job detail. This is addressed
  in the current slice. Task create, storage, validation, and card rendering now carry job location,
  materials needed, and materials bought/on hand.
- **Move-out deposit disposition:** says the page is unclear and offers an actual-process
  walkthrough. This remains acknowledged and waiting. It is not marked resolved, because changing a
  workflow before hearing the actual process would encode a guess.

The meeting should identify the process expert and capture the real steps, inputs, decisions,
documents, timing, owner, and completion proof.

## 6. Highest-leverage client inputs

| Priority | Input                                                            | Why it matters                                                     | Safe default until answered                                                      |
| -------: | ---------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
|        1 | The six renewal steps, in order, with owner and completion proof | Aligns the workspace to the actual operating process               | Keep the current generic model; do not claim it is the client’s six-step process |
|        2 | Definition of “current rent”                                     | Separates real errors from base-versus-total semantic differences  | Needs Verification; no source write                                              |
|        3 | A verbatim rehearsal Sheet copy and its managed sharing          | Opens reversible write/read/undo proof without touching operations | Refuse the proof                                                                 |
|        4 | One unmistakable RentVine test lease/owner                       | Opens a controlled future live proof                               | Dry preview only; action key closed                                              |
|        5 | Move-out disposition walkthrough owner/date                      | Makes the reported page correct rather than merely clearer         | Keep report open                                                                 |
|        6 | Exact lease behind the wrong-resident report                     | Determines whether the address/identity repair closed it           | Treat as unresolved                                                              |
|        7 | RentCast search-radius/comparable-count policy                   | Makes the reference range defensible in local submarkets           | Show as reference only                                                           |
|        8 | End-of-September scope and commitment                            | Reconciles the only dated delivery expectation                     | Record no invented commitment                                                    |

## 7. Demonstration path

1. Open [Renewal Desk](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/lease-renewal/live/desk): show
   chronological cards, complete address labels, and a conflicted current-rent item.
2. Open [Live renewal review](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/lease-renewal/live): show the
   direct-read time, refresh, and lease-specific resolution key behavior.
3. Open [Admin](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/admin): show operating/view-only Sheet,
   rehearsal-copy setup/refusal, discrepancy guide, and support reports.
4. Open [Team Work](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/admin/team-work): show job location and
   the two materials fields on a task without creating client data for the demo.
5. Show the RentVine dry preview using deterministic fixture data only; explicitly point out
   `executionAllowed:false` and the rollback payload.
6. Open [version evidence](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/version): confirm exact
   commit, revision, service `pmi-kc-app`, and environment `production` after promotion.

Do not enter invented production records simply to make a screen look populated. Use existing live
records only inside the authenticated product, or deterministic automated-test fixtures outside it.

## 8. Adversarial verification contract

The implementation began with two intentionally failing architecture/behavior suites and an eight-row
human litmus. The initial failures named the missing RentVine seam, rehearsal Sheet boundary, exact
version proof, RentCast activation, compatibility tile removal, and HTML deliverables. A passing handoff
requires:

- the focused implementation regression set;
- all unit tests;
- typecheck, lint, formatting, copy/voice, router boundary, spec traceability, context freshness,
  falsification, and production build;
- bounded core E2E completion (or an explicit deterministic failure, never a hang);
- action-registry dry-run with only the exact approved executable set;
- secret/PII scan and diff review;
- release plan, candidate deploy with zero stable traffic, exact version smoke, exact-revision
  promotion, stable smoke, traffic readback, and a captured rollback command.

The human verdict columns remain blank for the 2:00 p.m. walkthrough. Model verification is evidence,
not a substitute for the client’s process decisions.

## 9. Release evidence rule

The source commit cannot truthfully contain its own SHA. Therefore this document does not pin a
guessed or timestamp-inferred release. The release procedure injects `APP_COMMIT_SHA` from Git into the
candidate revision; `/api/version` is then checked for exact commit + exact Cloud Run revision before
promotion. The final run handoff records the verified values and rollback target after deployment.

## 10. Safety statement

No RentVine record was changed during this run.

No operating Google Sheet cell was changed during this run.
