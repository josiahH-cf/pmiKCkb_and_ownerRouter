---
spec_id: PMI-05
sequence: 5
title: Dotloop Connection and Readiness
depends_on: []
---

# Dotloop Connection and Readiness

## End state

The PMI application can connect to Dotloop through the provider-supported authentication flow, identify the account resources needed for renewals, survive token expiration, and recover from a lost or revoked connection. The implementation model proves the connection lifecycle without depending on human sign-off.

## Provider facts to confirm at implementation time

- Dotloop Public API v2 uses an OAuth 2 authorization-code flow with provider-issued client credentials and user consent. It is not a single static API-key integration.
- The API exposes profiles, loop templates, loops, participants, folders, documents, and provider links needed for packet work.
- Access tokens expire and must be refreshed.
- Webhook access is an optional provider capability and must not be required for basic packet creation.
- The public API documentation does not establish that every signature action can be initiated or observed through the API. Signature behavior must be capability-driven.

Revalidate these points against current official Dotloop documentation and the actual connected account before editing provider-specific code.

## Required behavior

1. Add Dotloop to the application’s existing connections/configuration area using the project’s current connection and credential mechanisms.
2. Implement the current provider authorization callback and connect it to the signed-in application flow already used for external services.
3. Show whether Dotloop is disconnected, connecting, connected, expired or refresh-needed, unavailable, or missing required renewal resources, using project-native states.
4. After connection, discover the available Dotloop profiles and renewal templates and let the application select the operational profile and template by stable provider identifier.
5. Verify that the selected account/profile/template can perform the loop, participant, folder, and document operations required by specification 06.
6. Refresh an expired access token through one existing project-owned integration path so background and interactive calls use the updated connection.
7. Support disconnect or loss of provider access and a clean reconnect without losing existing renewal-to-loop links.
8. Detect whether webhook and signature-related capabilities are available in the actual account. Use polling/readback and a Dotloop handoff when they are not.
9. Expose exact readiness blockers, such as missing client registration, callback configuration, account connection, compatible profile, or renewal template.

## Project integration

- Use the application’s existing signed-in connection, configuration, and credential handling.
- Reuse any existing provider-adapter, connection-status, callback, background-refresh, and admin-connection patterns.
- Do not create Dotloop renewal packets in this specification.

## Model-run acceptance evidence

- **DLCONN-01:** Provider contract tests cover authorization success, denial, callback error, expired token, refresh success, refresh failure, disconnect or revoked access, and reconnect.
- **DLCONN-02:** A connected account returns stable profile and template choices and retains the chosen identifiers across a display-name change.
- **DLCONN-03:** Packet readiness is false with an exact reason when the required profile, template, or operation is unavailable.
- **DLCONN-04:** Expired-token recovery succeeds for both an interactive request and a background packet request without requiring a person to repair state.
- **DLCONN-05:** Webhook or signature unavailability does not falsely mark the whole connection unusable when loop and document preparation still work.
- **DLCONN-06:** When a usable provider account or sandbox is available, the model runs a non-destructive connection/readiness check through the actual integration and records the observed result. When it is not available, the model proves the full lifecycle through the project’s provider fake or contract harness and reports the missing live environment plainly rather than assigning a human verification step.

## Outside scope

- Renewal loop or document creation.
- Assuming unsupported e-signature endpoints.
- LeadSimple or other provider integrations.
