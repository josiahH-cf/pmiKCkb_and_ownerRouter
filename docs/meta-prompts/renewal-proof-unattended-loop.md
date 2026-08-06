# Meta-Prompt — Renewal Proof Unattended Loop (S57–S63)

Canonical fresh-context launcher for the renewal proof program authorized 2026-08-06. Hand this whole
file to any agent runner as its opening instruction. It supersedes
`docs/meta-prompts/production-phase-unattended-loop.md` as the active order; that file's §1, §3, §5,
§6, and §8 remain valid generic procedure.

**Runner-neutral.** Nothing here assumes a model, vendor, context window, or harness. It does not
assume you can spawn sub-agents or hold the repository in context. If an instruction conflicts with
your own operating rules, follow your rules and record the conflict rather than silently skipping it.

---

## 0. What you are doing

PMI KC is a live property-management operations application holding real client data. You are
continuing an established build loop, not starting a project.

The program answers one question with evidence: **does this app do the lease renewal job correctly?**
Four real leases will be worked through the app alongside the team's normal process, and the output is
a per-lease record and a report showing what the app concluded, what the humans concluded, and where
they differed. Everything in S57–S62 exists to make that comparison meaningful.

You are not asked to redesign the product, revisit settled decisions, or invent scope.

---

## 1. Preflight — run these FIRST, before any live read

**Two environment facts will waste an hour if you learn them the hard way.**

**(a) `node_modules` is installed for linux-x64.** Every `tsx`-based script fails in a Windows shell
with either `'tsx' is not recognized` or an esbuild "installed for another platform" error. Do **not**
run `npm ci` on Windows to fix it — that breaks the WSL side the owner uses. Run through WSL:

```bash
wsl -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && node node_modules/tsx/dist/cli.mjs scripts/<name>.ts --live'
```

Affects `discover:rentvine-fields`, `golden:capture`, `smoke:rentvine-read`, `smoke:sheet-read`,
`smoke:renewal-review`, `notices:reminders`. Also use `node node_modules/vitest/vitest.mjs run` and
`node node_modules/prettier/bin/prettier.cjs` from WSL.

