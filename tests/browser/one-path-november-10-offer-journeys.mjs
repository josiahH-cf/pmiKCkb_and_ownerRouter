// S271 N10-04 (S264 offer charges) and N10-05 (S265 tenant links) on the prepared lease's real
// tenant offer. Charges come from the synthetic RentVine transport; mappings and link checks are
// saved by the Admin through the app; sends reach only the mail stand-in.
import assert from "node:assert/strict";
import {
  setNextSend,
  setRecurringCharges,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { forceSourceRefresh } from "../../scripts/lib/one-path-rehearsal/seeds.mjs";
import { offerCharges } from "../../scripts/lib/one-path-rehearsal/synthetic-charges.mjs";
import {
  leaseReads,
  recordOwnerApproval,
} from "./one-path-november-10-core-journeys.mjs";
import {
  centralDate,
  compositionText,
  firestoreValue,
  sequencePayloadHash,
  uuid,
} from "./one-path-november-10-kit.mjs";

const PREPARATION = "/api/lease-renewal/message-preparation";
const WORKSPACE = "/api/lease-renewal/workspace";
const SEQUENCES = "/api/gmail-hub/sequences";
const MAPPINGS = "/api/admin/offer-charge-mappings";
const RESOURCES = "/api/lease-renewal/resource-locations";
const SYNTHETIC_HOST = "https://fixture-rental.net";
export const MAPPING_ENTRIES = [
  ["4101", "Synthetic Pet Rent", "Pet rent", "pet"],
  ["4103", "Synthetic Resident Benefits", "Resident Benefits Package", "rbp"],
  ["4104", "Synthetic Renters Insurance", "Insurance program", "insurance"],
];

const prepared = (response, field) =>
  new URL(response.url()).pathname === PREPARATION &&
  response.request().method() === "POST" &&
  (field === undefined || field(response.request().postDataJSON()));

/** Save the tenant offer's charge decisions through the route, as the editor does. */
async function saveOfferCharges(kit, page, leaseId, change) {
  const tenant = await kit.read(
    page,
    PREPARATION + "?leaseId=" + leaseId + "&channel=tenant",
  );
  const saved = tenant.offerCharges?.saved ?? {};
  const offer = {
    decisions: saved.decisions ?? [],
    caseEntries: saved.caseEntries ?? [],
    transitions: saved.transitions ?? { insurance: null, rbp: null },
  };
  change(offer, tenant);
  return kit.post(page, PREPARATION, {
    kind: "save",
    leaseId,
    channel: "tenant",
    ...(tenant.cycleId ? { cycleId: tenant.cycleId } : {}),
    expectedRevision: tenant.saved?.revision ?? 0,
    operationId: uuid(),
    inputs: tenant.inputs,
    bodyOverride: null,
    subjectOverride: null,
    ...(tenant.ruleBasis !== undefined ? { ruleBasis: tenant.ruleBasis } : {}),
    offerCharges: offer,
  });
}

/** Save the sequence and authorize it with the hashes the review read. */
export async function authorizeTenantOffer(kit, page, composition, action) {
  const staged = await kit.post(page, SEQUENCES, {
    action: "save",
    expectedVersion: 0,
    operationId: uuid(),
    draft: {
      id: uuid(),
      context: composition.context,
      initial: composition.initial,
      followUp: null,
    },
  });
  assert.equal(staged.status, 200, JSON.stringify(staged.body));
  const authorized = await kit.post(page, SEQUENCES, {
    action,
    id: staged.body.sequence.id,
    expectedVersion: staged.body.sequence.version,
    operationId: uuid(),
    reviewedDraftHash: staged.body.reviewedDraftHash,
    reviewedTargetHash: composition.reviewedTargetHash,
    schedule:
      action === "schedule"
        ? {
            firstDate: centralDate(1),
            time: "09:15",
            timeZone: "America/Chicago",
            everyDays: null,
            endDate: null,
            sendLimit: 1,
          }
        : null,
  });
  return { staged: staged.body.sequence, authorized };
}

/**
 * The tenant's acceptance through the Tenant response editor in Full view, linked to the exact
 * confirmed send it answers (S264 R-S264-6). Returns the editor, the offer's option text and the
 * recorded offer answer.
 */
export async function recordTenantAcceptance(kit, page, leaseId, sent) {
  await kit.open(page, kit.href(leaseId, "?view=full#renewal-manual-tenant_response"));
  const form = page.locator("#renewal-manual-tenant_response");
  await form.waitFor();
  const workspaceSave = (response) =>
    new URL(response.url()).pathname === WORKSPACE &&
    response.request().method() === "POST";
  const response = form.getByLabel("Tenant response", { exact: true });
  if ((await response.inputValue()) !== "accepted") {
    // S276 R-S276-1 (pin changed by S276): choosing the response saves nothing; its one
    // visible Save records it.
    await response.selectOption("accepted");
    const [decided] = await Promise.all([
      page.waitForResponse(workspaceSave),
      form.getByRole("button", { name: "Save", exact: true }).click(),
    ]);
    assert.equal(decided.status(), 200, await decided.text());
  }
  const answer = form.locator('[data-renewal-offer-answer="tenant"]');
  const which = answer.getByLabel("Which offer does this answer respond to?", {
    exact: true,
  });
  await which.waitFor();
  const choice = "sent:" + sent.sequenceId + ":" + sent.occurrenceId;
  const offered = await which.locator(`option[value="${choice}"]`).innerText();
  await which.selectOption(choice);
  const [linked] = await Promise.all([
    page.waitForResponse(workspaceSave),
    answer
      .getByRole("button", { name: "Record the offer this answers", exact: true })
      .click(),
  ]);
  assert.equal(linked.status(), 200, await linked.text());
  return { answer, offered, linkedAnswer: (await linked.json()).offerAnswer };
}

async function cancelSequence(kit, page, id) {
  const latest = (await kit.read(page, SEQUENCES + "?id=" + id)).sequence;
  if (["cancelled", "completed"].includes(latest.state)) return latest.state;
  const cancelled = await kit.post(page, SEQUENCES, {
    action: "cancel",
    id,
    expectedVersion: latest.version,
    operationId: uuid(),
  });
  return cancelled.status;
}

// ---- N10-04 ------------------------------------------------------------------------------------

export async function journeyN1004(ctx, page) {
  const { kit, rehearsal, record } = ctx;
  const lease = ctx.leases.prepared;
  const leaseId = String(lease.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const observed = {};
  const serve = (kind) =>
    setRecurringCharges(rehearsal, lease.leaseId, offerCharges(lease, kind));
  serve("complete");
  await recordOwnerApproval(kit, page, leaseId);

  // The Admin saves the three synthetic mappings through Offer charge mappings and reads them back.
  await kit.signIn(page, "Admin");
  let mappingVersion;
  try {
    const before = await kit.read(page, MAPPINGS);
    const start = before.mappings?.record?.version ?? 0;
    await kit.open(page, "/admin?task=renewal#admin-renewal-packet-policy");
    const section = page.locator("[data-offer-charge-mappings]");
    await section
      .getByRole("button", { name: "Open offer charge mappings", exact: true })
      .click();
    const existing = await section.getByRole("group", { name: /^Mapping \d+$/ }).count();
    if (existing === 0) {
      for (const [index, [account, name, label, family]] of MAPPING_ENTRIES.entries()) {
        await section.getByRole("button", { name: "Add a mapping", exact: true }).click();
        const group = section.getByRole("group", {
          name: "Mapping " + (index + 1),
          exact: true,
        });
        await group.getByLabel("RentVine account ID", { exact: true }).fill(account);
        await group.getByLabel("RentVine account name", { exact: true }).fill(name);
        await group.getByLabel("Verified display label", { exact: true }).fill(label);
        await group.getByLabel("Offer family", { exact: true }).selectOption(family);
        await group.getByLabel("Supported cadence", { exact: true }).selectOption("1");
        await group
          .getByLabel("Applicability scope", { exact: true })
          .selectOption("active_on_renewal_date");
        await group
          .getByLabel("Approval evidence", { exact: true })
          .fill("Synthetic approval evidence: S271 rehearsal fixture");
        await group.getByLabel("Approved on", { exact: true }).fill(centralDate(0));
      }
      await section
        .getByRole("button", { name: "Review the mapping changes", exact: true })
        .click();
      const changes = section.locator("[data-offer-charge-mappings-review]");
      await changes.waitFor();
      assert.equal(
        await changes.locator('[data-offer-charge-mapping-change="added"]').count(),
        MAPPING_ENTRIES.length,
      );
      const saving = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === MAPPINGS &&
          response.request().method() === "POST",
      );
      await section
        .getByRole("button", { name: "Save offer charge mappings", exact: true })
        .click();
      assert.equal((await saving).status(), 200);
      await section.getByText(/^Saved version \d+\. Read back: 3 mappings\.$/).waitFor();
    }
    const reread = (await kit.read(page, MAPPINGS)).mappings.record;
    mappingVersion = reread.version;
    assert.ok(mappingVersion > start || existing > 0);
    assert.deepEqual(
      reread.entries.map((entry) => [entry.accountId, entry.family]).sort(),
      MAPPING_ENTRIES.map(([account, , , family]) => [account, family]).sort(),
    );
    const stale = await kit.post(page, MAPPINGS, {
      entries: reread.entries,
      note: "Synthetic stale save",
      expectedVersion: mappingVersion - 1,
      operationId: uuid(),
    });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    await kit.signIn(page, "Editor");
    const editorSave = await kit.post(page, MAPPINGS, {
      entries: reread.entries,
      expectedVersion: mappingVersion,
      operationId: uuid(),
    });
    assert.equal(editorSave.status, 403);
    observed.adminMappingSavedAndReread = true;
    observed.mappingRevision = mappingVersion;
  } finally {
    await kit.signIn(page, "Editor");
  }

  // Two distinct active lines of one family through the tenant editor.
  await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
  const review = page.locator("#renewal-offer-charges");
  await review.waitFor();
  for (const id of ["61011", "61012"]) {
    const row = review.locator("#renewal-offer-charge-rentvine-" + id);
    await row.waitFor();
    const choice = row.getByLabel(/^Does .* apply to this offer\?$/);
    const saved = page.waitForResponse((response) => prepared(response));
    await choice.selectOption("include");
    assert.equal((await saved).status(), 200);
  }
  let tenant = await reads.tenant();
  const rows = tenant.offerCharges.review.rows;
  const pets = rows.filter((row) =>
    ["rentvine:61011", "rentvine:61012"].includes(row.rowKey),
  );
  assert.equal(pets.length, 2);
  assert.ok(pets.every((row) => row.family === "pet"));
  assert.equal(new Set(pets.map((row) => row.mappingEntryId)).size, 1);
  assert.equal(
    tenant.offerCharges.saved.decisions.filter((entry) => entry.choice === "include")
      .length >= 2,
    true,
  );

  // Transitions known, then a permitted case fee and one corrected line.
  const transitions = async (insurance, rbp) => {
    const answer = await saveOfferCharges(kit, page, leaseId, (offer) => {
      offer.transitions = {
        insurance: insurance && {
          choice: insurance,
          source: "Synthetic insurance decision",
        },
        rbp: rbp && { choice: rbp, source: "Synthetic package decision" },
      };
    });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    return answer.body;
  };
  await transitions("does_not_apply", "unchanged");
  const start = (await reads.working()).record.fields.terms_effective_date.value;
  await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
  const options = kit
    .now(page)
    .locator(
      'details[data-renewal-group="Record of contact"], details[data-renewal-group="Tenant offer options and record of contact"]',
    );
  await kit.toggleDisclosure(page, options, true);
  await options
    .getByLabel("Add a charge for this lease only", { exact: true })
    .selectOption("renewal_processing");
  await options.getByRole("button", { name: "Add this charge", exact: true }).click();
  const fee = review.locator('[data-offer-charge-origin="case"]').first();
  await fee.waitFor();
  const fill = async (locator, value) => {
    const saved = page.waitForResponse((response) => prepared(response));
    await locator.fill(value);
    await locator.press("Tab");
    await saved;
  };
  await fill(fee.getByLabel("Renewal processing fee amount ($)", { exact: true }), "35");
  await fill(fee.getByLabel("Date it applies from", { exact: true }), start);
  await fill(
    fee.getByLabel("What triggers this fee for this lease", { exact: true }),
    "Synthetic renewal processing",
  );
  await fill(
    fee.getByLabel("Authorized case source or approved policy", { exact: true }),
    "Synthetic approved policy",
  );
  tenant = await reads.tenant();
  const caseRow = tenant.offerCharges.review.rows.find((row) => row.origin === "case");
  assert.equal(caseRow?.status, "selected");
  assert.equal(caseRow?.amountCents, 3500);
  observed.permittedCaseFeeSelected = true;

  const firstPet = review.locator("#renewal-offer-charge-rentvine-61011");
  const correction = firstPet
    .locator("details")
    .filter({ hasText: "Correct the renewal amount or date" });
  await kit.toggleDisclosure(page, correction, true);
  await fill(
    correction.getByLabel("Source of the correction", { exact: true }),
    "Synthetic corrected pet rent",
  );
  await fill(
    correction.getByLabel("Renewal amount if it differs ($)", { exact: true }),
    "45",
  );
  tenant = await reads.tenant();
  const text = tenant.content.plainText;
  assert.match(text, /Pet rent: \$45\.00 per month/);
  assert.match(text, /Renewal processing fee: \$35\.00 one time/);
  observed.changedVersusUnchangedCopy =
    /All other charges stay the same\./.test(text) ||
    /Pet rent: \$25\.00 per month/.test(text);
  assert.ok(observed.changedVersusUnchangedCopy);
  record({
    id: "N10-04",
    check: "copy",
    lines: text.split("\n").filter((line) => /\$/.test(line)),
  });

  const totals = tenant.offerCharges.review.totals;
  assert.equal(totals.monthlyComplete, true);
  assert.equal(totals.oneTimeComplete, true);
  assert.equal(totals.monthlyKnownCents, totals.baseCents + 4500 + 2500 + 3000 + 1250);
  assert.equal(totals.oneTimeKnownCents, 3500);
  observed.monthlyTotalCents = totals.monthlyKnownCents;
  observed.oneTimeTotalCents = totals.oneTimeKnownCents;
  await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
  const monthly = page.locator('[data-offer-charge-total="monthly"]');
  assert.equal(await monthly.getAttribute("data-offer-charge-complete"), "true");
  observed.exactSeparateTotals = true;
  observed.twoDistinctLinesSameFamily = true;

  // An unmapped line stops the offer until it is decided; preparation stays available.
  serve("unmapped");
  tenant = await reads.tenant();
  assert.equal(tenant.offerCharges.review.totals.monthlyComplete, false);
  const blocked = await kit.post(page, PREPARATION, {
    kind: "draft",
    leaseId,
    channel: "tenant",
    displayed: { subject: tenant.content.subject ?? "", body: tenant.content.plainText },
  });
  assert.ok(
    blocked.status === 200 ? blocked.body.status === "blocked" : blocked.status === 409,
    JSON.stringify(blocked.body),
  );
  let composition = await reads.composition();
  assert.ok(
    (composition.target.blockers ?? []).some((reason) => /4199|Misc Fee/.test(reason)),
  );
  const stopped = await authorizeTenantOffer(kit, page, composition, "send");
  assert.equal(stopped.authorized.status, 409);
  observed.incompleteSelectionStopped = true;

  const excluded = await saveOfferCharges(kit, page, leaseId, (offer, current) => {
    const row = current.offerCharges.review.rows.find(
      (entry) => entry.rowKey === "rentvine:61041",
    );
    offer.decisions = offer.decisions.filter(
      (entry) => entry.rowKey !== "rentvine:61041",
    );
    offer.decisions.push({
      rowKey: "rentvine:61041",
      choice: "exclude",
      reason: "Synthetic: not part of this renewal",
      renewalAmountCents: null,
      effectiveDate: null,
      correctionSource: null,
      reviewed: {
        sourceVersion: row.sourceVersion,
        renewalDate: current.offerCharges.review.renewalDate,
        mappingVersion: current.offerCharges.review.mappingVersion,
      },
    });
  });
  assert.equal(excluded.status, 200, JSON.stringify(excluded.body));
  tenant = await reads.tenant();
  const statuses = Object.fromEntries(
    tenant.offerCharges.review.rows.map((row) => [row.rowKey, row.status]),
  );
  assert.equal(statuses["rentvine:61041"], "excluded");
  assert.equal(statuses["rentvine:61013"], "historical");
  observed.endedAndUnknownDeclined = true;

  // Same-value drift and a stale mapping are refused at the claim.
  composition = await reads.composition();
  assert.deepEqual(composition.target.blockers ?? [], []);
  serve("drift");
  const drift = await authorizeTenantOffer(kit, page, composition, "send");
  assert.equal(drift.authorized.status, 409, JSON.stringify(drift.authorized.body));
  serve("unmapped");
  observed.sameValueDriftRefused = true;

  composition = await reads.composition();
  await kit.signIn(page, "Admin");
  try {
    const current = (await kit.read(page, MAPPINGS)).mappings.record;
    const bumped = await kit.post(page, MAPPINGS, {
      entries: current.entries.map((entry) => ({
        ...entry,
        approval: {
          ...entry.approval,
          reference: "Synthetic approval evidence, revised",
        },
      })),
      expectedVersion: current.version,
      operationId: uuid(),
    });
    assert.equal(bumped.status, 200, JSON.stringify(bumped.body));
    observed.mappingRevision = bumped.body.mappings.record.version;
  } finally {
    await kit.signIn(page, "Editor");
  }
  const staleMapping = await authorizeTenantOffer(kit, page, composition, "send");
  assert.equal(
    staleMapping.authorized.status,
    409,
    JSON.stringify(staleMapping.authorized.body),
  );
  tenant = await reads.tenant();
  const needsReview = tenant.offerCharges.review.rows.filter(
    (row) => row.status === "needs_review",
  ).length;
  assert.ok(needsReview > 0);
  await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
  // Each confirmed line leaves the list, so confirm the first remaining one until none is left.
  // The list renders after the offer's own read: every line needing review shows its control.
  const confirmAgain = review.getByRole("button", { name: "Confirm this line again" });
  for (let wait = 0; wait < 300 && (await confirmAgain.count()) < needsReview; wait++)
    await page.waitForTimeout(100);
  assert.equal(await confirmAgain.count(), needsReview);
  const reviewed = [];
  for (let remaining = await confirmAgain.count(); remaining > 0; ) {
    assert.ok(reviewed.length < 20, "Each line needing review is confirmed once");
    const row = await confirmAgain
      .first()
      .evaluate((node) => node.closest("[id^='renewal-offer-charge-']")?.id ?? null);
    const [saved] = await Promise.all([
      page.waitForResponse((response) => prepared(response)),
      confirmAgain.first().click(),
    ]);
    assert.equal(saved.status(), 200);
    reviewed.push(row);
    for (let wait = 0; wait < 100 && (await confirmAgain.count()) >= remaining; wait++)
      await page.waitForTimeout(100);
    const left = await confirmAgain.count();
    assert.ok(left < remaining, "A confirmed line leaves the review list");
    remaining = left;
  }
  record({ id: "N10-04", check: "confirmed-again", reviewed });
  tenant = await reads.tenant();
  assert.ok(
    !tenant.offerCharges.review.rows.some((row) => row.status === "needs_review"),
  );
  observed.staleMappingRefusedAtClaim = true;

  serve("duplicate");
  try {
    tenant = await reads.tenant();
    assert.equal(tenant.offerCharges.source.state, "unavailable");
    composition = await reads.composition();
    assert.ok((composition.target.blockers ?? []).length > 0);
    const duplicate = await authorizeTenantOffer(kit, page, composition, "send");
    assert.equal(duplicate.authorized.status, 409);
    observed.duplicateSourceRefused = true;
  } finally {
    serve("unmapped");
  }

  // Insurance and package: unknown holds, verified inapplicable or unchanged needs no flyer,
  // applicable or changed invokes its flyer rule.
  const branches = {};
  for (const [insurance, rbp] of [
    [null, null],
    ["does_not_apply", "unchanged"],
    ["applies", "changed"],
  ]) {
    await transitions(insurance, rbp);
    const state = await reads.composition();
    branches[insurance ?? "unknown"] = {
      blockers: state.target.blockers ?? [],
      required: state.target.tenantResourceRequired ?? [],
    };
  }
  assert.ok(branches.unknown.blockers.some((reason) => /insurance/i.test(reason)));
  assert.ok(
    branches.unknown.blockers.some((reason) => /Resident Benefits Package/i.test(reason)),
  );
  assert.deepEqual(branches.does_not_apply.required, []);
  assert.deepEqual([...branches.applies.required].sort(), [
    "insurance_flyer",
    "rbp_flyer",
  ]);
  record({ id: "N10-04", check: "transition-branches", branches });
  observed.materialTransitionBranches = true;

  // R-S264-6 (AC-S264-6): an exact owner decision and a tenant acceptance each cover only the
  // offer they answered. A change to one selected charge leaves neither covering the changed
  // offer, each record stays exactly as recorded, and an amount-only answer covers no charges.
  if (!kit.mailAvailable) {
    observed.decisionsDoNotCoverChangedCharge = false;
    observed.missing =
      "A tenant acceptance of an exact offer needs a confirmed send (the compiled synthetic mail build or the development mail adapter).";
    return observed;
  }
  await transitions("does_not_apply", "unchanged");
  composition = await reads.composition();
  assert.deepEqual(composition.target.blockers ?? [], [], "The offer is ready to send");
  const reviewedOffer = (await reads.tenant()).offerAnswers?.current;
  assert.ok(reviewedOffer?.charged, "The current offer carries charges");
  const ownerAnswer = async (extra = {}) => {
    const state = (await reads.workspace()).state;
    return kit.post(page, WORKSPACE, {
      operation: "record",
      leaseId,
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: uuid(),
      action: {
        kind: "owner_response",
        outcome: "approved_terms",
        approval: {
          party: {
            kind: "representative",
            name: "Synthetic owner representative",
            capacity: "Fixture approval",
          },
          channel: {
            kind: "conversation",
            participants: "Fixture owner and renewal staff",
          },
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
        },
        ...extra,
      },
      offer: {
        kind: "owner_reviewed_offer",
        snapshotId: reviewedOffer.snapshotId,
        snapshotHash: reviewedOffer.snapshotHash,
      },
    });
  };
  const rent = (await reads.working()).record?.fields?.terms_rent;
  const amountOnly = await ownerAnswer({
    approvedBase: {
      amount: rent?.value ?? 1500,
      scope: "amount_only",
      expectedWorkingRevision: rent?.revision ?? 0,
      expectedRecommendationRevision: 0,
    },
  });
  assert.equal(amountOnly.status, 400, JSON.stringify(amountOnly.body));
  const owner = await ownerAnswer();
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  assert.equal(owner.body.offerAnswer?.attribution?.kind, "owner_reviewed_offer");
  const ownerEvent = owner.body.offerAnswer.eventId;

  // A confirmed send carries the offer; the tenant's acceptance names it in the response editor.
  composition = await reads.composition();
  const sentBefore = (await kit.sentMail()).length;
  const delivered = await authorizeTenantOffer(kit, page, composition, "send");
  assert.equal(
    delivered.authorized.status,
    200,
    JSON.stringify(delivered.authorized.body),
  );
  assert.equal((await kit.sentMail()).length, sentBefore + 1);
  const sent = (await reads.tenant()).offerAnswers.candidates.find(
    (candidate) =>
      candidate.kind === "linked_communication" &&
      candidate.sequenceId === delivered.staged.id,
  );
  assert.ok(sent?.current, "The confirmed send carried the current offer");
  const { answer, offered, linkedAnswer } = await recordTenantAcceptance(
    kit,
    page,
    leaseId,
    sent,
  );
  assert.match(offered, /^Sent .+: .+ \(the current offer\)$/);
  assert.equal(linkedAnswer?.attribution?.kind, "linked_communication");
  const tenantEvent = linkedAnswer.eventId;
  await answer
    .locator('[data-offer-answer-line="tenant"]')
    .filter({ hasText: "This acceptance answers the current offer." })
    .waitFor();
  let answers = (await reads.tenant()).offerAnswers;
  assert.equal(answers.tenant.coverage, "covers");
  assert.equal(answers.owner.coverage, "covers");
  assert.equal(answers.owner.scope, "offer_snapshot");
  const recorded = {
    tenant: await kit.readDocument("renewal_offer_answers/" + tenantEvent),
    owner: await kit.readDocument("renewal_offer_answers/" + ownerEvent),
  };

  // Change only one selected charge: the corrected pet line, $45.00 to $50.00.
  await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
  const changed = review
    .locator("#renewal-offer-charge-rentvine-61011")
    .locator("details")
    .filter({ hasText: "Correct the renewal amount or date" });
  await kit.toggleDisclosure(page, changed, true);
  const changedAt = new Date().toISOString();
  await fill(
    changed.getByLabel("Renewal amount if it differs ($)", { exact: true }),
    "50",
  );
  answers = (await reads.tenant()).offerAnswers;
  record({
    id: "N10-04",
    check: "answers-after-one-charge",
    current: answers.current?.summary,
    tenant: answers.tenant,
    owner: answers.owner,
  });
  const onlyPetRent = /Pet rent changed \(\$45\.00 to \$50\.00\)\./;
  const termsMoved = /renewal base changed|renewal dates changed|renewal cycle changed/i;
  assert.equal(answers.tenant.coverage, "earlier_offer");
  assert.match(
    answers.tenant.line,
    /^Current acceptance needs verification: it answers an earlier offer\. /,
  );
  assert.equal(answers.owner.coverage, "earlier_offer");
  assert.match(
    answers.owner.line,
    /^The owner approved an earlier offer, so the current offer's charges are not covered\. /,
  );
  for (const line of [answers.tenant.line, answers.owner.line]) {
    assert.match(line, onlyPetRent);
    assert.doesNotMatch(line, termsMoved);
  }
  assert.deepEqual(
    await kit.readDocument("renewal_offer_answers/" + tenantEvent),
    recorded.tenant,
  );
  assert.deepEqual(
    await kit.readDocument("renewal_offer_answers/" + ownerEvent),
    recorded.owner,
  );
  await kit.open(page, kit.href(leaseId, "?view=full#renewal-manual-tenant_response"));
  const shown = page.locator('[data-renewal-offer-answer="tenant"]').first();
  await shown
    .locator('[data-offer-answer-line="tenant"]')
    .filter({ hasText: /^Current acceptance needs verification: / })
    .waitFor();
  assert.equal(await shown.getAttribute("data-offer-answer-coverage"), "earlier_offer");
  observed.decisionsDoNotCoverChangedCharge = true;
  observed.acceptedOfferEvent = tenantEvent;

  // S264 R-S264-6 at the tenant decision's consumers, after the same charge-only change: the
  // acceptance stays as recorded and the work relying on it waits with the exact difference.
  const held = await acceptanceHoldAtConsumers(kit, page, leaseId, {
    line: ACCEPTANCE_HOLD_LINE,
    changedAt,
    reads,
  });
  record({ id: "N10-04", check: "acceptance-hold", ...held });
  observed.chargeOnlyNextStepShown = true;
  observed.chargeOnlySourceUpdateHeld = true;
  observed.sourceUpdateClaim = held.claim;

  // N10-05 sends this lease's offer again: the lease goes back to awaiting the tenant, and the
  // accepted answer's record stays as recorded.
  const state = (await reads.workspace()).state;
  const awaiting = await kit.post(page, WORKSPACE, {
    operation: "record",
    leaseId,
    cycleId: state.cycleId,
    expectedRevision: state.revision,
    operationId: uuid(),
    action: { kind: "tenant_response", outcome: "awaiting_response" },
  });
  assert.equal(awaiting.status, 200, JSON.stringify(awaiting.body));
  assert.deepEqual(
    await kit.readDocument("renewal_offer_answers/" + tenantEvent),
    recorded.tenant,
  );
  return observed;
}

/** S264 R-S264-6: the exact difference after N10-04's one charge-only change. */
const ACCEPTANCE_HOLD_LINE =
  "Current acceptance needs verification: it answers an earlier offer. Pet rent changed ($45.00 to $50.00).";
/** lib/lease-renewal/tenant-acceptance-hold.ts, as staff read it. */
const ACCEPTANCE_HOLD_WORDS = {
  next: "Record the tenant's answer for the current offer",
  target: "renewal-manual-tenant_response",
  update: "This update waits until the tenant's answer covers the current offer.",
  finishUp: "These updates wait until the tenant's answer covers the current offer.",
};
const WRITEBACK = "/api/lease-renewal/rentvine-writeback";

const squash = async (locator) =>
  ((await locator.textContent()) ?? "").replace(/\s+/g, " ").trim();

/**
 * S264 R-S264-6 where staff act on the tenant's answer, after N10-04's charge-only change. Offer
 * the tenant stays current with its one next step at the tenant response editor, and the stage
 * line names the exact difference. Finish up's source update previews wait with the same line, its
 * one next step and no Apply. The change's own tenant message save kept the RentVine lines a claim
 * compares against. The compiled synthetic build's sanctioned source-preview seam prepares an exact
 * RentVine lease date preview, which waits with its Tenant acceptance row and no Apply, and a claim
 * of it is refused before any claim; a development build prepares no RentVine preview (the Demo
 * environment refuses it). No send and no provider effect.
 */
async function acceptanceHoldAtConsumers(kit, page, leaseId, { line, changedAt, reads }) {
  const words = ACCEPTANCE_HOLD_WORDS;
  const sentBefore = (await kit.sentMail()).length;
  const nowOn = async (step) => {
    await kit.open(page, kit.href(leaseId, "?step=" + step));
    const now = page.locator(
      `[role="region"][aria-label="Now"][data-renewal-now-step="${step}"]`,
    );
    await now.waitFor();
    return now;
  };

  // Offer the tenant: current, not done, with its one next step at the tenant response editor.
  const offer = await nowOn("offer-tenant");
  const path = page.locator('[data-renewal-path-step="offer-tenant"]').first();
  assert.equal(await path.getAttribute("data-renewal-path-state"), "current");
  const primary = offer.locator("[data-renewal-now-primary]");
  assert.equal(await primary.count(), 1, "Offer the tenant leads with one step");
  assert.equal((await primary.innerText()).trim(), words.next);
  assert.equal(await primary.getAttribute("data-renewal-now-target"), words.target);
  const stage = page.locator('#renewal-current-stage [data-renewal-field="stage-line"]');
  assert.equal(await squash(stage), line);
  assert.equal(await stage.getAttribute("data-renewal-current-step"), "offer-tenant");

  // Finish up: the previews from the final terms wait with the same line and offer no Apply.
  const finish = await nowOn("finish-up");
  const previews = finish.locator("section.renewal-finish-up-previews");
  await previews.waitFor();
  assert.equal(
    await previews.getAttribute("data-renewal-finish-up-previews"),
    "assembled",
  );
  const notice = previews.locator('[data-renewal-field="finish-up-acceptance-hold"]');
  await notice.waitFor();
  assert.equal(await squash(notice.locator("p").first()), `${line} ${words.finishUp}`);
  assert.equal(
    await notice.getByRole("button", { name: words.next, exact: true }).count(),
    1,
  );
  const sources = await previews
    .locator("[data-renewal-finish-up-source]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-renewal-finish-up-source")),
    );
  assert.ok(sources.includes("ready"), "A source update from the final terms is ready");
  assert.equal(
    await previews
      .locator("button", { hasText: "Review and apply in Rent and charges" })
      .count(),
    0,
  );

  // The claim's basis: the RentVine lines the change's own tenant message save read and kept.
  const kept = await kit.readDocument("renewal_offer_sources/" + leaseId);
  const keptAt = kept?.fields?.readAt?.stringValue ?? null;
  assert.ok(keptAt && keptAt >= changedAt, "The change's save kept the lines it read");

  // Rent and charges: an exact RentVine lease date update carries the accepted renewal.
  const endDate = (await reads.working()).record?.fields?.terms_end_date?.value;
  assert.match(String(endDate), /^\d{4}-\d{2}-\d{2}$/);
  const dates = { kind: "renewal_dates_update", after: { endDate } };
  let rentAndCharges;
  let claim;
  if (!kit.compiledMail) {
    const refused = await kit.post(page, WRITEBACK, {
      operation: "propose",
      leaseId,
      expectedPriorPreviewHash: null,
      evidenceRef: "workspace:" + leaseId,
      effects: [dates],
    });
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    assert.equal(refused.body.error_type, "environment_context_not_allowed");
    rentAndCharges =
      "not prepared: a development build refuses every RentVine preview (409 environment_context_not_allowed)";
    claim = "not attempted: a development build holds no RentVine preview to claim";
  } else {
    const token = process.env.S260_SYNTHETIC_WORKER_TOKEN;
    assert.match(token ?? "", /^[a-f0-9]{64}$/);
    // tests/browser/fixtures/s260-compiled-source-preview.ts admits this route's option reads and
    // previews with the token; its dependencies refuse every writer, provider action and claim.
    // A status read of a saved preview also checks the Live execution ledger, which stays closed
    // in this environment (as in S260 N09-08), so the saved preview is read from the disposable
    // emulator and the panel's own status read stays refused. The panel's Tenant acceptance row
    // needs a settled status; tests/unit/s264-acceptance-hold-ui.test.tsx renders that row.
    const seam = (url) => url.pathname === WRITEBACK;
    await page.route(seam, (route) =>
      route.fallback({
        headers: {
          ...route.request().headers(),
          "x-s260-source-preview": "Bearer " + token,
        },
      }),
    );
    try {
      const savedPreview = () =>
        kit.readDocument("renewal_writeback_proposals/" + leaseId);
      const prior = (await savedPreview())?.fields?.previewHash?.stringValue ?? null;
      const options = await kit.post(page, WRITEBACK, { operation: "options", leaseId });
      assert.equal(options.status, 200, JSON.stringify(options.body));
      assert.notEqual(
        options.body.inventory?.leaseDates?.endDate ?? null,
        endDate,
        "The renewal end date moves the RentVine lease end",
      );
      const proposed = await kit.post(page, WRITEBACK, {
        operation: "propose",
        leaseId,
        expectedPriorPreviewHash: prior,
        evidenceRef: "workspace:" + leaseId,
        effects: [dates],
      });
      assert.equal(proposed.status, 200, JSON.stringify(proposed.body));
      const previewHash = proposed.body.proposal.preview_hash;
      assert.equal(proposed.body.proposal.effects.length, 1);
      const [effect] = proposed.body.proposal.effects;
      const saved = await savedPreview();
      assert.equal(saved?.fields?.previewHash?.stringValue, previewHash);
      assert.equal(
        saved.fields.effects.arrayValue.values[0].mapValue.fields.effectHash.stringValue,
        effect.effect_hash,
      );
      // The lease page lists the exact saved preview and offers no Apply for it.
      const statusRead = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === WRITEBACK &&
          response.request().method() === "GET",
        { timeout: 60_000 },
      );
      await kit.open(page, kit.href(leaseId, "?view=full#renewal-rent-and-charges"));
      const panelStatus = await statusRead.then(
        (response) => response.status(),
        () => null,
      );
      const panel = page.locator('article[aria-labelledby="rentvine-updates-title"]');
      const item = panel
        .locator("li")
        .filter({ hasText: "Update lease renewal dates" })
        .first();
      await item.waitFor({ state: "attached" });
      const panelState = await squash(item.locator("p").first());
      assert.equal(
        await panel.locator("button", { hasText: "Apply RentVine update" }).count(),
        0,
      );
      // Confirming it is refused before any claim: the execution ledger gains no record.
      const ledgerBefore = (await kit.listDocuments("external_action_executions")).length;
      const attempt = await kit.post(page, WRITEBACK, {
        operation: "execute",
        leaseId,
        previewHash,
        effectHash: effect.effect_hash,
        confirm: true,
      });
      assert.equal(attempt.status, 409, JSON.stringify(attempt.body));
      // Both refuse before any claim. The route's per-key environment gate runs first, so in the
      // Demo environment it refuses before the acceptance hold is read.
      assert.ok(
        ["environment_context_not_allowed", "acceptance_needs_verification"].includes(
          attempt.body.error_type,
        ),
        JSON.stringify(attempt.body),
      );
      const ledgerAfter = (await kit.listDocuments("external_action_executions")).length;
      assert.equal(
        ledgerAfter,
        ledgerBefore,
        "The refused confirmation recorded no claim",
      );
      const discarded = await kit.post(page, WRITEBACK, {
        operation: "discard",
        leaseId,
        previewHash,
      });
      rentAndCharges = {
        listed: "Update lease renewal dates",
        panelState,
        panelStatusRead: panelStatus,
        apply: 0,
      };
      claim = {
        status: attempt.status,
        refusedBy: attempt.body.error_type,
        ledgerRecordsBefore: ledgerBefore,
        ledgerRecordsAfter: ledgerAfter,
        discard: discarded.status,
      };
    } finally {
      await page.unroute(seam);
    }
  }
  assert.equal((await kit.sentMail()).length, sentBefore, "No message was sent");
  return {
    stage: line,
    finishUpSources: sources,
    offerSourceKeptAt: keptAt,
    rentAndCharges,
    claim,
  };
}

