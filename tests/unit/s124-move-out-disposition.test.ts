import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  RentVineClient,
  unwrapLeaseStatuses,
  type RentVineHttpRequest,
  type RentVineHttpResponse,
  type RentVineHttpTransport,
  type RentVineLeaseStatus,
} from "@/lib/integrations/rentvine/client";
import {
  applyLeaseDetailToView,
  leaseDetailOf,
  leaseViewsFromExport,
  markLeaseDetailUnavailable,
} from "@/lib/integrations/rentvine/lease-mapper";
import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  buildActiveFilterChips,
  parseRenewalDeskQueryV2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import { buildSuppliedRenewalDraftPreview } from "@/lib/lease-renewal/execution/supplied-renewal-draft-preview";
import {
  clearLeaseStatusTableCache,
  readLeaseStatusTable,
} from "@/lib/lease-renewal/lease-status-table";
import {
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/live-desk";
import {
  clearLiveLeaseCache,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  MOVE_OUT_DESK_FILTERS,
  matchesMoveOutFilter,
  moveOutIndicatorLabel,
  projectMoveOutDisposition,
  type LeaseStatusTableRead,
} from "@/lib/lease-renewal/move-out-disposition";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  SHEET_WRITEBACK_FLAG,
  isOperatingSheetWritebackPaused,
} from "@/lib/lease-renewal/sheet-writeback-policy";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
} from "@/lib/lease-renewal/workspace-state";
import {
  applyFakeLeaseDetail,
  withFakeLeaseDetail,
} from "@/tests/helpers/rentvine-detail-fake";

// S124 (F03): the move-out disposition is typed, source-attributed and fail-closed over the
// documented RentVine lease status table and lease detail; it filters the desk without losing rows
// and blocks ordinary renewal drafts server-side for a confirmed notice. It writes nothing. All
// values here are synthetic; the status table mirrors the documented flag shape, not customer data.

const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

function status(
  id: string,
  name: string,
  primary: string,
  flags: Partial<
    Pick<RentVineLeaseStatus, "isPendingMoveOutStatus" | "isCompletedMoveOutStatus">
  > = {},
): RentVineLeaseStatus {
  return {
    leaseStatusID: id,
    name,
    primaryLeaseStatusID: primary,
    isPendingMoveOutStatus: flags.isPendingMoveOutStatus ?? false,
    isCompletedMoveOutStatus: flags.isCompletedMoveOutStatus ?? false,
    isPendingMoveInStatus: primary === "1",
    isSystemStatus: true,
  };
}

/** The documented account table shape: flags, not names, carry the meaning. */
const STATUSES: RentVineLeaseStatus[] = [
  status("1", "Pending", "1"),
  status("2", "Active", "2"),
  status("3", "Active - Notice Given", "2", { isPendingMoveOutStatus: true }),
  status("4", "Active - Vacated", "2", { isPendingMoveOutStatus: true }),
  status("6", "Closed", "3"),
  status("7", "Closed - Moved Out", "3"),
];
const TABLE: LeaseStatusTableRead = { status: "available", statuses: STATUSES };

function leaseView(
  id: string,
  lease: Record<string, unknown>,
  detail: Record<string, unknown> | "unavailable" = {},
) {
  const [view] = leaseViewsFromExport([
    {
      lease: { leaseID: id, endDate: "2026-08-31", ...lease },
      unit: { rent: "1200.00" },
    },
  ]);
  if (detail === "unavailable") markLeaseDetailUnavailable(view);
  else
    applyLeaseDetailToView(view, {
      baseRentAmount: 1200,
      rentAmount: 1200,
      isMonthToMonth: "0",
      leaseStatusID: lease.leaseStatusID ?? null,
      noticeDate: null,
      expectedMoveOutDate: null,
      moveOutDate: null,
      ...detail,
    });
  return view;
}

const disposition = (
  lease: ReturnType<typeof leaseView>,
  overrides: Partial<Parameters<typeof projectMoveOutDisposition>[0]> = {},
) =>
  projectMoveOutDisposition({
    lease,
    statusTable: TABLE,
    freshness: "fresh",
    observedAtIso: READ_TS,
    ...overrides,
  });

function jsonResponse(statusCode: number, body: unknown): RentVineHttpResponse {
  const text = JSON.stringify(body);
  return {
    status: statusCode,
    headers: {},
    text: async () => text,
    json: async () => JSON.parse(text) as unknown,
  };
}

