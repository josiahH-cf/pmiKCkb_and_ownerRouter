import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

// These tests lock in graceful degradation when Firestore is unreachable, so they
// only run when the harness was started WITHOUT the emulator.
describe.skipIf(process.env.FIRESTORE_EMULATOR_HOST)(
  "graceful degradation without Firestore",
  () => {
    let client;

    beforeAll(async () => {
      client = createClient();
      await client.signInDemo();
    });

    it("renders the Approval Queue unavailable marker instead of crashing", async () => {
      const { response, html } = await client.getHtml("/approval-queue");

      expect(response.status).toBe(200);
      expect(html).toContain("Approval Queue is unavailable");
    });

    it("renders the process-definitions unavailable marker instead of crashing", async () => {
      const { response, html } = await client.getHtml("/processes");

      expect(response.status).toBe(200);
      expect(html).toContain("Workflow definitions are unavailable");
    });
  },
);
