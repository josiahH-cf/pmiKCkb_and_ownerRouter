// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { randomUUID } from "node:crypto";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { RenewalLeaseFollowUps } from "@/components/lease-renewal/RenewalLeaseFollowUps";
import { WorkAccountabilityBoard } from "@/components/work/WorkAccountabilityBoard";
import {
  WORK_RETENTION_POLICY_VERSION,
  type WorkTaskRecord,
} from "@/lib/work-accountability/types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let tasks: WorkTaskRecord[],
  calls: Array<{ method: string; body: Record<string, unknown> | null }>,
  lose: boolean,
  contextAvailable: boolean;
let intentTask: WorkTaskRecord | null;
const task = (): WorkTaskRecord => ({
  id: "wa_fixture",
  space_id: "lease-renewals",
  source: {
    type: "renewal_lease",
    id: "115",
    link: "/lease-renewal/live/desk/lease/115",
    status: "verified",
  },
  task_type: "lease_follow_up:insurance",
  title: "Review actual insurance evidence",
  assignee_uid: "editor",
  creator_uid: "editor",
  state: "Not started",
  next_action: "Check the supplied material",
  created_at: "2026-10-09T15:00:00Z",
  updated_at: "2026-10-09T15:00:00Z",
  record_version: 1,
  retention_policy_version: WORK_RETENTION_POLICY_VERSION,
  legal_hold: false,
  renewal_follow_up: {
    schema_version: "lease-follow-up/v1",
    lease_id: "115",
    cycle_key: "lease_end:2026-12-31",
    cycle_label: "Lease end 2026-12-31",
    recorded_cycle_id: null,
    kind: "insurance",
    notes: "Applicability is not established",
    supporting_references: [],
    match_key: "a".repeat(64),
  },
});
beforeEach(() => {
  tasks = [];
  calls = [];
  lose = false;
  contextAvailable = true;
  intentTask = null;
  history.replaceState({}, "", "/lease-renewal/live/desk/lease/115");
  vi.stubGlobal("crypto", { randomUUID });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input), "http://localhost"),
        method = options?.method ?? "GET",
        body = options?.body ? JSON.parse(String(options.body)) : null;
      calls.push({ method, body });
      if (method !== "GET") {
        const result = task();
        result.title = body.title ?? result.title;
        result.renewal_follow_up!.notes = body.notes ?? result.renewal_follow_up!.notes;
        tasks = [result];
        intentTask = result;
        if (lose) {
          lose = false;
          throw new TypeError("Lost response after task persisted");
        }
        return Response.json({ task: result, existing: false, replayed: false });
      }
      if (url.searchParams.has("creation_intent"))
        return intentTask
          ? Response.json({ task: intentTask, existing: false, replayed: true })
          : Response.json({ error: "No receipt" }, { status: 404 });
      if (url.searchParams.has("lease_id"))
        return Response.json({
          snapshot: {
            tasks,
            activity: [],
            cursor: null,
            history_may_be_truncated: false,
          },
          context: contextAvailable
            ? { cycle_key: "lease_end:2026-12-31", cycle_label: "Lease end 2026-12-31" }
            : null,
          contextError: contextAvailable ? "" : "The actual cycle is unavailable",
        });
      return Response.json({
        snapshot: {
          tasks,
          editable_task_ids: tasks.map((t) => t.id),
          sessions: [],
          expectations: [],
          mappings: [],
          server_now: "2026-10-09T15:00:00Z",
          record_limit: 500,
          may_be_truncated: false,
        },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("recovers one durable creation intent after a lost response and projects the same notes in My Work", async () => {
  const view = render(<RenewalLeaseFollowUps leaseId="115" canEdit admin={false} />);
  const region = screen.getByRole("region", { name: "Lease follow-up tasks" });
  fireEvent.click(await within(region).findByText(/Lease follow-up tasks \(0\)/));
  await within(region).findByText("Lease end 2026-12-31", { exact: false });
  expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  fireEvent.change(within(region).getByLabelText("Task title"), {
    target: { value: "Review actual insurance evidence" },
  });
  fireEvent.change(within(region).getByLabelText("Next staff action"), {
    target: { value: "Check the supplied material" },
  });
  fireEvent.change(within(region).getByLabelText("Task context and unknown facts"), {
    target: { value: "Applicability is not established" },
  });
  lose = true;
  fireEvent.submit(within(region).getByLabelText("Task title").closest("form")!);
  await within(region).findByRole("button", { name: "Recover original task" });
  expect(new URL(location.href).searchParams.get("leaseFollowUpIntent")).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  expect(within(region).getByLabelText("Task title")).toBeDisabled();
  fireEvent.click(within(region).getByRole("button", { name: "Recover original task" }));
  await within(region).findByText(/Recovered the created task/);
  expect(calls.filter((c) => c.method !== "GET")).toHaveLength(1);
  expect(new URL(location.href).searchParams.has("leaseFollowUpIntent")).toBe(false);
  expect(
    within(region).getByRole("link", { name: "Open this task in My Work" }),
  ).toHaveAttribute("href", "/work#work-task-wa_fixture");
  view.unmount();
  render(
    <WorkAccountabilityBoard
      mode="mine"
      mutationAllowed
      spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
    />,
  );
  await screen.findByRole("heading", { name: "Review actual insurance evidence" });
  expect(screen.getByText("Applicability is not established")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open linked renewal lease" })).toHaveAttribute(
    "href",
    "/lease-renewal/live/desk/lease/115",
  );
});
it("keeps entered words on a source outage and restores an unresolved URL intent without dispatching it", async () => {
  history.replaceState(
    {},
    "",
    `/lease-renewal/live/desk/lease/115?leaseFollowUpIntent=${randomUUID()}`,
  );
  render(<RenewalLeaseFollowUps leaseId="115" canEdit admin={false} />);
  await screen.findByText(/original intent has no readable task receipt/);
  fireEvent.click(screen.getByText("Lease follow-up tasks (0)"));
  const title = screen.getByLabelText("Task title");
  fireEvent.change(title, { target: { value: "Keep this uncertain policy question" } });
  contextAvailable = false;
  fireEvent.click(screen.getByRole("button", { name: "Refresh lease tasks" }));
  await screen.findByText("The actual cycle is unavailable");
  expect(title).toHaveValue("Keep this uncertain policy question");
  expect(screen.getByRole("button", { name: "Create lease task" })).toBeDisabled();
  expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
});
it("offers assigned staff a reasoned reopen for lease follow-ups while preserving ordinary task restrictions", async () => {
  const completed = {
    ...task(),
    state: "Completed" as const,
    completed_at: "2026-10-09T15:00:00Z",
  };
  tasks = [
    completed,
    {
      ...completed,
      id: "wa_unrelated",
      title: "Unrelated completed work",
      task_type: "manual",
      renewal_follow_up: undefined,
      source: { type: "manual", status: "verified" },
    },
  ];
  render(
    <WorkAccountabilityBoard
      mode="mine"
      mutationAllowed
      spaces={[{ id: "lease-renewals", name: "Lease Renewals" }]}
    />,
  );
  await screen.findByRole("heading", { name: completed.title });
  const cards = screen.getAllByRole("article");
  expect(within(cards[0]).getByText("Reopen task")).toBeVisible();
  expect(within(cards[1]).queryByText("Reopen task")).toBeNull();
});
