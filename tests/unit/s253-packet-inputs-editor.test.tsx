/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PacketInputsEditor } from "@/components/lease-renewal/PacketInputsEditor";
import type { AnimalChargeResult } from "@/lib/lease-documents/charge-policy";
import type { PacketAnimalInput } from "@/lib/lease-documents/packet-inputs";
import type {
  OwnerExplanationView,
  PacketInputsView,
} from "@/lib/lease-documents/packet-inputs-view";

// S253 R-S253-3, R-S253-4, R-S253-6, R-S253-7 on the opened Packet inputs editor: the recorded
// deposit, the fee, deposit and total before anything is prepared, the named needs, and the
// explanation staff write for the owner. Synthetic values only.

const PET = "30000000-0000-4000-8000-000000000001";
const HELPER = "30000000-0000-4000-8000-000000000002";
const OWNER_TRANSACTION = "701:owner_acknowledgment";

function animal(overrides: Partial<PacketAnimalInput> = {}): PacketAnimalInput {
  return {
    animalId: PET,
    name: "Example Pet 1",
    species: "Dog",
    breed: "Mixed",
    weight: 30,
    weightUnit: "lb",
    weightBasis: "current",
    maturity: "adult",
    fidoScore: 4,
    treatment: "pet",
    ...overrides,
  };
}

function charge(overrides: Partial<AnimalChargeResult> = {}): AnimalChargeResult {
  return {
    animalId: PET,
    label: "Example Pet 1",
    status: "needs_input",
    tierLabel: null,
    amounts: { monthly: null, one_time: null, refundable_deposit: null },
    overridden: [],
    reason: "record the refundable deposit and where it comes from.",
    ...overrides,
  };
}

function explanation(
  overrides: Partial<OwnerExplanationView> = {},
): OwnerExplanationView {
  return {
    text: null,
    revision: 0,
    recordedAt: null,
    recordedByUid: null,
    fromEarlierCycle: false,
    termsChangedAfter: false,
    need: "Needs the explanation for this lease",
    transactionId: OWNER_TRANSACTION,
    startingText: "",
    preview: { lines: [], capacity: 17, issue: null },
    formNotes: [
      "Lease executed on is left blank until the business confirms which date belongs there",
    ],
    printed: ["Page 1, Organization: Sample Example Property Group"],
    ...overrides,
  };
}

function view(overrides: Partial<PacketInputsView> = {}): PacketInputsView {
  return {
    record: {
      schemaVersion: "renewal-packet-inputs/v1",
      leaseId: "701",
      revision: 1,
      facts: {},
      people: { revision: 0, entries: [] },
      animals: { revision: 1, entries: [animal()] },
      chargeOverrides: { revision: 0, entries: [] },
      updatedAt: "2026-11-05T15:00:00.000Z",
      updatedByUid: "editor-1",
    },
    chargePolicy: { readable: true, version: 3, effectiveFrom: "2026-11-01" },
    charges: {
      animals: [charge()],
      totals: { monthly: 0, one_time: 5_000, refundable_deposit: null },
      issues: ["Example Pet 1: record the refundable deposit and where it comes from."],
      packageMonthlyCents: null,
      insuranceMonthlyCents: null,
    },
    source: { available: true, facts: [], parties: [], replaced: [] },
    ownerApproval: { state: "not_recorded", notice: "SYNTHETIC approval notice." },
    questions: [],
    formFamilies: ["synthetic-one-path"],
    notices: [],
    petAgreement: {
      feeCents: 5_000,
      feeUnit: null,
      feeSource: "SYNTHETIC source note for the processing fee",
      ordinaryPets: 1,
      depositCents: null,
      totalCents: null,
      needs: ["Example Pet 1: record the refundable deposit and where it comes from."],
    },
    depositEntry: "staff_record",
    ownerExplanation: explanation(),
    ...overrides,
  };
}

let current: PacketInputsView;
let posts: Array<{ url: string; body: Record<string, unknown> }>;
let gets: string[];
let ownerSnapshot: Record<string, unknown> | null;

