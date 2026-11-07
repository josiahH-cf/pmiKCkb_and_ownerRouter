# Run the November 7 PMI KC renewal usability batch unattended

Implement, verify, merge and carry this named batch through PMI KC's normal authorized
delivery. Work until the batch is delivered or a specific external or authority gate holds
the dependent step. Make ordinary decisions from evidence, record why, and continue independent
work. This is the execution instruction for this batch when I paste it.

1. **Pin authority and source.** Use `josiahH-cf/pmiKCkb_and_ownerRouter`. Read `AGENTS.md`,
   `docs/facts.md`, `docs/loop-state.md`, `docs/plan.md` and the November 7 section of
   `docs/feature-suites/README.md`. Read the registered specs and supporting S162 and S250–S254
   contracts. The previous app release and comparison baseline is
   `ef81b8917209f4eec3f22097142b559f3cce875b`. Fetch remote main and resolve the exact published
   specification commit from the addition of S259. Record it and current main separately.

   ```bash
   git fetch origin
   litmus_path=docs/feature-suites/renewal-usability-final-journey-litmus.md
   spec_sha=$(git log --format=%H --diff-filter=A origin/main -- "$litmus_path" | tail -n 1)
   test -n "$spec_sha" && git merge-base --is-ancestor "$spec_sha" origin/main || exit 1
   git show -s --format='%H %s' "$spec_sha"
   git rev-parse origin/main
   ```

   Start a separate branch and clean worktree from current remote main. Record unrelated
   changes and leave them alone. Check open PRs and current loop ownership before editing.
   Wait for an overlapping PR to merge before touching its files. Keep one implementation
   owner, one rehearsal or full gate at a time, and one release watcher. Use Linux Node and
   npm inside WSL with the approved local stores. Run `npm run auth:ensure` there and use
   approved refresh paths. A real password, code, passkey or CAPTCHA requires the owner.
   Read the relevant installed Next.js guide under `node_modules/next/dist/docs/` before
   touching routes, pages or server code.

2. **Implement the registered behavior in dependency order.** Begin with the shared stage
   and cycle rules (S248 and S255), then the monthly working-batch table, existing full table
   switch and exact target counts (S246). Deliver the single Guided current action and
   retain every applicable detail, control, old Focus URL, saved context and eligible working
   text in Guided or Full (S247 and S258). Work and recover the shared collection journey
   (S201). Unify message readiness and the exact message bytes across lease, Communications
   and Gmail draft paths (S224, S249 and S162). A versioned saved blank signature satisfies
   setup. Require only the facts the particular outgoing action uses and keep local editing
   and Copy available. Keep exact confirmation, authorization, receipts and reconciliation
   for Send, Schedule, Resume, replies and draft export. Deliver named staff and process
   destinations and scoped Admin and Connections tasks (S256 and S257). Make rendered Help
   and material scene drift checks required in normal verification, then update Help,
   synthetic scenes and the control map (S242, S243 and S252). Qualify the whole batch with
   S259 last. Preserve the settled owner decisions, standing-agreement, assistance, forms and
   completion paths. Only the selectable Focus choice is superseded. Keep controls, reviews,
   confirmations, saved views, filters, collections and old links reachable. Update affected
   specifications in place, including a changed pinned label wherever it is tested, taught or
   mapped. Follow S252 R-S252-7 for the canary and independent reconciliation changes in
   the same slice as affected desk and lease rendering. Keep their read-only and timing bounds.

3. **Drive the real UI in rehearsal.** Use `scripts/run-renewal-one-path-rehearsal.sh` on a
   clean exact candidate, with `--hold-automatic-comparison` in every automated session.
   Require the network guard preload on every rehearsal process before startup. Use local
   demo roles, the November 5 mix, bounded synthetic faults and loopback stand-ins only.
   Block outside browser navigation and requests. Use the mail adapter only for isolated
   synthetic effect cases. Read the harness header for role sign-in and controls. Follow
   S252's engineering walk and original budgets, then the versioned S254 profile and final
   S259 handoff. State expectations before observing each journey. Actually work the browser
   through the decision, result, reload/readback and return or recovery, across the required
   roles, widths, themes, pointer and keyboard. Record PASS, FAIL or UNVERIFIED with the exact
   SHA and evidence. Preserve old verdicts, including the historical S254 L55 failure. Repair
   failures in their owning slice and rerun the whole matrix on one final candidate. A
   responsive viewport, synthetic receipt and human observation are distinct. Keep the staff
   verdict NOT RUN until the actual S252 staff session supplies it.

4. **Verify, merge and deliver.** Run focused falsification and preservation tests,
   `bash scripts/verify.sh`, `npm run test:e2e:core` and the required rendered Help checks
   in WSL. Stage explicit paths only. Publish a PR, verify every CI lane on its exact head
   and current base, satisfy any required review, then merge the verified batch. Confirm
   remote main and wait for green push CI on the exact release SHA. If the runtime or served
   assets change, use `docs/environment-handoff.md` and `docs/release-batch-runbook.md`.
   Qualify the actual release queue, registered checkout pair, approved CLI/ADC and guarded
   Admin readiness, cost/configuration readback and free lock. Use the print-only plan,
   prepare a fresh exact-SHA permit and require fresh locked GO through the normal controller.
   Capture the exact serving predecessor and its recovery target. Build one zero-traffic
   candidate, reconcile and smoke its exact revision, and promote only against the matching
   receipt. Finish the required observation window and independent final readbacks before
   declaring delivery. Keep release assurance within the approved guarded read-only
   candidate/canonical procedures. If required assurance conflicts with an active owner
   restriction, report the exact hold and preserve the gate. Reconcile uncertain operations
   before retry, preserve failed evidence, and use only the runbook's receipt-bound rollback.
   A documentation-only change does not need an application revision.

5. **Honor the effect boundaries and report.** The product audit and litmus never open the
   production Renewals desk. No live customer send, Gmail draft, schedule, mailbox access,
   provider business write, production test record or billed lookup may serve as verification.
   Preserve budgets, guardrails, identities, roles, security, runtime configuration and
   Action Registry keys. No push to protected paths, force-push, history rewrite, tag or branch
   deletion. Keep client values, secrets and raw evidence out of Git. Keep real approvals,
   case and form facts, human signing and Dotloop activation under their existing separate
   holds. Report user-visible before and after, each journey result and remaining evidence
   gap, exact branch/PR/main/CI and deployment readbacks, and the actual end-to-end blockers.
   Update current facts, status, plan and loop state using verified outcomes.
