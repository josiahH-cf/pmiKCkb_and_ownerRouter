import { createCommunicationSequenceService } from "@/lib/gmail-hub/sequence-dependencies";
import { boundedCommunicationBody } from "@/lib/gmail-hub/sequence-http";
import { runCommunicationWorker } from "@/lib/gmail-hub/sequence-worker";
import {
  isCompiledMailWorkerRequest,
  readRehearsalMailTime,
} from "@/tests/browser/fixtures/s260-compiled-mail";

// Copied into a route only in the isolated compiler workspace. Exercise the
// real worker and durable claims with a per-run synthetic loopback capability.
export async function POST(request: Request) {
  if (!isCompiledMailWorkerRequest(request))
    return Response.json(
      { error: "Synthetic worker access is unavailable." },
      { status: 403 },
    );
  const body = await boundedCommunicationBody(request, 1).catch(() => Buffer.of(1));
  if (new URL(request.url).search || body.length)
    return Response.json(
      { error: "The synthetic worker accepts no input." },
      { status: 400 },
    );
  return Response.json(
    await runCommunicationWorker({
      service: createCommunicationSequenceService(),
      now: readRehearsalMailTime,
    }),
  );
}
