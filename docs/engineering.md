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

The scoped October 19 implementation `006798e4`, qualification follow-up `a9a63d7c`,
CI repairs `5015efc1`/`6beddcf9` and bounded diagnostic follow-up `b8829897` are published and
deployed. Run `91710ba5-db96-4982-8931-366661f3843c` serves `b8829897e407dafdad94da0fd560afbcc539e397` as
`pmi-kc-app-rmvgkpxub-17a20f3efe73` at 100% traffic. Full observation passed two checkpoints in
408,672 ms; all 371 records matched and eleven independent readback sections passed.
The two-item queue is delivered and empty; its exact permit is consumed.

Typed source holds, exact message save/preview/confirmation and own-attempt recovery, truthful
freshness and independent source reads, managed Gmail health, Dotloop access/selection refusals
and exact packet binding are deployed. Maintenance retirement, standalone Vendoroo, supported
renewal source updates, client-send/schedule/Resume refusals, the non-dispatching worker and both
closed Dotloop write keys remain. Original October 16 commits were already on main; no merge was
manufactured. See `docs/evidence/application-delivery-2026-10-20.md` for aggregate scope and exact evidence.

The actual `bash scripts/verify.sh` passed on `a9a63d7c` (manifest `a504f8e6`):
9,647 unit tests with four existing configuration skips, all 464 backend tests with no skips,
format/lint/typecheck, eight policy/budget checks, zero production audit findings and the default
Next 16.3.8 production build. All twelve original font hashes matched. Final exact-main CI
`39410047957` passed all five jobs at `b8829897`; its unit/backend counts match the canonical gate.
All 1,212 runtime files match the qualified canonical, HTTP and browser source snapshots byte-for-byte.
Later changes are confined to CI, documentation and bounded test diagnostics.

An initial assurance attempt paused with a preserved generic gate failure. Separate unchanged
read-only checks passed, then supported same-run resume passed the full gate without another build
or Scheduler invocation. The original cause remains unestablished; no failure was relabeled.
Human/physical-phone acceptance remains NOT RUN; Editor browser remains not_run under the approved
Admin-only policy. External resource-dependent outputs retain their actual input/activation holds.

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
