// S284 W12-10, "See what I need, where I landed": the candidate-side acceptance checks of S281
// (intake 159) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-work-area-facts-landings-and-narrow-screens.md (S281).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S281-1, AC-S281-2, AC-S281-3, AC-S281-4, AC-S281-5, AC-S281-6, AC-S281-7, AC-S281-8,
//   AC-S281-9, AC-S281-10
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Open Ask the owner at 1440 by 900 and 1280 by 800. Edit Rent to recommend in place. Open the
//   named groups. Open each review mode. Follow every fix link and return. Advance a lease and
//   read the address. Enter the dates on the Offer step. Open and close the composer. Repeat the
//   desk and one five-tenant lease at 360, 390 and 430 px.
//
// Starting sequence (journeyW1210 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the Communications composer from a lease, wait two seconds and close it. On the
//   baseline: One new draft communication. On the candidate "Open in Communications" sits in the
//   closed "Other ways to send" group (R-S281-12, on purpose), so the sequence opens the group
//   that holds the link by its summary before it waits for the link; nothing else changed.
//
// How the checks reach each state (R-S284-2): staff controls only. The Editor opens steps, groups
// and reviews, cancels reviews, edits Rent to recommend, sends from the review dialogs, records
// the owner's and the tenant's answers and the manual records, enters the renewal dates and opens
// the composer; a second Editor page makes the stale read of AC-S281-7. Nothing here posts an app
// route: every request is one a visible control makes, and the reads are pages, the rehearsal's
// own emulator and the browser's own layout. Screen size and colour scheme are the viewer's
// (page.setViewportSize, page.emulateMedia), never an app setting.
//
//   P1  the starting state on the prepared lease (one ordinary lease, two tenants):
//       AC-S281-5 owner composer (open, wait two seconds, close; type one character),
//       AC-S281-1 Ask the owner at 1440 by 900 and 1280 by 800 in both themes,
//       AC-S281-8 its named groups in Guided and Full in both themes,
//       AC-S281-2 Send and Schedule reviews at 1280 by 800 and 390 by 844,
//       AC-S281-7 Rent to recommend in place, Full and back, the stale read, Full's Edit,
//       AC-S281-8 a failing readiness line opens "Message" (Rent to recommend cleared and entered
//       again), AC-S281-4 every fix link on every Guided step of the lease.
//   P2  the owner message sent from its review: AC-S281-3 owner, the groups gone (AC-S281-8).
//   P3  the owner's answer recorded: AC-S281-9 the followed advance, reload, an earlier step.
//   P4  Offer the tenant with a missing start, end and both: AC-S281-10, Guided and Full.
//   P5  the tenant offer before its send: AC-S281-8, AC-S281-2 (Send, Schedule, follow-ups),
//       AC-S281-5 tenant composer.
//   P6  the tenant offer sent: AC-S281-3 tenant, the groups gone.
//   P7  the tenant's acceptance, the information form, the documents and the signatures:
//       AC-S281-4's three manual primaries and AC-S281-9's advances from Offer and Documents.
//   P8  the desk and the one-tenant and five-tenant leases at 360, 390 and 430 px (AC-S281-6),
//       Back to the desk's month, group and scroll (AC-S281-9), and every fix link on every
//       Guided step of the five-tenant lease (AC-S281-4).
// Each check is true only when every observation it owns passed and at least one was made; a part
// that stops records false for every check it owns.
import {
  sendOwnerMessage,
  sendTenantOffer,
  waitForPrimary,
} from "./one-path-november-12-journeys.mjs";
import {
  DESK,
  WORKING_ROUTE,
  WORKSPACE_ROUTE,
  ownerRecommendationAmounts,
} from "./one-path-november-12-kit.mjs";

export const W1210_CHECKS = Object.freeze([
  "AC-S281-1",
  "AC-S281-2",
  "AC-S281-3",
  "AC-S281-4",
  "AC-S281-5",
  "AC-S281-6",
  "AC-S281-7",
  "AC-S281-8",
  "AC-S281-9",
  "AC-S281-10",
]);

const DESKTOP = Object.freeze({ width: 1280, height: 800 });
const WIDE_DESKTOP = Object.freeze({ width: 1440, height: 900 });
const PHONE = Object.freeze({ width: 390, height: 844 });
const PHONE_WIDTHS = Object.freeze([360, 390, 430]);
/** R-S281-7 and R-S281-8: the phone budgets. */
const HEADER_MAX = 64;
const TOOLBAR_MAX = 112;
const RENT_FIELD = "renewal-now-rent-to-recommend";
const START_FIELD = "renewal-working-terms-start";
const END_FIELD = "renewal-working-terms-end";
const NEXT_DAY = "Use the day after the current lease ends";
/** R-S281-12: the named groups below each message step's primary action, in order. */
const GROUPS = Object.freeze({
  "ask-owner": ["Message", "Other ways to send", "Outreach record"],
  "offer-tenant": ["Message", "Other ways to send", "Record of contact"],
});
const SECTIONS = Object.freeze({
  "ask-owner": "renewal-section-owner",
  "offer-tenant": "renewal-section-tenant",
});
const PRIMARY = "#renewal-now-primary";
const NOW = "[data-renewal-now-step]";
const DIALOG_SEND = "Review and send";
const DIALOG_SCHEDULE = "Review and schedule";
const FOLLOW_UPS = /Authorize follow-ups after the tenant offer/;
/** The amounts AC-S281-7 types (BEH-S281-8 names $1,425.00). */
const IN_PLACE_AMOUNT = 1425;
const STALE_AMOUNT = 1440;
const ELSEWHERE_AMOUNT = 1450;
/** A control a fix link may follow: focus moves only (never a send, a save or a read). */
const FIX_WORDS = /^(Enter|Verify|Set|Add|Choose|Fix|Edit|Correct)\b/;

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const usd = (amount) =>
  `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** A dialog read without its boxes, for the record. */
const compact = (read) => ({
  leaseText: read?.leaseText,
  datesText: read?.datesText,
  body: read?.body,
  actions: read?.actions,
  viewport: read?.viewport,
});
const brief = (value) => {
  const text = JSON.stringify(value ?? null);
  return text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
};

// ---- The ledger: every observation is named, and a check passes only on all of its own --------

function ledger(ctx) {
  const rows = Object.fromEntries(W1210_CHECKS.map((id) => [id, []]));
  return {
    note(id, label, ok, detail = undefined) {
      rows[id].push({ label, ok: ok === true });
      ctx.record({
        check: id,
        label,
        ok: ok === true,
        ...(detail === undefined ? {} : { detail: brief(detail) }),
      });
    },
    verdicts() {
      const verdicts = {};
      for (const id of W1210_CHECKS)
        verdicts[id] = rows[id].length > 0 && rows[id].every((row) => row.ok);
      ctx.record({
        summary: Object.fromEntries(
          W1210_CHECKS.map((id) => [
            id,
            {
              passed: rows[id].filter((row) => row.ok).length,
              failed: rows[id].filter((row) => !row.ok).map((row) => row.label),
            },
          ]),
        ),
      });
      return verdicts;
    },
  };
}

/** Run one part; a part that stops records false for every check it owns. */
async function part(ctx, book, name, ids, body) {
  const started = Date.now();
  try {
    await body();
    ctx.record({ part: name, seconds: Math.round((Date.now() - started) / 1000) });
    return true;
  } catch (error) {
    const message = String(error?.message ?? error).slice(0, 700);
    for (const id of ids) book.note(id, `${name}: stopped`, false, { error: message });
    return false;
  }
}

// ---- Reading the page -------------------------------------------------------------------------

async function screen(page, size, scheme = "light") {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.emulateMedia({ colorScheme: scheme });
}

const matcher = (wanted) => (name) =>
  name !== null &&
  (typeof wanted === "string" ? name === wanted : wanted ? wanted.test(name) : false);

/** Open a lease step and wait for its primary (a name or pattern), or let it settle. */
async function openStep(ctx, page, leaseId, step, wanted = null, extra = "") {
  await ctx.kit.openLease(page, leaseId, step ? `?step=${step}${extra}` : extra);
  const name = await waitForPrimary(ctx, page, matcher(wanted));
  await page.waitForTimeout(700);
  return name;
}

const nowStep = (page) =>
  page
    .locator(NOW)
    .first()
    .getAttribute("data-renewal-now-step", { timeout: 15_000 })
    .catch(() => null);
const addressStep = (page) => new URL(page.url()).searchParams.get("step");
const historyLength = (page) => page.evaluate(() => window.history.length);

/** Wait until the Now card shows `step` (at most `timeout`); resolves with the step shown. */
async function waitForStep(page, step, timeout = 60_000) {
  await page
    .waitForFunction(
      (wanted) =>
        document
          .querySelector("[data-renewal-now-step]")
          ?.getAttribute("data-renewal-now-step") === wanted,
      step,
      { timeout },
    )
    .catch(() => undefined);
  return nowStep(page);
}

/**
 * The first shown element of each selector, with its box in the viewport, and the viewport. An
 * element counts as shown when it has a box and sits in no hidden region or closed disclosure.
 */
async function boxes(page, entries) {
  return page.evaluate((entries) => {
    const shown = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      return !element.closest("[hidden], [data-renewal-focus-hidden]");
    };
    const out = {};
    for (const [name, selector] of Object.entries(entries)) {
      const element = [...document.querySelectorAll(selector)].find(shown);
      if (!element) {
        out[name] = null;
        continue;
      }
      const rect = element.getBoundingClientRect();
      out[name] = {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        text: (element.innerText || element.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 220),
      };
    }
    out.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollY: Math.round(window.scrollY),
      scrollX: Math.round(window.scrollX),
      theme: document.documentElement.getAttribute("data-theme"),
    };
    return out;
  }, entries);
}

const inScreen = (box, viewport, top = 0) =>
  Boolean(
    box &&
    box.top >= top - 1 &&
    box.bottom <= viewport.height + 1 &&
    box.left >= -1 &&
    box.right <= viewport.width + 1,
  );

/**
 * Where focus landed: the focused control, the label a person reads for it (its own label, the
 * element that names it, or its fieldset's legend), what pins over the top of the page (the
 * sticky lease toolbar and the sticky way back), and whether that label is fully below it and on
 * the screen. A control that carries its own words is its own label.
 */
async function landing(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
      };
    };
    let cover = 0;
    const stickies = [
      ...document.querySelectorAll(
        ".renewal-workspace-toolbar, .renewal-jump-return, header",
      ),
    ]
      .filter((node) => ["sticky", "fixed"].includes(getComputedStyle(node).position))
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height > 0)
      .sort((a, b) => a.rect.top - b.rect.top);
    for (const { rect } of stickies)
      if (rect.top <= cover + 2 && rect.bottom > cover) cover = Math.round(rect.bottom);
    if (!element || element === document.body)
      return { focused: null, cover, height: window.innerHeight };
    const own =
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
        ? (element.labels?.[0] ?? null)
        : null;
    const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/)[0];
    const named = labelledBy ? document.getElementById(labelledBy) : null;
    const legend = element.closest("fieldset")?.querySelector(":scope > legend") ?? null;
    const label =
      [own, named, legend].find(
        (node) =>
          node instanceof HTMLElement &&
          node !== element &&
          node.isConnected &&
          node.getBoundingClientRect().height > 0,
      ) ?? element;
    const labelBox = box(label);
    const elementBox = box(element);
    const text = (node) =>
      (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
    return {
      focused: {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        text: text(element),
        label: text(label),
        box: elementBox,
        inActiveGroup: Boolean(element.closest("[data-renewal-active-group]")),
        inNow: Boolean(element.closest("[data-renewal-now-step]")),
        section: element.closest("section[id^='renewal-section-']")?.id ?? null,
      },
      labelBox,
      cover,
      height: window.innerHeight,
      labelVisible:
        labelBox.height > 0 &&
        labelBox.top >= cover - 1 &&
        labelBox.bottom <= window.innerHeight + 1,
      controlOnScreen:
        elementBox.height > 0 &&
        elementBox.top >= cover - 1 &&
        elementBox.bottom <= window.innerHeight + 1,
      step: document
        .querySelector("[data-renewal-now-step]")
        ?.getAttribute("data-renewal-now-step"),
    };
  });
}

/** A description of the focused element, to compare with the control a jump started from. */
const focusedIdentity = (page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100),
    };
  });

// ---- AC-S281-8: the named groups ---------------------------------------------------------------

/**
 * The named groups of `step` in `scope` ("guided": the Now card; "full": the step's section),
 * their order after the step's primary action, their open state, and where the named controls
 * stand. Opens nothing.
 */
async function readGroups(page, step, scope) {
  return page.evaluate(
    ({ step, scope, sectionId }) => {
      const root =
        scope === "guided"
          ? document.querySelector("[data-renewal-now-step]")
          : document.getElementById(sectionId);
      if (!root) return null;
      const shown = (element) =>
        element.getBoundingClientRect().height > 0 &&
        !element.closest("[hidden], [data-renewal-focus-hidden]");
      const groups = [
        ...root.querySelectorAll(
          `details[data-renewal-group][data-renewal-group-step="${step}"]`,
        ),
      ].filter(shown);
      const primary =
        scope === "guided"
          ? document.getElementById("renewal-now-primary")
          : [...root.querySelectorAll("[data-renewal-work-primary]")].find(shown);
      const follows = (a, b) =>
        Boolean(
          a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      const facts = root.querySelector("[data-renewal-owner-facts]");
      return {
        groups: groups.map((group) => ({
          label: (group.querySelector(":scope > summary")?.textContent ?? "").trim(),
          open: group.open,
          promoted: group.getAttribute("data-renewal-promoted"),
          afterPrimary: follows(primary, group),
          afterFacts: facts ? follows(facts, group) : null,
        })),
        primary: primary ? (primary.textContent ?? "").replace(/\s+/g, " ").trim() : null,
        factsInWork: facts ? Boolean(facts.closest("[data-renewal-work]")) : null,
      };
    },
    { step, scope, sectionId: SECTIONS[step] },
  );
}

/** The named groups of `step` that read as expected: in order, after the primary, closed. */
function groupsInOrder(read, step) {
  const named = (read?.groups ?? []).filter((group) =>
    GROUPS[step].includes(group.label),
  );
  return {
    labels: named.map((group) => group.label),
    order:
      JSON.stringify(named.map((group) => group.label)) === JSON.stringify(GROUPS[step]),
    afterPrimary: named.length > 0 && named.every((group) => group.afterPrimary),
    closed: named.length > 0 && named.every((group) => !group.open),
  };
}

/** Tab forward from `start` and list every focus that lands inside a closed disclosure. */
async function closedDescendantFocus(page, start, presses = 45) {
  const startAt = page.locator(start).first();
  if ((await startAt.count()) === 0) return { walked: 0, bad: [{ missing: start }] };
  await startAt.focus();
  const bad = [];
  let walked = 0;
  for (let index = 0; index < presses; index += 1) {
    await page.keyboard.press("Tab");
    walked += 1;
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return { body: true };
      // A closed disclosure shows only its summary: the summary and what sits in it (a section's
      // help trigger) are in view; anything else inside it must never take focus.
      const closed = element.closest("details:not([open])");
      const summary = closed?.querySelector(":scope > summary") ?? null;
      const inSummary = Boolean(summary && summary.contains(element));
      return {
        bad: Boolean(closed && !inSummary),
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
        holder: closed
          ? (summary?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60)
          : null,
      };
    });
    if (state.bad) bad.push(state);
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  return { walked, bad };
}

/**
 * Open each named group of `step` by its summary, as staff do, and read where the named controls
 * stand: each one inside its own group and none of them outside it within the step.
 */
async function groupContents(page, step, scope) {
  const rootSelector = scope === "guided" ? NOW : `#${SECTIONS[step]}`;
  for (const label of GROUPS[step]) {
    const group = page
      .locator(
        `${rootSelector} details[data-renewal-group="${label}"][data-renewal-group-step="${step}"]`,
      )
      .filter({ visible: true })
      .first();
    if ((await group.count()) === 0) continue;
    if ((await group.getAttribute("open")) === null) {
      await group.locator(":scope > summary").scrollIntoViewIfNeeded();
      await group.locator(":scope > summary").click();
      await page.waitForTimeout(300);
    }
  }
  return page.evaluate(
    ({ step, rootSelector, audience }) => {
      const root = document.querySelector(rootSelector);
      if (!root) return null;
      const group = (label) =>
        [
          ...root.querySelectorAll(
            `details[data-renewal-group="${label}"][data-renewal-group-step="${step}"]`,
          ),
        ].find((node) => node.getBoundingClientRect().height > 0) ?? null;
      const message = group("Message");
      const other = group("Other ways to send");
      const record = group(
        step === "ask-owner" ? "Outreach record" : "Record of contact",
      );
      const shown = (element) =>
        element.getBoundingClientRect().height > 0 &&
        !element.closest("[hidden], [data-renewal-focus-hidden]");
      const named = (selector, words) =>
        [...root.querySelectorAll(selector)].filter(
          (element) =>
            shown(element) &&
            (element.textContent ?? "").replace(/\s+/g, " ").trim() === words,
        );
      const inside = (elements, holder) =>
        elements.length > 0 &&
        Boolean(holder) &&
        elements.every((element) => holder.contains(element));
      const readiness = [
        ...root.querySelectorAll('ul[aria-label="What sending needs"]'),
      ].filter(shown);
      const reason = [...root.querySelectorAll("label")].filter(
        (label) =>
          shown(label) && /^Reason to include/.test((label.textContent ?? "").trim()),
      );
      const schedule = named("button", "Schedule");
      const draft = named("button", "Create Gmail draft instead");
      const copy = named("button", "Copy");
      const composer = named("a", "Open in Communications");
      const response = document.getElementById(`renewal-manual-${audience}_response`);
      return {
        message: {
          readiness: inside(readiness, message),
          reason: step === "ask-owner" ? inside(reason, message) : null,
          wording: Boolean(
            message?.querySelector(".draft-box, textarea, [data-renewal-field]"),
          ),
        },
        other: {
          schedule: inside(schedule, other),
          draft: inside(draft, other),
          copy: inside(copy, other),
          composer: inside(composer, other),
        },
        record: {
          response: Boolean(record && response && record.contains(response)),
          ids: record
            ? [...record.querySelectorAll("[id^='renewal-manual-']")].map(
                (node) => node.id,
              )
            : [],
        },
      };
    },
    { step, rootSelector, audience: step === "ask-owner" ? "owner" : "tenant" },
  );
}

