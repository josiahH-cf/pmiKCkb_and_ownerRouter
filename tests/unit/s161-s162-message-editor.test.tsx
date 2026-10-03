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
import {
  composeRenewalMessage,
  missingValueMarker,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";

// S161/S162/S163 on the mounted message card: the subject and body are directly editable with
// whatever is known, edits save by themselves, copy uses exactly what is on screen whatever the
// save is doing, and the deliberate unsent-draft step persists and binds what is displayed. The
// lease below has no work record at all (no cycle). Every value is synthetic.

const manual = vi.hoisted(() => ({
  state: null as null | Record<string, unknown>,
}));
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({ leaseId: "8800", state: manual.state }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  manual.state = null;
});

const cycleId = "6c37bdcd-8264-4249-813f-0289307dd725";
const EXECUTION_ONE = `exec_${"a".repeat(40)}`;
const EXECUTION_TWO = `exec_${"b".repeat(40)}`;

function tenantFacts(overrides: Partial<RenewalMessageFacts> = {}): RenewalMessageFacts {
  return {
    channel: "tenant",
    names: ["Jordan Sampleton", "Riley Q Sampleton"],
    firstNames: ["Jordan", null],
    address: "88 Sample Row",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: null,
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: emptyMessagePreparationInputs().charges,
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
    ...overrides,
  };
}

