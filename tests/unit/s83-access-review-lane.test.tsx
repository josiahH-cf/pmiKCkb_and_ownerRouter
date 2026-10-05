// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessRequestsLane } from "@/components/approval/AccessRequestsLane";
import type { AdminAccessRequestListItem } from "@/lib/access/request-service";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const request: AdminAccessRequestListItem = {
  schema_version: "access-request-record-v1",
  id: "request_0001",
  version: 1,
  requester_uid: "requester-1",
  requester_label: "Requesting Editor",
  requester_directory: { state: "eligible", current_label: "Requesting Editor" },
  intent: {
    schema_version: "access-intent-v1",
    intent_kind: "capability",
    catalog_version: "catalog-v1",
    catalog_key: "approve",
    scope: { kind: "named_spaces", space_ids: ["renewals"] },
  },
  intent_label_snapshot: "Approve eligible app work",
  baseline_access: {
    role: "Editor",
    scope: { kind: "named_spaces", space_ids: ["maintenance"] },
  },
  baseline_fingerprint: "a".repeat(64),
  target_access: {
    role: "Approver",
    scope: { kind: "named_spaces", space_ids: ["maintenance", "renewals"] },
  },
  added_capability_keys: ["approve", "resolvePlaceholder"],
  added_space_ids: ["renewals"],
  all_spaces_added: false,
  reason: "Approve lease renewal work assigned to my staff role.",
  state: "pending",
  idempotency_identity: `access-intent-v1:${"a".repeat(43)}`,
  creation_attempt_id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
};