/** Open one named group of the shown step by its summary, as staff do; resolves with it. */
async function openGroup(page, step, label) {
  const group = page
    .locator(
      `${NOW} details[data-renewal-group="${label}"][data-renewal-group-step="${step}"]`,
    )
    .filter({ visible: true })
    .first();
  await group.waitFor({ state: "visible", timeout: 30_000 });
  if ((await group.getAttribute("open")) === null) {
    await group.locator(":scope > summary").scrollIntoViewIfNeeded();
    await group.locator(":scope > summary").click();
    await page.waitForTimeout(400);
  }
  return group;
}

/** "Schedule" in the step's "Other ways to send", opened by its summary. */
async function scheduleControl(page, step) {
  const group = await openGroup(page, step, "Other ways to send");
  return group.getByRole("button", { name: "Schedule", exact: true }).first();
}

/** Switch the lease to Full view or back to Guided view with the toolbar's own control. */
async function switchView(page, want) {
  const toggle = page.locator("button[data-renewal-full-toggle]:visible").first();
  if (!(await toggle.count())) {
    // On a phone the view switch sits in "Lease details".
    const details = page.locator("details[data-renewal-lease-details]").first();
    if ((await details.count()) && (await details.getAttribute("open")) === null)
      await details.locator(":scope > summary").click();
  }
  const control = page.locator("button[data-renewal-full-toggle]").first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  const pressed = (await control.getAttribute("aria-pressed")) === "true";
  if ((want === "full") !== pressed) await control.click();
  if (want === "full")
    await page
      .locator("section[id^='renewal-section-']")
      .first()
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() => undefined);
  else
    await page
      .locator(NOW)
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
  await page.waitForTimeout(1200);
}

// ---- AC-S281-2: the review dialog --------------------------------------------------------------

/** The open review dialog's layout: what is on the screen, the order, the body's own scroll. */
async function readDialog(page, title, leaseId) {
  const dialog = page.getByRole("dialog", { name: title });
  await dialog
    .locator('[data-renewal-field="exact-review"]')
    .waitFor({ timeout: 120_000 });
  await page
    .waitForFunction(
      () => !document.querySelector('[data-renewal-field="review-reloading"]'),
      null,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(800);
  return dialog.evaluate((root, leaseId) => {
    const box = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return rect.height > 0
        ? {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          }
        : null;
    };
    const q = (selector) => root.querySelector(selector);
    const recipients = q('[data-renewal-field="review-recipients"]');
    const subject = recipients?.nextElementSibling ?? null;
    const lease = q('[data-renewal-field="review-lease"]');
    const terms = q('[data-renewal-field="review-terms"]');
    const dates = q('[data-renewal-field="review-dates"]');
    // The schedule's own date and time: never the follow-up plan's fields.
    const scheduleInputs = [
      ...root.querySelectorAll('input[type="date"], input[type="time"]'),
    ].filter(
      (input) =>
        !/Follow-up/i.test(
          input.closest("fieldset")?.querySelector(":scope > legend")?.textContent ?? "",
        ),
    );
    const followUp = [...root.querySelectorAll('input[type="checkbox"]')].find((input) =>
      /Authorize follow-ups/.test(input.closest("label")?.textContent ?? ""),
    );
    const body = q('[data-renewal-field="review-body"]');
    const actions = q(".ui-dialog-actions");
    const order = [
      recipients,
      subject,
      lease,
      terms,
      scheduleInputs[0] ?? null,
      body,
    ].filter(Boolean);
    const ordered = order.every(
      (element, index) =>
        index === 0 ||
        Boolean(
          order[index - 1].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
    );
    const style = body ? getComputedStyle(body) : null;
    const text = (root.innerText ?? "").replace(/\s+/g, " ");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dialogScrollTop: Math.round(
        Math.max(root.scrollTop, root.parentElement?.scrollTop ?? 0),
      ),
      actions: box(actions),
      buttons: actions
        ? [...actions.querySelectorAll("button")].map((button) => ({
            name: (button.textContent ?? "").trim(),
            box: box(button),
          }))
        : [],
      recipients: box(recipients),
      subject: box(subject),
      lease: box(lease),
      leaseText: (lease?.textContent ?? "").replace(/\s+/g, " ").trim(),
      terms: box(terms),
      datesText: (dates?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      termsText: (terms?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      schedule: scheduleInputs.map((input) => box(input)),
      followUp: followUp ? box(followUp) : null,
      body: body
        ? {
            box: box(body),
            overflowY: style?.overflowY ?? null,
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight,
          }
        : null,
      ordered,
      internalId:
        new RegExp(`Lease ${leaseId}\\b`).test(text) ||
        /\bCycle [A-Za-z0-9_-]{4,}/.test(text) ||
        /\bcycle[-_][0-9a-f]{6,}/i.test(text),
    };
  }, String(leaseId));
}

/**
 * AC-S281-2 for one dialog as it opens. With follow-ups, `ticked` is the same dialog after the
 * person ticked the follow-up option: its action row and its confirm button stay in view.
 */
function dialogPasses(
  read,
  { address, schedule = false, followUps = false, ticked = null },
) {
  const vp = read.viewport;
  const on = (box) => inScreen(box, vp);
  const actionRow = (dialog, confirmName) => {
    const confirm = dialog.buttons.find((button) => button.name === confirmName);
    const cancel = dialog.buttons.find((button) => button.name === "Cancel");
    return (
      inScreen(dialog.actions, dialog.viewport) &&
      inScreen(confirm?.box, dialog.viewport) &&
      inScreen(cancel?.box, dialog.viewport)
    );
  };
  const results = {
    actionsInView: actionRow(
      read,
      schedule ? "Schedule this message" : "Send this message",
    ),
    tickedActionsInView: followUps
      ? Boolean(ticked) && actionRow(ticked, "Send offer now and authorize follow-ups")
      : true,
    bodyOwnScroll: Boolean(
      read.body &&
      ["auto", "scroll"].includes(read.body.overflowY) &&
      read.body.scrollHeight > read.body.clientHeight + 4,
    ),
    leaseLine:
      read.leaseText.includes(address) &&
      /renewal for the lease ending \d{2}\/\d{2}\/\d{4}/.test(read.leaseText),
    noInternalId: read.internalId === false && (!ticked || ticked.internalId === false),
    ordered: read.ordered,
    decisionInView:
      on(read.recipients) && on(read.subject) && on(read.lease) && on(read.terms),
    scheduleInView: schedule
      ? read.schedule.length >= 2 && read.schedule.every(on)
      : true,
    followUpOption: followUps ? on(read.followUp) : true,
  };
  return { ok: Object.values(results).every(Boolean), results };
}

/** Open a review by its control, read it, then cancel it (nothing is sent or scheduled). */
async function reviewAndCancel(
  ctx,
  page,
  trigger,
  title,
  leaseId,
  { followUps = false } = {},
) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: title });
  const read = await readDialog(page, title, leaseId);
  let ticked = null;
  if (followUps) {
    // The person ticks the option where it stands, then reads the dialog again.
    await dialog.getByRole("checkbox", { name: FOLLOW_UPS }).check();
    await dialog
      .getByRole("group", { name: "Follow-up message and timing" })
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    ticked = await readDialog(page, title, leaseId);
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  return followUps ? { ...read, ticked } : read;
}

// ---- AC-S281-5: the composer -------------------------------------------------------------------

/**
 * "Open in Communications" from the step shown (the page is on it), wait two seconds and close the
 * composer's tab; with `type`, type one character in the subject first and wait for its save.
 * Counts every non-GET request both pages made and the lease's communication records.
 */
