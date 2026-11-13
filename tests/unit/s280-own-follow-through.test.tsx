// @vitest-environment jsdom
// S280 R-S280-1: "Waiting on you" lists the renewal work that follows from the viewer's own
// messages. ARCH-S280-1, BEH-S280-1, AC-S280-1 and AC-S280-6 against the pure projection, the
// attention gather and the rendered panel. Synthetic sequences only; nothing is sent or read from a
// provider, and no reply body or address is carried.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import {
  gatherAttentionQueue,
  type AttentionQueue,
  type AttentionQueueDependencies,
} from "@/lib/attention/attention-queue";
import {
  FOLLOW_THROUGH_WORDS,
  projectOwnFollowThrough,
  type AttentionFollowThroughRow,
} from "@/lib/attention/renewal-follow-through";
import type { ReplyWatchLeaseFacts } from "@/lib/gmail-hub/reply-watch";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import type { LeaseMessageBasis } from "@/lib/lease-renewal/unsent-message";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const VIEWER = "synthetic-s280-editor";
const OTHER = "synthetic-s280-other";
/** 11/12/2026, 9:00 AM CST. */
const T0 = Date.parse("2026-11-12T15:00:00.000Z");
const HOUR = 3_600_000;

type Audience = "owner" | "tenant";

function sequence(input: {
  id: string;
  lease: string;
  audience: Audience;
  responsibleUid: string;
  label?: string;
  createdAtMs?: number;
  state: CommunicationSequence["state"];
  confirmedCount?: number;
  sentAtMs?: number;
  replyAtMs?: number;
  pause?: CommunicationSequence["pause"];
  unresolvedOccurrenceId?: string | null;
  scheduledForMs?: number;
}): CommunicationSequence {
  const sent = input.sentAtMs ?? null;
  return {
    id: input.id,
    schemaVersion: "workflow-communication-sequence/v1",
    workflowLabel: input.label ?? `${input.lease} Sample Pl`,
    version: 3,
    responsibleUid: input.responsibleUid,
    senderEmail: "synthetic-staff@pmikcmetro.com",
    state: input.state,
    createdAtMs: input.createdAtMs ?? T0 - 24 * HOUR,
    updatedAtMs: T0,
    createdByUid: input.responsibleUid,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: input.lease,
      purpose: input.audience === "owner" ? "renewal_owner" : "renewal_tenant",
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: [`rentvine:lease:${input.lease}`],
    },
    initial: {
      subject: "Lease renewal",
      paragraphs: [[{ text: "Synthetic renewal message." }]],
      attachmentIds: [],
    },
    followUp: null,
    authorization: {
      revision: 1,
      approvedByUid: input.responsibleUid,
      senderEmail: "synthetic-staff@pmikcmetro.com",
      approvedAtMs: T0 - 20 * HOUR,
      payloadHash: "a".repeat(64),
      materialSourceHash: "b".repeat(64),
      deliveryPolicyVersion: "renewal-confirmed-delivery/2026-10-20",
      to: ["synthetic-recipient@example.com"],
      cc: [],
      sourceRefs: [],
      initial: {
        subject: "Lease renewal",
        plainText: "Synthetic renewal message.",
        htmlBody: "<p>Synthetic renewal message.</p>",
        attachments: [],
      },
      followUp: null,
      schedule:
        input.scheduledForMs === undefined
          ? null
          : ({
              firstDate: "2026-11-13",
              time: "09:00",
              timeZone: "America/Chicago",
            } as unknown as NonNullable<
              NonNullable<CommunicationSequence["authorization"]>["schedule"]
            >),
    },
    nextDueAtMs: input.scheduledForMs ?? null,
    confirmedCount: input.confirmedCount ?? 0,
    lastSentAtMs: sent,
    pause: input.pause ?? null,
    unresolvedOccurrenceId: input.unresolvedOccurrenceId ?? null,
    linkedThreads: sent
      ? [{ senderEmail: "synthetic-staff@pmikcmetro.com", threadId: "t-1" }]
      : [],
    threads: sent
      ? [
          {
            senderEmail: "synthetic-staff@pmikcmetro.com",
            threadId: "t-1",
            messageId: "m-1",
            rfcMessageId: `<pmi-${"c".repeat(64)}@pmikcmetro.com>`,
            sentAtMs: sent,
          },
        ]
      : [],
    observedMessageIds: [],
    inbound:
      input.replyAtMs === undefined
        ? []
        : [
            {
              id: "mailbox:reply-1",
              senderEmail: "synthetic-staff@pmikcmetro.com",
              threadId: "t-1",
              messageId: "reply-1",
              kind: "human",
              receivedAtMs: input.replyAtMs,
            },
          ],
    observation: null,
    lastOperation: { id: "op-1", hash: "d".repeat(64) },
  } as CommunicationSequence;
}

