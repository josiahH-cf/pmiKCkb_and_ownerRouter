// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserManagementPanel } from "@/components/admin/UserManagementPanel";
import type { AppUser } from "@/lib/admin/users";

const WILDCARD_USER: AppUser = {
  uid: "u1",
  email: "worker@pmikcmetro.com",
  role: "Editor",
  scopes: undefined,
  disabled: false,
  lastSignInAt: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("UserManagementPanel space-scope editor", () => {
  it("shows the All spaces wildcard, then submits a maintenance-only claim", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ user: { ...WILDCARD_USER, scopes: ["maintenance"] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagementPanel initialUsers={[WILDCARD_USER]} />);

    const allSpaces = screen.getByRole("checkbox", {
      name: "All spaces for worker@pmikcmetro.com",
    });
    const renewals = screen.getByRole("checkbox", {
      name: "Renewals for worker@pmikcmetro.com",
    });
    const maintenance = screen.getByRole("checkbox", {
      name: "Maintenance for worker@pmikcmetro.com",
    });
    expect(allSpaces).toBeChecked();
    expect(renewals).toBeDisabled();
    expect(maintenance).toBeDisabled();

    await user.click(allSpaces);
    expect(renewals).toBeChecked();
    expect(maintenance).toBeChecked();
    await user.click(renewals);
    await user.type(
      screen.getByRole("textbox", {
        name: "Reason for changing space access for worker@pmikcmetro.com",
      }),
      "maintenance sub-user",
    );
    await user.click(screen.getByRole("button", { name: "Save space access" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1/scopes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scopes: ["maintenance"],
        reason: "maintenance sub-user",
      }),
    });
    expect(
      await screen.findByText(
        "worker@pmikcmetro.com now has access to Maintenance. They re-sign-in to refresh.",
      ),
    ).toBeInTheDocument();
  });

  it("sends null to clear a scoped claim for All spaces", async () => {
    const scopedUser: AppUser = { ...WILDCARD_USER, scopes: ["maintenance"] };
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ user: { ...WILDCARD_USER, scopes: undefined } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagementPanel initialUsers={[scopedUser]} />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "All spaces for worker@pmikcmetro.com",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Reason for changing space access for worker@pmikcmetro.com",
      }),
      "restore all spaces",
    );
    await user.click(screen.getByRole("button", { name: "Save space access" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({
      scopes: null,
      reason: "restore all spaces",
    });
  });

  it("keeps the existing role editor behavior and endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ user: { ...WILDCARD_USER, role: "Approver" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagementPanel initialUsers={[WILDCARD_USER]} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Role" }), "Approver");
    await user.type(
      screen.getByRole("textbox", { name: "Reason for changing worker@pmikcmetro.com" }),
      "approve renewals",
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Approver", reason: "approve renewals" }),
    });
  });

  it("prevents saving an empty explicit scope set", async () => {
    const scopedUser: AppUser = { ...WILDCARD_USER, scopes: ["maintenance"] };
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagementPanel initialUsers={[scopedUser]} />);

    await user.click(
      screen.getByRole("checkbox", {
        name: "Maintenance for worker@pmikcmetro.com",
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Reason for changing space access for worker@pmikcmetro.com",
      }),
      "remove access",
    );
    await user.click(screen.getByRole("button", { name: "Save space access" }));

    expect(
      screen.getByText("Choose at least one space, or choose All spaces."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a malformed existing claim as invalid instead of All spaces", () => {
    render(
      <UserManagementPanel
        initialUsers={[{ ...WILDCARD_USER, scopeClaimInvalid: true }]}
      />,
    );

    expect(
      screen.getByText(
        "Invalid scope claim: choose valid access and save before this user signs in.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "All spaces for worker@pmikcmetro.com",
      }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save space access" })).toBeEnabled();
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
