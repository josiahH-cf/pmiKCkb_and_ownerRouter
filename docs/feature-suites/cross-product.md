# S7 — Cross-product integration (Workflow Communications + cross-lane glue)

**Goal.** Connect the processes: workflow-linked Gmail labels/attention; auto-assign maintenance for
move-outs/walkthroughs; lease-renewal non-response notifications that offer to draft an email; and
improving the connections themselves — all under human-send authority and per-action gates.

**What it is / how it functions.** Four thin, gated threads:

- **Workflow Gmail labels/attention** — label only an explicitly linked renewal/maintenance thread and
  create value-free attention for a linked reply. The legacy notification sender is disabled.
- **Auto-assign maintenance for move-outs/walkthroughs** — when a move-out/walkthrough is detected,
  propose a maintenance work order (ties to S4); human approves.
- **Renewal non-response notifications** — when a renewal gets no tenant response in the window, notify
  and **offer to draft** an outreach email (S5 compose; human sends).
- **Improve the connections** — advance Connection Center from status-only to real read-only verification
  (Phase-2b health probes), with honest plain-language status (S2).

**Open questions & assumptions.**

- _Gate:_ any Gmail read/label or external send needs explicit per-action approval (security + budget
  rules; notifications off by default).
- _Open:_ "non-response" definition and window — pull from the validated renewal process (S3).
- _Assumption:_ "offer to draft" never sends autonomously.

**Cross-product impacts.** The glue suite — depends on S3 (renewal signals), S4 (maintenance write), S5
(compose), and the connections. Highest approval-surface; sequence it after its dependencies.

**Ordered prompt sequence.**

1. _Discovery:_ confirm Gmail label/read scopes and the owner-email folder taxonomy.
2. _Understanding:_ design the four glue flows as proposals-with-approval; define triggers/windows.
3. _Build:_ Connection Center Phase-2b read-only verification + honest status copy.
4. _Build:_ renewal non-response detection → notify → offer-to-draft (compose via S5).
5. _Build:_ move-out/walkthrough → propose maintenance work order (via S4).
6. _Build (gated):_ approved Gmail labeling and linked-reply attention behind workflow authorization.
7. _Context update:_ register each capability + gate in `docs/facts.md` and the Action Registry.

**Deletion/merge recommendation.** KEEP. No merge (distinct flows). Strictly gate every external action.
