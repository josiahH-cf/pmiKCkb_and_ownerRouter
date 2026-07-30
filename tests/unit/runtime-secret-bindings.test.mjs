import { describe, expect, it } from "vitest";

import {
  MAINTENANCE_INTAKE_MIN_SECRET_BYTES,
  MAINTENANCE_INTAKE_RUNTIME_SECRET_NAMES,
  resolveMaintenanceIntakeSecretBindings,
  validateMaintenanceIntakeRuntimeValues,
} from "../../scripts/runtime-secret-bindings.mjs";

const completeRefs = {
  MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID: "fixture-intake-token",
  MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID: "fixture-intake-ip-salt",
};

describe("maintenance intake runtime secret bindings", () => {
  it("separates deployed runtime-value health from deploy-source reference validation", () => {
    const token = "t".repeat(MAINTENANCE_INTAKE_MIN_SECRET_BYTES);
    const salt = "s".repeat(MAINTENANCE_INTAKE_MIN_SECRET_BYTES);

    expect(
      validateMaintenanceIntakeRuntimeValues({
        MAINTENANCE_INTAKE_TOKEN_SECRET: token,
        MAINTENANCE_INTAKE_IP_HASH_SALT: salt,
      }),
    ).toEqual({ configured: true, errors: [], ok: true });
    expect(
      resolveMaintenanceIntakeSecretBindings({
        MAINTENANCE_INTAKE_TOKEN_SECRET: token,
        MAINTENANCE_INTAKE_IP_HASH_SALT: salt,
      }).ok,
    ).toBe(false);
  });

  it("keeps runtime inert with neither value and refuses partial, weak, or reused values", () => {
    expect(validateMaintenanceIntakeRuntimeValues({})).toEqual({
      configured: false,
      errors: [],
      ok: true,
    });

    const strong = "x".repeat(MAINTENANCE_INTAKE_MIN_SECRET_BYTES);
    for (const env of [
      { MAINTENANCE_INTAKE_TOKEN_SECRET: strong },
      {
        MAINTENANCE_INTAKE_TOKEN_SECRET: "short",
        MAINTENANCE_INTAKE_IP_HASH_SALT: strong,
      },
      {
        MAINTENANCE_INTAKE_TOKEN_SECRET: strong,
        MAINTENANCE_INTAKE_IP_HASH_SALT: "short",
      },
      {
        MAINTENANCE_INTAKE_TOKEN_SECRET: strong,
        MAINTENANCE_INTAKE_IP_HASH_SALT: strong,
      },
    ]) {
      const result = validateMaintenanceIntakeRuntimeValues(env);
      expect(result.ok, JSON.stringify(env)).toBe(false);
      expect(result.configured, JSON.stringify(env)).toBe(false);
      expect(result.errors.length, JSON.stringify(env)).toBeGreaterThan(0);
      expect(JSON.stringify(result), JSON.stringify(env)).not.toContain(strong);
    }
  });

  it("stays intentionally inert when no Secret Manager refs are configured", () => {
    expect(resolveMaintenanceIntakeSecretBindings({})).toEqual({
      bindings: {},
      configured: false,
      errors: [],
      ok: true,
    });
  });

  it("binds the exact pair together and defaults each version to latest", () => {
    const result = resolveMaintenanceIntakeSecretBindings(completeRefs);

    expect(Object.keys(result.bindings).sort()).toEqual(
      [...MAINTENANCE_INTAKE_RUNTIME_SECRET_NAMES].sort(),
    );
    expect(result).toEqual({
      bindings: {
        MAINTENANCE_INTAKE_TOKEN_SECRET: "fixture-intake-token:latest",
        MAINTENANCE_INTAKE_IP_HASH_SALT: "fixture-intake-ip-salt:latest",
      },
      configured: true,
      errors: [],
      ok: true,
    });
  });

  it("refuses either partial id pair and a version without its id", () => {
    for (const env of [
      { MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID: "fixture-intake-token" },
      { MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID: "fixture-intake-ip-salt" },
      { MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_VERSION: "7" },
    ]) {
      const result = resolveMaintenanceIntakeSecretBindings(env);
      expect(result.ok, JSON.stringify(env)).toBe(false);
      expect(result.bindings, JSON.stringify(env)).toEqual({});
      expect(result.errors.join(" "), JSON.stringify(env)).toContain(
        "requires both MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID",
      );
    }
  });

  it("refuses one Secret Manager secret reused for both runtime values", () => {
    for (const env of [
      {
        MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID: "fixture-shared-secret",
        MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID: "fixture-shared-secret",
      },
      {
        MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID: "fixture-shared-secret",
        MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_VERSION: "1",
        MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID: "fixture-shared-secret",
        MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_VERSION: "2",
      },
    ]) {
      const result = resolveMaintenanceIntakeSecretBindings(env);

      expect(result.ok, JSON.stringify(env)).toBe(false);
      expect(result.bindings, JSON.stringify(env)).toEqual({});
      expect(result.errors, JSON.stringify(env)).toEqual([
        expect.stringContaining("distinct Secret Manager secret ids"),
      ]);
    }
  });

  it("refuses plaintext-only deploy configuration without exposing either value", () => {
    const token = "plaintext-token-sentinel";
    const salt = "plaintext-salt-sentinel";
    const result = resolveMaintenanceIntakeSecretBindings({
      MAINTENANCE_INTAKE_TOKEN_SECRET: token,
      MAINTENANCE_INTAKE_IP_HASH_SALT: salt,
    });
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(false);
    expect(result.bindings).toEqual({});
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(salt);
  });

  it("ignores plaintext values when the complete non-secret ref pair is present", () => {
    const token = "plaintext-token-sentinel";
    const salt = "plaintext-salt-sentinel";
    const result = resolveMaintenanceIntakeSecretBindings({
      ...completeRefs,
      MAINTENANCE_INTAKE_TOKEN_SECRET: token,
      MAINTENANCE_INTAKE_IP_HASH_SALT: salt,
    });
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(true);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(salt);
    expect(result.bindings.MAINTENANCE_INTAKE_TOKEN_SECRET).toBe(
      "fixture-intake-token:latest",
    );
  });

  it("refuses unsafe ids and versions before command construction", () => {
    const result = resolveMaintenanceIntakeSecretBindings({
      MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID: "bad:id",
      MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_VERSION: "zero",
      MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID: "fixture-intake-ip-salt",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.stringContaining("TOKEN_SECRET_SECRET_ID"),
      expect.stringContaining("TOKEN_SECRET_SECRET_VERSION"),
    ]);
  });
});