function preparation(overrides: Record<string, unknown> = {}) {
  return {
    senderEmail: "sample.op@pmikcmetro.com",
    cycleId: null,
    saved: null,
    inputs: emptyMessagePreparationInputs(),
    facts: tenantFacts(),
    sourceFingerprint: "a".repeat(64),
    bodyBaseHash: "b".repeat(64),
    bodyOverride: null,
    subjectOverride: null,
    signatureMatchesActor: false,
    signatureOrigin: { kind: "none" },
    retainedSignature: null,
    chargeInventory: null,
    publication: { status: "approved", ref: "tenant-renewal:v2.0" },
    notices: [],
    policyGates: [],
    draftAttempt: null,
    previousDraftAttempts: [],
    recipients: {
      status: "ready",
      to: "jordan.s@fixture-rental.net",
      cc: ["riley.s@fixture-rental.net"],
    },
    destinations: {
      gmailDrafts: {
        href: "https://mail.google.com/mail/u/sample.op@pmikcmetro.com/#drafts",
        label: "Gmail Drafts for sample.op@pmikcmetro.com",
      },
      lease: {
        href: "https://fixture.rentvine.invalid/leases/8800",
        label: "Lease 8800",
      },
      messages: {
        href: "https://fixture.rentvine.invalid/leases/8800/messages",
        label: "Lease 8800 messages",
      },
      owners: [],
    },
    ...overrides,
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

/** A fetch double that records every request and answers POSTs through `respond`. */
function server(
  initial: Record<string, unknown>,
  respond: (body: Record<string, unknown>, calls: Call[]) => Response | Promise<Response>,
) {
  const calls: Call[] = [];
  let current = initial;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    calls.push({ url, method, body });
    if (method === "GET") return Response.json(current);
    return respond(body!, calls);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    posts: () => calls.filter((call) => call.method === "POST"),
    setCurrent(next: Record<string, unknown>) {
      current = next;
    },
  };
}

function savedResponse(
  body: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return Response.json({
    duplicate: false,
    ...preparation({
      cycleId,
      inputs: body.inputs,
      saved: {
        revision: Number(body.expectedRevision) + 1,
        inputs: body.inputs,
        signatureEmail: null,
        signatureActorUid: null,
      },
      bodyOverride: body.bodyOverride
        ? { state: "applied", ...(body.bodyOverride as object) }
        : null,
      subjectOverride: body.subjectOverride ?? null,
      ...extra,
    }),
  });
}

const composed = () => composeRenewalMessage(tenantFacts());

describe("S161 editable message with missing information", () => {
  it("BEH-S161-3, BEH-S161-4, BEH-S161-5, AC-S161-1, BEH-S162-5: with no work record and several values absent, the subject and body are editable, the gaps are named, and no cycle, review or save step is asked for", async () => {
    server(preparation(), () => Response.json({}));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const subject = (await screen.findByLabelText("Subject")) as HTMLInputElement;
    const body = screen.getByLabelText("Email body") as HTMLTextAreaElement;
    expect(subject).not.toHaveAttribute("readonly");
    expect(subject.value).toBe("Lease Renewal for 88 Sample Row");
    expect(body).not.toHaveAttribute("readonly");
    expect(body.value).toBe(composed().plainText);
    expect(body.value).toContain(missingValueMarker("renewal rent"));
    // S163: the greeting uses the recorded first name and leaves out the person without one.
    expect(body.value.startsWith("Hello Jordan,")).toBe(true);
    const callout = document.getElementById("renewal-message-tenant-readiness")!;
    expect(callout).toHaveTextContent(/marked in this message/i);
    expect(callout).toHaveTextContent("The renewal rent is not entered yet.");
    expect(callout).toHaveTextContent(
      "No first name is recorded for Riley Q Sampleton, so the greeting leaves that name out.",
    );
    const card = screen.getByRole("region", { name: "Tenant message preparation" });
    expect(card).not.toHaveTextContent(/renewal cycle/i);
    expect(card).not.toHaveTextContent(/cannot be copied/i);
    expect(
      screen.queryByLabelText(/I reviewed these inputs and the current source facts/i),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Save (edits|reviewed preparation)/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Review missing inputs" })).toBeNull();
    for (const name of ["Copy subject", "Copy formatted body", "Copy plain text"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled");
    }
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeEnabled();
  });

  it("BEH-S161-10: the source, message and Gmail destinations stay beside the message", async () => {
    server(preparation(), () => Response.json({}));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    expect(
      await screen.findByRole("link", { name: "Open lease messages in RentVine" }),
    ).toHaveAttribute("href", "https://fixture.rentvine.invalid/leases/8800/messages");
    expect(
      screen.getByRole("link", { name: "Open lease record in RentVine" }),
    ).toHaveAttribute("href", "https://fixture.rentvine.invalid/leases/8800");
    expect(
      screen.getByRole("link", { name: "Open the Gmail Drafts folder" }),
    ).toHaveAttribute("href", expect.stringContaining("#drafts"));
  });

  it("BEH-S161-7, ARCH-S161-2, BEH-S163-6, AC-S163-3: an edited greeting and subject save by themselves with no cycle, and stay exactly as written when the facts refresh", async () => {
    const api = server(preparation(), (body) => savedResponse(body));
    const view = render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    const edited = body.value.replace("Hello Jordan,", "Hi Jordan and Riley,");
    fireEvent.change(body, { target: { value: edited } });
    fireEvent.blur(body);
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    const save = api.posts()[0]!.body!;
    expect(save.kind).toBe("save");
    expect(save.cycleId).toBeUndefined();
    expect(save.reviewed).toBeUndefined();
    expect(save.expectedRevision).toBe(0);
    expect(save.bodyOverride).toEqual({ text: edited, baseHash: "b".repeat(64) });
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    const subject = screen.getByLabelText("Subject") as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Your renewal at 88 Sample Row" } });
    fireEvent.blur(subject);
    await waitFor(() => expect(api.posts()).toHaveLength(2));
    expect(api.posts()[1]!.body).toMatchObject({
      kind: "save",
      expectedRevision: 1,
      subjectOverride: "Your renewal at 88 Sample Row",
      bodyOverride: { text: edited },
    });
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    // The lease facts refresh: a second tenant first name and working terms arrive.
    api.setCurrent(
      preparation({
        cycleId,
        facts: tenantFacts({
          firstNames: ["Jordan", "Casey"],
          ownerTerms: {
            rent: 1525,
            effectiveDate: "2027-01-01",
            endDate: "2027-12-31",
            source: "Working renewal terms",
          },
        }),
        saved: {
          revision: 2,
          inputs: emptyMessagePreparationInputs(),
          signatureEmail: null,
          signatureActorUid: null,
        },
        bodyOverride: { state: "stale", text: edited, baseHash: "b".repeat(64) },
        subjectOverride: "Your renewal at 88 Sample Row",
        bodyBaseHash: "c".repeat(64),
      }),
    );
    manual.state = { cycleId, revision: 1, termsRevision: 1, preparation: null };
    view.rerender(<RenewalMessagePreparation channel="tenant" canEdit />);
    await waitFor(() =>
      expect(api.calls.filter((call) => call.method === "GET").length).toBeGreaterThan(1),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Your wording is kept exactly as written/i),
      ).toBeInTheDocument(),
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toBe(
      edited,
    );
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe(
      "Your renewal at 88 Sample Row",
    );
    expect(api.posts()).toHaveLength(2);
    // Returning to the standard wording is deliberate, and then uses the current information.
    fireEvent.click(
      screen.getByRole("button", { name: "Return to the standard wording" }),
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toContain(
      "Hello Jordan and Casey,",
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toContain(
      "Rent: $1,525.00 per month",
    );
  });

  it("S155 conventions: a failed save keeps the wording, says so, and Try again repeats the same operation", async () => {
    let attempt = 0;
    const api = server(preparation(), (body) => {
      attempt += 1;
      return attempt === 1
        ? Response.json({ error: "The save could not be completed." }, { status: 500 })
        : savedResponse(body);
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    const edited = `${body.value}\n\nThank you for renting with us.`;
    fireEvent.change(body, { target: { value: edited } });
    fireEvent.blur(body);
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="failed"]')).not.toBeNull(),
    );
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toBe(
      edited,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(api.posts()).toHaveLength(2));
    expect(api.posts()[1]!.body!.operationId).toBe(api.posts()[0]!.body!.operationId);
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    );
  });

  it("BEH-S161-13, BEH-S161-11, AC-S161-3: editing, copying and previewing make no model call and no paid lookup", async () => {
    const clip = clipboard();
    const api = server(preparation(), (body) =>
      body.kind === "save"
        ? savedResponse(body)
        : Response.json({
            status: "blocked",
            channel: "tenant",
            reasons: ["Sample refusal."],
          }),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: `${body.value}\n\nSee you soon.` } });
    fireEvent.blur(body);
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledTimes(1));
    expect(
      api.calls.some((call) => /email-refinement|market|rentcast|comp/i.test(call.url)),
    ).toBe(false);
  });
});

