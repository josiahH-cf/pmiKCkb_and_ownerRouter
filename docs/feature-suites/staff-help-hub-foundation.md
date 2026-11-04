<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-help-hub-2026-11-04 -->

# S242 — Staff help hub foundation: section, navigation, content model, versioning, print

> Status: Authoring FINAL / READY (intake 108); implementation not started. Owner decisions of 2026-11-04: help content is repository-managed and ships as a release; screenshots come from the isolated synthetic rehearsal, with blurred production captures only where the rehearsal cannot show a state; one global help version; browser print; a table of contents sidebar with collapsible sections; a backend coverage check proves every developed staff feature is documented.

**Goal.**

Every signed-in staff member (Editor, Approver, Admin) can open one Help section from the primary
navigation, find any developed feature through a table of contents with collapsible sections,
read a process-oriented guide for it, print any guide or the whole manual to PDF from the browser,
and see which help version and serving release the guide describes. A deterministic gate proves
that every staff route, navigation item and Space has help coverage, that every control a guide
names exists in the real interface, and that every screenshot a guide references exists.

**Current state / intended end state.**

Authoring baseline: main `173ad2a602111fb4e8c2446ecbad96299a17d2dd` (PR 173 merged
2026-11-04); production serves `b5ba780279be0eb5661e463d2e73b5add1064056` /
`pmi-kc-app-rmw123csb-dc0ce89a8583` at 100% traffic. This is a newly specified delta.

Present behavior, verified in source:

- There is no Help section and no help entry in `lib/navigation/primary-navigation.ts`
  (`PRIMARY_NAVIGATION_MANIFEST` has the groups My Work, Operations and Admin; the Dashboard item
  opens `/ask`). The signed-in header offers Report an issue and the profile link only.
- In-app help is contextual only: 34 About panels on the renewal workspace defined in
  `lib/lease-renewal/section-help.ts` and rendered by
  `components/lease-renewal/RenewalSectionHelp.tsx` over the shared `components/ui/InfoTip.tsx`;
  three further InfoTips (Approval Queue approve/deny availability, Publication checks on the
  process definition page, the environment badge); inline muted helper sentences under controls;
  and the renewal workspace's Process guide panel. S244 refreshes that copy.
- Training material lives outside the app: `docs/products/renewal-operator-guide.md` (its
  step-to-control table is parsed by `scripts/lib/renewal-guide-controls.mjs` and checked against
  the live rehearsal by `scripts/smoke-renewal-guide-controls-browser.mjs` and
  `tests/unit/s132-walkthrough-script.test.ts`), the printable handouts rendered by
  `docs/products/build-renewal-handouts.py`, the staff walkthrough and the meeting runbook.
- Published read-only operational pages exist (`lib/firestore/operational-pages.ts`,
  `lib/operational-pages/schema.ts`) with headings, text, callouts, checklists and internal links
  only, no images and at most 40 components. The owner chose not to use them for help; they stay
  as they are.
- `app/globals.css` has one `@media print` block that hides the top bar, notification menu,
  appearance control and report-issue trigger; no page has a print layout of its own.
- Screenshots exist only as private test output. `public/` holds no assets. The redaction gate
  (`scripts/check-redaction.mjs`) and AGENTS.md keep customer data out of Git.
- `scripts/check-batch005-evidence.mjs` already enumerates every `app/**/page.tsx` route and every
  component as an inventory; that enumeration pattern is reused here for coverage.

Intended end state: a `/help` route family inside the ordinary signed-in shell, a Help item in
the primary navigation for all staff, a repository-managed content model (guides, screen
references, glossary, a What changed page, one global version), a table of contents sidebar whose
sections collapse and expand, deep links to any guide and step, a print layout with "Print this
guide" and "Print the whole manual", and three deterministic checks in `bash scripts/verify.sh`
(coverage, control names, screenshots) plus the content rules gate from S243. The content itself
and the screenshot capture pipeline are S243; the hover refresh and its deep links are S244; the
post-implementation machine litmus is S245.

**Actors and entry conditions.**

- Any authenticated managed staff user with the existing `read` capability (every role) opens
  `/help`. Vendors and residents never see it: the Vendor portal has its own shell and audience.
- No Space scope is required to read help. Guides for Admin-only screens are shown to every role
  and carry a visible "Admin" label; nothing in help grants or implies authority.
