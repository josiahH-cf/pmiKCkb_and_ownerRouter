import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  readRenewalRehearsalSheetAdminConfig,
  RENEWAL_REHEARSAL_SHEET_CONFIG_ACTIVITY_COLLECTION,
  RENEWAL_REHEARSAL_SHEET_CONFIG_COLLECTION,
  updateRenewalRehearsalSheetAdminConfig,
} from "@/lib/firestore/renewal-rehearsal-sheet-config";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const ENV = { RENEWAL_SHEET_ID: "operating-sheet" };

function actor(role: AuthenticatedUser["role"] = "Admin"): AuthenticatedUser {
  return {
    uid: role === "Admin" ? "admin-1" : "editor-1",
    email: `${role.toLowerCase()}@pmikcmetro.com`,
    hd: "pmikcmetro.com",
    role,
  };
}

describe("Admin rehearsal-Sheet configuration", () => {
  it("canonicalizes a Google Sheet URL, saves only its id, and appends an audit row", async () => {
    const db = new FakeFirestore();
    const saved = await updateRenewalRehearsalSheetAdminConfig(
      actor(),
      {
        spreadsheet: "https://docs.google.com/spreadsheets/d/rehearsal-copy_1/edit#gid=0",
      },
      db as never,
      ENV,
    );

    expect(saved.rehearsal).toMatchObject({
      configured: true,
      spreadsheetId: "rehearsal-copy_1",
      source: "saved",
    });
    expect(
      db.store.get(`${RENEWAL_REHEARSAL_SHEET_CONFIG_COLLECTION}/active`),
    ).toMatchObject({
      spreadsheet_id: "rehearsal-copy_1",
      updated_by_uid: "admin-1",
    });
    const audit = [...db.store.entries()].filter(([path]) =>
      path.startsWith(`${RENEWAL_REHEARSAL_SHEET_CONFIG_ACTIVITY_COLLECTION}/`),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0][1]).toMatchObject({
      action: "configured",
      spreadsheet_id: "rehearsal-copy_1",
      actor_uid: "admin-1",
    });
    expect(JSON.stringify([...db.store.values()])).not.toContain("gid=0");
  });

  it.each([
    "",
    "https://example.com/spreadsheets/d/copy/edit",
    "https://docs.google.com/document/d/not-a-sheet/edit",
    "operating-sheet",
  ])("refuses invalid or operating targets without persistence: %s", async (value) => {
    const db = new FakeFirestore();
    await expect(
      updateRenewalRehearsalSheetAdminConfig(
        actor(),
        { spreadsheet: value },
        db as never,
        ENV,
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(db.store.size).toBe(0);
  });

  it("refuses to save when the operating binding is absent", async () => {
    await expect(
      updateRenewalRehearsalSheetAdminConfig(
        actor(),
        { spreadsheet: "rehearsal-copy" },
        new FakeFirestore() as never,
        {},
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows only Admin reads and writes", async () => {
    const db = new FakeFirestore();
    await expect(
      readRenewalRehearsalSheetAdminConfig(actor("Editor"), db as never, ENV),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      updateRenewalRehearsalSheetAdminConfig(
        actor("Editor"),
        { spreadsheet: "copy" },
        db as never,
        ENV,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("uses the server environment fallback until an audited saved value exists", async () => {
    const config = await readRenewalRehearsalSheetAdminConfig(
      actor(),
      new FakeFirestore() as never,
      { ...ENV, RENEWAL_REHEARSAL_SHEET_ID: "environment-copy" },
    );
    expect(config.rehearsal).toMatchObject({
      spreadsheetId: "environment-copy",
      source: "environment",
    });
  });
});
