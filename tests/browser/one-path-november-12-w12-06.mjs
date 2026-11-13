// S284 W12-06, "Know which rent this is": the candidate-side acceptance checks of S277 (intake
// 155) for the November 12 qualification matrix.
//
// Spec: docs/feature-suites/renewal-rent-basis-affirmation-and-agreement-adoption.md (S277).
// Acceptance checks of this row (W12_MATRIX in one-path-november-12-qualification-verdict.mjs):
//   AC-S277-1, AC-S277-2, AC-S277-3, AC-S277-4, AC-S277-5, AC-S277-6
//
// Staff scenario (docs/feature-suites/staff-workflow-audit-qualification.md, W12 matrix):
//   On the covered lease follow "Set renewal base rent" and adopt the agreement amount. Affirm an
//   equal owner amount. Record answers before and after the dates exist. Read the monthly table.
//
// Starting sequence (journeyW1206 in one-path-november-12-journeys.mjs, the fail-first table):
//   Open the covered lease's Offer step and follow "Set renewal base rent". On the baseline:
//   Focus on "Owner decides each renewal"; no control adopts the agreement amount. The sequence
//   runs unchanged on the candidate: it leaves the Editor page where the link landed.
//
// What this row does after the starting sequence, all through controls staff use (no route is
// posted by this file; reads are GET routes the pages themselves read, the emulator and the
// stand-ins' state):
//   1. A second Editor follows the same link on the covered lease (its read is now the older one).
//      The first page adopts the agreement amount with one click; the second then clicks its own
//      adoption and must be refused with the existing recovery. The stored basis, the Offer step,
//      the Ask the owner facts and the monthly table are read back. An ordinary lease with an
//      empty base follows the same link and must land on Rent to recommend.
//   2. The prepared lease's stored comparison is read on the Offer step, in the Ask the owner
//      facts and in the owner message review (opened and cancelled; nothing is sent).
//   3. On the covered lease staff type 1760 in Rent to recommend instead.
//   4. The owner's answer is recorded in the Owner response form with "Same as recommended", the
//      dates link is followed and the return taken, and the base-rent-only answer is saved. The
//      renewal dates are entered, Documents is read, a new approval of 1775 covering the dates is
//      recorded, and Documents is read again.
//   5. Staff save a working correction of the current rent on the ordinary lease, read the
//      monthly table, then use the recommendation for the offer on the covered lease.
//   6. Decline and revision answers are chosen on a lease with a recommendation, and Approved on a
//      lease without one.
// Raw observations go to ctx.record (the private run directory); the row returns booleans only.
import { refusedConnections } from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  enterRenewalDates,
  openOwnerReview,
  reviewText,
  waitForPrimary,
} from "./one-path-november-12-journeys.mjs";
import { DESK, WORKING_ROUTE, WORKSPACE_ROUTE } from "./one-path-november-12-kit.mjs";

const PRICING_ROUTE = "/api/lease-renewal/pricing-policy";
const PACKET_INPUTS_ROUTE = "/api/lease-renewal/packet-inputs";
const SET_BASE = "Set renewal base rent";
const ADOPTION_ID = "renewal-standing-adoption";
const RENT_TO_RECOMMEND_ID = "renewal-now-rent-to-recommend";
const ADOPT_NAME = /^Use \$[\d,]+\.\d{2} from the agreement$/;
const SAME_AS_NAME = /^Same as recommended \(\$[\d,]+\.\d{2}\)$/;
const TYPED_RENT = 1760;
const SECOND_APPROVAL = 1775;
const RENEWAL_END = "2027-12-31";
const AMOUNT_FIELDS = new Set(["terms_rent", "recommended_rent", "current_rent"]);

/** S246 R-S246-7: the monthly table's columns, as the product had them before this batch. */
const MONTHLY_HEADER = [
  "Lease and tenants",
  "Next action",
  "Cycle or review date",
  "Stage and context",
  "Current base rent",
  "Rent to recommend",
];

/** The spec's words (R-S277-2 to R-S277-4). */
const WORDS = {
  comparison: "suggested from the stored comparison",
  staff: "entered by staff",
  ownerApproval: "approved by the owner on",
  offerAdoption: "adopted for the offer by staff",
  agreementGives: "the agreement gives",
  preparation: "monthly preparation",
  amountOnly:
    "This answer covers the base rent only. Documents will ask for the owner's approval of the renewal dates and charges.",
  exactTerms:
    "This answer covers the base rent and the renewal dates, so Documents asks for no second approval of the dates.",
  datesFirst:
    "To record that the owner also approved the dates, enter the renewal dates first.",
  datesLink: "Enter the renewal dates in Working renewal terms",
  returnToAnswer: "Return to the owner's answer",
  coversBaseOnly:
    "The base rent only. The renewal dates and other charges are not covered.",
  amountOnlyNotice:
    "The owner approved the base rent only. Record the owner's approval of the renewal dates and charges before packet execution.",
  templateSentence: "Our reviewed rental analysis suggests",
};

/** Request paths that would write to a provider, start a billed lookup or hand off a packet. */
const PROVIDER_WRITE_PATHS =
  /rentvine-writeback|writeback-approvals|writeback-execute|operating-sheet|document-handoff|filled-artifact|kickoff-preparation|market-comps|rent-suggestion|comp-screenshot/;
/** Hosts a provider write or a billed lookup would reach. */
const PROVIDER_HOSTS =
  /rentvine|googleapis|sheets|dotloop|gmail|rentometer|zillow|rentcast/i;

