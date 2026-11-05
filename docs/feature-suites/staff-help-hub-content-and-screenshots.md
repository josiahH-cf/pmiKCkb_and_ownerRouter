<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-help-hub-2026-11-04 -->

# S243 — Staff help hub content and screenshot pipeline

> Status: DELIVERED 2026-11-04 by run 74d79a9d at 323e8be3; help V1.1 (three guide results that match the app and the 22 recaptured pictures) DELIVERED 2026-11-05 by run 6951545a at 3f2e3f5d; authoring FINAL / READY (intake 109). Writes every process guide and screen reference for the developed staff features, captures their screenshots from the isolated synthetic rehearsal with a repeatable script, allows blurred production captures only where the rehearsal cannot show a state, and consolidates the existing handouts into the hub. Ships with S242 as one release.

**Goal.**

The hub (S242) is complete on first release: a new staff member can follow a process guide for
every developed feature from the first click to the recorded result, each step with the exact
control, the expected result and a picture that matches what they see, with nothing in the manual
describing work that does not exist, is unproven or waits on a client decision.

**Current state / intended end state.**

Authoring baseline: main `173ad2a602111fb4e8c2446ecbad96299a17d2dd`; production serves
`b5ba780279be0eb5661e463d2e73b5add1064056` / `pmi-kc-app-rmw123csb-dc0ce89a8583`.

Present behavior, verified in source and evidence:

- Developed staff features, by route and surface: Home and Ask (`/`, `/ask`, three read-only
  intents with sources); the renewal desk and lease workspace (`/lease-renewal`,
  `/lease-renewal/live/desk`, `/lease-renewal/live/desk/lease/[leaseId]` with its five sections,
  Focus and Full views, lease information panel, work status and notes, corrections, Rent and
  charges working area, Sheet and RentVine previews and exact confirmations, comps and RentCast
  links, owner and tenant message preparation, owner approval evidence, tenant response, packet
  readiness and document preparation, returned documents and signatures, resource links);
  readiness, collections, property, notices and runs pages under `/lease-renewal/**`;
  Communications (`/gmail-hub`: compose, Save draft, Schedule, Send, worker health, linked
  replies, delivery evidence); Connections (`/connections`: mailbox, Dotloop connection and
  selection, resource links); Admin (`/admin` and `/admin/**`: people and access, notice timing
  basis, family use, packet policy, operational pages, re-index handoff, presentation, team work,
  migration, Gmail settings); Spaces and processes (`/spaces`, `/spaces/[spaceId]`,
  `/spaces/[spaceId]/pages/[slug]`, `/processes`, `/processes/[definitionId]`: publish a
  definition, Start a run, complete steps, step checks); Approval Queue (`/approval-queue`);
  Notifications (`/notifications`); Profile (`/profile`) and My Work (`/work`); Search
  (`/search`, `/search/entity`, `/search/open`); Workflow runs (`/workflow-runs/[runId]`);
  retained maintenance history (`/maintenance/**`, read-only). Excluded by owner decision: the
  Vendor portal (`/vendor/**`) and sign-in pages.
- Present closed or held states a staff member can meet today and that the guides must describe
  as present behavior: both Dotloop write keys closed (packet preview stops before creation;
  signing continues in Dotloop by hand); the existing-Space re-index plan shows no command; the
  Owner Renewal Outreach process is published with zero runs; forms show no approved original or
  map; paid RentCast lookups are allowance-controlled.
- The isolated synthetic rehearsal (`scripts/run-renewal-novdec-journey.sh`,
  `tests/browser/renewal-novdec-journey-browser.mjs`, `tests/browser/renewal-novdec-journey-network.mjs`)
  runs the real build in the Demo descriptor against a Firestore emulator and synthetic RentVine
  and Google stand-ins with every other outbound connection refused, signs in as a local demo
  Editor or Admin, and already drives 34 journey steps through the real interface. The local
  rehearsal started by `scripts/run-local-rehearsal.mjs` is different: it reads live data
  read-only, so it is not a screenshot source.
