# Engineering and security contract

Updated: 2026-10-20.

## Runtime

- Next.js App Router on Cloud Run.
- Firebase Authentication and Firestore.
- Managed `pmikcmetro.com` users and project service identities.
- Production descriptor is explicit Production + Live.
- Local rehearsal is Demo + Live-read-only and effect-refused.

## Security

- Authenticate and authorize on the server for every protected route/action.
- Treat missing, malformed, stale, wrong-domain, and Vendor-drift claims as denial.
- Never trust client-supplied role, scope, actor, target, or provider state.
- Renewal role, Renewals Space access, exact action state, runtime suspension, quota, confirmation,
  and effect type are independent terms. Every renewal page/API/control projects one declared matrix
  row; role alone never authorizes a provider effect.
- Secrets come from Secret Manager or ignored local env; no key files.
- Logs/evidence are bodyless and value-minimized.
- Client data, exports, messages, documents, and identifiers do not enter Git.

## External effects

- Registry key, runtime dependency, and actor authorization must all agree.
- Preview and confirmation bind the exact target, source version, payload, actor, and expiry.
- Use provider idempotency or a durable at-most-once claim, and durable receipts.
- Read back the provider result.
- Reconcile ambiguity before retry.
- Every write has a documented rollback/correction.
- The October 20 direction permits exact staff-confirmed renewal Send/Schedule/Resume and linked
  renewal replies. A new authorization version prevents historical schedules from becoming a
  dispatch backlog. Preserve previews, current source/target checks, claims, receipts/readback and
  original-attempt recovery; generic and maintenance sends remain unavailable.
- Ordinary authorized Save/Apply captures visible intent once; internal technical interlocks do not
  add another consent ceremony. Backend permissions and current target/conflict checks remain.

## Data truth

- Use stable provider ids, never address/name alone, for durable joins.
- Record provenance and read time.
- Stale, missing, conflicted, or ambiguous data is not Verified.
- A resolution applies only to the exact lease/row/source versions that produced it.
- Never silently fall back from Live to synthetic data.

## Testing

- Unit tests cover behavior and refusal paths.
- `npm test` runs the complete registered unit/eval inventory with per-file isolation.
- Vitest uses one thread worker per logical CPU but one, at most eight and bounded by memory (2 GB
  plus 0.5 GB per worker); a run reading straight from a WSL Windows mount keeps two. The Firestore
  lane leaves one more CPU to the emulator. An explicit `--maxWorkers` is passed through unchanged.
  Measured 2026-11-05 on the 1,096-file inventory: 554 s at two workers and 214 s at eight, with
  identical test identities and statuses; twelve was no faster and timed out four jsdom tests.
- On WSL Windows mounts, including Windows-created Claude and Codex worktrees, the unit runner and
  `scripts/run-native-check.mjs` use a disposable native Linux Git worktree, native temp files, and
  one lockfile/Node-ABI-keyed dependency cache shared by every checkout. Windows Git lists the
  uncommitted changes (it owns that index). Ignored env, client, scratch, secret, output, and
  runner-local files are never mirrored.
- CI runs every lane on all of the runner's CPUs, splits the unit inventory into two shards that
  together cover every file, restores the public npm download cache for the anonymous install, and
  cancels a pull request's superseded run. `scripts/verify.sh` runs the second-scale policy checks
  before format, lint, typecheck, the test lanes and the build.
- `format:check` keeps Prettier's content-hash cache under `node_modules`, so a repeat local check
  takes about 5 s instead of 37 s; CI and every fresh install start cold. Lint stays single-threaded:
  two ESLint threads measured 28–30 s against 39–41 s at twice the memory, with no CI gain, and
  automatic concurrency exhausted the WSL machine. ESLint's cache is not used because some rules
  read other files.
- Both gates run the complete served E2E inventory with the emulator (65 passed and 4 skipped:
  204 s locally and 176 s in CI on 2026-11-05). Locally this needs Java, the E2E emulator port 8090
  and the dev-server port 4310 free. The degraded-mode group (`npm run test:e2e:core`, the four
  tests that run only without the emulator) stays a separate step: it took 464 s in CI's isolation.
- Firestore Rules tests cover access boundaries.
- Architecture sentinels constrain imports, routes, secrets, gates, and provider construction.
- E2E is bounded and must terminate on setup failure.
- A release smoke must match the exact commit and revision.

Current deployed source/revision, gate results and consumed-run evidence live in `docs/facts.md`,
`docs/status.md` and `docs/evidence/application-delivery-2026-11-03.md`; do not use an older run as
an execution queue. The November 3 P1–P9 follow-up is explicitly launched and is being qualified.
The deployed contract already supports fresh exact staff-confirmed renewal Send, Schedule and
Resume through its current policy/claim/receipt/recovery gates. Old authorizations, generic/model
sends and every retired maintenance lane remain refused. Both Dotloop write keys remain closed;
standalone Vendoroo, supported renewal source updates and the actual external holds are preserved.
Human/physical-phone acceptance remains NOT RUN; Admin assurance does not establish Editor-browser
restrictions. Engineering fixtures, production observations and human/provider completion retain
their distinct evidence scopes. No customer effect is required as release proof.

