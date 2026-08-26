# Engineering checklist

## Before editing

- [ ] Read `AGENTS.md`, `docs/facts.md`, and `docs/loop-state.md`.
- [ ] Confirm the claim against code or live readback.
- [ ] Identify D12 paths, action keys, customer data, sends, and system writes.
- [ ] Preserve unrelated and user-owned changes.

## During implementation

- [ ] Add refusal-path and falsification tests.
- [ ] Keep secrets/customer values out of code, fixtures, logs, screenshots, and docs.
- [ ] Bind effects to exact actor, target, payload, source version, and expiry.
- [ ] Add receipt/readback/rollback for every live write.
- [ ] Keep local Live-read-only mutations refused.

## Before commit

- [ ] Focused tests pass.
- [ ] `bash scripts/verify.sh` passes for a ship candidate.
- [ ] `npm run test:e2e:core` terminates green or reports a specific deterministic defect.
- [ ] Diff and staged files contain no unrelated/user-owned material.
- [ ] Gate changes are exact and authorized.
- [ ] Current docs contain no superseded status.
- [ ] `npm run verify:active-doc-paths` finds no removed or missing context target.

## Before deployment

- [ ] Managed identity and budget controls are read back.
- [ ] Production config drift is reviewed.
- [ ] Prior serving revision is captured.
- [ ] Candidate is zero traffic.
- [ ] Candidate exact commit/revision smoke passes.
- [ ] Exact candidate is promoted and read back.
- [ ] Rollback command is captured.

## Handoff

- [ ] State what changed and what remains.
- [ ] Name exact tests and deployment revision.
- [ ] Name any external dependency without broadening it.
- [ ] State whether any client record, Sheet cell, or message changed.
