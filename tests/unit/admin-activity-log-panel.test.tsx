// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminActivityLogPanel } from "@/components/admin/AdminActivityLogPanel";
import type { AdminActivityEntry } from "@/lib/admin/activity-log";

afterEach(cleanup);

const entries: AdminActivityEntry[] = [
  {
    id: "role:r1",
    kind: "role",
    actorEmail: "admin@pmikcmetro.com",
    targetEmail: "u1@pmikcmetro.com",
    summary: "Role changed from Editor to Admin",
    reason: "promote for coverage",
    createdAt: "2026-07-10T09:30:00.000Z",
  },
];

describe("AdminActivityLogPanel (LR-02)", () => {
  it("renders each access change with summary, target, actor, reason, and timestamp", () => {
    render(<AdminActivityLogPanel entries={entries} />);
    expect(screen.getByText("Role changed from Editor to Admin")).toBeInTheDocument();
    expect(screen.getByText(/u1@pmikcmetro.com/)).toBeInTheDocument();
    expect(screen.getByText(/admin@pmikcmetro.com/)).toBeInTheDocument();
    expect(screen.getByText(/promote for coverage/)).toBeInTheDocument();
    expect(screen.getByText(/2026-07-10 09:30/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no changes", () => {
    render(<AdminActivityLogPanel entries={[]} />);
    expect(screen.getByText("No access changes recorded yet.")).toBeInTheDocument();
  });

  it("shows an unavailable note when provided", () => {
    render(
      <AdminActivityLogPanel
        entries={[]}
        unavailableNote="History unavailable right now."
      />,
    );
    expect(screen.getByText("History unavailable right now.")).toBeInTheDocument();
  });
});
