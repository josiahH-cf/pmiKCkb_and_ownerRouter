import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

const DEFINITION_PAYLOAD = {
  name: "Synthetic E2E Internal Training Process",
  space_id: "fathom-training",
  short_outcome: "Record the synthetic internal training checklist.",
  trigger: "A synthetic training exercise starts.",
  owner_uid: "local-demo-admin",
  default_approver_uid: "local-demo-admin",
  source_links: [
    {
      label: "Synthetic training source",
      url: "https://fixture.invalid/training-source",
    },
  ],
  steps: [
    { title: "Read the synthetic training source." },
    { title: "Record internal training notes." },
  ],
  success_condition: "The synthetic internal training is recorded.",
};

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "current process definition admission and retired routes",
  () => {
    let admin;
    let editor;
    let definitionId;
    let created;

    beforeAll(async () => {
      admin = createClient();
      await admin.signInDemo();
      editor = createClient();
      await editor.signInDemo("Editor");
      const response = await admin.postJson(
        "/api/process-definitions",
        DEFINITION_PAYLOAD,
      );

      expect(response.status).toBe(201);
      created = (await response.json()).definition;
      expect(created.id).toBeTruthy();
      definitionId = created.id;
    });

    it("creates a Draft in an explicit writable Space", async () => {
      expect(created.status).toBe("Draft");
      expect(created.space_id).toBe(DEFINITION_PAYLOAD.space_id);
      expect(created.name).toBe(DEFINITION_PAYLOAD.name);
    });

    it("lists the new definition and serves its detail page", async () => {
      const list = await (await admin.get("/api/process-definitions")).json();
      expect(list.definitions.map((definition) => definition.id)).toContain(definitionId);

      const detail = await admin.getHtml(`/processes/${definitionId}`);
      expect(detail.response.status).toBe(200);
      expect(detail.html).toContain(DEFINITION_PAYLOAD.name);
    });

    it("refuses retired queue submission without changing the Draft or queuing publication", async () => {
      const response = await admin.postJson(
        `/api/process-definitions/${definitionId}/submit`,
        {},
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error).toMatch(/retired.*publish/i);
      const detail = await (
        await admin.get(`/api/process-definitions/${definitionId}`)
      ).json();
      expect(detail.definition.status).toBe("Draft");
      expect(detail.definition.pending_queue_item_id ?? null).toBeNull();

      const queue = await (
        await admin.get(
          `/api/approval-queue?process_run_id=${encodeURIComponent(
            `process-definition:${definitionId}`,
          )}`,
        )
      ).json();

      expect(queue.items).toHaveLength(0);
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

    it("keeps the removed simulation endpoint absent without creating a workflow run", async () => {
      const before = await (await admin.get("/api/workflow-runs")).json();
      const started = await admin.postJson(
        `/api/process-definitions/${definitionId}/test-runs`,
        {},
      );

      expect(started.status).toBe(404);
      const after = await (await admin.get("/api/workflow-runs")).json();
      expect(after.runs.map((run) => run.id).sort()).toEqual(
        before.runs.map((run) => run.id).sort(),
      );
    });

    it("rejects obsolete complete_test before looking up or changing any workflow run", async () => {
      const response = await admin.sendJson(
        "PATCH",
        "/api/workflow-runs/synthetic-nonexistent-run",
        {
          action: "complete_test",
          notes: "Synthetic obsolete command must not complete work.",
        },
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/action|invalid/i);
    });
  },
);
