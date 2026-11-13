// S284 W12-07, "Finish the source updates": the candidate-side acceptance checks of S278 (intake
// 156) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-source-updates-from-working-terms.md (S278).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S278-1, AC-S278-2, AC-S278-3, AC-S278-4, AC-S278-5, AC-S278-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   Compare the pending Market value with the reviewed recommendation. Open each form from its
//   preview. With the deterministic Sheets adapter, review five cells together and confirm once,
//   change one value after the preview, and inject one conflict mid-run.
//
// Starting sequence (journeyW1207 in one-path-november-12-journeys.mjs, the fail-first table):
//   Save a recommendation that differs from the provider point estimate and read the pending
//   Market value. On the baseline: The pending value is the point estimate. It runs on the
//   candidate unchanged.
//
// HOW THIS ROW REACHES EACH STATE (R-S284-2). Staff controls only, on the prepared lease (9101):
//   M  Market value: the journey's state (Rent to recommend saved at rent + 75 and the comparison's
//      low figure moved); then the low figure moved again, Rent to recommend changed again, and,
//      after the harness reset, the untouched suggestion read before and after a staff save.
//   F  Forms from their previews: the renewal dates entered in Working renewal terms, Finish up's
//      "Review and apply in Rent and charges" for the RentVine end date and for the Sheet renewal
//      date, each read for its value, mark, focus, writes and provider calls; then each value
//      changed before its preview. The compiled rehearsal admits the RentVine proposal save only.
//      Its exact preview and emulator readback agree, and the separately guarded Apply stays closed.
//   L  The list: four staff activities recorded "Done: recorded by staff" (their Sheet cells join
//      the reviewed Market value), then "Source updates (N pending)" read row by row.
//   D  The deterministic Sheets adapter. The rehearsal keeps Sheet writes off (the runtime switch
//      is unset, so every Sheet update previews only and no proposal is created), as S278 and
//      S284 state: "Write behavior is verified with the existing deterministic Sheets adapter in
//      backend tests". This row runs those tests on the served tree, in the same rehearsal, under
//      the same network refusal preload with its own network log: the five-cell confirmation, a
//      value changed after the preview, a conflict, a refusal and a failed read-back at the first,
//      a middle and the last cell, a second confirmation, eleven cells, the single path, and the
//      list and form behavior behind them. The Firestore emulator case runs on the rehearsal's own
//      emulator under its own test project, so the rehearsal's documents are not touched. Each
//      acceptance check names the cases it needs; a case that is missing, skipped or failed reads
//      false.
// Nothing here sends, schedules or refreshes a message, applies a provider update or posts an app
// route. Raw observations go to ctx.record.
import { FIRST_TERM_END, enterRenewalDates } from "./one-path-november-12-journeys.mjs";
import { WORKING_ROUTE, WORKSPACE_ROUTE } from "./one-path-november-12-kit.mjs";
import {
  serverProviderCalls,
  sheetWriteAttempts,
} from "./one-path-november-12-provider-log.mjs";
import { runRehearsalVitest } from "./one-path-november-12-unit-run.mjs";

export const W1207_CHECKS = Object.freeze([
  "AC-S278-1",
  "AC-S278-2",
  "AC-S278-3",
  "AC-S278-4",
  "AC-S278-5",
  "AC-S278-6",
]);

const LIST = "#renewal-manual-source-updates";
const FINISH_UP = 'section[aria-label="Source updates from the final terms"]';
const RENTVINE_ROUTE = "/api/lease-renewal/rentvine-writeback";
const SHEET_ROUTE = "/api/lease-renewal/operating-sheet";
const SHEET_PREPARATION_OPERATIONS = new Set([
  "prepare_source",
  "prepare_derived_source",
  "prepare_market_value",
  "prepare_source_set",
]);
/** The staff words of S278 (lib/lease-renewal/source-updates-list.ts and set-words.ts). */
const WORDS = Object.freeze({
  mark: "From the working terms",
  paused: "Sheet updates are paused. Saved in the app.",
  sheetNow: "In the Sheet now:",
  rentvineNow: "In RentVine now:",
  basis: "Basis:",
  marketBasis: "Rent to recommend, entered by staff",
  prepare: "Prepare and review",
  reviewAll: (count) => `Review all ${count} Sheet updates`,
  heading: (count) => `Source updates (${count} pending)`,
  applyFromPreview: "Review and apply in Rent and charges",
  sheetOff: "Sheet updates are off by policy right now.",
});
/** The end date each form is changed to before its preview (AC-S278-2). */
const CHANGED_END = "2027-11-30";
/**
 * Staff activities whose "Done" records one operating Sheet cell each (SHEET_ACTIVITY in
 * lib/lease-renewal/workspace-state.ts), with their labels (MANUAL_ACTIVITIES).
 */
const ACTIVITIES = Object.freeze([
  {
    activity: "tenant_offer",
    label: "Tenant offer delivered",
    field: "renewal_letter_sent",
    preview: "Done — recorded by staff",
  },
  {
    activity: "information_form",
    label: "Information form sent",
    field: "info_form_sent",
    preview: "Yes",
  },
  {
    activity: "document_delivery",
    label: "Required documents delivered",
    field: "lease_docs_sent",
    preview: "Done — recorded by staff",
  },
  {
    activity: "signatures",
    label: "Required signatures complete",
    field: "esign_complete",
    preview: "Yes",
  },
]);

// ---- The deterministic Sheets adapter runs (part D) ---------------------------------------------

