// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VendorAdminPanel } from "@/components/admin/VendorAdminPanel";
import { VendorPortal } from "@/components/vendor/VendorPortal";
import { VendorTestMailboxPanel } from "@/components/vendor/VendorTestMailboxPanel";
import type { TestVendorAdminProjection } from "@/lib/vendor/admin-runtime";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mailbox = {
  id: "vendor:test-summit-plumbing:ticket:test-maple-leak",
  vendorId: "vendor:test-summit-plumbing",
  ticketId: "ticket:test-maple-leak",
  threadId: "test-thread:ticket:test-maple-leak",
  data_mode: "test" as const,
  liveEvidenceEligible: false as const,
  subject: "Invented leak at Maple 204",
  snippet: "Simulated assigned-ticket thread.",
  label: "PMI/Vendor/Waiting" as const,
  draftBody: "",
  messages: [],
  createdAt: "2026-07-15T12:00:00.000Z",
  updatedAt: "2026-07-15T12:00:00.000Z",
};

const pendingSetupVendor: TestVendorAdminProjection = {
  vendorId: "vendor:test-summit-plumbing",
  uid: "test-vendor-uid",
  displayName: "Summit Plumbing Test Vendor",
  email: "service@summit-plumbing.example.invalid",
  status: "pending_setup",
  dataMode: "test",
  emailVerified: true,
  totpVerified: false,
  createdAt: "2026-07-15T12:00:00.000Z",
};

