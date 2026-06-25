# S9 — Local-model live-data testing (cross-cutting infra)

**Goal.** Use the available local model as a stand-in via the **same API path**, and — while it's free —
always test on live data, to de-risk every model-touching feature without spending budget.

**Status: built (S9, 2026-06-25 — `F-LOCALMODEL-SEAM` in `docs/facts.md`).** The generative seam is
`lib/llm/model-provider.ts`: a narrow `ModelProvider` (`generateText`) with a `GoogleGenAiModelProvider`
and a `LocalModelProvider` (OpenAI-compatible `/v1/chat/completions`), selected by `MODEL_PROVIDER` /
`LOCAL_MODEL_BASE_URL` / `LOCAL_MODEL_NAME` and **fenced from prod** (`lib/config/server.ts` forces
"gemini" when `NODE_ENV=production`). `GoogleGenAiAnswerGenerator` (`lib/llm/answer.ts`) delegates to it.
The budget guard treats `MODEL_PROVIDER=local` as a free generative path. `npm run smoke:ask-local`
runs the Ask answer path through the local model at zero cloud spend by injecting a grounding fixture
(retrieval via Vertex AI Search bills independently and is never called). The local endpoint must be a
localhost / in-boundary OpenAI-compatible server (real grounding data flows to it).

**What it was / how it functions.** Before S9 there was no provider abstraction (Gemini-only). The seam
sits behind the existing model-call boundary (the Ask answer path in `lib/llm/`), so a local model is
injected by config — exactly the injected-transport pattern already used for RentVine/Sheets. With the
local model free, run live-data tests routinely (in-boundary, governed by the data rules), keeping cloud
spend at zero. Note: retrieval (`lib/retrieval/vertex-search.ts`, Vertex AI Search) is a separate
billing boundary, not part of this free seam — use a grounding fixture for zero-spend tests.

**Open questions & assumptions.**

- _Open:_ which local model/endpoint, and how it's addressed via the same API shape.
- _Assumption:_ the local path is dev/test-only and fenced from prod by config (like the demo
  `NODE_ENV` guard); live-data tests honor the data-governance boundary.

**Cross-product impacts.** Benefits Ask (S5) and any model-using glue (S7); pairs with S8; keeps the
budget guard green (free path).

**Ordered prompt sequence.**

1. _Discovery:_ map every model call site and its current Gemini coupling.
2. _Understanding:_ design the provider interface + config switch (mirror the injected-transport pattern).
3. _Build:_ implement the abstraction; add a local-model adapter behind it.
4. _Build:_ add live-data test scripts that run via the local model (free), in-boundary.
5. _Context update:_ done — `F-LOCALMODEL-GAP` flipped to `F-LOCALMODEL-SEAM` (Supersede Log).

**Deletion/merge recommendation.** KEEP as infra. Cross-link with S8 (testing) but keep separate (one is
practice, one is the provider seam).