- Existing handouts: `docs/products/renewal-operator-guide.md` (machine-checked step table),
  `renewal-training-guide.pdf`, `wednesday-meeting-brief.pdf`,
  `docs/products/renewal-client-walkthrough-2026-09-09.md`,
  `docs/products/renewal-meeting-walkthrough-runbook.md`, `build-renewal-handouts.py`,
  indexed by `docs/products/README.md` (the two PDFs and the build script were removed by this
  suite; the three Markdown handouts are pointers to the hub).

Intended end state: the complete guide set and screen references in the S242 content model, a
scene manifest and capture script that regenerate every screenshot from the synthetic rehearsal,
a documented blur procedure for the few production-only states, the handouts consolidated into
the hub, and the existing guide checkers pointed at the hub's step tables.

**Actors and entry conditions.**

- Authors are engineers; content is reviewed like code. The owner or a staff reviewer reads the
  rendered hub before release (S245 runs the machine litmus first).
- The capture script runs only against the isolated synthetic rehearsal; it refuses any base URL
  that is not the rehearsal's loopback origin, exactly as the existing smokes do.
- A production capture is a manual, documented exception: taken by the owner's approved session,
  blurred before it enters the tree, and recorded in the scene manifest with its reason.

**What it is / how it functions.**

- **R-S243-1 — Process guides.** Write one guide per staff process, each as numbered steps with
  the action, the exact control label, the expected result and a scene: Sign in and find your way
  around; Work a renewal from the desk to a recorded outcome (desk filters, open a lease, read
  facts and freshness, correct a working value, record work status and notes); Compare rent and
  record market evidence (comps, RentCast reports, working renewal terms); Prepare, send or
  schedule an owner message and record the owner's answer (copy, unsent Gmail draft, Communications
  compose, Save draft, Schedule, Send, linked reply, approval evidence, re-approval after a change);
  Prepare the tenant offer and record the response; Update RentVine and the operating Sheet
  (preview, exact confirmation, receipt, readback, reconcile); Prepare documents and hand off to
  Dotloop (packet inputs, readiness table, document preparation, preview, returned documents and
  signatures); Run the Owner Renewal Outreach checklist (open the Space, Start, complete steps,
  step checks, where a run appears); Publish a process definition (edit, save with the reviewed
  revision, publish, read the active version); Approve or deny in the Approval Queue; Read and
  act on Notifications; Use My Work and your Profile; Search; Manage Connections (mailbox, Dotloop
  connection and selection, resource links); Admin tasks (people and access, notice timing basis,
  family use, packet policy, operational pages, re-index handoff, presentation, team work); Read
  retained maintenance history. Each guide ends with "What this does not do" written as present
  behavior (for example, "The app does not sign documents; signing happens in Dotloop").
- **R-S243-2 — Screen references.** One reference page per staff route or distinct screen
  listing every control by its rendered label and semantic role, what it reads, saves or does
  not do, who can use it (role label), and the guides that use it. Reference pages carry the same
  scene pictures as the guides where helpful.
- **R-S243-3 — Glossary and What changed.** Define every term a new staff member meets (for
  example working value, exact confirmation, receipt, readback, admitted source read, packet
  context, family use, reviewed revision, Active version, retained history). What changed starts
  at V1.0 with one entry.
