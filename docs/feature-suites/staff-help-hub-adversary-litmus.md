<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-help-hub-2026-11-04 -->

# S245 — Staff help hub adversary litmus (machine-run verification of the manual)

> Status: Authoring FINAL / READY (intake 111); runs after S242, S243 and S244 are implemented. Defines the fresh-session verification handoff an outside model executes against the built hub and the real interface, how its result is recorded, and the repair loop. Nothing here is a client dependency.

**Goal.**

Before the help hub release is accepted, a model with no memory of this project verifies, from a
paste-ready brief and Yes/No checks, that the manual covers every developed staff feature, that
every step and picture matches the real interface, that no statement describes unproven, future
or held work, that hovers agree with the guides, and that printing works, and records exactly
which checks passed, failed, were repaired or could not be verified.

**Current state / intended end state.**

Authoring baseline: main `173ad2a602111fb4e8c2446ecbad96299a17d2dd`; production serves
`b5ba780279be0eb5661e463d2e73b5add1064056` / `pmi-kc-app-rmw123csb-dc0ce89a8583`. No hub exists
yet; this suite's handoff applies after S242 to S244 are implemented and is not a claim that they
are. The project already runs isolated adversary reviews (for example the November 4 review that
produced the Q-ENG-ADV rows) and keeps raw evidence outside Git; this suite follows that pattern.

Intended end state: the handoff below is run by a fresh session against the release candidate's
build in the isolated synthetic rehearsal (and read-only against production only for the
navigation presence check after release), its console report is saved as
`docs/evidence/help-hub-litmus-<date>.md` with raw screenshots and logs outside Git, failures are
repaired within S242 to S244 scope and re-run, and the release is accepted only when no check is
No and every UNVERIFIED check names its evidence gap.

**Actors and entry conditions.**

- The runner is a fresh model session with the repository, the isolated rehearsal and the
  verify lanes available; it is authorized to run tests, start the rehearsal, capture its own
  screenshots in a temporary location and repair failures inside S242 to S244 scope. It is not
  authorized to deploy, send, write to any provider, touch production data or change protected
  paths.
- The owner or an engineer launches the run once the S242 to S244 slice reports
  `ALL_GATES_GREEN` and before release admission; a second run follows any repair.
- A human verdict remains separate (NOT RUN unless a staff member performs the litmus).

**What it is / how it functions.**

- **R-S245-1 — The handoff is a repository artifact.** The paste-ready brief and checks below are
  the deliverable; they are kept current with the hub's content (a new guide or section adds its
  check) and are regenerated for each help version.
- **R-S245-2 — Execution.** The runner starts the isolated synthetic rehearsal at the candidate
  commit, signs in as Editor, Approver and Admin in turn, and exercises the hub and the real
  screens the guides describe; it compares each guide's pictures with the live screen, follows
  each guide step on the real interface, prints to PDF through the browser, and runs the gates.
- **R-S245-3 — Reporting.** For every check the runner reports Yes or No with concise observed
  evidence, or UNVERIFIED with the reason and what would resolve it; it separates initial failures,
  repairs, final observations and remaining blockers; the report is committed as evidence with no
  customer value and no raw screenshot.
- **R-S245-4 — Repair loop.** The runner repairs observed failures inside S242 to S244 scope,
  reruns the affected checks and the preservation lanes, and never weakens a check, disables a
  gate or invents a product decision; a failure needing an owner decision is reported as a
  blocker with the exact question.
- **R-S245-5 — Acceptance.** The hub release is accepted when the final report has no No, every
  UNVERIFIED names an evidence gap outside the runner's control, and `bash scripts/verify.sh` is
  green on the final tree.

**In scope / out of scope.**

In scope: the handoff text, its maintenance rule, the execution environment, the report format,
the repair loop and the acceptance rule. Out of scope: human acceptance, production writes,
release execution, verification of unrelated features, and any check not grounded in S242 to
S244 or the owner's decisions.

**Open questions & assumptions.**

- Assumption (labeled): the rehearsal can serve the candidate build; if the runner can only mount
  components, visual checks are reported UNVERIFIED with that reason rather than inferred.
- Nonblocking unknown: the number of production-blurred scenes; the runner inspects each one.

**Cross-product impacts.**