const UNIT_FILES = Object.freeze([
  "tests/unit/s278-sheet-set-execution.test.ts",
  "tests/unit/s278-sheet-set-contract.test.ts",
  "tests/unit/s278-source-updates-list.test.ts",
  "tests/unit/s278-source-updates-list-ui.test.tsx",
  "tests/unit/s278-form-prefill.test.tsx",
  "tests/unit/s278-market-value-source.test.ts",
  // AC-S278-6 preservation: the single Sheet update, the Sheet route, the RentVine form and route.
  "tests/unit/s160-operating-sheet-panel.test.tsx",
  "tests/unit/s98-operating-sheet-route.test.ts",
  "tests/unit/s97-rentvine-updates-panel.test.tsx",
  "tests/unit/s97-rentvine-writeback-route.test.ts",
]);
const FIRESTORE_FILES = Object.freeze(["tests/firestore/s278-sheet-set.test.ts"]);

/**
 * The cases each acceptance check needs from the adapter runs, by file and a title that must be
 * the case's whole name (ancestors and title joined by a space) or its start.
 */
const ADAPTER_CASES = Object.freeze({
  "AC-S278-1": [
    [
      "tests/unit/s278-market-value-source.test.ts",
      "S278 R-S278-1: Market value from the reviewed recommendation ARCH-S278-1 / BEH-S278-1",
    ],
    [
      "tests/unit/s278-market-value-source.test.ts",
      "S278 R-S278-1: Market value from the reviewed recommendation BEH-S278-2",
    ],
    [
      "tests/unit/s278-market-value-source.test.ts",
      "S278 R-S278-1: Market value from the reviewed recommendation AC-S278-1: varied independently",
    ],
  ],
  "AC-S278-2": [
    [
      "tests/unit/s278-form-prefill.test.tsx",
      "S278 R-S278-2: the form opens with the previewed value BEH-S278-3",
    ],
    [
      "tests/unit/s278-form-prefill.test.tsx",
      "S278 R-S278-2: the form opens with the previewed value AC-S278-2: the Sheet form opens with the renewal date filled; a changed value previews the changed value",
    ],
  ],
  "AC-S278-3": [
    [
      "tests/unit/s278-source-updates-list.test.ts",
      "S278 ARCH-S278-2: one list of the pending source updates AC-S278-3: shows every pending fact once",
    ],
    [
      "tests/unit/s278-source-updates-list.test.ts",
      "S278 ARCH-S278-2: one list of the pending source updates AC-S278-3: a confirmed read-back shows done with its receipt time and focus moves to the next waiting row",
    ],
    [
      "tests/unit/s278-source-updates-list.test.ts",
      "S278 ARCH-S278-2: one list of the pending source updates AC-S278-3: a conflict or refusal stays on its row with its recovery; the others keep their state",
    ],
    [
      "tests/unit/s278-source-updates-list-ui.test.tsx",
      "S278 R-S278-3: the one list of source updates BEH-S278-4: after a confirmed read-back the row shows done with its receipt time and focus moves to the next row",
    ],
    [
      "tests/firestore/s278-sheet-set.test.ts",
      "S278 R-S278-4: one confirmation for a lease row's listed Sheet cells R-S278-5: a conflict on the second cell",
    ],
  ],
  "AC-S278-4": [
    [
      "tests/unit/s278-sheet-set-execution.test.ts",
      "S278 ARCH-S278-3: one confirmation, one claim, write, read-back and receipt per cell BEH-S278-4 / AC-S278-4: five cells take one confirmation and leave five claims, five one-cell writes and five receipts",
    ],
    [
      "tests/unit/s278-sheet-set-execution.test.ts",
      "S278 ARCH-S278-3: one confirmation, one claim, write, read-back and receipt per cell BEH-S278-5 / AC-S278-4: a value changed between the preview and the confirmation refuses the whole confirmation",
    ],
    ...["conflict", "refusal", "readback"].flatMap((kind) =>
      [0, 2, 4].map((at) => [
        "tests/unit/s278-sheet-set-execution.test.ts",
        `S278 ARCH-S278-3: one confirmation, one claim, write, read-back and receipt per cell R-S278-5: a ${kind} stops the run at position ${at}: cells before it hold receipts, cells after it are unattempted, and the list names each group`,
      ]),
    ),
    [
      "tests/unit/s278-sheet-set-execution.test.ts",
      "S278 ARCH-S278-3: one confirmation, one claim, write, read-back and receipt per cell R-S278-5: nothing retries on its own",
    ],
    [
      "tests/unit/s278-sheet-set-contract.test.ts",
      "S278 ARCH-S278-3: one confirmation binds the ordered effect hashes of one row AC-S278-4: cells from two rows, current rent or a repeated field are never one set",
    ],
    [
      "tests/unit/s278-sheet-set-contract.test.ts",
      "S278 ARCH-S278-3: one confirmation binds the ordered effect hashes of one row AC-S278-4: at most ten cells, the first ten in list order",
    ],
    [
      "tests/unit/s278-source-updates-list.test.ts",
      "S278 ARCH-S278-2: one list of the pending source updates AC-S278-4: eleven pending cells give a review of ten and say one remains",
    ],
    [
      "tests/firestore/s278-sheet-set.test.ts",
      "S278 R-S278-4: one confirmation for a lease row's listed Sheet cells AC-S278-4: three cells, one confirmation",
    ],
    [
      "tests/firestore/s278-sheet-set.test.ts",
      "S278 R-S278-4: one confirmation for a lease row's listed Sheet cells BEH-S278-5: a value changed in the Sheet after the preview",
    ],
  ],
  "AC-S278-5": [
    [
      "tests/unit/s278-source-updates-list-ui.test.tsx",
      "S278 R-S278-3: the one list of source updates AC-S278-5: with the Sheet switch off every row still shows its preview values and no row can prepare a write",
    ],
    [
      "tests/unit/s278-source-updates-list.test.ts",
      "S278 ARCH-S278-2: one list of the pending source updates AC-S278-5: projecting the list makes no request and holds no write",
    ],
    [
      "tests/unit/s278-market-value-source.test.ts",
      "S278 R-S278-1: Market value from the reviewed recommendation AC-S278-5",
    ],
  ],
  "AC-S278-6": [
    [
      "tests/unit/s278-sheet-set-contract.test.ts",
      "S278 ARCH-S278-3: one confirmation binds the ordered effect hashes of one row AC-S278-6: a single update keeps its own one-effect preview and check",
    ],
    [
      "tests/firestore/s278-sheet-set.test.ts",
      "S278 R-S278-4: one confirmation for a lease row's listed Sheet cells AC-S278-6: a combined preview is never applied one cell at a time, and a single update keeps its own confirmation",
    ],
    [
      "tests/unit/s97-rentvine-updates-panel.test.tsx",
      "S97 RentVine updates panel uses one visible Apply action and posts the exact hashes once",
    ],
  ],
});
/** Files every one of whose cases must pass for a check (the preservation set of AC-S278-6). */
const WHOLE_FILES = Object.freeze({
  "AC-S278-6": [
    "tests/unit/s160-operating-sheet-panel.test.tsx",
    "tests/unit/s98-operating-sheet-route.test.ts",
    "tests/unit/s97-rentvine-updates-panel.test.tsx",
    "tests/unit/s97-rentvine-writeback-route.test.ts",
  ],
});

