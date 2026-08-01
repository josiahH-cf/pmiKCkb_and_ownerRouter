# Meta-Prompt — Production Phase Unattended Loop (Durable Fresh-Context Launcher)

Canonical fresh-context launcher for the live production phase authorized 2026-07-29. Hand this
whole file to any agent runner as its opening instruction.

**Runner-neutral by design.** Nothing here assumes a particular model, vendor, context window, or
harness. It does not assume you can spawn sub-agents, run tasks in parallel, or hold the whole
repository in context. Where a capability might be absent, the instruction says how to proceed
without it. If any instruction conflicts with your own operating rules, follow your rules and
record the conflict in the ledger rather than silently skipping the step.

---

## 0. What you are doing

PMI KC is a property-management operations application. It is past the prototype stage: it is
deployed, it holds real client data, and its owner has authorized a live production phase. You are
continuing an established build loop, not starting a project.

Your job is to consume the current resume fields in `docs/loop-state.md`, execute that bounded slice
within the dependency topology in §4, verify and falsify it, and update the durable context so the
next fresh-context run can continue without you.

You are not asked to redesign the product, revisit settled decisions, or invent scope.

**No-replay rule.** `docs/loop-state.md` is the sole mutable handoff. Its `next_suite`, `next_spec`,
`active_slice`, and `last_completed_slice` fields select the work; §4 supplies constraints and
dependencies, not permission to replay completed numbered items. Inspect fresh code and evidence
before trusting any dated checkpoint. As of the 2026-07-30 handoff, the last verified application
baseline is `373f968` (an ancestor of the documentation handoff); the next slice is S25's
`gmail.label.apply` contract, followed by the renewal and maintenance draft pair.

---

## 1. Authentication and capability preflight (do this first, in one pass)

Establish what you can actually do, and write the answers into your working notes. Do not assume.
After confirming that you can run a shell, the first repository command in the session is:

```bash
npm run preflight:adc
```

Then check the active gcloud identity and the CLI token without ever printing the token:

```bash
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud auth print-access-token >/dev/null
```

The active account must be a managed `pmikcmetro.com` identity or the documented project service
identity. ADC and the gcloud CLI token are separate checks; all three checks must be green before a
live Google/Firestore/Sheets/Vertex read, cloud mutation, deploy, smoke, or traffic command.

If any auth check fails or a personal identity appears, do not improvise credentials or try to
reauth non-interactively. Record the failed check and the exact owner action:

```bash
npm run auth:session
```

That command is interactive and owner-run. Its failure parks only live/cloud work; continue local
and app-plane slices unattended.

Now finish the capability check:

1. Can you read files and list directories?
2. Can you edit and create files?
3. Can you run shell commands and see their output?
4. Can you run long commands (several minutes) without being cut off?
5. Do you have network access?

**Degradation rules.** With (1) and (2) only, you may do specification and documentation work but
must not claim any gate passed — say explicitly that gates were not run. Without (3) you cannot
complete a build slice; stop and report. Without network or green auth you may still do every
independent local/app-plane and build-to-seam slice in §4; park only the operation that actually
requires the unavailable capability.

Never report a gate as passing unless you ran it and saw it pass. A plausible-looking command you
did not execute is a fabrication, and in this repository it will be caught.

---

## 2. Read the durable context, in this order

Read these before editing anything. They are the authority; this file is only a launcher.

1. `docs/facts.md` — the Tier-0 fact ledger. Large and wide. At minimum read
   `F-PRODUCTION-PHASE-AUTHORIZED`, `F-LIVE-DATA-AUTHORIZED`, `F-GREENLIGHT-NAMED-KEYS`,
   `F-LOOP-AUTONOMY-2026-07-29`, `F-COST-CEILING-S52`, `F-FIRESTORE-BACKUPS`, `F-PILOT-ROLLOUT`,
   `F-RETENTION-LIVE-RECORDS`, and the Supersede Log.
2. `docs/loop-state.md` — the short resume pointer. Consume `next_suite`, `next_spec`,
   `active_slice`, and `last_completed_slice`. If it disagrees with a dated checkpoint in this
   file, **`docs/loop-state.md` wins**, provided it does not bypass a prerequisite or safety rule.
3. `AGENTS.md` — the runner-neutral router. Read the **Production Phase Authorization** section in
   full; it is the controlling grant for this phase.
