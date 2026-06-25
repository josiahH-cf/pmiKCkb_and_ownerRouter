# S6 — UI / IA re-architecture (Renewals under a Processes dropdown)

**Goal.** Resolve the IA open questions into one coherent navigation: fold **Renewals** under a
**Processes** dropdown with sub-tabs, gate process _creation_ to admins, and tidy the Spaces tiles —
without breaking working routes.

**What it is / how it functions.**

- **Processes becomes the hub.** In `components/layout/AppShell.tsx`, replace the top-level "Renewals"
  entry with a **Processes** dropdown whose sub-tabs include the process catalog and the live processes
  (Renewals first, at `/lease-renewal`, kept as a route). Renewals stops being a sibling tab.
- **Admin-gate creation.** Keep _viewing_ Processes open (current `read` capability), but restrict
  _creating_ process definitions to Admin (today it's editor+) — default toward restricting team-wide
  process creation.
- **Spaces tiles.** The per-tile "Open Space" link already exists (`app/spaces/page.tsx`) — keep it
  (explicit affordance beats whole-tile click). Re-question the "KB-owned process space" label: it's
  internal phrasing → rewrite via the S2 lexicon ("Process space" / "Source space").

**Open questions & assumptions.**

- _Assumption:_ Renewals-as-sub-tab is the chosen IA (a change from today's top-level tab) —
  `Q-IA-RENEWALS` in `docs/facts.md`.
- _Open:_ does any deep link or smoke test assume `/lease-renewal` is top-level? Preserve the route even
  as the nav entry moves under Processes (don't break working URLs or `smoke:*`).
- _Open:_ admin-gating creation — confirm the exact role boundary (Admin only vs Admin + designated
  editor).

**Cross-product impacts.** Touches nav (AppShell), Processes pages, lease-renewal routing, and Spaces
copy. Must not regress role checks or the Connection/Admin gating already in place.

**Ordered prompt sequence.**

1. _Discovery:_ map every nav entry, route, role gate, and any test asserting the current IA.
2. _Understanding:_ design the Processes dropdown + sub-tab structure; place Renewals first; keep routes.
3. _Build:_ update `AppShell.tsx` nav to the dropdown; move Renewals under it; preserve `/lease-renewal`.
4. _Build:_ change process-definition creation gate from editor to Admin; keep view open.
5. _Build:_ apply S2 copy fixes to Spaces tile labels.
6. _Context update:_ update IA facts in `docs/facts.md`; adjust nav/role tests (S8); verify smoke routes
   intact.

**Deletion/merge recommendation.** KEEP. No deletion of routes (preserve URLs). The Ask-field deletion
lives in S5. Re-question, don't delete, the Spaces "Open Space" pattern (keep the explicit link).
