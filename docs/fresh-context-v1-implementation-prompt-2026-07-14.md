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
7. the spec for the current first non-green suite

Then inspect `git status`, the current branch, and recent commits. Preserve all user work. Confirm the
starting point from the repository rather than this prompt: as written on 2026-07-14, S20 execution
authority, S21 trusted publication, and S23 Console live/test boundary are Local green, and the next
safe slice is S24. Run `npm run verify:context-freshness` before implementation.

Pursue the active goal until the safe local implementation is genuinely complete:

- S24 — Communications retention/legal hold, immutable v1.0 owner-renewal, tenant-renewal, and
  maintenance-owner artifacts, verified value replacement, and the source-visible/no-invention/
  human-exact-confirmed AI reply policy.
- S22 — external Vendor app-plane: Admin invite, one-time setup, verified-email TOTP gate,
  assigned-ticket-only authorization, per-vendor Gmail/Workspace OAuth abstractions, token-vault
  boundary, revocation, and emulator/fake-provider acceptance.
- S25 — Lease Renewal orchestrator and every R02 action: Gmail, operating Sheet writeback, Rentvine
  renewal writeback, Dotloop, Rentvine portal chat, SMS, and conditional Boom.
- S26 — Maintenance orchestrator and every R03 action: app account and mailbox lifecycle, Drive
  photos, Rentvine create/assign/update/close, owner email, Vendor email, LeadSimple, and QuickBooks
  draft bill.
- S27 — integrated fake/emulator E2E, acceptance ledger, pre-V1 report, monitoring and rollback plan,
  tab/browser acceptance plan, and final Dan/Josiah acceptance gates.

Follow the dependency order in the program and `docs/loop-state.md`; within S25/S26, treat one external
provider as one independently verified slice. Continue automatically between safe local slices without
routine owner review. Do not mark an adapter or V1 complete merely because a disabled interface or fake
exists: every action marked “App executes in V1” requires its documented real provider contract and
eventual permitted-environment proof. When an external contract/credential/approved mapping is absent,
build every honest local boundary and fake you can, leave the Action Registry closed, record the exact
gate, continue other independent work, and use the program's hard-stop packet format.

At every slice boundary:

- implement the entire suite contract, including negative paths and usability surfaces;
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

Do not stop merely because one future live gate exists. Continue every independent safe local slice.
Stop only when a repository rule requires it, the same quality failure survives the permitted repair
cycles, implementation would invent a provider contract/product decision, or no safe readiness-
improving work remains. Record each real blocker as an exact action/environment/data/permission/cost/
one-attempt/rollback/owner packet, not a vague “waiting on approval.”

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
