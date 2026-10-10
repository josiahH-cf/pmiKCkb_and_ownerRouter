# Engineering and security contract

Updated: 2026-10-10.

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
- S183 permits this named program's explicit human Send/Schedule after the scoped technical gates
  and reviewed exact activation. Bind the exact managed sender, targets, version, message/files and
  schedule; recheck current authorization before each bounded occurrence and pause on inbound reply.
- Both notice send keys remain closed pending those gates; generic send remains closed. Model
  output, old/migrated work and page load grant no effect authority. Recovery cannot blindly retry.
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
