// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { VendorWorkWorkspace } from "@/components/vendor/VendorWorkWorkspace";
import type { VendorContributionInput } from "@/lib/maintenance/vendor-work-model";
const ticket = {
  id: "fixture-ticket",
  status: "Open",
  priority: "Routine",
  summary: "Fixture work",
  unitLabel: "Fixture unit",
  updatedAt: "2026-10-09T12:00:00Z",
  assignmentGeneration: "a".repeat(64),
  reviewedPacket: null,
};
const view = { ticket, contributions: [], artifacts: [], operation: null };
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("preserves a lost report and original identity across reload, then reconciles without another submit or a mailbox", async () => {
  let command: VendorContributionInput | undefined,
    settled = false;
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      command = JSON.parse(String(options.body));
      throw Error("Lost response after app commit");
    }
    return Response.json({
      ...view,
      operation: command
        ? {
            operationId: command.operationId,
            state: settled ? "committed" : "not_recorded",
            committedVersion: settled ? 1 : null,
            detail: "Original outcome unresolved",
          }
        : null,
    });
  });
  vi.stubGlobal("fetch", fetch);
  const first = render(
    <VendorWorkWorkspace initialTicket={ticket} actorUid="vendor-one" />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit exact report for PMI review" }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Actual description"), {
    target: { value: "Keep my actual arrived work description" },
  });
  fireEvent.change(screen.getByLabelText("Initial report or revision reason"), {
    target: { value: "Actual work reported" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Submit exact report for PMI review" }),
  );
  await screen.findByRole("button", { name: "Check original report" });
  expect(screen.getByLabelText("Actual description")).toHaveValue(
    "Keep my actual arrived work description",
  );
  expect(
    screen.getByRole("button", { name: "Submit exact report for PMI review" }),
  ).toBeDisabled();
  first.unmount();
  render(<VendorWorkWorkspace initialTicket={ticket} actorUid="vendor-one" />);
  await screen.findByRole("button", { name: "Check original report" });
  expect(screen.getByLabelText("Actual description")).toHaveValue(command!.description);
  settled = true;
  fireEvent.click(screen.getByRole("button", { name: "Check original report" }));
  await screen.findByText(/Original report recorded at version 1/);
  expect(fetch.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  expect(
    screen.queryByRole("button", { name: "Check original report" }),
  ).not.toBeInTheDocument();
});
it("denies a stale assignment before new intent and keeps typed words until a deliberate fresh read", async () => {
  let requests = 0;
  const commands: VendorContributionInput[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        commands.push(JSON.parse(String(options.body)));
        return Response.json({ error: "Assignment generation changed" }, { status: 409 });
      }
      requests++;
      return Response.json({
        ...view,
        ticket: {
          ...ticket,
          assignmentGeneration:
            requests > 1 ? "b".repeat(64) : ticket.assignmentGeneration,
        },
      });
    }),
  );
  render(<VendorWorkWorkspace initialTicket={ticket} actorUid="vendor-one" />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit exact report for PMI review" }),
    ).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Actual description"), {
    target: { value: "Retained vendor words" },
  });
  fireEvent.change(screen.getByLabelText("Initial report or revision reason"), {
    target: { value: "Actual report" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Submit exact report for PMI review" }),
  );
  await screen.findByText("Assignment generation changed");
  expect(
    screen.getByRole("button", { name: "Submit exact report for PMI review" }),
  ).toBeDisabled();
  expect(screen.getByLabelText("Actual description")).toHaveValue(
    "Retained vendor words",
  );
  fireEvent.click(screen.getByRole("button", { name: "Read current assigned work" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit exact report for PMI review" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Submit exact report for PMI review" }),
  );
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[1].assignmentGeneration).toBe("b".repeat(64));
  expect(commands[1].operationId).not.toBe(commands[0].operationId);
});

it("opens the staff vendor panel through controlled disclosure and reads current work before enabling a choice", async () => {
  const { MaintenanceVendorWorkPanel } =
    await import("@/components/maintenance/MaintenanceVendorWorkPanel");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith("/vendor-work")
          ? {
              selection: null,
              packet: null,
              packetCurrent: false,
              contributions: [],
              artifacts: [],
              coreArtifacts: [],
            }
          : { roster: [] },
      ),
    ),
  );
  render(
    <MaintenanceVendorWorkPanel
      ticket={{
        ...ticket,
        id: "case-staff",
        unit: null,
        data_mode: "live",
        status: "Open",
        priority: "Normal",
        priority_provenance: "operator-set",
        description: "",
        photo_refs: [],
        reporter: { kind: "staff" },
        labels: [],
        space_id: "maintenance",
        created_at: "2026-10-09T12:00:00Z",
        updated_at: "2026-10-09T12:00:00Z",
      }}
      canEdit
      blocked={false}
      onApply={async () => true}
    />,
  );
  fireEvent.click(
    screen.getByText("Vendor selection, reviewed handoff and contributions"),
  );
  await screen.findByText(/No vendor deliberately selected/);
  expect(screen.getByLabelText(/Suitable verified vendor/)).toBeEnabled();
  fireEvent.click(
    screen.getByText("Vendor selection, reviewed handoff and contributions"),
  );
  expect(
    screen
      .getByText("Vendor selection, reviewed handoff and contributions")
      .closest("details"),
  ).not.toHaveAttribute("open");
});
