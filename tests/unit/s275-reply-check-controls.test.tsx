// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S275 R-S275-3, R-S275-5 and R-S275-6: the visible controls that bring a reply to the lease.
// Synthetic responses only; no request leaves the test.
const NOW = Date.parse("2026-11-12T18:22:00.000Z");
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/hooks/useMinuteClock", () => ({ useMinuteClock: () => NOW }));
vi.mock("@/components/gmail-hub/CommunicationComposer", () => ({
  CommunicationComposer: ({ entry }: { entry: Record<string, string> }) => (
    <section aria-label="Opened communication">{JSON.stringify(entry)}</section>
  ),
}));

import { RenewalReplyCheck } from "@/components/lease-renewal/RenewalReplyCheck";
import { WorkflowCommunicationsHub } from "@/components/gmail-hub/WorkflowCommunicationsHub";

const SEQUENCE_A = "4b1c1f7e-0000-4000-8000-000000000001";
const SEQUENCE_B = "4b1c1f7e-0000-4000-8000-000000000002";
const CHECKED_AT = Date.parse("2026-11-12T18:20:00.000Z");
const FAILED_AT = Date.parse("2026-11-12T18:21:00.000Z");

const calls: Array<{ url: string; method: string; body?: unknown }> = [];
let respond: (url: string, method: string, body: unknown) => Response;

beforeEach(() => {
  calls.length = 0;
  refresh.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });
      return respond(url, method, body);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S275 R-S275-3: Check for a reply now on the waiting step", () => {
  it("R-S275-3 says when it last checked and checks each watched message once through the refresh action", async () => {
    respond = (_url, _method, body) => {
      const id = (body as { id: string }).id;
      return Response.json({
        sequence: {
          id,
          observation:
            id === SEQUENCE_B
              ? { state: "unavailable", checkedAtMs: FAILED_AT, reason: "read_failed" }
              : { state: "current", checkedAtMs: FAILED_AT },
        },
      });
    };
    render(
      <RenewalReplyCheck
        canEdit
        check={{
          sequenceIds: [SEQUENCE_A, SEQUENCE_B],
          lastCheckedAtMs: CHECKED_AT,
          failedAtMs: null,
        }}
      />,
    );
    expect(
      screen.getByText("Last checked for a reply: 11/12/2026, 12:20 PM CST"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check for a reply now" }));
    // One failed read: the step keeps waiting and says when the check failed.
    expect(
      await screen.findByText(
        "Reply check failed at 11/12/2026, 12:21 PM CST. Try again.",
      ),
    ).toBeInTheDocument();
    expect(calls).toEqual([
      {
        url: "/api/gmail-hub/sequences",
        method: "POST",
        body: { action: "refresh", id: SEQUENCE_A },
      },
      {
        url: "/api/gmail-hub/sequences",
        method: "POST",
        body: { action: "refresh", id: SEQUENCE_B },
      },
    ]);
    // The step is read again either way.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("R-S275-3 reads Not checked yet, and offers the check only to staff who can edit", () => {
    respond = () => Response.json({});
    const { rerender } = render(
      <RenewalReplyCheck
        canEdit={false}
        check={{ sequenceIds: [SEQUENCE_A], lastCheckedAtMs: null, failedAtMs: null }}
      />,
    );
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check for a reply now" })).toBeNull();
    rerender(
      <RenewalReplyCheck
        canEdit
        check={{
          sequenceIds: [SEQUENCE_A],
          lastCheckedAtMs: FAILED_AT,
          failedAtMs: FAILED_AT,
        }}
      />,
    );
    expect(
      screen.getByText("Reply check failed at 11/12/2026, 12:21 PM CST. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check for a reply now" }),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});

describe("S275 R-S275-5 / R-S275-6: the Communications page's one Gmail check and its rows", () => {
  const renewalRow = {
    id: "sequence-link",
    lane: "renewals",
    purpose: "renewal_owner",
    status: "attention_required",
    href: `/gmail-hub?communication=${SEQUENCE_A}`,
    label: "101 Sample Pl",
    createdAtMs: 1,
    waitingOn: "team",
    lastContactAtMs: Date.parse("2026-11-12T18:14:00.000Z"),
  };
  beforeEach(() => {
    respond = (url, method) => {
      if (url === "/api/gmail-hub/communications/health")
        return Response.json({ error: "Unavailable" }, { status: 503 });
      if (url.startsWith("/api/gmail-hub/sequences"))
        return Response.json({ sequences: [], cursor: null });
      if (url === "/api/gmail-hub/connection")
        return Response.json({
          status: "connected",
          mailboxEmail: "staff@pmikcmetro.com",
          sync: { health: "manual", lastSuccessfulSyncMs: null },
        });
      if (url === "/api/gmail-hub/communications")
        return Response.json({ communications: [renewalRow] });
      if (url === "/api/gmail-hub/refresh" && method === "POST")
        return Response.json({
          status: "processed",
          addedCount: 0,
          matchedCount: 0,
          sequences: { observed: 1, notChecked: 0, ended: 0 },
        });
      throw new Error(`Unexpected request: ${method} ${url}`);
    };
  });

  it("R-S275-5 shows one Check Gmail now on load on Incoming and Scheduled, runs the check and reloads the lists", async () => {
    render(<WorkflowCommunicationsHub authenticatedEmail="staff@pmikcmetro.com" />);
    const check = await screen.findAllByRole("button", { name: "Check Gmail now" });
    expect(check).toHaveLength(1);
    // Stored-data reloads no longer read as Gmail refreshes.
    expect(screen.queryByRole("button", { name: "Refresh worklist" })).toBeNull();
    expect(screen.getByRole("button", { name: "Reload worklist" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Scheduled" }));
    expect(screen.getAllByRole("button", { name: "Check Gmail now" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("tab", { name: "Outgoing" }));
    expect(screen.queryByRole("button", { name: "Check Gmail now" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Incoming" }));
    const listReads = () =>
      calls.filter((call) => call.url === "/api/gmail-hub/sequences").length;
    const before = listReads();
    await userEvent.click(screen.getByRole("button", { name: "Check Gmail now" }));
    expect(await screen.findByText(/^Gmail checked at /)).toBeInTheDocument();
    const post = calls.find((call) => call.url === "/api/gmail-hub/refresh");
    expect(post?.method).toBe("POST");
    expect((post?.body as { attemptKey: string }).attemptKey).toMatch(/^[a-f0-9-]{36}$/i);
    await waitFor(() => expect(listReads()).toBeGreaterThan(before));
    expect(calls.some((call) => call.url.endsWith("/watch"))).toBe(false);
  });

  it("R-S275-6 the Linked conversations row names the lease and opens the communication without a reload", async () => {
    render(<WorkflowCommunicationsHub authenticatedEmail="staff@pmikcmetro.com" />);
    const row = await screen.findByRole("link", {
      name: /^101 Sample Pl · Renewal communication/,
    });
    expect(row).toHaveAttribute("href", `/gmail-hub?communication=${SEQUENCE_A}`);
    // No address and no message content in the row.
    expect(row.textContent).not.toMatch(/@/);
    fireEvent.click(row);
    const opened = await screen.findByRole("region", { name: "Opened communication" });
    expect(within(opened).getByText(new RegExp(SEQUENCE_A))).toBeInTheDocument();
    expect(window.location.search).toBe(`?communication=${SEQUENCE_A}`);
  });
});
