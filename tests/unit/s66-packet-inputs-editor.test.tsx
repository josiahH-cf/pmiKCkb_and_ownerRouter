/** @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PacketInputsEditor } from "@/components/lease-renewal/PacketInputsEditor";
import type { PacketInputsView } from "@/lib/lease-documents/packet-inputs-view";
import { PACKET_FACT_DEFINITIONS } from "@/lib/lease-documents/packet-inputs";

const ANIMAL = "30000000-0000-4000-8000-000000000001";

function view(overrides: Partial<PacketInputsView> = {}): PacketInputsView {
  return {
    record: {
      schemaVersion: "renewal-packet-inputs/v1",
      leaseId: "701",
      revision: 2,
      facts: {
        "property.year_built": {
          value: 1965,
          displayValue: "1965",
          revision: 1,
          eventId: "00000000-0000-4000-8000-000000000001",
          recordedAt: "2026-10-07T01:00:00.000Z",
          recordedByUid: "editor-1",
          origin: "staff_entry",
        },
      },
      people: { revision: 0, entries: [] },
      animals: {
        revision: 1,
        entries: [
          {
            animalId: ANIMAL,
            name: "Rex",
            species: "Dog",
            breed: "Mixed",
            weight: 30,
            weightUnit: "lb",
            weightBasis: "current",
            maturity: "adult",
            fidoScore: null,
            treatment: null,
          },
        ],
      },
      chargeOverrides: { revision: 0, entries: [] },
      updatedAt: "2026-10-07T01:00:00.000Z",
      updatedByUid: "editor-1",
    },
    chargePolicy: { readable: true, version: 2, effectiveFrom: "2026-10-01" },
    charges: {
      animals: [
        {
          animalId: ANIMAL,
          label: "Rex",
          status: "needs_input",
          tierLabel: null,
          amounts: { monthly: null, one_time: null, refundable_deposit: null },
          overridden: [],
          reason: "record whether this animal is a pet or an assistance animal.",
        },
      ],
      totals: { monthly: null, one_time: null, refundable_deposit: null },
      issues: ["Rex: record whether this animal is a pet or an assistance animal."],
      packageMonthlyCents: null,
      insuranceMonthlyCents: null,
    },
    source: {
      available: true,
      facts: [
        {
          fieldKey: "property.address",
          value: "100 Fixture St Unit 2",
          reference: "rentvine:lease:701:unit.address",
        },
      ],
      parties: [
        {
          side: "tenant",
          name: "Tenant One",
          email: "tenant1@fixture-rental.net",
          sourceRef: "rentvine:lease:701:tenants[0].name",
        },
      ],
      replaced: [],
    },
    ownerApproval: {
      state: "no_working_terms",
      notice:
        "The recorded owner approval does not name complete Working renewal terms. Save the Working terms, then record the owner's approval again.",
    },
    questions: [
      ...Object.entries(PACKET_FACT_DEFINITIONS).map(([fieldKey, definition]) => ({
        fieldKey,
        ...definition,
        reason:
          fieldKey === "insurance.coverage_method"
            ? ("missing" as const)
            : ("standard" as const),
      })),
    ],
    formFamilies: ["synthetic-family"],
    notices: [],
    ...overrides,
  };
}

let posts: Array<Record<string, unknown>>;
let current: PacketInputsView;
let nextPost: { status: number; body: Record<string, unknown> } | null;

beforeEach(() => {
  posts = [];
  current = view();
  nextPost = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        posts.push(JSON.parse(String(init!.body)));
        const reply = nextPost ?? { status: 200, body: { record: current.record } };
        return new Response(JSON.stringify(reply.body), {
          status: reply.status,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(current), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Opening the lease makes no request; the inputs are read when a person opens them. */
async function openEditor(element: React.ReactElement) {
  render(element);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open packet inputs" }));
  await screen.findByText("Lease facts");
}

function peopleSection() {
  return document.querySelector("[data-packet-people]") as HTMLElement;
}

function factRow(fieldKey: string) {
  return document.querySelector(`[data-packet-fact="${fieldKey}"]`) as HTMLElement;
}