- **R-S243-4 — Content rules.** Present tense; "the app"; no em dash; no roadmap, hold, client
  decision or proof language (S242's content rules gate); closed gates described by what the
  screen shows and what the person does next; no customer, owner, tenant, vendor, address, rent or
  email value in any text or image; every control label copied from the interface; every step
  that changes a source names the exact confirmation it needs; every step that only reads says so.
- **R-S243-5 — Scene manifest and capture script.** A manifest lists every scene: id, guide and
  step, route, role, fixture state, viewport, the element or region to frame, and the capture
  source (`rehearsal` or `production-blurred`). A script (proposed name
  scripts/capture-help-screenshots.mjs) starts or attaches to the isolated synthetic rehearsal,
  seeds the fixture state each scene needs, signs in with the scene's role, navigates, waits for
  the named region, captures at a fixed viewport and writes
  `public/help/<HELP_VERSION>/<scene>.png`. Re-running the script against the same build and
  fixtures reproduces every rehearsal scene; the script reports scenes it could not capture
  instead of skipping them.
- **R-S243-6 — Fidelity.** Rehearsal screenshots show the same build the release ships (the
  capture run records the commit) and the same interface a staff member sees; only the data is
  synthetic, with fixture names that are visibly not real people or properties. A scene whose
  state the rehearsal cannot reach (for example a connected production Dotloop account, a real
  RentCast retained lookup, the live People list) is captured from production by an approved
  session, then names, addresses, email addresses, amounts and identifiers are blurred before the
  image enters the tree; the manifest entry records `production-blurred`, the date and who
  blurred it. No unblurred production capture is ever committed.
- **R-S243-7 — Consolidation.** The hub becomes the canonical staff guidance. The operator guide,
  training guide PDF, meeting brief PDF, staff walkthrough and meeting runbook are retired from
  `docs/products/` or reduced to a pointer, and `docs/products/README.md` and `docs/README.md`
  point to the hub. `scripts/smoke-renewal-guide-controls-browser.mjs` and
  `tests/unit/s132-walkthrough-script.test.ts` read the hub's step content (through a parser over
  the content modules, or the hub emits the same table shape) so the 42-step semantic check is not
  lost. `build-renewal-handouts.py` is removed with the PDFs it rendered.
- **R-S243-8 — Coverage proof.** The S242 coverage gate passes against the real content with an
  empty or explained allow-list; every route, navigation item, directory Space and About id is
  referenced.

**In scope / out of scope.**

In scope: all guides, references, glossary, changelog V1.0, the scene manifest, the capture
script, the blur procedure and its attestation field, the consolidation of the handouts and the
re-pointing of the guide checkers. Out of scope: the hub mechanics (S242), hover copy (S244), the
litmus (S245), documentation of the Vendor portal or resident intake, any client-facing material
(the private copy-only client workflow stays separate), video, and any change to application
behavior that a guide would prefer.

**Open questions & assumptions.**

- Assumption (labeled): the synthetic fixtures can be extended to reach every renewal state a
  guide shows (for example a lease with recurring charges, an approved filled copy, a scheduled
  message); where a state needs a fixture the journey lacks, the implementer adds the fixture
  rather than capturing production.
- Nonblocking unknown: the exact count of production-blurred scenes; expected to be small
  (Connections with a real Dotloop account, Admin people list, RentCast report). Each is listed in
  the manifest with its reason.
- Nonblocking unknown: whether the existing 42-step guide checker can parse the content modules
  directly; if not, the hub exports the same seven-column table at build time.

**Cross-product impacts.**

Surfaces: the hub pages (S242), every staff route as a screenshot subject. Stores: none. Gates:
coverage, control-name, screenshot and content rules (S242) run against this content; the
rehearsal smoke lane runs the capture script in check mode (no writes) to prove scenes still
resolve. Documentation: `docs/products/**` consolidation, `docs/README.md`. Release: ships with
S242 under the ordinary gates; content updates after that are minor help versions released the
same way.

**Authority and evidence map.**