const OPEN_LEASE: ReplyWatchLeaseFacts = {
  workspace: null,
  disposition: null,
  todayIso: "2026-11-12",
};
const RECORDED_OWNER_ANSWER: ReplyWatchLeaseFacts = {
  workspace: {
    cycleId: "cycle-1",
    basis: { kind: "lease_end", dateIso: "2027-01-31" },
    ownerResponse: { outcome: "approved" },
    tenantResponse: null,
    completion: null,
  },
  disposition: null,
  todayIso: "2026-11-12",
};

/** The four item kinds on leases the viewer sent to. */
function viewerSequences() {
  return [
    sequence({
      id: "reply-101",
      lease: "101",
      audience: "owner",
      responsibleUid: VIEWER,
      state: "completed",
      confirmedCount: 1,
      sentAtMs: T0 - 4 * HOUR,
      replyAtMs: T0 - HOUR,
    }),
    sequence({
      id: "held-102",
      lease: "102",
      audience: "tenant",
      responsibleUid: VIEWER,
      state: "paused",
      pause: {
        cause: "changed_source",
        byUid: "communication-worker",
        atMs: T0 - 2 * HOUR,
        evidenceIds: [],
      },
    }),
    sequence({
      id: "scheduled-103",
      lease: "103",
      audience: "owner",
      responsibleUid: VIEWER,
      state: "active",
      scheduledForMs: T0 + 24 * HOUR,
    }),
    sequence({
      id: "unconfirmed-104",
      lease: "104",
      audience: "tenant",
      responsibleUid: VIEWER,
      state: "needs_reconciliation",
      unresolvedOccurrenceId: "e".repeat(64),
    }),
  ];
}

const OUT_OF_DATE_BASIS: LeaseMessageBasis = {
  settled: true,
  digest: null,
  legacyDigest: null,
  values: [],
  wordingRevision: "ffffffffffff",
  wordingSavedAtMs: T0 - HOUR,
};

function facts(entries: [string, ReplyWatchLeaseFacts | null][]) {
  return new Map(entries);
}

describe("S280 ARCH-S280-1: one renewal source keyed by lease, audience and item kind", () => {
  it("AC-S280-1: a reply, a held message, an out-of-date message and an unconfirmed send each give one row with the lease, the basis and the step", () => {
    const rows = projectOwnFollowThrough({
      viewerUid: VIEWER,
      sequences: viewerSequences(),
      leaseFacts: facts([
        ["101", OPEN_LEASE],
        ["102", OPEN_LEASE],
        ["103", OPEN_LEASE],
        ["104", OPEN_LEASE],
      ]),
      messageBases: new Map([["103:owner", OUT_OF_DATE_BASIS]]),
    });
    expect(rows.map((row) => [row.key, row.label, row.href])).toEqual([
      [
        "101:owner:reply",
        "101 Sample Pl: record the owner's decision",
        "/lease-renewal/live/desk/lease/101?step=ask-owner",
      ],
      [
        "102:tenant:held",
        "102 Sample Pl: review the held offer",
        "/lease-renewal/live/desk/lease/102?step=offer-tenant",
      ],
      [
        "103:owner:out_of_date",
        "103 Sample Pl: update the out-of-date owner message",
        "/lease-renewal/live/desk/lease/103?step=ask-owner",
      ],
      [
        "104:tenant:unconfirmed",
        "104 Sample Pl: check whether the offer went out",
        "/lease-renewal/live/desk/lease/104?step=offer-tenant",
      ],
    ]);
    for (const row of rows) expect(row.basis).toBe("Because you sent this message.");
  });

  it("AC-S280-1: the same items on leases another person sent to are not the viewer's", () => {
    const others = viewerSequences().map((entry) => ({
      ...entry,
      responsibleUid: OTHER,
    }));
    expect(
      projectOwnFollowThrough({
        viewerUid: VIEWER,
        sequences: others,
        leaseFacts: facts([["101", OPEN_LEASE]]),
        messageBases: new Map([["103:owner", OUT_OF_DATE_BASIS]]),
      }),
    ).toEqual([]);
  });

  it("AC-S280-1: a teammate's newer message on the same lease makes theirs the current one", () => {
    const mine = viewerSequences()[0];
    const theirs = sequence({
      id: "teammate-101",
      lease: "101",
      audience: "owner",
      responsibleUid: OTHER,
      createdAtMs: mine.createdAtMs + HOUR,
      state: "completed",
      confirmedCount: 1,
      sentAtMs: T0 - 3 * HOUR,
      replyAtMs: T0 - HOUR,
    });
    expect(
      projectOwnFollowThrough({
        viewerUid: VIEWER,
        sequences: [mine, theirs],
        leaseFacts: facts([["101", OPEN_LEASE]]),
      }),
    ).toEqual([]);
  });

  it("R-S280-1: from recorded facts only: a recorded answer or an unread lease record lists no reply", () => {
    const [reply] = viewerSequences();
    expect(
      projectOwnFollowThrough({
        viewerUid: VIEWER,
        sequences: [reply],
        leaseFacts: facts([["101", RECORDED_OWNER_ANSWER]]),
      }),
    ).toEqual([]);
    expect(
      projectOwnFollowThrough({
        viewerUid: VIEWER,
        sequences: [reply],
        leaseFacts: facts([["101", null]]),
      }),
    ).toEqual([]);
  });

  it("R-S280-1: a scheduled message whose lease values were not read, or still match, is not out of date", () => {
    const scheduled = viewerSequences()[2];
    expect(
      projectOwnFollowThrough({
        viewerUid: VIEWER,
        sequences: [scheduled],
        leaseFacts: facts([]),
      }),
    ).toEqual([]);
    expect(
      projectOwnFollowThrough({
        viewerUid: VIEWER,
        sequences: [scheduled],
        leaseFacts: facts([]),
        messageBases: new Map([
          ["103:owner", { ...OUT_OF_DATE_BASIS, wordingSavedAtMs: null }],
        ]),
      }),
    ).toEqual([]);
  });

  it("AC-S280-6: a row carries no reply body, recipient or sender address and no message id", () => {
    const rows = projectOwnFollowThrough({
      viewerUid: VIEWER,
      sequences: viewerSequences(),
      leaseFacts: facts([["101", OPEN_LEASE]]),
    });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/@|reply-1|Synthetic renewal message|t-1/);
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual([
        "audience",
        "basis",
        "href",
        "key",
        "kind",
        "label",
        "leaseId",
      ]);
  });
});

