// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/SignOutButton", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import { AccessCenter } from "@/components/admin/AccessCenter";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const projection = {
  schema_version: "access-effective-projection-v1" as const,
  role: "Editor" as const,
  space_access: { kind: "named" as const, labels: ["Maintenance"] },
  capability_labels: [
    "View app work",
    "Create and update app work",
    "Use governed workflow communications",
  ],
  authority_source: "current_session" as const,
  directory_sync_state: "matched" as const,
};

describe("S83 unified access center", () => {
  it("renders the four independently understandable regions and exact connection handoffs", () => {
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        projection={projection}
        reviewerAvailable
      />,
    );

    expect(screen.getByRole("heading", { name: "My access" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Request access" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "My requests" })).toHaveAttribute(
      "id",
      "my-requests",
    );
    expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
    expect(screen.getByText("No access requests yet.")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Review renewal data connections" }),
    ).toHaveAttribute("href", "/connections#connection-task-renewal-data");
    expect(
      screen.getByRole("link", { name: "Review messaging connections" }),
    ).toHaveAttribute("href", "/connections#connection-task-communications");
    expect(
      screen.getByRole("link", { name: "Review document and storage connections" }),
    ).toHaveAttribute("href", "/connections#connection-task-documents-storage");
    expect(screen.queryByRole("link", { name: "Review Admin queue" })).toBeNull();
  });

  it("preselects an exact missing capability and named Space without auto-submitting", () => {
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        preselection={{
          capability: "approve",
          space: "renewals",
          returnTo: "/lease-renewal/live/desk",
        }}
        projection={projection}
        reviewerAvailable
      />,
    );

    expect(screen.getByLabelText(/Staff task/)).toHaveValue("approve");
    expect(screen.getByLabelText(/Lease Renewals/)).toBeChecked();
    expect(screen.queryByText("Exact access bundle")).toBeNull();
  });

  it("previews and submits only the exact server-issued attempt", async () => {
    const user = userEvent.setup();
    const reason = "Approve lease renewal work assigned to my staff role.";
    const preview = previewEnvelope(reason);
    const receipt = {
      schema_version: "access-request-receipt-v1",
      request_ref: "request_0001",
      request_version: 1,
      intent_kind: "capability",
      intent_label: "Approve eligible app work",
      state: "pending",
      outcome_summary: "An Admin has not reviewed this request yet.",
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preview, 200))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            schema_version: "access-request-submit-response-v1",
            status: "created",
            message: "Access request submitted.",
            request: receipt,
          },
          201,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        preselection={{ capability: "approve", space: "renewals" }}
        projection={projection}
        reviewerAvailable
      />,
    );

    await user.type(screen.getByLabelText(/Describe the staff duty/), reason);
    await user.click(screen.getByRole("button", { name: "Preview access request" }));
    expect(
      await screen.findByRole("heading", { name: "Exact access bundle" }),
    ).toBeVisible();
    expect(screen.getByText("Approver · Maintenance, Lease Renewals")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Submit access request" }));
    expect(await screen.findByText("Access request submitted.")).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/access/requests",
      expect.objectContaining({
        body: JSON.stringify({
          schema_version: "access-request-submit-command-v1",
          attempt_id: preview.attempt_id,
          preview_hash: preview.preview_hash,
        }),
      }),
    );
  });

  it("retains an ambiguous exact attempt and offers only a deliberate status replay", async () => {
    const user = userEvent.setup();
    const reason = "Approve lease renewal work assigned to my staff role.";
    const preview = previewEnvelope(reason);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preview, 200))
      .mockRejectedValueOnce(new Error("connection closed"));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        preselection={{ capability: "approve", space: "renewals" }}
        projection={projection}
        reviewerAvailable
      />,
    );

    await user.type(screen.getByLabelText(/Describe the staff duty/), reason);
    await user.click(screen.getByRole("button", { name: "Preview access request" }));
    await user.click(
      await screen.findByRole("button", { name: "Submit access request" }),
    );
    expect(await screen.findByText("Request status was not received.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check request status" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview access request" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit access request" })).toBeDisabled();
  });

  it("keeps unaffected regions usable when request history is unavailable", () => {
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable
        initialHistory={null}
        isAdmin={false}
        projection={projection}
        reviewerAvailable={null}
      />,
    );

    expect(screen.getByText("Your request history is unavailable.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry request history" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Preview access request" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
  });

  it("shows no submit control when the current Admin already has all requestable access", () => {
    render(
      <AccessCenter
        currentScopes={undefined}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin
        projection={{
          ...projection,
          role: "Admin",
          space_access: { kind: "all_spaces" },
          capability_labels: [
            "View app work",
            "Create and update app work",
            "Use governed workflow communications",
            "Approve eligible app work",
            "Resolve verified placeholders",
            "Manage users, access, configuration, and supported connections",
            "Remove eligible app records through recoverable controls",
          ],
        }}
        reviewerAvailable
      />,
    );

    expect(
      screen.getByText(
        "You already have every role and Space available through this request workflow.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Preview access request" })).toBeNull();
    expect(screen.getByText("No access requests yet.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
  });

  it("keeps the page usable and exposes the exact retry when access options fail", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "Access requests are temporarily unavailable." }, 503),
      ),
    );
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        preselection={{ capability: "approve", space: "renewals" }}
        projection={projection}
        reviewerAvailable
      />,
    );

    await user.type(
      screen.getByLabelText(/Describe the staff duty/),
      "Approve renewal work assigned to my staff role.",
    );
    await user.click(screen.getByRole("button", { name: "Preview access request" }));

    expect(
      await screen.findByText("Access requests are temporarily unavailable."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry access options" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "My access" })).toBeVisible();
    expect(screen.getByText("No access requests yet.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Connections" })).toBeVisible();
  });

  it("retries a proved no-commit outcome with the same exact attempt and no new preview", async () => {
    const user = userEvent.setup();
    const reason = "Approve lease renewal work assigned to my staff role.";
    const preview = previewEnvelope(reason);
    const unavailable = {
      schema_version: "access-request-submit-response-v1",
      status: "unavailable",
      message: "Access requests are temporarily unavailable.",
      commit_state: "not_committed",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(preview, 200))
      .mockResolvedValueOnce(jsonResponse(unavailable, 503))
      .mockResolvedValueOnce(jsonResponse(unavailable, 503));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        preselection={{ capability: "approve", space: "renewals" }}
        projection={projection}
        reviewerAvailable
      />,
    );

    await user.type(screen.getByLabelText(/Describe the staff duty/), reason);
    await user.click(screen.getByRole("button", { name: "Preview access request" }));
    await user.click(
      await screen.findByRole("button", { name: "Submit access request" }),
    );
    expect(await screen.findByText("Your request was not submitted.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    const exactBody = JSON.stringify({
      schema_version: "access-request-submit-command-v1",
      attempt_id: preview.attempt_id,
      preview_hash: preview.preview_hash,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ body: exactBody });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ body: exactBody });
  });

  it("associates a missing named-Space error and focuses the first requestable Space", async () => {
    const user = userEvent.setup();
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        preselection={{ capability: "approve", space: "renewals" }}
        projection={projection}
        reviewerAvailable
      />,
    );
    const renewalSpace = screen.getByRole("checkbox", { name: "Lease Renewals" });
    await user.click(renewalSpace);
    await user.type(
      screen.getByLabelText(/Describe the staff duty/),
      "Approve renewal work assigned to my staff role.",
    );
    await user.click(screen.getByRole("button", { name: "Preview access request" }));

    expect(screen.getByText("Choose at least one Space.")).toHaveAttribute(
      "id",
      "access-space-error",
    );
    expect(renewalSpace).toHaveFocus();
    expect(renewalSpace.closest("fieldset")).toHaveAttribute(
      "aria-describedby",
      "access-space-error",
    );
  });

  it("renders current-session refresh and comparison-unavailable states without changing access", () => {
    const { rerender } = render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        projection={{ ...projection, directory_sync_state: "refresh_required" }}
        reviewerAvailable
      />,
    );
    expect(
      screen.getByText(
        "Your access was updated. Sign out and back in to use the latest access.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Editor", { selector: ".access-summary-grid p" }),
    ).toBeVisible();

    rerender(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{ items: [], next_cursor: null }}
        isAdmin={false}
        projection={{ ...projection, directory_sync_state: "unavailable" }}
        reviewerAvailable
      />,
    );
    expect(
      screen.getByText(
        "Current session access is shown. Newer access changes could not be checked.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry latest access" })).toBeEnabled();
    expect(
      screen.getByText("Editor", { selector: ".access-summary-grid p" }),
    ).toBeVisible();
  });

  it("renders a durable request state independently of the request form", () => {
    render(
      <AccessCenter
        currentScopes={["maintenance"]}
        historyUnavailable={false}
        initialHistory={{
          items: [
            {
              schema_version: "access-request-receipt-v1",
              request_ref: "request_0001",
              request_version: 2,
              intent_kind: "capability",
              intent_label: "Approve eligible app work",
              state: "denied",
              outcome_summary:
                "An Admin denied this request. Open My access for the reason.",
              requester_reason: "Approve assigned renewal work.",
              decision_reason: "This duty is not currently assigned.",
              created_at: "2026-09-01T12:00:00.000Z",
              updated_at: "2026-09-01T12:05:00.000Z",
            },
          ],
          next_cursor: null,
        }}
        isAdmin={false}
        projection={projection}
        reviewerAvailable
      />,
    );

    expect(
      screen.getByText("Approve eligible app work", {
        selector: ".compact-record strong",
      }),
    ).toBeVisible();
    expect(
      screen.getByText("Decision reason: This duty is not currently assigned."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Preview access request" })).toBeEnabled();
  });
});

function previewEnvelope(reason: string) {
  return {
    schema_version: "access-request-preview-response-v1",
    status: "ready" as const,
    attempt_id: "11111111-1111-4111-8111-111111111111",
    expires_at: "2026-09-01T12:15:00.000Z",
    preview_hash: "a".repeat(64),
    preview: {
      schema_version: "access-request-preview-v1",
      requester_uid: "editor-1",
      requester_label: "Requesting Editor",
      intent: {
        schema_version: "access-intent-v1",
        intent_kind: "capability",
        catalog_version: "catalog-v1",
        catalog_key: "approve",
        scope: { kind: "named_spaces", space_ids: ["renewals"] },
      },
      reason,
      baseline_access: {
        role: "Editor",
        scope: { kind: "named_spaces", space_ids: ["maintenance"] },
      },
      target_access: {
        role: "Approver",
        scope: { kind: "named_spaces", space_ids: ["maintenance", "renewals"] },
      },
      added_capability_keys: ["approve", "resolvePlaceholder"],
      added_space_ids: ["renewals"],
      all_spaces_added: false,
      independent_conditions_statement:
        "Access approval does not change action availability, provider readiness, or required human confirmation.",
    },
  };
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
