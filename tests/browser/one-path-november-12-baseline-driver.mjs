// S284 R-S284-1 and AC-S284-1: reproduce the fail-first table of
// docs/feature-suites/staff-workflow-audit-qualification.md on the serving baseline, before any
// product edit. Each W12 starting sequence runs as a journey of one-path-november-12-journeys.mjs
// (visible controls, the stand-in hooks and the worker tick only); this file holds the table's
// baseline results and compares what each journey observed with them. A row that does not
// reproduce is recorded as not reproduced, with what was seen; nothing is rewritten to pass.
//
//   bash scripts/run-renewal-one-path-rehearsal.sh --commit <baseline sha> \
//     --hold-automatic-comparison --driver tests/browser/one-path-november-12-baseline-driver.mjs \
//     [-- --only W12-03,W12-05] [--no-reset] [--w1203-attempts 3] [--w1203-wait 75]
//
// The record is november-12-baseline.json in the private rehearsal run directory: per row the
// observation and whether it matched, with the served source, the harness commit, the fixture
// identity, the run id and the refused-connection count. Rows are independent: each runs from the
// seeded starting state (the harness reset puts it back when an earlier row changed it), and a
// row that fails is recorded as such while the others still run.
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  readRehearsal,
  refusedConnections,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { resetRehearsalState } from "../../scripts/lib/one-path-rehearsal/reset.mjs";
import { WIDE } from "./one-path-november-10-kit.mjs";
import { W12_JOURNEYS } from "./one-path-november-12-journeys.mjs";
import {
  SEQUENCES_ROUTE,
  createStaffKit,
  rehearsalFixture,
} from "./one-path-november-12-kit.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
assert.equal(rehearsal.servedVersion, rehearsal.servedCommit, "Serve the named source");
assert.equal(
  rehearsal.mailAdapter,
  true,
  "The journeys need the rehearsal mail adapter.",
);
assert.equal(
  rehearsal.compiled,
  false,
  "The mail stand-in works in development mode only.",
);

/** The production revision that serves the baseline source (AGENTS.md, present production truth). */
const BASELINE = Object.freeze({
  source: "7f4cf234c18c0b80a0ed88bc08d70e174ae9c311",
  revision: "pmi-kc-app-rmwcvtvpl-13e72fe3f01f",
});

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const only = argument("--only")?.split(",").filter(Boolean) ?? null;
const resetting = !process.argv.includes("--no-reset");
const options = {
  w1203Attempts: Number(argument("--w1203-attempts") ?? 3),
  w1203WaitSeconds: Number(argument("--w1203-wait") ?? 75),
  w1212Filter: argument("--w1212-filter") ?? "Example",
  offCycleLeaseId: 9106,
};

// ---- The fail-first table: starting sequence, the result to record, and the comparison -------

