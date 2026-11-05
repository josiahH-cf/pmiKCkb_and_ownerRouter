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
  getWorkflowRunDefinition: vi.fn(),
  listWorkflowRuns: vi.fn(async () => []),
}));
vi.mock("@/lib/firestore/workflow-run-step-checks", () => ({
  listStepChecksForRun: vi.fn(async () => []),
}));

import SpaceDetailPage from "@/app/spaces/[spaceId]/page";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { getApprovedTemplate } from "@/lib/firestore/approved-templates";
import { listPublishedOperationalPages } from "@/lib/firestore/operational-pages";
import {
  getProcessDefinition,
  getWorkflowRunDefinition,
  listWorkflowRuns,
} from "@/lib/firestore/workflows";
import { listStepChecksForRun } from "@/lib/firestore/workflow-run-step-checks";
import type { ProcessDefinitionRecord, WorkflowRunRecord } from "@/lib/firestore/types";
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

// PR #182 review: the Overview desk reads the latest run's own steps from the version it is
// pinned to, as the Workflow Run page does, so a later draft edit cannot change its Next Action.
describe("Space Overview desk Next Action source", () => {
  const spaceId = "owner-renewal-outreach";
  const draft = {
    id: spaceId,
    status: "Active",
    active_version_id: "v-2",
    revision: 3,
    steps: [{ id: "step-new", title: "A step added to the draft later" }],
  } as unknown as ProcessDefinitionRecord;
  const latest = {
    id: "run-1",
    definition_id: spaceId,
    definition_version_id: "v-1",
    next_action: "Gather facts",
    status: "In Progress",
  } as unknown as WorkflowRunRecord;
  const pinnedSteps = [
    { id: "step-1", title: "Gather facts" },
    { id: "step-2", title: "Draft owner message" },
  ];

  function deskProps(page: ReactNode) {
    return allElements(page).find((element) => element.type === SpaceDesk)?.props;
  }

  it("passes the run's pinned steps to the Workflow card", async () => {
    vi.mocked(getProcessDefinition).mockResolvedValueOnce(draft);
    vi.mocked(listWorkflowRuns).mockResolvedValueOnce([latest]);
    vi.mocked(getWorkflowRunDefinition).mockResolvedValueOnce({
      default_approver_uid: "admin-1",
      id: spaceId,
      name: "Owner Renewal Outreach",
      space_id: spaceId,
      steps: pinnedSteps,
    } as Awaited<ReturnType<typeof getWorkflowRunDefinition>>);

    const page = await SpaceDetailPage({ params: Promise.resolve({ spaceId }) });

    expect(getWorkflowRunDefinition).toHaveBeenCalledWith(editor, latest);
    expect(deskProps(page)).toMatchObject({
      definition: draft,
      run: latest,
      runSteps: pinnedSteps,
    });
  });

  it("passes no steps when the pinned version or the run's checks cannot be read", async () => {
    vi.mocked(getProcessDefinition).mockResolvedValueOnce(draft);
    vi.mocked(listWorkflowRuns).mockResolvedValueOnce([latest]);
    vi.mocked(getWorkflowRunDefinition).mockRejectedValueOnce(new Error("unavailable"));
    const unread = await SpaceDetailPage({ params: Promise.resolve({ spaceId }) });
    expect(deskProps(unread)?.runSteps).toBeNull();

    vi.mocked(getProcessDefinition).mockResolvedValueOnce(draft);
    vi.mocked(listWorkflowRuns).mockResolvedValueOnce([latest]);
    vi.mocked(listStepChecksForRun).mockRejectedValueOnce(new Error("unavailable"));
    const noChecks = await SpaceDetailPage({ params: Promise.resolve({ spaceId }) });
    expect(deskProps(noChecks)?.runSteps).toBeNull();
    expect(getWorkflowRunDefinition).toHaveBeenCalledTimes(1);
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