Surfaces: every staff route the guides cover. Stores and providers: none touched. Gates: the
runner executes the S242 gates and the verify lanes. Documentation: one evidence file per run.

**Authority and evidence map.**

| Input                                                           | Classification      | Use and limitation                                                             |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| S242, S243, S244 contracts and the owner's 2026-11-04 decisions | Authority           | The expected outcomes every check is derived from.                             |
| The candidate build in the isolated synthetic rehearsal         | Verification target | The only environment the runner exercises; production is read-only navigation. |
| The November 4 adversary review pattern                         | Existing pattern    | Raw evidence outside Git; sanitized report inside.                             |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S245-1** — A test asserts the handoff names every hub section and every guide present in
  the content model; adding a guide without a check fails.
- **ARCH-S245-2** — The report template exists with the fields check id, verdict, evidence,
  repair and blocker; a report missing a verdict for any check fails its own validator.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S245-1** — A run on a tree where one guide references a stale control label ends with
  that check No and, after repair, Yes; the evidence file records both states.
- **BEH-S245-2** — A run cannot be marked accepted while any check is No.

**Human litmus outcome.**

### Someone who was not here proves the manual is true

**If this was built correctly:** An outside reviewer with only the brief below can open the app,
follow the manual, and say for every claim whether it holds, and the team can read that report
and trust the manual before staff are trained on it.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement               | Architecture outcome | Behavior outcome | Human litmus                                       | Deterministic evidence / falsification             |
| ------------------------- | -------------------- | ---------------- | -------------------------------------------------- | -------------------------------------------------- |
| R-S245-1 handoff artifact | ARCH-S245-1          | BEH-S245-1       | Someone who was not here proves the manual is true | Coverage test of checks over guides.               |
| R-S245-2 execution        | ARCH-S245-2          | BEH-S245-1       | Someone who was not here proves the manual is true | Report with per-check evidence from the rehearsal. |
| R-S245-3 reporting        | ARCH-S245-2          | BEH-S245-2       | Someone who was not here proves the manual is true | Validator refuses incomplete reports.              |
| R-S245-4 repair loop      | ARCH-S245-2          | BEH-S245-1       | Someone who was not here proves the manual is true | Initial failure and repaired state both recorded.  |
| R-S245-5 acceptance       | ARCH-S245-2          | BEH-S245-2       | Someone who was not here proves the manual is true | Acceptance blocked by any No.                      |

**Preservation set.**

The S242 gates, the isolated journey, all `bash scripts/verify.sh` lanes, redaction and
copy-voice; none is modified by a run.

**Adversarial acceptance checks.**

- **AC-S245-1** — ARCH-S245-1: a guide with no litmus check fails the coverage test.
- **AC-S245-2** — BEH-S245-2: a report with one No cannot be recorded as accepted.
- **AC-S245-3** — Safety: a run makes no provider call, production write, send or deployment; its
  temporary outputs are removed and the report contains no customer value.

**Forbidden actions / hard gates.**

No production writes, sends, deployments, key or role changes; no weakening of any check or gate;
no raw screenshot or customer value in Git; no human verdict inferred from the model's run.

**Dependencies / sequencing.**

Consumes the implemented S242 to S244 slice and the isolated rehearsal. Enables release admission
of the hub. Runs after `ALL_GATES_GREEN` and before release; again after any content release.

**Standalone delivery contract.**

- **Deliverable now:** the handoff below, the coverage test, the report template and validator.
- **Consumes, but does not assume:** the built hub; without it the handoff is a pre-implementation
  artifact and the run is not started.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** the evidence file and acceptance signal.

**Verification and delivery contract.**

1. After S242 to S244 report green, paste the handoff into a fresh session with the repository
   and rehearsal available.
2. Let the runner execute, repair in scope, re-run, and produce the report.
3. Commit the sanitized report; keep raw evidence outside Git; admit the release only on
   acceptance.

**Ordered prompt sequence.**

1. Confirm the S242 to S244 slice is green at a named commit.
2. Run the handoff below in a fresh session; record the report.
3. Repair and re-run until accepted or blocked on a named owner decision.

**Deletion/merge recommendation.**

Keep while the hub ships content releases; retire when the litmus is folded into the release
checklist as a standing step with its coverage test in code.

---

## Litmus handoff (paste-ready)

