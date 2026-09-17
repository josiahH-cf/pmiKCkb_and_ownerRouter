// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
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
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";

// S120 (R120.2, R120.4, R120.5, R120.6): the mounted preparation routes each missing input to its
// own control, refuses to put an unfinished body on the clipboard, fills known facts with a visible
// origin, explains the response-request paragraph and keeps destinations beside their action.

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
    needsReview: true,
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
    needsReview: false,
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

describe("S120 mounted message preparation", () => {
  it("AC-S120-4: guarded final-body copy exposes the actual missing items instead of putting an unfinished body on the clipboard", async () => {
    const clip = clipboard();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(unfinishedTenant())),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const formatted = await screen.findByRole("button", { name: "Copy formatted body" });
    const plain = screen.getByRole("button", { name: "Copy plain text" });
    for (const button of [formatted, plain]) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      // A reachable explanation: the button is still focusable and describes the gate.
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("aria-describedby");
      const explanation = document.getElementById(
        button.getAttribute("aria-describedby")!,
      );
      expect(explanation).toHaveTextContent(/inputs remain/i);
    }
    // The subject stays individually copyable; unrelated body fields do not gate it.
    expect(screen.getByRole("button", { name: "Copy subject" })).not.toHaveAttribute(
      "aria-disabled",
    );
    fireEvent.click(formatted);
    fireEvent.click(plain);
    expect(clip.write).not.toHaveBeenCalled();
    expect(clip.writeText).not.toHaveBeenCalled();
    const readiness = screen.getByRole("list", { name: "Missing inputs" });
    expect(readiness.closest("details")).toHaveAttribute("open");
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
    // The signature gap routes to the sender signature control and a lease-origin gap to its select.
    const origin = within(readiness).getByRole("link", { name: /lease origin/i });
    fireEvent.click(origin);
    await waitFor(() =>
      expect(screen.getByLabelText("Current lease origin")).toHaveFocus(),
    );
    expect(
      screen.getByLabelText("Current lease origin").closest("details"),
    ).toHaveAttribute("open");
    // The unfinished preview is labeled and the selectable plain-text export is not offered.
    expect(screen.getByText(/Unfinished preview/)).toBeInTheDocument();
    expect(screen.queryByLabelText("tenant plain text body")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Review missing inputs" }),
    ).toBeInTheDocument();
  });

  it("AC-S120-4: resolving the gaps recomputes readiness so copy works locally even while Gmail and recipients stay blocked", async () => {
    const clip = clipboard();
    let current: ReturnType<typeof unfinishedTenant> | ReturnType<typeof readyTenant> =
      unfinishedTenant();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(current)),
    );
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    current = readyTenant();
    manual.revision++;
    mounted.rerender(<RenewalMessagePreparation channel="tenant" canEdit />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy plain text" })).not.toHaveAttribute(
        "aria-disabled",
      ),
    );
    expect(screen.queryByRole("list", { name: "Missing inputs" })).toBeNull();
    expect(screen.getByText(/Ready for final copy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledTimes(1));
    expect(String(clip.writeText.mock.calls[0][0])).toContain("$1,100.00");
    expect(String(clip.writeText.mock.calls[0][0])).not.toContain("{{");
    expect(screen.getByText(/Body copied/)).toHaveTextContent(/Nothing was sent/);
    // Gmail transport remains its own gate: unpublished template and blocked recipients keep the
    // draft unavailable without blocking local copy.
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy recipients" })).toBeDisabled();
    expect(screen.getByLabelText("tenant plain text body")).toBeInTheDocument();
  });

  it("AC-S120-4: a denied clipboard keeps the selectable fallback only for a ready body", async () => {
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
    await screen.findByText(/Clipboard access was denied/);
    expect(
      (screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement).value,
    ).toEqual(expect.stringContaining("$1,100.00"));
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(prefilled)),
    );
    const mounted = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    expect(screen.getByLabelText("Sender name")).toHaveValue("Fixture Staff");
    const origin = screen.getByTestId("renewal-message-signature-origin");
    expect(origin).toHaveTextContent(/retained sender signature/i);
    expect(
      screen.queryByRole("list", { name: "Missing inputs" })?.textContent ?? "",
    ).not.toMatch(/signature/i);
    // Filling never claims review: the review item remains until the operator saves.
    expect(
      screen.getByRole("checkbox", { name: /I reviewed these inputs/ }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Copy plain text" })).toHaveAttribute(
      "aria-disabled",
      "true",
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(other)),
    );
    mounted.unmount();
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    expect(screen.getByLabelText("Sender name")).toHaveValue("Other Staff");
    expect(screen.getByRole("button", { name: "Copy plain text" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const readiness = screen.getByRole("list", { name: "Missing inputs" });
    expect(readiness).toHaveTextContent(/signed-in managed sender/i);
    fireEvent.click(screen.getByRole("button", { name: "Use my retained signature" }));
    expect(screen.getByLabelText("Sender name")).toHaveValue("Fixture Staff");
    expect(
      screen.getByRole("checkbox", { name: /I reviewed these inputs/ }),
    ).not.toBeChecked();
  });

  it("AC-S120-2: a current RentVine recurring charge fills a charge deliberately with its source and leaves the comparison to a person", async () => {
    const withInventory = {
      ...unfinishedTenant(),
      chargeInventory: [
        {
          id: "rc-77",
          label: "Pet Rent",
          amount: 25,
          frequency: 1,
          startDate: "2026-01-01",
          current: true,
          sourceRef: "rentvine:lease:701:recurring-charge:rc-77",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(withInventory)),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Copy formatted body" });
    const petSummary = screen.getByText(/^Pet rent ·/);
    const pet = petSummary.closest("details")!;
    act(() => {
      pet.open = true;
    });
    const fill = within(pet).getByLabelText("Fill from a current RentVine charge");
    fireEvent.change(fill, { target: { value: "rc-77" } });
    expect(within(pet).getByLabelText("Does this charge apply?")).toHaveValue("true");
    expect(within(pet).getByLabelText("Charge amount ($)")).toHaveValue(25);
    expect(within(pet).getByLabelText("How often is it charged?")).toHaveValue("monthly");
    expect(within(pet).getByLabelText("Charge start date")).toHaveValue("2026-01-01");
    expect(
      (within(pet).getByLabelText("Charge source") as HTMLInputElement).value,
    ).toEqual(expect.stringContaining("rc-77"));
    expect(within(pet).getByLabelText("Compared with current charges")).toHaveValue(
      "unverified",
    );
    expect(
      within(pet).getByTestId("renewal-message-charge-origin-pet"),
    ).toHaveTextContent(/RentVine recurring charge/i);
  });

  it("AC-S120-4 adversarial: refused prose in the wording field blocks final copy with a routed content item and no clipboard write, and clearing it restores readiness", async () => {
    // A ready body plus an edit that smuggles an amount into free prose: the composer refuses it,
    // the readiness lists the refusal with its route, both body exports are guarded, and the
    // guard opens the list instead of copying a stale body.
    const clip = clipboard();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(readyTenant())),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const field = await screen.findByLabelText(
      "Response request (optional wording edit)",
    );
    expect(screen.getByRole("button", { name: "Copy plain text" })).not.toHaveAttribute(
      "aria-disabled",
    );
    fireEvent.change(field, { target: { value: "Rent is $1,300 from next January." } });
    expect(screen.getByRole("alert")).toHaveTextContent(/labeled fact fields/i);
    const plain = screen.getByRole("button", { name: "Copy plain text" });
    expect(plain).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(plain);
    fireEvent.click(screen.getByRole("button", { name: "Copy formatted body" }));
    expect(clip.writeText).not.toHaveBeenCalled();
    expect(clip.write).not.toHaveBeenCalled();
    const readiness = screen.getByRole("list", { name: "Missing inputs" });
    expect(readiness).toHaveTextContent(/labeled fact fields/i);
    expect(
      within(readiness).getByRole("link", { name: "Message inputs" }),
    ).toHaveAttribute("href", "#renewal-message-tenant-inputs");
    expect(screen.getByRole("button", { name: "Save edits" })).toBeDisabled();
    // Clearing the refused prose leaves unsaved edits: the body is composed again but final copy
    // waits for the save and review, exactly as the readiness says.
    fireEvent.change(field, { target: { value: "" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("list", { name: "Missing inputs" })).toHaveTextContent(
      /Save your edits/,
    );
    expect(screen.getByRole("button", { name: "Copy plain text" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(clip.writeText).not.toHaveBeenCalled();
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
    const draftGroup = screen.getByRole("region", { name: "Unsent Gmail draft" });
    expect(
      within(draftGroup).getByRole("link", { name: "Open the Gmail Drafts folder" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      within(draftGroup).getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Gmail Drafts" })).toBeNull();
  });
});
