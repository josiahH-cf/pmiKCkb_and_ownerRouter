# Adversary review — 2026-09-29

ADVERSARY REVIEW

VERDICT: FAIL — A01–A04 are repaired and verified deployed; A06 return-navigation diagnostics require one further cumulative repair.

## Current continuation — September 30

Run `c639b736-43ad-4f5c-bac5-2aa6857e973a` deployed all thirteen features and the A01–A04 adversarial repairs at
`81c770fcb698b6650771f9a28c65c32a42060062` / `pmi-kc-app-rmunbakkw-d2963016189e` with 100% production traffic.
Exact CI 36645026905 and the full 7,461-unit / 234-backend gate passed (four existing skips).
Build `55684cf1-f71f-4629-a86a-d9219fbf724c` succeeded at 2026-09-29T23:52:14.751052Z.
Candidate receipt issued 2026-09-29T23:57:30.062Z; promotion verified 2026-09-29T23:57:49.623Z.
Observation passed two checkpoints in 392,418 ms; all 311 records matched with zero discrepancies,
candidate 5xx or unresolved live effects. Eleven independent readback sections matched.
Exact uploaded source matched all 2,175 Git blobs; all thirteen suites were included, with no
private/unexpected file, missing runtime source or .git pointer.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=false are verified.
Tag `cand-rmunbakkw-d2963016189e`; fingerprint `sha256:b77d4e40303aeaa889cfcdc07fe34e410c043608bfcf20ecda39f0e3bd73f601`.
The separate product supplement passed five checks but failed return navigation on a canceled
non-prefetch RSC read. A06's document-GET repair is local; a fresh cumulative candidate is pending.
The completed run/consumed permit and all failed supplements remain preserved, never relabeled.
Editor browser coverage remains `not_run` under the approved Admin-only contract.

**A06 — Blocker, Verified.** `components/lease-renewal/RenewalDeskReturnLink.tsx` uses client-side Next Link navigation. Three guarded checks on this exact deployed dependency stack recorded a canceled non-prefetch RSC GET on return, despite HTTP 200, correct query, rendered table and no provider HTTP error. Timing rules out a checker reload on return. The smallest repair uses a native anchor/document GET for this control, retaining `buildDeskReturnHref`, source freshness, all filters and all existing zero-diagnostic gates. The transport regression failed on serving code (one failed/21 passed) and all 22 focused checks passed after repair. Full verification and the new candidate are pending; no framework-level root cause beyond the observed stream cancellation is claimed.

Original failed supplement roots: `remote-litmus-1790726703251-0bc27000-e7da-4f7d-9a37-ce7cec31e8eb`, `remote-litmus-1790726930137-bfa49188-ab2b-4d2b-8834-185b4304b05f`, `remote-litmus-1790727128809-211c39bb-755c-4dd9-8edb-9c340fd284ee`. They remain failed and immutable. Only diagnostic timing/selected response metadata was added; no assertions/deadlines changed. Their helper/launcher hashes are retained in each report.

A01–A04 below describe the reproduced defects and verified repairs. Only A06 remains a deployment blocker. Original attempt evidence retains its original result and scope.

## SCOPE REVIEWED

The spec of record is the owner's supplied 118-reference litmus text, the thirteen active S122–S134 contracts (S121 excluded), and the later explicit amendments permitting only lease-bound notice-invalidation metadata and cumulative diagnosed release repairs. The newest request authorizes closing findings. The initial inspection was read-only; the same runner then implemented the requested repairs. This report is not an independent second-review signoff on those repairs.

Inspected the full change inventory from production `79493458f641b9710d8c43467e872aa9acf7948e` through closure commit `e3e97c0de33b18f9c309f574713573950c44c2fb`: 390 files, 49,682 inserted and 5,019 deleted lines, including generated assets, tests, documentation, dependency locks and release scripts. Reviewed the governing router, safety contracts, original requirements, changed boundaries and callers. The original range changed no protected paths or CI workflow. This is complete inventory coverage, not a claim of independent line-by-line proof for every line.