describe("S66 Packet inputs editor (BEH-S66-1, AC-S66-4, AC-S66-5)", () => {
  it("shows saved inputs, the exact questions still needed, the owner-approval state and waiting charges", async () => {
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    expect(
      factRow("insurance.coverage_method").getAttribute("data-packet-fact-reason"),
    ).toBe("missing");
    expect(screen.getByText(/1 fact is needed for the current packet/)).toBeTruthy();
    expect(
      within(factRow("property.year_built")).getByText(/Saved 1965 on/),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-owner-approval="no_working_terms"]')?.textContent,
    ).toMatch(/does not name complete Working renewal terms/);
    expect(document.querySelector("[data-packet-charge-totals]")?.textContent).toContain(
      "Monthly Waiting on inputs",
    );
    expect(
      document.querySelector('[data-packet-animal-charge="needs_input"]')?.textContent,
    ).toMatch(/record whether this animal is a pet/);
  });

  it("saves one fact against the revision it read and reloads", async () => {
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    const row = factRow("insurance.coverage_method");
    fireEvent.change(within(row).getByLabelText("Renter's insurance"), {
      target: { value: "pmi_program" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      leaseId: "701",
      facts: [
        {
          fieldKey: "insurance.coverage_method",
          expectedRevision: 0,
          value: "pmi_program",
        },
      ],
    });
    expect(String(posts[0].operationId)).toMatch(/^[0-9a-f-]{36}$/);
    await within(row).findByText("Saved.");
  });

  it("adopts the RentVine value only when asked, and requires a reason to correct it", async () => {
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    const row = factRow("property.address");
    expect(within(row).getByText(/RentVine: 100 Fixture St Unit 2/)).toBeTruthy();
    fireEvent.click(within(row).getByRole("button", { name: "Use the RentVine value" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].facts).toEqual([
      {
        fieldKey: "property.address",
        expectedRevision: 0,
        value: "100 Fixture St Unit 2",
        origin: "adopted_source",
        sourceLabel: "RentVine lease 701",
      },
    ]);
    fireEvent.change(within(row).getByLabelText("Property address"), {
      target: { value: "100 Fixture Street Unit 2" },
    });
    const save = within(row).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(row).getByLabelText("Why this corrects the RentVine value"), {
      target: { value: "The signed lease spells out Street." },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].facts).toEqual([
      {
        fieldKey: "property.address",
        expectedRevision: 0,
        value: "100 Fixture Street Unit 2",
        overridesSource: true,
        reason: "The signed lease spells out Street.",
      },
    ]);
  });

  it("adds a RentVine tenant as a person with a role, saves the list, and names a concurrent change", async () => {
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Add this tenant" }));
    nextPost = {
      status: 409,
      body: {
        error:
          "Another operator changed the people and signer roles. Your entries are kept; review the current list before saving again.",
      },
    };
    fireEvent.click(screen.getByRole("button", { name: "Save people" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].people).toMatchObject({
      expectedRevision: 0,
      entries: [
        {
          fullName: "Tenant One",
          email: "tenant1@fixture-rental.net",
          emailBasis: "verified_contact",
          contactRef: "rentvine:lease:701:tenants[0].name",
          roles: [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }],
        },
      ],
    });
    expect(
      (await screen.findAllByRole("alert")).map((node) => node.textContent),
    ).toContain(
      "Another operator changed the people and signer roles. Your entries are kept; review the current list before saving again.",
    );
  });

  it("is read-only without edit access and says when no charge policy is published", async () => {
    current = view({
      chargePolicy: { readable: true, version: null, effectiveFrom: null },
      charges: null,
    });
    await openEditor(<PacketInputsEditor leaseId="701" canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save people" })).toBeNull();
    expect((screen.getByLabelText("Year built") as HTMLInputElement).disabled).toBe(true);
    expect(
      document.querySelector('[data-packet-charges="no-policy"]')?.textContent,
    ).toMatch(/An Admin has not published the renewal charge policy/);
  });

  it("keeps unsaved people after a conflict and shows the newer saved list for review", async () => {
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Add this tenant" }));
    nextPost = {
      status: 409,
      body: {
        error:
          "Another operator changed the people and signer roles. Your entries are kept; review the current list before saving again.",
      },
    };
    // Meanwhile a colleague saved a different list; the reload after the refusal reads it.
    current = view({
      record: {
        ...view().record!,
        revision: 3,
        people: {
          revision: 1,
          entries: [
            {
              personId: "20000000-0000-4000-8000-000000000009",
              kind: "person",
              fullName: "Colleague Entry",
              email: null,
              emailBasis: null,
              contactRef: null,
              roles: [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }],
            },
          ],
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save people" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const newer = await waitFor(() => {
      const node = document.querySelector(
        "[data-packet-newer-list]",
      ) as HTMLElement | null;
      expect(node).not.toBeNull();
      return node!;
    });
    expect(newer.textContent).toContain("Colleague Entry (Tenant 1)");
    // The person's own unsaved entry and the refusal both stay on screen.
    expect(
      within(peopleSection())
        .getAllByLabelText("Name")
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["Tenant One"]);
    expect(screen.getAllByRole("alert").map((node) => node.textContent)).toContain(
      "Another operator changed the people and signer roles. Your entries are kept; review the current list before saving again.",
    );
    // Keeping them names the newer revision, so the next save is a deliberate replacement.
    nextPost = null;
    fireEvent.click(within(newer).getByRole("button", { name: "Keep my entries" }));
    fireEvent.click(screen.getByRole("button", { name: "Save people" }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].people).toMatchObject({
      expectedRevision: 1,
      entries: [{ fullName: "Tenant One" }],
    });
  });

  it("replaces the unsaved list with the saved one only when asked", async () => {
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Add this tenant" }));
    nextPost = {
      status: 409,
      body: { error: "Another operator changed the people and signer roles." },
    };
    current = view({
      record: {
        ...view().record!,
        people: {
          revision: 2,
          entries: [
            {
              personId: "20000000-0000-4000-8000-000000000009",
              kind: "person",
              fullName: "Colleague Entry",
              email: null,
              emailBasis: null,
              contactRef: null,
              roles: [],
            },
          ],
        },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save people" }));
    const button = await screen.findByRole("button", { name: "Use the saved list" });
    fireEvent.click(button);
    expect(
      within(peopleSection())
        .getAllByLabelText("Name")
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["Colleague Entry"]);
    expect(document.querySelector("[data-packet-newer-list]")).toBeNull();
  });

  it("keeps signer positions valid: a new person comes next, and removals close gaps in the existing order", async () => {
    const tenant = (n: number, name: string, order: number) => ({
      personId: `20000000-0000-4000-8000-00000000000${n}`,
      kind: "person" as const,
      fullName: name,
      email: null,
      emailBasis: null,
      contactRef: null,
      roles: [{ signerRole: "tenant" as const, order, dotloopRole: "TENANT" as const }],
    });
    current = view({
      record: {
        ...view().record!,
        people: {
          revision: 1,
          // Listed first but signing second.
          entries: [tenant(1, "Avery", 2), tenant(2, "Blake", 1), tenant(3, "Casey", 3)],
        },
      },
    });
    await openEditor(<PacketInputsEditor leaseId="701" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Add a person" }));
    const rows = () =>
      [...document.querySelectorAll("[data-packet-person]")] as HTMLElement[];
    expect(within(rows()[3]).getByLabelText("Tenant (position 4)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove this person" }));
    // Removing Casey keeps Blake first and Avery second.
    fireEvent.click(screen.getByRole("button", { name: "Remove Casey" }));
    expect(within(rows()[0]).getByLabelText("Tenant (position 2)")).toBeTruthy();
    expect(within(rows()[1]).getByLabelText("Tenant (position 1)")).toBeTruthy();
    // Unchecking Blake's role closes the gap: Avery signs first.
    fireEvent.click(within(rows()[1]).getByLabelText("Tenant (position 1)"));
    expect(within(rows()[0]).getByLabelText("Tenant (position 1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save people" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    const saved = (
      posts[0].people as { entries: Array<{ fullName: string; roles: unknown[] }> }
    ).entries;
    expect(saved.map((entry) => [entry.fullName, entry.roles])).toEqual([
      ["Avery", [{ signerRole: "tenant", order: 1, dotloopRole: "TENANT" }]],
      ["Blake", []],
    ]);
  });
});
