import { describe, expect, it, vi } from "vitest";
import { loadApprovalQueue } from "@/lib/approval/queue";
import type { AuthenticatedUser } from "@/lib/auth/session";

const user: AuthenticatedUser = {
  email: "admin@example.com",
  hd: "example.com",
  role: "Admin",
  uid: "admin-1",
};

describe("approval queue loader", () => {
  it("maps live editable records into queue items", async () => {
    const result = await loadApprovalQueue(user, {
      listPlaceholders: vi.fn().mockResolvedValue([
        {
          id: "placeholder-1",
          missing_detail: "Missing renewal timing",
          status: "Open",
        },
      ]),
      listSops: vi.fn().mockResolvedValue([
        {
          id: "sop-1",
          status: "In Review",
          title: "Lease Renewal SOP",
        },
      ]),
      listTemplates: vi.fn().mockResolvedValue([
        {
          id: "template-1",
          name: "Owner Renewal Follow-Up",
          status: "In Review",
        },
      ]),
    });

    expect(result).toEqual({
      apiBacked: true,
      items: [
        {
          id: "sop-1",
          kind: "SOP",
          status: "In Review",
          title: "Lease Renewal SOP",
        },
        {
          id: "template-1",
          kind: "Template",
          status: "In Review",
          title: "Owner Renewal Follow-Up",
        },
        {
          id: "placeholder-1",
          kind: "Placeholder",
          status: "Open",
          title: "Missing renewal timing",
        },
      ],
    });
  });

  it("falls back to demo queue items when live loading fails", async () => {
    const result = await loadApprovalQueue(user, {
      listPlaceholders: vi.fn().mockResolvedValue([]),
      listSops: vi.fn().mockRejectedValue(new Error("Firestore unavailable")),
      listTemplates: vi.fn().mockResolvedValue([]),
    });

    expect(result.apiBacked).toBe(false);
    expect(result.items.map((item) => item.kind)).toEqual([
      "SOP",
      "Template",
      "Placeholder",
    ]);
  });
});
