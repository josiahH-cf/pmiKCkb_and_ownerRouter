import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultBaseUrl = "http://localhost:3000";
const defaultHostedBaseUrl = "https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app";
const operatorDir = join(root, "temp", "demo-operator");
const pidFile = join(operatorDir, "dev-server.json");
const devLogFile = join(operatorDir, "dev-server.log");
const linksFile = join(operatorDir, "demo-links.html");
const summaryFile = join(operatorDir, "latest-run.json");
const defaultTimeoutMs = 90000;
const liveAskCases = [
  {
    question: "When do we contact the owner versus the tenant during a renewal?",
    space: "lease-renewals",
  },
  {
    question:
      "How should maintenance intake handle missing photos and vendor assignment?",
    space: "maintenance-work-order-intake",
  },
  {
    question:
      "How should move-out handling track inspections, vendor bids, and deposit-sensitive decisions?",
    space: "move-out-deposit-disposition",
  },
  {
    question:
      "What owner onboarding checklist details must be confirmed before a property is ready?",
    space: "owner-onboarding",
  },
];
const demoLinks = [
  {
    label: "Sign In",
    note: "Click Continue in local demo mode.",
    path: "/sign-in",
  },
  {
    label: "Ask",
    note: 'Ask "What is the lease renewal process?"',
    path: "/ask",
  },
  {
    label: "Spaces",
    note: "Open the four approved workflow Spaces.",
    path: "/spaces",
  },
  {
    label: "Lease Renewals",
    note: "Show source-backed SOP, template, tool, and placeholder records.",
    path: "/spaces/lease-renewals",
  },
  {
    label: "Maintenance Work Order Intake",
    note: "Show intake, missing-photo handling, and vendor-assignment boundaries.",
    path: "/spaces/maintenance-work-order-intake",
  },
  {
    label: "Move-Out + Deposit Disposition",
    note: "Show inspection, vendor-bid, and deposit-sensitive escalation boundaries.",
    path: "/spaces/move-out-deposit-disposition",
  },
  {
    label: "Owner Onboarding",
    note: "Show checklist-heavy onboarding before Rentvine is fully ready.",
    path: "/spaces/owner-onboarding",
  },
  {
    label: "Approval Queue",
    note: "Show the seeded v1 queue, Activity, and one approval if the show needs workflow action.",
    path: "/approval-queue",
  },
  {
    label: "Admin",
    note: "Show Ask volume, queue depth, source states, and setup health.",
    path: "/admin",
  },
];