function makeClient(handler: (request: RentVineHttpRequest) => RentVineHttpResponse) {
  const requests: RentVineHttpRequest[] = [];
  const transport: RentVineHttpTransport = {
    async send(request) {
      requests.push(request);
      return handler(request);
    },
  };
  return {
    requests,
    client: new RentVineClient(
      {
        baseUrl: "https://pmikcmetro.rentvine.com/api/manager",
        apiKey: "demo-key",
        apiSecret: "demo-secret",
      },
      transport,
    ),
  };
}

const RAW_STATUS_ROWS = [
  {
    leaseStatusID: "2",
    name: "Active",
    primaryLeaseStatusID: "2",
    isPendingMoveOutStatus: "0",
    isCompletedMoveOutStatus: "0",
    isPendingMoveInStatus: "0",
    isSystemStatus: "1",
    orderIndex: "2",
  },
  {
    leaseStatusID: "3",
    name: "Active - Notice Given",
    primaryLeaseStatusID: "2",
    isPendingMoveOutStatus: "1",
    isCompletedMoveOutStatus: "0",
    isPendingMoveInStatus: "0",
    isSystemStatus: "0",
    orderIndex: "3",
  },
];

beforeEach(() => {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});
afterEach(() => vi.unstubAllEnvs());

describe("S124 read contract (AC-S124-1)", () => {
  it("reads the documented lease status table with GET leases/statuses and decodes the provider flags", async () => {
    const { client, requests } = makeClient(() => jsonResponse(200, RAW_STATUS_ROWS));
    const statuses = await client.listLeaseStatuses();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe(
      "https://pmikcmetro.rentvine.com/api/manager/leases/statuses",
    );
    expect(statuses).toEqual([
      expect.objectContaining({
        leaseStatusID: "2",
        name: "Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
      }),
      expect.objectContaining({
        leaseStatusID: "3",
        name: "Active - Notice Given",
        isPendingMoveOutStatus: true,
      }),
    ]);
    // Envelope and malformed shapes: unwrapped or refused, never guessed.
    expect(unwrapLeaseStatuses({ leaseStatuses: RAW_STATUS_ROWS })).toHaveLength(2);
    expect(unwrapLeaseStatuses([{ leaseStatus: RAW_STATUS_ROWS[1] }])[0].name).toBe(
      "Active - Notice Given",
    );
    expect(() => unwrapLeaseStatuses({ nope: true })).toThrow(/lease status/i);
    expect(() => unwrapLeaseStatuses([{ name: "No id" }])).toThrow(/lease status/i);
  });

  it("carries the notice fields from the lease detail into the typed view without inventing them", () => {
    const [view] = leaseViewsFromExport([
      { lease: { leaseID: "9", endDate: "2026-08-31", leaseStatusID: "3" } },
    ]);
    applyLeaseDetailToView(view, {
      baseRentAmount: 1000,
      leaseStatusID: "3",
      noticeDate: "2026-07-01 00:00:00",
      expectedMoveOutDate: "2026-08-31",
      moveOutDate: "",
    });
    expect(leaseDetailOf(view)).toMatchObject({
      status: "available",
      leaseStatusId: "3",
      noticeDate: "2026-07-01",
      expectedMoveOutDate: "2026-08-31",
      moveOutDate: null,
    });
    // The legacy moveOutDate lease-end alias stays what it was; the detail never rewrites endDate.
    expect(view.endDate).toBe("2026-08-31");
  });

  it("memoizes one status-table read, never caches a failure, and reports a missing reader as unavailable", async () => {
    let calls = 0;
    const reader = {
      listLeaseStatuses: async () => {
        calls += 1;
        if (calls === 1) throw new Error("provider down");
        return STATUSES;
      },
    };
    expect(await readLeaseStatusTable(reader, 1_000)).toEqual({ status: "unavailable" });
    expect(await readLeaseStatusTable(reader, 2_000)).toMatchObject({
      status: "available",
    });
    expect(await readLeaseStatusTable(reader, 3_000)).toMatchObject({
      status: "available",
    });
    expect(calls).toBe(2);
    expect(await readLeaseStatusTable({}, 4_000)).toEqual({ status: "unavailable" });
  });

  it("never treats an end date, a legacy moveOutDate alias or an expected move-out date alone as a notice", () => {
    const dateOnly = leaseView("1", { leaseStatusID: "2", moveOutDate: "2026-08-31" });
    expect(disposition(dateOnly).state).toBe("not_initiated");
    const expectedOnly = leaseView(
      "2",
      { leaseStatusID: "2" },
      { expectedMoveOutDate: "2026-08-31" },
    );
    const conflict = disposition(expectedOnly);
    expect(conflict).toMatchObject({
      state: "unknown",
      reason: "notice_evidence_without_status",
    });
    expect(conflict.label).toContain("Review");
    expect(conflict.evidence.expectedMoveOutIso).toBe("2026-08-31");
  });
});

