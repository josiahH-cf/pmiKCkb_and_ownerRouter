// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// S147 ARCH-S147-1: each moved Dashboard function is owned by its destination. Anticipated work now
// sits in Internal Processes beside Start run with its default-notice-rule caption (owner decision
// 2026-10-01), computed only when asked; the connection setup summary sits in Connections.

const { requireCapability, loadLiveRenewalDesk, listProcessDefinitions } = vi.hoisted(
  () => ({
    requireCapability: vi.fn(),
    loadLiveRenewalDesk: vi.fn(),
    listProcessDefinitions: vi.fn(),
  }),
);

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: (...args: unknown[]) => requireCapability(...args),
}));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapability: (...args: unknown[]) => requireCapability(...args),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: (...args: unknown[]) => listProcessDefinitions(...args),
}));
vi.mock("@/lib/approval/needs-decision-gather", () => ({
  gatherNeedsDecisionInbox: vi.fn(async () => ({
    rows: [],
    counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
  })),
  renewalWaitingCount: vi.fn(() => 0),
}));
vi.mock("@/lib/lease-renewal/live-desk", () => ({
  loadLiveRenewalDesk: (...args: unknown[]) => loadLiveRenewalDesk(...args),
}));

import { GET as anticipatedWorkRoute } from "@/app/api/anticipated-work/route";
import SpacesPage from "@/app/spaces/page";
import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { resolveConnectionsState } from "@/lib/ask/app-state-context";
import { buildConnectionView } from "@/lib/connections/connection-status";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";

const admin = {
  uid: "u-admin",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const maintenanceEditor = {
  uid: "u-maint",
  email: "maint@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  scopes: ["maintenance"],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("S147 Anticipated work in Internal Processes", () => {
  it("sits on /spaces with its default-notice-rule caption and reads nothing until asked", async () => {
    requireCapability.mockResolvedValue(admin);
    listProcessDefinitions.mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(await SpacesPage());

    expect(
      screen.getByRole("heading", { name: "Internal Processes", level: 1 }),
    ).toBeInTheDocument();
    const lane = screen.getByRole("region", { name: "Anticipated work" });
    expect(within(lane).getByRole("heading", { name: "Anticipated work" })).toBeVisible();
    expect(within(lane).getByText(/from the default notice rules/)).toBeVisible();
    expect(
      within(lane).getByRole("button", { name: "Show anticipated work" }),
    ).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadLiveRenewalDesk).not.toHaveBeenCalled();
  });

  it("keeps the lane renewals-scoped, as on the Dashboard", async () => {
    requireCapability.mockResolvedValue(maintenanceEditor);
    listProcessDefinitions.mockResolvedValue([]);
    render(await SpacesPage());
    expect(screen.queryByRole("region", { name: "Anticipated work" })).toBeNull();
  });

  it("computes on request and puts Start run beside each startable family", async () => {
    requireCapability.mockResolvedValue(admin);
    listProcessDefinitions.mockResolvedValue([]);
    const user = userEvent.setup();
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      Response.json({
        status: "ok",
        canStart: true,
        startableDefinitionIds: ["lease-renewal"],
        groups: [
          {
            processDefinitionId: "lease-renewal",
            spaceId: "lease-renewals",
            spaceName: "Lease Renewals",
            category: "Renewals",
            count: 2,
            urgency: "upcoming",
            summary: "2 leases in the renewal window",
            startHref: "/spaces/lease-renewals",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(await SpacesPage());

    await user.click(screen.getByRole("button", { name: "Show anticipated work" }));

    const lane = await screen.findByRole("region", { name: "Anticipated work" });
    expect(await within(lane).findByText("2 leases in the renewal window")).toBeVisible();
    expect(within(lane).getByRole("button", { name: "Start run" })).toBeEnabled();
    expect(within(lane).getByText(/from the default notice rules/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/anticipated-work");
  });

  it("reports an unanswered renewal source instead of an all-clear", async () => {
    requireCapability.mockResolvedValue(admin);
    listProcessDefinitions.mockResolvedValue([]);
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "unavailable",
          groups: [],
          canStart: true,
          startableDefinitionIds: [],
        }),
      ),
    );
    render(await SpacesPage());
    await user.click(screen.getByRole("button", { name: "Show anticipated work" }));
    expect(await screen.findByText(/could not be computed just now/)).toBeVisible();
    expect(screen.queryByText(/All clear/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});

describe("S147 anticipated-work route", () => {
  it("refuses a user without Renewals access before any read", async () => {
    requireCapability.mockResolvedValue(maintenanceEditor);
    const response = await anticipatedWorkRoute();
    expect(response.status).toBe(403);
    expect(loadLiveRenewalDesk).not.toHaveBeenCalled();
  });

  it("projects the same families from the read-only 120-day desk", async () => {
    requireCapability.mockResolvedValue(admin);
    listProcessDefinitions.mockResolvedValue([
      { id: "lease-renewal", name: "Lease Renewal", status: "Draft" },
      { id: "owner-renewal-outreach", name: "Owner outreach", status: "Retired" },
    ]);
    loadLiveRenewalDesk.mockResolvedValue({ status: "ok", view: getRenewalDeskView() });

    const response = await anticipatedWorkRoute();
    const body = (await response.json()) as {
      status: string;
      groups: { spaceId: string }[];
      canStart: boolean;
      startableDefinitionIds: string[];
    };
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.groups.map((group) => group.spaceId)).toEqual([
      "lease-renewals",
      "owner-renewal-outreach",
      "tenant-renewal-notice",
      "maintenance-work-order-intake",
      "compliance-new-user",
    ]);
    expect(body.canStart).toBe(true);
    expect(body.startableDefinitionIds).toEqual(["lease-renewal"]);
    const [windows] = loadLiveRenewalDesk.mock.calls[0] as [
      { startIso: string; endIso: string }[],
    ];
    const days =
      (Date.parse(windows[0].endIso) - Date.parse(windows[0].startIso)) / 86_400_000;
    expect(days).toBe(120);
  });

  it("reports an unavailable desk as unavailable, never as empty families", async () => {
    requireCapability.mockResolvedValue(admin);
    listProcessDefinitions.mockResolvedValue([]);
    loadLiveRenewalDesk.mockResolvedValue({ status: "read_error" });
    const body = (await (await anticipatedWorkRoute()).json()) as {
      status: string;
      groups: unknown[];
    };
    expect(body).toMatchObject({ status: "unavailable", groups: [] });
  });
});

describe("S147 connection setup summary in Connections", () => {
  it("lists the connectors that need setup with links to their cards", () => {
    const env = {};
    const needsSetup = resolveConnectionsState(env).items;
    render(
      <ConnectionCenter
        canManage={false}
        needsSetup={needsSetup}
        view={buildConnectionView({})}
      />,
    );
    const section = screen.getByRole("region", { name: "Needs setup" });
    const links = within(section).getAllByRole("link");
    expect(links.length).toBe(needsSetup.length);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/connections#connector-/);
    }
  });

  it("applies the same Space scoping the Dashboard card used", () => {
    const all = resolveConnectionsState({}).items.map((item) => item.href);
    const scoped = resolveConnectionsState({}, maintenanceEditor as never).items.map(
      (item) => item.href,
    );
    expect(scoped.length).toBeLessThan(all.length);
    expect(scoped.every((href) => all.includes(href))).toBe(true);
  });
});
