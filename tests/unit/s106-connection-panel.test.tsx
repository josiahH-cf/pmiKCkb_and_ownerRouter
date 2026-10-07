// @vitest-environment jsdom
// S106 AC-S106-3/5/6 (fail-first): the mounted readiness panel shows the callback's result, the
// connected account, freshness, reported scopes and exact holds; staff use the company connection
// without a Dotloop sign-in; and only an Admin gets the refresh control and the resource picker,
// which offers supported resources and saves stable ids.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DotloopConnectionPanel } from "@/components/connections/DotloopConnectionPanel";
import type { DotloopReadiness } from "@/lib/connections/dotloop-readiness";
import type { DotloopPickerView } from "@/lib/connections/dotloop-resource-selection";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const readiness: DotloopReadiness = {
  state: "missing_resources",
  reasons: ["compatible_profile", "renewal_template"],
  webhooksAvailable: false,
  signatureApiAvailable: false,
  freshness: { observedAt: "2026-10-07T11:00:00.000Z", stale: false },
  scopes: {
    reported: true,
    accountRead: true,
    profileRead: true,
    loopRead: true,
    loopWrite: true,
    templateRead: true,
  },
  selectionDetail: {
    profile: "unselected",
    template: "unselected",
    profileName: null,
    templateName: null,
  },
  accountEmail: "integrations@pmikcmetro.com",
};

const picker: DotloopPickerView = {
  observedAt: "2026-10-07T11:00:00.000Z",
  stale: false,
  accountEmail: "integrations@pmikcmetro.com",
  profilesTruncated: false,
  profiles: [
    { id: "10", name: "PMI Leasing", type: "INDIVIDUAL", supported: true },
    { id: "20", name: "PMI Office", type: "OFFICE", supported: false },
  ],
  templatesByProfile: {
    "10": [
      {
        id: "100",
        name: "Renewal",
        transactionType: "LEASE_OFFER",
        supported: true,
        statuses: ["PRE_OFFER", "UNDER_CONTRACT", "LEASED", "ARCHIVED"],
      },
      {
        id: "101",
        name: "Purchase",
        transactionType: "PURCHASE_OFFER",
        supported: false,
        statuses: [],
      },
    ],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  refresh.mockReset();
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ refreshed: true }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S106 Dotloop readiness panel", () => {
  it("shows the callback result, account, freshness, scopes and each hold with its next step", () => {
    render(
      <DotloopConnectionPanel
        callbackResult="connected"
        canManage={false}
        picker={null}
        readiness={readiness}
        selection={null}
      />,
    );
    expect(
      screen.getByText(/Dotloop is connected and its account check passed/),
    ).toBeVisible();
    expect(screen.getByText(/integrations@pmikcmetro\.com/)).toBeVisible();
    expect(screen.getByText(/Resources last checked/)).toBeVisible();
    expect(screen.getByText(/loop writing yes/)).toBeVisible();
    expect(screen.getByText(/No Dotloop profile is selected/)).toBeVisible();
    expect(screen.getByText(/An Admin selects the company profile below/)).toBeVisible();
    expect(screen.getByText(/completed by a person in Dotloop/)).toBeVisible();
  });

  it("lets staff use the company connection without a sign-in or Admin controls", () => {
    render(
      <DotloopConnectionPanel
        callbackResult={null}
        canManage={false}
        picker={picker}
        readiness={readiness}
        selection={null}
      />,
    );
    expect(screen.getByText(/without a separate Dotloop sign-in/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Refresh Dotloop resources" }),
    ).toBeNull();
    expect(screen.queryByLabelText(/Dotloop profile/)).toBeNull();
  });

  it("gives an Admin the picker with unsupported resources disabled and saves stable ids", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    render(
      <DotloopConnectionPanel
        callbackResult={null}
        canManage
        picker={picker}
        readiness={readiness}
        selection={null}
      />,
    );
    const profile = screen.getByLabelText(/Dotloop profile/);
    expect(within(profile).getByRole("option", { name: /PMI Office/ })).toBeDisabled();
    await user.selectOptions(profile, "10");
    const template = screen.getByLabelText(/Renewal template/);
    expect(within(template).getByRole("option", { name: /Purchase/ })).toBeDisabled();
    await user.selectOptions(template, "100");
    await user.selectOptions(screen.getByLabelText(/Initial loop status/), "PRE_OFFER");
    await user.click(screen.getByRole("button", { name: "Save renewal resources" }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, { body: string }];
    expect(url).toBe("/api/connections/dotloop/selection");
    expect(JSON.parse(init.body)).toEqual({
      profile_id: "10",
      template_id: "100",
      transaction_type: "LEASE_OFFER",
      initial_status: "PRE_OFFER",
    });
    expect(
      await screen.findByText("The Dotloop renewal resources were saved."),
    ).toBeVisible();
  });

  it("refuses choices from an out-of-date resource list", () => {
    render(
      <DotloopConnectionPanel
        callbackResult={null}
        canManage
        picker={{ ...picker, stale: true }}
        readiness={readiness}
        selection={null}
      />,
    );
    expect(screen.getByText(/resource list is out of date/)).toBeVisible();
    expect(screen.getByLabelText(/Dotloop profile/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save renewal resources" })).toBeDisabled();
  });

  it("runs the explicit resource refresh only from the Admin control", async () => {
    render(
      <DotloopConnectionPanel
        callbackResult={null}
        canManage
        picker={null}
        readiness={readiness}
        selection={null}
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Refresh Dotloop resources" }));
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/connections/dotloop/resources",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByText("Dotloop resources were checked.")).toBeVisible();
  });
});