describe("S162 copy exactly what is displayed", () => {
  it("BEH-S162-1, BEH-S162-2, AC-S162-1: plain, formatted and subject copy carry the current edits and markers with nothing saved or reviewed", async () => {
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
    // The save never answers: copy must not wait for it.
    const api = server(preparation(), () => new Promise<Response>(() => undefined));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    const edited = body.value.replace("Hello Jordan,", "Hi Jordan and Riley,");
    fireEvent.change(body, { target: { value: edited } });
    fireEvent.blur(body);
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(document.querySelector('[data-autosave="saving"]')).not.toBeNull();
    // BEH-S162-3: the copy controls stay usable while the save is still pending.
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledWith(edited));
    expect(edited).toContain(missingValueMarker("renewal rent"));
    fireEvent.click(screen.getByRole("button", { name: "Copy formatted body" }));
    await waitFor(() => expect(clip.write).toHaveBeenCalledTimes(1));
    expect(await captured[0]!["text/plain"]!.text()).toBe(edited);
    const html = await captured[0]!["text/html"]!.text();
    expect(html).toContain("Hi Jordan and Riley,");
    expect(html).toContain("[Needs Verification: renewal rent]");
    const subject = screen.getByLabelText("Subject") as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Your renewal at 88 Sample Row" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy subject" }));
    await waitFor(() =>
      expect(clip.writeText).toHaveBeenCalledWith("Your renewal at 88 Sample Row"),
    );
  });

  it("BEH-S162-3, AC-S162-1, ARCH-S162-1: a failed save neither disables copy nor changes what is copied", async () => {
    const clip = clipboard();
    server(preparation(), () =>
      Response.json({ error: "The save could not be completed." }, { status: 500 }),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    const edited = `${body.value}\n\nPlease call the office with questions.`;
    fireEvent.change(body, { target: { value: edited } });
    fireEvent.blur(body);
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="failed"]')).not.toBeNull(),
    );
    const plain = screen.getByRole("button", { name: "Copy plain text" });
    expect(plain).toBeEnabled();
    fireEvent.click(plain);
    await waitFor(() => expect(clip.writeText).toHaveBeenCalledWith(edited));
  });

  it("a read-only viewer still copies the displayed message", async () => {
    const clip = clipboard();
    const api = server(preparation(), () => Response.json({}));
    render(<RenewalMessagePreparation channel="tenant" canEdit={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy plain text" }));
    await waitFor(() =>
      expect(clip.writeText).toHaveBeenCalledWith(composed().plainText),
    );
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    expect(api.posts()).toHaveLength(0);
  });
});

const createdOutcome = {
  status: "created",
  channel: "tenant",
  recipient: {
    to: "jordan.s@fixture-rental.net",
    sourceRef: "rentvine:lease:8800:tenants[0].email",
    cc: ["riley.s@fixture-rental.net"],
  },
  subject: "Lease Renewal for 88 Sample Row",
  draftId: "draft-sample-1",
  template: {
    ref: "tenant-renewal:v2.0",
    version: "v2.0",
    contentHash: "a".repeat(64),
    status: "approved",
  },
};

