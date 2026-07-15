import {
  FirestoreCommunicationsCleanupStore,
  runCommunicationsCleanup,
  type CommunicationsCleanupStore,
} from "@/lib/gmail-hub/retention-store";

export interface LocalCommunicationsCleanupWorkerInput {
  /** Deliberate acknowledgement that this destructive operation targets only the emulator. */
  emulatorConfirmed: boolean;
  env?: Partial<Pick<NodeJS.ProcessEnv, "FIRESTORE_EMULATOR_HOST" | "NODE_ENV">>;
  limit?: number;
  nowMs?: number;
  runId?: string;
  store?: CommunicationsCleanupStore;
}

/**
 * Local/emulator execution seam for S24. Production scheduling and native TTL activation stay a
 * separate infrastructure gate; this function refuses to construct a Firestore store until the
 * emulator boundary has been proved.
 */
export async function runLocalCommunicationsCleanupWorker(
  input: LocalCommunicationsCleanupWorkerInput,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Communications cleanup local worker is disabled in production.");
  }
  if (
    process.env.NODE_ENV !== "test" &&
    (input.env !== undefined || input.store !== undefined)
  ) {
    throw new Error(
      "Communications cleanup environment and store overrides are test-only.",
    );
  }
  const env = input.env ?? process.env;
  assertLocalEmulatorCleanupBoundary(input.emulatorConfirmed, env);
  if (!input.store) {
    // A test-supplied env object must never redirect the default Firestore store.
    assertLocalEmulatorCleanupBoundary(input.emulatorConfirmed, process.env);
  }
  const nowMs = input.nowMs ?? Date.now();
  return runCommunicationsCleanup({
    store: input.store ?? new FirestoreCommunicationsCleanupStore(),
    nowMs,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
  });
}

export function assertLocalEmulatorCleanupBoundary(
  emulatorConfirmed: boolean,
  env: Partial<Pick<NodeJS.ProcessEnv, "FIRESTORE_EMULATOR_HOST" | "NODE_ENV">>,
) {
  if (!emulatorConfirmed) {
    throw new Error(
      "Communications cleanup requires the explicit --emulator acknowledgement.",
    );
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Communications cleanup local worker is disabled in production.");
  }
  const host = env.FIRESTORE_EMULATOR_HOST?.trim();
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/.test(host)) {
    throw new Error(
      "Communications cleanup requires FIRESTORE_EMULATOR_HOST on a loopback address.",
    );
  }
}
