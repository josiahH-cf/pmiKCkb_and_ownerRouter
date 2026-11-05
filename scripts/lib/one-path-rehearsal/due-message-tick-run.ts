// S248 L39, harness only: the in-process tick scripts/lib/one-path-rehearsal/due-message-tick.mjs
// starts. It refuses to run anywhere but a rehearsal (the Demo environment, local demo sign-in,
// a loopback emulator and a loopback mail stand-in), then runs the app's own due-message worker
// once with the app's own service and prints the worker's counts as one JSON line.
import { resolveRehearsalStandIn } from "@/lib/environment/rehearsal-stand-in";
import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import { runCommunicationWorker } from "@/lib/gmail-hub/sequence-worker";

async function main() {
  if (!resolveRehearsalStandIn(process.env))
    throw new Error("The due-message tick runs only inside the one-path rehearsal.");
  const result = await runCommunicationWorker({
    service: createCommunicationSequenceService(),
    maxSequences: 50,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String((error as Error)?.stack ?? error)}\n`);
    process.exit(1);
  },
);
