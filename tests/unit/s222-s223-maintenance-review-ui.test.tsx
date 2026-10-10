// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { MaintenanceOperatingPolicies } from "@/components/maintenance/MaintenanceOperatingPolicies";
import { MaintenanceReviews } from "@/components/maintenance/MaintenanceReviews";
import type { ApplyOperatingPolicy } from "@/lib/maintenance/operating-policy";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
const unset = {
    state: "unset",
    policy: null,
    detail: "No applicable approved policy is configured.",
  },
  scope = { head: null, history: [], nextBeforeVersion: null, applicable: unset };
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("saves an actual policy through one clear action and recovers a lost committed result after reload without a second save", async () => {
  let command: ApplyOperatingPolicy | undefined;
  const fetch = vi.fn(async (url: string, o?: RequestInit) => {
    if (o?.method === "POST") {
      command = JSON.parse(String(o.body));
      throw Error("Original committed response lost");
    }
    return Response.json(
      url.includes("operation_id=")
        ? {
            operationId: command!.operationId,
            state: "committed",
            head: { version: 1 },
            version: { version: 1 },
          }
        : scope,
    );
  });
  vi.stubGlobal("fetch", fetch);
  const first = render(
    <MaintenanceOperatingPolicies actorUid="fixture-staff" canManage />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Read selected current policy" }));
  await screen.findByText("Saved scope version: 0.");
  fireEvent.change(screen.getByLabelText("Policy title"), {
    target: { value: "Actual fixture approved policy" },
  });
  fireEvent.change(screen.getByLabelText("Saved state"), {
    target: { value: "approved" },
  });
  fireEvent.change(screen.getByLabelText(/Effective date/), {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(screen.getByLabelText(/Actual policy source evidence/), {
    target: { value: "fixture actual approved source" },
  });
  fireEvent.change(screen.getByLabelText(/Change, correction or revocation reason/), {
    target: { value: "Actual staff source review" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save reviewed policy version" }));
  await screen.findByRole("button", { name: "Check original policy save" });
  expect(command).toMatchObject({
    op: "save_version",
    expectedVersion: 0,
    reviewedExactPolicy: true,
    policy: { state: "approved", scope: { kind: "organization" } },
  });
  expect(new URL(location.href).searchParams.get("operating_policy_operation")).toBe(
    command!.operationId,
  );
  expect(screen.getByLabelText("Policy title")).toHaveValue(
    "Actual fixture approved policy",
  );
  first.unmount();
  render(<MaintenanceOperatingPolicies actorUid="fixture-staff" canManage />);
  await screen.findByText(/Original policy version 1 is recorded/);
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
});
it("holds an unknown original with missing local words and supports an exact pre-admission cutoff without guessing policy content", async () => {
  const id = "e4b67cc4-9e89-4975-9ce1-aa72e40cb863";
  history.replaceState(null, "", `/?operating_policy_operation=${id}`);
  const fetch = vi.fn(async (_url: string, o?: RequestInit) =>
    Response.json(
      o?.method === "PATCH"
        ? {
            operationId: id,
            state: "cancelled",
            detail: "Exact original stopped before admission",
          }
        : { operationId: id, state: "not_recorded" },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<MaintenanceOperatingPolicies actorUid="fixture-staff" canManage />);
  await screen.findByText(/The original save has no settled result yet/);
  expect(
    screen.queryByRole("button", { name: "Resume the same exact policy save" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Stop original save before admission" }),
  );
  await screen.findByText("Exact original stopped before admission");
  expect(
    JSON.parse(String(fetch.mock.calls.find(([, o]) => o?.method === "PATCH")![1]!.body)),
  ).toEqual({ op: "stop_before_admission", operationId: id });
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
});
it("records concern for staff review through one Save without liability, amount, case closure or a customer send", async () => {
  const ticket: MaintenanceTicketRecord = {
    id: "fixture-case",
    record_version: 3,
    data_mode: "live",
    status: "Open",
    priority: "Normal",
    priority_provenance: "auto-inferred",
    summary: "Actual fixture issue",
    description: "Actual reviewed fixture facts",
    unit: null,
    photo_refs: [],
    reporter: { kind: "staff", uid: "fixture-staff" },
    labels: [],
    space_id: "maintenance",
    created_at: "2026-10-09T12:00:00.000Z",
    updated_at: "2026-10-09T12:00:00.000Z",
  };
  const fetch = vi.fn(async (_url: string, _options?: RequestInit) => {
      void _url;
      void _options;
      return Response.json({
        ticket,
        emergency: unset,
        chargeback: unset,
        urgencyNeedsReview: true,
        responsibilityNeedsReview: false,
        approvedGuidance: null,
        guidanceHold: "No approved actual responsibility guidance",
      });
    }),
    apply = vi.fn(async (command: Record<string, unknown>) => {
      void command;
      return false;
    });
  vi.stubGlobal("fetch", fetch);
  render(
    <MaintenanceReviews
      ticket={ticket}
      canEdit
      blocked={false}
      onApply={apply}
      onReadCurrent={async () => {}}
    />,
  );
  fireEvent.click(screen.getByText("Urgency and responsibility review", { exact: true }));
  await screen.findByText("No approved actual responsibility guidance");
  fireEvent.change(screen.getByLabelText("Responsibility review reason"), {
    target: { value: "Actual reported concern needs review" },
  });
  fireEvent.change(screen.getByLabelText(/Actual resident concern or refusal/), {
    target: { value: "Actual fixture resident concern" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save staff responsibility review" }),
  );
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
  expect(apply.mock.calls[0][0]).toMatchObject({
    op: "responsibility_review",
    review: {
      state: "pending_assessment",
      proposedAmountCents: null,
      allocations: [],
      residentConcern: "Actual fixture resident concern",
      reviewedByStaff: true,
    },
  });
  expect(screen.getByLabelText("Responsibility review reason")).toHaveValue(
    "Actual reported concern needs review",
  );
  expect(fetch.mock.calls.every(([, o]) => !o || o.method === undefined)).toBe(true);
});