const has = (value) => value !== null && value !== undefined;
const TABLE = [
  {
    id: "W12-01",
    sequence:
      'Schedule a tenant offer, change the end date, tick, send a new offer from the lease, click "Resume reviewed sequence", tick.',
    result:
      "The stand-in mailbox holds two tenant messages with different end dates on one thread.",
    match: (o) => ({
      reproduced: o.tenantMessages === 2 && o.tenantThreads === 1 && o.differentEndDates,
      seen: `${o.tenantMessages} tenant message(s) on ${o.tenantThreads} thread(s), end dates ${o.messageEndDates.join(" then ")}; first tick sent ${o.firstTick.sent} and held ${o.firstTick.held}; Resume answered ${o.resume.status} (${o.resume.state}) with ${o.resume.dialogShown ? "a" : "no"} dialog; second tick sent ${o.secondTick.sent}.`,
    }),
  },
  {
    id: "W12-02",
    sequence:
      "After the end date change and before any tick, read the lease. After the tick, read the lease and the notifications.",
    result:
      "New wording above the old schedule; after the hold, no trace and no notification.",
    match: (o) => {
      const before = o.beforeTick;
      const after = o.afterTick;
      const newOverOld =
        before.scheduledLine &&
        before.mentionsChangedEnd &&
        o.scheduledAuthorizationEnd === "first" &&
        before.outOfDateWarnings === 0;
      const held = o.heldMessage?.state === "paused";
      const noTrace = held && after.heldOrPausedMentions === 0 && !after.scheduledLine;
      const noNotification =
        has(o.unreadNotificationsBefore) &&
        o.unreadNotificationsAfter <= o.unreadNotificationsBefore;
      return {
        reproduced: newOverOld && noTrace && noNotification,
        seen: `Before the tick: scheduled line ${before.scheduledLine ? "shown" : "absent"}, message ${before.mentionsChangedEnd ? "reads the changed end" : "does not read the changed end"}, scheduled authorization reads the ${o.scheduledAuthorizationEnd} end, ${before.outOfDateWarnings} out-of-date warning(s). Tick sent ${o.tick.sent}, held ${o.tick.held}; the message is ${o.heldMessage?.state ?? "unread"}${o.heldMessage?.pause ? ` (${o.heldMessage.pause})` : ""}. After: ${after.heldOrPausedMentions} hold mention(s) on the lease, primary "${after.primary}", desk next "${o.deskAfterTick.next}", unread notifications ${o.unreadNotificationsBefore} then ${o.unreadNotificationsAfter}.`,
      };
    },
  },
  {
    id: "W12-03",
    sequence:
      "Inject an admission that commits between the floor reads and the notice observation, then confirm.",
    result: 'The "recipients or source facts changed" refusal with nothing edited.',
    match: (o) => {
      const refused = o.tries.find((entry) => entry.refusedAsChanged);
      const unedited =
        refused &&
        refused.workingRecordUnchanged &&
        refused.postsDuringTry.every((path) => path === SEQUENCES_ROUTE);
      return {
        reproduced: Boolean(refused && unedited),
        seen: o.tries
          .map(
            (entry) =>
              `try ${entry.attempt}: ${entry.waitedSeconds} s open, Send answered ${entry.status}${entry.refusedAsChanged ? ' with "recipients or source facts changed"' : ""}, writes ${entry.postsDuringTry.join(", ") || "none"}, working record ${entry.workingRecordUnchanged ? "unchanged" : "changed"}`,
          )
          .join("; "),
      };
    },
  },
  {
    id: "W12-04",
    sequence:
      "Send an owner message, deliver a reply, tick, open the desk and the lease, use every visible refresh.",
    result: "The lease keeps waiting; no visible control shows the reply.",
    match: (o) => ({
      reproduced: o.replyDelivered && o.leaseKeptWaiting && !o.replyShownOnLease,
      seen: `Reply delivered ${o.replyDelivered}; tick sent ${o.tick.sent}; ${o.refreshControlsUsed.filter((entry) => entry.shown !== false).length} refresh control(s) used; the lease read waiting on the owner in ${o.leaseReads.filter((read) => read.waitingOnOwner).length} of ${o.leaseReads.length} reads and showed the reply in ${o.leaseReads.filter((read) => read.replyDecisionForms || read.replyChoices || read.ownerRepliedText).length}; the owner message record is ${o.ownerMessageRecord?.state ?? "unread"} with ${o.ownerMessageRecord?.inbound ?? 0} inbound; "Refresh linked incoming" shown ${o.openedCommunication?.refreshLinkedIncoming ?? "n/a"}.`,
    }),
  },
  {
    id: "W12-05",
    sequence:
      'Choose "Accepted" with follow-ups authorized, then tick at the next due time.',
    result: "Saved on selection; the reminder is sent.",
    match: (o) => ({
      reproduced: o.savedOnSelection && !o.reviewShownBeforeSave && o.reminderSent,
      seen: `"Accepted" ${o.savedOnSelection ? "saved on selection" : "not saved on selection"} (recorded ${o.recordedOutcome}), review ${o.reviewShownBeforeSave ? "shown" : "not shown"}; tick sent ${o.tick.sent}; tenant messages ${o.tenantMessagesBeforeTick} then ${o.tenantMessagesAfterTick}.`,
    }),
  },
  {
    id: "W12-06",
    sequence: 'Open the covered lease\'s Offer step and follow "Set renewal base rent".',
    result:
      'Focus on "Owner decides each renewal"; no control adopts the agreement amount.',
    match: (o) => ({
      reproduced: o.focusOnOwnerDecides && o.adoptionControls === 0,
      seen: `Primary "${o.primary}"; Pricing basis ${o.pricingBasisLoadedBeforeClick ? "read" : "not read"} before the click; focus on ${o.focus ? `"${o.focus.label}" (${o.focus.tag}${o.focus.type ? ` ${o.focus.type}` : ""})` : "nothing"}${o.landed ? ` with ${o.landed.fullView ? "Full view" : `Guided step ${o.landed.step ?? "current"}`} shown and the Pricing basis ${o.landed.pricingBasisShown ? "shown" : "not shown"}` : ""}; ${o.adoptionControls} adoption control(s); Renewal base rent "${o.renewalBaseRent}".`,
    }),
  },
  {
    id: "W12-07",
    sequence:
      "Save a recommendation that differs from the provider point estimate and read the pending Market value.",
    result: "The pending value is the point estimate.",
    match: (o) => ({
      reproduced:
        o.recommendationSaved !== null &&
        o.pendingIsPointEstimate &&
        !o.pendingIsRecommendation,
      seen: `Recommendation saved ${o.recommendationSaved ?? "no"}; point estimate ${o.pointEstimate ?? "unread"}; preparation save ${o.preparationSave ? `answered ${o.preparationSave.status} carrying ${o.preparationSave.pmiNumber}` : "not made"}; pending Market value ${o.pendingMarketValue ?? "not shown"}.`,
    }),
  },
  {
    id: "W12-08",
    sequence: "Read one lease as two staff members with different mailbox links.",
    result: "Different waiting status for the same lease.",
    match: (o) => ({
      reproduced: o.differentStatus,
      seen: `Editor (linked thread control ${o.editor.linkedThreadControls}, refresh ${o.linkRefresh.status ?? "not shown"}) reads "${o.editor.stageLine}"; Approver (linked thread control ${o.approver.linkedThreadControls}) reads "${o.approver.stageLine}".`,
    }),
  },
  {
    id: "W12-09",
    sequence: "Create rent differences on three leases and read the Dashboard.",
    result: 'One unnamed "Current rent" row.',
    match: (o) => ({
      reproduced:
        o.leasesWithDifferences === 3 &&
        o.currentRentRows === 1 &&
        o.currentRentRowsNamingALease === 0,
      seen: `${o.leasesWithDifferences} lease(s) with a Sheet rent difference; ${o.attentionRows} "Waiting on you" row(s), ${o.currentRentRows} "Current rent" row(s), ${o.currentRentRowsNamingALease} naming a lease${o.staleNotice ? `; stale notice shown` : ""}.`,
    }),
  },
  {
    id: "W12-10",
    sequence:
      "Open the Communications composer from a lease, wait two seconds and close it.",
    result: "One new draft communication.",
    match: (o) => ({
      reproduced: o.newDrafts === 1,
      seen: `Composer ${o.composerShown ? "shown" : "not shown"}; draft communications ${o.draftsBefore} then ${o.draftsAfter}; writes while open: ${o.writesWhileOpen.join(", ") || "none"}.`,
    }),
  },
  {
    id: "W12-11",
    sequence: "Open the off-cycle lease and look for a control that clears the block.",
    result: "None exists; five readiness rows read Ready.",
    match: (o) => ({
      reproduced:
        o.offCycleNotice &&
        o.clearingControls === 0 &&
        o.clearingControlsAfterPrimary === 0 &&
        o.readyRows === 5,
      seen: `Off-cycle notice ${o.offCycleNotice ? "shown" : "absent"}; primary "${o.primary}"; ${o.readyRows} of ${o.readinessRows} readiness rows Ready; ${o.clearingControls} clearing control(s), ${o.clearingControlsAfterPrimary} after the primary; focus then on "${o.focusAfterPrimary?.label ?? "nothing"}".`,
    }),
  },
  {
    id: "W12-12",
    sequence: "Filter December to four of nine leases and click Prepare.",
    result: "All nine leases are prepared and the button names no count.",
    match: (o) => ({
      reproduced: o.leasesPrepared === 9 && !o.buttonNamesACount,
      seen: `Working batch filter controls ${o.workingBatchFilterControls}; "${o.monthlyRenewalsButton}"; the desk table filter "${o.filterTerm}" showed ${o.filteredShownOfMonth} of the ${o.monthlyLeases} monthly leases; back on the Working batch ${o.rowsShownAfterReturn} rows; button "${o.prepareButton}" (${o.targets} targets); ${o.leasesPrepared} lease(s) prepared, ${o.preparedOutsideFilter} outside the filter; ${o.comparisonRequests} comparison request(s).`,
    }),
  },
  {
    id: "W12-13",
    sequence:
      "Save a renewal start with no end, read the owner review, deliver the sole owner's reply and open the answer.",
    result:
      "No end date is offered, the message states no term, the coverage opens on base rent only and no owner is selected.",
    match: (o) => ({
      reproduced:
        o.startSaved &&
        !o.endDateOffered &&
        !o.ownerReview.statesATerm &&
        o.coverageChecked === "amount_only" &&
        !o.coverageOptions.includes("exact_terms") &&
        !o.ownerSelected,
      seen: `Start saved ${o.startSaved}; end suggestions ${o.endOffer.suggestionButtons}; the owner review states ${o.ownerReview.statesATerm ? `a term (${o.ownerReview.termPhrases.join(", ")})` : "no term"}; ${o.ownersOfRecord} owner(s) of record; the answer opened as the ${o.answerForm ?? "unknown"} form (primary "${o.answerPrimary}"), coverage ${o.coverageChecked ?? "none"} of ${o.coverageOptions.join("/") || "none"}, owner ${o.ownerSelected ? "selected" : "not selected"}, reply channel ${o.replyChannelOffered === null ? "n/a" : o.replyChannelOffered ? "offered" : "not offered"}.`,
    }),
  },
  {
    id: "W12-14",
    sequence:
      "Open the Owner Renewal Outreach Space and click Start run. Read the renewal Space cards.",
    result: '"Could not start a run." and a card that reads "Needs a process".',
    match: (o) => ({
      reproduced:
        o.startRunMessage === "Could not start a run." &&
        o.cardsReadingNeedsAProcess >= 1,
      seen: `Start run ${o.startRunShown ? `answered ${o.startRunStatus} and showed "${o.startRunMessage}"` : "not shown"}; renewal Space cards ${o.renewalSpaceCards.map((card) => `${card.name}: ${card.state}`).join("; ")}.`,
    }),
  },
];
/**
 * Rows that leave every lease another row uses as the seeds made it, so the next row needs no
 * reset: W12-06 only reads and moves focus, W12-11 changes only the off-cycle lease, W12-14 adds a
 * process Draft no other row reads, and W12-09 serves the fixture's Sheet cells again when done.
 */
