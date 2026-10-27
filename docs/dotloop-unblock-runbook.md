# Dotloop unblock: resume runbook

Saved 2026-10-23 for the moment the owner reports that A1 is done. A1 is done when Dan, a full
Dotloop admin, has added `integrations@pmikcmetro.com` as an agent in the office that holds the
LEASE RENEWAL loop template (`docs/open-blockers.md`, A1 and B-DL2). Start a fresh session and
paste the prompt below. Nothing in this file grants authority beyond what the prompt states.

## State when this was saved

- **Production.** It serves `79764b56011bd2571a56435aa7df21f2677d846a` /
  `pmi-kc-app-rmvkpw2ey-bfdf11ed1ed3` (S230, run `eee80164`). The queue is empty. No runtime
  change waits on Dotloop, so this stage needs no redeploy unless it finds a code defect.
- **Verified ready on 2026-10-22/23.**
  - Claude Code and Codex.
  - The WSL CLI/ADC store, as `josiah@pmikcmetro.com`.
  - RentVine: 374 leases.
  - The operating Sheet: 29 tabs, as integrations@.
  - Gmail DWD: four scopes.
  - The sequence worker.
  - Deployment wiring.
  - The guarded Admin canary profile, which signs in as `josiah@pmikcmetro.com`.
- **Dotloop on 2026-10-23.**
  - The integrations login now has Templates rights and lists LEASE RENEWAL in the company library.
  - It has no People rights and no office agent profile.
  - The API read was unchanged: Default Profile 20643897 returned 200 with zero templates, and company profile 16466152 returned 403. That 403 is documented API behavior: templates reach only an office member's INDIVIDUAL profile.
  - No selection is saved.
  - Both write keys are closed (`dotloop.loop.create_from_template`, `dotloop.document.upload`).
- **Dotloop on 2026-10-27.** The owner reported A1 done; this run's re-read found it not yet effective.
  - API at 09:17:28Z: unchanged (Default Profile 200 with zero templates, company 403).
  - UI as integrations: My profiles lists only Default Profile; People reads "PMI KC Metro (admin)"
    for integrations, while office agents read "PMI KC Metro (admin) and PMI KC Metro".
  - Dan's remaining step: add the PMI KC Metro agent membership, keeping admin.
  - LEASE RENEWAL shows transaction type Lease (`LEASE_OFFER`), so no type change is needed.
  - Copy `read-managed-access-20261027.cjs` next time; the canary wrapper is
    `readonly-admin-canary-20261027.sh` (phase `post_promotion`, because `candidate` refuses the
    canonical origin).
- **Content holds.** These are independent of A1:
  - B-DL3: approved originals, field and signer maps for the ten form families.
  - The fee policy and the Rhino policy material.
  - The notice timing basis (A5).
  - The tracker `PMI-renewal-setup-tracker-2026-10-22.xlsx` collects these from the client.
- **Private receipts.** They live outside Git, in
  `Documents/Codex/2026-10-16/pmi-delivery-01a1461d/connections-readiness-20261022/`:
  - `readiness-checkpoint.json`
  - Dotloop readbacks: `dotloop-access-readback-2026102*.private.json`
  - the bounded read script `read-managed-access-20261023b.cjs`
  - the diagnostic canary `diag-predecessor-canary.sh`
  - the browser probes `probe-*.mjs`

## Resume prompt

