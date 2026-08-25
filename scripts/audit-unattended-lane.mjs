// Unattended human-audit lane for model-audit run `20260817T104500Z-model-audit`.
//
// Authorized by FB-HVSESSION-012 (owner supersede of FB-HVSESSION-003, 2026-08-24) and specified by
// S69 AC-S69-24 through AC-S69-31. This module is audit-lane tooling, NOT an application change: it
// touches no provider effect, Action Registry gate, firestore.rules, IAM, billing, scope, credential,
// or destructive operation. It is a set of pure evaluators so the rules can be unit-tested against
// fabricated fixtures without a browser, a network, or a live target.
//
// The four rules that matter, and why each exists:
//   1. Target readback (AC-S69-25). Four consecutive sessions burned on HV-002 because a candidate
//      Pass was accepted while the browser was actually on `/` or `/sign-in`. A mismatch is a named
//      blocker, never a Pass.
//   2. Bodyless evidence (AC-S69-26). An unattended vision-driven controller sees real rents,
//      addresses, and resident names on every page. Only the allowlisted field set may be written
//      down, and a rejection names the offending KEY without echoing its value.
//   3. Terminal no-downgrade (AC-S69-27). HV-001 and HV-012 are terminal `pass`; a conflicting
//      incoming value blocks rather than overwrites.
//   4. Effect boundary (AC-S69-28/29). Effect-bearing items stop at their confirmation control;
//      committed effects carry a reversal proven by readback in the same run.

import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------------------------
// HV triage table (AC-S69-24)
// ---------------------------------------------------------------------------------------------

export const TRIAGE_CLASSES = Object.freeze([
  "browser_executable_no_effect",
  "owner_decision",
  "second_party_required",
  "hardware_required",
  "effect_gated",
  "terminal",
]);

export const HV_IDS = Object.freeze([
  "HV-001",
  "HV-002",
  "HV-003",
  "HV-004",
  "HV-005",
  "HV-006",
  "HV-007",
  "HV-008",
  "HV-009",
  "HV-010",
  "HV-011",
  "HV-012",
]);

/** One class per id. Disposition prose is bodyless and carries no customer value. */
export const HV_TRIAGE = Object.freeze({
  "HV-001": { class: "terminal", disposition: "pass; never replayed, never downgraded" },
  "HV-002": {
    class: "effect_gated",
    disposition:
      "refused/escalated: the confirmation boundary is severity-dependent and absent on Low/Medium",
  },
  "HV-003": {
    class: "second_party_required",
    disposition: "needs a second managed identity at their own keyboard",
  },
  "HV-004": { class: "owner_decision", disposition: "batch packet" },
  "HV-005": { class: "owner_decision", disposition: "batch packet" },
  "HV-006": { class: "hardware_required", disposition: "needs a microphone" },
  "HV-007": {
    class: "effect_gated",
    disposition:
      "refused/escalated: no reversal control on 4 of 5 legs; 2 legs touch real Live records",
  },
  "HV-008": {
    class: "effect_gated",
    disposition:
      "refused: no-autonomous-client-facing-send invariant + irreversible durable association",
  },
  "HV-009": {
    class: "effect_gated",
    disposition:
      "refused/escalated: no watch-stop path exists, so the reversal readback is unproducible",
  },
  "HV-010": { class: "owner_decision", disposition: "batch packet" },
  "HV-011": { class: "owner_decision", disposition: "batch packet" },
  "HV-012": { class: "terminal", disposition: "pass; never replayed, never downgraded" },
});

