import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "capture-to-placeholder flow",
  () => {
    let client;

    beforeAll(async () => {
      client = createClient();
      await client.signInDemo();
    });

    it("captures an unanswered Ask question as an open placeholder", async () => {
      const question = "What is the after-hours emergency vendor escalation fee?";
      const response = await client.postJson("/api/ask/capture", {
        question,
        source_state: "No Reliable Source Found",
        space_id: "lease-renewals",
        priority: "P1",
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body.placeholder).toMatchObject({
        missing_detail: question,
        priority: "P1",
        space_id: "lease-renewals",
        status: "Open",
        owner_uid: "local-demo-admin",
      });
      expect(body.placeholder.id).toBeTruthy();

      const list = await client.get("/api/spaces/lease-renewals/placeholders");
      expect(list.status).toBe(200);
      const listed = await list.json();
      const ids = listed.placeholders.map((placeholder) => placeholder.id);

      expect(ids).toContain(body.placeholder.id);
    });

    it("rejects captures into an unknown space", async () => {
      const response = await client.postJson("/api/ask/capture", {
        question: "Where does this capture go?",
        source_state: "No Reliable Source Found",
        space_id: "not-a-space",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  },
);
