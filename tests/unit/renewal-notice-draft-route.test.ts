import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtimeSuspension = vi.hoisted(() => ({
  current: { status: "clear" } as { status: string },
}));
vi.mock("@/lib/firestore/runtime-action-suspensions", () => ({
  readRuntimeActionSuspension: vi.fn(async () => runtimeSuspension.current),
}));

// Compatibility route: new drafts migrate to the current reviewed message flow, while a historical
// exact attempt can still be reconciled through the real S20 ledger with deterministic providers.
const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  buildLiveRentVineConfig: vi.fn(),
  buildLiveRenewalConfig: vi.fn(),
  loadLiveOwnerCurrentRentDecision: vi.fn(),
  listResolutionsForRun: vi.fn(),
  getApprovedRentSuggestion: vi.fn(),
  loadCompScreenshotAttachment: vi.fn(),
  resolveCompScreenshotAttachment: vi.fn(),
  firestore: undefined as unknown,
}));

vi.mock("@/lib/auth/session", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/auth/session")>();
  return { ...actual, requireCapabilityInSpace: mocks.requireCapabilityInSpace };
});

vi.mock("@/lib/firestore/lease-renewal-rent-suggestion-approvals", () => ({
  getApprovedRentSuggestion: mocks.getApprovedRentSuggestion,
}));

vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listResolutionsForRun: mocks.listResolutionsForRun,
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
  return {
    ...actual,
    buildLiveRenewalConfig: mocks.buildLiveRenewalConfig,
    buildLiveRentVineConfig: mocks.buildLiveRentVineConfig,
  };
});

vi.mock("@/lib/lease-renewal/live-desk", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/lease-renewal/live-desk")>();
  return {
    ...actual,
    loadLiveOwnerCurrentRentDecision: mocks.loadLiveOwnerCurrentRentDecision,
  };
});

vi.mock("@/lib/lease-renewal/comp-screenshot-runtime", () => ({
  buildLiveCompScreenshotRuntime: () => ({
    deps: { store: {} },
    context: {},
  }),
}));

vi.mock("@/lib/lease-renewal/comp-screenshot-attachment-runtime", () => ({
  loadCurrentRenewalDraftCompScreenshotAttachment: mocks.loadCompScreenshotAttachment,
  resolveRenewalDraftCompScreenshotAttachment: mocks.resolveCompScreenshotAttachment,
}));

// These route wiring tests preserve the eventual approved-copy execution branch. Production's
// current review-only registry is exercised separately by the service/copy-publication tests; this
// fixture exists only inside Vitest and can never be published by the application.
vi.mock("@/lib/lease-renewal/renewal-copy-governance", async (importActual) => {
  const actual =
    await importActual<typeof import("@/lib/lease-renewal/renewal-copy-governance")>();
  const { RENEWAL_COPY_TEMPLATE_SOURCES } =
    await import("@/lib/lease-renewal/renewal-copy-contract");
  const approved = {
    owner: actual.createRenewalCopyTemplate({
      source: RENEWAL_COPY_TEMPLATE_SOURCES.owner,
      publication: {
        status: "approved",
        approvedAtIso: "2026-08-30T00:00:00.000Z",
        evidenceRef: "client-approval:route-fixture-owner",
      },
    }),
    tenant: actual.createRenewalCopyTemplate({
      source: RENEWAL_COPY_TEMPLATE_SOURCES.tenant,
      publication: {
        status: "approved",
        approvedAtIso: "2026-08-30T00:00:00.000Z",
        evidenceRef: "client-approval:route-fixture-tenant",
      },
    }),
  };
  return {
    ...actual,
    currentRenewalCopyTemplate: (channel: "owner" | "tenant") => approved[channel],
  };
});

// Historical recovery remains available after an independent later owner decision.
const progressMocks = vi.hoisted(() => ({
  current: null as null | { ownerOutcome?: { state: string } },
}));
vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  getRenewalProgress: async () => progressMocks.current,
  recordTenantOfferDraft: async () => undefined,
}));

const { createDraftMock, findDraftMock, getDraftByIdMock } = vi.hoisted(() => ({
  createDraftMock: vi.fn(async () => ({ draftId: "draft_owner_1" })),
  findDraftMock: vi.fn(async () => null as { draftId: string } | null),
  getDraftByIdMock: vi.fn(),
}));
vi.mock("@/lib/gmail-runtime/client", () => ({
  GmailRuntimeClient: vi.fn(function (
    this: {
      subject: string;
      createDraft: unknown;
      findDraftByRfcMessageId: unknown;
      getDraftById: unknown;
    },
    opts: { subject: string },
  ) {
    // The draft provider guards that the action sender matches the client's authenticated mailbox, so
    // the fake must carry the subject it was constructed with (lowercased, as the real client stores it).
    this.subject = opts.subject.trim().toLowerCase();
    this.createDraft = createDraftMock;
    this.findDraftByRfcMessageId = findDraftMock;
    this.getDraftById = getDraftByIdMock;
  }),
  GmailRuntimeError: class GmailRuntimeError extends Error {},
}));

