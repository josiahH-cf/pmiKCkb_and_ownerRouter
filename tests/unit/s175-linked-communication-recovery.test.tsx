// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const props = {
  canLink: true,
  entityId: "fixture-ticket",
  entityType: "maintenance_ticket" as const,
  lane: "maintenance" as const,
  purpose: "maintenance_owner" as const,
};
const proposal = {
  ok: true,
  reviewState: "Needs Review",
  policyRef: "workflow-reply:v1.0",
  artifactRef: "maintenance-owner:v1.0",
  proposal: "Revised fixture wording",
  diff: { added: [], removed: [] },
  sources: [],
  errors: [],
};
function install(
  reply: () => Promise<Response>,
  send: () => Promise<Response> = async () => {
    throw new Error("transport interrupted");
  },
) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/gmail-hub/threads?"))
      return Response.json({
        communications: [
          {
            id: "fixture-link",
            gmail_thread_id: "fixture-thread",
            purpose: "maintenance_owner",
            status: "linked",
          },
        ],
      });
    if (url.startsWith("/api/gmail-hub/threads/fixture-thread?"))
      return Response.json({ id: "fixture-thread", messages: [], truncated: false });
    if (url.endsWith("/workflow-reply")) return reply();
    if (url.endsWith("/send-confirmations"))
      return Response.json({
        context: {},
        confirmationToken: "a".repeat(48),
        expiresAt: "2026-12-01T00:00:00Z",
        payload: {
          from: "fixture@pmikcmetro.com",
          to: ["owner@fixture.invalid"],
          cc: [],
          bcc: [],
          subject: "Fixture reply",
          body: proposal.proposal,
          threadId: "fixture-thread",
        },
      });
    if (url.endsWith("/send")) return send();
    throw new Error("Unexpected test route");
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Load linked communication" }));
  fireEvent.click(await screen.findByRole("button", { name: /Open maintenance owner/ }));
  await screen.findByRole("textbox", { name: "Human draft to improve (optional)" });
}
it("a transport failure after the exact confirmation keeps the original preview for reconciliation and never enables redispatch", async () => {
  const fetch = install(async () => Response.json(proposal));
  render(<WorkflowCommunicationPanel {...props} />);
  await open();
  fireEvent.click(
    screen.getByRole("button", { name: "Request source-backed reply proposal" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Review exact linked reply" }),
  );
  const preview = await screen.findByRole("region", {
    name: "Exact linked Gmail reply confirmation",
  });
  fireEvent.click(within(preview).getByRole("checkbox"));
  fireEvent.click(
    within(preview).getByRole("button", { name: "Send exact linked reply" }),
  );
  expect(
    await within(preview).findByRole("button", { name: "Reconcile ambiguous reply" }),
  ).toBeInTheDocument();
  expect(
    within(preview).queryByRole("button", { name: "Send exact linked reply" }),
  ).toBeNull();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/send"))).toHaveLength(
    1,
  );
});
it("the actual linked refinement retains edits made in flight and exposes an alternate without any draft or send", async () => {
  let complete!: (response: Response) => void;
  const fetch = install(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  render(<WorkflowCommunicationPanel {...props} />);
  await open();
  const body = screen.getByRole("textbox", { name: "Human draft to improve (optional)" });
  fireEvent.change(body, { target: { value: "First fixture draft" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Refine with AI \(optional\)/ }), {
    target: { value: "Shorten it" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Request source-backed reply proposal" }),
  );
  expect(screen.getByRole("button", { name: "Stop waiting" })).toBeInTheDocument();
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.change(body, { target: { value: "Newer manual wording" } });
  await act(async () => {
    complete(Response.json(proposal));
  });
  expect(body).toHaveValue("Newer manual wording");
  expect(screen.getByText(/based on the earlier draft/)).toBeInTheDocument();
  expect(screen.getByText(proposal.proposal)).toBeInTheDocument();
  expect(fetch.mock.calls.some(([url]) => /send|draft-create/.test(String(url)))).toBe(
    false,
  );
});
