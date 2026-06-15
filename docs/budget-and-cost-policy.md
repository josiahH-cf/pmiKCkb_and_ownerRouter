# Budget And Cost Policy

Single source of truth for the cloud cost ceiling and the free-tier-first defaults that
keep unattended work safe. This is durable governance: it applies whether or not the
temporary away-mode overlay (`docs/away-mode.md`) is active.

## The Cap

- **The cloud budget is approximately $10 total.** This is the figure communicated to the
  client (Dan/PMI KC) and recorded in `docs/client-checklist.md` and
  `docs/environment-handoff.md`: keep spend at $10 and do not spend without approval.
- The $10 total cap is binding and **supersedes any higher per-service figure** mentioned
  in older preserved specs (for example a `$200/month` Gemini line in `docs/spec.md`).
  Those are legacy aspirational numbers, not approval to spend.
- No unmanaged spend. When active, Remote Away Mode grants standing approval for bounded
  setup and migration work that stays under this cap, passes `npm run check:budget-guard`,
  and has a dry-run or replayable plan. Anything unbounded, hard to estimate, or near the
  cap still requires explicit user approval first.
- The client-owned Google Cloud billing card is **not yet provisioned**, so today the
  practical spend ceiling is effectively $0 until the client unblocks billing. Treat all
  cost-bearing cloud actions as blocked until then.

The constant `BUDGET_CAP_USD = 10` lives in `scripts/check-budget-guard.mjs`. Keep this
doc and that constant in sync. The optional `AUTONOMOUS_BUDGET_CAP_USD` env var can lower
the cap for a session but must never silently raise it.

## Free-Tier / Least-Cost Defaults

Unattended work defaults to the cheapest safe option. Prefer, in order: local emulation →
demo mode (no live calls) → the sanctioned cheap-live path → anything billed.

| Lever                               | Safe default                          | Why it is cheap                                        |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `ASK_DEMO_MODE`                     | `true`                                | Short-circuits Vertex/Gemini; no per-query billing.    |
| `GEMINI_MODEL_ANSWER`               | `gemini-2.5-flash`                    | Flash is the cheap model; Pro needs explicit approval. |
| Active Spaces (`SPACE_*_IDS`)       | single `lease-renewals` (or none)     | Limits Vertex AI Search / indexing surface.            |
| Cloud Run scaling                   | `--min-instances=0 --max-instances=1` | Scale-to-zero; no idle compute charges.                |
| `KB_APPROVAL_NOTIFICATIONS_ENABLED` | `false`                               | No Gmail send path active.                             |
| Firestore in tests                  | local emulator                        | No live database reads/writes.                         |
| Service-account keys                | avoid; use ADC / workload identity    | No long-lived downloadable credentials.                |

## Cost-Bearing Path Inventory

Every path that can incur billing, and the gate that already protects it. In Remote Away
Mode, bounded/reversible setup and migration may run unattended when the gate passes and
the expected spend stays below the cap.

| Path                               | Trigger                                     | Existing gate                                                                           |
| ---------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Cloud Run deploy                   | `npm run deploy:demo` / `deploy`            | Refuses without `--budget-confirmed`; scale-to-zero; preflight via check-live-cost.     |
| Live Gemini answer/classify        | `ASK_DEMO_MODE=false` Ask path              | `npm run check:live-cost` enforces Flash + single Space; demo mode is default.          |
| Live Ask / demo smoke              | `npm run smoke:ask-live`, `smoke:demo-live` | Run only against the cheap-live config; bounded smokes are allowed in Remote Away Mode. |
| Vertex AI Search data store create | `npm run import:agent-search`               | `--dry-run` available; create only approved corpora.                                    |
| Agent Search document import       | `npm run import:agent-search`               | `--dry-run`; indexes client data, may bill.                                             |
| Agent Search data store delete     | `npm run delete:agent-search-data-store`    | Refuses active stores; requires `--confirm-delete=<id>`.                                |
| Cloud Storage source upload        | corpus plan / `gcloud storage cp`           | `npm run corpus:plan -- --dry-run` first.                                               |
| Gmail approval notifications       | `npm run queue:notifications -- --write`    | Default `--dry-run`; `KB_APPROVAL_NOTIFICATIONS_ENABLED=false` by default.              |
| Production cutover                 | `npm run preflight:production`              | Rejects demo-shaped config; deploy still needs explicit budget approval.                |

## The Budget Guard Preflight

`npm run check:budget-guard` is a fast, read-only, network-free check of the current cost
posture. Run it:

- before any live (`ASK_DEMO_MODE=false`), deploy, import, or notification command;
- as a daily self-check during any unattended/away-mode run;
- in CI (it runs on every PR and push; the clean CI environment is demo-by-default).

It passes for the safe demo posture and for the sanctioned cheap-live path
(Flash + single `lease-renewals` Space + notifications off). It fails when live mode is
paired with the Pro model, extra Spaces, or enabled Gmail notifications unless the
matching `--allow-pro` / `--allow-multiple-spaces` / `--allow-notifications` flag is
passed after explicit approval or standing Remote Away Mode rules. While away-mode is
active (`docs/away-mode.md`), the guard:

- allows `--allow-multiple-spaces` for bounded migration/setup and prints a warning;
- refuses `--allow-pro`; and
- refuses `--allow-notifications`.

## Approval And Escalation

- Treat the cap as a hard ceiling, not a target. If a needed step would approach or exceed
  $10, stop and raise an approval request instead of proceeding.
- An approval request must name the exact action, environment, expected cost or usage,
  data touched, and the rollback path (see `docs/autonomous-agent-runner.md`).
- While Remote Away Mode is active, do not stop for synchronous review unless the action
  hits a Hard Stop in `docs/away-mode.md`. Queue exact decisions in `docs/loop-state.md`
  and continue with other non-blocked work.
- If billing is later provisioned, create a project-scoped $10 budget alert before any
  deploy (see `docs/google-setup.md`), and record the billing account/owner in
  `docs/environment-handoff.md` (non-secret identifiers only).

## Related

- `docs/away-mode.md` — reversible remote-autonomy overlay that points here.
- `docs/autonomous-agent-runner.md` — Approval Gates, Cost Ceiling, and the loop rules.
- `docs/environment-handoff.md` — billing gate and key/secret ownership.
- `docs/google-setup.md` — the under-$10 live Ask and demo deploy setup notes.