Verify the implementation of the PMI KC staff help hub: suites S242 (`docs/feature-suites/staff-help-hub-foundation.md`), S243 (`docs/feature-suites/staff-help-hub-content-and-screenshots.md`) and S244 (`docs/feature-suites/in-app-help-copy-refresh.md`) in the repository `josiahH-cf/pmiKCkb_and_ownerRouter`, at the commit named in the launch message. PMI KC is the staff operations app (lease renewals, communications, documents and Dotloop readiness, connections, admin, spaces and processes). The hub is a signed-in `/help` section whose content is repository-managed, versioned as one global help version (`V1.x`), illustrated with screenshots captured from the isolated synthetic rehearsal (blurred production captures only where the rehearsal cannot show a state), printable through the browser, and gated so every staff route, navigation item, directory Space and About panel is documented and every named control exists. The owner's rule for content is that it describes only what exists and works today; closed gates (both Dotloop write keys closed, signing by hand in Dotloop, the re-index plan with no command, the outreach process published with zero runs) are described as present behavior, never as future work or client holds.

Run everything in the isolated synthetic rehearsal (`scripts/run-renewal-novdec-journey.sh` and its browser harness, or the equivalent capture entry point S243 added) at that commit; never against production except the read-only navigation check named below. Sign in as Editor, Approver and Admin where a check names a role. Exercise the real pages and the hub, compare pictures with the live screen, print to PDF with the browser, and run `bash scripts/verify.sh` and the S242 gates. You may create synthetic fixture data, temporary helpers and screenshots in a temporary directory; remove them when done and confirm cleanup. Repair failures inside S242 to S244 scope, re-run the affected checks and the preservation lanes, and never weaken a check, disable a gate, or invent a product decision; report a needed decision as a blocker with the exact question. Report in chat: for each check Yes or No with concise observed evidence, or UNVERIFIED with the reason and what would resolve it; separate initial failures, repairs, final observations and remaining blockers. Do not infer human acceptance.

