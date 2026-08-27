// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoticeRulesAdminPanel } from "@/components/admin/NoticeRulesAdminPanel";

const initialRecord = {
  id: "active",
  version: 1,
  rules: [
    {
      scope: "global" as const,
      values: {
        noticeDeadlineDayOfMonth: 15,
        noticeDeadlineMonthOffset: -1,
        operatorWarningLeadDays: 3,
        followUpIntervalDays: 10,
        enabled: true,
      },
      verified: false,
    },
  ],
  created_at: "default",
  updated_at: "default",
  seeded_by_uid: "admin-1",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("NoticeRulesAdminPanel S75 scopes", () => {
  it("keeps missing policy visibly inactive and requires exact override values", async () => {
    const user = userEvent.setup();
    render(<NoticeRulesAdminPanel initialRecord={initialRecord} />);

    expect(
      screen.getByText("Global client timing policy is not confirmed."),
    ).toBeVisible();
    expect(screen.getByText(/starter values are inactive/i)).toBeVisible();
    expect(screen.getByLabelText("Deadline day")).toHaveValue(null);

    await user.click(screen.getByRole("button", { name: "Add override to review" }));
    expect(screen.getByText(/Blank values are never guessed/i)).toBeVisible();
  });

  it("saves a reviewed lease override through the app config route only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      Response.json({
        noticeRules: {
          ...initialRecord,
          version: 2,
          rules: JSON.parse(String(init?.body)).rules,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<NoticeRulesAdminPanel initialRecord={initialRecord} />);

    await user.selectOptions(screen.getByLabelText("Override scope"), "lease");
    await user.type(screen.getByLabelText("Exact property or lease key"), "lease-42");
    await user.type(screen.getByLabelText("Deadline day"), "15");
    await user.type(screen.getByLabelText("Deadline month offset"), "-1");
    await user.type(screen.getByLabelText("Warning lead days"), "3");
    await user.type(
      screen.getByLabelText("Follow-up interval days", {
        selector: "#notice-override-followUpIntervalDays",
      }),
      "10",
    );
    await user.selectOptions(screen.getByLabelText("Tracking value"), "true");
    await user.click(screen.getByLabelText("Client confirmed this exact override"));
    await user.click(screen.getByRole("button", { name: "Add override to review" }));
    expect(screen.getByText(/lease · lease-42/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Save reviewed rule set" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/admin/notice-rules");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(String(init?.body));
    expect(body.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "lease",
          key: "lease-42",
          verified: true,
        }),
      ]),
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toMatch(/gmail|rentvine|sheets/i);
  });
});
