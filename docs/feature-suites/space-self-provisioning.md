<!-- spec-shape: overhaul-v1 -->

# S36: Space self-service provisioning

> New 2026-07-23 (operator note): authored decision-complete for the full-suite build program
> (`docs/roadmap-unblock-2026-07-23.md` feature #10, Wave-2 SEAM, owner dependency #7). The intake and
> command-emit already ship (Slice 7, D12); this suite makes the app actually CREATE the Discovery Engine
> data store plus Drive folder and persist the Space config behind a per-Space cost-confirm, up to the one
> owner step (billing plus a data-store-create identity). It reuses the re-index cost-gate posture
> (Slice 8, D14) verbatim and structurally preserves the existing 11 `SPACE_*`-mapped Spaces.

**Goal.** An Admin can add a working Space from inside the app instead of hand-running provisioning
commands. Today `Admin -> Request a new Space` records the request and prints the exact owner console
steps (a Discovery Engine data-store create, a Drive folder, the `SPACE_*` `.env.local` lines, an
`import:agent-search`, and the deploy), but it provisions nothing, because creating a Vertex AI Search
(Discovery Engine) data store is a cost-bearing call that counts against the roughly ten dollar cap. The
end state: the Admin fills the same form, checks an explicit "this is cost-bearing" confirmation for THIS
Space, clicks provision, and the app creates the real Drive folder and the real data store, then persists
the new Space so it is immediately queryable through Ask without a redeploy. The existing eleven
KB-configured Spaces in `SPACE_VERTEX_DATA_STORE_IDS` and `SPACE_DRIVE_FOLDER_IDS` are never touched. The
only work that remains external is the owner granting a billing approval and a service identity permitted
to create Discovery Engine data stores; the app is built and wired up to that single flip.

**What it is / how it functions.** The intake surface is unchanged; a confirmed provisioning action is
layered on top of it, mirroring the re-index control one-for-one. A new pure merge resolver plus a
runtime-durable Firestore record make a provisioned Space live immediately while keeping the eleven
env-defined Spaces immutable.

- **Intake (already built, reused as-is) -- `components/admin/SpaceRequestPanel.tsx`,
  `app/admin/spaces/request/page.tsx`, `app/api/admin/spaces/request/route.ts`,
  `lib/firestore/space-requests.ts`, `lib/admin/space-request-commands.ts`.** The manageAdmin-guarded POST
  records intent to `space_requests` and returns a `SpaceProvisioningPlan` from
  `buildSpaceProvisioningPlan` (a pure, deterministic generator of the create curl, the Drive step, the
  merged `SPACE_*` env lines with every existing Space preserved verbatim, `npm run import:agent-search`,
  and `npm run deploy -- --budget-confirmed --allow-multiple-spaces`). `slugifySpaceId` derives the
  stable Space key that is also the data-store id. This provisions nothing and stays the source of the
  slug, the env lines, and the duplicate check.
- **Cost-confirm pattern being mirrored -- `components/admin/ReindexPanel.tsx`,
  `app/api/admin/reindex/route.ts`, `lib/firestore/reindex-requests.ts`.** The re-index control is the
  template: its input schema requires `confirm: z.literal(true)`, its checkbox reads "I understand this
  is cost-bearing and I will run the command myself", and the route refuses to stage without explicit
  confirmation. S36 copies this exact gate shape for the provisioning action.
- **Provisioning executor (new) -- `lib/admin/space-provisioner.ts`.** A `provisionSpace(input, deps)`
  function with injectable Google clients (offline-testable against fakes, live in production). It runs
  the free, idempotent Drive step first via the existing `GoogleDriveClient.ensureFolder`
  (`lib/google-drive/drive-dwd.ts`, keyless domain-wide-delegation as a `pmikcmetro.com` subject,
  `drive.file` scope), then the single cost-bearing step: create the Discovery Engine data store. The
  create is the exact inverse of `scripts/delete-agent-search-data-store.mjs`, using the same
  `@google-cloud/discoveryengine` `v1.DataStoreServiceClient` (endpoint
  `${location}-discoveryengine.googleapis.com`) and `createDataStore` returning a long-running operation
  awaited to completion, with `industryVertical:"GENERIC"`, `solutionTypes:["SOLUTION_TYPE_SEARCH"]`,
  `contentConfig:"CONTENT_REQUIRED"` (the same body the emitted curl uses). The billing call runs last so
  a failed free step never bills; a failed create writes no config record (see the idempotency check).
- **Runtime-durable config (new) -- `lib/firestore/provisioned-spaces.ts` plus `firestore.rules`.** One
  append-only record per provisioned Space in a new `provisioned_spaces` collection keyed by slug,
  carrying `space_id`, `data_store_id`, `drive_folder_id`, `display_name`, optional `scope`,
  `provisioned_by_uid`, `provisioned_at`, and the create receipt (the resolved data-store resource name
  and the LRO operation name). Server-write-only and Admin-read, denying every client write in
  `firestore.rules` exactly like `space_requests` and `reindex_requests`, so the browser can never forge
  one.
- **No-clobber merge resolver (new) -- `lib/config/space-maps.ts`.** A pure `resolveSpaceMaps(envMaps,
provisioned)` returns the effective `{ vertexDataStoreIds, driveFolderIds }` as
  `{ ...provisioned, ...env }` so the env maps WIN on any key collision: a `provisioned_spaces` record can
  only ADD a brand-new slug and can never override one of the eleven env Spaces. Because `readServerConfig`
  (`lib/config/server.ts`) stays env-pure, sync, and deterministic, the merge happens at the async
  data-access boundary: `resolveSearchTargets` (`lib/retrieval/vertex-search.ts`) reads the merged map and
  enumerates the union of the env-configured and provisioned slugs, so a provisioned Space participates in
  both single-Space and search-all retrieval with no redeploy.
- **Cost-confirm route plus flag (new) -- `app/api/admin/spaces/provision/route.ts` and a
  `SPACE_PROVISIONING_ENABLED` var in `lib/config/server.ts`.** A manageAdmin-guarded POST whose input
  schema requires `confirm: z.literal(true)` and the Space name/slug. It fails closed with 503 when
  `SPACE_PROVISIONING_ENABLED` is unset or false (default false, mirroring how the maintenance intake
  secret fails closed today), 400 without `confirm:true`, 403 without `manageAdmin`, and 409 when the slug
  already exists in the env maps or in `provisioned_spaces`. Only past all of those does it call the
  executor, persist the receipt, and return it alongside the still-emitted durable `.env.local` lines.
- **Cost-confirm UI (new) -- `components/admin/SpaceProvisionPanel.tsx` on
  `app/admin/spaces/request/page.tsx`.** The intake panel gains a per-Space cost-confirm checkbox ("I
  understand provisioning this Space runs a cost-bearing Vertex data-store create counted against the
  budget cap") and a "Provision this Space now" button enabled only when the box is checked and the flag
  is on; it renders the plan and, on success, the persisted receipt (real data-store name and folder id).
  When the flag is off it shows only today's behavior: the recorded request and the printed owner
  commands.

- **Buildable now (app-plane).** The loop builds all of the below unattended; none of it bills, sends,
  writes a system of record, or flips a live gate on, and `SPACE_PROVISIONING_ENABLED` stays false:
  - The pure `resolveSpaceMaps` merge resolver (`lib/config/space-maps.ts`) with the env-wins invariant,
    and the async merge wiring at `resolveSearchTargets` (`lib/retrieval/vertex-search.ts`) so provisioned
    slugs join single-Space and search-all retrieval.
  - `lib/firestore/provisioned-spaces.ts` (create/list/get) plus the `provisioned_spaces` deny-client-write
    and Admin-read rules in `firestore.rules`.
  - The `provisionSpace` executor (`lib/admin/space-provisioner.ts`) with injectable Drive and Discovery
    Engine clients, fully unit-tested against fakes (success, duplicate refusal, Drive-only-then-create
    ordering, and a create-failure path that persists nothing).
  - `app/api/admin/spaces/provision/route.ts` with the manageAdmin, `confirm:true`, flag-fail-closed, and
    duplicate-refusal gates, unit-tested with an injected executor (no live Google call in tests).
  - The `SPACE_PROVISIONING_ENABLED` var defaulting false in `lib/config/server.ts`, and the
    `SpaceProvisionPanel` cost-confirm UI mirroring `ReindexPanel`.
  - Surfacing a provisioned Space in the Spaces directory by merging `provisioned_spaces` into the listing
    read boundary (`app/spaces/page.tsx`), reusing the generic `spaceHref` fallback to `/spaces/[spaceId]`
    so a new Space opens its space-detail with no bespoke page.
- **Build to the seam (live provider).** The executor's live Drive and Discovery Engine clients are the
  real provider, not a fake: the Drive folder create rides the already-authorized DWD posture, and the
  data-store create is the live `createDataStore` inverse of the shipped delete script. The route, the
  cost-confirm, the persisted receipt, the env-wins merge, and the immediate-liveness path are all built
  and wired. The build stops at exactly one thing: the create call is denied until the owner grants the
  identity and billing, and the runtime flag stays false. Everything up to that flip is code the loop
  writes and proves against fakes plus the fail-closed live path.
- **Owner dependency (the one flip).** Two owner actions, then one config flip: (1) a billing approval to
  permit cost-bearing Discovery Engine data-store creation under the roughly ten dollar cap, and (2) a
  service identity permitted to create data stores, granted by giving the app runtime service account (the
  ADC identity `vertex-search.ts` already uses) or a dedicated provisioning service account the
  `roles/discoveryengine.admin` role (`discoveryengine.dataStores.create`). Once both are in place the
  owner sets `SPACE_PROVISIONING_ENABLED=true` in `.env.local` and redeploys (owner-run). Until then the
  provision route fails closed and only the intake plus command-emit render. This flip is a reviewed
  one-line env change plus an IAM grant, never a code change to force the gate on.

**Open questions & assumptions.**

- _Assumption:_ runtime durability is a `provisioned_spaces` Firestore collection merged env-wins, chosen
  because the app cannot rewrite `.env.local` at runtime on Cloud Run and `npm run deploy` re-reads
  `.env.local` (the confirmed 2026-07-22 deploy gotcha, where a Space set only via a one-off env update
  was reverted on the next deploy). The still-emitted `.env.local` lines are the durable redeploy record;
  the Firestore record is what makes the Space live immediately. The alternative (env-only, forced
  redeploy) is rejected because a newly created Space would be dead until an owner deploy.
- _Assumption:_ the Discovery Engine data-store CREATE is the single cost-bearing owner-gated step. The
  Drive folder create rides the existing keyless DWD identity (`mintDriveDwdToken` with the Sheets/Drive
  service account and subject, `drive.file` scope), so it needs no new owner grant; only the data-store
  create needs the new identity and billing.
- _Assumption:_ provisioning is an Admin infrastructure operation (like re-index and `F-ADMIN-USERS`), not
  an Action Registry executable and not a client-facing workflow send. Its gate is therefore
  `SPACE_PROVISIONING_ENABLED` plus the per-Space cost-confirm plus `manageAdmin`, NOT an
  `EXECUTABLE_ALLOWLIST` entry; the roadmap registry gate-flip recipe does not apply here.
- _Assumption:_ document ingestion is NOT auto-run on provision. Creating the empty data store and folder
  is this suite's scope; loading sources stays the separate, already cost-gated re-index control, so a
  provision never triggers a second cost-bearing ingestion. (To be recorded as `Q-SPACE-1` in
  `docs/facts.md` Open Questions when the loop builds this; this spec does not edit `docs/facts.md`.)
- _Assumption:_ the Drive folder is created inside the existing in-boundary location the Sheets/Drive DWD
  subject already uses; the parent/Shared-Drive id reuses today's configuration rather than introducing a
  new owner setting this cycle.
- _Open:_ whether a provisioned Space should also auto-seed a process definition or stay retrieval-only
  until an Admin attaches one. Default: retrieval-only (KB backing), consistent with the intake capturing
  only name, scope, and sources today. Revisit if the owner wants provisioning to also stand up a desk.

**Cross-product impacts.** Reuses `lib/admin/space-request-commands.ts` (slug, duplicate check, env
lines), `lib/firestore/space-requests.ts` (intake record), `lib/google-drive/drive-dwd.ts`
(`GoogleDriveClient.ensureFolder`), `@google-cloud/discoveryengine` `v1.DataStoreServiceClient` (the same
client `scripts/delete-agent-search-data-store.mjs` deletes with), and `lib/retrieval/vertex-search.ts`
(`resolveSearchTargets`). Adds `lib/config/space-maps.ts`, `lib/firestore/provisioned-spaces.ts`,
`lib/admin/space-provisioner.ts`, `app/api/admin/spaces/provision/route.ts`,
`components/admin/SpaceProvisionPanel.tsx`, the `SPACE_PROVISIONING_ENABLED` var in
`lib/config/server.ts`, and `provisioned_spaces` rules in `firestore.rules`; touches `app/spaces/page.tsx`
for directory surfacing. Mirrors the re-index cost-gate (`ReindexPanel`, `reindex-requests.ts`) and the
Admin-op posture of `F-ADMIN-USERS`. Interacts with the demo-prep deploy gotcha (11-space `.env.local`
config) by making the env maps the immutable canonical layer. Supersedes no active guidance; it extends
the D12 intake from command-emit into real provisioning behind a cost gate. The final prompt-sequence step
promotes the shipped work to a new `F-SPACE-PROVISIONING` row in `docs/facts.md` citing the AC ids.

**Adversarial acceptance checks.** Falsifiable, observable states. Verify command list at the end.

- **AC-S36-1** -- The provision route is Admin and cost-confirm gated and fails closed. `POST
/api/admin/spaces/provision` without `confirm:true` returns HTTP 400 and creates nothing; a caller
  lacking `manageAdmin` returns 403; with `confirm:true` while `SPACE_PROVISIONING_ENABLED` is unset or
  false it returns 503, writes NO `provisioned_spaces` record, and calls NEITHER the Drive nor the
  Discovery Engine client. _Verify:_ `npm test -- tests/unit/admin-space-provision-route.test.ts`; keep
  `tests/unit/reindex-requests.test.ts` and `tests/unit/space-request-commands.test.ts` green.
- **AC-S36-2** -- The eleven env Spaces are structurally unclobberable. `resolveSpaceMaps(envMaps,
provisioned)` returns values byte-identical to `envMaps` for every env slug even when a
  `provisioned_spaces` record reuses one of those slugs (env wins), and a provisioned NEW slug appears in
  the effective map. The new sentinel `tests/unit/space-maps-merge.test.ts` fails if the merge order ever
  lets a provisioned record override an env key. _Verify:_ `npm test -- tests/unit/space-maps-merge.test.ts`;
  keep `tests/unit/server-config.test.ts` green.
- **AC-S36-3** -- Provisioning is idempotent and one-attempt. Provisioning a slug already present in the
  env maps OR in `provisioned_spaces` returns 409 and creates nothing; an executor run whose injected
  Discovery Engine `createDataStore` throws PERMISSION*DENIED or a billing-disabled error leaves NO
  `provisioned_spaces` record and NO orphaned config entry, while the Drive `ensureFolder` step is proven
  idempotent (a re-run reuses the existing folder rather than creating a duplicate). \_Verify:* `npm test --
tests/unit/space-provisioner.test.ts`.
- **AC-S36-4** -- A provisioned Space is live without a redeploy. After a successful executor run persists
  a `provisioned_spaces` record, `resolveSearchTargets(effectiveConfig, newSlug)` resolves a target
  (data store plus folder) for the new slug and the search-all enumeration includes it, with NO
  `.env.local` change; the route response still returns the durable `SPACE_*` `.env.local` lines with all
  eleven existing Spaces preserved. _Verify:_ `npm test -- tests/unit/space-maps-merge.test.ts
tests/unit/vertex-search.test.ts`.
- **AC-S36-5** -- The cost-confirm UI mirrors re-index. In `SpaceProvisionPanel` the "Provision this Space
  now" button is disabled until the cost-bearing checkbox is checked; with the flag off the panel renders
  only the recorded request and printed commands (no provision control); on a successful provision it
  renders the persisted receipt showing the real data-store name and Drive folder id. _Verify:_ `npm test
-- tests/unit/space-provision-panel.test.tsx`.
- **AC-S36-6** -- The persistence boundary is closed. `firestore.rules` denies every client write to
  `provisioned_spaces` and allows only Admin reads (proven by the rules test), and
  `SPACE_PROVISIONING_ENABLED` resolves to false by default in `lib/config/server.ts`. _Verify:_ `npm test
-- tests/unit/firestore-rules.test.ts tests/unit/server-config.test.ts`.

_Verify (full):_ `npm test`, `npm run typecheck`, `npm run lint`, then `npm run verify`
(`bash scripts/verify.sh`); `npm run verify:spec-traceability` and `npm run verify:context-freshness` at
the promote step. NAMED existing sentinels to keep green throughout: `tests/unit/space-request-commands.test.ts`,
`tests/unit/reindex-requests.test.ts`, `tests/unit/reindex-command.test.ts`, `tests/unit/vertex-search.test.ts`,
`tests/unit/server-config.test.ts`, and `tests/unit/seed-spaces.test.mjs`.

**Forbidden actions / hard gates.** Restate the safety NEVERs whose violation is itself a falsification: no
autonomous client-facing send (this suite sends nothing); generic non-workflow `gmail.message.send` stays
Registry-closed; the personal `josiah.abernathy@gmail.com` never enters any auth path; no secrets, client
PII, or guessed provider endpoints in git or evidence; the roughly ten dollar cap holds, enforced by the
real billing kill switch; every live effect is one-attempt, idempotent, receipted, and reversible; deploys
and the credential/scope grant stay owner-run. Suite-specific hard stops, each a falsification if violated:
(1) NEVER create a data store without both the per-Space cost-confirm (`confirm:true`) and
`SPACE_PROVISIONING_ENABLED` true; (2) NEVER clobber an env `SPACE_*` entry, the env-wins merge is an
enforced invariant with a named sentinel; (3) fail closed when the flag is off or the create identity
lacks permission, never a partial provision (Drive folder without a data store persists no config record);
(4) the data-store CREATE stays behind the owner billing-plus-identity flip, and the loop does NOT set
`SPACE_PROVISIONING_ENABLED` true; (5) do not auto-run the cost-bearing `import:agent-search` ingestion,
which is its own re-index cost-gate. This suite builds the live provider and its persistence up to the
seam and prepares the flip; it does not enable provisioning until the named owner dependency is documented.

**Ordered prompt sequence.**

1. _Discovery:_ confirm the intake and cost-confirm siblings against `app/api/admin/spaces/request/route.ts`,
   `lib/admin/space-request-commands.ts`, `components/admin/SpaceRequestPanel.tsx`, the re-index trio
   (`ReindexPanel.tsx`, `app/api/admin/reindex/route.ts`, `lib/firestore/reindex-requests.ts`), the delete
   script (`scripts/delete-agent-search-data-store.mjs`, the `createDataStore` inverse), the Drive client
   (`lib/google-drive/drive-dwd.ts`), and the env-only config path (`lib/config/server.ts`,
   `resolveSearchTargets`).
2. _Understanding:_ fix the env-wins merge contract and the flag-fail-closed behavior; enumerate the
   consumers of `spaceVertexDataStoreIds`/`spaceDriveFolderIds` that must read the merged map.
3. _Build:_ add the pure `resolveSpaceMaps` (`lib/config/space-maps.ts`) and its sentinel; wire the async
   merge into `resolveSearchTargets` for single-Space and search-all. (AC-S36-2, AC-S36-4.)
4. _Build:_ add `lib/firestore/provisioned-spaces.ts` plus the `provisioned_spaces` deny-client-write and
   Admin-read rules in `firestore.rules`. (AC-S36-6.)
5. _Build:_ add the `provisionSpace` executor (`lib/admin/space-provisioner.ts`) with injectable Drive and
   Discovery Engine clients: Drive `ensureFolder` first, then `createDataStore`, persist the receipt on
   success, persist nothing on failure; unit-test success, duplicate, ordering, and create-failure.
   (AC-S36-3.)
6. _Build:_ add `SPACE_PROVISIONING_ENABLED` (default false) to `lib/config/server.ts` and
   `app/api/admin/spaces/provision/route.ts` with the manageAdmin, `confirm:true`, flag-503, and
   duplicate-409 gates, unit-tested with an injected executor. (AC-S36-1.)
7. _Build:_ add `components/admin/SpaceProvisionPanel.tsx` on `app/admin/spaces/request/page.tsx`
   mirroring `ReindexPanel`, and surface provisioned Spaces in the Spaces directory (`app/spaces/page.tsx`).
   (AC-S36-5.)
8. _Verify:_ run the full command list above; run a falsification pass (attempt each denial: no confirm,
   no admin, flag off, duplicate slug, injected create failure) and confirm every named sentinel stays
   green.
9. _Gate / Owner:_ STOP at the one flip. Hand back for the owner billing approval plus the
   `roles/discoveryengine.admin` grant to the provisioning identity, then the owner-run
   `SPACE_PROVISIONING_ENABLED=true` plus redeploy. The loop never bills, grants IAM, or deploys.
10. _Context update:_ promote the shipped app-plane and to-the-seam work to a `docs/facts.md`
    `F-SPACE-PROVISIONING` row citing AC-S36-1..6, record `Q-SPACE-1` in Open Questions, register this
    file in `docs/feature-suites/README.md`, `AGENTS.md` Route Table, and the Project Map, and update
    `docs/loop-state.md` at the slice boundary; run `npm run verify:context-freshness` and
    `npm run verify:spec-traceability`.

**Deletion/merge recommendation.** KEEP as this suite's tracked spec. Do NOT merge into the re-index or
intake specs: this is the provisioning executor that turns the D12 command-emit into a real, cost-gated
create, and it owns the runtime-durable config layer that the intake deliberately does not. The disposable
`docs/temp/space-self-provisioning-plan.md` packet, if a builder writes one, stays local-only evidence.
Once built, `F-SPACE-PROVISIONING` records that the app provisions Spaces behind a cost-confirm; the intake
`buildSpaceProvisioningPlan` remains the durable redeploy and duplicate-check source, not superseded.
