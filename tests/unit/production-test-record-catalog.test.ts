import { describe, expect, it } from "vitest";

import {
  PRODUCTION_TEST_RECORD_CATALOG,
  classifyProductionTestRecord,
  findProductionTestRecordDescriptor,
  type FirestoreRestFields,
  type FirestoreRestValue,
  type ProductionTestRecordDescriptor,
} from "@/lib/operations/production-test-record-catalog";

const SNAKE_ROOT_COLLECTIONS = [
  "approval_queue_items",
  "maintenance_tickets",
  "maintenance_test_action_receipts",
  "vendor_ticket_assignments",
  "maintenance_unverified_intake",
  "maintenance_unverified_intake_activity",
  "maintenance_intake_nonce",
  "maintenance_intake_rate_counter",
  "lease_renewal_test_runs",
  "lease_renewal_test_action_attempts",
  "lease_renewal_test_action_receipts",
  "lease_renewal_test_business_events",
  "publication_policies",
  "publication_policy_audit",
  "publication_resources",
  "publication_versions",
  "publication_audit",
  "audit_test_publication_capture_tasks",
  "audit_test_publication_continuations",
  "vendors",
  "vendor_ticket_thread_links",
  "vendor_test_mailboxes",
  "vendor_test_mailbox_confirmations",
  "external_action_execution_audit",
] as const;

const CAMEL_ROOT_COLLECTIONS = [
  "vendor_mailbox_connections",
  "external_action_executions",
  "gmail_label_effects",
] as const;

const lane = (value: unknown): FirestoreRestValue => ({ stringValue: value });
const testBoolean = (value: unknown): FirestoreRestValue => ({ booleanValue: value });
const map = (fields: FirestoreRestFields): FirestoreRestValue => ({
  mapValue: { fields },
});

function requiredDescriptor(collection: string): ProductionTestRecordDescriptor {
  const result = findProductionTestRecordDescriptor(collection);
  if (!result) throw new Error(`Missing test descriptor for ${collection}.`);
  return result;
}

describe("Production Test persisted-marker catalog", () => {
  it("pins all 28 roots, their exact marker paths, and a unique name per descriptor", () => {
    expect(PRODUCTION_TEST_RECORD_CATALOG).toHaveLength(28);
    expect(
      PRODUCTION_TEST_RECORD_CATALOG.filter(({ root }) => root.path === "data_mode").map(
        ({ collection }) => collection,
      ),
    ).toEqual(SNAKE_ROOT_COLLECTIONS);
    expect(
      PRODUCTION_TEST_RECORD_CATALOG.filter(({ root }) => root.path === "dataMode").map(
        ({ collection }) => collection,
      ),
    ).toEqual(CAMEL_ROOT_COLLECTIONS);
    expect(
      PRODUCTION_TEST_RECORD_CATALOG.filter(({ root }) => root.path === "is_test_run"),
    ).toMatchObject([
      {
        collection: "workflow_runs",
        root: { path: "is_test_run", kind: "test-boolean" },
      },
    ]);
    expect(
      new Set(PRODUCTION_TEST_RECORD_CATALOG.map(({ collection }) => collection)).size,
    ).toBe(28);
  });

  it("pins the three lifecycle-optional secondary paths to their owning roots", () => {
    expect(
      PRODUCTION_TEST_RECORD_CATALOG.filter(
        ({ secondaryPaths }) => secondaryPaths.length > 0,
      ).map(({ collection, secondaryPaths }) => ({ collection, secondaryPaths })),
    ).toEqual([
      {
        collection: "lease_renewal_test_runs",
        secondaryPaths: ["move_out_handoff.data_mode"],
      },
      {
        collection: "external_action_executions",
        secondaryPaths: ["receipt.dataMode"],
      },
      {
        collection: "workflow_runs",
        secondaryPaths: ["source_publication_pin.data_mode"],
      },
    ]);
  });

  it("pins the two mixed-root exceptions and the three product-retention roots", () => {
    expect(
      PRODUCTION_TEST_RECORD_CATALOG.filter(
        ({ missingRoot }) => missingRoot === "known-mixed-nonlane",
      ).map(({ collection }) => collection),
    ).toEqual(["maintenance_unverified_intake_activity", "publication_policy_audit"]);
    expect(
      PRODUCTION_TEST_RECORD_CATALOG.filter(
        ({ retention }) => retention === "product-record",
      ).map(({ collection }) => collection),
    ).toEqual(["approval_queue_items", "maintenance_tickets", "workflow_runs"]);
  });

  it("is deeply frozen so runtime code cannot widen deletion scope", () => {
    const first = PRODUCTION_TEST_RECORD_CATALOG[0];
    expect(Object.isFrozen(PRODUCTION_TEST_RECORD_CATALOG)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.root)).toBe(true);
    expect(Object.isFrozen(first.secondaryPaths)).toBe(true);
  });
});