describe("S124 typed attributed disposition (AC-S124-2, AC-S124-6)", () => {
  it("resolves positive, explicit negative, absent, unresolved, closed, unavailable and stale evidence distinctly", () => {
    const initiated = disposition(
      leaseView(
        "3",
        { leaseStatusID: "3" },
        { noticeDate: "2026-07-01", expectedMoveOutDate: "2026-08-31" },
      ),
    );
    expect(initiated).toMatchObject({
      state: "initiated",
      reason: "notice_status",
      freshness: "fresh",
      observedAtIso: READ_TS,
      evidence: {
        origin: "rentvine_lease_status",
        leaseId: "3",
        statusId: "3",
        statusName: "Active - Notice Given",
        pendingMoveOut: true,
        noticeDateIso: "2026-07-01",
        expectedMoveOutIso: "2026-08-31",
      },
    });
    expect(initiated.label).toContain(
      "Move-out initiated in RentVine: Active - Notice Given",
    );
    expect(initiated.label).toContain("non-renewal handoff");
    expect(moveOutIndicatorLabel(initiated)).toBe(
      "Move-out initiated (Active - Notice Given)",
    );

    const negative = disposition(leaseView("2", { leaseStatusID: "2" }));
    expect(negative).toMatchObject({
      state: "not_initiated",
      reason: "active_without_notice",
    });
    expect(negative.label).toBe("No move-out notice in RentVine (Active).");

    expect(disposition(leaseView("5", {}, { leaseStatusID: null }))).toMatchObject({
      state: "unknown",
      reason: "lease_status_missing",
    });
    expect(disposition(leaseView("6", { leaseStatusID: "42" }))).toMatchObject({
      state: "unknown",
      reason: "status_unresolved",
    });
    expect(disposition(leaseView("7", { leaseStatusID: "7" }))).toMatchObject({
      state: "unknown",
      reason: "lease_not_active",
    });
    expect(
      disposition(leaseView("8", { leaseStatusID: "2" }, "unavailable")),
    ).toMatchObject({ state: "unknown", reason: "detail_unavailable" });
    expect(
      disposition(leaseView("9", { leaseStatusID: "2" }), {
        statusTable: { status: "unavailable" },
      }),
    ).toMatchObject({ state: "unknown", reason: "status_table_unavailable" });
    // An expired read cannot prove the absence of a notice; a positive keeps its evidence, labeled.
    expect(
      disposition(leaseView("10", { leaseStatusID: "2" }), { freshness: "expired" }),
    ).toMatchObject({ state: "unknown", reason: "stale_source" });
    const stalePositive = disposition(leaseView("11", { leaseStatusID: "3" }), {
      freshness: "expired",
    });
    expect(stalePositive.state).toBe("initiated");
    expect(stalePositive.label).toContain("expired");
  });

  it("keys on the documented flag, not the status name, and keeps a completed move-out status initiated", () => {
    const customTable: LeaseStatusTableRead = {
      status: "available",
      statuses: [
        status("2", "Active", "2"),
        status("12", "Custom holdover", "2", { isPendingMoveOutStatus: true }),
        status("13", "Active - Notice Given", "2"),
        status("14", "Moved out", "3", { isCompletedMoveOutStatus: true }),
      ],
    };
    expect(
      disposition(leaseView("1", { leaseStatusID: "12" }), { statusTable: customTable })
        .state,
    ).toBe("initiated");
    expect(
      disposition(leaseView("2", { leaseStatusID: "13" }), { statusTable: customTable })
        .state,
    ).toBe("not_initiated");
    expect(
      disposition(leaseView("3", { leaseStatusID: "14" }), { statusTable: customTable }),
    ).toMatchObject({ state: "initiated", evidence: { completedMoveOut: true } });
  });

  it("AC-S124-6: withdrawal needs prior app-owned evidence, stays a review case beside a manual non-renewal, and never crosses lease identities", () => {
    const active = leaseView("21", { leaseStatusID: "2" });
    expect(disposition(active).state).toBe("not_initiated");
    const withdrawn = disposition(active, {
      prior: { state: "initiated", observedAtIso: "2026-06-01T00:00:00.000Z" },
    });
    expect(withdrawn).toMatchObject({
      state: "withdrawn",
      reason: "withdrawn_after_prior_notice",
    });
    expect(withdrawn.label).toContain("2026-06-01");
    expect(withdrawn.label).toContain("manual non-renewal decision");
    // The staff non-renewal decision is a separate fact the filter unions, never merges.
    expect(matchesMoveOutFilter("non_renewal", "withdrawn", true)).toBe(true);
    expect(matchesMoveOutFilter("non_renewal", "withdrawn", false)).toBe(false);
    expect(matchesMoveOutFilter("initiated", "withdrawn", true)).toBe(false);
    // Same address, different lease ids: each lease carries only its own status evidence.
    const formerTenancy = leaseView(
      "30",
      { leaseStatusID: "7", propertyID: "77" },
      { noticeDate: "2026-01-15", moveOutDate: "2026-02-28" },
    );
    const newTenancy = leaseView("31", { leaseStatusID: "2", propertyID: "77" });
    expect(disposition(formerTenancy).evidence.leaseId).toBe("30");
    expect(disposition(newTenancy)).toMatchObject({
      state: "not_initiated",
      evidence: { leaseId: "31", noticeDateIso: null, moveOutIso: null },
    });
  });

  it("filters distinguish include-only, exclude-confirmed, unknown and all without an absent key becoming a negative", () => {
    expect(MOVE_OUT_DESK_FILTERS).toEqual([
      "all",
      "initiated",
      "exclude_initiated",
      "unknown",
      "not_initiated",
      "non_renewal",
    ]);
    expect(matchesMoveOutFilter("exclude_initiated", "initiated", false)).toBe(false);
    expect(matchesMoveOutFilter("exclude_initiated", "unknown", false)).toBe(true);
    expect(matchesMoveOutFilter("exclude_initiated", undefined, false)).toBe(true);
    expect(matchesMoveOutFilter("not_initiated", undefined, false)).toBe(false);
    expect(matchesMoveOutFilter("unknown", undefined, false)).toBe(true);
    expect(matchesMoveOutFilter("all", undefined, false)).toBe(true);
  });
});

