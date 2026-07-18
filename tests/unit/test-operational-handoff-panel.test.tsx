// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";

import { TestOperationalHandoffPanel } from "@/components/operations/TestOperationalHandoffPanel";
import type { TestOperationalHandoff } from "@/lib/operations/test-handoffs";

const handoff: TestOperationalHandoff = {
  id: "test-handoff:lease:test-run-1",
  data_mode: "test",
  kind: "lease_renewal",
  owning_record_id: "test-run-1",
  owning_record_href: "/lease-renewal/runs/test-run-1",
  status: "Executing",
  next_owner: "Lease renewal operator",
  due_state: "Tenant offer due 2027-08-15",
  blocker: "No external provider is contacted in Test mode",
  exact_next_action: "Simulate the next action",
  evidence_identity: "receipt-1",
  receipt_count: 3,
  updated_at: "2026-07-18T01:00:00.000Z",
};

describe("TestOperationalHandoffPanel", () => {
  it("renders the complete shared handoff contract and exact owning link", () => {
    render(<TestOperationalHandoffPanel handoffs={[handoff]} />);

    expect(screen.getByText("TEST · Executing")).toBeVisible();
    expect(screen.getByText("Lease renewal operator")).toBeVisible();
    expect(screen.getByText("Tenant offer due 2027-08-15")).toBeVisible();
    expect(
      screen.getByText("No external provider is contacted in Test mode"),
    ).toBeVisible();
    expect(screen.getByText("Simulate the next action")).toBeVisible();
    expect(screen.getByText("receipt-1")).toBeVisible();
    expect(screen.getByRole("link", { name: /open exact owning/i })).toHaveAttribute(
      "href",
      "/lease-renewal/runs/test-run-1",
    );
  });

  it("shows an honest empty state instead of inventing an owning record", () => {
    render(<TestOperationalHandoffPanel handoffs={[]} />);
    expect(screen.getByText(/no isolated Test owning record/i)).toBeVisible();
  });
});
