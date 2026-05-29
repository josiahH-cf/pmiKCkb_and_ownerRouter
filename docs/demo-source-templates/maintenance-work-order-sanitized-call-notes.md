# Maintenance Work Order Sanitized Call Notes

Source status: Transcript-derived
Space: Maintenance Work Order Intake
Sensitivity: Low

This sanitized summary is based on local PMI KC workflow call notes. It contains no
owner names, tenant names, addresses, phone numbers, vendor private contact details,
ledger data, or account information. Treat it as review-required until Bailey or Dan
approves it as final SOP language.

## Source Context

- Call or source date: May 7 workflow discovery calls; local transcript analysis dated
  2026-05-27.
- Participants by role only: operations lead, company owner, consulting team.
- Original source location: local untracked raw call notes; do not upload raw notes.
- Sanitized by: implementation reviewer.
- Reviewed by: pending Bailey/Dan approval.

## Why This Matters For The Demo

- Maintenance shows PMI KC's day-to-day handoff problem clearly: a tenant issue enters
  Rentvine, the offshore team triages it, the team uses Google Chat to keep it visible,
  and Dan still has to choose the vendor.
- The process has repeated missing-information friction because tenants often submit
  requests without photos.
- Vendor communication is scattered across more than one channel, which creates risk
  that context can be missed.
- This is a strong KB demo candidate because the app can answer intake and escalation
  questions while refusing to choose vendors or approve maintenance decisions.

## Workflow Facts

- Tenant maintenance requests are expected to come through Rentvine.
- Estelle is the primary day-to-day handler for work orders and tenant communication.
- Work orders often arrive without photos, so the team may need to ask the tenant for
  pictures before dispatch.
- Work order details are posted into a maintenance Google Chat so the issue is visible
  and not lost in individual inboxes.
- Dan decides which vendor should be assigned to each work order.
- After Dan chooses the vendor, the team assigns the vendor in Rentvine and emails the
  work order from Rentvine.
- Vendor communication is not fully standardized; most vendors communicate by email,
  while some communication may occur through Rentvine or personal channels.

## First-Pass Handoff Flow

1. Confirm the maintenance request is in Rentvine.
2. Review whether the tenant included enough detail and any needed photos.
3. If information is missing, message the tenant through the approved tenant
   communication channel before dispatch when possible.
4. Post or confirm the work order details in the maintenance Google Chat so Dan and the
   team can see the issue.
5. Wait for Dan's vendor assignment decision when the source does not already document a
   safe routing rule.
6. Assign the chosen vendor in Rentvine.
7. Email the work order from Rentvine to the assigned vendor.
8. Keep follow-up context in the documented channel whenever possible so the next
   teammate can see what happened.

## Decision Points

- Is the request complete enough to dispatch, or does the tenant need to provide photos
  or more detail?
- Is this a routine maintenance item or an escalation involving Dan, the city, owner
  approval, or a trusted vendor?
- Which vendor should be assigned?
- Which communication channel should be used for follow-up?

## What The KB Can Safely Answer From This Source

- That maintenance requests should be handled from Rentvine.
- That missing photos/details are a common intake problem.
- That Estelle handles much of the day-to-day work order communication.
- That work order visibility currently relies on a maintenance Google Chat.
- That Dan is the vendor-assignment decision point when no approved routing rule exists.

## What The KB Must Not Do From This Source

- Select a vendor.
- Approve owner-sensitive maintenance, repair scopes, city-involved issues, or spending.
- Provide private vendor contact details.
- Send tenant, vendor, Gmail, Rentvine, or Google Chat messages.
- Update Rentvine, Google Chat, vendor records, or any system of record.
- Invent emergency procedures or photo requirements not approved by Bailey/Dan.

## Escalation Rules

- Escalate vendor assignment to Dan.
- Escalate unusual, city-involved, owner-sensitive, or unclear maintenance issues to
  Bailey/Dan.
- Escalate missing-photo or incomplete-request patterns for SOP review if Rentvine
  settings or tenant intake wording need to change.

## Review Questions For Bailey/Dan

- Which maintenance categories can be routed without Dan, if any?
- What is the approved wording for asking tenants for photos?
- Which emergencies bypass normal intake, and who is contacted first?
- What owner approval thresholds apply before dispatch or repair approval?
- Which vendor communication channels are acceptable for auditability?

## Placeholder Triggers

Create a placeholder instead of a confident answer when:

- the question asks which vendor to choose;
- emergency handling is unclear;
- photo requirements or Rentvine settings are not confirmed;
- owner approval is needed but the approval threshold is not documented;
- the answer would require a private vendor contact method.

## Demo Ask Questions Supported By This Source

- What should the team check when a maintenance request comes in?
- Who decides which vendor gets a work order?
- Why should the KB not assign a vendor by itself?
- What should happen if a tenant does not attach a photo?
- What maintenance questions should be escalated to Dan?
- Why is Google Chat used in the current maintenance handoff?
