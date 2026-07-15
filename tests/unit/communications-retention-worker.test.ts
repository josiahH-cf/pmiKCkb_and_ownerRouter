import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertLocalEmulatorCleanupBoundary,
  runLocalCommunicationsCleanupWorker,
} from "@/lib/gmail-hub/retention-worker";
import type { CommunicationsCleanupStore } from "@/lib/gmail-hub/retention-store";
import { parseCommunicationsCleanupArgs } from "../../scripts/run-communications-cleanup";

describe("local communications cleanup worker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("cannot spoof a test emulator boundary while the actual process is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    let touched = false;
    await expect(
      runLocalCommunicationsCleanupWorker({
        emulatorConfirmed: true,
        env: { NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
        store: {
          async listCandidates() {
            touched = true;
            return [];
          },
          async deleteIfEligible() {
            return false;
          },
          async writeCountsAudit() {
            return "created";
          },
        },
      }),
    ).rejects.toThrow("disabled in production");
    expect(touched).toBe(false);
  });

  it.each([
    {
      confirmed: false,
      env: { NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
      message: "--emulator",
    },
    {
      confirmed: true,
      env: { NODE_ENV: "production", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
      message: "disabled in production",
    },
    {
      confirmed: true,
      env: { NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: "firestore.example:8080" },
      message: "loopback",
    },
    {
      confirmed: true,
      env: { NODE_ENV: "test" },
      message: "FIRESTORE_EMULATOR_HOST",
    },
  ] as const)(
    "refuses a non-local boundary before touching the store",
    async (example) => {
      let touched = false;
      await expect(
        runLocalCommunicationsCleanupWorker({
          emulatorConfirmed: example.confirmed,
          env: example.env,
          store: {
            async listCandidates() {
              touched = true;
              return [];
            },
            async deleteIfEligible() {
              return false;
            },
            async writeCountsAudit() {
              return "created";
            },
          },
        }),
      ).rejects.toThrow(example.message);
      expect(touched).toBe(false);
    },
  );

  it("runs a bounded, counts-only pass against an injected emulator store", async () => {
    const audits: unknown[] = [];
    const store: CommunicationsCleanupStore = {
      async listCandidates(nowMs, limit) {
        expect(nowMs).toBe(123_456);
        expect(limit).toBe(25);
        return [];
      },
      async deleteIfEligible() {
        throw new Error("No candidates should be deleted.");
      },
      async writeCountsAudit(input) {
        audits.push(input);
        return "created";
      },
    };
    await expect(
      runLocalCommunicationsCleanupWorker({
        emulatorConfirmed: true,
        env: { NODE_ENV: "test", FIRESTORE_EMULATOR_HOST: "localhost:8080" },
        limit: 25,
        nowMs: 123_456,
        runId: "emulator-run-1",
        store,
      }),
    ).resolves.toMatchObject({
      runId: "emulator-run-1",
      plannedCount: 0,
      deletedCount: 0,
      failedCount: 0,
      auditStatus: "created",
    });
    expect(JSON.stringify(audits)).not.toMatch(/message|body|recipient/i);
  });

  it("accepts loopback hosts only", () => {
    expect(() =>
      assertLocalEmulatorCleanupBoundary(true, {
        NODE_ENV: "test",
        FIRESTORE_EMULATOR_HOST: "[::1]:8080",
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalEmulatorCleanupBoundary(true, {
        NODE_ENV: "test",
        FIRESTORE_EMULATOR_HOST: "0.0.0.0:8080",
      }),
    ).toThrow("loopback");
  });

  it("parses an explicit emulator invocation and rejects unknown flags", () => {
    expect(
      parseCommunicationsCleanupArgs([
        "--emulator",
        "--limit=40",
        "--now-ms",
        "123456",
        "--run-id=synthetic-run-1",
        "--json",
      ]),
    ).toEqual({
      emulatorConfirmed: true,
      help: false,
      json: true,
      limit: 40,
      nowMs: 123_456,
      runId: "synthetic-run-1",
    });
    expect(() => parseCommunicationsCleanupArgs(["--live"])).toThrow("Unknown argument");
  });
});
