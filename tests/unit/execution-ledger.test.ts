import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { ExecutionClassification } from "@/lib/execution/types";
import {
  approveActionExecution,
  claimActionExecution,
  getActionExecution,
  listActionExecutionActivity,
  prepareActionExecutionRecord,
  returnActionExecution,
} from "@/lib/firestore/action-executions";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const editor: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};
const admin: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin-1",
};
const previewHash = hashExecutionPreview({ target: "fixture-only" });
let fakeDb: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fakeDb = new FakeFirestore();
  db = fakeDb as unknown as Firestore;
});

describe("action execution ledger", () => {
  it("prepares idempotently and refuses idempotency-key preview drift", async () => {
    const first = await prepareActionExecutionRecord(
      editor,
      {
        classification: classification("Medium"),
        idempotencyKey: "fixture-click-1",
        previewHash,
      },
      db,
    );
    const second = await prepareActionExecutionRecord(
      editor,
      {
        classification: classification("Medium"),
        idempotencyKey: "fixture-click-1",
        previewHash,
      },
      db,
    );

    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({ attempt_count: 0, state: "Ready" });
    await expect(
      prepareActionExecutionRecord(
        editor,
        {
          classification: classification("Medium"),
          idempotencyKey: "fixture-click-1",
          previewHash: "b".repeat(64),
        },
        db,
      ),
    ).rejects.toThrow(/different execution preview/i);
  });

  it("permits one direct claim and rejects a double-click before a second attempt", async () => {
    const record = await prepareActionExecutionRecord(
      editor,
      {
        classification: classification("Medium"),
        idempotencyKey: "fixture-click-2",
        previewHash,
      },
      db,
    );

    await claimActionExecution(editor, record.id, previewHash, db);
    await expect(
      claimActionExecution(editor, record.id, previewHash, db),
    ).rejects.toThrow(
      /already has an attempt|cannot be retried|execution.*can.*execute/i,
    );
    await expect(getActionExecution(editor, record.id, db)).resolves.toMatchObject({
      attempt_count: 1,
      state: "Executing",
    });
  });

  it("requires Admin exact-hash approval with a reason for High work", async () => {
    const record = await prepareActionExecutionRecord(
      editor,
      {
        classification: classification("High"),
        idempotencyKey: "fixture-high-1",
        previewHash,
      },
      db,
    );

    await expect(
      claimActionExecution(editor, record.id, previewHash, db),
    ).rejects.toThrow(/requires.*Admin approval/i);
    await expect(
      approveActionExecution(editor, record.id, { previewHash, reason: "Reviewed." }, db),
    ).rejects.toThrow(/Only an Admin/i);
    await expect(
      approveActionExecution(
        admin,
        record.id,
        { previewHash: "c".repeat(64), reason: "Reviewed." },
        db,
      ),
    ).rejects.toThrow(/stale/i);

    const approved = await approveActionExecution(
      admin,
      record.id,
      {
        previewHash,
        reason: "The exact fixture preview matches the documented change.",
      },
      db,
    );
    expect(approved).toMatchObject({
      approval: { approvedByUid: admin.uid, previewHash },
      state: "Approved",
    });
    await expect(
      claimActionExecution(editor, record.id, previewHash, db),
    ).resolves.toMatchObject({ attempt_count: 1, state: "Executing" });
  });

  it("allows Admin self-approval and makes returned work non-executable", async () => {
    const self = await prepareActionExecutionRecord(
      admin,
      {
        classification: classification("High"),
        idempotencyKey: "fixture-high-self",
        previewHash,
      },
      db,
    );
    await approveActionExecution(
      admin,
      self.id,
      { previewHash, reason: "Self-approved against the exact fixture preview." },
      db,
    );
    await expect(
      claimActionExecution(admin, self.id, previewHash, db),
    ).resolves.toMatchObject({ state: "Executing" });

    const returned = await prepareActionExecutionRecord(
      editor,
      {
        classification: classification("High"),
        idempotencyKey: "fixture-high-return",
        previewHash,
      },
      db,
    );
    await returnActionExecution(
      admin,
      returned.id,
      "The source value needs revision.",
      db,
    );
    await expect(
      claimActionExecution(editor, returned.id, previewHash, db),
    ).rejects.toThrow();
  });

  it("writes bodyless append-only state activity", async () => {
    const record = await prepareActionExecutionRecord(
      editor,
      {
        classification: classification("Medium"),
        idempotencyKey: "fixture-activity",
        previewHash,
      },
      db,
    );
    await claimActionExecution(editor, record.id, previewHash, db);
    const activity = await listActionExecutionActivity(editor, record.id, db);

    expect(activity.map((entry) => entry.action)).toEqual(["prepared", "claimed"]);
    expect(JSON.stringify(activity)).not.toContain("fixture-only");
    expect(
      Array.from(fakeDb.store.keys()).filter((key) => key.includes("activity")),
    ).toHaveLength(2);
  });
});

function classification(risk: "Medium" | "High"): ExecutionClassification & {
  kind: NonNullable<ExecutionClassification["kind"]>;
  risk: "Medium" | "High";
} {
  return {
    actionKey: risk === "High" ? "fixture.sor.write" : "fixture.message.send",
    blockers: [],
    defaultRisk: risk,
    kind: risk === "High" ? "system_of_record_write" : "workflow_communication",
    requiresActionRegistry: false,
    risk,
  };
}
