// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";

// S129 (F09, R-F09-07), as revised by S161/S162: the mounted preparation shows the meeting preflight
// from the same facts and callout it uses, proceeds through editing and copy with Gmail unavailable,
// keeps the unsent-draft step pending, lists marked values and policy notes as information only,
// and never requests a draft on its own. Values are synthetic; fetch is stubbed.

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
    // S163: a complete message has a recorded first name for its greeting.
    firstNames: options.ready ? ["Fixture"] : [null],
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
    bodyBaseHash: "b".repeat(64),
    bodyOverride: null,
    subjectOverride: null,
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

describe("S193 preserves source diagnostics while retiring the old draft preflight", () => {
  it("keeps editing and copy with unavailable publication and links the canonical composer without effects", async () => {
    const calls = stubFetch(preparation({ ready: true, gmail: false }));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const summary = await screen.findByText("Message sources"),
      panel = summary.closest("details")!;
    expect(panel).toHaveAttribute("id", "renewal-message-tenant-sources");
    expect(panel).toHaveTextContent(SENDER);
    expect(panel).toHaveTextContent("Exact publication pending.");
    expect(panel).toHaveTextContent("Send or Schedule");
    expect(panel).not.toHaveTextContent("only a person sends in Gmail");
    expect(
      screen.getByRole("button", { name: "Copy formatted body" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      screen.getByRole("link", { name: "Compose tenant message in Communications" }),
    ).toHaveAttribute("href", "/gmail-hub?compose=renewal_tenant&lease=701");
    expect(
      screen.queryByRole("button", { name: "Preview unsent Gmail draft" }),
    ).toBeNull();
    expect(calls).toEqual(["GET /api/lease-renewal/message-preparation"]);
  });
  it("keeps missing values, signature guidance and policy links as editable information", async () => {
    const calls = stubFetch(preparation({ ready: false, gmail: true, policyGate: true }));
    render(<RenewalMessagePreparation channel="tenant" canEdit />);
    const panel = (await screen.findByText("Message sources")).closest("details")!;
    expect(panel).toHaveTextContent("approved");
    const readiness = screen.getByRole("list", { name: "Marked values" });
    expect(readiness).toHaveTextContent("Your sender signature is not entered yet.");
    expect(
      within(readiness).getByRole("link", {
        name: "Rhino policy content and applicability",
      }),
    ).toHaveAttribute("href", "#renewal-policy-content-rhino");
    expect(readiness).toHaveTextContent(
      "Review whether the Rhino policy applies to this lease before final use.",
    );
    expect(calls).toEqual(["GET /api/lease-renewal/message-preparation"]);
  });
});
