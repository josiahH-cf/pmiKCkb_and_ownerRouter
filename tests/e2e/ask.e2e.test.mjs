import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

describe("ask flow (demo mode)", () => {
  let client;

  beforeAll(async () => {
    client = createClient();
    await client.signInDemo();
  });

  it("answers a supported question with a cited Verified Source", async () => {
    const response = await client.postJson("/api/ask", {
      question: "What is the lease renewal process?",
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.source_state).toBe("Verified Source");
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.citations[0]).toMatchObject({
      source_id: "demo-lease-renewals-sop",
      title: "Lease Renewals Demo SOP",
    });
    expect(body.citations[0].url).toMatch(/^https:\/\//);
    expect(body.answer.length).toBeGreaterThan(0);
  });

  it("returns No Reliable Source Found for unsupported questions", async () => {
    const response = await client.postJson("/api/ask", {
      question: "Tell me something generic about leases",
    });

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.source_state).toBe("No Reliable Source Found");
    expect(body.citations).toEqual([]);
  });

  it("rejects invalid Ask payloads with field issues", async () => {
    const response = await client.postJson("/api/ask", { question: "hi" });

    expect(response.status).toBe(400);
    const body = await response.json();

    expect(body.error).toBe("Invalid Ask request.");
    expect(body.issues.question).toBeDefined();
  });

  it("serves the Ask page shell to signed-in users", async () => {
    const { response, html } = await client.getHtml("/ask");

    expect(response.status).toBe(200);
    expect(html).toContain("Ask");
  });
});
