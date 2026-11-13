// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { LeaseBusinessContractPanel } from "@/components/lease-renewal/LeaseBusinessContractPanel";
import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { ProcessDefinitionListClient } from "@/components/workflows/ProcessDefinitionListClient";
import { emptyArtifactIntakeManifest } from "@/lib/lease-documents/artifact-intake-contract";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { resolveFamilyUse } from "@/lib/lease-documents/family-use";
import {
  packetFactStaffLabel,
  projectLeasePacketReadiness,
  projectPacketContextReadiness,
  withStaffFactLabels,
} from "@/lib/lease-documents/lease-packet-readiness";
import { PACKET_FACT_DEFINITIONS } from "@/lib/lease-documents/packet-inputs";
import { LEASE_LIVE_LIFECYCLE_OWNERSHIP } from "@/lib/lease-renewal/business-contract";
import {
  DEFAULT_APPROVER_FIELD_HINT,
  RUN_OWNER_FIELD_HINT,
} from "@/lib/processes/staff-fields";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

// S283 R-S283-3, BEH-S283-4 and AC-S283-3: an Editor sees none of the three internal texts. The
// engineering sentence on Live renewal review stays in code and Help only; Documents names each
// fact by its staff label, with the raw key in Verification; the process form's "Owner UID" has a
// staff label and a hint that says what the value is and where an Admin finds it. Synthetic
// fixtures only.

afterEach(cleanup);

const AT = "2026-11-13T15:00:00.000Z";
const RAW_KEYS = Object.keys(PACKET_FACT_DEFINITIONS);

/** The text a person reads outside the Verification disclosure. */
function outsideVerification(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll('[data-renewal-field="packet-fact-verification"]')
    .forEach((node) => node.remove());
  return copy.textContent ?? "";
}

describe("BEH-S283-4 Live renewal review shows no engineering sentence", () => {
  it("BEH-S283-4 the next-action sentence is gone from the page and kept in code", () => {
    const { container } = render(<LeaseBusinessContractPanel />);
    expect(container).not.toHaveTextContent(/Keep external actions blocked until/);
    expect(screen.queryByText("Exact next action")).toBeNull();
    expect(LEASE_LIVE_LIFECYCLE_OWNERSHIP.exactNextAction).toMatch(
      /^Keep external actions blocked until/,
    );
    expect(
      screen.getByRole("region", { name: "Live lifecycle ownership" }),
    ).toHaveTextContent(/Durable per-lease Live lifecycleAbsent/);
  });
});

describe("AC-S283-3 Documents names facts by their staff labels, with the key in Verification", () => {
  it("R-S283-3 a fact key reads as the label Packet inputs shows", () => {
    expect(packetFactStaffLabel("property.year_built")).toBe("Year built");
    expect(packetFactStaffLabel("management.origin")).toBe("Management origin");
    expect(packetFactStaffLabel("synthetic.unlisted_fact")).toBe("Unlisted fact");
    expect(withStaffFactLabels("Verified property.year_built is required.")).toBe(
      "Verified Year built is required.",
    );
  });

  it("AC-S283-3 a missing fact shows its staff label in the Missing column and its key only in Verification", () => {
    const input = readyS66Input();
    input.facts = input.facts.filter((fact) => fact.fieldKey !== "property.year_built");
    const rows = projectLeasePacketReadiness({
      manifest: emptyArtifactIntakeManifest(),
      evaluation: evaluateRenewalPacket(input),
      familyUse: { readable: true, families: resolveFamilyUse(null, AT) },
    });
    const lead = rows.find((row) => row.kind === "lead_disclosure")!;
    // The evaluated line keeps the key (S235 pins it); the page shows the staff line.
    expect(lead.missing.join(" ")).toContain("property.year_built");
    expect(lead.staffMissing?.join(" ")).toContain("Year built");
    expect(lead.staffMissing?.join(" ")).not.toContain("property.year_built");
    expect(lead.verification).toContain("Year built: property.year_built");

    const { container } = render(<LeasePacketReadiness rows={rows} />);
    const shown = outsideVerification(container);
    for (const key of RAW_KEYS) expect(shown, key).not.toContain(key);
    const verification = container.querySelector(
      '[data-renewal-field="packet-fact-verification"]',
    );
    expect(verification).not.toBeNull();
    expect(verification).toHaveTextContent("property.year_built");
  });

  it("AC-S283-3 the current packet context shows staff labels; the raw basis is in Verification", () => {
    const context = projectPacketContextReadiness({
      evaluation: evaluateRenewalPacket(readyS66Input()),
      observedAt: AT,
      savedSnapshot: null,
    });
    // The evaluated basis keeps its keys (S235 pins them); the page shows the staff basis.
    expect(context.basis.join(" ")).toContain("management.origin:");
    expect(context.staffBasis?.join(" ")).toContain("Management origin:");
    const { container } = render(<LeasePacketReadiness context={context} rows={[]} />);
    const shown = outsideVerification(container);
    for (const key of RAW_KEYS) expect(shown, key).not.toContain(key);
    expect(
      container.querySelector('[data-renewal-field="packet-fact-verification"]'),
    ).toHaveTextContent("management.origin");
  });
});

describe("AC-S283-3 the process form has no Owner UID label", () => {
  it("AC-S283-3 the create form labels the stored values for staff, with hints", () => {
    render(
      <ProcessDefinitionListClient
        availableSpaces={[{ id: "move-in", name: "Move-In" }]}
        canEdit
        currentUserUid="fixture-editor"
        initialDefinitions={[]}
        initialRecentRuns={[]}
      />,
    );
    expect(screen.queryByText(/Owner UID|Approver UID/)).toBeNull();
    const owner = screen.getByRole("textbox", { name: "Run owner (staff account ID)" });
    expect(owner).toHaveValue("fixture-editor");
    expect(owner).toHaveAccessibleDescription(RUN_OWNER_FIELD_HINT);
    expect(
      screen.getByRole("textbox", { name: "Default approver (staff account ID)" }),
    ).toHaveAccessibleDescription(DEFAULT_APPROVER_FIELD_HINT);
    expect(RUN_OWNER_FIELD_HINT).toMatch(/Admin, People and access/);
  });
});
