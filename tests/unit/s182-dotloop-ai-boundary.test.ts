// S182 ARCH-S182-2 / AC-S182-5 / AC-S182-6 (fail-first): Dotloop API-derived values are removed by
// lineage before the assistant's renewal context is assembled, while the same packet's PMI-sourced
// facts stay. The non-AI desk view keeps its operational data. Saved history additionally cuts
// Dotloop resource addresses and the app's Dotloop references out of answer text, character for
// character, and never touches a help page, a working citation or the person's own question.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assistantAnswerForHistory,
  carriesDotloopOriginMarker,
  DOTLOOP_REFERENCE_REMOVED_TEXT,
  knowledgeAnswerForHistory,
  packetSnapshotForAiContext,
} from "@/lib/ai-boundary/dotloop-origin";
import {
  StoredAssistantAnswerSchema,
  StoredKnowledgeAnswerSchema,
  type StoredAssistantAnswer,
} from "@/lib/assistant-history/stored-answer";
import {
  conversationActorKey,
  runAssistantConversation,
} from "@/lib/assistant/conversation";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import {
  fakeOperationalContext,
  renewalsRead,
} from "@/tests/helpers/operational-context-fake";

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

  it("recognizes Dotloop resource addresses and app references, never a public page or an equal value", () => {
    for (const text of [
      HELP_ARTICLE,
      "https://www.dotloop.com/support",
      "https://www.dotloop.com/api-license-agreement/",
      "https://www.dotloop.com/",
      "https://auth.dotloop.com/oauth/authorize",
      "Dotloop:ready",
      "integrations@dotloop.com",
      // The same address string Dotloop echoes stays usable as the PMI fact it is.
      "100 Fixture Way",
    ])
      expect(carriesDotloopOriginMarker(text), text).toBe(false);
    for (const marker of [
      LOOP_LINK,
      API_PATH,
      "www.dotloop.com/my/documents/SENTINEL-DOC-NAME",
      "dotloop:profile:42",
      "dotloop-receipt:SENTINEL-RECEIPT",
    ])
      expect(carriesDotloopOriginMarker(`See ${marker}.`), marker).toBe(true);
  });
});

const LOOP_LINK = "https://www.dotloop.com/m/loop?viewId=SENTINEL-LOOP-7731";
const API_PATH =
  "https://api-gateway.dotloop.com/public/v2/profile/9/loop/SENTINEL-LOOP-7731/folder/4/document/88";
const HELP_ARTICLE =
  "https://support.dotloop.com/hc/en-us/articles/115005451128-Adding-Documents-to-a-Loop";

async function renewalAnswer(): Promise<StoredAssistantAnswer> {
  const context = fakeOperationalContext({
    actorUid: "editor-a",
    reads: {
      renewals: renewalsRead([
        { id: "L-1", endDateIso: "2026-10-02", tenants: ["Jordan Fixture"] },
        { id: "L-2", endDateIso: "2026-10-03" },
      ]),
    },
  });
  return StoredAssistantAnswerSchema.parse(
    await runAssistantConversation(
      { question: "What leases are due this week?", conversation: null },
      {
        nowIso: context.nowIso,
        actorKey: conversationActorKey("editor-a"),
        context,
        interpret: null,
      },
    ),
  );
}

