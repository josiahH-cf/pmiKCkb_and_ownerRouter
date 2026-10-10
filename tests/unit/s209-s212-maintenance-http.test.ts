import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("@/lib/firestore/maintenance-case-records", () => ({
  applyMaintenanceCaseOperation: vi.fn(),
  readMaintenanceCaseHistory: vi.fn(),
}));
vi.mock("@/lib/firestore/maintenance-vendor-work", () => ({
  readMaintenanceVendorRoster: vi.fn(),
  readMaintenanceRosterOperation: vi.fn(),
  saveMaintenanceVendorRoster: vi.fn(),
  readStaffVendorWork: vi.fn(),
  readStaffVendorArtifact: vi.fn(),
  applyMaintenanceVendorOperation: vi.fn(),
  readVendorWork: vi.fn(),
  submitVendorContribution: vi.fn(),
  readVendorArtifact: vi.fn(),
  readVendorPacketArtifact: vi.fn(),
  uploadVendorArtifact: vi.fn(),
}));
vi.mock("@/lib/vendor/auth", () => ({ requireVendorSession: vi.fn() }));
import { setAuthResolverForTest } from "@/lib/auth/session";
import { requireVendorSession } from "@/lib/vendor/auth";
import { VendorBoundaryError } from "@/lib/vendor/model";
import * as store from "@/lib/firestore/maintenance-vendor-work";
import {
  applyMaintenanceCaseOperation,
  readMaintenanceCaseHistory,
} from "@/lib/firestore/maintenance-case-records";
import { PATCH } from "@/app/api/maintenance/tickets/[ticketId]/route";
import { GET as history } from "@/app/api/maintenance/tickets/[ticketId]/history/route";
import {
  POST as report,
  GET as work,
} from "@/app/api/vendor/tickets/[ticketId]/work/route";
import {
  POST as upload,
  GET as artifact,
} from "@/app/api/vendor/tickets/[ticketId]/artifacts/route";
const context = { params: Promise.resolve({ ticketId: "fixture-ticket" }) },
  p = {
    uid: "vendor-fixture",
    vendorId: "vendor-fixture",
    email: "vendor@fixture.invalid",
    emailVerified: true as const,
    totpVerified: true as const,
    sessionIssuedAt: Date.now(),
    dataMode: "live" as const,
  };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
  setAuthResolverForTest(() => ({
    uid: "staff",
    email: "staff@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  }));
  vi.mocked(requireVendorSession).mockResolvedValue(p);
});
afterEach(() => {
  setAuthResolverForTest(null);
  vi.unstubAllEnvs();
});
const request = (body: unknown) =>
  new Request("http://fixture.invalid/work", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
it("authenticates before parsing/retention and rejects readonly execution before any owning write", async () => {
  vi.mocked(requireVendorSession).mockRejectedValue(
    new VendorBoundaryError("Sign in required", 401),
  );
  const r = request({ anything: true });
  expect((await report(r, context)).status).toBe(401);
  expect(r.bodyUsed).toBe(false);
  vi.mocked(requireVendorSession).mockResolvedValue(p);
  vi.stubEnv("DATA_CONTEXT", "live_readonly");
  expect((await report(request({ anything: true }), context)).status).toBe(409);
  expect(store.submitVendorContribution).not.toHaveBeenCalled();
});
it("rejects forged financial verification and dispatch fields while routing actual reviewed case commands to the owning transaction", async () => {
  const body = {
    op: "association",
    operationId: randomUUID(),
    expectedVersion: 1,
    association: {
      kind: "unresolved",
      propertyId: null,
      unitId: null,
      leaseId: null,
      eventDate: "2026-10-09",
      evidenceRef: "private-evidence:fixture",
      reason: "Awaiting actual tenancy evidence",
    },
  };
  vi.mocked(applyMaintenanceCaseOperation).mockResolvedValue({
    id: "fixture-ticket",
  } as never);
  const response = await PATCH(request(body), context);
  expect(response.status).toBe(200);
  expect(applyMaintenanceCaseOperation).toHaveBeenCalledOnce();
  expect(
    (await PATCH(request({ ...body, sendVendorNotification: true }), context)).status,
  ).toBe(400);
  expect(
    (
      await PATCH(
        request({ ...body, op: "financial", entry: { kind: "payment_observation" } }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(applyMaintenanceCaseOperation).toHaveBeenCalledOnce();
});
it("refuses duplicate or extra query selectors and sets private no-store on a genuine assigned result", async () => {
  expect(
    (
      await history(
        new Request(
          "http://fixture.invalid/history?after=" +
            randomUUID() +
            "&after=" +
            randomUUID(),
        ),
        context,
      )
    ).status,
  ).toBe(400);
  expect(readMaintenanceCaseHistory).not.toHaveBeenCalled();
  expect(
    (
      await artifact(
        new Request(
          "http://fixture.invalid/artifacts?artifact_id=" +
            randomUUID() +
            "&ticket_id=other",
        ),
        context,
      )
    ).status,
  ).toBe(400);
  expect(store.readVendorArtifact).not.toHaveBeenCalled();
  vi.mocked(store.readVendorWork).mockResolvedValue({
    ticket: { id: "fixture-ticket" },
  } as never);
  const response = await work(new Request("http://fixture.invalid/work"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(store.readVendorWork).toHaveBeenCalledWith(p, "fixture-ticket", undefined);
});
it("bounds the actual streamed upload size even without a trustworthy Content-Length", async () => {
  const r = new Request("http://fixture.invalid/artifacts", {
    method: "POST",
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(7 * 1024 * 1024 + 4097));
        c.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  expect((await upload(r, context)).status).toBe(413);
  expect(store.uploadVendorArtifact).not.toHaveBeenCalled();
});
it("rejects unsupported unbounded contribution fields before saving any artifact or submission", async () => {
  expect(
    (
      await report(
        request({
          operationId: randomUUID(),
          send: true,
          close: true,
          paymentVerified: true,
        }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await upload(
        request({
          operationId: randomUUID(),
          filename: "private-transcript.exe",
          mimeType: "application/octet-stream",
          rawTranscript: "private",
        }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(store.submitVendorContribution).not.toHaveBeenCalled();
  expect(store.uploadVendorArtifact).not.toHaveBeenCalled();
});
