// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import {
  hasMissingValueMarker,
  missingValueMarker,
  type MessageCharge,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { projectOfferCharges } from "@/lib/lease-renewal/offer-charges";
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";

// S120 (R120.2, R120.4, R120.5, R120.6) as revised by S161/S162/S163: the mounted preparation
// routes each marked value to its own control, copies exactly the displayed body with its markers,
// fills known facts with a visible origin, explains the response-request paragraph and keeps
// destinations beside their action. Edits save by themselves; nothing is reviewed or confirmed.

const manual = vi.hoisted(() => ({ revision: 1 }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
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

const signature = {
  name: "Fixture Staff",
  role: "PMI KC Metro",
  phone: null,
  hours: null,
  website: null,
  source: "reviewed:staff",
};

function unfinishedTenant() {
  const inputs = emptyMessagePreparationInputs();
  const facts: RenewalMessageFacts = {
    channel: "tenant",
    names: ["Fixture Tenant"],
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
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
    saved: null,
    inputs,
    facts,
    sourceFingerprint: "a".repeat(64),
    bodyBaseHash: "b".repeat(64),
    bodyOverride: null,
    subjectOverride: null,
    signatureMatchesActor: false,
    signatureOrigin: { kind: "none" },
    retainedSignature: null,
    chargeInventory: null,
    publication: { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
    recipients: { status: "blocked", reasons: ["No tenant email is recorded."] },
    destinations: {
      gmailDrafts: null,
      lease: { href: "https://fixture.rentvine.invalid/leases/701", label: "Lease 701" },
      messages: {
        href: "https://fixture.rentvine.invalid/leases/701/messages",
        label: "Lease 701 messages",
      },
      owners: [],
    },
  };
}

function readyTenant() {
  const base = unfinishedTenant();
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
    signatureOrigin: { kind: "saved" },
    saved: {
      revision: 2,
      inputs,
      signatureEmail: base.senderEmail,
      signatureActorUid: "fixture-staff",
    },
    facts: {
      ...base.facts,
      // S163: the source records a first name, so the greeting names the person.
      firstNames: ["Fixture"],
      charges: inputs.charges,
      leaseOrigin: inputs.leaseOrigin,
      signature: { ...signature, email: base.senderEmail },
      informationForm: {
        url: "https://fixture-rental.net/form",
        source: "reviewed:form",
      },
    },
  };
}

function clipboard() {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
  const write = vi.fn<(items: unknown[]) => Promise<void>>(async () => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, write },
  });
  return { writeText, write };
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };

/** A fetch double: GET reads the current preparation; a POST is answered by `respond`. */
function server(
  read: () => unknown,
  respond: (body: Record<string, unknown>) => unknown = read,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null;
      calls.push({ url: String(input), method, body });
      return Response.json(method === "GET" ? read() : respond(body!));
    }),
  );
  return { calls, posts: () => calls.filter((call) => call.method === "POST") };
}

