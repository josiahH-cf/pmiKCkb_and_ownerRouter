<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-gap-assessment-2026-11-03 -->

# S240 — Runnable Admin knowledge re-index handoff

> Status: Authoring FINAL / READY; source and application DELIVERED; runtime-access diagnosis/preparation CLOSED. The app's observed non-runnable/no-command refusal remains honest. Effective bucket/project/org policies and five role definitions establish no runtime `storage.objects.list` grant; a managed-folder 404 does not replace that permission evidence, and no raw runtime 403 is claimed. Owner-credential reads verified one existing Approved/Low source and its actual builder/import-parser/request/object-generation guard produce a runnable, unexecuted manual handoff. S240's explicit IAM exclusion remains intact: Josiah's one scope-deviation decision is held under [U6/B-GCP-REINDEX](../open-blockers.md). The private one-permission role/bucket proposal is ready, not applied. App-runtime readiness remains held; no source replacement, new login or Dan GCP task is requested. See [delivery/configuration evidence](../evidence/application-gap-delivery-2026-11-03.md). No ingestion or production re-index request was performed in this sequence.

**Goal.**

An Admin receives an existing Space's complete, source-bound re-index command only when its
arguments satisfy the actual importer contract; otherwise the handoff states the exact technical
input that is unavailable and does not describe the command as runnable.

**Current state / intended end state.**

The November 3 assessment inspected committed source at
`3943591918bd9c5443bffef381db3d8b32e959d3`. The application serves
`bc97535379dd08deab578455b00a80fc93b8d209` /
`pmi-kc-app-rmvzwt7ms-00754475effd`; its release evidence remains
`docs/evidence/application-delivery-2026-11-03.md`. S240 is a newly specified delta, not part of
that completed release.

Current `lib/admin/reindex-command.ts` (lines 50-51) returns `runnable:true` with datastore, project and
location arguments, but no source URI. The actual importer requires at least one `--source-id`
or `--gcs-uri` (`scripts/import-agent-search-documents.mjs` (lines 35,83-95)) and throws when none exists.
The command also retains a project placeholder when no project is configured while still claiming
to be runnable. `tests/unit/reindex-command.test.ts` (lines 5-20,34-45) accepts those outputs rather than
checking compatibility with the importer. The route stages a request and prints a plan; it does
not ingest (`app/api/admin/reindex/route.ts` (lines 13-16,28-46)). These are source findings. The assessment
did not submit the production form, create a re-index request, run the command or observe an import.

Intended: Resolve the selected existing Space's current configured datastore and eligible approved
source manifest through the existing owners. Produce complete validated arguments, including the
actual source URI set and matching data schema, or a non-runnable plan with a specific cause.
Printing or viewing a plan never runs ingestion. A staged request remains intent, not evidence
that the index changed or that retrieval works.

**Actors and entry conditions.**

- A current managed Admin with `manageAdmin` uses the existing re-index panel and confirmation.
  Preserve server authorization; browser labels or caller-supplied roles grant no authority.
- The selected Space, datastore, project, location and source scope come from current configuration
  and the existing approved source-corpus owner. The browser cannot supply replacement URIs,
  approval states, datastore targets or provider endpoints.
- Existing corpus readiness rules remain: real non-placeholder values, approved source metadata,
  allowed sensitivity, no raw context/call source, and no duplicate source/document identities
  (`scripts/source-corpus-readiness.mjs`). A reference template is not an approved live manifest.
- Missing, unreadable, contradictory or unsupported source/configuration evidence prevents only a
  runnable handoff. It does not request credentials, change access or block other KB reads.

**What it is / how it functions.**

Repair the existing Admin-to-CLI plan boundary. A bounded read resolves eligible sources for the
selected Space and its configured datastore. Reuse the existing source-corpus validation/readiness
rules; do not introduce a competing approval catalog or import implementation. Validate project,
location, datastore, schema and each source URI as data before forming arguments. Use a structured
argument representation or equivalent safe rendering so a source cannot become shell syntax.

Only a complete plan may return `runnable:true`. Include the exact eligible source set and schema
accepted by the importer, plus enough source-version evidence to identify what the handoff was
prepared from. No eligible source, incomplete mapping, incompatible schema, missing configuration
or failed source read yields an explicit non-runnable cause. Do not substitute an empty listing
for a read failure, silently omit an invalid source, insert a placeholder or invent a source URI.