// ---- N10-05 ------------------------------------------------------------------------------------

const RESOURCE_LABELS = {
  insurance_flyer: "insurance flyer",
  rbp_flyer: "resident benefits package flyer",
  renewal_information_form: "renewal information form",
};

/** The Admin's audience check through Connections → Renewal resource links. */
async function saveResource(
  kit,
  page,
  id,
  { url, version, restricted = null, clear = false },
) {
  // A fresh document for the signed-in role: the Editor's fix link may have opened this same
  // address, and going to it again would only move to the entry without loading the page.
  await page.goto("about:blank");
  await kit.open(page, "/connections#renewal-resource-entry-" + id);
  const form = page.locator("#renewal-resource-entry-" + id);
  await form.waitFor();
  const input = form.locator("#renewal-resource-" + id);
  if (url !== undefined && (await input.inputValue()) !== url) await input.fill(url);
  if (clear) {
    await form.getByRole("button", { name: "Clear audience check", exact: true }).click();
  } else {
    const box = form.getByRole("checkbox", {
      name: "I checked this destination and its intended use",
    });
    if (!(await box.isChecked())) await box.check();
    await form.locator("#renewal-resource-" + id + "-document-version").fill(version);
    await form
      .locator("#renewal-resource-" + id + "-audience")
      .selectOption(restricted ? "restricted" : "tenant_wide");
    if (restricted)
      await form
        .locator("#renewal-resource-" + id + "-recipients")
        .fill(restricted.join(", "));
    await form
      .locator("#renewal-resource-" + id + "-method")
      .selectOption(restricted ? "sharing_list" : "signed_out_open");
    await form
      .locator("#renewal-resource-" + id + "-result")
      .selectOption("current_document");
    await form
      .locator("#renewal-resource-" + id + "-checked-by")
      .fill("Synthetic resource owner");
    await form.locator("#renewal-resource-" + id + "-checked-on").fill(centralDate(0));
    await form.locator("#renewal-resource-" + id + "-valid-until").fill(centralDate(45));
  }
  const saving = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === RESOURCES &&
      response.request().method() === "POST",
  );
  await form
    .getByRole("button", { name: "Save " + RESOURCE_LABELS[id], exact: true })
    .click();
  const answer = await saving;
  assert.equal(answer.status(), 200, await answer.text());
  return (await answer.json()).settings.entries[id];
}

