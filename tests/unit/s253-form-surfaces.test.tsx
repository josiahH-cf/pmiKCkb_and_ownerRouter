/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilledArtifactPanel } from "@/components/lease-renewal/FilledArtifactPanel";
import { LeasePacketReadiness } from "@/components/lease-renewal/LeasePacketReadiness";
import { PacketTruthPanel } from "@/components/lease-renewal/PacketTruthPanel";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { projectLeasePacketReadiness } from "@/lib/lease-documents/lease-packet-readiness";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import { onePathCatalog, onePathEvaluationInputs } from "@/tests/fixtures/s253-one-path";

// S253 R-S253-8, R-S253-9, R-S253-10, R-S253-11 as staff read them: a form's notes, the question a
// lease raises, what a form prints, and the one form that waits. Synthetic forms only.

// The Packet inputs editor has its own tests; these cover the evaluation presentation.
vi.mock("@/components/lease-renewal/PacketInputsEditor", () => ({
  PacketInputsEditor: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function reply(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

async function checkDocument() {
  render(
    <FilledArtifactPanel leaseId="701" snapshotId="snapshot-1" artifactId="artifact-1" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Check filled document" }));
  await screen.findByRole("button", { name: "Refresh filled document" });
}

describe("S253 a form's filled-document status says what it leaves blank and what it waits for", () => {
  it("shows the brochure's notes, its question and the approved file to inspect", async () => {
    reply({
      supported: false,
      unchangedAttachment: true,
      reason:
        "Unchanged approved attachment: it has no variable values and is used exactly as approved.",
      record: null,
      canPrepare: true,
      canApprove: true,
      notes: [
        "Tenant initials: four boxes",
        "Agency selections are left for the signer until they are confirmed for the case",
      ],
      questions: ["More than four tenants: confirm how initials are collected"],
      printed: ["Page 1, Organization: Example Sample Brokerage Services"],
      originalHref:
        "/api/lease-renewal/document-artifact?leaseId=701&documentRef=one-path-brokerage_disclosure",
    });
    await checkDocument();
    const notes = document.querySelector("[data-form-notes]") as HTMLElement;
    expect([...notes.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Tenant initials: four boxes",
      "Agency selections are left for the signer until they are confirmed for the case",
      "More than four tenants: confirm how initials are collected",
    ]);
    expect(notes.querySelector("[data-form-question]")?.textContent).toBe(
      "More than four tenants: confirm how initials are collected",
    );
    expect(document.querySelector("[data-form-printed]")?.textContent).toBe(
      "Page 1, Organization: Example Sample Brokerage Services",
    );
    expect(
      screen
        .getByRole("link", { name: "Download the approved file for inspection" })
        .getAttribute("href"),
    ).toBe(
      "/api/lease-renewal/document-artifact?leaseId=701&documentRef=one-path-brokerage_disclosure",
    );
    // Nothing can be prepared on a file used exactly as approved.
    expect(screen.queryByRole("button", { name: "Prepare filled PDF" })).toBeNull();
  });

  it("shows the owner acknowledgment's execution-date note beside its preparation controls", async () => {
    reply({
      supported: true,
      record: null,
      canPrepare: true,
      canApprove: true,
      notes: [
        "Lease executed on is left blank until the business confirms which date belongs there",
      ],
      printed: ["Page 1, Organization: Sample Example Property Group"],
    });
    await checkDocument();
    expect(document.querySelector("[data-form-notes]")?.textContent).toBe(
      "Lease executed on is left blank until the business confirms which date belongs there",
    );
    expect(screen.getByRole("button", { name: "Prepare filled PDF" })).toBeTruthy();
    expect(document.querySelector("[data-form-hold]")).toBeNull();
  });

  it("offers no preparation for a form that waits, and says the other forms go on", async () => {
    reply({
      supported: true,
      record: null,
      canPrepare: true,
      canApprove: true,
      holds: ["Needs the explanation for this lease"],
    });
    await checkDocument();
    expect(document.querySelector("[data-form-hold]")?.textContent).toBe(
      "Needs the explanation for this lease",
    );
    expect(
      screen.getByText("This form waits. The lease's other forms can be prepared."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Prepare filled PDF" })).toBeNull();
  });

  it("shows why a map is refused and offers no preparation with it", async () => {
    reply({
      supported: true,
      record: null,
      canPrepare: true,
      canApprove: true,
      mapIssues: [
        "Lease executed on is mapped to a value. It stays blank until the business confirms which date belongs there.",
      ],
    });
    await checkDocument();
    expect(screen.getByRole("alert").textContent).toBe(
      "Lease executed on is mapped to a value. It stays blank until the business confirms which date belongs there.",
    );
    expect(screen.queryByRole("button", { name: "Prepare filled PDF" })).toBeNull();
  });

  it("reads exactly as before for a form with nothing to say", async () => {
    reply({ supported: true, record: null, canPrepare: true, canApprove: true });
    await checkDocument();
    expect(document.querySelector("[data-form-notes]")).toBeNull();
    expect(document.querySelector("[data-form-printed]")).toBeNull();
    expect(document.querySelector("[data-form-hold]")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Prepare filled PDF" })).toBeTruthy();
  });
});

describe("S253 the lease's form families show each form's notes", () => {
  async function rows(options: Parameters<typeof onePathEvaluationInputs>[1]) {
    const { catalog, manifest } = await onePathCatalog();
    const built = onePathEvaluationInputs(catalog, options);
    return projectLeasePacketReadiness({
      manifest,
      evaluation: evaluateRenewalPacket(built.tenant),
      familyUse: { readable: true, families: catalog.familyUse! },
    });
  }
  const row = (kind: string) =>
    document.querySelector(`tr[data-family="${kind}"]`) as HTMLElement;

  it("shows the initials note, the five-tenant question and the organization difference", async () => {
    render(<LeasePacketReadiness rows={await rows({ tenants: 5 })} />);
    const brochure = row("brokerage_disclosure");
    expect(
      [...brochure.querySelectorAll("[data-form-notes] li")].map((li) => li.textContent),
    ).toEqual([
      "Tenant initials: four boxes",
      "Agency selections are left for the signer until they are confirmed for the case",
    ]);
    expect(brochure.querySelector("[data-form-questions]")?.textContent).toBe(
      "More than four tenants: confirm how initials are collected",
    );
    expect(brochure.querySelector("[data-form-printed]")?.textContent).toBe(
      "Page 1, Organization: Example Sample Brokerage Services",
    );
    const owner = row("owner_acknowledgment");
    expect(within(owner).getByText("Prepared separately for the owner")).toBeTruthy();
    expect(owner.querySelector("[data-form-notes]")?.textContent).toBe(
      "Lease executed on is left blank until the business confirms which date belongs there",
    );
    expect(
      document.querySelector('[data-renewal-field="form-organization-difference"]')
        ?.textContent,
    ).toBe(
      "These forms print different organization names. Each form keeps the text it prints.",
    );
  });

  it("asks nothing about initials on a four-tenant lease", async () => {
    render(<LeasePacketReadiness rows={await rows({ tenants: 4 })} />);
    expect(row("brokerage_disclosure").querySelector("[data-form-questions]")).toBeNull();
    expect(row("brokerage_disclosure").textContent).toContain("Nothing missing");
  });

  it("names what the pet agreement waits for in its own row only", async () => {
    render(<LeasePacketReadiness rows={await rows({ animals: "one_pet" })} />);
    expect(row("animal_agreement").textContent).toContain(
      "Example Pet 1: record the refundable deposit and where it comes from.",
    );
    expect(row("renewal_extension").textContent).toContain("Nothing missing");
    expect(row("brokerage_disclosure").textContent).toContain("Nothing missing");
  });

  it("says the assistance animal's rule is the client's to answer, and holds no other row", async () => {
    render(<LeasePacketReadiness rows={await rows({ animals: "assistance_animal" })} />);
    expect(row("animal_agreement").textContent).toContain(
      "An assistance animal needs the approved rule before its agreement decision is made. (client; an open question)",
    );
    expect(row("renewal_extension").textContent).toContain("Nothing missing");
  });

  it("shows no note, question or difference where no form has any", () => {
    render(
      <LeasePacketReadiness
        rows={[
          {
            kind: "renewal_extension",
            label: "Approved renewal extension",
            use: "Required",
            useSource: "Recorded client decision",
            applicability: "Applies to this lease",
            original: "No approved original received",
            map: "No reviewed field and signer map",
            missing: [],
            catalogSetup: [],
          },
        ]}
      />,
    );
    expect(document.querySelector("[data-form-notes]")).toBeNull();
    expect(document.querySelector("[data-form-questions]")).toBeNull();
    expect(
      document.querySelector('[data-renewal-field="form-organization-difference"]'),
    ).toBeNull();
  });
});

describe("S253 the packet shows the one form that waits", () => {
  async function snapshot(
    options: Parameters<typeof onePathEvaluationInputs>[1],
  ): Promise<RenewalPacketSnapshot> {
    const { catalog } = await onePathCatalog();
    const evaluation = evaluateRenewalPacket(
      onePathEvaluationInputs(catalog, options).tenant,
    );
    return {
      ...evaluation,
      snapshotId: "packet-one-path",
      snapshotVersion: 1,
      actorUid: "synthetic-editor",
      createdAt: "2026-11-05T16:00:00.000Z",
      previousSnapshotId: null,
      current: true,
      visibleState: evaluation.state,
    };
  }

  it("names the need on the pet agreement and still offers the other forms", async () => {
    render(
      <PacketTruthPanel
        initialSnapshot={await snapshot({ animals: "one_pet" })}
        leaseId="701"
        transactionId="701"
      />,
    );
    const holds = [...document.querySelectorAll("[data-form-hold]")];
    expect(holds.map((hold) => hold.getAttribute("data-form-hold"))).toEqual([
      "animal_agreement",
    ]);
    expect(holds[0].textContent).toBe(
      "This form waits: Example Pet 1: record the refundable deposit and where it comes from.",
    );
    // The packet itself is ready, so every included form still offers its document check.
    expect(
      screen.getAllByRole("button", { name: "Check filled document" }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows no hold once the deposit is recorded", async () => {
    render(
      <PacketTruthPanel
        initialSnapshot={await snapshot({ animals: "one_pet", deposits: [30_000] })}
        leaseId="701"
        transactionId="701"
      />,
    );
    expect(document.querySelector("[data-form-hold]")).toBeNull();
  });
});
