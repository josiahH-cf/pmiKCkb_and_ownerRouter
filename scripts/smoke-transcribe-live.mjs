import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Live Dictate smoke (S13 Wave 3 G4). Proves the deployed transcribe endpoint works end to end:
// speech.googleapis.com enabled, auth valid, the STT seam wired. It POSTs a tiny COMMITTED SYNTHETIC
// audio fixture (scripts/fixtures/synthetic-speech.wav, ~4 KB, no PII) and PASSES on HTTP 200 with a
// `transcript` field (empty transcript is fine — a synthetic tone has no words; the point is the
// pipeline runs). A 503 fails with the real cause (the G1 error detail: api_disabled / auth /
// encoding). OWNER-RUN: enabling the API + running this live are owner steps; the script is built here.
//
//   npm run smoke:transcribe-live -- --base-url=<endpoint> --browser-session   # deployed (real session)
//   npm run smoke:transcribe-live                                              # localhost demo auth

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const localEnv = readLocalEnv();
const baseUrl = readArg("--base-url") ?? "http://localhost:3000";
const route = readArg("--route") ?? "/api/ask/transcribe";
const fixturePath = resolve(
  readArg("--fixture") ?? join(root, "scripts/fixtures/synthetic-speech.wav"),
);
const timeoutMs = Number(readArg("--timeout-ms") ?? 30000);
const artifactDir = resolve(readArg("--artifacts") ?? "temp/live-transcribe-smoke");
const profileDir = resolve(readArg("--profile") ?? "temp/live-auth-profile");
const useBrowserSession = hasArg("--browser-session");
const headless = !hasArg("--headed");
const cookieName =
  readArg("--cookie-name") ?? readEnv("AUTH_SESSION_COOKIE") ?? "__session";
const sessionCookie = readArg("--session-cookie") ?? "local-demo";

mkdirSync(artifactDir, { recursive: true });

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(fixturePath)) {
    throw new Error(`Audio fixture not found at ${fixturePath}.`);
  }
  await assertServerReady();

  const audioBase64 = readFileSync(fixturePath).toString("base64");
  const cookieHeader = useBrowserSession
    ? await readBrowserSessionCookie()
    : `${cookieName}=${sessionCookie}`;

  const response = await fetchWithTimeout(`${baseUrl}${route}`, {
    body: JSON.stringify({ audioBase64, mimeType: "audio/wav" }),
    headers: { "content-type": "application/json", cookie: cookieHeader },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  writeFileSync(
    join(artifactDir, "result.json"),
    JSON.stringify(
      { baseUrl, route, status: response.status, response: payload },
      null,
      2,
    ),
    "utf8",
  );

  if (!response.ok) {
    const detail = payload?.error ? ` ${payload.error}` : "";
    const code = payload?.error_code ? ` [${payload.error_code}]` : "";
    throw new Error(
      `Live transcribe smoke failed with HTTP ${response.status}${code}.${detail} ` +
        `If error_code is api_disabled, enable speech.googleapis.com. See ${join(artifactDir, "result.json")}.`,
    );
  }

  if (typeof payload.transcript !== "string") {
    throw new Error(
      `Live transcribe smoke returned 200 but no transcript field. See ${join(artifactDir, "result.json")}.`,
    );
  }

  console.log(
    `Live transcribe smoke passed (HTTP 200, transcript length ${payload.transcript.length}). Speech-to-Text is reachable. Artifacts: ${artifactDir}`,
  );
}

async function readBrowserSessionCookie() {
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: findBrowserExecutable(),
    headless,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(`${baseUrl}/ask`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/sign-in")) {
      throw new Error(
        [
          "No signed-in browser session is available for the deployed app.",
          `Run npm run smoke:auth-live -- --base-url=${baseUrl} --pause-on-human first, then rerun with --browser-session.`,
        ].join(" "),
      );
    }
    const cookies = await context.cookies(baseUrl);
    const session = cookies.find((cookie) => cookie.name === cookieName);
    if (!session?.value) {
      throw new Error(`Signed-in browser session did not contain ${cookieName}.`);
    }
    return `${cookieName}=${session.value}`;
  } finally {
    await context.close();
  }
}

async function assertServerReady() {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/sign-in`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `App is not reachable at ${baseUrl}. Start it (or pass the deployed --base-url) before running this smoke. ${
        error instanceof Error ? error.message : ""
      }`,
    );
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function readEnv(name) {
  return process.env[name] || localEnv[name];
}

function readLocalEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, ".env.local"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator === -1) return null;
          const key = line.slice(0, separator).trim();
          const value = line
            .slice(separator + 1)
            .trim()
            .replace(/^"|"$/g, "");
          return [key, value];
        })
        .filter(Boolean),
    );
  } catch {
    return {};
  }
}

function readArg(name) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function findBrowserExecutable() {
  const explicit = process.env.PLAYWRIGHT_CHROME_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const candidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          join(
            process.env.LOCALAPPDATA ?? "",
            "Microsoft\\Edge\\Application\\msedge.exe",
          ),
        ]
      : [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ];
  const executablePath = candidates.find(
    (candidate) => candidate && existsSync(candidate),
  );
  if (!executablePath) {
    throw new Error(
      "No Chrome or Edge executable found. Set PLAYWRIGHT_CHROME_PATH to a browser executable.",
    );
  }
  return executablePath;
}
