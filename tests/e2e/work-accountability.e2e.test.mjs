import { describe, expect, it } from "vitest";

import { createClient } from "./helpers/client.mjs";

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "S68 explicit work-accountability flow",
  () => {
    it("creates, starts, switches, pauses, and exposes the same team truth", async () => {
      const staff = createClient();
      await staff.signInDemo("Editor");

      const firstResponse = await staff.postJson("/api/work", {
        action: "create_task",
        space_id: "lease-renewals",
        source: { type: "manual" },
        task_type: "e2e-review",
        title: "Review the bounded renewal record",
        next_action: "Open the owning renewal workspace",
        idempotency_key: "s68-e2e-create-first",
      });
      expect(firstResponse.status).toBe(200);
      const first = (await firstResponse.json()).task;
      expect(first).toMatchObject({
        state: "Not started",
        assignee_uid: "local-demo-editor",
        source: { type: "manual", status: "verified" },
      });

      const firstStartResponse = await staff.postJson("/api/work", {
        action: "start_session",
        task_id: first.id,
        expected_task_version: 1,
        idempotency_key: "s68-e2e-start-first",
      });
      expect(firstStartResponse.status).toBe(200);
      const firstSession = (await firstStartResponse.json()).session;
      expect(firstSession).toMatchObject({
        task_id: first.id,
        staff_uid: "local-demo-editor",
        state: "Active",
      });

      const replayResponse = await staff.postJson("/api/work", {
        action: "start_session",
        task_id: first.id,
        expected_task_version: 1,
        idempotency_key: "s68-e2e-start-first-replay",
      });
      expect(replayResponse.status).toBe(200);
      await expect(replayResponse.json()).resolves.toMatchObject({
        session: { id: firstSession.id, state: "Active" },
      });

      const secondResponse = await staff.postJson("/api/work", {
        action: "create_task",
        space_id: "lease-renewals",
        source: { type: "manual" },
        task_type: "e2e-follow-up",
        title: "Prepare the bounded follow-up",
        next_action: "Review the factual source status",
        idempotency_key: "s68-e2e-create-second",
      });
      expect(secondResponse.status).toBe(200);
      const second = (await secondResponse.json()).task;

      const switchResponse = await staff.postJson("/api/work", {
        action: "start_session",
        task_id: second.id,
        expected_task_version: 1,
        idempotency_key: "s68-e2e-start-second",
      });
      expect(switchResponse.status).toBe(200);
      const secondSession = (await switchResponse.json()).session;

      const mineResponse = await staff.get("/api/work?view=mine");
      expect(mineResponse.status).toBe(200);
      const mine = (await mineResponse.json()).snapshot;
      expect(mine.current_session).toMatchObject({
        id: secondSession.id,
        task_id: second.id,
        state: "Active",
      });
      expect(
        mine.sessions.find((session) => session.id === firstSession.id),
      ).toMatchObject({ state: "Ended", end_reason: "task_switch" });
      expect(mine.sessions.filter((session) => session.state === "Active")).toHaveLength(
        1,
      );

      const pauseResponse = await staff.postJson("/api/work", {
        action: "transition_task",
        task_id: second.id,
        expected_version: 2,
        next_state: "Paused",
        idempotency_key: "s68-e2e-pause-second",
      });
      expect(pauseResponse.status).toBe(200);
      await expect(pauseResponse.json()).resolves.toMatchObject({
        task: { id: second.id, state: "Paused" },
      });

      const manager = createClient();
      await manager.signInDemo("Admin");
      const teamResponse = await manager.get("/api/work?view=team");
      expect(teamResponse.status).toBe(200);
      const team = await teamResponse.json();
      expect(team.snapshot.tasks.map((task) => task.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      expect(team.roster).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            uid: "local-demo-editor",
            email: "local-demo-editor@pmikcmetro.com",
          }),
        ]),
      );
    });
  },
);
