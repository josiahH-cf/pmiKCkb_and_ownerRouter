---
spec_id: PMI-10
sequence: 10
title: Dashboard Assistant V1
depends_on:
  - 01-renewal-data-contract.md
  - 02-lease-term-and-renewal-eligibility.md
  - 03-renewal-desk-and-workspace.md
  - 08-maintenance-sync-blockers-and-approval-routing.md
---

# Dashboard Assistant V1

## End state

A signed-in user can ask three plain-language operational questions on the Dashboard and receive concise answers from the same application data used by the owning screens.

## Supported questions

1. What work is assigned to me today?
2. What renewal blockers do I currently have?
3. What renewals are coming up next month, or in another clearly requested near-term period supported by the current renewal query?

Natural phrasing variations of these questions are supported. Other intents remain outside V1.

## Required behavior

1. Keep the existing Dashboard input and result experience or adapt it using current project UI patterns.
2. Map each supported question to a bounded application query rather than asking the model to invent records or query arbitrary data.
3. Use the signed-in user’s existing assignment scope for `assigned to me`.
4. Use the same renewal data, blocker logic, rent correction, lease-term behavior, and date rules as the renewal table and workspace.
5. Return concise results with the record identity, the most useful status or date, and a link into the owning application view.
6. When the question is ambiguous within the supported intents, ask one focused clarification. When it is outside V1, say that the request is not supported and identify the three available question types.
7. When a source query fails or is incomplete, state that limitation instead of returning an empty factual answer.
8. Keep V1 read-only. The assistant may navigate to an existing action surface but does not perform writes from natural language.

## Project integration

- Use existing My Work, renewal, blocker, and Dashboard query services.
- Follow the project’s current AI gateway and response formatting.
- Do not create a general data agent or arbitrary query language.

## Model-run acceptance evidence

- **AIV1-01:** `What work is assigned to me today?` returns the same current records as the owning My Work view for the signed-in test user.
- **AIV1-02:** `What renewal blockers do I currently have?` returns the same blocked renewals and blocker reasons as the renewal desk.
- **AIV1-03:** `What renewals are coming up next month?` uses the same fixed-term and month-to-month eligibility behavior as the renewal workflow.
- **AIV1-04:** Natural-language variations map to the intended bounded query without changing the result set.
- **AIV1-05:** An unsupported request receives a bounded response and does not trigger an arbitrary query or write.
- **AIV1-06:** A source failure is disclosed and is not represented as `no work`, `no blockers`, or `no renewals`.
- **AIV1-07:** Model-run tests prove that the assistant path invokes no write operation.

Prove the query and read-only behavior through project-native automated checks and model-operated UI coverage.

## Outside scope

- Maintenance, communications, connections, administration, or broad analytics questions beyond the three V1 intents.
- Natural-language writes or workflow actions.
- A replacement for the owning application screens.