4. The spec for the suite you are about to build, from `docs/feature-suites/`.
   For the current Gmail residuals, read S25 and S51; before the draft pair also read S26 and S38.
5. `docs/autonomous-agent-runner.md` — how a slice is run, verified, falsified, and handed off.
6. The real implementation modules and tests named by the active spec. Documentation does not
   substitute for inspecting the current route, service, store, registry, matrix, and provider.

Use two truth layers. `AGENTS.md`, `docs/facts.md`, and the active spec govern authorization,
safety, and intended behavior. The code and observed runtime govern what is implemented or active.
Code may prove that a documented capability is missing or inert; it never grants broader
permission. If code is more permissive than governance, fail closed and record a control defect. If
a document says “live” but the exact gate, forwarded configuration, serving revision, or runtime
evidence is absent, correct the claim to built/prepared rather than treating prose as proof.

---

## 3. What you are authorized to do

Granted by the owner on 2026-07-29 through the Production Phase Authorization; the sanitized D01–D64
record labels reconstructed and receipt-needed rows instead of claiming an unavailable
browser-local response export:

- **Commit and push to `main`** whenever the full local gate is green. No force-push, no history
  rewrite, no tag or release creation, no branch deletion.
- **Deploy, run a bounded read-only smoke, and promote traffic** when the full gate; all three auth
  checks; S52's reviewed non-null ceiling; the budget and environment preflights; prior-revision
  capture; rollback; and smoke all pass. Deployment is not owner-only under D05.
- **Continue through uncertainty.** When a point is genuinely undecided, record it in the single
  owner packet, apply a documented safe default, and keep building. An undecided point is not by
  itself a reason to stop.
- **Interleave provider suites S28–S39** whenever no S40–S50 slice is mid-flight, except S36/S37.

**Cloud Automation Grant (2026-08-01) — run the command, do not ask.** The owner granted standing
authority to execute cloud-configuration commands under the managed identity, because per-command
approval was consistently blocking unattended work. This covers billing budgets/thresholds/
notification channels, quota and API enablement, Firebase authorized domains, OAuth redirect URIs,
Pub/Sub topics/subscriptions/push endpoints, IAM grants the application itself needs, Cloud Run and
Functions creation/deploy/tag/promote/retire, and project creation a named suite requires. Read the
change back from the live resource and record it in `docs/facts.md`. The controlling text is the
Cloud Automation Grant in `AGENTS.md`. Do not park these as owner steps.

The owner still performs interactive `npm run auth:session`; supplies vendor endpoints/artifacts and
any credential or secret held outside GCP; and authorizes destructive Production
migrations/deletions. **Lowering** a safety control (reducing a ceiling, disabling the guardrail,
removing an in-use authorized domain, narrowing an alert) also stays an ask, because raising headroom
is reversible while removing a control live traffic depends on is an outage. A person in the product
still initiates and exact-confirms every client-facing send and every Live system-of-record write; no
automation or cost argument reaches those.

Never edit, remove values from, or rewrite `.env.local` to make a deploy pass. A deploy uses an
explicit sanitized target-environment map, and its preflight must name and refuse local-only or
emulator variables from both `.env.local` and the ambient process. If that refusal is not
implemented or is red, park the deploy.

### Protected paths — prepare, park, and continue

A change touching any of D12's exact six protected paths is prepared, explained, and surfaced for
owner review instead of being pushed under the standing grant:

- `firestore.rules`
- `lib/integrations/action-gate.ts`
- `lib/auth/**`
- a `production_allowed` change in `lib/integrations/action-registry-seed.ts`
- `scripts/check-budget-guard.mjs`
- `infra/budget-guardrail/**`

Park the protected patch in an isolated review diff or branch that is not an ancestor of any commit
pushed under the standing grant. Continue independent slices from a clean, pushable line; do not
let a later push carry the protected patch indirectly. Stop only when the protected review is the
sole remaining prerequisite and no independent work remains.

Additive `docs/facts.md` evidence may ship with a green slice when it records only commands actually
run, results observed, resolved `AC-*` ids, commits, revisions, or receipts. Authority-bearing edits
to `AGENTS.md` or `docs/facts.md` require explicit owner direction even though those documents are
not D12 code paths. Never silently widen authority, safety, identity, the cost gate, protected-path
policy, live-data permission, or action activation.

### The green light is a list of named keys

