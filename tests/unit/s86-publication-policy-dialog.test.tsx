// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicationPolicyAdminPanel } from "@/components/admin/PublicationPolicyAdminPanel";
import type { PublicationPolicyRecord } from "@/lib/publication/types";

const policy: PublicationPolicyRecord = {
  id: "policy-1",
  data_mode: "live",
  allowedSpaces: ["lease-renewals"],
  allowedTypes: [],
  connectorId: "connector-1",
  createdAt: "2026-08-31T12:00:00.000Z",
  createdByUid: "admin-1",
  enabled: true,
  rootId: "root-1",
  scannerKey: "scanner-1",
  sensitivityCeiling: "Medium",
  updatedAt: "2026-08-31T12:00:00.000Z",
  updatedByUid: "admin-1",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S86 publication-policy confirmation", () => {
  it("names the exact policy, requires a reason, and dispatches only after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ policy: { ...policy, enabled: false } }), {
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <PublicationPolicyAdminPanel
        initialPolicies={[policy]}
        spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Disable" }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Disable publication policy" });
    expect(dialog).toHaveTextContent("connector-1 / root-1");
    expect(screen.getByRole("button", { name: "Disable policy" })).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Reason" }), "retire root");
    await user.click(screen.getByRole("button", { name: "Disable policy" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/publication-policies/policy-1", {
      body: JSON.stringify({ enabled: false, reason: "retire root" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(
      await screen.findByText("Publication policy disabled and audited."),
    ).toBeVisible();
  });

  it("leaves the policy unchanged when Cancel is chosen", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicationPolicyAdminPanel initialPolicies={[policy]} spaces={[]} />);

    await user.click(screen.getByRole("button", { name: "Disable" }));
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "no longer used");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText(/Enabled/)).toBeVisible();
  });
});
