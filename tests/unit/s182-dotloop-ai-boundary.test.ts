// S182 ARCH-S182-2 / AC-S182-5 / AC-S182-6 (fail-first): Dotloop API-derived values are removed by
// lineage before the assistant's renewal context is assembled, while the same packet's PMI-sourced
// facts stay. The non-AI desk view keeps its operational data. The saved-history filter drops
// provider branches of a mixed record without relabeling or inferring provenance from values.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  carriesDotloopOriginMarker,
  DOTLOOP_ORIGIN_REMOVED_TEXT,
  packetSnapshotForAiContext,
  withoutDotloopOriginMarkers,
} from "@/lib/ai-boundary/dotloop-origin";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";

const fixture = vi.hoisted(() => ({
  project: vi.fn(),
  packets: vi.fn(),
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => ({}) }));
vi.mock("@/lib/lease-renewal/live-config", () => ({
  buildLiveRenewalConfig: () => ({
    ok: true,
    rentvineClient: {},
    sheetsReader: {},
    spreadsheetId: "isolated-fixture-sheet",
  }),
}));
vi.mock("@/lib/lease-renewal/admitted-notice-source", () => ({
  readCoherentRenewalDisplaySource: async () => ({
    snapshot: {
      views: [{ leaseID: "9001" }],
      complete: true,
      detailComplete: true,
      detailUnavailableCount: 0,
      readAtMs: Date.parse("2026-10-07T12:00:00Z"),
    },
    currency: {
      state: "fresh",
      ageMs: 0,
      readAtMs: 0,
      refreshing: false,
      lastError: false,
    },
    statusTable: { status: "available", statuses: [], readAtMs: 0 },
  }),
}));
vi.mock("@/lib/lease-renewal/sheet-links", () => ({
  readRenewalSheetGridsWithLinks: async () => ({
    tables: [],
    tableJoinIds: [],
    tableRentvineSourceUrls: [],
    titles: ["Lease Renewal"],
  }),
}));
vi.mock("@/lib/lease-renewal/live-desk", () => ({
  loadLiveRenewalDesk: fixture.project,
}));
vi.mock("@/lib/firestore/lease-renewal-progress", () => ({
  listAllRenewalProgress: async () => new Map(),
}));
vi.mock("@/lib/firestore/renewal-workspace", () => ({
  listRenewalWorkspaces: async () => new Map(),
}));
vi.mock("@/lib/firestore/renewal-work-status", () => ({
  listRenewalWorkStatuses: async () => new Map(),
}));
vi.mock("@/lib/firestore/lease-renewal-notice-rules", () => ({
  readNoticeRuleSnapshot: async () => ({ state: "current" }),
}));
vi.mock("@/lib/firestore/lease-renewal-move-out-timing-basis", () => ({
  readMoveOutTimingBasisSnapshot: async () => ({
    state: "missing",
    basis: null,
    version: null,
    updatedAtIso: null,
  }),
}));
vi.mock("@/lib/firestore/lease-renewal-follow-up-attention", () => ({
  listDismissedRenewalFollowUpKeys: async () => [],
}));
vi.mock("@/lib/firestore/lease-renewal-resolutions", () => ({
  listResolutionsForRun: async () => [],
}));
vi.mock("@/lib/firestore/lease-renewal-term-reviews", () => ({
  listLeaseTermReviews: async () => new Map(),
}));
vi.mock("@/lib/firestore/renewal-working-record", () => ({
  listRenewalWorkingRecords: async () => new Map(),
}));
vi.mock("@/lib/firestore/lease-document-packet-snapshots", () => ({
  listCurrentRenewalPacketSnapshots: fixture.packets,
}));
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: () => ({ listCommunications: async () => [] }),
}));

import { runRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";

const SENTINELS = [
  "SENTINEL-LOOP-7731",
  "SENTINEL_LOOP_STATUS",
  "SENTINEL-DOC-NAME",
  "SENTINEL-PROVIDER-DOC-88",
];

function sentinelPacket(): RenewalPacketSnapshot {
  return {
    snapshotId: "packet_1",
    snapshotVersion: 2,
    actorUid: "editor-a",
    createdAt: "2026-10-07T11:00:00.000Z",
    previousSnapshotId: "packet_0",
    current: true,
    state: "Ready for preview",
    visibleState: "Partially executed",
    payloadHash: "a".repeat(64),
    // The PMI-sourced evaluation part: kept for the assistant.
    manifest: {
      fields: [
        {
          factKey: "property.address",
          displayValue: "100 Fixture Way",
          source: { system: "rentvine", reference: "lease:9001" },
        },
      ],
    },
    execution: {
      idempotencyKey: "k".repeat(64),
      receiptId: "receipt-1",
      state: "Partially executed",
      loopLink: {
        loopId: "SENTINEL-LOOP-7731",
        loopUrl: "https://www.dotloop.com/m/loop?viewId=SENTINEL-LOOP-7731",
        profileId: "profile-1",
        templateId: "template-1",
        packetSnapshotHash: "a".repeat(64),
        readBackAtIso: "2026-10-07T11:30:00.000Z",
        // The same address Dotloop echoes back: equal value, provider lineage.
        loopStatus: "SENTINEL_LOOP_STATUS",
        participantCount: 3,
        documentCount: 2,
      },
      documentEvidence: [
        {
          receiptId: "receipt-2",
          providerRef: "SENTINEL-PROVIDER-DOC-88",
          evidenceLevel: "presence_only",
          documentId: "SENTINEL-PROVIDER-DOC-88",
          documentName: "SENTINEL-DOC-NAME",
          submittedContentHash: "b".repeat(64),
        },
      ],
    },
  } as unknown as RenewalPacketSnapshot;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("S182 lineage filter (AC-S182-6)", () => {
  it("drops the provider execution branch and keeps the packet's PMI facts", () => {
    const filtered = packetSnapshotForAiContext(sentinelPacket())!;
    const text = JSON.stringify(filtered);
    for (const sentinel of SENTINELS) expect(text).not.toContain(sentinel);
    expect(filtered.execution).toBeUndefined();
    expect(filtered.visibleState).toBe("Ready for preview");
    expect(text).toContain("100 Fixture Way");
  });

  it("removes provider branches of a mixed record and keeps independent siblings", () => {
    const record = {
      title: "100 Fixture Way",
      detail: "Tenant: Jordan Fixture",
      facts: [
        "Rent 1,250 (RentVine)",
        "Loop https://www.dotloop.com/m/loop?viewId=SENTINEL-LOOP-7731",
        "Reference dotloop-receipt:SENTINEL-RECEIPT",
      ],
      notes: "See https://www.dotloop.com/my/documents/SENTINEL-DOC-NAME",
      loopStatus: "SENTINEL_LOOP_STATUS",
      items: [
        { id: "a", detail: "Owner approved the renewal" },
        { id: "b", providerRef: "SENTINEL-PROVIDER-DOC-88" },
      ],
    };
    const { value, removed } = withoutDotloopOriginMarkers(record);
    const text = JSON.stringify(value);
    for (const sentinel of [...SENTINELS, "SENTINEL-RECEIPT"])
      expect(text).not.toContain(sentinel);
    expect(value).toEqual({
      title: "100 Fixture Way",
      detail: "Tenant: Jordan Fixture",
      facts: ["Rent 1,250 (RentVine)"],
      notes: DOTLOOP_ORIGIN_REMOVED_TEXT,
      items: [{ id: "a", detail: "Owner approved the renewal" }, { id: "b" }],
    });
    expect(removed).toBe(5);
    // The input itself is untouched.
    expect(record.items).toHaveLength(2);
  });

  it("decides by marker and lineage, never by an equal value", () => {
    expect(carriesDotloopOriginMarker("https://www.dotloop.com/m/loop?viewId=1")).toBe(
      true,
    );
    expect(carriesDotloopOriginMarker("dotloop:profile:42")).toBe(true);
    // A staff-configured general Dotloop page is not an API object.
    expect(carriesDotloopOriginMarker("https://www.dotloop.com/support")).toBe(false);
    // The same address string Dotloop echoes stays usable as the PMI fact it is.
    expect(carriesDotloopOriginMarker("100 Fixture Way")).toBe(false);
  });
});

describe("S182 the assistant's renewal source (AC-S182-5)", () => {
  function setup() {
    fixture.packets.mockResolvedValue(new Map([["9001", sentinelPacket()]]));
    fixture.project.mockResolvedValue({ status: "ok" });
  }
  const actor = {
    uid: "editor-a",
    email: "editor-a@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor" as const,
  };

  it("never hands Dotloop-derived packet data to the assistant's context assembly", async () => {
    setup();
    await runRenewalAssistantSource(actor, new Date("2026-10-07T12:00:00Z"), null, {
      aiContext: true,
    });
    const packets = fixture.project.mock.calls[0][6] as Map<
      string,
      RenewalPacketSnapshot
    >;
    const text = JSON.stringify([...packets.values()]);
    for (const sentinel of SENTINELS) expect(text).not.toContain(sentinel);
    expect(text).toContain("100 Fixture Way");
  });

  it("keeps the operational desk view unchanged (it is not an AI sink)", async () => {
    setup();
    await runRenewalAssistantSource(actor, new Date("2026-10-07T12:00:00Z"));
    const packets = fixture.project.mock.calls[0][6] as Map<
      string,
      RenewalPacketSnapshot
    >;
    expect(packets.get("9001")?.execution?.loopLink?.loopId).toBe("SENTINEL-LOOP-7731");
  });
});