describe("S162 unsent Gmail draft from the displayed message", () => {
  const previewOutcome = (subject: string, body: string) => ({
    status: "preview",
    channel: "tenant",
    recipient: {
      to: "jordan.s@fixture-rental.net",
      sourceRef: "rentvine:lease:8800:tenants[0].email",
      cc: ["riley.s@fixture-rental.net"],
    },
    subject,
    body: `Draft — Review before sending\n\n${body}`,
    executionId: EXECUTION_ONE,
    previewHash: "d".repeat(64),
    template: {
      ref: "tenant-renewal:v2.0",
      version: "v2.0",
      contentHash: "a".repeat(64),
      status: "approved",
    },
  });

  it("BEH-S162-4, BEH-S162-6, BEH-S162-7, BEH-S162-8, AC-S162-2: one explicit action saves the displayed message, binds it, and shows the exact mailbox, To, Cc and content to confirm, with a reminder and no checkbox", async () => {
    let edited = "";
    const api = server(preparation(), (body) => {
      if (body.kind === "draft" && !body.confirm)
        return Response.json(previewOutcome("Lease Renewal for 88 Sample Row", edited));
      if (body.kind === "draft")
        return Response.json({
          ...createdOutcome,
          executionId: EXECUTION_ONE,
        });
      return savedResponse(body);
    });
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    edited = body.value.replace("Hello Jordan,", "Hi Jordan and Riley,");
    // The edit is still in the control (no blur, nothing saved) when the draft is requested.
    fireEvent.change(body, { target: { value: edited } });
    fireEvent.click(screen.getByRole("button", { name: "Preview unsent Gmail draft" }));
    await waitFor(() =>
      expect(api.posts().some((call) => call.body!.kind === "draft")).toBe(true),
    );
    const request = api.posts().find((call) => call.body!.kind === "draft")!.body!;
    expect(request.displayed).toEqual({
      subject: "Lease Renewal for 88 Sample Row",
      body: edited,
    });
    expect(request.save).toMatchObject({
      expectedRevision: 0,
      bodyOverride: { text: edited },
    });
    const section = screen.getByRole("region", { name: "Unsent Gmail draft" });
    await waitFor(() =>
      expect(section).toHaveTextContent("From sample.op@pmikcmetro.com"),
    );
    expect(section).toHaveTextContent("To jordan.s@fixture-rental.net");
    expect(section).toHaveTextContent("Cc riley.s@fixture-rental.net");
    expect(section).toHaveTextContent("Hi Jordan and Riley,");
    expect(section).toHaveTextContent("[Needs Verification: renewal rent]");
    fireEvent.click(screen.getByRole("button", { name: "Review creation confirmation" }));
    const confirm = screen.getByRole("group", { name: "Confirm exact unsent draft" });
    expect(confirm).toHaveTextContent(/review it in Gmail before you send it/i);
    expect(within(confirm).queryByRole("checkbox")).toBeNull();
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Create this unsent draft" }),
    );
    await waitFor(() =>
      expect(api.posts().some((call) => Boolean(call.body!.confirm))).toBe(true),
    );
    expect(api.posts().find((call) => call.body!.confirm)!.body).toMatchObject({
      kind: "draft",
      confirm: { executionId: EXECUTION_ONE, previewHash: "d".repeat(64) },
    });
    // BEH-S162-12: the actual Drafts destination is shown; a person sends from Gmail.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Open the Drafts folder to find this draft" }),
      ).toHaveAttribute("href", expect.stringContaining("#drafts")),
    );
    expect(section).toHaveTextContent("A person sends from Gmail.");
    // Every request is a save, a preview or an exact confirmation of that preview; none sends.
    expect(
      api
        .posts()
        .every(
          (call) =>
            ["save", "draft"].includes(String(call.body!.kind)) &&
            !("send" in call.body!),
        ),
    ).toBe(true);
  });

  it("BEH-S162-7: when the needed save fails inside the draft action, the failure is reported and no preview appears", async () => {
    const api = server(preparation(), () =>
      Response.json(
        {
          error:
            "The message could not be saved, so no draft was prepared. Your wording is kept on screen.",
          code: "message_save_failed",
          providerCallAttempted: false,
        },
        { status: 409 },
      ),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    const edited = `${body.value}\n\nOne more line.`;
    fireEvent.change(body, { target: { value: edited } });
    fireEvent.click(screen.getByRole("button", { name: "Preview unsent Gmail draft" }));
    await waitFor(() =>
      expect(
        screen.getByText(/could not be saved, so no draft was prepared/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Review creation confirmation" }),
    ).toBeNull();
    expect((screen.getByLabelText("Email body") as HTMLTextAreaElement).value).toBe(
      edited,
    );
    expect(api.posts()).toHaveLength(1);
  });

  it("BEH-S162-9: an unknown recipient refuses only the draft; editing and copy continue", async () => {
    const clip = clipboard();
    server(
      preparation({
        recipients: { status: "blocked", reasons: ["Tenant 2 has no email on file."] },
      }),
      (body) =>
        body.kind === "draft"
          ? Response.json({
              status: "blocked",
              channel: "tenant",
              reasons: ["Tenant 2 has no email on file."],
            })
          : savedResponse(body),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: "Preview unsent Gmail draft" }));
    await waitFor(() =>
      expect(
        screen.getAllByText("Tenant 2 has no email on file.").length,
      ).toBeGreaterThan(0),
    );
    fireEvent.change(body, { target: { value: `${body.value}\n\nStill editable.` } });
    fireEvent.click(screen.getByRole("button", { name: "Copy plain text" }));
    await waitFor(() =>
      expect(clip.writeText).toHaveBeenCalledWith(
        `${composed().plainText}\n\nStill editable.`,
      ),
    );
  });

  it("BEH-S162-10, AC-S162-3: a lost create response is recovered as the same attempt, never created again", async () => {
    const api = server(
      preparation({
        cycleId,
        saved: {
          revision: 1,
          inputs: emptyMessagePreparationInputs(),
          signatureEmail: null,
          signatureActorUid: null,
        },
      }),
      (body) => {
        if (body.kind !== "draft") return savedResponse(body);
        if (body.reconcile)
          return Response.json({
            status: "reconciliation",
            channel: "tenant",
            executionId: EXECUTION_ONE,
            resolution: "created",
            duplicate: false,
            draftId: "draft-sample-1",
            reason:
              "The exact unsent Gmail draft was found and the execution is reconciled.",
          });
        if (body.confirm) throw new TypeError("network lost");
        return Response.json(
          previewOutcome("Lease Renewal for 88 Sample Row", composed().plainText),
        );
      },
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Preview unsent Gmail draft" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Review creation confirmation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create this unsent draft" }));
    const recover = await screen.findByRole("button", {
      name: "Recover exact Gmail attempt",
    });
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    fireEvent.click(recover);
    await waitFor(() =>
      expect(api.posts().some((call) => Boolean(call.body!.reconcile))).toBe(true),
    );
    expect(api.posts().find((call) => call.body!.reconcile)!.body).toMatchObject({
      reconcile: { executionId: EXECUTION_ONE },
    });
    expect(api.posts().filter((call) => call.body!.confirm)).toHaveLength(1);
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Open the Drafts folder to find this draft" }),
      ).toBeInTheDocument(),
    );
  });

  it("BEH-S162-11, AC-S162-3: an edit after creation only autosaves; a new preview discloses a second, separate draft", async () => {
    const created = { ...createdOutcome, executionId: EXECUTION_ONE };
    const api = server(
      preparation({
        cycleId,
        saved: {
          revision: 1,
          inputs: emptyMessagePreparationInputs(),
          signatureEmail: null,
          signatureActorUid: null,
        },
        draftAttempt: {
          executionId: EXECUTION_ONE,
          state: "Succeeded",
          recoveryAvailable: true,
          outcome: created,
        },
      }),
      (body) =>
        body.kind === "draft"
          ? Response.json({
              ...previewOutcome("Lease Renewal for 88 Sample Row", "Edited later."),
              executionId: EXECUTION_TWO,
            })
          : savedResponse(body, {
              draftAttempt: {
                executionId: EXECUTION_ONE,
                state: "Succeeded",
                recoveryAvailable: true,
                outcome: created,
              },
            }),
    );
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const body = (await screen.findByLabelText("Email body")) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: `${body.value}\n\nEdited later.` } });
    fireEvent.blur(body);
    await waitFor(() => expect(api.posts()).toHaveLength(1));
    expect(api.posts()[0]!.body!.kind).toBe("save");
    await waitFor(() =>
      expect(document.querySelector('[data-autosave="saved"]')).not.toBeNull(),
    );
    expect(api.posts().some((call) => call.body!.kind === "draft")).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Preview unsent Gmail draft" }));
    });
    expect(await screen.findByRole("note")).toHaveTextContent(
      /second, separate unsent draft/i,
    );
  });
});