**(b) WSL has its own gcloud home.** Google reads need the Windows credential file passed in:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/mnt/c/Users/josia/AppData/Roaming/gcloud/application_default_credentials.json
```

RentVine reads use env-file HTTP Basic credentials and work in WSL with ADC stale. Sheets, Firestore,
and Vertex do not.

**Then check authentication:**

```bash
npm run preflight:adc
gcloud auth list --filter=status:ACTIVE --format='value(account)'
```

The active account must be a managed `pmikcmetro.com` identity. If ADC is stale, do not improvise a
login or use a personal account. Hand the owner exactly this and continue with independent local work
meanwhile:

```bash
npm run auth:session
```

---

## 2. Read this, in this order

1. `docs/facts.md` — the fact ledger. Tier 0.
2. `docs/loop-state.md` — the resume pointer. It wins over every dated checkpoint anywhere.
3. `AGENTS.md` — the router. Read the **Renewal Proof Program Authorization** section in full.
4. `docs/renewal-proof-owner-decisions-2026-08-06.md` — what the owner actually decided, and the
   explicit limits on that provenance.
5. The spec for the slice named in `next_spec`.
6. `docs/autonomous-agent-runner.md` — the loop procedure, if you need the generic rules.

---

## 3. Authority

**You may**, without asking: build app-plane code and tests; build a live provider implementation and
its full preview/confirm/receipt/rollback contract; run read-only live reads once auth is green;
commit and push to `main` when the gate is green; deploy a routine revision, smoke it, and promote
traffic after gates, preflights, prior-revision capture, and rollback proof pass; run cloud
configuration under the managed identity, reading back every change.

**You must not**: force-push, rewrite history, create tags or releases, or delete branches; perform an
autonomous client-facing send; write to a client system of record without its exact confirmed
contract; use a personal account anywhere; put a secret, token, PII, or a guessed endpoint in git;
lower a safety control; start **S64**.

**D12 protected paths — prepare, isolate, and surface for owner review; never push:** `firestore.rules`;
`lib/integrations/action-gate.ts`; `lib/auth/**`; any `production_allowed` change in
`lib/integrations/action-registry-seed.ts`; `scripts/check-budget-guard.mjs`;
`infra/budget-guardrail/**`. Parking a protected change never parks the rest of a slice.

Authority-bearing edits to `AGENTS.md` or the `docs/facts.md` authority rows need explicit owner
direction. Append-only evidence rows travel with a green slice.

---

## 4. The ordered program

Run in this order. Each suite is `docs/feature-suites/<slug>.md`.

| #   | Suite                               | Slug                                       | Gate on starting         |
| --- | ----------------------------------- | ------------------------------------------ | ------------------------ |
| 1   | S57 portfolio-complete lease reads  | `portfolio-complete-lease-reads`           | none — start here        |
| 2   | S58 live lease data currency        | `live-lease-data-currency`                 | S57 merged               |
| 3   | S59 RentCast live activation        | `rentcast-live-activation`                 | S58 merged; key placed   |
| 4   | S60 comp persistence + under-market | `comp-persistence-and-under-market-signal` | S59 merged               |
| 5   | S61 recipient fan-out + separation  | `renewal-recipient-fanout-and-separation`  | S57 merged               |
| 6   | S62 owner-policy renewal pricing    | `owner-policy-renewal-pricing`             | S60 merged; MKD id known |
| 7   | S63 four-lease test set             | `four-lease-renewal-test-set`              | all of the above         |

**S65** (`feedback-report-closure`) is separately authorized and may interleave whenever no slice is
mid-flight. **S64** (`per-person-approval-authority`) is specified and **not authorized** — do not
start it.

**Why S57 is first, and it is not negotiable.** A live probe on 2026-08-06 established that RentVine's
`/leases/export` is page-limited and that every production caller passes no page parameter. No params
returns 25 rows (lease ids 1–25). `pageSize` is the honoured parameter and returns 305 distinct
leases; `limit` is accepted and **silently ignored**. So the Live Renewal Desk, the Console projection,
and the maintenance unit matcher have all been reading 25 of 305 leases — and none of the four test
leases is in that page. Nothing else in this program is reachable until it lands.

**The test cohort** is RentVine lease ids **278, 279, 280, 297** (Sheet rows 507–510). Lease 297 ends
2026-10-10, not 2026-09-30. Lease 297 also reads a zero current rent in RentVine against a non-zero
Sheet figure — that is a real finding to record, not a bug to fix first. Leases 279 and 280 share one
street address, so every record keys on lease id. Rents and addresses stay out of git; they live in
the gitignored resolution file and are regenerable read-only.

---

## 5. How to run one slice

1. Read the spec. Note its acceptance-criteria ids — you will cite them.
2. Build the app-plane, then the provider seam, then the gate-flip machinery, stopping only at the
   suite's one named owner dependency.
3. Add tests with every behavior change. Follow the repository's `*-boundary.test.ts` /
   `*-sentinel.test.*` naming for architectural invariants; there is no `architecture.test` file.
4. **Falsify.** Deliberately break the invariant your sentinel guards, observe it fail, restore it,
   observe it pass. A sentinel never proven to fail is not evidence.
5. Run the gate, scaled to what you changed:
   - docs-only: `format:check`, `git diff --check`, `verify:router-boundary`,
     `verify:falsification`, `verify:context-freshness`, `verify:spec-traceability`
   - code: add `lint`, `typecheck`, `npm test`
   - persistence: add `test:firestore`
   - routes/auth/rendering: add `npm run test:e2e:core`
   - anything under `app/`: add `npm run build`
   - end of cycle: `bash scripts/verify.sh`
6. Commit and push with the AC ids in the message.
7. Update `docs/facts.md` with an `F-` row citing the AC ids satisfied, update `docs/loop-state.md`,
   and append to `docs/status.md`. Update `docs/plan.md` if a phase status moved.

If you author a new spec: line 1 must be `<!-- spec-shape: overhaul-v1 -->`, the heading must be
`# S{n} — {Title}`, all eight bold section headings must appear verbatim, acceptance ids must be bold
`**AC-S{n}-{k}**` matching the heading number, and the file must be listed in
`docs/feature-suites/README.md` by its literal path.

---

## 6. Values you must NOT invent

The owner deliberately left these open. Applying a documented safe default and continuing is correct;
inventing a number and presenting it as decided is not. Each has a `Q-` row in `docs/facts.md`.

- `Q-TESTSET-TOLERANCE` — the rent-comparison tolerance. **No default.** S63 criterion 3 evaluates as
  `not_evaluated` until answered. A missing input must never read as a pass.
- `Q-TESTSET-NEGOTIATED` — which two leases are already negotiated, and their agreed rents.
- `Q-TESTSET-DAILY-OWNER` — who checks the test each day.
- `Q-OWNER-TIE-BEHAVIOR` — equal-ownership tie. Default: keep the current refuse-and-flag.
- `Q-CHANNEL-SEPARATION-ASSERTION` — default: build it and refuse on violation.
- `Q-COMP-TREND-PRESENTATION` — and note no trend data is retrieved this cycle at all.
- `Q-UNDER-MARKET-THRESHOLD` — provisional 10 percent; the test is parameterised, not pinned.
- `Q-LEASE-DATA-MAX-AGE` — provisional 15 minutes; it refuses operator work when exceeded.
- `Q-MKD-PORTFOLIO-ID` — client-owned. S62 cannot create a real rule without it.
- `Q-RENTCAST-PLAN-TERMS` — whether the plan permits caching and owner-facing display.
- `Q-TESTSET-OWNER-SEND` — whether "email the MKD owners" means a real human send during the window.

---

## 7. Safety invariants

- No autonomous, scheduled, bulk, or model-triggered client-facing send. Ever.
- Renewal and maintenance notice initiation stays draft-only under D33. The app composes; a person
  opens Gmail and sends.
- Nothing in this program sends to an owner or a resident on its own.
- **The 2026-08-05 premise that MKD owners need no outreach is WITHDRAWN.** MKD owners are emailed
  through the normal reviewed process and are in the test set. Build no outreach-skip path, no
  auto-recorded owner decision, no skipped-outreach evidence field.
- No address, rent, endpoint, record URL, or identity is ever invented. Absent data produces a visible
  refusal, never a plausible guess.
- No secret, token, PII, Gmail body, customer content, or photo in git or in evidence.
- The RentCast key lives in Secret Manager only.
- Every live effect stays one-attempt, idempotent, receipted, monitored, and reversible.

---

## 8. Stop conditions

Stop and report when any of these fires, naming which one:

- the slice reached its single named owner dependency and no independent work remains;
- a protected-path change is prepared and parked with nothing else to build;
- the same root problem survived two repair cycles;
- uncertainty is high enough that continuing would guess at a client-affecting behavior;
- the program is complete through S63.

Stale authentication is **not** a stop condition. It parks live reads and cloud mutations while
independent local and app-plane work continues.

---

## 9. Reporting

At every slice boundary, record: what shipped, the AC ids satisfied, the exact gate output, the
falsification you performed, the commit, and the next slice. Keep `docs/loop-state.md` under 140 lines
and its `Last updated` date at or after the newest date in `docs/status.md`.

Distinguish **built** (verified locally), **pushed** (on `main`), **deployed** (an exact serving
revision with smoke and rollback evidence), and **active** (its gate, config, and traffic read back).
Never promote one to another in a fact row without the evidence.

---

## 10. State as of 2026-08-06

- Specs S57–S65 are committed at `daaf3cc` and CI is green. No code has been written yet.
- The client correction note was **sent**. Do not re-send it. The client knows the four test leases
  are not visible until S57 lands.
- The RentCast key placement is **in flight** with the owner; `docs/rentcast-setup-runbook.md` has the
  procedure. S57 and S58 do not wait on it.
- The hard refresh is done: field map re-derived live with zero drift, Sheet read green, golden
  capture written. **Re-run the golden capture after S57** — it captured the 25-row default page.
- Every prior live-read coverage figure in this repository was measured on leases 1–25 and is
  unrepresentative rather than wrong.
