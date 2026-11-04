<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-help-hub-2026-11-04 -->

# S244 — Refresh every in-app hover and inline help against the current processes

> Status: Authoring FINAL / READY (intake 110); implementation not started. Owner decision 2026-11-04: every About panel, InfoTip, inline helper sentence and the Process guide panel is audited and corrected against the processes delivered on November 3, and each gains a link into the matching help hub guide. Can ship before or with S242/S243.

**Goal.**

Every piece of in-app explanatory copy says what the control does today under the current
processes, names no approval, owner or step that no longer exists, and links to the hub guide
that shows the full process, so a staff member who hovers or taps the small information control
reads the same truth the manual and the interface present.

**Current state / intended end state.**

Authoring baseline: main `173ad2a602111fb4e8c2446ecbad96299a17d2dd`; production serves
`b5ba780279be0eb5661e463d2e73b5add1064056` / `pmi-kc-app-rmw123csb-dc0ce89a8583`.

Present behavior, verified in source:

- `lib/lease-renewal/section-help.ts` holds 34 entries (`SECTION_HELP_IDS`) with purpose, steps,
  "Saves", "Does not" and "Next" fields, rendered by
  `components/lease-renewal/RenewalSectionHelp.tsx` over `components/ui/InfoTip.tsx`; the trigger
  is labelled `About <section>`.
- Three more InfoTips: Approve availability and Deny availability in
  `components/approval/ApprovalQueueDetailPanel.tsx`, Publication checks in
  `components/workflows/ProcessDefinitionDetailClient.tsx`, and the environment badge in
  `components/layout/EnvironmentBadge.tsx`.
- Inline helper copy: muted sentences under controls across `components/**` (several hundred
  `muted` paragraphs, of which the explanatory ones are in scope), plus the renewal workspace's
  Process guide panel listing every section and its real controls.
- Copy is pinned by `tests/unit/s115-section-help.test.tsx`, `tests/unit/s86-infotip.test.tsx`,
  `tests/unit/s132-*` and the operator guide step checker; the copy-voice gate forbids jargon
  everywhere and em dashes in `app/` and `components/`.
- Examples of copy that contradicts the November 3 delivery: the document preparation and
  signature handoff help says the packet "lets an Admin confirm each supported provider action"
  and that staff "enter the Admin approval reason", while S182 lets ordinary renewal staff prepare
  and confirm their packet operations and the owner's rulings removed the universal Dan or Admin
  approval; the working renewal terms help says "The document packet does not read them yet",
  while S234/S237 bind working terms into previews and approval coverage. The audit will find
  more; these two are the proof that the refresh is needed.

Intended end state: a complete audit with a disposition for every help text (keep, correct,
remove), corrected copy that matches current behavior and the delivered processes, a "Open the
guide" link from each About panel and InfoTip into the hub deep link (S242), updated test pins,
and a gate that keeps help copy consistent with the manual.

**Actors and entry conditions.**

- Staff of every role read the copy; hover, focus, click and touch open it as today; opening
  help still records nothing and sends nothing.
- Engineers author corrections; the audit is reviewed like code against `docs/facts.md`,
  `docs/products/renewal-operator-guide.md` and the delivered suites S125, S182, S227, S232 to
  S237, S241.
- The hub deep links exist only once S242 ships; before that the link renders as plain text
  naming the guide (no dead link), controlled by the presence of the hub route.

**What it is / how it functions.**

- **R-S244-1 — Audit every help text.** Produce a disposition table (committed next to the copy
  or as a test fixture) listing every About panel id, every InfoTip, every explanatory inline
  sentence and every Process guide entry with: current text, the current behavior or process it
  describes, the delivered rule it contradicts if any (suite id), disposition (keep, correct,
  remove) and the replacement text. Inline sentences are in scope when they explain what a
  control reads, saves, needs or does not do; purely structural labels are not.
