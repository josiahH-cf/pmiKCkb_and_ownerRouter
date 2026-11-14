import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { refineEmailDraft } from "@/lib/email-refinement/refine";
import { classifyIncomingMessage } from "@/lib/gmail-hub/inbound-classification";
import { createRfcMessageId, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import { createRehearsalStandInGmailClient } from "@/lib/gmail-runtime/rehearsal-stand-in-client";
import {
  encodeWorkflowMime,
  type WorkflowMimeMessage,
} from "@/lib/gmail-runtime/workflow-mime";
import { RentCastMarketCompProvider } from "@/lib/lease-renewal/providers/rentcast-market-comp-provider";
import { createModelFetchTransport, LocalModelProvider } from "@/lib/llm/model-provider";
import {
  loadNovember5Mix,
  readNovember5Mix,
} from "@/scripts/lib/one-path-rehearsal/november-5-mix.mjs";
import {
  startStandIns,
  type StandIns,
} from "@/scripts/lib/one-path-rehearsal/stand-ins.mjs";

// S254 R-S254-4: the rehearsal's stand-ins answer the app's own clients. Each stand-in is driven
// here through the product code that reads it (the mailbox client, the inbound classifier, the
// comparison provider, the wording check), so a stand-in that drifts from the app fails this file.

const MAILBOX = "local-demo-editor@pmikcmetro.com";
const mix = loadNovember5Mix(readNovember5Mix(), "2026-11-05");
const prepared = mix.leases.find(
  (row) => row.lease.leaseID === mix.roles.prepared.leaseId,
)!;
const OWNER = prepared.portfolio.owners[0].email!;

let standIns: StandIns;
let logDir: string;
beforeAll(async () => {
  logDir = mkdtempSync(join(tmpdir(), "s254-stand-ins-"));
  standIns = await startStandIns({ mix, logDir });
});
afterAll(async () => {
  await standIns.close();
  rmSync(logDir, { recursive: true, force: true });
});

const control = async (name: string, body: unknown = {}) => {
  const response = await fetch(`${standIns.origin}/control/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
};
const client = () =>
  createRehearsalStandInGmailClient(MAILBOX, { origin: standIns.origin });
const message = (to: string = OWNER): WorkflowMimeMessage => ({
  from: MAILBOX,
  to: [to],
  cc: [],
  bcc: [],
  subject: "Renewal for 101 Example Ct",
  body: "Hello,\n\nThe lease at 101 Example Ct ends on December 31, 2026.\n\nThank you,\nExample Staff",
  htmlBody:
    "<p>Hello,</p><p>The lease at 101 Example Ct ends on December 31, 2026.</p><p>Thank you,<br>Example Staff</p>",
  messageId: createRfcMessageId(MAILBOX),
  references: [],
  attachments: [],
});

describe("S254 stand-ins: one loopback process", () => {
  it("listens on 127.0.0.1 only and answers nothing it does not know", async () => {
    expect(standIns.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await fetch(`${standIns.origin}/health`)).status).toBe(200);
    expect((await fetch(`${standIns.origin}/anything-else`)).status).toBe(404);
    expect((await control("no-such-control")).status).toBe(404);
  });
});

describe("S254 comparison stand-in (L33)", () => {
  const provider = () =>
    new RentCastMarketCompProvider(
      { apiKey: "synthetic-rehearsal-key" },
      {
        // The rehearsal's provider boundary does this rewrite for the real transport.
        transport: {
          async get(url) {
            const target = new URL(url);
            const response = await fetch(
              `${standIns.origin}/rentcast${target.pathname}${target.search}`,
            );
            const text = await response.text();
            return {
              status: response.status,
              json: async () => JSON.parse(text) as unknown,
            };
          },
        },
      },
    );

  it("returns synthetic comparables the app's provider accepts, around the lease's rent", async () => {
    const result = await provider().lookup({
      addressLabel: "101 Example Ct, Example City, MO 00101",
      bedrooms: 2,
    });
    const rent = Number(prepared.unit.rent);
    expect(result.confidence).toBe("Likely");
    expect(result.compCount).toBe(5);
    expect(result.rangeLow).toBe(rent - 50);
    expect(result.rangeHigh).toBe(rent + 150);
    expect(result.pointEstimate).toBe(rent + 50);
    expect(result.comparables?.every((entry) => entry.correlation !== undefined)).toBe(
      true,
    );
  });

  it("answers the parameterless key check without counting a lease comparison", async () => {
    const before = standIns.describe().comparison.requests;
    const response = await fetch(`${standIns.origin}/rentcast/v1/avm/rent/long-term`);
    expect(response.status).toBe(400);
    expect(standIns.describe().comparison.requests).toEqual(before);
    const events = readFileSync(join(logDir, "stand-ins.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.at(-1)).toMatchObject({
      standIn: "comparison",
      kind: "health_probe",
      status: 400,
    });
  });

  it("answers the market trend read", async () => {
    const trend = await provider().lookupTrend("00101");
    expect(trend.confidence).toBe("Likely");
    expect(Object.keys(trend.history ?? {})).toHaveLength(24);
  });

  it("logs each comparison by lease, so one request per lease can be counted", async () => {
    await control("reset-comparison-log");
    await provider().lookup({ addressLabel: "101 Example Ct, Example City, MO 00101" });
    await provider().lookup({ addressLabel: "102 Sample Pl, Example City, MO 00102" });
    await provider().lookup({ addressLabel: "102 Sample Pl, Example City, MO 00102" });
    const state = standIns.describe();
    expect(state.comparison.comparisonsByLease).toEqual({ "9101": 1, "9102": 2 });
    // The assisted lease was never asked for.
    expect(state.comparison.comparisonsByLease).not.toHaveProperty(
      String(mix.roles.assisted.leaseId),
    );
    expect(readFileSync(join(logDir, "stand-ins.jsonl"), "utf8")).toContain(
      '"standIn":"comparison"',
    );
  });

  it("refuses anything but a read", async () => {
    const response = await fetch(`${standIns.origin}/rentcast/v1/avm/rent/long-term`, {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(405);
  });
});

describe("S254 mail stand-in (L25, L27, L29, L36 to L38, L40)", () => {
  it("accepts a send with a provider-shaped answer and keeps exactly what was sent", async () => {
    const outgoing = message();
    const sent = await client().sendWorkflowMessage(outgoing);
    expect(sent.labelIds).toEqual(["SENT"]);
    // The app's own readback compares the stored MIME with the approved message.
    const readback = await client().findWorkflowMessage(outgoing.messageId, outgoing);
    expect(readback).toMatchObject({
      messageId: sent.messageId,
      threadId: sent.threadId,
    });
    expect(readback!.sentAtMs).toBeGreaterThan(0);
    const kept = standIns
      .describe()
      .mail.mailboxes.find((entry) => entry.mailbox === MAILBOX)!
      .messages.find((entry) => entry.id === sent.messageId)!;
    expect(kept).toMatchObject({
      to: OWNER,
      subject: outgoing.subject,
      text: outgoing.body,
      html: outgoing.htmlBody,
      rfcMessageId: outgoing.messageId,
    });
    expect(kept.from).toContain(MAILBOX);
  });

  it("holds exactly one synthetic send before acceptance until released (W12-05)", async () => {
    const outgoing = message();
    expect(await control("hold-mail-send")).toMatchObject({
      status: 200,
      body: { armed: true },
    });
    const sending = client().sendWorkflowMessage(outgoing);
    try {
      await expect.poll(() => standIns.describe().mail.sendHeld).toBe(true);
      expect(standIns.describe().mail.mailboxes[0]?.messages).not.toContainEqual(
        expect.objectContaining({ rfcMessageId: outgoing.messageId }),
      );
    } finally {
      expect(await control("release-mail-send")).toMatchObject({
        status: 200,
        body: { released: true },
      });
      await sending;
    }
    expect(standIns.describe().mail.sendHeld).toBe(false);
    expect((await sending).messageId).toBeDefined();
  });

  it("delivers an owner reply on the thread, read as a person's reply (L36)", async () => {
    const outgoing = message();
    const sent = await client().sendWorkflowMessage(outgoing);
    const before = (await client().getProfile()).historyId;
    const reply = await control("deliver-reply", {
      threadId: sent.threadId,
      text: "Example owner reply: please renew at the recommended rent.",
    });
    expect(reply.status).toBe(200);
    expect(reply.body.from).toBe(OWNER);
    const thread = await client().getThread(sent.threadId);
    expect(thread.messages).toHaveLength(2);
    const inbound = thread.messages[1];
    expect(inbound.labelIds).toContain("INBOX");
    expect(inbound.inReplyTo).toBe(outgoing.messageId);
    expect(inbound.bodyText).toBe(
      "Example owner reply: please renew at the recommended rent.",
    );
    expect(classifyIncomingMessage(inbound, outgoing.to)).toBe("human");
    // The mailbox history names the new message, which is how the app notices it.
    const history = await client().listHistory({ startHistoryId: before });
    expect(history.messagesAdded).toEqual([{ id: inbound.id, threadId: sent.threadId }]);
  });

  it("finds the thread by the address the message was sent to", async () => {
    const other = mix.leases.find(
      (row) => row.lease.leaseID === mix.roles.replied.leaseId,
    )!.portfolio.owners[0].email!;
    const sent = await client().sendWorkflowMessage(message(other));
    const reply = await control("deliver-reply", { to: other });
    expect(reply.body).toMatchObject({ threadId: sent.threadId, from: other });
  });

  it("makes the next send unconfirmed, with the message kept or lost (L37)", async () => {
    expect((await control("next-send", { mode: "sideways" })).status).toBe(400);
    await control("next-send", { mode: "unconfirmed" });
    const kept = message();
    const failure = await client()
      .sendWorkflowMessage(kept)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GmailRuntimeError);
    expect((failure as GmailRuntimeError).ambiguous).toBe(true);
    // The message went out; checking finds it.
    expect(await client().findMessageByRfcMessageId(kept.messageId)).not.toBeNull();

    await control("next-send", { mode: "unconfirmed-lost" });
    const lost = message();
    await expect(client().sendWorkflowMessage(lost)).rejects.toBeInstanceOf(
      GmailRuntimeError,
    );
    expect(await client().findMessageByRfcMessageId(lost.messageId)).toBeNull();
    // One send only: the one after it is accepted.
    await expect(client().sendWorkflowMessage(message())).resolves.toMatchObject({
      labelIds: ["SENT"],
    });
  });

  it("returns a failed delivery the app reads as a bounce (L38)", async () => {
    await control("next-send", { mode: "bounce" });
    const outgoing = message();
    const sent = await client().sendWorkflowMessage(outgoing);
    const thread = await client().getThread(sent.threadId);
    expect(thread.messages).toHaveLength(2);
    expect(classifyIncomingMessage(thread.messages[1], outgoing.to)).toBe("bounce");
    expect(thread.messages[1].inReplyTo).toBe(outgoing.messageId);
    // The same notice can be returned later for a message already sent.
    const later = await client().sendWorkflowMessage(message());
    expect((await control("bounce", { threadId: later.threadId })).status).toBe(200);
    const bounced = await client().getThread(later.threadId);
    expect(classifyIncomingMessage(bounced.messages[1], [OWNER])).toBe("bounce");
  });

  it("keeps a draft unsent until staff send it from Gmail (L40)", async () => {
    const draft = await client().createDraft({
      to: OWNER,
      subject: "Renewal for 101 Example Ct",
      body: "Hello,\n\nExample draft body.\n",
    });
    expect((await client().getDraftById(draft.draftId)).raw.length).toBeGreaterThan(0);
    const held = () =>
      standIns
        .describe()
        .mail.mailboxes.find((entry) => entry.mailbox === MAILBOX)!
        .drafts.filter((entry) => entry.id === draft.draftId);
    expect(held()).toEqual([
      { id: draft.draftId, messageId: draft.messageId, unsent: true },
    ]);
    const sent = await control("send-draft", { draftId: draft.draftId });
    expect(sent.body.messageId).toBe(draft.messageId);
    expect(held()).toEqual([]);
    expect((await control("send-draft", { draftId: draft.draftId })).status).toBe(404);
  });

  it("refuses a recipient that is not a synthetic example address, and keeps nothing", async () => {
    const before = standIns.describe().mail.refusedRecipients;
    const outgoing = message("pat.owner@gmail.com");
    const failure = await client()
      .sendWorkflowMessage(outgoing)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GmailRuntimeError);
    expect((failure as GmailRuntimeError).status).toBe(400);
    expect((failure as GmailRuntimeError).ambiguous).toBe(false);
    expect(await client().findMessageByRfcMessageId(outgoing.messageId)).toBeNull();
    expect(standIns.describe().mail.refusedRecipients).toBe(before + 1);
    // The refused address is not written to the log.
    expect(readFileSync(join(logDir, "stand-ins.jsonl"), "utf8")).not.toContain(
      "gmail.com",
    );
  });

  it("needs a mailbox on every request, and a sender that is that mailbox", async () => {
    expect((await fetch(`${standIns.origin}/gmail/v1/users/me/profile`)).status).toBe(
      400,
    );
    const response = await fetch(`${standIns.origin}/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rehearsal-mailbox": "local-demo-approver@pmikcmetro.com",
      },
      body: JSON.stringify({ raw: encodeWorkflowMime(message()) }),
    });
    expect(response.status).toBe(403);
  });
});