Capability activation is granted **per named Action Registry key**, each with a one-line
justification. There is no category grant, no readiness-tier grant, and no "everything that is
ready" grant — `lib/integrations/action-gate.ts` is a per-key seed lookup with no category concept,
so a category-shaped grant is unimplementable and would mean you, not the owner, chose the keys.
S53 holds the authoritative activation table. **Never widen it by inference.** A key absent from
that table is absent by decision.

S31 is a separate, narrow scheduler grant: after S52 supplies a non-null ceiling and auth/cost
preflights pass, the loop may create or update the one Cloud Scheduler job that renews the
read-only Gmail watch and raises internal attention. It may not draft or send a client message and
does not authorize any other scheduler, cron job, or scheduled workflow by analogy.

`runtime_action_gates_preflipped:false` in `docs/loop-state.md` means that there was no phase-wide
category preflip. It does **not** mean every pre-existing key is closed. At the 2026-07-30
checkpoint, `gmail.label.apply`, `gmail.renewal_notice.draft_create`, and
`gmail.maintenance_owner_notice.draft_create` are already `production_allowed:true`; their current
work is safety-contract hardening, not activation. Do not change those values. The direct-send keys
and generic send remain permanently disabled under D33.

---

## 4. Dependency topology and current continuation order

Take one coherent slice at a time. Do not batch unrelated work or violate a dependency. When auth,
cost, owner input, or protected review parks one operation, record it and continue the next
independent local slice; do not make the whole program idle.

### Completed baseline — do not replay

At the 2026-07-30 `373f968` checkpoint, S54.1 and its remote CI evidence; S53.1-S53.5's Sheet,
Drive, configuration, and Vendor seams; S52 I/J plus the fail-closed print-only planner; and S51's
dependency-safe close-only, effect-stop, A2/monitoring, incident, rollback, retention, capacity, and
log-hygiene seam are complete. Gmail reply/watch A2 and the immutable environment preclaim fence are
also complete. Do not rerun owner packets, apply Rules/monitoring/IAM/log-retention, perform the live
rollback rehearsal, deploy, rebuild old Production Test journeys, or claim any parked control is
active. Reopen a completed slice only if current code or a failing gate supplies specific contrary
evidence.

### Current dependency-ready work

1. **S25 — migrate `gmail.label.apply` through the canonical S20 execution contract.** The current
   route mutates Gmail and then appends an audit record. Replace that path with immutable,
   server-built action identity and preview; authoritative linked-thread/mailbox/lane context; an
   atomic claim in `action_executions` before provider construction or effect; one governed
   mutation; minimal provider readback; durable bodyless receipt, reconciliation, and restoration
   of the prior governed label set; explicit failed/ambiguous terminal states; and exactly one
   value-free A2 event emitted only after a committed terminal transition. Use the S20 collection,
   never `external_action_executions`. Remove the label action's impossible matrix dependency on
   permanently disabled `gmail.renewal_notice.send`. If label creation is a second provider
   mutation, either require the four governed labels to be provisioned or model that sub-effect
   durably—never hide it in catch-and-log. Demo, Test, Live-read-only, stale context, wrong lane,
   wrong mailbox, and malformed descriptors construct no Live provider. Preserve the existing open
   action gate; this slice contains no `production_allowed` change.
2. **Falsify the label contract before moving on.** Exercise concurrent confirm and replay,
   crash/ambiguity after provider mutation, stale or forged workflow context, wrong mailbox/lane,
   missing label, audit-sink failure, suspension, invalid environment, and Demo/Live-read-only
   refusal. Prove no duplicate effect, no duplicate A2, and no reason/thread/email/customer value in
   A2. Run focused Gmail/S20/runtime/matrix/schema tests, then every gate required by §5.
3. **S25/S26/S38 — migrate the renewal and maintenance draft pair.** Replace boolean-only
   confirmation with S20 prepare returning an execution id plus immutable preview hash. Re-resolve
   authoritative lease/ticket, recipient, mailbox, and template facts at execution; claim before
   constructing Gmail; create exactly one unsent draft with a deterministic RFC Message-ID; fetch
   minimal readback; reconcile by that identifier without blindly retrying ambiguity; and emit A2
   only from committed failed/ambiguous terminal state. Production+Live is required before claim;
   Demo/Test/Live-read-only constructs no provider. Add
   `gmail.maintenance_owner_notice.draft_create` to the canonical maintenance matrix and align its
   exact preview schema with the implemented workflow/mailbox/source fields. Human review and Send
   in Gmail remain the end state. Do not activate either direct-send key or generic send.
