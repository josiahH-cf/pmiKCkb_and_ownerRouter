import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wiring test for the LIVE renewal-notice-draft route: the OWNER channel resolves its recipient through
// the read-only property -> portfolio -> contact join and drafts for real; it blocks honestly when the
// join cannot resolve; and the TENANT channel is untouched (no property/portfolio/contact reads).
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/lease-renewal/live-config", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/lease-renewal/live-config")>();
  return { ...actual, buildLiveRentVineConfig: mocks.buildLiveRentVineConfig };
});

const { createDraftMock } = vi.hoisted(() => ({
  createDraftMock: vi.fn(async () => ({ draftId: "draft_owner_1" })),
}));
vi.mock("@/lib/gmail-runtime/client", () => ({
  GmailRuntimeClient: vi.fn(function (
    this: { subject: string; createDraft: unknown },
    opts: { subject: string },
  ) {
    // The draft provider guards that the action sender matches the client's authenticated mailbox, so
    // the fake must carry the subject it was constructed with (lowercased, as the real client stores it).
    this.subject = opts.subject.trim().toLowerCase();
    this.createDraft = createDraftMock;
  }),
  GmailRuntimeError: class GmailRuntimeError extends Error {},
}));

import { POST } from "@/app/api/lease-renewal/renewal-notice-draft/route";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";

interface ClientOverrides {
  exportRows?: Record<string, unknown>[];
  lease?: Record<string, unknown>;
  property?: Record<string, unknown>;
  portfolio?: Record<string, unknown>;
  contact?: Record<string, unknown>;
}

function fakeClient(overrides: ClientOverrides = {}) {
  const listLeasesExport = vi.fn(
    async () =>
      overrides.exportRows ?? [
        {
          lease: {
            leaseID: 42,
            endDate: "2026-09-30",
            tenants: [{ name: "Ada Rowan", email: "tenant42@northend-apts.com" }],
          },
          unit: { rent: 1400 },
          property: { streetName: "200 Cedar Ct" },
        },
      ],
  );
  const getLease = vi.fn(async () => overrides.lease ?? { leaseID: 42, propertyID: 7 });
  const getProperty = vi.fn(
    async () => overrides.property ?? { propertyID: 7, portfolioID: 9 },
  );
  const getPortfolio = vi.fn(
    async () =>
      overrides.portfolio ?? {
        contacts: [
          { contactID: 3, percentOwned: 60 },
          { contactID: 4, percentOwned: 40 },
        ],
      },
  );
  const getContact = vi.fn(
    async () => overrides.contact ?? { email: "owner42@cedar-holdings.com" },
  );
  const client = {
    listLeasesExport,
    getLease,
    getProperty,
    getPortfolio,
    getContact,
  };
  return { client, listLeasesExport, getLease, getProperty, getPortfolio, getContact };
}

function useClient(client: unknown) {
  mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });
}

function req(body: unknown) {
  return new Request("http://localhost/api/lease-renewal/renewal-notice-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ownerBody = (confirm: boolean) => ({
  leaseId: "42",
  confirm,
  offer: {
    channel: "owner",
    market: {
      specificNumber: 1550,
      rangeLow: 1450,
      rangeHigh: 1650,
      compsScreenshotRef: "drive://comps/cedar.png",
    },
  },
});

const tenantBody = (confirm: boolean) => ({
  leaseId: "42",
  confirm,
  offer: { channel: "tenant", ownerDecision: "increase", offeredRent: 1550 },
});

beforeEach(() => {
  clearLiveLeaseCache();
  mocks.requireCapabilityInSpace.mockResolvedValue({
    email: "josiah@pmikcmetro.com",
    uid: "editor-1",
  });
});

afterEach(() => {
  clearLiveLeaseCache();
  vi.clearAllMocks();
});

describe("renewal-notice-draft route — owner channel via the live join", () => {
  it("previews a real owner draft with the recipient resolved through the join", async () => {
    const { client, getContact } = fakeClient();
    useClient(client);

    const response = await POST(req(ownerBody(false)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("preview");
    expect(payload.channel).toBe("owner");
    expect(payload.recipient.to).toBe("owner42@cedar-holdings.com");
    expect(getContact).toHaveBeenCalledWith(3);
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("creates a real unsent owner draft on confirm", async () => {
    const { client } = fakeClient();
    useClient(client);

    const response = await POST(req(ownerBody(true)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("created");
    expect(payload.recipient.to).toBe("owner42@cedar-holdings.com");
    expect(payload.draftId).toBe("draft_owner_1");
    expect(createDraftMock).toHaveBeenCalledTimes(1);
    expect(createDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner42@cedar-holdings.com" }),
    );
  });

  it("blocks honestly (never invents) when the join cannot resolve the owner email", async () => {
    const { client } = fakeClient({ contact: { contactID: 3 } }); // contact has no email -> null
    useClient(client);

    const response = await POST(req(ownerBody(true)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("blocked");
    expect(payload.channel).toBe("owner");
    expect(payload.reasons.join(" ")).toMatch(/needs verification/i);
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("blocks honestly when the top ownership is ambiguous (a percentOwned tie)", async () => {
    const { client, getContact } = fakeClient({
      portfolio: {
        contacts: [
          { contactID: 3, percentOwned: 50 },
          { contactID: 4, percentOwned: 50 },
        ],
      },
    });
    useClient(client);

    const response = await POST(req(ownerBody(true)));
    const payload = await response.json();

    expect(payload.status).toBe("blocked");
    expect(getContact).not.toHaveBeenCalled();
    expect(createDraftMock).not.toHaveBeenCalled();
  });
});

describe("renewal-notice-draft route — tenant channel is unchanged", () => {
  it("previews a tenant draft and makes NO property/portfolio/contact reads", async () => {
    const { client, getLease, getProperty, getPortfolio, getContact } = fakeClient();
    useClient(client);

    const response = await POST(req(tenantBody(false)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("preview");
    expect(payload.channel).toBe("tenant");
    expect(payload.recipient.to).toBe("tenant42@northend-apts.com");
    // The owner-only join is never walked for the tenant channel.
    expect(getLease).not.toHaveBeenCalled();
    expect(getProperty).not.toHaveBeenCalled();
    expect(getPortfolio).not.toHaveBeenCalled();
    expect(getContact).not.toHaveBeenCalled();
  });

  it("creates a real unsent tenant draft on confirm with no owner-join reads", async () => {
    const { client, getProperty, getPortfolio, getContact } = fakeClient();
    useClient(client);

    const response = await POST(req(tenantBody(true)));
    const payload = await response.json();

    expect(payload.status).toBe("created");
    expect(payload.recipient.to).toBe("tenant42@northend-apts.com");
    expect(createDraftMock).toHaveBeenCalledTimes(1);
    expect(getProperty).not.toHaveBeenCalled();
    expect(getPortfolio).not.toHaveBeenCalled();
    expect(getContact).not.toHaveBeenCalled();
  });
});
