#!/usr/bin/env node
// S254 R-S254-4: control hooks for a running one-path rehearsal
// (scripts/run-renewal-one-path-rehearsal.sh --serve). Every command acts on that rehearsal's own
// loopback stand-ins, its Firestore emulator or its private run directory, and on nothing else.
//
//   node scripts/one-path-rehearsal-control.mjs [--run <run directory>] <command>
//
//   status                              where it serves, the five role leases, stand-in counts
//   mail                                every message and draft the mail stand-in holds
//   comparisons                         comparison requests by lease (L33)
//   allowance reached|open              the month's comparison allowance (L34)
//   reply [--to <address>] [--thread <id>] [--text <words>]
//                                       deliver an owner reply on a sent thread (L36)
//   next-send unconfirmed|unconfirmed-lost|bounce|normal
//                                       what happens to the next send only (L37, L38)
//   bounce [--to <address>] [--thread <id>]
//                                       return a failed delivery for a sent message (L38)
//   send-draft [--draft <id>]           staff sent the held draft from Gmail (L40)
//   rewording accept|echo [--once]      what the wording model returns (L44)
//   status-unreadable <lease id> missing|unresolved|clear
//                                       one lease's RentVine status (L09)
//   rentvine-outage <path>|clear        fail one RentVine read, for example leases/statuses
//   recording-cycles on|off             serve the recorded cycle dates of the renewed leases
//   sheet-cell <lease id> <column> <text>|clear
//                                       serve one operating Sheet cell of an existing row (S284)
//   owner-email <lease id> <address>|clear
//                                       serve another example.invalid address for the lease's
//                                       first owner, as RentVine would after a change (S284)
//   rentvine-latency <path> <ms>|clear  answer one RentVine read path slowly, at most 5000 ms (S284)
//   process-draft <definition id>       write a renewal process Draft with placeholder staff,
//                                       as the production process seed does (S284)
//   refused                             connections the provider boundary refused (L58)
//
// Without --run the newest run directory under ~/.local/state/pmi-kc-one-path-rehearsal is used.
// After a RentVine control, choose "Refresh data" on the Renewals desk: the app keeps its RentVine
// read until it is refreshed or runs out. After a reply or a bounce, the app shows it once the
// message's thread is read again.
import {
  bounceSentMessage,
  deliverOwnerReply,
  latestRunDir,
  readRehearsal,
  refusedConnections,
  sendHeldDraft,
  setComparisonAllowance,
  setNextSend,
  setRecordingCycles,
  setRentvineOutage,
  setOwnerEmail,
  setRentvineLatency,
  setRewording,
  setSheetCells,
  setStatusUnreadable,
  standInState,
} from "./lib/one-path-rehearsal/control.mjs";
import { seedRenewalProcessDraft } from "./lib/one-path-rehearsal/process-draft-seed.mjs";

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const [, value] = argv.splice(index, 2);
  return value;
};
const flag = (name) => {
  const index = argv.indexOf(name);
  if (index < 0) return false;
  argv.splice(index, 1);
  return true;
};
const usage = (message) => {
  process.stderr.write(
    `${message}\nSee the header of scripts/one-path-rehearsal-control.mjs for the commands.\n`,
  );
  process.exit(2);
};

const runDir = option("--run") ?? latestRunDir();
if (!runDir) usage("No rehearsal run directory was found; pass --run.");
const to = option("--to");
const threadId = option("--thread");
const text = option("--text");
const draftId = option("--draft");
const once = flag("--once");
const [command, first, second] = argv;
const rehearsal = readRehearsal(runDir);
const target = {
  ...(to ? { to } : {}),
  ...(threadId ? { threadId } : {}),
  ...(text ? { text } : {}),
};

let result;
if (command === "status") {
  const state = await standInState(rehearsal);
  result = {
    origin: rehearsal.origin,
    servedCommit: rehearsal.servedCommit,
    businessDate: rehearsal.businessDate,
    workingMonth: rehearsal.workingMonth,
    roles: rehearsal.roles,
    comparisonsByLease: state.comparison.comparisonsByLease,
    modelRequests: state.model.requests.length,
    nextSend: state.mail.nextSend,
    messagesKept: state.mail.mailboxes.reduce((sum, box) => sum + box.messages.length, 0),
    runDirectory: rehearsal.runDir,
  };
} else if (command === "mail") result = (await standInState(rehearsal)).mail;
else if (command === "comparisons") result = (await standInState(rehearsal)).comparison;
else if (command === "allowance" && ["reached", "open"].includes(first))
  result = await setComparisonAllowance(rehearsal, first === "reached");
else if (command === "reply") result = await deliverOwnerReply(rehearsal, target);
else if (command === "next-send" && first) result = await setNextSend(rehearsal, first);
else if (command === "bounce") result = await bounceSentMessage(rehearsal, target);
else if (command === "send-draft")
  result = await sendHeldDraft(rehearsal, draftId ? { draftId } : {});
else if (command === "rewording" && first)
  result = await setRewording(rehearsal, first, once);
else if (command === "status-unreadable" && first && second)
  result = setStatusUnreadable(rehearsal, first, second);
else if (command === "rentvine-outage" && first)
  result = setRentvineOutage(rehearsal, first === "clear" ? null : first);
else if (command === "recording-cycles" && ["on", "off"].includes(first))
  result = setRecordingCycles(rehearsal, first === "on");
else if (command === "sheet-cell" && first && second === "clear")
  result = setSheetCells(rehearsal, first, null);
else if (command === "sheet-cell" && first && second && argv[3] !== undefined)
  result = setSheetCells(rehearsal, first, { [second]: argv[3] });
else if (command === "rentvine-latency" && first === "clear")
  result = setRentvineLatency(rehearsal, null);
else if (command === "rentvine-latency" && first && second)
  result = setRentvineLatency(rehearsal, first, Number(second));
else if (command === "owner-email" && first && second)
  result = setOwnerEmail(rehearsal, first, second === "clear" ? null : second);
else if (command === "process-draft" && first)
  result = await seedRenewalProcessDraft(rehearsal, first);
else if (command === "refused") result = refusedConnections(rehearsal);
else usage(`Unknown or incomplete command: ${argv.join(" ") || "(none)"}`);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
