// S132 (F12): print the meeting preflight from effect-free local evidence.
//
// Reads only the checkout's git identity, the F08 pause flag from the process environment and the
// Dotloop OAuth configuration presence (environment only). Everything else is Not run unless an
// evidence file supplies it, because those checks are observed on the served application by a
// person. No provider is called, nothing is written, nothing is scheduled.
//
//   npm run meeting:preflight                         # local evidence only
//   npm run meeting:preflight -- --evidence temp/x.json --json
//
// The evidence file is a JSON object keyed by check id with { state, evidence, observedAtIso }.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { readDotloopOAuthConfig } from "../lib/connections/dotloop-oauth";
import {
  MEETING_PREFLIGHT_CHECK_IDS,
  projectMeetingPreflight,
  type MeetingCheckEvidence,
  type MeetingPreflight,
  type MeetingPreflightCheckId,
  type MeetingPreflightEvidence,
} from "../lib/lease-renewal/meeting-walkthrough";
import { SHEET_WRITEBACK_FLAG } from "../lib/lease-renewal/sheet-writeback-policy";

export interface LocalEvidenceDeps {
  readonly readGitHead: () => string | null;
  readonly env: Record<string, string | undefined>;
  readonly nowIso: () => string;
}

/** Effect-free local evidence: identity, the F08 pause flag and Dotloop configuration presence. */
export function gatherLocalEvidence(deps: LocalEvidenceDeps): MeetingPreflightEvidence {
  const now = deps.nowIso();
  const head = deps.readGitHead();
  const flag = deps.env[SHEET_WRITEBACK_FLAG]?.trim().toLowerCase();
  const paused = flag === undefined || flag === "" || flag === "false" || flag === "0";
  const dotloop = readDotloopOAuthConfig(deps.env);
  return {
    code_identity: head
      ? {
          state: "verified",
          evidence: `git HEAD ${head.slice(0, 12)}; serving revision per docs/status.md`,
          observedAtIso: now,
        }
      : {
          state: "failed",
          evidence: "git rev-parse HEAD returned nothing",
          observedAtIso: now,
        },
    sheet_writeback_pause: paused
      ? {
          state: "verified",
          evidence: `${SHEET_WRITEBACK_FLAG} reads ${flag ?? "unset"} in this process environment`,
          observedAtIso: now,
        }
      : {
          state: "failed",
          evidence: `${SHEET_WRITEBACK_FLAG} reads ${flag} in this process environment; F08 requires false`,
          observedAtIso: now,
        },
    dotloop_selection_keys: dotloop.configured
      ? {
          state: "pending_external_input",
          evidence:
            "OAuth configured; connection, selection and keys are observed on the Connections page",
          observedAtIso: now,
        }
      : {
          state: "pending_external_input",
          evidence: `Dotloop OAuth not configured: ${dotloop.missing.join(", ")}`,
          observedAtIso: now,
        },
  };
}

/** Merge a person's observed evidence over the local evidence; unknown ids and shapes are refused. */
export function mergeObservedEvidence(
  local: MeetingPreflightEvidence,
  observed: unknown,
): MeetingPreflightEvidence {
  if (observed === null || typeof observed !== "object" || Array.isArray(observed))
    throw new Error("The evidence file must be a JSON object keyed by check id.");
  const merged: Record<string, MeetingCheckEvidence | null> = { ...local };
  for (const [id, value] of Object.entries(observed as Record<string, unknown>)) {
    if (!MEETING_PREFLIGHT_CHECK_IDS.includes(id as MeetingPreflightCheckId))
      throw new Error(`Unknown preflight check: ${id}.`);
    if (value === null) {
      merged[id] = null;
      continue;
    }
    if (typeof value !== "object" || Array.isArray(value))
      throw new Error(`Check ${id} must be an object or null.`);
    const record = value as Record<string, unknown>;
    if (
      typeof record.state !== "string" ||
      typeof record.evidence !== "string" ||
      typeof record.observedAtIso !== "string"
    )
      throw new Error(`Check ${id} needs state, evidence and observedAtIso.`);
    merged[id] = {
      state: record.state as MeetingCheckEvidence["state"],
      evidence: record.evidence,
      observedAtIso: record.observedAtIso,
    };
  }
  return merged;
}

export function renderPreflight(preflight: MeetingPreflight): string {
  const lines = [
    `Meeting preflight generated ${preflight.generatedAtIso} (effect-free; nothing written, sent or scheduled)`,
    "",
  ];
  for (const item of preflight.items) {
    lines.push(`- ${item.label}: ${item.stateLabel}`);
    lines.push(
      `    evidence: ${item.evidence ?? "none supplied"}${item.observedAtIso ? ` (observed ${item.observedAtIso})` : ""}`,
    );
    if (item.state === "not_run")
      lines.push(`    how to gather: ${item.effectFreeSource}`);
  }
  lines.push("");
  lines.push(preflight.summary);
  for (const held of preflight.heldLiveSteps)
    lines.push(`  held: ${held.step.replace(/_/g, " ")} <- ${held.heldBy.join(", ")}`);
  return lines.join("\n");
}

function readGitHead(): string | null {
  try {
    return (
      execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() || null
    );
  } catch {
    return null;
  }
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = gatherLocalEvidence({
    readGitHead,
    env: process.env,
    nowIso: () => new Date().toISOString(),
  });
  const evidencePath = readArgument("--evidence");
  const evidence = evidencePath
    ? mergeObservedEvidence(local, JSON.parse(readFileSync(evidencePath, "utf8")))
    : local;
  const preflight = projectMeetingPreflight(evidence, new Date().toISOString());
  process.stdout.write(
    process.argv.includes("--json")
      ? `${JSON.stringify(preflight, null, 2)}\n`
      : `${renderPreflight(preflight)}\n`,
  );
}