The exact Cloud Build source generation for serving `843e222f436cee824ccb89cef23e8eea59d78d5d` contained 2,174 files matching Git blobs, zero mismatches and no excluded runtime source. All fourteen implementation commits for the thirteen suites were ancestors of that SHA. One additional `.git` worktree pointer was uploaded; A03 addresses that. Eighteen tracked exclusions were repository/historical-document metadata. The tracked `docs/temp/README.md` was verified against Git; it was not private scratch. No customer content or credentials were inspected or copied for this proof.

Fresh independent readbacks at 21:52:59–21:53:27 UTC matched all eleven sections: canonical/tagged identity, successful build and receipts, 100% traffic, reviewed configuration and exactly one candidate authorized domain. Production/Live, Demo=false, Sheet=false, eleven Spaces and four secret bindings matched. No browser session was newly exercised by this readback. Earlier guarded browser results retain their recorded scope in the batch audit.

## SPEC COVERAGE

The original individual requirements and their test mappings remain in `docs/evidence/batch-litmus-audit-2026-09-28.md`; no reference was dropped. “Done” below means the engineering implementation and source inclusion were verified. Customer, provider and human verdicts are separately stated and are not inferred from synthetic tests.

| Requirement / original references        | Current engineering status         | Evidence and boundary                                                                                                                                                             |
| ---------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S122 all-lease inventory/views, 0–8      | Partial; A06 pending               | Worklist projection and 311-record reconciliation passed; the return-navigation diagnostic requires the local transport repair.                                                   |
| S123 retained cycles, 9–17               | Done                               | Cycle/source-date model, retained history and concurrent workspace tests; no automatic historical rewrite.                                                                        |
| S124 move-out notice controls, 18–25     | Done                               | Admission membership, coherent lease/tenancy reads, durable generation invalidation and prepare/confirm/dispatch guards; no blanket read-write authority.                         |
| S125 notice timing, 26–31                | Done; real rule basis unverified   | Typed day arithmetic and provenance, missing-rule refusal; approved anchor/counting basis remains a real input.                                                                   |
| S126 calendar presentation, 32–37        | Done after A02 repair              | Strictly validated policy dates now use the shared presentation formatter.                                                                                                        |
| S127 issue guidance, 38–43               | Done                               | Pure issue projection, exact destinations and missing/configuration branches; severity does not grant execution.                                                                  |
| S128 operating-Sheet pause, 44–52        | Done                               | Preparation/confirmation/final dispatch refusals and read-back false switch on serving and recovery revisions.                                                                    |
| S129 complete reviewed messages, 53–61   | Done; customer accuracy unverified | Approved template bindings, source/notice/policy gates and immutable exact previews; no real draft or send used as proof.                                                         |
| S130 seven-form output, 62–74            | Done to external seam              | Approved AcroForm adapter, deterministic filled bytes/hashes, S20/S21 bindings and refusal coverage; real forms/maps, connection, activation and provider acceptance remain held. |
| S131 Rhino conditional material, 75–83   | Done after A02 repair              | Typed versioned rules now reject impossible dates and invalid retained intervals. Actual policy wording/applicability remains unverified.                                         |
| S132 walkthrough preparation, 84–91      | Done to human seam                 | Deterministic guide/control coverage and readiness; actual selected-case and meeting observations remain NOT RUN.                                                                 |
| S133 maintenance assessment, 92–97       | Done to evidence seam              | Bounded assessment and provenance; no invented property/cost/vendor decision. B-MNT1/B-MNT2 remain exact missing inputs.                                                          |
| S134 lifecycle sorting/filtering, 98–108 | Done after A01 repair              | One category shared by row/filter/count now preserves Unknown when current evidence is uncertain.                                                                                 |
| Shared governance/deployment, 109–117    | Partial                            | A03/A04 source, dependency, release and traffic proof passed. A06 return-navigation repair remains pending. Ref 114's human/real-data boundaries remain unverified.               |