const NOW = new Date("2026-11-12T18:20:00.000Z");
const editor = {
  uid: VIEWER,
  role: "Editor",
  email: "synthetic-s280-editor@pmikcmetro.com",
} as never;

function deps(
  overrides: Partial<AttentionQueueDependencies> = {},
): AttentionQueueDependencies {
  return {
    listQueue: async () => [],
    loadRunViews: async () => [],
    now: () => NOW,
    ...overrides,
  };
}

const REPLY_ROW: AttentionFollowThroughRow = {
  key: "101:owner:reply",
  kind: "reply",
  leaseId: "101",
  audience: "owner",
  label: "101 Sample Pl: record the owner's decision",
  basis: FOLLOW_THROUGH_WORDS.basis,
  href: "/lease-renewal/live/desk/lease/101?step=ask-owner",
};

describe("S280 ARCH-S280-1: the attention gather (fail-first)", () => {
  it("ARCH-S280-1: an observed owner reply on a lease the viewer sent to is a row of the queue", async () => {
    const loadFollowThrough = vi.fn(async () => ({
      state: "ok" as const,
      rows: [REPLY_ROW],
    }));
    const queue = await gatherAttentionQueue(editor, deps({ loadFollowThrough }));
    expect(loadFollowThrough).toHaveBeenCalledWith(editor, NOW.getTime());
    expect(queue.followThrough).toEqual([REPLY_ROW]);
    expect(queue.followThroughState).toBe("ok");
    expect(queue.state).toBe("ok");
  });

  it("R-S280-1: a failed read of the viewer's messages lists nothing, says so, and leaves the decision feeds as they are", async () => {
    const queue = await gatherAttentionQueue(
      editor,
      deps({
        loadFollowThrough: async () => {
          throw new Error("synthetic read failure");
        },
      }),
    );
    expect(queue.state).toBe("ok");
    expect(queue.followThrough).toEqual([]);
    expect(queue.followThroughState).toBe("unavailable");
  });
});

describe("S280 BEH-S280-1: the rendered panel", () => {
  it("BEH-S280-1: lists the owner reply first, names the lease, opens that step and states its basis", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queue: AttentionQueue = {
      state: "ok",
      rows: [],
      unavailableFeeds: [],
      seeAllHref: "/approval-queue",
      checkedAtIso: NOW.toISOString(),
      followThrough: [REPLY_ROW],
      followThroughState: "ok",
    };
    await act(async () => {
      render(
        <DashboardAttentionQueue canApprove={false} initial={Promise.resolve(queue)} />,
      );
    });
    const region = screen.getByRole("region", { name: "Waiting on you" });
    const list = within(region).getByRole("list", { name: FOLLOW_THROUGH_WORDS.heading });
    expect(
      within(list).getByRole("link", {
        name: "101 Sample Pl: record the owner's decision",
      }),
    ).toHaveAttribute("href", "/lease-renewal/live/desk/lease/101?step=ask-owner");
    expect(within(list).getByText(/Because you sent this message\./)).toBeVisible();
    expect(within(region).getByTestId("attention-count")).toHaveTextContent("1");
    expect(within(region).queryByText("Nothing is waiting on you right now.")).toBeNull();
    // AC-S280-6: opening the Dashboard starts no lookup, save or send.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      within(region).queryByRole("button", { name: /send|save|schedule/i }),
    ).toBeNull();
  });
});
