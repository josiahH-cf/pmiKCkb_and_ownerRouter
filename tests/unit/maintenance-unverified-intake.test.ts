import { describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

import {
  createUnverifiedIntakeFromPublic,
  IntakeDailyCapError,
  IntakeReplayError,
  IntakeRevokedError,
  IntakeValidationError,
  MAINTENANCE_INTAKE_COLLECTIONS,
  type PublicIntakeSubmission,
} from "@/lib/firestore/maintenance-unverified-intake";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

const NOW = Date.parse("2026-07-09T12:00:00.000Z");
const DAY = "2026-07-09";

function submission(
  overrides: Partial<PublicIntakeSubmission> = {},
): PublicIntakeSubmission {
  return {
    propertyKey: "prop-1",
    jti: "jti-1",
    tokenEpoch: 0,
    singleUse: true,
    summary: "Leaky faucet",
    description: "Kitchen sink drips overnight",
    contact: "tenant@example.com",
    ipHash: "iphash-abc",
    dailyCap: 500,
    ...overrides,
  };
}

function run(db: FakeFirestore, sub: PublicIntakeSubmission) {
  return createUnverifiedIntakeFromPublic(sub, db as unknown as Firestore, NOW);
}

function intakeDocs(db: FakeFirestore) {
  return [...db.store.entries()].filter(([path]) =>
    path.startsWith(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/`),
  );
}

describe("createUnverifiedIntakeFromPublic", () => {
  it("writes a quarantined intake + activity + nonce + counter atomically", async () => {
    const db = new FakeFirestore();
    const { id } = await run(db, submission());

    const record = db.store.get(`${MAINTENANCE_INTAKE_COLLECTIONS.intake}/${id}`);
    expect(record).toMatchObject({
      status: "unverified",
      source: "public-link",
      property_key: "prop-1",
      summary: "Leaky faucet",
      reporter_kind: "external",
      ip_hash: "iphash-abc",
    });

    expect(db.store.has(`${MAINTENANCE_INTAKE_COLLECTIONS.nonce}/jti-1`)).toBe(true);
    const counter = db.store.get(
      `${MAINTENANCE_INTAKE_COLLECTIONS.rateCounter}/prop-1__${DAY}`,
    );
    expect(counter).toMatchObject({ property_key: "prop-1", day: DAY, count: 1 });
  });

  it("rejects a replayed single-use token (nonce already present)", async () => {
    const db = new FakeFirestore();
    db.seed(`${MAINTENANCE_INTAKE_COLLECTIONS.nonce}/jti-1`, { jti: "jti-1" });
    await expect(run(db, submission())).rejects.toBeInstanceOf(IntakeReplayError);
    // Nothing new was written.
    expect(intakeDocs(db)).toHaveLength(0);
  });

  it("allows a reusable token to be used more than once (no nonce check)", async () => {
    const db = new FakeFirestore();
    await run(db, submission({ singleUse: false, jti: "reusable-1" }));
    await run(db, submission({ singleUse: false, jti: "reusable-1" }));
    expect(intakeDocs(db)).toHaveLength(2);
    // Reusable tokens do not write a nonce.
    expect(db.store.has(`${MAINTENANCE_INTAKE_COLLECTIONS.nonce}/reusable-1`)).toBe(
      false,
    );
  });

  it("enforces the per-property daily cap (503 ceiling)", async () => {
    const db = new FakeFirestore();
    db.seed(`${MAINTENANCE_INTAKE_COLLECTIONS.rateCounter}/prop-1__${DAY}`, {
      property_key: "prop-1",
      day: DAY,
      count: 2,
    });
    await expect(run(db, submission({ dailyCap: 2 }))).rejects.toBeInstanceOf(
      IntakeDailyCapError,
    );
    expect(intakeDocs(db)).toHaveLength(0);
  });

  it("rejects a token minted before the property's revocation epoch advanced", async () => {
    const db = new FakeFirestore();
    db.seed(`${MAINTENANCE_INTAKE_COLLECTIONS.epoch}/prop-1`, {
      property_key: "prop-1",
      epoch: 3,
    });
    await expect(run(db, submission({ tokenEpoch: 0 }))).rejects.toBeInstanceOf(
      IntakeRevokedError,
    );
    expect(intakeDocs(db)).toHaveLength(0);
  });

  it("sanitizes fields and rejects an empty summary", async () => {
    const db = new FakeFirestore();
    await expect(run(db, submission({ summary: "   " }))).rejects.toBeInstanceOf(
      IntakeValidationError,
    );
    expect(intakeDocs(db)).toHaveLength(0);
  });

  it("rejects an invalid propertyKey", async () => {
    const db = new FakeFirestore();
    await expect(
      run(db, submission({ propertyKey: "../escape" })),
    ).rejects.toBeInstanceOf(IntakeValidationError);
  });
});
