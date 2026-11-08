// S252 ARCH-S252-1, R-S252-1, L24 and L61: the journey driver's step log, its budget counters and
// a guide follower. Files under scripts/lib/one-path-rehearsal travel with `--commit`, so the same
// counting rule measures the candidate and the starting commit.
//
// THE COUNTING RULE (ARCH-S252-1). A deliberate staff action is a choice, an entry or a
// confirmation the driver itself performs; each is one entry in the step log. Scrolling is logged
// separately and never counted as an action. An optional edit, such as changing a suggested rent
// or adding a reason, is logged as optional and excluded (the S252 assumption). Browser pages and
// tabs are read from the browser context, never inferred.
//
// THE GUIDE FOLLOWER (L24, L61). It performs guide steps read from the served commit's in-app help
// (read-guides.mjs), each by the role of the control the step names:
//   region, step id "open-a-lease"    choose the target lease's link inside that region (a choice)
//   button, link, summary              one click (a choice; a confirmation when the step sends,
//                                      creates a draft or changes a source)
//   label                              one entry, with the value the plan gives (no value: the
//                                      step is logged as an optional edit and not performed)
//   heading, status, region, navigation, list, article, table, img
//                                      read: the control must be shown; no action
// A step's browser-check preparation (`control.actions`, for example `click-button:Full view`)
// is a real click for staff, so it is performed and counted unless the view is already chosen.
// A click that opens another page continues on that page, as staff do. A control the step names
// that is absent fails the step: the follower uses only controls the guides name.

const ACTION_KINDS = new Set(["choice", "entry", "confirmation"]);
const READ_ROLES = new Set([
  "heading",
  "status",
  "region",
  "navigation",
  "list",
  "article",
  "table",
  "img",
  "complementary",
  "group",
  "row",
  "columnheader",
]);
const CONFIRMING_EFFECTS = new Set([
  "explicit-send",
  "exact-confirmation",
  "unsent-draft",
]);

/** The journey's own step log. Every budget is counted from it. */
export function createStepLog() {
  const entries = [];
  const log = {
    entries,
    /** A deliberate action: kind is "choice", "entry" or "confirmation". */
    act(phase, kind, label, detail = {}) {
      if (!ACTION_KINDS.has(kind)) throw new Error(`Unknown action kind ${kind}.`);
      entries.push({ at: new Date().toISOString(), phase, kind, label, ...detail });
    },
    scroll(phase, label, detail = {}) {
      entries.push({
        at: new Date().toISOString(),
        phase,
        kind: "scroll",
        label,
        ...detail,
      });
    },
    optional(phase, label, detail = {}) {
      entries.push({
        at: new Date().toISOString(),
        phase,
        kind: "optional",
        label,
        ...detail,
      });
    },
    read(phase, label, detail = {}) {
      entries.push({
        at: new Date().toISOString(),
        phase,
        kind: "read",
        label,
        ...detail,
      });
    },
    mark() {
      return entries.length;
    },
    since(mark) {
      return entries.slice(mark);
    },
  };
  return log;
}

/** Deliberate actions, scrolls and optional edits in a slice of the step log. */
export function countActions(slice) {
  const actions = slice.filter((entry) => ACTION_KINDS.has(entry.kind));
  return {
    actions: actions.length,
    choices: actions.filter((entry) => entry.kind === "choice").length,
    entries: actions.filter((entry) => entry.kind === "entry").length,
    confirmations: actions.filter((entry) => entry.kind === "confirmation").length,
    scrolls: slice.filter((entry) => entry.kind === "scroll").length,
    optional: slice.filter((entry) => entry.kind === "optional").length,
    labels: actions.map((entry) => `${entry.kind}: ${entry.label}`),
  };
}

/** Pages open in a browser context now (tabs), never inferred. */
export const openPages = (context) => context.pages().filter((page) => !page.isClosed());

/**
 * One budget result. `maxActions` and `maxPages` are the R-S252-1 bounds; a null bound is not
 * checked. A budget passes only when every bound holds and every extra condition is true.
 */
export function budgetResult(name, { counted, pages, maxActions, maxPages, extra = {} }) {
  const failures = [];
  if (maxActions !== null && maxActions !== undefined && counted.actions > maxActions)
    failures.push(`${counted.actions} deliberate actions, more than ${maxActions}`);
  if (maxPages !== null && maxPages !== undefined && pages > maxPages)
    failures.push(`${pages} pages or tabs, more than ${maxPages}`);
  for (const [condition, holds] of Object.entries(extra))
    if (!holds) failures.push(condition);
  return {
    name,
    passed: failures.length === 0,
    actions: counted.actions,
    maxActions: maxActions ?? null,
    pages,
    maxPages: maxPages ?? null,
    scrolls: counted.scrolls,
    optionalExcluded: counted.optional,
    labels: counted.labels,
    failures,
  };
}

