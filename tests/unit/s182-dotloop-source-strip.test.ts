// S182 AC-S182-5 / AC-S182-6: the assistant's renewal read takes packet state from the real packet
// store and removes every Dotloop-derived value before the desk projection that feeds AI context:
// loop names and addresses, participants, provider statuses and document names, whatever a provider
// readback recorded. The packet's PMI facts stay, including a value equal to one Dotloop returned.
// This source-side strip, not the saved-history cut, is what keeps such values out of the assistant.

import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import { readyS66Input } from "@/tests/fixtures/s66-packet";

const state = vi.hoisted(() => ({
  db: null as unknown as Firestore,
  project: vi.fn(),
}));

vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
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
vi.mock("@/lib/lease-renewal/live-desk", () => ({ loadLiveRenewalDesk: state.project }));
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
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: () => ({ listCommunications: async () => [] }),
}));

import { savePacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import { runRenewalAssistantSource } from "@/lib/lease-renewal/assistant-source";

const admin: AuthenticatedUser = {
  uid: "admin-a",
  email: "admin-a@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};
const editor: AuthenticatedUser = {
  uid: "editor-a",
  email: "editor-a@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const NOW = new Date("2026-10-07T12:00:00Z");

// Every kind of Dotloop-derived value a readback can record for a packet.
const DOTLOOP_SENTINELS = {
  loopId: "SENTINEL-LOOP-ID",
  loopName: "SENTINEL Loop Name",
  loopUrl: "https://www.dotloop.com/m/loop?viewId=SENTINEL-LOOP-ID",
  profileId: "SENTINEL-PROFILE",
  templateId: "SENTINEL-TEMPLATE",
  loopStatus: "SENTINEL_LOOP_STATUS",
  participantName: "SENTINEL Dotloop Agent",
  participantEmail: "sentinel-agent@example.test",
  documentName: "SENTINEL Renewal Addendum.pdf",
  documentId: "SENTINEL-DOC-ID",
  providerRef: "SENTINEL-PROVIDER-REF",
  errorClass: "SENTINEL_PROVIDER_ERROR",
  executionState: "Partially executed",
};
// The packet's own RentVine-sourced participant, which Dotloop also echoes back as an equal value.
const PMI_PARTICIPANT = "fixture-tenant-a";

function jsonOf(value: unknown): string {
  return JSON.stringify(value, (_key, child) =>
    child instanceof Map ? Object.fromEntries(child) : child,
  );
}

async function seedPacketWithProviderReadback() {
  const fake = new FakeFirestore();
  state.db = fake as unknown as Firestore;
  const snapshot = await savePacketSnapshot(
    admin,
    {
      evaluation: evaluateRenewalPacket({
        ...readyS66Input(),
        leaseId: "9001",
        transactionId: "9001",
      }),
      expectedCurrentSnapshotId: null,
    },
    state.db,
  );
  // What a provider readback recorded on the packet's execution projection, including fields the
  // projection type does not name, as an unreviewed later readback might.
  fake.seed(`lease_document_packet_execution_projections/${snapshot.snapshotId}`, {
    snapshot_id: snapshot.snapshotId,
    idempotency_key: "k".repeat(64),
    state: DOTLOOP_SENTINELS.executionState,
    receipt_id: "receipt-1",
    error_class: DOTLOOP_SENTINELS.errorClass,
    loop_link: {
      loop_id: DOTLOOP_SENTINELS.loopId,
      loop_url: DOTLOOP_SENTINELS.loopUrl,
      loop_name: DOTLOOP_SENTINELS.loopName,
      profile_id: DOTLOOP_SENTINELS.profileId,
      template_id: DOTLOOP_SENTINELS.templateId,
      packet_snapshot_hash: snapshot.payloadHash,
      read_back_at: "2026-10-07T11:30:00.000Z",
      loop_status: DOTLOOP_SENTINELS.loopStatus,
      participant_count: 2,
      document_count: 1,
    },
    participants: [
      {
        full_name: DOTLOOP_SENTINELS.participantName,
        email: DOTLOOP_SENTINELS.participantEmail,
        role: "LISTING_AGENT",
      },
      { participant_ref: PMI_PARTICIPANT, role: "TENANT" },
    ],
    document_evidence: [
      {
        receiptId: "receipt-2",
        providerRef: DOTLOOP_SENTINELS.providerRef,
        evidenceLevel: "presence_only",
        documentId: DOTLOOP_SENTINELS.documentId,
        documentName: DOTLOOP_SENTINELS.documentName,
        submittedContentHash: "b".repeat(64),
      },
    ],
  });
  return snapshot;
}

beforeEach(() => {
  state.project.mockReset();
  state.project.mockResolvedValue({ status: "ok" });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("S182 the assistant's renewal read strips Dotloop data at the source", () => {
  it("hands the desk projection no loop name, participant, status or document name", async () => {
    await seedPacketWithProviderReadback();
    await runRenewalAssistantSource(editor, NOW, null, { aiContext: true });
    expect(state.project).toHaveBeenCalledTimes(1);
    // Everything the projection that feeds the assistant receives, not only the packet map.
    const everything = jsonOf(state.project.mock.calls[0]);
    for (const [kind, sentinel] of Object.entries(DOTLOOP_SENTINELS))
      expect(everything, kind).not.toContain(sentinel);
    expect(everything).not.toContain("dotloop.com");

    const packet = (
      state.project.mock.calls[0][6] as Map<string, RenewalPacketSnapshot | null>
    ).get("9001")!;
    // The packet's PMI evaluation stays, including the participant Dotloop echoed back.
    expect(packet.execution).toBeUndefined();
    expect(packet.visibleState).toBe(packet.state);
    expect(packet.manifest?.participants.map((p) => p.participantId)).toContain(
      PMI_PARTICIPANT,
    );
    expect(packet.manifest?.fields.length).toBeGreaterThan(0);
  });

  it("keeps the operational desk read whole; it is not an AI sink", async () => {
    await seedPacketWithProviderReadback();
    await runRenewalAssistantSource(editor, NOW);
    const packet = (
      state.project.mock.calls[0][6] as Map<string, RenewalPacketSnapshot | null>
    ).get("9001")!;
    expect(packet.visibleState).toBe(DOTLOOP_SENTINELS.executionState);
    expect(packet.execution?.loopLink).toMatchObject({
      loopId: DOTLOOP_SENTINELS.loopId,
      loopStatus: DOTLOOP_SENTINELS.loopStatus,
    });
    expect(packet.execution?.documentEvidence?.[0].documentName).toBe(
      DOTLOOP_SENTINELS.documentName,
    );
  });
});
