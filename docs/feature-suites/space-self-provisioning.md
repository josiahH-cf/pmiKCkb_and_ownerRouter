<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: temporary-space-pilot-v2 -->

# S36 — Temporary Space provisioning, query proof, and complete retirement

> Status: Specified and not implemented. Production still has eleven configured Spaces,
> `SPACE_PROVISIONING_ENABLED=false`, and a fixed Admin-only seam whose caller-supplied packet,
> combined create/import operation, and Store-only readback do not satisfy this temporary-pilot
> contract. The owner authorizes one exact pilot lifecycle, not a retained twelfth Space.

**Goal.**

Prove that one saved Space request can create, import, query, read back, and completely retire one
temporary Discovery Engine data Store using a byte-identical temporary copy of one current approved
lease-renewals JSONL object, while preserving all eleven production Spaces, the original source
object, identities, cost controls, and the final closed runtime flag.

**Current state / intended end state.**

Current code derives one Store in project `pmi-kc-kb-prod`, location `us`, for an Admin-saved Space
request and uses the existing runtime service account. The production flag is false. The route lets
the browser submit a source URI and random attempt UUID; the provider creates the Store and starts an
import inside one opaque method; import success, imported documents, queryability, copied-object
identity, and partial completion are not read back. The current provider also labels a `.jsonl`
import as `content`, although Google's `document` schema is the contract for one JSON `Document` per
line with an explicit `Document.id`.

The intended pilot has one server-owned, expiring authorization and one deterministic logical
attempt. It resolves the exact approved source snapshot from the existing `lease-renewals` prefix,
copies those bytes into one derived temporary prefix with generation preconditions, provisions one
derived Store, imports only that copy with `dataSchema=document`, verifies every expected Document,
runs one bounded source-backed search proof, and then deletes the exact Store and only the temporary
copy. It never changes the eleven-Space runtime maps or exposes the temporary Store through normal
application retrieval. Completion requires final absence of both temporary resources, continued
presence of the exact eleven predecessor Stores, unchanged original-source identity, and live
readback of `SPACE_PROVISIONING_ENABLED=false`.

**Actors and entry conditions.**

- The initiating and recovering actor is one currently authenticated managed
  `pmikcmetro.com` Admin with `manageAdmin`. A personal identity, Editor, Approver, service runner
  impersonating a user, or caller-supplied actor is refused.
- The managed Admin creates the one pilot request through the existing request workflow using exact
  fixed values: name `Temporary Space Provisioning Pilot`, scope `One-time verification of the
bounded Space provision, import, query, readback, and complete retirement lifecycle.`, and intended
  source `Byte-identical temporary copy of one current approved lease-renewals JSONL source.` The
  returned append-only request must read back with id, derived Space id, requester, creation timestamp,
  and those exact strings before authorization. Existing unrelated/prior requests are ignored; an
  existing Space/Store with the derived id, a second unclosed S36 attempt, or request drift refuses.
- Server-owned current configuration must read back project `pmi-kc-kb-prod`, location `us`, runtime
  identity `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`, the exact eleven Space-to-Store
  mappings, their eleven source prefixes, and the existing common production source bucket.
- The current approved source manifest/evidence for Space `lease-renewals` must resolve at least one
  eligible live `.jsonl` object under that Space's server-derived prefix. The server lists current
  objects, filters to exact manifest-approved `.jsonl` entries, sorts by full object name ascending,
  and selects the first; the browser cannot choose. Its exact URI, generation,
  metageneration, byte size, CRC32C, streamed SHA-256, approval-evidence reference, and approval state
  are read from live systems. Zero eligible objects, a wildcard, a directory, a different
  Space/bucket, a non-current generation, or missing approval evidence refuses without copying.
- Every nonblank JSONL line must parse as an official Discovery Engine `Document`, have one valid
  unique nonblank `id`, and contain only the already-approved source data. Empty, malformed,
  duplicate-id, unsupported-schema, secret-bearing, sample, synthetic, or newly invented customer
  data blocks authorization.
- The authorization includes one source-backed query witness and one expected Document id from that
  same object. The plaintext query is short-lived server-only operational data; public projections,
  logs, metrics, fixtures, Git, and durable bodyless receipts contain only its SHA-256.
- Current APIs, existing runtime permissions, quota, the $25 budget alert, $100 project hard stop,
  $100 account backstop, and `KILL_SWITCH_CAP_USD=100` must read back without drift. S36 does not add
  IAM, raise a limit, or replace a missing control.