import { POST } from "@/app/api/lease-renewal/renewal-notice-draft/route";
import { GmailRuntimeClient } from "@/lib/gmail-runtime/client";
import { encodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import { FakeTransactionalFirestore as FakeFirestore } from "@/tests/helpers/fake-transactional-firestore";
import {
  prepareRenewalNoticeDraft,
  finalizeRenewalNoticeDraft,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-service";
import { buildRenewalNoticeDraftPreview } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import { currentRenewalCopyTemplate } from "@/lib/lease-renewal/renewal-copy-governance";
import { leaseAddressLabel } from "@/lib/integrations/rentvine/lease-mapper";
import { compScreenshotDraftAttachmentIdentity } from "@/lib/lease-renewal/comp-screenshot-attachment";
import { RenewalNoticeDraftRequestSchema } from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import {
  clearLiveLeaseCache,
  getLiveLeaseViews,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  TEST_COMP_SCREENSHOT_ATTACHMENT,
  TEST_RENEWAL_ATTACHMENT_BYTES,
  TEST_RESOLVED_RENEWAL_ATTACHMENT,
} from "@/tests/helpers/renewal-draft-attachment";

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
  // S102: the lease detail carries the tenant's base rent; the owner join still reads propertyID.
  const getLease = vi.fn(async () => ({
    baseRentAmount: 1400,
    ...(overrides.lease ?? { leaseID: 42, propertyID: 7 }),
  }));
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

function configureClient(client: unknown) {
  mocks.buildLiveRentVineConfig.mockReturnValue({ ok: true, rentvineClient: client });
  mocks.buildLiveRenewalConfig.mockReturnValue({
    ok: true,
    rentvineClient: client,
    sheetsReader: {},
    spreadsheetId: "fixture-operating-sheet",
  });
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
    role: "Editor",
    hd: "pmikcmetro.com",
  });
  // Default: no Admin-approved suggestion for this lease (the operator's own numbers are used).
  mocks.getApprovedRentSuggestion.mockResolvedValue(null);
  mocks.listResolutionsForRun.mockResolvedValue([]);
  mocks.loadLiveOwnerCurrentRentDecision.mockResolvedValue({
    status: "ok",
    decision: {
      currentRent: 1400,
      currentRentEvidence: {
        agreement: "agree",
        currencyState: "fresh",
        readAtIso: "2026-08-26T13:00:00.000Z",
      },
    },
  });
  mocks.loadCompScreenshotAttachment.mockResolvedValue(TEST_COMP_SCREENSHOT_ATTACHMENT);
  mocks.resolveCompScreenshotAttachment.mockResolvedValue(
    TEST_RESOLVED_RENEWAL_ATTACHMENT,
  );
  getDraftByIdMock.mockImplementation(async (draftId: string) => {
    const input = (
      createDraftMock.mock.calls as unknown as Array<
        [
          {
            to: string;
            cc?: string[];
            subject: string;
            body: string;
            messageId?: string;
            attachment?: { filename: string; mimeType: string; bytes: Uint8Array };
          },
        ]
      >
    ).at(-1)?.[0] as
      | {
          to: string;
          cc?: string[];
          subject: string;
          body: string;
          messageId?: string;
          attachment?: { filename: string; mimeType: string; bytes: Uint8Array };
        }
      | undefined;
    if (!input) throw new Error("No draft input was captured.");
    return {
      draftId,
      raw: encodeRawDraft({
        ...input,
        from: "josiah@pmikcmetro.com",
      }),
    };
  });
});

afterEach(() => {
  clearLiveLeaseCache();
  vi.clearAllMocks();
});

