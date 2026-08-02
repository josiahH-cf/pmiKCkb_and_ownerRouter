import { describe, expect, it } from "vitest";

import {
  classifyMigrationRecord,
  formatMigrationDryRun,
  migrationRemovalSet,
  planMigrationDryRun,
  type MigrationCandidateRecord,
  type MigrationDryRunPlan,
} from "@/lib/operations/migration-dry-run";

/**
 * S40 AC-S40-5. The dangerous failure is not a crash — it is a plan that looks authoritative while
 * quietly defaulting an unclassified record, or listing a Live record for removal.
 */

const BACKUP = "gs://pmi-kc-kb-prod-backups/2026-08-01T00-00-00Z";

function record(
  id: string,
  collection: string,
  dataMode?: unknown,
): MigrationCandidateRecord {
  return { id, collection, ...(dataMode === undefined ? {} : { dataMode }) };
}

const CLEAN_SET = [
  record("r1", "maintenance_tickets", "live"),
  record("r2", "maintenance_tickets", "test"),
  record("r3", "workflow_runs", "test"),
  record("r4", "approval_queue_items", "live"),
];

describe("migration classification", () => {
  it("classifies only the two explicit values and never defaults", () => {
    expect(classifyMigrationRecord(record("a", "workflow_runs", "live"))).toBe("live");
    expect(classifyMigrationRecord(record("a", "workflow_runs", "test"))).toBe("test");
    for (const value of [undefined, null, "", "TEST", "demo", 1, true, {}]) {
      expect(classifyMigrationRecord(record("a", "workflow_runs", value))).toBe(
        "unclassified",
      );
    }
  });
});

describe("migration dry run plan", () => {
  it("counts live and test per collection and stays a plan", () => {
    const plan = planMigrationDryRun({ records: CLEAN_SET, backupRef: BACKUP });

    expect(plan.status).toBe("ready");
    expect(plan.version).toBe("migration-dry-run:v2-delete");
    expect(plan.semantics).toBe("delete");
    expect(plan.executed).toBe(false);
    expect(plan.totalLive).toBe(2);
    expect(plan.totalTest).toBe(2);
    expect(plan.rollbackTarget).toBe(BACKUP);
    expect(plan.collections.map((entry) => entry.collection)).toEqual([
      "approval_queue_items",
      "maintenance_tickets",
      "workflow_runs",
    ]);
  });

  it("refuses an unclassified record rather than defaulting it to live", () => {
    // resolveStoredDataMode defaults missing -> live on READ paths, which is correct there. Using
    // that default to decide what to migrate would silently act on unclassified records.
    const plan = planMigrationDryRun({
      records: [...CLEAN_SET, record("r9", "workflow_runs")],
      backupRef: BACKUP,
    });

    expect(plan.status).toBe("refused");
    expect(plan.refusals.join(" ")).toMatch(
      /workflow_runs contains a record with no explicit data/,
    );
    expect(plan.collections).toEqual([]);
    expect(plan.totalLive).toBe(0);
  });

  it("refuses without a backup reference to roll back to", () => {
    const plan = planMigrationDryRun({ records: CLEAN_SET });

    expect(plan.status).toBe("refused");
    expect(plan.refusals.join(" ")).toMatch(/backup reference/);
  });

  it("refuses a duplicate or unnamed record, and an ungoverned collection", () => {
    for (const [records, pattern] of [
      [
        [record("r1", "workflow_runs", "test"), record("r1", "workflow_runs", "test")],
        /duplicate record/,
      ],
      [[record("", "workflow_runs", "test")], /has no id/],
      [
        [record("r1", "secret_stuff", "test")],
        /not a governed product-record collection/,
      ],
    ] as const) {
      const plan = planMigrationDryRun({ records, backupRef: BACKUP });
      expect(plan.status).toBe("refused");
      expect(plan.refusals.join(" ")).toMatch(pattern);
    }
  });
});

