import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "./helpers/client.mjs";

// S151 integrated path through the real Next server, routes, store and data services (fetch-level,
// deterministic interpreter, safe demo accounts). With the Firestore emulator the signed-in user's
// own history and saved questions persist across sessions; without it the Live-read-only rehearsal
// refuses every history write and the Dashboard says history is not saved here. Record identities
// are compared with the data layer's own answer for the same question, never with wording.

const WORK = "What work is assigned to me today?";

const ids = (answer) =>
  answer.groups.flatMap((group) =>
    group.items.map((item) => `${item.ref.source}:${item.ref.id}`),
  );

/** Ask, then record the turn exactly as the browser does (begin, then finish with what was shown). */
async function askAndRecord(
  client,
  question,
  { conversationKey, conversation = null } = {},
) {
  const operationId = randomUUID();
  const key = conversationKey ?? operationId;
  const begin = await client.postJson("/api/assistant/history/turns", {
    operationId,
    conversationKey: key,
    question,
  });
  expect(begin.status).toBe(200);
  const response = await client.postJson("/api/assistant/query", {
    question,
    conversation,
    operationId,
  });
  expect(response.status).toBe(200);
  const answer = await response.json();
  const finish = await client.putJson(`/api/assistant/history/turns/${operationId}`, {
    conversationKey: key,
    question,
    state: "completed",
    assistant: answer,
    knowledge: null,
  });
  expect(finish.status).toBe(200);
  const saved = await finish.json();
  return {
    operationId,
    conversationKey: key,
    conversationId: saved.conversationId,
    answer,
  };
}

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)(
  "S148-S150 history, saved questions and structured rerun (emulator)",
  () => {
    let admin;
    let editor;

    beforeAll(async () => {
      admin = createClient();
      await admin.signInDemo("Admin");
      editor = createClient();
      await editor.signInDemo("Editor");
    });

    it("keeps a question, its answer and its as-of across a new session, never for another account", async () => {
      const first = await askAndRecord(admin, WORK);
      expect(first.answer.execution?.plan.subjects).toEqual(["work"]);

      // A duplicate delivery of the same submission replays the recorded answer.
      const duplicate = await admin.postJson("/api/assistant/query", {
        question: WORK,
        conversation: null,
        operationId: first.operationId,
      });
      const replayed = await duplicate.json();
      expect(replayed.replayed).toBe(true);
      expect(ids(replayed)).toEqual(ids(first.answer));

      const later = createClient();
      await later.signInDemo("Admin");
      const list = await (await later.get("/api/assistant/history")).json();
      expect(list.persisted).toBe(true);
      expect(list.conversations.map((entry) => entry.conversationId)).toContain(
        first.conversationId,
      );
      const opened = await (
        await later.get(`/api/assistant/history/${first.conversationId}`)
      ).json();
      expect(opened.turns).toHaveLength(1);
      expect(opened.turns[0]).toMatchObject({
        operationId: first.operationId,
        displayState: "completed",
        accessChanged: false,
      });
      expect(ids(opened.turns[0].assistant)).toEqual(ids(first.answer));
      expect(opened.turns[0].assistant.groups.map((group) => group.asOf ?? null)).toEqual(
        first.answer.groups.map((group) => group.asOf ?? null),
      );

      const other = await (await editor.get("/api/assistant/history")).json();
      expect(other.conversations.map((entry) => entry.conversationId)).not.toContain(
        first.conversationId,
      );
      expect(
        (await editor.get(`/api/assistant/history/${first.conversationId}`)).status,
      ).toBe(404);
    });

    it("saves once, pins with a version, and reruns the stored plan against the data layer", async () => {
      const asked = await askAndRecord(admin, WORK);
      const save = await admin.postJson("/api/assistant/saved", {
        operationId: asked.operationId,
      });
      expect(save.status).toBe(200);
      const { created, item } = await save.json();
      expect(created).toBe(true);
      expect(item).toMatchObject({ structured: true, pinned: false, recordVersion: 1 });
      const again = await (
        await admin.postJson("/api/assistant/saved", { operationId: asked.operationId })
      ).json();
      expect(again).toMatchObject({ created: false, item: { savedId: item.savedId } });

      const pin = await admin.sendJson("PATCH", `/api/assistant/saved/${item.savedId}`, {
        pinned: true,
        expectedVersion: 1,
      });
      expect((await pin.json()).item).toMatchObject({ pinned: true, recordVersion: 2 });
      const listed = await (await admin.get("/api/assistant/saved")).json();
      expect(listed.items[0]).toMatchObject({ savedId: item.savedId, pinned: true });

      const runOperation = randomUUID();
      const run = await admin.postJson(`/api/assistant/saved/${item.savedId}/run`, {
        operationId: runOperation,
      });
      expect(run.status).toBe(200);
      const result = await run.json();
      expect(result.turn).toMatchObject({
        rerunOf: item.savedId,
        displayState: "completed",
      });
      expect(result.turn.assistant.interpretedBy).toBe("stored_plan");
      // The same question asked now through the data services lists the same records.
      const fresh = await (
        await admin.postJson("/api/assistant/query", {
          question: WORK,
          conversation: null,
        })
      ).json();
      expect(ids(result.turn.assistant)).toEqual(ids(fresh));
      expect(result.turn.assistant.groups.map((group) => group.total)).toEqual(
        fresh.groups.map((group) => group.total),
      );

      // A duplicate run replays; the conversation gains exactly one turn and keeps the first.
      const replay = await (
        await admin.postJson(`/api/assistant/saved/${item.savedId}/run`, {
          operationId: runOperation,
        })
      ).json();
      expect(replay.replayed).toBe(true);
      const conversation = await (
        await admin.get(`/api/assistant/history/${item.conversationId}`)
      ).json();
      expect(conversation.turns.map((turn) => turn.rerunOf)).toEqual([
        null,
        item.savedId,
      ]);
      expect(ids(conversation.turns[0].assistant)).toEqual(ids(asked.answer));

      const unpin = await admin.sendJson(
        "PATCH",
        `/api/assistant/saved/${item.savedId}`,
        {
          pinned: false,
          expectedVersion: 2,
        },
      );
      expect((await unpin.json()).item).toMatchObject({ pinned: false });
      const still = await (await admin.get("/api/assistant/saved")).json();
      expect(still.items.map((entry) => entry.savedId)).toContain(item.savedId);

      // Another account can neither change nor run it.
      expect(
        (
          await editor.sendJson("PATCH", `/api/assistant/saved/${item.savedId}`, {
            pinned: true,
            expectedVersion: 3,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await editor.postJson(`/api/assistant/saved/${item.savedId}/run`, {
            operationId: randomUUID(),
          })
        ).status,
      ).toBe(404);
      expect((await (await editor.get("/api/assistant/saved")).json()).items).toEqual([]);
    });

    it("a saved follow-up reruns with its merged meaning", async () => {
      const first = await askAndRecord(admin, "What work is assigned to anyone?");
      const follow = await askAndRecord(admin, "Only mine", {
        conversationKey: first.conversationKey,
        conversation: first.answer.conversation,
      });
      expect(follow.answer.execution?.plan.filters.assignee).toBe("me");
      const { item } = await (
        await admin.postJson("/api/assistant/saved", { operationId: follow.operationId })
      ).json();
      const run = await (
        await admin.postJson(`/api/assistant/saved/${item.savedId}/run`, {
          operationId: randomUUID(),
        })
      ).json();
      expect(run.turn.assistant.execution.plan.filters.assignee).toBe("me");
      expect(ids(run.turn.assistant)).toEqual(ids(follow.answer));
    });

    it("pages history beyond the first page", async () => {
      for (let index = 0; index < 21; index += 1) {
        const operationId = randomUUID();
        const begin = await editor.postJson("/api/assistant/history/turns", {
          operationId,
          conversationKey: operationId,
          question: `Paging question ${index}?`,
        });
        expect(begin.status).toBe(200);
      }
      const first = await (await editor.get("/api/assistant/history")).json();
      expect(first.conversations).toHaveLength(20);
      expect(first.nextCursor).toBeTruthy();
      const second = await (
        await editor.get(
          `/api/assistant/history?cursor=${encodeURIComponent(first.nextCursor)}`,
        )
      ).json();
      expect(second.conversations.length).toBeGreaterThanOrEqual(1);
      const all = [...first.conversations, ...second.conversations].map(
        (entry) => entry.conversationId,
      );
      expect(new Set(all).size).toBe(all.length);
    });
  },
);

describe.skipIf(process.env.FIRESTORE_EMULATOR_HOST)(
  "S148 Live-read-only rehearsal refuses history writes (no emulator)",
  () => {
    let client;

    beforeAll(async () => {
      client = createClient();
      await client.signInDemo("Admin");
    });

    it("says history is not saved here and refuses every history write", async () => {
      const { response, html } = await client.getHtml("/");
      expect(response.status).toBe(200);
      expect(html).toContain("History is not saved in this environment.");
      const operationId = randomUUID();
      const refusals = await Promise.all([
        client.postJson("/api/assistant/history/turns", {
          operationId,
          conversationKey: operationId,
          question: WORK,
        }),
        client.postJson("/api/assistant/saved", { operationId }),
        client.sendJson("PATCH", `/api/assistant/saved/${"d".repeat(32)}`, {
          pinned: true,
          expectedVersion: 1,
        }),
        client.postJson(`/api/assistant/saved/${"d".repeat(32)}/run`, { operationId }),
      ]);
      expect(refusals.map((entry) => entry.status)).toEqual([409, 409, 409, 409]);
      // Asking still works and replay is a read.
      const answer = await client.postJson("/api/assistant/query", {
        question: WORK,
        conversation: null,
        operationId,
      });
      expect(answer.status).toBe(200);
    });
  },
);