const squash = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
const money = (value) =>
  `$${Number(value)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
/** Whole-dollar and two-decimal renderings of one amount read the same ("$1,760" = "$1,760.00"). */
const norm = (text) => squash(text).replace(/\$([\d,]+)\.00(?!\d)/g, "$$$1");
const same = (a, b) => norm(a) === norm(b);
const includes = (text, part) =>
  norm(text).toLowerCase().includes(norm(part).toLowerCase());
/** The Central business date of an instant, as MM/DD/YYYY. */
const centralDay = (iso) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const CURRENCY = /^\$\d{1,3}(,\d{3})*\.\d{2}$/;

/** Central wall-clock time `minutesAgo` ago, as a datetime-local input value. */
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
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** A link that moves focus to another step lands after that step renders. */
async function settleFocus(page) {
  await page
    .waitForFunction(
      () =>
        document.activeElement &&
        document.activeElement !== document.body &&
        document.activeElement.id !== "renewal-now-primary",
      null,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(800);
}

/** The text of `locator` once `accept` takes it (the page reads the record after it renders). */
async function settledText(kit, locator, accept, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  let text = "";
  for (;;) {
    text = await kit.visibleText(locator.first());
    if (accept(text) || Date.now() >= deadline) return text;
    await locator.page().waitForTimeout(1000);
  }
}

/** The stored working entry of one field, as the lease page reads it. */
async function workingEntry(kit, page, leaseId, field = "terms_rent") {
  const answer = await kit.read(page, `${WORKING_ROUTE}?leaseId=${leaseId}`);
  return answer?.record?.fields?.[field] ?? null;
}
async function workingRecord(kit, page, leaseId) {
  return (await kit.read(page, `${WORKING_ROUTE}?leaseId=${leaseId}`))?.record ?? null;
}
const pick = (entry) =>
  entry
    ? {
        value: entry.value ?? null,
        origin: entry.origin ?? null,
        sourceLabel: entry.sourceLabel ?? null,
        context: String(entry.context ?? "").slice(0, 240),
        revision: entry.revision ?? null,
        recordedByLabel: entry.recordedByLabel ?? null,
        recordedAt: entry.recordedAt ?? null,
        basis: entry.basis?.kind ?? null,
      }
    : null;

/** The Offer step's "Renewal base rent" once its basis has loaded. */
async function offerBaseRent(kit, page, leaseId, accept) {
  await kit.openLease(page, leaseId, "?step=offer-tenant");
  const base = page.locator('[data-offer-charge-total="base"]');
  await base
    .first()
    .waitFor({ state: "attached", timeout: 60_000 })
    .catch(() => undefined);
  return settledText(kit, base, accept);
}

/** The Ask the owner facts line naming what the recommendation rests on. */
async function askOwnerFactLine(kit, page, leaseId, accept) {
  await kit.openLease(page, leaseId, "?step=ask-owner");
  const selector = '[data-renewal-field="owner-recommended-basis"]';
  let shown = await kit.reveal(page, selector, 45_000);
  if (!shown) {
    await kit.openLease(page, leaseId, "?view=full");
    shown = await kit.reveal(page, selector, 45_000);
  }
  return shown ? settledText(kit, page.locator(selector), accept) : null;
}

/**
 * Every display of the working renewal base and its basis on the lease's Full view, opened as
 * staff open each disclosure. Returns field -> visible texts.
 */
async function baseSurfaces(kit, page, leaseId) {
  await kit.openLease(page, leaseId, "?view=full");
  await page.waitForTimeout(4000);
  const fields = [
    "renewal-base-rent-basis",
    "working-base-basis",
    "future-rent-working-basis",
    "finish-up-rent-basis",
    "offer-amount-basis",
  ];
  const found = {};
  for (const field of fields) {
    const selector = `[data-renewal-field="${field}"]`;
    if ((await page.locator(selector).count()) === 0) continue;
    await kit.reveal(page, selector, 10_000);
    const texts = await page
      .locator(selector)
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => node.getClientRects().length > 0)
          .map((node) =>
            (node.innerText ?? node.textContent ?? "").replace(/\s+/g, " ").trim(),
          ),
      )
      .catch(() => []);
    if (texts.length) found[field] = texts;
  }
  return found;
}

/** The monthly table as staff read it: each table's header and each lease row's rent cells. */
async function readMonthlyTable(kit, page, leaseId) {
  await kit.openPath(page, DESK);
  await page
    .locator(`tr[data-batch-lease="${leaseId}"]`)
    .first()
    .waitFor({ timeout: 90_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const text = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
    const headers = [...document.querySelectorAll("table.renewal-batch-table")].map(
      (table) =>
        [...table.querySelectorAll("thead th")].map((th) =>
          text(th).replace(/[↑↓]/g, "").trim(),
        ),
    );
    const rows = [...document.querySelectorAll("tr[data-batch-lease]")].map((row) => {
      const base = row.querySelector('[data-batch-cell="base"]');
      const recommended = row.querySelector('[data-batch-cell="recommended"]');
      const basis = recommended?.querySelector("[data-batch-rent-basis]");
      const approved = recommended?.querySelector("[data-batch-approved-rent]");
      return {
        leaseId: row.getAttribute("data-batch-lease"),
        base: base ? text(base) : null,
        recommended: recommended
          ? [...recommended.childNodes]
              .filter((node) => node.nodeType === 3)
              .map((node) => node.textContent)
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
          : null,
        basis: basis ? text(basis) : null,
        approved: approved ? text(approved) : null,
      };
    });
    return { headers, rows };
  });
}
const tableRow = (table, leaseId) =>
  table?.rows.find((row) => row.leaseId === String(leaseId)) ?? null;
function tableFormatted(table) {
  return (
    table.headers.length > 0 &&
    table.headers.every(
      (header) => JSON.stringify(header) === JSON.stringify(MONTHLY_HEADER),
    ) &&
    table.rows.length > 0 &&
    table.rows.every(
      (row) =>
        (row.base === "Needs a check" ||
          CURRENCY.test(row.base?.replace(/^Working /, "") ?? "")) &&
        (row.recommended === "Not set" || CURRENCY.test(row.recommended ?? "")),
    )
  );
}

/** Follow "Set renewal base rent" on a lease's Offer step; resolves with where focus landed. */
async function followSetBaseRent(ctx, page, leaseId, { anchor = null, targetId }) {
  const { kit } = ctx;
  await kit.openLease(page, leaseId, "?step=offer-tenant");
  const primary = await waitForPrimary(ctx, page, (name) => name === SET_BASE);
  if (anchor)
    await page
      .locator(anchor)
      .first()
      .waitFor({ state: "attached", timeout: 60_000 })
      .catch(() => undefined);
  else await page.waitForTimeout(2000);
  if (primary !== SET_BASE) return { primary, focus: null, withinTarget: false };
  await kit.primary(page).click();
  await settleFocus(page);
  return {
    primary,
    focus: await kit.focused(page),
    withinTarget: await page.evaluate(
      (id) => Boolean(document.activeElement?.closest(`#${CSS.escape(id)}`)),
      targetId,
    ),
  };
}

