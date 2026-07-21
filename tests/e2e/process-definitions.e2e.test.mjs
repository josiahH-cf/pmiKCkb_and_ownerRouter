import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

const DEFINITION_PAYLOAD = {
  name: "E2E Lease Renewal Confirmation",
  short_outcome: "Confirm renewal terms with the owner before tenant outreach.",
  trigger: "A lease enters the 90-day renewal window.",
  owner_uid: "local-demo-admin",
  default_approver_uid: "local-demo-admin",
  source_links: [
    {
      label: "Lease Renewals Demo SOP",
      url: "https://example.com/demo/lease-renewals-sop",
    },
  ],
  steps: [
    { title: "Check the renewal tracker for the current lease." },
    { title: "Confirm owner direction before tenant-facing commitments." },
  ],
  success_condition: "Owner confirms direction and the tracker is updated.",
};

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "process definition lifecycle",
  () => {
    let admin;
    let editor;
    let definitionId;

    beforeAll(async () => {
      admin = createClient();
      await admin.signInDemo();
      editor = createClient();
      await editor.signInDemo("Editor");
    });

    it("creates a Draft definition", async () => {
      const response = await admin.postJson(
        "/api/process-definitions",
        DEFINITION_PAYLOAD,
      );

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body.definition.status).toBe("Draft");
      expect(body.definition.name).toBe(DEFINITION_PAYLOAD.name);
      definitionId = body.definition.id;
    });

    it("lists the new definition and serves its detail page", async () => {
      const list = await (await admin.get("/api/process-definitions")).json();
      expect(list.definitions.map((definition) => definition.id)).toContain(definitionId);

      const detail = await admin.getHtml(`/processes/${definitionId}`);
      expect(detail.response.status).toBe(200);
      expect(detail.html).toContain(DEFINITION_PAYLOAD.name);
    });

    it("submits the definition for approval and queues a review item", async () => {
      const response = await admin.postJson(
        `/api/process-definitions/${definitionId}/submit`,
        {},
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      expect(body.definition.status).toBe("Pending Approval");
      expect(body.definition.pending_queue_item_id).toBeTruthy();

      const queue = await (
        await admin.get(
          `/api/approval-queue?process_run_id=${encodeURIComponent(
            `process-definition:${definitionId}`,
          )}`,
        )
      ).json();

      expect(queue.items.length).toBe(1);
      expect(queue.items[0].item_type).toBe("ProcessDefinitionChange");
    });

    it("blocks Editors from activating a definition", async () => {
      const response = await editor.postJson(
        `/api/process-definitions/${definitionId}/activate`,
        {},
      );

      expect(response.status).toBe(403);
    });

    it("retires the direct activate route (F-SPACE-2: publish is the canonical path)", async () => {
      const response = await admin.postJson(
        `/api/process-definitions/${definitionId}/activate`,
        {},
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toMatch(/publish/i);
    });

    it("records a completed simulation test run", async () => {
      const started = await admin.postJson(
        `/api/process-definitions/${definitionId}/test-runs`,
        {},
      );

      expect(started.status).toBe(201);
      const { run } = await started.json();
      expect(run.status).toBe("In Progress");

      const completed = await admin.sendJson("PATCH", `/api/workflow-runs/${run.id}`, {
        action: "complete_test",
        notes: "Simulated owner confirmation path end to end.",
      });

      expect(completed.status).toBe(200);

      const runPage = await admin.getHtml(`/workflow-runs/${run.id}`);
      expect(runPage.response.status).toBe(200);
    });

    it("keeps the activate route retired even after the queue item is approved (F-SPACE-2)", async () => {
      const detail = await (
        await admin.get(`/api/process-definitions/${definitionId}`)
      ).json();
      const queueItemId = detail.definition.pending_queue_item_id;

      const approve = await admin.sendJson(
        "PATCH",
        `/api/approval-queue/${queueItemId}`,
        {
          action: "approve",
          confirm_high_risk: true,
          reason: "QA e2e: approve the pending process-definition queue item.",
        },
      );
      expect(approve.status).toBe(200);

      // Even with the queue item approved, activation is retired: publish is the one path to Active.
      const response = await admin.postJson(
        `/api/process-definitions/${definitionId}/activate`,
        {},
      );

      expect(response.status).toBe(409);
    });
  },
);
