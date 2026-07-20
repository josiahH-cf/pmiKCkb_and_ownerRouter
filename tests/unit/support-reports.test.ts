import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { createSupportReport, listSupportReports } from "@/lib/firestore/support-reports";
import { FakeFirestore } from "../helpers/fake-firestore";

let fakeDb: FakeFirestore;
let db: Firestore;

beforeEach(() => {
  fakeDb = new FakeFirestore();
  db = fakeDb as unknown as Firestore;
});

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const admin: AuthenticatedUser = { ...editor, uid: "admin-1", role: "Admin" };

function seedReport(id: string, createdAt: string) {
  fakeDb.seed(`support_reports/${id}`, {
    id,
    route: `/${id}`,
    reporter_uid: "editor-1",
    reporter_role: "Editor",
    origin: "app",
    status: "new",
    created_at: createdAt,
  });
}

describe("support reports store (F-SUPP-1)", () => {
  it("persists an allowlisted report with reporter attribution and status new", async () => {
    const report = await createSupportReport(
      editor,
      {
        route: "/lease-renewal",
        description: "The Save button does nothing.",
        origin: "app",
        viewport: "1280x800",
        userAgent: "test-agent",
        element: { tag: "button", testId: "save-btn" },
      },
      db,
    );

    expect(report).toMatchObject({
      route: "/lease-renewal",
      description: "The Save button does nothing.",
      reporter_uid: "editor-1",
      reporter_role: "Editor",
      origin: "app",
      status: "new",
      element: { tag: "button", testId: "save-btn" },
    });
    expect(report.id).toBeTruthy();
    expect(report.created_at).toBeTruthy();
  });

  it("omits an absent description instead of storing an empty field", async () => {
    const report = await createSupportReport(
      editor,
      { route: "/", origin: "error_boundary", errorDigest: "abc123" },
      db,
    );

    expect(report).not.toHaveProperty("description");
    expect(report).toMatchObject({ origin: "error_boundary", error_digest: "abc123" });
  });

  it("lists reports newest-first for an Admin and denies non-Admins", async () => {
    seedReport("r-old", "2026-07-01T00:00:00.000Z");
    seedReport("r-new", "2026-07-10T00:00:00.000Z");

    const reports = await listSupportReports(admin, {}, db);
    expect(reports.map((report) => report.id)).toEqual(["r-new", "r-old"]);

    await expect(listSupportReports(editor, {}, db)).rejects.toBeInstanceOf(
      EditableLayerError,
    );
  });

  it("respects the list limit, keeping the newest", async () => {
    for (let index = 0; index < 5; index += 1) {
      seedReport(`r-${index}`, `2026-07-0${index + 1}T00:00:00.000Z`);
    }

    const reports = await listSupportReports(admin, { limit: 2 }, db);
    expect(reports).toHaveLength(2);
    expect(reports[0].id).toBe("r-4");
  });
});
