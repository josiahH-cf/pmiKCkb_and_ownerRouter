import { beforeAll, describe, expect, it } from "vitest";
import { launchSpaces } from "../../lib/spaces.ts";
import { createClient } from "./helpers/client.mjs";

describe("spaces (launch content)", () => {
  let client;

  beforeAll(async () => {
    client = createClient();
    await client.signInDemo();
  });

  it("lists every launch space", async () => {
    const { response, html } = await client.getHtml("/spaces");

    expect(response.status).toBe(200);

    for (const space of launchSpaces) {
      expect(html, `missing space ${space.id}`).toContain(space.name);
    }
  });

  it("serves a KB-owned space detail page", async () => {
    const { response, html } = await client.getHtml("/spaces/lease-renewals");

    expect(response.status).toBe(200);
    expect(html).toContain("Lease Renewals");
    expect(html).toContain("KB-owned process");
  });

  it("marks the Owner Email space as read-only", async () => {
    const { response, html } = await client.getHtml("/spaces/owner-email");

    expect(response.status).toBe(200);
    expect(html).toContain("Read-only");
  });

  it("returns 404 for unknown spaces", async () => {
    const response = await client.get("/spaces/does-not-exist");

    expect(response.status).toBe(404);
  });
});
