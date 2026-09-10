import { currentRentCorrectionKey } from "@/lib/lease-renewal/current-rent-correction";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  LEASE_RENEWAL_COLLECTIONS,
  resolutionDocId,
  resolveLeaseRenewalFlag,
} from "@/lib/firestore/lease-renewal-resolutions";
import {
  getSimulationRun,
  SIMULATION_RUN_ID,
} from "@/tests/helpers/lease-renewal-simulation";

type TestRecord = Record<string, unknown>;

interface TestSnapshot {
  exists: boolean;
  data: () => TestRecord | undefined;
  get: (field: string) => unknown;
}

interface TestDocumentRef {
  path: string;
  get: () => Promise<TestSnapshot>;
}

interface TestTransaction {
  get: (ref: TestDocumentRef) => Promise<TestSnapshot>;
  set: (ref: TestDocumentRef, data: TestRecord) => void;
}

/** Minimal transaction-capable harness for the resolution record + Activity twin. */
class ResolutionTestFirestore {
  readonly store = new Map<string, TestRecord>();

  collection(name: string) {
    return {
      doc: (id: string): TestDocumentRef => {
        const path = `${name}/${id}`;
        return {
          path,
          get: async () => {
            const record = this.store.get(path);
            return {
              exists: record !== undefined,
              data: () => (record ? structuredClone(record) : undefined),
              get: (field: string) => record?.[field],
            };
          },
        };
      },
    };
  }

  async runTransaction<T>(callback: (transaction: TestTransaction) => Promise<T>) {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, data) => {
        this.store.set(ref.path, resolveFirestoreSentinels(data) as TestRecord);
      },
    });
  }
}

function resolveFirestoreSentinels(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    value.constructor.name === "ServerTimestampTransform"
  ) {
    return "2026-07-10T12:00:00.000Z";
  }
  if (Array.isArray(value)) return value.map(resolveFirestoreSentinels);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveFirestoreSentinels(child),
      ]),
    );
  }
  return value;
}

const approver: AuthenticatedUser = {
  uid: "approver-1",
  email: "approver-1@example.com",
  hd: "example.com",
  role: "Approver",
};

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin-1@example.com",
  hd: "example.com",
  role: "Admin",
};

function simulationKey(fieldKey: string): string {
  const run = getSimulationRun(SIMULATION_RUN_ID);
  const key = run?.flags.find((flag) => flag.fieldKey === fieldKey)?.queueMapping
    ?.queueItem.source_trigger_key;
  if (!key) throw new Error(`Missing simulation key for ${fieldKey}.`);
  return key;
}

function simulationFingerprint(fieldKey: string): string {
  const run = getSimulationRun(SIMULATION_RUN_ID);
  const fingerprint = run?.flags.find(
    (flag) => flag.fieldKey === fieldKey,
  )?.candidateFingerprint;
  if (!fingerprint) throw new Error(`Missing simulation fingerprint for ${fieldKey}.`);
  return fingerprint;
}

const MEDIUM_KEY = simulationKey("inspections_cadence");
const HIGH_KEY = simulationKey("renewal_date");
const MEDIUM_FINGERPRINT = simulationFingerprint("inspections_cadence");
const HIGH_FINGERPRINT = simulationFingerprint("renewal_date");

