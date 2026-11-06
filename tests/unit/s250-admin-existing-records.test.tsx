// @vitest-environment jsdom
// S250 R-S250-9: the S194 exact per-cycle agreements and the older (S62) portfolio rules keep
// working as they do today and are listed beside the new standing agreements on the Admin page.
// Controlled UI transport only; every name, id and amount is synthetic.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerPolicyRulesAdminPanel } from "@/components/admin/OwnerPolicyRulesAdminPanel";

const STANDING = {
  id: "2c3d4e5f-6071-4b82-9c93-ad4e5f6a7b8c",
  name: "Example Standing Agreement",
  policyId: "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b",
  portfolioId: "9402",
  preApprovalStatement: "The owner pre-approves renewals at the recorded rule.",
  effectiveFrom: "2026-10-01",
  endsOn: null,
  agreedBy: "Sample Owner",
  agreedHow: "Written instruction to the office",
  agreedWhen: "October 1, 2026",
  revoked: false,
  version: 1,
  recordedByUid: "synthetic-admin",
  recordedAt: "2026-10-01T16:00:00.000Z",
  rule: "Raise the current rent by 3 percent",
  ruleVersion: 1,
  active: true,
};
const EXACT = {
  id: "4e5f6071-8293-4da4-9eb5-cf6a7b8c9dae",
  policyId: "1b2c3d4e-5f60-4a71-8b82-9c3d4e5f6a7b",
  policyVersion: 1,
  portfolioId: "9401",
  leaseIds: ["9101", "9106"],
  cycleDate: "2026-12-31",
  terms: { rent: 1442, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
  evidenceRef: "synthetic-evidence",
  effectiveFrom: "2026-10-01",
  expiresOn: "2027-06-30",
  revoked: false,
  version: 2,
  recordedByUid: "synthetic-admin",
  recordedAt: "2026-10-02T16:00:00.000Z",
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "https://example.test",
      );
      return Response.json({
        policies: [],
        cursor: null,
        ...(url.searchParams.get("standing") === "all"
          ? { standingAgreements: [STANDING], exactAgreements: [EXACT] }
          : {}),
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S250 R-S250-9: existing records listed beside the new agreements", () => {
  it("lists the standing agreements, the exact per-cycle agreements and the older portfolio rules in one place", async () => {
    render(
      <OwnerPolicyRulesAdminPanel
        initialRules={[
          {
            portfolioId: "9403",
            kind: "flat_percent_increase",
            percent: 2,
            effectiveFrom: "2026-09-01",
            note: "Synthetic older rule",
            updatedByUid: "synthetic-admin",
          },
        ]}
      />,
    );
    const section = screen.getByRole("region", {
      name: "Standing agreements by owner portfolio",
    });
    const standing = await within(section).findByRole("list", {
      name: "Recorded standing agreements",
    });
    expect(standing).toHaveTextContent("Example Standing Agreement");
    const exact = await within(section).findByRole("list", {
      name: "Exact per-cycle agreements",
    });
    expect(exact).toHaveTextContent("9101, 9106");
    expect(exact).toHaveTextContent("12/31/2026");
    expect(exact).toHaveTextContent("$1,442.00");
    expect(exact).toHaveTextContent("version 2");
    const older = within(section).getByRole("list", { name: "Older portfolio rules" });
    expect(older).toHaveTextContent("Portfolio 9403: +2%, effective 09/01/2026.");
    // The older rules are listed once, in this place.
    expect(screen.getAllByText(/effective 09\/01\/2026/)).toHaveLength(1);
  });

  it("says so when none of a kind is recorded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          policies: [],
          cursor: null,
          standingAgreements: [],
          exactAgreements: [],
        }),
      ),
    );
    render(<OwnerPolicyRulesAdminPanel initialRules={[]} />);
    const section = screen.getByRole("region", {
      name: "Standing agreements by owner portfolio",
    });
    expect(
      await within(section).findByText("No exact per-cycle agreement is recorded."),
    ).toBeInTheDocument();
    expect(
      within(section).getByText("No older portfolio rule is recorded."),
    ).toBeInTheDocument();
  });
});
