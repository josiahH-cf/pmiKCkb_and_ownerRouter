# Application gap implementation — November 3, 2026

Status: CORRECTED SOURCE AND LOCAL GATES QUALIFIED; EXACT-MAIN CI/DELIVERY PENDING. Reviewed head `a32d1a6b`
passed local gates and exact-main CI, then independent review identified four source/spec misses
and unperformed required core E2E. This records the owner's implementation instruction for the finalized
[plan](../plan.md), following the [assessment](current-application-gap-analysis-2026-11-03.md).
Source implementation, isolated verification, deployment, live observation and human acceptance
are separate evidence states. Earlier qualification is retained for its exact source; it does not
accept the corrected working tree or establish delivery.

## Independent correction qualification

The four findings against `a32d1a6b` have source corrections and independent read-only re-review:

- S130 accepts exactly canonical `lease-renewals` and historical `renewals` at intake, packet and
  current/historical byte readers. Green03 passed 53/53 checks in seven files through the actual
  publication/intake/catalog/packet/filling/byte owners and typed isolated multipart transport.
  Three canonical failures reproduced before the repair; unrelated Spaces remain refused.
  Manifest `91cef27d9f46af845b7f862917b4022030270033647419103a5a17c308889c04`;
  all 3,043 physical paths matched independently. Inner/outer exits zero, all 14 unit-lane controls
  passed and no owned processes remain. No original was approved or sent to a provider.
- S241 recovery now reads actual immutable process/S21 versions and stored bytes/hash/size,
  current definition identity and revision; the duplicate-Publish guard remains intact.
- S227 filters retired provenance before process/run list limits and refuses detail history
  reads before loading versions/runs. Stored records and supported staff work are preserved.
- S240 clears prior plans/confirmation on a new request, failure or Space change; late responses
  are bound to the current request and Space. No re-index/import ran.

The latter three repairs passed 144/144 checks across 19 files at 18:01:50Z, inner/outer exits zero,
all 17 controls, six font negatives and cleanup. Manifest `6c7d27f4` identifies that earlier focused
capture; later S130 paths are separately qualified above. True pre-repair failures remain private.
Independent re-review found no remaining concrete source finding within these four scopes.

Required core E2E completed at **18:18:53.845716Z**: 46 passes, zero failures, 23 explicit
no-Firestore-emulator configuration skips across all 14 expected files. The actual command was
`npm run test:e2e:core` using its existing `--no-firestore` lane. Inner/outer exits zero, all 17
controls, six font negatives, terminal/host cleanup and zero owned processes were observed.
All 3,046 source paths matched manifest
`aceee3fe58b9684a9afb2e72c0aebb6a4bb6a71cae94921e5b85b6f7cd5f336a`, also captured by
cumulative full07. The skipped mutable scenarios retain a separate backend-emulator verification
link; they are not claimed as passed core cases. Corrected cumulative verification, exact-main CI,
application delivery and actual runtime configuration/publication are separate links.

Corrected cumulative **full07** completed at **2026-11-03T18:30:52.345442Z**, actual outer exit zero.
It passed 10,162 unit tests (four existing configuration-parity skips; 1,082 files passed/one
skipped), all 497 backend tests across 86 files (no skips), production dependency audit,
format/lint/typecheck, required policies/budget checks and production build. All 16 original npm
commands ran. Its captured manifest is the same `aceee3fe` as the required core lane; only later
documentation/status reconciliation differs in the authoring tree. Native output is
`pmi-gap-verify-20261103-07`; outer receipts remain under `canonical-gate-07/`. This supersedes
full06 for corrected-source qualification without rewriting any earlier result. Exact-main CI,
delivery and actual runtime configuration/publication remain pending.

## Baseline and authority

Fresh source fetch retained main `3943591918bd9c5443bffef381db3d8b32e959d3`.
Canonical `/api/version` retained `bc97535379dd08deab578455b00a80fc93b8d209` /
`pmi-kc-app-rmvzwt7ms-00754475effd`. The earlier completed release and consumed permit retain
their original scope. The current owner instruction launches P1–P9 through existing engineering
and delivery gates; it grants no new Dotloop activation, customer proof effect or legal decision.

