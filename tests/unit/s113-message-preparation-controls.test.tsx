// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";
const manual = vi.hoisted(() => ({ revision: 1 }));
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: {
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      termsRevision: manual.revision,
      preparation: null,
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  manual.revision = 1;
});
function preparation() {
  const inputs = emptyMessagePreparationInputs();
  const facts: RenewalMessageFacts = {
    channel: "tenant",
    names: ["Emulator Tenant"],
    address: "701 Fixture Lane",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: {
      rent: 1100,
      effectiveDate: "2027-01-01",
      endDate: "2027-12-31",
      source: "staff:reviewed-owner-terms",
    },
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
  };
  return {
    senderEmail: "example-staff@pmikcmetro.com",
    cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
    saved: null,
    inputs,
    facts,
    sourceFingerprint: "a".repeat(64),
    needsReview: true,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
  };
}
describe("S113 mounted message preparation", () => {
  it("prepares and offers all copy modes without Gmail, with selectable fallback after clipboard denial", async () => {
    const fetch = vi.fn(async () => Response.json(preparation()));
    vi.stubGlobal("fetch", fetch);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
        write: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy subject" });
    expect(screen.getByRole("button", { name: "Copy formatted body" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy plain text" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await screen.findByText(/Clipboard access was denied/);
    expect(
      (screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
    ).toEqual(expect.stringContaining("$1,100.00"));
    expect(
      (screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
    ).not.toEqual(expect.stringContaining("{{"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps an unclaimed preview confirmable after an explicit Gmail setup refusal", async () => {
    const base = preparation();
    const signature = {
      name: "Emulator Staff",
      role: null,
      phone: null,
      hours: null,
      website: null,
      source: "reviewed:staff",
    };
    const inputs = {
      ...base.inputs,
      signature,
      leaseOrigin: { kind: "pmi" as const, source: "reviewed:lease" },
      charges: base.inputs.charges.map((charge) => ({
        ...charge,
        applicable: false,
        source: "reviewed:charges",
      })),
    };
    const ready = {
      ...base,
      inputs,
      needsReview: false,
      signatureMatchesActor: true,
      publication: { status: "approved" },
      saved: { inputs, signatureEmail: base.senderEmail },
      facts: {
        ...base.facts,
        charges: inputs.charges,
        leaseOrigin: inputs.leaseOrigin,
        informationForm: { url: "https://example.invalid/form", source: "reviewed:form" },
      },
    };
    const preview = {
      status: "preview",
      channel: "tenant",
      recipient: { to: "tenant@example.invalid", sourceRef: "rentvine:lease:701" },
      subject: "Exact reviewed subject",
      body: "Exact reviewed body",
      executionId: `exec_${"a".repeat(40)}`,
      previewHash: "a".repeat(64),
      template: {
        ref: "tenant-renewal:v2.0",
        version: "v2.0",
        contentHash: "b".repeat(64),
        status: "approved",
      },
    };
    const requests: Array<{ confirm?: { executionId: string } }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.body) return Response.json(ready);
        const request = JSON.parse(String(init.body));
        requests.push(request);
        return request.confirm
          ? Response.json(
              {
                error: "Managed Gmail is unavailable. No Gmail request was made.",
                providerCallAttempted: false,
              },
              { status: 409 },
            )
          : Response.json(preview);
      }),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const prepare = await screen.findByRole("button", {
      name: "Preview unsent Gmail draft",
    });
    expect(prepare).toBeEnabled();
    fireEvent.click(prepare);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review creation confirmation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create this unsent draft" }));
    await screen.findByText(/No Gmail request was made/);
    expect(
      screen.queryByRole("button", { name: "Recover exact Gmail attempt" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Review creation confirmation" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy plain text" })).toBeEnabled();
    expect(requests).toHaveLength(2);
    expect(requests[1].confirm?.executionId).toBe(`exec_${"a".repeat(40)}`);
  });
  it("retains deliberate edits while changed owner terms recompute the message and require review", async () => {
    const first = preparation();
    let current = first;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(current)),
    );
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const prose = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    fireEvent.change(prose, {
      target: { value: "Please share your preferred next step." },
    });
    expect(
      (screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
    ).toEqual(expect.stringContaining("Please share your preferred next step."));
    current = {
      ...first,
      sourceFingerprint: "b".repeat(64),
      facts: { ...first.facts, ownerTerms: { ...first.facts.ownerTerms!, rent: 1200 } },
    };
    manual.revision++;
    mounted.rerender(<RenewalMessagePreparation channel="tenant" canEdit />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
      ).toEqual(expect.stringContaining("$1,200.00")),
    );
    expect(prose).toHaveValue("Please share your preferred next step.");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    expect(screen.getByText(/Your edits are retained/)).toBeInTheDocument();
  });
});
