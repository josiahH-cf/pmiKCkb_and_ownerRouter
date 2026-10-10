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

  it("renders the approved artifact registry and canonical communication handoff for a demo Admin", async () => {
    const client = createClient();
    await client.signInDemo();

    const { response, html } = await client.getHtml("/admin/gmail-inbox-zero");

    expect(response.status).toBe(200);
    expect(html).toContain("Workflow Communications Governance");
    expect(html).toContain("Gmail Connection");
    expect(html).toContain("Verify my Gmail connection");
    expect(html).toContain('href="/gmail-hub"');
    expect(html).not.toContain("Activated");
    expect(html).toContain("Gemini Status");
    // S193 retires the pasted/synthetic tools; immutable artifact history remains inspectable.
    expect(html).toContain("Open Workflow Communications");
    expect(html).toContain("chooses Send or Schedule in Communications");
    expect(html).toContain("Old drafts retain their original");
    expect(html).toContain("Approved v1.0 communication artifacts");
    expect(html).toContain("Immutable base copy only");
    expect(html).toContain("authoritative");
    expect(html).toContain("exact human confirmation");
    expect(html).toContain("owner-renewal:v1.0");
    expect(html).toContain("tenant-renewal:v2.0");
    expect(html).not.toContain("Label rules");
    expect(html).not.toContain("Reply patterns");
    expect(html).not.toContain("Synthetic rule/template evaluator");
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