Preserve the existing confirmed request/readback and its `requested` meaning. A non-runnable plan
may report a staged request truthfully; it cannot imply ingestion success. A later retry re-resolves
the current inputs and reports changes, without executing a prior request or making a backlog.
The output remains a manual handoff. Actual ingestion requires its existing separate operational
authorization and current source/cost checks; this suite does not execute it.

**In scope / out of scope.**

In scope: existing-Space source resolution for the handoff, complete importer-compatible arguments,
truthful runnable/refusal states, safe command rendering, focused compatibility tests and matching
Admin guidance. No automatic re-index execution, new Space/store, source upload, corpus rewrite,
approval collection, source publication, ingestion retry worker, provider permission or policy change.
S36's temporary Space pilot remains separate and inert; this is not its implementation or proof.
S241's review/publication of the existing owner-outreach process is also separate. Publishing that
process does not start re-indexing; a runnable re-index plan does not publish process content.

**Open questions & assumptions.**

The existing production manifest's storage/owner and freshness contract must be located during
engineering diagnosis. The assessment did not establish that each live Space has eligible approved
objects. This technical uncertainty is independently resolvable through accessible current source
and approved reads; it is not evidence that a client must upload files again. When no eligible
current manifest can be resolved, the complete fail-closed output is still implementable. Any later
genuine missing approval is recorded against only that source in `docs/open-blockers.md`.

No material product question remains for this handoff. Recover existing source approvals before
asking anyone to approve the same content again. Dan is the contact for a genuinely unresolved
PMI business question, not an additional approval gate for an already approved manifest or a
technical source lookup. The project team owns source discovery, argument construction and tests.

Do not assume a file extension alone proves the importer schema. Reuse the source owner's explicit
validated format; unsupported or mixed incompatible formats remain non-runnable with a bounded cause.

**Cross-product impacts.**

- `lib/admin/reindex-command.ts`, `app/api/admin/reindex/route.ts` and
  `components/admin/ReindexPanel.tsx`: one coherent plan and displayed state.
- Existing source-corpus manifest/readiness owners and current Space/datastore configuration:
  bounded reads and validation, without source or approval mutation.
- `scripts/import-agent-search-documents.mjs`: consume its real parser/request contract as the
  compatibility boundary; the handoff must not instantiate or invoke an import client.
- Existing request store, KB documentation and focused tests retain intent versus completed-effect
  semantics. Private source URIs, bodies and raw evidence remain outside Git.

**Authority and evidence map.**

| Input                                                          | Classification         | Use and limitation                                                                                                          |
| -------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Current router and owner assessment instruction                | Authority              | Permit assessment/specification only; preserve approved identities and current effect boundaries.                           |
| Current command builder, route and importer cited above        | Implementation truth   | Establish the missing source-argument contract and intent-only staging; no live import failure is claimed.                  |
| Existing corpus readiness implementation                       | Existing source policy | Reuse approval/sensitivity/placeholder and identity validation; do not infer that a template contains live approved values. |
| November 3 delivery evidence and fresh canonical identity      | Deployment evidence    | Establish the deployed baseline, not S240 implementation, production re-index success or retrieval quality.                 |
| Current source manifest/configuration readback, to be resolved | Technical dependency   | Establish exact eligible sources or an explicit non-runnable state; do not invent a client/access blocker.                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S240-1** — One server-owned resolver binds selected Space, current datastore and eligible
  source set using the existing corpus readiness contract. An injected source from another Space,
  caller URI, stale/mismatched mapping or unavailable read cannot produce a runnable plan.
- **ARCH-S240-2** — Every runnable plan round-trips through the real importer parser and
  `buildImportDocumentsRequest` in an isolated fixture without missing inputs, placeholders or
  altered targets. Request construction is tested without calling `main` or any provider client.
- **ARCH-S240-3** — The route and UI preserve intent-only request semantics and cannot reach source
  upload, store creation or ingestion from plan construction, display, retry or request readback.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S240-1** — With one valid approved source snapshot, the Admin receives a complete runnable
  command for exactly that existing Space, target and schema. Its displayed source count and
  evidence identify the same source set as the validated importer request.
- **BEH-S240-2** — No sources, missing project/datastore, invalid or unapproved source, incompatible
  format, cross-Space mapping and source-read failure each give a specific non-runnable outcome.
  No placeholder or partially omitted set appears as runnable; read failure is distinct from empty.
- **BEH-S240-3** — A staged request is labeled requested, not imported. Reopening or regenerating a
  plan reflects current inputs and reports drift without performing an import or replaying requests.

