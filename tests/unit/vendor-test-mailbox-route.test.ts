import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireVendorSession: vi.fn(),
  read: vi.fn(),
  saveDraft: vi.fn(),
  applyLabel: vi.fn(),
  prepareReply: vi.fn(),
  confirmReply: vi.fn(),
}));

vi.mock("@/lib/vendor/auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/vendor/auth")>();
  return { ...actual, requireVendorSession: mocks.requireVendorSession };
});

vi.mock("@/lib/firestore/vendors", () => ({
  FirestoreVendorStore: vi.fn(function FirestoreVendorStore() {
    return {};
  }),
}));

vi.mock("@/lib/vendor/test-mailbox", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/vendor/test-mailbox")>();
  return {
    ...actual,
    VendorTestMailboxService: vi.fn(function VendorTestMailboxService() {
      return {
        read: mocks.read,
        saveDraft: mocks.saveDraft,
        applyLabel: mocks.applyLabel,
        prepareReply: mocks.prepareReply,
        confirmReply: mocks.confirmReply,
      };
    }),
  };
});

import { GET, POST } from "@/app/api/vendor/tickets/[ticketId]/test-mailbox/route";
import { VendorBoundaryError } from "@/lib/vendor/model";

const context = {
  params: Promise.resolve({ ticketId: "ticket:test-maple-leak" }),
};

function request(body: unknown) {
  return new Request(
    "http://localhost/api/vendor/tickets/ticket%3Atest-maple-leak/test-mailbox",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

afterEach(() => vi.clearAllMocks());

describe("Vendor Test mailbox route", () => {
  it("requires a Vendor session before reading a simulated thread", async () => {
    mocks.requireVendorSession.mockRejectedValue(
      new VendorBoundaryError("Vendor authentication is required.", 401),
    );
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("dispatches assigned-ticket read and exact prepare/confirm actions", async () => {
    mocks.requireVendorSession.mockResolvedValue({
      uid: "uid-test-summit",
      vendorId: "vendor:test-summit-plumbing",
      email: "service@summit-plumbing.example.invalid",
      emailVerified: true,
      totpVerified: true,
      sessionIssuedAt: 1,
      dataMode: "test",
    });
    mocks.read.mockResolvedValue({ data_mode: "test" });
    expect((await GET(new Request("http://localhost"), context)).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith("ticket:test-maple-leak");

    mocks.prepareReply.mockResolvedValue({ confirmationToken: "token" });
    const prepare = await POST(
      request({ action: "prepare_reply", body: "Invented exact reply" }),
      context,
    );
    expect(prepare.status).toBe(200);
    expect(mocks.prepareReply).toHaveBeenCalledWith(
      "ticket:test-maple-leak",
      "Invented exact reply",
    );

    mocks.confirmReply.mockResolvedValue({ status: "simulated" });
    const confirm = await POST(
      request({
        action: "confirm_reply",
        confirmationToken: "token",
        threadId: "test-thread:ticket:test-maple-leak",
        body: "Invented exact reply",
        messageId: "<test@example.invalid>",
      }),
      context,
    );
    expect(confirm.status).toBe(200);
    expect(mocks.confirmReply).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: "ticket:test-maple-leak",
        confirmationToken: "token",
      }),
    );
  });

  it("rejects an unapproved label before the service write", async () => {
    mocks.requireVendorSession.mockResolvedValue({ dataMode: "test" });
    const response = await POST(
      request({ action: "apply_label", label: "Forward to everyone" }),
      context,
    );
    expect(response.status).toBe(400);
    expect(mocks.applyLabel).not.toHaveBeenCalled();
  });
});
