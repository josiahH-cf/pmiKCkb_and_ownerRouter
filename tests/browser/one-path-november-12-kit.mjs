// S284 R-S284-1 / R-S284-2: the shared kit of the November 12 staff workflow journeys. Every
// action goes through a control staff can see; every read is a page read, a GET route, the
// rehearsal's own Firestore emulator or a stand-in's state. Outside parties act only through the
// stand-in hooks and time passes only through the worker tick helper. Nothing here posts an app
// route: the app's own controls make every request, and the kit only waits for their answers.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  refusedConnections,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { runDueMessageTick } from "../../scripts/lib/one-path-rehearsal/due-message-tick.mjs";
import {
  NOVEMBER_5_MIX_PATH,
  loadNovember5Mix,
  readNovember5Mix,
} from "../../scripts/lib/one-path-rehearsal/november-5-mix.mjs";
import { DESK, createKit, plainValue } from "./one-path-november-10-kit.mjs";

export { DESK };
export const SEQUENCES_ROUTE = "/api/gmail-hub/sequences";
export const WORKSPACE_ROUTE = "/api/lease-renewal/workspace";
export const WORKING_ROUTE = "/api/lease-renewal/working-record";
export const PREPARATION_ROUTE = "/api/lease-renewal/message-preparation";
export const KICKOFF_ROUTE = "/api/lease-renewal/kickoff-preparation";
export const REFRESH_ROUTE = "/api/lease-renewal/refresh";
export const SEQUENCES_COLLECTION = "gmail_communication_sequences";
/** Lease pages take about 15 s to load on the development server. */
export const LEASE_LOAD_MS = 120_000;

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

/** Read the approved owner message's recommendation separately from its comparable prices. */
export function ownerRecommendationAmounts(body) {
  const text = squash(String(body ?? "").replace(/<[^>]+>/g, ""));
  return [
    ...text.matchAll(
      /Our reviewed rental analysis suggests (\$[\d,]+(?:\.\d{2})?) per month\./g,
    ),
  ].map(([, amount]) => amount);
}

/** The fixture as the running rehearsal loaded it, with its file's digest for the record. */
export function rehearsalFixture(rehearsal) {
  const path = join(process.cwd(), NOVEMBER_5_MIX_PATH);
  const bytes = readFileSync(path);
  const mix = loadNovember5Mix(readNovember5Mix(path), rehearsal.businessDate);
  return {
    mix,
    identity: {
      name: mix.name,
      file: NOVEMBER_5_MIX_PATH,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      leases: mix.leases.length,
      businessDate: mix.businessDate,
      workingMonth: mix.workingMonth,
    },
  };
}