describe("S120 mounted message preparation", () => {
  it("AC-S120-4 (S161/S162): copy puts the displayed body with its markers on the clipboard, and the callout routes each marked value to where it is recorded", async () => {
    const clip = clipboard();
    const captured: Array<Record<string, Blob>> = [];
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public items: Record<string, Blob>) {
          captured.push(items);
        }
      },
    );
    const api = server(unfinishedTenant);
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const formatted = await screen.findByRole("button", { name: "Copy formatted body" });
    const plain = screen.getByRole("button", { name: "Copy plain text" });
    const subject = screen.getByRole("button", { name: "Copy subject" });
    for (const button of [formatted, plain, subject]) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled");
    }
    expect(screen.queryByRole("button", { name: "Review missing inputs" })).toBeNull();
    // The body is the editable text itself; each value still missing is a named marker in it.
    const body = screen.getByLabelText("Email body") as HTMLTextAreaElement;
    expect(body.value).toContain("$1,100.00");
    expect(body.value).toContain(missingValueMarker("sender signature"));
    expect(body.value).toContain(missingValueMarker("renewal information form link"));
    expect(body.value.startsWith("Hello,")).toBe(true);
    expect(screen.queryByLabelText("tenant plain text body")).toBeNull();
    fireEvent.click(plain);
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledWith(body.value));
    fireEvent.click(formatted);
    await waitFor(() => expect(clip.write).toHaveBeenCalledTimes(1));
    expect(await captured[0]!["text/plain"]!.text()).toBe(body.value);
    expect(await captured[0]!["text/html"]!.text()).toContain(
      missingValueMarker("sender signature"),
    );
    expect(screen.getByText(/Body copied as shown/)).toHaveTextContent(
      /Nothing was sent/,
    );
    expect(api.posts()).toHaveLength(0);
    const readiness = screen.getByRole("list", { name: "Marked values" });
    const callout = readiness.closest("details")!;
    expect(callout).toHaveAttribute("open");
    expect(callout).toHaveAttribute("id", "renewal-message-tenant-readiness");
    expect(callout).toHaveTextContent(
      "3 values are marked in this message. You can edit and copy it now. Complete required values before releasing it.",
    );
    expect(readiness).toHaveTextContent("Your sender signature is not entered yet.");
    expect(readiness).toHaveTextContent(
      "The renewal information form link is not saved yet.",
    );
    // S163: no first name is recorded, so the greeting is general and the callout says so.
    expect(readiness).toHaveTextContent(
      "No first name is recorded for Fixture Tenant, so the greeting is general.",
    );
    // Unanswered charge questions and the lease origin are optional details, never marked values.
    expect(readiness).not.toHaveTextContent(/lease origin|charge/i);
    const items = within(readiness).getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) {
      const link = within(item).getByRole("link");
      expect(link.getAttribute("href")).toMatch(
        /^(#renewal-|\/connections#renewal-resource-entry-)/,
      );
    }
    // The generic destination is gone; the resource gap names its exact entry.
    expect(screen.queryByText("Open shared resource link boxes")).toBeNull();
    expect(
      within(readiness).getByRole("link", { name: /renewal information form/i }),
    ).toHaveAttribute(
      "href",
      "/connections#renewal-resource-entry-renewal_information_form",
    );
    // The signature gap routes to the sender signature control inside its disclosure.
    fireEvent.click(
      within(readiness).getByRole("link", { name: "Managed sender signature" }),
    );
    await waitFor(() => expect(screen.getByLabelText("Sender name")).toHaveFocus());
    expect(screen.getByLabelText("Sender name").closest("details")).toHaveAttribute(
      "open",
    );
  });

  it("AC-S120-4: resolving the gaps clears the callout, and copy works locally even while Gmail and recipients stay unavailable", async () => {
    const clip = clipboard();
    let current: ReturnType<typeof unfinishedTenant> | ReturnType<typeof readyTenant> =
      unfinishedTenant();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(current)),
    );
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    expect(screen.getByRole("list", { name: "Marked values" })).toBeInTheDocument();
    current = readyTenant();
    manual.revision++;
    mounted.rerender(<RenewalMessagePreparation channel="tenant" canEdit />);
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: "Marked values" })).toBeNull(),
    );
    expect(
      screen.getByText("Every value in this message is filled in."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy plain text" })).not.toHaveAttribute(
      "aria-disabled",
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledTimes(1));
    const copied = String(clip.writeText.mock.calls[0][0]);
    expect(copied).toContain("$1,100.00");
    expect(copied).not.toContain("{{");
    expect(hasMissingValueMarker(copied)).toBe(false);
    expect(copied.startsWith("Hello Fixture,")).toBe(true);
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toBe(
      copied,
    );
    expect(screen.getByText(/Body copied/)).toHaveTextContent(/Nothing was sent/);
    // Gmail transport remains its own gate: unpublished template and blocked recipients keep the
    // draft unavailable without blocking local copy.
    expect(
      screen.queryByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy recipients" })).toBeDisabled();
  });

  it("AC-S120-4: a denied clipboard names the editable subject and body as the fallback and keeps the wording", async () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(readyTenant())),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy plain text" }));
    await screen.findByText(
      "Clipboard access was denied. Select and copy the subject or body below; your wording is kept.",
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toEqual(
      expect.stringContaining("$1,100.00"),
    );
    expect(screen.getByLabelText("Subject")).toHaveValue(
      "Lease Renewal for 701 Fixture Lane",
    );
  });

  it("AC-S120-2: a retained same-sender signature fills the signature with a visible origin, and another sender's saved signature is replaced only deliberately", async () => {
    const prefilled = {
      ...unfinishedTenant(),
      inputs: { ...unfinishedTenant().inputs, signature },
      signatureOrigin: {
        kind: "retained_sender",
        recordedAt: "2026-09-15T10:00:00.000Z",
      },
      retainedSignature: signature,
    };
    const api = server(() => prefilled);
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    expect(screen.getByLabelText("Sender name")).toHaveValue("Fixture Staff");
    const origin = screen.getByTestId("renewal-message-signature-origin");
    expect(origin).toHaveTextContent(
      /^Filled from your retained sender signature \(saved .+\)\. Edit here to change it\.$/,
    );
    expect(
      screen.queryByRole("list", { name: "Marked values" })?.textContent ?? "",
    ).not.toMatch(/signature/i);
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toContain(
      "Fixture Staff",
    );
    // Filling is neither a review nor a save: no checkbox is asked for and nothing was posted.
    expect(
      screen.queryByRole("checkbox", { name: /I reviewed these inputs/ }),
    ).toBeNull();
    expect(api.posts()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Copy plain text" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy plain text" })).not.toHaveAttribute(
      "aria-disabled",
    );
    cleanup();

    const other = {
      ...readyTenant(),
      signatureMatchesActor: false,
      saved: {
        ...readyTenant().saved,
        signatureEmail: "other-staff@pmikcmetro.com",
        signatureActorUid: "other-staff",
      },
      inputs: {
        ...readyTenant().inputs,
        signature: { ...signature, name: "Other Staff", source: "reviewed:other" },
      },
      retainedSignature: signature,
    };
    const saves = server(
      () => other,
      (body) => ({
        ...other,
        inputs: body.inputs,
        saved: {
          ...other.saved,
          revision: 3,
          inputs: body.inputs,
          signatureEmail: other.senderEmail,
          signatureActorUid: "fixture-staff",
        },
        signatureMatchesActor: true,
        signatureOrigin: { kind: "saved" },
      }),
    );
    mounted.unmount();
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    expect(screen.getByLabelText("Sender name")).toHaveValue("Other Staff");
    expect(screen.getByTestId("renewal-message-signature-origin")).toHaveTextContent(
      "Saved with this message by another sender and shown as saved. Use your retained signature or edit it here if you prefer.",
    );
    // S193 retires the legacy transport preflight. The saved sender remains visible and copy stays available.
    expect(screen.getByTestId("renewal-message-signature-origin")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy plain text" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy plain text" })).not.toHaveAttribute(
      "aria-disabled",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use my retained signature" }));
    expect(screen.getByLabelText("Sender name")).toHaveValue("Fixture Staff");
    // The deliberate replacement saves by itself, with no review and no source fingerprint.
    await waitFor(() => expect(saves.posts()).toHaveLength(1));
    const save = saves.posts()[0]!.body!;
    expect(save).toMatchObject({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      expectedRevision: 2,
      inputs: { signature: { name: "Fixture Staff", source: "reviewed:staff" } },
    });
    expect(save.reviewed).toBeUndefined();
    expect(save.sourceFingerprint).toBeUndefined();
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    expect(screen.getByTestId("renewal-message-signature-origin")).toHaveTextContent(
      "Saved with this message as your signature for this managed sender.",
    );
    expect(
      screen.queryByRole("checkbox", { name: /I reviewed these inputs/ }),
    ).toBeNull();
  });

  it("AC-S120-2 (as revised by S264): a current RentVine recurring charge is proposed in Review offer charges with its source; leaving it out needs its evidence and saves by itself", async () => {
    // S264 replaced the per-family charge picker with the one charge review: the verified line is
    // proposed with its source and nothing about it is typed again.
    const line = {
      chargeId: "77",
      accountId: "9001",
      accountName: "Synthetic Pet Rent",
      description: "Pet Rent",
      classification: "non_rent" as const,
      amount: "25.00",
      frequency: "1",
      startDate: "2026-01-01",
      endDate: null,
      endDateRaw: null,
      statusId: 1,
      version: "v-77",
    };
    const source = {
      state: "read" as const,
      asOf: "2026-11-10",
      lines: [line],
      version: "src-77",
    };
    const mappings: OfferChargeMappingsRead = {
      readable: true,
      record: {
        schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
        version: 1,
        entries: [
          {
            entryId: "00000000-0000-4000-8000-000000009001",
            accountId: "9001",
            accountName: "Synthetic Pet Rent",
            displayLabel: "Pet rent",
            family: "pet" as const,
            frequencyMonths: 1,
            applicability: "active_on_renewal_date" as const,
            requirement: null,
            approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
          },
        ],
        updatedAt: "2026-11-02T15:00:00.000Z",
        updatedByUid: "synthetic-admin",
      },
    };
    const base = unfinishedTenant();
    const review = projectOfferCharges({
      leaseId: "701",
      source,
      mappings,
      selection: null,
      terms: { rent: 1100, effectiveDate: "2027-01-01" },
    });
    const withCharges = {
      ...base,
      offerCharges: {
        source,
        mappings,
        saved: null,
        review,
        snapshotId: "offer:701:synthetic",
        snapshotHash: "c".repeat(64),
      },
    };
    const api = server(() => withCharges);
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    const charges = screen.getByRole("region", { name: "Review offer charges" });
    const pet = charges.querySelector<HTMLElement>(
      '[data-offer-charge-row="rentvine:77"]',
    )!;
    expect(pet).toHaveAttribute("data-offer-charge-status", "selected");
    expect(
      within(pet).getByText(/Proposed: included, stays the same/),
    ).toBeInTheDocument();
    expect(
      within(pet).getByText(
        /^Source: RentVine recurring charge 77, account Synthetic Pet Rent/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Fill from a current RentVine charge")).toBeNull();
    expect(screen.queryByLabelText("Does this charge apply?")).toBeNull();
    // Leaving the line out saves the choice, and its evidence saves when the field is left.
    fireEvent.change(within(pet).getByLabelText("Does Pet rent apply to this offer?"), {
      target: { value: "exclude" },
    });
    const reason = within(pet).getByLabelText("Why it does not apply (its evidence)");
    fireEvent.change(reason, { target: { value: "Synthetic: the pet moved out" } });
    fireEvent.blur(reason);
    await waitFor(() =>
      expect(
        (api.posts().at(-1)?.body?.offerCharges as { decisions?: unknown[] } | undefined)
          ?.decisions,
      ).toEqual([
        {
          rowKey: "rentvine:77",
          choice: "exclude",
          reason: "Synthetic: the pet moved out",
          renewalAmountCents: null,
          effectiveDate: null,
          correctionSource: null,
          reviewed: {
            sourceVersion: "v-77",
            renewalDate: "2027-01-01",
            mappingVersion: 1,
          },
        },
      ]),
    );
    const save = api.posts().at(-1)!.body!;
    expect(save.kind).toBe("save");
    // The earlier family-only entry is not touched by the charge review.
    expect(
      (save.inputs as { charges: MessageCharge[] }).charges.find(
        (charge) => charge.id === "pet",
      ),
    ).toMatchObject({ applicable: null, amount: null });
  });

  it("AC-S120-4 adversarial (S161): refused prose in the wording field never reaches the body or the clipboard and is named as not saved yet; valid wording saves by itself", async () => {
    // A complete message plus an edit that smuggles an amount into free prose: the entry stays in
    // its field and is named, the message keeps the approved paragraph, copy carries exactly the
    // displayed body, and no save request ever carries the refused prose.
    const clip = clipboard();
    const api = server(readyTenant, (body) => ({
      ...readyTenant(),
      inputs: body.inputs,
      saved: { ...readyTenant().saved, revision: 3, inputs: body.inputs },
    }));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const field = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    const plain = screen.getByRole("button", { name: "Copy plain text" });
    expect(plain).not.toHaveAttribute("aria-disabled");
    fireEvent.change(field, { target: { value: "Rent is $1,300 from next January." } });
    expect(screen.getByTestId("renewal-message-unfinished")).toHaveTextContent(
      "Not saved yet: Response request wording.",
    );
    expect(screen.getByTestId("renewal-message-response-paragraph")).toHaveTextContent(
      /approved default/i,
    );
    const body = screen.getByLabelText("Email body") as HTMLTextAreaElement;
    expect(body.value).not.toContain("$1,300");
    expect(body.value).toContain("Please let us know if you plan to stay or leave");
    expect(plain).toBeEnabled();
    expect(plain).not.toHaveAttribute("aria-disabled");
    fireEvent.click(plain);
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledWith(body.value));
    expect(String(clip.writeText.mock.calls[0][0])).not.toContain("$1,300");
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    // Leaving the field saves nothing: the refused prose cannot be stored and nothing else changed.
    fireEvent.blur(field);
    expect(api.posts()).toHaveLength(0);
    // Clearing the refused prose clears the notice; the message is complete again.
    fireEvent.change(field, { target: { value: "" } });
    expect(screen.queryByTestId("renewal-message-unfinished")).toBeNull();
    expect(
      screen.getByText("Every value in this message is filled in."),
    ).toBeInTheDocument();
    expect(plain).not.toHaveAttribute("aria-disabled");
    // Valid wording saves by itself when the field is left, with no review and no fingerprint.
    fireEvent.change(field, {
      target: { value: "Let us know your plans when you can." },
    });
    fireEvent.blur(field);
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    const save = api.posts()[0]!.body!;
    expect(save).toMatchObject({
      kind: "save",
      leaseId: "701",
      channel: "tenant",
      expectedRevision: 2,
      inputs: { edits: { responseRequest: "Let us know your plans when you can." } },
    });
    expect(typeof save.operationId).toBe("string");
    expect(save.reviewed).toBeUndefined();
    expect(save.sourceFingerprint).toBeUndefined();
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    expect(body.value).toContain("Let us know your plans when you can.");
    expect(clip.writeText).toHaveBeenCalledTimes(1);
  });

  it("AC-S120-5: the response-request field names the exact paragraph it replaces and shows the current paragraph", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(unfinishedTenant())),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const field = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    const hint = document.getElementById(
      field.getAttribute("aria-describedby")!.split(" ")[0],
    );
    expect(hint).toHaveTextContent(/after the terms, charges and insurance wording/i);
    expect(hint).toHaveTextContent(
      /before the request to complete the renewal information form/i,
    );
    const paragraph = screen.getByTestId("renewal-message-response-paragraph");
    expect(paragraph).toHaveTextContent(/approved default/i);
    expect(paragraph).toHaveTextContent(
      "Please let us know if you plan to stay or leave",
    );
    fireEvent.change(field, {
      target: { value: "Let us know your plans when you can." },
    });
    expect(screen.getByTestId("renewal-message-response-paragraph")).toHaveTextContent(
      "Let us know your plans when you can.",
    );
    expect(
      screen.getByTestId("renewal-message-response-paragraph"),
    ).not.toHaveTextContent(/approved default/i);
    expect(screen.getByLabelText("tenant formatted body")).toHaveTextContent(
      "Let us know your plans when you can.",
    );
  });

  it("AC-S120-6: copy actions sit beside their exact destinations and the Gmail folder is labeled as a folder", async () => {
    const owner = {
      ...readyTenant(),
      facts: {
        ...readyTenant().facts,
        channel: "owner" as const,
        names: ["Fixture Owner"],
        firstNames: ["Fixture"],
        currentBaseRent: { value: 1000, source: "reviewed:current-rent" },
        range: { low: 1000, high: 1200, source: "reviewed:range" },
        comps: [{ address: "Comparable 1", rent: 1100, source: "reviewed:comps" }],
        ownerTerms: null,
      },
      destinations: {
        gmailDrafts: {
          href: "https://mail.google.com/mail/u/fixture-staff@pmikcmetro.com/#drafts",
          label: "Gmail Drafts folder",
        },
        lease: {
          href: "https://fixture.rentvine.invalid/leases/701",
          label: "Lease 701",
        },
        messages: {
          href: "https://fixture.rentvine.invalid/leases/701/messages",
          label: "Lease 701 messages",
        },
        owners: [
          {
            name: "Fixture Owner",
            record: {
              href: "https://fixture.rentvine.invalid/owners/9",
              label: "Owner 9",
            },
            messages: {
              href: "https://fixture.rentvine.invalid/owners/9/messages",
              label: "Owner 9 messages",
            },
          },
        ],
      },
      recipients: { status: "ready", to: "owner@fixture-rental.net", cc: [] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(owner)),
    );
    render(<RenewalMessagePreparation channel="owner" canEdit />);
    const copyGroup = await screen.findByRole("region", { name: "Copy the message" });
    expect(
      within(copyGroup).getByRole("button", { name: "Copy formatted body" }),
    ).toBeEnabled();
    expect(
      within(copyGroup).getByRole("link", { name: /Fixture Owner.*owner messages/i }),
    ).toHaveAttribute("href", "https://fixture.rentvine.invalid/owners/9/messages");
    expect(
      screen.getByRole("link", { name: "Open the Gmail Drafts folder" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Compose owner message in Communications" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.queryByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Open Gmail Drafts" })).toBeNull();
  });
});
