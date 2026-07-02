// @vitest-environment jsdom

// S13 C1 — persisted reconcile deep links (direct_link = /lease-renewal/runs/{runId}/reconciliation/
// {fieldKey}) used to 404. The redirect route sends them to the run page with ?flag=, and the run
// page highlights + scrolls to that flag's card so the resolve control lands in view.

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // redirect() never returns in Next; emulate with a tagged throw so assertions can read the target.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

import ReconciliationDeepLinkPage from "@/app/lease-renewal/runs/[runId]/reconciliation/[fieldKey]/page";
import { LeaseRenewalRunClient } from "@/components/lease-renewal/LeaseRenewalRunClient";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";

afterEach(() => cleanup());

describe("reconciliation deep-link redirect (C1)", () => {
  it("redirects the persisted direct_link shape to the run page with ?flag=", async () => {
    await expect(
      ReconciliationDeepLinkPage({
        params: Promise.resolve({ runId: "sim-renewal-001", fieldKey: "current_rent" }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/lease-renewal/runs/sim-renewal-001?flag=current_rent",
    );
  });
});

function flag(fieldKey: string, fieldLabel: string): RenewalFlagView {
  return {
    sourceTriggerKey: `lease_renewal:reconcile:run-1:${fieldKey}`,
    fieldKey,
    fieldLabel,
    severity: "High",
    agreement: "conflict",
    actionNeeded: "Pick the correct value.",
    directLink: `/lease-renewal/runs/run-1/reconciliation/${fieldKey}`,
    suggestedWinner: null,
    candidates: [],
    resolution: null,
    writeback: null,
    writebackApproval: null,
  };
}

const view: RenewalRunView = {
  runId: "run-1",
  label: "Run 1",
  manifest: {
    tabsRecognized: 1,
    tabsUnrecognized: 0,
    credentialTabsExcluded: 0,
    credentialScrubHits: 0,
    dividerRowsDropped: 0,
    totalRecords: 5,
  },
  excludedTabs: [],
  groups: [
    { severity: "High", flags: [flag("current_rent", "Current rent")] },
    { severity: "Medium", flags: [flag("renewal_date", "Renewal date")] },
  ],
  totalFlags: 2,
  resolvedCount: 0,
};

describe("run-page flag highlight (C1)", () => {
  it("highlights and scrolls to the ?flag= target card only", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const { container } = render(
      <LeaseRenewalRunClient
        canResolve={false}
        highlightFieldKey="renewal_date"
        isAdmin={false}
        resolutionsError={false}
        view={view}
      />,
    );

    const highlighted = container.querySelectorAll(".lr-flag-highlight");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveAttribute("id", "flag-renewal_date");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("renders no highlight without a deep-linked flag", () => {
    const { container } = render(
      <LeaseRenewalRunClient
        canResolve={false}
        isAdmin={false}
        resolutionsError={false}
        view={view}
      />,
    );

    expect(container.querySelectorAll(".lr-flag-highlight")).toHaveLength(0);
  });
});