**Human litmus outcome.**

### A usable re-index handoff

**If this was built correctly:** An Admin chooses an existing Internal Process and requests the
command once. The app either shows a complete command for the approved sources or explains the
specific missing technical input. It clearly says that the index has not changed. Reopening the
request never starts an import, and a changed source set is visible before later operational work.

- Model verdict: PASS for implementation, qualification/delivery, observed app refusal and completed effective-permission diagnosis. The actual owner-side builder/parser/request/generation guard confirms one-source runnable preparation, unexecuted. App-runtime inventory remains held on U6/B-GCP-REINDEX, not an open engineering-cause investigation. No ingestion is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                             | Architecture outcome         | Behavior outcome | Human litmus              | Deterministic evidence / falsification                                                                                                                  |
| --------------------------------------------------------------------------------------- | ---------------------------- | ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S240-1: Resolve the exact eligible source set for the selected existing Space.        | `ARCH-S240-1`                | `BEH-S240-1`     | A usable re-index handoff | Resolver fixture includes another Space, duplicate, unapproved and malformed sources; only a complete eligible bound set can pass.                      |
| R-S240-2: A runnable plan satisfies the actual importer contract.                       | `ARCH-S240-2`                | `BEH-S240-1`     | A usable re-index handoff | Rendered argument round-trip through the actual parser/request builder; absent source URI and missing project fail against the starting implementation. |
| R-S240-3: Missing or uncertain inputs remain explicit and non-runnable.                 | `ARCH-S240-1`, `ARCH-S240-2` | `BEH-S240-2`     | A usable re-index handoff | Table-driven absent/invalid/schema/scope/read-error cases each assert a specific cause and `runnable:false`.                                            |
| R-S240-4: Preserve manual intent, current-input recovery and no ingestion from the app. | `ARCH-S240-3`                | `BEH-S240-3`     | A usable re-index handoff | Route/UI fixtures assert requested state, changed-input regeneration and zero upload/create/import calls across success, refusal and retry.             |

**Preservation set.**

- Existing Admin authorization and explicit request confirmation in
  `tests/unit/admin-reindex-route.test.ts` and `tests/unit/reindex-requests.test.ts`.
- Existing request creation/readback/listing meaning; a request is never provider-effect proof.
- Existing source-corpus validation, sensitivity, approval and identity restrictions.
- Existing Space maps, runtime identity, cost controls, provider grants and production settings.
- S227/S229 retirement and confirmed renewal delivery boundaries; no S36 or historical proof restart.

**Adversarial acceptance checks.**

- **AC-S240-1** — Falsify `ARCH-S240-1` / `BEH-S240-1`: a valid source from another Space or
  datastore cannot be included. A complete eligible set produces exactly the matching source count,
  targets, format and source-evidence binding, with no silent selection from invalid mixed input.
- **AC-S240-2** — Falsify `ARCH-S240-2` / `BEH-S240-1`: add the focused contract case
  `runnable reindex arguments build an import request for exactly the approved source snapshot`
  to `tests/unit/reindex-command.test.ts`. Using isolated synthetic inputs and no local env file,
  feed generated CLI arguments through `parseImportArgs` and `buildImportDocumentsRequest`;
  assert the exact request parent, `inputUris`, schema and no create-store flag. The original
  source-less runnable plan must fail for the missing URI reason before the repair.
- **AC-S240-3** — Falsify `ARCH-S240-1` / `ARCH-S240-2` / `BEH-S240-2`: separately exercise no
  sources, missing project, missing datastore, malformed URI/shell syntax, placeholder, duplicate,
  unapproved/high-sensitivity source, unknown schema, cross-Space mapping and read failure. Each
  yields a non-runnable cause; no invalid command is shown as ready to run.
- **AC-S240-4** — Falsify `ARCH-S240-3` / `BEH-S240-3`: extend the existing route/UI cases so
  staging, listing, a non-runnable response and changed-input regeneration call no upload,
  create-store or import operation. Do not run importer `main` as the test. Keep a request distinct
  from index/result readback and preserve user-visible explanation after a failed read. Mounted
  `tests/unit/s240-reindex-handoff-state.test.tsx` must show a ready command disappears immediately
  on a replacement review, stays absent after its failure, and is invalidated with its confirmation
  when the selected Space changes. Bind every response, error and pending-state update to its
  current request and Space: an older A response arriving after a current B review must not replace
  B's plan or restore A's runnable command under B. Reviewing a prior request names/selects its own
  Space; no response or client state authorizes ingestion.