- **R-S244-2 — Correct against current processes.** Replace statements of superseded process:
  no universal Dan or Admin approval step; ordinary renewal staff confirm their own supported
  operations through the exact preview and confirmation; the notice basis is a renewal-staff
  selection; working terms feed previews and approval coverage; retired maintenance work is
  history; the outreach process is published and started from its Space; both Dotloop write keys
  are closed and signing is a human step, written as present behavior. Keep every true "Does not"
  statement; they protect staff from assuming an effect happened.
- **R-S244-3 — Link to the guide.** Each About panel and InfoTip ends with "Open the guide" linking
  to the S242 deep link for the guide step that shows this control in its process; the link opens
  the hub in the same tab and the panel closes. The mapping from help id to guide step is a typed
  table so the S242 coverage gate can assert every About id is referenced and this suite's test
  can assert every panel links somewhere that exists.
- **R-S244-4 — Consistency gate.** A test compares each About panel's "Saves" and "Does not"
  statements with the matching guide step's expected result and "What this does not do" lines and
  fails on a contradiction that is listed in the disposition table as resolved; the copy-voice
  gate runs on all corrected strings; the forbidden roadmap and hold phrases from S242 apply to
  help copy too.
- **R-S244-5 — Pins and guide steps.** Update `tests/unit/s115-section-help.test.tsx`,
  `tests/unit/s86-infotip.test.tsx`, `tests/unit/s132-*` and the operator guide or hub step
  tables so the corrected wording is pinned; no pin is deleted to make a stale sentence pass.

**In scope / out of scope.**

In scope: all hover, InfoTip, inline explanatory and Process guide copy across `app/` and
`components/`, the disposition table, the guide links, the consistency gate and pin updates.
Out of scope: the hub content itself (S243), new InfoTips for controls that have none (allowed
only where the audit finds a control whose purpose is otherwise unexplained, listed in the
table), visual changes to the InfoTip component, any change to control behavior.

**Open questions & assumptions.**

- Assumption (labeled): the number of in-scope inline sentences is in the low hundreds; the audit
  is sized by the disposition table, not estimated here.
- Nonblocking unknown: whether some About panels should merge once the hub carries the full
  process; the audit may propose merges but keeps one panel per existing id in this suite.

**Cross-product impacts.**

Surfaces: renewal workspace, Approval Queue detail, process definition page, environment badge,
every component with explanatory muted copy. Stores and providers: none. Gates: copy-voice,
s115/s86/s132 pins, the consistency gate, S242's content rules gate. Documentation: the operator
guide (until S243 retires it) and `docs/facts.md` where a help statement cites a fact.

**Authority and evidence map.**

| Input                                                                   | Classification       | Use and limitation                                                    |
| ----------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `lib/lease-renewal/section-help.ts`, the InfoTip uses, inline copy      | Implementation truth | The exact current texts to audit.                                     |
| `docs/facts.md`, S125/S182/S227/S232–S237/S241 contracts, owner rulings | Authority            | The current processes each sentence must match.                       |
| `docs/voice-and-audience.md`, `scripts/check-copy-voice.mjs`            | Authority            | Voice and em dash rules for every replacement string.                 |
| S242 deep-link contract                                                 | Dependency           | Target of each "Open the guide" link; plain text until the hub ships. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S244-1** — A disposition table covers every About id, InfoTip and in-scope inline
  sentence; a test that enumerates them fails on the starting state (no table) and passes after.
- **ARCH-S244-2** — A typed help-id to guide-step mapping exists for every About id and InfoTip;
  the test fails for an id without a target or a target that does not exist in the hub content.
- **ARCH-S244-3** — The consistency gate detects a contradiction between a panel's "Does not"
  line and the guide's "What this does not do" lines for the same control.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S244-1** — The document preparation and signature handoff help no longer mentions an Admin
  approval reason and describes ordinary staff confirmation; the working terms help no longer says
  the packet does not read them; both fail on the starting state and pass after.
- **BEH-S244-2** — Every About panel and InfoTip ends with "Open the guide"; activating it
  navigates to the hub deep link and closes the panel; without the hub route the text renders
  without a link.