/** The kit bound to one rehearsal. `mix` is the loaded fixture (rehearsalFixture). */
export function createStaffKit({ rehearsal, origin, mix }) {
  // The November 10 kit's reads, emulator readbacks and sign-in; its route poster stays out, so
  // a November 12 journey reaches state only through controls.
  const base = { ...createKit({ rehearsal, origin }) };
  delete base.post;
  const row = (leaseId) =>
    mix.leases.find((entry) => String(entry.lease.leaseID) === String(leaseId));
  const lower = (value) => String(value ?? "").toLowerCase();

  async function openLease(page, leaseId, search = "") {
    await page.goto(origin + base.href(leaseId, search), {
      waitUntil: "domcontentloaded",
      timeout: LEASE_LOAD_MS,
    });
    await page
      .getByRole("region", { name: "Current renewal stage" })
      .waitFor({ timeout: LEASE_LOAD_MS });
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
  }
  async function openPath(page, path) {
    await page.goto(origin + path, {
      waitUntil: "domcontentloaded",
      timeout: LEASE_LOAD_MS,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
  }
  const now = (page) => page.getByRole("region", { name: "Now", exact: true });
  const primary = (page) => page.locator("#renewal-now-primary");
  async function primaryName(page, timeout = 60_000) {
    const button = primary(page);
    const shown = await button
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);
    return shown ? squash(await button.innerText()) : null;
  }

  /** The answer to the next same-origin request the page itself makes that matches. */
  function appResponse(
    page,
    pathname,
    { method = "POST", match, timeout = 120_000 } = {},
  ) {
    return page.waitForResponse(
      (response) => {
        const request = response.request();
        if (new URL(response.url()).pathname !== pathname) return false;
        if (request.method() !== method) return false;
        if (!match) return true;
        try {
          return match(request.postDataJSON() ?? {});
        } catch {
          return false;
        }
      },
      { timeout },
    );
  }
  /** What a sequence request the page made asked for, from its body. */
  const sequenceAction = (body) => body?.action ?? null;

  async function sequences(leaseId, purpose = null) {
    const documents = await base.listDocuments(SEQUENCES_COLLECTION);
    return documents
      .map((document) =>
        Object.fromEntries(
          Object.entries(document.fields ?? {}).map(([key, value]) => [
            key,
            plainValue(value),
          ]),
        ),
      )
      .filter(
        (sequence) =>
          String(sequence.context?.entityId) === String(leaseId) &&
          (!purpose || sequence.context?.purpose === purpose),
      )
      .sort((a, b) => Number(a.createdAtMs ?? 0) - Number(b.createdAtMs ?? 0));
  }

  async function mailboxes() {
    return (await standInState(rehearsal)).mail.mailboxes ?? [];
  }
  const addressesIn = (text) =>
    (String(text ?? "").match(/[^\s<>,;"]+@[^\s<>,;"]+/g) ?? []).map(lower);
  /** Sent messages addressed to any of these addresses, oldest first. */
  async function sentTo(addresses) {
    const wanted = new Set(addresses.map(lower));
    return (await mailboxes())
      .flatMap((box) => box.messages ?? [])
      .filter((message) => (message.labelIds ?? []).includes("SENT"))
      .filter((message) =>
        [...addressesIn(message.to), ...addressesIn(message.cc)].some((address) =>
          wanted.has(address),
        ),
      )
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  const tenantAddresses = (leaseId) =>
    (row(leaseId)?.lease.tenants ?? []).map((tenant) => tenant.email).filter(Boolean);
  const ownerAddresses = (leaseId) =>
    (row(leaseId)?.portfolio.owners ?? []).map((owner) => owner.email).filter(Boolean);

  /** One worker run; with a message id, that message is made due first (the tick helper's hook). */
  const tick = (sequenceId) =>
    runDueMessageTick(rehearsal, sequenceId ? { sequenceId } : {});

  async function notifications(page) {
    const button = page.locator(".notification-button").first();
    const shown = await button
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) return { shown: false, unread: null, name: null };
    const name = squash(
      (await button.getAttribute("aria-label")) ?? (await button.innerText()),
    );
    const unread = Number(/(\d+) unread/.exec(name)?.[1] ?? 0);
    return { shown: true, unread, name };
  }
  async function notificationItems(page) {
    const button = page.locator(".notification-button").first();
    await button.click();
    const region = page.getByRole("region", { name: "Notifications" });
    await region.waitFor({ timeout: 30_000 }).catch(() => undefined);
    const items = await region
      .locator("button.notification-item")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          title: (node.querySelector("strong")?.textContent ?? "").trim(),
          text: (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
        })),
      )
      .catch(() => []);
    await page.keyboard.press("Escape").catch(() => undefined);
    return items;
  }

  async function deskRow(page, leaseId) {
    const rowLocator = page.locator(`tr[data-batch-lease="${leaseId}"]`).first();
    const shown = await rowLocator
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) return { shown: false };
    return {
      shown: true,
      stage: squash(
        await rowLocator
          .locator(".renewal-batch-stage")
          .innerText()
          .catch(() => ""),
      ),
      next: squash(
        await rowLocator
          .locator("[data-batch-next-step]")
          .innerText()
          .catch(() => ""),
      ),
      text: squash(await rowLocator.innerText()).slice(0, 400),
    };
  }

  async function stageLine(page) {
    return squash(
      await page
        .locator('[data-renewal-field="stage-line"]')
        .first()
        .innerText()
        .catch(() => ""),
    );
  }
  /** Visible text of a region, with framework data scripts excluded. */
  async function visibleText(locator) {
    return squash(await locator.innerText().catch(() => ""));
  }
  async function focused(page) {
    return page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const id = element.id || null;
      const labelled = id
        ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent
        : null;
      const wrapping = element.closest("label")?.textContent;
      const own = ["BUTTON", "A", "SUMMARY"].includes(element.tagName)
        ? element.textContent
        : null;
      return {
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        id,
        name: element.getAttribute("name"),
        value: "value" in element ? String(element.value).slice(0, 80) : null,
        label: (element.getAttribute("aria-label") ?? labelled ?? wrapping ?? own ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160),
        section: element.closest("[id]")?.getAttribute("id")?.slice(0, 80) ?? null,
      };
    });
  }
  async function shownWithin(locator, timeout) {
    return locator
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);
  }
  async function openDisclosure(details) {
    const summary = details.locator(":scope > summary");
    await summary.waitFor({ timeout: 30_000 });
    if ((await details.getAttribute("open")) === null) {
      await summary.scrollIntoViewIfNeeded().catch(() => undefined);
      await summary.click();
    }
  }
  /**
   * Show the element `selector` names the way staff reach it: open each closed disclosure that
   * holds it, outermost first, by its summary. Resolves true when the element is then visible.
   */
  async function reveal(page, selector, timeout = 30_000) {
    const target = page.locator(selector).first();
    await target.waitFor({ state: "attached", timeout }).catch(() => undefined);
    if (await shownWithin(target, 2_000)) return true;
    const holders = page.locator(`details:has(${selector})`);
    const count = await holders.count();
    for (let index = 0; index < count; index += 1) {
      const holder = holders.nth(index);
      if ((await holder.getAttribute("open")) !== null) continue;
      if (!(await shownWithin(holder.locator(":scope > summary"), 5_000))) continue;
      await openDisclosure(holder);
    }
    return shownWithin(target, 10_000);
  }

  return {
    ...base,
    mix,
    row,
    squash,
    openLease,
    openPath,
    now,
    primary,
    primaryName,
    appResponse,
    sequenceAction,
    sequences,
    mailboxes,
    sentTo,
    tenantAddresses,
    ownerAddresses,
    tick,
    notifications,
    notificationItems,
    deskRow,
    stageLine,
    visibleText,
    focused,
    shownWithin,
    openDisclosure,
    reveal,
    refusedCount: () => refusedConnections(rehearsal).length,
  };
}