**Forbidden actions / hard gates.**

This assessment runs no production POST or import and creates no production test record. A future
implementation test uses isolated fixtures without host credentials or live network access.
Do not create a Space/store, upload source bytes, alter approval metadata, import documents,
broaden Drive/search access, change IAM/identity/cost controls, reveal private URIs in tracked
evidence or ask for credentials. Do not treat `runnable:true` as an ingestion authorization or a
retrieval-quality verdict. Existing client/provider and protected-path boundaries remain intact.

**Dependencies / sequencing.**

Engineering first locates the current source-manifest owner and read contract, then materializes
the importer compatibility falsification and refusal matrix before changing code. This suite can
deliver complete eligible-input and fail-closed behavior without a live import, a new client input,
another suite, a completed proof rerun or a new release permit. Any later actual ingestion remains
outside this delta and subject to its own current authority, source/cost and readback checks.

**Standalone delivery contract.**

- **Deliverable now:** delivered bounded source resolver, truthful plan/refusal UI, importer
  contract and current-request recovery. Effective runtime-permission diagnosis is complete;
  the private owner-side one-source handoff and exact one-permission proposal are prepared.
  Neither the handoff nor proposal was executed. The app correctly supplies no command while
  runtime listing lacks its grant; that outcome awaits the single U6 owner scope decision.
- **Owner-decision-held outcome:** Josiah as project owner decides whether to extend this suite's
  explicit IAM exclusion for `storage.objects.list` only on the existing bucket. Engineering can
  apply the reviewed private custom-role/bucket-binding proposal only after that decision,
  preserving backup/CAS/readback/rollback and verifying actual app inventory/plan afterward.
  No object-get/write permission, identity/API change or ingestion is included. Keeping the
  boundary retains the already prepared manual owner-side path and honest app refusal.
- **Consumes, but does not assume:** Existing Space/datastore config and approved source-corpus
  evidence. Missing, stale, invalid or unreadable input remains an explicit non-runnable cause.
- **Externally blocked effect:** Actual ingestion is not an acceptance prerequisite or an action
  granted by this suite. A genuine later missing content approval blocks only that source/effect
  and belongs in `docs/open-blockers.md`; accessible source diagnosis proceeds independently.
- **Produces for downstream suites:** One validated, source-bound plan or explicit refusal, with
  separate intent, deployment and provider-effect status; no receipt purporting to prove ingestion.

**Verification and delivery contract.**

1. Re-read the current source/config owners and record the preservation baseline. Materialize the
   named AC-S240-2 contract test and missing-input cases; retain their expected failures against the
   starting source. A pre-existing unrelated test failure is not falsification evidence.
2. In the repository's isolated fixture lane, run only the focused command/parser, source-resolver,
   route/request-store and necessary UI cases for every traceability row. Supply synthetic explicit
   configuration, no `.env.local` or credentials and no network; preserve the complete existing
   assertions except the proven incorrect runnable-command expectation.
3. For later authorized implementation delivery, run `bash scripts/verify.sh`, inspect the
   mechanical diff and audit privacy, gates, runtime configuration and scope. This authoring
   specification itself initiates no CI, release, production staging or ingestion; the owner's
   later launch governs the bounded implementation and its existing delivery gates.
4. Record implementation terminal status only from actual checks. `ALL_GATES_GREEN` for the
   bounded implementation is distinct from deployed availability, real import/readback and human
   acceptance. Source implementation/focused checks are evidenced separately; cumulative
   qualification, deployment and actual ingestion cannot be inferred from the specification.

**Ordered prompt sequence.**

1. Confirm the current source/deployment baseline and existing source-manifest ownership.
2. Materialize source resolution, importer compatibility, refusal/recovery and preservation checks
   before implementation; record the expected missing-URI and missing-project failures.
3. Implement only the existing Admin handoff's bounded resolver/plan/UI behavior and tests.
4. Falsify the contract and refusal cases, run focused and canonical checks, update evidence and
   deliver only when implementation/delivery is separately requested. Execute no ingestion as proof.

**Deletion/merge recommendation.**

Keep this delta active until its source, refusal/recovery and importer-compatibility outcomes are
implemented, verified and represented by current code/tests/docs. Merge into an established KB
operation owner only if every trace remains explicit; do not merge it into S36 or broaden its scope
to automatic ingestion. Retain the actual authoring/implementation/deployment distinctions.
