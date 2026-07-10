import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));
vi.mock("@/lib/auth/page-guards", () => ({
  primarySpaceHref: vi.fn(() => "/maintenance"),
  requirePageCapability: vi.fn(async () => ({
    uid: "maintenance-editor",
    email: "maintenance-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
    scopes: ["maintenance"],
  })),
}));

import SpaceDetailPage from "@/app/spaces/[spaceId]/page";
import { redirect } from "next/navigation";

describe("Space detail scope boundary", () => {
  it.each(["lease-renewals", "move-in"])(
    "redirects a maintenance-only principal away from %s before rendering",
    async (spaceId) => {
      await expect(
        SpaceDetailPage({ params: Promise.resolve({ spaceId }) }),
      ).rejects.toThrow("NEXT_REDIRECT:/maintenance");
      expect(redirect).toHaveBeenLastCalledWith("/maintenance");
    },
  );
});