async function composerVisit(ctx, page, leaseId, { type = false } = {}) {
  const { kit } = ctx;
  await kit.reveal(page, 'a[data-renewal-field="composer-link"]');
  const link = page
    .locator('a[data-renewal-field="composer-link"]')
    .filter({ visible: true })
    .first();
  await link.waitFor({ timeout: 30_000 });
  const before = await kit.sequences(leaseId);
  const writes = [];
  const leaseWrites = (request) => {
    if (request.method() !== "GET")
      writes.push({ page: "lease", path: new URL(request.url()).pathname });
  };
  page.on("request", leaseWrites);
  const opened = page.context().waitForEvent("page", { timeout: 60_000 });
  await link.click();
  const composerPage = await opened;
  composerPage.on("request", (request) => {
    if (request.method() !== "GET")
      writes.push({ page: "composer", path: new URL(request.url()).pathname });
  });
  await composerPage.waitForLoadState("domcontentloaded").catch(() => undefined);
  const composer = composerPage.getByRole("region", {
    name: "Workflow communication composer",
  });
  const shown = await kit.shownWithin(composer, 90_000);
  await composerPage
    .getByLabel("Initial message subject")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  await composerPage.waitForTimeout(2000);
  const status = await kit.visibleText(composer.locator('p[role="status"]').first());
  const untouchedWrites = writes.length;
  let typed = null;
  if (type) {
    const subject = composerPage.getByLabel("Initial message subject").first();
    const saved = composerPage
      .waitForResponse((response) => response.request().method() !== "GET", {
        timeout: 60_000,
      })
      .catch(() => null);
    await subject.click();
    await subject.press("End");
    await subject.pressSequentially("x");
    const response = await saved;
    await composerPage.waitForTimeout(3000);
    typed = {
      status: response?.status() ?? null,
      path: response ? new URL(response.url()).pathname : null,
      afterStatus: await kit.visibleText(composer.locator('p[role="status"]').first()),
    };
  }
  const url = composerPage.url();
  await composerPage.close();
  page.off("request", leaseWrites);
  await page.waitForTimeout(1500);
  const after = await kit.sequences(leaseId);
  const known = new Set(
    before.map((sequence) => String(sequence.id ?? sequence.createdAtMs)),
  );
  const added = after.filter(
    (sequence) => !known.has(String(sequence.id ?? sequence.createdAtMs)),
  );
  return {
    shown,
    status,
    url: url.replace(/^https?:\/\/[^/]+/, ""),
    untouchedWrites: writes.slice(0, untouchedWrites),
    writes,
    before: before.length,
    after: after.length,
    added: added.map((sequence) => ({
      state: sequence.state ?? null,
      purpose: sequence.context?.purpose ?? null,
    })),
    typed,
  };
}

// ---- AC-S281-4: fix links, landing and return --------------------------------------------------

/** The fix and enter links the Now card shows now: marked fix links and a fix-worded primary. */
async function nowFixLinks(page) {
  return page.evaluate((words) => {
    const root = document.querySelector("[data-renewal-now-step]");
    if (!root) return [];
    const shown = (element) =>
      element.getBoundingClientRect().height > 0 &&
      !element.closest(
        "[hidden], [data-renewal-focus-hidden], details:not([open]) > :not(summary)",
      );
    const pattern = new RegExp(words);
    const links = [...root.querySelectorAll("[data-renewal-fix-link]")]
      .filter(shown)
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim());
    const primary = document.getElementById("renewal-now-primary");
    const primaryText = primary
      ? (primary.textContent ?? "").replace(/\s+/g, " ").trim()
      : "";
    return [
      ...new Set([
        ...links,
        ...(primary && shown(primary) && pattern.test(primaryText) ? [primaryText] : []),
      ]),
    ].filter((text) => pattern.test(text));
  }, FIX_WORDS.source);
}

/**
 * Follow one fix or enter link by its words from the Now card, read the landing, then take the
 * way back when one is offered. A landing in the step's own active group needs no way back: the
 * step and the control stay where they are.
 */
async function followFix(ctx, page, words) {
  const origin = page
    .locator(`${NOW} :is([data-renewal-fix-link], #renewal-now-primary)`)
    .filter({ hasText: words })
    .filter({ visible: true })
    .first();
  if (!(await origin.count())) return { words, found: false };
  const step = await nowStep(page);
  const handle = await origin.elementHandle();
  const before = await historyLength(page);
  await origin.scrollIntoViewIfNeeded();
  await origin.click();
  await page.waitForTimeout(1800);
  const landed = await landing(page);
  const inPlace =
    landed.step === step &&
    Boolean(landed.focused?.inActiveGroup) &&
    Boolean(landed.focused?.inNow);
  const back = page
    .locator("[data-renewal-return] button, [data-renewal-jump-return] button")
    .filter({ visible: true })
    .first();
  const offered = (await back.count()) > 0;
  let returned = null;
  if (offered) {
    const label = squash(await back.innerText());
    await back.click();
    await page.waitForTimeout(1800);
    const same = handle
      ? await handle
          .evaluate(
            (element) => element.isConnected && document.activeElement === element,
          )
          .catch(() => false)
      : false;
    const active = await focusedIdentity(page);
    returned = {
      label,
      step: await nowStep(page),
      focusOnOrigin: same || (active?.text === words && active?.tag !== undefined),
      active,
    };
  }
  return {
    words,
    found: true,
    step,
    landed: {
      step: landed.step,
      focused: landed.focused,
      labelVisible: landed.labelVisible,
      cover: landed.cover,
      labelBox: landed.labelBox,
    },
    inPlace,
    offered,
    returned,
    historyKept: (await historyLength(page)) === before,
  };
}

const fixPasses = (result) =>
  result.found &&
  Boolean(result.landed.focused) &&
  result.landed.labelVisible &&
  (result.inPlace
    ? true
    : result.offered &&
      result.returned?.step === result.step &&
      result.returned?.focusOnOrigin === true);

/** Every fix and enter link on every Guided step of a lease, from its path strip. */
async function everyFixLink(ctx, page, book, leaseId, label) {
  await screen(page, DESKTOP);
  await openStep(ctx, page, leaseId, null);
  const steps = await page
    .locator("nav[aria-label='Renewal path'] li[data-renewal-path-step]")
    .evaluateAll((items) =>
      items.map((item) => ({
        id: item.getAttribute("data-renewal-path-step"),
        state: item.getAttribute("data-renewal-path-state"),
      })),
    );
  let followed = 0;
  for (const step of steps) {
    await openStep(ctx, page, leaseId, step.id);
    const links = await nowFixLinks(page);
    ctx.record({ fixLinks: { lease: leaseId, step: step.id, links } });
    let fresh = true;
    for (const words of links) {
      // Each link starts from the step as it opens, so one return cannot hide the next link.
      if (!fresh) await openStep(ctx, page, leaseId, step.id);
      fresh = false;
      const result = await followFix(ctx, page, words);
      followed += 1;
      book.note(
        "AC-S281-4",
        `${label} ${step.id}: "${words}" lands with its label visible and returns`,
        fixPasses(result),
        result,
      );
    }
  }
  return { steps: steps.map((step) => step.id), followed };
}

// ---- Staff steps the checks take ---------------------------------------------------------------

/** Wait for the working-record save one control makes; resolves with its status or null. */
const workingSave = (ctx, page, field, timeout = 60_000) =>
  ctx.kit
    .appResponse(page, WORKING_ROUTE, {
      match: (body) => (Array.isArray(field) ? field : [field]).includes(body?.field),
      timeout,
    })
    .then((response) => response.status())
    .catch(() => null);
/**
 * Rent to recommend saves as its own fact, or as the shared working rent while the two are one
 * (lib/lease-renewal/current-cycle-terms.ts recommendationField).
 */
const RENT_FIELDS = Object.freeze(["recommended_rent", "terms_rent"]);

/**
 * Record the owner's approval as staff do (the journeys' recordOwnerAnswer), measuring the address
 * and the history around the one Save that advances the lease.
 */
async function recordOwnerApproval(ctx, page, leaseId, amount) {
  const { kit } = ctx;
  await openStep(ctx, page, leaseId, "ask-owner", "Record owner response");
  // While the step waits on the owner, recording the answer is the primary or the Now card's
  // "Record what happened" beside it.
  const record = page
    .locator(`${NOW} button`)
    .filter({ hasText: /^Record (owner response|what happened)$/ })
    .filter({ visible: true })
    .first();
  if (await record.count()) await record.click();
  const form = page.locator("#renewal-manual-owner_response");
  if (!(await kit.shownWithin(form, 20_000)))
    await kit.reveal(page, "#renewal-manual-owner_response");
  await form
    .getByLabel("Owner response", { exact: true })
    .selectOption({ label: "Approved" });
  const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
  await approval.waitFor({ timeout: 30_000 });
  await approval.getByLabel("Amount approved", { exact: true }).fill(String(amount));
  const who = approval.getByLabel("Who approved", { exact: true });
  const owners = await who
    .locator("option")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.value)
        .filter((value) => value && value !== "representative"),
    );
  if (!owners.length) throw new Error(`Lease ${leaseId} lists no owner of record.`);
  await who.selectOption(owners[0]);
  await approval
    .getByLabel("How they approved", { exact: true })
    .selectOption("conversation");
  await approval
    .getByLabel("Participants", { exact: true })
    .fill("Synthetic owner and renewal staff");
  await approval.getByLabel("When they approved", { exact: true }).fill(centralLocal(2));
  await approval
    .getByRole("button", { name: "Review the owner's answer", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review the owner's answer" });
  await review.waitFor({ timeout: 30_000 });
  const history = await historyLength(page);
  const step = await nowStep(page);
  const saved = kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) => body?.action?.kind === "owner_response",
  });
  await review
    .getByRole("button", { name: "Save the owner's answer", exact: true })
    .click();
  const response = await saved;
  return { status: response.status(), history, step };
}

