import { describe, expect, it, vi } from "vitest";
import { loadApprovalQueue } from "@/lib/approval/queue";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { launchSpaces } from "@/lib/spaces";

const user: AuthenticatedUser = {
  email: "admin@example.com",
  hd: "example.com",
  role: "Admin",
  uid: "admin-1",
};

describe("approval queue loader", () => {
  it("maps live editable records across demo Spaces into queue items", async () => {
    const seenSpaceIds: string[] = [];
    const result = await loadApprovalQueue(user, {
      listPlaceholders: vi.fn(async (_user, spaceId) => {
        seenSpaceIds.push(spaceId);
        return [
          {
            id: `${spaceId}-placeholder`,
            missing_detail: `Missing ${spaceId}`,
            status: "Open" as const,
          },
        ];
      }),
      listSops: vi.fn(async (_user, spaceId) => [
        {
          id: `${spaceId}-sop`,
          status: "In Review" as const,
          title: `${spaceId} SOP`,
        },
      ]),
      listTemplates: vi.fn(async (_user, spaceId) => [
        {
          id: `${spaceId}-template`,
          name: `${spaceId} Template`,
          status: "In Review" as const,
        },
      ]),
    });

    expect(result.apiBacked).toBe(true);
    const writableSpaceIds = launchSpaces
      .filter((space) => !space.readOnly)
      .map((space) => space.id);

    expect(new Set(seenSpaceIds)).toEqual(new Set(writableSpaceIds));
    expect(result.items).toHaveLength(writableSpaceIds.length * 3);
    expect(result.items).toContainEqual({
      id: "maintenance-work-order-intake-sop",
      kind: "SOP",
      spaceId: "maintenance-work-order-intake",
      spaceName: "Maintenance Work Order Intake",
      status: "In Review",
      title: "maintenance-work-order-intake SOP",
    });
  });

  it("falls back to demo queue items when live loading fails", async () => {
    const result = await loadApprovalQueue(user, {
      listPlaceholders: vi.fn().mockResolvedValue([]),
      listSops: vi.fn().mockRejectedValue(new Error("Firestore unavailable")),
      listTemplates: vi.fn().mockResolvedValue([]),
    });

    expect(result.apiBacked).toBe(false);
    expect(result.items).toHaveLength(
      launchSpaces.filter((space) => !space.readOnly).length * 3,
    );
    expect(result.items.map((item) => item.spaceId)).toContain("owner-onboarding");
  });
});