**A01 — Blocker, Verified.** `lib/lease-renewal/lifecycle-category.ts`, completed-cycle branch. A saved completion won over a newly initiated same-date notice, withdrawn/unknown notice evidence and an unavailable current date. S134 requires uncertain evidence to remain Unknown and forbids stale completion from covering a new cycle. Ten new regressions failed on the original code, including the actual desk row/filter/count projection; eight existing tests still passed. The smallest repair keeps the historical completion intact and projects Unknown until current evidence is reconciled. That repair passed 28 focused tests across four files; deployment at 81c770fc is verified.

**A02 — Blocker, Verified.** `lib/lease-renewal/policy-content.ts`, material schema and applicability projection. A regex accepted impossible policy dates (including February 30) and date explanations displayed ISO text. This could misclassify retained approved material and violates S131 invalid-configuration handling plus S126 presentation. Five new tests failed on the original code. The repair uses the existing strict calendar parser at intake and projection, refuses reversed/invalid comparisons and formats only visible labels. Twenty-eight focused checks passed before adding two further retained-interval/comparison-day regressions; the final 7,461-unit / 234-backend gate and exact CI passed. No real policy was fabricated or published.

## STABILITY

| Check actually run                         | Result                                                                                                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native `npm run auth:ensure`               | Approved CLI/ADC identity and refresh passed; no human credential entry.                                                                                                                                                                       |
| Isolated baseline `bash scripts/verify.sh` | Format, lint, typecheck and 7,439 unit tests passed; four existing configuration skips. Backend startup failed because the isolated PATH omitted the installed Java runtime. Later gates/build did not run in that attempt. Failure preserved. |
| Lifecycle original-code regressions        | 10 failed / 8 passed, proving the missed branches.                                                                                                                                                                                             |
| Lifecycle repaired focused run             | 28 passed across category, desk, worklist-view and table tests.                                                                                                                                                                                |
| Policy original-code regressions           | 5 failed / 11 passed.                                                                                                                                                                                                                          |
| Policy repaired focused run                | 28 passed across content, store, route and surfaces; both additional edge regressions passed the final full run.                                                                                                                               |
| Actual native gcloud upload-list fixture   | Old ignore included the worktree pointer; repaired ignore excluded it. Both excluded synthetic private env and retained the application manifest.                                                                                              |
| Repaired dependency lock audit             | Zero production advisories; zero high/critical development advisories. Three moderate entries describe one remaining development-only dependency chain, not three independent runtime defects.                                                 |

A full repaired snapshot passed fresh install, zero production audit findings, formatting, lint, typecheck, 7,458 unit tests (four existing skips), all 234 backend tests, policy/document gates and the Next.js 16.3.7 production build. A final A01 call-path review then found that desk/workspace lifecycle presentation still used the saved legacy app-completion scalar before current process evidence was applied. Three additional regressions failed against that snapshot. The repair now requires the existing current-source process projection to prove app completion, without adding reads or rewriting history. All 84 focused lifecycle, desk and S105 tests passed. The subsequent final gate passed 7,461 unit and 234 backend tests; exact CI 36645026905 and the candidate, promotion, observation and readbacks passed at 81c770fc. The A06 transport change requires another fresh full gate and cumulative release; no old receipt can substitute.

Inspected changed tests for new skips/only/todo and weakened assertions. Found no newly disabled behavior check. Existing date assertions changed with the specified display contract; retired draft-path assertions were replaced by the current governed path. The preflight test now checks both the real empty-queue refusal and the exact ordered thirteen-suite repair queue rather than hardcoding that the queue must stay empty forever.

## COLLATERAL IMPACT

The initial batch included unit-runner isolation, lazy Discovery Engine loading, bounded notice-transaction batching and My Work loading repairs beyond feature UI code. These were diagnosed release/stability repairs authorized by the owner; their failure evidence and focused regressions remain in the batch audit. No cloud resource limit, assurance deadline/concurrency, provider-action key, identity or protected path changed.

