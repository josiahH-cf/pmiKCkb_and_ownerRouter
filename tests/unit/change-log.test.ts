import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { listSpaceChangeLog } from "@/lib/firestore/change-log";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const user: AuthenticatedUser = {
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  uid: "editor-1",
};

describe("Space change log", () => {
  it("returns recent change-log entries for editable records in the requested Space", async () => {
    const db = new FakeFirestore();

    db.seed("sops/sop-1", {
      id: "sop-1",
      space_id: "lease-renewals",
    });
    db.seed("sops/sop-2", {
      id: "sop-2",
      space_id: "owner-onboarding",
    });
    db.seed("change_log/change-1", {
      action: "update",
      created_at: "2026-05-28T00:00:00.000Z",
      editor_uid: "editor-1",
      entity_id: "sop-1",
      entity_type: "sop",
      id: "change-1",
    });
    db.seed("change_log/change-2", {
      action: "update",
      created_at: "2026-05-29T00:00:00.000Z",
      editor_uid: "editor-1",
      entity_id: "sop-2",
      entity_type: "sop",
      id: "change-2",
    });

    await expect(
      listSpaceChangeLog(user, "lease-renewals", db as never),
    ).resolves.toEqual([
      expect.objectContaining({
        entity_id: "sop-1",
        id: "change-1",
      }),
    ]);
  });
});
