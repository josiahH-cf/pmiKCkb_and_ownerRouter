import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  createSop,
  createTemplate,
  createTool,
  listTools,
  softDeleteTool,
  updateTemplate,
  updatePlaceholder,
  updateSop,
} from "@/lib/firestore/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FakeFirestore } from "../helpers/fake-firestore";

const editor: AuthenticatedUser = {
  uid: "editor",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

const approver: AuthenticatedUser = {
  ...editor,
  uid: "approver",
  role: "Approver",
};

const admin: AuthenticatedUser = {
  ...editor,
  uid: "admin",
  role: "Admin",
};

describe("editable Firestore repository", () => {
  it("creates SOPs and change-log entries for writable launch Spaces", async () => {
    const db = fakeDb();

    const sop = await createSop(
      editor,
      "lease-renewals",
      {
        body_md: "# SOP: Lease Renewals",
        owner_uid: "owner-uid",
        title: "Lease Renewals",
      },
      db,
    );

    expect(sop).toMatchObject({
      body_md: "# SOP: Lease Renewals",
      owner_uid: "owner-uid",
      space_id: "lease-renewals",
      status: "Draft",
      title: "Lease Renewals",
    });
    expect(changeLogRecords(db)).toHaveLength(1);
    expect(changeLogRecords(db)[0]).toMatchObject({
      action: "create",
      editor_uid: "editor",
      entity_id: sop.id,
      entity_type: "sop",
    });
  });

  it("blocks editable writes to the read-only Owner Email Space", async () => {
    const db = fakeDb();

    await expect(
      createSop(
        editor,
        "owner-email",
        {
          body_md: "# SOP: Owner Email",
          owner_uid: "owner-uid",
          title: "Owner Email",
        },
        db,
      ),
    ).rejects.toMatchObject({
      message: "This Space is read-only.",
      status: 403,
    });
  });

  it("prevents editors from approving SOPs", async () => {
    const db = fakeDb();
    seedSop(db);

    await expect(
      updateSop(
        editor,
        "sop-1",
        {
          last_reviewed_at: "2026-05-27T00:00:00.000Z",
          status: "Approved",
        },
        db,
      ),
    ).rejects.toMatchObject({
      message: "Editor role cannot approve SOPs.",
      status: 403,
    });
  });

  it("creates templates and blocks editor approval", async () => {
    const db = fakeDb();

    const template = await createTemplate(
      editor,
      "lease-renewals",
      {
        body: "Approved wording goes here.",
        channel: "Gmail",
        name: "Owner Renewal Follow-Up",
        audience: "Owner",
      },
      db,
    );

    expect(template).toMatchObject({
      audience: "Owner",
      channel: "Gmail",
      name: "Owner Renewal Follow-Up",
      status: "Draft",
    });
    await expect(
      updateTemplate(
        editor,
        template.id,
        {
          approved_by_uid: "approver",
          last_reviewed_at: "2026-05-27T00:00:00.000Z",
          status: "Approved",
        },
        db,
      ),
    ).rejects.toMatchObject({
      message: "Editor role cannot approve templates.",
      status: 403,
    });
  });

  it("allows approvers to resolve placeholders with a resolution", async () => {
    const db = fakeDb();
    seedPlaceholder(db);

    const placeholder = await updatePlaceholder(
      approver,
      "placeholder-1",
      {
        resolution: "Use the approved renewal answer.",
        status: "Resolved",
      },
      db,
    );

    expect(placeholder.status).toBe("Resolved");
    expect(placeholder.resolution).toBe("Use the approved renewal answer.");
    expect(changeLogRecords(db)[0]).toMatchObject({
      action: "update",
      entity_id: "placeholder-1",
      entity_type: "placeholder",
    });
  });

  it("blocks duplicate active tool names case-insensitively", async () => {
    const db = fakeDb();
    seedTool(db, { id: "tool-1", name: "RentVine" });

    await expect(
      createTool(
        editor,
        {
          integration_status: "Link only",
          name: "rentvine",
          primary_owner_uid: "owner-uid",
          purpose: "Property management",
          sensitivity: "Low",
          url: "https://example.com/rentvine",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(EditableLayerError);
  });

  it("soft deletes tools for admins and hides them from active lists", async () => {
    const db = fakeDb();
    seedTool(db, { id: "tool-1", name: "RentVine" });

    await softDeleteTool(admin, "tool-1", "Retired link", db);

    await expect(listTools(editor, db)).resolves.toEqual([]);
    expect(fakeStore(db).get("tools/tool-1")).toMatchObject({
      deleted_at: "2026-05-27T00:00:00.000Z",
    });
    expect(changeLogRecords(db)[0]).toMatchObject({
      action: "deprecate",
      note: "Retired link",
    });
  });
});

function fakeDb() {
  return new FakeFirestore() as unknown as Firestore;
}

function changeLogRecords(db: Firestore) {
  return Array.from(fakeStore(db).entries())
    .filter(([path]) => path.startsWith("change_log/"))
    .map(([, record]) => record);
}

function fakeStore(db: Firestore) {
  return (db as unknown as FakeFirestore).store;
}

function seedSop(db: Firestore) {
  (db as unknown as FakeFirestore).seed("sops/sop-1", {
    id: "sop-1",
    body_md: "# SOP: Lease Renewals",
    created_at: "2026-05-27T00:00:00.000Z",
    owner_uid: "owner-uid",
    sensitivity: "Low",
    source_state_hint: "Open Placeholder",
    space_id: "lease-renewals",
    status: "Draft",
    title: "Lease Renewals",
    updated_at: "2026-05-27T00:00:00.000Z",
  });
}

function seedPlaceholder(db: Firestore) {
  (db as unknown as FakeFirestore).seed("placeholders/placeholder-1", {
    id: "placeholder-1",
    created_at: "2026-05-27T00:00:00.000Z",
    missing_detail: "Confirm renewal follow-up timing.",
    owner_uid: "owner-uid",
    priority: "P0",
    space_id: "lease-renewals",
    status: "Open",
    updated_at: "2026-05-27T00:00:00.000Z",
  });
}

function seedTool(
  db: Firestore,
  overrides: {
    id: string;
    name: string;
  },
) {
  (db as unknown as FakeFirestore).seed(`tools/${overrides.id}`, {
    id: overrides.id,
    created_at: "2026-05-27T00:00:00.000Z",
    integration_status: "Link only",
    name: overrides.name,
    primary_owner_uid: "owner-uid",
    purpose: "Property management",
    sensitivity: "Low",
    updated_at: "2026-05-27T00:00:00.000Z",
    url: "https://example.com/rentvine",
  });
}
