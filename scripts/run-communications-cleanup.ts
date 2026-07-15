import { pathToFileURL } from "node:url";

import {
  runLocalCommunicationsCleanupWorker,
  type LocalCommunicationsCleanupWorkerInput,
} from "../lib/gmail-hub/retention-worker";

export interface CommunicationsCleanupCliOptions {
  emulatorConfirmed: boolean;
  help: boolean;
  json: boolean;
  limit?: number;
  nowMs?: number;
  runId?: string;
}

export function parseCommunicationsCleanupArgs(
  argv = process.argv.slice(2),
): CommunicationsCleanupCliOptions {
  const options: CommunicationsCleanupCliOptions = {
    emulatorConfirmed: false,
    help: false,
    json: false,
  };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift()!;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--emulator") options.emulatorConfirmed = true;
    else if (arg === "--limit") options.limit = parseInteger(args.shift(), "--limit");
    else if (arg.startsWith("--limit=")) {
      options.limit = parseInteger(arg.slice("--limit=".length), "--limit");
    } else if (arg === "--now-ms") {
      options.nowMs = parseInteger(args.shift(), "--now-ms");
    } else if (arg.startsWith("--now-ms=")) {
      options.nowMs = parseInteger(arg.slice("--now-ms=".length), "--now-ms");
    } else if (arg === "--run-id") {
      options.runId = readRequiredValue(args.shift(), "--run-id");
    } else if (arg.startsWith("--run-id=")) {
      options.runId = readRequiredValue(arg.slice("--run-id=".length), "--run-id");
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export async function main(
  argv = process.argv.slice(2),
  runWorker: (
    input: LocalCommunicationsCleanupWorkerInput,
  ) => ReturnType<
    typeof runLocalCommunicationsCleanupWorker
  > = runLocalCommunicationsCleanupWorker,
) {
  const options = parseCommunicationsCleanupArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await runWorker({
    emulatorConfirmed: options.emulatorConfirmed,
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    ...(options.nowMs === undefined ? {} : { nowMs: options.nowMs }),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
  });
  console.log(
    options.json
      ? JSON.stringify(result, null, 2)
      : [
          "Communications cleanup (local Firestore emulator only)",
          `Run: ${result.runId}; planned: ${result.plannedCount}; deleted: ${result.deletedCount}; failed: ${result.failedCount}; audit: ${result.auditStatus}`,
        ].join("\n"),
  );
  if (result.failedCount > 0) process.exitCode = 1;
}

function usage() {
  return [
    "Usage: npm run communications:cleanup:emulator -- --emulator [--limit=N] [--run-id=ID] [--now-ms=N] [--json]",
    "",
    "Deletes only expired, non-held S24 records in a loopback Firestore emulator.",
    "Production TTL and scheduler activation are intentionally unavailable from this command.",
  ].join("\n");
}

function parseInteger(value: string | undefined, name: string) {
  const parsed = Number(readRequiredValue(value, name));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} requires a non-negative safe integer.`);
  }
  return parsed;
}

function readRequiredValue(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name} requires a value.`);
  return value.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
