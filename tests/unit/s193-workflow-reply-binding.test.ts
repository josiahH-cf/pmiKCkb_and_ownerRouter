import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { bindWorkflowReply } from "@/lib/gmail-hub/workflow-reply-binding";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";
const original = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "701",
  purpose: "renewal_owner" as const,
  actionKey: "gmail.mailbox.read",
  sourceRefs: [],
};
const context = WorkflowCommunicationContextSchema.parse({
  ...original,
  actionKey: "gmail.thread.reply",
  replyTo: {
    sequenceId: randomUUID(),
    threadId: "thread-1",
    senderEmail: "fixture@pmikcmetro.com",
    parentId: "parent-1",
  },
});
const target = {
  context,
  to: ["owner@example.invalid"],
  cc: [],
  sourceRefs: ["fixture:owner"],
  materialSourceHash: "a".repeat(64),
  label: "Fixture",
};
const thread: GmailThreadView = {
  id: "thread-1",
  truncated: false,
  messages: [
    {
      id: "parent-1",
      threadId: "thread-1",
      labelIds: ["INBOX"],
      from: "Owner <owner@example.invalid>",
      to: ["fixture@pmikcmetro.com"],
      cc: [],
      bcc: [],
      subject: "Fixture subject",
      date: "",
      messageId: "<parent@example.invalid>",
      references: [],
      bodyText: "Fixture reply",
      bodyTruncated: false,
      attachments: [],
    },
  ],
};
it("binds only server-read RFC headers from the original linked message and verified current recipients", () => {
  expect(bindWorkflowReply(context, original, thread, target)).toMatchObject({
    parentMessageId: "<parent@example.invalid>",
    threadId: "thread-1",
    subject: "Fixture subject",
  });
});
it("refuses wrong workflow, changed recipients, missing message, incomplete conversation and unsafe headers", () => {
  for (const run of [
    () => bindWorkflowReply(context, { ...original, entityId: "702" }, thread, target),
    () =>
      bindWorkflowReply(context, original, thread, {
        ...target,
        to: ["other@example.invalid"],
      }),
    () => bindWorkflowReply(context, original, { ...thread, messages: [] }, target),
    () => bindWorkflowReply(context, original, { ...thread, truncated: true }, target),
    () =>
      bindWorkflowReply(
        context,
        original,
        {
          ...thread,
          messages: [
            {
              ...thread.messages[0],
              messageId: "<parent@example.invalid>\r\nBcc: attacker@example.invalid",
            },
          ],
        },
        target,
      ),
  ])
    expect(run).toThrow();
});
