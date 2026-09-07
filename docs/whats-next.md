# What is next

Updated: 2026-09-07.

## Immediate action

Run `npm run auth:ensure` first; authentication is pre-approved (`AGENTS.md`, Authentication) and a
blocked credential names one human step without blocking anything else.

The renewal-completion program (S102-S111, rewritten S34) is committed through `7b3fdad` with
exact-SHA CI green and carried by zero-traffic candidate `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, which
passed its anonymous smoke and is not promoted. Production serves commit
`d243911cb20ffb01773072c0e27c723648eeea34` as revision `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`; its
immediate rollback is `pmi-kc-app-rmtkgn08q-db89a37c43dc`.

S112 (unattended authentication) is active: the automated login sequence is committed and read back
on 2026-09-07. Promotion now waits only on the owner's one-time S112 setup, `docs/open-blockers.md`
B-AUTH2. When it exists, the loop runs `npm run auth:ensure -- --need=canary` for both profiles on
both origins, the candidate receipt run, the promotion, and the observation from
`docs/loop-state.md`. Preserve `.claude/settings.local.json`, `output/`, and ignored `temp/` as
user-owned content.

## Implementation sequence

Use only the canonical queue in `docs/feature-suites/README.md`. S112's remaining slices come first
and need no candidate except the last: wire `ensureAuthenticated` into every live script, the
workstation secret template, the IAM audit, the assurance-harness integration of the canary sessions,
then the read-only canary claim. After that, the agent-owned list in `docs/loop-state.md` (S106/S34
runtime seams, the S100 link path, S98 seam, S108 property key, S34 readback, S110 window bounds, the
rehearsal-server defect), then S36 behind complete S100, then the S88-S95 program.

## Owner inputs that unblock promotion

- The S112 one-time setup (`docs/feature-suites/unattended-authentication.md`, Appendix B): the
  `Automation` organizational unit and its session policies, `pmi-runner@pmikcmetro.com`, the
  `pmi-kc-automation` service account and grants, the two canary accounts, both credential stores
  enrolled, and both canary profiles enrolled on both origins.
- Fast path for the current candidate: two managed profiles enrolled today with
  `npm run auth:enroll-canary` (one Admin, one claim-less account).

The candidate hostname is an authorized sign-in domain, `monitoring:verify` reads `READY`, and the
configuration fingerprint is captured; none of those is a hold. `docs/open-blockers.md` is the
current ledger, including the three Wednesday asks (B-DL3, B-S100, B-MNT1).

## Safe state while advancing

- The runner never types a password, one-time code, or passkey, never completes a CAPTCHA, and never
  copies a person's cookies or profile; when Google asks for a person, the named enrollment command
  is the only step.
- Assistant queries never grant access, start workflows, create generic approvals, send client
  communication, or execute provider/source actions.
- Completed S97-S99 and S100-chat proofs are not rerun, assigned to another record, or treated as
  category authority.
- The closed S100 resident-draft key may advance only with the exact eligible live mapping and its
  own proof, close/readback, protected activation, release, and readback.
- Dotloop live proofs need the owner's OAuth application and a connected account; every other
  renewal-completion suite is provable through project fakes and the local rehearsal browser.

## Runtime evidence

No product question remains open beyond the confirm-with-default items in `docs/facts.md`. Missing or
stale evidence blocks only its dependent gate and is never replaced with a personal identity, guessed
value, Demo record, or different production record.
