import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

// Wiring test for the LIVE renewal-notice-draft route: the OWNER channel resolves its recipient through
// the read-only property -> portfolio -> contact join and drafts for real; it blocks honestly when the
// join cannot resolve; and the TENANT channel is untouched (no property/portfolio/contact reads).
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
  getApprovedRentSuggestion: vi.fn(),
  firestore: undefined as unknown,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/lease-renewal-rent-suggestion-approvals", () => ({
  getApprovedRentSuggestion: mocks.getApprovedRentSuggestion,
}));

// The route now drives the REAL S20 ledger, so give it an in-memory Firestore and an explicit
// Production+Live descriptor. That makes these wiring tests exercise the committed one-attempt
// contract end to end instead of stopping at the service boundary.
vi.mock("@/lib/firestore/admin", () => ({
  getAdminFirestore: () => mocks.firestore,
}));

vi.mock("@/lib/environment/descriptor", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/environment/descriptor")>();
  return {
    ...actual,
    requireEnvironmentDescriptor: () => ({
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    }),
  };
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
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import {
  clearLiveLeaseCache,
  getLiveLeaseViews,
} from "@/lib/lease-renewal/live-lease-cache";

interface ClientOverrides {
  exportRows?: Record<string, unknown>[];
  lease?: Record<string, unknown>;
  property?: Record<string, unknown>;
  portfolio?: Record<string, unknown>;
  contact?: Record<string, unknown>;
}

function fakeClient(overrides: ClientOverrides = {}) {
  const listAllLeasesExport = vi.fn(async () => ({
    rows: overrides.exportRows ?? [
      {
        lease: {
          leaseID: 42,
          endDate: "2026-09-30",
          tenants: [{ name: "Ada Rowan", email: "tenant42@northend-apts.com" }],
        },
        unit: { rent: 1400 },
        property: { streetName: "200 Cedar Ct" },
        // S61: the export row's own owner array — the renewal owner channel resolves from HERE
        // (measured 305/305 portfolio-wide), never through the removed contact join.
        portfolio: {
          owners: [{ name: "Cedar Holdings", email: "owner42@cedar-holdings.com" }],
        },
      },
    ],
    pages: 1,
    complete: true,
  }));
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
    listAllLeasesExport,
    getLease,
    getProperty,
    getPortfolio,
    getContact,
  };
  return {
    client,
    listAllLeasesExport,
    getLease,
    getProperty,
    getPortfolio,
    getContact,
  };
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

type Confirmation = { executionId: string; previewHash: string };

const ownerBody = (confirm?: Confirmation) => ({
  leaseId: "42",
  ...(confirm ? { confirm } : {}),
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

const tenantBody = (confirm?: Confirmation) => ({
  leaseId: "42",
  ...(confirm ? { confirm } : {}),
  offer: { channel: "tenant", ownerDecision: "increase", offeredRent: 1550 },
});

beforeEach(() => {
  runtimeSuspension.current = { status: "clear" };
  mocks.firestore = new FakeFirestore();
  clearLiveLeaseCache();
  mocks.requireCapabilityInSpace.mockResolvedValue({
    email: "josiah@pmikcmetro.com",
    uid: "editor-1",
  });
  // Default: no Admin-approved suggestion for this lease (the operator's own numbers are used).
  mocks.getApprovedRentSuggestion.mockResolvedValue(null);
});

afterEach(() => {
  clearLiveLeaseCache();
  vi.clearAllMocks();
});

describe("renewal-notice-draft route — owner channel via the live join", () => {
  it("returns a distinct runtime 409 before RentVine or Gmail construction", async () => {
    runtimeSuspension.current = { status: "global_suspended" };

    const response = await POST(req(ownerBody()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      action_key: "gmail.renewal_notice.draft_create",
      error_type: "action_runtime_suspended",
    });
    expect(mocks.buildLiveRentVineConfig).not.toHaveBeenCalled();
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
  });

  // AC-S58-3: composing refuses expired lease data with an explicit reason and creates nothing.
  it("refuses with 409 lease_data_expired when the live snapshot is past the hard max age", async () => {
    const { client } = fakeClient();
    // Seed the shared cache at t0 with a healthy read, then advance past the hard max with the
    // provider failing, so the served snapshot is expired-and-unrefreshable.
    const t0 = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(t0);
    try {
      await getLiveLeaseViews(
        client as unknown as Parameters<typeof getLiveLeaseViews>[0],
        t0,
      );
      const { client: failingClient } = fakeClient();
      failingClient.listAllLeasesExport = vi.fn(async () => {
        throw new Error("provider down");
      }) as never;
      useClient(failingClient);
      nowSpy.mockReturnValue(t0 + 16 * 60_000);

      const response = await POST(req(tenantBody()));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error_type: "lease_data_expired",
      });
      expect(createDraftMock).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("previews a real owner draft resolved from the export row's own owners (no join reads)", async () => {
    const { client, getContact, getProperty, getPortfolio } = fakeClient();
    useClient(client);

    const response = await POST(req(ownerBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("preview");
    expect(payload.channel).toBe("owner");
    expect(payload.recipient.to).toBe("owner42@cedar-holdings.com");
    // S61: the contact join is gone — the owner channel makes no extra RentVine reads.
    expect(getProperty).not.toHaveBeenCalled();
    expect(getPortfolio).not.toHaveBeenCalled();
    expect(getContact).not.toHaveBeenCalled();
    expect(GmailRuntimeClient).not.toHaveBeenCalled();
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  // AC-S61-1 + AC-S61-1b: the LIVE route fans out to every owner of record — to plus a cc entry
  // per other distinct owner address — not merely the resolver in isolation.
  it("addresses every owner of record on the live route: first To, the rest Cc", async () => {
    const { client } = fakeClient({
      exportRows: [
        {
          lease: {
            leaseID: 42,
            endDate: "2026-09-30",
            tenants: [{ name: "Ada Rowan", email: "tenant42@northend-apts.com" }],
          },
          unit: { rent: 1400 },
          property: { streetName: "200 Cedar Ct" },
          portfolio: {
            owners: [
              { name: "Owner One", email: "owner.one@cedar-holdings.com" },
              { name: "Owner Two", email: "owner.two@cedar-holdings.com" },
              { name: "Owner Two Again", email: "OWNER.TWO@cedar-holdings.com" },
              { name: "Owner Three", email: "owner.three@cedar-holdings.com" },
            ],
          },
        },
      ],
    });
    useClient(client);

    const response = await POST(req(ownerBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("preview");
    expect(payload.recipient.to).toBe("owner.one@cedar-holdings.com");
    // Deduplicated (AC-S61-2) and in the portfolio's own order (Q-OWNER-ORDERING).
    expect(payload.recipient.cc).toEqual([
      "owner.two@cedar-holdings.com",
      "owner.three@cedar-holdings.com",
    ]);
  });

  // AC-S61-7 falsification: a crafted lease whose tenant address also resolves as an owner
  // address refuses BOTH channels naming the collision; the clean lease drafts normally (the
  // preceding tests are the clean half).
  it("refuses both channels when an address resolves on owner AND tenant for the same lease", async () => {
    const collidingRows = [
      {
        lease: {
          leaseID: 42,
          endDate: "2026-09-30",
          tenants: [{ name: "Ada Rowan", email: "shared@cedar-holdings.com" }],
        },
        unit: { rent: 1400 },
        property: { streetName: "200 Cedar Ct" },
        portfolio: {
          owners: [
            { name: "Owner One", email: "owner.one@cedar-holdings.com" },
            { name: "Shared Person", email: "shared@cedar-holdings.com" },
          ],
        },
      },
    ];
    const owner = fakeClient({ exportRows: collidingRows });
    useClient(owner.client);
    const ownerPayload = await (await POST(req(ownerBody()))).json();
    expect(ownerPayload.status).toBe("blocked");
    expect(ownerPayload.reasons.join(" ")).toContain("Channel separation");
    expect(ownerPayload.reasons.join(" ")).toContain("shared@cedar-holdings.com");
    expect(createDraftMock).not.toHaveBeenCalled();

    clearLiveLeaseCache();
    const tenant = fakeClient({ exportRows: collidingRows });
    useClient(tenant.client);
    const tenantPayload = await (await POST(req(tenantBody()))).json();
    expect(tenantPayload.status).toBe("blocked");
    expect(tenantPayload.reasons.join(" ")).toContain("Channel separation");
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("creates a real unsent owner draft only for a prepared, exactly-confirmed execution", async () => {
    const { client } = fakeClient();
    useClient(client);

    const previewed = await (await POST(req(ownerBody()))).json();
    expect(previewed.status).toBe("preview");
    expect(createDraftMock).not.toHaveBeenCalled();

    const response = await POST(
      req(
        ownerBody({
          executionId: previewed.executionId,
          previewHash: previewed.previewHash,
        }),
      ),
    );
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

  it("injects the server-resolved Admin-approved comp-derived number into the owner draft (S29)", async () => {
    const { client } = fakeClient();
    useClient(client);
    // The server (not the client body) supplies the Admin-approved number; the strict schema omits it.
    mocks.getApprovedRentSuggestion.mockResolvedValue({
      approvalId: "42",
      value: 2350,
      comps: [
        { rent: 2200, source: "Zillow low" },
        { rent: 2500, source: "Zillow high" },
      ],
    });

    const response = await POST(req(ownerBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("preview");
    // The Admin-approved 2350 is carried, taking precedence over the operator's own 1550.
    expect(payload.body).toContain("$2,350");
    expect(payload.body).not.toContain("$1,550");
    expect(mocks.getApprovedRentSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "editor-1" }),
      "42",
      // S60 (AC-S60-10): the re-verify recomputes against the authoritative live rent (1400 in the
      // fake export row for lease 42).
      1400,
    );
  });

  it("leaves the owner draft on the operator's own number when there is no Admin approval (S29)", async () => {
    const { client } = fakeClient();
    useClient(client);
    mocks.getApprovedRentSuggestion.mockResolvedValue(null);

    const response = await POST(req(ownerBody()));
    const payload = await response.json();

    expect(payload.status).toBe("preview");
    // No approval → the operator's own PMI number is used, unchanged.
    expect(payload.body).toContain("$1,550");
  });

  // AC-S61-6: no authoritative owner address on the export row → Needs Verification, no guess.
  it("blocks honestly (never invents) when the export row carries no owner email", async () => {
    const { client } = fakeClient({
      exportRows: [
        {
          lease: {
            leaseID: 42,
            endDate: "2026-09-30",
            tenants: [{ name: "Ada Rowan", email: "tenant42@northend-apts.com" }],
          },
          unit: { rent: 1400 },
          property: { streetName: "200 Cedar Ct" },
          portfolio: { owners: [{ name: "No Email Owner" }] },
        },
      ],
    });
    useClient(client);

    const response = await POST(req(ownerBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("blocked");
    expect(payload.channel).toBe("owner");
    expect(payload.reasons.join(" ")).toMatch(/needs verification/i);
    expect(createDraftMock).not.toHaveBeenCalled();
  });
});

describe("renewal-notice-draft route — tenant channel is unchanged", () => {
  it("previews a tenant draft and makes NO property/portfolio/contact reads", async () => {
    const { client, getLease, getProperty, getPortfolio, getContact } = fakeClient();
    useClient(client);

    const response = await POST(req(tenantBody()));
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

    const previewed = await (await POST(req(tenantBody()))).json();
    expect(previewed.status).toBe("preview");

    const response = await POST(
      req(
        tenantBody({
          executionId: previewed.executionId,
          previewHash: previewed.previewHash,
        }),
      ),
    );
    const payload = await response.json();

    expect(payload.status).toBe("created");
    expect(payload.recipient.to).toBe("tenant42@northend-apts.com");
    expect(createDraftMock).toHaveBeenCalledTimes(1);
    expect(getProperty).not.toHaveBeenCalled();
    expect(getPortfolio).not.toHaveBeenCalled();
    expect(getContact).not.toHaveBeenCalled();
  });
});