/**
 * Ids the runner may never commit, regardless of fixture, flag, or prompt.
 *
 * Corrected 2026-08-24 after adversarial verification falsified the premises Q2=C rested on. The
 * owner authorized committing HV-002, HV-007 and HV-009 on the understanding that each had a real
 * confirmation boundary and a provable reversal. None of the three does:
 *
 *  - HV-007's "create-and-clean, reversal proven" is false on four of five legs: the shipped UI has
 *    no reversal control (forward-only ticket lifecycle, no placeholder removal, no un-resolve, no
 *    mark-unread), and two legs operate on real Live operational records rather than fixtures.
 *  - HV-009 is not "only a push-watch": one confirm produces an app-plane claim written BEFORE the
 *    provider call, the provider mutation, and an ongoing external push channel. No watch-stop path
 *    exists anywhere in the product, so the AC-S69-29 reversal readback is UNPRODUCIBLE — and the
 *    item's own pass state (watch active) contradicts the required reversal state (stopped).
 *  - HV-008 remains refused. The grounds are broadened: the blanket no-autonomous/scheduled/bulk/
 *    model-triggered client-facing-send invariant, PLUS an irreversible durable Production
 *    association that is created before any send. Citing D33 alone was too narrow to be accurate.
 *
 * A refusal here is not a failure of the item; it is the lane declining to manufacture a reversal
 * it cannot prove.
 */
export const REFUSED_IDS = Object.freeze({
  "HV-007":
    "reversal unproducible — no reversal control exists for 4 of 5 legs, and 2 legs touch real Live operational records",
  "HV-008":
    "blanket no-autonomous-client-facing-send invariant, plus an irreversible durable Production association created before any send",
  "HV-009":
    "reversal unproducible — no watch-stop path exists in the product, and the item's pass state (active) contradicts the required reversal state (stopped)",
});

export function evaluateTriageTable(triage = HV_TRIAGE) {
  const problems = [];
  const seen = new Set();

  for (const [id, entry] of Object.entries(triage)) {
    if (!HV_IDS.includes(id)) {
      problems.push(`Triage table declares unknown verification id ${id}.`);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`Triage table assigns ${id} more than once.`);
    }
    seen.add(id);

    const classes = Array.isArray(entry?.class) ? entry.class : [entry?.class];
    const named = classes.filter(Boolean);
    if (named.length !== 1) {
      problems.push(
        `Triage table must assign exactly one class to ${id}; it assigns ${named.length}.`,
      );
      continue;
    }
    if (!TRIAGE_CLASSES.includes(named[0])) {
      problems.push(`Triage table assigns ${id} the unknown class "${named[0]}".`);
    }
  }

  for (const id of HV_IDS) {
    if (!seen.has(id)) {
      problems.push(`Triage table is missing verification id ${id}.`);
    }
  }

  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------
// Target readback (AC-S69-25)
// ---------------------------------------------------------------------------------------------

/** Pathnames that previously produced false candidate Passes. Never a valid item target. */
export const NEVER_A_TARGET = Object.freeze(["/", "/sign-in"]);

export function verifyTarget({ readback, expected }) {
  const problems = [];
  if (!readback || typeof readback !== "object") {
    return {
      ok: false,
      blocker: "TARGET_READBACK_MISSING",
      problems: ["No target readback supplied."],
    };
  }

  if (NEVER_A_TARGET.includes(readback.pathname)) {
    return {
      ok: false,
      blocker: "TARGET_NOT_ACQUIRED",
      problems: [
        `Readback pathname is "${readback.pathname}", which is a setup surface, not an item target. This is a blocker, not a candidate Pass.`,
      ],
    };
  }

  if (readback.origin !== expected.origin)
    problems.push("Origin does not match the expected target.");
  if (readback.pathname !== expected.pathname)
    problems.push("Pathname does not match the expected target.");
  if (readback.managedDomain !== true)
    problems.push("Managed-domain boolean is not true.");
  if (readback.adminRoleVisible !== true)
    problems.push("Admin role is not visible on the target.");
  if (readback.demoAuthDisabled !== true)
    problems.push("Demo auth is not proven disabled.");

  return problems.length === 0
    ? { ok: true, blocker: null, problems: [] }
    : { ok: false, blocker: "TARGET_MISMATCH", problems };
}

// ---------------------------------------------------------------------------------------------
// Bodyless evidence recorder (AC-S69-26)
// ---------------------------------------------------------------------------------------------

