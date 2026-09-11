import { describe, expect, it, vi } from "vitest";
import {
  emptyDiagnosticCounts,
  routesForRole,
  type RouteAssuranceEvidence,
} from "../../lib/production-assurance";
import { readCanaryRoutes } from "../../scripts/run-production-canary";

describe("complete canary route scheduling", () => {
  it("checks the entire Admin manifest with bounded pages and discovers the workspace only after the desk", async () => {
    vi.useFakeTimers();
    try {
      const definitions = routesForRole("Admin");
      const finished = new Set<string>();
      let active = 0;
      let peak = 0;
      const pending = readCanaryRoutes(
        definitions,
        false,
        new AbortController().signal,
        async (definition) => {
          if (definition.dynamicFrom)
            expect(finished.has(definition.dynamicFrom)).toBe(true);
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) =>
            setTimeout(resolve, definition.key === "renewal_desk" ? 37 : 11),
          );
          finished.add(definition.key);
          active -= 1;
          return {
            actorRole: "Admin",
            routeKey: definition.key,
            outcome: "rendered",
            statusClass: "2xx",
            elapsedMs: 11,
            landmarkPresent: true,
            diagnostics: emptyDiagnosticCounts(),
          };
        },
      );
      await vi.runAllTimersAsync();
      const results = await pending;
      expect(results.map((result) => result.routeKey)).toEqual(
        definitions.map((definition) => definition.key),
      );
      expect(results).toHaveLength(13);
      expect(finished.size).toBe(13);
      expect(peak).toBe(3);
      expect(active).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retains failed or denied evidence and the original serial predecessor order", async () => {
    const definitions = routesForRole("Editor");
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const results = await readCanaryRoutes(
      definitions,
      true,
      new AbortController().signal,
      async (definition): Promise<RouteAssuranceEvidence> => {
        active += 1;
        peak = Math.max(peak, active);
        order.push(definition.key);
        await Promise.resolve();
        active -= 1;
        return {
          actorRole: "Editor",
          routeKey: definition.key,
          outcome: definition.key === "my_work" ? "failed" : definition.expectedOutcome,
          statusClass: "2xx",
          elapsedMs: 1,
          landmarkPresent: definition.key !== "my_work",
          diagnostics: {
            ...emptyDiagnosticCounts(),
            mutation_attempt: definition.key === "my_work" ? 1 : 0,
          },
        };
      },
    );
    expect(order).toEqual(definitions.map((definition) => definition.key));
    expect(peak).toBe(1);
    expect(results.find((result) => result.routeKey === "my_work")).toMatchObject({
      outcome: "failed",
      diagnostics: { mutation_attempt: 1 },
    });
    expect(results.filter((result) => result.outcome === "denied")).toHaveLength(2);
  });

  it("never starts the dependent workspace when the shared deadline cancels its source reads", async () => {
    const controller = new AbortController();
    const read = vi.fn(async (definition) => {
      controller.abort(new Error("shared_deadline"));
      return { routeKey: definition.key } as RouteAssuranceEvidence;
    });
    await expect(
      readCanaryRoutes(routesForRole("Admin"), false, controller.signal, read),
    ).rejects.toThrow("shared_deadline");
    expect(read.mock.calls.every(([definition]) => !definition.dynamicFrom)).toBe(true);
  });

  it("does not defer the discovered workspace behind an unrelated slow page", async () => {
    vi.useFakeTimers();
    try {
      const manifest = routesForRole("Admin");
      const definitions = ["renewal_desk", "dashboard", "renewal_workspace"].map(
        (key) => manifest.find((definition) => definition.key === key)!,
      );
      const finished = new Set<string>();
      const pending = readCanaryRoutes(
        definitions,
        false,
        new AbortController().signal,
        async (definition) => {
          if (definition.dynamicFrom) {
            expect(finished.has("renewal_desk")).toBe(true);
            expect(finished.has("dashboard")).toBe(false);
          }
          await new Promise((resolve) =>
            setTimeout(resolve, definition.key === "dashboard" ? 100 : 10),
          );
          finished.add(definition.key);
          return { routeKey: definition.key } as RouteAssuranceEvidence;
        },
      );
      await vi.runAllTimersAsync();
      expect((await pending).map((result) => result.routeKey)).toEqual(
        definitions.map((definition) => definition.key),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates a failed source and refuses a missing dependency before any page starts", async () => {
    const manifest = routesForRole("Admin");
    const desk = manifest.find((definition) => definition.key === "renewal_desk")!;
    const workspace = manifest.find(
      (definition) => definition.key === "renewal_workspace",
    )!;
    const read = vi.fn(async () => {
      throw new Error("source_page_failed");
    });
    await expect(
      readCanaryRoutes([desk, workspace], false, new AbortController().signal, read),
    ).rejects.toThrow("source_page_failed");
    expect(read).toHaveBeenCalledTimes(1);
    read.mockClear();
    await expect(
      readCanaryRoutes([workspace, desk], false, new AbortController().signal, read),
    ).rejects.toThrow("canary_route_dependency_invalid");
    expect(read).not.toHaveBeenCalled();
  });
});
