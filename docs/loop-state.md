# Loop state

Last updated: 2026-09-02. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Execute the single canonical S96-through-S87 queue, including exact source-of-truth writeback and
the temporary Space pilot, without treating specified behavior as deployed truth or widening any
effect beyond the owner-authorized keys and suite contracts.

## Current checkpoint

- Production serves `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` / commit
  `d243911cb20ffb01773072c0e27c723648eeea34` at 100% traffic (smoke, normalized config parity with
  exactly the one reviewed delta `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=true`, exact promote, and
  stable repeated readback). Immediate rollback is `pmi-kc-app-rmtkgn08q-db89a37c43dc`.
- S96, S85, S86, S83, S84, S82, and S97 are COMPLETE and deployed per their recorded receipts.
- S98 is COMPLETE: both exact operating-Sheet keys passed their bounded live proofs on the
  owner-designated lease 115/property 84 (sealed proof-mode append at row 526 with receipt
  `s98-row:op-768722e3...`; blank-to-source `current_rent` compare-and-set reconciled to receipt
  `s98-cell:current_rent` after the committed currency-format tolerance; a receipted forward
  correction restoring the prior blank; the receipt-bound delete with absence readback) and are
  durably ACTIVATED (`5394b93`) with the runtime write switch on in the served revision.
- S99 is COMPLETE: the three exact work-order keys passed their bounded live proofs on property 84
  (one complete filtered read with the full catalog and the unique system Cancelled status 3; one
  Admin-approved TEST create — provider work order 1731 — reconciled from honest ambiguity to a
  durable receipt and succeeded ticket link; the cancel to the exact final Cancelled state) and
  are durably ACTIVATED (`beef732`). Proofs fixed real live gaps: wrapped string-id trade rows,
  `unit:<id>` roster ids, provider-derived `isVacant`, detail-shaped update envelope, primary
  group 5.
- S100 chat sync is proven and ACTIVATED (`f73d93e`): one exactly confirmed consequential page
  read of TEST work order 1731 with the disclosed manager read-marker, honest ambiguity on the
  undocumented live pagination shape, then a fresh deliberate attempt succeeding with exact zero
  counts and durable receipt `chat:1731:page:1`. Fixes: empty-thread pagination shape, next-page
  "0", and attempt-suffix recovery for consumed failed/ambiguous attempts (runner and route).
- S100's `gmail.maintenance_resident_reply.draft_create` stays closed: its live proof is BLOCKED
  until a mapped resident with a verified email exists on a synchronized thread. The closed
  implementation, governed draft path, and panel are complete and deployed.
- The committed Registry holds 48 entries with 16 durably executable keys; the Firestore Admin
  mirror was reseeded and read back at 48/16 after each activation. The mirror grants nothing.
- All ADC/gcloud credentials are fresh (owner reauth 2026-09-02); releases use the established
  non-persistent `CLOUDSDK_AUTH_ACCESS_TOKEN` bridge without printing or writing a token.
- The remaining S36 and S87-S95 suites are specified desired-state contracts, not implementation.
  Their sole queue and completion gates are in `docs/feature-suites/README.md`.
- Every S98-S100 proof window was opened and closed by paired reviewed commits with the pins
  derived from `OWNER_PROOF_WINDOW_OPEN_KEYS`; the list is empty and every closed pin is restored.
- The definition-seed guard now sanctions only allow-listed executable references; a surprise
  executable reference still refuses the seed.
- `.claude/settings.local.json` and `output/` are user-owned untracked files; exclude them from
  every commit and Cloud Build upload.

## Next exact action

Begin S36 (temporary Space pilot and restoration gate) per its suite contract: closed-safe
deterministic implementation first, deriving the saved request and copied source packet from
current approved state, with the eleven-store/flag baseline restored at its end. The one open
S100 runtime input is a mapped resident with a verified email on a synchronized thread; when one
exists, run the resident-draft proof window (`scripts/prove-s100-chat-sync.ts draft-preview` /
`draft-confirm`) under its own paired open/close commits and then its separate protected
activation. Exclude user-owned `.claude/settings.local.json` and `output/` plus ignored `temp/`
artifacts from every commit and Cloud Build upload.

## Canonical queue

1. S96 — COMPLETE
2. S85 — COMPLETE
3. S86 — COMPLETE
4. S83 — COMPLETE
5. S84 — COMPLETE
6. S82 — COMPLETE
7. S97 — COMPLETE
8. S98 — COMPLETE
9. S99 — COMPLETE
10. S100 — COMPLETE (chat sync proven+activated; resident-draft proof BLOCKED on its runtime input)
11. S36 temporary pilot and restoration gate — ACTIVE
12. S88
13. S89
14. S90
15. S91
16. S92
17. S94
18. S93
19. S93/S94 integration verification gate
20. S95
21. S87 and final end-to-end verification

Advance only after the preceding suite's complete delivery gate. Default to serial execution; use
only the manifest's explicitly safe isolated-worktree S90/S91 parallelism.

## Runtime inputs, not product questions

- The S97-S100 proofs consumed the owner-designated lease 115/property 84 targets (2026-09-02)
  and are complete; the TEST work order 1731 rests in its final Cancelled state and the proof
  Sheet row was deleted with absence readback.
- The one outstanding S100 input is a real mapped resident with a verified email on a
  synchronized thread; it gates only the resident-draft proof window, never the shipped
  fail-closed code. S36 deterministically derives its saved request and copied source packet from
  current approved state.
- Missing credentials, actor sessions, identifiers, catalogs, or fresh values block only the exact
  release or live effect after every independent closed-state deliverable is green. They are never
  guessed. Interactive authentication is always performed by a person, never automated.

## Safety invariants

No direct client send, self-granted access, generic/bulk provider call, fake/sample identity or
customer value, guessed endpoint/mapping/recipient, personal runtime identity, secret/client evidence
in Git, cost-control change, or effect outside an exact listed key. Every authorized live write is
human-initiated, exact-previewed, exact-confirmed, at-most-once where provider idempotency is absent,
receipted, read back, and separately reversible/correctable. S100's disclosed manager-read marker is
the sole non-reversible stateful-read exception; no unread restoration is claimed. The resident-draft
key keeps owner authority for one bounded proof window once its runtime input exists, mandatory
close/readback, and final activation only after its passed proof.
