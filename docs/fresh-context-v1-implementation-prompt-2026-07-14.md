# Fresh-context prompt — finish PMI KC V1 gaps

Use the following prompt in a new Codex window rooted at this repository. It is intentionally
self-contained, but the repository's Tier-0 facts and loop pointer remain authoritative if code has
moved forward.

---

Continue the active PMI KC final-V1 implementation goal comprehensively. Do not reopen the completed
Round 1–3 audit and do not ask me to re-answer R01–R09. The owner decisions are locked in
`docs/facts.md`, `docs/v1-gap-implementation-program-2026-07-14.md`, and S20–S27 under
`docs/feature-suites/`.

First read, in order:

1. `AGENTS.md`
2. `docs/facts.md`
3. `docs/loop-state.md`
4. `docs/autonomous-agent-runner.md`
5. the newest entry in `docs/status.md`
6. `docs/v1-gap-implementation-program-2026-07-14.md`
7. this fresh-context prompt
8. `docs/v1-client-unblock-checklist-2026-07-14.md`

Then inspect `git status`, the current branch, and recent commits. Preserve all user work. Confirm the
starting point from the repository rather than this prompt: as written on 2026-07-14, S20–S24 are
Local green; S22 and all 11 S25 plus 19 S26 typed action adapters run through the invented-alias
synthetic journey; and S27's production-only manifest/report, pre-V1 UI, and release runbooks are
built. Every external/configuration/provider/deploy row remains Gated. Confirm local `main` equals
`origin/main`, then run `npm run verify:context-freshness` before acting.

Treat the safe local implementation as complete unless current code or verification falsifies it:

- S22 — external Vendor app-plane: typed invite, one-time setup, verified-email TOTP gate,
  assigned-ticket-only authorization, PKCE per-vendor Gmail/Workspace OAuth, token-vault boundary,
  governed mail, disable/revoke, and emulator/fake-provider acceptance are built.
- S25 — Lease Renewal orchestrator and every R02 action: all 11 typed adapters run through exact
  previews, the S20 bridge, one attempt, readback, dependency, and reconciliation tests.
- S26 — Maintenance orchestrator and every R03 action: all 19 typed adapters run through the same
  guarded kernel, including Vendor lifecycle/mail, Drive photo, Rentvine, Gmail, LeadSimple, and
  QuickBooks draft bill.
- S27 — integrated synthetic/emulator E2E, production-only manifest/report, acceptance ledger,
  pre-V1 report, monitoring and captured-prior-revision rollback plan, tab/browser plan, and final
  Dan/Josiah gates are built locally.

Treat S24 as a shared completed boundary, not work to repeat: retention periods are versioned in code;
cleanup/hold are Local green; exactly three immutable v1.0 artifacts exist; AI reply output is transient
and supported only by approved base copy plus verified workflow sources; exact confirmation binds
artifact/policy/sources. Do not configure live TTL/scheduling or infer authoritative S25/S26 values.

Follow the dependency order in the program and `docs/loop-state.md`; treat one row in
`docs/v1-client-unblock-checklist-2026-07-14.md` as one independently verified external slice. Do not
mark an adapter or V1 complete because its local typed fake is green: every action marked “App executes
in V1” still requires the named real provider contract/mapping, separately permitted proof, bodyless
readback, monitor/correction evidence, Registry code review, and exact authority. When a row is absent,
retain its recommended closed default and use the invented aliases for regression; do not add another
generic fake or infer an endpoint.

At every approved external slice boundary:

- verify that the existing typed adapter matches the supplied official/account contract before any
  provider call; change code only when that evidence proves the current boundary incomplete;
- add focused unit, rules/emulator, integration, and E2E tests proportionate to risk;
- falsify wrong role/scope/mailbox/ticket, stale preview, duplicate/concurrent attempt, unavailable
  provider, malformed input, data leakage, ambiguous outcome, and rollback/correction paths;
- keep existing Action Registry values closed unless the exact action has its documented contract,
  focused acceptance, code review, and separately authorized live activation;
- update `docs/facts.md` with dated evidence and acceptance IDs;
- delete superseded active guidance and add the unique marker to the facts Supersede Log;
- update `docs/status.md`, `docs/plan.md` phase status/criteria, `docs/loop-state.md`, the suite status,
  `docs/feature-suites/README.md`, `docs/v1-gap-implementation-program-2026-07-14.md`, and every affected
  product, identity, integration, environment, client-checklist, implementation, AI-workflow, and
  autonomous-runner document;
- keep `/goal` active until all S20–S27 requirements are actually accepted, and always leave `/loop`
  with an exact next action that another context can execute without reconstructing history;
- run focused checks, then `bash scripts/verify.sh` at each completed program milestone. Also run
  Firestore emulator/rules tests and `npm run test:e2e:core` when the suite requires them.

Hard boundaries remain in force. This prompt authorizes safe repository implementation and the final
Git commit/merge/push described below. It does not authorize any live/customer Gmail read, live Google/
Rentvine/Sheet/Drive/Dotloop/Boom/LeadSimple/QuickBooks/SMS/portal action, external Vendor invite, OAuth
consent/token, source import, TTL/cloud/Secret Manager/Firebase/Workspace configuration, send, system-
of-record write, deploy, production smoke, or traffic change. Product inclusion is not operational
authority. Never use a personal Google identity. Before a separately authorized live Google read, run
`npm run preflight:adc`; if stale, stop and ask the owner to run `npm run auth:session` in their terminal.

Do not stop before completing any independent safe local verification or regression-repair slice.
Stop local feature expansion when verification is green and only external rows remain. Select another
independent checklist row only when its evidence/authority exists; otherwise leave the repo
migration-ready and externally blocked. Record each real blocker through the existing exact checklist,
not a vague “waiting on approval” and not a duplicate client note.

When the safe implementation run is complete:

1. inspect the complete diff and ensure no secret, customer record, Gmail content, generated test log,
   or unrelated artifact will be committed;
2. run the full required verification and repair all regressions;
3. ensure facts/status/plan/loop/specs/program ledger accurately distinguish Local green, Gated,
   Live-proven, and Accepted;
4. commit all intended repository changes with an accurate message;
5. if work occurred on a feature branch, merge it into local `main` non-destructively;
6. push `main` to `origin` and verify local `main` matches `origin/main`;
7. report the commit SHA, verification evidence, what is complete, every exact remaining live gate,
   and the next executable `/loop` step. Do not claim final V1 if required real-provider proof or
   Dan/Josiah acceptance is still gated.

---
