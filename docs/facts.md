# Solidified Context — Fact Ledger

Tier-0 spine. Read this with `docs/loop-state.md` before acting. This is the one authoritative
ledger of what is **Verified**, what is an **Assumption**, and what is **Open**. It references the
other docs as evidence rather than restating them. `npm run verify:context-freshness` gates this
file: every `Verified` row needs evidence and an ISO date, evidence paths must exist, supersedes
must resolve, no superseded rule may still read as active, and `docs/loop-state.md` must stay a
short, current pointer.

Conventions: `F-` verified fact · `A-` assumption · `Q-` open question. `status` is one of
`Verified` / `Assumption` / `Open`. Dates are ISO (`YYYY-MM-DD`). `supersedes` points at the row id
this replaced, or `—`. `review-by` is the date after which a `Verified` row must be re-checked (a
non-failing staleness warning), or `—`.

## Fact Ledger

| id                  | claim                                                                                                                                                                                                                         | status     | evidence                                                           | verified-on | supersedes | review-by  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ | ----------- | ---------- | ---------- |
| F-IDENTITY-1        | The project always authenticates as a `pmikcmetro.com` identity; the personal `josiah.abernathy@gmail.com` account must never appear in any auth path.                                                                        | Verified   | `AGENTS.md` Identity Rules                                         | 2026-06-25  | —          | 2026-12-31 |
| F-BUDGET-1          | The cloud budget is a hard ~$10 total cap enforced by a real kill switch (budget → Pub/Sub → a Cloud Function that disables billing), not alerts alone.                                                                       | Verified   | `docs/budget-and-cost-policy.md`; `scripts/check-budget-guard.mjs` | 2026-06-25  | —          | 2026-12-31 |
| F-AWAY-MODE         | Remote Away Mode is INACTIVE; normal owner-present governance and the approval gates apply.                                                                                                                                   | Verified   | `docs/away-mode.md`                                                | 2026-06-25  | —          | 2026-12-31 |
| F-WRITE-GATE        | No system-of-record write executes today; every Action Registry entry is `production_allowed:false` and a resolution only queues a proposed write-back.                                                                       | Verified   | `docs/integration-architecture.md`                                 | 2026-06-25  | —          | 2026-09-30 |
| F-RENTVINE-AUTH     | RentVine is read-only today over HTTP Basic to the tenant host; one live `GET /leases/export` returned 25 real leases mapped to 25 candidates.                                                                                | Verified   | `lib/integrations/rentvine/client.ts`; `docs/status.md`            | 2026-06-24  | —          | 2026-07-24 |
| F-SHEET-DWD         | The renewal sheet is read keyless via domain-wide delegation (a service account signs a JWT impersonating a `pmikcmetro.com` user); read-only scope; the managed domain blocks a bare service account.                        | Verified   | `lib/google-sheets/read-client.ts`                                 | 2026-06-24  | —          | 2026-07-24 |
| F-SHEET-TAB         | The real renewal tab is "Lease Renewal" (519×31); the sheet is a freeform live worklog reconciled against RentVine, not a defect list.                                                                                        | Verified   | `lib/lease-renewal/headers.ts`; `lib/lease-renewal/pipeline.ts`    | 2026-06-24  | —          | 2026-09-30 |
| F-MAINT-FIRST-WRITE | Maintenance Work Order Intake (RentVine work-order create) is the documented first executable write; lease-renewal writeback is last and gated (no documented endpoint).                                                      | Verified   | `docs/integration-architecture.md`; `docs/plan.md`                 | 2026-06-25  | —          | 2026-12-31 |
| F-GMAIL-LANE        | Gmail Inbox 0 is the active Dan-email-first lane and starts from Dan's whole mailbox; it supersedes the legacy Owner Router naming.                                                                                           | Verified   | `docs/north-star.md`; `docs/products/README.md`                    | 2026-06-25  | —          | 2026-12-31 |
| F-LOCALMODEL-GAP    | There is no model-provider abstraction; model calls are Gemini-only, so a free local-model stand-in via the same API path does not exist yet.                                                                                 | Verified   | `lib/retrieval/vertex-search.ts`                                   | 2026-06-25  | —          | 2026-09-30 |
| A-DATA-GOV          | Real previously-vetted client data may be read/used as test/training input inside the `pmikcmetro.com` boundary, kept out of git and out of user/model output without approval; it is never emitted or acted on autonomously. | Assumption | `AGENTS.md` Security Rules (applied 2026-06-20)                    | 2026-06-25  | —          | 2026-09-30 |
| Q-ABC-1             | The term "ABC" used in prior discussion is undefined in the repo; the owner must define it before anything relies on it.                                                                                                      | Open       | owner to clarify; no occurrence in code or docs                    | —           | —          | —          |
| Q-PREC-1            | Source precedence when the sheet and RentVine disagree (and Dan's manual precedence) is not fully confirmed (OQ-PREC-1).                                                                                                      | Open       | `docs/plan.md` P4; team validation                                 | —           | —          | —          |
| Q-WRITEBACK-METHOD  | The lease-renewal two-way-sync write-back method and "the math" are undecided (append-only proposal column vs cell-anchored compare-and-set vs RentVine-first).                                                               | Open       | S3 discovery + owner decision                                      | —           | —          | —          |
| Q-MAINT-STORAGE     | Maintenance photo/screenshot storage is undecided (Drive in-boundary vs GCS vs RentVine file API).                                                                                                                            | Open       | S4 discovery + owner decision                                      | —           | —          | —          |
| Q-BAILEY            | The "Bailey Placeholder" source-state label's meaning is unconfirmed; rewrite to plain language once confirmed.                                                                                                               | Open       | owner to confirm                                                   | —           | —          | —          |
| Q-IA-RENEWALS       | Renewals will fold under a Processes dropdown with sub-tabs and process creation will be admin-gated (chosen this cycle; not yet built).                                                                                      | Open       | S6 build; preserve the `/lease-renewal` route                      | —           | —          | —          |
| Q-ASK-RESCOPE       | Ask will drop Audience/Channel/Space/Urgency and become process-aware plus able to compose emails (chosen this cycle; not yet built).                                                                                         | Open       | S5 build                                                           | —           | —          | —          |

| F-VOICE | Client-facing copy follows `docs/voice-and-audience.md`; the S2 Connection Center pass removed internal jargon, the dead next-release control, and the not-live verification over-claim. | Verified | `docs/voice-and-audience.md`; `docs/feature-suites/voice-copy.md` | 2026-06-25 | — | 2026-12-31 |

## Supersede Log

When new direction lands, delete the superseded rule from the active doc (do not append next to it),
add a row here with a unique `marker` phrase, and point the replacing fact's `supersedes` at the old
id. The freshness gate greps each `marker` across the active governance set and fails if a superseded
rule still reads as active.

| superseded-id            | replaced-by-id | date       | where-old-text-lived      | marker                           | why                                                                                              |
| ------------------------ | -------------- | ---------- | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| LEGACY-OWNER-EMAIL-FIRST | F-GMAIL-LANE   | 2026-06-25 | `docs/products/README.md` | Owner-email-first Gmail workflow | Gmail Inbox 0 starts from Dan's whole mailbox, not owner-email-only; the old framing is retired. |

| COPY-RV-SOT | F-VOICE | 2026-06-25 | `lib/connections/connector-catalog.ts` | read-authoritative source of truth | RentVine "powers" dropped internal jargon for plain operator copy (S2). |
| COPY-NEXT-RELEASE | F-VOICE | 2026-06-25 | `components/connections/ConnectorCard.tsx` | Available in the next release. | Deleted the dead disabled control that advertised an unbuilt feature (S2). |
| COPY-VERIFY-CONNECT | F-VOICE | 2026-06-25 | `lib/connections/connection-status.ts` | All details provided — PMI will verify and connect. | Ready-to-verify detail rewritten to "Ready to connect."; verification is not live yet (S2). |
| COPY-SUBTITLE-VERIFY | F-VOICE | 2026-06-25 | `components/connections/ConnectionCenter.tsx` | PMI handles the credentials and verification for you. | Connections subtitle dropped the not-live verification promise (S2). |

## Open Questions

The `Q-` rows above, surfaced together so a reader sees the unknowns at a glance. Detail and history
live in `docs/research-backlog.md` and `docs/status.md`; resolve a question by flipping its row to a
`Verified` fact (with evidence + date) or recording why it stays open.

- **Q-ABC-1** — define "ABC" (owner). Nothing should rely on an assumed meaning.
- **Q-PREC-1** — confirm sheet-vs-RentVine precedence and Dan's manual precedence.
- **Q-WRITEBACK-METHOD** — choose the renewal write-back method and "the math" after the golden data set.
- **Q-MAINT-STORAGE** — choose maintenance image storage.
- **Q-BAILEY** — confirm the "Bailey Placeholder" meaning, then rewrite the user-facing label.
- **Q-IA-RENEWALS** — build the Processes dropdown with Renewals as a sub-tab; admin-gate creation.
- **Q-ASK-RESCOPE** — remove the four Ask selects; add process-awareness and email compose.
