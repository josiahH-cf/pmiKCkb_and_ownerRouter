// S234 R-S234-1: fill the owner-approval form the way staff do. Synthetic values only.
// S262 R-S262-1: the approving branch is "Record the owner's answer": Amount approved, then who
// approved, how and when, then "Review the owner's answer" and "Save the owner's answer".
import { fireEvent, screen } from "@testing-library/react";

import type { OwnerApprovalChoices } from "@/lib/lease-renewal/owner-approval-evidence";

export const SYNTHETIC_APPROVAL_CHOICES: OwnerApprovalChoices = {
  roster: [
    { label: "Example Owner LLC", sourceRef: "rentvine:export:portfolio.owners[0].name" },
  ],
  replies: [],
  rosterFingerprint: "f".repeat(64),
};
export const SYNTHETIC_APPROVAL_LOCAL_TIME = "2024-01-02T09:00";
/** The Amount approved the form enters unless a test names another. */
export const SYNTHETIC_APPROVED_AMOUNT = "1875";

/**
 * Amount approved, a named representative in a conversation, then the review and Save. With
 * `coversDates`, the answer covers the base rent and the saved renewal dates.
 */
export function recordApprovalThroughForm(
  scope: Pick<typeof screen, "getByLabelText" | "getByRole"> = screen,
  overrides: { participants?: string; amount?: string; coversDates?: boolean } = {},
) {
  fireEvent.change(scope.getByLabelText("Amount approved"), {
    target: { value: overrides.amount ?? SYNTHETIC_APPROVED_AMOUNT },
  });
  if (overrides.coversDates)
    fireEvent.click(
      scope.getByRole("radio", { name: /^Base rent and the renewal dates/ }),
    );
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
  fireEvent.click(scope.getByRole("button", { name: "Review the owner's answer" }));
  fireEvent.click(scope.getByRole("button", { name: "Save the owner's answer" }));
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

/**
 * S262: what the store records beside an answer that carries an Amount approved, for a test that
 * plays the server with `planRenewalWorkspaceAction`. The store writes the approved working base
 * in the same transaction; here the next base revision stands in for it.
 */
export function approvedBaseMeta(
  cycleId: string,
  action: {
    readonly approvedBase?: {
      readonly amount: number;
      readonly scope: "amount_only" | "exact_terms";
      readonly expectedWorkingRevision: number;
    };
  },
) {
  const base = action.approvedBase;
  return base
    ? {
        approvedBase: {
          amount: base.amount,
          scope: base.scope,
          cycleId,
          workingRevision: base.expectedWorkingRevision + 1,
          recommended: null,
        },
      }
    : {};
}
