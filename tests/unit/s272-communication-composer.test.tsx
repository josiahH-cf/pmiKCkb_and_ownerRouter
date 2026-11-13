// @vitest-environment jsdom
// S272 AC-S272-5 / R-S272-5: Communications offers only the actions that can succeed. The composer
// is rendered for each refusal and each ordinary state: a message written before the lease changed
// shows the reason line, each changed value, "Update from the lease" and "Cancel future messages",
// and no Resume, Send or Schedule; one stopped by a newer send shows its reason line, "Open the
// lease" and "Cancel future messages"; a refused new message names the communication that holds
// the renewal with its link; ordinary states keep their controls; the detail prints the scheduled
// time with its zone; no dialog is added. "Update from the lease" changes the draft only.
// Synthetic values only; every request is a stubbed fetch.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommunicationComposer } from "@/components/gmail-hub/CommunicationComposer";
import { RENEWAL_DELIVERY_POLICY_VERSION } from "@/lib/gmail-hub/delivery-policy";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import { reviewedInput } from "@/lib/gmail-hub/reviewed-inputs";

const id = "7a3e6d25-f9a0-40e7-8bb0-e29521be2720",
  email = "synthetic-s272-staff@pmikcmetro.com";
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "2720",
  purpose: "renewal_tenant" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:2720"],
};
const DRAFT_HASH = "d".repeat(64);
/** 11/13/2026, 9:00 AM CST. */
const DUE_AT = Date.parse("2026-11-13T15:00:00.000Z");
/** 11/12/2026, 12:23 PM CST. */
const SENT_AT = Date.parse("2026-11-12T18:23:00.000Z");
const heldWording = plainCommunicationMessage(
  "Lease renewal",
  "Rent $1,425.00 from 01/01/2027 through 12/31/2027.",
);
const currentWording = plainCommunicationMessage(
  "Lease renewal",
  "Rent $1,425.00 from 01/01/2027 through 06/30/2027.",
);
const values = (end: string) => [
  reviewedInput("address", "Property address", "101 Sample Pl"),
  reviewedInput("renewalEnd", "Renewal end date", end),
];
const schedule = {
  firstDate: "2026-11-13",
  time: "09:00",
  timeZone: "America/Chicago",
  everyDays: null,
  endDate: null,
  sendLimit: 1,
};
const authorization = {
  deliveryPolicyVersion: RENEWAL_DELIVERY_POLICY_VERSION,
  revision: 1,
  approvedByUid: "synthetic-s272-staff",
  senderEmail: email,
  approvedAtMs: Date.parse("2026-11-12T18:00:00.000Z"),
  payloadHash: "p".repeat(64),
  materialSourceHash: "m".repeat(64),
  to: ["tenant@example.invalid"],
  cc: [],
  sourceRefs: ["rentvine:lease:2720"],
  initial: {
    subject: heldWording.subject,
    plainText: "Rent $1,425.00 from 01/01/2027 through 12/31/2027.",
    htmlBody: "<div><p>Rent $1,425.00 from 01/01/2027 through 12/31/2027.</p></div>",
    attachments: [],
  },
  followUp: null,
  schedule,
};
const base: CommunicationSequence = {
  id,
  context,
  workflowLabel: "101 Sample Pl",
  initial: heldWording,
  followUp: null,
  schemaVersion: "workflow-communication-sequence/v1",
  version: 4,
  responsibleUid: "synthetic-s272-staff",
  senderEmail: email,
  state: "active",
  createdAtMs: 1,
  createdByUid: "synthetic-s272-staff",
  updatedAtMs: 1,
  authorization,
  noticeCycleId: "5c1d2e3f-4a5b-4c6d-8e7f-000000002720",
  authorizedContentBasis: {
    revision: 1,
    digest: "digest-12/31/2027",
    values: values("12/31/2027"),
    draftHash: DRAFT_HASH,
  },
  nextDueAtMs: DUE_AT,
  confirmedCount: 0,
  lastSentAtMs: null,
  pause: null,
  unresolvedOccurrenceId: null,
  linkedThreads: [],
  threads: [],
  observedMessageIds: [],
  observation: null,
  lastOperation: { id, hash: "a".repeat(64) },
};
const held: CommunicationSequence = {
  ...base,
  state: "paused",
  nextDueAtMs: null,
  pause: {
    cause: "changed_source",
    byUid: "communication-worker",
    atMs: Date.parse("2026-11-12T18:21:00.000Z"),
    evidenceIds: [],
  },
};
function composition(end: string, initial = currentWording) {
  return {
    context,
    initial,
    target: {
      label: "101 Sample Pl",
      to: ["tenant@example.invalid"],
      cc: [],
      blockers: [],
      outgoingContract: false,
      contentBasis: {
        digest: `digest-${end}`,
        legacyDigest: `legacy-${end}`,
        values: values(end),
      },
    },
    attachmentNotice: null,
    reviewedTargetHash: "b".repeat(64),
  };
}
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Stubs every request; returns the commands the composer posted. */
function stub(options: {
  sequence: () => Record<string, unknown>;
  composition: () => unknown;
  command?: (command: Record<string, unknown>) => Response;
}) {
  const commands: Record<string, unknown>[] = [];
  const reads: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("composition")) {
        reads.push(url);
        return reply(options.composition());
      }
      if (url.includes("business-profile")) return reply({ profile: null });
      if (!init?.body) return reply(options.sequence());
      const command = JSON.parse(String(init.body)) as Record<string, unknown>;
      commands.push(command);
      return options.command ? options.command(command) : reply(options.sequence());
    }),
  );
  return { commands, reads };
}
function mount() {
  return render(
    <CommunicationComposer
      entry={{ id }}
      authenticatedEmail={email}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />,
  );
}
const authorizing = () =>
  ["Send", "Schedule", "Resume reviewed sequence"].filter(
    (name) => screen.queryByRole("button", { name }) !== null,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => window.history.replaceState(null, "", "/gmail-hub"));

