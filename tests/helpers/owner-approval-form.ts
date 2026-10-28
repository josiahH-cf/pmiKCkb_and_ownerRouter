// S234 R-S234-1: fill the owner-approval form the way staff do. Synthetic values only.
import { fireEvent, screen } from "@testing-library/react";

import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";

export const SYNTHETIC_APPROVAL_CHOICES: OwnerApprovalChoices = {
  roster: [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
  ],
  replies: [],
};
export const SYNTHETIC_APPROVAL_LOCAL_TIME = "2024-01-02T09:00";

/** A named representative in a conversation, then "Record approval". */
export function recordApprovalThroughForm(
  scope: Pick<typeof screen, "getByLabelText" | "getByRole"> = screen,
  overrides: { participants?: string } = {},
) {
  fireEvent.change(scope.getByLabelText("Who approved"), {
    target: { value: "representative" },
  });
  fireEvent.change(scope.getByLabelText("Representative name"), {
    target: { value: "Example Representative" },
  });
  fireEvent.change(scope.getByLabelText("Capacity"), {
    target: { value: "Synthetic owner's agent" },
  });
  fireEvent.change(scope.getByLabelText("How they approved"), {
    target: { value: "conversation" },
  });
  fireEvent.change(scope.getByLabelText("Participants"), {
    target: { value: overrides.participants ?? "Example Owner LLC and renewal staff" },
  });
  fireEvent.change(scope.getByLabelText("When they approved"), {
    target: { value: SYNTHETIC_APPROVAL_LOCAL_TIME },
  });
  fireEvent.click(scope.getByRole("button", { name: "Record approval" }));
}

/** The approval input the form above posts. */
export const FORM_APPROVAL = {
  party: {
    kind: "representative",
    name: "Example Representative",
    capacity: "Synthetic owner's agent",
  },
  channel: { kind: "conversation", participants: "Example Owner LLC and renewal staff" },
  occurredAt: new Date(SYNTHETIC_APPROVAL_LOCAL_TIME).toISOString(),
} as const;