/** Whether every named case of a check passed, and every case of its whole files passed. */
function adapterVerdict(runs, check) {
  const cases = runs.flatMap((run) => run.cases);
  const needed = ADAPTER_CASES[check] ?? [];
  const missing = needed.filter(
    ([file, name]) =>
      !cases.some(
        (entry) =>
          entry.file === file && entry.name.startsWith(name) && entry.status === "passed",
      ),
  );
  const whole = (WHOLE_FILES[check] ?? []).filter((file) => {
    const inFile = cases.filter((entry) => entry.file === file);
    return inFile.length === 0 || inFile.some((entry) => entry.status !== "passed");
  });
  return {
    ok: missing.length === 0 && whole.length === 0,
    needed: needed.length,
    missing: missing.map(([file, name]) => `${file}: ${name.slice(0, 160)}`),
    wholeFilesNotPassing: whole,
  };
}

// ---- Reading what staff read --------------------------------------------------------------------

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const amount = (text) => Number(String(text ?? "").replace(/[$,]/g, ""));
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

/** Wait until no part of the page still says it is reading, then a moment for the last render. */
async function settled(page, timeout = 60_000) {
  await page
    .waitForFunction(
      () =>
        !/Reading the current|Opening lease|Updating renewals/i.test(
          document.body.innerText,
        ),
      null,
      { timeout },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1_500);
}

