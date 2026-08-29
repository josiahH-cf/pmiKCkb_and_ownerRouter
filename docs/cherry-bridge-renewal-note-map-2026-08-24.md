# Cherry Bridge renewal notes: current disposition

Reconciled: 2026-08-29.

This table preserves the eleven client note identities without retaining the superseded build plan.
Completed behavior points to current code; unfinished behavior points to an active suite or client
input. No row authorizes a send, provider write, or invented client value.

| Note | Subject                             | Status                         | Present disposition                                                                                                                  | Evidence                                                           |
| ---- | ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| N1   | Inactive-property handling          | Complete                       | Operators can remove wrongly listed work from the renewal queue; automatic provider-status inference is not guessed.                 | `lib/lease-renewal/live-desk.ts`                                   |
| N2   | Chronological renewal dates         | Complete                       | The attention list and renewal desk use the same chronological lease-end ordering.                                                   | `lib/lease-renewal/live-desk.ts`                                   |
| N3   | Complete property addresses         | Complete                       | Address composition uses the complete provider address shape and stable lease identity.                                              | `lib/integrations/rentvine/address.ts`                             |
| N4   | MKD pricing and outreach            | Current ruling                 | Pricing stays Admin-reviewed; MKD receives normal reviewed outreach. No skip-outreach path is allowed.                               | `AGENTS.md`                                                        |
| N5   | Reusable information-form link      | Active                         | S72 now has the approved six-step/substep contract; the exact reusable-link default/override remains an implementation/input detail. | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md` |
| N6   | Current-rent confidence             | Complete                       | A conflicted, missing, stale, or ambiguous value is Needs Verification and cannot carry a false verified badge.                      | `docs/facts.md`                                                    |
| N7   | Comparables before owner decision   | Active                         | S72 step 2 requires S59 reference evidence before the recorded owner decision under the two-mile/15-request policy.                  | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md` |
| N8   | Reported wrong resident             | Open verification              | The address/identity repair is deployed; the exact reported lease still needs a client retest.                                       | `docs/client-checklist.md`                                         |
| N9   | Tenant offer wording                | Active                         | Constrained AI scope is approved; exact owner/tenant copy and channel evidence still require approval.                               | `docs/feature-suites/tenant-offer-copy-and-channel-truth.md`       |
| N10  | Six renewal steps                   | Active                         | S72 freezes six ordered steps with detailed substeps, roles, evidence, branches, and reopening rules.                                | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md` |
| N11  | Waiting-on and last-follow-up state | Active with permanent boundary | S75 owns waiting/last-contact behavior. Direct or automatic client send remains forbidden under D33.                                 | `docs/feature-suites/renewal-follow-up-state.md`                   |

The original narrative is provenance-only at Git commit `1356918` and must not be used as current
authority.
