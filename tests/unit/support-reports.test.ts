import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  createSupportReport,
  listSupportReports,
  transitionSupportReport,
} from "@/lib/firestore/support-reports";
import {
  PRODUCT_RECORD_RETENTION_CLASS,
  PRODUCT_RECORD_RETENTION_POLICY,
} from "@/lib/operations/product-record-retention";
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
      product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
      product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
      legal_hold: false,
    });
    expect(report.id).toBeTruthy();
    expect(report.created_at).toBeTruthy();
    expect(fakeDb.store.get(`support_reports/${report.id}`)).toMatchObject({
      product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
      product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
      legal_hold: false,
    });
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

// S65: a feedback report can be finished (AC-S65-1/2/3/6).
describe("transitionSupportReport (S65)", () => {
  it("moves new -> acknowledged -> resolved and the status persists (AC-S65-1)", async () => {
    seedReport("r1", "2026-08-01T00:00:00.000Z");
    const acknowledged = await transitionSupportReport(
      admin,
      { reportId: "r1", status: "acknowledged" },
      db,
    );
    expect(acknowledged.status).toBe("acknowledged");
    const resolved = await transitionSupportReport(
      admin,
      { reportId: "r1", status: "resolved", note: "Fixed in the next build." },
      db,
    );
    expect(resolved.status).toBe("resolved");
    // Persists across a fresh read (the reload).
    const listed = await listSupportReports(admin, {}, db);
    expect(listed.find((report) => report.id === "r1")?.status).toBe("resolved");
    expect(listed.find((report) => report.id === "r1")?.status_updated_by_uid).toBe(
      "admin-1",
    );
  });

  it("refuses a non-Admin and leaves the status unchanged (AC-S65-2)", async () => {
    seedReport("r2", "2026-08-01T00:00:00.000Z");
    await expect(
      transitionSupportReport(editor, { reportId: "r2", status: "resolved" }, db),
    ).rejects.toBeInstanceOf(EditableLayerError);
    expect(fakeDb.store.get("support_reports/r2")?.status).toBe("new");
    // No audit entry was written either.
    const audits = [...fakeDb.store.keys()].filter((path) =>
      path.startsWith("support_report_activity/"),
    );
    expect(audits).toHaveLength(0);
  });

  it("appends an audit record naming the actor and both statuses (AC-S65-3)", async () => {
    seedReport("r3", "2026-08-01T00:00:00.000Z");
    await transitionSupportReport(
      admin,
      { reportId: "r3", status: "acknowledged", note: "Looking into it." },
      db,
    );
    const audits = [...fakeDb.store.entries()].filter(([path]) =>
      path.startsWith("support_report_activity/"),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]![1]).toMatchObject({
      report_id: "r3",
      actor_uid: "admin-1",
      previous_status: "new",
      new_status: "acknowledged",
      note: "Looking into it.",
    });
  });

  it("never deletes the report or touches its retention fields (AC-S65-6)", async () => {
    fakeDb.seed("support_reports/r4", {
      id: "r4",
      route: "/r4",
      description: "The desk misrenders.",
      reporter_uid: "editor-1",
      reporter_role: "Editor",
      origin: "app",
      status: "new",
      created_at: "2026-08-01T00:00:00.000Z",
      product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
      product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
      legal_hold: false,
    });
    await transitionSupportReport(admin, { reportId: "r4", status: "resolved" }, db);
    const stored = fakeDb.store.get("support_reports/r4");
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("resolved");
    // The body and retention posture are untouched by the field-level update.
    expect(stored?.description).toBe("The desk misrenders.");
    expect(stored?.product_retention_policy).toBe(PRODUCT_RECORD_RETENTION_POLICY);
    expect(stored?.product_retention_class).toBe(PRODUCT_RECORD_RETENTION_CLASS);
    expect(stored?.legal_hold).toBe(false);
  });

  it("refuses an unknown report, an unknown status, and a same-status no-op", async () => {
    seedReport("r5", "2026-08-01T00:00:00.000Z");
    await expect(
      transitionSupportReport(admin, { reportId: "missing", status: "resolved" }, db),
    ).rejects.toThrow(/does not exist/);
    await expect(
      transitionSupportReport(
        admin,
        { reportId: "r5", status: "escalated" as never },
        db,
      ),
    ).rejects.toThrow(/one of new, acknowledged, or resolved/);
    await expect(
      transitionSupportReport(admin, { reportId: "r5", status: "new" }, db),
    ).rejects.toThrow(/already new/);
  });

  it("exposes no delete path (a status change is never a deletion)", async () => {
    const storeModule = await import("@/lib/firestore/support-reports");
    const deleters = Object.keys(storeModule).filter((name) =>
      /delete|remove|purge/i.test(name),
    );
    expect(deleters).toEqual([]);
  });
});
