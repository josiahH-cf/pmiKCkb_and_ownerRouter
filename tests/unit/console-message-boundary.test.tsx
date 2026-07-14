// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
      await screen.findByRole("button", { name: /Open renewal owner — linked/ }),
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
});

function response(payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  );
}
