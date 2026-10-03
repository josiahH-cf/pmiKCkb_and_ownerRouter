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

// A directory record that still carries the Space allowlist written before S167.
const LEFTOVER_SCOPE_APPROVER: AppUser = {
  ...WILDCARD_USER,
  uid: "u2",
  email: "approver@pmikcmetro.com",
  role: "Approver",
  scopes: ["maintenance"],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// S167: every staff account has every internal Space, so the panel no longer edits a per-user
// Space allowlist. It shows the role-derived access and keeps the confirmed role editor.
describe("UserManagementPanel roster and role editor", () => {
  it("shows each user's role-derived capabilities, All internal Spaces, and renewal authority", () => {
    render(
      <UserManagementPanel initialUsers={[WILDCARD_USER, LEFTOVER_SCOPE_APPROVER]} />,
    );

    const editor = screen.getByRole("region", {
      name: "Effective access for worker@pmikcmetro.com",
    });
    expect(editor).toHaveTextContent("Individual roleEditor");
    expect(editor).toHaveTextContent(
      "Inherited capabilitiesView app work, Create and update app work, Use governed workflow communications",
    );
    expect(editor).toHaveTextContent("SpacesAll internal Spaces");
    // S167: the staff member doing the work records the business decisions alone.
    expect(editor).toHaveTextContent(
      "Derived renewal authorityRecord owner direction and app-owned renewal progress, Resolve a renewal source reconciliation, Approve a comp-derived pricing suggestion",
    );
    expect(editor).not.toHaveTextContent(
      "Manage renewal policy, users, connections, suspensions, and gates",
    );

    // S167: a maintenance-only allowlist used to show "Maintenance" and no renewal authority.
    const approver = screen.getByRole("region", {
      name: "Effective access for approver@pmikcmetro.com",
    });
    expect(approver).toHaveTextContent("Individual roleApprover");
    expect(approver).toHaveTextContent("SpacesAll internal Spaces");
    expect(approver).toHaveTextContent(
      "Derived renewal authorityRecord owner direction and app-owned renewal progress, Resolve a renewal source reconciliation, Approve a comp-derived pricing suggestion",
    );
    expect(approver).not.toHaveTextContent("None: no Renewals Space access");
    // The Approver role still carries no Admin-only renewal authority.
    expect(approver).not.toHaveTextContent(
      "Manage renewal policy, users, connections, suspensions, and gates",
    );
  });

  // S167: this panel used to offer All spaces / Renewals / Maintenance checkboxes, a reason box
  // and a "Save space access" button that patched /api/admin/users/{uid}/scopes.
  it("offers no Space allowlist controls for any user", () => {
    render(
      <UserManagementPanel initialUsers={[WILDCARD_USER, LEFTOVER_SCOPE_APPROVER]} />,
    );

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Save space access" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /space access/i })).toBeNull();
    // The role editor is the only per-user control left: one select, reason and save per user.
    expect(screen.getAllByRole("combobox", { name: "Role" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Save role" })).toHaveLength(2);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("changes the role of a user with a leftover Space allowlist through the role endpoint only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ user: { ...LEFTOVER_SCOPE_APPROVER, role: "Editor" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagementPanel initialUsers={[LEFTOVER_SCOPE_APPROVER]} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Role" }), "Editor");
    await user.type(
      screen.getByRole("textbox", {
        name: "Reason for changing approver@pmikcmetro.com",
      }),
      "no longer approves",
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Confirm role change" });
    expect(dialog).toHaveTextContent("approver@pmikcmetro.com");
    expect(dialog).not.toHaveTextContent("Spaces");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Confirm role change" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // S167: the scopes endpoint is never called from this panel.
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Editor", reason: "no longer approves" }),
    });
    expect(
      await screen.findByText(
        "approver@pmikcmetro.com is now Editor. They re-sign-in to refresh.",
      ),
    ).toBeInTheDocument();
    const region = screen.getByRole("region", {
      name: "Effective access for approver@pmikcmetro.com",
    });
    expect(region).toHaveTextContent("SpacesAll internal Spaces");
    // S167: an Editor keeps the business decisions; only management stays Admin.
    expect(region).toHaveTextContent("Resolve a renewal source reconciliation");
    expect(region).not.toHaveTextContent(
      "Manage renewal policy, users, connections, suspensions, and gates",
    );
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

    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Confirm role change" });
    expect(dialog).toHaveTextContent("worker@pmikcmetro.com");
    expect(dialog).toHaveTextContent("Current role");
    expect(dialog).toHaveTextContent("Editor");
    expect(dialog).toHaveTextContent("Proposed role");
    expect(dialog).toHaveTextContent("Approver");
    expect(dialog).toHaveTextContent("approve renewals");
    await user.click(screen.getByRole("button", { name: "Confirm role change" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Approver", reason: "approve renewals" }),
    });
  });

  // S167: a malformed claim used to show an "Invalid scope claim" warning and an unchecked
  // All spaces box. The claim no longer affects the account, so the panel shows the same access.
  it("shows All internal Spaces for a user whose leftover scope claim is malformed", () => {
    render(
      <UserManagementPanel
        initialUsers={[{ ...WILDCARD_USER, scopeClaimInvalid: true }]}
      />,
    );

    const region = screen.getByRole("region", {
      name: "Effective access for worker@pmikcmetro.com",
    });
    expect(region).toHaveTextContent("SpacesAll internal Spaces");
    expect(region).toHaveTextContent(
      "Derived renewal authorityRecord owner direction and app-owned renewal progress",
    );
    expect(screen.queryByText(/Invalid scope claim/)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Save space access" })).toBeNull();
  });

  it("keeps an authority change inert when the user cancels", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<UserManagementPanel initialUsers={[WILDCARD_USER]} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Role" }), "Admin");
    await user.type(
      screen.getByRole("textbox", { name: "Reason for changing worker@pmikcmetro.com" }),
      "temporary administration",
    );
    await user.click(screen.getByRole("button", { name: "Save role" }));

    expect(screen.getByRole("dialog", { name: "Confirm role change" })).toHaveTextContent(
      "Admins can approve work and manage users.",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}