4. **Recompute the resume pointer.** After the Gmail residuals are green, update
   `docs/loop-state.md` from observed state. If auth or S52 remains blocked, continue the next
   dependency-ready local S40 release-safety slice: an environment-parameterized, sanitized,
   zero-traffic candidate path; current-manifest policy targeting; candidate smoke before
   exact-revision promotion; and captured rollback. The legacy auto-promoting wrapper is not
   D05-eligible.
5. **S52 values are SET as of 2026-08-01 — cost-bearing work is no longer parked on them.** The
   owner approved alert `$25` and hard stop `$100` from a measured baseline (July 2026 read `$0.00`
   on every guardrail notification). Both enforcement points were moved and read back: the budget
   `pmi-kc-kb-prod hard stop 100USD` and `KILL_SWITCH_CAP_USD=100` on the guardrail, so the
   effective stop is `min(100, 100)`. Alerts reach `josiah@` and `dan@pmikcmetro.com` through
   Monitoring channels on a `$25` alert-only budget, with an account-wide `$100` backstop covering
   the second project the project-scoped kill switch cannot see. The remaining caveat is that all
   budgets use `INCLUDE_ALL_CREDITS`, so `$0` net may reflect trial credits rather than free-tier
   usage; re-review at the first month reporting a non-zero `costAmount`. Full detail is
   `F-COST-CEILING-S52-APPLIED` in `docs/facts.md`.
6. **Live operational work requires every prerequisite.** Only with fresh auth, the full gate,
   non-null S52 controls, the S40 release path, prior target capture, bounded candidate smoke, and
   rollback green may the loop apply S51 alerting, deploy, rehearse rollback, promote an exact
   revision, finish remaining S54 parity work, or run S54's single bounded live eval. Each S53
   activation also requires its exact named value, provider contract, protected review, and paired
   deploy-wrapper forwarding.
7. **Continue the controlling UI/UX program** through remaining S40, then S41 → S42 → S44 →
   S43/S45 → S46 → S47 → S48 → S49 → S50. Interleave S28-S39 seams only as the router and current
   `docs/loop-state.md` permit.

### The constraint that breaks activations if you forget it

`scripts/deploy-demo-cloud-run.mjs` builds the Cloud Run environment with `--set-env-vars`, which
**replaces the entire map**, from a fixed allowlist, and wires only a small named set of secrets.
Therefore **no credential or configuration value can reach the running service without a paired
change to that wrapper.** Creating a secret is necessary and never sufficient. Every activation
slice prepares its paired wrapper change and proves that a provisioned-but-unforwarded value cannot
report as active. When the wrapper change accompanies a protected `production_allowed` change, keep
the activation package together for review. Never alter `.env.local`; deploy only
from the explicit sanitized target map after the named local-only-variable refusal passes.

---

## 5. How to run one slice

1. **Discover before editing.** Read the real modules named in the spec. Named files in a spec are
   examples; if the code has moved, the observable end state still governs. Never edit a file you
   have not read.
2. **Write the test first, or with the change.** Every behavior change carries a test.
3. **Implement the smallest coherent slice** that reaches an observable acceptance state.
4. **Verify.** Run the acceptance checks named in the spec, then the full gate:
   `bash scripts/verify.sh`. Also run `npm run test:e2e:core` when routes, auth, or rendering
   changed, and `npm run build` when anything in `app/` changed.
5. **Falsify.** Separately from verifying, actively try to prove your slice wrong. State the
   specific ways it could be broken and test each: a missing classification, a forged context, a
   shared resource id, a stale confirmation, a wrong-revision promotion, an unforwarded value
   reporting as active. A slice that has only been verified has not been checked.
6. **Classify the result honestly.**
   - **Built to seam:** locally implemented and verified; an external or protected step remains.
   - **Pushed:** the exact commit is present on `main`; this says nothing about deployment.
   - **Deployed/shipped:** the exact serving revision, bounded smoke, and rollback revision are
     recorded; this does not by itself make an action active.
   - **Active/live:** the exact action gate, forwarded configuration, traffic, and runtime
     acceptance evidence all pass.
