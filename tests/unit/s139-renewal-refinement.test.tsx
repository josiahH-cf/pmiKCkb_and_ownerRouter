// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";
import { STALE_REFINED_BODY_MESSAGE } from "@/lib/lease-renewal/refined-message";

// S139 on the renewal message preparation: "Refine with AI" works on the latest draft text,
// accepted wording is an ordinary unsaved edit that Save carries, a late or failed answer never
// replaces newer text, stale wording blocks the final body, and the drafted state shows the S140
// hint once. S139 duplicate disclosure: the app cannot replace an earlier Gmail draft.

vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: {
      cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
      termsRevision: 1,
      preparation: null,
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BASE_HASH = "c".repeat(64);
const signature = {
  name: "Fixture Staff",
  role: "PMI KC Metro",
  phone: null,
  hours: null,
  website: null,
  source: "reviewed:staff",
};

function ready(overrides: Record<string, unknown> = {}) {
  const empty = emptyMessagePreparationInputs();
  const inputs = {
    ...empty,
    signature,
    leaseOrigin: { kind: "pmi" as const, source: "reviewed:lease" },
    charges: empty.charges.map((charge) => ({
      ...charge,
      applicable: false,
      source: "reviewed:charges",
    })),
  };
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
    leaseOrigin: inputs.leaseOrigin,
    otherChargesComparison: null,
    informationForm: { url: "https://fixture-rental.net/form", source: "reviewed:form" },
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: { ...signature, email: "fixture-staff@pmikcmetro.com" },
    attachments: [],
  };
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
    saved: {
      revision: 2,
      inputs,
      signatureEmail: "fixture-staff@pmikcmetro.com",
      signatureActorUid: "fixture-staff",
    },
    inputs,
    facts,
    sourceFingerprint: "a".repeat(64),
    needsReview: false,
    signatureMatchesActor: true,
    signatureOrigin: { kind: "saved" },
    retainedSignature: null,
    chargeInventory: null,
    publication: { status: "approved" },
    notices: [],
    draftAttempt: null,
    bodyOverride: null,
    recipients: { status: "ready", to: "tenant@fixture.invalid", cc: [] },
    destinations: {
      gmailDrafts: {
        href: "https://mail.google.com/mail/u/?authuser=fixture-staff%40pmikcmetro.com#drafts",
        label: "Gmail Drafts",
      },
      lease: null,
      messages: null,
      owners: [],
    },
    ...overrides,
  };
}

type Handler = (url: string, init?: RequestInit) => unknown | Promise<unknown>;

function stubFetch(handlers: { get?: () => unknown; refine?: Handler; post?: Handler }) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    calls.push({ url, body });
    if (url.includes("/api/email-refinement")) {
      const value = await handlers.refine?.(url, init);
      return value instanceof Response ? value : Response.json(value);
    }
    if (init?.method === "POST") return Response.json(await handlers.post?.(url, init));
    return Response.json(handlers.get ? handlers.get() : ready());
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function revised(body: string) {
  return {
    status: "revised",
    body,
    requestedValues: [],
    removedValues: [],
    baseHash: BASE_HASH,
  };
}

async function refine(instruction: string) {
  fireEvent.change(screen.getByLabelText("Refine with AI"), {
    target: { value: instruction },
  });
  fireEvent.click(screen.getByRole("button", { name: "Refine wording" }));
}

const TEMPLATE = {
  ref: "tenant-renewal:v2.0",
  version: "v2.0",
  contentHash: "e".repeat(64),
  status: "approved",
};