beforeEach(() => {
  current = view();
  posts = [];
  gets = [];
  ownerSnapshot = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if ((init?.method ?? "GET") === "POST") {
        posts.push({ url, body: JSON.parse(String(init!.body)) });
        return url.startsWith("/api/lease-renewal/packet-truth")
          ? json({ snapshot: ownerSnapshot })
          : json({ record: current.record });
      }
      gets.push(url);
      if (url.startsWith("/api/lease-renewal/packet-truth"))
        return json({ snapshot: null });
      return json(current);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openEditor(canEdit = true) {
  render(<PacketInputsEditor leaseId="701" canEdit={canEdit} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open packet inputs" }));
  await screen.findByText("Lease facts");
}

const animals = () => document.querySelector("[data-packet-animals]") as HTMLElement;
const amounts = () =>
  document.querySelector('[data-renewal-field="pet-agreement-amounts"]') as HTMLElement;
const owner = () => document.querySelector("[data-owner-acknowledgment]") as HTMLElement;
const part = (name: string) =>
  document.querySelector(`[data-pet-agreement="${name}"]`)?.textContent;
const savedAnimals = () =>
  (posts.at(-1)!.body.animals as { entries: PacketAnimalInput[] }).entries;

describe("S253 R-S253-3: staff record the pet's deposit with where it comes from", () => {
  it("saves the amount in cents with its source, on this lease's animal", async () => {
    await openEditor();
    const section = within(animals());
    expect((section.getByLabelText("Refundable deposit") as HTMLInputElement).value).toBe(
      "",
    );
    fireEvent.change(section.getByLabelText("Refundable deposit"), {
      target: { value: "300.50" },
    });
    fireEvent.change(section.getByLabelText("Where the deposit comes from"), {
      target: { value: "SYNTHETIC screening result" },
    });
    fireEvent.click(section.getByRole("button", { name: "Save animals" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe("/api/lease-renewal/packet-inputs");
    expect(posts[0].body).toMatchObject({ leaseId: "701" });
    expect(savedAnimals()).toEqual([
      animal({ deposit: { amountCents: 30_050, source: "SYNTHETIC screening result" } }),
    ]);
  });

  it("asks where the deposit comes from before it saves, and reads an empty amount as no deposit", async () => {
    await openEditor();
    const section = within(animals());
    fireEvent.change(section.getByLabelText("Refundable deposit"), {
      target: { value: "300" },
    });
    fireEvent.click(section.getByRole("button", { name: "Save animals" }));
    expect((await section.findByRole("alert")).textContent).toBe(
      "Example Pet 1: say where the deposit comes from.",
    );
    expect(posts).toEqual([]);
    fireEvent.change(section.getByLabelText("Refundable deposit"), {
      target: { value: "three hundred" },
    });
    fireEvent.click(section.getByRole("button", { name: "Save animals" }));
    expect((await section.findByRole("alert")).textContent).toBe(
      "Example Pet 1: enter the deposit as dollars and cents.",
    );
    // An empty amount is no deposit at all: never a deposit of zero.
    fireEvent.change(section.getByLabelText("Refundable deposit"), {
      target: { value: "" },
    });
    fireEvent.change(section.getByLabelText("Name"), {
      target: { value: "Example Pet One" },
    });
    fireEvent.click(section.getByRole("button", { name: "Save animals" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(savedAnimals()[0]).not.toHaveProperty("deposit");
  });

  it("shows the saved deposit with when it was recorded", async () => {
    current = view();
    current.record!.animals.entries = [
      animal({
        deposit: {
          amountCents: 30_000,
          source: "SYNTHETIC screening result",
          recordedAt: "2026-11-05T16:00:00.000Z",
          recordedByUid: "editor-1",
        },
      }),
    ];
    await openEditor();
    const section = within(animals());
    expect((section.getByLabelText("Refundable deposit") as HTMLInputElement).value).toBe(
      "300",
    );
    expect(
      (section.getByLabelText("Where the deposit comes from") as HTMLInputElement).value,
    ).toBe("SYNTHETIC screening result");
    expect(document.querySelector("[data-packet-deposit-recorded]")?.textContent).toMatch(
      /^Deposit recorded /,
    );
  });

  it("leaves the deposit to the published tiers when the policy has them", async () => {
    current = view({ depositEntry: "published_tiers" });
    await openEditor();
    expect(within(animals()).queryByLabelText("Refundable deposit")).toBeNull();
  });
});

describe("S253 R-S253-6: nothing is added for an assistance animal", () => {
  beforeEach(() => {
    current = view({
      charges: {
        animals: [
          charge({
            animalId: HELPER,
            label: "Example Helper",
            status: "needs_rule",
            reason:
              "needs the approved rule for assistance animals. No fee, deposit or agreement decision is made until it is published.",
          }),
        ],
        totals: { monthly: 0, one_time: null, refundable_deposit: null },
        issues: ["Example Helper: needs the approved rule for assistance animals."],
        packageMonthlyCents: null,
        insuranceMonthlyCents: null,
      },
      petAgreement: {
        feeCents: 5_000,
        feeUnit: null,
        feeSource: "SYNTHETIC source note for the processing fee",
        ordinaryPets: 0,
        depositCents: null,
        totalCents: null,
        needs: [],
      },
    });
    current.record!.animals.entries = [
      animal({
        animalId: HELPER,
        name: "Example Helper",
        treatment: "assistance_animal",
      }),
    ];
  });

  it("shows only that the rule is needed: no fee, no deposit, no total and no zero", async () => {
    await openEditor();
    const row = document.querySelector(
      '[data-packet-animal-charge="needs_rule"]',
    ) as HTMLElement;
    expect(row.textContent).toBe(
      "Example Helper: needs the approved rule for assistance animals. No fee, deposit or agreement decision is made until it is published.",
    );
    expect(within(row).queryByRole("button")).toBeNull();
    // The pet agreement's amounts belong to ordinary pets; none is shown for this lease.
    expect(amounts()).toBeNull();
    expect(row.textContent).not.toMatch(/\$|free|no charge|waived/i);
  });

  it("asks for the treatment and nothing else: no deposit, registration, proof or document field", async () => {
    await openEditor();
    const section = animals();
    expect(within(section).queryByLabelText("Refundable deposit")).toBeNull();
    const labels = [...section.querySelectorAll("label, legend")].map(
      (label) => label.textContent ?? "",
    );
    expect(labels).toEqual([
      "Name",
      "Species or type",
      "Breed",
      "Weight",
      "Weight unit",
      "The weight is",
      "Maturity",
      "FIDO score",
      "Treatment",
    ]);
    expect(section.textContent).not.toMatch(
      /regist|certif|licen[cs]|proof|letter|document|doctor|verif/i,
    );
  });
});

describe("S253 R-S253-4: the fee, the deposit and the total before anything is prepared", () => {
  it("shows the three amounts with the fee's source", async () => {
    current = view({
      charges: {
        animals: [
          charge({
            status: "calculated",
            amounts: { monthly: null, one_time: null, refundable_deposit: 30_000 },
            reason: "The refundable deposit is the amount staff recorded for this pet.",
          }),
        ],
        totals: { monthly: 0, one_time: 5_000, refundable_deposit: 30_000 },
        issues: [],
        packageMonthlyCents: null,
        insuranceMonthlyCents: null,
      },
      petAgreement: {
        feeCents: 5_000,
        feeUnit: null,
        feeSource: "SYNTHETIC source note for the processing fee",
        ordinaryPets: 1,
        depositCents: 30_000,
        totalCents: 35_000,
        needs: [],
      },
    });
    await openEditor();
    expect(part("fee")).toBe("Processing fee: $50.00");
    expect(part("deposit")).toBe("Refundable deposit, first amount blank: $300.00");
    expect(part("total")).toBe("Total, second amount blank: $350.00");
    expect(amounts().textContent).toContain(
      "Fee source: SYNTHETIC source note for the processing fee",
    );
    expect(document.querySelector("[data-pet-agreement-needs]")).toBeNull();
    // Opening and reading the inputs prepares nothing.
    expect(posts).toEqual([]);
    expect(gets).toEqual(["/api/lease-renewal/packet-inputs?leaseId=701"]);
  });

  it("leaves a missing part blank with what is needed, and shows no zero", async () => {
    await openEditor();
    expect(part("fee")).toBe("Processing fee: $50.00");
    expect(part("deposit")).toBe("Refundable deposit, first amount blank: left blank");
    expect(part("total")).toBe("Total, second amount blank: left blank");
    expect(document.querySelector("[data-pet-agreement-needs]")?.textContent).toBe(
      "Example Pet 1: record the refundable deposit and where it comes from.",
    );
    expect(amounts().textContent).not.toMatch(/\$0\.00/);
    expect(
      document.querySelector('[data-packet-animal-charge="needs_input"]')?.textContent,
    ).not.toMatch(/\$0\.00/);
  });

  it("names the unpublished fee as the need", async () => {
    current = view({
      petAgreement: {
        feeCents: null,
        feeUnit: null,
        feeSource: null,
        ordinaryPets: 1,
        depositCents: 30_000,
        totalCents: null,
        needs: ["An Admin has not published the pet processing fee."],
      },
    });
    await openEditor();
    expect(part("fee")).toBe("Processing fee: waiting on the published fee");
    expect(part("total")).toBe("Total, second amount blank: left blank");
    expect(document.querySelector("[data-pet-agreement-needs]")?.textContent).toBe(
      "An Admin has not published the pet processing fee.",
    );
  });
});

describe("S253 R-S253-7: staff write this lease's explanation for the owner", () => {
  const box = () =>
    within(owner()).getByLabelText("Explanation for the owner") as HTMLTextAreaElement;

  it("starts empty, names the need and shows the form's notes", async () => {
    await openEditor();
    expect(box().value).toBe("");
    expect(
      document.querySelector('[data-renewal-field="owner-explanation-need"]')
        ?.textContent,
    ).toBe("Needs the explanation for this lease");
    expect(owner().querySelector("[data-form-notes]")?.textContent).toContain(
      "Lease executed on is left blank until the business confirms which date belongs there",
    );
    // No starting text is shipped, so none is offered.
    expect(
      within(owner()).queryByRole("button", { name: "Use the team's starting text" }),
    ).toBeNull();
  });

  it("saves exactly the paragraphs typed, against the revision it read", async () => {
    await openEditor();
    fireEvent.change(box(), {
      target: { value: "SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph." },
    });
    fireEvent.click(within(owner()).getByRole("button", { name: "Save explanation" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({
      leaseId: "701",
      ownerExplanation: {
        expectedRevision: 0,
        text: "SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph.",
      },
    });
    await within(owner()).findByText("Saved.");
  });

  it("shows the saved text as it prints in the box, in its paragraphs", async () => {
    current = view({
      ownerExplanation: explanation({
        text: "SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph.",
        revision: 1,
        need: null,
        recordedAt: "2026-11-05T16:00:00.000Z",
        recordedByUid: "editor-1",
        preview: {
          lines: ["SYNTHETIC first paragraph.", "", "SYNTHETIC second paragraph."],
          capacity: 17,
          issue: null,
        },
      }),
    });
    await openEditor();
    expect(box().value).toBe("SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph.");
    expect(
      document.querySelector('[data-renewal-field="owner-explanation-preview"]')
        ?.textContent,
    ).toBe("SYNTHETIC first paragraph.\n\nSYNTHETIC second paragraph.");
    expect(
      document.querySelector('[data-renewal-field="owner-explanation-need"]'),
    ).toBeNull();
    expect(owner().textContent).toContain("The reviewed box holds 17 lines");
  });

  it("says how much a text is over its box, and flags a later terms change without clearing the text", async () => {
    current = view({
      ownerExplanation: explanation({
        text: "SYNTHETIC long text.",
        revision: 2,
        need: null,
        termsChangedAfter: true,
        preview: {
          lines: ["SYNTHETIC long text."],
          capacity: 17,
          issue:
            "The text is 13 lines longer than its box holds, about 320 characters. The reviewed text size is kept and nothing is cut: shorten the text, or use an approved form with room for it.",
        },
      }),
    });
    await openEditor();
    expect(
      document.querySelector('[data-renewal-field="owner-explanation-overflow"]')
        ?.textContent,
    ).toMatch(/^The text is 13 lines longer than its box holds, about 320 characters\./);
    expect(
      document.querySelector('[data-renewal-field="owner-explanation-flag"]')
        ?.textContent,
    ).toMatch(/^Terms changed after this was written\. The saved text is kept/);
    expect(box().value).toBe("SYNTHETIC long text.");
  });

  it("copies the team's starting text only when a person chooses it, and saves nothing by itself", async () => {
    current = view({
      ownerExplanation: explanation({ startingText: "SYNTHETIC starting text." }),
    });
    await openEditor();
    expect(box().value).toBe("");
    fireEvent.click(
      within(owner()).getByRole("button", { name: "Use the team's starting text" }),
    );
    expect(box().value).toBe("SYNTHETIC starting text.");
    expect(posts).toEqual([]);
    // Once the box has text the starting text is no longer offered over it.
    expect(
      within(owner()).queryByRole("button", { name: "Use the team's starting text" }),
    ).toBeNull();
  });

  it("keeps the box read-only for a person who cannot edit", async () => {
    await openEditor(false);
    expect(box().disabled).toBe(true);
    expect(
      within(owner()).queryByRole("button", { name: "Save explanation" }),
    ).toBeNull();
  });
});

describe("S253 the owner acknowledgment is checked as its own packet", () => {
  const snapshot = (overrides: Record<string, unknown> = {}) => ({
    leaseId: "701",
    transactionId: OWNER_TRANSACTION,
    snapshotId: "owner-snapshot-1",
    snapshotVersion: 1,
    current: true,
    state: "Needs input",
    visibleState: "Needs input",
    packetContext: "owner_acknowledgment",
    blockers: [
      {
        code: "owner_ack_proof_unavailable",
        label:
          "Authenticated provider readback for the exact fully executed tenant packet is required.",
        scope: "owner_acknowledgment",
      },
    ],
    manifest: {
      packetContext: "owner_acknowledgment",
      audience: "owner",
      includedArtifacts: [
        {
          artifactId: "owner_acknowledgment:onepath-owner-ack-0001:one-path-owner-v1",
          kind: "owner_acknowledgment",
          label: "Approved owner acknowledgment",
          audience: "owner",
          ruleResult: "Included",
          reason: "Required.",
        },
      ],
      excludedArtifacts: [],
      fields: [],
      participants: [],
      charges: [],
      animals: [],
    },
    ...overrides,
  });

  it("evaluates the owner packet on request and shows the single form that waits", async () => {
    const waiting = snapshot();
    (waiting.manifest as Record<string, unknown>).formHolds = [
      {
        artifactKind: "owner_acknowledgment",
        factKey: "owner_acknowledgment.explanation",
        label: "Needs the explanation for this lease",
      },
    ];
    ownerSnapshot = waiting;
    await openEditor();
    fireEvent.click(
      within(owner()).getByRole("button", { name: "Check the owner acknowledgment" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(gets.at(-1)).toBe(
      "/api/lease-renewal/packet-truth?leaseId=701&transactionId=701%3Aowner_acknowledgment",
    );
    expect(posts[0]).toEqual({
      url: "/api/lease-renewal/packet-truth",
      body: {
        action: "evaluate",
        leaseId: "701",
        transactionId: OWNER_TRANSACTION,
        expectedCurrentSnapshotId: null,
      },
    });
    const hold = await waitFor(() => {
      const found = document.querySelector('[data-form-hold="owner_acknowledgment"]');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(hold.textContent).toBe("Needs the explanation for this lease");
    // A form that waits offers no preparation.
    expect(
      within(owner()).queryByRole("button", { name: "Check filled document" }),
    ).toBeNull();
  });

  it("offers its file for preparation once the explanation is saved, and says sending still waits", async () => {
    ownerSnapshot = snapshot();
    await openEditor();
    fireEvent.click(
      within(owner()).getByRole("button", { name: "Check the owner acknowledgment" }),
    );
    await within(owner()).findByRole("button", { name: "Check filled document" });
    expect(owner().textContent).toContain(
      "This file can be prepared and inspected now. Sending it to the owner for signature waits for the fully signed tenant packet.",
    );
    expect(document.querySelector("[data-form-hold]")).toBeNull();
  });

  it("offers no preparation while another blocker stands", async () => {
    ownerSnapshot = snapshot({
      blockers: [
        {
          code: "owner_ack_proof_unavailable",
          label:
            "Authenticated provider readback for the exact fully executed tenant packet is required.",
          scope: "owner_acknowledgment",
        },
        {
          code: "missing_fact",
          label: "Verified property.address is required.",
          scope: "packet",
          fieldKey: "property.address",
        },
      ],
    });
    await openEditor();
    fireEvent.click(
      within(owner()).getByRole("button", { name: "Check the owner acknowledgment" }),
    );
    await waitFor(() =>
      expect(
        document.querySelector("[data-owner-acknowledgment-blockers]")?.textContent,
      ).toBe("Verified property.address is required."),
    );
    expect(
      within(owner()).queryByRole("button", { name: "Check filled document" }),
    ).toBeNull();
  });
});
