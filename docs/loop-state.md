# Loop State

Single-read resume pointer for the unattended feature loop. Read `docs/facts.md` (the solidified
Tier-0 spine) and this file first. This file is the always-current pointer; `docs/status.md` is the
append-only history. If the two disagree, `docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current — a pointer, not a changelog. `npm run
verify:context-freshness` caps its length so the changelog never regrows here; the full narrative
history lives in `docs/status.md`. Update it at the start of a cycle, at each slice boundary, and
whenever a blocker, approval gate, or stop-and-reset condition changes. See
`docs/autonomous-agent-runner.md` for the loop, verification/falsification, continuation, and
stop-and-reset rules.

## Snapshot

- Last updated: 2026-07-13
- **PRODUCTION RELEASE + WEDNESDAY DEMO VERIFIED:** the QA-001..QA-011 remediation is committed and pushed as
  `b24c67d` on `main`, then owner-authorized and deployed 2026-07-13 as Cloud Run revision
  `pmi-kc-kb-demo-00013-gm4` (100% traffic). Direct production checks passed for pmikcmetro.com Admin auth, the
  phone renewal decider, Console/Notifications count parity, Gmail Hub drafting + summary, anticipated work,
  Maintenance readiness guards, and cited Ask; see `docs/wednesday-demo-runbook-2026-07-15.html`. No decision,
  ticket, assignment, external send, SoR write, or fixture cleanup executed. The browser-only simulator was
  subsequently deployed as `pmi-kc-kb-demo-00014-cwq`; S19 is local-only and not in that revision.
- Where we are: the multi-process operations console is the north star (lease-renewal = process #1). The
  2026-06-29 cycle shipped + merged R1–R5 (spine+IA, golden harness+labeling, renewal math, action console +
  intent-detect, and the full Maintenance Work Order Intake incl. live Drive photo sync). Full detail is in
  `docs/status.md` + `docs/facts.md` (`F-*` rows). All gates green on every merge.
- Production-plane fence verified (`F-PROD-CLOUD-MODEL`): prod forces Gemini + Drive; the local model,
  demo auth, and the STT/image stubs are dev/test-only (NODE_ENV-fenced), never a prod dependency.
- Earlier context (full history in `docs/status.md`): client beta deployed on the `pmi-kc-kb-demo` Cloud
  Run service (`pmi-kc-kb-prod`); real Google auth locked to `pmikcmetro.com`; live RentVine (25 leases) +
  Sheet (DWD) reads work; non-Gmail external execution remains gated.
- Operating mode: normal owner-present; Remote Away Mode INACTIVE (`docs/away-mode.md`); hard $10 budget cap.
- **S19 GMAIL PRODUCTION ACTIVATION (2026-07-13):** the owner approved read, draft,
  exact-confirmed send/reply, labels, Pub/Sub/watch, deployment, and repository publication. DWD client
  `104374162913177846911` now includes readonly, compose, labels, and modify. The rollout-only mailbox
  allowlist is removed; each server-verified `pmikcmetro.com` user remains bound to their own mailbox.
  All five Inbox 0 registry actions are executable. Exact confirmation, one-attempt idempotency,
  ambiguous-outcome reconciliation, bodyless audit, and no-autonomous-send remain mandatory. Production
  Production revision `pmi-kc-kb-demo-00020-24d` serves 100% traffic; synthetic self-send/reply/label,
  future watch, five authenticated push deliveries, and Firestore cursor/audit proof all passed. Evidence
  is in `docs/evidence/gmail-production-activation-2026-07-13.md`.

## Next Safe Slice — stop/reset

The authorized Gmail activation is complete. No further live Gmail action is implied. The next work must
come from a new owner request or an already-documented non-Gmail slice; the Drive photo action and QA-007
production cleanup remain separate owner-only actions.

## Active Blockers And Exact Client Asks

Tracked owner/client/vendor gates (in `docs/client-checklist.md` and `docs/research-backlog.md`):

- Approved production sources and source-folder scope; explicit per-step approval for each cost-bearing
  import/deploy/smoke step. `pmi-kc-kb-prod`, billing, the project-scoped budgets, and the hard $10 kill
  switch are already provisioned and verified.
- Lease Renewal acceptance scenarios (the walkthrough was HELD 2026-06-19; source notes captured; signed-lease/lease-end RESOLVED).
- Google Sheets exact in-scope sheet list and owner confirmation.
- QuickBooks access status/location (blank in the returned tool-access spreadsheet).
- RentVine lease-renewal-write endpoint confirmation — undocumented in the public API; vendor
  confirmation required before any renewal writeback (`docs/integration-architecture.md`).
- Source-vocabulary normalization — freeze canonical stage/system/record-ID/approval names before any
  live connector work.
- Gmail production proof is complete in the S19 evidence artifact; no follow-up Gmail action is pending.
- Approval sender (`kb-automation@pmikcmetro.com`) and launch approver defaults (Dan + Josiah).
- Owner to define the term "ABC" (`Q-ABC-1`).

Resolved and kept as facts: RentVine credential used as-is, not rotated (load from env/Secret
Manager); signed leases live in Dotloop, lease-end reads from the RentVine lease record.

## Pending Approval Gates

The two 2026-07-13 code-only deploys plus their bounded production checks were explicitly owner-authorized and are
complete, including the synthetic-chain revision `pmi-kc-kb-demo-00014-cwq`.
The 2026-07-13 Gmail activation deploy/Pub/Sub/synthetic self-proof is complete. Other
future cost-bearing steps stay behind explicit per-step approval (each must also pass
`npm run check:budget-guard` and stay under the $10 cap): any live Ask rerun, approved-source import,
future deployment, and production smoke. Firestore rules/index deployment is also owner-auth gated even when it
has no material cloud cost. Hard stops still require explicit approval and will not be
performed autonomously:
billing/cap changes, Pro model usage, autonomous sends, destructive changes, raw client
data/secrets, cross-mailbox Gmail access, autonomous send, or unapproved system-of-record writes.

## Stop-Condition State

- 2026-07-13: the additive browser-only synthetic-chain slice is fully verified and deployed as
  `pmi-kc-kb-demo-00014-cwq`; the Wednesday request is complete and no safe in-scope slice remains.
- 2026-07-13: Gmail production activation is fully verified and deployed as
  `pmi-kc-kb-demo-00020-24d`; the authorized live slice is complete and no further Gmail action is pending.
- 2026-07-13: the prior S19 read-only stop is superseded by the owner's explicit production activation request.
- 2026-07-10: S14 + S16 + S17 + S15 + S18 all passed their adversarial boundaries (`F-RENEWAL-DECIDER-MOBILE`,
  `F-RBAC-SUBUSERS`, `F-UNIFIED-ATTENTION`, `F-GMAIL-HUB`, `F-ANTICIPATION-LANE`). The S14–S18 overhaul is COMPLETE;
  "No safe slice remains" now fires — external writes, deploy, Gmail read scope, live feeds, and cost-bearing actions are owner/vendor-gated.
- 2026-07-09: the 7-slice deferred cycle shipped + merged (PRs #56-#62); superseded as the active stop by the
  2026-07-10 cycle above.
- Prior stop-conditions (2026-06-30 migration-readiness / "no safe slice"; 2026-07-01 owner-present cycles) are
  cleared and archived in `docs/status.md` (2026-07-09 entry).

## Security Note

`docs/client_docs/` is gitignored and must never be committed (client spreadsheets, ledgers,
invoices, tool-access records). The returned tool-access spreadsheet holds live RentVine credentials
in a notes cell; per owner decision 2026-06-20 they are used as-is, not rotated, and must be loaded
only from env/Secret Manager, never committed. Record only non-secret references in tracked docs.

## Resume Here

1. Read `docs/facts.md`, then this file, then `docs/autonomous-agent-runner.md` and the latest
   `docs/status.md` entry.
2. **Auth first (org reauth is interactive-only):** the OWNER runs `npm run auth:session` at session start to
   refresh the gcloud CLI login + ADC when stale. Before any live Sheets/Firestore/Vertex read the agent runs the
   read-only `npm run preflight:adc`; if it fails, ask the owner to run `auth:session` (`F-SESSION-AUTH`) — a stale token stalls mid-step.
3. If the trigger is "plan the next feature cycle", produce a decision-complete packet and stop. If
   the trigger authorizes running the loop, proceed unattended.
4. For Gmail, start at S19 and its completed activation evidence. Never accept a mailbox identity from the
   browser; preserve exact confirmation and the signed-in From binding. All five separately governed Inbox 0
   actions are approved, deployed, and live-proven.
5. Review the completed QA-001..QA-011 worktree and evidence. If the owner separately authorizes the QA-007
   production incident response, authenticate interactively with `npm run auth:session`, define the exact
   collection/document scope and backup/rollback plan, then run a read-only inspection before requesting any
   cleanup authorization. Do not infer that authority from this remediation. For lease-renewal writeback
   specifically, stay in discovery until the team validates process, columns, and golden data.
6. Preserve the executable allowlist exactly; no non-Gmail external action is newly approved. Honor all gates + cap.
7. Update `docs/facts.md` and this file at each slice boundary; run `npm run verify:context-freshness`.
