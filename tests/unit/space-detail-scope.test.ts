import { afterEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";

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
import { getProcessDefinition, listWorkflowRuns } from "@/lib/firestore/workflows";
import { SpaceDesk } from "@/components/desk/SpaceDesk";
import { TrustedPublicationPanel } from "@/components/spaces/TrustedPublicationPanel";
import { notFound, redirect } from "next/navigation";

afterEach(() => {
  vi.clearAllMocks();
});

// S167: every staff account has every internal Space. An account that used to hold a
// maintenance-only allowlist was redirected away from these Spaces before rendering.
describe("Space detail access boundary", () => {
  it.each(["maintenance-work-order-intake", "vendor-assignment-handoff"])(
    "retains %s knowledge while retiring its operational desk and process tab",
    async (spaceId) => {
      const page = await SpaceDetailPage({
        params: Promise.resolve({ spaceId }),
        searchParams: Promise.resolve({ tab: "process" }),
      });
      const elements = allElements(page);
      expect(elements.some((element) => element.type === SpaceDesk)).toBe(false);
      const text = elements
        .flatMap((element) =>
          Children.toArray(element.props.children as ReactNode).filter(
            (child) => typeof child === "string",
          ),
        )
        .join(" ");
      expect(text).toContain("Custom maintenance is retired");
      expect(getProcessDefinition).not.toHaveBeenCalled();
      expect(listWorkflowRuns).not.toHaveBeenCalled();
      expect(
        elements.find((element) => element.type === TrustedPublicationPanel)?.props,
      ).toMatchObject({ canEdit: true, spaceId });
      expect(listPublishedOperationalPages).toHaveBeenCalledWith(editor, spaceId);
    },
  );
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

function allElements(node: ReactNode): ReturnType<typeof elementList> {
  return Children.toArray(node).flatMap(elementList);
}
function elementList(
  node: ReactNode,
): import("react").ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...allElements(node.props.children as ReactNode)];
}
