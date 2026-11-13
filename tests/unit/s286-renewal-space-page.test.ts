import { afterEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";

// S286 R-S286-1, ARCH-S286-1, BEH-S286-1 and AC-S286-1 on the Space page: each renewal Space shows
// its process as guidance with the desk link, for every staff role, with no desk, run panel,
// Process tab or run read. Another process Space keeps its desk. The repository is doubled.

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
  requirePageCapability: vi.fn(),
}));
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
import { NoticeRuleCard } from "@/components/desk/NoticeRuleCard";
import { SpaceDesk } from "@/components/desk/SpaceDesk";
import { ProcessSummaryPanel } from "@/components/spaces/ProcessSummaryPanel";
import { RenewalProcessGuidance } from "@/components/spaces/RenewalProcessGuidance";
import { requirePageCapability } from "@/lib/auth/page-guards";
import type { ProcessDefinitionRecord } from "@/lib/firestore/types";
import { getProcessDefinition, listWorkflowRuns } from "@/lib/firestore/workflows";

afterEach(() => {
  vi.clearAllMocks();
});

const RENEWAL_SPACES = [
  ["lease-renewals", "lease-renewal"],
  ["owner-renewal-outreach", "owner-renewal-outreach"],
  ["tenant-renewal-notice", "tenant-renewal-notice"],
] as const;
const ROLES = ["Editor", "Approver", "Admin"] as const;

function signIn(role: (typeof ROLES)[number]) {
  vi.mocked(requirePageCapability).mockResolvedValue({
    uid: `fixture-${role.toLowerCase()}`,
    email: `fixture-${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  });
}

const published = {
  id: "owner-renewal-outreach",
  status: "Active",
  active_version_id: "renewal-version-1",
  steps: [{ id: "step-1", title: "Gather facts" }],
  source_links: [{ label: "Synthetic procedure", url: "https://example.test/p" }],
} as unknown as ProcessDefinitionRecord;

describe("BEH-S286-1 the renewal Space page", () => {
  for (const [spaceId, definitionId] of RENEWAL_SPACES)
    for (const role of ROLES)
      it(`AC-S286-1 shows ${spaceId} as guidance for an ${role}, with no desk, tab or run`, async () => {
        signIn(role);
        vi.mocked(getProcessDefinition).mockResolvedValueOnce(published);

        for (const tab of [undefined, "process"]) {
          const page = await SpaceDetailPage({
            params: Promise.resolve({ spaceId }),
            searchParams: Promise.resolve(tab ? { tab } : {}),
          });
          const elements = allElements(page);
          const guidance = elements.find(
            (element) => element.type === RenewalProcessGuidance,
          );
          expect(guidance?.props).toMatchObject({
            definitionId,
            deskHref: "/lease-renewal/live/desk",
          });
          expect(elements.some((element) => element.type === SpaceDesk)).toBe(false);
          expect(elements.some((element) => element.type === ProcessSummaryPanel)).toBe(
            false,
          );
          // The read-only notice timing rules stay beside the guidance.
          expect(elements.some((element) => element.type === NoticeRuleCard)).toBe(true);
          const text = textOf(elements);
          expect(text).not.toContain("Overview");
          expect(text).not.toContain("Use this page for the process and checklist.");
          expect(text).not.toContain("Open renewal work");
        }
        expect(getProcessDefinition).toHaveBeenCalledWith(
          expect.objectContaining({ role }),
          definitionId,
        );
        expect(listWorkflowRuns).not.toHaveBeenCalled();
      });

  it("BEH-S286-1 passes the published definition to the guidance", async () => {
    signIn("Editor");
    vi.mocked(getProcessDefinition).mockResolvedValueOnce(published);
    const page = await SpaceDetailPage({
      params: Promise.resolve({ spaceId: "owner-renewal-outreach" }),
    });
    expect(
      allElements(page).find((element) => element.type === RenewalProcessGuidance)?.props,
    ).toMatchObject({ definition: published });
  });

  it("AC-S286-1 passes no definition when it cannot be read, so the page reads the desk sentence", async () => {
    signIn("Editor");
    vi.mocked(getProcessDefinition).mockRejectedValueOnce(new Error("unavailable"));
    const page = await SpaceDetailPage({
      params: Promise.resolve({ spaceId: "tenant-renewal-notice" }),
    });
    expect(
      allElements(page).find((element) => element.type === RenewalProcessGuidance)?.props,
    ).toMatchObject({ definition: null, deskHref: "/lease-renewal/live/desk" });
  });

  it("AC-S286-1 keeps a still-authorized lease context on the desk link", async () => {
    signIn("Editor");
    const page = await SpaceDetailPage({
      params: Promise.resolve({ spaceId: "owner-renewal-outreach" }),
      searchParams: Promise.resolve({ tab: "process", lease: "4821" }),
    });
    expect(
      allElements(page).find((element) => element.type === RenewalProcessGuidance)?.props,
    ).toMatchObject({ deskHref: "/lease-renewal/live/desk/lease/4821" });
  });

  it("AC-S286-1 keeps the desk and its run panel on another process Space", async () => {
    signIn("Editor");
    const page = await SpaceDetailPage({
      params: Promise.resolve({ spaceId: "move-in" }),
    });
    const elements = allElements(page);
    expect(elements.some((element) => element.type === SpaceDesk)).toBe(true);
    expect(elements.some((element) => element.type === RenewalProcessGuidance)).toBe(
      false,
    );
    expect(listWorkflowRuns).toHaveBeenCalledTimes(1);
  });
});

function textOf(elements: ReturnType<typeof allElements>) {
  return elements
    .flatMap((element) =>
      Children.toArray(element.props.children as ReactNode).filter(
        (child) => typeof child === "string",
      ),
    )
    .join(" ");
}
function allElements(node: ReactNode): ReturnType<typeof elementList> {
  return Children.toArray(node).flatMap(elementList);
}
function elementList(
  node: ReactNode,
): import("react").ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...allElements(node.props.children as ReactNode)];
}