describe("Vendor production Test workspace UI", () => {
  it("loads only projected bodyless lifecycle history", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      json({
        audit: [
          {
            action: "vendor.disabled",
            createdAt: "2026-07-18T12:00:00.000Z",
            mailboxScoped: false,
            reasonRecorded: true,
            ticketScoped: false,
          },
          {
            action: "vendor.test_mailbox_reply",
            createdAt: "2026-07-18T11:00:00.000Z",
            mailboxScoped: true,
            reasonRecorded: false,
            ticketScoped: false,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<VendorAdminPanel initialVendors={[pendingSetupVendor]} />);
    await user.click(screen.getByRole("button", { name: "Load lifecycle audit" }));

    const audit = await screen.findByRole("list", {
      name: "Test Vendor lifecycle audit",
    });
    expect(audit).toHaveTextContent("vendor.disabled");
    expect(audit).toHaveTextContent("reason hash: recorded");
    expect(audit).toHaveTextContent("vendor.test_mailbox_reply");
    expect(audit).toHaveTextContent("scope: Test mailbox");
    expect(audit).not.toHaveTextContent("admin-secret-uid");
    expect(audit).not.toHaveTextContent("secret-reason-hash");
    expect(audit).not.toHaveTextContent("secret-mailbox-key");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/vendors/test/vendor%3Atest-summit-plumbing/audit",
    );
  });

  it.each(["active", "disabled"] as const)(
    "does not offer setup-link regeneration when a Test Vendor is %s",
    (status) => {
      render(
        <VendorAdminPanel
          initialVendors={[
            {
              ...pendingSetupVendor,
              status,
              totpVerified: status === "active",
            },
          ]}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Review new one-time setup link" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", {
          name: "Replace an expired or closed setup link",
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("regenerates a pending Test Vendor setup link only after exact confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return json({ vendors: [pendingSetupVendor] });
      const body = JSON.parse(String(init.body)) as {
        operation: string;
        vendorId: string;
        reason: string;
        confirmedPreviewHash?: string;
      };
      if (body.operation === "preview_regenerate_setup") {
        return json({
          preview: {
            previewHash: "regenerate-preview-hash",
            vendorId: pendingSetupVendor.vendorId,
            displayName: pendingSetupVendor.displayName,
            dataMode: "test",
            action: "Regenerate Test Vendor password setup",
            target: pendingSetupVendor.email,
            externalDelivery: false,
            liveEvidenceEligible: false,
            exactEffect:
              "Issue one replacement password-setup action code to this Admin response only. No email or external provider is contacted.",
          },
        });
      }
      if (body.operation === "regenerate_setup") {
        return json({
          setup: {
            setupLink: "https://auth.example.invalid/action?code=replacement-once",
          },
        });
      }
      return new Response(JSON.stringify({ error: "Unexpected operation" }), {
        status: 400,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VendorAdminPanel initialVendors={[pendingSetupVendor]} />);
    expect(
      screen.getByRole("heading", {
        name: "Replace an expired or closed setup link",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/password|totp/i)).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Setup-link regeneration reason" }),
      "Original action link was closed before password setup",
    );
    await user.click(
      screen.getByRole("button", { name: "Review new one-time setup link" }),
    );

    const confirmation = await screen.findByLabelText(
      "Exact Test Vendor setup-link regeneration confirmation",
    );
    expect(confirmation).toHaveTextContent("Test write · no external delivery");
    expect(confirmation).toHaveTextContent("No email or external provider is contacted");
    expect(
      screen.queryByRole("link", { name: "Open one-time Test Vendor setup" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Confirm new one-time setup link" }),
    );

    const setupLink = await screen.findByRole("link", {
      name: "Open one-time Test Vendor setup",
    });
    expect(setupLink).toHaveAttribute(
      "href",
      "https://auth.example.invalid/action?code=replacement-once",
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("shown only from the confirmed response");
    expect(alert).toHaveTextContent("kept only on this screen for you to open now");
    expect(alert).toHaveTextContent("Never paste, share, copy, save, log, or send");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      operation: "preview_regenerate_setup",
      vendorId: pendingSetupVendor.vendorId,
      reason: "Original action link was closed before password setup",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      operation: "regenerate_setup",
      vendorId: pendingSetupVendor.vendorId,
      reason: "Original action link was closed before password setup",
      confirmedPreviewHash: "regenerate-preview-hash",
    });
  });

  it.each(["pending_setup", "active", "disabled"] as const)(
    "offers the repeatable authentication reset when a Test Vendor is %s",
    (status) => {
      render(
        <VendorAdminPanel
          initialVendors={[
            {
              ...pendingSetupVendor,
              status,
              totpVerified: status === "active",
            },
          ]}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Reset Test Vendor authentication" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/revokes all sessions/i)).toBeInTheDocument();
      expect(screen.getByText(/invalidates the old password/i)).toBeInTheDocument();
      expect(screen.getByText(/removes every enrolled TOTP factor/i)).toBeInTheDocument();
      expect(
        screen.getByText(/deletes the current Firebase principal/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/replacement with a new Firebase UID/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Test tickets and app-only mailbox data are preserved/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/stays entirely inside the app as Test-only evidence/i),
      ).toBeInTheDocument();
    },
  );

  it("resets Test Vendor authentication only after exact reason-bound confirmation", async () => {
    const user = userEvent.setup();
    const activeVendor: TestVendorAdminProjection = {
      ...pendingSetupVendor,
      status: "active",
      totpVerified: true,
    };
    const resetVendor: TestVendorAdminProjection = {
      ...pendingSetupVendor,
      createdAt: activeVendor.createdAt,
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return json({ vendors: [resetVendor] });
      const body = JSON.parse(String(init.body)) as {
        operation: string;
        vendorId: string;
        reason: string;
        confirmedPreviewHash?: string;
      };
      if (body.operation === "preview_reset_authentication") {
        return json({
          preview: {
            previewHash: "reset-preview-hash",
            vendorId: activeVendor.vendorId,
            displayName: activeVendor.displayName,
            currentStatus: "active",
            currentInviteVersion: 3,
            nextStatus: "pending_setup",
            nextInviteVersion: 4,
            dataMode: "test",
            action: "Reset Test Vendor authentication",
            target: activeVendor.email,
            externalDelivery: false,
            liveEvidenceEligible: false,
            exactEffect:
              "Delete the current Firebase principal, create a replacement with a new Firebase UID, and move active invite version 3 to pending_setup invite version 4. No external provider is contacted.",
          },
        });
      }
      if (body.operation === "reset_authentication") {
        return json({
          vendor: resetVendor,
          setup: {
            setupLink: "https://auth.example.invalid/action?code=reset-once",
          },
        });
      }
      return new Response(JSON.stringify({ error: "Unexpected operation" }), {
        status: 400,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VendorAdminPanel initialVendors={[activeVendor]} />);
    expect(
      screen.queryByRole("button", { name: "Review new one-time setup link" }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByRole("textbox", { name: "Authentication-reset reason" }),
      "Repeat the V1 password and TOTP acceptance journey",
    );
    await user.click(screen.getByRole("button", { name: "Review authentication reset" }));

    const confirmation = await screen.findByLabelText(
      "Exact Test Vendor authentication-reset confirmation",
    );
    expect(confirmation).toHaveTextContent("Test identity reset · no external delivery");
    expect(confirmation).toHaveTextContent("Delete the current Firebase principal");
    expect(confirmation).toHaveTextContent("replacement with a new Firebase UID");
    expect(confirmation).toHaveTextContent(
      "active · invite version 3 → pending_setup · invite version 4",
    );
    expect(confirmation).toHaveTextContent("No external provider is contacted");
    expect(
      screen.queryByRole("link", { name: "Open one-time Test Vendor setup" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Confirm authentication reset" }),
    );

    const setupLink = await screen.findByRole("link", {
      name: "Open one-time Test Vendor setup",
    });
    expect(setupLink).toHaveAttribute(
      "href",
      "https://auth.example.invalid/action?code=reset-once",
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("shown only from the confirmed response");
    expect(alert).toHaveTextContent("Never paste, share, copy, save, log, or send");
    expect(await screen.findByText(/Test data · pending_setup/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      operation: "preview_reset_authentication",
      vendorId: activeVendor.vendorId,
      reason: "Repeat the V1 password and TOTP acceptance journey",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      operation: "reset_authentication",
      vendorId: activeVendor.vendorId,
      reason: "Repeat the V1 password and TOTP acceptance journey",
      confirmedPreviewHash: "reset-preview-hash",
    });
  });

  it("visibly labels Test tickets and never offers live Gmail connection", () => {
    render(
      <VendorPortal
        email="service@summit-plumbing.example.invalid"
        dataMode="test"
        tickets={[
          {
            id: "ticket:test-maple-leak",
            status: "Waiting on Vendor",
            priority: "Normal",
            summary: "Invented leak at Maple 204",
            unitLabel: "Maple 204 · Test unit",
            updatedAt: "2026-07-15T12:00:00.000Z",
            dataMode: "test",
          },
        ]}
      />,
    );

    expect(screen.getAllByText(/Test workspace/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/external delivery is off/i)).toBeInTheDocument();
    expect(screen.getByText("Invented leak at Maple 204")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect same-address Gmail/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the exact Test-only effect before recording a simulated reply", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return json({ mailbox });
      const body = JSON.parse(String(init.body)) as { action: string; body?: string };
      if (body.action === "prepare_reply") {
        return json({
          confirmationToken: "one-time-confirmation",
          ticketId: mailbox.ticketId,
          threadId: mailbox.threadId,
          body: body.body,
          messageId: "<test-reply@example.invalid>",
          callout: {
            dataMode: "test",
            action: "Simulate Vendor reply",
            target: `Test ticket ${mailbox.ticketId} · ${mailbox.threadId}`,
            externalEffect: false,
            liveEvidenceEligible: false,
            exactEffect:
              "Append this invented reply to the production Test workspace. No email or external provider is contacted.",
          },
        });
      }
      if (body.action === "confirm_reply") {
        return json({
          status: "simulated",
          duplicate: false,
          mailbox: {
            ...mailbox,
            messages: [
              {
                id: "<test-reply@example.invalid>",
                direction: "vendor_reply",
                body: "I can visit the invented unit tomorrow.",
                createdAt: "2026-07-15T12:01:00.000Z",
              },
            ],
          },
        });
      }
      return json({ mailbox });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VendorTestMailboxPanel ticketId={mailbox.ticketId} />);
    await screen.findByText("Invented leak at Maple 204");
    await user.type(
      screen.getByRole("textbox", { name: "Invented reply" }),
      "I can visit the invented unit tomorrow.",
    );
    await user.click(screen.getByRole("button", { name: "Review simulated reply" }));

    expect(
      await screen.findByRole("region", { name: "Exact Test reply confirmation" }),
    ).toHaveTextContent("No email or external provider is contacted");
    expect(screen.getByText(/Test write · not live evidence/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm exact simulated reply" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("No email left the app"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
