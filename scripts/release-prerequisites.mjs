// Fresh, read-only admission evidence. Provider responses never leave memory; only verdicts persist.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertNativeReleaseRuntime } from "./release-control.mjs";

export const PREREQUISITE_SCHEMA = "pmi-kc-release-prerequisites.v1";
const PROJECT = "pmi-kc-kb-prod";
const ACCOUNT = "01A5A3-65CA5A-614D45";
const PRINCIPAL = "josiah@pmikcmetro.com";
const PROJECT_NUMBER = "558870356522";
const TOPIC = `projects/${PROJECT}/topics/budget-guardrail-topic`;
const CHANNELS = ["16287730102411889527", "13690954259271761585"].map(
  (id) => `projects/${PROJECT}/notificationChannels/${id}`,
);
const BUDGETS = {
  alert: "15ddc8d6-e96e-4696-9d3c-c09e23997206",
  stop: "033af8c0-8f21-48af-b89b-0632896e5018",
  account: "82962d7e-b340-4253-8348-38caff16e88a",
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exactChannels = (value) =>
  Array.isArray(value) && same([...value].sort(), [...CHANNELS].sort());

/** Exact existing controls; unknown, duplicate, incomplete and changed responses all refuse. */
export function costControlsReady({ budgets, guardrail, topic, channels }) {
  if (!Array.isArray(budgets) || !Array.isArray(channels) || channels.length !== 2)
    return false;
  for (const [kind, id] of Object.entries(BUDGETS)) {
    const matches = budgets.filter(
      (b) => b.name === `billingAccounts/${ACCOUNT}/budgets/${id}`,
    );
    if (matches.length !== 1) return false;
    const budget = matches[0];
    const amount = budget.amount?.specifiedAmount;
    if (
      amount?.currencyCode !== "USD" ||
      String(amount.units) !== (kind === "alert" ? "25" : "100") ||
      Number(amount.nanos ?? 0) !== 0 ||
      budget.amount?.lastPeriodAmount !== undefined
    )
      return false;
    if (
      budget.budgetFilter?.calendarPeriod !== "MONTH" ||
      budget.budgetFilter.creditTypesTreatment !== "INCLUDE_ALL_CREDITS"
    )
      return false;
    if (
      kind === "account"
        ? (budget.budgetFilter.projects?.length ?? 0) !== 0
        : !same(budget.budgetFilter.projects, [`projects/${PROJECT_NUMBER}`])
    )
      return false;
    // Restricting services, labels or credits silently narrows the ceiling's coverage.
    if (
      Object.keys(budget.budgetFilter).some(
        (key) => !["calendarPeriod", "creditTypesTreatment", "projects"].includes(key),
      )
    )
      return false;
    const thresholds = budget.thresholdRules;
    if (
      !Array.isArray(thresholds) ||
      thresholds.some((r) => r.spendBasis !== "CURRENT_SPEND") ||
      !same(
        thresholds.map((r) => r.thresholdPercent).sort(),
        kind === "stop" ? [0.5, 0.9, 1] : [1],
      )
    )
      return false;
    const notifications = budget.notificationsRule;
    if (kind === "stop") {
      if (notifications?.pubsubTopic !== TOPIC || notifications.schemaVersion !== "1.0")
        return false;
    } else if (
      !exactChannels(notifications?.monitoringNotificationChannels) ||
      notifications.pubsubTopic
    )
      return false;
  }
  return (
    guardrail?.state === "ACTIVE" &&
    guardrail.buildConfig?.runtime === "nodejs22" &&
    guardrail.serviceConfig?.environmentVariables?.KILL_SWITCH_CAP_USD === "100" &&
    guardrail.eventTrigger?.pubsubTopic === TOPIC &&
    topic?.name === TOPIC &&
    CHANNELS.every(
      (name) =>
        channels.filter(
          (c) => c.name === name && c.type === "email" && c.enabled === true,
        ).length === 1,
    )
  );
}

export function prerequisiteAuthenticationReady(auth) {
  const items = Array.isArray(auth?.items) ? auth.items : [];
  const ready = (credential) => {
    const matches = items.filter((item) => item.credential === credential);
    return (
      matches.length === 1 &&
      matches[0].state === "ok" &&
      matches[0].identity === PRINCIPAL
    );
  };
  return {
    auth_cli_adc:
      auth?.exitCode === 0 && ready("gcloud") && ready("adc") ? "ready" : "blocked",
    admin_browser:
      auth?.exitCode === 0 &&
      ready("canary") &&
      items.find((item) => item.credential === "canary")?.label === "admin"
        ? "ready"
        : "blocked",
  };
}

function defaultExec(file, args, { root }) {
  return execFileSync(file, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
function durableWrite(path, value, flag) {
  const fd = openSync(path, flag, 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Called under release.lock immediately before admission. This function cannot authorize effects. */
export async function collectReleasePrerequisites({
  root,
  stateDir,
  permit,
  assertHeld,
  assertRuntime = assertNativeReleaseRuntime,
  now = Date.now,
  exec = defaultExec,
}) {
  if (
    !root ||
    !stateDir ||
    typeof assertHeld !== "function" ||
    permit?.state !== "prepared" ||
    !/^[a-f0-9]{40}$/.test(permit.sha) ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(permit.runId)
  )
    throw new Error("release_prerequisite_target_invalid");
  assertHeld();
  assertRuntime();
  const read = async (file, args) => {
    assertHeld();
    const value = JSON.parse(await exec(file, args, { root }));
    assertHeld();
    return value;
  };
  const checkedAt = new Date(typeof now === "function" ? now() : now).toISOString();
  const gcloud = (args, format = "json") =>
    read("gcloud", [...args, `--format=${format}`, "--quiet"]);
  const checks = {
    auth_cli_adc: "blocked",
    admin_browser: "blocked",
    billing: "blocked",
    cost_controls: "blocked",
  };
  try {
    const auth = await read(process.execPath, [
      "scripts/auth/ensure.mjs",
      "--need=gcloud,adc",
      "--unattended",
      "--json",
    ]);
    checks.auth_cli_adc = prerequisiteAuthenticationReady(auth).auth_cli_adc;
  } catch {
    /* No credential, URL, provider body or raw command error enters the receipt. */
  }
  // No cloud command follows a failed approved CLI/ADC probe.
  if (checks.auth_cli_adc === "ready") {
    try {
      const auth = await read(process.execPath, [
        "scripts/auth/ensure.mjs",
        "--need=canary",
        "--unattended",
        "--json",
        "--origins=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app",
        `--admin-profile=${join(homedir(), "pmi-assurance", "owner-admin")}`,
        `--admin-email=${PRINCIPAL}`,
      ]);
      checks.admin_browser = prerequisiteAuthenticationReady(auth).admin_browser;
    } catch {
      /* Attended enrollment is a hold, never an automatic login loop. */
    }
    try {
      const billing = await gcloud(
        ["beta", "billing", "projects", "describe", PROJECT],
        "json(projectId,billingEnabled,billingAccountName)",
      );
      if (
        billing.projectId === PROJECT &&
        billing.billingEnabled === true &&
        billing.billingAccountName === `billingAccounts/${ACCOUNT}`
      )
        checks.billing = "ready";
    } catch {
      /* Fail closed. */
    }
    try {
      const [budgets, guardrail, topic, ...channels] = await Promise.all([
        gcloud([
          "billing",
          "budgets",
          "list",
          `--billing-account=${ACCOUNT}`,
          `--billing-project=${PROJECT}`,
        ]),
        gcloud(
          [
            "functions",
            "describe",
            "budget-guardrail",
            "--gen2",
            "--region=us-central1",
            `--project=${PROJECT}`,
          ],
          "json(state,buildConfig.runtime,serviceConfig.environmentVariables.KILL_SWITCH_CAP_USD,eventTrigger.pubsubTopic)",
        ),
        gcloud(["pubsub", "topics", "describe", TOPIC], "json(name)"),
        ...CHANNELS.map((name) =>
          gcloud(
            ["beta", "monitoring", "channels", "describe", name, `--project=${PROJECT}`],
            "json(name,type,enabled)",
          ),
        ),
      ]);
      if (costControlsReady({ budgets, guardrail, topic, channels }))
        checks.cost_controls = "ready";
    } catch {
      /* Fail closed without printing raw config. */
    }
  }
  const receipt = {
    schemaVersion: PREREQUISITE_SCHEMA,
    runId: permit.runId,
    sha: permit.sha,
    checkedAt,
    checks,
  };
  assertHeld();
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const history = join(
    stateDir,
    `prerequisites-${receipt.checkedAt.replaceAll(":", "-")}-${randomUUID()}.json`,
  );
  durableWrite(history, receipt, "wx");
  const path = join(stateDir, "prerequisites.json"),
    temporary = `${path}.${randomUUID()}.tmp`;
  durableWrite(temporary, receipt, "wx");
  renameSync(temporary, path);
  if (process.platform !== "win32") {
    const dir = openSync(stateDir, "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  }
  return { receipt, path };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { acquireWatcherLock } = await import("./release-lock.mjs");
  const {
    defaultReleaseStateRoot,
    readReleasePermit,
    releaseHead,
    assertReleaseAdmission,
  } = await import("./release-control.mjs");
  let release;
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url))),
      stateDir = defaultReleaseStateRoot();
    release = await acquireWatcherLock(stateDir);
    const permit = readReleasePermit(stateDir);
    assertReleaseAdmission({ sha: releaseHead(root), permit, prepared: true });
    const { receipt } = await collectReleasePrerequisites({
      root,
      stateDir,
      permit,
      assertHeld: release.assertHeld,
    });
    release.assertHeld();
    for (const [name, verdict] of Object.entries(receipt.checks))
      console.log(`${name}: ${verdict}`);
    process.exitCode = Object.values(receipt.checks).every((value) => value === "ready")
      ? 0
      : 1;
  } catch {
    console.error(
      "Release prerequisites blocked; inspect the prepared permit, exact head, free lock and attended authentication.",
    );
    process.exitCode = 1;
  } finally {
    if (release) await release();
  }
}
