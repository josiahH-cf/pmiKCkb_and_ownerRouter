---
spec_id: PMI-06
sequence: 6
title: Dotloop Renewal Packet Lifecycle
depends_on:
  - 04-end-to-end-renewal-workflow.md
  - 05-dotloop-connection-and-capability-discovery.md
---

# Dotloop Renewal Packet Lifecycle

## End state

An approved renewal creates or reuses one correctly linked Dotloop renewal packet. The application can open that packet, show its current state, refresh it from Dotloop, and hand the operator to Dotloop for any signature work the API cannot perform.

## Source-grounded requirements

- Dotloop was selected as the next integration so an approved renewal can build out its document work instead of requiring a separate manual setup.
- The packet must use the verified lease, tenant, owner, property, and approved renewal terms already present in the renewal workflow.
- The connection, operational profile, and renewal template must be known before packet creation begins.

## Required behavior

1. Create the packet only from an approved current renewal proposal and a ready Dotloop connection from specification 05.
2. Use the selected Dotloop profile and renewal template, or the project-approved template-free mode when current provider capability requires it.
3. Populate the supported property information, participants, renewal terms, folders, and documents from the owning renewal data. Use current provider field names and template behavior rather than inventing mappings.
4. Store the Dotloop loop identifier and provider URL on the owning renewal record using the project’s existing external-reference pattern.
5. Repeating packet creation for the same current renewal must reuse or reconcile the existing loop rather than create another one.
6. When the approved renewal changes materially, follow the repository’s established versioning behavior and make the relationship between the new proposal and the existing or replacement packet explicit.
7. Read the loop back after creation or update and show its latest supported status and a link in the renewal workspace.
8. Use webhooks only when the connected account and current project support them; otherwise refresh through scheduled or on-demand API reads.
9. When the API cannot initiate or fully observe signature activity, show a clear action that opens the correct Dotloop loop and describe what the operator must complete there. Do not claim the unsupported step happened automatically.
10. Keep provider errors, missing participant data, missing template data, and stale proposal data visible as packet blockers with a retryable next action.

## Project integration

- Use the existing renewal proposal identity and external-reference conventions.
- Reuse the project’s job, retry, connection, and provider-error patterns.
- Do not build a general-purpose Dotloop document-management product.

## Model-run acceptance evidence

- **DLPKT-01:** One approved renewal creates one loop with the selected profile/template and expected supported data.
- **DLPKT-02:** Repeating the same request produces no second loop or duplicate participant/document set.
- **DLPKT-03:** The renewal workspace stores and opens the correct Dotloop URL and refreshes the current loop state from the provider response.
- **DLPKT-04:** Missing template, participant, property, or connection data blocks packet creation with an exact next action.
- **DLPKT-05:** A materially changed renewal cannot silently reuse stale packet data.
- **DLPKT-06:** With signature API capability absent, the application presents an exact Dotloop handoff and never marks signature work complete from assumption.
- **DLPKT-07:** Webhook-enabled and polling-only modes converge to the same observable packet state using the project’s available provider harness.

Produce authentication, packet, refresh, and lifecycle evidence through project-native checks or a model-operated provider environment.

## Outside scope

- Writing or approving legal renewal language.
- Broad Dotloop administration.
- Requiring webhooks for the integration to work.
- Inventing a signature-send or signature-status API.
