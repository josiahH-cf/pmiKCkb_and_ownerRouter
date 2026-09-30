import { resolveBrowserExecutable as findBrowserExecutable } from "./lib/browser-executable.mjs";
// S141 integrated check of the connected Dashboard and the shared email refinement route against
// the local rehearsal (live read-only data, the configured model, demo Admin sign-in).
//
// 1. Record parity: a Dashboard question and a follow-up must report the same total as the desk's
//    own filtered view that the answer links to, and every listed record must appear in that view.
// 2. Refinement route: two successive instructions refine a draft for a real maintenance ticket
//    through the real route, record facts and model (the second starts from the first result).
//    The renewal surface must refuse without a saved preparation instead of guessing its facts.
//
// Nothing is saved, drafted or sent: the rehearsal refuses writes, and this check fails if the page
// posts anywhere except sign-in, the assistant and refinement. Output is counts, statuses and
// outcome categories only, never record text, names or message wording.

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

const baseUrlInput =
  readArgument("--base-url") ?? process.env.DESK_BROWSER_BASE_URL?.trim();
if (!baseUrlInput) {
  throw new Error(
    "DESK_BROWSER_BASE_URL is required and must point to the running local rehearsal server.",
  );
}
const baseUrl = requireLocalRehearsalOrigin(baseUrlInput);
const ROUTE_BUDGET_MS = 90_000;
const ALLOWED_POSTS = new Set([
  "/api/auth/demo",
  "/api/assistant/query",
  "/api/email-refinement",
]);
// Synthetic draft wording: it carries no customer value, so any value in a proposal must come from
// the ticket's own facts or be refused by the server.
const SYNTHETIC_OWNER_NOTICE =
  "Hello,\n\nA repair request came in for your property. We are reviewing it and will share the next steps soon.\n\nThank you,\nPMI KC Metro";

const artifactDir = join(process.cwd(), "temp", "connected-ai-browser-s141");
mkdirSync(artifactDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: findBrowserExecutable(),
  headless: true,
});

