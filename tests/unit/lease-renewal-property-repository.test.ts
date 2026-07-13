import { describe, expect, it } from "vitest";

import type {
  LeaseRenewalResolutionActivityRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
} from "@/lib/firestore/types";
import { deriveAddressKey } from "@/lib/lease-renewal/join";
import {
  runRenewalPipeline,
  type NonSheetCandidate,
  type RenewalRunResult,
} from "@/lib/lease-renewal/pipeline";
import {
  buildPropertyActivity,
  buildRunPropertyKeyIndex,
  getPropertyActivity,
  listRunPropertyKeys,
  type PropertyRunActivity,
} from "@/lib/lease-renewal/property-repository";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";

// Reuse the exact Property Attributes header row so ingest classifies this grid as that tab (which is
// where the address-joined lawn_care + utilities_needed specs apply). Two properties, one per row.
const PROPERTY_ATTRIBUTES_GRID: string[][] = [
  [
    "Property",
    "Unit",
    "Updated to Kwickset Smart Locks",
    "Utilities Needed",
    "Lawn Care",
    "Inspections",
    "Appliances provided",
    "",
    "Notes",
  ],
  [
    "100 Birchwood Ln",
    "1",
    "yes",
    "Tenant pays",
    "Tenant",
    "1 per year",
    "Fridge",
    "TRUE",
    "a",
  ],
  [
    "2200 Elmgrove",
    "2",
    "yes",
    "Tenant pays",
    "Tenant",
    "1 per year",
    "Fridge",
    "TRUE",
    "b",
  ],
];

const RUN_ID = "prop-run";
const BIRCHWOOD_KEY = deriveAddressKey("100 Birchwood Ln").key;
const ELMGROVE_KEY = deriveAddressKey("2200 Elmgrove").key;

function buildRun(candidates: NonSheetCandidate[]): RenewalRunResult {
  return runRenewalPipeline({
    runId: RUN_ID,
    tables: [PROPERTY_ATTRIBUTES_GRID],
    nonSheetCandidates: candidates,
  });
}

function keyForField(
  run: RenewalRunResult,
  fieldKey: string,
  propertyKey: string,
): string {
  const flag = run.flags.find(
    (outcome) => outcome.fieldKey === fieldKey && outcome.propertyKey === propertyKey,
  );
  if (!flag?.queueMapping) {
    throw new Error(`no ${fieldKey} flag for ${propertyKey}`);
  }
  return flag.queueMapping.queueItem.source_trigger_key;
}