describe("resolveLeaseRenewalFlag reason audit", () => {
  it("refuses an omitted Live resolver instead of falling back to fixture data", async () => {
    const db = new ResolutionTestFirestore();

    await expect(
      resolveLeaseRenewalFlag(
        approver,
        {
          run_id: SIMULATION_RUN_ID,
          source_trigger_key: MEDIUM_KEY,
          candidate_fingerprint: MEDIUM_FINGERPRINT,
          kind: "pick_source",
          chosen_source: "rentvine_building",
          reason_code: "accepted_suggestion",
        },
        db as unknown as Firestore,
      ),
    ).rejects.toThrow("A Live renewal run resolver is required.");
    expect(db.store.size).toBe(0);
  });

  it("stamps the code label verbatim on both the resolution and Activity twin", async () => {
    const db = new ResolutionTestFirestore();

    const resolution = await resolveLeaseRenewalFlag(
      approver,
      {
        run_id: SIMULATION_RUN_ID,
        source_trigger_key: MEDIUM_KEY,
        candidate_fingerprint: MEDIUM_FINGERPRINT,
        kind: "pick_source",
        chosen_source: "rentvine_building",
        reason_code: "accepted_suggestion",
      },
      db as unknown as Firestore,
      getSimulationRun,
    );

    expect(resolution).toMatchObject({
      source_trigger_key: MEDIUM_KEY,
      property_key: expect.any(String),
      severity: "Medium",
      reason_code: "accepted_suggestion",
      reason: "Accepted the suggested source",
      resolved_by_uid: "approver-1",
      candidate_fingerprint: expect.stringMatching(/^rcf1_[a-f0-9]{64}$/),
    });

    const record = db.store.get(
      `${LEASE_RENEWAL_COLLECTIONS.resolutions}/${resolutionDocId(MEDIUM_KEY)}`,
    );
    expect(record).toMatchObject({
      property_key: resolution.property_key,
      product_retention_policy: "product-record-retention:v1.0",
      product_retention_class: "indefinite",
      legal_hold: false,
      reason_code: "accepted_suggestion",
      reason: "Accepted the suggested source",
    });

    const activity = [...db.store.entries()]
      .filter(([path]) =>
        path.startsWith(`${LEASE_RENEWAL_COLLECTIONS.resolutionActivity}/`),
      )
      .map(([, entry]) => entry);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      source_trigger_key: MEDIUM_KEY,
      candidate_fingerprint: resolution.candidate_fingerprint,
      property_key: resolution.property_key,
      reason_code: "accepted_suggestion",
      reason: "Accepted the suggested source",
      actor_uid: "approver-1",
    });
  });

  it("preserves a legal hold across a full resolution rewrite", async () => {
    const db = new ResolutionTestFirestore();
    const input = {
      run_id: SIMULATION_RUN_ID,
      source_trigger_key: MEDIUM_KEY,
      candidate_fingerprint: MEDIUM_FINGERPRINT,
      kind: "pick_source" as const,
      chosen_source: "rentvine_building",
      reason_code: "accepted_suggestion" as const,
    };

    await resolveLeaseRenewalFlag(
      approver,
      input,
      db as unknown as Firestore,
      getSimulationRun,
    );
    const path = `${LEASE_RENEWAL_COLLECTIONS.resolutions}/${resolutionDocId(MEDIUM_KEY)}`;
    db.store.set(path, { ...db.store.get(path)!, legal_hold: true });

    await resolveLeaseRenewalFlag(
      approver,
      input,
      db as unknown as Firestore,
      getSimulationRun,
    );

    expect(db.store.get(path)).toMatchObject({
      product_retention_policy: "product-record-retention:v1.0",
      product_retention_class: "indefinite",
      legal_hold: true,
    });
  });

  it("preserves the Admin-only gate for High flags", async () => {
    const db = new ResolutionTestFirestore();

    await expect(
      resolveLeaseRenewalFlag(
        approver,
        {
          run_id: SIMULATION_RUN_ID,
          source_trigger_key: HIGH_KEY,
          candidate_fingerprint: HIGH_FINGERPRINT,
          kind: "pick_source",
          chosen_source: "rentvine",
          reason: "Confirmed against the signed lease.",
        },
        db as unknown as Firestore,
        getSimulationRun,
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: "High or Blocked flags can only be resolved by an Admin.",
    });

    await expect(
      resolveLeaseRenewalFlag(
        admin,
        {
          run_id: SIMULATION_RUN_ID,
          source_trigger_key: HIGH_KEY,
          candidate_fingerprint: HIGH_FINGERPRINT,
          kind: "pick_source",
          chosen_source: "rentvine",
          reason: "Confirmed against the signed lease.",
        },
        db as unknown as Firestore,
        getSimulationRun,
      ),
    ).resolves.toMatchObject({ status: "Resolved", resolved_by_uid: "admin-1" });
  });

  it("rejects render-to-POST source drift without persisting an unseen decision", async () => {
    const db = new ResolutionTestFirestore();
    const rendered = getSimulationRun(SIMULATION_RUN_ID)!;
    const drifted = structuredClone(rendered);
    const target = drifted.flags.find(
      (flag) => flag.queueMapping?.queueItem.source_trigger_key === MEDIUM_KEY,
    );
    if (!target) throw new Error("Missing drift target.");
    target.candidateFingerprint = `rcf1_${"f".repeat(64)}`;

    await expect(
      resolveLeaseRenewalFlag(
        approver,
        {
          run_id: SIMULATION_RUN_ID,
          source_trigger_key: MEDIUM_KEY,
          candidate_fingerprint: MEDIUM_FINGERPRINT,
          kind: "pick_source",
          chosen_source: "rentvine_building",
          reason_code: "accepted_suggestion",
        },
        db as unknown as Firestore,
        () => drifted,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/source facts changed/i),
    });
    expect(db.store.size).toBe(0);
  });
});

