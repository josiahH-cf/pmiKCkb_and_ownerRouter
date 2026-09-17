// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalResourceLinksSummary } from "@/components/lease-renewal/RenewalResourceLinksSummary";
import { RenewalResourceLocations } from "@/components/lease-renewal/RenewalResourceLocations";
import {
  ADMIN_TASK_GROUPS,
  TASK_NAVIGATION_LINKS,
} from "@/lib/navigation/admin-connections";
import { RENEWAL_RESOURCE_FIELDS } from "@/lib/lease-renewal/resource-locations";
import { parseGuideSteps } from "../../scripts/lib/renewal-guide-controls.mjs";

// S120 (R120.3): the existing shared resource entries are managed through Connections and the
// Admin task navigation over the one existing store; each lease consumes the current state with a
// context-sensitive setup action instead of repeating ten global forms.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

afterEach(cleanup);

const verifiedAt = "2026-09-15T10:00:00.000Z";
function settings() {
  return {
    version: 3,
    entries: {
      insurance_flyer: {
        id: "insurance_flyer",
        url: "https://fixture-rental.net/insurance.pdf",
        verified: true,
        recordedAt: verifiedAt,
        recordedByUid: "admin",
      },
      rbp_flyer: {
        id: "rbp_flyer",
        url: "https://fixture-rental.net/rbp.pdf",
        verified: false,
        recordedAt: verifiedAt,
        recordedByUid: "admin",
      },
    },
  };
}

describe("S120 shared resource configuration", () => {
  it("AC-S120-3: the Admin task navigation and the Connections page expose the one existing resource store", () => {
    const link = TASK_NAVIGATION_LINKS.find(
      (entry) => entry.id === "admin-renewal-resource-links",
    );
    expect(link).toMatchObject({
      href: "/connections#renewal-resource-locations",
      requiredCapability: "read",
      surface: "connections",
    });
    expect(
      ADMIN_TASK_GROUPS.find((group) => group.id === "renewal-policy")?.links.map(
        (l) => l.id,
      ),
    ).toContain("admin-renewal-resource-links");
    const connectionsPage = read("app/connections/page.tsx");
    expect(connectionsPage).toContain("getRenewalResourceLocations");
    expect(connectionsPage).toContain("RenewalResourceLocations");
    expect(read("components/connections/ConnectionCenter.tsx")).toContain(
      "resourcePanel",
    );
    // The lease page consumes the summary; it no longer mounts the ten global edit forms.
    const leasePage = read("app/lease-renewal/live/desk/lease/[leaseId]/page.tsx");
    expect(leasePage).toContain("RenewalResourceLinksSummary");
    expect(leasePage).not.toMatch(/<RenewalResourceLocations\b/);
    // No second store or route: the summary and the panel both read the existing settings shape.
    expect(
      read("components/lease-renewal/RenewalResourceLinksSummary.tsx"),
    ).not.toContain("fetch(");
  });

  it("AC-S120-3: the edit panel keeps every one of the ten entries individually addressable for a deep link", () => {
    render(<RenewalResourceLocations role="Admin" initialSettings={settings()} />);
    expect(RENEWAL_RESOURCE_FIELDS).toHaveLength(10);
    for (const field of RENEWAL_RESOURCE_FIELDS) {
      const entry = document.getElementById(`renewal-resource-entry-${field.id}`);
      expect(entry, field.id).not.toBeNull();
      expect(entry).toHaveAttribute("tabindex", "-1");
      expect(
        within(entry as HTMLElement).getByLabelText(field.label),
      ).toBeInTheDocument();
    }
    const panel = document.getElementById("renewal-resource-locations");
    expect(panel).toHaveAttribute("tabindex", "-1");
  });

  it("AC-S120-3: the lease summary keeps blank, unverified, checked and unreadable states distinct and never turns an unverified value into a customer link", () => {
    const { unmount } = render(
      <RenewalResourceLinksSummary canManage settings={settings()} />,
    );
    const region = screen.getByRole("region", { name: "Renewal resource links" });
    expect(region).toHaveAttribute("id", "renewal-resource-locations");
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(RENEWAL_RESOURCE_FIELDS.length);
    const insurance = document.getElementById("renewal-resource-insurance_flyer")!;
    expect(insurance).toHaveTextContent(/checked by staff/i);
    expect(
      within(insurance).getByRole("link", { name: "Open checked destination" }),
    ).toHaveAttribute("href", "https://fixture-rental.net/insurance.pdf");
    const rbp = document.getElementById("renewal-resource-rbp_flyer")!;
    expect(rbp).toHaveTextContent(/needs review/i);
    expect(
      within(rbp).queryByRole("link", { name: "Open checked destination" }),
    ).toBeNull();
    expect(rbp.textContent).not.toContain("https://fixture-rental.net/rbp.pdf");
    const form = document.getElementById("renewal-resource-renewal_information_form")!;
    expect(form).toHaveTextContent(/pending team input/i);
    for (const field of RENEWAL_RESOURCE_FIELDS) {
      const item = document.getElementById(`renewal-resource-${field.id}`)!;
      expect(within(item).getByRole("link", { name: "Manage" })).toHaveAttribute(
        "href",
        `/connections#renewal-resource-entry-${field.id}`,
      );
    }
    expect(
      within(region).getByRole("link", {
        name: "Manage shared resource links in Connections",
      }),
    ).toHaveAttribute("href", "/connections#renewal-resource-locations");
    // No edit form lives in the lease: the ten labeled inputs belong to Connections now.
    expect(within(region).queryByLabelText("Insurance flyer")).toBeNull();
    unmount();

    render(<RenewalResourceLinksSummary canManage={false} settings={null} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.queryByText(/pending team input/i)).toBeNull();
    expect(screen.getAllByText(/unknown saved state/i).length).toBe(
      RENEWAL_RESOURCE_FIELDS.length,
    );
    expect(
      screen.queryByRole("link", { name: "Manage shared resource links in Connections" }),
    ).toBeNull();
    expect(screen.getByText(/An Admin maintains these shared links/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Request access/ })).toBeInTheDocument();
  });

  it("AC-S120-3: the operator guide checks the ten labeled entries on Connections and the lease's manage link", () => {
    const steps = parseGuideSteps(
      read("docs/products/renewal-operator-guide.md"),
    ) as Array<{
      page?: string;
      scope?: string;
      control?: string;
      role?: string;
    }>;
    const connectionRows = steps.filter(
      (step) =>
        step.page === "/connections" && step.scope === "region:Renewal resource links",
    );
    expect(connectionRows.map((step) => step.control).sort()).toEqual(
      RENEWAL_RESOURCE_FIELDS.map((field) => field.label).sort(),
    );
    expect(
      steps
        .filter(
          (step) =>
            (step.page ?? "").startsWith("workspace:") &&
            step.scope === "region:Renewal resource links",
        )
        .map((step) => [step.control, step.role]),
    ).toEqual([["Manage shared resource links in Connections", "link"]]);
  });
});
