import { describe, expect, it } from "vitest";

import {
  allowsDemoProductSurface,
  allowsLiveProviderAction,
  allowsMutation,
  assertDemoProductSurfaceAllowed,
  assertLiveProviderActionAllowed,
  assertMutationAllowed,
  dataContextLabel,
  environmentLabel,
  isDemoEnvironment,
  isLiveReadOnlyContext,
  isProductionEnvironment,
  parseEnvironmentDescriptor,
  requireEnvironmentDescriptor,
  resolveEnvironmentDescriptor,
  type EnvironmentDescriptor,
} from "@/lib/environment/descriptor";

const DEMO: EnvironmentDescriptor = {
  environmentKind: "demo",
  dataContext: "demo",
  source: "explicit",
};
const LIVE_READONLY: EnvironmentDescriptor = {
  environmentKind: "demo",
  dataContext: "live_readonly",
  source: "explicit",
};
const PRODUCTION: EnvironmentDescriptor = {
  environmentKind: "production",
  dataContext: "live",
  source: "explicit",
};

describe("environment descriptor — valid combinations (AC-S40-1)", () => {
  it("accepts exactly the three supported combinations", () => {
    expect(
      parseEnvironmentDescriptor({ ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "demo" }),
    ).toEqual({ ok: true, descriptor: DEMO });
    expect(
      parseEnvironmentDescriptor({
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "live_readonly",
      }),
    ).toEqual({ ok: true, descriptor: LIVE_READONLY });
    expect(
      parseEnvironmentDescriptor({
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
      }),
    ).toEqual({ ok: true, descriptor: PRODUCTION });
  });

  it("normalizes surrounding whitespace and case rather than silently refusing", () => {
    expect(
      parseEnvironmentDescriptor({
        ENVIRONMENT_KIND: "  Production ",
        DATA_CONTEXT: "LIVE",
      }),
    ).toEqual({ ok: true, descriptor: PRODUCTION });
  });
});