| Input                                                                                 | Classification                   | Use and limitation                                                                      |
| ------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Committed routes, components, `lib/lease-renewal/section-help.ts`, operator guide     | Authority / implementation truth | The inventory of what exists and the exact control labels guides must use.              |
| `scripts/run-renewal-novdec-journey.sh`, `tests/browser/renewal-novdec-journey-*.mjs` | Existing pattern                 | The isolated synthetic environment and transport the capture script reuses.             |
| `docs/evidence/application-gap-delivery-2026-11-03.md`, `docs/status.md`              | Dated evidence                   | Which states are present today (closed keys, non-runnable re-index, zero runs).         |
| AGENTS.md, `scripts/check-redaction.mjs`, `docs/voice-and-audience.md`                | Authority                        | Customer data stays out of Git; copy rules.                                             |
| Owner clarification 2026-11-04                                                        | Intent evidence                  | Synthetic captures must match the real interface one for one, else blur; everything in. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S243-1** — The scene manifest validates against its schema and every scene names an
  existing guide step; a scene with an unknown step fails.
- **ARCH-S243-2** — The capture script refuses a non-rehearsal origin and refuses to run when the
  rehearsal's build commit differs from the working tree's commit unless `--allow-overlay` is
  given and recorded in the capture log.
- **ARCH-S243-3** — The production-blurred path requires the manifest fields reason, date and
  attestation; a `production-blurred` scene missing any of them fails the screenshot gate.
- **ARCH-S243-4** — The guide checkers (`s132-walkthrough-script`, the guide-controls smoke) read
  the hub content and fail when a hub step names a control absent from the interface.
- **ARCH-S243-5** — The coverage gate passes on the full content with every exclusion explained.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S243-1** — Running the capture script twice against the same build and fixtures yields
  the same set of scene files with no scene reported as uncaptured.
- **BEH-S243-2** — Every guide renders with its steps in order, each step showing the control
  label, the expected result and its picture; a guide with a step lacking an expected result fails
  the schema test.
- **BEH-S243-3** — The content rules gate passes on the full content; injecting "pending client"
  into one guide fails it naming the guide.
- **BEH-S243-4** — After consolidation, `docs/products/README.md` points to the hub and the retired
  handouts are absent from the active tree; the 42 semantic guide steps still pass from the hub's
  content.

**Human litmus outcome.**

### Learn every process from the manual alone

**If this was built correctly:** A new team member who has never used the app can pick any job the
team does (renew a lease, message an owner, prepare documents, run the outreach checklist, approve
an item, fix a connection, change an admin setting) and complete it by following the guide step by
step, with every picture matching the screen in front of them and no step that sends them to a
feature that is not there.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome     | Behavior outcome | Human litmus                              | Deterministic evidence / falsification                            |
| ----------------------------------- | ------------------------ | ---------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| R-S243-1 process guides             | ARCH-S243-5              | BEH-S243-2       | Learn every process from the manual alone | Every listed process has a guide; schema and coverage gates pass. |
| R-S243-2 screen references          | ARCH-S243-5              | BEH-S243-2       | Learn every process from the manual alone | Every staff route has a reference; control-name gate passes.      |
| R-S243-3 glossary and What changed  | ARCH-S243-5              | BEH-S243-2       | Learn every process from the manual alone | Glossary terms resolve from guides; changelog has V1.0.           |
| R-S243-4 content rules              | ARCH-S243-5              | BEH-S243-3       | Learn every process from the manual alone | Content rules gate and copy-voice pass; injected phrase fails.    |
| R-S243-5 scene manifest and capture | ARCH-S243-1, ARCH-S243-2 | BEH-S243-1       | Learn every process from the manual alone | Manifest schema; refusal of wrong origin; reproducible run.       |
| R-S243-6 fidelity and blur          | ARCH-S243-3              | BEH-S243-1       | Learn every process from the manual alone | Attestation fields enforced; S245 visual comparison.              |
| R-S243-7 consolidation              | ARCH-S243-4              | BEH-S243-4       | Learn every process from the manual alone | Checkers read hub content; handouts retired; index updated.       |
| R-S243-8 coverage proof             | ARCH-S243-5              | BEH-S243-3       | Learn every process from the manual alone | Coverage gate green with explained allow-list.                    |

**Preservation set.**