- Reading, printing and navigating help issue no writes, send nothing and record nothing beyond
  ordinary page logs. Help never calls a provider.
- Content changes are code changes: they pass the normal gates and ship with a release, because
  help is a served asset. There is no in-app editor.
- Unsigned requests to `/help` behave like every other guarded page (sign-in first).

**What it is / how it functions.**

- **R-S242-1 — Help section and navigation.** Add a `help` item to the primary navigation
  manifest with `visibility: "all-staff"`, a short description and an icon, placed in the first
  group so it is reachable from every page; `validatePrimaryNavigationManifest` still passes.
  `/help` renders inside `AppShell` with the ordinary guards (`requirePageCapability("read")`).
  The section has a landing page (what the app is for, how the manual is organized, the current
  help version, the serving release it describes, and the What changed entry point), one page per
  guide and one page per screen reference, and a print route for the whole manual.
- **R-S242-2 — Table of contents sidebar.** A sidebar lists the manual in reading order: Start
  here; one collapsible section per area (Home and Ask; Lease renewals; Communications; Documents
  and Dotloop; Connections; Admin; Spaces and processes; Approval Queue and Notifications;
  Profile and My Work; Search; Workflow runs; Maintenance history) with the guides inside it;
  Reference (screens and controls); Glossary; What changed. Sections open and close with a
  disclosure control that is keyboard reachable and announced to assistive technology; the current
  page is marked; the section containing the current page is open on arrival; an open or closed
  state persists for the session only. On narrow screens the sidebar becomes a top disclosure
  above the content so the page remains readable on a phone.
- **R-S242-3 — Content model in the repository.** Help content lives in source as typed modules
  (proposed location: a help module directory under lib, named lib/help) with these shapes: a guide (id, section, title, audience role label,
  purpose, prerequisites, ordered steps, result, related screens and guides, last updated date);
  a step (action sentence, the exact control label and semantic role it uses, the route or region,
  the expected result, an optional screenshot scene id, an optional note); a screen reference
  (route, who can open it, every control with its label and what it reads, saves or does not do);
  a glossary term; a changelog entry (version, date, summary, affected guides). A guide's control
  labels are the same strings the interface renders, so the checks below can match them exactly.
  Content strings follow `docs/voice-and-audience.md` (present tense, "the app", no em dash).
- **R-S242-4 — One global help version.** A constant (proposed `HELP_VERSION`, format `V1.0`)
  is shown on the landing page, in every guide's header, on every printed page footer and in the
  whole-manual print. Minor increments (V1.1, V1.2) accompany any content change; a major
  increment accompanies a change to a documented process. Every guide also shows its last
  updated date and the serving release it describes (the application commit, read from the same
  source the environment badge and status pages use). A What changed page lists changelog entries
  newest first; a release that changes help content must add an entry, enforced by a test that
  fails when help content modules change without a version or changelog change.
- **R-S242-5 — Deep links.** Every guide, step and screen reference has a stable id and URL
  (`/help/<section>/<guide>#<step-id>`). The renewal About panels and other hovers (S244) link to
  these ids; a link to an unknown id falls back to the section landing with a visible "This guide
  moved" line rather than a blank page. Deep links are the contract S244 and S245 consume.
- **R-S242-6 — Print layout.** Each guide page has a "Print this guide" control and the landing
  page has "Print the whole manual" (proposed `/help/print`, which renders every guide, reference
  page and glossary in table-of-contents order as one document). Printing uses the browser's own
  dialog; the print stylesheet removes the shell, sidebar and controls, keeps headings, steps,
  expected results and screenshots, scales each screenshot to the printable width without
  cropping, avoids a page break inside one step where the browser supports it, and prints the
  help version, guide title and page number in the footer. No server-generated PDF is part of
  this suite.
- **R-S242-7 — Coverage gate (backend proof).** A deterministic script (proposed name
  scripts/check-help-coverage.mjs, run by `bash scripts/verify.sh`) enumerates: every
  `app/**/page.tsx` route except `api`, `sign-in`, `vendor/**` and the dynamic error/not-found
  files; every primary navigation item; every Space in `lib/spaces.ts` that appears in the
  directory; and every renewal About panel id in `SECTION_HELP_IDS`. It fails unless each one is
  referenced by at least one guide or screen reference, and unless each referenced route or id
  exists (no orphan help). An explicit allow-list with a one-line reason covers a route that is
  intentionally undocumented (for example a redirect-only page); the allow-list is part of the
  gate's output so an exclusion is visible.
