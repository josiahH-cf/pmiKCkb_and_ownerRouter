// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LeaseBusinessContractPanel } from "@/components/lease-renewal/LeaseBusinessContractPanel";
import {
  LEASE_CADENCE_CONTRACT,
  LEASE_FIELD_AUTHORITY_CONTRACT,
  LEASE_LIVE_LIFECYCLE_OWNERSHIP,
} from "@/lib/lease-renewal/business-contract";

afterEach(cleanup);

describe("Lease Renewal operating contract", () => {
  it("makes cadence, authority, fallback, and the missing Live owner explicit", () => {
    render(<LeaseBusinessContractPanel />);

    expect(
      screen.getByRole("region", { name: "Live lifecycle ownership" }),
    ).toHaveTextContent(/Durable per-lease Live lifecycleAbsent/);
    expect(screen.getByText("Field authority and fallback matrix")).toBeVisible();
    expect(screen.getByText("Cadence, off-cycle, and worklog contract")).toBeVisible();
    expect(screen.getByText("System ownership and write boundaries")).toBeVisible();
    expect(LEASE_CADENCE_CONTRACT).toHaveLength(6);
    expect(LEASE_FIELD_AUTHORITY_CONTRACT).toHaveLength(9);
    expect(LEASE_LIVE_LIFECYCLE_OWNERSHIP.durablePerLeaseLifecycle).toBe("absent");
  });
});
