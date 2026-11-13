// S271 N10-07 (S269 priority and exact resume) and N10-08 (S270 named disclosures) with the
// rendered N09-10-style verifier, including its five deliberate negative controls.
import assert from "node:assert/strict";
import {
  NOVEMBER_TEN_NEGATIVE_CONTROLS,
  injectNovemberTenDefect,
  inspectNovemberTenOutcome,
  novemberTenOutcomeFaults,
  restoreNovemberTenDefect,
} from "./one-path-november-10-outcome-check.mjs";
import { NARROW, STEPS, WIDE, uuid } from "./one-path-november-10-kit.mjs";

const WORKING = "/api/lease-renewal/working-record";
/** S270 useNamedDisclosure: why a named disclosure holds current work (data-renewal-promoted). */
const PROMOTED_REASONS = [
  "save-failed",
  "save-saving",
  "invalid",
  "governing",
  "lead",
  "date-fix-return",
];
export const GROUP_NAMES = {
  "check-numbers": ["Correct other lease facts", "Verify lease numbers"],
  "compare-market": [
    "Comparison inputs and deliberate rerun",
    "Verify market comparison",
  ],
  "ask-owner": [
    "Owner message options and outreach record",
    "Verify owner terms and outreach",
  ],
  "offer-tenant": [
    "Tenant offer options and record of contact",
    "Verify offer facts and delivery",
  ],
  documents: ["Other packet and handoff work", "Verify forms and signing evidence"],
  "finish-up": ["Other follow-ups", "Verify follow-up and source updates"],
  complete: [null, "Verify completion"],
};

// The R-S281-12 message and contact groups replace the earlier combined S270 labels.
const RECORD_GROUPS = {
  "ask-owner": "Outreach record",
  "offer-tenant": "Record of contact",
};

async function guidedCheck(ctx, page, lease, step) {
  const { kit } = ctx;
  await kit.open(page, kit.href(lease, "?step=" + step));
  await kit
    .now(page)
    .locator(`[data-renewal-work][data-renewal-outcome="${step}"]`)
    .waitFor();
  await kit.now(page).locator("details[data-renewal-verification]").first().waitFor();
  const report = await kit.now(page).evaluate(inspectNovemberTenOutcome);
  return { view: "guided", step, report, faults: novemberTenOutcomeFaults(report) };
}

async function fullChecks(ctx, page, lease) {
  const { kit } = ctx;
  await kit.open(page, kit.href(lease, "?view=full"));
  const checks = [];
  for (const step of STEPS) {
    const outcome = page.locator(`section[data-renewal-outcome="${step}"]`);
    await outcome.waitFor();
    const report = await outcome.evaluate(inspectNovemberTenOutcome);
    checks.push({ view: "full", step, report, faults: novemberTenOutcomeFaults(report) });
  }
  return checks;
}

/** The read-only verification account, through the real session route (N09-10's fixture). */
export async function signInReadOnly(ctx, page) {
  const { rehearsal, origin } = ctx;
  assert.match(rehearsal.authEmulatorHost, /^127\.0\.0\.1:[1-9]\d{0,4}$/);
  const email = "canary-editor@pmikcmetro.com";
  const emulator =
    "http://" + rehearsal.authEmulatorHost + "/identitytoolkit.googleapis.com/v1/";
  const call = async (path, body) => {
    const response = await fetch(emulator + path, {
      method: "POST",
      headers: { authorization: "Bearer owner", "content-type": "application/json" },
      redirect: "error",
      body: JSON.stringify(body),
    });
    assert.ok(response.ok, "The local Auth emulator must admit this synthetic fixture");
    return response.json();
  };
  const identity = {
    requestUri: origin + "/sign-in",
    returnSecureToken: true,
    postBody: new URLSearchParams({
      providerId: "google.com",
      id_token: JSON.stringify({
        sub: "s271-read-only-synthetic",
        email,
        email_verified: true,
      }),
    }).toString(),
  };
  const first = await call("accounts:signInWithIdp?key=synthetic", identity);
  await call("projects/" + rehearsal.projectId + "/accounts:update", {
    localId: first.localId,
    customAttributes: JSON.stringify({ role: "Editor" }),
  });
  const signed = await call("accounts:signInWithIdp?key=synthetic", identity);
  const session = await page.request.post(origin + "/api/auth/session", {
    maxRedirects: 0,
    headers: { authorization: "Bearer " + signed.idToken },
  });
  assert.equal(session.status(), 200);
}

