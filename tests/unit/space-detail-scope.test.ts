import { afterEach, describe, expect, it, vi } from "vitest";

const editor = {
  uid: "maintenance-editor",
  email: "maintenance-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as const;

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));
vi.mock("@/lib/auth/page-guards", () => ({
  primarySpaceHref: vi.fn(() => "/"),
  requirePageCapability: vi.fn(async () => ({
    uid: "maintenance-editor",
    email: "maintenance-editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  })),
}));
// The page's Firestore-backed reads, doubled so the page can be built for an admitted account.
vi.mock("@/lib/firestore/approved-templates", () => ({
  getApprovedTemplate: vi.fn(async () => null),
}));
vi.mock("@/lib/firestore/operational-pages", () => ({
  listPublishedOperationalPages: vi.fn(async () => []),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  getProcessDefinition: vi.fn(async () => null),
  listWorkflowRuns: vi.fn(async () => []),
}));
vi.mock("@/lib/firestore/workflow-run-step-checks", () => ({
  listStepChecksForRun: vi.fn(async () => []),
}));

import SpaceDetailPage from "@/app/spaces/[spaceId]/page";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { getApprovedTemplate } from "@/lib/firestore/approved-templates";
import { listPublishedOperationalPages } from "@/lib/firestore/operational-pages";
import { notFound, redirect } from "next/navigation";

afterEach(() => {
  vi.clearAllMocks();
});

// S167: every staff account has every internal Space. An account that used to hold a
// maintenance-only allowlist was redirected away from these Spaces before rendering.
describe("Space detail access boundary", () => {
  it.each(["lease-renewals", "move-in"])(
    "opens %s for an Editor and reads it as that Editor, with no redirect",
    async (spaceId) => {
      const page = await SpaceDetailPage({ params: Promise.resolve({ spaceId }) });

      expect(redirect).not.toHaveBeenCalled();
      expect(notFound).not.toHaveBeenCalled();
      expect(requirePageCapability).toHaveBeenCalledWith("read");
      expect(page.props.user).toEqual(editor);
      expect(listPublishedOperationalPages).toHaveBeenCalledWith(editor, spaceId);
      if (spaceId === "move-in") {
        expect(getApprovedTemplate).toHaveBeenCalledWith(editor, {
          spaceId: "move-in",
          name: "Move-In Welcome Email",
        });
      }
    },
  );

  it("still returns not found for a Space that does not exist, before any read", async () => {
    await expect(
      SpaceDetailPage({ params: Promise.resolve({ spaceId: "no-such-space" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).not.toHaveBeenCalled();
    expect(listPublishedOperationalPages).not.toHaveBeenCalled();
  });
});
