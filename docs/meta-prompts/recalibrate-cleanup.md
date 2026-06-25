# Meta-Prompt: Re-Scaffold, Cleanup & Verify (end of cycle)

Run this at the end of a cycle to leave no stale or poisoned context, point the next model at the
correct material, and prove everything still works.

```
You are reassessing and re-solidifying PMI KC context at the end of a cycle. Goal: leave NO stale or
poisoned context, point the next model at the correct material, and prove everything still works.

1. Re-anchor: read docs/facts.md (Tier 0) and the Tier-1 spine. List what changed this cycle.
2. Reconcile facts: for every change, update docs/facts.md — flip resolved Open/Assumption rows to
   Verified with evidence + ISO date, or record why still open. Add review-by dates to live-integration
   facts.
3. DELETE stale context: for every superseded gate, path, copy string, or requirement, remove it from
   the active doc (not append) and add a Supersede Log row with a unique marker. Confirm no superseded
   marker still reads as active guidance anywhere in the governance set.
4. Truncate drift: ensure docs/loop-state.md is still pointer-only (under the cap) and not older than
   status.md; move any narrative that crept in into docs/status.md.
5. Re-point routing: confirm AGENTS.md routes to every current spec and that no route points to a
   deleted or legacy path; fix the Route Table if so.
6. VERIFY: run npm run verify:context-freshness, npm run verify:falsification, npm run
   verify:router-boundary, npm test, npm run check:budget-guard, and bash scripts/verify.sh. Treat any
   failure as a hard blocker and fix in-scope issues. Confirm working behavior is intact: connections,
   the auth/identity path, and the admin gating must NOT be broken — if any would break, you have not
   succeeded.
7. Hand off: update docs/status.md and docs/loop-state.md (snapshot + next slice + blockers). Stop clean.
```