// ---- N10-07 ------------------------------------------------------------------------------------

export async function journeyN1007(ctx, page, mutations) {
  const { kit, record } = ctx;
  const lease = String(ctx.leases.prepared.leaseId);
  const observed = {};
  const checks = [];
  for (const step of STEPS) checks.push(await guidedCheck(ctx, page, lease, step));
  for (const check of checks)
    assert.equal(
      check.report.verificationLabel,
      GROUP_NAMES[check.step][1],
      check.step + " names its verification",
    );
  assert.deepEqual(mutations, [], "Entering each outcome posts nothing");
  observed.sevenOutcomesEvidenceClosed = checks.every(
    (check) => !check.report.evidenceOpen && check.report.openStacks === 0,
  );
  observed.activeFieldFirst = checks.every(
    (check) =>
      check.report.leadFirst && (check.report.inactive || check.report.visibleCue),
  );
  const full = await fullChecks(ctx, page, lease);
  checks.push(...full);
  const sections = await page
    .locator("section[id^=renewal-section-]")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  observed.fullSections = sections.length;
  observed.fiveFullSections =
    sections.length === 5 && full.every((check) => !check.report.evidenceOpen);

  // Variants: assisted, covered, non-renewal and month-to-month.
  const variants = [
    [
      String(ctx.leases.assisted.leaseId),
      "assisted-program-contact",
      "Verify program contact",
    ],
    [String(ctx.leases.covered.leaseId), "ask-owner", null],
    [
      String(ctx.rehearsal.groups.move_out_notice[0]),
      "non-renewal-handoff",
      "Verify non-renewal handoff",
    ],
    [
      String(ctx.rehearsal.groups.month_to_month[0]),
      "month-to-month-review",
      "Verify lease term",
    ],
  ];
  const variantChecks = [];
  for (const [variantLease, step, verification] of variants) {
    await kit.open(page, kit.href(variantLease, "?step=" + step));
    const work = kit
      .now(page)
      .locator("[data-renewal-work][data-renewal-priority-state]");
    await work.waitFor();
    const report = await kit.now(page).evaluate(inspectNovemberTenOutcome);
    variantChecks.push({
      lease: variantLease,
      step,
      shown: await work.getAttribute("data-renewal-outcome"),
      priority: report.priority,
      verification: report.verificationLabel,
      faults: novemberTenOutcomeFaults(report).filter(
        (fault) => fault !== "unconsolidated",
      ),
    });
    if (verification) assert.equal(report.verificationLabel, verification, step);
  }
  record({ id: "N10-07", check: "variants", variantChecks });
  assert.deepEqual(
    variantChecks.flatMap((check) => check.faults),
    [],
  );
  observed.variantBranches = true;

  // Continuity: a typed recommendation survives the view switch; a delayed save lands once.
  await kit.open(page, kit.href(lease, "?step=compare-market"));
  const editor = page.getByLabel("Rent to recommend", { exact: true });
  await editor.waitFor();
  const original = (await kit.read(page, WORKING + "?leaseId=" + lease)).record.fields
    .terms_rent;
  await editor.fill(String(original.value + 34));
  await kit.full(page).click();
  assert.equal(await kit.full(page).getAttribute("aria-pressed"), "true");
  assert.equal(await editor.inputValue(), String(original.value + 34));
  await kit.full(page).click();
  assert.equal(await editor.inputValue(), String(original.value + 34));
  assert.deepEqual(mutations, [], "Switching views saves nothing");
  let release;
  const held = new Promise((resolve) => (release = resolve));
  let seen;
  const requested = new Promise((resolve) => (seen = resolve));
  await page.route("**" + WORKING, async (route) => {
    if (route.request().method() === "POST") {
      seen();
      await held;
    }
    return route.fallback();
  });
  const accepted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKING &&
      response.request().method() === "POST" &&
      response.ok(),
  );
  await editor.press("Tab");
  try {
    await Promise.race([
      requested,
      page.waitForTimeout(5000).then(() => {
        throw new Error("The edited recommendation did not start its normal save.");
      }),
    ]);
    await kit.full(page).click();
    assert.equal(await editor.inputValue(), String(original.value + 34));
  } finally {
    release();
  }
  await accepted;
  await page.unroute("**" + WORKING);
  const saved = (await kit.read(page, WORKING + "?leaseId=" + lease)).record.fields
    .terms_rent;
  assert.equal(saved.value, original.value + 34);
  await kit.full(page).click();
  observed.continuityThroughSwitchAndReturn = true;

  // A refused save keeps the entry and its failed state through the switch, then saves on request.
  await editor.fill(String(original.value + 35));
  const changed = await kit.post(page, WORKING, {
    leaseId: lease,
    field: "terms_rent",
    value: original.value + 36,
    expectedRevision: saved.revision,
    expectedCycleId: (await kit.read(page, WORKING + "?leaseId=" + lease)).record.cycle
      .cycleId,
    operationId: uuid(),
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const stale = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKING &&
      response.request().method() === "POST" &&
      response.status() === 409,
  );
  await editor.press("Enter");
  await stale;
  const failed = page.locator(".renewal-now-rent [data-autosave=failed]");
  await failed.waitFor();
  assert.match(await failed.innerText(), /Changed elsewhere/);
  await kit.full(page).click();
  await failed.waitFor();
  assert.equal(await editor.inputValue(), String(original.value + 35));
  await failed.getByRole("button", { name: "Save my entry", exact: true }).click();
  await page.locator(".renewal-now-rent [data-autosave=saved]").waitFor();
  assert.equal(
    (await kit.read(page, WORKING + "?leaseId=" + lease)).record.fields.terms_rent.value,
    original.value + 35,
  );
  await kit.full(page).click();
  observed.staleOrFailedSaveKept = true;

  // Both themes and both widths.
  await page.setViewportSize(NARROW);
  await page.emulateMedia({ colorScheme: "dark" });
  const narrow = [];
  for (const step of STEPS) {
    const check = await guidedCheck(ctx, page, lease, step);
    check.view = "guided-narrow-dark";
    check.overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    narrow.push(check);
  }
  narrow.push(
    ...(await fullChecks(ctx, page, lease)).map((check) => ({
      ...check,
      view: "full-narrow-dark",
    })),
  );
  checks.push(...narrow);
  await page.setViewportSize(WIDE);
  await page.emulateMedia({ colorScheme: "light" });
  observed.bothThemesAndWidths = narrow.every(
    (check) => check.faults.length === 0 && !check.overflow,
  );

  // Supported roles: Approver and Admin read the same structure; read-only stays read-only.
  const roleChecks = [];
  for (const role of ["Approver", "Admin"]) {
    await kit.signIn(page, role);
    for (const step of ["check-numbers", "compare-market", "documents"])
      roleChecks.push({ role, ...(await guidedCheck(ctx, page, lease, step)) });
  }
  await kit.signIn(page, "Editor");
  const before = mutations.length;
  await signInReadOnly(ctx, page);
  const readOnly = await guidedCheck(ctx, page, lease, "compare-market");
  const refused = await kit.post(page, WORKING, {
    leaseId: lease,
    field: "terms_rent",
    value: original.value + 40,
    expectedRevision: 0,
    operationId: uuid(),
  });
  assert.equal(refused.status, 403);
  roleChecks.push({ role: "read-only", ...readOnly });
  observed.supportedRoles =
    roleChecks.every((check) => check.faults.length === 0) &&
    mutations.length - before === 1;
  await kit.signIn(page, "Editor");

  record({
    id: "N10-07",
    checkpoints: [...checks, ...roleChecks].map(
      ({ view, step, role, faults, report }) => ({
        view,
        step,
        role,
        faults,
        groups: report.groups,
        priority: report.priority,
      }),
    ),
  });
  const faulty = [...checks, ...roleChecks].filter((check) => check.faults.length > 0);
  assert.deepEqual(
    faulty.map(({ view, step, role, faults }) => ({ view, step, role, faults })),
    [],
  );
  observed.checkedOutcomes = checks.length;
  for (const key of [
    "sevenOutcomesEvidenceClosed",
    "activeFieldFirst",
    "fiveFullSections",
    "bothThemesAndWidths",
    "supportedRoles",
  ])
    assert.equal(observed[key], true, key);
  return observed;
}

