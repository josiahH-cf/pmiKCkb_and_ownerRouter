// A fixed Central business date for the isolated Help fixture. Keep elapsed time moving for
// polling, cache deadlines and emulator calls. Browser captures fix only their wall clock.
import { Socket } from "node:net";

export const HELP_FIXTURE_INSTANT = "2026-11-07T18:00:00.000Z";

if (process.env.HELP_REHEARSAL_CLOCK_ORIGIN) {
  if (
    globalThis.fetch.name !== "guardedFetch" ||
    Socket.prototype.connect.name !== "guardedConnect" ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
  )
    throw new Error("The Help fixture clock requires the guarded loopback emulator.");
  const realDate = Date;
  const elapsedOrigin = Number(process.env.HELP_REHEARSAL_CLOCK_ORIGIN);
  if (!Number.isSafeInteger(elapsedOrigin))
    throw new Error("Invalid Help fixture clock origin.");
  const offset = realDate.parse(HELP_FIXTURE_INSTANT) - elapsedOrigin;
  const now = () => realDate.now() + offset;
  globalThis.Date = new Proxy(realDate, {
    apply: () => new realDate(now()).toString(),
    construct: (target, argumentsList, newTarget) =>
      Reflect.construct(
        target,
        argumentsList.length ? argumentsList : [now()],
        newTarget,
      ),
    get: (target, property, receiver) =>
      property === "now" ? now : Reflect.get(target, property, receiver),
  });
}