The A01–A04 corrective slice changed uncertain lifecycle presentation, policy-date refusal/presentation, source-upload exclusions, dependency versions, an added production dependency audit and corresponding tests/docs. A06 additionally changes only the shared return control from an intercepted client transition to a native document GET, preserving its exact validated destination. It introduces no migration, provider write, workflow milestone or historical completion rewrite. Next.js and its lint configuration move together to 16.3.7; sharp to 0.35.4. Compatible Firebase CLI/Vitest updates address development advisories. All resolved version/license changes are recorded outside Git. Existing dependency licenses include MIT, Apache-2.0, BSD-3-Clause, ISC, CC-BY-4.0, MPL-2.0 and the existing LGPL libvips family; no new license family was silently treated as application code ownership.

## RISK

**A03 — Minor, Verified.** `.gcloudignore` matched `.git/` directories but not an isolated worktree's `.git` file. The actual source archive included a single 111-byte gitdir pointer. No credentials were present. Adding `.git` is the smallest repair; the real gcloud upload-list probe passed. The actual 81c770fc build archive independently confirmed exclusion; 2,175 source files matched exact Git blobs.

**A04 — Blocker, Verified installed versions; exploitability not exercised.** `package.json` / `package-lock.json` pinned Next.js 16.2.12 and sharp 0.35.3, among other versions named by published advisories. Baseline production audit reported ten entries, including one critical and three high. The [Next.js AVIF advisory](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) and [sharp/libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) justify upgrading the image stack; the Windows-only Next.js advisory is not asserted applicable to Linux Cloud Run. Compatible patches produce zero production findings. The added local/CI `verify:dependencies` gate refuses reported production advisories. Full build/runtime verification and A04 deployment at 81c770fc passed.