describe("removal set cannot contain a Live record", () => {
  it("returns exactly the planned test records", () => {
    const plan = planMigrationDryRun({ records: CLEAN_SET, backupRef: BACKUP });

    expect(migrationRemovalSet(plan, CLEAN_SET)).toEqual([
      { collection: "maintenance_tickets", id: "r2" },
      { collection: "workflow_runs", id: "r3" },
    ]);
  });

  it("refuses a runtime-loaded legacy, non-delete, or mismatched-backup plan", () => {
    const ready = planMigrationDryRun({ records: CLEAN_SET, backupRef: BACKUP });
    const forged = (overrides: Record<string, unknown>) =>
      ({ ...ready, ...overrides }) as unknown as MigrationDryRunPlan;

    for (const plan of [
      forged({ version: "migration-dry-run:v1" }),
      forged({ semantics: "move" }),
      forged({ backupRef: undefined }),
      forged({ rollbackTarget: undefined }),
      forged({ rollbackTarget: "projects/example/databases/different-backup" }),
    ]) {
      expect(() => migrationRemovalSet(plan, CLEAN_SET)).toThrow(
        /exact v2 DELETE plan with one named backup\/rollback identity/,
      );
    }
  });

  it("refuses when a planned id turns out to be classified live", () => {
    const plan = planMigrationDryRun({ records: CLEAN_SET, backupRef: BACKUP });
    // The record was reclassified (or the plan was hand-edited) after planning.
    const reclassified = CLEAN_SET.map((entry) =>
      entry.id === "r2" ? record("r2", "maintenance_tickets", "live") : entry,
    );

    expect(() => migrationRemovalSet(plan, reclassified)).toThrow(
      /never removes a Live record/,
    );
  });

  it("refuses missing, extra, or newly unclassified records instead of deleting an intersection", () => {
    const plan = planMigrationDryRun({ records: CLEAN_SET, backupRef: BACKUP });

    expect(() =>
      migrationRemovalSet(
        plan,
        CLEAN_SET.filter((entry) => entry.id !== "r3"),
      ),
    ).toThrow(/not exactly the planned set \(1 missing, 0 extra\)/);
    expect(() =>
      migrationRemovalSet(plan, [
        ...CLEAN_SET,
        record("new", "maintenance_tickets", "test"),
      ]),
    ).toThrow(/not exactly the planned set \(0 missing, 1 extra\)/);
    expect(() =>
      migrationRemovalSet(plan, [...CLEAN_SET, record("new", "maintenance_tickets")]),
    ).toThrow(/without an explicit classification/);
  });

  it("has no removal set at all for a refused plan", () => {
    const refused = planMigrationDryRun({ records: CLEAN_SET });

    expect(() => migrationRemovalSet(refused, CLEAN_SET)).toThrow(/refused/);
  });
});

describe("report emits no record content", () => {
  it("carries counts, collections, and opaque ids only", () => {
    const withContent = [
      { id: "r2", collection: "maintenance_tickets", dataMode: "test" },
      { id: "r1", collection: "maintenance_tickets", dataMode: "live" },
    ];
    const plan = planMigrationDryRun({ records: withContent, backupRef: BACKUP });
    const report = formatMigrationDryRun(plan);

    expect(report).toContain("nothing was executed");
    expect(report).toContain("Test records to delete: 1");
    // A migration report circulates in packets; no customer value may ride along.
    for (const forbidden of ["@", "Tenant", "Street", "summary", "body"]) {
      expect(report).not.toContain(forbidden);
    }
  });

  it("says plainly that a refused plan planned nothing", () => {
    expect(formatMigrationDryRun(planMigrationDryRun({ records: CLEAN_SET }))).toMatch(
      /REFUSED .* Nothing was planned/s,
    );
  });

  it("never renders a private record id in refusal evidence", () => {
    const privateId = "private-id-sentinel";
    const refused = planMigrationDryRun({
      records: [record(privateId, "workflow_runs")],
      backupRef: BACKUP,
    });

    expect(formatMigrationDryRun(refused)).not.toContain(privateId);
    expect(() =>
      migrationRemovalSet(
        planMigrationDryRun({
          records: [record(privateId, "workflow_runs", "test")],
          backupRef: BACKUP,
        }),
        [
          record(privateId, "workflow_runs", "test"),
          record(privateId, "workflow_runs", "test"),
        ],
      ),
    ).toThrow(/workflow_runs contains a duplicate record/);
    try {
      migrationRemovalSet(
        planMigrationDryRun({
          records: [record(privateId, "workflow_runs", "test")],
          backupRef: BACKUP,
        }),
        [
          record(privateId, "workflow_runs", "test"),
          record(privateId, "workflow_runs", "test"),
        ],
      );
    } catch (error) {
      expect(String(error)).not.toContain(privateId);
    }
  });
});