describe("environment descriptor — fail closed (AC-S40-1)", () => {
  it("refuses Production paired with a Demo or Live-read-only context", () => {
    for (const context of ["demo", "live_readonly"]) {
      const result = parseEnvironmentDescriptor({
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: context,
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");
      expect(result.issues.join(" ")).toContain("not a supported combination");
      expect(result.issues.join(" ")).toContain(context);
    }
  });

  it("refuses Demo paired with Live data", () => {
    const result = parseEnvironmentDescriptor({
      ENVIRONMENT_KIND: "demo",
      DATA_CONTEXT: "live",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues.join(" ")).toContain("not a supported combination");
  });

  it("refuses an unknown value and names the variable and the allowed set", () => {
    const result = parseEnvironmentDescriptor({
      ENVIRONMENT_KIND: "staging",
      DATA_CONTEXT: "test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toContain("ENVIRONMENT_KIND");
    expect(result.issues[0]).toContain("staging");
    expect(result.issues[1]).toContain("DATA_CONTEXT");
    expect(result.issues[1]).toContain("test");
  });

  it("refuses missing values in the strict parse and reports every issue at once", () => {
    const result = parseEnvironmentDescriptor({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues).toHaveLength(2);
    expect(result.issues.join(" ")).toContain("ENVIRONMENT_KIND is not set");
    expect(result.issues.join(" ")).toContain("DATA_CONTEXT is not set");
  });

  it("refuses a partially configured deployment rather than guessing the other half", () => {
    expect(parseEnvironmentDescriptor({ ENVIRONMENT_KIND: "production" }).ok).toBe(false);
    expect(resolveEnvironmentDescriptor({ ENVIRONMENT_KIND: "production" }).ok).toBe(
      false,
    );
    expect(resolveEnvironmentDescriptor({ DATA_CONTEXT: "live" }).ok).toBe(false);
  });

  it("refuses an empty or whitespace-only value instead of treating it as unset", () => {
    const result = parseEnvironmentDescriptor({
      ENVIRONMENT_KIND: "   ",
      DATA_CONTEXT: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues.join(" ")).toContain("is not set");
  });

  it("throws with the issues when a caller requires a descriptor it cannot get", () => {
    expect(() =>
      requireEnvironmentDescriptor({ ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "live" }),
    ).toThrow(/not a supported combination/);
  });
});

describe("environment descriptor — no browser-controlled input (AC-S40-1)", () => {
  it("ignores browser-shaped decoys and honours only the server variables", () => {
    const decoys = {
      CONSOLE_DATA_MODE: "live",
      NEXT_PUBLIC_CONSOLE_DATA_MODE: "live",
      NEXT_PUBLIC_ENVIRONMENT_KIND: "production",
      NEXT_PUBLIC_DATA_CONTEXT: "live",
      cookie: "ENVIRONMENT_KIND=production",
      "x-environment-kind": "production",
      "x-data-context": "live",
      localStorage: "production",
      searchParams: "environmentKind=production&dataContext=live",
      recordName: "TEST — 204 Maple Court Unit 2",
      ASK_DEMO_MODE: "false",
      CONSOLE_TEST_DEPLOYMENT_NAME: "test-staging-1",
      ENVIRONMENT_KIND: "demo",
      DATA_CONTEXT: "demo",
    };
    expect(parseEnvironmentDescriptor(decoys)).toEqual({ ok: true, descriptor: DEMO });
    expect(resolveEnvironmentDescriptor(decoys)).toEqual({ ok: true, descriptor: DEMO });
  });

  it("does not let a decoy stand in for the real variables", () => {
    const result = parseEnvironmentDescriptor({
      NEXT_PUBLIC_ENVIRONMENT_KIND: "production",
      NEXT_PUBLIC_DATA_CONTEXT: "live",
    });
    expect(result.ok).toBe(false);
  });

  it("cannot be pushed to Production by NODE_ENV once the variables are explicit", () => {
    expect(
      resolveEnvironmentDescriptor({
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "demo",
        NODE_ENV: "production",
      }),
    ).toEqual({ ok: true, descriptor: DEMO });
  });
});

describe("environment descriptor — stage-one legacy bridge", () => {
  it("maps a fully unset environment from NODE_ENV and marks the source", () => {
    expect(resolveEnvironmentDescriptor({ NODE_ENV: "production" })).toEqual({
      ok: true,
      descriptor: {
        environmentKind: "production",
        dataContext: "live",
        source: "legacy-node-env",
      },
    });
  });

  it("defaults every non-production NODE_ENV to Demo, the context with no Live authority", () => {
    for (const nodeEnv of ["development", "test", "staging", "", undefined]) {
      const result = resolveEnvironmentDescriptor({ NODE_ENV: nodeEnv });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("unreachable");
      expect(result.descriptor.environmentKind).toBe("demo");
      expect(result.descriptor.dataContext).toBe("demo");
      expect(result.descriptor.source).toBe("legacy-node-env");
      expect(allowsLiveProviderAction(result.descriptor)).toBe(false);
    }
  });
});

describe("environment descriptor — authority helpers (AC-S40-3, AC-S40-4)", () => {
  it("classifies each descriptor", () => {
    expect(isProductionEnvironment(PRODUCTION)).toBe(true);
    expect(isProductionEnvironment(DEMO)).toBe(false);
    expect(isDemoEnvironment(LIVE_READONLY)).toBe(true);
    expect(isLiveReadOnlyContext(LIVE_READONLY)).toBe(true);
    expect(isLiveReadOnlyContext(DEMO)).toBe(false);
    expect(isLiveReadOnlyContext(PRODUCTION)).toBe(false);
  });

  it("allows a Live provider action only from Production with Live data", () => {
    expect(allowsLiveProviderAction(PRODUCTION)).toBe(true);
    expect(allowsLiveProviderAction(DEMO)).toBe(false);
    expect(allowsLiveProviderAction(LIVE_READONLY)).toBe(false);
    expect(() => assertLiveProviderActionAllowed(PRODUCTION)).not.toThrow();
    expect(() => assertLiveProviderActionAllowed(DEMO)).toThrow(
      /requires the Production environment/,
    );
    expect(() => assertLiveProviderActionAllowed(LIVE_READONLY)).toThrow(
      /requires the Production environment/,
    );
  });

  it("refuses every mutation from Live read-only while allowing Demo and Production", () => {
    expect(allowsMutation(LIVE_READONLY)).toBe(false);
    expect(allowsMutation(DEMO)).toBe(true);
    expect(allowsMutation(PRODUCTION)).toBe(true);
    expect(() => assertMutationAllowed(LIVE_READONLY)).toThrow(/inspection context/);
    expect(() => assertMutationAllowed(DEMO)).not.toThrow();
    expect(() => assertMutationAllowed(PRODUCTION)).not.toThrow();
  });

  it("keeps Demo product surfaces out of Production", () => {
    expect(allowsDemoProductSurface(DEMO)).toBe(true);
    expect(allowsDemoProductSurface(LIVE_READONLY)).toBe(true);
    expect(allowsDemoProductSurface(PRODUCTION)).toBe(false);
    expect(() => assertDemoProductSurfaceAllowed(PRODUCTION)).toThrow(
      /only in the Demo environment/,
    );
  });

  it("carries the refusing descriptor on the error for diagnostics", () => {
    try {
      assertLiveProviderActionAllowed(LIVE_READONLY);
      throw new Error("unreachable");
    } catch (error) {
      expect((error as { descriptor?: EnvironmentDescriptor }).descriptor).toEqual(
        LIVE_READONLY,
      );
    }
  });
});

describe("environment descriptor — operator copy (AC-S40-7, D-14)", () => {
  it("uses Demo/Production and Demo data/Live read-only/Live data", () => {
    expect(environmentLabel(PRODUCTION)).toBe("Production");
    expect(environmentLabel(DEMO)).toBe("Demo environment");
    expect(dataContextLabel(DEMO)).toBe("Demo data");
    expect(dataContextLabel(LIVE_READONLY)).toBe("Live read-only");
    expect(dataContextLabel(PRODUCTION)).toBe("Live data");
  });

  it("never emits retired Test or Sample operator copy", () => {
    const copy = [DEMO, LIVE_READONLY, PRODUCTION]
      .flatMap((descriptor) => [
        environmentLabel(descriptor),
        dataContextLabel(descriptor),
      ])
      .join(" ");
    expect(copy).not.toMatch(/\btest\b/i);
    expect(copy).not.toMatch(/\bsample\b/i);
  });
});