// ---- N10-08 ------------------------------------------------------------------------------------

export async function journeyN1008(ctx, page, mutations) {
  const { kit, record } = ctx;
  const lease = String(ctx.leases.prepared.leaseId);
  const observed = {};

  // The baseline's own probe on Guided entry: no secondary group stays open unless promoted.
  await kit.open(page, kit.href(lease));
  await page.getByRole("region", { name: "Current renewal stage" }).waitFor();
  // An open group on entry (a named secondary Work group or the Working renewal terms reveal) must
  // name why it is current work (data-renewal-promoted) or be held open in place by the exact
  // reveal; any other open group is an old open stack.
  const entryGroups = await page
    .locator(
      "details[data-renewal-secondary-work][open], details[data-renewal-working-terms][open]",
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        group:
          node.getAttribute("data-renewal-group") ??
          (node.hasAttribute("data-renewal-working-terms")
            ? "Working renewal terms"
            : null),
        promoted: node.getAttribute("data-renewal-promoted"),
        held: node.hasAttribute("data-renewal-focus-opened"),
        // A group the reveal holds open must hold a control the Guided view shows.
        revealed: [
          ...node.querySelectorAll("button, input, select, textarea, a[href]"),
        ].some(
          (control) =>
            !control.closest("[data-renewal-focus-hidden]") &&
            control.getClientRects().length > 0,
        ),
      })),
    );
  const shownStep = await kit
    .now(page)
    .locator("[data-renewal-work][data-renewal-outcome]")
    .first()
    .getAttribute("data-renewal-outcome");
  record({ id: "N10-08", check: "open-on-entry", shownStep, entryGroups });
  const openOnEntry = entryGroups.filter(
    ({ promoted, held, revealed }) =>
      !(held && revealed) && !PROMOTED_REASONS.includes(promoted ?? ""),
  ).length;
  observed.openOnEntryReasons = entryGroups.map(({ promoted, held }) =>
    held ? "held" : (promoted ?? "none"),
  );
  const named = [];
  for (const step of STEPS) {
    const check = await guidedCheck(ctx, page, lease, step);
    named.push(check);
    if (GROUP_NAMES[step][0])
      assert.ok(
        check.report.groups.every((group) => group.named === group.label),
        step + " groups are named",
      );
  }
  const full = await fullChecks(ctx, page, lease);
  const groupLabels = await page
    .locator("details[data-renewal-group]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-renewal-group")));
  for (const [step, [group]] of Object.entries(GROUP_NAMES))
    if (group) {
      const label = RECORD_GROUPS[step] ?? group;
      assert.ok(
        groupLabels.includes(label) || groupLabels.includes(group),
        step + " has " + label,
      );
    }
  observed.namedGroupsClosedOnEntry =
    openOnEntry === 0 &&
    [...named, ...full].every((check) => check.report.openStacks === 0);
  observed.openOnEntry = openOnEntry;
  assert.deepEqual(mutations, []);

  // Keyboard and mouse open and close one named group; Tab skips its closed content. The group is
  // the first shown outcome's own group that is closed on entry: a group holding current work
  // (such as the Guided lead) stays open by design.
  let group = null;
  for (const step of STEPS) {
    const legacyName = GROUP_NAMES[step][0];
    if (!legacyName) continue;
    await kit.open(page, kit.href(lease, "?step=" + step));
    await kit
      .now(page)
      .locator(`[data-renewal-work][data-renewal-outcome="${step}"]`)
      .waitFor();
    const name = RECORD_GROUPS[step] ?? legacyName;
    const candidate = kit
      .now(page)
      .locator(
        `details[data-renewal-group="${name}"], details[data-renewal-group="${legacyName}"]`,
      )
      .first();
    if (!(await candidate.count())) continue;
    await candidate.locator(":scope > summary").waitFor();
    const closed = await candidate.evaluate(
      (node) => !node.open && !node.hasAttribute("data-renewal-promoted"),
    );
    if (closed) {
      group = candidate;
      record({
        id: "N10-08",
        check: "disclosure-group",
        step,
        group: await candidate.getAttribute("data-renewal-group"),
      });
      break;
    }
  }
  assert.ok(group, "A shown outcome has its named group closed on entry");
  const summary = group.locator(":scope > summary");
  const isOpen = async () => (await group.getAttribute("open")) !== null;
  assert.equal(await isOpen(), false);
  await summary.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction((node) => node.open, await group.elementHandle());
  await page.keyboard.press("Space");
  await page.waitForFunction((node) => !node.open, await group.elementHandle());
  await summary.click();
  await page.waitForFunction((node) => node.open, await group.elementHandle());
  await summary.click();
  await page.waitForFunction((node) => !node.open, await group.elementHandle());
  await summary.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await group.evaluate(
      (node) =>
        node.contains(document.activeElement) &&
        document.activeElement !== node.querySelector("summary"),
    ),
    false,
    "Tab skips a closed group's content",
  );
  observed.keyboardAndMouseDisclosure = true;

  // An exact link opens the group that owns the target; closing it returns focus to its summary.
  await kit.open(page, kit.href(lease, "?view=full#renewal-manual-owner_outreach"));
  const target = page.locator("#renewal-manual-owner_outreach");
  await target.waitFor();
  await page.waitForFunction(() =>
    Boolean(document.activeElement?.closest("#renewal-manual-owner_outreach")),
  );
  const owner = page.locator("details[data-renewal-group]").filter({ has: target });
  assert.equal(await owner.count(), 1);
  const ownerLabel = await owner.getAttribute("data-renewal-group");
  assert.ok(
    [RECORD_GROUPS["ask-owner"], GROUP_NAMES["ask-owner"][0]].includes(ownerLabel),
  );
  assert.notEqual(await owner.getAttribute("open"), null);
  const othersOpen = await page
    .locator("details[data-renewal-group][open]")
    .evaluateAll(
      (nodes, ownerLabel) =>
        nodes.filter(
          (node) =>
            node.getAttribute("data-renewal-group") !== ownerLabel &&
            !node.hasAttribute("data-renewal-promoted"),
        ).length,
      ownerLabel,
    );
  assert.equal(othersOpen, 0);
  assert.equal(await page.locator("details[data-renewal-verification][open]").count(), 0);
  observed.exactLinkOpensOwner = true;
  await owner.evaluate((node) => {
    node.open = false;
  });
  await page.waitForFunction(
    (label) =>
      document.activeElement?.matches(`details[data-renewal-group="${label}"] > summary`),
    ownerLabel,
  );
  observed.focusReturnedToSummary = true;

  // The exact review shows its full content with every disclosure closed, and sends nothing.
  const sentBefore = (await kit.sentMail()).length;
  await kit.open(page, kit.href(lease, "?step=ask-owner"));
  const primary = kit.now(page).locator("[data-renewal-now-primary]").first();
  await primary.waitFor();
  const label = (await primary.innerText()).trim();
  record({ id: "N10-08", check: "ask-owner-primary", label });
  const reviewButton = kit
    .now(page)
    .getByRole("button", { name: /^(Review owner message|Review and send)$/ })
    .first();
  await reviewButton.waitFor();
  const reviewText = async () => {
    await reviewButton.click();
    const dialog = page.getByRole("dialog", { name: "Review and send", exact: true });
    await dialog.waitFor();
    const exact = dialog.locator('[data-renewal-field="exact-review"]');
    await exact.waitFor();
    const text = (await exact.innerText()).trim();
    await dialog
      .getByRole("button", { name: /^(Cancel|Close)$/ })
      .first()
      .click();
    await dialog.waitFor({ state: "hidden" });
    return text;
  };
  const first = await reviewText();
  assert.ok(first.length > 40);
  const evidence = kit.now(page).locator("details[data-renewal-verification]").first();
  await kit.toggleDisclosure(page, evidence, true);
  await kit.toggleDisclosure(page, evidence, false);
  assert.equal(await reviewText(), first);
  assert.equal((await kit.sentMail()).length, sentBefore);
  assert.ok(
    mutations.every((path) =>
      ["/api/gmail-hub/sequences", "/api/lease-renewal/message-preparation"].includes(
        path,
      ),
    ),
  );
  observed.exactReviewContentVisible = true;

  // Evidence is read-only: toggling every verification and named group changes nothing.
  const state = async () => ({
    working: (await kit.read(page, WORKING + "?leaseId=" + lease)).record.revision,
    workspace: (await kit.read(page, "/api/lease-renewal/workspace?leaseId=" + lease))
      .state.revision,
    notes:
      (await kit.read(page, "/api/lease-renewal/work-status?leaseId=" + lease)).notes
        ?.length ?? 0,
    comparisons: await kit.comparisons(),
    sent: (await kit.sentMail()).length,
  });
  const beforeEvidence = await state();
  const mutationCount = mutations.length;
  for (const view of ["?step=check-numbers", "?step=documents", "?view=full"]) {
    await kit.open(page, kit.href(lease, view));
    const disclosures = page.locator(
      "details[data-renewal-verification]:visible, details[data-renewal-group]:visible",
    );
    for (const details of await disclosures.all()) {
      await kit.toggleDisclosure(page, details, true).catch(() => undefined);
      await kit.toggleDisclosure(page, details, false).catch(() => undefined);
    }
  }
  assert.equal(mutations.length, mutationCount);
  assert.deepEqual(await state(), beforeEvidence);
  observed.zeroEffectEvidence = true;

  // The deliberate defects: each must be rejected in both views; the clean page has none.
  const rejected = [];
  const scopes = [
    [
      "full",
      "?view=full",
      (p) => p.locator('section[data-renewal-outcome="compare-market"]'),
    ],
    ["guided", "?step=compare-market", (p) => kit.now(p)],
  ];
  const results = {};
  for (const [defect, fault] of Object.entries(NOVEMBER_TEN_NEGATIVE_CONTROLS)) {
    results[defect] = [];
    for (const [view, query, scopeOf] of scopes) {
      await kit.open(page, kit.href(lease, query));
      const scope = scopeOf(page);
      await scope.locator("[data-renewal-work]").first().waitFor();
      const clean = novemberTenOutcomeFaults(
        await scope.evaluate(inspectNovemberTenOutcome),
      );
      await scope.evaluate(injectNovemberTenDefect, defect);
      const found = novemberTenOutcomeFaults(
        await scope.evaluate(inspectNovemberTenOutcome),
      );
      await scope.evaluate(restoreNovemberTenDefect);
      const restored = novemberTenOutcomeFaults(
        await scope.evaluate(inspectNovemberTenOutcome),
      );
      results[defect].push({ view, clean, found, restored });
    }
    if (
      results[defect].every(
        ({ clean, found, restored }) =>
          clean.length === 0 && found.includes(fault) && restored.length === 0,
      )
    )
      rejected.push(defect);
  }
  record({ id: "N10-08", check: "negative-controls", results });
  observed.rejectedNegativeControls = rejected;
  observed.negativeControlsRejected =
    rejected.length === Object.keys(NOVEMBER_TEN_NEGATIVE_CONTROLS).length;
  assert.ok(
    observed.negativeControlsRejected,
    "Every deliberate defect is rejected: " + rejected.join(", "),
  );
  return observed;
}