- L01 Signed in as an Editor, the primary navigation shows a Help item; the same is true for an Approver and an Admin; the Vendor portal shows no Help item.
- L02 Opening Help lands on a page that states the help version in the form V1.x, the serving application commit it describes, and a short orientation, and offers "Print the whole manual" and "What changed".
- L03 The table of contents sidebar lists Start here; one section per area (Home and Ask; Lease renewals; Communications; Documents and Dotloop; Connections; Admin; Spaces and processes; Approval Queue and Notifications; Profile and My Work; Search; Workflow runs; Maintenance history); Reference; Glossary; What changed, in that order.
- L04 Each sidebar section opens and closes by pointer and by keyboard, the open or closed state is announced to assistive technology, the section containing the current page is open on arrival, and the current page is visibly marked.
- L05 On a 375 pixel wide viewport the table of contents is a disclosure above the content and every guide remains readable without horizontal scrolling.
- L06 Every staff route under `app/` except `api`, `sign-in` and `vendor/**` is referenced by at least one guide or reference page, and the coverage gate run on the tree reports zero unreferenced routes, navigation items, directory Spaces and About ids, with any allow-list entry carrying a reason.
- L07 Removing one documented route from the help content (temporarily, in the working tree) makes the coverage gate fail naming that route; restoring it makes the gate pass.
- L08 Every guide named in S243 R-S243-1 exists: sign in and find your way; work a renewal from the desk to a recorded outcome; compare rent and record market evidence; prepare, send or schedule an owner message and record the answer; prepare the tenant offer and record the response; update RentVine and the operating Sheet; prepare documents and hand off to Dotloop; run the Owner Renewal Outreach checklist; publish a process definition; approve or deny in the Approval Queue; read and act on Notifications; use My Work and your Profile; search; manage Connections; Admin tasks; read retained maintenance history.
- L09 Every step in every guide shows an action sentence, the exact control label, the expected result and, where the manifest assigns one, a picture; no step is missing its expected result.
- L10 For each guide, following its steps on the real interface in the rehearsal as the stated role reaches the stated result, and every control label named in a step is found by role and exact accessible name inside the stated region.
- L11 Renaming one control in a mounted component (temporarily) makes the control-name gate fail naming the guide, the step and the expected label; the rehearsal browser check reports the same step as missing.
- L12 For at least one scene in each section, the committed screenshot matches the live rehearsal screen for layout, labels and control placement, differing only in synthetic data values; any difference in a label or a missing control is reported as No for that section.
- L13 Every picture referenced by a step exists under the help asset path, every committed picture is referenced by a step, and the scene manifest lists each picture with its capture source; the screenshot gate passes and fails when one image is deleted.
- L14 Every scene marked `production-blurred` in the manifest carries a reason, a date and an attestation, and visual inspection of each such image shows no readable name, address, email address, amount or identifier.
- L15 No committed picture of any kind shows a real owner, tenant, vendor, address, email address, rent amount or record identifier.
- L16 Running the capture script twice against the same build and fixtures produces the same set of scene files and reports no uncaptured scene; running it with a production or non-loopback base URL is refused.
- L17 The help content contains no sentence that describes future, planned, unproven, pending or held work: searching guides, references and glossary for "not yet", "future", "coming soon", "planned", "has not been proven", "pending client", "blocked on", hold identifiers such as B- or U- codes, and client names finds nothing, and the content rules gate passes.
- L18 The guide for documents and Dotloop describes that the packet preview stops before creation while both write keys are closed and that signing continues in Dotloop by hand, as present behavior, and the Admin re-index guide describes the plan showing no command as present behavior, with what the person does next in each case.
- L19 Every guide ends with "What this does not do" lines written in the present tense, and none claims that the app sends, signs, pays or writes to a provider without the person's exact confirmation.
- L20 All help text passes the copy-voice gate: no em dash and no rejected jargon; body copy calls the product "the app".
- L21 Every guide header shows the help version, its last updated date and the serving release it describes; the What changed page lists a V1.0 entry.
- L22 Editing one guide's text in the working tree without changing the help version or the changelog makes the version test fail; adding a changelog entry makes it pass.
- L23 A deep link of the form `/help/<section>/<guide>#<step-id>` for an existing step opens the guide scrolled to that step with the step highlighted; a link with an unknown id lands on the section page with a visible "This guide moved" line and no blank page or error.
- L24 "Print this guide" on any guide produces a browser print rendering with no top bar, sidebar or controls, every step, expected result and picture present, pictures fitting the printable width without cropping, and the help version and guide title in the footer of each page.
- L25 "Print the whole manual" renders every guide, reference page and glossary entry in table-of-contents order as one printable document with page numbers and the help version on each page; the resulting PDF opens and is complete.
- L26 Every About panel on the renewal workspace and every InfoTip (Approve availability, Deny availability, Publication checks, the environment badge) ends with "Open the guide", and activating it navigates to a hub step that shows that control in its process and closes the panel.
- L27 The document preparation and signature handoff help no longer mentions an Admin approval reason or an Admin confirming each provider action and instead describes ordinary renewal staff confirming their own operation through the exact preview and confirmation; the working renewal terms help no longer says the packet does not read them.
- L28 Searching all hover, InfoTip, inline helper and Process guide copy for "Admin approval reason", "approval note", "Dan approves", "does not read them yet" and any roadmap or hold phrasing finds nothing, and the disposition table lists every help text with a disposition.
- L29 Opening any About panel or InfoTip issues no network request and records nothing; hover, focus, click, touch and Escape behave as before the refresh.
- L30 Each About panel's "Saves" and "Does not" statements agree with the linked guide step's expected result and "What this does not do" lines; injecting a contradiction (temporarily) fails the consistency gate naming the panel and step.
- L31 The retired handouts (operator guide, training guide PDF, meeting brief PDF, staff walkthrough, meeting runbook, handout generator) are absent from the active tree or reduced to a pointer, `docs/products/README.md` and `docs/README.md` point to the hub, and the 42-step semantic guide check still passes from the hub's content.
- L32 Help pages, printing and navigation perform no write, provider call, send or action-key change; the `/help` routes have no POST handler and the rehearsal's refused-connection log shows nothing beyond the known registry checks.
- L33 `bash scripts/verify.sh` passes on the final tree with the coverage, control-name, screenshot and content rules gates included, and the isolated journey still passes.
- L34 Temporary fixtures, helpers and screenshots created for this verification are removed and the removal is confirmed; the sanitized report contains no customer value and no raw screenshot.
