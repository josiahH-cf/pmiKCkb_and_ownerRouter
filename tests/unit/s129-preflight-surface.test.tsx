// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";

// S129 (F09, R-F09-07): the mounted preparation shows the meeting preflight from the same facts
// and readiness it uses, proceeds through preparation with Gmail unavailable, keeps the unsent-draft
// step pending, and never requests a draft on its own. Values are synthetic; fetch is stubbed.

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

const signature = {
  name: "Fixture Staff",
  role: "PMI KC Metro",
  phone: null,
  hours: null,
  website: null,
  source: "reviewed:staff",
};
const SENDER = "fixture-staff@pmikcmetro.com";

function preparation(options: { ready: boolean; gmail: boolean; policyGate?: boolean }) {
  const base = emptyMessagePreparationInputs();
  const inputs = options.ready
    ? {
        ...base,
        signature,
        leaseOrigin: { kind: "pmi" as const, source: "reviewed:lease" },
        charges: base.charges.map((charge) => ({
          ...charge,
          applicable: false,
          source: "reviewed:charges",
        })),
      }
    : base;
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
    informationForm: options.ready
      ? { url: "https://fixture-rental.net/form", source: "reviewed:form" }
      : null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: options.ready ? { ...signature, email: SENDER } : null,
    attachments: [],
  };
  return {
    senderEmail: SENDER,
    cycleId: "6c37bdcd-8264-4249-813f-0289307dd725",
    saved: options.ready
      ? {
          revision: 2,
          inputs,
          signatureEmail: SENDER,
          signatureActorUid: "fixture-staff",
        }
      : null,
    inputs,
    facts,
    sourceFingerprint: "a".repeat(64),
    needsReview: !options.ready,
    signatureMatchesActor: options.ready,
    signatureOrigin: { kind: options.ready ? "saved" : "none" },
    retainedSignature: null,
    chargeInventory: null,
    publication: options.gmail
      ? { status: "approved", ref: "supplied:tenant:v2" }
      : { status: "unpublished", reason: "Exact publication pending." },
    notices: [],
    draftAttempt: null,
    recipients: { status: "ready", to: "tenant@fixture.invalid", cc: [] },
    destinations: {
      gmailDrafts: options.gmail
        ? { href: "https://mail.google.com/mail/u/0/#drafts", label: "Gmail Drafts" }
        : null,
      lease: { href: "https://fixture.rentvine.invalid/leases/701", label: "Lease 701" },
      messages: {
        href: "https://fixture.rentvine.invalid/leases/701/messages",
        label: "Lease 701 messages",
      },
      owners: [],
    },
    ...(options.policyGate
      ? {
          policyGates: [
            {
              field: "policy.rhino",
              message:
                "Review whether the Rhino policy applies to this lease before final use.",
            },
          ],
        }
      : {}),
  };
}

function stubFetch(payload: unknown) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(url).split("?")[0]}`);
      return Response.json(payload);
    }),
  );
  return calls;
}

describe("S129 mounted meeting preflight (AC-S129-3, AC-S129-7)", () => {
  it("proceeds through a reviewed preparation with Gmail unavailable and keeps the draft step pending, requesting no draft", async () => {
    const calls = stubFetch(preparation({ ready: true, gmail: false }));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const details = await screen.findByText(/Meeting preflight:/);
    const panel = details.closest("details")!;
    expect(panel).toHaveAttribute("id", "renewal-message-tenant-preflight");
    expect(panel).toHaveAttribute("data-renewal-preflight", "proceed");
    expect(panel).toHaveAttribute("data-renewal-preflight-draft", "pending");
    expect(details).toHaveTextContent(
      /Preparation can proceed without Gmail; the unsent-draft step stays pending/,
    );
    const items = Array.from(panel.querySelectorAll("[data-renewal-preflight-item]"));
    const stateOf = (id: string) =>
      items
        .find((item) => item.getAttribute("data-renewal-preflight-item") === id)
        ?.getAttribute("data-renewal-preflight-state");
    expect(stateOf("required_inputs")).toBe("ready");
    expect(stateOf("review")).toBe("ready");
    expect(stateOf("sender")).toBe("ready");
    expect(stateOf("recipients")).toBe("ready");
    expect(stateOf("gmail_connection")).toBe("unavailable");
    expect(stateOf("template")).toBe("unavailable");
    expect(stateOf("meeting_draft")).toBe("pending_meeting");
    expect(within(panel).getByRole("link", { name: "Open the page" })).toHaveAttribute(
      "href",
      "/connections",
    );
    expect(panel.textContent).toMatch(/Not observed/);
    // The final body copies locally; the draft preview stays unavailable and nothing was requested.
    expect(
      screen.getByRole("button", { name: "Copy formatted body" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
    expect(calls).toEqual(["GET /api/lease-renewal/message-preparation"]);
  });

  it("lists the missing inputs and a server policy gate as reasons before the draft step", async () => {
    stubFetch(preparation({ ready: false, gmail: true, policyGate: true }));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const details = await screen.findByText(/Meeting preflight:/);
    const panel = details.closest("details")!;
    expect(panel).toHaveAttribute("data-renewal-preflight", "blocked");
    expect(details).toHaveTextContent(
      /Resolve the listed items before the unsent-draft step/,
    );
    const inputs = panel.querySelector('[data-renewal-preflight-item="required_inputs"]');
    expect(inputs).toHaveAttribute("data-renewal-preflight-state", "missing_input");
    expect(inputs).toHaveTextContent(/inputs remain/);
    const readiness = screen.getByRole("list", { name: "Missing inputs" });
    expect(
      within(readiness).getByRole("link", {
        name: "Rhino policy content and applicability",
      }),
    ).toHaveAttribute("href", "#renewal-policy-content-rhino");
    expect(
      panel.querySelector('[data-renewal-preflight-item="gmail_connection"]'),
    ).toHaveAttribute("data-renewal-preflight-state", "ready");
    expect(
      screen.getByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeDisabled();
  });
});
