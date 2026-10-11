// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OrdinaryRentvineWorkOrderPanel } from "@/components/maintenance/OrdinaryRentvineWorkOrderPanel";
import type { WorkOrderProjection } from "@/lib/integrations/rentvine/work-order-contract";
const order: WorkOrderProjection = {
  workOrderId: "101",
  workOrderNumber: "LOCAL-101",
  propertyId: "201",
  unitId: "301",
  leaseId: "401",
  workOrderStatusId: "501",
  primaryWorkOrderStatusId: "2",
  priorityId: "3",
  description: "Local synthetic dripping fixture",
  isOwnerApproved: "0",
  isVacant: "0",
  isSharedWithTenant: "0",
  isSharedWithOwner: "0",
  isNew: null,
  vendorTradeId: "601",
  vendorContactId: "701",
  assignedToUserId: "801",
};
const catalog = {
  statuses: [
    {
      workOrderStatusId: "501",
      primaryWorkOrderStatusId: "2",
      name: "In progress",
      isSystemStatus: "0",
    },
  ],
  trades: [{ vendorTradeId: "601", name: "Plumbing" }],
  filters: { propertyId: "201", unitId: "301" },
};
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
function fixture(detail: WorkOrderProjection | (() => WorkOrderProjection) = order) {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      if (body.operation === "link_status") return Response.json({ link: null });
      return Response.json({
        ...catalog,
        list: body.workOrderId ? null : { rows: [order], pages: 1, complete: false },
        detail: body.workOrderId
          ? {
              workOrder: typeof detail === "function" ? detail() : detail,
              schedulingStatusId: null,
            }
          : null,
      });
    }),
  );
  render(
    <OrdinaryRentvineWorkOrderPanel
      ticketId="local-case"
      canEdit={false}
      hasVerifiedUnit
      initialLink={null}
    />,
  );
  return calls;
}
it("exposes the existing bounded read, source status meanings, assignment IDs and exact detail without a write operation", async () => {
  const calls = fixture();
  expect(calls).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Check RentVine" }));
  const results = await screen.findByRole("region", { name: "RentVine readback" });
  expect(within(results).getByText(/list is incomplete/i)).toBeVisible();
  expect(within(results).getAllByText(/In progress.*Open/).length).toBeGreaterThan(0);
  fireEvent.click(
    within(results).getByRole("button", {
      name: "Inspect RentVine work order LOCAL-101",
    }),
  );
  const detail = await screen.findByRole("region", {
    name: "RentVine work-order detail",
  });
  for (const value of ["201", "301", "401", "701", "801", "Plumbing (601)"])
    expect(within(detail).getByText(value)).toBeVisible();
  expect(within(detail).getByText(/Local synthetic dripping fixture/)).toBeVisible();
  fireEvent.click(within(detail).getByText("Provider timing and summaries"));
  expect(
    within(detail).getByText("Provider modified time").nextElementSibling,
  ).toHaveTextContent("Not supplied by this read");
  expect(calls.map((call) => call.operation)).toEqual(["read", "link_status", "read"]);
  expect(calls[2]).toEqual({
    operation: "read",
    ticketId: "local-case",
    workOrderId: "101",
  });
});
it("labels omitted assignments and lease as unavailable instead of none or verified", async () => {
  fixture({
    ...order,
    vendorContactId: null,
    vendorTradeId: null,
    assignedToUserId: null,
    leaseId: null,
  });
  fireEvent.click(screen.getByRole("button", { name: "Check RentVine" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect RentVine work order LOCAL-101" }),
  );
  const detail = await screen.findByRole("region", {
    name: "RentVine work-order detail",
  });
  expect(
    within(detail)
      .getAllByText("Not supplied by this read")
      .filter((node) => !node.closest("details:not([open])")),
  ).toHaveLength(4);
  expect(detail).not.toHaveTextContent(/No vendor|No lease|Verified assignment/);
});
it("keeps the previous observation and exposes a mismatched identity instead of displaying another work order", async () => {
  let details = 0;
  const calls = fixture(() =>
    ++details === 1
      ? order
      : { ...order, workOrderId: "102", description: "Wrong case must never be shown" },
  );
  fireEvent.click(screen.getByRole("button", { name: "Check RentVine" }));
  const inspect = await screen.findByRole("button", {
    name: "Inspect RentVine work order LOCAL-101",
  });
  fireEvent.click(inspect);
  const detail = await screen.findByRole("region", {
    name: "RentVine work-order detail",
  });
  fireEvent.click(inspect);
  await screen.findByText(/exact work-order identity could not be verified/);
  expect(within(detail).getByText(order.description)).toBeVisible();
  expect(screen.queryByText("Wrong case must never be shown")).not.toBeInTheDocument();
  expect(calls.map((call) => call.operation)).toEqual([
    "read",
    "link_status",
    "read",
    "read",
  ]);
});
