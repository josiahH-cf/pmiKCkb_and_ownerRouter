import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

describe("retired Production Test acceptance route", () => {
  let client;

  beforeAll(async () => {
    client = createClient();
    await client.signInDemo();
  });

  it("has no readable route and refuses any attempted legacy execution", async () => {
    const read = await client.get("/api/admin/v1/fake-acceptance");
    expect(read.status).toBe(404);

    const execute = await client.request("/api/admin/v1/fake-acceptance", {
      method: "POST",
    });
    expect(execute.status).toBe(409);
    await expect(execute.json()).resolves.toMatchObject({
      error: expect.stringMatching(/read only/i),
      error_type: "LiveReadOnlyMutationRefused",
    });
  });
});
