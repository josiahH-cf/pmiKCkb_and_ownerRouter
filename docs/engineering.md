# Engineering and security contract

Updated: 2026-10-19.

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
- The October 16 contract refuses client Send, Schedule and Resume at operation admission; the
  communications worker does not dispatch. Older S183 activation receipts and Registry metadata
  retain historical meaning and cannot override those refusals. Permitted unsent drafting still
  requires exact preview/confirmation, one attempt, receipt/readback and original-attempt recovery.
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
- On WSL Windows mounts, the unit runner uses a disposable native Linux Git worktree, eight or fewer
  thread workers, native temp files, and a lockfile/Node-ABI-keyed dependency cache. Ignored env,
  client, scratch, secret, output, and runner-local files are never mirrored.
- The supported WSL full-unit lane has a ten-minute hard performance budget. The final S80 canonical
  run measured 58.40 seconds inside the runner for 528 passing files and one intentional file skip;
  clean repository installation is a separate gate.
- Firestore Rules tests cover access boundaries.
- Architecture sentinels constrain imports, routes, secrets, gates, and provider construction.
- E2E is bounded and must terminate on setup failure.
- A release smoke must match the exact commit and revision.

The October 19 bounded repair has matching focused proof: 131 unit tests and 40 backend tests passed
with no skips. Full canonical qualification, CI and served E2E for the repair remain pending; the
later auth/pre-claim and runner/CI preparation is not covered by that application-source manifest.
The v9 attempt on source manifest `2bb46d84` passed 9,633 units with four existing configuration
skips, all 464 backend tests without skips, clean installation, zero-finding production audit,
format/lint/typecheck and all eight policy/budget checks. Its actual default Next 16.3.8 Turbopack
build failed while fetching twelve Poppins local-file URLs. The whole gate remains failed; actual
CI, integration and browser qualification are pending. The S205 controlled-read/awaited-act fixture
passed all three cases both focused and in the full inventory, preserving strict refreshed version,
typed work, one read and a distinct operation identity without changing the retired product hook.
Earlier failed/interrupted source scopes remain immutable in private evidence. The generic
leader-first pidfd timeout proof passed; independent v9 overall closure found all 24 groups,
fifteen namespaces and fifteen control ports absent, with no global mounts, missing results or
source changes. The entire loan was returned within its original bound.

`scripts/isolated-verify.py` is the prepared Linux engineering entry point. It creates a new owned
source checkout from public Git objects plus explicitly named new source files, with a fresh
credential-free Git config and physical dependencies. Anonymous npm installation/audit and public
emulator acquisition happen separately from fixture execution. Before each actual application
command, kernel mount/network/PID isolation, an empty home, absent credential/host paths, positive
isolated loopback and negative host/external/metadata controls must pass. No failed isolation check
falls back to a host fixture run. CI's temporary sudo bootstrap drops host capabilities before
application code; it changes no host policy, IAM, identity, browser profile or provider activation.
This new entry point still requires actual runtime qualification before a green-mainline claim.
The explicit `--typecheck-heap-mib 3072` option changes only `npm run typecheck`. CI's quality lane
selects that heap and retains its 4096 MiB aggregate RSS bound. The prepared `--build-heap-mib 3072`
option changes only exact `npm run build` and its children; CI's policy-build lane selects it with
a 6144 MiB aggregate bound. Defaults remain 1536 MiB per Node process and 4096 MiB aggregate;
other Node commands retain 1536 MiB and Java retains 768 MiB. No build/typecheck/configuration
switch is changed. Every local run needs an actual matching resource handoff; these new build
bounds are prepared, not qualified or currently granted.

Anonymous public-font preparation reads the literal Poppins declaration as data and uses the
installed Next loader's URL and User-Agent. It acquires real public CSS/WOFF2 through exact HTTPS
destinations, with no credentials, proxy, cookies or redirects: CSS at most 256 KiB, each font at
most 256 KiB, at most 32 files and 8 MiB total. Provenance stays private. V9 acquired twelve files
totaling 211,272 bytes, but successful acquisition did not prove production-build font emission.

The exact [Next 16.3.8 Turbopack font implementation](https://github.com/vercel/next.js/blob/v16.3.8/crates/next-core/src/next_font/google/mod.rs)
replaces mocked CSS while still fetching the font URLs. The installed Node loader's local-file
shortcut therefore did not qualify the default bundler. The prepared repair uses a credential-free
font child inside each network/PID/chroot boundary. It binds only ephemeral IPv4 loopback, serves
only original digest-allowlisted bytes already in memory, limits requests to 256, and exposes no
directory, proxy, query, traversal or effect endpoint. A data-only map changes only the original
font URLs to that listener's nonce-bound digest URLs and is mounted read-only before controls or
application code. CI helpers use the same dropped UID/capabilities as the fixture; local root stays
mapped to the approved unprivileged host owner. No host path/profile or external route is added.

All seventeen controls remain mandatory. Prepared font checks additionally require exact child
PID/start time/UID/namespaces, map/provenance identity, real HTTP byte/hash response and rejected
unknown/traversal/query/POST/Host requests. The namespace init pins the direct child with a pidfd
before app code, then requires its normal exit and exact terminal receipt; a missing/failed shutdown
fails the phase. The unchanged outside supervisor still owns hard-timeout/descendant drain. This
transport passed all seventeen controls and all nine normal child closures in the actual v10
focused lane on manifest `d7a9ef0f`. Default Turbopack compiled in 33.6 seconds and emitted twelve
WOFF2 files matching the original public hashes, but its TypeScript child then exhausted the
1536 MiB heap. The build failed after 72.934 seconds, with sampled aggregate peak RSS
3,555,557,376 bytes and no aggregate/deadline termination. Canonical never started. Partial font
emission is not a completed build. All fifteen groups, nine namespaces and nine host-control ports
drained; the entire loan was returned and failed evidence preserved.

Installed Next 16.3.8 creates one TypeScript worker with `isolatedMemory: false`; its worker keeps
the parent build's Node heap option. The prepared build-only option addresses that actual fatal
heap failure without disabling checking. The monitor now prepares numeric PID/start-time/namespace
and per-process RSS peaks plus the simultaneous aggregate-peak snapshot, sampled only from owned
processes; no argv or environment is read. V10 retained only aggregate RSS, so individual peaks
cannot be reconstructed. Changing this driver invalidates the old full-driver cleanup-proof binding.
A newly pinned actual negative cleanup proof, focused default build/emitted-byte check and separate
clean canonical are required under fresh matching allocations. No remaining-time retry is allowed.

The actual default `npm run build` and strict emission readback must match every acquired font
hash. Browser qualification must separately prove the real WOFF2 responses and loaded Poppins
weights. No copied build, fake URL buffer, fallback-font claim, webpack switch, unbounded heap,
typecheck/build skip or source exclusion substitutes for those checks.

The canonical lane invokes the actual `bash scripts/verify.sh`, using its supported `NPM_CMD` hook
to run real install/audit phases in anonymous preparation and real checks/tests/build in isolation.
No cached success replaces a gate. Served E2E is a separate actual lane with the same boundary.
Raw attempt evidence and fixture outputs remain outside Git. Synthetic packet bytes are not legal
forms; modeled outside-human work is not verified signing, and the isolated correction covers the
supported lease end date, preserving the original lease start date and recurring charges.

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
