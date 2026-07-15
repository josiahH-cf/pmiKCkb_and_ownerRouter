# V1 dependency disposition

Date: 2026-07-14. State: **remediated to three Moderate findings; final disposition remains open**.

## Current audit evidence

- A fresh `npm audit --json` after the non-force lockfile remediation reports **3 Moderate, 0 High,
  0 Critical, and 0 Low** findings. The command exits `1` because the Moderate findings remain.
- The prior High findings and the remaining Low/Moderate transitive findings were removed by patched
  dependency resolution, including the current Firebase CLI `15.23.0` tree.
- All three remaining report rows describe one development-tool chain:
  `firebase-tools` → `@google-cloud/pubsub` → `@opentelemetry/core@1.30.1`, affected by
  `GHSA-8988-4f7v-96qf` (unbounded W3C baggage allocation).
- `npm ls --omit=dev @opentelemetry/core @google-cloud/pubsub firebase-tools --depth=4` is empty.
  The residual packages are not in the production dependency tree or application runtime bundle.

## Disposition and recommendation

- **No High or Critical finding remains.** No dependency risk is silently accepted by this report.
- Keep the current non-force remediation. Do not take npm's suggested downgrade to
  `firebase-tools@14.23.0` merely to suppress the report; that crosses the current CLI line and needs
  its own compatibility verification.
- Track a current-line `firebase-tools` / `@google-cloud/pubsub` update that adopts
  `@opentelemetry/core>=2.8.0`, then rerun the audit and the emulator/deploy-tool tests.
- Immediately before Josiah's final technical acceptance, rerun `npm audit --json`. If the upstream
  chain still remains, record a time-bounded, named technical risk acceptance citing its dev-only
  reachability and an expiry/recheck date. Until either remediation or that explicit acceptance,
  AC-S27-8 remains open and this artifact grants no V1, deploy, or live-action authority.