export async function journeyN1005(ctx, page) {
  const { kit, rehearsal, record } = ctx;
  const lease = ctx.leases.prepared;
  const leaseId = String(lease.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const observed = {};
  if (!kit.mailAvailable)
    return {
      missing:
        "The tenant offer's draft, send and dispatch need the synthetic mail build.",
    };
  setRecurringCharges(rehearsal, lease.leaseId, offerCharges(lease, "unmapped"));
  const asAdmin = async (work) => {
    await kit.signIn(page, "Admin");
    try {
      return await work();
    } finally {
      await kit.signIn(page, "Editor");
    }
  };
  const sequenceOf = async (id) =>
    (await kit.read(page, SEQUENCES + "?id=" + id)).sequence;
  try {
    // The changed package and the applicable insurance transition require both flyers. The
    // decisions are this journey's own, saved through the offer's route as the editor saves them.
    const decided = await saveOfferCharges(kit, page, leaseId, (offer) => {
      offer.transitions = {
        insurance: { choice: "applies", source: "Synthetic insurance decision" },
        rbp: { choice: "changed", source: "Synthetic package decision" },
      };
    });
    assert.equal(decided.status, 200, JSON.stringify(decided.body));
    let composition = await reads.composition();
    let tenant = await reads.tenant();
    assert.deepEqual([...(composition.target.tenantResourceRequired ?? [])].sort(), [
      "insurance_flyer",
      "rbp_flyer",
    ]);
    assert.match(
      tenant.content.plainText,
      /Needs Verification: Resident Benefits Package information link/,
    );
    assert.match(tenant.content.plainText, /Needs Verification: insurance flyer link/);
    observed.changedRbpFlyerRequired = true;
    observed.insuranceTransitionFlyerRequired = true;
    assert.doesNotMatch(tenant.content.plainText, /information form/i);
    assert.equal(
      composition.target.tenantResources?.renewal_information_form?.state,
      "source_pending",
    );
    assert.ok(
      !(composition.target.blockers ?? []).some((reason) =>
        /information form/i.test(reason),
      ),
    );
    observed.optionalFormSafeOmission = true;

    // A real offer with a missing required flyer: the exact Connections fix, refused export.
    assert.ok(
      (composition.target.blockers ?? []).some((reason) => /Source pending/.test(reason)),
    );
    const sentBefore = (await kit.sentMail()).length;
    const pending = await authorizeTenantOffer(kit, page, composition, "send");
    assert.equal(pending.authorized.status, 409, JSON.stringify(pending.authorized.body));
    assert.equal((await kit.sentMail()).length, sentBefore);
    await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
    const work = kit.now(page).locator("[data-renewal-priority-state]").first();
    await work.waitFor();
    const priority = {
      state: await work.getAttribute("data-renewal-priority-state"),
      lead: await work.getAttribute("data-renewal-priority-lead"),
    };
    const leadFix = kit
      .now(page)
      .getByRole("button", { name: /^Shared resource link: / });
    let fix;
    let pendingResource;
    if (priority.state === "wait") {
      // N10-04's offer went out and awaits the tenant, so recording the answer leads (S269 rule
      // 4) and nothing about the next offer competes with it. The next offer's exact pending
      // resource is its readiness fix (R-S265-3), in the S281 Message disclosure.
      assert.equal(await leadFix.count(), 0, "No resource fix competes with the wait");
      const message = kit.now(page).locator('details[data-renewal-group="Message"]');
      if (await message.count()) {
        await kit.toggleDisclosure(page, message, true);
        fix = message.getByRole("link", { name: /^Shared resource link: / }).first();
      } else if (await kit.now(page).locator("[data-renewal-message-sent]").count()) {
        // S281 R-S281-3 removes the editable preview after a confirmed offer. The exact
        // resource remains on Connections for the next offer; keep the no-competing-fix pin.
        const required = composition.target.tenantResourceRequired;
        pendingResource = required.find(
          (id) => composition.target.tenantResources?.[id]?.state === "source_pending",
        );
        assert.ok(pendingResource);
        const nav = page.getByRole("navigation", { name: "Primary", exact: true });
        const connections = nav.getByRole("link", { name: "Connections", exact: true });
        await nav.getByRole("button", { name: "Admin", exact: true }).click();
        await connections.click();
        record({
          id: "N10-05",
          check: "pending-resource-in-connections",
          pendingResource,
        });
      } else {
        const options = page.locator(
          'details[data-renewal-group="Tenant offer options and record of contact"]',
        );
        await kit.toggleDisclosure(page, options, true);
        fix = options.getByRole("link", { name: /^Shared resource link: / }).first();
      }
    } else {
      // S265: before the offer goes out, the Guided lead is the resource's one Connections entry.
      assert.equal(priority.lead, "included-resource");
      fix = leadFix.first();
    }
    if (fix) {
      await fix.waitFor();
      record({
        id: "N10-05",
        check: "resource-fix",
        priority,
        label: await fix.innerText(),
      });
      await fix.click();
    }
    await page.waitForURL((url) => url.pathname === "/connections");
    const resourceTarget = pendingResource
      ? "#renewal-resource-entry-" + pendingResource
      : new URL(page.url()).hash;
    assert.match(
      resourceTarget,
      /^#renewal-resource-entry-(?:insurance_flyer|rbp_flyer)$/,
    );
    const entry = page.locator(resourceTarget);
    await entry.waitFor();
    await entry
      .getByText(/^Source pending\. /)
      .first()
      .waitFor();
    assert.equal(
      await entry.getByRole("button", { name: /^Save / }).count(),
      0,
      "An Editor cannot save",
    );
    const editorSave = await kit.post(page, RESOURCES, {
      resource: {
        id: "rbp_flyer",
        url: SYNTHETIC_HOST + "/rbp-flyer.pdf",
        verified: true,
        tenantAccess: null,
      },
      expectedVersion: 0,
      operationId: uuid(),
    });
    assert.equal(editorSave.status, 403);
    observed.pendingLinksShown = true;

    // The Admin records both audience checks with synthetic HTTPS destinations.
    const urls = {
      insurance_flyer: SYNTHETIC_HOST + "/insurance-flyer.pdf",
      rbp_flyer: SYNTHETIC_HOST + "/rbp-flyer.pdf",
    };
    const proofs = await asAdmin(async () => ({
      insurance_flyer: await saveResource(kit, page, "insurance_flyer", {
        url: urls.insurance_flyer,
        version: "Insurance flyer 2026-11",
      }),
      rbp_flyer: await saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11",
      }),
    }));
    const audienceText = await page
      .locator(
        "#renewal-resource-entry-insurance_flyer, #renewal-resource-entry-rbp_flyer, #renewal-resource-entry-renewal_information_form",
      )
      .getByText(/audience/i)
      .count();
    assert.ok(audienceText > 0);
    composition = await reads.composition();
    assert.deepEqual(composition.target.blockers ?? [], []);
    assert.match(
      compositionText(composition),
      new RegExp(urls.rbp_flyer.replace(/[.]/g, "\\.")),
    );

    // A restricted proof that does not cover the recipients is refused.
    await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11",
        restricted: ["another-tenant@fixture-rental.net"],
      }),
    );
    composition = await reads.composition();
    assert.ok(
      (composition.target.blockers ?? []).some((reason) =>
        /does not cover everyone/.test(reason),
      ),
    );
    const wrong = await authorizeTenantOffer(kit, page, composition, "send");
    assert.equal(wrong.authorized.status, 409);
    assert.equal((await kit.sentMail()).length, sentBefore);
    observed.wrongRecipientRefused = true;
    proofs.rbp_flyer = await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11b",
      }),
    );

    // The schedule freezes the included-only proof; a same-URL replacement holds the dispatch.
    composition = await reads.composition();
    const reviewed = composition.target.tenantResources;
    const scheduled = await authorizeTenantOffer(kit, page, composition, "schedule");
    assert.equal(
      scheduled.authorized.status,
      200,
      JSON.stringify(scheduled.authorized.body),
    );
    let sequence = scheduled.authorized.body.sequence;
    const basis = sequence.authorization.resourceBasis;
    assert.deepEqual(basis.initial, [
      reviewed.insurance_flyer.evidence,
      reviewed.rbp_flyer.evidence,
    ]);
    assert.equal(basis.followUp ?? null, null);
    observed.evidenceBoundExactReview = true;
    await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11c",
      }),
    );
    await kit.dispatchDue(page, sequence);
    sequence = await sequenceOf(sequence.id);
    record({
      id: "N10-05",
      check: "replacement-dispatch",
      state: sequence.state,
      pause: sequence.pause,
    });
    assert.equal(sequence.state, "paused");
    assert.equal(sequence.pause?.cause, "resource_changed");
    assert.equal((await kit.sentMail()).length, sentBefore);
    await cancelSequence(kit, page, sequence.id);

    // Revocation at the same URL: the send and the scheduled claim both refuse.
    composition = await reads.composition();
    const revocable = await authorizeTenantOffer(kit, page, composition, "schedule");
    assert.equal(revocable.authorized.status, 200);
    await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", { url: urls.rbp_flyer, clear: true }),
    );
    const revoked = await reads.composition();
    assert.equal(revoked.target.tenantResources?.rbp_flyer?.state, "source_pending");
    const refusedSend = await authorizeTenantOffer(kit, page, composition, "send");
    assert.equal(refusedSend.authorized.status, 409);
    await kit.dispatchDue(page, revocable.authorized.body.sequence);
    const heldRevocation = await sequenceOf(revocable.authorized.body.sequence.id);
    assert.equal(heldRevocation.state, "paused");
    assert.equal((await kit.sentMail()).length, sentBefore);
    await cancelSequence(kit, page, heldRevocation.id);
    observed.sameUrlProofChangeRefused = true;
    proofs.rbp_flyer = await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11d",
      }),
    );

    // The Gmail draft claim rechecks the included proof and ignores an omitted resource.
    assert.ok((await forceSourceRefresh(page)).body?.refreshed);
    tenant = await reads.tenant();
    const draftPreview = async () => {
      const preview = await kit.post(page, PREPARATION, {
        kind: "draft",
        leaseId,
        channel: "tenant",
        displayed: {
          subject: tenant.content.subject ?? "",
          body: tenant.content.plainText,
        },
      });
      assert.equal(preview.status, 200, JSON.stringify(preview.body));
      assert.equal(preview.body.status, "preview", JSON.stringify(preview.body));
      return preview.body;
    };
    const confirmDraft = (preview) =>
      kit.post(page, PREPARATION, {
        kind: "draft",
        leaseId,
        channel: "tenant",
        confirm: { executionId: preview.executionId, previewHash: preview.previewHash },
      });
    let preview = await draftPreview();
    await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11e",
      }),
    );
    const changedDraft = await confirmDraft(preview);
    assert.equal(changedDraft.status, 409, JSON.stringify(changedDraft.body));
    assert.equal(changedDraft.body.providerCallAttempted ?? false, false);
    assert.ok((await forceSourceRefresh(page)).body?.refreshed);
    tenant = await reads.tenant();
    preview = await draftPreview();
    // The offer leaves the optional form out while its link has no audience check (S265's
    // default inclusion follows a usable link). Recording a link for it without the check changes
    // that omitted resource only: the reviewed message and its included proof stay as they were.
    await asAdmin(() =>
      saveResource(kit, page, "renewal_information_form", {
        url: SYNTHETIC_HOST + "/renewal-form",
        clear: true,
      }),
    );
    const draftsBefore = new Set((await kit.draftMail()).map((draft) => draft.id));
    const created = await confirmDraft(preview);
    record({
      id: "N10-05",
      check: "draft-omitted-change",
      status: created.status,
      body: created.body?.status,
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.status, "created");
    const drafted = (await kit.draftMail()).filter(
      (draft) => !draftsBefore.has(draft.id),
    );
    assert.equal(drafted.length, 1);
    assert.equal(typeof drafted[0].text, "string");
    assert.doesNotMatch(drafted[0].text, /renewal-form|information form/i);
    await asAdmin(() =>
      saveResource(kit, page, "renewal_information_form", { url: "", clear: true }),
    );

    // An omitted resource's change never holds the scheduled dispatch, which sends.
    composition = await reads.composition();
    const omitted = await authorizeTenantOffer(kit, page, composition, "schedule");
    assert.equal(omitted.authorized.status, 200);
    await asAdmin(() =>
      saveResource(kit, page, "renewal_information_form", {
        url: SYNTHETIC_HOST + "/renewal-form",
        version: "Renewal form 2026-11b",
      }),
    );
    await kit.dispatchDue(page, omitted.authorized.body.sequence);
    const delivered = await sequenceOf(omitted.authorized.body.sequence.id);
    record({
      id: "N10-05",
      check: "omitted-dispatch",
      state: delivered.state,
      confirmed: delivered.confirmedCount,
    });
    assert.equal(delivered.confirmedCount, 1);
    const sent = await kit.sentMail();
    assert.equal(sent.length, sentBefore + 1);
    assert.doesNotMatch(sent.at(-1).text, /renewal-form/);
    await asAdmin(() =>
      saveResource(kit, page, "renewal_information_form", { url: "", clear: true }),
    );
    observed.omittedResourceChangeIgnored = true;
    observed.draftSendScheduledProofRechecked = true;

    // An unsent authorization from before resource checks is held at dispatch.
    composition = await reads.composition();
    const legacy = await authorizeTenantOffer(kit, page, composition, "schedule");
    assert.equal(legacy.authorized.status, 200);
    const authorization = (await sequenceOf(legacy.authorized.body.sequence.id))
      .authorization;
    const { payloadHash, resourceBasis, ...rest } = authorization;
    assert.equal(
      sequencePayloadHash({ ...rest, resourceBasis }),
      payloadHash,
      "Hash replica matches",
    );
    await kit.patchDocument(
      "gmail_communication_sequences/" + legacy.authorized.body.sequence.id,
      ["authorization.resourceBasis", "authorization.payloadHash"],
      { authorization: firestoreValue({ payloadHash: sequencePayloadHash(rest) }) },
    );
    await kit.dispatchDue(page, legacy.authorized.body.sequence);
    const heldLegacy = await sequenceOf(legacy.authorized.body.sequence.id);
    record({
      id: "N10-05",
      check: "legacy",
      state: heldLegacy.state,
      pause: heldLegacy.pause,
    });
    assert.equal(heldLegacy.state, "paused");
    assert.equal(heldLegacy.pause?.cause, "resource_changed");
    assert.equal((await kit.sentMail()).length, sentBefore + 1);
    await cancelSequence(kit, page, heldLegacy.id);
    observed.legacyAuthorizationHeld = true;

    // An uncertain attempt reconciles from the provider readback without another send.
    composition = await reads.composition();
    await setNextSend(rehearsal, "unconfirmed");
    const uncertain = await authorizeTenantOffer(kit, page, composition, "send");
    assert.equal(
      uncertain.authorized.status,
      200,
      JSON.stringify(uncertain.authorized.body),
    );
    const kept = (await kit.sentMail()).length;
    assert.equal(kept, sentBefore + 2);
    let attempt = await kit.read(page, SEQUENCES + "?id=" + uncertain.staged.id);
    assert.equal(attempt.sequence.state, "needs_reconciliation");
    const frozen = attempt.sequence.authorization.resourceBasis;
    await asAdmin(() =>
      saveResource(kit, page, "rbp_flyer", {
        url: urls.rbp_flyer,
        version: "RBP flyer 2026-11f",
      }),
    );
    await kit.open(page, kit.href(leaseId, "?step=offer-tenant"));
    const reconcile = kit
      .now(page)
      .getByRole("button", { name: "Check whether the message went out", exact: true });
    await reconcile.waitFor();
    const competing = await kit
      .now(page)
      .getByRole("button", {
        name: /^(Review tenant offer|Review and send|Send|Schedule)/,
      })
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: (node.textContent ?? "").trim(),
          disabled: node.disabled,
          within:
            node
              .closest("[data-renewal-now-slot], [data-renewal-field], section, details")
              ?.getAttribute("data-renewal-now-slot") ??
            node.closest("[data-renewal-field]")?.getAttribute("data-renewal-field") ??
            node.closest("[id]")?.id ??
            null,
        })),
      );
    record({ id: "N10-05", check: "reconcile-competing", competing });
    assert.deepEqual(competing, [], "Nothing competes with the reconciliation");
    observed.reconciliationLeadsOffer = true;
    const resumed = await kit.post(page, SEQUENCES, {
      action: "resume",
      id: uncertain.staged.id,
      expectedVersion: attempt.sequence.version,
      operationId: uuid(),
      reviewedDraftHash: attempt.reviewedDraftHash ?? null,
      reviewedTargetHash: composition.reviewedTargetHash,
      schedule: null,
    });
    assert.equal(resumed.status, 409);
    const answer = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === SEQUENCES &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.action === "reconcile",
    );
    await reconcile.click();
    assert.equal((await answer).status(), 200);
    attempt = await kit.read(page, SEQUENCES + "?id=" + uncertain.staged.id);
    assert.equal(attempt.sequence.unresolvedOccurrenceId, null);
    assert.equal(attempt.attempts.at(-1).state, "sent");
    assert.deepEqual(attempt.sequence.authorization.resourceBasis, frozen);
    assert.equal((await kit.sentMail()).length, kept);
    observed.uncertainAttemptReconciledWithoutSend = true;
    record({ id: "N10-05", check: "proofs", proofs: Object.keys(proofs) });
  } finally {
    setRecurringCharges(rehearsal, lease.leaseId, null);
  }
  return observed;
}