`scripts/isolated-verify.py` is the Linux engineering entry point. It stages only public Git
objects and explicitly named source files into a fresh owned checkout with physical dependencies
and anonymous preparation. Every application command requires kernel mount/network/PID isolation,
an empty home, absent host/credential paths, positive isolated loopback and negative host,
external and metadata controls. A failed control never falls back to a host fixture run. CI's
ephemeral bootstrap drops host capabilities before application code; local mapped root remains
the approved unprivileged owner. Runtime configuration, identities and provider gates do not change.

The canonical lane executes the real `bash scripts/verify.sh` through its supported `NPM_CMD`
hook. Each original npm command runs; no cached result substitutes for a check. Typecheck and
build may explicitly use 3072 MiB heaps with their aggregate RSS guards, while other Node
commands retain 1536 MiB and Java retains 768 MiB. Defaults remain bounded. Owned-process monitoring
records numeric PID/start-time/namespace/RSS samples and simultaneous peak snapshots without
reading argv or environment. The current driver's actual negative cleanup proof passed.

Public Poppins preparation acquires original CSS and WOFF2 anonymously through exact HTTPS
destinations, bounded by 256 KiB per response, 32 files and 8 MiB total. The app receives only
those read-only digest-allowlisted bytes from a nonce-bound ephemeral loopback child in its own
namespace. All seventeen isolation controls, exact child/map/provenance identity, positive bytes
and negative HTTP cases must pass. Its normal exit, terminal receipt and closed port are required;
missing shutdown fails the phase. Actual default production build emission must match all twelve
original hashes. Browser qualification separately checks real response bytes and loaded Poppins
300/400/600/700 faces. Next development-toolbar font bytes are separately qualified against the
exact installed Next package. No fallback font, copied build or alternate bundler proves success.

The focused S238 browser journey uses `scripts/isolated-verify.py --task renewal-journey` and the
existing `smoke:renewal-novdec-journey` command. Inside the verified namespace it uses the staged
`/app` directly and writes only private `/evidence` output; it does not create a second worktree,
copy shared dependencies across the separate `/tmp` mount, or apply an original-tree overlay.
The exact seventeen controls and monitored namespace must pass before that branch starts. Public
Chromium is prepared anonymously by the staged lockfile-pinned Playwright package, recorded by
version/hash and mounted read-only as a binary distribution; no host browser profile/cache/home is
mounted. The Next child receives only the existing qualified font hook and synthetic fixture
configuration. Source SHA plus staged manifest, browser provenance, ordinary command exit and
owned-process/listener cleanup remain evidence gates. A transport fixture alone is not isolation.

Served E2E discovers every original test file, runs them serially under one original total
deadline and checks the complete JSON inventory and unchanged source hashes. All eleven original
warm-up routes run once; fresh per-file server lifetimes limit Turbopack retention. Graceful stop,
bounded hard kill and actual listener closure precede replacement. Four explicitly mutable
app-owned emulator files use Demo/demo only with both verified pmi-kc-kb-e2e project IDs and a
loopback Firestore host. Other files retain Live-read-only admission, including refusal cases.
The isolated dev configuration alone uses full Turbopack eviction; default production is unchanged.

Raw attempts, fixture outputs and detailed provenance stay outside Git. Synthetic packet bytes
are not legal forms, modeled outside work is not signing, and isolated date correction preserves
the original lease start date and recurring charges. Human acceptance remains NOT RUN.

## Synthetic map verification (S235 R-S235-7)

The Admin "verify filled values" checkpoint is satisfied only by a recorded review of a filled copy
for the exact original and map versions; until then it stays blocked. The procedure, once a client
original and its reviewed map exist (C01, C02, C07 to C10):

1. Engineering fills that exact original with the existing filler (`lib/firestore/lease-derived-artifacts.ts`
   path, or its tests' local harness) using synthetic values only, with every repeated slot used and
   one more party or animal than the map's places to confirm the places refusal.
2. Inspect every page, every repeated slot and every protected region (signature, initials, signing
   date); confirm a `replace` region clears only its mapped area, and run
   `node scripts/verify-filled-pdf.mjs --python <isolated Python with pypdf> --dir <private output>`.
3. Keep the filled copy and the inspection notes in private evidence storage, never in Git; record
   the reviewer, time, original publication hash and map hash beside the checkpoint.

No lease value is used, nothing is uploaded, and no field name, coordinate, signer capacity or legal
text is invented. Until a reviewed original and map exist this procedure is NOT RUN.

## Documentation

Current truth is a release requirement. Update or delete a document when its claim becomes false.
Git history is the archive.

## Runner continuity

One explicit owner instruction carries its named feature or batch through planning, implementation,
verification and authorized delivery. Changing phases does not require repeated consent. New scope,
provider effects and protected decisions still require their own authority. The release permit and
exact checkpoint are technical controls; a credential refresh cannot widen them. Resolve ordinary
technical choices from current evidence and retain one concise blocker for a genuinely missing
input.

Use the approved WSL CLI and ADC stores for local release work; the deployed Cloud Run service
uses its separate managed runtime identity. `auth:ensure` probes and renews ordinary access tokens
at run start and each release phase. A fixed enrollment age is not proof of expiry. A pre-dispatch
auth hold waits for a changed local enrollment, re-probes the exact identity and resumes the same
checkpoint if usable. A phase with a possible external effect retains its in-flight reconciliation
gate. Human reauthentication, permission denial and unknown provider errors stay distinct.
