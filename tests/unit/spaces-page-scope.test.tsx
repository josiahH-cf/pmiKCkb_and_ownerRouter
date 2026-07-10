// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: vi.fn(),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: vi.fn(async () => []),
}));
vi.mock("@/lib/approval/needs-decision-gather", () => ({
  gatherNeedsDecisionInbox: vi.fn(async () => ({
    rows: [],
    counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
  })),
  renewalWaitingCount: vi.fn(() => 0),
}));

import SpacesPage from "@/app/spaces/page";
import { gatherNeedsDecisionInbox } from "@/lib/approval/needs-decision-gather";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { launchSpaces } from "@/lib/spaces";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Spaces directory scope filter", () => {
  it("renders only the mapped Maintenance card for a maintenance-only principal", async () => {
    vi.mocked(requirePageCapability).mockResolvedValue({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    });

    render(await SpacesPage());

    expect(
      screen.getByRole("heading", { name: "Maintenance Work Order Intake" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Lease Renewals" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Move-In" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(gatherNeedsDecisionInbox).not.toHaveBeenCalled();
  });

  it("preserves every launch card for a wildcard principal", async () => {
    vi.mocked(requirePageCapability).mockResolvedValue({
      uid: "existing-admin",
      email: "existing-admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
    });

    render(await SpacesPage());

    expect(screen.getAllByRole("link")).toHaveLength(launchSpaces.length);
    expect(screen.getByRole("heading", { name: "Lease Renewals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Move-In" })).toBeInTheDocument();
    expect(gatherNeedsDecisionInbox).toHaveBeenCalledTimes(1);
  });
});
