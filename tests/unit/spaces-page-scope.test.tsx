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

describe("Spaces directory for staff", () => {
  // S167: an account with a maintenance-only allowlist used to see one Maintenance card and no
  // renewal waiting count. Every staff account now sees every directory Space.
  it("renders every launch card for an Editor, mapped to a desk or not", async () => {
    const editor = {
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor" as const,
    };
    vi.mocked(requirePageCapability).mockResolvedValue(editor);

    render(await SpacesPage());

    const directorySpaces = launchSpaces.filter(
      (space) => space.showInDirectory !== false,
    );
    expect(screen.getAllByRole("link")).toHaveLength(directorySpaces.length);
    for (const space of directorySpaces) {
      expect(screen.getByRole("heading", { name: space.name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("heading", { name: "Maintenance Work Order Intake" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lease Renewals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Move-In" })).toBeInTheDocument();
    // A Space kept out of the directory stays out for everyone.
    expect(
      screen.queryByRole("heading", { name: "Workflow Communications" }),
    ).not.toBeInTheDocument();
    expect(gatherNeedsDecisionInbox).toHaveBeenCalledTimes(1);
    expect(gatherNeedsDecisionInbox).toHaveBeenCalledWith(editor);
  });

  it("preserves every launch card for a wildcard principal", async () => {
    vi.mocked(requirePageCapability).mockResolvedValue({
      uid: "existing-admin",
      email: "existing-admin@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Admin",
    });

    render(await SpacesPage());

    expect(screen.getAllByRole("link")).toHaveLength(
      launchSpaces.filter((space) => space.showInDirectory !== false).length,
    );
    expect(screen.getByRole("heading", { name: "Lease Renewals" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Move-In" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Workflow Communications" }),
    ).not.toBeInTheDocument();
    expect(gatherNeedsDecisionInbox).toHaveBeenCalledTimes(1);
  });
});
