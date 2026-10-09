import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assert,
  continuity,
  date,
  DEFAULTS,
  git,
  hash,
  id as validateId,
  localDate,
  normalize,
  ROOT,
  safePath,
  saveJson,
} from "./store.mjs";

const STATES = new Set([
  "proposed",
  "specified",
  "implemented",
  "merged",
  "released",
  "configured",
  "observed",
  "pending",
]);
const PLAIN_COPY =
  /[\u2013\u2014\ufffd]|\b(?:seamless|leverage|delve|game.changer|unlock the|end-to-end)\b/i;
function text(value, name, maximum) {
  assert(
    typeof value === "string" && value.trim() && value.length <= maximum,
    `${name} must contain 1-${maximum} characters`,
  );
  assert(!PLAIN_COPY.test(value), `${name} contains prohibited wording or glyphs`);
  assert(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),
    `${name} contains control characters`,
  );
  return value;
}
export function collectContext(
  base,
  {
    root = ROOT,
    lane = "pack",
    meetingDate = localDate(),
    since,
    notes,
    refresh = true,
  } = {},
) {
  assert(["pack", "email"].includes(lane), "Invalid reporting lane");
  date(meetingDate);
  const remote = git(["remote", "get-url", "origin"], root);
  assert(
    /^(?:https:\/\/github\.com\/|git@github\.com:)josiahH-cf\/pmiKCkb_and_ownerRouter(?:\.git)?$/.test(
      remote,
    ),
    "Unexpected repository origin",
  );
  if (refresh) git(["fetch", "origin", "main"], root);
  const revision = git(["rev-parse", "origin/main"], root);
  assert(/^[a-f0-9]{40}$/.test(revision), "Exact main revision required");
  const cutoff = new Date().toISOString();
  const last = continuity(base)[lane];
  const start =
    since ??
    localDate(
      new Date(new Date(last?.cutoff ?? cutoff).getTime() - (last ? 2 : 14) * 86_400_000),
    );
  date(start);
  assert(start <= localDate(new Date(cutoff)), "Reporting baseline is in the future");
  const sources = DEFAULTS.source_paths.map((path, index) => {
    const raw = git(["show", `${revision}:${path}`], root, false);
    // Padding is removed, substantive rows are retained. No working-tree/private files are collected.
    return {
      id: `repo-${index + 1}`,
      kind: /facts|loop-state/.test(path) ? "release_evidence" : "project_document",
      path,
      revision,
      sha256: hash(raw),
      text: raw.replace(/[ \t]{2,}/g, " "),
      retrieved_at: cutoff,
    };
  });
  // UTC midnight is an inclusive lower bound for a Central date in either DST season.
  sources.push({
    id: "git-history",
    kind: "commit_history",
    revision,
    retrieved_at: cutoff,
    text: git(
      [
        "log",
        revision,
        `--since=${start}T00:00:00Z`,
        "--max-count=150",
        "--format=%H %cI %s",
      ],
      root,
    ),
  });
  if (notes) {
    assert(
      typeof notes.text === "string" && notes.text.trim() && notes.text.length <= 16_000,
      "Notes must contain 1-16000 characters",
    );
    sources.push({
      id: "owner-notes",
      kind: "owner_note",
      text: notes.text,
      retrieved_at: cutoff,
    });
  }
  const snapshot = {
    version: 1,
    client: DEFAULTS.client,
    timezone: DEFAULTS.timezone,
    lane,
    meeting_date: meetingDate,
    since: start,
    cutoff,
    previous: last ?? null,
    revision,
    sources,
    coverage: {
      repository: "read",
      gmail: "not_checked",
      calendar: "not_checked",
      live_health: "not_checked",
      billing: "not_checked",
    },
    dirty_checkout: Boolean(git(["status", "--porcelain"], root)),
  };
  snapshot.id = hash(snapshot);
  const path = safePath(base, "snapshots", `${snapshot.id}.json`);
  saveJson(path, snapshot, true);
  return { snapshot_id: snapshot.id, path, revision, coverage: snapshot.coverage };
}
export function loadSnapshot(base, snapshotId) {
  validateId(snapshotId);
  const path = safePath(base, "snapshots", `${snapshotId}.json`);
  const snapshot = JSON.parse(readFileSync(path, "utf8"));
  const { id, ...content } = snapshot;
  assert(hash(content) === id && id === snapshotId, "Snapshot integrity mismatch");
  return snapshot;
}
export function validateContent(content, snapshot) {
  assert(
    content.version === 1 && content.snapshot_id === snapshot.id,
    "Content must bind to the collected snapshot",
  );
  assert(
    content.date === snapshot.meeting_date,
    "Content date differs from meeting/report date",
  );
  assert(
    ["internal", "public"].includes(content.classification),
    "Content classification required",
  );
  text(content.objective, "Objective", 160);
  assert(
    Number.isInteger(content.minutes) && content.minutes >= 30 && content.minutes <= 180,
    "Meeting duration must be 30-180 minutes",
  );
  const sourceMap = new Map(snapshot.sources.map((source) => [source.id, source]));
  const check = (item, label) => {
    text(item.title, `${label} title`, 85);
    text(item.detail, `${label} detail`, 300);
    assert(STATES.has(item.state), `${label} has an invalid operational state`);
    assert(
      Array.isArray(item.evidence) && item.evidence.length > 0,
      `${label} needs source evidence`,
    );
    for (const evidence of item.evidence) {
      const source = sourceMap.get(evidence.source_id);
      assert(
        source &&
          normalize(evidence.quote).length >= 12 &&
          normalize(source.text).includes(normalize(evidence.quote)),
        `${label} evidence is absent from the source`,
      );
      if (item.state === "released")
        assert(
          source.kind === "release_evidence" && /released|deployed/i.test(evidence.quote),
          "Release claim needs explicit release evidence",
        );
      if (item.state === "observed")
        assert(
          source.kind === "human_observation" && source.observed_at,
          "Human observation needs actual dated observation evidence",
        );
    }
    if (item.owner) text(item.owner, "Owner", 60);
    if (item.next_action) text(item.next_action, "Next action", 200);
  };
  for (const [key, limit] of [
    ["changes", 4],
    ["next", 4],
    ["blockers", 4],
    ["workflow", 12],
  ]) {
    assert(
      Array.isArray(content[key]) && content[key].length <= limit,
      `Too many or missing ${key} items`,
    );
    for (const item of content[key]) check(item, key);
  }
  for (const blocker of content.blockers)
    assert(
      blocker.owner && blocker.next_action,
      "Blockers need an owner and next action; use Unassigned when unresolved",
    );
  assert(
    content.changes.length +
      content.next.length +
      content.blockers.length +
      content.workflow.length >
      0,
    "Replace the empty scaffold with evidenced content",
  );
  assert(
    Array.isArray(content.extra_slides) &&
      content.extra_slides.length <= DEFAULTS.max_extra_slides,
    "Invalid extra slides",
  );
  for (const slide of content.extra_slides) {
    text(slide.title, "Slide title", 85);
    assert(
      Array.isArray(slide.items) && slide.items.length > 0 && slide.items.length <= 4,
      "Extra slide needs 1-4 items",
    );
    slide.items.forEach((item) => check(item, "Extra slide"));
  }
  assert(
    Array.isArray(content.metrics) && content.metrics.length <= 2,
    "Invalid metrics",
  );
  for (const metric of content.metrics) {
    check(metric, "Metric");
    date(metric.measured_at);
    assert(
      metric.measured_at <= localDate(new Date(snapshot.cutoff)),
      "Metric measurement is in the future",
    );
    assert(
      metric.period && metric.scope && ["actual", "forecast"].includes(metric.type),
      "Metric needs period, scope and actual/forecast attribution",
    );
    text(metric.value, "Metric value", 35);
    text(metric.period, "Metric period", 45);
    text(metric.scope, "Metric scope", 80);
  }
  // Public publication is deliberately disabled. Classification alone never authorizes it.
  const copy = [
    content.objective,
    ...[
      ...content.changes,
      ...content.next,
      ...content.blockers,
      ...content.workflow,
      ...content.metrics,
      ...content.extra_slides.flatMap((slide) => slide.items),
    ].flatMap((item) => [
      item.title,
      item.detail,
      item.owner,
      item.next_action,
      item.value,
      item.scope,
      item.period,
    ]),
  ].join(" ");
  assert(
    !/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(copy),
    "Client copy must not contain private email addresses",
  );
  return content;
}
export function agenda(minutes) {
  const weights = [10, 5, 5, 45, 15];
  const durations = weights.map((weight) => Math.floor((minutes * weight) / 80));
  durations[3] += minutes - durations.reduce((a, b) => a + b, 0);
  return durations;
}
export function contentExample(snapshot) {
  // A scaffold is only a schema guide. It must be replaced from real evidence before generation.
  return {
    version: 1,
    snapshot_id: snapshot.id,
    date: snapshot.meeting_date,
    classification: "internal",
    objective: "Review current changes and agree next actions",
    minutes: DEFAULTS.default_minutes,
    changes: [],
    next: [],
    blockers: [],
    workflow: [],
    metrics: [],
    extra_slides: [],
  };
}
export function baselineFor(base, lane) {
  return existsSync(join(base, "continuity.json")) ? continuity(base)[lane] : undefined;
}