/** The Owner response form, shown the way staff reach it (its disclosure, else Full view). */
async function ownerResponseForm(kit, page, leaseId) {
  const selector = "#renewal-manual-owner_response";
  await kit.openLease(page, leaseId, "?step=ask-owner");
  if (!(await kit.reveal(page, selector, 45_000))) {
    await kit.openLease(page, leaseId, "?view=full");
    if (!(await kit.reveal(page, selector, 45_000)))
      throw new Error(`Lease ${leaseId} shows no Owner response form.`);
  }
  return page.locator(selector);
}

/** Who approved, how ("Conversation"), the participants and when, as staff fill them. */
async function fillApprovalEvidence(approval, leaseId) {
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
}

/** "Review the owner's answer": the review's rows as staff read them. */
async function reviewOwnerAnswer(kit, page, approval) {
  await approval
    .getByRole("button", { name: "Review the owner's answer", exact: true })
    .click();
  const review = page.getByRole("region", { name: "Review the owner's answer" });
  await review.waitFor({ timeout: 30_000 });
  const field = (name) =>
    kit.visibleText(review.locator(`[data-renewal-field="${name}"]`).first());
  return {
    review,
    read: {
      recommended: await field("owner-answer-recommended"),
      approved: await field("owner-answer-approved"),
      covers: await field("owner-answer-coverage"),
      statement: await field("owner-answer-coverage-statement"),
    },
  };
}

/** "Save the owner's answer"; resolves with the workspace answer's status. */
async function saveOwnerAnswer(kit, page, review) {
  const saved = kit.appResponse(page, WORKSPACE_ROUTE, {
    match: (body) => body?.action?.kind === "owner_response",
  });
  await review
    .getByRole("button", { name: "Save the owner's answer", exact: true })
    .click();
  return (await saved).status();
}

/** What Documents shows about the owner's approval: its packet inputs, opened as staff open them. */
async function documentsApproval(kit, page, leaseId) {
  await kit.openLease(page, leaseId, "?step=documents");
  let open = page
    .getByRole("button", { name: "Open packet inputs", exact: true })
    .first();
  let via = "Documents step";
  if (!(await kit.shownWithin(open, 30_000))) {
    await kit.openLease(page, leaseId, "?view=full");
    await kit.reveal(page, `#packet-inputs-${leaseId}`, 30_000);
    open = page.getByRole("button", { name: "Open packet inputs", exact: true }).first();
    via = "Full view";
  }
  if (await kit.shownWithin(open, 20_000)) {
    const read = kit
      .appResponse(page, PACKET_INPUTS_ROUTE, { method: "GET", timeout: 120_000 })
      .catch(() => null);
    await open.click();
    await read;
    const status = page.locator("[data-owner-approval]").first();
    if (await kit.shownWithin(status, 60_000))
      return {
        via,
        state: await status.getAttribute("data-owner-approval"),
        text: await kit.visibleText(status),
      };
  }
  // The same packet inputs the Documents step renders, read as that step reads them.
  const view = await kit.read(page, `${PACKET_INPUTS_ROUTE}?leaseId=${leaseId}`);
  return {
    via: "packet inputs read",
    state: view?.ownerApproval?.state ?? null,
    text: view?.ownerApproval?.notice ?? null,
  };
}

/** The Rent to recommend editor, shown the way staff reach it. */
async function rentToRecommendEditor(kit, page, leaseId) {
  const selector = `#${RENT_TO_RECOMMEND_ID}`;
  await kit.openLease(page, leaseId, "?step=compare-market");
  if (!(await kit.reveal(page, selector, 45_000))) {
    await kit.openLease(page, leaseId, "?view=full");
    if (!(await kit.reveal(page, selector, 45_000)))
      throw new Error(`Lease ${leaseId} shows no Rent to recommend editor.`);
  }
  return page.locator(selector).first();
}