describe("S139 renewal message refinement", () => {
  it("refines the latest draft twice, keeps manual edits, and never writes the instruction into the email", async () => {
    const first =
      "Hi Fixture Tenant,\n\nYour lease at 701 Fixture Lane ends on 12/31/2026.";
    const second = `${first}\n\nWe would love for you to stay.`;
    const replies = [
      revised(first),
      revised(second),
      revised(`${second}\n\nWarm regards.`),
    ];
    const calls = stubFetch({ refine: () => replies.shift() });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByLabelText("Refine with AI");
    const composed = (
      screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement
    ).value;

    await refine("Make this shorter");
    fireEvent.click(await screen.findByRole("button", { name: "Use this revision" }));
    expect(screen.getByLabelText("Refined email body")).toHaveValue(first);

    await refine("Make it warmer");
    fireEvent.click(await screen.findByRole("button", { name: "Use this revision" }));
    expect(screen.getByLabelText("Refined email body")).toHaveValue(second);

    const manual = `${second}\n\nSee you soon.`;
    fireEvent.change(screen.getByLabelText("Refined email body"), {
      target: { value: manual },
    });
    await refine("Add a sign-off");
    await screen.findByRole("button", { name: "Use this revision" });

    const bodies = calls
      .filter((call) => call.url.includes("/api/email-refinement"))
      .map((call) => call.body);
    expect(bodies.map((body) => body?.currentBody)).toEqual([composed, first, manual]);
    expect(bodies[0]).toMatchObject({
      surface: "renewal_message",
      leaseId: "701",
      channel: "tenant",
      instruction: "Make this shorter",
    });
    expect(screen.getByLabelText("tenant formatted body").textContent).not.toMatch(
      /Make this shorter|Make it warmer|Add a sign-off/,
    );
  });

  it("saves the accepted wording with the message and keeps it after the save", async () => {
    const refined = "Hi Fixture Tenant,\n\nYour renewal offer is ready.";
    const calls = stubFetch({
      refine: () => revised(refined),
      post: () =>
        ready({ bodyOverride: { state: "applied", text: refined, baseHash: BASE_HASH } }),
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByLabelText("Refine with AI");
    await refine("Shorten it");
    fireEvent.click(await screen.findByRole("button", { name: "Use this revision" }));
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() =>
      expect(calls.some((call) => call.body?.kind === "save")).toBe(true),
    );
    const save = calls.find((call) => call.body?.kind === "save")!.body!;
    expect(save.bodyOverride).toEqual({ text: refined, baseHash: BASE_HASH });
    await waitFor(() =>
      expect(screen.getByLabelText("Refined email body")).toHaveValue(refined),
    );
  });

  it("never replaces newer edits with a late answer and keeps the draft when the assistant fails", async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const replies: Array<unknown> = [revised("Refined once."), pending];
    stubFetch({ refine: () => replies.shift() });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByLabelText("Refine with AI");
    await refine("Shorten it");
    fireEvent.click(await screen.findByRole("button", { name: "Use this revision" }));

    await refine("Shorten it more");
    fireEvent.change(screen.getByLabelText("Refined email body"), {
      target: { value: "Refined once. Plus my own sentence." },
    });
    release(revised("A late answer."));
    expect(
      await screen.findByText(/changed while this revision was prepared/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Refined email body")).toHaveValue(
      "Refined once. Plus my own sentence.",
    );
    expect(screen.queryByRole("button", { name: "Use this revision" })).toBeNull();
  });

  it("reports an unavailable assistant without touching the draft", async () => {
    stubFetch({
      refine: () => ({
        status: "unavailable",
        reason:
          "The wording assistant did not answer just now. Your draft is unchanged; try again.",
      }),
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByLabelText("Refine with AI");
    const before = (
      screen.getByLabelText("tenant plain text body") as HTMLTextAreaElement
    ).value;
    await refine("Make this shorter");
    expect(await screen.findByText(/did not answer just now/)).toBeInTheDocument();
    expect(screen.getByLabelText("tenant plain text body")).toHaveValue(before);
    expect(screen.queryByLabelText("Refined email body")).toBeNull();
  });

  it("blocks stale saved wording, keeps it for reference, and returns to the standard wording", async () => {
    const calls = stubFetch({
      get: () =>
        ready({
          bodyOverride: {
            state: "stale",
            text: "Older refined wording.",
            baseHash: BASE_HASH,
          },
        }),
      post: () => ready(),
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    expect(await screen.findByText(STALE_REFINED_BODY_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("Older refined wording.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy plain text" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Return to the standard wording" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.body?.kind === "save")?.body?.bodyOverride,
      ).toBeNull(),
    );
  });

  it("discloses an earlier Gmail draft before creating another and shows the Gemini hint once", async () => {
    const preview = {
      status: "preview",
      channel: "tenant",
      executionId: `exec_${"b".repeat(40)}`,
      previewHash: "d".repeat(64),
      recipient: { to: "tenant@fixture.invalid", sourceRef: "rentvine:lease:701" },
      subject: "Lease Renewal for 701 Fixture Lane",
      body: "Draft body",
      template: TEMPLATE,
    };
    const created = {
      status: "created",
      channel: "tenant",
      recipient: preview.recipient,
      subject: preview.subject,
      executionId: preview.executionId,
      draftId: "draft-9",
      template: TEMPLATE,
    };
    stubFetch({
      get: () =>
        ready({
          draftAttempt: {
            executionId: `exec_${"a".repeat(40)}`,
            state: "Succeeded",
            recoveryAvailable: true,
            outcome: {
              ...created,
              executionId: `exec_${"a".repeat(40)}`,
              draftId: "draft-1",
            },
          },
        }),
      post: (_url, init) =>
        (JSON.parse(String(init?.body)) as { confirm?: unknown }).confirm
          ? created
          : preview,
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    await screen.findByRole("button", { name: "Preview unsent Gmail draft" });
    // The earlier created attempt is the current drafted state: one hint.
    expect(
      screen.getAllByText(
        "Draft ready. For another wording pass, try Gemini in Gmail, where available.",
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Preview unsent Gmail draft" }));
    expect(await screen.findByRole("note")).toHaveTextContent(
      /second, separate unsent draft/,
    );
    expect(
      screen.queryByText(
        "Draft ready. For another wording pass, try Gemini in Gmail, where available.",
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review creation confirmation" }));
    fireEvent.click(screen.getByRole("button", { name: "Create this unsent draft" }));
    await waitFor(() =>
      expect(
        screen.getAllByText(
          "Draft ready. For another wording pass, try Gemini in Gmail, where available.",
        ),
      ).toHaveLength(1),
    );
    expect(screen.getByLabelText("tenant formatted body").textContent).not.toMatch(
      /Gemini/,
    );
  });
});