describe("S113 explicit correction of agreeing current sources", () => {
  it("persists an exact Admin correction without manufacturing an open conflict", async () => {
    const base = getSimulationRun(SIMULATION_RUN_ID)!;
    const original = base.outcomes.find((entry) => entry.fieldKey === "current_rent")!;
    const outcome = {
      ...original,
      queueMapping: null,
      matchedCandidateJoinIds: ["lease:81"],
      reconciliation: {
        ...original.reconciliation,
        agreement: "agree" as const,
        raise_flag: false,
      },
    };
    const run = {
      ...base,
      runId: "live-review",
      flags: [],
      queueItems: [],
      outcomes: [outcome],
    };
    const key = currentRentCorrectionKey(outcome, run.runId)!;
    const input = {
      run_id: run.runId,
      source_trigger_key: key,
      candidate_fingerprint: outcome.candidateFingerprint,
      kind: "corrected_value" as const,
      corrected_value: "1500.00",
      reason: "Reviewed current contract",
      intent: "current_fact_correction" as const,
    };
    const db = new ResolutionTestFirestore();
    await expect(
      resolveLeaseRenewalFlag(
        approver,
        input,
        db as unknown as Firestore,
        async () => run,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const saved = await resolveLeaseRenewalFlag(
      admin,
      input,
      db as unknown as Firestore,
      async () => run,
    );
    expect(saved).toMatchObject({
      source_trigger_key: key,
      severity: "High",
      corrected_value: "1500.00",
      proposed_writeback: { status: "Queued", production_allowed: false },
    });
    expect(run.flags).toEqual([]);
    expect(run.outcomes[0].reconciliation.agreement).toBe("agree");
    await expect(
      resolveLeaseRenewalFlag(
        admin,
        { ...input, candidate_fingerprint: "stale" },
        db as unknown as Firestore,
        async () => run,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      resolveLeaseRenewalFlag(
        admin,
        { ...input, intent: undefined },
        db as unknown as Firestore,
        async () => run,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("has no correction key for ambiguous joins or unrelated fields", () => {
    const original = getSimulationRun(SIMULATION_RUN_ID)!.outcomes[0];
    expect(
      currentRentCorrectionKey(
        {
          ...original,
          fieldKey: "current_rent",
          matchedCandidateJoinIds: ["lease:81", "lease:82"],
        },
        "live-review",
      ),
    ).toBeNull();
    expect(
      currentRentCorrectionKey(
        { ...original, fieldKey: "renewal_date", matchedCandidateJoinIds: ["lease:81"] },
        "live-review",
      ),
    ).toBeNull();
  });
});