describe("S272 AC-S272-5: Communications offers only the actions that can succeed", () => {
  it("AC-S272-5 / R-S272-2: a held offer written before the lease changed shows the reason, the changed value, Update from the lease and Cancel, and no Resume, Send or Schedule", async () => {
    stub({
      sequence: () => ({
        sequence: held,
        reviewedDraftHash: DRAFT_HASH,
        newerSend: null,
      }),
      composition: () => composition("06/30/2027"),
    });
    mount();
    const reason = await screen.findByText(
      "This message was written before the lease changed. Update it from the lease, or cancel it.",
    );
    const block = reason.closest("[data-communication-field='refusal']")!;
    expect(block).toHaveAttribute("data-refusal-reason", "wording_predates_change");
    expect(block).toHaveTextContent(
      "Renewal end date: 12/31/2027 in this message, 06/30/2027 on the lease.",
    );
    expect(screen.getByRole("button", { name: "Update from the lease" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel future messages" })).toBeEnabled();
    expect(authorizing()).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-S272-5: Update from the lease loads the lease's current message into the draft, saves it once and sends nothing", async () => {
    let current: Record<string, unknown> = {
      sequence: held,
      reviewedDraftHash: DRAFT_HASH,
      newerSend: null,
    };
    const { commands, reads } = stub({
      sequence: () => current,
      composition: () => composition("06/30/2027"),
      command: (command) => {
        const draft = command.draft as { initial: typeof currentWording };
        current = {
          sequence: {
            ...held,
            version: held.version + 1,
            initial: draft.initial,
            pause: { ...held.pause!, cause: "edited", byUid: "synthetic-s272-staff" },
            wordingSavedAfterRevision: 1,
          },
          reviewedDraftHash: "e".repeat(64),
          newerSend: null,
        };
        return reply(current);
      },
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Update from the lease" }));
    await waitFor(() => expect(commands).toHaveLength(1));
    expect(commands[0]).toMatchObject({
      action: "save",
      expectedVersion: held.version,
      draft: { id, initial: currentWording, followUp: null },
    });
    // The lease's current message was read through the existing composition read.
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.at(-1)).toContain("purpose=renewal_tenant");
    expect(reads.at(-1)).toContain("lease=2720");
    expect(
      await screen.findByText(
        /^Updated from the lease\. Nothing was sent\. Review the message, then Send or Schedule it\./,
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/written before the lease changed/)).toBeNull(),
    );
    // The existing one-click Send or Schedule now authorizes that exact end state.
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(
      commands.filter((c) => ["send", "schedule", "resume"].includes(String(c.action))),
    ).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-S272-5 / R-S272-4: a message stopped by a newer send shows the reason, Open the lease and Cancel, and no Resume, Send or Schedule", async () => {
    stub({
      sequence: () => ({
        sequence: {
          ...held,
          pause: {
            cause: "newer_message_sent",
            byUid: "communication-worker",
            atMs: SENT_AT + 60_000,
            evidenceIds: ["communication:newer"],
          },
        },
        reviewedDraftHash: DRAFT_HASH,
        newerSend: { sequenceId: "newer", sentAtMs: SENT_AT },
      }),
      composition: () => composition("12/31/2027", heldWording),
    });
    mount();
    const reason = await screen.findByText(
      /^A newer message for this renewal was sent on 11\/12\/2026, 12:23\sPM CST\. Cancel this one\.$/,
    );
    const block = reason.closest("[data-communication-field='refusal']")!;
    expect(block).toHaveAttribute("data-refusal-reason", "newer_message_sent");
    const open = screen.getByRole("link", { name: "Open the lease" });
    expect(open.getAttribute("href")).toContain("2720");
    expect(screen.getByRole("button", { name: "Cancel future messages" })).toBeEnabled();
    expect(authorizing()).toEqual([]);
    expect(
      screen.getByText(/Paused: A newer message for this renewal was sent\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-S272-5 / R-S272-5: a scheduled message prints its time with its zone and keeps its controls", async () => {
    stub({
      sequence: () => ({
        sequence: base,
        reviewedDraftHash: DRAFT_HASH,
        newerSend: null,
      }),
      composition: () => composition("12/31/2027", heldWording),
    });
    mount();
    const state = await waitFor(() => {
      const node = document.querySelector("[data-communication-state]");
      expect(node).not.toBeNull();
      return node!;
    });
    expect(state.textContent).toMatch(/^Scheduled for 11\/13\/2026, 9:00\sAM CST$/);
    expect(document.querySelector("[data-communication-field='refusal']")).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel future messages" }),
    ).toBeInTheDocument();
  });

  it("AC-S272-4 / AC-S272-6: a staff pause with unchanged facts keeps one-click Resume, with no reason line and no dialog", async () => {
    const { commands } = stub({
      sequence: () => ({
        sequence: {
          ...held,
          pause: { ...held.pause!, cause: "staff", byUid: "synthetic-s272-staff" },
        },
        reviewedDraftHash: DRAFT_HASH,
        newerSend: null,
      }),
      composition: () => composition("12/31/2027", heldWording),
      command: () =>
        reply({
          sequence: { ...base, version: held.version + 1, nextDueAtMs: SENT_AT },
          reviewedDraftHash: DRAFT_HASH,
          newerSend: null,
        }),
    });
    mount();
    const resume = await screen.findByRole("button", {
      name: "Resume reviewed sequence",
    });
    expect(document.querySelector("[data-communication-field='refusal']")).toBeNull();
    expect(document.querySelector("[data-communication-state]")?.textContent).toMatch(
      /^Paused on 11\/12\/2026, 12:21\sPM CST$/,
    );
    await waitFor(() => expect(resume).toBeEnabled());
    fireEvent.click(resume);
    await waitFor(() =>
      expect(commands.filter((c) => c.action === "resume")).toHaveLength(1),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AC-S272-5 / R-S272-3: a refused new message names the communication that holds the renewal, with its link", async () => {
    const draftSequence: CommunicationSequence = {
      ...base,
      state: "draft",
      authorization: null,
      authorizedContentBasis: undefined,
      nextDueAtMs: null,
      version: 1,
    };
    const holder = "11111111-2222-4333-8444-555555555555";
    stub({
      sequence: () => ({
        sequence: draftSequence,
        reviewedDraftHash: DRAFT_HASH,
        newerSend: null,
      }),
      composition: () => composition("12/31/2027", heldWording),
      command: () =>
        reply(
          {
            code: "sequence_refused",
            refusal: {
              reason: "unsent_message_exists",
              audience: "tenant",
              relatedSequenceId: holder,
              relatedState: "scheduled",
              relatedAtMs: DUE_AT,
              timeZone: "America/Chicago",
            },
            error:
              "A tenant offer for this renewal is already scheduled for 11/13/2026, 9:00 AM CST. Open it to update or cancel it.",
          },
          409,
        ),
    });
    mount();
    const send = await screen.findByRole("button", { name: "Send" });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    const reason = await screen.findByText(
      /^A tenant offer for this renewal is already scheduled for 11\/13\/2026, 9:00\sAM CST\. Open it to update or cancel it\.$/,
    );
    expect(reason.closest("[data-communication-field='refusal']")).toHaveAttribute(
      "data-refusal-reason",
      "unsent_message_exists",
    );
    expect(
      screen.getByRole("link", { name: "Open that communication" }).getAttribute("href"),
    ).toBe(`/gmail-hub?communication=${holder}`);
    // The refused new message keeps Send and Schedule: they succeed once the other is resolved.
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
