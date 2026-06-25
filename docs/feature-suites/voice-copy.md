# S2 — Voice & Copy (merges copy professionalism + audience profile)

**Goal.** Bring every client-facing string to a top-tier product standard grounded in the audience
profile, and — for verbose/status copy — decide whether it should exist at all, not merely shorten it.

**What it is / how it functions.** `docs/voice-and-audience.md` (audience profile + voice rules +
do/don't lexicon) plus a swept copy inventory with a verdict per string — keep / rewrite / delete.
Concrete verdicts from recon:

- `lib/connections/connector-catalog.ts` "Leases, tenants, and rent — the read-authoritative source of
  truth." → **rewrite** to "Leases, tenants, and rent." (drop the internal phrase).
- `lib/connections/connection-status.ts` "All details provided — PMI will verify and connect." →
  **rewrite/delete**: it promises a verification step that isn't live. Say "Ready to connect" or nothing.
- `components/connections/ConnectorCard.tsx` "Available in the next release." → **delete** the dead
  disabled control; don't advertise unbuilt features in the UI.
- `SourceStateBanner` "Bailey Placeholder" → **rewrite** to plain language after confirming the term
  (`Q-BAILEY` in `docs/facts.md`).
- Connection vocabulary ("Needs attention," "Ready to verify," "Not connected") → **keep**, unify to a
  3-state plain set once verification is real.

**Open questions & assumptions.**

- _Open:_ meaning of "Bailey" / "Bailey Placeholder" — confirm before renaming (`Q-BAILEY`).
- _Assumption:_ clients never see internal route/phase labels; verify none leak into tenant/owner drafts.

**Cross-product impacts.** Touches Connections, Ask (S5), Spaces/Processes (S6), and every drafted email
(S7). The lexicon becomes the standard all later suites write copy against.

**Ordered prompt sequence.**

1. _Discovery:_ regenerate the full copy inventory (file:line + where shown).
2. _Understanding:_ finalize `docs/voice-and-audience.md` (profile + rules + lexicon).
3. _Build:_ apply keep/rewrite/delete verdicts string-by-string in the smallest diffs; one PR per surface.
4. _Build:_ remove future-promise / over-claim copy and the dead "next release" control.
5. _Context update:_ register the voice guide in routing; add a `F-VOICE` fact.

**Deletion/merge recommendation.** MERGE the two source components into this one suite (copy derives
from audience). DELETE future-promise and over-claiming status copy.
