import { describe, expect, it } from "vitest";

import {
  assertTestDataModeWriteAllowed,
  assertTestLaneSurfaceAllowed,
} from "@/lib/environment/test-lane";

describe("S56 Test-lane environment fence", () => {
  it("allows the compatibility lane used only by automated tests", () => {
    expect(() =>
      assertTestLaneSurfaceAllowed({
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "demo",
      }),
    ).not.toThrow();
  });

  it.each([
    { ENVIRONMENT_KIND: "production", DATA_CONTEXT: "live" },
    { ENVIRONMENT_KIND: "demo", DATA_CONTEXT: "live_readonly" },
  ])("refuses Test product state in $ENVIRONMENT_KIND+$DATA_CONTEXT", (env) => {
    expect(() => assertTestLaneSurfaceAllowed(env)).toThrow(/Test lane is retired/);
    expect(() => assertTestDataModeWriteAllowed("test", env)).toThrow(
      /Test lane is retired/,
    );
  });

  it("does not impede a Live record write", () => {
    expect(() =>
      assertTestDataModeWriteAllowed("live", {
        ENVIRONMENT_KIND: "production",
        DATA_CONTEXT: "live",
      }),
    ).not.toThrow();
  });

  it("fails closed when the environment descriptor is incomplete", () => {
    expect(() => assertTestLaneSurfaceAllowed({ ENVIRONMENT_KIND: "demo" })).toThrow(
      /Environment descriptor is invalid/,
    );
  });
});
