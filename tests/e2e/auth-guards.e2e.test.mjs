import { describe, expect, it } from "vitest";
import { createClient, locationPath } from "./helpers/client.mjs";

const GUARDED_PAGES = ["/ask", "/approval-queue", "/processes", "/spaces", "/admin"];

describe("auth guards", () => {
  it("redirects signed-out visitors from guarded pages to /sign-in", async () => {
    const client = createClient();

    for (const path of GUARDED_PAGES) {
      const response = await client.get(path);

      expect(response.status, `${path} should redirect`).toBe(307);
      expect(locationPath(response), `${path} redirect target`).toBe("/sign-in");
    }
  });

  it("returns 401 JSON for signed-out API calls", async () => {
    const client = createClient();
    const response = await client.postJson("/api/ask", { question: "lease renewal" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication is required.",
    });
  });

  it("signs in a demo Admin and reaches guarded pages", async () => {
    const client = createClient();

    await expect(client.signInDemo()).resolves.toMatchObject({
      user: { role: "Admin", uid: "local-demo-admin" },
    });

    const ask = await client.getHtml("/ask");
    expect(ask.response.status).toBe(200);
    expect(ask.html).toContain("Console");

    const admin = await client.getHtml("/admin");
    expect(admin.response.status).toBe(200);
  });

  it("blocks demo Editors from /admin with a forbidden redirect", async () => {
    const client = createClient();

    await expect(client.signInDemo("Editor")).resolves.toMatchObject({
      user: { role: "Editor", uid: "local-demo-editor" },
    });

    const ask = await client.get("/ask");
    expect(ask.status).toBe(200);

    const admin = await client.get("/admin");
    expect(admin.status).toBe(307);
    expect(locationPath(admin)).toBe("/sign-in?error=forbidden");
  });

  it("blocks demo Editors from manageAdmin-gated APIs with 403", async () => {
    const client = createClient();
    await client.signInDemo("Editor");

    const response = await client.get("/api/approval-queue/health");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "This user is not authorized for the requested action.",
    });
  });

  it("redirects signed-in users away from /sign-in", async () => {
    const client = createClient();
    await client.signInDemo();

    const response = await client.get("/sign-in");

    expect(response.status).toBe(307);
    expect(locationPath(response)).toBe("/");
  });
});