7. **Update durable context.** Add or update an evidence-only `F-*` row citing the `AC-*` ids
   satisfied, advance `docs/loop-state.md`, append to `docs/status.md`, and update `docs/plan.md`
   if a phase `Status:` changed. If the facts edit changes authority or activation rather than
   recording evidence, park it as protected.
8. **Commit** with the gate result in the message. Push a green, unprotected commit. If the slice
   touched a protected path, isolate and park that review unit, then continue the next independent
   slice from a clean pushable line; never stack a push on top of the parked commit.

---

## 6. Safety invariants — these never yield to a green light

A capability grant activates a documented capability. It never relaxes one of these.

- **No autonomous, scheduled, bulk, or model-triggered client-facing send.** Every client-facing
  send and every system-of-record write is human-initiated and exact-confirmed. Internal-staff
  notifications may auto-send. S31's one scheduled read-only watch renewal may renew the watch and
  raise internal attention only; neither exception may draft or send client content, and neither
  generalizes to another scheduler.
- **No secrets, tokens, customer records, PII, or Gmail bodies in git**, in documentation, in test
  fixtures, or in release evidence.
- **No guessed provider endpoint, record URL, or customer value.** A generic provider link is
  navigation, never evidence. If an endpoint is not documented, the action stays closed — build to
  the seam and stop at that one flip.
- **Managed identities only.** Staff, agent, connector, cloud, build, and runtime identities are
  `pmikcmetro.com` or a project service identity. A personal account never appears in an auth path.
- **Every live effect is one-attempt, idempotent, receipted, monitored, and reversible.**
- **Demo and Production never share** a data store, credential, effect transport, or receipt. An
  unknown environment or data classification fails closed — it never defaults to Live.
- **No big-bang deletion.** Removal is two-stage: hide, redirect, and instrument first; delete only
  with consumer, route, role, test, and rollback proof. Static reachability is never deletion proof.

Violating one of these is itself a falsification: stop, revert the slice, and record what happened.

---

## 7. When to actually stop

Do not stop for routine uncertainty — §3 tells you to queue it and continue. **Do** stop and hand
back when:

- a safety invariant in §6 would have to be broken to proceed;
- interactive auth, a secret/credential the owner holds outside GCP, a destructive Production
  operation, the lowering of a safety control, or a vendor endpoint/artifact is the sole remaining
  prerequisite after every independent slice has been exhausted. **IAM, billing, quota, domain, and
  service/project changes are NOT on this list** — the Cloud Automation Grant covers them, so run
  them and verify the readback instead of handing back;
- the full gate fails for a reason you cannot diagnose, or a gate result would have to be
  misreported to continue;
- a protected patch is isolated and ready for review and no independent pushable slice remains;
- an irreversible or externally-visible action is required that this file does not clearly
  authorize.

Do not stop merely because auth is stale or one protected review is pending. Park the affected
live/protected operation and keep building the independent queue. The S52 ceiling is no longer a
reason to park anything: it was set and verified on 2026-08-01.
Likewise, do not call a routine D05 deploy, bounded read-only smoke, or revision traffic promotion
owner-only once every condition in §3 passes.

When you stop, produce **one** consolidated owner packet: what is done, what is blocked, the exact
owner action for each blocked item, and what will proceed the moment it lands. One packet, not a
stream of questions.

---

## 8. Reporting honestly

- If tests fail, say so and show the output.
- If you skipped a step, say which and why.
- If you could not verify a claim, mark it unverified rather than asserting it.
- If a document you were told to trust turned out to be wrong, say that plainly and correct it.
- Do not describe work as complete until it is complete and verified.

The single most valuable thing you can do in this repository is refuse to overstate what is true.
The recurring failure mode here is not bad code — it is a capability recorded as live that is
silently inert, or a document that reads as current after it stopped being true.

---

## 9. Open the loop

Start at §1, then §2. Record the worktree and local/remote commit state without discarding existing
changes. Consume `next_suite`, `next_spec`, `active_slice`, and `last_completed_slice` from
`docs/loop-state.md`, constrain that slice by §4, and begin it. Never use a dated checkpoint in this
launcher to override newer durable state, and never replay a completed slice without specific
contradictory evidence. Do not reopen the 64 decisions settled on 2026-07-29 or the D-01–D-14 set
settled on 2026-07-28 unless you find evidence that directly contradicts one, in which case record
the contradiction and continue.
