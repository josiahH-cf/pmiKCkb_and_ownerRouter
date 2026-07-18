// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApprovalTestFixturePanel } from "@/components/approval/ApprovalTestFixturePanel";
import { APPROVAL_TEST_FIXTURE_CONFIRMATION } from "@/lib/approval/test-fixture-contract";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ApprovalTestFixturePanel", () => {
  it("requires the visible Test confirmation and reloads the first restored item", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn(async () =>
      Response.json({
        fixtures: {
          item_ids: ["audit-test-approval-approve-v1"],
          restored_count: 7,
          state: "ready",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalTestFixturePanel navigate={navigate} />);

    await user.click(screen.getByText("Approval Test fixtures"));
    const button = screen.getByRole("button", {
      name: "Create or restore Test approval fixtures",
    });
    expect(button).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(button);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/approval-queue/test-fixtures", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "restore",
        confirmation: APPROVAL_TEST_FIXTURE_CONFIRMATION,
      }),
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        "/approval-queue?item_id=audit-test-approval-approve-v1",
      ),
    );
  });
});
