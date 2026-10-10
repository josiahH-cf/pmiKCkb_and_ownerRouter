// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { MaintenanceHistoryReports } from "@/components/maintenance/MaintenanceHistoryReports";
import {
  projectMaintenanceReport,
  type SaveMaintenanceReportInput,
} from "@/lib/maintenance/report-model";
const report = projectMaintenanceReport({
    request: {
      scopeKind: "property",
      scopeId: "91",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      financialDateBasis: "service",
    },
    generatedAt: "2026-10-09T12:00:00Z",
    tickets: [],
    events: [],
    financial: [],
    artifacts: [],
    complete: true,
  }),
  hash = "a".repeat(64);
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function ready() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Prepare complete report" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Actual property ID"), {
    target: { value: "91" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare complete report" }));
  await screen.findByRole("heading", { name: /Property 91/ });
}
it("keeps a lost save identity and reconciles its actual immutable exports after reload without another POST", async () => {
  let command: SaveMaintenanceReportInput | undefined;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      command = JSON.parse(String(options.body));
      throw Error("Lost after original commit");
    }
    return Response.json(
      url.includes("report_id=")
        ? {
            id: command!.operationId,
            state: "saved",
            report,
            snapshotHash: hash,
            pdfHash: "b".repeat(64),
            csvHash: "c".repeat(64),
            retentionClass: "indefinite",
            legalHold: false,
            createdAt: report.generatedAt,
          }
        : { report, snapshotHash: hash },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const first = render(
    <MaintenanceHistoryReports actorUid="report-staff" canEdit initialMonth="2026-10" />,
  );
  await ready();
  fireEvent.click(screen.getByLabelText(/I reviewed these selected facts/));
  fireEvent.click(screen.getByLabelText(/Retain this snapshot and the exact PDF/));
  fireEvent.click(
    screen.getByRole("button", { name: "Save reviewed report and exports" }),
  );
  await screen.findByRole("button", { name: "Check original report save" });
  expect(new URL(location.href).searchParams.get("report_id")).toBe(command!.operationId);
  expect(screen.getByLabelText("Actual property ID")).toHaveValue("91");
  first.unmount();
  render(
    <MaintenanceHistoryReports actorUid="report-staff" canEdit initialMonth="2026-10" />,
  );
  await screen.findByRole("link", { name: "Download original PDF" });
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Download original CSV" })).toHaveAttribute(
    "href",
    expect.stringContaining(command!.operationId),
  );
});
it("rebuilds an admitted original's exact resume command from its private server read when session storage is missing", async () => {
  const id = "2cefb5b6-1db5-48cd-90e1-130afc27c254",
    fetch = vi.fn(async (_url: string, o?: RequestInit) =>
      Response.json({
        id,
        state: o?.method === "POST" ? "saved" : "preparing",
        report,
        snapshotHash: hash,
        pdfHash: "b".repeat(64),
        csvHash: "c".repeat(64),
        retentionClass: "indefinite",
        legalHold: false,
        createdAt: report.generatedAt,
      }),
    );
  vi.stubGlobal("fetch", fetch);
  render(
    <MaintenanceHistoryReports
      actorUid="report-staff"
      canEdit
      initialMonth="2026-10"
      initialReportId={id}
    />,
  );
  const resume = await screen.findByRole("button", {
    name: "Resume exact original report save",
  });
  fireEvent.click(resume);
  await screen.findByRole("link", { name: "Download original PDF" });
  const body = JSON.parse(
    String(fetch.mock.calls.find(([, o]) => o?.method === "POST")![1]!.body),
  );
  expect(body).toMatchObject({
    operationId: id,
    request: report.request,
    expectedSnapshotHash: hash,
    reviewedGeneratedAt: report.generatedAt,
    reviewedOwnerReadyContent: true,
    retainFactsAndExportsIndefinitely: true,
  });
});
it("keeps an earlier displayed report but refuses saving it as a changed selection after a failed fresh read", async () => {
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ++reads === 1
        ? Response.json({ report, snapshotHash: hash })
        : Response.json({ error: "Complete source read unavailable" }, { status: 409 }),
    ),
  );
  render(
    <MaintenanceHistoryReports actorUid="report-staff" canEdit initialMonth="2026-10" />,
  );
  await ready();
  fireEvent.change(screen.getByLabelText("Actual property ID"), {
    target: { value: "92" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Prepare complete report" }));
  await screen.findByText("Complete source read unavailable");
  expect(screen.getByLabelText("Actual property ID")).toHaveValue("92");
  expect(screen.getByRole("heading", { name: /Property 91/ })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Save reviewed report and exports" }),
  ).toBeDisabled();
});
