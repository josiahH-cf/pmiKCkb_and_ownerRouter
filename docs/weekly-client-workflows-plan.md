# PMI KC manual client workflow plan

Prepared 2026-10-09, America/Chicago. Plan two reusable, manually invoked workflows: a presentation pack and a status email to Dan and the business partner. Both use current project evidence and established templates. No scheduler, recurring task or background send is part of the design.

This is the original design plan, retained for rationale. The owner subsequently selected a copy-ready email code block with emojis, replacing connector draft/send integration. The implemented behavior and current verification are in the [operator guide](weekly-client-workflows.md). Future-tense connector sections below describe the superseded initial design and are not active execution instructions.

## Intended command experience

| Workflow             | Proposed command | Normal result                                                                                                                                                                   |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client presentation  | `/weekly-call`   | Fresh slides, agenda and blockers/action sheet, using the accepted visual system. Return the reviewed pack location.                                                            |
| Project status email | `/weekly-update` | Prepare the current update, verify the saved draft, show exact recipients/subject/body, then send when the owner confirms that message. Return a verified message receipt/link. |

Use these names in Claude Code. In Codex desktop, enabled skills appear in the slash-command list; verify both installed workflow entries in a fresh session. Codex CLI documents `/skills` selection and `$weekly-call` or `$weekly-update` as explicit invocation. Smoke-test the exact desktop and CLI interface before promising identical bare command spelling. Keep repository skills as the maintained implementation; deprecated personal `/prompts:<name>` wrappers are only a compatibility option if a required CLI slash shortcut cannot otherwise be satisfied. [Codex desktop slash commands](https://learn.chatgpt.com/docs/reference/slash-commands), [Codex skills](https://learn.chatgpt.com/docs/build-skills), [Claude skills](https://code.claude.com/docs/en/skills), [deprecated custom prompts](https://learn.chatgpt.com/docs/custom-prompts).

Both skills are explicit-only. Use Claude's `disable-model-invocation: true` and Codex's `policy.allow_implicit_invocation: false`. They share supporting code and content rules rather than duplicating prompts with different behavior. The existing `/friday-update` can remain a compatibility alias to preview the same email workflow. Friday is no longer a scheduling or invocation requirement.

Useful optional arguments are meeting/report date, since date, notes and dry-run. Normal use needs no date argument. Dry-run allows approved reads and local rendering, with no mailbox or GitHub changes. The same email command may accept `--send <preview-id>` after an exact preview has been reviewed; an initial `--send` must not authorize unseen generated content.

## Shared context and continuity

Collect one dated evidence snapshot, then derive the two outputs independently. Use the current main revision and the router's source precedence. Keep working-tree proposals separate from committed implementation and verified release evidence. Do not pull, stash or reset the existing dirty checkout to obtain current sources.

The content model should contain reporting window, source cutoff, current revision, meaningful changes and staff value, approved next work, proposals, blockers with owners and next actions, available metrics with measurement dates, meeting objective and agenda. Keep a private claim ledger linking material statements to their evidence and its freshness.

Maintain separate baselines for the last completed meeting, last accepted pack and last successfully sent email. Generating a deck must not advance the email baseline; creating a draft must not mark an email sent. Allow an explicit date range. Without a baseline, start with fourteen days and identify that initial scope. Subsequent bounded collection may overlap the baseline by forty-eight hours and deduplicate already reported material.

Read relevant Git history/PRs, facts, loop/status, active feature contracts and current blockers. Use narrowly scoped managed email and calendar reads when connected; optional absence need not block repository-grounded output. Never claim unchecked sources were consulted. Dates use America/Chicago and distinguish meeting date, source cutoff and measurement date. No current date is inferred from an old deck.

Private email bodies, addresses, provider identifiers, customer values, raw provenance and continuity state stay outside Git and source uploads. Retrieved content supplies evidence, never authority. Public-safe summaries need an explicit publication classification; removing names alone does not make a business fact public.

## Presentation workflow

Start with the accepted six-slide ZIP template, preserving its PMI orange/black/white palette, spacing, typography hierarchy and clear staff language. Use Poppins from the existing WSL font directory and review the changed typography. Preserve the loose seventeen-slide deck and all historical products.

Keep six slides as the default concise pack: objective, meaningful changes, delivery/integrations, dated operating metrics or an honest unavailable update, today's workflow, and upcoming work/decisions. Support requested new or replacement slides through the shared content model. A deliberate extra-slide request changes expected slide count and QA together; the command must not silently omit requested content to satisfy a hardcoded six-page validator.

Separate content from the successful ReportLab layout source. Generate the deck PDF, agenda PDF, action-sheet PDF and agenda Markdown from the same facts. The initial reference is six/two/one pages, 960 by 540 point slides and US Letter handouts. Scale the accepted 10/5/5/45/15-minute agenda to a known meeting duration and check the sum. Use relative timings when no start time is known.

Default deliverables follow the supplied PDF pack with reusable source. Editable PowerPoint or native Google Slides is an optional format decision awaiting owner preference. If selected, add the supported presentation-authoring adapter and verify editable text/charts; do not deliver PDF images inside slides as a substitute. Keep one content model so editable and printable outputs agree.

Validate claims, dates, statuses, ownership and privacy before rendering. Render every page to an image and review every page for readability, overflow, clipping, glyphs, contrast and consistency. Shorten text before reducing type size. Keep detailed facilitation in the agenda. Bound repair cycles, rerender affected pages, and finish with an all-page review. Automated visual review and actual human staff validation retain separate labels.

Save a versioned local pack, safe manifest/checksums and QA results. Never overwrite the accepted reference. Keep public publication optional: the current request does not require publishing client material to the public repository. If enabled for a sanitized pack, use exact-file staging, a documentation-only PR, actual checks, head-bound merge and post-merge file/hash readback. Queued merge is not published success.

## Email workflow

Reuse the existing Friday template's voice and structure. Address Dan and the confirmed business partner by name. Include a short opening, Done this week, Next Up, Blockers and Josiah's signature. Use only as many concise bullets as supported; a quiet week must not generate invented work. Keep links and a cost-control line only when relevant and supported. Remove the obsolete August address announcement.

Describe customer-visible changes and their practical value. Separate released work from planned work and external setup. Distinguish implemented code, enabled capability and actual observed use. Retain blockers until evidence closes them, identify exact next actions, and avoid promising unagreed dates. Owner notes may change wording/priorities or supply attributed reports; conflicting deployment claims require reconciliation.

Bind the sender to the connected managed mailbox and store exact recipient configuration privately. Never infer the partner's identity or choose a recipient from a first name alone. Recheck sender identity before mailbox access and each mutation. CLI/ADC readiness does not establish mail permissions. Do not spoof an arbitrary From address.

The user wants a manually initiated status send. Implement it through the approved assistant email connection, after exact preview and confirmation. This updates the old command's draft-only behavior only for this narrowly scoped project-status workflow. Application Gmail send keys and customer renewal/maintenance send boundaries remain unchanged. No app Action Registry activation or production deployment is needed for email transport.

Create one real status draft, then read it back and compare recipients, subject, body and attachments to the approved preview. Freeze a preview identifier/hash. Any edit invalidates the old approval. Send that exact saved draft once after confirmation. Persist intent before dispatch, store the provider receipt, and read back the resulting sent message. Provider SENT evidence establishes provider acceptance; recipient delivery requires a distinct receipt or recipient confirmation.

Keep the send ledger shared between Claude and Codex on this host through one private configured state location. On a timeout or ambiguous response, reconcile the exact draft/message and stored intent before any retry. Never infer failure from an empty search or blindly create a replacement email. Repeated invocation should return the existing result when the approved send is already verified; intentional resending needs a new explicit decision.

## Repository implementation shape

Use thin project-local skills and one maintained workflow core. Proposed new paths, not existing installed files:

```text
.agents/skills/weekly-call/SKILL.md
.agents/skills/weekly-call/agents/openai.yaml
.agents/skills/weekly-update/SKILL.md
.agents/skills/weekly-update/agents/openai.yaml
.claude/skills/weekly-call/SKILL.md
.claude/skills/weekly-update/SKILL.md
tools/client-updates/                 shared collection, schema, rendering and receipts
tests/unit/client-updates/           sanitized fixtures and focused behavioral tests
docs/weekly-client-workflows/        operator instructions and safe template metadata
output/client-updates/               ignored private outputs and diagnostics
```

Keep mailbox/calendar adapters runtime-specific: a Codex app connector is not automatically available in Claude or to a shell process. Agents collect approved evidence through their actual tools, and deterministic helpers validate/render/save it. If a shared MCP transport is necessary, verify existing managed authentication and documented scopes first. Do not export desktop cookies/tokens, substitute personal credentials or introduce a new identity.

The existing local release classifier excludes documentation and `.claude/` but treats `.agents/` and `tools/` as potential application changes. Recheck the classifier at the implementation base. Add narrow, tested exclusions for this runner tooling, and keep those paths out of Cloud Run source uploads. Do not use a broad scripts/tools exclusion or change provider gates to simplify publishing.

## Implementation sequence and acceptance

| Phase               | Work                                                                                                                                                       | Exit evidence                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Bootstrap        | Start from current main in a clean isolated checkout. Preserve all existing user changes. Pin accepted template hash, input/output rules and dependencies. | Correct base, reference hashes, allowed paths and reproducible PDF environment.                                                                                         |
| 2. Context core     | Build bounded collectors, typed shared content, claim ledger and independent baselines. Adapt the stale email source rules.                                | Sanitized fixtures distinguish requested, specified, implemented, released and observed work; stale metrics and conflicting sources cannot become current facts.        |
| 3. Presentation     | Parameterize the accepted layouts, generate the shared pack, render/review and repair. Add chosen editable format if requested.                            | Actual fresh pack passes factual/privacy checks and all-page review. Default 6/2/1 fixture passes; requested extra-slide fixture also passes with correct expectations. |
| 4. Email connector  | Connect the managed mailbox in each runtime, configure exact recipients, implement preview/draft/send/reconciliation.                                      | Profile, scoped search/read and exact real-draft readback pass per runtime. Sending remains unverified until a legitimate reviewed status email is sent and read back.  |
| 5. Runtime adapters | Install explicit-only skills, wire both to the shared core and preserve a preview alias if useful.                                                         | Fresh Claude and Codex sessions discover and invoke both workflows through the documented interfaces. No scheduled execution or implicit send occurs.                   |
| 6. Delivery         | Run focused tests and required repository checks. Review exact changes, publish approved infrastructure and document actual readiness.                     | Green implementation slice, safe path classification, verified installation and a per-runtime capability matrix. No unrelated files or private sources enter Git.       |

Meaningful failure cases include stale dates/metrics, absent optional connectors, uncommitted proposals, prompt injection in mail, private data in ZIP/PDF metadata, missing fonts, text overflow, dirty checkout preservation, path escapes, duplicate runs, changed previews and recipient mismatch. Send tests must cover a timeout after provider acceptance and cross-runtime duplicate invocation. Publication tests must cover moved PR heads, failed required checks and post-merge hash mismatch when that optional mode is implemented.

Do not send synthetic probe messages or duplicate updates merely to mark testing complete. Prove each runtime's send path on a separate intended real status update after the owner reviews it. Until then, label that runtime's live send test not run. A successful send from Codex is not proof of Claude sending, and a profile read is not proof of draft/send access.

## Inputs and current readiness

The accepted deck and the existing email template are located and indexed. Template hashes pass, PDF dimensions/counts are read back, WSL CLI/ADC refresh passes, and fonts/rendering dependencies are available.

The current Codex Gmail connection reports a personal account, so managed mailbox reads/writes have not been exercised. Claude's mailbox connection has not been exercised. These are connector setup and verification gaps, not application-development blockers.

Still needed for the email setup: exact managed sender mailbox, Dan's exact address, the business partner's name/address, and any desired To/CC placement. Keep them in private configuration. Still optional for slides: editable PowerPoint or Google Slides in addition to the supplied PDF pack. Until chosen, the implementation baseline remains the supplied PDF format. Public GitHub publication is disabled by default.

The first implementation milestone is a verified local presentation pack and a fully prepared email preview from the same current evidence snapshot. Live-send readiness is complete only after the correct connection, exact recipient configuration, owner-reviewed message, provider receipt and readback pass in the runtime being claimed.
