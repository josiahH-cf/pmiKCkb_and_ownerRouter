<!-- spec-shape: overhaul-v1 -->

# S{n} — {Title}

> Copy this file to `docs/feature-suites/{slug}.md`, keep the `<!-- spec-shape: overhaul-v1 -->`
> sentinel on line 1, replace `{n}`/`{Title}`/`{slug}`, and register the new file in the
> `docs/feature-suites/README.md` table and the `AGENTS.md` Route Table + Project Map. The
> sentinel opts this spec into two gates — `tests/unit/feature-suite-spec-shape.test.mjs`
> (this file has every required section, at least one `AC-` id, and a README row) and
> `npm run verify:spec-traceability` (every `AC-` id is unique, its number matches this
> suite, and any `AC-` id cited in `docs/facts.md` resolves here). Delete these blockquote
> lines when you author a real spec.

> Optional dated operator notes go here, e.g.
> `> New YYYY-MM-DD (operator note).` or
> `> Status (YYYY-MM-DD): BUILT via branch <name>.`

**Goal.** One paragraph in plain operator English: what changes for the user and why. State
the end-state, not the mechanics. No invented requirements — every claim traces to a
confirmed source (transcript, `docs/`, or an owner decision) or is labeled an assumption.

**What it is / how it functions.** Bulleted mechanism with bold sub-labels naming the real
modules, e.g. `- **Decider — components/…**`. Describe the surfaces, data flow, and states.
Split the work into two explicit lists so the loop can build the safe part and stop at the
gate:

- **Buildable now (app-plane).** Slices that add no system-of-record write, no autonomous
  send, no new external scope, and stay `production_allowed:false`. The loop may build these
  unattended.
- **Gated (owner / vendor).** Slices that need a deploy, a credential/scope grant, a vendor
  confirmation, or an owner decision. The loop stops here and hands back.

**Open questions & assumptions.** Each item labeled `_Assumption:_` / `_Open:_` /
`_Answered YYYY-MM-DD:_` / `_Client-owned:_`. Record any undecided point as a `Q-`/`A-` row in
`docs/facts.md` "## Open Questions" at authoring time; route irreducible client/vendor/legal
calls to `docs/client-checklist.md` as confirm-with-default. Decision-complete means a builder
could implement this with no further questions of the owner.

**Cross-product impacts.** The real code paths this suite touches (files/dirs), and any other
suite or fact (`F-*`) it interacts with or supersedes. If it supersedes active guidance, note
the delete-on-supersede action and the `docs/facts.md` Supersede Log marker.

**Adversarial acceptance checks.** Falsifiable Done-when bullets stated as OBSERVABLE states,
not "implemented X" — HTTP codes, rendered text, DOM invariants, persisted records, refusal
types. Give each a stable id `AC-S{n}-{k}`. Include the exact Verify command list and the
NAMED sentinel/invariant tests the slice must keep green. Example:

- **AC-S{n}-1** — {observable state}. _Verify:_ `npm test -- {file}`; keep `{sentinel test}` green.
- **AC-S{n}-2** — {observable state}. _Verify:_ `npm run typecheck`, `npm run lint`.

**Forbidden actions / hard gates.** Restate the fence a violation of which is itself a
falsification: app-plane only unless the suite names an already-approved action; no new Action
Registry flip (the existing compose-only `gmail.renewal_notice.draft_create` allowlist is not a
general write grant); no autonomous send; no system-of-record write (RentVine / Sheet /
QuickBooks / bank / client Drive); no new Google scope; no Cloud Scheduler; no client data on
GitHub; ~$10 budget cap; deploy stays owner-run. Add any suite-specific hard stop.

**Ordered prompt sequence.** Numbered steps, each tagged `_Discovery:_` / `_Understanding:_` /
`_Build:_` / `_Gate:_` / `_Owner:_` / `_Context update:_` / `_Verify:_`. The final step always
promotes shipped work to a `docs/facts.md` `F-*` row (citing the `AC-` ids it satisfies) and
updates `docs/loop-state.md`.

**Deletion/merge recommendation.** A KEEP / DELETE / MERGE verdict for this file and how it
relates to the disposable `docs/temp/{slug}-plan.md` packet.