export const ALLOWED_EVIDENCE_FIELDS = Object.freeze([
  "origin",
  "pathname",
  "controlText",
  "headingText",
  "statusCode",
  "redirected",
  "managedDomain",
  "adminRoleVisible",
  "demoAuthDisabled",
  "count",
  "observedAt",
  "revision",
  "environment",
  "targetChanged",
  "errorClass",
  "stopReason",
]);

/**
 * Value-shape probes. These catch a leak that arrives under an ALLOWED key — e.g. a street address
 * pasted into `headingText`. Every problem message names the key only; the value is never echoed.
 */
const LEAK_PROBES = Object.freeze([
  { name: "email address", test: (v) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(v) },
  {
    name: "currency value",
    test: (v) => /\$\s?\d/.test(v) || /\b\d{3,4}\.\d{2}\b/.test(v),
  },
  // House number, then up to three directional/name words, then a street suffix — the shape a
  // fixed N3 address label produces. Deliberately broad: a false positive costs one rejected
  // evidence field, a false negative writes a customer address to disk.
  {
    name: "street address",
    test: (v) =>
      /\b\d+\s+(?:[A-Za-z][A-Za-z.'-]*\s+){1,3}(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West|St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Ter|Terrace|Pl|Place|Way|Cir|Circle|Hwy|Highway|Pkwy|Parkway)\b/i.test(
        v,
      ),
  },
  {
    name: "credential or token material",
    test: (v) =>
      /\b(?:bearer|authorization|cookie|session|token|password|secret|api[_-]?key|refresh[_-]?token|id[_-]?token)\b/i.test(
        v,
      ),
  },
  {
    name: "OAuth query material",
    test: (v) => /[?&](?:code|state|access_token|id_token|client_secret|scope)=/i.test(v),
  },
  {
    name: "screenshot or capture path",
    test: (v) =>
      /\.(?:png|jpe?g|webp|gif|pdf|har)\b/i.test(v) ||
      /golden-data\/|client_docs\/|model-audit-[^\s]*\/out\//i.test(v),
  },
  {
    name: "page body",
    test: (v) => v.length > 240 || /<\/?(?:html|body|div|span|table|script)\b/i.test(v),
  },
]);

export function recordEvidence(fields, { targetVerified = null } = {}) {
  const problems = [];
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return {
      ok: false,
      problems: ["Evidence record must be an object of allowlisted fields."],
      record: null,
    };
  }

  // EV-02: the recorder and the target check originally shared no state, so an evidence record could
  // be written while the browser sat on a setup surface — the exact four-session false-Pass
  // mechanism, reproduced against this module. Writing evidence now REQUIRES a verified target.
  if (targetVerified !== true) {
    problems.push(
      "Evidence cannot be recorded without a verified target: pass { targetVerified: true } only after verifyTarget() has returned ok for this item.",
    );
  }
  if (NEVER_A_TARGET.includes(fields.pathname)) {
    problems.push(
      `Evidence carries pathname "${fields.pathname}", which is a setup surface, not an item target. Refusing to record.`,
    );
  }

  const record = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_EVIDENCE_FIELDS.includes(key)) {
      // Name the key, never the value — the value is exactly what must not be written down.
      problems.push(
        `Evidence field "${key}" is not on the bodyless allowlist; it is rejected without being recorded.`,
      );
      continue;
    }
    if (typeof value === "string") {
      for (const probe of LEAK_PROBES) {
        if (probe.test(value)) {
          problems.push(
            `Evidence field "${key}" looks like ${probe.name}; it is rejected without being recorded.`,
          );
          break;
        }
      }
    }
    if (!problems.some((p) => p.includes(`"${key}"`))) {
      record[key] = value;
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    record: problems.length === 0 ? record : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Terminal-safe response merge (AC-S69-27)
// ---------------------------------------------------------------------------------------------

export const TERMINAL_STATUSES = Object.freeze([
  "pass",
  "fail",
  "blocked",
  "skipped",
  "refused",
]);

export function mergeHumanResults({ existing, incoming }) {
  const problems = [];
  const byId = new Map();
  for (const item of existing ?? []) byId.set(item.verification_id, { ...item });

  for (const next of incoming ?? []) {
    const id = next.verification_id;
    const current = byId.get(id);
    if (!current) {
      problems.push(`Incoming result for unknown verification id ${id}.`);
      continue;
    }
    const currentTerminal = TERMINAL_STATUSES.includes(current.status);
    if (currentTerminal && next.status !== current.status) {
      // Bodyless diagnostic: ids and statuses only.
      problems.push(
        `${id} is terminal at "${current.status}" and the incoming result says "${next.status}". Blocking rather than downgrading.`,
      );
      continue;
    }
    byId.set(id, { ...current, ...next });
  }

  return {
    ok: problems.length === 0,
    problems,
    merged: problems.length === 0 ? [...byId.values()] : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Per-item stop rules (AC-S69-28) and reversal proof (AC-S69-29)
// ---------------------------------------------------------------------------------------------

/**
 * Whether a confirmation control actually stands between the action and the durable write.
 *
 * This is the single most dangerous assumption the lane originally made. On the renewal review
 * surface the confirmation dialog is SEVERITY-DEPENDENT: `requiresAdmin` is true only for High and
 * Blocked flags. On a Low or Medium flag there is no dialog at all — `requestSubmit` falls straight
 * through to `performSubmit`, which POSTs `/api/lease-renewal/resolve`. On those cards the "Resolve"
 * button IS the commit control.
 *
 * So "advance to the confirmation boundary and stop" is not a universally safe instruction. Where no
 * boundary exists, the only safe outcome is to refuse to approach at all.
 */
export function hasSafeBoundary({ severity }) {
  return severity === "High" || severity === "Blocked";
}

export function planItem({
  id,
  triage = HV_TRIAGE,
  confirmControlReachable = false,
  severity = null,
}) {
  const entry = triage[id];
  if (!entry) return { id, outcome: "unknown_id", reason: `No triage entry for ${id}.` };

  if (REFUSED_IDS[id]) {
    // No fixture, flag, or prompt changes this.
    return { id, outcome: "refused", reason: REFUSED_IDS[id] };
  }

  switch (entry.class) {
    case "terminal":
      return { id, outcome: "already_terminal", reason: entry.disposition };
    case "owner_decision":
      return { id, outcome: "batch_packet", reason: entry.disposition };
    case "second_party_required":
    case "hardware_required":
      return { id, outcome: entry.class, reason: entry.disposition };
    case "effect_gated": {
      // A boundary claim is only honest where a boundary exists. When severity is unknown, the lane
      // must assume the worst rather than the convenient case.
      if (severity === null) {
        return {
          id,
          outcome: "no_safe_boundary",
          reason:
            "Severity is unknown, so it cannot be established that a confirmation control stands between the action and the durable write. Refusing to approach.",
        };
      }
      if (!hasSafeBoundary({ severity })) {
        return {
          id,
          outcome: "no_safe_boundary",
          reason: `Severity "${severity}" has no confirmation dialog — the primary action control commits directly. There is no boundary to stop at, so the runner does not approach it.`,
        };
      }
      return {
        id,
        outcome: "stopped_at_boundary",
        reason: confirmControlReachable
          ? "Confirmation control is reachable; stopping at the boundary by specification."
          : entry.disposition,
      };
    }
    case "browser_executable_no_effect":
      return { id, outcome: "executable", reason: entry.disposition };
    default:
      return { id, outcome: "unknown_class", reason: `Unknown class "${entry.class}".` };
  }
}

export function evaluateReversal({ id, effectCommitted, reversalReadback }) {
  if (!effectCommitted) return { ok: true, problems: [] };
  if (reversalReadback === "absent" || reversalReadback === "stopped") {
    return { ok: true, problems: [] };
  }
  return {
    ok: false,
    problems: [
      `${id} committed an effect whose reversal readback is "${reversalReadback}" rather than absent/stopped. An unreversed effect is a failure, not a pass.`,
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Owner batch packet (AC-S69-30)
// ---------------------------------------------------------------------------------------------

export const OWNER_DECISION_IDS = Object.freeze(["HV-004", "HV-005", "HV-010", "HV-011"]);

/**
 * Ids escalated into the packet because the lane refused to commit them and they therefore have no
 * other route to terminal. TRI-02: HV-002's own governing decision routes its terminality "through
 * the batch packet", but the packet builder originally rejected it, leaving the item with no
 * terminal channel at all. A refused effect-gated item must still be able to reach the owner.
 */
export const ESCALATED_IDS = Object.freeze(["HV-002", "HV-007", "HV-009"]);

export function buildBatchPacket(entries, { includeEscalated = false } = {}) {
  const problems = [];
  const byId = new Map((entries ?? []).map((e) => [e.id, e]));
  const permitted = includeEscalated
    ? [...OWNER_DECISION_IDS, ...ESCALATED_IDS]
    : [...OWNER_DECISION_IDS];

  for (const id of OWNER_DECISION_IDS) {
    const entry = byId.get(id);
    if (!entry) {
      problems.push(`Batch packet is missing owner-decision id ${id}.`);
      continue;
    }
    for (const field of [
      "question",
      "findings",
      "recommendation",
      "effectOfEachChoice",
    ]) {
      if (!entry[field] || String(entry[field]).trim() === "") {
        problems.push(`Batch packet entry ${id} is missing "${field}".`);
      }
    }
  }
  for (const id of byId.keys()) {
    if (!permitted.includes(id)) {
      problems.push(
        `Batch packet carries ${id}, which is neither an owner-decision id nor an escalated refused id.`,
      );
      continue;
    }
    if (OWNER_DECISION_IDS.includes(id)) continue;
    // An escalated id earns no lower bar: it must carry the same four fields.
    for (const field of [
      "question",
      "findings",
      "recommendation",
      "effectOfEachChoice",
    ]) {
      const entry = byId.get(id);
      if (!entry[field] || String(entry[field]).trim() === "") {
        problems.push(`Escalated packet entry ${id} is missing "${field}".`);
      }
    }
  }

  return { ok: problems.length === 0, problems, emissions: 1 };
}

// ---------------------------------------------------------------------------------------------
// Interruption recovery (AC-S69-31)
// ---------------------------------------------------------------------------------------------

export function reconcileAfterInterruption({ results, interruptedId }) {
  const problems = [];
  const item = (results ?? []).find((r) => r.verification_id === interruptedId);
  if (!item) {
    problems.push(`Interrupted id ${interruptedId} is absent from the response set.`);
    return { ok: false, problems };
  }
  if (item.status !== "not_run") {
    problems.push(
      `Interrupted id ${interruptedId} reads "${item.status}"; an interrupted item must remain not_run rather than claim a completion.`,
    );
  }
  return { ok: problems.length === 0, problems };
}

export function evaluateCleanExit({ blockers, heldResources }) {
  const problems = [];
  if ((blockers ?? []).length !== 1) {
    problems.push(
      `A control-unavailable exit must emit exactly one named blocker; it emitted ${(blockers ?? []).length}.`,
    );
  }
  for (const resource of heldResources ?? []) {
    problems.push(
      `Exit left "${resource}" held open; the run must end without a keepalive, browser process, local server, or held-open shell.`,
    );
  }
  return { ok: problems.length === 0, problems };
}

// ---------------------------------------------------------------------------------------------

export function main() {
  const triage = evaluateTriageTable();
  if (!triage.ok) {
    for (const problem of triage.problems) console.error(`AUDIT-LANE: ${problem}`);
    process.exitCode = 1;
    return triage;
  }
  console.log(
    `Audit-lane triage table passed: ${HV_IDS.length} verification ids, one class each, ${Object.keys(REFUSED_IDS).length} refused id(s).`,
  );
  return triage;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