describe("authoritative Firestore REST marker classification", () => {
  it("classifies exact string and boolean wire values", () => {
    const snake = requiredDescriptor("maintenance_tickets");
    const camel = requiredDescriptor("gmail_label_effects");
    const boolean = requiredDescriptor("workflow_runs");

    expect(
      classifyProductionTestRecord(snake, { data_mode: lane("live") }),
    ).toMatchObject({
      classification: "live",
      markerPath: "data_mode",
      markerValue: "live",
      refusalCode: null,
    });
    expect(classifyProductionTestRecord(camel, { dataMode: lane("test") })).toMatchObject(
      {
        classification: "test",
        markerPath: "dataMode",
        markerValue: "test",
        refusalCode: null,
      },
    );
    expect(
      classifyProductionTestRecord(boolean, { is_test_run: testBoolean(true) }),
    ).toMatchObject({ classification: "test", markerValue: true });
    expect(
      classifyProductionTestRecord(boolean, { is_test_run: testBoolean(false) }),
    ).toMatchObject({ classification: "live", markerValue: false });
  });

  it("never defaults an absent root to Live", () => {
    for (const descriptor of PRODUCTION_TEST_RECORD_CATALOG.filter(
      ({ missingRoot }) => missingRoot === "refuse",
    )) {
      expect(classifyProductionTestRecord(descriptor, {})).toMatchObject({
        classification: "refused",
        refusalCode: "missing_authoritative_marker",
        refusalPath: descriptor.root.path,
      });
    }
  });

  it("reports only the two documented unmarked mixed rows without granting a lane", () => {
    for (const collection of [
      "maintenance_unverified_intake_activity",
      "publication_policy_audit",
    ]) {
      expect(classifyProductionTestRecord(requiredDescriptor(collection), {})).toEqual({
        classification: "known_mixed_unmarked",
        markerPath: "data_mode",
        markerValue: null,
        refusalCode: null,
        refusalPath: null,
      });
    }
  });

  it("refuses malformed, coerced, case-shifted, and multi-typed authoritative values", () => {
    const descriptor = requiredDescriptor("maintenance_tickets");
    for (const value of [
      lane("TEST"),
      lane(""),
      lane(null),
      testBoolean(true),
      { stringValue: "test", booleanValue: true },
      "test",
      null,
    ]) {
      expect(
        classifyProductionTestRecord(descriptor, {
          data_mode: value as FirestoreRestValue,
        }),
      ).toMatchObject({
        classification: "refused",
        refusalCode: "malformed_authoritative_marker",
      });
    }
  });

  it("does not substitute an alternate alias when the authoritative root is absent", () => {
    expect(
      classifyProductionTestRecord(requiredDescriptor("publication_policy_audit"), {
        dataMode: lane("test"),
      }),
    ).toMatchObject({
      classification: "refused",
      refusalCode: "unexpected_alias_without_authoritative_marker",
      refusalPath: "dataMode",
    });
  });
});

describe("redundant marker consistency", () => {
  it("allows agreeing aliases and refuses malformed or contradictory aliases", () => {
    const descriptor = requiredDescriptor("maintenance_tickets");
    expect(
      classifyProductionTestRecord(descriptor, {
        data_mode: lane("test"),
        dataMode: lane("test"),
        is_test_run: testBoolean(true),
      }).classification,
    ).toBe("test");
    expect(
      classifyProductionTestRecord(descriptor, {
        data_mode: lane("test"),
        dataMode: lane("live"),
      }),
    ).toMatchObject({
      classification: "refused",
      refusalCode: "conflicting_alias_marker",
      refusalPath: "dataMode",
    });
    expect(
      classifyProductionTestRecord(descriptor, {
        data_mode: lane("test"),
        is_test_run: lane("test"),
      }),
    ).toMatchObject({
      classification: "refused",
      refusalCode: "malformed_alias_marker",
      refusalPath: "is_test_run",
    });
  });

  it("allows absent or agreeing lifecycle secondaries and refuses contradictions", () => {
    const run = requiredDescriptor("workflow_runs");
    const fields = { is_test_run: testBoolean(true) };
    expect(classifyProductionTestRecord(run, fields).classification).toBe("test");
    expect(
      classifyProductionTestRecord(run, {
        ...fields,
        source_publication_pin: { mapValue: {} },
      }).classification,
    ).toBe("test");
    expect(
      classifyProductionTestRecord(run, {
        ...fields,
        source_publication_pin: map({ data_mode: lane("test") }),
      }).classification,
    ).toBe("test");
    expect(
      classifyProductionTestRecord(run, {
        ...fields,
        source_publication_pin: map({ data_mode: lane("live") }),
      }),
    ).toMatchObject({
      classification: "refused",
      refusalCode: "conflicting_secondary_marker",
      refusalPath: "source_publication_pin.data_mode",
    });
  });

  it("refuses malformed secondary leaves and malformed intermediate maps", () => {
    const execution = requiredDescriptor("external_action_executions");
    for (const receipt of [
      map({ dataMode: testBoolean(true) }),
      { stringValue: "test" },
      { mapValue: { fields: "not-a-fields-map" } },
    ]) {
      expect(
        classifyProductionTestRecord(execution, {
          dataMode: lane("test"),
          receipt: receipt as FirestoreRestValue,
        }),
      ).toMatchObject({
        classification: "refused",
        refusalCode: "malformed_secondary_marker",
        refusalPath: "receipt.dataMode",
      });
    }
  });

  it("pins every secondary path to lane-string semantics", () => {
    for (const descriptor of PRODUCTION_TEST_RECORD_CATALOG.filter(
      ({ secondaryPaths }) => secondaryPaths.length > 0,
    )) {
      const rootValue =
        descriptor.root.kind === "lane-string" ? lane("test") : testBoolean(true);
      const [container, leaf] = descriptor.secondaryPaths[0].split(".");
      expect(
        classifyProductionTestRecord(descriptor, {
          [descriptor.root.path]: rootValue,
          [container]: map({ [leaf]: lane("test") }),
        }).classification,
      ).toBe("test");
    }
  });
});
