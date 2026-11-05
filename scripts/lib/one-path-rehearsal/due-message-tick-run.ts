// S248 L39, harness only: the in-process tick scripts/lib/one-path-rehearsal/due-message-tick.mjs
// starts. It refuses to run anywhere but a rehearsal (the Demo environment, local demo sign-in,
// a loopback emulator and a loopback mail stand-in), then runs the app's own due-message worker
// once with the app's own service and prints the worker's counts as one JSON line.
//
// The rehearsal's network boundary (tests/browser/renewal-novdec-journey-network.mjs) must be
// loaded in THIS process before any app module: the tick refuses to start otherwise, and loads the
// app modules only after that check.
//
// When the named message was not sent, it reads (never writes) why: the worker keeps a held send's
// reason to itself, so the tick resolves that message's recipients the way the worker does and
// reports the error text beside the counts.
import net from "node:net";

function assertNetworkBoundary() {
  const fetchGuarded =
    (globalThis.fetch as { name?: string } | undefined)?.name === "guardedFetch";
  const socketGuarded = net.Socket.prototype.connect.name === "guardedConnect";
  if (!fetchGuarded || !socketGuarded)
    throw new Error(
      "The rehearsal network boundary is not loaded in the tick process; nothing was run.",
    );
}

async function main() {
  assertNetworkBoundary();
  const { resolveRehearsalStandIn } =
    await import("@/lib/environment/rehearsal-stand-in");
  if (!resolveRehearsalStandIn(process.env))
    throw new Error("The due-message tick runs only inside the one-path rehearsal.");
  const {
    createCommunicationSequenceService,
    readCurrentCommunicationActor,
    resolveCommunicationTarget,
  } = await import("@/lib/gmail-hub/sequence-dependencies");
  const { FirestoreCommunicationSequenceStore } =
    await import("@/lib/gmail-hub/sequence-store");
  const { runCommunicationWorker } = await import("@/lib/gmail-hub/sequence-worker");

  const diagnose = async (sequenceId: string) => {
    try {
      const sequence = await new FirestoreCommunicationSequenceStore().get(sequenceId);
      if (!sequence) return "the message is not in the store";
      const actor = await readCurrentCommunicationActor(sequence.responsibleUid);
      const target = await resolveCommunicationTarget(actor, sequence.context);
      // Digests and counts only: whether the source the send was authorized on still matches.
      return {
        authorizedSource: sequence.authorization.materialSourceHash,
        currentSource: target.materialSourceHash,
        noticeCycleId: target.noticeCycleId,
        blockers: target.blockers,
        recipients: target.to.length + target.cc.length,
      };
    } catch (error) {
      return String((error as Error)?.stack ?? error).slice(0, 1200);
    }
  };

  const result = await runCommunicationWorker({
    service: createCommunicationSequenceService(),
    maxSequences: 50,
  });
  const sequenceId = process.env.ONE_PATH_TICK_SEQUENCE ?? "";
  const diagnosis =
    /^[0-9a-f-]{36}$/.test(sequenceId) && result.sent === 0
      ? await diagnose(sequenceId)
      : null;
  process.stdout.write(`${JSON.stringify({ ...result, diagnosis })}\n`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${String((error as Error)?.stack ?? error)}\n`);
    process.exit(1);
  },
);
