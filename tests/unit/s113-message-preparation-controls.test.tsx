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
    bodyBaseHash: "b".repeat(64),
    bodyOverride: null,
    subjectOverride: null,
    signatureMatchesActor: false,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
  };
}
function readyPreparation() {
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
  return {
    ...base,
    inputs,
    signatureMatchesActor: true,
    saved: { revision: 1, inputs, signatureEmail: base.senderEmail },
    facts: {
      ...base.facts,
      charges: inputs.charges,
      leaseOrigin: inputs.leaseOrigin,
      informationForm: { url: "https://example.invalid/form", source: "reviewed:form" },
    },
  };
}

it("S175 presents the actual subject/body before secondary preparation and leaves drafting deliberate", async () => {
  const fetch = vi.fn(async (_input?: RequestInfo | URL, _init?: RequestInit) => ({
    ok: true,
    json: async () => readyPreparation(),
  }));
  vi.stubGlobal("fetch", fetch);
  render(<RenewalMessagePreparation channel="tenant" canEdit />);
  const subject = await screen.findByLabelText("Subject");
  const response = screen.getByLabelText("Response request (optional wording edit)");
  expect(
    subject.compareDocumentPosition(response) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getByLabelText("Email body")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(
    fetch.mock.calls.every(
      (call) => (call[1] as RequestInit | undefined)?.method !== "POST",
    ),
  ).toBe(true);
});
describe("S113 mounted message preparation", () => {
  it("offers all copy modes without Gmail, with the editable body as the fallback after clipboard denial", async () => {
    // S162: the body exports copy exactly what is displayed; Gmail publication stays a separate
    // gate and never blocks local copy. A denied clipboard points to the editable body itself.
    const fetch = vi.fn(async () => Response.json(readyPreparation()));
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
    expect(
      screen.getByRole("button", { name: "Copy formatted body" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "Copy plain text" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await screen.findByText(
      "Clipboard access was denied. Select and copy the subject or body below; your wording is kept.",
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toEqual(
      expect.stringContaining("$1,100.00"),
    );
    expect(
      (screen.getByLabelText("Email body") as HTMLTextAreaElement).value,
    ).not.toEqual(expect.stringContaining("{{"));
    expect(screen.getByLabelText("Email body")).not.toHaveAttribute("readonly");
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
  it("retains deliberate edits while changed owner terms recompute the message, then saves them by itself", async () => {
    const first = preparation();
    let current = first;
    const posts: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body) posts.push(JSON.parse(String(init.body)));
        return Response.json(current);
      }),
    );
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const prose = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    fireEvent.change(prose, {
      target: { value: "Please share your preferred next step." },
    });
    // S161: the message with its marked values is shown and editable; the formatted preview and
    // the editable body carry the same wording.
    expect(screen.getByLabelText("tenant formatted body")).toHaveTextContent(
      "Please share your preferred next step.",
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toContain(
      "Please share your preferred next step.",
    );
    expect(posts).toHaveLength(0);
    current = {
      ...first,
      sourceFingerprint: "b".repeat(64),
      facts: { ...first.facts, ownerTerms: { ...first.facts.ownerTerms!, rent: 1200 } },
    };
    manual.revision++;
    mounted.rerender(<RenewalMessagePreparation channel="tenant" canEdit />);
    await waitFor(() =>
      expect(screen.getByLabelText("tenant formatted body")).toHaveTextContent(
        "$1,200.00",
      ),
    );
    expect(prose).toHaveValue("Please share your preferred next step.");
    const body = screen.getByLabelText("Email body") as HTMLTextAreaElement;
    expect(body.value).toContain("$1,200.00");
    expect(body.value).toContain("Please share your preferred next step.");
    // No review step exists; the draft waits only on the template publication.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Your edits are retained/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    // Leaving the field saves the entry as typed, naming the work record the server reported.
    fireEvent.blur(prose);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      expectedRevision: 0,
      inputs: { edits: { responseRequest: "Please share your preferred next step." } },
      bodyOverride: null,
      subjectOverride: null,
    });
    expect(posts[0]!.reviewed).toBeUndefined();
    expect(posts[0]!.sourceFingerprint).toBeUndefined();
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    expect(prose).toHaveValue("Please share your preferred next step.");
  });
});
