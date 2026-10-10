import { describeSequenceState } from "@/lib/gmail-hub/communication-state";
import { workflowCommunicationHref } from "@/lib/gmail-hub/workflow-context";
import { describe, expect, it } from "vitest";
describe("S193 canonical communication projections", () => {
  it("never calls a scheduled or admitted message sent", () => {
    expect(
      describeSequenceState({
        state: "active",
        scheduled: true,
        confirmedCount: 0,
        unresolvedOccurrenceId: null,
      }),
    ).toEqual({
      label: "Scheduled",
      confirmed: "0 confirmed messages",
      needsVerification: false,
    });
    expect(
      describeSequenceState({
        state: "needs_reconciliation",
        scheduled: true,
        confirmedCount: 1,
        unresolvedOccurrenceId: "owned",
      }),
    ).toEqual({
      label: "Needs verification",
      confirmed: "1 confirmed message",
      needsVerification: true,
    });
    expect(
      describeSequenceState({
        state: "draft",
        scheduled: false,
        confirmedCount: 0,
        unresolvedOccurrenceId: null,
      }).label,
    ).toBe("Draft in app");
    expect(
      describeSequenceState({
        state: "cancelled",
        scheduled: true,
        confirmedCount: 0,
        unresolvedOccurrenceId: "owned",
      }).label,
    ).toBe("Needs verification");
  });
  it("routes sequence notifications to the same selected communication and legacy links to their authorized context", () => {
    const link = {
      entity_type: "maintenance_ticket" as const,
      entity_id: "ticket-42",
      purpose: "maintenance_owner" as const,
    };
    expect(
      workflowCommunicationHref({
        ...link,
        sequence_id: "cc3e6d25-f9a0-40e7-8bb0-e29521be90b1",
      }),
    ).toBe("/gmail-hub?communication=cc3e6d25-f9a0-40e7-8bb0-e29521be90b1");
    expect(workflowCommunicationHref(link)).toBe(
      "/gmail-hub?workflow=maintenance_ticket&record=ticket-42&purpose=maintenance_owner",
    );
  });
});