export function parseDemoOperatorArgs(argv = process.argv.slice(2)) {
  const readArg = (name) => {
    const prefix = `${name}=`;
    const arg = argv.find((entry) => entry.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  return {
    baseUrl: readArg("--base-url") ?? defaultBaseUrl,
    dryRun: hasArg(argv, "--dry-run"),
    hostedBaseUrl: readArg("--hosted-base-url") ?? defaultHostedBaseUrl,
    includeHostedReadiness: hasArg(argv, "--include-hosted-readiness"),
    mode: normalizeMode(readArg("--mode") ?? "test-run"),
    noOpenBrowser: hasArg(argv, "--no-open-browser"),
    offlineLocal: hasArg(argv, "--offline-local"),
    skipInstall: hasArg(argv, "--skip-install"),
    timeoutMs: Number(readArg("--timeout-ms") ?? defaultTimeoutMs),
    useExistingServer: hasArg(argv, "--use-existing-server"),
  };
}

export function buildDemoOperatorPlan(options = {}) {
  const config = {
    baseUrl: options.baseUrl ?? defaultBaseUrl,
    hostedBaseUrl: options.hostedBaseUrl ?? defaultHostedBaseUrl,
    includeHostedReadiness: Boolean(options.includeHostedReadiness),
    mode: normalizeMode(options.mode ?? "test-run"),
    noOpenBrowser: Boolean(options.noOpenBrowser),
    offlineLocal: Boolean(options.offlineLocal),
    skipInstall: Boolean(options.skipInstall),
    timeoutMs: Number(options.timeoutMs ?? defaultTimeoutMs),
    useExistingServer: Boolean(options.useExistingServer),
  };
  const steps = [];

  if (config.mode === "test-run") {
    if (!config.skipInstall) {
      steps.push(commandStep("Install dependencies", ["install"]));
    }

    if (!config.offlineLocal) {
      steps.push(commandStep("Check local host tooling", ["run", "host:check"]));
      steps.push(commandStep("Reset demo data", ["run", "demo:reset"]));
    }

    steps.push(ensureServerStep(config));
    steps.push(waitUrlStep(config));
    steps.push(
      commandStep("Run local workflow smoke", [
        "run",
        "smoke:demo-live",
        "--",
        `--base-url=${config.baseUrl}`,
        `--timeout-ms=${config.timeoutMs}`,
        ...(config.offlineLocal ? ["--no-reset", "--allow-local-fallback"] : []),
      ]),
    );
    steps.push(
      commandStep("Dry-run launch skeleton seed", [
        "run",
        "seed:launch-skeletons",
        "--",
        "--dry-run",
      ]),
    );
    steps.push(...hostedReadinessSteps(config));
    steps.push(generateLinksStep(config));
    pushOpenSteps(steps, config);
  }

  if (config.mode === "showtime") {
    if (!config.offlineLocal) {
      steps.push(commandStep("Reset demo data before show", ["run", "demo:reset"]));
    }

    steps.push(ensureServerStep(config));
    steps.push(waitUrlStep(config));
    steps.push(
      commandStep("Run quick local workflow smoke", [
        "run",
        "smoke:demo-live",
        "--",
        `--base-url=${config.baseUrl}`,
        `--timeout-ms=${config.timeoutMs}`,
        ...(config.offlineLocal ? ["--no-reset", "--allow-local-fallback"] : []),
      ]),
    );

    if (!config.offlineLocal) {
      steps.push(commandStep("Reset demo data after smoke", ["run", "demo:reset"]));
    }

    steps.push(generateLinksStep(config));
    pushOpenSteps(steps, config);
  }

  if (config.mode === "teardown") {
    if (!config.offlineLocal) {
      steps.push(commandStep("Reset demo data after show", ["run", "demo:reset"]));
    }

    steps.push({
      name: "Stop operator-started dev server",
      type: "stop-server",
    });
  }

  return {
    artifacts: {
      devLogFile,
      linksFile,
      operatorDir,
      pidFile,
      summaryFile,
    },
    config,
    steps,
  };
}

export function generateDemoLinksHtml(baseUrl = defaultBaseUrl) {
  const linkItems = demoLinks
    .map((link) => {
      const href = `${baseUrl}${link.path}`;
      return [
        "<li>",
        `<a href="${escapeHtml(href)}">${escapeHtml(link.label)}</a>`,
        `<p>${escapeHtml(link.note)}</p>`,
        "</li>",
      ].join("");
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PMI KC KB Demo Operator Links</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; line-height: 1.4; max-width: 920px; }
    h1 { margin-bottom: 8px; }
    li { margin: 14px 0; }
    a { color: #064f8f; font-weight: 700; }
    p { margin: 4px 0 0; color: #333; }
    .note { border-left: 4px solid #c9a227; padding-left: 12px; color: #222; }
  </style>
</head>
<body>
  <h1>PMI KC KB Demo Operator Links</h1>
  <p class="note">Use the local demo sign-in, then walk top to bottom. This demo writes only to the KB demo editable layer.</p>
  <ol>
${linkItems}
  </ol>
</body>
</html>
`;
}

export async function runDemoOperatorPlan(plan, deps = {}) {
  const events = [];
  const runStep = async (step) => {
    events.push({ name: step.name, stage: "start", type: step.type });
    console.log(`\n== ${step.name} ==`);

    if (step.type === "command") {
      await runCommand(step.command, step.args, {
        cwd: root,
        env: step.env,
        ...deps,
      });
    } else if (step.type === "ensure-server") {
      await ensureDevServer(plan.config, deps);
    } else if (step.type === "wait-url") {
      await waitForUrl(`${plan.config.baseUrl}/sign-in`, plan.config.timeoutMs);
    } else if (step.type === "generate-links") {
      mkdirSync(operatorDir, { recursive: true });
      writeFileSync(linksFile, generateDemoLinksHtml(plan.config.baseUrl), "utf8");
      console.log(`Demo links: ${linksFile}`);
    } else if (step.type === "open") {
      await openTarget(step.target, deps);
    } else if (step.type === "stop-server") {
      await stopOperatorServer(deps);
    } else {
      throw new Error(`Unknown demo operator step type: ${step.type}`);
    }

    events.push({ name: step.name, stage: "complete", type: step.type });
  };

  for (const step of plan.steps) {
    await runStep(step);
  }

  mkdirSync(operatorDir, { recursive: true });
  writeFileSync(
    summaryFile,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        config: plan.config,
        events,
      },
      null,
      2,
    ),
    "utf8",
  );

  return events;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseDemoOperatorArgs(argv);
  const plan = buildDemoOperatorPlan(args);

  if (args.dryRun) {
    printPlan(plan);
    return;
  }

  await runDemoOperatorPlan(plan);
  printReady(plan);
}

function commandStep(name, args, env) {
  return {
    args,
    command: npmCommand(),
    env,
    name,
    type: "command",
  };
}

function ensureServerStep(config) {
  return {
    baseUrl: config.baseUrl,
    name: config.useExistingServer
      ? "Use existing local dev server"
      : "Start or reuse local dev server",
    type: "ensure-server",
  };
}

function waitUrlStep(config) {
  return {
    name: `Wait for ${config.baseUrl}/sign-in`,
    type: "wait-url",
  };
}

function generateLinksStep(config) {
  return {
    baseUrl: config.baseUrl,
    name: "Generate operator links page",
    path: linksFile,
    type: "generate-links",
  };
}

function hostedReadinessSteps(config) {
  if (!config.includeHostedReadiness) {
    return [];
  }

  return [
    commandStep("Verify hosted Google sign-in", [
      "run",
      "smoke:auth-live",
      "--",
      `--base-url=${config.hostedBaseUrl}`,
      "--pause-on-human",
      `--timeout-ms=${config.timeoutMs * 2}`,
    ]),
    ...liveAskCases.map((testCase) =>
      commandStep(`Verify hosted live Ask: ${testCase.space}`, [
        "run",
        "smoke:ask-live",
        "--",
        `--base-url=${config.hostedBaseUrl}`,
        "--browser-session",
        `--space=${testCase.space}`,
        `--question=${testCase.question}`,
        `--timeout-ms=${config.timeoutMs}`,
      ]),
    ),
  ];
}

function pushOpenSteps(steps, config) {
  if (config.noOpenBrowser) {
    return;
  }

  steps.push({
    name: "Open operator links page",
    target: pathToFileURL(linksFile).href,
    type: "open",
  });
  steps.push({
    name: "Open local demo sign-in",
    target: `${config.baseUrl}/sign-in`,
    type: "open",
  });
}

async function ensureDevServer(config, deps = {}) {
  if (await isUrlReady(`${config.baseUrl}/sign-in`)) {
    console.log(`Local app is already reachable at ${config.baseUrl}.`);
    return;
  }

  if (config.useExistingServer) {
    throw new Error(
      `No existing local dev server is reachable at ${config.baseUrl}. Start it or rerun without --use-existing-server.`,
    );
  }

  mkdirSync(operatorDir, { recursive: true });
  const logFd = deps.openSync
    ? deps.openSync(devLogFile, "a")
    : openSync(devLogFile, "a");
  const devCommand = commandInvocation(npmCommand(), ["run", "dev"]);
  const child = (deps.spawn ?? spawn)(devCommand.command, devCommand.args, {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      APP_BASE_URL: config.baseUrl,
      ASK_DEMO_MODE: "true",
      ...(config.offlineLocal ? offlineLocalEnv() : {}),
      LOCAL_DEMO_AUTH: "true",
    },
    shell: false,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });

  child.unref?.();
  writeFileSync(
    pidFile,
    JSON.stringify(
      {
        baseUrl: config.baseUrl,
        command: "npm run dev",
        devLogFile,
        pid: child.pid,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Started local dev server pid ${child.pid}. Log: ${devLogFile}`);
  await waitForUrl(`${config.baseUrl}/sign-in`, config.timeoutMs);
}

function offlineLocalEnv() {
  return {
    FIREBASE_PROJECT_ID: "",
    GCLOUD_PROJECT: "",
    GCP_PROJECT_ID: "",
    GOOGLE_APPLICATION_CREDENTIALS: "",
    GOOGLE_CLOUD_PROJECT: "",
    GOOGLE_CLOUD_QUOTA_PROJECT: "",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "",
    SPACE_DRIVE_FOLDER_IDS: "{}",
    SPACE_VERTEX_DATA_STORE_IDS: "{}",
  };
}

async function stopOperatorServer(deps = {}) {
  if (!existsSync(pidFile)) {
    console.log("No operator-started dev server PID file found.");
    return;
  }

  const record = JSON.parse(readFileSync(pidFile, "utf8"));
  const pid = Number(record.pid);

  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`Invalid operator PID file: ${pidFile}`);
  }

  if (process.platform === "win32") {
    await runCommand("taskkill", ["/PID", String(pid), "/T", "/F"], {
      allowFailure: true,
      ...deps,
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }

  rmSync(pidFile, { force: true });
  console.log(`Stopped operator-started dev server pid ${pid}.`);
}

async function runCommand(command, args, options = {}) {
  const spawnImpl = options.spawn ?? spawn;
  const invocation = commandInvocation(command, args);

  await new Promise((resolvePromise, reject) => {
    const child = spawnImpl(invocation.command, invocation.args, {
      cwd: options.cwd ?? root,
      env: {
        ...process.env,
        ...(options.env ?? {}),
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolvePromise();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`));
      }
    });
  });
}

function commandInvocation(command, args) {
  if (process.platform !== "win32") {
    return { args, command };
  }

  return {
    args: ["/d", "/s", "/c", quoteWindowsCommand(command, args)],
    command: "cmd.exe",
  };
}

function quoteWindowsCommand(command, args) {
  return [command, ...args].map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(value) {
  const text = String(value);

  if (/^[A-Za-z0-9._:/=@-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '\\"')}"`;
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        console.log(`${url} is reachable.`);
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(1000);
  }

  throw new Error(
    `${url} was not reachable within ${timeoutMs}ms. ${
      lastError instanceof Error ? lastError.message : ""
    }`,
  );
}

async function isUrlReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function openTarget(target, deps = {}) {
  console.log(`Open: ${target}`);

  if (deps.openTarget) {
    await deps.openTarget(target);
    return;
  }

  const command =
    process.platform === "win32"
      ? "powershell.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["-NoProfile", "-Command", "Start-Process", target]
      : [target];

  await runCommand(command, args, { allowFailure: true });
}

function printPlan(plan) {
  console.log(
    JSON.stringify(
      {
        artifacts: plan.artifacts,
        config: plan.config,
        steps: plan.steps.map((step) => ({
          args: step.args,
          command: step.command,
          name: step.name,
          target: step.target,
          type: step.type,
        })),
      },
      null,
      2,
    ),
  );
}

function printReady(plan) {
  if (plan.config.mode === "showtime") {
    console.log("\nREADY TO DEMO");
    console.log(`1. Open ${plan.config.baseUrl}/sign-in`);
    console.log("2. Click Continue in local demo mode.");
    console.log(`3. Use the link page if needed: ${linksFile}`);
  }

  if (plan.config.mode === "test-run") {
    console.log("\nTEST RUN COMPLETE");
    console.log(`Operator links: ${linksFile}`);
  }

  if (plan.config.mode === "teardown") {
    console.log("\nTEARDOWN COMPLETE");
  }
}

function normalizeMode(mode) {
  const normalized = String(mode).trim().toLowerCase().replace(/_/g, "-");

  if (["test-run", "testrun", "test"].includes(normalized)) {
    return "test-run";
  }

  if (["showtime", "show-time", "show"].includes(normalized)) {
    return "showtime";
  }

  if (["teardown", "tear-down", "cleanup"].includes(normalized)) {
    return "teardown";
  }

  throw new Error(`Unsupported demo operator mode: ${mode}`);
}

function hasArg(argv, name) {
  return argv.includes(name);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