- A server-issued authorization expires exactly 15 minutes after issuance. Expiry prevents a new
  claim; after a claim, reconciliation and cleanup remain available until both temporary resources
  are proved absent, even when the global start flag has returned to false.

**What it is / how it functions.**

### Exact source snapshot and temporary copy

The server derives, rather than accepts, the source from the deterministic first eligible current
approved `lease-renewals` manifest object. It parses the exact source generation in memory and
derives:

```text
source_snapshot_hash = SHA-256(source_uri + "\n" + generation + "\n" + byte_sha256)
temporary_prefix = gs://<same-verified-bucket>/__s36-pilot/<saved-request-id>/<source_snapshot_hash>/
temporary_uri = <temporary_prefix>source.jsonl
data_store_id = kb-<saved-request-space-id>-txt
attempt_id = SHA-256("S36 temporary pilot v2\n" + preview_hash)
```

The full 64-character lowercase hashes are used. Bucket, prefix, object name, project, location,
collection, branch, Store id, serving config, and identity are server-derived. The browser cannot
submit or override any of them.

The copy uses the exact source generation and metageneration as preconditions and destination
`ifGenerationMatch=0`; it never overwrites a destination. Readback captures the destination URI,
generation, metageneration, size, CRC32C, and streamed SHA-256 and requires byte size, CRC32C, and
SHA-256 to match the source. The original object is read again and must still match the authorized
generation and hashes before Store creation starts. No metadata/content edit and no write inside the
original `lease-renewals` prefix is permitted.

### Server-owned authorization and preview

The short-lived authorization binds:

- authorization id, issued/expiry timestamps, managed Admin uid, approval-evidence reference, and
  canonical saved-request generation/hash;
- fixed project, location, collection, branch, runtime identity, Space id, Store id, and the sorted
  exact eleven protected Store ids plus their configuration hash;
- original source URI/generation/metageneration/size/CRC32C/SHA-256 and source approval evidence;
- temporary prefix/URI, expected destination absence, and `dataSchema=document`;
- sorted unique expected Document ids, exact count, canonical aggregate expected-Document hash, and
  query-witness hash/expected result id;
- current cost-control readback references, fixed resource/effect sequence, and required terminal
  cleanup evidence.

The preview exposes only non-secret identifiers, hashes, counts, expiry, fixed costs/identity, exact
effects, and cleanup consequences. It states that one temporary object and one temporary Store will
be created and both deleted, the original object will remain, no twelfth Space mapping will be
deployed, and the pilot cannot be called successful until cleanup and flag-off readback pass.

First activation only displays that preview. A separate activation using the exact case-sensitive
literal confirmation `Run and retire this exact temporary Space pilot` plus the server-issued
authorization id and preview hash may claim the attempt. The browser supplies no attempt id. The one
confirmation authorizes the complete displayed lifecycle, including mandatory retirement and
generation-bound deletion of the temporary copy; it does not authorize another request, source,
Store, object, query, IAM change, or retained resource.

### Durable phase and recovery contract

One durable server-only record binds the authorization, preview, actor, attempt, provider operation
names, exact resource generations, phase results, and a bodyless terminal receipt. Its monotonic
phases are:

```text
authorized -> claimed -> copy_verified -> store_verified -> import_verified
           -> documents_verified -> query_verified -> store_absent
           -> copy_absent -> flag_off_verified -> passed_and_clean
```

A failed proof that still cleans up terminates as `failed_and_clean`. An unresolved provider result
or cleanup terminates the current request as `needs_attention`, while the same durable attempt stays
recoverable. It is never reported complete merely because provisioning, import, or query succeeded.

Every mutating phase claims its exact pre-state before one logical provider operation. Response loss,
timeout, process termination, or partial failure never creates a new attempt. Recovery reads the
stored operation name and exact resource identity first. Provider-native continuation tokens and
generation-conditioned continuation of the same logical operation are allowed; a blind second
create, import, Store delete, copy, or copy delete is not. Read-only Store/document/query/object
readback may retry within the declared bounded verification window.

The global flag permits only a new exact claim. Turning it off never blocks inspection,
reconciliation, or cleanup of the already-claimed attempt. Only one unclosed S36 authorization or
attempt may exist system-wide.

### Provision, import, Document readback, and query

After exact copy readback, the provider performs these fixed operations in order:

1. Re-list all Stores, require the exact eleven protected ids and absence of the pilot id, create one
   `GENERIC`/`CONTENT_REQUIRED`/`SOLUTION_TYPE_SEARCH` Store, retain its long-running operation name,
   and read back exact id/display name/shape.
2. Import exactly `[temporary_uri]` into `default_branch` with `dataSchema=document`,
   `INCREMENTAL`, and no wildcard or second URI. The new empty Store makes this one bounded initial
   import; the provider operation name, response, metadata, success count, and failure count are
   retained without source bodies.
3. Require import failure count zero and imported count equal to the packet's expected count. A
   partial or uncountable result fails the proof and enters cleanup; it is never re-imported.
4. Page through `listDocuments` using a stable request and provider page tokens, then `getDocument`
   for every sorted expected id. Require no extra/missing id and canonical equality of each expected
   source `Document` field after excluding provider-generated name/index/create/update metadata.
5. Use the existing data-Store serving-config shape and issue one read-only search with the
   short-lived source-backed query witness, `pageSize=10`, and automatic pagination disabled. At
   least one result must have the bound expected Document id; ranking and total-result count are not
   treated as deterministic.

After the import LRO completes, Document/query readiness may use at most 20 search attempts, each at
least 30 seconds apart, and stops after 10 minutes. Pagination and exact per-id reads are bounded by
the already-captured expected count. The probe does not call Gemini, generate an answer, seed source
metadata, attach an Engine, or route through `/ask`.

### Mandatory retirement and final closeout

Whether the proof passes or fails after a temporary effect, the same confirmed attempt proceeds to
cleanup:

1. Read the exact pilot Store and the protected eleven. Delete only the exact pilot Store, retain the
   delete LRO name, wait/read it, and prove `getDataStore` not-found plus list absence. If deletion is
   ambiguous, keep the temporary source copy and reconcile the same operation before continuing.
2. Re-read the temporary object and require its receipted generation, metageneration, size, and hashes.
   Delete only that exact generation with generation/metageneration preconditions, then prove the URI
   and generation absent. A replacement generation is drift and is never deleted by this attempt.
3. Re-read the original source and prove its URI/generation/metageneration/size/CRC32C/SHA-256 still
   match. Re-list the exact eleven predecessor Stores and compare the unchanged runtime mapping hash.
4. Restore/read back `SPACE_PROVISIONING_ENABLED=false` on the serving production revision and prove
   no pilot Space/Store/source entry was added to either runtime map. Re-read unchanged cost controls.
5. Persist/read back one bodyless receipt containing ids, hashes, counts, timestamps, LRO names,
   phase verdicts, cleanup results, actor, and final flag/config/control proofs. It contains no source
   body, customer value, query text, credential, or raw provider response.

The original approved JSONL object is the backup for the temporary copy and is never deleted. No
success or clean-failure outcome is returned until both temporary resources are absent. A cleanup
failure remains visible as `Needs attention — cleanup required`, returns the exact existing attempt,
and never offers Start over or a new attempt.

**In scope / out of scope.**

In scope: one saved-request authorization; deterministic approved-source resolution; byte-identical
generation-bound GCS copy; official `document` JSONL validation; one fixed Discovery Engine Store;
import LRO and count evidence; complete Document list/get readback; one bounded direct query;
server-derived preview/attempt; durable phase recovery; Store retirement; deletion of only the
temporary copy; original/eleven/config/flag/cost readback; Admin status/recovery UI; focused tests;
and current documentation reconciliation.

Out of scope: retaining a twelfth Space/Store; changing or adding runtime Space mappings; copying
another Space or arbitrary object; producing synthetic/customer test data; writing the original
source; importing multiple objects or wildcards; generic bucket/Store/Engine/resource creation;
schema design; IAM/service-account/API/quota/budget creation or increase; source approval; normal app
search exposure; Gemini/answer generation; arbitrary queries; automatic periodic provisioning;
parallel pilots; generic self-service; or deleting any predecessor Store/source.

**Open questions & assumptions.**

No product decision remains open: the pilot is temporary, uses one byte-identical copy of the
deterministically selected first eligible current approved lease-renewals JSONL source, performs the
complete proof, and removes both temporary resources. Exact request, source generation, Admin, query
witness, and approval reference are runtime evidence, not values to place in Git. If live readback
cannot resolve the fixed request or apply the exact eligible-object filter/sort/selection rule, only
the live pilot is blocked; implementation and fail-closed tests proceed without substitution.