- **R-S242-8 — Control-name gate.** Every control label a step names is checked against the real
  interface with the same semantic-locator approach as `scripts/lib/renewal-guide-controls.mjs`
  (role plus exact accessible name inside its owning region): deterministically where a mounted
  component test can render the surface, and in the rehearsal browser smoke lane where it cannot.
  A renamed control makes the check fail with the guide, step and expected label named.
- **R-S242-9 — Screenshot gate.** Every scene id a step references resolves to a committed image
  under the help asset path (proposed `public/help/<version>/<scene>.png`) and every committed
  image is referenced by at least one step; the scene manifest (S243) records the capture source
  for each image. The gate fails on a missing, unreferenced or unmanifested image.
- **R-S242-10 — Content rules gate.** The help content passes the copy-voice gate (jargon and em
  dash rules) and a help-specific check that refuses roadmap and hold language inside guides and
  references: no "not yet", "future", "coming soon", "planned", "has not been proven", "pending
  client" or "blocked on" phrasing, and no reference to the hold register or client decisions.
  Closed gates are described as present behavior (what the screen shows and what the staff member
  does next). The phrase list is a constant in the gate so it can be extended.

**In scope / out of scope.**

In scope: the route family, navigation item, content model and types, version and changelog
mechanics, sidebar and deep links, print layout, the four gates above and their unit tests, and
the documentation of the content model for authors (a short README under the content path).
Out of scope: writing the guides and capturing screenshots (S243), refreshing hover and inline
copy (S244), the adversary litmus (S245), an in-app editor, operational pages, a server-side PDF,
search over help, per-user bookmarks, analytics, and any change to action keys, roles, Spaces,
providers or protected paths.

**Open questions & assumptions.**

- Assumption (labeled): the manifest validator accepts a fourth item in the first group; if it
  constrains icons or ids, the implementer extends the icon set rather than reusing another
  item's icon.
- Assumption (labeled): the serving commit is readable server-side the same way the environment
  badge reads it; if not, the guide header shows the help version and date only, and the release
  identity appears on the landing page from the existing version endpoint (`/api/version`).
- Proposed, not required: file and route names given as "proposed" may change if the implementer
  finds a better fit; the observable outcomes and gates may not.
- Nonblocking unknown: whether browsers honor `break-inside: avoid` for every step block; the
  requirement is best effort with no orphan step headings, verified by inspection in S245.

**Cross-product impacts.**

Surfaces: primary navigation (all staff), a new `/help` route family, print output. Stores: none
(no Firestore collection, no provider). Gates: `bash scripts/verify.sh` gains the coverage,
control-name, screenshot and content-rules checks; the rehearsal smoke lane gains the browser
control check for help steps. Documentation: `docs/products/README.md` points to the hub as the
canonical staff guidance once S243 consolidates the handouts; `docs/README.md` lists the help
content path. Release: help content is a served asset, so every content change ships through the
ordinary candidate, observation and readback gates.

**Authority and evidence map.**

