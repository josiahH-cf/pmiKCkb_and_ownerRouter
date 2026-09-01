import { describe, expect, it } from "vitest";

import {
  buildAccessHomeHref,
  buildAccessRequestHref,
  validateAccessReturnTarget,
} from "@/lib/access/handoff";

describe("S83 access request handoff registry", () => {
  it("builds only the exact v1 preselection keys", () => {
    expect(
      buildAccessRequestHref({
        capability: "approve",
        space: "renewals",
        returnTo: "/lease-renewal/live/desk",
      }),
    ).toBe(
      "/admin/access?v=1&capability=approve&space=renewals&return_to=%2Flease-renewal%2Flive%2Fdesk",
    );
    expect(buildAccessHomeHref()).toBe("/admin/access");
  });

  it("accepts only registered first-party return destinations", () => {
    expect(validateAccessReturnTarget("/lease-renewal/live/desk")).toBe(
      "/lease-renewal/live/desk",
    );
    expect(validateAccessReturnTarget("/maintenance")).toBe("/maintenance");
    expect(() => validateAccessReturnTarget("https://example.test/admin")).toThrow(
      "not an allowed access return destination",
    );
    expect(() => validateAccessReturnTarget("//example.test/admin")).toThrow(
      "not an allowed access return destination",
    );
    expect(() => validateAccessReturnTarget("/admin/access?role=Admin")).toThrow(
      "not an allowed access return destination",
    );
  });
});
