import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import {
  createSop,
  createTemplate,
  createTool,
  getSop,
  listSops,
  listTools,
  softDeleteTool,
  updateTemplate,
  updatePlaceholder,
  updateSop,
} from "@/lib/firestore/editable";
import { EditableLayerError } from "@/lib/firestore/errors";
import { AuthError, type AuthenticatedUser } from "@/lib/auth/session";
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

    await expect(
      updatePlaceholder(
        approver,
        "placeholder-1",
        {
          resolution: "Attempted duplicate resolution.",
          status: "Resolved",
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(changeLogRecords(db)).toHaveLength(1);
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

describe("editable layer space-scope enforcement (SPACE-1/TMPL-4)", () => {
  const maintenanceEditor: AuthenticatedUser = {
    ...editor,
    uid: "maint-editor",
    scopes: ["maintenance"],
  };

  it("denies a scoped principal cross-scope list/create/read/update of editable records", async () => {
    const db = fakeDb();
    // Seed a renewals SOP as an unscoped admin (allowed), then confirm a maintenance-scoped editor
    // cannot reach the renewals Space through any editable-layer operation.
    const renewalsSop = await createSop(
      admin,
      "lease-renewals",
      { body_md: "# R", owner_uid: "o", title: "R" },
      db,
    );

    await expect(
      listSops(maintenanceEditor, "lease-renewals", db),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      createSop(
        maintenanceEditor,
        "lease-renewals",
        { body_md: "# X", owner_uid: "o", title: "X" },
        db,
      ),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(getSop(maintenanceEditor, renewalsSop.id, db)).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(
      updateSop(maintenanceEditor, renewalsSop.id, { title: "Nope" }, db),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("still allows a scoped principal to work within its own Space", async () => {
    const db = fakeDb();
    const sop = await createSop(
      maintenanceEditor,
      "maintenance-work-order-intake",
      { body_md: "# M", owner_uid: "o", title: "M" },
      db,
    );
    expect(sop.space_id).toBe("maintenance-work-order-intake");
    await expect(
      listSops(maintenanceEditor, "maintenance-work-order-intake", db),
    ).resolves.toHaveLength(1);
  });

  it("still allows an unscoped principal to reach every Space", async () => {
    const db = fakeDb();
    const sop = await createSop(
      admin,
      "lease-renewals",
      { body_md: "# R", owner_uid: "o", title: "R" },
      db,
    );
    await expect(getSop(admin, sop.id, db)).resolves.toMatchObject({
      space_id: "lease-renewals",
    });
  });
});

describe("template governance metadata (TMPL-7)", () => {
  it("defaults owner_uid to the creator and stamps the approver server-side", async () => {
    const db = fakeDb();
    const template = await createTemplate(
      editor,
      "lease-renewals",
      {
        name: "Owner Renewal Follow-Up",
        body: "Approved wording.",
        audience: "Owner",
        channel: "Gmail",
      },
      db,
    );
    expect(template.owner_uid).toBe("editor");
    expect(template.approved_by_uid).toBeUndefined();

    // The approve flow only sends status + last_reviewed_at; the approver uid is stamped by the server.
    const approved = await updateTemplate(
      approver,
      template.id,
      { status: "Approved", last_reviewed_at: "2026-05-27T00:00:00.000Z" },
      db,
    );
    expect(approved).toMatchObject({
      status: "Approved",
      approved_by_uid: "approver",
      owner_uid: "editor",
    });
  });

  it("rejects a duplicate active template name within the same Space (case-insensitively)", async () => {
    const db = fakeDb();
    await createTemplate(
      editor,
      "lease-renewals",
      { name: "Renewal Notice", body: "b" },
      db,
    );
    await expect(
      createTemplate(
        editor,
        "lease-renewals",
        { name: "renewal notice", body: "b2" },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows the same template name in different Spaces", async () => {
    const db = fakeDb();
    await createTemplate(
      editor,
      "lease-renewals",
      { name: "Shared Name", body: "b" },
      db,
    );
    const other = await createTemplate(
      editor,
      "move-in",
      { name: "Shared Name", body: "b" },
      db,
    );
    expect(other).toMatchObject({ name: "Shared Name", space_id: "move-in" });
  });

  it("rejects renaming a template onto an existing active name in its Space", async () => {
    const db = fakeDb();
    await createTemplate(editor, "lease-renewals", { name: "First", body: "b" }, db);
    const second = await createTemplate(
      editor,
      "lease-renewals",
      { name: "Second", body: "b" },
      db,
    );
    await expect(
      updateTemplate(editor, second.id, { name: "first" }, db),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("ignores a client-supplied approved_by_uid and stamps the acting approver", async () => {
    const db = fakeDb();
    const template = await createTemplate(
      editor,
      "lease-renewals",
      { name: "Renewal Notice", body: "b" },
      db,
    );

    const approved = await updateTemplate(
      approver,
      template.id,
      {
        last_reviewed_at: "2026-05-27T00:00:00.000Z",
        status: "Approved",
        // @ts-expect-error approved_by_uid is server-owned, not a client input; it must be ignored.
        approved_by_uid: "forged-uid",
      },
      db,
    );
    expect(approved.approved_by_uid).toBe("approver");
  });

  it("does not let a non-approver pre-seed a forged approver on a Draft", async () => {
    const db = fakeDb();
    const template = await createTemplate(
      editor,
      "lease-renewals",
      { name: "Renewal Notice", body: "b" },
      db,
    );

    const stillDraft = await updateTemplate(
      editor,
      template.id,
      // @ts-expect-error approved_by_uid is server-owned; forcing it in must be ignored.
      { body: "b2", approved_by_uid: "forged-uid" },
      db,
    );
    expect(stillDraft.approved_by_uid).toBeUndefined();

    // A later approval records the ACTUAL approver, never the earlier forged id.
    const approved = await updateTemplate(
      approver,
      template.id,
      { last_reviewed_at: "2026-05-27T00:00:00.000Z", status: "Approved" },
      db,
    );
    expect(approved.approved_by_uid).toBe("approver");
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
