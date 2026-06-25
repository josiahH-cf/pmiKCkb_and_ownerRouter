# S5 — Ask portal rescope (delete 4 fields; process-aware + compose)

**Goal.** Turn Ask into a stable, correct portal that is self-aware of the app's processes (query
current state _and_ explain/teach a process) and can compose emails — and remove the low-value fields.

**What it is / how it functions.** Remove the four selects (**Audience, Channel, Space, Urgency**) from
`components/ask/AskForm.tsx`. Rescope Ask to two abilities on top of source-backed answers: (1)
**process awareness** — answer "what's the state of X?" and "how does process Y work?" by querying the
app's own process/state surfaces; (2) **compose** — draft an email from an answer (human sends; no
autonomous send). Keep the source-state honesty (verified/partial/conflict/none) but in plain language
(S2).

**Open questions & assumptions.**

- _Open:_ which process/state sources Ask may read (Renewal Desk data, Processes catalog, Connection
  status) and how it stays read-only / in-boundary.
- _Assumption:_ "compose" = draft into the existing draft surface + human send; never autonomous send.
- _Open:_ removing "Space" must not break the capture-task flow — keep a minimal target-space picker
  _only_ inside the capture sub-panel, not on the main Ask form.

**Cross-product impacts.** Reads from Processes/Renewals/Connections (S6, S3); composes into the
owner-email/Gmail flow (S7); inherits the voice lexicon (S2). Field removal simplifies the `/api/ask`
payload (audience/channel/urgency drop from the request).

**Ordered prompt sequence.**

1. _Discovery:_ trace every reader of audience/channel/space/urgency in `/api/ask` and downstream.
2. _Understanding:_ design the process-aware query surface (what Ask may read, read-only, in-boundary).
3. _Build:_ delete the four selects + their state/payload; preserve the capture-space picker in-panel only.
4. _Build:_ add process-state + process-teaching answers behind the source-state honesty model.
5. _Build:_ add email compose (draft only) reusing the draft box; wire human-send authority.
6. _Context update:_ update the Ask spec + `docs/facts.md`; add/adjust tests to mirror new behavior (S8).

**Deletion/merge recommendation.** KEEP, rescope. DELETE Audience/Channel/Space/Urgency from the main
form (low value, confirmed). No merge — Ask is its own surface. Tracked as `Q-ASK-RESCOPE`.
