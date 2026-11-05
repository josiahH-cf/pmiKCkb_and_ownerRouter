// S254 R-S254-2 / R-S254-3: the app state the "November 5 mix" needs beyond its source rows. Each
// seed goes through the served app's own routes as the local demo Editor, so the same step works
// on whichever commit is being served, and a commit that lacks a feature answers with a refusal
// the step reports and carries on from. No seed fails the rehearsal: a missing one is a named row
// in rehearsal.json, and the source leases and the status table load without any of them.
//
// EXTENSION POINTS. A later suite replaces a "not built" step below with its own, keeping the
// name, or adds one. Each step receives { page, mix, rehearsal, origin } and returns
// { state: "seeded" | "skipped" | "not_built", detail }.
//   recorded-cycles         built here: the three leases renewed in RentVine get a work record
//                           whose cycle date is the earlier, recorded one.
//   replied-owner-message   built here: the replied lease's owner message is sent from the app
//                           and an owner reply is delivered by the mail stand-in.
//   standing-agreement      S250: the covered lease's portfolio agreement (roles.covered).
//   housing-assistance      S251: Housing assistance Yes with the program name (roles.assisted).
//   prepared-kickoff        S248/S249: the prepared lease's stored comparison, signature and
//                           approved template (roles.prepared).
//   forms                   S253: tests/browser/one-path-forms-seed.mjs, loaded when it exists.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { deliverOwnerReply, setRecordingCycles } from "./control.mjs";

const FORMS_SEED_MODULE = "tests/browser/one-path-forms-seed.mjs";

/** POST or GET a JSON route from the signed-in page; never throws on a refusal. */
async function route(page, path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {} : { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      return { status: response.status, body: parsed, text: text.slice(0, 300) };
    },
    { path, body },
  );
}
const refusal = (answer) =>
  `HTTP ${answer.status}: ${String(answer.body?.error ?? answer.text).slice(0, 200)}`;

/**
 * R-S254-2: three leases whose RentVine end date is later than their recorded cycle. While the
 * provider boundary serves the recorded dates, one staff save on each lease establishes its work
 * record on that date; the boundary then serves the current dates again and the app re-reads.
 * The caller turns the recorded dates on before the server's first RentVine read.
 */
async function recordedCycles({ page, mix, rehearsal }) {
  const saved = [];
  for (const [leaseId, recorded] of Object.entries(mix.recordedCycles)) {
    const state = await route(page, `/api/lease-renewal/workspace?leaseId=${leaseId}`);
    if (state.status !== 200)
      return {
        state: "skipped",
        detail: `Lease ${leaseId} could not be read: ${refusal(state)}`,
      };
    if ((state.body?.state?.revision ?? 0) > 0) {
      saved.push(`${leaseId} already had a work record`);
      continue;
    }
    const save = await route(page, "/api/lease-renewal/workspace", {
      operation: "record",
      leaseId,
      cycleId: state.body?.state?.cycleId ?? null,
      expectedRevision: state.body?.state?.revision ?? 0,
      operationId: await page.evaluate(() => crypto.randomUUID()),
      action: {
        kind: "activity",
        activity: "owner_outreach",
        outcome: "waiting",
        source: "One-path rehearsal seed",
      },
    });
    if (save.status !== 200)
      return {
        state: "skipped",
        detail: `Lease ${leaseId} could not be saved: ${refusal(save)}`,
      };
    saved.push(`${leaseId} recorded on ${recorded}`);
  }
  setRecordingCycles(rehearsal, false);
  const refreshed = await route(page, "/api/lease-renewal/refresh", { mode: "force" });
  return {
    state: "seeded",
    detail: `${saved.join("; ")}. RentVine now shows the later dates (refresh HTTP ${refreshed.status}).`,
  };
}

/**
 * The replied lease: its owner message is sent from the app through the mail stand-in, then the
 * stand-in delivers the owner's reply and the app reads the thread. A commit without the
 * rehearsal's mail adapter refuses the send in the Demo environment; that is reported, and the
 * lease is then simply a lease with no message sent.
 */