describe("S124 desk integration (AC-S124-4, AC-S124-5)", () => {
  const rows = [
    {
      lease: {
        leaseID: 4821,
        endDate: "2026-08-31",
        leaseType: "Fixed Term",
        leaseStatusID: "3",
        primaryLeaseStatusID: "2",
        noticeDate: "2026-07-01",
        expectedMoveOutDate: "2026-08-31",
        tenants: [{ name: "Jordan Maple" }],
      },
      property: { name: "Maple Court", streetNumber: "4821", streetName: "Maple Ct" },
      unit: { rent: "1250.00" },
    },
    {
      lease: {
        leaseID: 5001,
        endDate: "2026-08-31",
        leaseType: "Fixed Term",
        leaseStatusID: "2",
        primaryLeaseStatusID: "2",
        tenants: [{ name: "Casey Rivers" }],
      },
      unit: { rent: "1400.00" },
    },
    {
      lease: {
        leaseID: 6002,
        endDate: "2026-09-30",
        leaseType: "Fixed Term",
        leaseStatusID: "2",
        primaryLeaseStatusID: "2",
        expectedMoveOutDate: "2026-09-30",
        tenants: [{ name: "Nomatch Tenant" }],
      },
      unit: { rent: "1100.00" },
    },
  ] as Record<string, unknown>[];

  function fakeSheetsReader() {
    return {
      listTabTitles: async () => ["Lease Renewal"],
      batchGet: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
      }),
      batchGetFormulas: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
      }),
    };
  }
  function config(statuses: RentVineLeaseStatus[] | "fail" = STATUSES) {
    let statusReads = 0;
    const client = withFakeLeaseDetail({
      listAllLeasesExport: async () => ({ rows, pages: 1, complete: true }),
      listLeaseStatuses: async () => {
        statusReads += 1;
        if (statuses === "fail") throw new Error("statuses unavailable");
        return statuses;
      },
    });
    return {
      statusReads: () => statusReads,
      config: {
        ok: true as const,
        rentvineClient: client,
        rentvineHost: "pmikcmetro.rentvine.com",
        sheetsReader: fakeSheetsReader(),
        spreadsheetId: "sheet-id",
      },
    };
  }
  function snapshotResult(): LiveLeaseSnapshotResult {
    const views = leaseViewsFromExport(rows);
    applyFakeLeaseDetail(views, rows);
    return {
      snapshot: {
        views,
        complete: true,
        readAtMs: Date.parse(READ_TS),
        detailComplete: true,
        detailUnavailableCount: 0,
      },
      currency: {
        state: "fresh",
        ageMs: 0,
        readAtMs: Date.parse(READ_TS),
        refreshing: false,
        lastError: false,
      },
    };
  }
  type DeskConfigArg = Parameters<typeof loadLiveRenewalDesk>[2];
  type WorkspaceConfigArg = Parameters<typeof loadLiveRenewalLeaseWorkspace>[2];

  it("attaches one attributed disposition per row, exposes the filter keys and keeps every row under each filter", async () => {
    const { config: cfg, statusReads } = config();
    const manual = new Map([
      [
        "5001",
        planRenewalWorkspaceAction(
          emptyRenewalWorkspace("5001", "1c0a4d7e-7d3b-4a6e-9f4c-2a5f9e6b8d10", {
            kind: "lease_end",
            dateIso: "2026-08-31",
            source: "RentVine lease end",
          }),
          {
            kind: "owner_response",
            outcome: "declined_non_renewal",
            source: "Owner call",
          },
          { actorUid: "operator", recordedAt: "2026-07-18T12:00:00.000Z", eventId: "e1" },
        ),
      ],
    ]);
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      cfg as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(),
      undefined,
      manual,
    );
    if (result.status !== "ok") throw new Error(result.status);
    expect(statusReads()).toBe(1);
    const byId = new Map(result.view.items.map((item) => [item.id, item]));
    expect(byId.get("4821")?.moveOut).toMatchObject({
      state: "initiated",
      evidence: { statusName: "Active - Notice Given", noticeDateIso: "2026-07-01" },
      freshness: "fresh",
    });
    expect(byId.get("5001")?.moveOut).toMatchObject({ state: "not_initiated" });
    expect(byId.get("6002")?.moveOut).toMatchObject({
      state: "unknown",
      reason: "notice_evidence_without_status",
    });
    expect(byId.get("4821")?.queryKeys.moveOut).toBe("initiated");
    expect(byId.get("5001")?.queryKeys.manualNonRenewal).toBe(true);
    expect(byId.get("4821")?.queryKeys.manualNonRenewal).toBe(false);
    // AC-S124-5: the provider notice creates no completion, handoff mark, or manual fact.
    expect(byId.get("4821")?.manualProgress).toBeUndefined();
    expect(manualRenewalSummary(manual.get("5001")!).nonRenewal).toBe(true);
    expect(manual.get("5001")?.completion).toBeNull();

    const items = result.view.items;
    const matcher = () => false;
    const ids = (filter: (typeof MOVE_OUT_DESK_FILTERS)[number]) =>
      applyRenewalDeskQueryV2(
        items,
        { ...DEFAULT_RENEWAL_DESK_QUERY_V2, moveOut: filter },
        matcher,
      ).items.map((item) => item.id);
    expect(ids("all")).toEqual(expect.arrayContaining(["4821", "5001", "6002"]));
    expect(ids("initiated")).toEqual(["4821"]);
    expect(ids("exclude_initiated").sort()).toEqual(["5001", "6002"]);
    expect(ids("unknown")).toEqual(["6002"]);
    expect(ids("non_renewal").sort()).toEqual(["4821", "5001"]);
    expect(ids("all")).toHaveLength(items.length);
  });

  it("reports every row unknown, not negative, when the status table cannot be read", async () => {
    const { config: cfg } = config("fail");
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      cfg as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(),
    );
    if (result.status !== "ok") throw new Error(result.status);
    for (const item of result.view.items) {
      expect(item.moveOut).toMatchObject({
        state: "unknown",
        reason: "status_table_unavailable",
      });
    }
    clearLiveLeaseCache();
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      cfg as unknown as WorkspaceConfigArg,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    expect(workspace.workspace.summary.moveOut?.state).toBe("unknown");
  });

  it("round-trips the move-out filter through the canonical query and its chip", () => {
    const parsed = parseRenewalDeskQueryV2(
      new URLSearchParams("moveOut=exclude_initiated"),
    );
    expect(parsed.moveOut).toBe("exclude_initiated");
    expect(parseRenewalDeskQueryV2(new URLSearchParams("moveOut=bogus")).moveOut).toBe(
      "all",
    );
    expect(serializeRenewalDeskQueryV2(parsed)).toContain("moveOut=exclude_initiated");
    expect(buildActiveFilterChips(parsed).map((chip) => chip.label)).toContain(
      "Exclude confirmed move-outs",
    );
    const keyed = withRenewalDeskQueryKeys({
      id: "1",
      addressLabel: "1 Main St",
      propertyNameLabel: null,
      tenantNameLabel: "T",
      tenantNameLabels: ["T"],
      ownerNameLabels: [],
      identity: { address: null, property: null, tenants: [], owners: [] },
      endDateIso: "2026-08-31",
      disposition: "actionable",
      reason: "actionable",
      reasonLabel: "Ready",
      leaseTerm: {
        term: "fixed_term",
        evidence: "provider_detail",
        anchorIso: null,
        nextReviewIso: null,
      } as never,
      currentRent: 1,
      unitListedRent: 1,
      leaseTotalRent: 1,
      retention: { state: "window", label: "" },
      processVersion: null,
      workflowStepId: null,
      stageIndex: -1,
      stageLabel: null,
      nextAction: null,
      openConflicts: 0,
    });
    expect(keyed.queryKeys.moveOut).toBeUndefined();
    expect(keyed.queryKeys.manualNonRenewal).toBe(false);
  });
});

