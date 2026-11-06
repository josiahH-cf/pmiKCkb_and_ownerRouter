// S254 R-S254-2 / R-S254-3: the app state the "November 5 mix" needs beyond its source rows. Each
// seed goes through the served app's own routes as the local demo Editor, so the same step works
// on whichever commit is being served, and a commit that lacks a feature answers with a refusal
// the step reports and carries on from. No seed fails the rehearsal: a missing one is a named row
// in rehearsal.json, and the source leases and the status table load without any of them.
//
// EXTENSION POINTS. A later suite replaces a "not built" step below with its own, keeping the
// name, or adds one. Each step receives { page, mix, rehearsal, origin } and returns
// { state: "seeded" | "skipped" | "not_built", detail }.
//   automatic-start-held / automatic-start-restored   built here (S249): an Admin turns the
//                           reviewed automatic start off for the seeds (they open the desk) and
//                           back on to its shipped default after them.
//   recorded-cycles         built here: the three leases renewed in RentVine get a work record
//                           whose cycle date is the earlier, recorded one.
//   notice-admission        built here: the desk is read, RentVine is read again and the desk is
//                           read again, so move-out evidence shows as it does day to day.
//   replied-owner-message   built here: the replied lease's owner message is sent from the app
//                           and an owner reply is delivered by the mail stand-in.
//   standing-agreement      S250: the covered lease's portfolio agreement (roles.covered).
//   housing-assistance      S251: Housing assistance Yes with the program name (roles.assisted).
//   prepared-kickoff        built here (S249): the prepared lease's stored comparison (through
//                           "Prepare this lease"), the Editor's signature and the approved
//                           owner and tenant templates (roles.prepared).
//   forms                   S253: tests/browser/one-path-forms-seed.mjs, the served commit's own
//                           file, loaded when it exists and called as
//                           seedOnePathForms(database, { leases }) with the rehearsal's Firestore
//                           emulator (emulator-database.mjs) and the five role leases.
// A step that writes the emulator directly, as the forms step does, must be the served commit's
// own file so that it writes that commit's document shapes; a step in this file goes through the
// served app's routes.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { deliverOwnerReply, setRecordingCycles } from "./control.mjs";

const FORMS_SEED_MODULE = "tests/browser/one-path-forms-seed.mjs";

/** POST or GET a JSON route from the signed-in page; never throws on a refusal. */
export async function routeFromPage(page, path, body) {
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
const route = routeFromPage;
const refusal = (answer) =>
  `HTTP ${answer.status}: ${String(answer.body?.error ?? answer.text).slice(0, 200)}`;

/** Where the app's own record of a message stands, in the app's words, for a report line. */
export function sequenceStanding(sequence) {
  if (!sequence) return "no message record";
  return [
    `sequence state ${sequence.state}`,
    sequence.pause?.cause ? `pause cause ${sequence.pause.cause}` : null,
    sequence.observation
      ? `incoming mail check ${sequence.observation.state}${sequence.observation.reason ? ` (${sequence.observation.reason})` : ""}`
      : null,
    `${(sequence.threads ?? []).length} sent message(s)`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Send one lease's owner message from the app, as staff do through the composer's routes: read
 * the message the app prepared, save it, then send it with the reviewed message and recipient
 * hashes. Returns the step reached, the answers, and the refusal when a step was refused. In the
 * rehearsal the message goes to the mail stand-in; nothing here can address a real mailbox.
 */
export async function sendOwnerMessage(page, leaseId) {
  const uuid = () => page.evaluate(() => crypto.randomUUID());
  const composition = await route(
    page,
    `/api/gmail-hub/composition?purpose=renewal_owner&lease=${leaseId}`,
  );
  if (composition.status !== 200)
    return { step: "composition", refusal: refusal(composition) };
  const { context, initial, reviewedTargetHash, target } = composition.body;
  if (target?.blockers?.length)
    return { step: "composition", refusal: `Blocked: ${target.blockers.join(" ")}` };
  const saved = await route(page, "/api/gmail-hub/sequences", {
    action: "save",
    draft: { id: await uuid(), context, initial, followUp: null },
    expectedVersion: 0,
    operationId: await uuid(),
  });
  if (saved.status !== 200) return { step: "save", refusal: refusal(saved) };
  const sequenceId = saved.body.sequence.id;
  const sent = await route(page, "/api/gmail-hub/sequences", {
    action: "send",
    id: sequenceId,
    expectedVersion: saved.body.sequence.version,
    operationId: await uuid(),
    reviewedDraftHash: saved.body.reviewedDraftHash,
    reviewedTargetHash,
    schedule: null,
  });
  return {
    step: "send",
    sequenceId,
    sent,
    to: target?.to ?? [],
    ...(sent.status === 200 ? {} : { refusal: refusal(sent) }),
  };
}

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
  const refreshed = await forceSourceRefresh(page);
  return {
    state: "seeded",
    detail: `${saved.join("; ")}. RentVine now shows the later dates (${refreshed.body?.refreshed ? "read again" : `not read again: ${refusal(refreshed)}`}).`,
  };
}

/** A forced RentVine read, as "Refresh data" asks for; honored once every ten seconds for each account. */
export async function forceSourceRefresh(page) {
  let answer = { status: 0, body: null, text: "" };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt) await page.waitForTimeout(2500);
    answer = await route(page, "/api/lease-renewal/refresh", { mode: "force" });
    if (answer.status !== 200 || answer.body?.refreshed) break;
  }
  return answer;
}

