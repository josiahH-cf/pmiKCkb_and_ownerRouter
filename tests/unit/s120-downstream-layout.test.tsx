// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S120 (R120.1): preparation is mounted before the later response for both audiences, the
// outreach/delivery record precedes the response record, and earlier-cycle evidence sits in a
// secondary disclosure. Order is proven from the actual DOM, not from headings alone.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function preparation(channel: "owner" | "tenant") {
  const inputs = emptyMessagePreparationInputs();
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
    saved: null,
    inputs,
    facts: {
      channel,
      names: [channel === "owner" ? "Fixture Owner" : "Fixture Tenant"],
      address: "318 Cedar Street, Unit 7",
      currentBaseRent: null,
      leaseEndDate: "2026-12-31",
      ownerTerms: null,
      range: null,
      suggestedRent: null,
      comps: [],
      trend: null,
      sparseCompsQualification: null,
      charges: inputs.charges,
      insuranceTransition: null,
      leaseOrigin: null,
      otherChargesComparison: null,
      informationForm: null,
      insuranceFlyer: null,
      rbpFlyer: null,
      signature: null,
      attachments: [],
    },
    sourceFingerprint: "a".repeat(64),
    needsReview: true,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
    previousDraftAttempts: [
      {
        executionId: `exec_${"b".repeat(40)}`,
        cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
        state: "Needs reconciliation",
        recoveryAvailable: true,
      },
    ],
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/lease-renewal/message-preparation"))
        return Response.json(
          preparation(target.includes("channel=owner") ? "owner" : "tenant"),
        );
      if (target.includes("/api/lease-renewal/workspace"))
        return Response.json({ observations: [] });
      if (target.includes("/api/lease-renewal/document-handoff"))
        return Response.json({
          snapshot: null,
          blockers: [],
          readiness: { state: "connected" },
          catalogVersion: "fixture",
          attempts: [],
        });
      return Response.json({});
    }),
  );
}

function precedes(first: Element, second: Element) {
  return Boolean(
    first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("S120 downstream chronology", () => {
  it("AC-S120-1: owner and tenant preparation are mounted before the outreach record and the later response, in DOM and keyboard order", async () => {
    stubFetch();
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    render(
      <RenewalWorkspace
        workspace={workspace}
        role="Editor"
        selectedStepId="owner-decision"
        manualState={emptyRenewalWorkspace(
          workspace.summary.id,
          "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
          { kind: "lease_end", dateIso: "2026-12-31", source: "RentVine lease end" },
        )}
      />,
    );
    const owner = screen.getByRole("region", { name: "Owner approval" });
    const ownerPreparation = await within(owner).findByRole("region", {
      name: "Owner message preparation",
    });
    const ownerStaffWork = within(owner).getByRole("button", {
      name: "About Work recorded by staff: owner",
    });
    const ownerOutreach = document.getElementById("renewal-manual-owner_outreach")!;
    expect(owner.contains(ownerOutreach)).toBe(true);
    const ownerResponse = within(owner).getByLabelText("Owner response");
    expect(precedes(ownerPreparation, ownerStaffWork)).toBe(true);
    expect(precedes(ownerOutreach, ownerResponse)).toBe(true);
    // Keyboard order follows DOM order: the first focusable inside preparation comes before
    // the response select.
    const firstPreparationControl = ownerPreparation.querySelector(
      "input, select, textarea, button",
    )!;
    expect(precedes(firstPreparationControl, ownerResponse)).toBe(true);

    const tenant = screen.getByRole("region", { name: "Tenant offer and response" });
    const tenantPreparation = await within(tenant).findByRole("region", {
      name: "Tenant message preparation",
    });
    const tenantDelivery = document.getElementById("renewal-manual-tenant_offer")!;
    expect(tenant.contains(tenantDelivery)).toBe(true);
    const tenantResponse = within(tenant).getByLabelText("Tenant response");
    expect(precedes(tenantPreparation, tenantDelivery)).toBe(true);
    expect(precedes(tenantDelivery, tenantResponse)).toBe(true);
    // The remaining tenant activities still follow the response, unchanged in content.
    const formSent = document.getElementById("renewal-manual-information_form")!;
    expect(tenant.contains(formSent)).toBe(true);
    expect(precedes(tenantResponse, formSent)).toBe(true);
  });

  it("AC-S120-1: earlier-cycle Gmail attempts stay available inside a secondary disclosure that is not the current instruction", async () => {
    stubFetch();
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    render(
      <RenewalWorkspace
        workspace={workspace}
        role="Editor"
        selectedStepId="owner-decision"
        manualState={emptyRenewalWorkspace(
          workspace.summary.id,
          "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
          { kind: "lease_end", dateIso: "2026-12-31", source: "RentVine lease end" },
        )}
      />,
    );
    const owner = screen.getByRole("region", { name: "Owner approval" });
    const ownerPreparation = await within(owner).findByRole("region", {
      name: "Owner message preparation",
    });
    const recovery = within(ownerPreparation).getByRole("button", {
      name: "Recover earlier-cycle Gmail attempt",
    });
    const disclosure = recovery.closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    expect(disclosure!.querySelector("summary")).toHaveTextContent(
      /earlier renewal cycle/i,
    );
    // The current copy and draft groups are their own labeled groups, adjacent to their links.
    expect(
      within(ownerPreparation).getByRole("region", { name: "Copy the message" }),
    ).toBeInTheDocument();
    expect(
      within(ownerPreparation).getByRole("region", { name: "Unsent Gmail draft" }),
    ).toBeInTheDocument();
  });
});