describe("S254 model stand-in (L10, L13, L44)", () => {
  const provider = () =>
    new LocalModelProvider(
      standIns.origin,
      "rehearsal-stand-in-model",
      createModelFetchTransport(),
    );
  const input = {
    surface: "renewal_message" as const,
    purpose: "A renewal message to the owner.",
    currentBody:
      "Hello Jordan,\n\nThe lease at 101 Example Ct ends on December 31, 2026. The current rent is $1,350.\n\nThank you,\nExample Staff",
    instruction: "Make the tone a little warmer for the owner.",
    facts: [{ label: "Current rent", value: "$1,350" }],
    protectedPhrases: ["101 Example Ct"],
  };

  it("returns a revision the app accepts", async () => {
    const result = await refineEmailDraft(input, {
      provider: provider(),
      model: "rehearsal-stand-in-model",
    });
    expect(result.status).toBe("revised");
    if (result.status !== "revised") return;
    expect(result.body).toContain("$1,350");
    expect(result.body).toContain("Thank you for your time and for working with us.");
    expect(result.body.endsWith("Thank you,\nExample Staff")).toBe(true);
  });

  it("on request, returns one that copies the instruction, which the app refuses", async () => {
    expect((await control("rewording", { mode: "loud" })).status).toBe(400);
    await control("rewording", { mode: "echo", once: true });
    const refused = await refineEmailDraft(input, {
      provider: provider(),
      model: "rehearsal-stand-in-model",
    });
    expect(refused).toEqual({
      status: "refused",
      reason:
        "The revision copied your instruction into the email, so it was not used. Try rewording the instruction.",
    });
    // Once only: the next request is accepted again.
    const next = await refineEmailDraft(input, {
      provider: provider(),
      model: "rehearsal-stand-in-model",
    });
    expect(next.status).toBe("revised");
  });

  it("a standing choice replaces a one-time choice that was not used yet", async () => {
    await control("rewording", { mode: "echo", once: true });
    const standing = await control("rewording", { mode: "accept" });
    expect(standing.body).toEqual({ rewording: "accept", rewordingNext: null });
    const result = await refineEmailDraft(input, {
      provider: provider(),
      model: "rehearsal-stand-in-model",
    });
    expect(result.status).toBe("revised");
    // A standing echo stays until it is changed back.
    await control("rewording", { mode: "echo" });
    for (let request = 0; request < 2; request += 1)
      expect(
        (
          await refineEmailDraft(input, {
            provider: provider(),
            model: "rehearsal-stand-in-model",
          })
        ).status,
      ).toBe("refused");
    await control("rewording", { mode: "accept" });
  });

  it("gives an assistant question an empty plan, so the app's own interpreter answers", async () => {
    const response = await provider().generateText({
      purpose: "assistant.interpret",
      model: "rehearsal-stand-in-model",
      systemInstruction: "You translate one staff question into a plan.",
      userContent: JSON.stringify({ question: "Which renewals are due next month?" }),
      temperature: 0,
    });
    expect(response.text).toBe("{}");
    expect(standIns.describe().model.requests.at(-1)?.kind).toBe("plan");
  });
});
