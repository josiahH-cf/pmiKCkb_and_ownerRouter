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

  it("serves a process-space detail page with the plain-language label", async () => {
    const { response, html } = await client.getHtml("/spaces/lease-renewals");

    expect(response.status).toBe(200);
    expect(html).toContain("Lease Renewals");
    // A-IA-V2 lexicon: "KB-owned process" → "Process space".
    expect(html).toContain("Process space");
    // Spaces ⊇ Processes: a Space that carries a process shows the Process sub-tab.
    expect(html).toContain("Process");
  });

  it("surfaces the process beside a Space via the Process sub-tab", async () => {
    const { response, html } = await client.getHtml(
      "/spaces/lease-renewals?tab=process",
    );

    expect(response.status).toBe(200);
    // The read-only summary deep-links to the full process engine (route preserved).
    expect(html).toContain("View full process");
    expect(html).toContain("/processes/lease-renewal");
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