describe("S182 saved history cuts Dotloop references, not permitted content (AC-S182-6)", () => {
  it("cuts only the resource address or reference and keeps the rest of the answer", async () => {
    const answer = await renewalAnswer();
    const question = `What leases are due this week? ${LOOP_LINK}`;
    const leaked = StoredAssistantAnswerSchema.parse({
      ...answer,
      conversation: {
        ...answer.conversation,
        turns: answer.conversation.turns.map((turn) => ({ ...turn, question })),
      },
      groups: [
        {
          ...answer.groups[0],
          notes: [`Receipt dotloop-receipt:SENTINEL-RECEIPT was read.`],
          items: [
            {
              ...answer.groups[0].items[0],
              detail: `Loop ${LOOP_LINK}, see ${HELP_ARTICLE}.`,
              blockers: [`Waiting on ${API_PATH}`],
            },
            answer.groups[0].items[1],
          ],
        },
        ...answer.groups.slice(1),
      ],
    });
    const before = JSON.stringify(leaked);
    const { value, removed } = assistantAnswerForHistory(leaked);
    const kept = value!;
    expect(removed).toBe(3);
    expect(kept.groups[0].items[0].detail).toBe(
      `Loop ${DOTLOOP_REFERENCE_REMOVED_TEXT}, see ${HELP_ARTICLE}.`,
    );
    expect(kept.groups[0].items[0].blockers).toEqual([
      `Waiting on ${DOTLOOP_REFERENCE_REMOVED_TEXT}`,
    ]);
    expect(kept.groups[0].notes).toEqual([
      `Receipt ${DOTLOOP_REFERENCE_REMOVED_TEXT} was read.`,
    ]);
    // Everything else, the person's own question included, is exactly as it was.
    expect(kept.conversation.turns.map((turn) => turn.question)).toEqual([question]);
    expect(kept.groups[0].items[0].title).toBe(leaked.groups[0].items[0].title);
    expect(kept.groups[0].items[1]).toEqual(leaked.groups[0].items[1]);
    expect(kept.summary).toBe(leaked.summary);
    expect(kept.execution).toEqual(leaked.execution);
    // The kept answer still meets its stored contract, and the input is untouched.
    expect(StoredAssistantAnswerSchema.parse(kept)).toEqual(kept);
    expect(JSON.stringify(leaked)).toBe(before);
  });

  it("keeps a help-article answer whole and drops only a citation that links to a loop", () => {
    const knowledge = StoredKnowledgeAnswerSchema.parse({
      question: `How do I add documents to ${LOOP_LINK}?`,
      source_state: "Verified Source",
      answer: `Follow the help article ${HELP_ARTICLE} for the steps. Your loop: ${LOOP_LINK}`,
      handling_steps: ["Open the loop.", `Upload into ${API_PATH}`],
      citations: [
        {
          source_id: "kb-help",
          title: "Adding Documents to a Loop",
          url: HELP_ARTICLE,
          excerpt: "Drag files into the loop.",
        },
        { source_id: "kb-loop", title: "The renewal loop", url: LOOP_LINK },
      ],
      draft: "",
      answered_by: { model: "Fixture model", source_count: 2 },
    });
    const { value, removed } = knowledgeAnswerForHistory(knowledge);
    const kept = value!;
    expect(removed).toBe(3);
    expect(kept.question).toBe(knowledge.question);
    expect(kept.answer).toBe(
      `Follow the help article ${HELP_ARTICLE} for the steps. Your loop: ${DOTLOOP_REFERENCE_REMOVED_TEXT}`,
    );
    expect(kept.handling_steps).toEqual([
      "Open the loop.",
      `Upload into ${DOTLOOP_REFERENCE_REMOVED_TEXT}`,
    ]);
    // The help article stays a working https link; the loop citation is gone, not prose.
    expect(kept.citations).toEqual([knowledge.citations[0]]);
    expect(kept.answered_by).toEqual({ model: "Fixture model", source_count: 1 });
    expect(StoredKnowledgeAnswerSchema.parse(kept)).toEqual(kept);

    const helpOnly = StoredKnowledgeAnswerSchema.parse({
      ...knowledge,
      question: "How do I add documents to a loop?",
      answer: `See ${HELP_ARTICLE}.`,
      handling_steps: [],
      citations: [knowledge.citations[0]],
      answered_by: { model: "Fixture model", source_count: 1 },
    });
    expect(knowledgeAnswerForHistory(helpOnly)).toEqual({ value: helpOnly, removed: 0 });
  });

  it("states its coverage exactly: provider fields cannot reach it and values are not recognized", async () => {
    const answer = await renewalAnswer();
    // A provider-named field is refused or stripped by the stored contract before any history
    // filter runs, so Dotloop data could only arrive as text.
    expect(
      StoredAssistantAnswerSchema.safeParse({ ...answer, loopName: "SENTINEL" }).success,
    ).toBe(false);
    expect(
      StoredAssistantAnswerSchema.safeParse({
        ...answer,
        groups: [
          {
            ...answer.groups[0],
            items: [{ ...answer.groups[0].items[0], loopStatus: "SENTINEL" }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      StoredKnowledgeAnswerSchema.safeParse({
        question: "How do renewals work?",
        source_state: "Verified Source",
        answer: "Grounded answer.",
        handling_steps: [],
        citations: [],
        draft: "",
        providerRef: "SENTINEL",
      }).success,
    ).toBe(false);
    // A loop name, participant or status written as plain text is not recognizable by value; the
    // source-side strip above is what keeps those out of the assistant.
    const named = StoredAssistantAnswerSchema.parse({
      ...answer,
      summary: "Loop SENTINEL LOOP NAME is ACTIVE with Jordan Agent.",
    });
    expect(assistantAnswerForHistory(named)).toEqual({ value: named, removed: 0 });
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