const serverCalls = ({ rehearsal }) => serverProviderCalls(rehearsal);
/** The Sheet stand-in's paths in a window, by count, for the record. */
const sheetPaths = (calls) =>
  calls
    .filter((entry) => entry.host === "sheets.googleapis.com")
    .reduce((counts, entry) => {
      const key = `${entry.method} ${String(entry.path ?? "").replace(/spreadsheets\/[^/:]+/, "spreadsheets/<id>")} found=${entry.found}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});

/** Finish up's "Source updates" list as staff read it, row by row. */
async function readList(ctx, page, leaseId) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=finish-up");
  let shown = await kit.shownWithin(page.locator(LIST).first(), 30_000);
  let place = "finish-up";
  if (!shown) {
    await kit.openLease(page, leaseId, "?view=full#renewal-manual-source-updates");
    shown = await kit.reveal(page, LIST, 30_000);
    place = "full";
  }
  if (!shown) return { shown: false, place, rows: [] };
  await settled(page);
  // The Sheet row's values arrive with the page's Sheet read; give them a moment.
  await page
    .waitForFunction(
      (selector) =>
        !/In the Sheet now: Not read/.test(
          document.querySelector(selector)?.textContent ?? "",
        ),
      LIST,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  const list = await page
    .locator(LIST)
    .first()
    .evaluate((root) => {
      const squashed = (text) => (text ?? "").replace(/\s+/g, " ").trim();
      const combined = root.querySelector("[data-renewal-source-updates-combined]");
      const combinedButton = combined?.querySelector("button") ?? null;
      return {
        heading: squashed(root.querySelector("h3, h2, h4")?.textContent),
        pendingAttribute: root.getAttribute("data-renewal-source-updates"),
        combined: combined
          ? {
              count: combined.getAttribute("data-renewal-source-updates-combined"),
              label: squashed(combinedButton?.textContent),
              disabled: combinedButton ? combinedButton.disabled : null,
              text: squashed(combined.textContent),
            }
          : null,
        rows: [...root.querySelectorAll("li[data-renewal-source-update]")].map((row) => {
          const button = row.querySelector("button");
          return {
            key: row.getAttribute("data-renewal-source-update"),
            state: row.getAttribute("data-renewal-source-update-state"),
            text: squashed(row.textContent),
            button: button
              ? {
                  name: button.getAttribute("aria-label") ?? squashed(button.textContent),
                  disabled: button.disabled,
                }
              : null,
            waits: Boolean(row.querySelector("[data-renewal-source-update-waits]")),
          };
        }),
        empty: squashed(root.querySelector(":scope > p:last-child")?.textContent),
      };
    });
  return { shown: true, place, ...list };
}

/** The pending Market value the list shows, or null. */
function listedMarketValue(list) {
  const row = list.rows?.find((entry) => entry.key === "sheet:market_value");
  if (!row) return null;
  const match = /^Market value:\s*\$?([\d,]+(?:\.\d+)?)/i.exec(row.text);
  return match ? amount(match[1]) : null;
}

/** Rent to recommend, saved as staff save it (Enter); resolves with the save's answer. */
async function saveRentToRecommend(ctx, page, leaseId, value) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=compare-market");
  const field = page.locator("#renewal-now-rent-to-recommend");
  await field.waitFor({ timeout: 60_000 });
  const before = await field.inputValue().catch(() => "");
  const saved = kit.appResponse(page, WORKING_ROUTE, {
    match: (body) => ["terms_rent", "recommended_rent"].includes(body?.field),
  });
  await field.fill(String(value));
  await field.press("Enter");
  const response = await saved;
  return {
    before: before || null,
    status: response.status(),
    field: response.request().postDataJSON()?.field ?? null,
  };
}

/** The comparison's low figure moved as staff move it, and the point estimate the panel shows. */
async function moveLowEstimate(ctx, page, leaseId, delta) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?view=full#renewal-market-comparison-controls");
  const controls = page.locator("#renewal-market-comparison-controls");
  await controls.waitFor({ state: "attached", timeout: 60_000 });
  const holder = controls.locator("details").first();
  if ((await holder.count()) > 0) await kit.openDisclosure(holder);
  const text = await kit.visibleText(controls);
  const point = amount(/point estimate \$([\d,]+(?:\.\d+)?)/i.exec(text)?.[1] ?? "");
  const low = controls.getByLabel(/^Market rent: low estimate/).first();
  if (!(await kit.shownWithin(low, 30_000)))
    return { shown: false, pointEstimate: point || null };
  const current = Number((await low.inputValue()) || 0);
  const next = current > 0 ? current + delta : 1000;
  const prepared = kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) => body?.action?.kind === "preparation",
    timeout: 60_000,
  });
  await low.fill(String(next));
  await low.press("Tab");
  const response = await prepared.catch(() => null);
  return {
    shown: true,
    pointEstimate: point || null,
    low: { from: current, to: next },
    status: response?.status() ?? null,
    pmiNumber: response?.request().postDataJSON()?.action?.pmiNumber ?? null,
  };
}

/** The input a preview filled: its value, mark, focus and the disclosure that holds it. */
async function readFilledInput(page, id) {
  return page.evaluate((inputId) => {
    const input = document.getElementById(inputId);
    if (!input) return { present: false };
    const hint = document.getElementById(`${inputId}-hint`);
    const describedBy = (input.getAttribute("aria-describedby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((ref) => document.getElementById(ref)?.textContent ?? "")
      .join(" ");
    const closed = [];
    for (let node = input.parentElement; node; node = node.parentElement)
      if (node instanceof HTMLDetailsElement && !node.open)
        closed.push(node.id || "details");
    return {
      present: true,
      value: input.value,
      prefilled: input.getAttribute("data-renewal-prefilled"),
      hint: (hint?.textContent ?? "").replace(/\s+/g, " ").trim() || null,
      describedBy: describedBy.replace(/\s+/g, " ").trim() || null,
      focused: document.activeElement === input,
      visible: input.checkVisibility(),
      closedHolders: closed,
    };
  }, id);
}

/**
 * Finish up's "Review and apply in Rent and charges" for one preview: the form it opens, read as
 * staff read it, and the writes and provider calls the opening made.
 */
async function openFromPreview(
  ctx,
  page,
  key,
  inputId,
  expected,
  extra = async () => ({}),
) {
  const writesBefore = ctx.writes.length;
  const callsBefore = serverCalls(ctx).length;
  const button = page.locator(`[data-renewal-finish-up-apply="${key}"]`).first();
  const buttonShown = await ctx.kit.shownWithin(button, 30_000);
  if (!buttonShown) return { key, buttonShown: false };
  const buttonText = squash(await button.innerText().catch(() => ""));
  await button.scrollIntoViewIfNeeded().catch(() => undefined);
  await button.click();
  await page
    .waitForFunction(
      ([id, value]) => {
        const input = document.getElementById(id);
        return Boolean(
          input && input.value === value && document.activeElement === input,
        );
      },
      [inputId, expected],
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  // Anything the opening would start has time to happen before it is counted.
  await page.waitForTimeout(3_000);
  const input = await readFilledInput(page, inputId);
  const more = await extra();
  const calls = serverCalls(ctx).slice(callsBefore);
  const writes = ctx.writes.slice(writesBefore);
  return {
    key,
    buttonShown,
    buttonText,
    input,
    ...more,
    writes,
    providerCalls: calls.map((entry) => ({
      served: entry.served ?? null,
      refused: entry.refused ?? null,
      host: entry.host ?? null,
      path: String(entry.path ?? "").slice(0, 120),
    })),
    url: new URL(page.url()).search + new URL(page.url()).hash,
  };
}

const openedRight = (opened, expected) =>
  opened.buttonShown === true &&
  opened.buttonText === WORDS.applyFromPreview &&
  opened.input?.present === true &&
  opened.input.value === expected &&
  opened.input.prefilled === "working-terms" &&
  [opened.input.hint, opened.input.describedBy].some((text) =>
    String(text ?? "").includes(WORDS.mark),
  ) &&
  opened.input.focused === true &&
  opened.input.visible === true &&
  opened.writes.length === 0 &&
  opened.providerCalls.length === 0;

/** Save the UI's one exact proposal through the compiled test fixture. No status or Apply request
 * receives the fixture's capability. The context's normal boundary still observes the request. */
async function saveRentvinePreview(ctx, page, save, leaseId) {
  const token = process.env.S260_SYNTHETIC_WORKER_TOKEN;
  const compiled = ctx.rehearsal.compiledMail != null;
  if (compiled && !/^[a-f0-9]{64}$/.test(token ?? ""))
    throw new Error("The compiled rehearsal source-preview capability is unavailable.");
  const path = ctx.origin + RENTVINE_ROUTE;
  const admitExactPreview = (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const body = request.postDataJSON();
    const effect = body?.effects?.[0];
    if (
      body?.operation !== "propose" ||
      body.leaseId !== String(leaseId) ||
      body.effects?.length !== 1 ||
      effect?.kind !== "renewal_dates_update" ||
      effect.after?.endDate !== CHANGED_END
    )
      return route.fallback();
    return route.fallback({
      headers: { ...request.headers(), "x-s260-source-preview": "Bearer " + token },
    });
  };
  if (compiled) await page.route(path, admitExactPreview);
  try {
    const proposed = ctx.kit
      .appResponse(page, RENTVINE_ROUTE, {
        match: (body) => body?.operation === "propose",
        timeout: 120_000,
      })
      .catch(() => null);
    await save.click();
    return await proposed;
  } finally {
    if (compiled) await page.unroute(path, admitExactPreview);
  }
}

/** Record each activity "Done: recorded by staff" in its own form, as staff do. */
async function recordActivities(ctx, page, leaseId) {
  const { kit } = ctx;
  const results = [];
  await kit.openLease(page, leaseId, "?view=full");
  for (const { activity, label } of ACTIVITIES) {
    const selector = `#renewal-manual-${activity}`;
    const shown = await kit.reveal(page, selector, 30_000);
    if (!shown) {
      results.push({ activity, shown: false });
      continue;
    }
    const details = page.locator(selector).first();
    if ((await details.getAttribute("open")) === null) await kit.openDisclosure(details);
    const select = details.getByLabel(`${label} outcome`, { exact: true });
    await select.waitFor({ timeout: 30_000 });
    const saved = kit.appResponse(page, WORKSPACE_ROUTE, {
      match: (body) =>
        body?.action?.kind === "activity" && body?.action?.activity === activity,
      timeout: 60_000,
    });
    await select.selectOption("done");
    const response = await saved.catch(() => null);
    results.push({ activity, shown: true, status: response?.status() ?? null });
    await page.waitForTimeout(1_000);
  }
  return results;
}