/** A stable digest of the stored templates: their fields and update times. */
async function templateDigest(kit) {
  const documents = await kit.listDocuments("templates");
  return JSON.stringify(
    documents
      .map((document) => [document.name, document.updateTime, document.fields])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

/**
 * W12-06 candidate checks. The qualification driver calls this once per run, right after
 * journeyW1206 ran on the same page, on the same build and in the same rehearsal.
 *
 * @param {object} ctx  the row's context: journeyId, kit, rehearsal, origin, leases, options,
 *   mode, binding, writes, newPage(role), resetState(), record(entry), unresolved(kind)
 * @param {import("playwright-core").Page} page  the signed-in Editor page the starting
 *   sequence used, still open where it left off
 * @param {{ observed: object | null, steps: object[], error: string | null }} start  the
 *   starting sequence's observation and step log, or (error) the message it stopped with
 * @returns {Promise<Record<string, boolean>>} AC-S277-1 to AC-S277-6 only, each true (passed) or
 *   false (failed). An id left out reads not recorded (the row UNVERIFIED); any other key reads
 *   as a mislabeled check (the row No); a throw stops the row (No).
 */
export async function checkW1206(ctx, page, start) {
  const { kit } = ctx;
  const covered = ctx.leases.covered;
  const prepared = ctx.leases.prepared;
  const role = kit.mix.roles?.covered ?? {};
  const agreementName = role.standingAgreement?.name ?? "Example Standing Agreement";
  const percent = Number(role.standingAgreement?.percentIncrease ?? 3);
  const ruleAmount = Math.round(covered.rent * (100 + percent)) / 100;
  const errors = {};
  const readings = {};
  /** Each staff click that writes an amount, for AC-S277-6. */
  let staffAmountWrites = 0;
  /** One note per phase (the driver keeps 2000 characters of each); tables row by row. */
  const note = (name, result) => {
    const { table, other, templates, ...rest } = result ?? {};
    void other;
    void templates;
    ctx.record({ phase: name, ...rest });
    if (table) {
      ctx.record({ phase: name, headers: table.headers });
      for (const row of table.rows)
        if (
          [covered.leaseId, prepared.leaseId, ctx.leases.missingRecipient?.leaseId]
            .map(String)
            .includes(row.leaseId) ||
          row.approved
        )
          ctx.record({ phase: name, row });
    }
  };
  const phase = async (name, body) => {
    try {
      const result = await body();
      readings[name] = result?.ok ?? (result ? "read" : null);
      note(name, result);
      return result;
    } catch (error) {
      errors[name] = String(error?.message ?? error).slice(0, 600);
      readings[name] = "error";
      ctx.record({ phase: name, error: errors[name] });
      return null;
    }
  };
  ctx.record({ phase: "start", error: start.error, observed: start.observed });

  // ---- Before anything: what the starting sequence left, and the safety baselines -------------

  const before = await phase("before", async () => ({
    base: pick(await workingEntry(kit, page, covered.leaseId)),
    authority: await kit
      .read(page, `${PRICING_ROUTE}?leaseId=${covered.leaseId}`)
      .then((body) => body?.authority ?? body?.view?.authority ?? null),
    templates: await templateDigest(kit),
    sent: (await kit.sentMail()).length,
    comparisons: Object.values(await kit.comparisons()).reduce(
      (sum, count) => sum + Number(count),
      0,
    ),
    providerRefusals: refusedConnections(ctx.rehearsal).filter((entry) =>
      PROVIDER_HOSTS.test(String(entry.host ?? "")),
    ).length,
  }));
  const authority = before?.authority ?? null;
  const agreementAmount = typeof authority?.amount === "number" ? authority.amount : null;
  const amount = agreementAmount ?? ruleAmount;
  const adoptLabel = `Use ${money(amount)} from the agreement`;

  // ---- AC-S277-1: the landing, the one-click adoption, the stale read and the readback ---------

  const landing = await phase("landing", async () => {
    const live = await page.evaluate((id) => {
      const active = document.activeElement;
      const box = document.getElementById(id);
      return {
        inAdoption: Boolean(box && active && box.contains(active)),
        tag: active?.tagName.toLowerCase() ?? null,
        text: (active?.textContent ?? "").replace(/\s+/g, " ").trim(),
        line: (
          box?.querySelector('[data-renewal-field="standing-adoption-line"]')
            ?.textContent ?? ""
        )
          .replace(/\s+/g, " ")
          .trim(),
      };
    }, ADOPTION_ID);
    return {
      primary: start.observed?.primary ?? null,
      focus: start.observed?.focus?.label ?? null,
      live,
      ok:
        !start.error &&
        start.observed?.primary === SET_BASE &&
        start.observed?.focus?.label === adoptLabel &&
        live.inAdoption &&
        live.tag === "button" &&
        live.text === adoptLabel &&
        live.line ===
          `${agreementName} gives ${money(amount)} (${percent} percent on ${money(covered.rent)}).`,
    };
  });

  // The second Editor reads the lease before the first adopts: its read is the older one.
  const stalePage = await phase("staleLanding", async () => {
    const other = await ctx.newPage("Editor");
    const landed = await followSetBaseRent(ctx, other, covered.leaseId, {
      anchor: `#${ADOPTION_ID}`,
      targetId: ADOPTION_ID,
    });
    return {
      other,
      landed,
      ok: landed.primary === SET_BASE && landed.withinTarget === true,
    };
  });

  const adoption = await phase("adoption", async () => {
    const button = page
      .locator(`#${ADOPTION_ID}`)
      .getByRole("button", { name: ADOPT_NAME });
    if (!(await kit.shownWithin(button, 30_000))) {
      // The starting sequence stopped early: follow the link as staff would, then adopt.
      await followSetBaseRent(ctx, page, covered.leaseId, {
        anchor: `#${ADOPTION_ID}`,
        targetId: ADOPTION_ID,
      });
    }
    const label = squash(await button.innerText());
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_rent",
    });
    staffAmountWrites += 1;
    await button.click();
    const response = await saved;
    const status = response.status();
    // The confirmation the action shows (recorded; the spec's readback is the stored basis, the
    // Offer step and the desk row below).
    const confirmation = page
      .locator('[data-renewal-field="standing-adoption-saved"]')
      .first();
    const savedLine = (await kit.shownWithin(confirmation, 20_000))
      ? await kit.visibleText(confirmation)
      : null;
    return {
      label,
      status,
      savedLine,
      confirmed:
        savedLine ===
        `${money(amount)} from ${agreementName} is the renewal base rent. Nothing was sent and no RentVine rent changed.`,
      ok: label === adoptLabel && status === 200,
    };
  });

  const stale = await phase("stale", async () => {
    const other = stalePage?.other;
    if (!other) throw new Error("The second Editor page did not open.");
    const storedBefore = pick(await workingEntry(kit, page, covered.leaseId));
    await other.evaluate(() => {
      const failed = [];
      window.__w1206Failed = failed;
      const collect = () =>
        document
          .querySelectorAll('[data-autosave="failed"]')
          .forEach((node) =>
            failed.push((node.textContent ?? "").replace(/\s+/g, " ").trim()),
          );
      new MutationObserver(collect).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    const button = other
      .locator(`#${ADOPTION_ID}`)
      .getByRole("button", { name: ADOPT_NAME });
    const offered = await kit.shownWithin(button, 10_000);
    if (!offered) return { offered, ok: false, storedBefore };
    const answer = kit.appResponse(other, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_rent",
    });
    staffAmountWrites += 1;
    await button.click();
    const response = await answer;
    const status = response.status();
    await other.waitForTimeout(2500);
    const recovery = await other.evaluate(() => ({
      flashed: [...new Set(window.__w1206Failed ?? [])].slice(0, 5),
      shown: [...document.querySelectorAll('[data-autosave="failed"]')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
    }));
    const storedAfter = pick(await workingEntry(kit, page, covered.leaseId));
    return {
      offered,
      status,
      recovery,
      storedBefore,
      storedAfter,
      ok:
        status === 409 &&
        recovery.shown.some((text) => /^Changed elsewhere\./.test(text)) &&
        storedAfter?.revision === storedBefore?.revision &&
        storedAfter?.value === amount,
    };
  });

  const readback = await phase("readback", async () => {
    const entry = pick(await workingEntry(kit, page, covered.leaseId));
    const version = authority?.policyVersion;
    return {
      entry,
      authority: authority
        ? {
            covered: authority.covered,
            kind: authority.kind,
            label: authority.label,
            amount: authority.amount,
            policyVersion: version,
          }
        : null,
      ok:
        authority?.covered === true &&
        authority?.kind === "standing" &&
        agreementAmount === ruleAmount &&
        entry?.value === amount &&
        entry?.origin === "adopted_source" &&
        entry?.sourceLabel === `Standing agreement ${agreementName}, rule v${version}` &&
        String(entry?.context ?? "").startsWith(
          `standing:${authority?.agreementId}:${authority?.policyId}:v${version}.`,
        ),
    };
  });

  const agreementOffer = await phase("agreementOffer", async () => {
    const expected = `${money(amount)} per month, from ${agreementName}.`;
    const text = await offerBaseRent(kit, page, covered.leaseId, (value) =>
      same(value, expected),
    );
    return { text, expected, ok: same(text, expected) };
  });

  const agreementFact = await phase("agreementFact", async () => {
    const entry = await workingEntry(kit, page, covered.leaseId);
    const expected = `Rent to recommend ${money(amount)}: from ${agreementName}, saved by ${entry?.recordedByLabel} on ${centralDay(entry?.recordedAt)}.`;
    const text = await askOwnerFactLine(kit, page, covered.leaseId, (value) =>
      same(value, expected),
    );
    // BEH-S277-1: the owner message, when this lease offers one, shows the adopted amount.
    let message = null;
    const primary = await kit.primaryName(page, 20_000);
    if (primary === "Review owner message") {
      const opened = await openOwnerReview(ctx, page, covered.leaseId);
      const dialog = opened.dialog;
      message = {
        basis: await kit.visibleText(
          dialog.locator('[data-renewal-field="review-rent-basis"]').first(),
        ),
        showsAmount: includes(await reviewText(ctx, dialog), money(amount)),
      };
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
    }
    return {
      text,
      expected,
      primary,
      message,
      ok:
        same(text, expected) &&
        Boolean(entry?.recordedByLabel) &&
        entry.recordedByLabel !== WORDS.preparation &&
        (!message || (same(message.basis, expected) && message.showsAmount)),
    };
  });

  const firstTable = await phase("firstTable", async () => {
    const table = await readMonthlyTable(kit, page, covered.leaseId);
    const row = tableRow(table, covered.leaseId);
    const prepRow = tableRow(table, prepared.leaseId);
    return {
      table,
      comparisonPhrase: prepRow?.basis === WORDS.comparison,
      ok:
        row?.recommended === money(amount) &&
        row?.basis === `from ${agreementName}` &&
        row?.base === money(covered.rent),
    };
  });

  // The ordinary lease: an empty base and no standing agreement or housing assistance.
  const ordinary = await phase("ordinary", async () => {
    const candidates = [
      ctx.leases.missingRecipient,
      ctx.leases.prepared,
      ctx.leases.replied,
    ].filter(Boolean);
    let chosen = null;
    for (const lease of candidates) {
      const entry = await workingEntry(kit, page, lease.leaseId);
      if (entry?.value === null || entry?.value === undefined) {
        chosen = lease;
        break;
      }
    }
    if (!chosen) throw new Error("No ordinary rehearsal lease has an empty base.");
    const landed = await followSetBaseRent(ctx, page, chosen.leaseId, {
      targetId: RENT_TO_RECOMMEND_ID,
    });
    return {
      leaseId: chosen.leaseId,
      landed,
      ok: landed.primary === SET_BASE && landed.withinTarget === true,
    };
  });
  const ordinaryLease = ordinary?.leaseId ?? ctx.leases.missingRecipient?.leaseId;

  // ---- AC-S277-2: the prepared comparison, read on the step, the facts and the owner review ----

  const comparison = await phase("comparison", async () => {
    const entry = await workingEntry(kit, page, prepared.leaseId);
    const value = entry?.value;
    const comparables = /Median of (\d+) comparable/i.exec(
      String(entry?.context ?? ""),
    )?.[1];
    const offerExpected = `${money(value)} per month, ${WORDS.comparison}.`;
    const offerText = await offerBaseRent(kit, page, prepared.leaseId, (text) =>
      same(text, offerExpected),
    );
    const line = `Rent to recommend ${money(value)}: ${WORDS.comparison}${comparables ? ` (median of ${comparables})` : ""}, saved by ${WORDS.preparation} on ${centralDay(entry?.recordedAt)}.`;
    const factPattern = (text) =>
      same(text, line) ||
      (!comparables &&
        new RegExp(
          `^Rent to recommend \\$[\\d,]+: ${WORDS.comparison}( \\(median of \\d+\\))?, saved by ${WORDS.preparation} on ${centralDay(entry?.recordedAt)}\\.$`,
        ).test(norm(text)));
    const fact = await askOwnerFactLine(kit, page, prepared.leaseId, factPattern);
    const opened = await openOwnerReview(ctx, page, prepared.leaseId);
    const reviewBasis = await kit.visibleText(
      opened.dialog.locator('[data-renewal-field="review-rent-basis"]').first(),
    );
    const message = await reviewText(ctx, opened.dialog);
    await opened.dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await opened.dialog
      .waitFor({ state: "hidden", timeout: 30_000 })
      .catch(() => undefined);
    return {
      entry: pick(entry),
      offerText,
      fact,
      reviewBasis,
      templateSentence: includes(message, `${WORDS.templateSentence} ${money(value)}`),
      ok:
        entry?.origin === "adopted_source" &&
        typeof value === "number" &&
        same(offerText, offerExpected) &&
        factPattern(fact) &&
        factPattern(reviewBasis) &&
        same(fact, reviewBasis),
    };
  });

  // ---- The typed amount on the covered lease (BEH-S277-2) --------------------------------------

  const typed = await phase("typed", async () => {
    const editor = await rentToRecommendEditor(kit, page, covered.leaseId);
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_rent",
    });
    staffAmountWrites += 1;
    await editor.fill(String(TYPED_RENT));
    await editor.press("Enter");
    const status = (await saved).status();
    const entry = await workingEntry(kit, page, covered.leaseId);
    const sentence = `${money(TYPED_RENT)} ${WORDS.staff}; ${WORDS.agreementGives} ${money(amount)}.`;
    const offerExpected = `${money(TYPED_RENT)} per month, ${WORDS.staff}; ${WORDS.agreementGives} ${money(amount)}.`;
    const offerText = await offerBaseRent(kit, page, covered.leaseId, (text) =>
      same(text, offerExpected),
    );
    const factExpected = `Rent to recommend ${money(TYPED_RENT)}: entered by ${entry?.recordedByLabel} on ${centralDay(entry?.recordedAt)}.`;
    const fact = await askOwnerFactLine(kit, page, covered.leaseId, (text) =>
      same(text, factExpected),
    );
    // A typed amount still wins: the adoption is no longer offered (S250 R-S250-4).
    await page.waitForTimeout(3000);
    const adoptionOffered = await page
      .locator(`#${ADOPTION_ID}`)
      .getByRole("button", { name: ADOPT_NAME })
      .count();
    // The owner message review, when this lease offers one, names the same basis and recorder.
    let review = null;
    if ((await kit.primaryName(page, 20_000)) === "Review owner message") {
      const opened = await openOwnerReview(ctx, page, covered.leaseId);
      review = await kit.visibleText(
        opened.dialog.locator('[data-renewal-field="review-rent-basis"]').first(),
      );
      await opened.dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await opened.dialog
        .waitFor({ state: "hidden", timeout: 30_000 })
        .catch(() => undefined);
    }
    return {
      status,
      entry: pick(entry),
      sentence,
      offerText,
      fact,
      review,
      adoptionOffered,
      ok:
        status === 200 &&
        entry?.value === TYPED_RENT &&
        entry?.origin === "staff_entry" &&
        same(offerText, offerExpected) &&
        same(fact, factExpected) &&
        (review === null || same(review, factExpected)) &&
        adoptionOffered === 0,
    };
  });

  // ---- AC-S277-3 / AC-S277-4: the owner's answer before the dates exist ------------------------

  const firstAnswer = await phase("firstAnswer", async () => {
    const form = await ownerResponseForm(kit, page, covered.leaseId);
    await form
      .getByLabel("Owner response", { exact: true })
      .selectOption({ label: "Approved" });
    const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
    await approval.waitFor({ timeout: 30_000 });
    const amountField = approval.getByLabel("Amount approved", { exact: true });
    const emptyOnOpen = (await amountField.inputValue()) === "";
    const sameAs = approval.getByRole("button", { name: SAME_AS_NAME });
    const sameAsLabel = (await kit.shownWithin(sameAs, 15_000))
      ? squash(await sameAs.innerText())
      : null;
    await sameAs.click();
    const filled = await amountField.inputValue();
    const datesFirst = await kit.visibleText(
      approval.locator('[data-renewal-field="owner-answer-dates-first"]').first(),
    );
    const broaderOffered = await approval
      .locator('input[type="radio"][value="exact_terms"]')
      .count();
    // The dates link leads to the one Working renewal terms editor; the return keeps the entry.
    await approval.getByRole("link", { name: WORDS.datesLink, exact: true }).click();
    await page.waitForTimeout(1500);
    const atDates = await page.evaluate(() =>
      Boolean(document.activeElement?.closest("#renewal-working-terms-start")),
    );
    const back = page.getByRole("button", { name: WORDS.returnToAnswer, exact: true });
    const returnShown = await kit.shownWithin(back, 15_000);
    if (returnShown) await back.click();
    await page.waitForTimeout(1500);
    const returned = await page.evaluate(() =>
      Boolean(
        document.activeElement?.closest('[data-renewal-field="owner-answer-amount"]'),
      ),
    );
    const kept = await amountField.inputValue();
    await fillApprovalEvidence(approval, covered.leaseId);
    const { review, read } = await reviewOwnerAnswer(kit, page, approval);
    const status = await saveOwnerAnswer(kit, page, review);
    const entry = await workingEntry(kit, page, covered.leaseId);
    const workspace = await kit.read(
      page,
      `${WORKSPACE_ROUTE}?leaseId=${covered.leaseId}`,
    );
    const scope = workspace?.state?.ownerResponse?.approvedBase?.scope ?? null;
    return {
      emptyOnOpen,
      sameAsLabel,
      filled,
      datesFirst,
      broaderOffered,
      atDates,
      returnShown,
      returned,
      kept,
      read,
      status,
      entry: pick(entry),
      scope,
      affirmed:
        emptyOnOpen &&
        sameAsLabel === `Same as recommended (${money(TYPED_RENT)})` &&
        filled === TYPED_RENT.toFixed(2) &&
        same(read.recommended, `${money(TYPED_RENT)} per month, ${WORDS.staff}`) &&
        same(
          read.approved,
          `${money(TYPED_RENT)} per month, the same as the recommendation`,
        ) &&
        status === 200 &&
        entry?.value === TYPED_RENT &&
        entry?.basis?.kind === "owner_approval",
      coverage:
        same(datesFirst, `${WORDS.datesFirst} ${WORDS.datesLink}`) &&
        broaderOffered === 0 &&
        atDates &&
        returnShown &&
        returned &&
        kept === TYPED_RENT.toFixed(2) &&
        same(read.covers, WORDS.coversBaseOnly) &&
        same(read.statement, WORDS.amountOnly) &&
        status === 200 &&
        scope === "amount_only",
    };
  });

  const approvedFirst = await phase("approvedFirst", async () => {
    const entry = await workingEntry(kit, page, covered.leaseId);
    const phrase = `${WORDS.ownerApproval} ${centralDay(entry?.recordedAt)}`;
    const offerText = await offerBaseRent(kit, page, covered.leaseId, (text) =>
      includes(text, phrase),
    );
    return { phrase, offerText, ok: includes(offerText, `per month, ${phrase}`) };
  });

  const dates = await phase("dates", async () =>
    enterRenewalDates(ctx, page, covered.leaseId, {
      start: "day-after",
      end: RENEWAL_END,
    }),
  );

  const firstDocuments = await phase("firstDocuments", async () => {
    const read = await documentsApproval(kit, page, covered.leaseId);
    return {
      ...read,
      ok: read.state === "amount_only" && includes(read.text, WORDS.amountOnlyNotice),
    };
  });

  // ---- The owner's answer after the dates exist, with the broader coverage ----------------------

  const secondAnswer = await phase("secondAnswer", async () => {
    const record = await workingRecord(kit, page, covered.leaseId);
    const start = record?.fields?.terms_effective_date?.value ?? null;
    const end = record?.fields?.terms_end_date?.value ?? null;
    const form = await ownerResponseForm(kit, page, covered.leaseId);
    const again = form.getByRole("button", {
      name: "Record a new approval",
      exact: true,
    });
    if (await kit.shownWithin(again, 15_000)) await again.click();
    else
      await form
        .getByLabel("Owner response", { exact: true })
        .selectOption({ label: "Approved" });
    const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
    await approval.waitFor({ timeout: 30_000 });
    const amountField = approval.getByLabel("Amount approved", { exact: true });
    const emptyOnOpen = (await amountField.inputValue()) === "";
    const sameAsShown = await approval
      .getByRole("button", { name: SAME_AS_NAME })
      .count();
    const datesFirstShown = await approval
      .locator('[data-renewal-field="owner-answer-dates-first"]')
      .count();
    const broader = approval.locator('input[type="radio"][value="exact_terms"]');
    const broaderLabel = (await broader.count())
      ? squash(await broader.locator("xpath=..").innerText())
      : null;
    await broader.check();
    await amountField.fill(String(SECOND_APPROVAL));
    await fillApprovalEvidence(approval, covered.leaseId);
    const { review, read } = await reviewOwnerAnswer(kit, page, approval);
    const status = await saveOwnerAnswer(kit, page, review);
    const workspace = await kit.read(
      page,
      `${WORKSPACE_ROUTE}?leaseId=${covered.leaseId}`,
    );
    const response = workspace?.state?.ownerResponse ?? null;
    const terms = response?.approvedWorkingTerms ?? null;
    const entry = await workingEntry(kit, page, covered.leaseId);
    return {
      start,
      end,
      emptyOnOpen,
      sameAsShown,
      datesFirstShown,
      broaderLabel,
      read,
      status,
      scope: response?.approvedBase?.scope ?? null,
      terms: terms
        ? { effectiveDate: terms.effectiveDate, endDate: terms.endDate, rent: terms.rent }
        : null,
      entry: pick(entry),
      ok:
        Boolean(start && end) &&
        emptyOnOpen &&
        sameAsShown === 1 &&
        datesFirstShown === 0 &&
        broaderLabel ===
          `Base rent and the renewal dates, ${usDate(start)} to ${usDate(end)}` &&
        same(
          read.covers,
          `The base rent and the renewal dates, ${usDate(start)} to ${usDate(end)}. Other charges are not covered.`,
        ) &&
        same(read.statement, WORDS.exactTerms) &&
        status === 200 &&
        response?.approvedBase?.scope === "exact_terms" &&
        terms?.effectiveDate === start &&
        terms?.endDate === end &&
        entry?.value === SECOND_APPROVAL &&
        entry?.basis?.kind === "owner_approval",
    };
  });

  const secondDocuments = await phase("secondDocuments", async () => {
    const read = await documentsApproval(kit, page, covered.leaseId);
    return {
      ...read,
      ok:
        read.state === "current" &&
        !/renewal dates|effective date|end date/i.test(read.text),
    };
  });

  // ---- The approved base on every surface that shows it -----------------------------------------

  const approvedSurfaces = await phase("approvedSurfaces", async () => {
    const entry = await workingEntry(kit, page, covered.leaseId);
    const phrase = `${WORDS.ownerApproval} ${centralDay(entry?.recordedAt)}`;
    const offerText = await offerBaseRent(kit, page, covered.leaseId, (text) =>
      includes(text, phrase),
    );
    const surfaces = await baseSurfaces(kit, page, covered.leaseId);
    const texts = Object.values(surfaces).flat();
    return {
      phrase,
      offerText,
      surfaces,
      ok:
        includes(offerText, `${money(SECOND_APPROVAL)} per month, ${phrase}`) &&
        Boolean(surfaces["offer-amount-basis"]) &&
        texts.length >= 2 &&
        texts.every((text) => includes(text, phrase)),
    };
  });

  // ---- AC-S277-5: a working correction and the monthly table after the approval -----------------

  const correction = await phase("correction", async () => {
    const lease = ctx.leases.byId(ordinaryLease);
    const value = Number(lease.rent) - 10;
    const selector = "#renewal-working-current-rent input";
    await kit.openLease(page, ordinaryLease, "?step=check-numbers");
    if (!(await kit.reveal(page, selector, 45_000))) {
      await kit.openLease(page, ordinaryLease, "?view=full");
      if (!(await kit.reveal(page, selector, 45_000)))
        throw new Error(`Lease ${ordinaryLease} shows no Working current rent.`);
    }
    const field = page.locator(selector).first();
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "current_rent",
    });
    staffAmountWrites += 1;
    await field.fill(String(value));
    await field.blur();
    return { value, status: (await saved).status() };
  });

  const lastTable = await phase("lastTable", async () => {
    const table = await readMonthlyTable(kit, page, covered.leaseId);
    const row = tableRow(table, covered.leaseId);
    const corrected = tableRow(table, ordinaryLease);
    const prepRow = tableRow(table, prepared.leaseId);
    const others = table.rows.filter(
      (entry) => entry.leaseId !== String(covered.leaseId),
    );
    return {
      table,
      ok:
        tableFormatted(table) &&
        row?.base === money(covered.rent) &&
        row?.recommended === money(TYPED_RENT) &&
        row?.basis === WORDS.staff &&
        row?.approved === `Approved ${money(SECOND_APPROVAL)}` &&
        others.every((entry) => entry.approved === null) &&
        correction?.status === 200 &&
        corrected?.base === `Working ${money(correction.value)}` &&
        (!prepRow || prepRow.recommended === "Not set" || prepRow.basis !== null),
    };
  });

  // ---- "Use this amount for the offer": the offer adoption's basis ------------------------------

  const offerAdoption = await phase("offerAdoption", async () => {
    await rentToRecommendEditor(kit, page, covered.leaseId);
    const use = page
      .locator('[data-renewal-field="use-for-offer"]')
      .getByRole("button", { name: "Use this amount for the offer", exact: true });
    if (!(await kit.shownWithin(use, 30_000)))
      throw new Error("Use this amount for the offer is not offered.");
    await use.click();
    const dialog = page.getByRole("dialog", { name: "Use this amount for the offer?" });
    await dialog.waitFor({ timeout: 30_000 });
    const saved = kit.appResponse(page, WORKING_ROUTE, {
      match: (body) => body?.field === "terms_rent",
    });
    staffAmountWrites += 1;
    await dialog.getByRole("button", { name: /^Use \$[\d,.]+ for the offer$/ }).click();
    const status = (await saved).status();
    const entry = await workingEntry(kit, page, covered.leaseId);
    const offerExpected = `${money(TYPED_RENT)} per month, ${WORDS.offerAdoption}; ${WORDS.agreementGives} ${money(amount)}.`;
    const offerText = await offerBaseRent(kit, page, covered.leaseId, (text) =>
      same(text, offerExpected),
    );
    const surfaces = await baseSurfaces(kit, page, covered.leaseId);
    const texts = Object.values(surfaces).flat();
    return {
      status,
      entry: pick(entry),
      offerText,
      surfaces,
      ok:
        status === 200 &&
        entry?.value === TYPED_RENT &&
        entry?.basis?.kind === "recommendation" &&
        same(offerText, offerExpected) &&
        texts.length >= 1 &&
        texts.every((text) => includes(text, WORDS.offerAdoption)),
    };
  });

  // ---- AC-S277-3: no recommendation, then a revision and a decline where one exists -------------

  const noRecommendation = await phase("noRecommendation", async () => {
    const recommended = await workingEntry(kit, page, ordinaryLease, "recommended_rent");
    const base = await workingEntry(kit, page, ordinaryLease);
    const form = await ownerResponseForm(kit, page, ordinaryLease);
    await form
      .getByLabel("Owner response", { exact: true })
      .selectOption({ label: "Approved" });
    const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
    await approval.waitFor({ timeout: 30_000 });
    const field = await approval.getByLabel("Amount approved", { exact: true }).count();
    const control = await approval.getByRole("button", { name: SAME_AS_NAME }).count();
    return {
      recommendation: recommended?.value ?? base?.value ?? null,
      field,
      control,
      ok:
        (recommended?.value ?? base?.value ?? null) === null &&
        field === 1 &&
        control === 0,
    };
  });

  const otherAnswers = await phase("otherAnswers", async () => {
    const form = await ownerResponseForm(kit, page, prepared.leaseId);
    const select = form.getByLabel("Owner response", { exact: true });
    await select.selectOption({ label: "Approved" });
    const approval = form.locator('[data-renewal-field="owner-answer-approval"]');
    await approval.waitFor({ timeout: 30_000 });
    const withApproval = await approval
      .getByRole("button", { name: SAME_AS_NAME })
      .count();
    const shown = async () => ({
      field: await form.getByLabel("Amount approved", { exact: true }).count(),
      control: await form.getByRole("button", { name: SAME_AS_NAME }).count(),
    });
    const choose = async (label) => {
      const saved = kit
        .appResponse(page, WORKSPACE_ROUTE, {
          match: (body) => body?.action?.kind === "owner_response",
          timeout: 30_000,
        })
        .catch(() => null);
      await select.selectOption({ label });
      const response = await saved;
      await page.waitForTimeout(1000);
      return { status: response?.status() ?? null, ...(await shown()) };
    };
    const revision = await choose("Revision requested");
    const declined = await choose("Declined / non-renewal");
    return {
      withApproval,
      revision,
      declined,
      ok:
        withApproval === 1 &&
        [revision, declined].every(
          (entry) => entry.status === 200 && entry.field === 0 && entry.control === 0,
        ),
    };
  });

  // ---- AC-S277-6: what was written, sent or changed, and by which staff action ------------------

  const safety = await phase("safety", async () => {
    const writes = ctx.writes;
    const amountWrites = writes.filter(
      (write) => write.path === WORKING_ROUTE && AMOUNT_FIELDS.has(write.field),
    ).length;
    const approvals = writes.filter(
      (write) => write.path === WORKSPACE_ROUTE && write.kind === "owner_response",
    ).length;
    const providerWrites = writes.filter((write) =>
      PROVIDER_WRITE_PATHS.test(write.path),
    );
    const templateWrites = writes.filter((write) => /^\/api\/templates/.test(write.path));
    const templates = await templateDigest(kit);
    const sent = (await kit.sentMail()).length;
    const comparisons = Object.values(await kit.comparisons()).reduce(
      (sum, count) => sum + Number(count),
      0,
    );
    const providerRefusals = refusedConnections(ctx.rehearsal).filter((entry) =>
      PROVIDER_HOSTS.test(String(entry.host ?? "")),
    ).length;
    return {
      baseBeforeAdoption: before?.base ?? null,
      amountWrites,
      staffAmountWrites,
      approvals,
      providerWrites: providerWrites.map((write) => write.path),
      templateWrites: templateWrites.length,
      templatesUnchanged: templates === before?.templates,
      sentBefore: before?.sent ?? null,
      sent,
      comparisonsBefore: before?.comparisons ?? null,
      comparisons,
      providerRefusals: providerRefusals - (before?.providerRefusals ?? 0),
      ok:
        Boolean(before) &&
        (before.base === null || before.base.value === null) &&
        amountWrites === staffAmountWrites &&
        approvals === 4 &&
        providerWrites.length === 0 &&
        templateWrites.length === 0 &&
        templates === before.templates &&
        sent === before.sent &&
        comparisons === before.comparisons &&
        providerRefusals === before.providerRefusals &&
        comparison?.templateSentence === true,
    };
  });

  ctx.record({ phase: "summary", readings, errors: Object.keys(errors) });
  const ok = (value) => value?.ok === true;
  return {
    "AC-S277-1":
      ok(landing) &&
      ok(stalePage) &&
      ok(adoption) &&
      ok(stale) &&
      ok(readback) &&
      ok(agreementOffer) &&
      ok(firstTable) &&
      ok(ordinary),
    "AC-S277-2":
      ok(agreementOffer) &&
      ok(agreementFact) &&
      ok(firstTable) &&
      ok(comparison) &&
      firstTable.comparisonPhrase === true &&
      ok(typed) &&
      ok(approvedFirst) &&
      ok(approvedSurfaces) &&
      ok(lastTable) &&
      ok(offerAdoption),
    "AC-S277-3":
      firstAnswer?.affirmed === true &&
      secondAnswer?.emptyOnOpen === true &&
      secondAnswer?.sameAsShown === 1 &&
      ok(noRecommendation) &&
      ok(otherAnswers),
    "AC-S277-4":
      firstAnswer?.coverage === true &&
      dates?.start === 200 &&
      dates?.end === 200 &&
      ok(firstDocuments) &&
      ok(secondAnswer) &&
      ok(secondDocuments),
    "AC-S277-5":
      ok(firstTable) &&
      tableFormatted(firstTable.table) &&
      firstTable.table.rows.every((row) => row.approved === null) &&
      ok(lastTable),
    "AC-S277-6": ok(safety),
  };
}
