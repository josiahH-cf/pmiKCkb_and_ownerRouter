---
package_id: pmi-feature-specifications
revision: 2
spec_count: 11
---

# PMI Feature Specification Package

## Purpose

This package defines the product outcomes to complete or correct in the PMI application. It is intentionally limited to work supported by the planning note, the application review, and the relevant current-state summary.

Use these documents as feature intent, then ground them in the actual repository before implementation. Current project instructions, established architecture, naming, tests, feature lifecycle, and execution loop determine the implementation shape. Reuse what already exists and change only what is missing, incorrect, or disconnected.

## Context rules for an outside model

Provide the active specification, this index when dependencies matter, and the directly relevant project files. Do not carry forward raw meeting conversation, scheduling details, implementation history, deployment state, past verification counts, release procedures, or unrelated roadmap material.

The specifications define product outcomes rather than a new governance or execution framework. Use the project’s existing equivalents. Authentication and lifecycle behavior that belongs to a feature must be implemented and proved by the model through project-native automated checks and any available model-operated integration environment.

When the repository already satisfies a requirement, verify that fact and leave the implementation alone. Do not build parallel resolvers, workflows, connection stores, job systems, or test harnesses merely to mirror wording in these documents.

## Package scope

| Sequence | File                                                   | End state                                                                                                                                 | Depends on             |
| -------: | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
|       01 | `01-renewal-data-contract.md`                          | Renewal data uses the tenant’s actual current rent rather than property market rent.                                                      | None                   |
|       02 | `02-lease-term-and-renewal-eligibility.md`             | Leases are visibly distinguished as fixed-term/yearly, month-to-month, or needing review, and enter the right renewal workload.           | `01`                   |
|       03 | `03-renewal-desk-and-workspace.md`                     | The renewal table and lease workspace show the same current facts and preserve the operator’s working context.                            | `01`, `02`             |
|       04 | `04-end-to-end-renewal-workflow.md`                    | The lease-renewal process works from verification through owner terms, packet preparation, source updates, communication, and completion. | `01`, `02`, `03`       |
|       05 | `05-dotloop-connection-and-capability-discovery.md`    | Dotloop can be connected, refreshed, diagnosed, and reconnected, with required account resources identified up front.                     | None                   |
|       06 | `06-dotloop-renewal-packet-lifecycle.md`               | An approved renewal creates or reuses one correctly linked Dotloop renewal packet and keeps its state visible.                            | `04`, `05`             |
|       07 | `07-unattended-renewal-orchestration.md`               | Renewal work continues reliably in the background and resumes safely after interruption.                                                  | `04`, `05`, `06`       |
|       08 | `08-maintenance-sync-blockers-and-approval-routing.md` | RentVine maintenance work and the PMI application stay aligned, with visible blockers and property-specific approval routing.             | None                   |
|       09 | `09-maintenance-ai-intake-and-troubleshooting.md`      | A lightweight maintenance assistant gathers useful evidence, routes urgency correctly, and offers vetted troubleshooting.                 | `08`                   |
|       10 | `10-dashboard-assistant-v1.md`                         | The Dashboard answers three bounded, read-only operational questions from application data.                                               | `01`, `02`, `03`, `08` |
|       11 | `11-integrated-readiness-and-operator-training.md`     | The model proves the integrated workflows and produces an operator training guide based on the working application.                       | `01` through `10`      |

## Accepted scope decisions

- “Rip line API” is treated as RentVine unless the repository or current provider documentation proves that a separate integration exists.
- Dotloop is the next integration. LeadSimple is outside this package.
- Dotloop connection uses the current provider-supported authentication flow rather than an invented API-key screen.
- Dotloop signature activity is automated only when current provider capability and the connected account prove it. Otherwise the application provides a precise handoff into Dotloop.
- Maintenance AI is lightweight intake and troubleshooting support. It does not diagnose repairs, approve spending, dispatch vendors, or promise completion.
- Dashboard assistant V1 supports only: assigned work today, current renewal blockers, and renewals coming up in a requested near-term period such as next month.
- Operator training is a deliverable and later usage activity, not a prerequisite for the model to prove authentication, lifecycle, or feature completion.

## Package-wide implementation expectations

- Follow project-native feature and loop behavior rather than copying process language from these documents.
- Use the application’s existing signed-in context, connection, data, messaging, and background-work mechanisms. Do not redefine them unless the feature cannot work without a targeted change.
- Keep feature state derived from the same owning application data used by the relevant screen or workflow.
- Make retries safe where an external integration or background job can be repeated.
- Make missing, conflicting, or unavailable source data visible instead of silently substituting a plausible value.
- Keep every acceptance result model-driven. Use the project’s existing automated checks, browser tools, provider fakes, sandbox accounts, or non-destructive live checks as available.
- Implementation completeness is established by model-run evidence. Operator training is a later usage activity, not an acceptance dependency.

## Package-level proof

The completed implementation should be demonstrable by a model-run suite or project-native equivalent that covers:

1. Correct rent and lease-term behavior in both renewal surfaces.
2. A complete fixed-term renewal from discovery to completion.
3. Dotloop connect, token refresh, disconnect or loss of access, reconnect, profile/template readiness, packet creation, repeat execution, and status refresh.
4. Background continuation after the initiating page closes, restart recovery, repeated delivery, and lease-level failure isolation.
5. Maintenance synchronization, blocker reporting, approval-threshold routing, photo intake, flooding and fire handling, normal follow-up, and vetted troubleshooting.
6. The three Dashboard assistant intents returning the same records as their owning application views.
7. A training guide that Bailey and Chasity can use to practice the working renewal process without developer-only steps.
