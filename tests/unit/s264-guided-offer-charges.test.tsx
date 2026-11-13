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

import { RenewalFocusViewProvider } from "@/components/lease-renewal/RenewalFocusViewContext";
import { RenewalMessagePreparation } from "@/components/lease-renewal/RenewalMessagePreparation";
import {
  RenewalNowCardProvider,
  useRenewalNowCard,
} from "@/components/lease-renewal/RenewalNowCardContext";
import {
  projectGuidedPriority,
  type GuidedPriorityFacts,
} from "@/lib/lease-renewal/guided-priority";
import {
  emptyOfferChargeSelection,
  offerChargeRowControlId,
  projectOfferCharges,
  type OfferChargeSelection,
  type OfferSourceLine,
} from "@/lib/lease-renewal/offer-charges";
import { offerChargesPriority } from "@/lib/lease-renewal/offer-charges-priority";
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";
import type {
  RenewalStage,
  RenewalPathStepView,
} from "@/lib/lease-renewal/renewal-stage";
import {
  SENT_AT_MS,
  evidenceInput,
  message,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";

// S264 with S269/S270 (Offer the tenant): Review offer charges is the active Work after the
// working terms. Its first material unresolved row, else the open transition choice, leads the
// Guided priority by its own control, and S265's missing flyer leads only once every transition
// decision is made. The one editor publishes that lead; the add-a-case-charge choice sits in the
// outcome's options group and edits the same selection with the same save.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const CYCLE = "6c37bdcd-8264-4249-813f-0289307dd725";
const workspace = { ...recordedState("701", [], CYCLE), termsRevision: 1 };
vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => ({
    leaseId: "701",
    state: workspace,
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RENEWAL = "2027-01-01";
const line = (chargeId: string, accountId: string, amount: string): OfferSourceLine => ({
  chargeId,
  accountId,
  accountName: `Synthetic account ${accountId}`,
  description: "Synthetic line",
  classification: "non_rent",
  amount,
  frequency: "1",
  startDate: "2026-01-01",
  endDate: null,
  endDateRaw: null,
  statusId: 1,
  version: `v-${chargeId}`,
});
const MAPPINGS: OfferChargeMappingsRead = {
  readable: true,
  record: {
    schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
    version: 1,
    entries: [
      {
        entryId: "00000000-0000-4000-8000-000000009003",
        accountId: "9003",
        accountName: "Synthetic account 9003",
        displayLabel: "Insurance program",
        family: "insurance" as const,
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
const review = (
  lines: OfferSourceLine[],
  selection: OfferChargeSelection | null = null,
) =>
  projectOfferCharges({
    leaseId: "701",
    source: { state: "read", asOf: "2026-11-10", lines, version: "src" },
    mappings: MAPPINGS,
    selection,
    terms: { rent: 1100, effectiveDate: RENEWAL },
  });

function offerFacts(extensions: GuidedPriorityFacts["extensions"]): GuidedPriorityFacts {
  const shown = {
    id: "offer-tenant",
    label: "Offer the tenant",
    state: "current",
    detail: null,
    primary: null,
    controls: [],
  } as unknown as RenewalPathStepView;
  return {
    // The S269 test's stage shape: the shown step is current, nothing waits or is unconfirmed.
    stage: {
      stage: { key: "offering_tenant", label: "Offering the tenant" },
      stageLine: "",
      currentStepId: "offer-tenant",
      nextStep: { label: "", stepId: "offer-tenant", processStepId: null },
      waiting: null,
      evidenceLine: null,
      steps: [shown],
      check: null,
      evidenceCheck: null,
      derived: [],
      handStatusLine: null,
      blocker: null,
      evidence: {
        owner: { unconfirmedSequenceId: null, corrected: [] },
        tenant: { unconfirmedSequenceId: null, corrected: [] },
      },
      finishUp: [],
    } as unknown as RenewalStage,
    shown,
    canEdit: true,
    working: { rent: 1100, effectiveDate: RENEWAL, endDate: "2027-12-31" },
    extensions,
  };
}

describe("S264 with S269: the offer's charge lead in the one Guided priority", () => {
  it("the first material unresolved row leads by its own control, ahead of an included flyer", () => {
    const open = review([line("101", "9555", "40.00"), line("102", "9003", "12.50")]);
    const lead = offerChargesPriority(open);
    expect(lead).toEqual({
      target: offerChargeRowControlId("rentvine:101"),
      transitionsReady: false,
    });
    const priority = projectGuidedPriority(
      offerFacts({
        offerCharges: lead,
        includedResource: { label: "Add the insurance flyer", target: "flyer-fix" },
      }),
    );
    expect(priority.lead).toMatchObject({
      key: "offer-charges",
      label: "Review offer charges",
      target: offerChargeRowControlId("rentvine:101"),
      owner: "offer-tenant",
    });
    expect(priority.inputs.map((entry) => entry.key)).toEqual(["offer-charges"]);
  });

  it("with every row decided, the open transition choice leads; once made, nothing from the review leads", () => {
    const transition = review([line("102", "9003", "12.50")]);
    expect(offerChargesPriority(transition)).toEqual({
      target: "renewal-message-tenant-insurance-policy",
      transitionsReady: false,
    });
    const decided = review([line("102", "9003", "12.50")], {
      ...emptyOfferChargeSelection(),
      transitions: {
        insurance: { choice: "applies", source: "Synthetic program enrollment" },
        rbp: null,
      },
    });
    expect(offerChargesPriority(decided)).toBeNull();
    // The flyer the decision requires now leads (S265), after the charges.
    const priority = projectGuidedPriority(
      offerFacts({
        offerCharges: offerChargesPriority(decided),
        includedResource: { label: "Add the insurance flyer", target: "flyer-fix" },
      }),
    );
    expect(priority.lead).toMatchObject({
      key: "included-resource",
      target: "flyer-fix",
    });
  });

  it("an unreadable charge source holds the review itself", () => {
    const held = projectOfferCharges({
      leaseId: "701",
      source: { state: "unavailable" },
      mappings: MAPPINGS,
      selection: null,
      terms: { rent: 1100, effectiveDate: RENEWAL },
    });
    expect(offerChargesPriority(held)).toEqual({
      target: "renewal-offer-charges",
      transitionsReady: true,
    });
  });
});

function Probe() {
  const nowCard = useRenewalNowCard();
  return (
    <output data-testid="offer-lead">
      {nowCard?.offerCharges ? JSON.stringify(nowCard.offerCharges) : "none"}
    </output>
  );
}

function preparation(lines: OfferSourceLine[]) {
  const inputs = emptyMessagePreparationInputs();
  const facts: RenewalMessageFacts = {
    channel: "tenant",
    names: ["Fixture Tenant"],
    address: "701 Fixture Lane",
    currentBaseRent: null,
    leaseEndDate: "2026-12-31",
    ownerTerms: {
      rent: 1100,
      effectiveDate: RENEWAL,
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
  const source = { state: "read" as const, asOf: "2026-11-10", lines, version: "src" };
  return {
    senderEmail: "fixture-staff@pmikcmetro.com",
    cycleId: CYCLE,
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
    offerCharges: {
      source,
      mappings: MAPPINGS,
      saved: null,
      review: review(lines),
      snapshotId: "offer:701:synthetic",
      snapshotHash: "c".repeat(64),
    },
  };
}

describe("S264 with S270: the one editor gives the lead and keeps the optional choice in its options", () => {
  it("publishes the first open choice, and the case charge added from the options group joins the same review and save", async () => {
    const posts: Array<Record<string, unknown>> = [];
    const current = preparation([line("102", "9003", "12.50")]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
        return Response.json(current);
      }),
    );
    render(
      <RenewalNowCardProvider preparation={null}>
        <RenewalMessagePreparation channel="tenant" canEdit />
        <Probe />
      </RenewalNowCardProvider>,
    );
    await screen.findByRole("region", { name: "Review offer charges" });
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("offer-lead").textContent!)).toEqual({
        target: "renewal-message-tenant-insurance-policy",
        transitionsReady: false,
      }),
    );
    // The open transition choice comes before the line lists in the review.
    const charges = screen.getByRole("region", { name: "Review offer charges" });
    const transition = charges.querySelector(
      '[data-offer-charge-transition="insurance"]',
    )!;
    const lines = charges.querySelector('[data-offer-charge-list="recurring"]')!;
    expect(
      transition.compareDocumentPosition(lines) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The optional case charge is not inside the review; it is one of the offer's options.
    expect(
      within(charges).queryByLabelText("Add a charge for this lease only"),
    ).toBeNull();
    const add = screen.getByLabelText("Add a charge for this lease only");
    fireEvent.change(add, { target: { value: "renewal_processing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add this charge" }));
    expect(
      within(charges).getByLabelText("Renewal processing fee amount ($)"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (
          posts.at(-1)?.offerCharges as { caseEntries?: Array<{ family: string }> }
        )?.caseEntries?.map((entry) => entry.family),
      ).toEqual(["renewal_processing"]),
    );
  });

  it.each(["guided", "full"] as const)(
    "keeps one current charge review under Record of contact after a confirmed send in %s",
    async (view) => {
      const sequenceId = "sent-offer-701";
      const sentOffer = message({ audience: "tenant", cycleId: CYCLE, sequenceId });
      const current = preparation([line("102", "9003", "12.50")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          Response.json(
            url === `/api/gmail-hub/sequences?id=${sequenceId}`
              ? {
                  sequence: {
                    id: sequenceId,
                    context: { entityId: "701", purpose: "renewal_tenant" },
                    state: "completed",
                    confirmedCount: 1,
                    nextDueAtMs: null,
                    unresolvedOccurrenceId: null,
                    lastSentAtMs: SENT_AT_MS,
                    initial: {
                      subject: "The sent offer",
                      paragraphs: [
                        [{ text: "The exact offer before any charge correction." }],
                      ],
                      attachmentIds: [],
                    },
                  },
                }
              : current,
          ),
        ),
      );
      const { container } = render(
        <RenewalFocusViewProvider allowLegacyFocus={false} initialView={view}>
          <RenewalNowCardProvider preparation={null}>
            <RenewalMessagePreparation
              channel="tenant"
              canEdit
              outcomeContext={{
                leaseId: "701",
                staffRecordUnavailable: false,
                standingAgreement: null,
                housingAssistance: null,
                numbers: { verified: true, openDifferences: 0 },
                term: { monthToMonth: false, reviewNeeded: false },
                moveOutInitiated: false,
                sourceRenewal: null,
                verification: null,
                handStatus: null,
                outreach: evidenceInput([sentOffer]),
              }}
              secondaryWork={<p>Contact record</p>}
            />
            <div id="renewal-sent-message-tenant" />
          </RenewalNowCardProvider>
        </RenewalFocusViewProvider>,
      );

      await screen.findByText("The exact offer before any charge correction.");
      expect(
        container.querySelector('[data-renewal-message-work="tenant"]'),
      ).toHaveAttribute("data-renewal-message-sent", "true");
      const chargeReviews = container.querySelectorAll("#renewal-offer-charges");
      expect(chargeReviews).toHaveLength(1);
      expect(chargeReviews[0]?.closest("details")).toHaveAttribute(
        "data-renewal-group",
        "Record of contact",
      );
      expect(
        container.querySelector(
          '[data-renewal-group="Message"], [data-renewal-group="Other ways to send"]',
        ),
      ).toBeNull();
    },
  );
});