Approved WSL CLI/ADC refresh passed as `josiah@pmikcmetro.com`. A guarded existing Admin session
read the current publication policies and `owner-renewal-outreach`: both HTTP 200, policies empty,
process Draft. The session recorded zero mutation attempts/blocked requests and a free profile
lease before/after. No process edit, publication, policy write, selection or evaluation occurred.

After independent review's guarded read returned 401, the existing approved `auth:ensure
--need=canary` flow re-established the exact managed Admin session through `existing_session` at
17:43Z, without a human challenge or identity/role change. Fresh guarded reads then returned 200
for the same four-step Draft/zero-run process, zero publication policies, source references v8
with all eight locations present/unverified, and saved Dotloop selection v1. The source-reviewed
`/api/admin/move-out-timing-basis` read returned `missing`. One preliminary read used a nonexistent
app route and returned 404; that is not an authentication or missing-configuration observation.
Both corrected read sessions recorded zero mutation attempts and closed the profile free.
These configuration tasks remain known engineering work after delivery, not client unknowns.

Private evidence is in `Documents/Codex/2026-11-03/pmi-application-assessment/` and the existing
private `.codex/tmp/pmi-kc-review-2026-11-03/` evidence directory, outside this repository.
Raw logs, identities, bodies, resource targets, legal originals and proposed maps stay private.

## Implemented source and focused evidence

Counts below describe distinct scoped runs and overlap. They must not be added into a cumulative
test total. Starting failures and unsuccessful tooling attempts are retained in private evidence.

| Package / owner           | Source outcome                                                                                                                                                  | Actual focused evidence and remaining limit                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 / S238 A-01, S227 A-07 | Current send/operator guidance; exact retired/closed/superseded decision eligibility shared by inbox/counts/context and action admission; history retained      | Retired availability and immutable single/bulk admission checks passed with S20 preservation: 45 checks/3 files. No approval/evidence record was closed or deleted. Legacy S72 graph remains unchanged; current Communications and legacy Gmail checkpoint evidence are explicitly separate. Legacy preservation: 81 checks/5 files.                                                                 |
| P2 / S168 A-05            | Correlated upstream recurring-charge detail GET 500; sanitized options-only 503, retained options and readable retry reason                                     | 5 intended starting failures; 113 focused checks/6 files passed, including 42 execution-preservation checks. Original POST purpose/body/actor and provider-internal cause remain unknown. No live replay.                                                                                                                                                                                            |
| P2 / S238 A-06            | Distinct permission, authentication, stale/expired source and overlay-read reasons; real source read time; partial decision feeds cannot become false all-clear | Root read/reason checks passed; shared completeness repair recorded 7 starting failures then 49 checks/8 files passed. Existing independent reads remain parallel and six-key decision rows retain their shape. No unavailable feed is called empty.                                                                                                                                                 |
| P3 / S240                 | Real configured-source inventory and importer-compatible handoff; intent staging stays separate from import; generation-bound manual preflight                  | Focused re-index/process batch: 172 checks/17 files, later affected 33/5. Missing, truncated, mismatched or unreadable source metadata is non-runnable. No source import or provider search/generation was run.                                                                                                                                                                                      |
| P4 / S130, S66            | All eight privately recovered originals inventoried; semantic/blank/signing proposals and exact residual business questions                                     | 32 static pages: KCRAR 2, lease 20, extension 1, insurance 2, LBP 1, brochure 2, owner acknowledgment 1, pet 3; zero AcroForms. Earlier four match the Drive binaries byte-for-byte. Complete independent Poppler text/geometry and inspected renders; bounded full-lease/insurance application-inspector limits recorded. Proposals are not executable/approved maps; no duplicate source-file ask. |
| P5 / S125                 | One visible authorized staff selection records the settled timing basis with current scope/version, durable replay/audit/readback and conflict safety           | 6 intended starting failures; latest 51 unit checks/9 files and 2 real isolated Firestore-emulator checks passed. Later control/workspace 10/10 passed. Existing Admin arbitrary-rule API remains Admin-only. No live selection save.                                                                                                                                                                |
| P6 / S235                 | Current packet context without snapshot persistence; excluded families produce no material-input ask; current account/generation/time-qualified selection       | Shared P6/P8 scope: 183 checks/25 files passed, followed by reason-label 20/3. These are isolated results, not current provider execution.                                                                                                                                                                                                                                                           |
| P7 / S241                 | Current six-step process seed, truthful Draft/Published states, actual-definition revision/CAS and publication re-read, honest lost-response recovery           | Existing definition is not reseeded. Content/conflict preservation covered in the P3/P7 focused batch. Real publication scanner/policy seam is engineering in progress; actual definition remains unpublished.                                                                                                                                                                                       |
| P8 / S34                  | Separate new-loop/existing-loop/upload readiness; passive exact-key review package; ordinary packet ledger/claim/receipt/recovery exercised with typed adapters | Isolated new-loop create-once, own-receipt recovery, upload independent of create key, exact bytes/duplicate confirmation and lost-create-response ambiguity passed. Passive packages explicitly say not ready/not authorized. Both production keys remain closed; signing remains human.                                                                                                            |

## Publication engineering question

Current live policies are empty and `lib/publication/provider.ts` supplies an unavailable scanner
outside test/emulator fixtures. An old launch-era comment does not create a new authority hold.
The team is implementing a real managed ClamAV service with authenticated invocation, exact
reviewed process/content scope and fail-closed current signatures. Generic file/folder publication
must remain outside that new scope. No fake clean scanner or reduced validation is acceptable.
Dedicated infrastructure build `66e3da9c-14f7-4b01-a19d-a6a768d7883c` succeeded from an exact
five-file, 17 KiB source upload. Image digest:
`sha256:4b03d4283a7201002d91ca649e66e123c05c97a5be6627dd9124c69ac74c56b5`.
The new `pmi-kc-publication-scanner` service's initial readback matched 1 CPU/4 GiB,
concurrency one, min zero/max one, request CPU, 75-second timeout, 180-second startup probe and
existing managed runtime identity. IAM before was empty; after the exact service-level change,
readback showed only the existing app runtime service account as explicit `roles/run.invoker`,
with no public principal. The main app, identities, environment/secrets and budgets were unchanged.
Fresh billing and exact native budget/guardrail/topic/channel controls passed before creation.

Service Ready readback passed at 13:44:03Z with actual URL loaded into source configuration from
`status.url`. Authenticated approved-operator readiness and harmless JSON scans passed; the latter
returned the exact 107-byte input hash/count, ClamAV 1.4.6, daily 28173 dated 06:27:52Z. Anonymous
access returned 403; malformed input/wrong paths fail closed. An immediate second POST returned
503 under the one-second interval. A later escaped EICAR JSON scan returned clean: the original
serialized-byte contract does not establish decoded/encoded-payload detection.

Separate exact-image engine qualification `93264b99-977f-40a2-9a1b-25149ab6b1ac` succeeded:
official signature refresh, ClamAV 1.4.6/daily 28173, harmless 54 bytes exit 0, official benign
68-byte antivirus test exit 1 with detection. This proves actual engine behavior, separately from
the HTTP JSON framing check. The first build-config submission was refused before creation for
literal-dollar substitution syntax; the corrected configuration uses byte construction and its
real successful run is retained. No customer data or app record was used.

New application policy scope binds exact process ID, reviewed canonical bytes/hash and no client
record values, with bounded credential/Bearer/SSN tripwires; it is not general DLP. Existing managed
staff ownership/audit metadata remains in those full bytes. Current-definition revision and prior
hash CAS guard audited re-review through the existing policy path; later corrected versions retain
stable policy/resource IDs and earlier immutable versions. Generic file/folder scope cannot inherit
this policy. Focused transaction-race and two-successive-version checks passed; cumulative gate
and actual app-runtime invocation/policy/publication are pending.

Raw build/resource/IAM/qualification receipts are private in `scanner-infrastructure-01/`. These
are separate managed infrastructure builds, not an application candidate or release receipt.

## Remaining qualification and outcomes

Subsequent source diagnosis identified **A-08/Q-ENG-PUB2**, owned by S130/shared S21. The generic
file route has no real production scanner; S130 requires its current validated Live publication
and also mismatches the UI's canonical `lease-renewals` Space with legacy `renewals`. No production
upload was attempted. A distinct exact-reviewed blank-original PDF/family/hash path is being
implemented and specified in S130 AC-S130-20–24. It preserves the process-only policy and existing
legal/map approval. This is team engineering, not another client hold or a request for source files.

The first actual-original parser compatibility run passed its 17 kernel controls, exact eight
read-only input hashes, unchanged source/input checks and clean teardown. It accepted only LBP;
six originals refused a missing complete glyph mapping and insurance refused an unclassified
stream. These are actual unsupported results, separately from the green synthetic matrix.
Private structural inspection established explicit predefined WinAnsi or complete Differences
coverage for every used glyph in those six; family-name assumptions caused the strict decoder's
refusal. Color/font-program stream classification remains a bounded insurance-format task.
Q-ENG-PDF-COMPAT owns the proven parser repair and same-input rerun; no original or legal text is
changed and no new client file is required.

Fresh repaired-source run completed at 15:45:53Z: **8/8 actual originals accepted**, each with a
separate bounded local tripwire result `clean / Low`. All 17 controls passed; outer/controller
exits were zero; no owned processes remained; source and all eight original/input hashes were
unchanged. Extracted UTF-8 text ranged 3,604–72,057 bytes, below the unchanged bound. The final
reader is `55fd524b8a7e3254e370c447f074ad48acf5e5323b9666cfdff7907fbc7bda0c`.
Its 22-file synthetic/preservation run passed 166 tests, including four actual starting failures
for the supported formats and the separate 21 Python protocol/controller fixtures. Unknown
glyphs, unowned streams, unsafe content and incomplete extraction remain refusals. No original
was modified, published, approved or scanned through a live provider during these checks.
Q-ENG-PDF-COMPAT is closed; the earlier one/seven and seven/one outcomes remain immutable.

Source review additionally found S241 history defects: a Draft retained a prior publication
pointer and could be labeled Active or start a falsely pinned run, while pinned step checks read
the mutable definition. Four actual starting server regressions and a separate UI failure are
preserved. The bounded repair reads the existing immutable version, validates identity/Space,
preserves legacy unpinned Draft meaning, refuses new Active starts with no valid version pointer
and protects concurrent starts with a definition revision check. The first repaired preservation
run passed 71 checks/eight files with all 17 controls, exact font receipt and clean source/teardown;
the final pointer guard separately passed all 18 checks with the same controls and clean teardown.
Q-ENG-PROCESS-HISTORY remains pending
cumulative delivery. No production run is started or rewritten to prove the correction.

Scanner infrastructure build `1a5c6369-2795-4541-a209-ff7497df0830` produced image
`sha256:9b3ea5246c573f73b47d44ebbdf89beb63c1d0fa523f7a223488a58ce40fcb14` from five files, with
only the strict PDF HTTP admission changed. Candidate `pmi-kc-publication-scanner-src9b3ea5246c57`
was qualified at zero traffic with the captured predecessor at 100%, unchanged bounds and exact
service IAM. Eight synthetic-only real HTTP checks passed on its actual returned tag URL:
readiness, exact 956-byte PDF/hash, preserved 104-byte JSON/hash, anonymous 403, wrong-type,
incomplete PDF and generic endpoint refusals. No original is published/approved or used as a
customer/provider proof. Raw readbacks/results are private in `scanner-infrastructure-02/`.

A further synthetic-only HTTP probe at 16:00:20Z placed the official EICAR test string in a PDF
comment and returned `clean`, contrary to the probe's expected-detection assertion. That failed
probe remains preserved; separate actual raw-file engine detection is not relabeled as PDF
payload detection. The [EICAR contract](https://www.eicar.org/download-anti-malware-testfile/)
requires its specified file format, rather than a PDF comment. ClamAV's
[versioned PDF test](https://raw.githubusercontent.com/Cisco-Talos/clamav/clamav-1.4.6/unit_tests/clamd_test.py)
loads a separate test database, which is not installed in the managed service. The bounded
investigation is closed: no application/engine failure was established and broader PDF-contained
payload detection remains unverified. No engine, adapter or policy control is relaxed.
No supplied original, legal approval or customer effect is involved.

At 16:07:14Z the exact qualified scanner revision was promoted to 100% of this utility service's
traffic and read back, with identical revision template, service IAM and resource bounds. Fresh
exact billing/cost controls passed first. Four canonical checks then passed: anonymous 403,
current engine readiness, exact 956-byte PDF/hash and preserved 105-byte JSON/hash. The actor was
the approved owner CLI; application-runtime invocation remains pending actual publication.
Private receipts are in `scanner-infrastructure-03/`. The main application, its configuration,
secrets and production action keys did not change in this separate infrastructure operation.

Cumulative native `bash scripts/verify.sh` passed in full gate 06 as recorded below. Exact committed
CI, current served application delivery and actual process publication remain pending. A prior default-heap
typecheck exhausted its memory limit; it is an unsuccessful tooling check, not an application
failure or a passing result. The supported bounded native heap is used for cumulative checks.

## Final local qualification — full gate 06

Full gate 06 completed at **2026-11-03T17:01:58.467396Z**, actual outer exit zero. All 16 original
npm commands ran: 10,128 unit tests/four existing configuration-parity skips; 497 backend tests/no
skips; production dependency audit, format/lint/typecheck, all policy/budget checks and production
build. Exactly 19 child/preparation records plus the canonical wrapper report zero exit, no guard
termination and zero remaining owned processes. All 14 application phases passed each of the 17
kernel controls, six font negative cases, terminal font/closed-port and host cleanup checks.
Independent physical readback matched all 12 emitted font files' hashes and sizes to the expected
set. All 3,041 staged source paths remain byte-identical; manifest
`fd29fcee94b71ee4f9f2910a362b825dcbae7db62a63d82536175be670511aed`.

Native output is `pmi-gap-verify-20261103-06`; private outer receipts are under `canonical-gate-06/`.
The canonical wrapper took 1,063.905 seconds; build took 82.144 seconds. Typecheck/build heaps
remained 3,072 MiB and aggregate cap 4,096 MiB. Final v8 fixture browser evidence covers the same
1,267 application runtime paths, separately from subsequent documentation-only status closure.
These are engineering results, not deployed, human, signature, paid-generation or customer-effect
claims. Every earlier stopped/failed attempt retains its original result.

Cumulative attempt 01 used the actual native isolated canonical entry point, Node 24/Java 21,
3,072 MiB typecheck/build heaps and 4,096 MiB aggregate RSS guard. Its actual inner/outer exit 2
is preserved: install, audit, format and lint passed; typecheck rejected an incomplete new scanner
test metadata cast. The fixture now supplies the full domain metadata rather than masking the
type check. No application behavior changed in that correction. A fresh cumulative attempt is
required; the failed frozen snapshot is not modified or called green. The journey snapshot and
attempt 01 initially matched all 3,027 source paths exactly; the subsequent fixture-only delta
does not change its application/harness bytes. Later journey results are recorded below.

Attempt 02 passed install, audit, format, lint and supported-heap typecheck, then stopped honestly
with 9 failing files/14 failed tests, 10,061 passed and four configuration skips. Initial triage
examined only four failure families; the complete result includes historical-ledger/document/date
ownership and a retired generic S20 fixture as well. Original reports/outer exit 1 remain preserved.
Six repaired preservation files subsequently passed 30 tests through a private exact-command
orchestration of the unchanged native isolation functions: all 17 controls, exact owned font
terminal/cleanup, zero host hits, zero remaining owned processes and unchanged staged source.
That is focused evidence, not a replacement for the corrected cumulative gate.

Attempt 03 stopped during source staging before any application command, after peer review
identified a new Active run with a missing version pointer could fall back to mutable content.
The actual outer exit `-15`, zero started-command records and no children at the targeted stop
are preserved. Its directory is not reused. The exact regression failed before a narrow guard;
an existing unpinned legacy-run preservation case remained green. A fresh cumulative run uses
the corrected source; neither the stopped preparation nor the earlier failures count as passes.

Attempt 04 passed install, audit, format, lint and typecheck before a coordinated stop during
unit execution at 16:09:48Z. Review of the touched generic workflow-run surface established an
inherited retired-maintenance history read/display path inconsistent with S227 R1–3. Its bounded
repair and acceptance check AC-S227-7 are in scope; no stored record is purged. Native canonical
exit `-15`, actual outer exit 1, owned-only cleanup and zero remaining owned processes are
preserved. The stopped unit phase is no test verdict; a fresh complete gate is required.

That exact retirement regression reproduced seven intended failures with 18 preservation passes
across four files before the patch. The source repair now refuses retired generic run/checklist
GETs and history readers with 410, and renders only the retirement notice before timeline,
version, steps or checklist bodies are read. Current actor/Space checks, stored records and real
staff/renewal workflows are preserved. Focused patched qualification and the new full gate remain
pending; no live historical record was read or rewritten as proof.

The patched retirement scope subsequently passed **91/91 tests across 11 files**, all 17 controls,
font terminal/closed-port checks, zero host hits/owned leftovers and unchanged staged source.
Its source manifest is `804a36d469227a3e682c76bfdba23aef4f3019c7035c980ecd1bee1a882e8bdb`.
Full gate 05 and the fresh final browser journey captured that identical 3,041-path source.

Full gate 05 passed install, production dependency audit, format, lint, typecheck and **10,128
unit tests** with four existing configuration skips (1,079 files passed, one skipped). Its backend
phase had **495 passes/two failures**, both mounted S113 operator journeys at their strict
zero-rejected-request cleanup assertion. The sanitized diagnostics classify unhandled fixture
routes without exposing the raw path. Source review found the current notice-basis GET absent
from that fixture's dispatcher. Engineering is binding the actual GET/PATCH route and asserting
its successful observed read, preserving the strict cleanup gates; no product control is mocked
away. Actual inner/outer exit 1, five app phases' 17 controls/font/cleanup receipts and 3,041
unchanged staged hashes remain preserved. Later policies/build did not run; no missing output is
called green. A new complete gate follows the fixture repair.

The real-handler fixture repair passed the exact affected **28/28 Firestore tests** at
16:48:59Z. Fresh/underway journeys observed respectively seven/two notice-basis GETs, all HTTP
200/parsed/completed; all 545/420 requests fulfilled, with zero rejected/pending. Original
assertions remain intact. All 17 controls, font negative/terminal/closed-port checks, host
isolation, clean teardown and unchanged staged source passed. The source manifest
`fd29fcee94b71ee4f9f2910a362b825dcbae7db62a63d82536175be670511aed` matches full gate 06.
Q-ENG-JOURNEY-ADAPTER is closed; the new cumulative gate remains pending.

The final browser journey v8 also passed **34/34 steps**, actual inner/outer exits zero, all 17
controls, three intermediate closed-listener restarts plus final teardown, exact font terminal
receipt/closed port and unchanged staged source. It used the same 6,144 MiB aggregate cap;
observed peak was 4,789,051,392 bytes and duration 235.577 seconds. Unlike v7, this observed peak
exceeded 4 GiB; no performance improvement is claimed. Manifest `804a36d4` matches full05 and
the 91-case focused retirement run. Independent full06 comparison checked 1,267 runtime paths
and physical bytes: all match v8; only three documentation files and the S113 fixture differ.
Twenty exact receipts and their hashes are copied privately under `kernel-journey/v8-receipts/`.
This closes the final-code fixture journey, without a production or human verdict.

The complete credential-free kernel browser journey subsequently passed all **34 steps**, with
actual command and outer exits zero. It exercised the same-page Editor notice selection and an
independent persisted version-1 readback, renewal/workflow views and the existing delivery gates
against deterministic adapters/emulators. All 17 controls, three intermediate/final closed-listener
checks, font terminal receipt, zero host hits/owned leftovers and unchanged source passed. This
run explicitly used the native supported 6,144 MiB aggregate local fixture limit, with unchanged
per-process heaps; observed peak was 4,085,628,928 bytes. Earlier lower-limit and harness attempts
remain failed. Source manifest `1371bdec665c2e64d75d12ec5e1a13b2dfa7dc80e516ce969c764dcc11d346a6`
also passed a separate native typecheck and the 27-case S20 preservation check. Later PDF reader
and process-history repairs are outside that identical-source claim and require their own focused
and cumulative qualification. Native journey evidence is `pmi-kc-review-journey-kernel-20261103-v7`;
private copied receipts preserve their original hashes. This is no production or human verdict.

External/human holds are maintained only in [open-blockers.md](../open-blockers.md). No duplicate
client blocker register is created here. Dan/Jon communication remains private copy preparation;
no message or mailbox draft has been sent or created. Human acceptance, signatures, physical-phone
checks, paid comps/generation and live customer effects remain NOT RUN unless separately evidenced.