const results = {};
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(ROUTE_BUDGET_MS);
  page.setDefaultTimeout(ROUTE_BUDGET_MS);
  const posts = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
  });

  await signIn(page);
  results.parity = await verifyDashboardParity(page);
  results.refinement = await verifyRefinementRoute(page, results.parity.firstLeaseId);
  delete results.parity.firstLeaseId;

  const unexpectedPosts = posts.filter((path) => !ALLOWED_POSTS.has(path));
  assert(
    unexpectedPosts.length === 0,
    `The check posted outside sign-in, the assistant and refinement: ${unexpectedPosts.join(", ")}`,
  );
  results.posts = [...new Set(posts)];
  results.saved = false;
  await context.close();
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(results)}\n`);

async function verifyDashboardParity(page) {
  const checks = [];
  let conversation = null;
  let firstLeaseId = null;
  for (const question of [
    "Which renewals come up next month?",
    "Which of those are blocked?",
  ]) {
    const answer = await postJson(page, "/api/assistant/query", {
      question,
      conversation,
    });
    assert(answer.status === 200, `The assistant returned HTTP ${answer.status}.`);
    conversation = answer.payload.conversation;
    const group = answer.payload.groups.find((entry) => entry.source === "renewals");
    assert(group, `No renewals group answered: ${question}`);
    assert(group.link?.href, `The renewals answer had no desk link: ${question}`);
    const listedIds = group.items.map((item) => leaseIdFrom(item.href));
    assert(
      listedIds.every(Boolean),
      "A listed renewal did not link to its lease workspace.",
    );
    firstLeaseId ??= listedIds[0] ?? null;
    await page.goto(`${baseUrl}${group.link.href}`, { waitUntil: "domcontentloaded" });
    const count = page.locator(".renewal-table-count");
    await count.waitFor({ timeout: ROUTE_BUDGET_MS });
    const countText = await count.innerText();
    const matching = Number(/Matching:\s*(\d+)/.exec(countText)?.[1]);
    const deskIds = new Set(
      (
        await page
          .locator("a.renewal-lease-link")
          .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")))
      )
        .map((href) => leaseIdFrom(href))
        .filter(Boolean),
    );
    const listedOnDesk = listedIds.filter((id) => deskIds.has(id)).length;
    checks.push({
      question,
      interpretedBy: answer.payload.interpretedBy,
      continued: Boolean(
        answer.payload.interpretation?.some((line) =>
          /Continuing from your last question/.test(line),
        ),
      ),
      groupStatus: group.status,
      answerTotal: group.total,
      listed: listedIds.length,
      deskMatching: matching,
      deskPartial: /partial portfolio read/.test(countText),
      listedOnDesk,
      parity: group.total === matching && listedOnDesk === listedIds.length,
    });
  }
  for (const check of checks) {
    assert(
      check.parity,
      `Dashboard/desk parity failed for "${check.question}": answer ${check.answerTotal}, desk ${check.deskMatching}, listed on desk ${check.listedOnDesk}/${check.listed}.`,
    );
  }
  assert(
    checks[1].continued,
    "The follow-up question did not continue the previous answer's conversation.",
  );
  return { checks, firstLeaseId };
}

async function verifyRefinementRoute(page, leaseId) {
  const out = {};
  if (leaseId) {
    const renewal = await postJson(page, "/api/email-refinement", {
      surface: "renewal_message",
      leaseId,
      channel: "owner",
      currentBody: "Hello,\n\nThank you.",
      instruction: "Make it warmer.",
    });
    out.renewalWithoutSavedPreparation = {
      httpStatus: renewal.status,
      refused:
        renewal.status === 409 && /save this message/i.test(renewal.payload.error ?? ""),
    };
    assert(
      out.renewalWithoutSavedPreparation.refused,
      "The renewal surface refined a message that has no saved preparation.",
    );
  }

  await page.goto(`${baseUrl}/maintenance`, { waitUntil: "domcontentloaded" });
  const cards = page.locator('[id^="maintenance-ticket-"]');
  await cards.first().waitFor({ timeout: ROUTE_BUDGET_MS });
  const cardId = await cards.first().getAttribute("id");
  const ticketRef = cardId?.slice("maintenance-ticket-".length);
  assert(ticketRef, "The maintenance queue listed no ticket.");

  const iterations = [];
  let body = SYNTHETIC_OWNER_NOTICE;
  for (const instruction of ["Make it more formal.", "Make it shorter."]) {
    const started = Date.now();
    const response = await postJson(page, "/api/email-refinement", {
      surface: "maintenance_owner_notice",
      ticketRef,
      currentBody: body,
      instruction,
    });
    const elapsedMs = Date.now() - started;
    assert(
      response.status === 200,
      `The refinement route returned HTTP ${response.status}.`,
    );
    assert(
      response.payload.version === "email-refinement/v1",
      "The refinement route did not answer with its versioned contract.",
    );
    const revised = response.payload.status === "revised";
    iterations.push({
      instructionKind: instruction === "Make it shorter." ? "shorter" : "formal",
      status: response.payload.status,
      elapsedMs,
      changed: revised ? response.payload.body !== body : false,
      shorter: revised ? response.payload.body.length < body.length : null,
      requestedValues: revised ? response.payload.requestedValues.length : 0,
      removedValues: revised ? response.payload.removedValues.length : 0,
    });
    // The next instruction starts from the newest accepted text, as the screens do.
    if (revised) body = response.payload.body;
    else break;
  }
  out.ownerNotice = { iterations };
  return out;
}

async function postJson(page, path, body) {
  return page.evaluate(
    async ({ path: target, body: payload }) => {
      const response = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return {
        status: response.status,
        payload: await response.json().catch(() => ({})),
      };
    },
    { path, body },
  );
}

function leaseIdFrom(href) {
  return /\/lease-renewal\/live\/desk\/lease\/([^/?#]+)/.exec(href ?? "")?.[1] ?? null;
}

async function signIn(page) {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  const signedIn = await page.evaluate(async () => {
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "Admin" }),
    });
    return response.ok;
  });
  assert(signedIn, "Local rehearsal Admin sign-in did not complete.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readArgument(name) {
  const joined = process.argv
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .trim();
  if (joined) return joined;
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  return value || undefined;
}

function requireLocalRehearsalOrigin(value) {
  let candidate;
  try {
    candidate = new URL(value);
  } catch {
    throw new Error(
      "DESK_BROWSER_BASE_URL must be an explicit loopback HTTP local-rehearsal origin.",
    );
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (
    candidate.protocol !== "http:" ||
    !loopbackHosts.has(candidate.hostname.toLowerCase()) ||
    candidate.username !== "" ||
    candidate.password !== "" ||
    candidate.pathname !== "/" ||
    candidate.search !== "" ||
    candidate.hash !== ""
  ) {
    throw new Error(
      "DESK_BROWSER_BASE_URL must be an explicit loopback HTTP local-rehearsal origin.",
    );
  }
  return candidate.origin;
}