async function repliedOwnerMessage({ page, mix, rehearsal }) {
  const role = mix.roles.replied;
  const leaseId = role.leaseId;
  const owner = mix.leases.find((row) => row.lease.leaseID === leaseId)?.portfolio
    .owners[0]?.email;
  const composition = await route(
    page,
    `/api/gmail-hub/composition?purpose=renewal_owner&lease=${leaseId}`,
  );
  if (composition.status !== 200)
    return { state: "skipped", detail: `No owner message: ${refusal(composition)}` };
  const { context, initial, reviewedTargetHash, target } = composition.body;
  if (target?.blockers?.length)
    return { state: "skipped", detail: `Blocked: ${target.blockers.join(" ")}` };
  const uuid = () => page.evaluate(() => crypto.randomUUID());
  const saved = await route(page, "/api/gmail-hub/sequences", {
    action: "save",
    draft: { id: await uuid(), context, initial, followUp: null },
    expectedVersion: 0,
    operationId: await uuid(),
  });
  if (saved.status !== 200)
    return { state: "skipped", detail: `The message was not saved: ${refusal(saved)}` };
  const sent = await route(page, "/api/gmail-hub/sequences", {
    action: "send",
    id: saved.body.sequence.id,
    expectedVersion: saved.body.sequence.version,
    operationId: await uuid(),
    reviewedDraftHash: saved.body.reviewedDraftHash,
    reviewedTargetHash,
    schedule: null,
  });
  if (sent.status !== 200)
    return { state: "skipped", detail: `The send was refused: ${refusal(sent)}` };
  const threads = sent.body?.sequence?.threads ?? [];
  if (!threads.length)
    return {
      state: "skipped",
      detail: `The send was not accepted (sequence state ${sent.body?.sequence?.state}).`,
    };
  const reply = await deliverOwnerReply(rehearsal, {
    to: owner,
    text: role.ownerReply?.text,
  });
  const observed = await route(page, "/api/gmail-hub/sequences", {
    action: "refresh",
    id: saved.body.sequence.id,
  });
  return {
    state: "seeded",
    detail: `Lease ${leaseId}: sent on thread ${reply.threadId}, owner reply delivered, thread read (HTTP ${observed.status}, sequence state ${observed.body?.sequence?.state ?? "unknown"}).`,
    sequenceId: saved.body.sequence.id,
  };
}

const notBuilt = (suite, what) => async () => ({
  state: "not_built",
  detail: `${suite} seeds this once it is built: ${what}.`,
});

/** S253's forms seed module, when that suite has added it. */
async function forms(context) {
  const file = join(process.cwd(), FORMS_SEED_MODULE);
  if (!existsSync(file))
    return {
      state: "not_built",
      detail: `${FORMS_SEED_MODULE} does not exist on this tree.`,
    };
  const module = await import(pathToFileURL(file).href);
  if (typeof module.seedOnePathForms !== "function")
    return {
      state: "skipped",
      detail: `${FORMS_SEED_MODULE} exports no seedOnePathForms function.`,
    };
  const result = await module.seedOnePathForms(context);
  return {
    state: "seeded",
    detail: String(result?.detail ?? "Forms seeded."),
    ...result,
  };
}

export const SEED_STEPS = [
  { name: "recorded-cycles", suite: "S246", run: recordedCycles },
  { name: "replied-owner-message", suite: "S249", run: repliedOwnerMessage },
  {
    name: "standing-agreement",
    suite: "S250",
    run: notBuilt(
      "S250",
      "the covered lease's active standing agreement on its portfolio",
    ),
  },
  {
    name: "housing-assistance",
    suite: "S251",
    run: notBuilt(
      "S251",
      "Housing assistance Yes with the program name on the assisted lease",
    ),
  },
  {
    name: "prepared-kickoff",
    suite: "S248",
    run: notBuilt(
      "S248 and S249",
      "the prepared lease's stored comparison, signature and approved template",
    ),
  },
  { name: "forms", suite: "S253", run: forms },
];

/** Run every seed in order. A seed that throws is reported as skipped with its message. */
export async function runSeeds(context, steps = SEED_STEPS) {
  const results = [];
  for (const step of steps) {
    try {
      results.push({ name: step.name, suite: step.suite, ...(await step.run(context)) });
    } catch (error) {
      results.push({
        name: step.name,
        suite: step.suite,
        state: "skipped",
        detail: String(error?.message ?? error).slice(0, 300),
      });
    }
  }
  return results;
}
