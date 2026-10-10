import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { projectMaintenanceReport } from "@/lib/maintenance/report-model";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  prepare: vi.fn(),
  save: vi.fn(),
  read: vi.fn(),
  stop: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: mocks.actor,
}));
vi.mock("@/lib/firestore/maintenance-reports", () => ({
  prepareMaintenanceReport: mocks.prepare,
  saveMaintenanceReport: mocks.save,
  readMaintenanceReport: mocks.read,
  stopOriginalMaintenanceReport: mocks.stop,
}));
import { GET, POST, PATCH } from "@/app/api/maintenance/reports/route";
const request = {
    scopeKind: "property" as const,
    scopeId: "91",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    financialDateBasis: "service" as const,
  },
  report = projectMaintenanceReport({
    request,
    generatedAt: "2026-10-09T12:00:00Z",
    tickets: [],
    events: [],
    financial: [],
    artifacts: [],
    complete: true,
  }),
  hash = "a".repeat(64),
  id = "2cefb5b6-1db5-48cd-90e1-130afc27c254";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  vi.stubEnv("LOCAL_DEMO_AUTH", "false");
  vi.stubEnv("ASK_DEMO_MODE", "false");
  mocks.actor.mockResolvedValue({
    uid: "staff",
    email: "staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  });
  mocks.prepare.mockResolvedValue({ report, snapshotHash: hash });
});
afterEach(() => vi.unstubAllEnvs());
it("returns a private complete projection and neutral UTF-8 CSV from the same reviewed facts", async () => {
  const response = await GET(
    new Request(
      `https://fixture.invalid/api/maintenance/reports?${new URLSearchParams(request)}`,
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const csv = await GET(
    new Request(
      `https://fixture.invalid/api/maintenance/reports?${new URLSearchParams({ ...request, format: "csv", expected_snapshot_hash: hash, generated_at: report.generatedAt })}`,
    ),
  );
  expect(csv.status).toBe(200);
  expect(csv.headers.get("content-type")).toContain("text/csv");
  expect(await csv.text()).toContain(report.generatedAt);
  expect(mocks.save).not.toHaveBeenCalled();
});
it("refuses changed prepared facts, duplicated scope keys and unknown filters", async () => {
  const params = new URLSearchParams({
    ...request,
    format: "csv",
    expected_snapshot_hash: "b".repeat(64),
    generated_at: report.generatedAt,
  });
  expect(
    (await GET(new Request(`https://fixture.invalid/api/maintenance/reports?${params}`)))
      .status,
  ).toBe(409);
  mocks.prepare.mockClear();
  expect(
    (
      await GET(
        new Request(
          `https://fixture.invalid/api/maintenance/reports?${new URLSearchParams(request)}&scopeId=92`,
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await GET(
        new Request(
          `https://fixture.invalid/api/maintenance/reports?${new URLSearchParams(request)}&includeRaw=true`,
        ),
      )
    ).status,
  ).toBe(400);
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it("serves only an already retained original export through current authenticated access", async () => {
  mocks.read.mockResolvedValue({
    id,
    state: "saved",
    report,
    bytes: Buffer.from("%PDF-1.7 local original"),
  });
  const response = await GET(
    new Request(
      `https://fixture.invalid/api/maintenance/reports?report_id=${id}&format=pdf`,
    ),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(mocks.actor).toHaveBeenCalledWith("read", "maintenance");
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});
it("requires an exact reviewed save and preserves an app-only original cutoff", async () => {
  const input = {
    operationId: id,
    request,
    expectedSnapshotHash: hash,
    reviewedGeneratedAt: report.generatedAt,
    reviewedOwnerReadyContent: true,
    retainFactsAndExportsIndefinitely: true,
  };
  mocks.save.mockResolvedValue({ id, state: "saved", report });
  const response = await POST(
    new Request("https://fixture.invalid/api/maintenance/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.save.mock.calls[0][1]).toEqual(input);
  mocks.stop.mockResolvedValue({ id, state: "cancelled" });
  expect(
    (
      await PATCH(
        new Request("https://fixture.invalid/api/maintenance/reports", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationId: id, op: "stop_before_admission" }),
        }),
      )
    ).status,
  ).toBe(200);
  expect(mocks.stop).toHaveBeenCalledWith(expect.objectContaining({ uid: "staff" }), id);
});
it("refuses a retired context and malformed admission before an owning save", async () => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
  expect(
    (
      await POST(
        new Request("https://fixture.invalid/api/maintenance/reports", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(409);
  expect(mocks.save).not.toHaveBeenCalled();
});
