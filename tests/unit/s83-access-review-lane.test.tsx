// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
