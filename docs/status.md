# Current status

Updated: 2026-10-16 (UTC).

S227-S229 are implemented from upstream 0b892865 in an isolated worktree. Source contains
maintenance/vendor HTTP retirement, authorized read-only history, shared production-effect refusals,
unsent-only sequence handling and bounded Dotloop company/office visibility diagnostics. Focused
deterministic checks cover the current owning boundaries. Implementation c99659d5 is on main and
passed full canonical verification: 9,585 unit tests (four existing skips), 455 backend tests, all
required checks and production build. Core served E2E passed 39 with 22 existing skips. Exact-main
CI passed all five jobs for c99659d5 in run 38891578460; a later mainline commit needs its own result.
No deployment delivery is claimed.

Production remains eb5d3599 / pmi-kc-app-rmv3yavsf-2cece39f7605 from October 11. Fresh managed service
readback confirms 100% traffic, the runtime service account and 54 environment keys; the public
bodyless version agrees. Its permit is consumed. Approved CLI/ADC refresh and GitHub access pass.
The existing Admin browser profile reaches Google's human password/challenge, holding guarded
assurance and release. Dotloop's cached company profile was never template-observed, its saved
selection is absent, and a current account GET returned 401 refresh_needed using the stored expired
access credential. All three exact records are unchanged; both Dotloop write keys read back closed.

Vendoroo stays standalone. No production record was deleted or mutated as proof; no customer draft
or send was created; no Dotloop key opened. Original checkouts and parallel projects are untouched.
Old maintenance/integration proposals cannot restart from READY. Human acceptance, physical-phone
and live provider root-cause verification remain NOT RUN. See docs/loop-state.md for continuation.