// Current creation parity is exercised by s113-sheet-route (real current-message controls,
// routes and claims), s116-complete-recipients and renewal-notice-draft-service (transport).
// This compatibility endpoint preserves recovery; it cannot supply an alternate creation path.
describe("legacy renewal draft migration and recovery", () => {
  it.each(["owner", "tenant"] as const)(
    "refuses old %s preview and confirmation before all live dependencies",
    async (channel) => {
      for (const confirm of [
        undefined,
        { executionId: `exec_${"a".repeat(40)}`, previewHash: "b".repeat(64) },
      ]) {
        const body = channel === "owner" ? ownerBody(confirm) : tenantBody(confirm);
        const response = await POST(req(body));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          error_type: "current_message_review_required",
          href: `/lease-renewal/live/desk/lease/42#renewal-section-${channel}`,
        });
      }
      expect(mocks.buildLiveRentVineConfig).not.toHaveBeenCalled();
      expect(GmailRuntimeClient).not.toHaveBeenCalled();
      expect(createDraftMock).not.toHaveBeenCalled();
    },
  );
  it.each(["clear", "global_suspended"])(
    "cannot bypass reviewed admission when runtime is %s",
    async (status) => {
      runtimeSuspension.current = { status };
      const response = await POST(
        req(
          ownerBody({
            executionId: `exec_${"c".repeat(40)}`,
            previewHash: "d".repeat(64),
          }),
        ),
      );
      expect(response.status).toBe(409);
      expect(createDraftMock).not.toHaveBeenCalled();
      expect(mocks.buildLiveRentVineConfig).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...tenantBody(), confirm: true },
    {
      leaseId: "42",
      offer: { channel: "tenant", ownerDecision: "increase", offeredRent: "1550" },
    },
    {
      leaseId: "42",
      offer: { channel: "tenant", ownerDecision: "increase", offeredRent: 0 },
    },
    {
      leaseId: "42",
      offer: { channel: "owner", market: { rangeLow: 1700, rangeHigh: 1500 } },
    },
    {
      ...tenantBody(),
      reconcile: { executionId: `exec_${"a".repeat(40)}` },
      confirm: { executionId: `exec_${"a".repeat(40)}`, previewHash: "b".repeat(64) },
    },
  ])("rejects malformed or mixed original requests before dependencies", async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(mocks.buildLiveRentVineConfig).not.toHaveBeenCalled();
    expect(createDraftMock).not.toHaveBeenCalled();
  });
  async function historicalAttempt() {
    const { client } = fakeClient();
    configureClient(client);
    const leases = await getLiveLeaseViews(client, Date.now());
    const actor = await mocks.requireCapabilityInSpace();
    const prepared = await prepareRenewalNoticeDraft(
      {
        actor,
        loadLease: async () => leases[0],
        createGmailClient: () => {
          throw new Error("No creation during historic seeding");
        },
      },
      {
        request: RenewalNoticeDraftRequestSchema.parse(tenantBody()),
        mailbox: { email: actor.email, sourceRef: `app:session:${actor.uid}` },
      },
    );
    if (prepared.status !== "preview")
      throw new Error("Expected exact historic preparation");
    const db = mocks.firestore as FakeFirestore;
    const path = `action_executions/${prepared.executionId}`;
    // Synthetic representation of a pre-migration, already-consumed provider attempt. No new
    // creation or claim is invoked to manufacture this historical recovery state.
    db.seed(path, {
      ...db.read(path),
      state: "Needs reconciliation",
      attempt_count: 1,
      claim_actor_uid: actor.uid,
    });
    return { prepared, db, path };
  }
  it("recovers a historical lost-response attempt during suspension without a new claim or draft", async () => {
    const { prepared, db, path } = await historicalAttempt();
    runtimeSuspension.current = { status: "global_suspended" };
    findDraftMock.mockResolvedValueOnce({ draftId: "synthetic-recovered" });
    const response = await POST(
      req({ ...tenantBody(), reconcile: { executionId: prepared.executionId } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      executionId: prepared.executionId,
      draftId: "synthetic-recovered",
    });
    expect(db.read(path)).toMatchObject({ state: "Succeeded", attempt_count: 1 });
    expect(findDraftMock).toHaveBeenCalledOnce();
    expect(createDraftMock).not.toHaveBeenCalled();
  });
  it("keeps a missing historical effect unresolved and does not replay creation", async () => {
    const { prepared, db, path } = await historicalAttempt();
    findDraftMock.mockResolvedValueOnce(null);
    const response = await POST(
      req({ ...tenantBody(), reconcile: { executionId: prepared.executionId } }),
    );
    expect(await response.json()).toMatchObject({
      status: "reconciliation",
      resolution: "not_found",
    });
    expect(db.read(path)).toMatchObject({
      state: "Needs reconciliation",
      attempt_count: 1,
    });
    expect(createDraftMock).not.toHaveBeenCalled();
  });
  it("recovers an already-attempted tenant draft after a later owner decline without creating again", async () => {
    const { prepared, db, path } = await historicalAttempt();
    progressMocks.current = { ownerOutcome: { state: "declined_non_renewal" } };
    findDraftMock.mockResolvedValueOnce({ draftId: "synthetic-recovered" });
    const response = await POST(
      req({ ...tenantBody(), reconcile: { executionId: prepared.executionId } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      executionId: prepared.executionId,
    });
    expect(db.read(path)).toMatchObject({ state: "Succeeded", attempt_count: 1 });
    expect(findDraftMock).toHaveBeenCalledOnce();
    expect(createDraftMock).not.toHaveBeenCalled();
  });
  it("reconstructs the exact legacy owner date formatting for original-receipt recovery", async () => {
    const { client } = fakeClient();
    configureClient(client);
    const [lease] = await getLiveLeaseViews(client, Date.now());
    const actor = await mocks.requireCapabilityInSpace();
    const attachment = compScreenshotDraftAttachmentIdentity(
      TEST_COMP_SCREENSHOT_ATTACHMENT,
    );
    const mailbox = { email: actor.email, sourceRef: `app:session:${actor.uid}` };
    const input = {
      channel: "owner" as const,
      lease,
      mailbox,
      workflowId: "renewal-live:42",
      actionId: "renewal-notice-draft:owner:42",
      workflowContext: "renewal:42",
      sourceRefs: [
        "rentvine:lease:42",
        `comp-screenshot-receipt:${attachment.receiptId}`,
      ],
      copyTemplate: currentRenewalCopyTemplate("owner"),
      attachment,
      decision: {
        addressLabel: leaseAddressLabel(lease)!,
        currentRent: 1400,
        currentRentEvidence: {
          agreement: "agree" as const,
          currencyState: "fresh" as const,
          readAtIso: "2026-08-26T13:00:00.000Z",
        },
        market: {
          ...ownerBody().offer.market,
          compScreenshotAttachment: {
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
            sha256Checksum: attachment.sha256Checksum,
          },
        },
      },
    };
    const legacy = buildRenewalNoticeDraftPreview(input, "legacy_receipt");
    const displayed = buildRenewalNoticeDraftPreview(input);
    if (legacy.status !== "ready" || displayed.status !== "ready")
      throw new Error("Expected synthetic previews");
    expect(legacy.action).not.toEqual(displayed.action);
    const prepared = await finalizeRenewalNoticeDraft(
      legacy,
      RenewalNoticeDraftRequestSchema.parse(ownerBody()),
      mailbox,
      {
        actor,
        loadLease: async () => lease,
        createGmailClient: () => {
          throw new Error("No creation while seeding history");
        },
      },
    );
    if (prepared.status !== "preview") throw new Error("Expected historic preparation");
    const db = mocks.firestore as FakeFirestore,
      path = `action_executions/${prepared.executionId}`;
    db.seed(path, {
      ...db.read(path),
      state: "Needs reconciliation",
      attempt_count: 1,
      claim_actor_uid: actor.uid,
    });
    findDraftMock.mockImplementationOnce(async () => ({
      draftId: "synthetic-owner-recovered",
      raw: encodeRawDraft({
        from: String(legacy.action.values.from),
        to: String(legacy.action.values.to),
        subject: String(legacy.action.values.subject),
        body: String(legacy.action.values.body),
        messageId: String(legacy.action.values.rfc_message_id),
        attachment: {
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          bytes: TEST_RENEWAL_ATTACHMENT_BYTES,
        },
      }),
    }));
    const response = await POST(
      req({ ...ownerBody(), reconcile: { executionId: prepared.executionId } }),
    );
    expect(await response.json()).toMatchObject({
      status: "reconciliation",
      resolution: "created",
      draftId: "synthetic-owner-recovered",
    });
    expect(createDraftMock).not.toHaveBeenCalled();
    expect(findDraftMock).toHaveBeenCalledOnce();
    // The browser cannot ask the current creation endpoint for legacy formatting.
    expect(
      (await POST(req({ ...ownerBody(), legacyReceiptFormatting: true }))).status,
    ).toBe(400);
  });
  it("refuses changed original inputs and another actor's historical receipt", async () => {
    const { prepared } = await historicalAttempt();
    const changed = tenantBody();
    changed.offer.offeredRent = 1600;
    expect(
      await (
        await POST(req({ ...changed, reconcile: { executionId: prepared.executionId } }))
      ).json(),
    ).toMatchObject({ status: "reconciliation", resolution: "needs_review" });
    mocks.requireCapabilityInSpace.mockResolvedValue({
      email: "other@pmikcmetro.com",
      uid: "other",
      role: "Editor",
      hd: "pmikcmetro.com",
    });
    const response = await POST(
      req({ ...tenantBody(), reconcile: { executionId: prepared.executionId } }),
    );
    expect(response.status).toBe(404); // Another actor cannot discover the historical receipt.
    expect(findDraftMock).not.toHaveBeenCalled();
    expect(createDraftMock).not.toHaveBeenCalled();
  });
});
