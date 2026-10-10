// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { OrdinaryRentvineWorkOrderPanel } from "@/components/maintenance/OrdinaryRentvineWorkOrderPanel";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("keeps a lost Apply's exact original identity through reload, with no repeated consent or second dispatch", async () => {
  const id = `exec_${"a".repeat(40)}`;
  let applied = false;
  const fetch = vi.fn(async (_url: string, o?: RequestInit) => {
    const b = JSON.parse(String(o!.body));
    if (b.operation === "apply") {
      applied = true;
      throw Error("Fixture lost response after commit");
    }
    if (b.operation === "original")
      return Response.json({ state: applied ? "Succeeded" : "not_recorded" });
    if (b.operation === "review")
      return Response.json({
        executionId: id,
        reviewHash: "b".repeat(64),
        preview: {
          description: "Fixture reviewed exact scope",
          send_vendor_notification: false,
        },
      });
    if (b.operation === "link_status") return Response.json({ link: null });
    return Response.json({
      statuses: [
        { workOrderStatusId: "9101", primaryWorkOrderStatusId: "2", name: "Open" },
      ],
      trades: [],
      list: { rows: [], complete: true },
    });
  });
  vi.stubGlobal("fetch", fetch);
  const props = {
    ticketId: "fixture-case",
    canEdit: true,
    hasVerifiedUnit: true,
    initialLink: null,
  };
  const first = render(<OrdinaryRentvineWorkOrderPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Check RentVine" }));
  await screen.findByText("Current catalogs and complete work-order list read.");
  fireEvent.change(screen.getByLabelText("Initial status"), {
    target: { value: "9101" },
  });
  fireEvent.change(screen.getByLabelText("Actual unit occupancy"), {
    target: { value: "occupied" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Read exact change for review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Apply reviewed RentVine change" }),
  );
  await screen.findByRole("button", { name: "Check original provider operation" });
  expect(new URL(location.href).searchParams.get("work_order_execution")).toBe(id);
  first.unmount();
  render(<OrdinaryRentvineWorkOrderPanel {...props} />);
  await screen.findByText(/original provider operation succeeded/);
  expect(
    fetch.mock.calls.filter(([, o]) => JSON.parse(String(o!.body)).operation === "apply"),
  ).toHaveLength(1);
  expect(screen.queryByRole("link", { name: /Approval Queue/ })).toBeNull();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Read exact change for review" }),
    ).toBeDisabled(),
  );
});