```text
PMI — Dotloop unblocked: verify, select and prove unattended operation

The owner reports A1 is done: Dan added integrations@pmikcmetro.com as an agent in the office that
holds the LEASE RENEWAL loop template. Work with me until the renewal workflow's Dotloop seam is
verified and selected, every other seam is re-proven, and the system is confirmed to run unattended
within its authorized scope. This is execution: run the checks in order, fix agent-owned defects
through PMI's normal route, and stop only on one exact human or provider fact.

Recover the current state
- Repo josiahH-cf/pmiKCkb_and_ownerRouter. Read AGENTS.md, docs/facts.md, docs/loop-state.md,
  docs/open-blockers.md (the single holds record), docs/dotloop-unblock-runbook.md and
  docs/environment-handoff.md. Read the private readiness-checkpoint.json and the latest Dotloop
  receipt named in the runbook before repeating anything.
- Work in a fresh worktree from origin/main; use WSL git for WSL worktrees. Preserve the original
  Windows checkout, registered release pairs and owner files under docs/ (stage explicit paths).
- Re-read production identity live (/api/version, Cloud Run traffic); never trust a doc for it.

Run the checks in this order, recording time, identity and result for each
1. Authentication. Run npm run auth:ensure. Then run the canary check with --admin-email=josiah@pmikcmetro.com
   as the runbook shows. If headless Chromium produces no animation frames, unset DISPLAY and
   WAYLAND_DISPLAY. If Google asks for a person, give me the one enrollment command in a terminal
   tab and wait. Never type a password, code or passkey. Ask me before restarting WSL.
2. Production and controls: exact version and 100% traffic, Demo=false, Sheet=true, billing and
   cost-control readback, both Dotloop write keys closed in the Action Registry.
3. Seams: RentVine and Sheet live read smokes, Gmail DWD scope mint, sequence worker health, as in
   the October 22 receipts.
4. Dotloop read (the gate). Copy the bounded read script to a new output name pointed at the fresh
   worktree. Success: an INDIVIDUAL profile for integrations lists LEASE RENEWAL with its template
   id and API transaction type. The company profile stays 403 by design. If it still lists nothing,
   ask me to sign in to Dotloop as integrations in the browser pane. With me signed in, check
   whether People or the profile switcher shows the office membership; I handle any Press & Hold.
   Then give me one exact ask for Dan. Never recreate a template, guess an id or infer
   nonexistence from an empty list, a 403 or a 404.
5. Template facts. The app accepts only API types LISTING_FOR_LEASE or LEASE_OFFER and the
   statuses the app lists for that type. If the type is unsupported, say exactly what Dan changes.
   The initial loop status is a PMI choice; ask me if it is not already recorded.
6. Selection. Launching this prompt authorizes one reversible app configuration change: in my
   signed-in Admin session, refresh Dotloop resources and save the exact profile, template,
   transaction type and initial status in Connections. Read the selection back through the app
   and the readiness page. It authorizes no provider write.
7. Tests and integration runs: the focused Dotloop unit tests, then a read-only guarded Admin
   canary against production (all 13 routes), plus the readiness page showing the selection.
   Run the full gate and served E2E only if code changes, then release through
   docs/release-batch-runbook.md.
8. End-to-end map: for the renewal journey (desk, lease workspace, notice, communications,
   Dotloop packet, signature handoff), state what is live and verified, what is configured but
   unproven, and what is missing. Name the owner of each gap and the exact client input needed:
   B-DL3 originals, maps and signers; fees and Rhino; notice basis A5; initial status.
9. First-packet readiness, read only. Packet assembly is per lease: it refuses until that lease
   has a current packet with the owner's approval of the Working terms, an approved form catalog
   that matches the selected template, and a reviewed name, email and documented Dotloop role
   for each required signer (assemble() in lib/lease-renewal/execution/normal-packet-action.ts).
   By default, report only the aggregate B-DL3 holds from the readiness page: form families,
   originals, maps, applicability, signers and fee policy. Pick no customer lease yourself. If I
   name one lease, read its packet state through the read-only document-handoff readback
   (GET /api/lease-renewal/document-handoff?leaseId=<id>) and report which inputs it has. Open
   no write key and create no loop or upload in this run: provider writes are not verification
   proof. The first real loop is ordinary staff-confirmed production work after the applicable
   B-DL3 inputs are approved, under its own exact owner authorization.
10. Unattended confirmation: auth:ensure --unattended READY (gcloud, ADC, env, gh, canary), the
   read-only release prerequisites collector READY, the sequence worker healthy, and no human
   step left for routine operation beyond the named holds.

Finish
Update open-blockers (A1 resolved with readback time; remaining holds exact), facts, loop-state and
status through a docs-only PR: full gate, exact-main CI, merge. Keep secrets and customer data
out of Git. Give me a concise readiness result and the client-facing gap list. Do not claim full
application acceptance; human verdicts stay separate.
```

## Command reference

Run these in WSL from a fresh worktree of origin/main. Use the native release PATH when a step
calls release tooling.

```bash
npm run auth:ensure -- --unattended
```

```bash
PLAYWRIGHT_CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm run auth:ensure -- --need=canary --unattended --admin-profile=/home/josiah/pmi-assurance/owner-admin --admin-email=josiah@pmikcmetro.com --origins=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app
```

```bash
curl -s https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/version
```

```bash
npx vitest run tests/unit/oct15-dotloop-discovery.test.ts tests/unit/s106-dotloop-connection.test.ts tests/unit/oct20-template-process-readiness.test.ts tests/unit/s120-resource-configuration.test.tsx
```

- **Dotloop read.** Copy `read-managed-access-20261023b.cjs` to a new dated name. Set its `root`
  to the fresh worktree and its `output` to a new receipt name, then run it with node. It reads
  serving configuration, the connection, profiles and templates. It makes no selection or provider
  write.
- **Selection contract.**
  - `POST /api/connections/dotloop/resources` refreshes the observation; it requires an Admin.
  - `POST /api/connections/dotloop/selection` takes `profile_id`, `template_id`,
    `transaction_type` and `initial_status`. It is Admin-only and checked against the fresh
    observation.
  - `GET` on the same route reads the selection back.
  - The guarded canary browser blocks mutations, so the selection goes through the owner's signed-in Admin session.
- **Allowed values.**
  - `LISTING_FOR_LEASE`: PRE_LISTING, PRIVATE_LISTING, ACTIVE_LISTING, UNDER_CONTRACT, LEASED or ARCHIVED.
  - `LEASE_OFFER`: PRE_OFFER, UNDER_CONTRACT, LEASED or ARCHIVED.
- **Display failure.** If the frame probe or the canary stalls on `aria-busy` panels, run from a
  shell with `unset DISPLAY WAYLAND_DISPLAY`. The guarded browser is headless.

## Done when

- The template lists on the integrations INDIVIDUAL profile.
- The selection reads back in the app.
- Both write keys are still closed, and no loop, upload or other provider write occurred.
- The read-only canary passes.
- The first-packet readiness report names each missing aggregate B-DL3 input and its owner, plus
  the named lease's inputs if the owner named one.
- `auth:ensure --unattended` reads READY.
- The open-blockers packet names only the remaining client content holds and human verdicts.