- **BEH-S244-3** — Opening any help still issues no request and records nothing (preserved).

**Human litmus outcome.**

### The little information control tells the truth

**If this was built correctly:** A staff member hovering or tapping the information control beside
any section reads what that part of the app does right now, with no mention of approvals, owners
or steps that no longer exist, and can open the full guide for that step with one click.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement               | Architecture outcome | Behavior outcome | Human litmus                                   | Deterministic evidence / falsification                                  |
| ------------------------- | -------------------- | ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| R-S244-1 audit            | ARCH-S244-1          | BEH-S244-1       | The little information control tells the truth | Enumeration test over the disposition table; unlisted text fails.       |
| R-S244-2 corrections      | ARCH-S244-3          | BEH-S244-1       | The little information control tells the truth | The two named stale statements are gone; pins updated.                  |
| R-S244-3 guide links      | ARCH-S244-2          | BEH-S244-2       | The little information control tells the truth | Every panel links to an existing deep link; plain text without the hub. |
| R-S244-4 consistency gate | ARCH-S244-3          | BEH-S244-1       | The little information control tells the truth | Injected contradiction fails naming the panel and guide step.           |
| R-S244-5 pins             | ARCH-S244-1          | BEH-S244-3       | The little information control tells the truth | s115/s86/s132 green with corrected wording; no pin removed.             |

**Preservation set.**

InfoTip behavior (hover delay, focus, Escape, touch), zero-effect help opening, the renewal
workspace layout, Approval Queue availability reasons, publication checks text accuracy, every
lane of `bash scripts/verify.sh`.

**Adversarial acceptance checks.**

- **AC-S244-1** — ARCH-S244-1: a help text present in source but absent from the disposition table
  fails the enumeration test naming it.
- **AC-S244-2** — BEH-S244-1: searching all help copy for "Admin approval reason", "approval note",
  "Dan approves" and "does not read them yet" finds nothing.
- **AC-S244-3** — BEH-S244-2: every About panel and InfoTip has "Open the guide"; each target
  resolves in the hub; without the hub route no dead link renders.
- **AC-S244-4** — ARCH-S244-3: adding "the app sends the message for you" to a panel whose guide
  says the app does not send fails the consistency gate.
- **AC-S244-5** — Safety: opening help performs no fetch, write or provider call; copy-voice passes
  with zero em dashes in `app/` and `components/`.

**Forbidden actions / hard gates.**

No removal of true "Does not" statements; no wording implying a credential, connection or control
grants write or send authority; no roadmap or hold language; no change to action gates, roles or
protected paths; no deletion of test pins to pass.

**Dependencies / sequencing.**

Consumes the delivered process contracts and S242's deep-link contract (optional at runtime).
Enables S243's guides to reference consistent panel wording and S245's litmus. May ship before
S242/S243 as its own release.

**Standalone delivery contract.**

- **Deliverable now:** the audit table, corrected copy, link mapping with plain-text fallback,
  consistency gate, updated pins.
- **Consumes, but does not assume:** the hub route; absent, links render as text.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** the help-id to guide-step mapping S242's coverage gate reads.

**Verification and delivery contract.**

1. Record the starting state (no table, the two stale sentences present), write the ARCH/BEH
   checks and confirm they fail for those reasons.
2. Audit, correct, link and pin; run s115, s86, s132, copy-voice and the consistency gate.
3. Run `bash scripts/verify.sh`; inspect the diff for behavior changes (none allowed).
4. Report `ALL_GATES_GREEN`; ship under the ordinary release gates.

**Ordered prompt sequence.**

1. Re-verify current help texts and the delivered process contracts.
2. Materialize ARCH-S244-1..3 and BEH-S244-1..3 as failing checks.
3. Build the disposition table, corrections, links and consistency gate.
4. Falsify with AC-S244-1..5, update pins, run the gates and ship.

**Deletion/merge recommendation.**

Retire when the consistency gate and pins own help-copy truth in code and tests; S243 then owns
content currency.
