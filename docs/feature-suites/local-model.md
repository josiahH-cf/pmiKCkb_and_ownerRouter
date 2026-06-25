# S9 — Local-model live-data testing (cross-cutting infra)

**Goal.** Use the available local model as a stand-in via the **same API path**, and — while it's free —
always test on live data, to de-risk every model-touching feature without spending budget.

**What it is / how it functions.** Today there is no provider abstraction (Gemini-only;
`F-LOCALMODEL-GAP` in `docs/facts.md`). Add a thin provider interface behind the existing model-call
boundary (e.g. `lib/retrieval/vertex-search.ts` and the Ask answer path) so a local model can be
injected by config — exactly the injected-transport pattern already used for RentVine/Sheets. With the
local model free, run live-data tests routinely (in-boundary, governed by the data rules), keeping cloud
spend at zero.

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
5. _Context update:_ document the path; flip `F-LOCALMODEL-GAP` once the seam exists.

**Deletion/merge recommendation.** KEEP as infra. Cross-link with S8 (testing) but keep separate (one is
practice, one is the provider seam).
