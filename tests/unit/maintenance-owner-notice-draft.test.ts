import { describe, expect, it, vi } from "vitest";

import { DRAFT_BANNER } from "@/lib/constants";
import type { RenewalDraftGmailClient } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import {
  resolveOwnerContactFromPropertyId,
  type PropertyOwnerClient,
} from "@/lib/lease-renewal/live-owner-recipient";
import {
  buildMaintenanceOwnerNoticeDraftAction,
  executeMaintenanceOwnerNoticeDraft,
} from "@/lib/maintenance/execution/owner-notice-draft-request";
import {
  prepareMaintenanceOwnerNoticeDraft,
  type MaintenanceOwnerNoticeDraftDeps,
} from "@/lib/maintenance/execution/owner-notice-draft-service";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";

// ---------------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------------

function liveTicket(
  overrides: Partial<MaintenanceTicketRecord> = {},
): MaintenanceTicketRecord {
  return {
    id: "ticket-1",
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "operator-set",
    summary: "Kitchen sink leak",
    description: "Water is visible below the kitchen sink after the faucet runs.",
    unit: { unitId: "unit:456", label: "512 Rosewood Ct" },
    photo_refs: [],
    reporter: { kind: "staff", uid: "u1" },
    labels: [],
    space_id: "maintenance-work-order-intake",
    created_at: "2026-07-23T10:00:00.000Z",
    updated_at: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

const OWNER = {
  email: "owner@cedar-holdings.com",
  sourceRef: "rentvine:property:7:portfolio:9:contact:3.email",
  name: "Cedar Holdings",
};

const MAILBOX = { email: "editor@pmikcmetro.com", sourceRef: "app:session:u1" };

function fakeGmailClient() {
  const createDraft = vi.fn(
    async (_input: { to: string; cc?: string[]; subject: string; body: string }) => ({
      draftId: "draft-123",
    }),
  );
  const send = vi.fn();
  const client = {
    subject: MAILBOX.email.toLowerCase(),
    createDraft,
    send,
  } as RenewalDraftGmailClient & { send: ReturnType<typeof vi.fn> };
  return { client, createDraft, send };
}

function deps(overrides: Partial<MaintenanceOwnerNoticeDraftDeps> = {}): {
  deps: MaintenanceOwnerNoticeDraftDeps;
  gmail: ReturnType<typeof fakeGmailClient>;
} {
  const gmail = fakeGmailClient();
  return {
    gmail,
    deps: {
      loadTicket: vi.fn(async () => liveTicket()),
      resolveOwner: vi.fn(async () => ({ ...OWNER })),
      createGmailClient: vi.fn(() => gmail.client),
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Service — preview / blocked / created (AC-S38-1..3)
// ---------------------------------------------------------------------------------------------------

describe("prepareMaintenanceOwnerNoticeDraft", () => {
  it("returns a preview with the server-resolved recipient and the review banner; creates no draft (AC-S38-1)", async () => {
    const { deps: d, gmail } = deps();
    const outcome = await prepareMaintenanceOwnerNoticeDraft(d, {
      ticketRef: "ticket-1",
      mailbox: MAILBOX,
      confirm: false,
    });

    expect(outcome.status).toBe("preview");
    if (outcome.status !== "preview") throw new Error("expected preview");
    // The recipient came from the server resolver, never from a form field.
    expect(outcome.recipient.to).toBe(OWNER.email);
    expect(outcome.recipient.sourceRef).toBe(OWNER.sourceRef);
    expect(outcome.body.startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
    expect(outcome.body).toContain("512 Rosewood Ct");
    expect(outcome.body).toContain("Cedar Holdings");
    // No Gmail client is constructed for a preview.
    expect(d.createGmailClient).not.toHaveBeenCalled();
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });

  it("blocks with a reason naming the owner when it does not resolve; never invents a recipient (AC-S38-2)", async () => {
    const { deps: d, gmail } = deps({ resolveOwner: vi.fn(async () => null) });
    const outcome = await prepareMaintenanceOwnerNoticeDraft(d, {
      ticketRef: "ticket-1",
      mailbox: MAILBOX,
      confirm: true,
    });

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") throw new Error("expected blocked");
    expect(outcome.reasons.join(" ")).toMatch(/owner/i);
    expect(d.createGmailClient).not.toHaveBeenCalled();
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });

  it("blocks a Test ticket without ever resolving an owner", async () => {
    const { deps: d } = deps({
      loadTicket: vi.fn(async () => liveTicket({ data_mode: "test" })),
    });
    const outcome = await prepareMaintenanceOwnerNoticeDraft(d, {
      ticketRef: "ticket-1",
      mailbox: MAILBOX,
      confirm: true,
    });

    expect(outcome.status).toBe("blocked");
    expect(d.resolveOwner).not.toHaveBeenCalled();
  });

  it("blocks an unmatched-unit ticket and never resolves an owner", async () => {
    const { deps: d } = deps({
      loadTicket: vi.fn(async () => liveTicket({ unit: null })),
    });
    const outcome = await prepareMaintenanceOwnerNoticeDraft(d, {
      ticketRef: "ticket-1",
      mailbox: MAILBOX,
      confirm: true,
    });

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") throw new Error("expected blocked");
    expect(outcome.reasons.join(" ")).toMatch(/match the location to a unit/i);
    expect(d.resolveOwner).not.toHaveBeenCalled();
  });

  it("creates a real UNSENT draft on confirm, through createDraft only; never sends (AC-S38-3)", async () => {
    const { deps: d, gmail } = deps();
    const outcome = await prepareMaintenanceOwnerNoticeDraft(d, {
      ticketRef: "ticket-1",
      mailbox: MAILBOX,
      confirm: true,
    });

    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") throw new Error("expected created");
    expect(outcome.draftId).toBe("draft-123");
    expect(gmail.createDraft).toHaveBeenCalledTimes(1);
    const draftArg = gmail.createDraft.mock.calls[0][0];
    expect(draftArg.to).toBe(OWNER.email);
    expect(String(draftArg.body).startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
    // The injected client is never asked to send.
    expect(gmail.send).not.toHaveBeenCalled();
  });

  it("throws a 404 when the ticket does not exist", async () => {
    const { deps: d } = deps({ loadTicket: vi.fn(async () => null) });
    await expect(
      prepareMaintenanceOwnerNoticeDraft(d, {
        ticketRef: "missing",
        mailbox: MAILBOX,
        confirm: false,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------------------------------
// Governed action assembly + execution guard
// ---------------------------------------------------------------------------------------------------

describe("buildMaintenanceOwnerNoticeDraftAction", () => {
  it("binds ticket_ref === workflowId, keys the recipient as `to`, and applies the banner once", () => {
    const action = buildMaintenanceOwnerNoticeDraftAction({
      ticketRef: "ticket-1",
      unitTag: "unit:456",
      recipient: { to: OWNER.email, sourceRef: OWNER.sourceRef },
      mailbox: MAILBOX,
      subject: "Maintenance request for 512 Rosewood Ct",
      body: "Hello Cedar Holdings,",
    });

    expect(action.actionKey).toBe("gmail.maintenance_owner_notice.draft_create");
    expect(action.workflowId).toBe("ticket-1");
    expect(action.values.ticket_ref).toBe("ticket-1");
    expect(action.values.template_ref).toBe("maintenance-owner:v1.0");
    expect(action.values.to).toBe(OWNER.email);
    expect(action.values.from).toBe(MAILBOX.email);
    expect(action.values.recipient_source_ref).toBe(OWNER.sourceRef);
    expect(action.values.mailbox_source_ref).toBe(MAILBOX.sourceRef);
    expect(action.values.draft_banner_present).toBe(true);
    expect(String(action.values.body).startsWith(`${DRAFT_BANNER}\n\n`)).toBe(true);
    // Banner is idempotent: re-wrapping an already-bannered body does not double it.
    const rewrapped = buildMaintenanceOwnerNoticeDraftAction({
      ticketRef: "ticket-1",
      unitTag: "unit:456",
      recipient: { to: OWNER.email, sourceRef: OWNER.sourceRef },
      mailbox: MAILBOX,
      subject: "s",
      body: String(action.values.body),
    });
    expect(rewrapped.values.body).toBe(action.values.body);
  });
});

describe("executeMaintenanceOwnerNoticeDraft (data-safety guard)", () => {
  const gmail = fakeGmailClient();

  it("refuses a non-authoritative (sample) recipient source before any draft", async () => {
    const action = buildMaintenanceOwnerNoticeDraftAction({
      ticketRef: "ticket-1",
      unitTag: "unit:456",
      recipient: { to: OWNER.email, sourceRef: "sample:owner:1" },
      mailbox: MAILBOX,
      subject: "s",
      body: "b",
    });
    await expect(
      executeMaintenanceOwnerNoticeDraft(gmail.client, action),
    ).rejects.toThrow();
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });

  it("refuses a non-routable (example.com) recipient before any draft", async () => {
    const action = buildMaintenanceOwnerNoticeDraftAction({
      ticketRef: "ticket-1",
      unitTag: "unit:456",
      recipient: { to: "owner@example.com", sourceRef: OWNER.sourceRef },
      mailbox: MAILBOX,
      subject: "s",
      body: "b",
    });
    await expect(
      executeMaintenanceOwnerNoticeDraft(gmail.client, action),
    ).rejects.toThrow();
    expect(gmail.createDraft).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------
// Property-anchored owner resolution (the S38a unblock)
// ---------------------------------------------------------------------------------------------------

interface OwnerFixtures {
  property?: Record<string, unknown>;
  portfolio?: Record<string, unknown>;
  contacts?: Record<string, Record<string, unknown>>;
}

function fakePropertyClient(fixtures: OwnerFixtures) {
  const getProperty = vi.fn(async () => {
    if (!fixtures.property) throw new Error("no property");
    return fixtures.property;
  });
  const getPortfolio = vi.fn(async () => {
    if (!fixtures.portfolio) throw new Error("no portfolio");
    return fixtures.portfolio;
  });
  const getContact = vi.fn(async (id: string | number) => {
    const contact = fixtures.contacts?.[String(id)];
    if (!contact) throw new Error("no contact");
    return contact;
  });
  const client: PropertyOwnerClient = { getProperty, getPortfolio, getContact };
  return { client, getProperty, getPortfolio, getContact };
}

const OWNER_FIXTURES: OwnerFixtures = {
  property: { propertyID: 7, portfolioID: 9 },
  portfolio: {
    contacts: [
      { contactID: 3, percentOwned: 60 },
      { contactID: 4, percentOwned: 40 },
    ],
  },
  contacts: {
    "3": {
      contactID: 3,
      email: "Owner@Cedar-Holdings.com",
      firstName: "Casey",
      lastName: "Owner",
    },
    "4": { contactID: 4, email: "minority@cedar-holdings.com" },
  },
};

describe("resolveOwnerContactFromPropertyId", () => {
  it("resolves the max-percentOwned contact from a known property id, with ids for the source ref", async () => {
    const { client, getProperty, getContact } = fakePropertyClient(OWNER_FIXTURES);
    const owner = await resolveOwnerContactFromPropertyId(client, 7);

    expect(getProperty).toHaveBeenCalledWith(7);
    expect(getContact).toHaveBeenCalledWith(3);
    expect(owner).toEqual({
      email: "owner@cedar-holdings.com",
      portfolioId: 9,
      contactId: 3,
      name: "Casey Owner",
    });
  });

  it("returns null (never guesses) when the property carries no portfolioID", async () => {
    const { client } = fakePropertyClient({
      ...OWNER_FIXTURES,
      property: { propertyID: 7 },
    });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
  });

  it("returns null when the top ownership is a tie", async () => {
    const { client } = fakePropertyClient({
      ...OWNER_FIXTURES,
      portfolio: {
        contacts: [
          { contactID: 3, percentOwned: 50 },
          { contactID: 4, percentOwned: 50 },
        ],
      },
    });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
  });

  it("returns null when the owning contact has no valid email", async () => {
    const { client } = fakePropertyClient({
      ...OWNER_FIXTURES,
      contacts: { "3": { contactID: 3, email: "not-an-email" } },
    });
    expect(await resolveOwnerContactFromPropertyId(client, 7)).toBeNull();
  });

  it("never throws when a hop read fails (returns null)", async () => {
    const { client } = fakePropertyClient({}); // property read throws
    await expect(resolveOwnerContactFromPropertyId(client, 7)).resolves.toBeNull();
  });
});
