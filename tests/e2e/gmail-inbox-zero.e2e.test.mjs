import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";

describe("workflow communication governance page", () => {
  it("redirects signed-out visitors to /sign-in", async () => {
    const client = createClient();
    const response = await client.get("/admin/gmail-inbox-zero");

    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in");
  });

  it("blocks demo Editors with a forbidden redirect", async () => {
    const client = createClient();
    await client.signInDemo("Editor");

    const response = await client.get("/admin/gmail-inbox-zero");
    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/sign-in?error=forbidden");
  });

  it("renders the synthetic governance workspace for a demo Admin", async () => {
    const client = createClient();
    await client.signInDemo();

    const { response, html } = await client.getHtml("/admin/gmail-inbox-zero");

    expect(response.status).toBe(200);
    expect(html).toContain("Workflow Communications Governance");
    expect(html).toContain("Gmail Connection");
    expect(html).toContain("Activated");
    expect(html).toContain("Gemini Status");
    // The static read-only v1 panels are retired; the live workspace renders the governed sets.
    expect(html).toContain("Label rules");
    expect(html).toContain("Reply patterns");
    expect(html).toContain("Synthetic rule/template evaluator");
    expect(html).toContain("Immutable base copy only");
    expect(html).toContain("cannot make an action executable");
    expect(html).not.toContain("Read-only v1");
  });

  it("links to the management page from /admin", async () => {
    const client = createClient();
    await client.signInDemo();

    const { response, html } = await client.getHtml("/admin");
    expect(response.status).toBe(200);
    expect(html).toContain("Open communication governance");
  });
});
