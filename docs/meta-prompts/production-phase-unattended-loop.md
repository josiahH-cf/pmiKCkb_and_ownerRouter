# Meta-Prompt — Production Phase Unattended Loop (S51–S54, then S40–S50)

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

Your job is to execute the ordered work in §4 one bounded slice at a time, verifying and falsifying
each slice before moving on, and updating the durable context so the next fresh-context run can
continue without you.

You are not asked to redesign the product, revisit settled decisions, or invent scope.

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

1. `AGENTS.md` — the runner-neutral router. Read the **Production Phase Authorization** section in
   full; it is the controlling grant for this phase.
2. `docs/facts.md` — the Tier-0 fact ledger. Large and wide. At minimum read
   `F-PRODUCTION-PHASE-AUTHORIZED`, `F-LIVE-DATA-AUTHORIZED`, `F-GREENLIGHT-NAMED-KEYS`,
   `F-LOOP-AUTONOMY-2026-07-29`, `F-COST-CEILING-S52`, `F-FIRESTORE-BACKUPS`, `F-PILOT-ROLLOUT`,
   `F-RETENTION-LIVE-RECORDS`, and the Supersede Log.
3. `docs/loop-state.md` — the short resume pointer. It names the next suite and the dependency
   order. If it disagrees with this file, **`docs/loop-state.md` wins** — it is updated each slice,
   provided it does not bypass a prerequisite stated in §4.
4. The spec for the suite you are about to build, from `docs/feature-suites/`.
5. `docs/autonomous-agent-runner.md` — how a slice is run, verified, and falsified.

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

The owner still performs interactive `npm run auth:session`; creates or grants credentials, OAuth
scopes, IAM, billing, and quota changes; creates projects/services; mutates Pub/Sub
endpoints/audiences, Firebase authorized domains, or OAuth redirects; supplies vendor
endpoints/artifacts; and authorizes or executes destructive Production migrations/deletions. A
person in the product still initiates and
exact-confirms every client-facing send and every Live system-of-record write. Do not treat D05 as
authority for any of those operations.

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

---

## 4. Build order

Take one slice at a time. Do not batch or violate a dependency. When an auth, cost, owner-input, or
protected-review boundary parks one operation, record it and continue the next independent local
slice below; do not make the whole program idle.

1. **S54 slice 1 — wire `test:firestore` into `scripts/verify.sh` and CI.** Do this first: the
   standing push grant is conditioned on "the full local gate is green," and today that gate omits
   the Firestore security-rules tests. Falsify the slice by proving a permissive Rules seed makes
   the widened gate fail, then restore the seed byte-for-byte.
2. **S53 slice 1 — route the live Sheet write-back through its gate** and add its
   environment-descriptor fence. `app/api/lease-renewal/writeback-execute/route.ts` currently
   writes to the client's operational spreadsheet without consulting its Action Registry gate,
   while the Registry row still reads not-allowed. This is a control-surface defect and it is the
   stated prerequisite of every other activation.
3. **S53 action-contract hardening — keep both provider keys closed while building their safety
   contracts.** Replace Sheet write-back's boolean-only confirmation with an immutable server-issued
   preview hash, one-attempt idempotency, durable receipt/readback/reconcile, and guarded correction.
   Replace comp screenshot's upload-on-first-POST path with preview/exact-confirm, idempotent receipt,
   readback/reconcile, and Drive-trash rollback. A folder choice or a passing gate does not waive
   these invariants.
4. **S53 sender/config slice — build the activation checks to the seam.** Re-key the
   `KB_APPROVAL_SENDER` cutover guard so a provisioned-but-unforwarded value can never report
   active, and prepare the required deploy-forwarding change. Do not set a live value, flip a
   protected Action Registry row, or deploy while auth or S52 is closed.
5. **S52 prerequisites — build the cost controls with the values unset.** Establish the baseline
   capture and inventory, single-source ceiling, paired-enforcement, coverage, and refusal
   machinery. Do not invent a number or reuse the retired cap. Park the protected
   `infra/budget-guardrail/` patch for review and continue.
6. **S51 app-plane — close-only first.** Land and falsify the pure close-only runtime-suspension
   combinator before its store or route, then build the incident, rollback, retention, alert-policy,
   and notification-channel definitions locally. Do not apply cloud policies or channels yet.
7. **S52 activation — establish the reviewed non-null ceiling.** Use supported burn evidence and
   the owner-owned billing inputs. Move the GCP budget amount and
   `KILL_SWITCH_CAP_USD` together — `infra/budget-guardrail/decide.mjs` applies the smaller value,
   so changing only one creates false headroom. Until both enforcement points are ready, every
   cost-bearing/live mutation remains parked.
8. **S40 release-safety prerequisite.** Before any D07 deploy, land the environment-parameterized,
   sanitized, zero-traffic candidate path, validate every S51 policy target against the current
   Production manifest, smoke the candidate before exact-revision promotion, and capture rollback.
   The legacy auto-promoting wrapper is not D05-eligible.
9. **Live operational work after S52 and the S40 release prerequisite.** With fresh auth, the full
   gate, budget guard, prior target, and rollback green: apply S51 alerting; use D05 to deploy the
   outstanding commit gap, smoke, rehearse rollback, and promote the exact revision; complete the
   remaining S54 parity work; and run S54's single bounded live eval. The live eval is never run
   while the S52 ceiling is null. Apply each S53 activation only after its exact protected review,
   named value, gate, and provider contract are complete.
10. **S40 remaining environment/data slices** — provider-construction sentinel, un-merge Demo and
    Live lists/counts, Production route and control exclusion, shell environment banner, and
    migration inventory/dry-run.
11. **Then** S41 → S42 → S44 → S43/S45 → S46 → S47 → S48 → S49 → S50, interleaving S28–S39 seams as
    their dependencies arrive.

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
- interactive auth, an IAM/billing/quota/scope/credential change, a destructive Production
  operation, or a vendor endpoint/artifact is the sole remaining prerequisite after every
  independent slice has been exhausted;
- the full gate fails for a reason you cannot diagnose, or a gate result would have to be
  misreported to continue;
- a protected patch is isolated and ready for review and no independent pushable slice remains;
- an irreversible or externally-visible action is required that this file does not clearly
  authorize.

Do not stop merely because auth is stale, the S52 ceiling is still null, or one protected review is
pending. Park the affected live/cost/protected operation and keep building the independent queue.
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

Start at §1, then §2, then take the first unfinished item in §4 — cross-checking against
`docs/loop-state.md`, which is authoritative for what is actually next. Do not reopen the 64
decisions settled on 2026-07-29 or the D-01–D-14 set settled on 2026-07-28 unless you find evidence
that directly contradicts one, in which case record the contradiction and continue.