| Input                                                                                             | Classification                   | Use and limitation                                                                                  |
| ------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| AGENTS.md, `lib/navigation/primary-navigation.ts`, `components/ui/InfoTip.tsx`, `app/globals.css` | Authority / implementation truth | Navigation manifest shape and validator; existing help affordances; existing print rules.           |
| `scripts/lib/renewal-guide-controls.mjs`, `scripts/check-batch005-evidence.mjs`                   | Existing pattern                 | Reuse semantic-locator control checks and route/component enumeration for the gates.                |
| `docs/voice-and-audience.md`, `scripts/check-copy-voice.mjs`, `scripts/check-redaction.mjs`       | Authority                        | Copy rules and the customer-data boundary every help string and image must respect.                 |
| Owner clarification 2026-11-04 (this suite's decisions)                                           | Intent evidence                  | Repository-managed content, release-shipped, browser print, global version, sidebar with dropdowns. |
| `lib/firestore/operational-pages.ts`                                                              | Rejected alternative             | Not used for help; preserved unchanged.                                                             |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S242-1** — The navigation manifest contains a `help` item visible to all staff and the
  manifest validator passes; a test that resolves navigation for Editor, Approver and Admin fails
  on the starting state (no item) and passes after.
- **ARCH-S242-2** — Help content modules satisfy a typed schema (guide, step, screen, glossary,
  changelog) and a test that loads every module through the schema fails on the starting state
  (no modules) and passes after.
- **ARCH-S242-3** — The coverage gate script exists, enumerates routes, navigation items, Spaces
  and About ids, and fails when any is unreferenced; a fixture with one undocumented route fails
  and the same fixture with that route allow-listed and explained passes.
- **ARCH-S242-4** — The control-name gate fails for a step naming a label absent from its region
  in a mounted render and passes for the real label; the browser smoke variant reports visible,
  conditional-unavailable or missing per step, like the existing guide smoke.
- **ARCH-S242-5** — The screenshot gate fails on a referenced scene with no image, on an image
  with no referencing step, and on an image missing from the scene manifest.
- **ARCH-S242-6** — The version test fails when a help content module changes without a
  `HELP_VERSION` or changelog change in the same tree.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S242-1** — Signed in as each role, the primary navigation shows Help; opening it renders
  the landing page with the help version, serving release and the table of contents; the
  starting state has no such route (404).
- **BEH-S242-2** — The sidebar section for the current page is open on arrival; activating a
  section header toggles it by pointer and keyboard; the toggle is announced; on a narrow
  viewport the contents live in a disclosure above the content.
- **BEH-S242-3** — A deep link to a step scrolls to and highlights that step; a link to an
  unknown id lands on the section page with the "This guide moved" line.
- **BEH-S242-4** — "Print this guide" produces a print rendering without shell or sidebar, with
  every step, expected result and screenshot present, the version and title in the footer; "Print
  the whole manual" renders every guide, reference and glossary entry in table-of-contents order.
- **BEH-S242-5** — A guide containing a forbidden roadmap phrase or an em dash fails the content
  rules gate with the guide and phrase named.

**Human litmus outcome.**

### Find and print how to do anything in the app

**If this was built correctly:** A new staff member signs in, sees Help in the main navigation,
opens it, and finds every part of the app in a left-hand list whose sections fold open. They can
open any guide, jump straight to a step from a link, see which version of the manual and which
release of the app it describes, and print the guide or the entire manual to PDF from their
browser with the pictures and the version on every page.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                           | Architecture outcome | Behavior outcome | Human litmus                                 | Deterministic evidence / falsification                                          |
| ------------------------------------- | -------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| R-S242-1 section and navigation       | ARCH-S242-1          | BEH-S242-1       | Find and print how to do anything in the app | Navigation resolution test per role; route render test; 404 before.             |
| R-S242-2 table of contents sidebar    | ARCH-S242-2          | BEH-S242-2       | Find and print how to do anything in the app | Mounted sidebar test for open state, toggle, announcement and narrow layout.    |
| R-S242-3 content model                | ARCH-S242-2          | BEH-S242-1       | Find and print how to do anything in the app | Schema test over every module; a malformed module fails.                        |
| R-S242-4 global version and changelog | ARCH-S242-6          | BEH-S242-1       | Find and print how to do anything in the app | Version appears on landing, guide header and print footer; change test.         |
| R-S242-5 deep links                   | ARCH-S242-2          | BEH-S242-3       | Find and print how to do anything in the app | Known id scrolls and highlights; unknown id falls back visibly.                 |
| R-S242-6 print layout                 | ARCH-S242-2          | BEH-S242-4       | Find and print how to do anything in the app | Print media render test for removed shell and present steps, images and footer. |
| R-S242-7 coverage gate                | ARCH-S242-3          | BEH-S242-1       | Find and print how to do anything in the app | Gate fails on an undocumented route and passes with the allow-list.             |
| R-S242-8 control-name gate            | ARCH-S242-4          | BEH-S242-1       | Find and print how to do anything in the app | Renamed label fails with guide, step and label named.                           |
| R-S242-9 screenshot gate              | ARCH-S242-5          | BEH-S242-4       | Find and print how to do anything in the app | Missing, orphan or unmanifested image fails.                                    |
| R-S242-10 content rules gate          | ARCH-S242-2          | BEH-S242-5       | Find and print how to do anything in the app | Forbidden phrase or em dash fails with location.                                |

**Preservation set.**

`tests/unit/s84-*` and other navigation tests, `tests/unit/s115-section-help.test.tsx`,
`tests/unit/s86-infotip.test.tsx`, the existing `@media print` behavior on non-help pages, the
operational pages tests, `scripts/smoke-renewal-guide-controls-browser.mjs` until S243 re-points
it, `bash scripts/verify.sh` lanes, copy-voice, redaction, active-doc-paths and spec-traceability.

**Adversarial acceptance checks.**

- **AC-S242-1** — ARCH-S242-1 / BEH-S242-1: Help is visible for Editor, Approver and Admin and
  absent from the Vendor portal; `/help` renders only for signed-in staff.
- **AC-S242-2** — ARCH-S242-3: removing one documented route from the content makes the coverage
  gate fail naming that route; allow-listing it without a reason still fails.
- **AC-S242-3** — ARCH-S242-4: renaming one control in a mounted component makes the control-name
  gate fail naming the guide and step; the browser smoke reports the same step as missing.
- **AC-S242-4** — ARCH-S242-5: deleting one referenced image fails the screenshot gate; adding an
  image nobody references fails it too.
- **AC-S242-5** — ARCH-S242-6: editing a guide's text without a version or changelog change fails
  the version test.
- **AC-S242-6** — BEH-S242-4: the whole-manual print contains every guide title in
  table-of-contents order and no navigation chrome; each printed page shows the help version.
- **AC-S242-7** — BEH-S242-5: a guide containing "coming soon" fails the content rules gate;
  the same guide with present-tense wording passes.
- **AC-S242-8** — Safety: opening, navigating and printing help performs no write, provider call,
  send or action-key read; the route has no POST handler.

**Forbidden actions / hard gates.**

No in-app editing of help; no Firestore collection or provider for help; no customer, owner,
tenant or vendor identifier in help content or images; no change to action keys, roles, Space
scopes, `firestore.rules`, `lib/auth/**`, the action gate or budget controls; no deployment as
part of authoring; no removal of the existing About panels (S244 refreshes them).

**Dependencies / sequencing.**

Consumes: the navigation manifest, AppShell guards, InfoTip deep-link target ids (S244 adds the
links), `docs/voice-and-audience.md`. Enables: S243 (content and screenshots fill the model and
asset path), S244 (deep links into guides), S245 (the litmus verifies the hub). S242 can ship
with a minimal content set (landing, one guide per section placeholder is not acceptable; it ships
only together with S243's content because the coverage gate would otherwise fail). Sequencing:
S242 and S243 are built together and released together; S244 may ship earlier on its own.

**Standalone delivery contract.**

- **Deliverable now:** routes, navigation item, content model and schema tests, version and
  changelog mechanics, sidebar, deep links, print layout, the four gates with fail-first fixtures,
  and the author README.
- **Consumes, but does not assume:** S243 content; until it lands the coverage gate runs against
  the fixture content in tests and the real gate is enabled in `verify.sh` in the same release
  that carries S243.
- **Externally blocked effect:** none; no provider, key or client input is involved.
- **Produces for downstream suites:** the guide/step/screen schema, scene id contract, deep-link
  URL contract, the gates and their allow-list format.

**Verification and delivery contract.**

1. Before implementation edits, record the starting state: no `/help` route, no navigation item,
   no gates; write the ARCH/BEH checks and confirm they fail for those reasons.
2. Run the focused tests for every ARCH, BEH and AC row; keep preservation tests as a separate
   gate.
3. Run `bash scripts/verify.sh`, inspect the diff, confirm no customer data, no protected path
   and no new write path; the rehearsal smoke lane includes the help control check.
4. Report `ALL_GATES_GREEN` or the exact blocker; delivery is the ordinary release together with
   S243.

**Ordered prompt sequence.**

1. Re-verify current code and the serving release; read the navigation manifest, InfoTip,
   section-help, print CSS and the guide-control smoke.
2. Materialize ARCH-S242-1..6 and BEH-S242-1..5 as failing checks with fixtures.
3. Build the content model, routes, sidebar, version, deep links and print layout.
4. Build the four gates and wire them into `verify.sh` and the rehearsal smoke lane.
5. Falsify with AC-S242-1..8, run focused and canonical tests, update `docs/README.md` and
   `docs/products/README.md`, and ship with S243 under the ordinary release gates.

**Deletion/merge recommendation.**

Retire this suite from the active tree once the hub, its gates and its version mechanics are
represented by code, tests and `docs/facts.md`; S243 then owns content currency.
