import { describe, expect, it } from "vitest";

import { buildVersionPayload, GET } from "@/app/api/version/route";

describe("bodyless version endpoint", () => {
  it("returns only validated deploy identity fields", async () => {
    const payload = buildVersionPayload({
      APP_COMMIT_SHA: "a".repeat(40),
      K_REVISION: "pmi-kc-app-r123",
      K_SERVICE: "pmi-kc-app",
      ENVIRONMENT_KIND: "production",
      RENTVINE_API_SECRET: "must-not-appear",
    });
    expect(payload).toEqual({
      commit: "a".repeat(40),
      revision: "pmi-kc-app-r123",
      service: "pmi-kc-app",
      environment: "production",
    });
    expect(JSON.stringify(payload)).not.toContain("must-not-appear");
  });

  it("fails closed to unknown and disables caching", async () => {
    expect(
      buildVersionPayload({
        APP_COMMIT_SHA: "latest",
        K_REVISION: "bad/revision",
        K_SERVICE: "",
        ENVIRONMENT_KIND: "staging",
      }),
    ).toEqual({
      commit: "unknown",
      revision: "unknown",
      service: "unknown",
      environment: "unknown",
    });
    const response = await GET();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
