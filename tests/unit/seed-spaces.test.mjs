import { describe, expect, it } from "vitest";
import {
  buildSpaceRecords,
  parseSeedSpacesArgs,
  readJsonMap,
  readSpaceSeedDefinitions,
  seedSpaces,
} from "../../scripts/seed-spaces.mjs";

function createFakeDb(existingDocs = {}) {
  const writes = [];

  return {
    writes,
    collection(collectionName) {
      return {
        doc(id) {
          const key = `${collectionName}/${id}`;

          return {
            async get() {
              const data = existingDocs[key];
              return {
                exists: data !== undefined,
                data: () => data,
              };
            },
            async set(data, options) {
              writes.push({ key, data, options });
            },
          };
        },
      };
    },
  };
}

describe("seed-spaces args", () => {
  it("parses dry-run and force flags", () => {
    expect(parseSeedSpacesArgs([])).toEqual({ dryRun: false, force: false });
    expect(parseSeedSpacesArgs(["--dry-run"])).toEqual({ dryRun: true, force: false });
    expect(parseSeedSpacesArgs(["--force"])).toEqual({ dryRun: false, force: true });
  });
});

describe("seed-spaces record builder", () => {
  it("builds records with canonical SOP ids and env-map lookups", () => {
    const records = buildSpaceRecords(
      [{ id: "lease-renewals", name: "Lease Renewals", read_only: false }],
      {
        driveFolderIds: { "lease-renewals": "drive-123" },
        vertexDataStoreIds: { "lease-renewals": "store-456" },
        now: "2026-06-11T00:00:00.000Z",
      },
    );

    expect(records).toEqual([
      {
        collection: "spaces",
        id: "lease-renewals",
        data: {
          id: "lease-renewals",
          name: "Lease Renewals",
          read_only: false,
          canonical_sop_id: "lease-renewals-sop",
          created_at: "2026-06-11T00:00:00.000Z",
          drive_folder_id: "drive-123",
          vertex_data_store_id: "store-456",
        },
      },
    ]);
  });

  it("defaults missing env-map entries to empty strings", () => {
    const [record] = buildSpaceRecords([{ id: "move-in", name: "Move-In" }]);

    expect(record.data.drive_folder_id).toBe("");
    expect(record.data.vertex_data_store_id).toBe("");
  });

  it("reads the checked-in seed definitions", () => {
    const definitions = readSpaceSeedDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    expect(definitions.map((space) => space.id)).toContain("lease-renewals");
    expect(definitions.find((space) => space.id === "owner-email")?.read_only).toBe(true);
  });
});

describe("seed-spaces idempotency", () => {
  it("creates missing space documents", async () => {
    const db = createFakeDb();
    const results = await seedSpaces({ db, now: "2026-06-11T00:00:00.000Z" });

    expect(results.every((result) => result.action === "created")).toBe(true);
    expect(db.writes.length).toBe(results.length);
    expect(db.writes[0].options).toEqual({ merge: true });
  });

  it("skips existing documents unless --force is set", async () => {
    const db = createFakeDb({
      "spaces/lease-renewals": {
        id: "lease-renewals",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const results = await seedSpaces({ db, now: "2026-06-11T00:00:00.000Z" });
    const leaseRenewals = results.find((result) => result.id === "lease-renewals");

    expect(leaseRenewals.action).toBe("skipped");
    expect(db.writes.some((write) => write.key === "spaces/lease-renewals")).toBe(false);
  });

  it("preserves created_at when forcing an update", async () => {
    const db = createFakeDb({
      "spaces/lease-renewals": {
        id: "lease-renewals",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });

    const results = await seedSpaces({
      db,
      force: true,
      now: "2026-06-11T00:00:00.000Z",
    });
    const leaseRenewals = results.find((result) => result.id === "lease-renewals");
    const write = db.writes.find((entry) => entry.key === "spaces/lease-renewals");

    expect(leaseRenewals.action).toBe("updated");
    expect(write.data.created_at).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("seed-spaces env maps", () => {
  it("parses JSON maps with string values", () => {
    expect(readJsonMap('{"lease-renewals":"abc"}')).toEqual({
      "lease-renewals": "abc",
    });
    expect(readJsonMap("")).toEqual({});
    expect(readJsonMap(undefined)).toEqual({});
  });

  it("rejects non-object or non-string-valued maps", () => {
    expect(() => readJsonMap('["a"]')).toThrow();
    expect(() => readJsonMap('{"a":1}')).toThrow();
  });
});