describe("S124 outreach suppression (AC-S124-3) and preservation (AC-S124-7)", () => {
  const actor: AuthenticatedUser = {
    uid: "op-1",
    email: "op1@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  };
  const current = (moveOut: { state: string; label: string } | null) =>
    ({
      content: { channel: "owner", missing: [], sourceRefs: [] },
      saved: null,
      workspace: null,
      publication: { status: "approved", reason: "" },
      draftJournalAvailable: true,
      needsReview: false,
      signatureMatchesActor: true,
      lease: {},
      basis: {
        sourceFingerprint: "s",
        workspaceFingerprint: null,
        resourceFingerprint: "r",
      },
      attachment: null,
      moveOut,
    }) as unknown as Parameters<typeof buildSuppliedRenewalDraftPreview>[1];

  it("blocks a new ordinary renewal draft for a confirmed notice at the server preview, and only adds uncertainty for unknown", () => {
    const initiated = buildSuppliedRenewalDraftPreview(
      actor,
      current({
        state: "initiated",
        label: "Move-out initiated in RentVine: Active - Notice Given.",
      }),
    );
    expect(initiated.status).toBe("blocked");
    if (initiated.status !== "blocked") throw new Error("expected blocked");
    expect(initiated.reasons).toContain(
      "Move-out initiated in RentVine: Active - Notice Given.",
    );
    const unknown = buildSuppliedRenewalDraftPreview(
      actor,
      current({ state: "unknown", label: "Move-out evidence unknown." }),
    );
    expect(unknown.status).toBe("blocked");
    if (unknown.status !== "blocked") throw new Error("expected blocked");
    expect(unknown.reasons).not.toContain("Move-out evidence unknown.");
    const none = buildSuppliedRenewalDraftPreview(actor, current(null));
    expect(none.status).toBe("blocked");
    if (none.status !== "blocked") throw new Error("expected blocked");
    expect(none.reasons.some((reason) => /move-out/i.test(reason))).toBe(false);
  });

  it("AC-S124-7: the disposition is a pure read; the S128 pause stays in force", () => {
    vi.stubEnv(SHEET_WRITEBACK_FLAG, "false");
    const lease = leaseView("3", { leaseStatusID: "3" }, { noticeDate: "2026-07-01" });
    const before = JSON.stringify(lease);
    disposition(lease);
    expect(JSON.stringify(lease)).toBe(before);
    expect(isOperatingSheetWritebackPaused()).toBe(true);
  });
});
