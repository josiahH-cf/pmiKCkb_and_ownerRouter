# Meta-prompt — Browser QA audit-and-fix pass over the manual walkthrough

Paste everything below the line into a model that has **(a)** a browser it can drive (sign in, click,
type, read the page, read console/network) and **(b)** write access to this repository. It runs the
manual QA walkthrough against a running instance, finds where the app deviates from the documented
outcomes, fixes each defect at the source, re-verifies in the browser, and annotates the walkthrough —
without consuming it (a human runs the same checklist afterward) and without leaving side effects in the
app or its data.

---

## Mission

Execute **every** process in `docs/manual-qa-walkthrough-2026-07-21.md` against a running instance of
this app. For each process: perform the steps in the browser, compare the real result to the documented
**"What should happen,"** and classify it. Where the app is wrong, fix it at the source in this
repository, re-verify in the browser, and record what you did. Leave the walkthrough a clean, re-runnable
checklist for the human who verifies behind you, and leave the app's data exactly as clean as you found
it.

## Read these first (do not skip)

- `docs/manual-qa-walkthrough-2026-07-21.md` — THE test script and the log. Each `### P<n>` block has
  **Where**, numbered **Steps**, itemized **What should happen**, then `- [ ] works as intended` and
  `- changes:`. There are ~90 blocks; cover all of them.
- `AGENTS.md` — the router. Its security, identity, and send boundaries bind you.
- `docs/loop-state.md`, `docs/whats-next.md`, `docs/facts.md` — current state, the open backlog, and the
  already-known gaps (do not re-report `⚠ Known gap` items as new defects).

## Environment

- Run against a **controlled instance you own** — a local dev server (`npm run dev`) is strongly
  preferred, or an explicitly non-production test deployment. **Do NOT run side-effectful steps against
  production.** Production is what the human demos; keep it pristine.
- **Auth:** sign in through the browser as the human directs. Use only a `pmikcmetro.com` account (or
  local demo mode on a dev server). **Never type or handle raw passwords, secrets, or 2FA codes
  yourself** — the human provides an authenticated session or uses their password manager. For the Vendor
  section, use the **Summit Plumbing Test Vendor**.
- Some processes need live providers (RentVine, Gmail domain-wide delegation) or human-only inputs (an
  authenticator app, a 28-minute idle timer). If a prerequisite is not present, mark the process
  **BLOCKED** with the exact prerequisite — do not fake it or force a live effect.

## Hard safety boundaries (never cross)

- **Never send a real email.** Draft-only. The single in-app send is the exact-confirmed reply on a
  **live** maintenance ticket — do not trigger it against a real recipient. If a step's only end-state is
  a send, mark it **BLOCKED — needs human**.
- Use **Test-lane / reserved test records** wherever the process allows. Never mutate real customer data
  (RentVine, the renewal tracking sheet, real tenant/owner records).
- Secrets stay in Secret Manager; never commit them. All identities stay `pmikcmetro.com`/service.
- **Do not deploy.** Do not touch the `main` branch directly (see the fix workflow).

## The audit loop — for each `### P<n>` block, in order

1. Read **Where**, **Steps**, and **What should happen**.
2. Perform the **Steps** in the browser exactly as written.
3. Observe the actual result; capture evidence (the on-screen text, a screenshot, and any console/network
   error).
4. Compare against **every** item under **What should happen**.
5. Classify the process:
   - **PASS** — every expected item matched.
   - **FINDING** — the app deviated: wrong text, wrong behavior, a missing control, an error, or a worse
     outcome than documented.
   - **BLOCKED** — you could not run it (missing live provider, human-only input, etc.).
   - **GAP-CONFIRMED** — a documented `⚠ Known gap` is present exactly as described (expected; not a new
     defect).
6. For a FINDING, decide where the bug is:
   - **App bug** → fix the code (default; prefer this).
   - **Doc bug** → the app's real behavior is correct and the walkthrough misdescribes it → fix the
     walkthrough text instead. Only choose this when you are sure the app is right.

## When you find a defect — root-cause and fix

1. Reproduce it, then trace the root cause in the code. Start from the route/component named in **Where**;
   the walkthrough quotes exact on-screen strings you can grep for.
2. Make the **minimal correct fix**. Preserve every safety invariant. Add or adjust a test with any
   behavior change.
3. Follow this repo's workflow: build in the `pmiKCkb-ui-ux-overhaul` worktree, run the full gate
   (`typecheck`, `test`, `lint`, `prettier --check`, `verify:copy-voice`, `verify:falsification`,
   `verify:context-freshness`, and other `verify:*` as relevant), keep `main` green, ff-merge into the
   primary checkout, and run `npm run build` in the primary checkout only. **Do not deploy.**
4. Re-run the process in the browser (reload/restart the dev server) and confirm it now matches **What
   should happen**.
5. If the corrected behavior changes the steps or the expected outcome, update the **Steps** /
   **What should happen** text above so the doc stays accurate.

## Annotate the sheet — non-destructively (this is how the human still uses it)

Under each process block, **leave the two human lines exactly as they are:**

- `- [ ] works as intended` ← never tick this. It is the human's box for their own pass.
- `- changes:` ← never write on this. It is the human's line.

**Add your own lines immediately below them:**

- `- model-result: PASS | FIXED | DOC-FIXED | BLOCKED | gap-confirmed`
- `- model-notes: <one or two sentences — what you observed, the root cause, the fix commit + file, or the exact blocker>`

Rules:

- If **FIXED**, `model-notes` names the commit and the file, and the **Steps** / **What should happen**
  text above is updated to the corrected behavior.
- If **DOC-FIXED**, the app was right and you corrected the walkthrough text; say what you changed.
- Keep the file prettier-clean. Do not delete, reorder, or renumber any process. Do not remove the human's
  structure. Commit the sheet annotations through the same worktree → ff-merge flow, and update
  `docs/loop-state.md` / `docs/status.md` per the repo's Documentation Rules if you shipped fixes.

## The two "untouched" invariants (verify both before you finish)

- **App state is untouched:** the app's data is as clean as you found it. Every Test artifact you created
  (test tickets, test Gmail drafts, vendor assignments, fixtures) is deleted or reset; no real send
  happened; no real customer record changed. List anything you could not clean and why.
- **The sheet is untouched for the human:** it is still a runnable checklist — every
  `- [ ] works as intended` is unchecked, every `- changes:` is empty, the Steps/expected text is accurate
  to the now-fixed app, and only `- model-*` lines were added.

## Final report

Deliver a summary:

1. **Counts** out of ~90: PASS / FIXED / DOC-FIXED / BLOCKED / gap-confirmed.
2. **Fixes shipped:** one line each — process id, one-line defect, commit ref, file.
3. **Blocked items:** each with the exact prerequisite the human/owner must supply (e.g. "connect
   RentVine", "run against a live env", "enroll an authenticator for the Test Vendor").
4. **Untouched invariants:** confirm both, or list the residue you could not clean.
5. **Redeploy recommendation:** whether a redeploy is warranted so the human can verify the fixes against
   the deployed app (deploy itself stays an owner step).

## Stop conditions

- **Stop and ask the human before:** entering any credential or 2FA yourself; any step whose only
  end-state is a real external send/write you cannot do in the Test lane; or deploying.
- When every process is classified and every app-fixable FINDING is fixed-and-reverified, stop and deliver
  the report.
