// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PacketTruthPanel } from "@/components/lease-renewal/PacketTruthPanel";
import { RenewalDocumentHandoff } from "@/components/lease-renewal/RenewalDocumentHandoff";
import { REQUIRED_LEASE_ARTIFACTS } from "@/lib/lease-documents/artifact-catalog";

// S120 (R120.7): the current approved property, party, rent and date facts reach the existing
// document handoff with their origin and a link to the owning control. Population never claims a
// PDF, a Dotloop field, a signature or a completion, and a missing fact says where it is recorded.

const manual = vi.hoisted(() => ({
  state: null as Record<string, unknown> | null,
}));
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({ leaseId: "701", state: manual.state }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const handoff = {
  snapshot: null,
  blockers: ["Approved forms and mappings are pending (B-DL3)."],
  readiness: { state: "credentials_not_configured" },
  catalogVersion: "reviewed-fixture-v1",
  attempts: [],
};
const facts = {
  address: "318 Cedar Street, Unit 7",
  owners: ["Fixture Owner"],
  tenants: ["Fixture Tenant", "Second Tenant"],
  leaseEndDate: "2026-12-31",
};

describe("S120 document facts propagation", () => {
  it("AC-S120-7: approved terms, parties and dates reach the handoff with origin and links, without fabricated provider effects", async () => {
    manual.state = {
      cycleId: "cycle",
      termsRevision: 2,
      ownerResponse: {
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
        source: "Owner call",
      },
      sourceUpdates: {
        one: {
          eventId: "one",
          state: "pending",
          intent: { field: "current_rent", value: 1250 },
        },
        two: {
          eventId: "two",
          state: "verified",
          intent: { field: "market_value", value: 1300 },
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(handoff)),
    );
    render(<RenewalDocumentHandoff facts={facts} />);
    await screen.findByText(/Approved forms and mappings are pending/);
    const region = screen.getByRole("region", { name: "Current facts for this packet" });
    expect(region).toHaveTextContent("318 Cedar Street, Unit 7");
    expect(region).toHaveTextContent("Fixture Owner");
    expect(region).toHaveTextContent("Fixture Tenant, Second Tenant");
    expect(region).toHaveTextContent("2026-12-31");
    expect(region).toHaveTextContent("$1,250.00");
    expect(region).toHaveTextContent("2027-01-01");
    expect(region).toHaveTextContent("2027-12-31");
    expect(region).toHaveTextContent(/recorded owner response/i);
    expect(within(region).getByRole("link", { name: /owner response/i })).toHaveAttribute(
      "href",
      "#renewal-manual-owner_response",
    );
    expect(region).toHaveTextContent(/1 pending source update/i);
    expect(
      within(region).getByRole("link", { name: /Review Sheet updates/ }),
    ).toHaveAttribute("href", "#renewal-step-verify-renewal");
    expect(region.textContent).not.toMatch(/unknown/i);
    expect(region.textContent).not.toMatch(
      /signed|signature complete|filled in Dotloop/i,
    );
    expect(region).toHaveTextContent(/does not fill a PDF or a Dotloop field/i);
    // The existing gates and manual handoffs are intact.
    expect(
      screen.getByRole("button", { name: "Preview exact Dotloop packet creation" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Record documents prepared outside the app" }),
    ).toHaveAttribute("href", "#renewal-manual-documents");
  });

  it("AC-S120-7: a fact that is not recorded says where it is recorded instead of reading as unknown", async () => {
    manual.state = { cycleId: "cycle", termsRevision: 1, sourceUpdates: {} };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(handoff)),
    );
    render(
      <RenewalDocumentHandoff facts={{ ...facts, address: null, leaseEndDate: null }} />,
    );
    await screen.findByText(/Approved forms and mappings are pending/);
    const region = screen.getByRole("region", { name: "Current facts for this packet" });
    expect(region).toHaveTextContent(/Not recorded/);
    expect(
      within(region).getByRole("link", { name: /Record the owner response/ }),
    ).toHaveAttribute("href", "#renewal-manual-owner_response");
    expect(region).toHaveTextContent(/Needs verification/);
    expect(
      within(region).getAllByRole("link", { name: /Lease details/ })[0],
    ).toHaveAttribute("href", "#renewal-section-lease-details");
    expect(region.textContent).not.toMatch(/unknown/i);
    expect(region).toHaveTextContent(/No pending source update/i);
  });

  it("AC-S120-7: each approved-artifact dependency links to its exact shared location entry", () => {
    render(<PacketTruthPanel initialSnapshot={null} leaseId="701" transactionId="701" />);
    for (const artifact of REQUIRED_LEASE_ARTIFACTS) {
      const item = screen.getByText(new RegExp(`^${artifact.label}:`)).closest("li")!;
      expect(within(item).getByRole("link", { name: "Manage location" })).toHaveAttribute(
        "href",
        `/connections#renewal-resource-entry-${artifact.kind}`,
      );
    }
  });
});