const LEAVES_STATE = new Set(["W12-06", "W12-11", "W12-14", "W12-09"]);
/** The order rows run in: the ones that change nothing first, Prepare (every lease) last. */
const RUN_ORDER = [
  "W12-06",
  "W12-11",
  "W12-14",
  "W12-09",
  "W12-01",
  "W12-02",
  "W12-03",
  "W12-04",
  "W12-05",
  "W12-07",
  "W12-08",
  "W12-10",
  "W12-13",
  "W12-12",
];

// ---- The rehearsal, the fixture and the kit -----------------------------------------------------

const { mix, identity: fixture } = rehearsalFixture(rehearsal);
const leaseFacts = (leaseId) => {
  const row = mix.leases.find((entry) => String(entry.lease.leaseID) === String(leaseId));
  return row
    ? {
        leaseId: Number(leaseId),
        rent: Number(row.unit.rent),
        endDate: row.lease.endDate,
      }
    : null;
};
const leases = {
  ...Object.fromEntries(
    Object.entries(rehearsal.roles).map(([role, leaseId]) => [role, leaseFacts(leaseId)]),
  ),
  byId: leaseFacts,
};
const kit = createStaffKit({ rehearsal, origin, mix });
const output = join(runDir, "november-12-baseline.json");
const notes = join(runDir, "november-12-baseline-notes.log");
const note = (line) =>
  appendFileSync(notes, `${new Date().toISOString()} ${String(line).slice(0, 2000)}\n`);