function resolutionActivity(
  sourceTriggerKey: string,
  overrides: Partial<LeaseRenewalResolutionActivityRecord> = {},
): LeaseRenewalResolutionActivityRecord {
  return {
    id: `r-${sourceTriggerKey}`,
    source_trigger_key: sourceTriggerKey,
    run_id: RUN_ID,
    actor_uid: "user-1",
    action: "pick_source",
    new_status: "Resolved",
    reason: "operator decision",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function approvalActivity(
  sourceTriggerKey: string,
  overrides: Partial<LeaseRenewalWritebackApprovalActivityRecord> = {},
): LeaseRenewalWritebackApprovalActivityRecord {
  return {
    id: `a-${sourceTriggerKey}`,
    source_trigger_key: sourceTriggerKey,
    run_id: RUN_ID,
    actor_uid: "user-2",
    action: "approve",
    new_state: "Approved",
    reason: "authorized",
    created_at: "2026-07-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("property-repository (per-property lease-renewal decision repository)", () => {
  it("A: two properties raising DIFFERENT address-fields attribute 1:1 with no cross-property bleed", () => {
    // 100 Birchwood raises lawn_care; 2200 Elmgrove raises utilities_needed. Distinct run+field keys.
    const run = buildRun([
      {
        source: "rentvine_building",
        source_system: "Rentvine (building)",
        joinKind: "address",
        joinValue: "100 Birchwood Ln",
        fields: { lawn_care: { value: "Landlord" } },
      },
      {
        source: "rentvine_building",
        source_system: "Rentvine (building)",
        joinKind: "address",
        joinValue: "2200 Elmgrove",
        fields: { utilities_needed: { value: "Owner pays" } },
      },
    ]);

    // The pipeline populates propertyKey only for the address-joined specs, distinct per property.
    const lawnKey = keyForField(run, "lawn_care", BIRCHWOOD_KEY);
    const utilKey = keyForField(run, "utilities_needed", ELMGROVE_KEY);
    expect(lawnKey).not.toBe(utilKey);
    expect(BIRCHWOOD_KEY).not.toBe(ELMGROVE_KEY);

    // The per-run index attributes each key to exactly one property (never both).
    const index = buildRunPropertyKeyIndex(run);
    expect(index.get(lawnKey)).toBe(BIRCHWOOD_KEY);
    expect(index.get(utilKey)).toBe(ELMGROVE_KEY);
    expect(listRunPropertyKeys(run).sort()).toEqual([BIRCHWOOD_KEY, ELMGROVE_KEY].sort());
    const view = buildRenewalRunView(run, [], "Property run");
    const viewKeys = view.groups.flatMap((group) =>
      group.flags.flatMap((flag) => (flag.propertyKey ? [flag.propertyKey] : [])),
    );
    expect(viewKeys).toContain(BIRCHWOOD_KEY);
    expect(viewKeys).toContain(ELMGROVE_KEY);

    const runs: PropertyRunActivity[] = [
      {
        run,
        resolutionActivity: [
          resolutionActivity(lawnKey, {
            actor_uid: "operator-A",
            reason: "chose the building read",
          }),
        ],
        approvalActivity: [
          approvalActivity(utilKey, {
            actor_uid: "operator-B",
            reason: "authorized utilities write",
          }),
        ],
      },
    ];

    const buckets = buildPropertyActivity(runs);
    expect(buckets).toHaveLength(2);

    const birchwood = getPropertyActivity(runs, BIRCHWOOD_KEY);
    const elmgrove = getPropertyActivity(runs, ELMGROVE_KEY);
    expect(birchwood).not.toBeNull();
    expect(elmgrove).not.toBeNull();

    // 1:1 attribution.
    expect(birchwood!.resolutionCount).toBe(1);
    expect(birchwood!.approvalCount).toBe(0);
    expect(birchwood!.entries).toHaveLength(1);
    expect(birchwood!.entries[0].actorUid).toBe("operator-A");

    expect(elmgrove!.resolutionCount).toBe(0);
    expect(elmgrove!.approvalCount).toBe(1);
    expect(elmgrove!.entries).toHaveLength(1);
    expect(elmgrove!.entries[0].actorUid).toBe("operator-B");

    // NO cross-property bleed: neither property carries the other property's decision.
    expect(JSON.stringify(birchwood!.entries)).not.toContain("operator-B");
    expect(JSON.stringify(birchwood!.entries)).not.toContain(
      "authorized utilities write",
    );
    expect(JSON.stringify(elmgrove!.entries)).not.toContain("operator-A");
    expect(JSON.stringify(elmgrove!.entries)).not.toContain("chose the building read");
  });

  it("B: two properties raising the SAME field share one run+field key and attribute to NEITHER", () => {
    // Both properties raise lawn_care -> both flags carry source_trigger_key
    // `lease_renewal:reconcile:prop-run:lawn_care` but DIFFERENT propertyKeys: a collision.
    const run = buildRun([
      {
        source: "rentvine_building",
        source_system: "Rentvine (building)",
        joinKind: "address",
        joinValue: "100 Birchwood Ln",
        fields: { lawn_care: { value: "Landlord" } },
      },
      {
        source: "rentvine_building",
        source_system: "Rentvine (building)",
        joinKind: "address",
        joinValue: "2200 Elmgrove",
        fields: { lawn_care: { value: "Owner" } },
      },
    ]);

    const lawnFlags = run.flags.filter((outcome) => outcome.fieldKey === "lawn_care");
    expect(lawnFlags).toHaveLength(2);
    const sharedKey = lawnFlags[0].queueMapping!.queueItem.source_trigger_key;
    // Same run+field key, but the two flags belong to two different properties.
    expect(lawnFlags[1].queueMapping!.queueItem.source_trigger_key).toBe(sharedKey);
    expect(lawnFlags[0].propertyKey).not.toBe(lawnFlags[1].propertyKey);

    // The index marks the collided key ambiguous (null) so its Activity is attributed to no one.
    const index = buildRunPropertyKeyIndex(run);
    expect(index.get(sharedKey)).toBeNull();
    expect(listRunPropertyKeys(run)).toEqual([]);
    expect(
      buildRenewalRunView(run, [], "Ambiguous run").groups.flatMap((group) =>
        group.flags.flatMap((flag) => (flag.propertyKey ? [flag.propertyKey] : [])),
      ),
    ).toEqual([]);

    const runs: PropertyRunActivity[] = [
      {
        run,
        resolutionActivity: [resolutionActivity(sharedKey, { actor_uid: "operator-C" })],
        approvalActivity: [approvalActivity(sharedKey, { actor_uid: "operator-D" })],
      },
    ];

    // Attributed to NEITHER property: no bucket is produced, and each property lookup is null.
    expect(buildPropertyActivity(runs)).toEqual([]);
    expect(getPropertyActivity(runs, BIRCHWOOD_KEY)).toBeNull();
    expect(getPropertyActivity(runs, ELMGROVE_KEY)).toBeNull();
  });

  it("C: each surfaced entry is value-free — exactly {action, actorUid, reason, timestamp}, no leak", () => {
    const run = buildRun([
      {
        source: "rentvine_building",
        source_system: "Rentvine (building)",
        joinKind: "address",
        joinValue: "100 Birchwood Ln",
        fields: { lawn_care: { value: "Landlord" } },
      },
    ]);
    const lawnKey = keyForField(run, "lawn_care", BIRCHWOOD_KEY);

    const runs: PropertyRunActivity[] = [
      {
        run,
        resolutionActivity: [
          resolutionActivity(lawnKey, {
            actor_uid: "operator-A",
            reason: "chose the building read",
            // Fields that MUST NOT be copied onto the value-free entry:
            previous_status: "Open",
            new_status: "Resolved",
            reason_code: "stale_source",
          }),
        ],
        approvalActivity: [],
      },
    ];

    const bucket = getPropertyActivity(runs, BIRCHWOOD_KEY);
    expect(bucket).not.toBeNull();
    const entry = bucket!.entries[0];

    // Sentinel: the entry key-set is EXACTLY these four keys, nothing more.
    expect(Object.keys(entry).sort()).toEqual([
      "action",
      "actorUid",
      "reason",
      "timestamp",
    ]);
    expect(entry).toEqual({
      action: "pick_source",
      actorUid: "operator-A",
      reason: "chose the building read",
      timestamp: "2026-07-01T00:00:00.000Z",
    });

    // No address / field-key / value / status / reason_code leak onto the entry.
    const serialized = JSON.stringify(entry);
    for (const forbidden of [
      "100 Birchwood Ln",
      BIRCHWOOD_KEY,
      "lawn_care",
      "Landlord",
      "Tenant",
      "prop-run",
      "Resolved",
      "Open",
      "stale_source",
      "source_trigger_key",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
