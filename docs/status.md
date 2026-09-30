# PMI KC current status

Last updated: 2026-09-30 (UTC).

## Serving release

Run `c639b736-43ad-4f5c-bac5-2aa6857e973a` deployed all thirteen features and the A01–A04 adversarial repairs at
`81c770fcb698b6650771f9a28c65c32a42060062` / `pmi-kc-app-rmunbakkw-d2963016189e` with 100% production traffic.
Exact CI 36645026905 and the full 7,461-unit / 234-backend gate passed (four existing skips).
Build `55684cf1-f71f-4629-a86a-d9219fbf724c` succeeded at 2026-09-29T23:52:14.751052Z.
Candidate receipt issued 2026-09-29T23:57:30.062Z; promotion verified 2026-09-29T23:57:49.623Z.
Observation passed two checkpoints in 392,418 ms; all 311 records matched with zero discrepancies,
candidate 5xx or unresolved live effects. Eleven independent readback sections matched.
Exact uploaded source matched all 2,175 Git blobs; all thirteen suites were included, with no
private/unexpected file, missing runtime source or .git pointer.
Production/Live, managed identity, eleven Spaces, Demo=false and Sheet=false are verified.
Tag `cand-rmunbakkw-d2963016189e`; fingerprint `sha256:b77d4e40303aeaa889cfcdc07fe34e410c043608bfcf20ecda39f0e3bd73f601`.
The separate product supplement passed five checks but failed return navigation on a canceled
non-prefetch RSC read. A06's document-GET repair is local; a fresh cumulative candidate is pending.
The completed run/consumed permit and all failed supplements remain preserved, never relabeled.
Editor browser coverage remains `not_run` under the approved Admin-only contract.

## Active corrective review

A01–A04 are repaired and deployed with full local/CI/release/source proof. The additional read-only product supplement repeatedly found a canceled page-data stream while returning to the correctly rendered, filtered renewal desk. A06 replaces only that return control with a native document GET, preserving the exact validated query. The new regression failed on serving code and passes locally; fresh full verification and cumulative deployment remain required. No request failure is ignored and no deadline or safety gate is lowered. See [the adversary review](evidence/adversary-review-2026-09-29.md).

## Delivered batch

- S128: Pause operating-Sheet writes while retaining reads and app-owned work.
- S123: Retain unfinished renewal cycles when source dates change.
- S124: Review move-out notices and prevent non-renewal outreach.
- S134: Show, sort and filter color-coded lifecycle status with text labels.
- S122: Expose all authorized leases and explicit worklist views.
- S125: Review notice timing using an explicitly approved date basis.
- S126: Present dates consistently as month/day/year.
- S127: Explain blockers and focus the next permitted action after a verified save.
- S131: Prepare conditional Rhino-policy support for approved material.
- S129: Prepare governed owner/tenant drafts for real-case review.
- S130: Prepare approved form bytes, comparison, download and exact-output approval.
- S132: Prepare walkthrough preflight, scripts and evidence recording.
- S133: Provide the bounded external maintenance-agent assessment and decision packet.

## Verification

The final application gate passed 7,461 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

## Remaining operational dependencies

B-DL1, B-DL2, B-DL3, B-S100, B-MNT1, B-MNT2 and B-AUTH2 remain open at their exact
external or human boundaries. Actual customer draft/form accuracy, approved notice-timing basis,
Rhino wording/applicability, selected real cases, observed walkthroughs, human screen-reader and
desktop full-page zoom verdicts remain unverified. Both Dotloop keys stay closed; signatures and
provider acceptance remain separate. S36 stays behind complete S100. S121 was excluded.
Historical K unit-store target/marker effects remain UNVERIFIED; absent Data Access logs do not
prove zero effects. No customer draft/send, paid comparison, provider-proof rerun or synthetic
production record was authorized for this release.

The original completion permit remains consumed. The Awaiting release queue now carries all thirteen suites for the newly authorized corrective candidate; no original receipt or build claim will be reused.