process.on("unhandledRejection", (error) => note(`late rejection: ${String(error)}`));

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true,
});
const results = [];
const startedAt = new Date().toISOString();

/** A signed-in page in a fresh context that refuses every request off the rehearsal's origin. */
async function signedInPage(role, writes, contexts) {
  const context = await browser.newContext({
    viewport: WIDE,
    colorScheme: "light",
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
  contexts.push(context);
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      let body = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = null;
      }
      writes.push({
        role,
        path: url.pathname,
        ...(body && typeof body === "object"
          ? {
              kind:
                body.action?.kind ?? body.action ?? body.kind ?? body.operation ?? null,
              ...(body.field ? { field: body.field } : {}),
            }
          : {}),
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  await kit.signIn(page, role);
  return page;
}

function summarizeWrites(writes) {
  const counts = {};
  for (const write of writes) {
    const key = `${write.role} ${write.path}${write.kind ? ` ${write.kind}` : ""}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function writeRecord(finished) {
  const refused = refusedConnections(rehearsal);
  const ran = results.map((row) => row.id);
  const record = {
    purpose:
      "S284 R-S284-1: the fail-first table reproduced on the serving baseline before any product edit",
    baseline: BASELINE,
    servedSource: rehearsal.servedVersion,
    servedMatchesBaseline: rehearsal.servedVersion === BASELINE.source,
    harness: {
      commit: run.harness_sha,
      uncommitted: run.harness_uncommitted,
      namedCommit: run.named_commit,
    },
    runId: run.run_id,
    fixture,
    rehearsal: {
      mode: rehearsal.compiled ? "compiled" : "development",
      mailAdapter: rehearsal.mailAdapter,
      automaticComparisonHeld: rehearsal.automaticComparisonHeld,
      roles: rehearsal.roles,
      seeds: (rehearsal.seeds ?? []).map(({ name, state }) => ({ name, state })),
    },
    startedAt,
    finishedAt: finished ? new Date().toISOString() : null,
    only,
    resetBetweenRows: resetting,
    complete: finished && !only && TABLE.every((row) => ran.includes(row.id)),
    refusedConnections: refused.length,
    refusedHosts: [...new Set(refused.map((entry) => entry.host ?? entry.refused))],
    reproduced: results.filter((row) => row.reproduced === true).map((row) => row.id),
    notReproduced: results.filter((row) => row.reproduced !== true).map((row) => row.id),
    rows: TABLE.flatMap((definition) =>
      results.filter((row) => row.id === definition.id),
    ),
    human: "NOT RUN — no human observer",
  };
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

let dirty = false;
try {
  for (const id of RUN_ORDER) {
    if (only && !only.includes(id)) continue;
    const definition = TABLE.find((row) => row.id === id);
    const journey = W12_JOURNEYS[id];
    const writes = [];
    const contexts = [];
    const pages = [];
    const started = Date.now();
    const boundaryBefore = refusedConnections(rehearsal).length;
    let resetSeconds = null;
    const resetState = async () => {
      const at = Date.now();
      const seeds = await resetRehearsalState({ rehearsal, browser });
      for (const page of pages) {
        if (page.isClosed()) continue;
        await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
        await kit.signIn(page, page.__role ?? "Editor");
      }
      note(
        `${id} reset in ${Math.round((Date.now() - at) / 1000)} s: ${seeds.map((seed) => `${seed.name}=${seed.state}`).join(" ")}`,
      );
      return seeds;
    };
    try {
      if (resetting && dirty) {
        const at = Date.now();
        await resetState();
        resetSeconds = Math.round((Date.now() - at) / 1000);
      }
      const page = await signedInPage("Editor", writes, contexts);
      page.__role = "Editor";
      pages.push(page);
      const ctx = {
        kit,
        rehearsal,
        origin,
        leases,
        options,
        record: (entry) => note(`${id} ${JSON.stringify(entry)}`),
        resetState,
        newPage: async (role) => {
          const extra = await signedInPage(role, writes, contexts);
          extra.__role = role;
          pages.push(extra);
          return extra;
        },
      };
      const { observed, steps } = await journey(ctx, page);
      const compared = definition.match(observed);
      const row = {
        id,
        startingSequence: definition.sequence,
        baselineResult: definition.result,
        reproduced: compared.reproduced,
        seen: compared.seen,
        observed,
        steps,
        writes: summarizeWrites(writes),
        refusedConnections: refusedConnections(rehearsal).length - boundaryBefore,
        resetSeconds,
        seconds: Math.round((Date.now() - started) / 1000),
      };
      results.push(row);
      process.stdout.write(
        `${id}: ${row.reproduced ? "reproduced" : "NOT reproduced"} — ${row.seen}\n`.slice(
          0,
          2000,
        ),
      );
    } catch (error) {
      const row = {
        id,
        startingSequence: definition.sequence,
        baselineResult: definition.result,
        reproduced: false,
        seen: `The journey stopped before its observation: ${String(error?.message ?? error).slice(0, 900)}`,
        error: String(error?.stack ?? error)
          .split("\n")
          .filter((line, index) => index === 0 || /one-path-november-12-/.test(line))
          .slice(0, 6)
          .join(" | ")
          .slice(0, 1600),
        writes: summarizeWrites(writes),
        refusedConnections: refusedConnections(rehearsal).length - boundaryBefore,
        resetSeconds,
        seconds: Math.round((Date.now() - started) / 1000),
      };
      results.push(row);
      process.stdout.write(`${id}: stopped — ${row.seen}\n`.slice(0, 2000));
      for (const [index, page] of pages.entries())
        if (!page.isClosed())
          await page
            .screenshot({
              path: join(runDir, `${id}-stopped-${index}.png`),
              fullPage: false,
            })
            .catch(() => undefined);
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
      dirty = dirty || !LEAVES_STATE.has(id);
      writeRecord(false);
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  const record = writeRecord(true);
  process.stdout.write(
    `${JSON.stringify({
      runId: record.runId,
      servedSource: record.servedSource,
      harness: record.harness,
      complete: record.complete,
      reproduced: record.reproduced,
      notReproduced: record.notReproduced,
      refusedConnections: record.refusedConnections,
    })}\n`,
  );
}
process.exitCode = results.length > 0 ? 0 : 1;
