import { describe, expect, it, vi } from "vitest";
import { DRAFT_BANNER } from "@/lib/constants";
import { decodeRawDraft, encodeRawDraft } from "@/lib/gmail-runtime/raw-message";
import { LiveRenewalGmailDraftProvider } from "@/lib/lease-renewal/execution/live-gmail-draft-provider";
import { LeaseGmailExecutor } from "@/lib/lease-renewal/execution/providers";

const message = {
  from: "workflow@pmikcmetro.com",
  to: "resident@example.invalid",
  cc: ["cotenant@example.invalid"],
  subject: "Renewal — reviewed terms",
  messageId: "<s113@example.invalid>",
  body: `${DRAFT_BANNER}\n\nHello María,\n\nReviewed rent: $1,234.50.`,
  htmlBody: `<p>${DRAFT_BANNER}</p><p>Hello María,</p><p>Reviewed rent: <strong>$1,234.50</strong>.</p>`,
};

describe("S113 reviewed rich Gmail transport", () => {
  it("round-trips exact UTF-8 alternatives with and without the governed image", () => {
    const plain = decodeRawDraft(encodeRawDraft(message));
    expect(plain).toEqual(message);
    const attachment = {
      filename: "reviewed.png",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
    };
    const decoded = decodeRawDraft(encodeRawDraft({ ...message, attachment }));
    expect(decoded).toMatchObject(message);
    expect(decoded.attachment?.bytes).toEqual(attachment.bytes);
    const wire = Buffer.from(
      encodeRawDraft({ ...message, attachment }),
      "base64url",
    ).toString("utf8");
    expect(wire).toContain("multipart/mixed");
    expect(wire).toContain("multipart/alternative");
    expect(wire.match(/Content-Type: text\/html/g)).toHaveLength(1);
  });

  it("refuses extra alternatives, changed part types, duplicate headers and invalid UTF-8", () => {
    const wire = Buffer.from(encodeRawDraft(message), "base64url").toString("utf8");
    const raw = (value: string) => Buffer.from(value).toString("base64url");
    expect(() =>
      decodeRawDraft(raw(wire.replace("text/html", "text/javascript"))),
    ).toThrow();
    expect(() =>
      decodeRawDraft(raw(wire.replace("To: ", "To: injected@example.invalid\r\nTo: "))),
    ).toThrow();
    expect(() =>
      decodeRawDraft(
        raw(
          wire.replace(
            Buffer.from(message.htmlBody).toString("base64").slice(0, 20),
            "////",
          ),
        ),
      ),
    ).toThrow();
    const boundary = /boundary="([^"]+)"/.exec(wire)![1];
    expect(() =>
      decodeRawDraft(
        raw(
          wire.replace(
            `--${boundary}--`,
            `--${boundary}\r\nContent-Type: text/html\r\n\r\nhidden\r\n--${boundary}--`,
          ),
        ),
      ),
    ).toThrow();
  });

  it("binds and verifies both representations through the existing executor and read-only recovery", async () => {
    let returned = encodeRawDraft(message);
    const client = {
      subject: message.from,
      createDraft: vi.fn(async () => ({ draftId: "exact-draft" })),
      getDraftById: vi.fn(async () => ({ draftId: "exact-draft", raw: returned })),
      findDraftByRfcMessageId: vi.fn(async () => ({
        draftId: "exact-draft",
        raw: returned,
      })),
    };
    const provider = new LiveRenewalGmailDraftProvider(client);
    const executor = new LeaseGmailExecutor(provider);
    const action = {
      dataMode: "live" as const,
      workflowId: "s113-rich-fixture",
      actionId: "reviewed-draft",
      actionKey: "gmail.renewal_notice.draft_create",
      sourceRefs: ["rentvine:lease:fixture"],
      values: {
        workflow_context: "renewal:s113-rich-fixture",
        template_ref: "tenant-renewal:v1.0",
        copy_template_hash: "a".repeat(64),
        copy_envelope_hash: "b".repeat(64),
        from: message.from,
        to: message.to,
        cc: message.cc.join(", "),
        cc_source_refs: "rentvine:cotenant",
        subject: message.subject,
        body: message.body,
        html_body: message.htmlBody,
        rfc_message_id: message.messageId,
        recipient_source_ref: "rentvine:resident",
        mailbox_source_ref: "session:managed-mailbox",
        draft_banner_present: true,
      },
    };
    const receipt = await executor.execute(action);
    expect(receipt).toBeTruthy();
    expect(client.createDraft).toHaveBeenCalledTimes(1);
    expect(client.createDraft.mock.calls[0]).toBeDefined();
    const expectedPayload = {
      operation: "draft" as const,
      artifactRef: "tenant-renewal:v1.0",
      recipient: message.to,
      cc: message.cc.join(", "),
      sender: message.from,
      subject: message.subject,
      body: message.body,
      htmlBody: message.htmlBody,
    };
    expect(
      await provider.reconcile({
        actionKey: action.actionKey,
        idempotencyKey: "same-attempt",
        expectedRfcMessageId: message.messageId,
        expectedPayload,
      }),
    ).toMatchObject({ payload: expectedPayload });
    returned = encodeRawDraft({
      ...message,
      htmlBody: message.htmlBody.replace("1,234.50", "9,999.00"),
    });
    await expect(
      provider.reconcile({
        actionKey: action.actionKey,
        idempotencyKey: "same-attempt",
        expectedRfcMessageId: message.messageId,
        expectedPayload,
      }),
    ).rejects.toMatchObject({ code: "ambiguous" });
    expect(client.createDraft).toHaveBeenCalledTimes(1);
  });
});