Assumption to verify rather than trust: the current runtime identity already has the exact bounded
Storage and Discovery Engine permissions. A missing permission blocks the pilot and does not
authorize S36 to add IAM.

**Cross-product impacts.**

Admin Space requests and pilot status; server configuration and Cloud Run revision readback;
Firestore attempt/receipt persistence; Cloud Storage source metadata/copy/delete; Discovery Engine
Store/import/document/search APIs; current Vertex retrieval serving-config convention; source
approval evidence; production budgets/guardrail; environment handoff, incident/recovery, status,
facts, plan, and loop-state documentation. No ordinary Space, Ask, renewal, role, notification,
Action Registry, client communication, Gmail, RentVine, or operating-Sheet behavior changes.

**Authority and evidence map.**

| Input                                                                                                                                                                                                                     | Classification                   | Use and limitation                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, live readback, committed code/tests, and `docs/facts.md`                                                                                                                                                     | Authority / implementation truth | Establish fixed project/location/identity, eleven Spaces, closed flag, cost controls, readback requirements, no synthetic live effects, and present incomplete S36 seam.    |
| Owner temporary-pilot decision                                                                                                                                                                                            | Product/cloud-effect authority   | Authorizes one exact copy/provision/import/query/retire/delete-copy lifecycle; it does not authorize retention, another source, generic resources, IAM, or cost changes.    |
| Fixed saved request plus deterministically selected approved `lease-renewals` manifest object/generation                                                                                                                  | Runtime effect evidence          | Supplies exact request/source/Document/query facts outside Git. Missing, stale, malformed, or unapproved evidence refuses rather than choosing a substitute.                |
| [Cloud Storage rewrite](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/rewrite), object metadata, and delete                                                                                              | Official provider contract       | Establish generation-conditioned copy, generation/metageneration/checksum identity, and exact-generation delete. No unconditioned overwrite/delete is accepted.             |
| [Discovery Engine GCS source](https://docs.cloud.google.com/generative-ai-app-builder/docs/reference/rest/v1/GcsSource)                                                                                                   | Official provider contract       | Establishes `document` as one JSON `Document` per line with a valid id and distinguishes it from `content`; this suite accepts one exact URI only.                          |
| Discovery Engine import LRO, [Document list](https://docs.cloud.google.com/generative-ai-app-builder/docs/reference/rest/v1/projects.locations.collections.dataStores.branches.documents/list), get, and search contracts | Official provider contract       | Establish operation/readback/query shapes and pagination. Provider completion is corroborated by exact Store/Document/query reads; ranking is not treated as deterministic. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S36-1** — One server-owned authorization builder rehydrates and hash-binds the saved
  fixed request, managed Admin, deterministically selected approved source generation, parsed official Documents, query
  witness, fixed cloud shape, eleven protected Stores/maps, controls, expiry, and complete cleanup.
  Contract tests fail against the current browser packet and pass only when arbitrary fields cannot
  enter the provider preview.
- **ARCH-S36-2** — One Storage adapter owns source metadata/read, SHA-256 streaming, conditioned
  rewrite, destination readback, and exact-generation delete. Fake-provider and emulator/contract
  tests prove byte equality, destination-absence CAS, original preservation, and replacement-
  generation refusal.
- **ARCH-S36-3** — One durable attempt state machine owns deterministic identity, monotonic phases,
  LRO names, provider claims, same-attempt recovery, redacted receipts, and terminal cleanup truth.
  Browser UUIDs, duplicate active attempts, blind mutation retries, and false completion are rejected.
- **ARCH-S36-4** — Separate Store create, Document import, Store/document readback, search, Store
  delete, and copy-delete boundaries expose each partial result. The current combined create/import
  provider method is replaced; import failure cannot obscure an existing Store.
- **ARCH-S36-5** — One pilot-start gate requires both the exact unexpired authorization and global
  flag, while recovery/cleanup requires the already-claimed exact attempt and remains available
  after expiry/flag-off. Tests prove the flag cannot strand a cost-bearing resource.
- **ARCH-S36-6** — Current product retrieval maps remain immutable. The direct query uses the pilot
  Store id internally and never writes an environment map, source-meta record, Space grant, or
  normal retrieval target.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S36-1** — A managed Admin creates and reads back the one fixed pilot request, then receives one read-only
  preview naming source/destination hashes, Document count, fixed Store, query proof, expiry, costs,
  and mandatory cleanup; preview, cancellation, navigation, and expiry cause zero cloud effects.
- **BEH-S36-2** — Exact confirmation claims one server-derived attempt. Reload, duplicate confirm,
  lost response, or another Admin shows the same attempt/phase and cannot create a second resource.
- **BEH-S36-3** — Copy succeeds only from the receipted source generation into an absent derived
  destination and is accepted only after byte-for-byte readback; source or destination drift blocks
  Store creation.
- **BEH-S36-4** — Store creation, import, all-page Document readback, exact ids/content, and the
  bounded query each produce their own honest phase evidence. Partial import, missing/extra/changed
  Document, query miss, or readiness timeout fails the proof without re-importing.
- **BEH-S36-5** — Passed or failed proof proceeds to the already-authorized cleanup. Success requires
  pilot Store absence, exact temporary-copy absence, original-source preservation, exact eleven-
  Store/map preservation, unchanged controls, and production flag false.
- **BEH-S36-6** — Any unresolved mutation shows the last verified phase and one same-attempt recovery
  action. Cleanup remains available after authorization expiry and flag-off; a new Start is absent.

**Human litmus outcome.**

### Prove one temporary Space and leave production exactly as it started

**If this was built correctly:** A managed Admin creates the fixed pilot request, reviews it and a clearly bounded
temporary source copy, sees the exact Store, Document count, query check, costs, and cleanup before
confirming, then watches truthful phases. The final result says the query proof passed and shows that
the temporary Store and copy are gone, the original source and eleven Spaces remain, and the pilot
flag is off. If anything is uncertain, the page says cleanup is still required and resumes the same
attempt rather than offering another pilot.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use
  `Human verdict: NOT RUN — no human observer` and continue unless the owner explicitly makes it a
  completion gate.

**Requirement-to-outcome traceability.**

| Requirement                                      | Architecture outcome                                   | Behavior outcome                      | Human litmus                                                | Deterministic evidence / falsification                                                                                                       |
| ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact saved request, actor, source, and expiry   | `ARCH-S36-1`, `ARCH-S36-5`                             | `BEH-S36-1`, `BEH-S36-2`              | Review one exact temporary pilot                            | Strict packet/role/domain/request/source/clock matrices reject browser fields, stale generations, zero/ineligible candidates, and expiry.    |
| Byte-identical isolated temporary copy           | `ARCH-S36-2`, `ARCH-S36-3`                             | `BEH-S36-3`                           | See source and copy identity before the Store exists        | Generation/metageneration/CAS/size/CRC32C/SHA-256 tests prove equality, no overwrite, original preservation, and same-attempt recovery.      |
| Official Document import and exact readback      | `ARCH-S36-4`                                           | `BEH-S36-4`                           | Watch import and Document verification separately           | JSONL/schema/id, LRO, partial-count, pagination, get/canonical-hash, extra/missing/drift, and no-reimport fixtures pass.                     |
| Bounded direct query proof                       | `ARCH-S36-4`, `ARCH-S36-6`                             | `BEH-S36-4`                           | See a query result tied to an imported expected Document    | Serving-config spy proves one source-backed query family, page cap/no autopagination/no Gemini, expected-id match, retry cap, and timeout.   |
| Deterministic attempt and honest recovery        | `ARCH-S36-3`, `ARCH-S36-5`                             | `BEH-S36-2`, `BEH-S36-6`              | Reload or recover without a duplicate                       | Claim races, duplicate confirm, process crash, response loss, absent LRO, partial phases, expiry, and flag-off recovery tests pass.          |
| Mandatory Store/copy retirement                  | `ARCH-S36-2`, `ARCH-S36-3`, `ARCH-S36-4`               | `BEH-S36-5`, `BEH-S36-6`              | Finish only after both temporary resources are gone         | Store-delete LRO/not-found and exact-generation object-delete/not-found matrices reject wrong/replaced targets and false terminal success.   |
| Preserve eleven, original, controls, maps, flag  | `ARCH-S36-1`, `ARCH-S36-5`, `ARCH-S36-6`               | `BEH-S36-5`                           | Final page shows the unchanged production baseline and flag | Before/after exact-set/config/source/control/runtime readbacks and mechanical env diff prove no twelfth mapping, source drift, or flag leak. |
| No generic identity/resource/customer-data scope | `ARCH-S36-1`, `ARCH-S36-2`, `ARCH-S36-4`, `ARCH-S36-6` | `BEH-S36-1`, `BEH-S36-3`, `BEH-S36-5` | Only the displayed fixed pilot can run                      | Method/resource/IAM/bucket/prefix/schema/data/log/receipt allowlists and secret/PII/sample scans reject every widened input/effect.          |

**Preservation set.**

Keep the exact eleven configured Space ids, Store ids, source prefixes, Space access grants, existing
retrieval behavior, saved-request intake, current source approval records, runtime service account,
project/location/collection, Cloud Run service configuration apart from the temporary flag window,
budget/guardrail controls, Action Registry, Gmail/RentVine/Sheet gates, and all unrelated Admin
behavior. Preserve the original lease-renewals object byte/generation identity and every predecessor
Store. Run existing Space request, provider, pilot, ledger, retrieval, environment, budget, and core
end-to-end checks as a separate gate; no new S36 pass may average away a preservation failure.

**Adversarial acceptance checks.**

- **AC-S36-1** — Preview/cancel/expiry and wrong role/domain/request generation/source evidence/
  object generation/hash/schema/query witness/project/location/identity/control/config refuse with
  zero Storage, Discovery Engine, environment, Firestore-attempt, IAM, or Action Registry effect.
- **AC-S36-2** — Strict schemas reject caller-supplied project, bucket, prefix, URI, Store, branch,
  serving config, method, IAM, attempt id, actor, expiry, count, Document id, query, cleanup target,
  extra field, wildcard, second object, and path traversal.
- **AC-S36-3** — JSONL fixtures reject blank/malformed lines, non-Document schema, missing/invalid/
  duplicate ids, count/hash mismatch, secret markers, synthetic customer fixtures in a Live packet,
  and any object outside the exact current approved lease-renewals evidence.
- **AC-S36-4** — Storage tests prove source-generation and destination-absence preconditions,
  byte-for-byte copy, destination readback, original re-read, collision refusal, response-loss
  reconciliation, and refusal to overwrite/delete a replacement generation.
- **AC-S36-5** — Store tests prove exact eleven before every mutation, absence before create,
  separate create/import LROs, exact Store shape, zero import failures, exact imported count, all-page
  Document ids, canonical field equality, and no second import after partial/ambiguous completion.
- **AC-S36-6** — Search tests prove pilot-internal serving config, source-backed witness, `pageSize=10`,
  no automatic pagination/model/normal app route, expected-id match, 20-attempt/30-second/10-minute
  cap, and query-miss/timeout failure without false success.
- **AC-S36-7** — Concurrency/crash tests prove one active authorization/attempt, deterministic id,
  monotonic phase claims, immutable provider operation lineage, same receipt on replay, fresh-browser
  recovery, and no blind create/import/delete/copy retry.
- **AC-S36-8** — Cleanup tests prove Store delete before copy delete, exact not-found readbacks,
  cleanup after proof failure/expiry/flag-off, original-source preservation, and `needs_attention`
  rather than completion for any unresolved deletion.
- **AC-S36-9** — Final live proof records exact candidate/serving revision, managed actor, operation
  refs, bodyless receipt, pilot Store/copy absence, exact eleven Stores/maps, original generation/
  hashes, unchanged controls, and `SPACE_PROVISIONING_ENABLED=false` readback.
- **AC-S36-10** — Repository/log/metric/DOM/receipt scans find no JSONL body, customer value, query
  text, credential, raw provider response, personal identity, secret, or production source export.

**Forbidden actions / hard gates.**

No pilot starts without the exact fixed saved request, deterministic current approved source snapshot, managed
Admin, source-backed query witness, 15-minute authorization, fixed preview confirmation, flag-on
readback, existing-permission proof, eleven-Store baseline, and cost-control readback. No sample,
synthetic, generated, edited, or guessed customer/source data may become the copy or import.

Never write/delete the original lease-renewals object; accept a wildcard or caller-selected cloud
identifier; retain the pilot Store/copy; deploy a twelfth mapping; create an Engine, bucket, service
account, IAM grant, API, schema, Scheduler, Function, secret, or generic resource; raise quotas,
budgets, or guardrails; import twice; query through Gemini; run multiple pilots; use a personal
identity; log source/query/customer bodies; or call a partial proof complete. No predecessor Store,
source, map, role, action key, provider/client record, Gmail message, RentVine record, or Sheet cell
may change.

**Dependencies / sequencing.**

S36 consumes the current saved-Space-request store, fixed provisioning plan, configured production
identity, exact eleven-Space configuration, approved lease-renewals source evidence, current Storage
and Discovery Engine APIs, cost controls, and the existing release/readback contract. It does not
depend on or authorize S82-S99 behavior.

Implementation, fixtures, fail-closed UI, recovery, and provider boundaries proceed before live
values exist. Live execution waits only for the exact fixed request, deterministic approved source snapshot,
managed Admin, query witness, and approval evidence. After implementation is green and deployed with
the flag false, prepare the exact authorization, deploy/read back the bounded flag-on start window,
run one attempt, require complete cleanup, restore/read back flag false, and then record current facts.

**Standalone delivery contract.**

- **Deliverable now:** Complete server-owned authorization/preview, deterministic attempt ledger,
  Storage copy/delete adapter, separated Discovery Engine phases, Document/query readback, mandatory
  cleanup/recovery, Admin presentation, strict tests, and flag-off default. Its independent
  implementation gates can be green with fakes and official-contract fixtures while producing zero
  live mutation; the suite terminal remains `BLOCKED` until the required live pilot can run.
- **Consumes, but does not assume:** One exact fixed saved request, current approved source generation,
  managed Admin, and source-backed query witness. Their absent state is `Pilot unavailable` with the
  exact missing evidence and zero cloud effect.
- **Externally blocked effect:** The actual cloud pilot remains `BLOCKED` only when one of those live
  values, current permission/control readback, or the explicit flag-on release window is absent. That
  does not block the complete fail-closed implementation.
- **Produces for downstream suites:** One passed-and-clean bodyless lifecycle receipt, verified
  temporary-provisioning provider contract, and unchanged eleven-Space/config/control evidence. It
  produces no retained Space, mapping, source, grant, or reusable generic resource action.

**Verification and delivery contract.**

1. Before implementation edits, record the current flag-false/eleven-Store/config/identity/control
   baseline and materialize fail-first tests for caller packet authority, combined create/import,
   missing Document/query readback, browser attempt identity, and incomplete cleanup.
2. Run focused schema, authorization, Storage, provider, LRO, pagination, query, state-machine,
   concurrency, expiry, flag, cleanup, receipt, privacy, and preservation tests. Provider spies must
   assert exact method order and zero calls for every refusal.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; inspect the mechanical diff and audit
   secrets, PII, source bodies, runtime configuration, identity, exact effects, cost controls,
   protected paths, and scope traceability.
4. Ship code only through the existing zero-traffic candidate, exact-commit smoke, promotion,
   readback, and rollback contract. A flag-on revision is not a code-delivery shortcut and cannot
   precede the green flag-off implementation.
5. For the one authorized live pilot, retain secure before/phase/after evidence, restore flag false
   even after a failed proof, and report `passed_and_clean`, `failed_and_clean`, or `needs_attention`.
   The implementation suite reaches `ALL_GATES_GREEN` only when the required live proof is
   `passed_and_clean`; unresolved cleanup is `BLOCKED`, never a custom success state.
   `BUDGET_EXHAUSTED` is available only when the owner supplied an explicit run budget.

**Ordered prompt sequence.**

1. Re-read router/facts/loop state, current S36 code/tests, official provider contracts, and live
   read-only eleven-Space/config/identity/control/source state.
2. Freeze the preservation baseline and named fail-first authorization/copy/phase/readback/query/
   cleanup tests before implementation edits.
3. Implement the server-owned authorization, deterministic attempt/recovery, exact Storage adapter,
   separated provider phases, bounded query, complete retirement, and fail-closed Admin states.
4. Falsify every refusal/partial-failure/concurrency/recovery/privacy condition, run canonical tests,
   and deliver the flag-off implementation through the normal candidate release.
5. Resolve the exact live packet from the saved request and current approved source, execute one
   confirmed temporary pilot, prove passed query plus complete cleanup/eleven/source/control/flag
   readback, and update current documentation to only the verified outcome.

**Deletion/merge recommendation.**

Remove S36 from the active tree only after the one live attempt is `passed_and_clean`, its Store and
temporary copy are absent, the original source and exact eleven remain, the production flag is false,
the bodyless receipt/readbacks are recorded in current facts, and no retained self-service Space
provisioning product is claimed.
