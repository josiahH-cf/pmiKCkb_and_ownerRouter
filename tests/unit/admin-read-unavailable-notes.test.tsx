// @vitest-environment jsdom
// Litmus 2026-11-04 (outside S242–S244): when the user directory or the Space request list cannot
// be read, the Admin page names the failure and gives staff their own next step. It never tells
// staff to run a developer command such as `npm run auth:session`, which only works in an
// engineer's local checkout.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listAppUsers: vi.fn(),
  listSpaceRequests: vi.fn(),
}));
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/auth/page-guards", () => ({
  requirePageCapability: async () => ({ uid: "admin-1", role: "Admin" }),
}));
vi.mock("@/lib/admin/users", () => ({ listAppUsers: mocks.listAppUsers }));
vi.mock("@/lib/firestore/space-requests", () => ({
  listSpaceRequests: mocks.listSpaceRequests,
}));
vi.mock("@/lib/config/server", () => ({
  readServerConfig: () => ({ allowedHostedDomain: "pmikcmetro.com" }),
}));
vi.mock("@/components/admin/SpaceRequestPanel", () => ({
  SpaceRequestPanel: () => <form aria-label="Request a Space" />,
}));

import AdminUsersPage from "@/app/admin/users/page";
import AdminSpaceRequestPage from "@/app/admin/spaces/request/page";

// A developer or credential command, a repository script or a local enrollment step.
const DEVELOPER_INSTRUCTION =
  /\bnpm\b|auth:session|auth:ensure|gcloud|Refresh Google credentials|Firebase Admin setup/i;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Admin read-unavailable notes", () => {
  it("People and Access names an unreadable roster, lists nobody and gives a staff next step", async () => {
    mocks.listAppUsers.mockRejectedValue(new Error("directory read failed"));
    render(await AdminUsersPage());
    const note = screen.getByText(/^The user roster could not be read/);
    expect(note).toHaveTextContent(
      "The user roster could not be read in this session, so nobody is listed and nothing changed. Reload the page to try again, and report it with Feedback if it keeps happening.",
    );
    expect(note.textContent).not.toMatch(DEVELOPER_INSTRUCTION);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("Request a new Space names unreadable prior requests and gives a staff next step", async () => {
    mocks.listSpaceRequests.mockRejectedValue(new Error("request read failed"));
    render(await AdminSpaceRequestPage());
    const note = screen.getByText(/^Prior requests could not be read/);
    expect(note).toHaveTextContent(
      "Prior requests could not be read in this session, so none are listed and nothing changed. Reload the page to try again, and report it with Feedback if it keeps happening.",
    );
    expect(note.textContent).not.toMatch(DEVELOPER_INSTRUCTION);
  });

  it("shows no note when both reads answer", async () => {
    mocks.listAppUsers.mockResolvedValue([]);
    mocks.listSpaceRequests.mockResolvedValue([]);
    render(await AdminUsersPage());
    render(await AdminSpaceRequestPage());
    expect(screen.queryByText(/could not be read/)).toBeNull();
  });
});