describe("S83 Admin access review lane", () => {
  it("S169 fences a response-lost denial on the original request instead of offering a second decision", async () => {
    const requests = vi.fn(async (url: string) => {
      if (String(url).endsWith("/deny")) throw new TypeError("response lost");
      return Response.json({
        request,
        activity: [],
        requester_directory: {
          ...request.requester_directory,
          current_access: request.baseline_access,
        },
      });
    });
    vi.stubGlobal("fetch", requests);
    render(
      <AccessRequestsLane
        initialItems={[request]}
        initialDetail={null}
        initialPendingCount={1}
        initialNextCursor={null}
        referenceTime="2026-10-04T18:00:00Z"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Deny request" }));
    await user.type(
      screen.getByLabelText("Plain-English denial reason"),
      "Fixture decision reason",
    );
    await user.click(screen.getByRole("button", { name: "Confirm denial" }));
    await screen.findAllByText(/outcome is unknown/i);
    expect(screen.getByRole("button", { name: "Confirm denial" })).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Read original access request" }),
    );
    expect(
      requests.mock.calls.filter(([url]) => String(url).endsWith("/deny")),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Confirm denial" })).toBeDisabled();
  });

  it("S169 refuses an applied response whose receipt belongs to another request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/apply"))
          return Response.json({
            status: "applied",
            request: {
              schema_version: "access-request-receipt-v1",
              request_ref: "request_0002",
              request_version: 2,
              state: "applied",
            },
          });
        if (String(url).endsWith("/preview"))
          return Response.json({
            status: "ready",
            preview_hash: "a".repeat(64),
            preview: { request_ref: request.id, target_access: request.target_access },
          });
        return Response.json({
          request,
          activity: [],
          requester_directory: {
            ...request.requester_directory,
            current_access: request.baseline_access,
          },
        });
      }),
    );
    render(
      <AccessRequestsLane
        initialItems={[request]}
        initialDetail={null}
        initialPendingCount={1}
        initialNextCursor={null}
        referenceTime="2026-10-04T18:00:00Z"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Preview exact access change" }));
    await user.click(screen.getByRole("button", { name: "Confirm exact access change" }));
    await screen.findAllByText(/outcome is unknown/i);
    expect(
      screen.getByRole("button", { name: "Confirm exact access change" }),
    ).toBeDisabled();
  });

  it("S169 preserves the exact access preview and fences a response-lost claim attempt", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/apply")) throw new TypeError("response lost");
      if (String(url).endsWith("/preview"))
        return Response.json({
          status: "ready",
          preview_hash: "a".repeat(64),
          preview: { request_ref: request.id, target_access: request.target_access },
        });
      return Response.json({
        request,
        activity: [],
        requester_directory: {
          ...request.requester_directory,
          current_access: request.baseline_access,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccessRequestsLane
        initialItems={[request]}
        initialDetail={null}
        initialPendingCount={1}
        initialNextCursor={null}
        referenceTime="2026-10-04T18:00:00Z"
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Preview exact access change" }));
    await user.click(screen.getByRole("button", { name: "Confirm exact access change" }));
    await screen.findAllByText(/outcome is unknown/i);
    expect(
      screen.getByRole("button", { name: "Confirm exact access change" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Read original access request" }),
    ).toBeEnabled();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/apply")),
    ).toHaveLength(1);
  });
  it("S170 does not open an earlier access preview after another request was selected", async () => {
    const second = {
      ...request,
      id: "request_0002",
      intent_label_snapshot: "Second request",
    };
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).endsWith("/preview"))
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        return Promise.resolve(
          Response.json({
            request: String(url).includes(second.id) ? second : request,
            activity: [],
            requester_directory: {
              ...request.requester_directory,
              current_access: request.baseline_access,
            },
          }),
        );
      }),
    );
    render(
      <AccessRequestsLane
        initialItems={[request, second]}
        initialDetail={null}
        initialPendingCount={2}
        initialNextCursor={null}
        referenceTime="2026-10-04T18:00:00Z"
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Preview exact access change" }));
    await userEvent.setup().click(screen.getByRole("button", { name: /Second request/ }));
    await act(async () =>
      finish(
        Response.json({
          status: "ready",
          preview_hash: "a".repeat(64),
          preview: { request_ref: request.id, target_access: request.target_access },
        }),
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("S170 keeps the newest admitted filter result when the old read finishes later", async () => {
    const older = {
      ...request,
      id: "request_0002",
      intent_label_snapshot: "Old filter result",
    };
    const newer = {
      ...request,
      id: "request_0003",
      intent_label_snapshot: "Latest filter result",
    };
    const finish: ((value: Response) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === "POST")
          return new Promise<Response>((resolve) => finish.push(resolve));
        return Promise.resolve(
          Response.json({
            request: String(url).includes(newer.id) ? newer : older,
            activity: [],
            requester_directory: {
              ...request.requester_directory,
              current_access: request.baseline_access,
            },
          }),
        );
      }),
    );
    const view = render(
      <AccessRequestsLane
        initialItems={[]}
        initialDetail={null}
        initialPendingCount={0}
        initialNextCursor={null}
        referenceTime="2026-10-04T16:00:00Z"
      />,
    );
    fireEvent.change(screen.getByLabelText("Requester"), { target: { value: "Old" } });
    fireEvent.submit(view.container.querySelector("form")!);
    fireEvent.change(screen.getByLabelText("Requester"), { target: { value: "Latest" } });
    fireEvent.submit(view.container.querySelector("form")!);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      finish[1](Response.json({ items: [newer], pending_count: 1, next_cursor: null }));
    });
    await act(async () => {
      finish[0](Response.json({ items: [older], pending_count: 1, next_cursor: null }));
    });
    expect(screen.getAllByText("Latest filter result").length).toBeGreaterThan(0);
    expect(screen.queryByText("Old filter result")).toBeNull();
  });
  it("shows fresh directory context and immutable activity for the selected request", () => {
    render(
      <AccessRequestsLane
        initialDetail={{
          request,
          activity: [
            {
              schema_version: "access-request-activity-v1",
              id: "activity-1",
              request_id: request.id,
              request_version: 1,
              actor_uid: request.requester_uid,
              action: "submitted",
              created_at: request.created_at,
            },
          ],
          requester_directory: {
            state: "eligible",
            current_label: "Requesting Editor",
            current_access: request.baseline_access,
          },
        }}
        initialItems={[request]}
        initialNextCursor={null}
        initialPendingCount={1}
        referenceTime="2026-09-01T13:00:00.000Z"
      />,
    );

    expect(screen.getByText("Latest directory access:").parentElement).toHaveTextContent(
      "Editor · Maintenance",
    );
    expect(screen.getByRole("heading", { name: "Immutable activity" })).toBeVisible();
    expect(screen.getByText(/Submitted ·/)).toBeVisible();
    expect(screen.getByText("Access gained:").parentElement).toHaveTextContent(
      "Approve eligible app work, Resolve verified placeholders, Lease Renewals",
    );
  });

  it("posts requester filters in a bounded JSON body rather than an identity-bearing URL", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], next_cursor: null, pending_count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AccessRequestsLane
        initialDetail={null}
        initialItems={[]}
        initialNextCursor={null}
        initialPendingCount={0}
        referenceTime="2026-09-01T13:00:00.000Z"
      />,
    );

    await user.type(screen.getByLabelText("Requester"), "Requesting Editor");
    await user.selectOptions(screen.getByLabelText("Space"), "renewals");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/access/review");
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(options.body))).toMatchObject({
      schema_version: "access-request-admin-list-command-v1",
      filters: {
        requester_query: "Requesting Editor",
        space_id: "renewals",
        state: "pending",
        limit: 50,
      },
    });
  });
});