/** The emulator documents this row reads for AC-S278-5. */
async function writeEvidence(ctx) {
  const { kit } = ctx;
  const [registry, executions, setRuns, proposals] = await Promise.all([
    kit.listDocuments("action_registry"),
    kit.listDocuments("external_action_executions"),
    kit.listDocuments("operating_sheet_set_runs"),
    kit.listDocuments("operating_sheet_proposals"),
  ]);
  const versions = (documents) =>
    Object.fromEntries(
      documents.map(({ name, updateTime }) => [name.split("/").pop(), updateTime]),
    );
  return {
    productionAllowed: Object.fromEntries(
      registry.map((document) => [
        document.name.split("/").pop(),
        JSON.stringify(document.fields?.production_allowed ?? null),
      ]),
    ),
    executions: versions(executions),
    sheetExecutions: versions(
      executions.filter((document) =>
        document.fields?.actionKey?.stringValue?.startsWith("google_sheets."),
      ),
    ),
    setRuns: versions(setRuns),
    proposals: versions(proposals),
  };
}

// ---- The checks ---------------------------------------------------------------------------------

/**
 * W12-07 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1207 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S278-1 to AC-S278-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1207(ctx, page, start) {
  const { kit } = ctx;
  const leaseId = ctx.leases.prepared.leaseId;
  const rent = Number(ctx.leases.byId(leaseId)?.rent ?? 0);
  const observed = start.observed ?? {};
  ctx.record({
    startingSequence: start.error ? "stopped" : "completed",
    error: start.error,
    observed,
  });
  if (start.error)
    throw new Error(`The W12-07 starting sequence stopped: ${start.error}`);
  const callsAtStart = serverCalls(ctx).length;
  const appWritesAtStart = ctx.writes.length;
  const evidenceAtStart = await writeEvidence(ctx);

  // ---- M: the pending Market value against the reviewed recommendation (AC-S278-1) ----
  const recommendation = observed.recommendationSaved;
  const journeyRead = {
    recommendation,
    pointEstimate: observed.pointEstimate,
    pending: observed.pendingMarketValue,
    differs:
      recommendation !== null &&
      observed.pointEstimate !== null &&
      Math.abs(recommendation - observed.pointEstimate) >= 0.005,
    equalsRecommendation:
      recommendation !== null && observed.pendingMarketValue === recommendation,
  };
  // The provider's figures moved again, the recommendation unchanged.
  const moved = await moveLowEstimate(ctx, page, leaseId, -40);
  const afterMove = await readList(ctx, page, leaseId);
  // The recommendation changed, the provider's figures unchanged.
  const second = rent + 125;
  const resaved = await saveRentToRecommend(ctx, page, leaseId, second);
  const afterResave = await readList(ctx, page, leaseId);
  const marketRow = afterResave.rows.find((row) => row.key === "sheet:market_value");
  const varied = {
    moved,
    afterMove: listedMarketValue(afterMove),
    resaved,
    afterResave: listedMarketValue(afterResave),
    marketRow: marketRow?.text ?? null,
  };
  ctx.record({ part: "M", journeyRead, varied });

  // ---- F: each form opened from its Finish up preview (AC-S278-2) ----
  const dates = await enterRenewalDates(ctx, page, leaseId, {
    start: "day-after",
    end: FIRST_TERM_END,
  });
  await kit.openLease(page, leaseId, "?step=finish-up");
  const finish = page.locator(FINISH_UP).first();
  let finishShown = await kit.shownWithin(finish, 30_000);
  if (!finishShown) {
    await kit.openLease(page, leaseId, "?view=full");
    finishShown = await kit.reveal(page, FINISH_UP, 30_000);
  }
  await settled(page);
  const previews = finishShown
    ? await finish.evaluate((root) => ({
        state: root.getAttribute("data-renewal-finish-up-previews"),
        keys: [...root.querySelectorAll("[data-renewal-finish-up-preview]")].map((node) =>
          node.getAttribute("data-renewal-finish-up-preview"),
        ),
        applyButtons: [...root.querySelectorAll("[data-renewal-finish-up-apply]")].map(
          (node) => node.getAttribute("data-renewal-finish-up-apply"),
        ),
        text: (root.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 1200),
      }))
    : null;
  const finishUrl = page.url();
  const rentvineOpened = await openFromPreview(
    ctx,
    page,
    "rentvine-dates",
    "s97-end-date",
    FIRST_TERM_END,
  );
  // Changed before its preview: the mark clears, and the saved proposal previews the new date.
  let rentvineChanged = { attempted: false };
  if (rentvineOpened.input?.present) {
    const input = page.locator("#s97-end-date");
    await input.fill(CHANGED_END);
    await page.waitForTimeout(500);
    const afterEdit = await readFilledInput(page, "s97-end-date");
    const form = input.locator("xpath=ancestor::form[1]");
    const save = form.getByRole("button", {
      name: "Save proposal from fresh RentVine state",
      exact: true,
    });
    const writesBefore = ctx.writes.length;
    const callsBefore = serverCalls(ctx).length;
    const response = await saveRentvinePreview(ctx, page, save, leaseId);
    const body = response ? await response.json().catch(() => null) : null;
    await kit.shownWithin(
      page.getByRole("heading", { name: "Review RentVine updates", exact: true }).first(),
      30_000,
    );
    await page.waitForTimeout(1_500);
    // The saved proposal's own read-only review in the compiled rehearsal.
    const effects = await page.evaluate(() => {
      const heading = [...document.querySelectorAll("h1, h2, h3, h4")].find(
        (node) => (node.textContent ?? "").trim() === "Review RentVine updates",
      );
      const holder = heading?.closest("div.ui-stack");
      const list = holder?.querySelector(":scope > ol");
      return list
        ? [...list.children].map((item) => {
            const preview = item.querySelector('dl[aria-label="Exact update preview"]');
            const value = (label) =>
              [...(preview?.querySelectorAll("dt") ?? [])]
                .find((term) => term.textContent?.trim() === label)
                ?.nextElementSibling?.textContent?.trim() ?? null;
            return {
              current: value("Current"),
              proposed: value("Proposed"),
              apply: [...item.querySelectorAll("button")].filter(
                (button) => button.textContent?.trim() === "Apply RentVine update",
              ).length,
            };
          })
        : [];
    });
    const proposalEffects = body?.proposal?.effects ?? [];
    const datesEffect = proposalEffects.find(
      (effect) => effect?.kind === "renewal_dates_update",
    );
    const stored = await kit.readDocument(`renewal_writeback_proposals/${leaseId}`);
    const storedEffects = stored?.fields?.effects?.arrayValue?.values ?? [];
    const storedHash = storedEffects[0]?.mapValue?.fields?.effectHash?.stringValue;
    const previewHash = body?.proposal?.preview_hash;
    const readback =
      /^[a-f0-9]{64}$/.test(previewHash ?? "") &&
      body?.proposal?.lease_id === String(leaseId) &&
      stored?.fields?.leaseId?.stringValue === String(leaseId) &&
      stored?.fields?.previewHash?.stringValue === previewHash &&
      storedEffects.length === 1 &&
      /^[a-f0-9]{64}$/.test(storedHash ?? "") &&
      storedHash === datesEffect?.effect_hash;
    rentvineChanged = {
      attempted: true,
      afterEdit,
      status: response?.status() ?? null,
      error: body?.error ?? null,
      readback,
      effectKinds: proposalEffects.map((effect) => effect?.kind),
      datesBefore: datesEffect?.effect?.before?.endDate ?? null,
      datesAfter: datesEffect?.effect?.after?.endDate ?? null,
      effects,
      writes: ctx.writes.slice(writesBefore),
      rentvineWrites: serverCalls(ctx)
        .slice(callsBefore)
        .filter((entry) => entry.refused === "rentvine_write").length,
    };
  }
  // The Sheet renewal date's preview, from the same Finish up.
  await page.goto(finishUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page
    .getByRole("region", { name: "Current renewal stage" })
    .waitFor({ timeout: 120_000 });
  await settled(page);
  const sheetOpened = await openFromPreview(
    ctx,
    page,
    "sheet-renewal_date",
    "sheet-field-value",
    FIRST_TERM_END,
    async () => ({
      field: await page
        .locator("#sheet-field")
        .inputValue()
        .catch(() => null),
    }),
  );
  let sheetChanged = { attempted: false };
  if (sheetOpened.input?.present) {
    await page.locator("#sheet-field-value").fill(CHANGED_END);
    await page.waitForTimeout(500);
    const afterEdit = await readFilledInput(page, "sheet-field-value");
    const panel = page
      .locator("#sheet-field-value")
      .locator("xpath=ancestor::article[1]");
    const panelText = squash(await panel.innerText().catch(() => ""));
    const submit = page
      .locator("#sheet-field-value")
      .locator("xpath=ancestor::form[1]")
      .locator('button[type="submit"]')
      .first();
    const applyButtons = await panel
      .getByRole("button", { name: /^Apply (?:Sheet update|\d+ Sheet updates)$/ })
      .all();
    sheetChanged = {
      attempted: true,
      afterEdit,
      switchOffNotice: panelText.includes(WORDS.sheetOff),
      applyAvailable: (
        await Promise.all(applyButtons.map((button) => button.isEnabled()))
      ).some(Boolean),
      previewButton: (await submit.count())
        ? {
            text: squash(await submit.innerText().catch(() => "")),
            disabled: await submit.isDisabled().catch(() => null),
          }
        : null,
    };
  }
  ctx.record({
    part: "F",
    dates,
    previews,
    rentvineOpened,
    rentvineChanged,
    sheetOpened,
    sheetChanged,
  });

  // ---- L: the one list, with four recorded Sheet cells beside the Market value ----
  const recorded = await recordActivities(ctx, page, leaseId);
  const list = await readList(ctx, page, leaseId);
  ctx.record({ part: "L", recorded, list });

  // ---- D: the deterministic Sheets adapter, on the served tree ----
  const directory = "w1207-adapter";
  const unitRun = await runRehearsalVitest(ctx.rehearsal, directory, "unit", UNIT_FILES);
  const firestoreRun = await runRehearsalVitest(
    ctx.rehearsal,
    directory,
    "firestore",
    FIRESTORE_FILES,
    {
      args: ["--config", "vitest.firestore.config.ts"],
      env: { FIRESTORE_EMULATOR_HOST: ctx.rehearsal.firestoreEmulatorHost },
    },
  );
  const runs = [unitRun, firestoreRun];
  const runsClean = runs.every(
    (run) =>
      run.code === 0 &&
      run.totals !== null &&
      run.totals.failed === 0 &&
      run.totals.passed > 0 &&
      run.refused === 0,
  );
  const verdicts = Object.fromEntries(
    W1207_CHECKS.map((check) => [check, adapterVerdict(runs, check)]),
  );
  ctx.record({
    part: "D",
    runs: runs.map(({ cases, ...run }) => ({ ...run, cases: cases.length })),
    runsClean,
    verdicts,
  });

  const callsInRow = serverCalls(ctx).slice(callsAtStart);
  const sheetAppWrites = ctx.writes
    .slice(appWritesAtStart)
    .filter(
      ({ path, kind }) =>
        path === SHEET_ROUTE ||
        (path === WORKSPACE_ROUTE && SHEET_PREPARATION_OPERATIONS.has(kind)),
    );
  const evidenceAfter = await writeEvidence(ctx);

  // ---- M, last: the untouched prepared suggestion after the harness reset ----
  await ctx.resetState();
  // The prepared suggestion as the step shows it: the field, where its value came from, its basis.
  const untouchedField = await (async () => {
    await kit.openLease(page, leaseId, "?step=compare-market");
    const field = page.locator("#renewal-now-rent-to-recommend");
    await field.waitFor({ timeout: 60_000 }).catch(() => undefined);
    await settled(page);
    const holder = page.locator(".renewal-now-rent").first();
    return {
      value: (await field.inputValue().catch(() => "")) || null,
      origin: await holder.getAttribute("data-renewal-rent-origin").catch(() => null),
      basis: squash(
        await holder
          .locator('[data-renewal-field="rent-basis"]')
          .innerText()
          .catch(() => ""),
      ),
    };
  })();
  const untouched = await readList(ctx, page, leaseId);
  const reviewedValue = rent + 50;
  const reviewed = await saveRentToRecommend(ctx, page, leaseId, reviewedValue);
  const afterReview = await readList(ctx, page, leaseId);
  ctx.record({
    part: "M after reset",
    untouchedField,
    untouched: untouched.rows,
    reviewed,
    afterReview: afterReview.rows,
  });

  // ---- The checks ----
  const sheetRows = list.rows.filter((row) => row.key?.startsWith("sheet:"));
  const keys = list.rows.map((row) => row.key);
  const expectedKeys = [
    "sheet:market_value",
    ...ACTIVITIES.map(({ field }) => `sheet:${field}`),
    "sheet-terms:renewal_date",
    "rentvine:rentvine-dates",
  ];
  const pending = list.rows.filter((row) => row.state !== "done").length;
  const savedRentvinePreview =
    rentvineChanged.status === 200 &&
    rentvineChanged.readback &&
    rentvineChanged.effectKinds.length === 1 &&
    rentvineChanged.datesBefore === ctx.leases.byId(leaseId)?.endDate &&
    rentvineChanged.datesAfter === CHANGED_END &&
    rentvineChanged.effects.length === 1 &&
    rentvineChanged.effects[0].current ===
      `ends ${usDate(rentvineChanged.datesBefore)}` &&
    rentvineChanged.effects[0].proposed === `ends ${usDate(CHANGED_END)}` &&
    rentvineChanged.effects[0].apply === 0 &&
    rentvineChanged.writes.filter((write) => write.path === RENTVINE_ROUTE).length ===
      1 &&
    rentvineChanged.writes.some(
      (write) => write.path === RENTVINE_ROUTE && write.kind === "propose",
    ) &&
    rentvineChanged.rentvineWrites === 0 &&
    JSON.stringify(evidenceAtStart.executions) ===
      JSON.stringify(evidenceAfter.executions);

  const ac1 =
    journeyRead.differs &&
    journeyRead.equalsRecommendation &&
    observed.pendingIsPointEstimate === false &&
    moved.shown === true &&
    moved.status === 200 &&
    varied.afterMove === recommendation &&
    resaved.status === 200 &&
    varied.afterResave === second &&
    String(varied.marketRow ?? "").includes(`${WORDS.basis} ${WORDS.marketBasis}`) &&
    untouched.shown === true &&
    !untouched.rows.some((row) => row.key === "sheet:market_value") &&
    // An untouched prepared suggestion: the preparation's value, saved or suggested, not staff's.
    ![null, "none"].includes(untouchedField.origin) &&
    (untouchedField.value !== null || /Suggested \$/.test(untouchedField.basis)) &&
    reviewed.status === 200 &&
    listedMarketValue(afterReview) === reviewedValue &&
    verdicts["AC-S278-1"].ok;

  const ac2 =
    dates.start === 200 &&
    dates.end === 200 &&
    previews?.state === "assembled" &&
    openedRight(rentvineOpened, FIRST_TERM_END) &&
    openedRight(sheetOpened, FIRST_TERM_END) &&
    sheetOpened.field === "renewal_date" &&
    rentvineChanged.attempted === true &&
    rentvineChanged.afterEdit?.value === CHANGED_END &&
    !rentvineChanged.afterEdit?.prefilled &&
    !String(rentvineChanged.afterEdit?.hint ?? "").includes(WORDS.mark) &&
    savedRentvinePreview &&
    sheetChanged.attempted === true &&
    sheetChanged.afterEdit?.value === CHANGED_END &&
    !sheetChanged.afterEdit?.prefilled &&
    verdicts["AC-S278-2"].ok;

  const ac3 =
    list.shown === true &&
    recorded.every((entry) => entry.status === 200) &&
    expectedKeys.every((key) => keys.filter((entry) => entry === key).length === 1) &&
    new Set(keys).size === keys.length &&
    list.heading === WORDS.heading(pending) &&
    list.pendingAttribute === String(pending) &&
    list.rows.every(
      (row) =>
        row.text.includes(WORDS.basis) &&
        (row.key.startsWith("rentvine:")
          ? row.text.includes(WORDS.rentvineNow)
          : row.text.includes(WORDS.sheetNow)),
    ) &&
    runsClean &&
    verdicts["AC-S278-3"].ok;

  const ac4 =
    list.combined?.count === "5" &&
    list.combined.label === WORDS.reviewAll(5) &&
    runsClean &&
    verdicts["AC-S278-4"].ok;

  const productionAllowedSame =
    JSON.stringify(evidenceAtStart.productionAllowed) ===
    JSON.stringify(evidenceAfter.productionAllowed);
  // The paused list is a read-only preview of the fixture's existing row. It shows the exact
  // candidate values without preparing an executable proposal. Confirmations and receipts
  // are proved independently against the deterministic adapter above.
  const shownPreviews = Object.fromEntries(
    list.rows.flatMap((row) => {
      const parts =
        /^(.*?): (.*?)\. In the Sheet now: (.*?)\. Basis: (.*?)\. Sheet updates are paused\./.exec(
          row.text,
        );
      return parts
        ? [
            [
              row.key,
              { field: parts[1], next: parts[2], current: parts[3], basis: parts[4] },
            ],
          ]
        : [];
    }),
  );
  const expectedPreviews = [
    ...ACTIVITIES.map(({ field, preview }) => [
      `sheet:${field}`,
      preview,
      "Staff record",
    ]),
    ["sheet-terms:renewal_date", usDate(FIRST_TERM_END), "Working renewal terms"],
  ];
  const previewsMatch =
    expectedPreviews.every(
      ([key, next, basis]) =>
        shownPreviews[key]?.next === next &&
        shownPreviews[key]?.current === "Blank" &&
        shownPreviews[key]?.basis === basis,
    ) &&
    listedMarketValue(list) === second &&
    shownPreviews["sheet:market_value"]?.current === "Blank" &&
    shownPreviews["sheet:market_value"]?.basis.startsWith(WORDS.marketBasis) &&
    Object.keys(shownPreviews).length === sheetRows.length + 1;
  const noSheetRecordsChanged = ["sheetExecutions", "setRuns", "proposals"].every(
    (key) => JSON.stringify(evidenceAtStart[key]) === JSON.stringify(evidenceAfter[key]),
  );
  const ac5 =
    sheetRows.length >= 5 &&
    previewsMatch &&
    sheetRows.every(
      (row) =>
        row.text.includes(WORDS.sheetNow) &&
        row.text.includes(WORDS.basis) &&
        row.text.includes(WORDS.paused) &&
        row.button?.name === `${WORDS.prepare}: ${row.text.split(":")[0]}` &&
        row.button.disabled === true,
    ) &&
    list.combined?.disabled === true &&
    sheetAppWrites.length === 0 &&
    sheetWriteAttempts(callsInRow).length === 0 &&
    noSheetRecordsChanged &&
    productionAllowedSame &&
    sheetChanged.switchOffNotice === true &&
    sheetChanged.previewButton?.disabled === true &&
    sheetChanged.applyAvailable === false &&
    runsClean &&
    verdicts["AC-S278-5"].ok;

  const ac6 =
    savedRentvinePreview &&
    list.rows
      .filter((row) => row.key.startsWith("sheet:"))
      .every((row) => row.button?.name?.startsWith(`${WORDS.prepare}: `)) &&
    runsClean &&
    verdicts["AC-S278-6"].ok;

  const checks = {
    "AC-S278-1": Boolean(ac1),
    "AC-S278-2": Boolean(ac2),
    "AC-S278-3": Boolean(ac3),
    "AC-S278-4": Boolean(ac4),
    "AC-S278-5": Boolean(ac5),
    "AC-S278-6": Boolean(ac6),
  };
  ctx.record({
    checks,
    keys,
    expectedKeys,
    pending,
    sheetWriteAttempts: sheetWriteAttempts(callsInRow).length,
    sheetAppWrites,
    sheetPaths: sheetPaths(callsInRow),
    productionAllowedSame,
    previewsMatch,
    shownPreviews,
    noSheetRecordsChanged,
    evidenceAtStart: { ...evidenceAtStart, productionAllowed: undefined },
    evidenceAfter: { ...evidenceAfter, productionAllowed: undefined },
  });
  return checks;
}
