import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  getTestMailboxHandoffForStaff: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapabilityInSpace: mocks.requireCapabilityInSpace,
  };
});

vi.mock("@/lib/firestore/vendors", () => ({
  FirestoreVendorStore: vi.fn(function FirestoreVendorStore() {
    return {
      getTestMailboxHandoffForStaff: mocks.getTestMailboxHandoffForStaff,
    };
  }),
}));

import { GET } from "@/app/api/maintenance/tickets/[ticketId]/vendor-handoff/route";
import { AuthError } from "@/lib/auth/session";

const context = { params: Promise.resolve({ ticketId: "ticket:test-maple-leak" }) };

afterEach(() => vi.clearAllMocks());

describe("Maintenance Vendor handoff route", () => {
  it("requires an internal Maintenance read capability", async () => {
    mocks.requireCapabilityInSpace.mockRejectedValue(
      new AuthError("Authentication required.", 401),
    );

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(401);
    expect(mocks.getTestMailboxHandoffForStaff).not.toHaveBeenCalled();
  });

  it("returns only the bodyless Test handoff projection with no-store caching", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue({ uid: "staff-admin" });
    mocks.getTestMailboxHandoffForStaff.mockResolvedValue({
      ticketId: "ticket:test-maple-leak",
      data_mode: "test",
      currentState: "Complete",
      labelHistory: [
        { state: "Waiting", createdAt: "2026-07-15T12:00:00.000Z" },
        { state: "Complete", createdAt: "2026-07-15T12:05:00.000Z" },
      ],
      draftPresent: true,
      replyCount: 2,
      updatedAt: "2026-07-15T12:05:00.000Z",
      externalProvider: false,
      liveEvidenceEligible: false,
      nextAction:
        "Review completion evidence and continue the internal Maintenance closeout.",
    });

    const response = await GET(new Request("http://localhost"), context);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("read", "maintenance");
    expect(mocks.getTestMailboxHandoffForStaff).toHaveBeenCalledWith(
      "ticket:test-maple-leak",
    );
    expect(payload).toEqual({
      handoff: expect.objectContaining({
        currentState: "Complete",
        draftPresent: true,
        replyCount: 2,
        externalProvider: false,
        liveEvidenceEligible: false,
      }),
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /draftBody|snippet|messageId|threadId|vendorId|actorUid|replyBody/i,
    );
  });

  it("returns an indistinguishable 404 when the Test join is unavailable", async () => {
    mocks.requireCapabilityInSpace.mockResolvedValue({ uid: "staff-editor" });
    mocks.getTestMailboxHandoffForStaff.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "The Test Vendor handoff is unavailable.",
    });
  });
});
