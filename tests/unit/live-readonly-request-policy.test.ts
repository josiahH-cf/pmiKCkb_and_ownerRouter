import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS,
  decideLiveReadonlyRequest,
} from "@/lib/environment/live-readonly-request-policy";
import type { EnvironmentDescriptorResult } from "@/lib/environment/descriptor";

const liveReadOnly: EnvironmentDescriptorResult = {
  ok: true,
  descriptor: {
    dataContext: "live_readonly",
    environmentKind: "demo",
    source: "explicit",
  },
};

const productionLive: EnvironmentDescriptorResult = {
  ok: true,
  descriptor: {
    dataContext: "live",
    environmentKind: "production",
    source: "explicit",
  },
};

describe("Live-read-only request policy (AC-S56-6)", () => {
  it("defaults every non-safe request to refusal and keeps the allowlist exact", () => {
    expect([...LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS.keys()].sort()).toEqual([
      "DELETE /api/auth/session",
      "DELETE /api/vendor/auth/session",
      "POST /api/ask",
      "POST /api/ask/live-target",
      "POST /api/ask/transcribe",
      "POST /api/auth/demo",
      "POST /api/auth/session",
      "POST /api/connections/verify",
      "POST /api/maintenance/match-unit",
      "POST /api/maintenance/transcribe",
      "POST /api/processes/classify",
      "POST /api/report-issue/transcribe",
      "POST /api/vendor/auth/session",
    ]);

    for (const request of [
      ["POST", "/api/report-issue"],
      ["POST", "/api/gmail-hub/drafts"],
      ["POST", "/api/maintenance/tickets"],
      ["PATCH", "/api/approval-queue/item-1"],
      ["DELETE", "/api/sops/sop-1"],
      ["POST", "/lease-renewal"],
      ["POST", "/api/not-yet-invented"],
    ] as const) {
      expect(
        decideLiveReadonlyRequest({
          descriptor: liveReadOnly,
          method: request[0],
          pathname: request[1],
        }),
      ).toMatchObject({ allowed: false, status: 409 });
    }
  });

  it("allows safe reads plus only the reviewed non-persisting local operations", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"] as const) {
      expect(
        decideLiveReadonlyRequest({
          descriptor: liveReadOnly,
          method,
          pathname: "/api/maintenance/tickets",
        }),
      ).toEqual({ allowed: true });
    }

    for (const key of LIVE_READONLY_ALLOWED_NON_SAFE_REQUESTS.keys()) {
      const separator = key.indexOf(" ");
      expect(
        decideLiveReadonlyRequest({
          descriptor: liveReadOnly,
          method: key.slice(0, separator),
          pathname: key.slice(separator + 1),
        }),
      ).toEqual({ allowed: true });
    }
  });

  it("refuses the semantically mutating screenshot reconcile even though it uses GET", () => {
    expect(
      decideLiveReadonlyRequest({
        descriptor: liveReadOnly,
        method: "GET",
        pathname: "/api/lease-renewal/comp-screenshot",
        searchParams: new URLSearchParams({ operation: "reconcile" }),
      }),
    ).toMatchObject({ allowed: false, status: 409 });
    expect(
      decideLiveReadonlyRequest({
        descriptor: liveReadOnly,
        method: "GET",
        pathname: "/api/lease-renewal/comp-screenshot",
        searchParams: new URLSearchParams({ operation: "status" }),
      }),
    ).toEqual({ allowed: true });
  });

  it("does not narrow ordinary Production or Demo-owned workflows", () => {
    expect(
      decideLiveReadonlyRequest({
        descriptor: productionLive,
        method: "POST",
        pathname: "/api/maintenance/tickets",
      }),
    ).toEqual({ allowed: true });
    expect(
      decideLiveReadonlyRequest({
        descriptor: {
          ok: true,
          descriptor: {
            dataContext: "demo",
            environmentKind: "demo",
            source: "explicit",
          },
        },
        method: "POST",
        pathname: "/api/maintenance/tickets",
      }),
    ).toEqual({ allowed: true });
  });

  it("fails closed on an invalid descriptor before any non-safe request", () => {
    expect(
      decideLiveReadonlyRequest({
        descriptor: { ok: false, issues: ["DATA_CONTEXT is missing"] },
        method: "POST",
        pathname: "/api/auth/demo",
      }),
    ).toMatchObject({ allowed: false, status: 503 });
    expect(
      decideLiveReadonlyRequest({
        descriptor: { ok: false, issues: ["DATA_CONTEXT is missing"] },
        method: "GET",
        pathname: "/api/maintenance/tickets",
      }),
    ).toMatchObject({ allowed: false, status: 503 });
  });

  it("keeps the Next proxy broad and wired to the server-owned descriptor", () => {
    const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");

    expect(source).toContain("resolveEnvironmentDescriptor");
    expect(source).toContain("decideLiveReadonlyRequest");
    expect(source).toMatch(/export\s+function\s+proxy\s*\(/);
    expect(source).toContain("_next/static");
    expect(source).not.toMatch(/matcher[^\n]+\/api\//);
  });
});