function scopeOf(page, region) {
  if (!region) return page;
  const [role, ...rest] = region.split(":");
  return rest.length
    ? page.getByRole(role, { name: rest.join(":"), exact: true }).first()
    : page.getByRole("region", { name: region, exact: true }).first();
}

/** The control a guide step names, located by role and accessible name in its scope. */
export function guideControl(page, step) {
  const scope = scopeOf(page, step.control.region);
  const { label, role } = step.control;
  if (role === "summary")
    return scope
      .locator("summary")
      .filter({ hasText: new RegExp(`^\\s*${escape(label)}\\s*$`) })
      .first();
  if (role === "label") return scope.getByLabel(label, { exact: true }).first();
  return scope.getByRole(role, { name: label, exact: true }).first();
}

function escape(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function shownWithin(locator, timeout) {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * Follow guide steps as staff would. `state.page` is the page in use and moves to a new page
 * when a click opens one. Resolves with one result per step; `onStep(step, result, state)` runs
 * after each step so the journey can check what the step should show.
 */
export async function followGuide({
  state,
  steps,
  log,
  phase,
  leaseId,
  values = {},
  timeout = 90_000,
  onStep = async () => undefined,
}) {
  const results = [];
  for (const step of steps) {
    const page = state.page;
    const result = { ref: step.ref, role: step.control.role, label: step.control.label };
    process.stdout.write(
      `expect ${phase}: ${step.ref} shows ${step.control.role} "${step.control.label}"\n`,
    );
    try {
      for (const preparation of step.control.actions ?? []) {
        const [verb, ...rest] = preparation.split(":");
        const name = rest.join(":");
        if (verb !== "click-button") continue;
        const button = page.getByRole("button", { name, exact: true }).first();
        if ((await button.getAttribute("aria-pressed").catch(() => null)) === "true")
          continue;
        await button.waitFor({ state: "visible", timeout });
        await button.click();
        log.act(phase, "choice", `${name} (the step's preparation)`, { ref: step.ref });
        await page.waitForTimeout(800);
      }
      const role = step.control.role;
      if (role === "region" && step.id === "open-a-lease") {
        const region = guideControl(page, step);
        await region.waitFor({ state: "visible", timeout });
        const link = region
          .locator(`a[href*="/lease-renewal/live/desk/lease/${leaseId}"]`)
          .first();
        await link.waitFor({ state: "visible", timeout });
        await clickAndFollow(
          state,
          link,
          log,
          phase,
          "choice",
          `open lease ${leaseId}`,
          step,
        );
        result.performed = "choice";
      } else if (READ_ROLES.has(role)) {
        const control = guideControl(page, step);
        const shown = await shownWithin(
          control,
          step.control.availability === "conditional"
            ? Math.min(timeout, 30_000)
            : timeout,
        );
        result.performed = "read";
        result.shown = shown;
        log.read(phase, `${step.control.label} (${role})`, { ref: step.ref, shown });
        if (!shown && step.control.availability === "required")
          throw new Error(
            `The guide names ${role} "${step.control.label}", which is not shown.`,
          );
      } else if (role === "label") {
        const value = values[step.id] ?? values[step.ref];
        const control = guideControl(page, step);
        await control.waitFor({ state: "visible", timeout });
        if (value === undefined) {
          log.optional(phase, `${step.control.label} (entry left as shown)`, {
            ref: step.ref,
          });
          result.performed = "optional";
        } else {
          const tag = await control.evaluate((element) => element.tagName.toLowerCase());
          if (tag === "select") await control.selectOption(String(value));
          else await control.fill(String(value));
          await control.blur().catch(() => undefined);
          log.act(phase, "entry", step.control.label, { ref: step.ref });
          result.performed = "entry";
        }
      } else {
        const control = guideControl(page, step);
        await control.waitFor({ state: "visible", timeout });
        const kind = CONFIRMING_EFFECTS.has(step.effect) ? "confirmation" : "choice";
        await clickAndFollow(state, control, log, phase, kind, step.control.label, step);
        result.performed = kind;
      }
      result.ok = true;
    } catch (error) {
      result.ok = false;
      result.error = String(error?.message ?? error).slice(0, 400);
    }
    results.push(result);
    await onStep(step, result, state);
    if (!result.ok) break;
  }
  return results;
}

/** Click; when the click opens another page, continue there as staff do. */
export async function clickAndFollow(
  state,
  locator,
  log,
  phase,
  kind,
  label,
  step = null,
) {
  const context = state.page.context();
  const before = new Set(openPages(context));
  const opened = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
  await locator.click();
  log.act(phase, kind, label, step ? { ref: step.ref } : {});
  const page = await opened;
  if (page && !before.has(page)) {
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    state.page = page;
    state.maxPages = Math.max(state.maxPages ?? 1, openPages(context).length);
  }
  state.maxPages = Math.max(state.maxPages ?? 1, openPages(context).length);
  return state.page;
}