The remaining development audit entries are Firebase CLI → Pub/Sub 5.x → OpenTelemetry core 1.x. The [upstream advisory](https://github.com/open-telemetry/opentelemetry-js/security/advisories/GHSA-8988-4f7v-96qf) concerns inbound baggage extraction and offers a 2.8.0+ fix. Firebase CLI's current supported dependency range remains on the affected major. No application, library, infrastructure or release script imports this dependency chain. The installed Pub/Sub consumer constructs the trace-context propagator, not the affected baggage propagator. Production audit has no entry in this chain; all 194 final production traces exclude the chain. No unsupported major override or CLI downgrade was applied solely to silence the audit. The remaining development advisory is recorded, not called a clean all-dependency audit.

Rollback remains receipt-bound with Sheet=false on the candidate, promoted revision and captured recovery target. The current captured predecessor 843e222f reads Sheet=false; older Sheet=true predecessors cannot be restored directly. No exploit, real customer draft/send, paid comparison, proof rerun or synthetic production record was used. Tests use isolated home/config stores, a test project, blocked metadata discovery and deterministic adapters/emulators.

## LOOSE ENDS

A01–A04 code is serving; A06 is pending. The original completed checkpoint and consumed permit must be retained unchanged; the new cumulative repair needs fresh run-bound authorization state and receipts. User-owned untracked documents remain untouched and unstaged. Historical failures remain failures outside Git.

## MISSING WORK AND TESTS

Finish full verification and exact main CI; exercise the resulting candidate and canonical origins through the unchanged guarded Admin, reconciliation and observation gates. Read back source provenance, traffic, runtime settings and domains for the repaired SHA. These checks cannot be replaced with commit ancestry or the focused unit passes.

B-DL1, B-DL2, B-DL3, B-S100, B-MNT1, B-MNT2 and B-AUTH2 retain their documented external boundaries. Actual customer draft/form accuracy, approved notice timing, Rhino content/applicability, selected real cases, human walkthrough, screen-reader and desktop full-page zoom verdicts remain NOT RUN. Editor browser coverage remains `not_run` under the approved Admin-only policy; backend role tests remain required. Historical K unit-store effects remain UNVERIFIED; missing Data Access logs do not prove absence of effects. These are not silently converted into delivery claims.

## SPEC IMPROVEMENTS

S134 now explicitly states that equal end dates cannot bind a current notice to a historical closure; unavailable current evidence means Unknown with completion history retained. S131 now explicitly requires real calendar dates and refusal of invalid/reversed retained intervals. S126's date inventory names policy explanations. Engineering verification now includes a production dependency audit, with development-tool findings reviewed by actual exposure rather than forced major replacements.

## GOVERNANCE AND DOCUMENTATION

Current facts, status, plan, loop state, environment handoff, runbook and router distinguish the completed original release from the pending corrective candidate. The thirteen-suite queue remains cumulative. The documentation index's stale pending-release sentence was corrected and both evidence reports are linked. The original release evidence is preserved. After successful deployment, all current coordinates, queue and gate outcomes must be closed in one documentation-only commit; the two pinned tests, prettier and four document gates remain required.

## NEXT ACTIONS

1. A06 — run full verification and exact CI, then deploy the native return control in one fresh cumulative candidate with all thirteen suites.
2. Require the unchanged six-case guarded supplement to pass alongside independent release, source and configuration readbacks.
3. Close current documentation only after that verified result.

## OPTIONAL

No optional redesign is proposed. Variable startup/read latency is an observed concern; passing bounded release checks will not be reported as a general service-level performance proof.

## Evidence locations

All raw evidence stays outside Git under `/home/josiah/pmi-kc-work/logs/`:

- `adversary-provenance-20260929T215156583942Z`: source zip SHA256 `bea9d12665704f39e34defac0b74e581747f8326df613affc233e11a68751836`, matching Cloud Build provenance. Initial broad private-path classification failed on the tracked README; that failure is preserved.
- `adversary-upload-boundary-20260929T215724461185Z`: follow-up exact source classification and native upload-list before/after proof.
- `batch-final-readbacks-20260929T215259060018Z`: independent eleven-section summary SHA256 `66afa87acf663232a4f913c42771cf25ed0ab50e4684ae7abe66b117db194bb4`.
- `adversary-review-20260929T215005094287Z`: isolated baseline source manifest SHA256 `cebf10c0bde1eaf50a4f650764f7123e450a48e143928c34f342d13edcd8fd5e`; failed full-gate log SHA256 `f7d7dbcbc2504ac845f895c8e5dc48bffd8bb4b475dd5e739d546903ca1a136f`.
- `adversary-lifecycle-red-20260929T215536889717Z`: lifecycle red `461b8ea7fc0731331d2f7bc0ce2b05fe412592575787a8eed546c0086c298444`, green `7a60a9b62e6eda67ae17a0f5ca54d1eb93d9ff1c559253e12d5b11a44fe09520`; policy red `fe3e13c04970c8a14cef6cd0ddf2f9209be3de669f6c52a122a2671e16e7d020`, green `a3b377dd732749d3c331938081c23bedfd21731029a1a51e5a678225f794e453`.
- `adversary-dependencies-20260929T220155091905Z`: original/repaired audit JSON, registry metadata, complete version/license delta and immutable failed npm resolver logs. Existing native Node 24/npm 11 resolved the npm 10 optional-peer resolver crash; host installations/settings were not changed.
- `adversary-repair-verify-20260929T221612438249Z`: the first repaired snapshot was captured before formatting completed. Install and production audit passed; formatting failed and later checks did not run. Failed log SHA256 `239e645915e04739f54dcffea013ecb70ac23d01cd3b07c122d0e1cd5b5cd340`; source manifest `98d661d8c43a9e62135e832cb6de2b087f83645064ee1fe5458718df4702d2ab`. The snapshot and failure remain unchanged.
- `adversary-repair-verify-20260929T221824512423Z`: 7,456 unit tests passed, one old dependency-version assertion failed and four existing configuration skips remained. Backend/later checks did not run. The exact pins were updated to the reviewed patched versions without removing behavior assertions, and a bounded local AVIF round-trip regression was added. Failed log SHA256 `7872a25211071ec364cca0fb7cb5f780c908af99e770079a35482016f6d950e5`; manifest `de6a71a6e7a569eee8f7d9d1cb8f89572d7400c222790af97117943824df9438`.
- `adversary-repair-verify-20260929T222700492623Z`: 7,458 unit passes/four existing skips and 233 backend passes; the existing S66 competing-save test exceeded its unchanged five-second deadline. The emulator logged transaction lock timeouts. The installed emulator version remained 1.22.0; no emulator upgrade explains the failure. Failed full log SHA256 `d7a3561e8f27acca735e6171371dbd2f5394e316eca4c7b7b3ae5a2fd0e2fb64`; manifest `da8cabe3f3cd97b8f4688ed25235f3bac54f5c959fc32851f2b1a1f623fb4544`.
- `adversary-packet-race-diagnostic-20260929T223524966013Z`: isolated rerun of the unchanged S66 file passed all eight tests with the same deadline and real concurrent transactions. Log SHA256 `1e80865634a406597aa7cdd716cb3e4c732582e758d1a4e7323840045ee6f8ca`. No data-integrity defect was reproduced, and no assertion, timeout or product algorithm was relaxed. Full-suite readiness must still pass; this diagnostic alone is not that gate.
- `adversary-repair-verify-20260929T223649682928Z`: full verification passed on its exact snapshot, including 7,458 unit and 234 backend tests and the production build. Log SHA256 `fb29eba8fdcd3ac47fcd7806344cb313e9ac4e878f10e6e71f408a56ed9d5e4d`; manifest `4a5bd5231fec0834708ed8b67fe6467b669d23494d57dff4188015a96f769e6e`. Later legacy lifecycle changes require a new full run.
- `adversary-legacy-red-20260929T225237747633Z`: three additional lifecycle regressions failed / 81 tests passed. Red log SHA256 `ef88366089f70b889270d14554c4eda345cf47372bc111e7ec489d124dbad801`. A preceding helper invoked a nonexistent runner and is retained as a harness failure, not regression evidence.
- `adversary-legacy-green-20260929T225336780594Z`: 84 focused tests passed, including desk/workspace/filter refusal of unbound completion inside and outside the active window, unchanged stored history, and the existing S105 process contracts. Green log SHA256 `3a3c20557bfac280d029c577ef3192e07173caad8b6964998d1b80caba4ff58f`. The first repaired run's one failure was a test expecting live workflow controls on an outside-window review page; its existing absence is now asserted explicitly.
- `adversary-repair-verify-20260929T225553490299Z`: 7,460 unit tests passed, four existing skips and one S122 inventory fixture failed because it treated a legacy scalar without evidence as completed. The positive Completed-view assertion is retained with completion produced through audited workspace actions; the unbound legacy record is separately asserted Unknown. No product gate was relaxed. Backend/build did not run in this attempt. Failed log SHA256 `f2e94f8e2a4133bee002b18182a38115690e530ca250e7238377251c48feb68c`; manifest `264040a30e2d9715589d37e76835974d60459829315f4d5f3fb0b25c67d5d1a7`.
- The local HTTP supplement on the earlier fully green `223649682928Z` snapshot passed 31 tests across eight files; 18 existing Firestore-dependent tests across four files were excluded by `--no-firestore`. Log SHA256 `8e6fb427ec774423677f8f277290ed1456fbf5125fe8103a849593fed343f3e1`. Its 194 production trace files contained zero Firebase CLI, Pub/Sub or OpenTelemetry-core chain entries. This validates the upgraded stack on that snapshot, not the later lifecycle changes; the final compiled candidate/browser gates remain required.

- `adversary-repair-verify-20260929T231647678654Z`: final A01–A04 full gate passed 7,461 unit tests, four existing skips, 234 backend tests and production build. Log SHA256 `a4614ec09a4723f99fe0206e7039c1dd8d460f8415cda5bfcac1e681233d635c`; manifest `268eb8f159b94710cc2d0a255bfff076c7baa19a0496568f9e2161ba95b82ec4`.
- `adversary-return-red-20260930T001607022834Z`: one native-return regression failed on serving code and 21 adjacent checks passed; log SHA256 `b2d2d296e21e5985953f2bc75acc87b8a8437415dc5ff58d77ff2ce7563c7ee3`.
- `adversary-return-green-20260930T001629266311Z`: all 22 focused native-return and continuation checks passed after repair; log SHA256 `3f6eff21d6377dd361a7c031398f7240af8260319b539378b28df96efe09b76c`.
