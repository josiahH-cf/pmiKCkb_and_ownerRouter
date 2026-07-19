// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Console-to-full-message boundary", () => {
  it("makes no body call initially and exactly one targeted call after an authorized panel click", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/gmail-hub/threads?")) {
        return response({
          communications: [
            {
              actor_uid: "editor-1",
              created_at_ms: 1,
              entity_id: "run-1",
              entity_type: "renewal_run",
              expires_at_ms: 99,
              legal_hold: false,
              retention_anchor_at_ms: 1,
              retention_class: "workflow_link",
              retention_policy_version: "communications-retention:v1.0",
              gmail_thread_id: "fixture-thread",
              id: "link-1",
              lane: "renewals",
              mailbox_key: "fixture-mailbox-hash",
              origin_action_key: "gmail.mailbox.read",
              purpose: "renewal_owner",
              source_refs: ["renewal_run:run-1"],
              status: "linked",
              updated_at_ms: 1,
            },
          ],
        });
      }
      if (url.startsWith("/api/gmail-hub/threads/fixture-thread?")) {
        return response({
          id: "fixture-thread",
          messages: [
            {
              attachments: [],
              bcc: [],
              bodyText: "Fixture full body loaded only after the click.",
              bodyTruncated: false,
              cc: [],
              date: "2026-07-14T12:00:00.000Z",
              from: "fixture@example.test",
              id: "message-1",
              labelIds: [],
              messageId: "message-1",
              references: [],
              subject: "Fixture subject",
              threadId: "fixture-thread",
              to: ["editor@pmikcmetro.com"],
            },
          ],
          truncated: false,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <WorkflowCommunicationPanel
        canLink={false}
        entityId="run-1"
        entityType="renewal_run"
        lane="renewals"
        purpose="renewal_owner"
      />,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Fixture full body/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load linked communication" }));
    await user.click(
      await screen.findByRole("button", { name: /Open renewal owner · linked/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Fixture full body loaded only after the click."),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith("/api/gmail-hub/threads/fixture-thread?"),
      ),
    ).toHaveLength(1);
  });

  it("requires an exact reply preview and fresh human confirmation before one linked send", async () => {
    const proposal = "Fixture source-backed reply for exact review.";
    const confirmationToken = "a".repeat(48);
    const exactPayload = {
      from: "editor@pmikcmetro.com",
      to: ["owner@example.test"],
      cc: [],
      bcc: [],
      subject: "Re: Fixture maintenance update",
      body: proposal,
      messageId: "<fixture-reply@pmikcmetro.com>",
      threadId: "fixture-thread",
      inReplyTo: "<fixture-parent@example.test>",
      references: ["<fixture-parent@example.test>"],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/gmail-hub/threads?")) {
        return response({ communications: [workflowLink()] });
      }
      if (url.startsWith("/api/gmail-hub/threads/fixture-thread?")) {
        return response(workflowThread());
      }
      if (url === "/api/gmail-hub/workflow-reply") {
        return response({
          ok: true,
          reviewState: "Needs Review",
          policyRef: "workflow-reply:v1.0",
          artifactRef: "maintenance-owner:v1.0",
          proposal,
          diff: { added: [proposal], removed: [] },
          sources: [
            {
              ref: "gmail-message:message-1",
              label: "Fixture owner · 2026-07-14",
            },
          ],
          errors: [],
        });
      }
      if (url === "/api/gmail-hub/send-confirmations") {
        const input = JSON.parse(String(init?.body)) as {
          context: Record<string, unknown>;
          message: Record<string, unknown>;
        };
        expect(input).toMatchObject({
          context: {
            actionKey: "gmail.thread.reply",
            entityId: "ticket-1",
            entityType: "maintenance_ticket",
            lane: "maintenance",
            purpose: "maintenance_owner",
            templateRef: "maintenance-owner:v1.0",
            replyPolicyRef: "workflow-reply:v1.0",
            sourceRefs: ["maintenance_ticket:ticket-1", "gmail-message:message-1"],
          },
          message: { kind: "reply", threadId: "fixture-thread", body: proposal },
        });
        return response({
          context: input.context,
          confirmationToken,
          expiresAt: "2026-07-15T18:00:00.000Z",
          payload: exactPayload,
        });
      }
      if (url === "/api/gmail-hub/send") {
        expect(JSON.parse(String(init?.body))).toEqual({
          context: {
            actionKey: "gmail.thread.reply",
            entityId: "ticket-1",
            entityType: "maintenance_ticket",
            lane: "maintenance",
            purpose: "maintenance_owner",
            sourceRefs: ["maintenance_ticket:ticket-1", "gmail-message:message-1"],
            templateRef: "maintenance-owner:v1.0",
            replyPolicyRef: "workflow-reply:v1.0",
          },
          confirmationToken,
          payload: exactPayload,
        });
        return response({
          status: "sent",
          duplicate: false,
          result: {
            messageId: "gmail-message-sent-1",
            threadId: "fixture-thread",
            labelIds: ["SENT"],
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <WorkflowCommunicationPanel
        canLink
        entityId="ticket-1"
        entityType="maintenance_ticket"
        lane="maintenance"
        purpose="maintenance_owner"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load linked communication" }));
    await user.click(
      await screen.findByRole("button", { name: /Open maintenance owner · linked/ }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Request source-backed reply proposal",
      }),
    );
    expect(await screen.findByText(proposal)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review exact linked reply" }));

    const preview = await screen.findByRole("region", {
      name: "Exact linked Gmail reply confirmation",
    });
    expect(within(preview).getByText("owner@example.test")).toBeInTheDocument();
    expect(within(preview).getByText(proposal)).toBeInTheDocument();
    const sendButton = within(preview).getByRole("button", {
      name: "Send exact linked reply",
    });
    expect(sendButton).toBeDisabled();
    await user.click(
      within(preview).getByRole("checkbox", {
        name: /I reviewed the exact mailbox, recipient, subject, and reply body/,
      }),
    );
    expect(sendButton).toBeEnabled();
    await user.click(sendButton);

    const receipt = await screen.findByRole("region", { name: "Gmail reply receipt" });
    expect(within(receipt).getByText("gmail-message-sent-1")).toBeInTheDocument();
    expect(within(receipt).getByText("fixture-thread")).toBeInTheDocument();
    expect(within(receipt).getByText(/Sent once/)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === "/api/gmail-hub/send"),
    ).toHaveLength(1);
  });

  it("blocks retry after an ambiguous send and exposes reconciliation instead", async () => {
    const proposal = "Fixture reply with an ambiguous provider outcome.";
    const confirmationToken = "b".repeat(48);
    let sendCalls = 0;
    let reconcileCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/gmail-hub/threads?")) {
        return response({ communications: [workflowLink()] });
      }
      if (url.startsWith("/api/gmail-hub/threads/fixture-thread?")) {
        return response(workflowThread());
      }
      if (url === "/api/gmail-hub/workflow-reply") {
        return response({
          ok: true,
          reviewState: "Needs Review",
          policyRef: "workflow-reply:v1.0",
          artifactRef: "maintenance-owner:v1.0",
          proposal,
          diff: { added: [proposal], removed: [] },
          sources: [{ ref: "gmail-message:message-1", label: "Fixture source" }],
          errors: [],
        });
      }
      if (url === "/api/gmail-hub/send-confirmations") {
        const request = JSON.parse(String(init?.body)) as {
          context: Record<string, unknown>;
        };
        return response({
          context: request.context,
          confirmationToken,
          expiresAt: "2026-07-15T18:00:00.000Z",
          payload: {
            from: "editor@pmikcmetro.com",
            to: ["owner@example.test"],
            cc: [],
            bcc: [],
            subject: "Re: Fixture maintenance update",
            body: proposal,
            messageId: "<fixture-ambiguous@pmikcmetro.com>",
            threadId: "fixture-thread",
            inReplyTo: "<fixture-parent@example.test>",
            references: ["<fixture-parent@example.test>"],
          },
        });
      }
      if (url === "/api/gmail-hub/send") {
        sendCalls += 1;
        return response(
          {
            error:
              "Gmail did not return a definitive send result. No automatic retry was attempted.",
            status: "ambiguous",
          },
          409,
        );
      }
      if (url === "/api/gmail-hub/send/reconcile") {
        reconcileCalls += 1;
        expect(JSON.parse(String(init?.body))).toMatchObject({
          confirmationToken,
          context: { actionKey: "gmail.thread.reply" },
        });
        return response({
          status: "sent",
          result: {
            messageId: "gmail-reconciled-message-1",
            threadId: "fixture-thread",
            labelIds: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <WorkflowCommunicationPanel
        canLink
        entityId="ticket-1"
        entityType="maintenance_ticket"
        lane="maintenance"
        purpose="maintenance_owner"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Load linked communication" }));
    await user.click(
      await screen.findByRole("button", { name: /Open maintenance owner · linked/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Request source-backed reply proposal" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Review exact linked reply" }),
    );
    const preview = await screen.findByRole("region", {
      name: "Exact linked Gmail reply confirmation",
    });
    await user.click(within(preview).getByRole("checkbox"));
    await user.click(
      within(preview).getByRole("button", { name: "Send exact linked reply" }),
    );

    expect(
      await within(preview).findByRole("button", {
        name: "Reconcile ambiguous reply",
      }),
    ).toBeInTheDocument();
    expect(sendCalls).toBe(1);
    await user.click(
      within(preview).getByRole("button", { name: "Reconcile ambiguous reply" }),
    );

    const receipt = await screen.findByRole("region", { name: "Gmail reply receipt" });
    expect(within(receipt).getByText(/Reconciled as sent/)).toBeInTheDocument();
    expect(sendCalls).toBe(1);
    expect(reconcileCalls).toBe(1);
  });
});

function workflowLink() {
  return {
    actor_uid: "editor-1",
    created_at_ms: 1,
    entity_id: "ticket-1",
    entity_type: "maintenance_ticket",
    expires_at_ms: 99,
    legal_hold: false,
    retention_anchor_at_ms: 1,
    retention_class: "workflow_link",
    retention_policy_version: "communications-retention:v1.0",
    gmail_thread_id: "fixture-thread",
    id: "link-1",
    lane: "maintenance",
    mailbox_key: "fixture-mailbox-hash",
    origin_action_key: "gmail.mailbox.read",
    purpose: "maintenance_owner",
    source_refs: ["maintenance_ticket:ticket-1"],
    status: "linked",
    updated_at_ms: 1,
  };
}

function workflowThread() {
  return {
    id: "fixture-thread",
    messages: [
      {
        attachments: [],
        bcc: [],
        bodyText: "Fixture full body loaded only after the click.",
        bodyTruncated: false,
        cc: [],
        date: "2026-07-14T12:00:00.000Z",
        from: "owner@example.test",
        id: "message-1",
        labelIds: [],
        messageId: "<fixture-parent@example.test>",
        references: [],
        subject: "Re: Fixture maintenance update",
        threadId: "fixture-thread",
        to: ["editor@pmikcmetro.com"],
      },
    ],
    truncated: false,
  };
}

function response(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
      status,
    }),
  );
}