/** Central wall-clock time `minutes` ago, as a datetime-local input value. */
function centralLocal(minutesAgo = 2) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(Date.now() - minutesAgo * 60_000))
      .map((entry) => [entry.type, entry.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * After an action that advances the lease: the step the view follows to, the address, the
 * history length, and the step a reload shows.
 */
async function readAdvance(ctx, page, { from, to, history }) {
  const shown = await waitForStep(page, to, 90_000);
  await page.waitForTimeout(1200);
  const address = addressStep(page);
  const length = await historyLength(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator(NOW)
    .first()
    .waitFor({ timeout: 120_000 })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  const reloaded = await waitForStep(page, to, 60_000);
  return {
    from,
    to,
    shown,
    address,
    history: { before: history, after: length },
    reloaded,
    reloadedAddress: addressStep(page),
    ok:
      shown === to &&
      address === to &&
      length === history &&
      reloaded === to &&
      addressStep(page) === to,
  };
}

/**
 * Click a manual primary and read where focus landed; then record the activity Done through the
 * landed control and read where focus moves after the save.
 */
async function manualPrimary(ctx, page, leaseId, step, label, activity) {
  const { kit } = ctx;
  await screen(page, DESKTOP);
  const name = await openStep(ctx, page, leaseId, step, label);
  if (name !== label) return { label, found: false, primary: name };
  await kit.primary(page).click();
  await page.waitForTimeout(1800);
  const landed = await landing(page);
  const control = page.locator(`#renewal-manual-${activity} select`).first();
  const inControl = await control
    .evaluate(
      (select) =>
        select.contains(document.activeElement) || select === document.activeElement,
    )
    .catch(() => false);
  const history = await historyLength(page);
  const fromStep = await nowStep(page);
  let saved = null;
  let after = null;
  if (await control.count()) {
    if (!inControl) await control.focus();
    const answer = kit.appResponse(page, WORKSPACE_ROUTE, { timeout: 60_000 });
    await control.selectOption("done");
    saved = await answer.then((response) => response.status()).catch(() => null);
    await page.waitForTimeout(2500);
    after = await page.evaluate(() => {
      const element = document.activeElement;
      return element && element !== document.body
        ? {
            id: element.id || null,
            text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
          }
        : null;
    });
  }
  return {
    label,
    found: true,
    landed: {
      focused: landed.focused,
      controlOnScreen: landed.controlOnScreen,
      cover: landed.cover,
    },
    focusedRecordControl: inControl,
    saved,
    after,
    nextFocused:
      after?.id === "renewal-now-primary" || after?.id === "renewal-now-heading",
    fromStep,
    history,
  };
}

// ---- The checks --------------------------------------------------------------------------------

/**
 * W12-10 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1210 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S281-1 to AC-S281-10 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1210(ctx, page, start) {
  const { kit } = ctx;
  const book = ledger(ctx);
  const leaseId = ctx.leases.prepared.leaseId;
  const lease = ctx.leases.byId(leaseId);
  const fiveTenant = ctx.leases.missingRecipient?.leaseId ?? 9104;
  const oneTenant = ctx.leases.covered?.leaseId ?? 9102;
  const address = (() => {
    const property = kit.row(leaseId)?.property;
    return property ? `${property.streetNumber} ${property.streetName}` : "";
  })();
  ctx.record({
    candidateChecks: "W12-10",
    startingSequence: start.error ? "stopped" : "completed",
    observed: start.observed,
    error: start.error,
  });

  // ---- P1: the starting state on the prepared lease ------------------------------------------

  await part(ctx, book, "starting composer", ["AC-S281-5"], async () => {
    const observed = start.observed;
    book.note(
      "AC-S281-5",
      "owner step (starting sequence): the composer opened, two seconds, closed: no save request and no new draft",
      !start.error &&
        observed?.composerShown === true &&
        (observed?.writesWhileOpen ?? ["?"]).length === 0 &&
        observed?.newDrafts === 0,
      observed ?? { error: start.error },
    );
  });

  await part(ctx, book, "owner composer", ["AC-S281-5"], async () => {
    await screen(page, DESKTOP);
    await openStep(ctx, page, leaseId, "ask-owner", "Review owner message");
    const untouched = await composerVisit(ctx, page, leaseId);
    book.note(
      "AC-S281-5",
      "owner step: open, wait two seconds, close: zero save requests and zero new records",
      untouched.shown &&
        untouched.writes.length === 0 &&
        untouched.after === untouched.before,
      untouched,
    );
    book.note(
      "AC-S281-5",
      'owner step: the untouched composer says "Not saved yet"',
      /Not saved yet/.test(untouched.status),
      { status: untouched.status },
    );
    await openStep(ctx, page, leaseId, "ask-owner", "Review owner message");
    const typed = await composerVisit(ctx, page, leaseId, { type: true });
    book.note(
      "AC-S281-5",
      "owner step: no save before the first character; one character saves one draft",
      typed.shown &&
        typed.untouchedWrites.length === 0 &&
        typed.typed?.status !== null &&
        typed.typed?.status < 400 &&
        typed.after === typed.before + 1 &&
        typed.added.length === 1 &&
        typed.added[0].state === "draft",
      typed,
    );
  });

  await part(
    ctx,
    book,
    "ask the owner first screen",
    ["AC-S281-1", "AC-S281-8"],
    async () => {
      for (const size of [WIDE_DESKTOP, DESKTOP]) {
        for (const scheme of ["light", "dark"]) {
          await screen(page, size, scheme);
          const primary = await openStep(
            ctx,
            page,
            leaseId,
            "ask-owner",
            "Review owner message",
          );
          const read = await boxes(page, {
            heading: "#renewal-now-heading",
            cue: `${NOW} [data-renewal-work] > [data-renewal-priority-cue]`,
            base: `${NOW} [data-renewal-owner-facts] [data-renewal-field="owner-current-base-rent"]`,
            baseBasis: `${NOW} [data-renewal-owner-facts] [data-renewal-field="owner-current-base-basis"]`,
            market: `${NOW} [data-renewal-owner-facts] [data-renewal-field="owner-market-range"]`,
            recommend: `${NOW} [data-renewal-owner-facts] [data-renewal-field="owner-recommended-rent"]`,
            recommendBasis: `${NOW} [data-renewal-owner-facts] [data-renewal-field="owner-recommended-basis"]`,
            recipients: `${NOW} [data-renewal-field="now-recipients"]`,
            primary: PRIMARY,
            toolbar: ".renewal-workspace-toolbar",
          });
          const vp = read.viewport;
          // On the screen and below the pinned lease toolbar.
          const cover = read.toolbar?.bottom ?? 0;
          const order = [
            read.heading,
            read.cue,
            read.base,
            read.market,
            read.recommend,
            read.primary,
          ]
            .filter(Boolean)
            .map((box) => box.top);
          const structure = await page.evaluate(() => {
            const facts = document.querySelector(
              "[data-renewal-now-step] [data-renewal-owner-facts]",
            );
            const editors = document.querySelectorAll(
              "#renewal-now-rent-to-recommend",
            ).length;
            const edits = [
              ...document.querySelectorAll("[data-renewal-rent-edit]"),
            ].filter((button) => button.getBoundingClientRect().height > 0).length;
            return {
              factsInWork: Boolean(facts?.closest("[data-renewal-work]")),
              editors,
              edits,
              summaries: document.querySelectorAll(
                '[data-renewal-field="owner-pricing-summary"]',
              ).length,
            };
          });
          const groups = await readGroups(page, "ask-owner", "guided");
          const placed = groupsInOrder(groups, "ask-owner");
          const factsAbove =
            (groups?.groups ?? []).length > 0 &&
            groups.groups.every((group) => group.afterFacts === true);
          const facts =
            /Current base rent/.test(read.base?.text ?? "") &&
            Boolean(read.baseBasis) &&
            /\$[\d,]+(\.\d\d)? to \$[\d,]+/.test(read.market?.text ?? "") &&
            /comparable/i.test(read.market?.text ?? "") &&
            /\d{2}\/\d{2}\/\d{4}/.test(read.market?.text ?? "") &&
            /Rent to recommend:?\s*\$[\d,]+/.test(read.recommend?.text ?? "") &&
            Boolean(read.recommendBasis);
          book.note(
            "AC-S281-1",
            `${size.width}x${size.height} ${scheme}: the status, Current base rent, the market range, Rent to recommend and the primary in the first screen, in that order`,
            vp.theme === scheme &&
              primary === "Review owner message" &&
              [read.heading, read.base, read.market, read.recommend, read.primary].every(
                (box) => inScreen(box, vp, cover),
              ) &&
              (read.cue === null || inScreen(read.cue, vp, cover)) &&
              order.every((top, index) => index === 0 || top > order[index - 1]) &&
              facts,
            { read, primary },
          );
          book.note(
            "AC-S281-1",
            `${size.width}x${size.height} ${scheme}: the facts block in Work above the groups; one Rent to recommend editor (one Edit, at most one mounted)`,
            structure.factsInWork &&
              factsAbove &&
              placed.order &&
              structure.edits === 1 &&
              structure.editors <= 1 &&
              structure.summaries === 1,
            { structure, placed },
          );
          if (size === DESKTOP) {
            // AC-S281-8 on Ask the owner, Guided, this theme.
            book.note(
              "AC-S281-8",
              `ask-owner guided ${scheme}: Message, Other ways to send and Outreach record follow the primary in order, closed on entry`,
              placed.order && placed.afterPrimary && placed.closed,
              { groups },
            );
            const walk = await closedDescendantFocus(page, PRIMARY);
            book.note(
              "AC-S281-8",
              `ask-owner guided ${scheme}: no closed descendant takes focus`,
              walk.walked > 0 && walk.bad.length === 0,
              walk,
            );
            const contents = await groupContents(page, "ask-owner", "guided");
            book.note(
              "AC-S281-8",
              `ask-owner guided ${scheme}: each named control is inside its group`,
              Boolean(
                contents &&
                contents.message.readiness &&
                contents.message.reason &&
                contents.message.wording &&
                Object.values(contents.other).every(Boolean) &&
                contents.record.response,
              ),
              contents,
            );
            // The same step in Full view.
            await openStep(ctx, page, leaseId, "ask-owner", "Review owner message");
            await switchView(page, "full");
            const full = await readGroups(page, "ask-owner", "full");
            const fullPlaced = groupsInOrder(full, "ask-owner");
            book.note(
              "AC-S281-8",
              `ask-owner full ${scheme}: Message, Other ways to send and Outreach record follow the primary in order, closed on entry`,
              fullPlaced.order && fullPlaced.afterPrimary && fullPlaced.closed,
              { full },
            );
            const fullWalk = await closedDescendantFocus(
              page,
              `#${SECTIONS["ask-owner"]} [data-renewal-work-primary]`,
            );
            book.note(
              "AC-S281-8",
              `ask-owner full ${scheme}: no closed descendant takes focus`,
              fullWalk.walked > 0 && fullWalk.bad.length === 0,
              fullWalk,
            );
            const fullContents = await groupContents(page, "ask-owner", "full");
            book.note(
              "AC-S281-8",
              `ask-owner full ${scheme}: each named control is inside its group`,
              Boolean(
                fullContents &&
                fullContents.message.readiness &&
                fullContents.message.reason &&
                Object.values(fullContents.other).every(Boolean) &&
                fullContents.record.response,
              ),
              fullContents,
            );
            await switchView(page, "guided");
          }
        }
      }
      await screen(page, DESKTOP);
    },
  );

  await part(ctx, book, "owner reviews", ["AC-S281-2"], async () => {
    for (const size of [DESKTOP, PHONE]) {
      await screen(page, size);
      await openStep(ctx, page, leaseId, "ask-owner", "Review owner message");
      const send = await reviewAndCancel(
        ctx,
        page,
        kit.primary(page),
        DIALOG_SEND,
        leaseId,
      );
      const sendResult = dialogPasses(send, { address });
      book.note(
        "AC-S281-2",
        `owner Send at ${size.width}x${size.height}: action row in view, body in its own scroll, address and lease end, no internal id`,
        sendResult.ok,
        { ...sendResult.results, read: compact(send) },
      );
      const schedule = await scheduleControl(page, "ask-owner");
      const scheduleRead = await reviewAndCancel(
        ctx,
        page,
        schedule,
        DIALOG_SCHEDULE,
        leaseId,
      );
      const scheduleResult = dialogPasses(scheduleRead, { address, schedule: true });
      book.note(
        "AC-S281-2",
        `owner Schedule at ${size.width}x${size.height}: action row and schedule fields in view, body in its own scroll, no internal id`,
        scheduleResult.ok,
        { ...scheduleResult.results, read: compact(scheduleRead) },
      );
    }
    await screen(page, DESKTOP);
  });

  await part(ctx, book, "rent in place", ["AC-S281-7"], async () => {
    await screen(page, DESKTOP);
    await openStep(ctx, page, leaseId, "ask-owner", "Review owner message");
    const count = () =>
      page.evaluate((id) => document.querySelectorAll(`#${id}`).length, RENT_FIELD);
    const beforeFacts = squash(
      await page
        .locator(
          `${NOW} [data-renewal-owner-facts] [data-renewal-field="owner-recommended-rent"]`,
        )
        .first()
        .innerText()
        .catch(() => ""),
    );
    const edit = page
      .locator(`${NOW} [data-renewal-owner-facts] [data-renewal-rent-edit]`)
      .first();
    await edit.click();
    const field = page.locator(`#${RENT_FIELD}`).first();
    await field.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    const opened = await page.evaluate((id) => {
      const input = document.getElementById(id);
      return {
        focused: document.activeElement === input,
        inFacts: Boolean(input?.closest("[data-renewal-owner-facts]")),
      };
    }, RENT_FIELD);
    const counts = [await count()];
    // Every save of the typed amount from here on (there should be exactly one, after Enter).
    const typedSave = workingSave(ctx, page, RENT_FIELDS, 180_000);
    await field.fill(String(IN_PLACE_AMOUNT));
    await switchView(page, "full");
    counts.push(await count());
    const inFull = await page.evaluate((id) => {
      const input = document.getElementById(id);
      return {
        value: input?.value ?? null,
        inComparison: Boolean(input?.closest("#renewal-section-comps")),
      };
    }, RENT_FIELD);
    await switchView(page, "guided");
    await page.waitForTimeout(800);
    counts.push(await count());
    const backInPlace = await page.evaluate((id) => {
      const input = document.getElementById(id);
      return {
        value: input?.value ?? null,
        inPlace: Boolean(
          input?.closest("[data-renewal-now-step] [data-renewal-owner-facts]"),
        ),
        step: document
          .querySelector("[data-renewal-now-step]")
          ?.getAttribute("data-renewal-now-step"),
      };
    }, RENT_FIELD);
    book.note(
      "AC-S281-7",
      "Edit opens the one editor in place; the typed amount is kept through Full and back; one editor at every point",
      opened.focused &&
        opened.inFacts &&
        inFull.value === String(IN_PLACE_AMOUNT) &&
        inFull.inComparison &&
        backInPlace.inPlace &&
        backInPlace.value === String(IN_PLACE_AMOUNT) &&
        backInPlace.step === "ask-owner" &&
        counts.every((value) => value === 1),
      { opened, inFull, backInPlace, counts },
    );
    // Save with Enter, in place.
    const input = page.locator(`#${RENT_FIELD}`).first();
    if (!(await input.isVisible().catch(() => false))) await edit.click();
    await input.focus();
    await input.press("Enter");
    // The one save of the typed amount (made by Enter; a view switch moves it without saving).
    const status = await Promise.race([
      typedSave,
      page.waitForTimeout(30_000).then(() => "none"),
    ]);
    // The message and the readiness list are derived again from the saved amount.
    const amount = usd(IN_PLACE_AMOUNT);
    const messagePreview = page.locator(
      `${NOW} details[data-renewal-group="Message"]:visible [aria-label="Message preview"]`,
    );
    await messagePreview
      .filter({ hasText: `Our reviewed rental analysis suggests ${amount} per month.` })
      .first()
      .waitFor({ state: "attached", timeout: 20_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => {
      const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
      const now = document.querySelector("[data-renewal-now-step]");
      return {
        focus: document.activeElement?.id ?? null,
        facts: text(
          now?.querySelector(
            '[data-renewal-owner-facts] [data-renewal-field="owner-recommended-rent"]',
          ),
        ),
        readiness: text(now?.querySelector('ul[aria-label="What sending needs"]')),
        editors: document.querySelectorAll("#renewal-now-rent-to-recommend").length,
      };
    });
    const message = squash(
      await messagePreview
        .first()
        .textContent({ timeout: 3_000 })
        .catch(() => null),
    );
    const recommendations = ownerRecommendationAmounts(message);
    const plain = amount.replace(/\.00$/, "");
    // The readiness list names what sending needs, not amounts (S249): its Rent to recommend line
    // is derived again from the saved amount and reads ready, with no earlier amount left in it.
    const rentLine = /Rent to recommend: (Ready|\$)/.test(after.readiness);
    const earlier = beforeFacts.match(/\$[\d,]+(\.\d\d)?/)?.[0] ?? null;
    book.note(
      "AC-S281-7",
      "Save in place: the facts and message recommendation show $1,425.00, the readiness line is ready and focus is on the primary",
      status === 200 &&
        after.focus === "renewal-now-primary" &&
        after.facts.includes(plain) &&
        recommendations.length === 1 &&
        recommendations[0] === amount &&
        rentLine &&
        (earlier === null || earlier === amount || !after.readiness.includes(earlier)) &&
        after.editors <= 1,
      {
        status,
        earlier,
        recommendations,
        after: { ...after, message: message.slice(0, 300) },
      },
    );
    // A stale read: another Editor page saves first, then this page's save is refused with the
    // existing recovery.
    await edit.click();
    await input.waitFor({ timeout: 30_000 });
    await input.fill(String(STALE_AMOUNT));
    const other = await ctx.newPage("Editor");
    await screen(other, DESKTOP);
    await openStep(ctx, other, leaseId, "compare-market");
    const otherField = other.locator(`#${RENT_FIELD}`).first();
    await otherField.waitFor({ timeout: 60_000 });
    const otherSaved = workingSave(ctx, other, RENT_FIELDS);
    await otherField.fill(String(ELSEWHERE_AMOUNT));
    await otherField.press("Enter");
    const otherStatus = await otherSaved;
    const refused = ctx.kit
      .appResponse(page, WORKING_ROUTE, {
        match: (body) => RENT_FIELDS.includes(body?.field),
        timeout: 60_000,
      })
      .catch(() => null);
    await input.focus();
    await input.press("Enter");
    const refusal = await refused;
    await page.waitForTimeout(2500);
    const recovery = await page.evaluate(() => {
      const status = [
        ...document.querySelectorAll("[data-autosave], [role='status'], [role='alert']"),
      ]
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter((text) => /Changed elsewhere/.test(text));
      return { lines: status.slice(0, 3) };
    });
    book.note(
      "AC-S281-7",
      "a stale read refuses the save with the existing recovery (Changed elsewhere)",
      otherStatus === 200 && refusal?.status() === 409 && recovery.lines.length > 0,
      { otherStatus, refused: refusal?.status() ?? null, recovery },
    );
    await other.close().catch(() => undefined);
    // Full view: "Edit" in Owner approval lands on the one editor in Market rent comparison with
    // its label visible, and returns to Owner approval.
    await openStep(ctx, page, leaseId, "ask-owner", "Review owner message");
    await switchView(page, "full");
    const fullEdit = page
      .locator(`#${SECTIONS["ask-owner"]} a[data-renewal-fix-link]`)
      .filter({ hasText: "Edit rent to recommend" })
      .first();
    await fullEdit.scrollIntoViewIfNeeded();
    const fullOrigin = await fullEdit.elementHandle();
    await fullEdit.click();
    await page.waitForTimeout(1800);
    const landed = await landing(page);
    const back = page
      .locator("[data-renewal-jump-return] button")
      .filter({ visible: true })
      .first();
    const offered = (await back.count()) > 0 ? squash(await back.innerText()) : null;
    if (offered) await back.click();
    await page.waitForTimeout(1500);
    const returned = fullOrigin
      ? await fullOrigin
          .evaluate(
            (element) => element.isConnected && document.activeElement === element,
          )
          .catch(() => false)
      : false;
    book.note(
      "AC-S281-7",
      "Full view: Edit lands on the editor in Market rent comparison with its label visible and returns to Owner approval",
      landed.focused?.id === RENT_FIELD &&
        landed.focused?.section === "renewal-section-comps" &&
        landed.labelVisible &&
        offered === "Return to owner approval" &&
        returned,
      { landed, offered, returned },
    );
    await switchView(page, "guided");
  });

  await part(ctx, book, "failing readiness opens Message", ["AC-S281-8"], async () => {
    // The five-tenant lease has no verified owner recipient: its owner message's readiness line
    // for the recipient fails from the starting state.
    await screen(page, DESKTOP);
    await openStep(ctx, page, fiveTenant, "ask-owner");
    await page
      .locator(
        `${NOW} details[data-renewal-group="Message"][data-renewal-group-step="ask-owner"]`,
      )
      .first()
      .waitFor({ timeout: 30_000 })
      .catch(() => undefined);
    await page.waitForTimeout(1000);
    const read = await page.evaluate(() => {
      const now = document.querySelector("[data-renewal-now-step]");
      const message = [
        ...(now?.querySelectorAll(
          'details[data-renewal-group="Message"][data-renewal-group-step="ask-owner"]',
        ) ?? []),
      ].find((node) => node.getBoundingClientRect().height > 0);
      const others = [
        ...(now?.querySelectorAll(
          'details[data-renewal-group][data-renewal-group-step="ask-owner"]',
        ) ?? []),
      ]
        .filter((node) => node !== message && node.getBoundingClientRect().height > 0)
        .map((node) => ({
          label: node.querySelector(":scope > summary")?.textContent?.trim(),
          open: node.open,
        }));
      const missing = message?.querySelector('li[data-renewal-ready="missing"]');
      const box = missing?.getBoundingClientRect();
      return {
        open: message?.open ?? null,
        promoted: message?.getAttribute("data-renewal-promoted") ?? null,
        missing: (missing?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
        missingShown: Boolean(box && box.height > 0),
        missingOnScreen: Boolean(box && box.top >= 0 && box.bottom <= window.innerHeight),
        others,
        primary: (
          document.getElementById("renewal-now-primary")?.textContent ?? ""
        ).trim(),
      };
    });
    book.note(
      "AC-S281-8",
      'a failing readiness line opens "Message" on its own with the line in view; the other groups stay closed',
      read.open === true &&
        Boolean(read.promoted) &&
        read.missingShown &&
        read.others.every((group) => !group.open),
      { lease: fiveTenant, read },
    );
  });

  await part(ctx, book, "fix links on the prepared lease", ["AC-S281-4"], async () => {
    const result = await everyFixLink(ctx, page, book, leaseId, `lease ${leaseId}`);
    ctx.record({ fixLinkSweep: { lease: leaseId, ...result } });
  });

  // ---- P2: the owner message sent ------------------------------------------------------------

  let ownerSent = false;
  await part(ctx, book, "owner send", ["AC-S281-3", "AC-S281-8"], async () => {
    await screen(page, DESKTOP);
    const sent = await sendOwnerMessage(ctx, page, leaseId);
    ctx.record({
      ownerSend: { status: sent.status, state: sent.state, alert: sent.alert },
    });
    if (sent.status !== 200)
      throw new Error(`The owner message was not sent: ${sent.alert ?? sent.error}`);
    ownerSent = true;
    await sentStepChecks(ctx, page, book, leaseId, "ask-owner", "owner");
  });

  // ---- P3: the owner's answer advances the lease ----------------------------------------------

  let answered = false;
  await part(ctx, book, "owner answer advance", ["AC-S281-9"], async () => {
    if (!ownerSent) throw new Error("The owner message was not sent.");
    await screen(page, DESKTOP);
    const amount = Number(lease?.rent ?? 0) + 50;
    const saved = await recordOwnerApproval(ctx, page, leaseId, amount);
    if (saved.status !== 200)
      throw new Error(`The owner's answer was not saved (${saved.status}).`);
    answered = true;
    const advance = await readAdvance(ctx, page, {
      from: saved.step,
      to: "offer-tenant",
      history: saved.history,
    });
    book.note(
      "AC-S281-9",
      "the owner's answer advances Ask the owner to Offer the tenant: the address names it, no history entry, a reload shows it",
      saved.step === "ask-owner" && advance.ok,
      advance,
    );
  });

  await part(ctx, book, "earlier step", ["AC-S281-9"], async () => {
    if (!answered) throw new Error("The owner's answer was not saved.");
    await screen(page, DESKTOP);
    await openStep(ctx, page, leaseId, "offer-tenant");
    const history = await historyLength(page);
    await page
      .locator(
        "nav[aria-label='Renewal path'] li[data-renewal-path-step='ask-owner'] button",
      )
      .click();
    const shown = await waitForStep(page, "ask-owner", 30_000);
    await page.waitForTimeout(1000);
    const offered = await page
      .locator(`${NOW} [data-renewal-field="next-step"] button`)
      .filter({ hasText: "Show current step" })
      .isVisible()
      .catch(() => false);
    const selected = {
      shown,
      address: addressStep(page),
      history: await historyLength(page),
      offered,
    };
    await page.reload({ waitUntil: "domcontentloaded" });
    const reloaded = await waitForStep(page, "ask-owner", 90_000);
    await page.waitForTimeout(1500);
    const showCurrent = page
      .locator(`${NOW} [data-renewal-field="next-step"] button`)
      .filter({ hasText: "Show current step" })
      .first();
    const offeredAfterReload = await showCurrent.isVisible().catch(() => false);
    if (offeredAfterReload) await showCurrent.click();
    const current = await waitForStep(page, "offer-tenant", 30_000);
    await page.waitForTimeout(800);
    book.note(
      "AC-S281-9",
      'selecting an earlier step names it in the address with no history entry and offers "Show current step"; a reload shows it',
      shown === "ask-owner" &&
        selected.address === "ask-owner" &&
        selected.history === history &&
        offered &&
        reloaded === "ask-owner" &&
        offeredAfterReload &&
        current === "offer-tenant" &&
        addressStep(page) === "offer-tenant",
      { selected, reloaded, offeredAfterReload, current, address: addressStep(page) },
    );
  });

  // ---- P4: the renewal dates on Offer the tenant ---------------------------------------------

  let datesEntered = false;
  await part(ctx, book, "dates on the offer", ["AC-S281-10", "AC-S281-4"], async () => {
    if (!answered) throw new Error("The owner's answer was not saved.");
    await screen(page, DESKTOP);
    const mounted = () =>
      page.evaluate(
        ({ start, end }) => ({
          start: document.querySelectorAll(`#${start}`).length,
          end: document.querySelectorAll(`#${end}`).length,
          reveal: document.querySelectorAll("details[data-renewal-working-terms]").length,
          inPlace: Boolean(
            document.querySelector(
              "[data-renewal-now-step] [data-renewal-working-terms-in-place]",
            ),
          ),
        }),
        { start: START_FIELD, end: END_FIELD },
      );
    const enter = async (words, field) => {
      const primary = await openStep(ctx, page, leaseId, "offer-tenant", words);
      if (primary !== words) return { words, primary, found: false };
      await kit.primary(page).click();
      await page.waitForTimeout(1800);
      const landed = await landing(page);
      const inField = await page.evaluate(
        (id) => Boolean(document.getElementById(id)?.contains(document.activeElement)),
        field,
      );
      const offers = await page.evaluate(
        ({ start, end, nextDay }) => {
          const buttons = (id) =>
            [...(document.getElementById(id)?.querySelectorAll("button") ?? [])]
              .filter((button) => button.getBoundingClientRect().height > 0)
              .map((button) => (button.textContent ?? "").trim());
          return {
            nextDay: buttons(start).includes(nextDay),
            endChoices: buttons(end).filter((text) => /^Use /.test(text)),
          };
        },
        { start: START_FIELD, end: END_FIELD, nextDay: NEXT_DAY },
      );
      return {
        words,
        primary,
        found: true,
        step: await nowStep(page),
        landed: { focused: landed.focused, labelVisible: landed.labelVisible },
        inField,
        offers,
        mounted: await mounted(),
      };
    };
    const afterSave = async () => {
      await page.waitForTimeout(2500);
      return {
        step: await nowStep(page),
        focus: await page.evaluate(() => document.activeElement?.id ?? null),
        primary: await kit.primaryName(page, 10_000),
        mounted: await mounted(),
      };
    };
    // Both dates missing: the start opens in place.
    const both = await enter("Enter renewal start date", START_FIELD);
    const choice = page
      .locator(`#${START_FIELD}`)
      .getByRole("button", { name: NEXT_DAY, exact: true });
    const startSaved = workingSave(ctx, page, "terms_effective_date");
    await choice.click();
    const startStatus = await startSaved;
    const afterStart = await afterSave();
    book.note(
      "AC-S281-10",
      "both dates missing: Enter renewal start date opens the dates on Offer the tenant with focus on the start and the next-day start offered; Save keeps the step and focuses its primary; one editor",
      both.found &&
        both.step === "offer-tenant" &&
        both.inField &&
        both.landed.labelVisible &&
        both.offers.nextDay &&
        both.mounted.inPlace &&
        both.mounted.start === 1 &&
        both.mounted.end === 1 &&
        both.mounted.reveal === 0 &&
        startStatus === 200 &&
        afterStart.step === "offer-tenant" &&
        afterStart.focus === "renewal-now-primary" &&
        afterStart.mounted.start === 1,
      { both, startStatus, afterStart },
    );
    book.note(
      "AC-S281-4",
      'offer-tenant: "Enter renewal start date" lands in place with its label visible on the step',
      both.found &&
        both.inField &&
        both.landed.labelVisible &&
        both.step === "offer-tenant",
      both.landed,
    );
    // End missing only: the end opens in place with its choices.
    const endOnly = await enter("Enter renewal end date", END_FIELD);
    const endChoice = page
      .locator(`#${END_FIELD}`)
      .getByRole("button", { name: /^Use / })
      .first();
    const endSaved = workingSave(ctx, page, "terms_end_date");
    if (await endChoice.count()) await endChoice.click();
    else {
      const field = page.locator(`#${END_FIELD} input[type="date"]`).first();
      await field.fill(
        `${Number(lease.endDate.slice(0, 4)) + 1}${lease.endDate.slice(4)}`,
      );
      await field.blur();
    }
    const endStatus = await endSaved;
    const afterEnd = await afterSave();
    book.note(
      "AC-S281-10",
      "end missing: Enter renewal end date opens the dates on the step with focus on the end and the end choices offered; Save keeps the step, focuses its primary and makes the review available",
      endOnly.found &&
        endOnly.step === "offer-tenant" &&
        endOnly.inField &&
        endOnly.landed.labelVisible &&
        endOnly.offers.endChoices.length > 0 &&
        endOnly.mounted.start === 1 &&
        endOnly.mounted.end === 1 &&
        endStatus === 200 &&
        afterEnd.step === "offer-tenant" &&
        afterEnd.focus === "renewal-now-primary" &&
        afterEnd.primary === "Review tenant offer",
      { endOnly, endStatus, afterEnd },
    );
    // Start missing only: clear the start with its own control, then enter it in place again.
    await openStep(ctx, page, leaseId, "ask-owner");
    await kit.reveal(page, `#${START_FIELD}`);
    const clear = page
      .locator(`#${START_FIELD}`)
      .getByRole("button", { name: "Clear the working value", exact: true });
    const clearedSave = workingSave(ctx, page, "terms_effective_date");
    await clear.click();
    const clearedStatus = await clearedSave;
    // Full view first: the Offer section's link lands in Owner approval and returns.
    await openStep(ctx, page, leaseId, "offer-tenant");
    await switchView(page, "full");
    const offerSection = page.locator(`#${SECTIONS["offer-tenant"]}`);
    const fullCandidates = offerSection
      .locator("a, button")
      .filter({ hasText: /^Enter renewal start date$/ });
    const fullLink = fullCandidates.filter({ visible: true }).first();
    // Where the link stands as Full view opens: in the offer's "Message" group, which a failing
    // readiness line opens on its own; staff open it by its summary otherwise.
    const fullMessage = offerSection
      .locator(
        'details[data-renewal-group="Message"][data-renewal-group-step="offer-tenant"]',
      )
      .first();
    const fullEntry = {
      candidates: await fullCandidates.count(),
      shown: await fullLink.count(),
      messageOpen: (await fullMessage.count())
        ? (await fullMessage.getAttribute("open")) !== null
        : null,
      messagePromoted: (await fullMessage.count())
        ? await fullMessage.getAttribute("data-renewal-promoted")
        : null,
    };
    if (!fullEntry.shown && fullEntry.candidates && fullEntry.messageOpen === false) {
      await fullMessage.locator(":scope > summary").scrollIntoViewIfNeeded();
      await fullMessage.locator(":scope > summary").click();
      await page.waitForTimeout(500);
    }
    let full = { found: false, entry: fullEntry };
    if (await fullLink.count()) {
      await fullLink.scrollIntoViewIfNeeded();
      const origin = await fullLink.elementHandle();
      await fullLink.click();
      await page.waitForTimeout(1800);
      const landed = await landing(page);
      const inStart = await page.evaluate(
        (id) => Boolean(document.getElementById(id)?.contains(document.activeElement)),
        START_FIELD,
      );
      const back = page
        .locator(
          "[data-renewal-jump-return] button, [data-renewal-field='return-to-tenant-offer'] button",
        )
        .filter({ visible: true })
        .first();
      const offered = (await back.count()) ? squash(await back.innerText()) : null;
      if (offered) await back.click();
      await page.waitForTimeout(1500);
      const returned = await page.evaluate(
        (section) =>
          Boolean(document.getElementById(section)?.contains(document.activeElement)),
        SECTIONS["offer-tenant"],
      );
      const onOrigin = origin
        ? await origin
            .evaluate(
              (element) => element.isConnected && document.activeElement === element,
            )
            .catch(() => false)
        : false;
      full = {
        found: true,
        entry: fullEntry,
        landedSection: landed.focused?.section ?? null,
        inStart,
        labelVisible: landed.labelVisible,
        offered,
        returned,
        onOrigin,
        mounted: await mounted(),
      };
    }
    book.note(
      "AC-S281-10",
      "Full view: the Offer section's Enter renewal start date lands in Owner approval with its label visible and returns to the Offer section",
      clearedStatus === 200 &&
        full.found &&
        full.landedSection === "renewal-section-owner" &&
        full.inStart &&
        full.labelVisible &&
        /^Return to tenant offer$/.test(full.offered ?? "") &&
        full.returned &&
        full.mounted.start === 1,
      { clearedStatus, full },
    );
    await switchView(page, "guided");
    const startOnly = await enter("Enter renewal start date", START_FIELD);
    const again = page
      .locator(`#${START_FIELD}`)
      .getByRole("button", { name: NEXT_DAY, exact: true });
    const againSaved = workingSave(ctx, page, "terms_effective_date");
    await again.click();
    const againStatus = await againSaved;
    const afterAgain = await afterSave();
    book.note(
      "AC-S281-10",
      "start missing: Enter renewal start date opens the dates on the step with focus on the start and the next-day start offered; Save keeps the step and focuses its primary",
      startOnly.found &&
        startOnly.step === "offer-tenant" &&
        startOnly.inField &&
        startOnly.landed.labelVisible &&
        startOnly.offers.nextDay &&
        startOnly.mounted.start === 1 &&
        startOnly.mounted.end === 1 &&
        againStatus === 200 &&
        afterAgain.step === "offer-tenant" &&
        afterAgain.focus === "renewal-now-primary" &&
        afterAgain.primary === "Review tenant offer",
      { startOnly, againStatus, afterAgain },
    );
    datesEntered = afterAgain.primary === "Review tenant offer";
  });

  // ---- P5: the tenant offer before its send --------------------------------------------------

  await part(ctx, book, "tenant groups", ["AC-S281-8"], async () => {
    if (!datesEntered) throw new Error("The renewal dates were not entered.");
    for (const scheme of ["light", "dark"]) {
      await screen(page, DESKTOP, scheme);
      await openStep(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
      const groups = await readGroups(page, "offer-tenant", "guided");
      const placed = groupsInOrder(groups, "offer-tenant");
      book.note(
        "AC-S281-8",
        `offer-tenant guided ${scheme}: Message, Other ways to send and Record of contact follow the primary in order, closed on entry`,
        placed.order && placed.afterPrimary && placed.closed,
        { groups },
      );
      const walk = await closedDescendantFocus(page, PRIMARY);
      book.note(
        "AC-S281-8",
        `offer-tenant guided ${scheme}: no closed descendant takes focus`,
        walk.walked > 0 && walk.bad.length === 0,
        walk,
      );
      const contents = await groupContents(page, "offer-tenant", "guided");
      book.note(
        "AC-S281-8",
        `offer-tenant guided ${scheme}: each named control is inside its group`,
        Boolean(
          contents &&
          contents.message.readiness &&
          contents.message.wording &&
          Object.values(contents.other).every(Boolean) &&
          contents.record.response,
        ),
        contents,
      );
      await openStep(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
      await switchView(page, "full");
      const full = await readGroups(page, "offer-tenant", "full");
      const fullPlaced = groupsInOrder(full, "offer-tenant");
      book.note(
        "AC-S281-8",
        `offer-tenant full ${scheme}: Message, Other ways to send and Record of contact follow the primary in order, closed on entry`,
        fullPlaced.order && fullPlaced.afterPrimary && fullPlaced.closed,
        { full },
      );
      const fullWalk = await closedDescendantFocus(
        page,
        `#${SECTIONS["offer-tenant"]} [data-renewal-work-primary]`,
      );
      book.note(
        "AC-S281-8",
        `offer-tenant full ${scheme}: no closed descendant takes focus`,
        fullWalk.walked > 0 && fullWalk.bad.length === 0,
        fullWalk,
      );
      const fullContents = await groupContents(page, "offer-tenant", "full");
      book.note(
        "AC-S281-8",
        `offer-tenant full ${scheme}: each named control is inside its group`,
        Boolean(
          fullContents &&
          fullContents.message.readiness &&
          Object.values(fullContents.other).every(Boolean) &&
          fullContents.record.response,
        ),
        fullContents,
      );
      await switchView(page, "guided");
    }
    await screen(page, DESKTOP);
  });

  await part(ctx, book, "tenant reviews", ["AC-S281-2"], async () => {
    if (!datesEntered) throw new Error("The renewal dates were not entered.");
    for (const size of [DESKTOP, PHONE]) {
      await screen(page, size);
      await openStep(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
      const send = await reviewAndCancel(
        ctx,
        page,
        kit.primary(page),
        DIALOG_SEND,
        leaseId,
      );
      const sendResult = dialogPasses(send, { address });
      book.note(
        "AC-S281-2",
        `tenant Send at ${size.width}x${size.height}: action row in view, body in its own scroll, address and lease end, no internal id`,
        sendResult.ok,
        { ...sendResult.results, read: compact(send) },
      );
      await openStep(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
      const followUps = await reviewAndCancel(
        ctx,
        page,
        kit.primary(page),
        DIALOG_SEND,
        leaseId,
        {
          followUps: true,
        },
      );
      const followResult = dialogPasses(followUps, {
        address,
        followUps: true,
        ticked: followUps.ticked,
      });
      book.note(
        "AC-S281-2",
        `tenant send with follow-ups at ${size.width}x${size.height}: the follow-up option in view; ticked, the action row stays in view; body in its own scroll, no internal id`,
        followResult.ok,
        {
          ...followResult.results,
          read: compact(followUps),
          ticked: compact(followUps.ticked),
        },
      );
      const schedule = await scheduleControl(page, "offer-tenant");
      const scheduleRead = await reviewAndCancel(
        ctx,
        page,
        schedule,
        DIALOG_SCHEDULE,
        leaseId,
      );
      const scheduleResult = dialogPasses(scheduleRead, { address, schedule: true });
      book.note(
        "AC-S281-2",
        `tenant Schedule at ${size.width}x${size.height}: action row and schedule fields in view, body in its own scroll, no internal id`,
        scheduleResult.ok,
        { ...scheduleResult.results, read: compact(scheduleRead) },
      );
    }
    await screen(page, DESKTOP);
  });

  await part(ctx, book, "tenant composer", ["AC-S281-5"], async () => {
    if (!datesEntered) throw new Error("The renewal dates were not entered.");
    await screen(page, DESKTOP);
    await openStep(ctx, page, leaseId, "offer-tenant", "Review tenant offer");
    const untouched = await composerVisit(ctx, page, leaseId);
    book.note(
      "AC-S281-5",
      "tenant step: open, wait two seconds, close: zero save requests and zero new records",
      untouched.shown &&
        untouched.writes.length === 0 &&
        untouched.after === untouched.before &&
        /Not saved yet/.test(untouched.status),
      untouched,
    );
  });

  // ---- P6: the tenant offer sent -------------------------------------------------------------

  let tenantSent = false;
  await part(ctx, book, "tenant send", ["AC-S281-3", "AC-S281-8"], async () => {
    if (!datesEntered) throw new Error("The renewal dates were not entered.");
    await screen(page, DESKTOP);
    const sent = await sendTenantOffer(ctx, page, leaseId);
    ctx.record({
      tenantSend: { status: sent.status, state: sent.state, alert: sent.alert },
    });
    if (sent.status !== 200)
      throw new Error(`The tenant offer was not sent: ${sent.alert ?? sent.error}`);
    tenantSent = true;
    await sentStepChecks(ctx, page, book, leaseId, "offer-tenant", "tenant");
  });

  // ---- P7: the tenant's acceptance and the manual records --------------------------------------

  await part(
    ctx,
    book,
    "manual records and advances",
    ["AC-S281-4", "AC-S281-8", "AC-S281-9"],
    async () => {
      if (!tenantSent) throw new Error("The tenant offer was not sent.");
      await screen(page, DESKTOP);
      const name = await openStep(
        ctx,
        page,
        leaseId,
        "offer-tenant",
        /^Record (tenant response|what happened)/,
      );
      // While the step waits on the tenant, recording the answer is the primary or the Now
      // card's "Record what happened" beside it.
      const record = page
        .locator(`${NOW} button`)
        .filter({ hasText: /^Record (tenant response|what happened)$/ })
        .filter({ visible: true })
        .first();
      if (!(await record.count()))
        throw new Error(
          `Offer the tenant offers no way to record the answer ("${name}").`,
        );
      // A link to a control inside a group opens only that group.
      await record.click();
      await page.waitForTimeout(1800);
      const opened = await page.evaluate(() => {
        const now = document.querySelector("[data-renewal-now-step]");
        const form = document.getElementById("renewal-manual-tenant_response");
        return [
          ...(now?.querySelectorAll(
            "details[data-renewal-group], details[data-renewal-secondary-work]",
          ) ?? []),
        ]
          .filter((node) => node.getBoundingClientRect().height > 0)
          .map((node) => ({
            label: node.querySelector(":scope > summary")?.textContent?.trim() ?? null,
            open: node.open,
            holdsTarget: Boolean(form && node.contains(form)),
          }));
      });
      book.note(
        "AC-S281-8",
        "a link to a control inside a group (Record tenant response) opens only that group",
        opened.some((group) => group.holdsTarget && group.open) &&
          opened.filter((group) => group.open && !group.holdsTarget).length === 0,
        { opened },
      );
      const form = page.locator("#renewal-manual-tenant_response");
      if (!(await kit.shownWithin(form, 15_000)))
        await kit.reveal(page, "#renewal-manual-tenant_response");
      await form.getByLabel("Tenant response", { exact: true }).selectOption("accepted");
      const responseSaved = kit.appResponse(page, WORKSPACE_ROUTE, { timeout: 60_000 });
      await form.getByRole("button", { name: "Save", exact: true }).first().click();
      const responseStatus = (await responseSaved).status();
      if (responseStatus !== 200)
        throw new Error(`The tenant response was not saved (${responseStatus}).`);
      await page.waitForTimeout(2000);
      const which = form.getByLabel("Which offer does this answer respond to?", {
        exact: true,
      });
      if (await kit.shownWithin(which, 15_000)) {
        const choices = await which
          .locator("option")
          .evaluateAll((nodes) =>
            nodes.map((node) => node.value).filter((value) => value.startsWith("sent:")),
          );
        if (choices.length) {
          await which.selectOption(choices.at(-1));
          const linked = kit.appResponse(page, WORKSPACE_ROUTE, { timeout: 60_000 });
          await form
            .getByRole("button", { name: "Record the offer this answers", exact: true })
            .click();
          await linked.catch(() => null);
        }
      }
      // The three manual primaries and the advances they make.
      const info = await manualPrimary(
        ctx,
        page,
        leaseId,
        "offer-tenant",
        "Send the renewal information form",
        "information_form",
      );
      book.note(
        "AC-S281-4",
        '"Send the renewal information form" focuses its control within the first screen; saving it moves focus to the next action',
        info.found &&
          info.focusedRecordControl &&
          info.landed.controlOnScreen &&
          info.saved === 200 &&
          info.nextFocused,
        info,
      );
      const returnedForm = await manualPrimary(
        ctx,
        page,
        leaseId,
        "offer-tenant",
        "Record the returned information form",
        "form_returned",
      );
      if (returnedForm.found) {
        const advance = await readAdvance(ctx, page, {
          from: "offer-tenant",
          to: "documents",
          history: returnedForm.history,
        });
        book.note(
          "AC-S281-9",
          "recording the returned form advances Offer the tenant to Documents: the address names it, no history entry, a reload shows it",
          returnedForm.saved === 200 && advance.ok,
          {
            returnedForm: { saved: returnedForm.saved, fromStep: returnedForm.fromStep },
            advance,
          },
        );
      } else
        book.note(
          "AC-S281-9",
          "the returned information form's primary is offered",
          false,
          returnedForm,
        );
      const documents = await manualPrimary(
        ctx,
        page,
        leaseId,
        "documents",
        "Prepare the required documents",
        "documents",
      );
      book.note(
        "AC-S281-4",
        '"Prepare the required documents" focuses a control within the first screen',
        documents.found &&
          Boolean(documents.landed.focused) &&
          documents.landed.controlOnScreen,
        documents,
      );
      const delivery = await manualPrimary(
        ctx,
        page,
        leaseId,
        "documents",
        "Deliver the required documents",
        "document_delivery",
      );
      book.note(
        "AC-S281-4",
        '"Deliver the required documents" focuses a control within the first screen; saving it moves focus to the next action',
        delivery.found &&
          delivery.focusedRecordControl &&
          delivery.landed.controlOnScreen &&
          delivery.saved === 200 &&
          delivery.nextFocused,
        delivery,
      );
      const signatures = await manualPrimary(
        ctx,
        page,
        leaseId,
        "documents",
        "Collect the required signatures",
        "signatures",
      );
      if (signatures.found) {
        const advance = await readAdvance(ctx, page, {
          from: "documents",
          to: "finish-up",
          history: signatures.history,
        });
        book.note(
          "AC-S281-9",
          "recording the signatures advances Documents to Finish up: the address names it, no history entry, a reload shows it",
          signatures.saved === 200 && advance.ok,
          {
            signatures: { saved: signatures.saved, fromStep: signatures.fromStep },
            advance,
          },
        );
      } else
        book.note("AC-S281-9", "the signatures primary is offered", false, signatures);
    },
  );

  // ---- P8: phones, the desk and the five-tenant lease ------------------------------------------

  await part(ctx, book, "phone widths", ["AC-S281-6"], async () => {
    const phone = await ctx.newPage("Editor");
    const wideHeader = await (async () => {
      await screen(phone, DESKTOP);
      await kit.openPath(phone, DESK);
      return headerControls(phone);
    })();
    for (const width of PHONE_WIDTHS) {
      await screen(phone, { width, height: PHONE.height });
      await kit.openPath(phone, DESK);
      await phone.locator("tr[data-batch-lease]").first().waitFor({ timeout: 120_000 });
      await phone.waitForTimeout(1500);
      const header = await headerControls(phone);
      const missing = wideHeader.names.filter(
        (name) => name && !header.names.includes(name),
      );
      const search = await openSearch(phone);
      const menu = await openMenu(phone);
      book.note(
        "AC-S281-6",
        `desk ${width}px: the header is one row of at most ${HEADER_MAX}px with every control reachable`,
        header.height <= HEADER_MAX &&
          header.items.length > 0 &&
          header.items.every((item) => item.reachable) &&
          missing.length === 0 &&
          header.menu &&
          menu.links > 0 &&
          search.opened &&
          search.inHeader &&
          search.folded,
        {
          height: header.height,
          unreachable: header.items.filter((item) => !item.reachable),
          missing,
          search,
          menu,
        },
      );
      const table = await phone.evaluate(() => {
        const row = document.querySelector("tr[data-batch-lease]");
        const cells = row ? [...row.querySelectorAll(":scope > td, :scope > th")] : [];
        const identity = cells[0];
        const next = row?.querySelector("[data-batch-next-step]");
        const box = (node) => {
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          };
        };
        const scroller = row?.closest(".renewal-batch-table-scroll");
        return {
          lease: row?.getAttribute("data-batch-lease") ?? null,
          identity: box(identity),
          next: box(next),
          nextInSecondColumn: Boolean(next && cells[1]?.contains(next)),
          scrollerScrolls: scroller ? scroller.scrollWidth > scroller.clientWidth : null,
          pageScrollsSideways:
            document.documentElement.scrollWidth > window.innerWidth + 1,
          phoneRows: [...document.querySelectorAll("details[data-batch-phone-row]")].map(
            (node) => node.getAttribute("data-batch-phone-row"),
          ),
          // A Prepare block the desk shows (the automatic start may be held) sits in its row.
          prepareShown: Boolean(document.querySelector("[data-kickoff-prepare]")),
          prepareOutsideRow: [
            ...document.querySelectorAll("[data-kickoff-prepare]"),
          ].some((node) => !node.closest("details[data-batch-phone-row]")),
          viewport: { width: window.innerWidth, height: window.innerHeight },
        };
      });
      const both =
        inScreen(table.identity, table.viewport) && inScreen(table.next, table.viewport);
      book.note(
        "AC-S281-6",
        `desk ${width}px: the first lease's address and next action are visible together without sideways scrolling${width === 390 ? ", within the first screen" : ""}; Prepare and the filters are one expandable row each`,
        Boolean(table.identity && table.next) &&
          table.identity.left >= -1 &&
          table.next.right <= table.viewport.width + 1 &&
          !table.pageScrollsSideways &&
          (width !== 390 || both) &&
          (!table.prepareShown ||
            (!table.prepareOutsideRow &&
              table.phoneRows.some((label) => /^Prepare /.test(label ?? "")))) &&
          table.phoneRows.includes("Filter renewals"),
        table,
      );
      for (const target of [oneTenant, fiveTenant]) {
        await kit.openPath(phone, DESK);
        const link = phone
          .locator(`tr[data-batch-lease="${target}"] a[href*="/lease/${target}"]`)
          .first();
        if (await kit.shownWithin(link, 60_000)) {
          await link.scrollIntoViewIfNeeded();
          await link.click();
          await phone
            .getByRole("region", { name: "Current renewal stage" })
            .waitFor({ timeout: 120_000 });
        } else await kit.openLease(phone, target);
        await phone
          .waitForLoadState("networkidle", { timeout: 30_000 })
          .catch(() => undefined);
        // Read the lease where it lands: no scroll of the checks' own.
        await waitForPrimary(ctx, phone, () => false, 60_000);
        await phone.waitForTimeout(800);
        const leaseRead = await phone.evaluate(() => {
          const toolbar = document.querySelector(".renewal-workspace-toolbar");
          const rect = toolbar?.getBoundingClientRect();
          const box = (node) => {
            if (!node) return null;
            const r = node.getBoundingClientRect();
            return r.height > 0
              ? {
                  top: Math.round(r.top),
                  bottom: Math.round(r.bottom),
                  left: Math.round(r.left),
                  right: Math.round(r.right),
                }
              : null;
          };
          const work = document.querySelector(
            "[data-renewal-now-step] [data-renewal-work]",
          );
          const cue =
            work?.querySelector("[data-renewal-priority-cue]") ??
            work?.querySelector(":scope > p");
          return {
            height: rect ? Math.round(rect.height) : null,
            cover: rect ? Math.round(rect.bottom) : 0,
            sticky: toolbar ? getComputedStyle(toolbar).position : null,
            compact: toolbar?.hasAttribute("data-renewal-toolbar-compact") ?? false,
            summary: (
              toolbar?.querySelector(".renewal-toolbar-summary")?.textContent ?? ""
            )
              .replace(/\s+/g, " ")
              .trim(),
            heading: box(document.getElementById("renewal-now-heading")),
            cue: box(cue),
            primary: box(document.getElementById("renewal-now-primary")),
            viewport: { width: window.innerWidth, height: window.innerHeight },
            pageScrollsSideways:
              document.documentElement.scrollWidth > window.innerWidth + 1,
          };
        });
        const details = await leaseDetails(phone, kit.row(target)?.lease?.tenants ?? []);
        const tenants = (kit.row(target)?.lease?.tenants ?? []).length;
        book.note(
          "AC-S281-6",
          `lease ${target} (${tenants} tenant${tenants === 1 ? "" : "s"}) at ${width}px: the pinned toolbar is sticky and at most ${TOOLBAR_MAX}px; Lease details holds the names, copy buttons, RentVine link and view controls`,
          leaseRead.compact &&
            leaseRead.sticky === "sticky" &&
            leaseRead.height !== null &&
            leaseRead.height <= TOOLBAR_MAX &&
            new RegExp(`${tenants} tenant`).test(leaseRead.summary) &&
            details.ok,
          { leaseRead, details },
        );
        if (width === 390)
          book.note(
            "AC-S281-6",
            `lease ${target} at 390x844 opened from the desk: the Now card's heading, cue and primary are in the first screen`,
            // On the screen and not under the pinned lease toolbar.
            inScreen(leaseRead.heading, leaseRead.viewport, leaseRead.cover) &&
              (leaseRead.cue === null ||
                inScreen(leaseRead.cue, leaseRead.viewport, leaseRead.cover)) &&
              inScreen(leaseRead.primary, leaseRead.viewport, leaseRead.cover) &&
              !leaseRead.pageScrollsSideways,
            leaseRead,
          );
      }
    }
    await phone.close().catch(() => undefined);
  });

  await part(ctx, book, "desk back", ["AC-S281-9"], async () => {
    const deskPage = await ctx.newPage("Editor");
    await screen(deskPage, DESKTOP);
    await kit.openPath(deskPage, DESK);
    await deskPage.locator("tr[data-batch-lease]").first().waitFor({ timeout: 120_000 });
    const group = deskPage
      .locator("button[data-batch-group]:not([data-batch-count='0'])")
      .first();
    let chosen = null;
    if (await group.count()) {
      chosen = await group.getAttribute("data-batch-group");
      await group.click();
      await deskPage
        .locator(`[data-batch-open-group="${chosen}"]`)
        .waitFor({ timeout: 30_000 })
        .catch(() => undefined);
    }
    const link = deskPage
      .locator("tr[data-batch-lease] a[href*='/lease/']")
      .filter({ visible: true })
      .first();
    await link.waitFor({ timeout: 60_000 });
    await link.scrollIntoViewIfNeeded();
    await deskPage.evaluate(() => window.scrollBy(0, 120));
    await deskPage.waitForTimeout(800);
    const before = await deskPage.evaluate(() => ({
      url: window.location.pathname + window.location.search,
      scrollY: Math.round(window.scrollY),
      group:
        document
          .querySelector("[data-batch-open-group]")
          ?.getAttribute("data-batch-open-group") ?? null,
    }));
    await link.click();
    await deskPage
      .getByRole("region", { name: "Current renewal stage" })
      .waitFor({ timeout: 120_000 });
    await waitForPrimary(ctx, deskPage, () => false, 60_000);
    // An explicit selection and its way back replace the address in place.
    const strip = deskPage.locator(
      "nav[aria-label='Renewal path'] li[data-renewal-path-step] button",
    );
    if ((await strip.count()) > 1) {
      await strip.first().click();
      await deskPage.waitForTimeout(1000);
      const showCurrent = deskPage
        .locator(`${NOW} [data-renewal-field="next-step"] button`)
        .filter({ hasText: "Show current step" })
        .first();
      if (await showCurrent.isVisible().catch(() => false)) await showCurrent.click();
      await deskPage.waitForTimeout(1000);
    }
    await deskPage.goBack({ waitUntil: "domcontentloaded" });
    await deskPage.locator("tr[data-batch-lease]").first().waitFor({ timeout: 120_000 });
    await deskPage
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
    await deskPage.waitForTimeout(2500);
    const after = await deskPage.evaluate(() => ({
      url: window.location.pathname + window.location.search,
      scrollY: Math.round(window.scrollY),
      group:
        document
          .querySelector("[data-batch-open-group]")
          ?.getAttribute("data-batch-open-group") ?? null,
    }));
    book.note(
      "AC-S281-9",
      "Back from the lease restores the desk's month, group and scroll",
      after.url === before.url &&
        after.group === before.group &&
        (chosen === null || after.group === chosen) &&
        Math.abs(after.scrollY - before.scrollY) <= 40,
      { chosen, before, after },
    );
    await deskPage.close().catch(() => undefined);
  });

  await part(ctx, book, "fix links on the five-tenant lease", ["AC-S281-4"], async () => {
    const result = await everyFixLink(ctx, page, book, fiveTenant, `lease ${fiveTenant}`);
    ctx.record({ fixLinkSweep: { lease: fiveTenant, ...result } });
  });

  return book.verdicts();
}

// ---- AC-S281-3: a sent step reads as sent ------------------------------------------------------

async function sentStepChecks(ctx, page, book, leaseId, step, audience) {
  await screen(page, DESKTOP);
  await openStep(ctx, page, leaseId, step);
  await page.waitForTimeout(1500);
  // Open the step's Verification disclosure by its summary, as staff do.
  const holder = page.locator(
    `details:has([data-renewal-sent-message-host="${audience}"])`,
  );
  for (let index = 0; index < (await holder.count()); index += 1) {
    const details = holder.nth(index);
    if ((await details.getAttribute("open")) !== null) continue;
    const summary = details.locator(":scope > summary");
    if (await summary.isVisible().catch(() => false)) {
      await summary.scrollIntoViewIfNeeded();
      await summary.click();
    }
  }
  await page
    .waitForFunction(
      (who) => {
        const host = document.querySelector(`[data-renewal-sent-message-host="${who}"]`);
        return Boolean(host?.querySelector('[data-renewal-field="sent-body"], .muted'));
      },
      audience,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1500);
  const read = await page.evaluate((who) => {
    const now = document.querySelector("[data-renewal-now-step]");
    const work = document.querySelector(`[data-renewal-message-work="${who}"]`);
    const shown = (node) => node.getBoundingClientRect().height > 0;
    const host = document.querySelector(`[data-renewal-sent-message-host="${who}"]`);
    const holder = host?.closest("details");
    const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
    return {
      sentMarker: Boolean(work?.hasAttribute("data-renewal-message-sent")),
      readinessInMessage: work
        ? work.querySelectorAll('ul[aria-label="What sending needs"]').length
        : null,
      readinessShown: [
        ...(now?.querySelectorAll('ul[aria-label="What sending needs"]') ?? []),
      ].filter(shown).length,
      reasonShown: [...(now?.querySelectorAll("label") ?? [])].filter(
        (label) => shown(label) && /^Reason to include/.test(text(label)),
      ).length,
      reasonInMessage: work
        ? [...work.querySelectorAll("label")].filter((label) =>
            /^Reason to include/.test(text(label)),
          ).length
        : null,
      groups: [...(now?.querySelectorAll("details[data-renewal-group]") ?? [])]
        .filter(shown)
        .map((node) => node.getAttribute("data-renewal-group")),
      groupSteps: [...(now?.querySelectorAll("details[data-renewal-group]") ?? [])]
        .filter(shown)
        .map(
          (node) =>
            `${node.getAttribute("data-renewal-group")}@${node.getAttribute("data-renewal-group-step")}`,
        ),
      sendAgain: [...(now?.querySelectorAll("button") ?? [])].some(
        (button) => shown(button) && text(button) === "Send again",
      ),
      nowText: text(now?.querySelector("[data-renewal-work]")),
      verificationSummary: text(holder?.querySelector(":scope > summary")),
      verificationOpen: holder?.open ?? null,
      sentMessage: Boolean(host?.querySelector('[data-renewal-field="sent-message"]')),
      receipt: text(host?.querySelector('[data-renewal-field="sent-receipt"]')),
      body: text(host?.querySelector('[data-renewal-field="sent-body"]')).slice(0, 120),
    };
  }, audience);
  const sentLine = /\b(?:sent|accepted by Gmail)\b/i.test(read.nowText);
  book.note(
    "AC-S281-3",
    `${audience} send: no readiness list and no "Reason to include", the sent line and "Send again" stay, the sent message and receipt are inside Verification`,
    read.sentMarker &&
      read.readinessInMessage === 0 &&
      read.readinessShown === 0 &&
      read.reasonShown === 0 &&
      (read.reasonInMessage ?? 0) === 0 &&
      sentLine &&
      read.sendAgain &&
      // The step's read-only Verification group, under its own name ("Verify owner terms and
      // outreach", "Verify tenant terms and outreach").
      /^Verif/.test(read.verificationSummary) &&
      read.sentMessage &&
      /Gmail accepted it\./.test(read.receipt) &&
      read.body.length > 0,
    { ...read, nowText: read.nowText.slice(0, 1000) },
  );
  book.note(
    "AC-S281-8",
    `${step}: after the confirmed send "Message" and "Other ways to send" are absent`,
    !read.groupSteps.includes(`Message@${step}`) &&
      !read.groupSteps.includes(`Other ways to send@${step}`),
    { groups: read.groupSteps },
  );
}

// ---- AC-S281-6: the header and the lease toolbar on a phone ------------------------------------

/** Every control of the app header, whether it is rendered and reachable where it stands. */
async function headerControls(page) {
  return page.evaluate(() => {
    const header = document.querySelector("header.topbar");
    if (!header) return { height: null, items: [], names: [] };
    const headerBox = header.getBoundingClientRect();
    const nameOf = (element) => {
      if (element.matches("input"))
        return `${element.labels?.[0]?.textContent?.trim() ?? ""} input`;
      return (element.getAttribute("aria-label") || element.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50);
    };
    // The primary navigation's links open from Menu on a phone (S165), and the search field opens
    // from its trigger (R-S281-7): both are read through their own controls, not compared by name.
    const scopeOf = (element) =>
      element.closest("nav.primary-navigation")
        ? "nav"
        : element.closest(".global-entity-search")
          ? "search"
          : "other";
    const controls = [
      ...header.querySelectorAll(
        "a[href], button, input:not([type='hidden']), select, summary",
      ),
    ].filter(
      (element) =>
        !element.closest(
          ".primary-nav-mobile-region, .global-entity-search-popover, [role='menu'], [role='dialog'], [role='listbox']",
        ),
    );
    const items = controls.map((element) => {
      const style = getComputedStyle(element);
      const rendered =
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.getBoundingClientRect().width > 0;
      if (rendered) element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      const hit = rendered
        ? document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          )
        : null;
      return {
        name: nameOf(element),
        scope: scopeOf(element),
        rendered,
        reachable:
          rendered &&
          rect.left >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          Boolean(
            hit && (hit === element || element.contains(hit) || hit.contains(element)),
          ),
      };
    });
    window.scrollTo(0, 0);
    for (const scroller of header.querySelectorAll(".topbar-utilities"))
      scroller.scrollLeft = 0;
    const rendered = items.filter((item) => item.rendered);
    return {
      height: Math.round(headerBox.height),
      items: rendered,
      names: rendered.filter((item) => item.scope === "other").map((item) => item.name),
      menu: rendered.some((item) => item.scope === "nav" && item.reachable),
    };
  });
}

/** The search trigger opens the same search field in place and folds back on Escape. */
async function openSearch(page) {
  const trigger = page.getByRole("button", { name: "Search records" }).first();
  if (!(await trigger.isVisible().catch(() => false)))
    return { opened: false, inHeader: false, folded: false };
  await trigger.click();
  const field = page.locator("header.topbar input").filter({ visible: true }).first();
  const opened = await field
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  const inHeader = opened
    ? await field.evaluate((input) => {
        const header = input.closest("header.topbar")?.getBoundingClientRect();
        const rect = input.getBoundingClientRect();
        return Boolean(
          header &&
          rect.top >= header.top - 1 &&
          rect.bottom <= header.bottom + 1 &&
          rect.right <= window.innerWidth + 1,
        );
      })
    : false;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const folded = await trigger.isVisible().catch(() => false);
  return { opened, inHeader, folded };
}

/** Menu opens the primary navigation's links from the one-row header, and closes again. */
async function openMenu(page) {
  const menu = page
    .locator("header.topbar button.primary-nav-menu-trigger")
    .filter({ visible: true })
    .first();
  if (!(await menu.count())) return { links: 0, found: false };
  await menu.click();
  await page.waitForTimeout(600);
  const links = await page
    .locator("header.topbar .primary-nav-mobile-region :is(button, a[href])")
    .filter({ visible: true })
    .count();
  await page.keyboard.press("Escape");
  if ((await menu.getAttribute("aria-expanded")) === "true")
    await menu.click().catch(() => undefined);
  await page.waitForTimeout(300);
  return { links, found: true };
}

/** "Lease details" holds the tenant names, the copy buttons, the RentVine link and view controls. */
async function leaseDetails(page, tenants) {
  const details = page.locator("details[data-renewal-lease-details]").first();
  if (!(await details.count())) return { ok: false, reason: "no Lease details" };
  if ((await details.getAttribute("open")) === null)
    await details.locator(":scope > summary").click();
  await page.waitForTimeout(500);
  const read = await details.evaluate(
    (node, names) => {
      const body = node.querySelector(".renewal-lease-details-body");
      const shown = (element) => element.getBoundingClientRect().height > 0;
      const text = (body?.innerText ?? "").replace(/\s+/g, " ");
      return {
        names: names.filter((name) => text.includes(name)).length,
        copies: [...(body?.querySelectorAll("button") ?? [])].filter(
          (button) =>
            shown(button) &&
            /copy/i.test(
              `${button.textContent} ${button.getAttribute("aria-label") ?? ""}`,
            ),
        ).length,
        // "Open in RentVine", or the rehearsal's "RentVine link unavailable." with its own link.
        rentvine:
          [...(body?.querySelectorAll("a") ?? [])].some(
            (link) => shown(link) && /RentVine/.test(link.textContent ?? ""),
          ) || /RentVine link unavailable/.test(text),
        viewSwitch: Boolean(
          body?.querySelector(
            "[role='group'][aria-label='Lease view'], button[data-renewal-full-toggle]",
          ),
        ),
      };
    },
    tenants.map((tenant) => tenant.name),
  );
  await details
    .locator(":scope > summary")
    .click()
    .catch(() => undefined);
  return {
    ...read,
    ok:
      read.names === tenants.length &&
      read.copies >= 1 &&
      read.rentvine &&
      read.viewSwitch,
  };
}
