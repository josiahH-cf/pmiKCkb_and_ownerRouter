import { describe, expect, it } from "vitest";

import {
  AUTHENTICATED_CANARY_MANIFEST,
  addDiagnostic,
  classifyBrowserSignal,
  emptyDiagnosticCounts,
  hasBrowserDiagnostics,
  isCanaryRequestAllowed,
  routesForRole,
  statusClassOf,
} from "../../lib/production-assurance";
import {
  resolveCanaryCoordinates,
  resolveCanaryPhase,
  workspaceSelectorsForPhase,
} from "../../scripts/run-production-canary";

describe("production assurance browser policy", () => {
  it("requires an exact revision-configuration fingerprint before a live canary", () => {
    const fingerprint = `sha256:${"b".repeat(64)}`;
    expect(
      resolveCanaryCoordinates([
        "--project=pmi-kc-kb-prod",
        "--region=us-central1",
        "--service=pmi-kc-app",
        `--expected-config-fingerprint=${fingerprint}`,
      ]),
    ).toEqual({
      project: "pmi-kc-kb-prod",
      region: "us-central1",
      service: "pmi-kc-app",
      expectedConfigurationFingerprint: fingerprint,
    });
    expect(() => resolveCanaryCoordinates([])).toThrow(
      "expected_config_fingerprint_required",
    );
  });

  it("allows the legacy workspace selector only for exact-predecessor rollback recovery", () => {
    expect(resolveCanaryPhase([])).toBe("candidate");
    expect(resolveCanaryPhase(["--phase=rollback"])).toBe("rollback");
    expect(() => resolveCanaryPhase(["--phase=legacy"])).toThrow(
      "assurance_phase_invalid",
    );
    expect(workspaceSelectorsForPhase("candidate")).toHaveLength(1);
    expect(workspaceSelectorsForPhase("post_promotion")).toHaveLength(1);
    expect(workspaceSelectorsForPhase("rollback")).toEqual([
      'tr[data-workspace-available="true"] a.renewal-lease-link',
      "a.renewal-lease-link",
    ]);
  });

  it("permits only GET and HEAD", () => {
    expect(isCanaryRequestAllowed("GET")).toBe(true);
    expect(isCanaryRequestAllowed(" head ")).toBe(true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE"]) {
      expect(isCanaryRequestAllowed(method)).toBe(false);
    }
  });

  it("classifies every fatal browser signal without accepting raw content", () => {
    const signals = [
      {
        signal: { kind: "console", level: "error", firstParty: true } as const,
        expected: "console_error",
      },
      { signal: { kind: "page_error" } as const, expected: "page_error" },
      {
        signal: { kind: "request_failed", firstParty: true } as const,
        expected: "request_failed",
      },
      {
        signal: {
          kind: "response",
          firstParty: true,
          status: 500,
          expected: false,
        } as const,
        expected: "unexpected_response",
      },
      {
        signal: { kind: "error_boundary", boundary: "route" } as const,
        expected: "route_error_boundary",
      },
      {
        signal: { kind: "error_boundary", boundary: "global" } as const,
        expected: "global_error_boundary",
      },
      { signal: { kind: "mutation_attempt" } as const, expected: "mutation_attempt" },
      { signal: { kind: "auth_mismatch" } as const, expected: "auth_mismatch" },
      { signal: { kind: "landmark_missing" } as const, expected: "landmark_missing" },
    ];
    let counts = emptyDiagnosticCounts();
    for (const { signal, expected } of signals) {
      const classification = classifyBrowserSignal(signal);
      expect(classification).toBe(expected);
      counts = { ...addDiagnostic(counts, classification) };
    }
    expect(hasBrowserDiagnostics(counts)).toBe(true);
    expect(Object.values(counts)).toEqual(Array(signals.length).fill(1));
  });

  it("ignores third-party and explicitly expected response noise", () => {
    expect(
      classifyBrowserSignal({
        kind: "console",
        level: "error",
        firstParty: false,
      }),
    ).toBeNull();
    expect(
      classifyBrowserSignal({
        kind: "request_failed",
        firstParty: false,
      }),
    ).toBeNull();
    expect(
      classifyBrowserSignal({
        kind: "response",
        firstParty: true,
        status: 403,
        expected: true,
      }),
    ).toBeNull();
  });

  it("uses exact status classes", () => {
    expect(statusClassOf(200)).toBe("2xx");
    expect(statusClassOf(307)).toBe("3xx");
    expect(statusClassOf(404)).toBe("4xx");
    expect(statusClassOf(503)).toBe("5xx");
    expect(statusClassOf(undefined)).toBe("none");
  });
});

describe("authenticated role manifests", () => {
  it("has unique complete route keys for each managed role", () => {
    for (const role of ["Admin", "Editor"] as const) {
      const routes = routesForRole(role);
      expect(routes).toBe(AUTHENTICATED_CANARY_MANIFEST[role]);
      expect(new Set(routes.map((route) => route.key)).size).toBe(routes.length);
      expect(routes.some((route) => route.key === "renewal_workspace")).toBe(true);
      expect(
        routes.every((route) => route.path.startsWith("/") || route.dynamicFrom),
      ).toBe(true);
    }
  });

  it("checks the deployed Internal Processes navigation destination", () => {
    for (const role of ["Admin", "Editor"] as const) {
      expect(
        routesForRole(role).find((route) => route.key === "internal_processes"),
      ).toMatchObject({ path: "/spaces", heading: "Internal Processes" });
    }
  });

  it("requires Admin renders and Editor denials for protected destinations", () => {
    const admin = routesForRole("Admin");
    const editor = routesForRole("Editor");
    expect(admin.find((route) => route.key === "admin_hub")?.expectedOutcome).toBe(
      "rendered",
    );
    expect(
      editor.find((route) => route.key === "admin_hub_denied")?.expectedOutcome,
    ).toBe("denied");
    expect(
      editor.find((route) => route.key === "people_and_access_denied")?.expectedOutcome,
    ).toBe("denied");
  });
});