The isolated journey (`npm run smoke:renewal-novdec-journey`) and its network refusals, the
existing 42-step semantic guide check (re-pointed, not weakened), `tests/unit/s132-*`,
`tests/unit/s115-section-help.test.tsx`, redaction gate, copy-voice, and every lane of
`bash scripts/verify.sh`.

**Adversarial acceptance checks.**

- **AC-S243-1** — ARCH-S243-5: the coverage gate lists zero unreferenced routes, navigation items,
  Spaces and About ids on the shipped content, with any allow-list entry explained.
- **AC-S243-2** — BEH-S243-1: two capture runs on the same build produce identical scene sets; a
  scene whose region cannot be found is reported, not silently dropped.
- **AC-S243-3** — ARCH-S243-2: the capture script refuses a production or non-loopback base URL.
- **AC-S243-4** — ARCH-S243-3: a `production-blurred` scene without attestation fails the gate;
  visual inspection of each such image shows no readable name, address, email, amount or id.
- **AC-S243-5** — BEH-S243-3: no guide or reference contains a forbidden phrase, an em dash, a
  hold identifier, a client name or a customer value.
- **AC-S243-6** — BEH-S243-2: every step in every guide names a control that the control-name gate
  finds in the real interface, and every step has an expected result.
- **AC-S243-7** — BEH-S243-4: the retired handouts are gone from the active tree, the product README
  points to the hub, and the semantic guide check still passes from hub content.
- **AC-S243-8** — Safety: the capture script performs no write to any provider or production store;
  the rehearsal's refused-connection log is empty of anything but the known registry checks.

**Forbidden actions / hard gates.**

No unblurred production screenshot in Git; no capture against production by script; no customer
or client value in content; no guide describing unreleased, unproven or held work; no change to
application behavior to make a guide simpler; no deletion of the isolated journey or its
refusals; no client-facing material in the hub.

**Dependencies / sequencing.**

Consumes S242's content model, scene id contract and gates; the isolated synthetic rehearsal and
its fixtures; the existing guide-control checker. Enables S245 (litmus runs on this content) and
future minor help versions. Ships with S242 as one release; S244 may ship before or with it.

**Standalone delivery contract.**

- **Deliverable now:** all guides, references, glossary, changelog, manifest, capture script, blur
  procedure, consolidation and checker re-pointing, with fail-first tests.
- **Consumes, but does not assume:** S242 routes; until merged together, content and script are
  tested against the S242 schema and a mounted renderer.
- **Externally blocked effect:** none. Production-blurred captures need the owner's approved
  session, which exists; if a state cannot be captured, the step uses a rehearsal scene of the
  nearest present state and says what differs.
- **Produces for downstream suites:** the complete content set and manifest S245 verifies.

**Verification and delivery contract.**

1. Record the starting state (no content modules, no manifest, handouts present), then write the
   ARCH/BEH checks and confirm they fail for those reasons.
2. Write content and capture scenes; run the schema, coverage, control-name, screenshot and content
   rules gates until green; run the capture script twice for reproducibility.
3. Run `bash scripts/verify.sh`, the isolated journey and the guide-control smoke; inspect every
   committed image for customer data; audit the diff for protected paths.
4. Report `ALL_GATES_GREEN`; release together with S242 under the ordinary gates; S245 runs after
   the release candidate is built.

**Ordered prompt sequence.**

1. Re-verify the route inventory, control labels, present closed states and the rehearsal fixtures.
2. Materialize ARCH-S243-1..5 and BEH-S243-1..4 as failing checks.
3. Author the guides, references, glossary and changelog; build the manifest and capture script;
   capture every rehearsal scene; blur and attest the production-only scenes.
4. Consolidate the handouts and re-point the checkers.
5. Falsify with AC-S243-1..8, run the gates, and ship with S242.

**Deletion/merge recommendation.**

Keep this suite active while content currency is owned by it; retire it when help versioning,
the capture script and the gates fully own content maintenance in code, tests and
`docs/facts.md`.