const WAITING_ON_A_FRESH_READ = "fresh admitted source read";

/**
 * The desk shows a lease's move-out evidence only from a RentVine read that began after that
 * lease's notice marker existed, and a new database holds no marker: the first desk read creates
 * them and tells staff to use "Refresh data". This step does that once, as staff would on a first
 * day: it opens the desk, asks for a fresh read and opens the desk again, so every later read of
 * the rehearsal shows the evidence as staff see it day to day. It writes nothing else.
 */
async function noticeAdmission({ page, origin }) {
  const desk = `${origin}/lease-renewal/live/desk`;
  const waiting = () =>
    page.evaluate(
      (phrase) => document.querySelectorAll(`[title*="${phrase}"]`).length,
      WAITING_ON_A_FRESH_READ,
    );
  await page.goto(desk, { waitUntil: "domcontentloaded" });
  const before = await waiting();
  const refreshed = await forceSourceRefresh(page);
  if (!refreshed.body?.refreshed)
    return {
      state: "skipped",
      detail: `No fresh RentVine read was made: ${refusal(refreshed)}`,
    };
  await page.goto(desk, { waitUntil: "domcontentloaded" });
  const after = await waiting();
  return {
    state: "seeded",
    detail: `The desk was read, RentVine was read again and the desk was read again; the desk asked for a fresh read in ${before} place(s) before and ${after} after.`,
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
  const message = await sendOwnerMessage(page, leaseId);
  if (message.refusal)
    return {
      state: "skipped",
      detail: `The owner message was not sent (${message.step}): ${message.refusal}`,
    };
  const sequence = message.sent.body?.sequence;
  if (!(sequence?.threads ?? []).length)
    return {
      state: "skipped",
      detail: `The send was not accepted (${sequenceStanding(sequence)}).`,
    };
  const reply = await deliverOwnerReply(rehearsal, {
    to: owner,
    text: role.ownerReply?.text,
  });
  const observed = await route(page, "/api/gmail-hub/sequences", {
    action: "refresh",
    id: message.sequenceId,
  });
  return {
    state: "seeded",
    detail: `Lease ${leaseId}: sent on thread ${reply.threadId}, owner reply delivered, thread read (HTTP ${observed.status}, ${sequenceStanding(observed.body?.sequence)}).`,
    sequenceId: message.sequenceId,
  };
}

/** Replace the page's local demo session with another local demo role. */
export async function switchDemoRole(page, role) {
  const answer = await route(page, "/api/auth/demo", { role });
  if (answer.status >= 300)
    throw new Error(`Local demo ${role} sign-in failed: ${refusal(answer)}`);
}

/** The synthetic sender signature the prepared kickoff seeds for the local demo Editor. */
export const SEEDED_EDITOR_SIGNATURE = Object.freeze({
  name: "Example Staff",
  role: "PMI KC Metro (rehearsal)",
  phone: null,
  hours: null,
  website: null,
  source: "Staff entry on the message",
});

/**
 * S249: the prepared lease is prepared ahead the way the app prepares it. Through the served app's
 * own routes: an Approver publishes the owner and tenant templates; the Editor runs "Prepare this
 * lease" (the kickoff preparation route, which runs the existing comparison against the
 * rehearsal's comparison stand-in and stores it for the cycle); and the Editor's own signature is
 * saved on the owner message, which retains it for that sender. The missing-recipient lease keeps
 * no verified owner recipient (its source row has none), so nothing is seeded for it.
 */
async function preparedKickoff({ page, mix }) {
  const leaseId = String(mix.roles.prepared.leaseId);
  const notes = [];
  await switchDemoRole(page, "Approver");
  try {
    for (const channel of ["owner", "tenant"]) {
      const published = await route(page, "/api/lease-renewal/message-preparation", {
        kind: "publish",
        channel,
      });
      notes.push(
        published.status === 200
          ? `${channel} template ${published.body?.status ?? "published"}`
          : `${channel} template not published (${refusal(published)})`,
      );
    }
  } finally {
    await switchDemoRole(page, "Editor");
  }
  const operationId = await page.evaluate(() => crypto.randomUUID());
  const prepared = await route(page, "/api/lease-renewal/kickoff-preparation", {
    leaseId,
    trigger: "staff",
    operationId,
  });
  if (prepared.status === 404)
    return {
      state: "not_built",
      detail: `The served commit has no kickoff preparation route (${notes.join("; ")}).`,
    };
  notes.push(
    prepared.status === 200
      ? `comparison ${prepared.body?.status ?? "answered"}${prepared.body?.billed ? " (one lookup)" : ""}`
      : `comparison not prepared (${refusal(prepared)})`,
  );
  const message = await route(
    page,
    `/api/lease-renewal/message-preparation?leaseId=${leaseId}&channel=owner`,
  );
  if (message.status !== 200)
    return { state: "skipped", detail: `${notes.join("; ")}; ${refusal(message)}` };
  const saved = await route(page, "/api/lease-renewal/message-preparation", {
    kind: "save",
    leaseId,
    channel: "owner",
    ...(message.body.cycleId ? { cycleId: message.body.cycleId } : {}),
    expectedRevision: message.body.saved?.revision ?? 0,
    operationId: await page.evaluate(() => crypto.randomUUID()),
    inputs: { ...message.body.inputs, signature: { ...SEEDED_EDITOR_SIGNATURE } },
    bodyOverride: null,
    subjectOverride: null,
  });
  notes.push(
    saved.status === 200
      ? "the Editor's signature saved on the owner message"
      : `signature not saved (${refusal(saved)})`,
  );
  const ready = prepared.status === 200 && saved.status === 200;
  return {
    state: ready ? "seeded" : "skipped",
    detail: `Lease ${leaseId}: ${notes.join("; ")}.`,
  };
}

/**
 * S249: the seeding browser opens the desk (notice admission), and opening the working batch
 * starts the comparison by itself. So that seeding leaves every lease as the mix describes it, an
 * Admin turns the reviewed setting off in the app for the seeds and back on to its shipped default
 * after them; nothing else about the setting changes. A commit without the setting answers 404.
 */
async function automaticStartSetting(page, enabled, why) {
  await switchDemoRole(page, "Admin");
  try {
    const current = await route(page, "/api/lease-renewal/kickoff-settings");
    if (current.status === 404)
      return {
        state: "not_built",
        detail: "The served commit has no automatic start setting.",
      };
    if (current.status !== 200) return { state: "skipped", detail: refusal(current) };
    if (current.body?.enabled === enabled)
      return {
        state: "seeded",
        detail: `Automatic preparation already ${enabled ? "on" : "off"}.`,
      };
    const saved = await route(page, "/api/lease-renewal/kickoff-settings", {
      enabled,
      expectedVersion: current.body?.version ?? 0,
      reason: why,
    });
    return saved.status === 200
      ? {
          state: "seeded",
          detail: `Automatic preparation turned ${enabled ? "on" : "off"}.`,
        }
      : { state: "skipped", detail: refusal(saved) };
  } finally {
    await switchDemoRole(page, "Editor");
  }
}

const notBuilt = (suite, what) => async () => ({
  state: "not_built",
  detail: `${suite} seeds this once it is built: ${what}.`,
});

/**
 * The five role leases as S253's forms seed takes them: the lease id, how many tenants it has and
 * its animal profile, all read from the mix (prepared: one pet; covered: two pets; assisted: an
 * assistance animal; missing recipient: five tenants).
 */
export function formsSeedLeases(mix) {
  return Object.values(mix.roles).map((role) => {
    const row = mix.leases.find((entry) => entry.lease.leaseID === role.leaseId);
    const kinds = (role.animals ?? []).map((animal) => animal.kind);
    const pets = kinds.filter((kind) => kind === "pet").length;
    const assistance = kinds.filter((kind) => kind === "assistance_animal").length;
    return {
      leaseId: String(role.leaseId),
      tenants: row?.lease.tenants?.length ?? 1,
      animals:
        pets && assistance
          ? "pet_and_assistance_animal"
          : assistance
            ? "assistance_animal"
            : pets > 1
              ? "two_pets"
              : pets === 1
                ? "one_pet"
                : "none",
    };
  });
}

/**
 * S253's forms seed module, when the served commit has it. The module is that commit's own file
 * (it writes that commit's document shapes), so it never travels with --commit and the starting
 * commit is served without it. It is called as seedOnePathForms(database, { leases }) with the
 * rehearsal's Firestore emulator and the five role leases. `overrides` is for tests.
 */
export async function seedForms({ mix, rehearsal }, overrides = {}) {
  const file = overrides.file ?? join(process.cwd(), FORMS_SEED_MODULE);
  if (!existsSync(file))
    return {
      state: "not_built",
      detail: `${FORMS_SEED_MODULE} does not exist on this tree.`,
    };
  const formsSeed = await import(pathToFileURL(file).href);
  if (typeof formsSeed.seedOnePathForms !== "function")
    return {
      state: "skipped",
      detail: `${FORMS_SEED_MODULE} exports no seedOnePathForms function.`,
    };
  const leases = formsSeedLeases(mix);
  const open =
    overrides.openDatabase ??
    (await import("./emulator-database.mjs")).openRehearsalDatabase;
  const seeded = await formsSeed.seedOnePathForms(open(rehearsal), { leases });
  return {
    state: "seeded",
    detail: `Forms seeded (${Object.keys(seeded?.forms ?? {}).join(", ") || "no form named"}) for ${leases
      .map(
        (lease) => `lease ${lease.leaseId}: ${lease.tenants} tenant(s), ${lease.animals}`,
      )
      .join("; ")}. The module's header lists the Admin steps that remain.`,
  };
}

export const SEED_STEPS = [
  {
    name: "automatic-start-held",
    suite: "S249",
    run: ({ page }) =>
      automaticStartSetting(
        page,
        false,
        "Rehearsal seeding: the seeds open the desk; leases stay as the mix describes them.",
      ),
  },
  { name: "recorded-cycles", suite: "S246", run: recordedCycles },
  { name: "notice-admission", suite: "S254", run: noticeAdmission },
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
  { name: "prepared-kickoff", suite: "S249", run: preparedKickoff },
  { name: "forms", suite: "S253", run: (context) => seedForms(context) },
  {
    name: "automatic-start-restored",
    suite: "S249",
    run: ({ page }) =>
      automaticStartSetting(
        page,
        true,
        "Rehearsal seeding finished: automatic preparation returns to its shipped default.",
      ),
  },
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
