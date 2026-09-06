---
spec_id: PMI-09
sequence: 9
title: Lightweight Maintenance AI Intake and Troubleshooting
depends_on:
  - 08-maintenance-sync-blockers-and-approval-routing.md
---

# Lightweight Maintenance AI Intake and Troubleshooting

## End state

A resident maintenance conversation gathers the information and photos the team normally has to chase, distinguishes the small set of urgent situations the business identified, sets realistic expectations, and offers only vetted troubleshooting resources before handing the request into the normal maintenance workflow.

## Source-grounded requirements

- The requested first version is intentionally lightweight: a few focused questions, required pictures, basic urgency handling, and realistic follow-up language.
- Active flooding should reach the urgent path. A reported fire should tell the resident to call emergency services rather than treating the property team as emergency dispatch.
- Ordinary maintenance should receive calm, realistic expectations for normal follow-up.
- Common issues may be paired with reviewed instructional videos or links, such as breaker, garbage-disposal, drain, filter, or similar troubleshooting.
- The assistant should operate through the application’s existing resident-message or maintenance-ticket path rather than requiring residents to use an unrelated new application flow.

## Required behavior

1. Use the existing resident messaging and maintenance intake surface that the repository establishes as current.
2. Collect a concise structured summary: issue type, location, what is happening now, when it started, immediate damage or access concerns, attempted steps, and contact or entry details already supported by the workflow.
3. Require the configured photos or other evidence before normal processing when the issue type needs them, and explain exactly what is missing.
4. Use project-owned rules or configuration for urgent routing and required evidence. The language model may interpret the message, but it must not own the business rule by prompt text alone.
5. Route active uncontrolled water or flooding through the configured urgent path.
6. For a reported fire or immediate danger, tell the resident to contact emergency services and then record the request for the property workflow.
7. For non-urgent issues, acknowledge the request and provide project-approved, realistic timing language without promising a completion time.
8. Offer a troubleshooting link only from a maintained, reviewed catalog and only when it matches the issue and does not delay an urgent route.
9. Save the structured summary, resident responses, supplied photos, urgency result, and resource shown into the existing maintenance thread or ticket flow.
10. Hand the completed intake to specification 08 so the ticket, blocker, and next step are visible to staff.

## Project integration

- Use the project-selected model and current AI gateway; do not lock this feature to the model name discussed in the meeting.
- Keep deterministic intake, urgency, and resource-selection rules outside free-form model output.
- Reuse existing resident-message synchronization and maintenance creation paths.

## Model-run acceptance evidence

- **MAI-01:** A normal request missing required photos receives a focused photo request and is not treated as complete intake.
- **MAI-02:** An active flooding report follows the configured urgent route and preserves the collected evidence.
- **MAI-03:** A fire report tells the resident to call emergency services and does not imply that the application dispatched them.
- **MAI-04:** A non-urgent issue receives calm, realistic follow-up language and becomes a normal maintenance item.
- **MAI-05:** A supported common issue receives only the matching reviewed troubleshooting resource; an unknown issue receives none rather than a guessed link.
- **MAI-06:** The assistant does not diagnose the repair, approve spending, dispatch a vendor, invent provider status, or promise completion.
- **MAI-07:** The resulting structured intake and photos appear in the owning maintenance record and blocker workflow.

Run these as model-driven conversation fixtures plus integration and browser checks.

## Outside scope

- Autonomous repair diagnosis.
- Vendor dispatch or approval of paid work.
- A broad resident concierge assistant.
- Chatbot pricing analysis, QR-code rollout, or marketing content.
