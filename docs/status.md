# Current status

Updated: 2026-10-28 (UTC).

October 28: S232–S238 (November/December renewal readiness) were authored and the owner's
execution instruction started them. Merged to main at `bf0c03f9` (PR #158) and not served: the desk's
window and month context, an ended-without-outcome scope with a default-view count, a visible
reason on every row, fail-closed staff-record reads, retained skipped work, notice timing from the
recorded tenant-offer send and response, and Central policy dates (S232);
open-only worker paging, a Central schedule default that states the Nov 1, 2026 repeated hour,
zoned instants with past-due lag, a Resume timing statement, distinct pause causes and the
incoming-check age (S233); approval-bound terms on the packet handoff (S234); plain RentVine outcome
text and an accurate Sheet still-before result (S237). S235/S236 and the remaining requirements
are listed in each suite's status line. PR #159 fixed the two PR #158 review findings with
counterfactual tests: a pending tenant outcome is no longer a response, and RentVine refusals no
longer claim nothing was sent. PR #160 (merged at `be8c0bf4`) added the S237 Working-value
current-base binding, the locked ambiguous-state statement and one source-update scope statement,
the S233 incoming-message variants, S235's lease-wide duplicate-loop prevention and read-only
per-family readiness, and the S236 returned-state projection with its two review fixes (latest
observation per signer; version notes bound to the document kind). The branch
claude/renewal-novdec-rows-20261028 adds:

- S236: the persisted returned-document record, its route and the Returned documents and
  signatures screen, derived Required signatures complete and the Admin checkpoint from records;
- S235: the places refusal for parties and animals, the packet state from recorded events and the
  saved Dotloop selection with its last observation;
- S238: an isolated browser journey through the mounted pages, routes and emulator (14 of 14 steps
  on `a6f99b6e`, `docs/evidence/s238-isolated-journey-2026-10-28.md`).

Production still serves `6fbd6225` (S231); the staff walkthrough is NOT RUN.

October 27: Dotloop A1 is resolved. Dan had made integrations a company admin, not an office
agent, and the company was at Dotloop's eight-user limit. The owner swapped josiah@'s slot,
re-added integrations as an agent, and the bounded API read at 10:35:30Z listed LEASE RENEWAL on
the new integrations individual profile. The owner's Admin session saved the selection (Lease
Renewal, initial status Pre-offer), which reads back in the app and on the readiness page. Every
other seam, the read-only Admin canary and unattended authentication read back ready. The
unchanged production audit failed on new advisories; S231 (`63fe588d`) patched zod to 4.6.7,
body-parser to 1.20.9/2.4.0 and fast-uri to 3.1.9, and run `030761c0` released it. The remaining
client content holds are in `docs/open-blockers.md`.

S230 (`fc6868e9`) patches Next.js to 16.4.2 and ip-address to 10.7.4 after the unchanged
production audit failed on 2026-10-23. The full gate passed: 9,666 unit tests with four existing
configuration skips, all 465 backend tests, production build and zero production audit findings.
Run `eee80164` released it on 2026-10-23; production serves `79764b56` / `pmi-kc-app-rmvkpw2ey-bfdf11ed1ed3`.

Implementation `e5c1c9e6c0b769b815f42fc60dfba2a521e4dff3` passed the actual complete
`bash scripts/verify.sh`: 9,659 unit tests with four existing configuration skips, all 465 backend
tests with no skips, required checks, production build and zero production audit findings.
Served E2E passed 65 tests with four existing configuration skips across all fourteen files.
Exact-main CI `39464866553` passed all five jobs on `157b6992`, deployed October 20. Canonical v11 covers
all final code/tests; policy-build v3 and served E2E v2 cover identical runtime/package bytes,
with two later test-only assertion/synchronization changes covered by canonical v11.

## Current work — October 20 renewal run amendment

The owner amended S227–S229 on October 20: completely retire the maintenance component,
including history/reports and obsolete wiring; diagnose the existing Dotloop template through
`integrations@pmikcmetro.com`; map form sources to their existing processes; and finalize the
existing staff-confirmed renewal Send, Schedule and Resume journey for October 22.
Both Dotloop write keys remain closed. Signing is a human Dotloop handoff. No customer send,
draft, provider business write or production test record is verification proof.

New renewal authorizations bind current content, recipients, source values, sender and a new
delivery-policy version. The worker skips old authorizations and every retired maintenance lane
before actor/mailbox/source reads. Current role/Space, runtime suspension, exact-key, at-most-once
claim, receipt, readback and ambiguity recovery gates remain. Generic, bulk, model-triggered and
unapproved background sends remain unavailable. No protected activation metadata changes.

The bounded Dotloop read at 2026-10-22T12:58:20Z verified `integrations@pmikcmetro.com` with a
connected, unexpired credential. Its standalone INDIVIDUAL "Default Profile" lists zero templates;
its default COMPANY profile "PMI KC Metro" returns 403, which Dotloop's public API documents for
every non-INDIVIDUAL profile. An office template reaches only its office members' individual
profiles, and the integrations individual profile carries no office affiliation. A full Dotloop
admin must add the integrations login to the office that holds the template (A1). No supported
selection exists. Both Dotloop write keys remain closed; no template was recreated.

Eight browser-observed Drive PDF references are saved through the normal Admin API and individually
read back at resource version 8, all unverified. The deployed readiness page displays ten form
families across renewal extension, full lease and owner acknowledgment. Actual originals and
reviewed field/signer maps remain unapproved for all ten families. Source presence is not legal,
customer-link or signing approval. Source verification is a staff attestation in Admin; the
least-privilege `drive.file` 404 for a browser-visible file is expected and holds nothing.

Production serves `6fbd62250ccd9df1b9861a59b5de21c2143a68c0` /
`pmi-kc-app-rmvqk1okt-ecd4a985b1de` at 100% canonical traffic. Run
`030761c0-1e70-4cd2-95a6-77480107657d` delivered S231 (zod 4.6.7, body-parser 1.20.9/2.4.0 and
fast-uri 3.1.9) with candidate assurance, receipt-bound promotion, two observation checkpoints in
406,404 ms and all eleven independent readback sections. The one-item queue is delivered and empty;
its permit is consumed. S231 passed the complete gate, served E2E (65 passed, four existing skips,
fourteen files) and exact-main CI `40487479956` on `6fbd6225`. The October 20 S227–S229 delivery
evidence remains `docs/evidence/application-delivery-2026-10-20.md`.

Focused confirmation/worker/identity regressions, exact-main CI, guarded release, full observation
and independent readbacks passed. The owner-approved one-file Editor grant was applied with notification off and read back.
Production now delegates Sheet/Drive as `integrations@pmikcmetro.com`; the normal keyless Sheet
reader freshly verified all 29 tabs after promotion without reading/changing cell values.
On October 20 only APP_COMMIT_SHA and SHEETS_DWD_SUBJECT differed among the 54 environment
keys versus that run's captured predecessor. Runtime identity, eleven Space maps, five secret bindings, Production/Live,
Demo=false, Sheet=true, RentCast allowance 50 and other controls match. CLI/ADC and guarded
Admin assurance retain the separately approved `josiah@pmikcmetro.com` identity/store/profile.
Human acceptance, physical-phone acceptance and a real provider/signature journey are NOT RUN.
