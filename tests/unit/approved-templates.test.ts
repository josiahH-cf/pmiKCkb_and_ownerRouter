import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getApprovedTemplate } from "@/lib/firestore/approved-templates";
import type { TemplateRecord } from "@/lib/firestore/types";
import { FakeFirestore } from "../helpers/fake-firestore";

// F-TMPL-2: getApprovedTemplate reads the approved store for composers/process copy. It returns only
// Approved + active records and falls back to null on a 404 (unseeded/Draft-only). S167: every staff
// account has every internal Space, so an ordinary Editor reads the approved copy of any Space.

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

// An ordinary Editor. move-in and daily-inbox-triage map to no operator desk, which used to deny
// an account holding a maintenance-only allowlist.
const editor: AuthenticatedUser = {
  ...admin,
  uid: "editor-1",
  role: "Editor",
};

function templateDoc(
  overrides: Partial<TemplateRecord> & Pick<TemplateRecord, "id">,
): Record<string, unknown> {
  return {
    space_id: "daily-inbox-triage",
    name: "Vendor invoice acknowledgement",
    owner_uid: "launch-process-owner",
    audience: "Vendor",
    channel: "Gmail",
    body: "body text",
    status: "Approved",
    approved_by_uid: "launch-process-owner",
    last_reviewed_at: "2026-05-29T00:00:00.000Z",
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z",
    ...overrides,
  };
}

function seed(db: FakeFirestore, doc: Record<string, unknown>) {
  db.seed(`templates/${doc.id as string}`, doc);
}

describe("getApprovedTemplate (F-TMPL-2)", () => {
  it("resolves an Approved template by id", async () => {
    const db = new FakeFirestore();
    seed(db, templateDoc({ id: "tpl-vendor-ack" }));

    const record = await getApprovedTemplate(
      admin,
      { templateId: "tpl-vendor-ack" },
      db as unknown as Firestore,
    );
    expect(record?.id).toBe("tpl-vendor-ack");
    expect(record?.status).toBe("Approved");
  });

  it("returns null for Draft / Deprecated / soft-deleted / unknown ids", async () => {
    const db = new FakeFirestore();
    seed(db, templateDoc({ id: "draft", status: "Draft" }));
    seed(db, templateDoc({ id: "deprecated", status: "Deprecated" }));
    seed(db, templateDoc({ id: "deleted", deleted_at: "2026-06-01T00:00:00.000Z" }));
    const cast = db as unknown as Firestore;

    expect(await getApprovedTemplate(admin, { templateId: "draft" }, cast)).toBeNull();
    expect(
      await getApprovedTemplate(admin, { templateId: "deprecated" }, cast),
    ).toBeNull();
    expect(await getApprovedTemplate(admin, { templateId: "deleted" }, cast)).toBeNull();
    expect(await getApprovedTemplate(admin, { templateId: "missing" }, cast)).toBeNull();
  });

  it("finds only the Approved, active record by space + name (case-insensitive)", async () => {
    const db = new FakeFirestore();
    seed(
      db,
      templateDoc({
        id: "draft-welcome",
        space_id: "move-in",
        name: "Move-In Welcome Email",
        status: "Draft",
      }),
    );
    seed(
      db,
      templateDoc({
        id: "approved-welcome",
        space_id: "move-in",
        name: "Move-In Welcome Email",
        status: "Approved",
      }),
    );

    const record = await getApprovedTemplate(
      admin,
      { spaceId: "move-in", name: "move-in welcome email" },
      db as unknown as Firestore,
    );
    expect(record?.id).toBe("approved-welcome");
  });

  it("returns null by space + name when nothing Approved matches", async () => {
    const db = new FakeFirestore();
    seed(
      db,
      templateDoc({
        id: "draft-only",
        space_id: "move-in",
        name: "Move-In Welcome Email",
        status: "Draft",
      }),
    );

    expect(
      await getApprovedTemplate(
        admin,
        { spaceId: "move-in", name: "Move-In Welcome Email" },
        db as unknown as Firestore,
      ),
    ).toBeNull();
  });

  // S167: both lookups used to reject with a scope denial (AuthError) for a maintenance-only account.
  it("resolves an Approved template in an unmapped Space for an ordinary Editor", async () => {
    const db = new FakeFirestore();
    seed(
      db,
      templateDoc({
        id: "approved-welcome",
        space_id: "move-in",
        name: "Move-In Welcome Email",
      }),
    );
    const cast = db as unknown as Firestore;

    const byName = await getApprovedTemplate(
      editor,
      { spaceId: "move-in", name: "Move-In Welcome Email" },
      cast,
    );
    expect(byName).toMatchObject({ id: "approved-welcome", space_id: "move-in" });

    const byId = await getApprovedTemplate(
      editor,
      { templateId: "approved-welcome" },
      cast,
    );
    expect(byId).toMatchObject({ id: "approved-welcome", status: "Approved" });
  });
});
