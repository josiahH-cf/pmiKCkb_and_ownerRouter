import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getVerifiedDemoFirestore } from "../../scripts/demo-firestore.mjs";
import {
  DemoFirestoreTargetError,
  parseDemoEmulatorHost,
  verifyDemoFirestoreTarget,
} from "../../scripts/demo-firestore-target.mjs";

describe("demo Firestore target guard", () => {
  it.each([
    ["127.0.0.1:8080", "127.0.0.1:8080"],
    ["127.4.3.2:9090", "127.4.3.2:9090"],
    ["localhost:8080", "localhost:8080"],
    ["[::1]:8080", "[::1]:8080"],
  ])("accepts loopback target %s", (input, normalized) => {
    expect(parseDemoEmulatorHost(input).normalizedHost).toBe(normalized);
  });

  it.each([
    "",
    "firestore.googleapis.com:443",
    "10.0.0.4:8080",
    "http://127.0.0.1:8080",
    "127.0.0.1",
    "127.0.0.1:0",
    "127.0.0.1:70000",
  ])("rejects absent, malformed, or non-local target %j", (input) => {
    expect(() => parseDemoEmulatorHost(input)).toThrow(DemoFirestoreTargetError);
  });

  it("propagates a verified .env.local-only host to the process environment", async () => {
    const env = {};
    const target = await verifyDemoFirestoreTarget({
      env,
      localEnv: {
        FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      },
      log: false,
      probe: vi.fn(async () => true),
    });

    expect(target.projectId).toBe("pmi-kc-kb-prod");
    expect(env).toMatchObject({
      FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      GOOGLE_CLOUD_PROJECT: "pmi-kc-kb-prod",
    });
  });

  it("refuses an unreachable emulator before Admin initialization", async () => {
    const initializeApp = vi.fn();
    await expect(
      getVerifiedDemoFirestore({
        admin: { getApps: () => [], initializeApp },
        firestore: { FieldValue: {}, getFirestore: vi.fn() },
        target: {
          env: {
            FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
            FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
          },
          localEnv: {},
          log: false,
          probe: vi.fn(async () => false),
        },
      }),
    ).rejects.toThrow(/no emulator is reachable/i);
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it("the seed child process fails closed on a non-local host before reporting writes", () => {
    const result = spawnSync(
      process.execPath,
      [join("scripts", "seed-demo-records.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          FIREBASE_PROJECT_ID: "pmi-kc-kb-prod",
          FIRESTORE_EMULATOR_HOST: "firestore.googleapis.com:443",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/only localhost/i);
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/seed complete|seeded/i);
  });
});
