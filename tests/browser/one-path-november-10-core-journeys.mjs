// S271 N10-01 (S261), N10-02 (S262) and N10-03 (S263) on the guarded rehearsal. Every key is set
// from a rendered control, a route answer or an emulator readback, never from a label alone.
import assert from "node:assert/strict";
import {
  deliverOwnerReply,
  setNextSend,
  setRecurringCharges,
  setSourceCycleDate,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  confirmReviewDialog,
  forceSourceRefresh,
  openOwnerReview,
  openReviewDialog,
  reachLeasePrimary,
  sendOwnerMessage,
} from "../../scripts/lib/one-path-rehearsal/seeds.mjs";
import { baseRentCharges } from "../../scripts/lib/one-path-rehearsal/synthetic-charges.mjs";
import {
  addDays,
  addYears,
  compositionText,
  firestoreValue,
  sha256,
  uuid,
} from "./one-path-november-10-kit.mjs";

const WORKING = "/api/lease-renewal/working-record";
const WORKSPACE = "/api/lease-renewal/workspace";
const PREPARATION = "/api/lease-renewal/message-preparation";
const SEQUENCES = "/api/gmail-hub/sequences";
const usDate = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const money = (amount) =>
  "$" + Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2 });

/** Working record, workspace and both message preparations for one lease. */
export function leaseReads(kit, page, leaseId) {
  return {
    working: () => kit.read(page, WORKING + "?leaseId=" + leaseId),
    workspace: () => kit.read(page, WORKSPACE + "?leaseId=" + leaseId),
    owner: () => kit.read(page, PREPARATION + "?leaseId=" + leaseId + "&channel=owner"),
    tenant: () => kit.read(page, PREPARATION + "?leaseId=" + leaseId + "&channel=tenant"),
    composition: (purpose = "renewal_tenant") =>
      kit.read(
        page,
        "/api/gmail-hub/composition?purpose=" + purpose + "&lease=" + leaseId,
      ),
  };
}

const NOTICE_GENERATION = /source generations conflict/;

/**
 * A message read can advance the lease's notice-safety marker, and only a RentVine read begun
 * after it admits the lease again (lib/firestore/renewal-notice-safety.ts). As the reason tells
 * staff, refresh the lease source and review again; the owner composition then reads clean.
 */
async function admitNoticeSource(kit, page, leaseId, purpose = "renewal_owner") {
  const path = "/api/gmail-hub/composition?purpose=" + purpose + "&lease=" + leaseId;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const composition = await kit.read(page, path);
    if (
      !(composition.target?.blockers ?? []).some((reason) =>
        NOTICE_GENERATION.test(reason),
      )
    )
      return { composition, refreshes: attempt };
    assert.ok(
      (await forceSourceRefresh(page)).body?.refreshed,
      "Refresh the lease source",
    );
  }
  assert.fail("The lease source was not admitted for notice safety after four reads");
}

async function saveWorking(kit, page, leaseId, field, value, extra = {}) {
  const current = (await kit.read(page, WORKING + "?leaseId=" + leaseId)).record;
  const entry = current?.fields?.[field] ?? current?.cycle?.held?.[field]?.entry;
  return kit.post(page, WORKING, {
    leaseId: String(leaseId),
    field,
    value,
    expectedRevision: entry?.revision ?? 0,
    operationId: uuid(),
    ...extra,
  });
}

/**
 * The owner approval the tenant offer needs on one lease (outreach done, approved terms by a
 * synthetic representative in a conversation), recorded once through the workspace route.
 */
export async function recordOwnerApproval(kit, page, leaseId, approvedBase = undefined) {
  const reads = leaseReads(kit, page, leaseId);
  // A lease without a work record gets one from its first record (S154: cycleId null).
  let state = (await reads.workspace()).state;
  if (state?.ownerResponse?.outcome === "approved_terms" && !approvedBase) return state;
  if (state?.activities?.owner_outreach?.outcome !== "done") {
    const outreach = await kit.post(page, WORKSPACE, {
      operation: "record",
      leaseId: String(leaseId),
      cycleId: state?.cycleId ?? null,
      expectedRevision: state?.revision ?? 0,
      operationId: uuid(),
      action: {
        kind: "activity",
        activity: "owner_outreach",
        outcome: "done",
        source: "Synthetic approval conversation",
      },
    });
    assert.equal(outreach.status, 200, JSON.stringify(outreach.body));
    state = outreach.body.state;
  }
  const approval = await kit.post(page, WORKSPACE, {
    operation: "record",
    leaseId: String(leaseId),
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
      ...(approvedBase ? { approvedBase } : {}),
    },
  });
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  return approval.body.state;
}

// ---- N10-03 ------------------------------------------------------------------------------------

export async function journeyN1003(ctx, page) {
  const { kit, rehearsal, record } = ctx;
  const lease = ctx.leases.prepared;
  const reads = leaseReads(kit, page, lease.leaseId);
  const tenant0 = await reads.tenant();
  const end = tenant0.facts?.leaseEndDate;
  assert.match(String(end), /^\d{4}-\d{2}-\d{2}$/, "Read the verified current lease end");
  const start = addDays(end, 1);
  const renewalEnd = addYears(end, 1);
  const working0 = (await reads.working()).record;
  for (const field of ["terms_effective_date", "terms_end_date"])
    assert.equal(
      working0?.fields?.[field] ?? working0?.cycle?.held?.[field],
      undefined,
      "N10-03 starts with no stored renewal " + field,
    );
  const observed = {};
  const tenantSavedBefore = tenant0.saved?.revision ?? null;

  // The fix opens Working renewal terms with the next-day choice.
  await kit.open(page, kit.href(lease.leaseId, "?step=offer-tenant"));
  const enterStart = page
    .getByRole("button", { name: "Enter renewal start date", exact: true })
    .or(page.getByRole("link", { name: "Enter renewal start date", exact: true }))
    .first();
  await enterStart.waitFor();
  await enterStart.click();
  const terms = page.locator("#renewal-working-terms");
  const suggestion = page.getByRole("button", {
    name: "Use the day after the current lease ends",
    exact: true,
  });
  await suggestion.waitFor();
  const startField = page.locator("#renewal-working-terms-start");
  assert.match(
    await startField.innerText(),
    new RegExp("Suggested start: " + usDate(start).replace(/\//g, "\\/")),
  );
  assert.match(
    await terms.innerText(),
    new RegExp(
      "Current lease ends: " + usDate(end).replace(/\//g, "\\/") + " \\(RentVine\\)",
    ),
  );
  const chosen = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKING &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.field === "terms_effective_date",
  );
  await suggestion.click();
  const chosenResponse = await chosen;
  const chosenBody = chosenResponse.request().postDataJSON();
  assert.equal(chosenResponse.status(), 200);
  assert.equal(chosenBody.value, start);
  assert.deepEqual(chosenBody.dateProposal, {
    kind: "day_after_lease_end",
    leaseEndIso: end,
  });
  let working = (await reads.working()).record;
  assert.equal(working.fields.terms_effective_date.value, start);
  assert.equal(working.fields.terms_effective_date.cycleId, working.cycle.cycleId);
  observed.nextDayChoiceFromVerifiedEnd = true;

  // Return to tenant offer restores the same offer before the end is entered.
  const back = page.getByRole("button", { name: "Return to tenant offer", exact: true });
  await back.waitFor();
  // Return focuses the tenant offer's readiness, which mounts with the offer's own first read.
  // Staff return to a loaded offer; a return before that read finishes has nothing to focus
  // (seen twice on the development server, reported with the S271 runs).
  const readiness = page.locator("#renewal-message-tenant-readiness");
  await readiness.waitFor({ state: "attached" });
  const readinessShown = await readiness.count();
  await back.click();
  try {
    await page.waitForFunction(() =>
      Boolean(document.activeElement?.closest("#renewal-message-tenant-readiness")),
    );
  } catch (error) {
    // Diagnostics only: where focus went and whether the tenant offer's readiness was mounted.
    record({
      id: "N10-03",
      check: "return-focus",
      readinessShown,
      ...(await page.evaluate(() => ({
        active: document.activeElement
          ? document.activeElement.tagName + "#" + document.activeElement.id
          : null,
        readinessNow: Boolean(
          document.getElementById("renewal-message-tenant-readiness"),
        ),
        summary:
          document
            .getElementById("renewal-message-tenant-readiness-summary")
            ?.textContent?.slice(0, 200) ?? null,
        nowStep:
          document
            .querySelector('[role="region"][aria-label="Now"]')
            ?.getAttribute("data-renewal-now-step") ?? null,
      }))),
    });
    throw error;
  }
  const tenant1 = await reads.tenant();
  assert.equal(tenant1.saved?.revision ?? null, tenantSavedBefore);
  assert.match(tenant1.content.plainText, new RegExp("effective " + usDate(start)));
  observed.returnToTenantOffer = true;

  // No stored duration: the end has no suggestion and is entered by hand.
  const enterEnd = page
    .getByRole("button", { name: "Enter renewal end date", exact: true })
    .or(page.getByRole("link", { name: "Enter renewal end date", exact: true }))
    .first();
  await enterEnd.waitFor();
  await enterEnd.click();
  const endField = page.locator("#renewal-working-terms-end");
  await endField.waitFor();
  assert.equal(await endField.getByRole("button", { name: /^Use / }).count(), 0);
  assert.doesNotMatch(await endField.innerText(), /Suggested end/);
  const endInput = endField.locator('input[type="date"]');
  const manual = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKING &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.field === "terms_end_date",
  );
  await endInput.fill(renewalEnd);
  await endInput.press("Tab");
  const manualResponse = await manual;
  assert.equal(manualResponse.status(), 200);
  assert.equal(manualResponse.request().postDataJSON().dateProposal, undefined);
  working = (await reads.working()).record;
  assert.equal(working.fields.terms_end_date.value, renewalEnd);
  observed.noStoredDurationManualEnd = true;

  // An invalid date and a forged suggestion are refused; an inverted range holds the offer.
  const invalid = await saveWorking(
    kit,
    page,
    lease.leaseId,
    "terms_end_date",
    "2027-13-01",
    {
      expectedCycleId: working.cycle.cycleId,
    },
  );
  assert.equal(invalid.status, 400, JSON.stringify(invalid.body));
  const forged = await saveWorking(
    kit,
    page,
    lease.leaseId,
    "terms_effective_date",
    addDays(end, 2),
    {
      expectedCycleId: working.cycle.cycleId,
      dateProposal: { kind: "day_after_lease_end", leaseEndIso: end },
    },
  );
  assert.ok([400, 409].includes(forged.status), JSON.stringify(forged.body));
  const inverted = await saveWorking(
    kit,
    page,
    lease.leaseId,
    "terms_end_date",
    addDays(start, -16),
    { expectedCycleId: working.cycle.cycleId },
  );
  let invertedHeld = false;
  if (inverted.status === 200) {
    const held = await reads.composition();
    invertedHeld = (held.target.blockers ?? []).some((reason) =>
      /end date is not after the start date/i.test(reason),
    );
    const restored = await saveWorking(
      kit,
      page,
      lease.leaseId,
      "terms_end_date",
      renewalEnd,
      { expectedCycleId: working.cycle.cycleId },
    );
    assert.equal(restored.status, 200);
  } else invertedHeld = inverted.status >= 400;
  assert.ok(invertedHeld, "An inverted renewal term is held from the offer");
  record({
    id: "N10-03",
    check: "invalid-range",
    invalid: invalid.status,
    forged: forged.status,
    inverted: inverted.status,
  });
  observed.invalidRangeRefused = true;

  // Working and source dates stay distinct.
  const tenant2 = await reads.tenant();
  assert.equal(tenant2.facts.leaseEndDate, end);
  assert.match(
    tenant2.content.plainText,
    new RegExp(usDate(start) + " through " + usDate(renewalEnd)),
  );
  assert.notEqual(end, renewalEnd);
  observed.workingAndSourceDatesDistinct = true;
  const baseline = await reads.composition();

  // A source disagreement holds the dates; staff keep working on the recorded cycle.
  const later = addYears(end, 1);
  try {
    setSourceCycleDate(rehearsal, lease.leaseId, later);
    assert.ok(
      (await forceSourceRefresh(page)).body?.refreshed,
      "Read the changed lease end",
    );
    const disputed = await reads.tenant();
    assert.equal(disputed.facts.leaseEndDate, null);
    assert.match(disputed.content.plainText, /Needs Verification: lease end date/);
    await kit.open(page, kit.href(lease.leaseId, "?step=offer-tenant"));
    await page.getByText("Verify current lease end", { exact: true }).first().waitFor();
    const refused = await saveWorking(
      kit,
      page,
      lease.leaseId,
      "terms_effective_date",
      start,
      {
        expectedCycleId: working.cycle.cycleId,
        dateProposal: { kind: "day_after_lease_end", leaseEndIso: end },
      },
    );
    assert.equal(refused.status, 409, JSON.stringify(refused.body));
    const heldComposition = await reads.composition();
    assert.notEqual(heldComposition.reviewedTargetHash, baseline.reviewedTargetHash);
    observed.sourceDisagreementHeld = true;

    const kept = await kit.post(page, WORKSPACE, {
      operation: "keep_working",
      leaseId: String(lease.leaseId),
      recordedDateIso: end,
      sourceDateIso: later,
      operationId: uuid(),
    });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    const resolved = await reads.tenant();
    assert.equal(resolved.facts.leaseEndDate, end);
    const resolvedComposition = await reads.composition();
    for (const text of [resolved.content.plainText, compositionText(resolvedComposition)])
      assert.match(text, new RegExp(usDate(end)));
    await kit.open(page, kit.href(lease.leaseId, "?view=full#renewal-working-terms"));
    await page
      .getByText(/the recorded renewal cycle staff kept working/)
      .first()
      .waitFor();
    observed.resolvedEndConsistent = true;
  } finally {
    setSourceCycleDate(rehearsal, lease.leaseId, null);
    assert.ok(
      (await forceSourceRefresh(page)).body?.refreshed,
      "Restore the current source",
    );
  }
  assert.equal((await reads.tenant()).facts.leaseEndDate, end);

  // A scheduled claim rechecks the basis after the source changes.
  if (!kit.mailAvailable) {
    observed.missing =
      "The scheduled recheck needs the compiled synthetic mail build (or the development mail adapter).";
    return observed;
  }
  await recordOwnerApproval(kit, page, lease.leaseId);
  const composition = await reads.composition();
  assert.deepEqual(composition.target.blockers ?? [], [], "The tenant offer is ready");
  const sentBefore = (await kit.sentMail()).length;
  // S284 R-S284-2: the tenant offer is scheduled through its own visible Schedule control and
  // review ("Schedule this message"); the click makes the request this waits on.
  const offered = await reachLeasePrimary(
    page,
    lease.leaseId,
    "offer-tenant",
    "Review tenant offer",
  );
  assert.equal(
    offered.name,
    "Review tenant offer",
    "The tenant offer is ready to review",
  );
  const scheduleInNow = kit
    .now(page)
    .getByRole("button", { name: "Schedule", exact: true });
  const scheduleControl = (await scheduleInNow
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false))
    ? scheduleInNow
    : page.getByRole("button", { name: "Schedule", exact: true }).first();
  const scheduleReview = await openReviewDialog(
    page,
    scheduleControl,
    "Review and schedule",
  );
  const scheduled = await confirmReviewDialog(
    page,
    scheduleReview,
    "Schedule this message",
  );
  assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
  const sequence = scheduled.body.sequence;
  assert.equal(sequence.confirmedCount, 0, "Scheduled, not sent");
  assert.equal((await kit.sentMail()).length, sentBefore);
  record({ id: "N10-03", check: "scheduled-by-visible-control", state: sequence.state });
  // The source must change to a date staff have not already resolved: `later` is the RentVine
  // date the keep-working choice above covers, so it leaves the offer's facts as they were.
  const changedAgain = addYears(end, 2);
  try {
    setSourceCycleDate(rehearsal, lease.leaseId, changedAgain);
    assert.ok((await forceSourceRefresh(page)).body?.refreshed);
    assert.equal((await reads.tenant()).facts.leaseEndDate, null);
    await kit.dispatchDue(page, sequence);
    const held = (await kit.read(page, SEQUENCES + "?id=" + sequence.id)).sequence;
    record({
      id: "N10-03",
      check: "scheduled-recheck",
      sourceDate: changedAgain,
      state: held.state,
      pause: held.pause,
    });
    assert.equal(held.state, "paused");
    assert.equal(held.pause?.cause, "changed_source");
    assert.equal(held.confirmedCount, 0);
    assert.equal((await kit.sentMail()).length, sentBefore);
    observed.scheduledRecheckRefused = true;
  } finally {
    setSourceCycleDate(rehearsal, lease.leaseId, null);
    assert.ok((await forceSourceRefresh(page)).body?.refreshed);
    const latest = (await kit.read(page, SEQUENCES + "?id=" + sequence.id)).sequence;
    if (!["cancelled", "completed"].includes(latest.state)) {
      const cancelled = await kit.post(page, SEQUENCES, {
        action: "cancel",
        id: sequence.id,
        expectedVersion: latest.version,
        operationId: uuid(),
      });
      record({ id: "N10-03", check: "cancel-held", status: cancelled.status });
    }
  }
  return observed;
}

// ---- N10-02 ------------------------------------------------------------------------------------

export async function journeyN1002(ctx, page) {
  const { kit, rehearsal, record } = ctx;
  const leaseId = String(ctx.leases.replied.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const observed = {};
  if (!kit.mailAvailable) {
    return {
      missing:
        "An eligible owner reply needs the compiled synthetic mail build (or the development mail adapter).",
    };
  }
  // Establish the work record, the recommendation and an owner message whose send is uncertain.
  assert.ok((await forceSourceRefresh(page)).body?.refreshed, "Read the current source");
  const owner0 = await reads.owner();
  const ownerBlockers = async () =>
    ((await reads.composition("renewal_owner")).target?.blockers ?? []).filter((reason) =>
      NOTICE_GENERATION.test(reason),
    ).length;
  const notice = {
    workRecordBefore: (await reads.workspace()).state?.cycleId ?? null,
    savedBefore: owner0.saved?.revision ?? null,
    afterRefresh: await ownerBlockers(),
  };
  if (!owner0.saved) {
    const saved = await kit.post(page, PREPARATION, {
      kind: "save",
      leaseId,
      channel: "owner",
      ...(owner0.cycleId ? { cycleId: owner0.cycleId } : {}),
      expectedRevision: 0,
      operationId: uuid(),
      inputs: owner0.inputs,
      bodyOverride: null,
      subjectOverride: null,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  }
  const cycle =
    (await reads.working()).record?.cycle?.cycleId ??
    (await reads.workspace()).state.cycleId;
  const recommended = await saveWorking(kit, page, leaseId, "terms_rent", 1850, {
    expectedCycleId: cycle,
  });
  assert.equal(recommended.status, 200, JSON.stringify(recommended.body));
  notice.workRecordAfter = (await reads.workspace()).state?.cycleId ?? null;
  notice.afterSaves = await ownerBlockers();
  notice.refreshes = (await admitNoticeSource(kit, page, leaseId)).refreshes;
  record({ id: "N10-02", check: "notice-admission", ...notice });
  const sentBefore = (await kit.sentMail()).length;
  // S284 R-S284-2: the duplicate-send probe is a second page that opened the same review before
  // the first Send. Its Send then comes from a stale review: the server refuses it, the stale page
  // shows the refusal, and the sent-mail count is unchanged.
  const origin = new URL(page.url()).origin;
  const stalePage = await page.context().newPage();
  let message;
  let sequenceId;
  let sequence;
  let stale;
  try {
    const staleReview = await openOwnerReview(stalePage, leaseId, { origin });
    assert.equal(staleReview.refusal, undefined, staleReview.refusal);
    await setNextSend(rehearsal, "unconfirmed");
    message = await sendOwnerMessage(page, leaseId, { origin });
    assert.equal(message.refusal, undefined, message.refusal);
    sequenceId = message.sequenceId;
    sequence = (await kit.read(page, SEQUENCES + "?id=" + sequenceId)).sequence;
    assert.equal(sequence.state, "needs_reconciliation");
    assert.ok(sequence.unresolvedOccurrenceId);
    assert.equal((await kit.sentMail()).length, sentBefore + 1);
    stale = await confirmReviewDialog(stalePage, staleReview.dialog, "Send this message");
    assert.ok(
      stale.status >= 400,
      "The stale review's Send is refused: " + JSON.stringify(stale.body),
    );
    assert.ok(stale.alert, "The stale page shows the refusal");
    assert.equal((await kit.sentMail()).length, sentBefore + 1);
  } finally {
    await stalePage.close().catch(() => undefined);
  }
  await kit.open(page, kit.href(leaseId, "?step=ask-owner"));
  const reconcile = kit
    .now(page)
    .getByRole("button", { name: "Check whether the message went out", exact: true });
  await reconcile.waitFor();
  assert.equal(
    await kit.now(page).getByRole("group", { name: "Record the owner's answer" }).count(),
    0,
    "The answer waits for the uncertain send",
  );
  const reconciled = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === SEQUENCES &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === "reconcile",
  );
  await reconcile.click();
  assert.equal((await reconciled).status(), 200);
  sequence = (await kit.read(page, SEQUENCES + "?id=" + sequenceId)).sequence;
  assert.equal(sequence.unresolvedOccurrenceId, null);
  assert.equal(sequence.confirmedCount, 1);
  assert.equal((await kit.sentMail()).length, sentBefore + 1);
  observed.uncertainSendReconciledFirst = true;
  record({
    id: "N10-02",
    check: "reconciled",
    state: sequence.state,
    staleSend: stale.status,
    staleAlert: Boolean(stale.alert),
  });

  const reply = await deliverOwnerReply(rehearsal, {
    threadId: sequence.threads[0].threadId,
    text: "Synthetic owner reply: approved at a base rent of 1875 per month.",
  });
  // S275 R-S275-8: the reply reaches the lease the staff way: the waiting step's visible
  // "Check for a reply now" (R-S275-3), whose own click makes the request this waits on.
  await kit.open(page, kit.href(leaseId, "?step=ask-owner"));
  const checkNow = kit
    .now(page)
    .getByRole("button", { name: "Check for a reply now", exact: true });
  await checkNow.waitFor();
  const checked = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === SEQUENCES &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === "refresh",
  );
  await checkNow.click();
  assert.equal((await checked).status(), 200);
  const observedReply = (await kit.read(page, SEQUENCES + "?id=" + sequenceId)).sequence;
  assert.equal(
    observedReply.inbound.find((entry) => entry.messageId === reply.messageId)?.kind,
    "human",
  );
  record({ id: "N10-02", check: "reply-by-visible-check", state: observedReply.state });

  // The owner's answer from the eligible reply: review, a concurrent change, then the save.
  const answer = async () => {
    await kit.open(page, kit.href(leaseId, "?step=ask-owner"));
    const fieldset = page.locator("#renewal-owner-decision-from-reply");
    await fieldset.waitFor();
    // The lease's owner replies are listed newest first: the one just delivered on this thread.
    const approvedInReply = fieldset
      .getByRole("radio", { name: /^Approved in the reply received/ })
      .first();
    assert.ok(
      String(await approvedInReply.getAttribute("value")).includes(sequenceId),
      "The approval names the reply on this send's thread",
    );
    await approvedInReply.check();
    const amount = fieldset.getByLabel("Amount approved", { exact: true });
    await amount.waitFor();
    assert.equal(await amount.inputValue(), "", "Amount approved is never prefilled");
    await amount.fill("1875");
    const who = fieldset.getByLabel("Who approved in this reply", { exact: true });
    const options = await who
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
    await who.selectOption(options[0]);
    await fieldset
      .getByRole("button", { name: "Review the owner's answer", exact: true })
      .click();
    const review = page.getByRole("region", { name: "Review the owner's answer" });
    await review.waitFor();
    assert.match(
      await review.locator('[data-renewal-field="owner-answer-approved"]').innerText(),
      /\$1,875/,
    );
    return review;
  };
  let review = await answer();
  const before = (await reads.working()).record.fields.terms_rent;
  record({ id: "N10-02", check: "reviewed-against", revision: before.revision });
  for (const value of [1855, 1850]) {
    const moved = await saveWorking(kit, page, leaseId, "terms_rent", value, {
      expectedCycleId: cycle,
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
  }
  // The stale page's Send above is `stale`; this is the save made against a moved revision.
  const staleSave = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKSPACE &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action?.kind === "owner_response",
  );
  await review
    .getByRole("button", { name: "Save the owner's answer", exact: true })
    .click();
  assert.equal((await staleSave).status(), 409);
  await page
    .getByText(/was not saved/)
    .first()
    .waitFor();
  assert.equal((await reads.workspace()).state.ownerResponse ?? null, null);
  observed.concurrentEditRefused = true;

  review = await answer();
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKSPACE &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action?.kind === "owner_response" &&
      response.ok(),
  );
  await review
    .getByRole("button", { name: "Save the owner's answer", exact: true })
    .click();
  const answered = await (await saved).json();
  const approved = answered.state.ownerResponse.approvedBase;
  assert.equal(approved.amount, 1875);
  assert.equal(approved.scope, "amount_only");
  let working = (await reads.working()).record;
  assert.equal(working.fields.terms_rent.value, 1875);
  assert.equal(working.fields.terms_rent.basis?.kind, "owner_approval");
  observed.differentApprovedBaseRecorded = true;

  assert.equal(answered.state.ownerResponse.approvedWorkingTerms, undefined);
  await kit.open(page, kit.href(leaseId, "?view=full#renewal-manual-owner_response"));
  const coverage = page.locator('[data-renewal-field="owner-approval-coverage"]');
  await coverage.waitFor();
  assert.equal(await coverage.getAttribute("data-coverage"), "amount_only");
  assert.match(await coverage.innerText(), /dates and other charges are not covered/);
  observed.amountOnlyCoverage = true;

  assert.equal(working.fields.recommended_rent?.value, 1850);
  assert.ok(working.fields.recommended_rent?.preservedFrom);
  assert.equal((await reads.owner()).rentToRecommend?.value, 1850);
  observed.previousRecommendationPreserved = true;

  const tenant = await reads.tenant();
  assert.equal(tenant.facts.ownerTerms?.rent, 1875);
  assert.match(tenant.content.plainText, /\$1,875\.00/);
  observed.tenantPreparationUsesApprovedBase = true;

  // Use this amount for the offer, against a recommendation that changed while reviewing.
  await kit.open(page, kit.href(leaseId, "?step=compare-market"));
  await page
    .getByRole("button", { name: "Use this amount for the offer", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Use this amount for the offer?" });
  await dialog.waitFor();
  const changed = await saveWorking(kit, page, leaseId, "recommended_rent", 1860, {
    expectedCycleId: cycle,
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const adopt = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKING &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.field === "terms_rent",
  );
  await dialog.getByRole("button", { name: /^Use \$[\d,]+ for the offer$/ }).click();
  assert.equal((await adopt).status(), 409);
  await dialog.getByText(/changed since you reviewed it/).waitFor();
  working = (await reads.working()).record;
  assert.equal(working.fields.terms_rent.value, 1875);
  assert.equal(working.fields.terms_rent.basis?.kind, "owner_approval");
  observed.adoptionAgainstChangedProposalRefused = true;

  // Same-cycle restore keeps every cycle-bound term.
  const snapshot = async () => {
    const record = (await reads.working()).record;
    return {
      cycleId: record.cycle.cycleId,
      terms: record.fields.terms_rent,
      recommended: record.fields.recommended_rent,
      approved: (await reads.workspace()).state.ownerResponse?.approvedBase,
      tenantRent: (await reads.tenant()).facts.ownerTerms?.rent,
    };
  };
  const beforeRestore = await snapshot();
  for (const kind of ["complete", "reopen"]) {
    const state = (await reads.workspace()).state;
    const answerKind = await kit.post(page, WORKSPACE, {
      operation: "record",
      leaseId,
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: uuid(),
      action: { kind },
    });
    assert.equal(answerKind.status, 200, kind + " " + JSON.stringify(answerKind.body));
  }
  assert.deepEqual(await snapshot(), beforeRestore);
  observed.sameCycleRestorePreserved = true;

  // Legacy entries on the missing-recipient lease: bound is usable, unbound needs confirmation.
  Object.assign(observed, await legacyTerms(ctx, page));

  // A late save from the prior cycle, after a new cycle on the same lease.
  const end = (await reads.owner()).facts.leaseEndDate;
  const next = addYears(end, 1);
  try {
    setSourceCycleDate(rehearsal, Number(leaseId), next);
    assert.ok((await forceSourceRefresh(page)).body?.refreshed);
    const state = (await reads.workspace()).state;
    const started = await kit.post(page, WORKSPACE, {
      operation: "start_cycle",
      leaseId,
      expectedCycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: uuid(),
      basis: { kind: "lease_end", dateIso: next, source: "RentVine lease end" },
      reason: "Synthetic rehearsal: the next renewal cycle on this lease",
    });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    const late = await saveWorking(kit, page, leaseId, "terms_rent", 1900, {
      expectedCycleId: state.cycleId,
    });
    assert.equal(late.status, 409, JSON.stringify(late.body));
    const afterLate = (await reads.working()).record;
    assert.notEqual(afterLate.cycle.cycleId, state.cycleId);
    assert.equal(afterLate.cycle.held?.terms_rent?.scope, "earlier");
    assert.equal(afterLate.fields.terms_rent, undefined);
    observed.latePriorCycleSaveRefused = true;
  } finally {
    setSourceCycleDate(rehearsal, Number(leaseId), null);
    assert.ok((await forceSourceRefresh(page)).body?.refreshed);
  }
  return observed;
}

/** S262 R-S262-5: a legacy future-term entry with no cycle binding, seeded in the emulator. */
async function legacyTerms(ctx, page) {
  const { kit, record } = ctx;
  const leaseId = String(ctx.leases.missingRecipient.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const owner0 = await reads.owner();
  if (!owner0.saved) {
    const saved = await kit.post(page, PREPARATION, {
      kind: "save",
      leaseId,
      channel: "owner",
      ...(owner0.cycleId ? { cycleId: owner0.cycleId } : {}),
      expectedRevision: 0,
      operationId: uuid(),
      inputs: owner0.inputs,
      bodyOverride: null,
      subjectOverride: null,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  }
  const docId = sha256(leaseId);
  const workspacePath = "lease_renewal_workspaces/" + docId;
  const recordPath = "lease_renewal_working_records/" + docId;
  const activeCycle = (await reads.workspace()).state.cycleId;
  assert.ok(activeCycle, "The missing-recipient lease has a renewal cycle");
  const seed = async (bound) => {
    const current = await kit.readDocument(recordPath);
    const revision = Number(current?.fields?.revision?.integerValue ?? 0);
    const entryRevision = Number(
      current?.fields?.fields?.mapValue?.fields?.terms_rent?.mapValue?.fields?.revision
        ?.integerValue ?? 0,
    );
    const entry = {
      value: 1850,
      revision: entryRevision + 1,
      eventId: uuid(),
      recordedAt: "2026-09-01T15:00:00.000Z",
      recordedByUid: "legacy-fixture",
      recordedByLabel: "legacy.editor@example.invalid",
      origin: bound ? "adopted_source" : "staff_entry",
      ...(bound
        ? {
            sourceLabel: "stored market comparison",
            context: JSON.stringify({
              cycleId: activeCycle,
              basis: "Synthetic legacy preparation",
            }),
          }
        : {}),
    };
    if (current)
      await kit.patchDocument(recordPath, ["revision", "fields.terms_rent"], {
        revision: firestoreValue(revision + 1),
        fields: firestoreValue({ terms_rent: entry }),
      });
    else
      await kit.patchDocument(
        recordPath,
        ["schemaVersion", "leaseId", "revision", "fields"],
        {
          schemaVersion: firestoreValue("renewal-working-record/v1"),
          leaseId: firestoreValue(leaseId),
          revision: firestoreValue(1),
          fields: firestoreValue({ terms_rent: entry }),
        },
        { exists: false },
      );
  };
  const observed = {};
  // The legacy rule reads a head that predates cycle binding: no previousCycleId key at all.
  const head = await kit.readDocument(workspacePath);
  const hadPrevious = head?.fields && "previousCycleId" in head.fields;
  const previous = head?.fields?.previousCycleId;
  await kit.patchDocument(workspacePath, ["previousCycleId"], {});
  try {
    await seed(false);
    let working = (await reads.working()).record;
    assert.equal(working.fields.terms_rent, undefined);
    assert.equal(working.cycle.held?.terms_rent?.scope, "unverified");
    await kit.open(page, kit.href(leaseId, "?step=compare-market"));
    const held = page.locator(
      '[data-working-held="unverified"][data-working-held-field="terms_rent"]',
    );
    await held.waitFor();
    assert.match(await held.innerText(), /^Not confirmed for this renewal/);
    const asEmpty = await kit.post(page, WORKING, {
      leaseId,
      field: "terms_rent",
      value: 1900,
      expectedRevision: 0,
      expectedCycleId: activeCycle,
      operationId: uuid(),
    });
    assert.equal(asEmpty.status, 409, JSON.stringify(asEmpty.body));
    const confirmed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === WORKING &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    await held
      .getByRole("button", { name: "Confirm for this renewal", exact: true })
      .click();
    await confirmed;
    working = (await reads.working()).record;
    assert.equal(working.fields.terms_rent.value, 1850);
    assert.equal(working.fields.terms_rent.cycleId, activeCycle);
    assert.equal(working.cycle.held?.terms_rent, undefined);
    observed.legacyUnboundNeedsConfirmation = true;

    await seed(true);
    working = (await reads.working()).record;
    assert.equal(working.fields.terms_rent?.value, 1850);
    assert.equal(working.fields.terms_rent?.cycleId, undefined);
    assert.equal(working.cycle.held?.terms_rent, undefined);
    assert.equal((await reads.tenant()).facts.ownerTerms?.rent, 1850);
    observed.legacyBoundUsable = true;
  } finally {
    await kit.patchDocument(workspacePath, ["previousCycleId"], {
      previousCycleId: hadPrevious ? previous : { nullValue: null },
    });
    record({ id: "N10-02", check: "legacy-restored", hadPrevious });
  }
  return observed;
}

// ---- N10-01 ------------------------------------------------------------------------------------

export async function journeyN1001(ctx, page, mutations) {
  const { kit, rehearsal, record } = ctx;
  const lease = ctx.leases.prepared;
  const leaseId = String(lease.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const observed = {};
  setRecurringCharges(rehearsal, lease.leaseId, baseRentCharges(lease, "ready"));
  try {
    // Reopening every view starts no lookup and posts nothing.
    const lookups = (await kit.comparisons())[leaseId] ?? 0;
    const ownerBefore = await reads.owner();
    const termsBefore = (await reads.working()).record.fields.terms_rent;
    for (const view of [
      "?step=check-numbers",
      "?step=compare-market",
      "?step=ask-owner",
      "?view=full",
    ])
      await kit.open(page, kit.href(leaseId, view));
    assert.deepEqual(mutations, []);
    assert.equal((await kit.comparisons())[leaseId] ?? 0, lookups);
    observed.noNewLookupOnOpen = true;

    // Base and pet stay separate facts; the ready base keeps the correction out of the lead.
    await kit.open(page, kit.href(leaseId, "?step=check-numbers"));
    const base = kit.now(page).locator('section[aria-label="Current base rent"]');
    await base.waitFor();
    assert.equal(await base.getAttribute("data-renewal-base-rent"), "ready");
    assert.match(
      await base.locator('[data-renewal-field="current-base-rent"]').innerText(),
      new RegExp("\\$" + lease.rent.toLocaleString("en-US")),
    );
    assert.match(
      await base.locator('[data-renewal-field="separate-charges"]').innerText(),
      /Pet Rent: \$40/,
    );
    assert.equal(await base.locator('[data-renewal-field="base-rent-check"]').count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Correct the current base rent" }).count(),
      0,
    );
    const ownerFacts = (await reads.owner()).facts;
    assert.equal(ownerFacts.currentBaseRent?.value, lease.rent);
    observed.baseAndPetSeparate = true;
    const verifyNumbers = await kit
      .now(page)
      .locator("details[data-renewal-verification] > summary")
      .filter({ hasText: /^Verify lease numbers$/ })
      .count();
    observed.failFirst =
      verifyNumbers > 0
        ? ["Check the numbers names the S270 Verify lease numbers group"]
        : [];

    // The saved comparison and owner draft come back as they were. S270 places the estimate or
    // range in Compare market rent's Work and the full comparison, with its comparable rows, in
    // the read-only Verify market comparison, closed on entry: one shown view of the comparison.
    await kit.open(page, kit.href(leaseId, "?step=compare-market"));
    const now = kit.now(page);
    const comparison = now.locator(
      '[data-renewal-now-slot="stored-comparison"] [data-renewal-comparison]',
    );
    await comparison.waitFor();
    const views = {
      inNow: await now.locator("[data-renewal-comparison]").count(),
      visible: await now.locator("[data-renewal-comparison]:visible").count(),
      inClosedVerification: await now
        .locator(
          'details[data-renewal-verification]:not([open]) [data-renewal-comparison="stored"]',
        )
        .count(),
    };
    record({ id: "N10-01", check: "stored-comparison", ...views });
    assert.equal(views.visible, 1, "One stored comparison is shown on entry");
    assert.equal(
      views.inNow - 1,
      views.inClosedVerification,
      "Every other stored comparison is the closed Verify market comparison's",
    );
    assert.match(
      await comparison.locator('[data-renewal-field="comparison-line"]').innerText(),
      /range \$[\d,]+ to \$[\d,]+ from \d+ comparable/,
    );
    assert.equal(
      await page.getByRole("button", { name: "Prepare this lease", exact: true }).count(),
      0,
    );
    const editor = page.getByLabel("Rent to recommend", { exact: true });
    assert.equal(Number(await editor.inputValue()), termsBefore.value);
    observed.savedComparisonResumed = true;

    const ownerAgain = await reads.owner();
    assert.ok(ownerAgain.saved?.revision >= 1);
    assert.equal(ownerAgain.saved.revision, ownerBefore.saved.revision);
    assert.equal(ownerAgain.cycleId, (await reads.workspace()).state.cycleId);
    await kit.open(page, kit.href(leaseId, "?step=ask-owner"));
    await page.getByRole("link", { name: "Edit rent to recommend", exact: true }).click();
    await page.waitForFunction(
      () => document.activeElement?.id === "renewal-now-rent-to-recommend",
    );
    observed.ownerDraftResumed = true;

    assert.match(
      ownerAgain.content.plainText,
      new RegExp(money(lease.rent).replace("$", "\\$") + " per month"),
    );
    assert.doesNotMatch(
      ownerAgain.content.plainText,
      new RegExp(money(lease.rent + 40).replace("$", "\\$")),
    );
    observed.ownerCopyOnBase = true;

    // The walkthrough symptom: one rent charge billing base and pet together. The correction leads.
    setRecurringCharges(rehearsal, lease.leaseId, baseRentCharges(lease, "combined"));
    await kit.open(page, kit.href(leaseId, "?step=check-numbers"));
    const conflict = kit.now(page).locator('section[aria-label="Current base rent"]');
    await conflict.waitFor();
    assert.equal(
      await conflict.getAttribute("data-renewal-base-rent"),
      "needs_verification",
    );
    assert.equal(
      await conflict
        .locator('[data-renewal-field="base-rent-check"]')
        .getAttribute("data-renewal-base-rent-check"),
      "conflict",
    );
    assert.match(
      (await reads.owner()).content.plainText,
      /Needs Verification: current rent/,
    );
    const correct = page
      .getByRole("button", { name: "Correct the current base rent" })
      .first();
    await correct.click();
    const input = page.locator("#renewal-working-current-rent input").first();
    await page.waitForFunction(() =>
      Boolean(document.activeElement?.closest("#renewal-working-current-rent")),
    );
    const corrected = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === WORKING &&
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.field === "current_rent",
    );
    await input.fill(String(lease.rent));
    await input.press("Enter");
    assert.equal((await corrected).status(), 200);
    const stale = await kit.post(page, WORKING, {
      leaseId,
      field: "current_rent",
      value: lease.rent + 1,
      expectedRevision: 0,
      operationId: uuid(),
    });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    observed.correctionUsedOrRefused = true;

    const working = (await reads.working()).record;
    assert.equal(working.fields.current_rent.value, lease.rent);
    assert.equal(working.fields.current_rent.origin, "staff_entry");
    assert.deepEqual(working.fields.terms_rent, termsBefore);
    const ownerAfter = await reads.owner();
    assert.equal(ownerAfter.saved.revision, ownerBefore.saved.revision);
    assert.equal(ownerAfter.facts.currentBaseRent?.value, lease.rent);
    assert.equal(ownerAfter.facts.currentBaseRent?.source, "Staff working value");
    await kit.open(page, kit.href(leaseId, "?step=check-numbers"));
    assert.equal(
      await kit
        .now(page)
        .locator('section[aria-label="Current base rent"]')
        .getAttribute("data-renewal-base-rent"),
      "ready",
    );
    observed.exactReadback = true;

    // A new cycle on the same lease refuses the earlier working rent, recommendation and dates.
    const state = (await reads.workspace()).state;
    const end = (await reads.owner()).facts.leaseEndDate;
    const beforeCycle = (await reads.working()).record;
    const started = await kit.post(page, WORKSPACE, {
      operation: "start_cycle",
      leaseId,
      expectedCycleId: state.cycleId,
      expectedRevision: state.revision,
      operationId: uuid(),
      basis: { kind: "lease_end", dateIso: end, source: "RentVine lease end" },
      reason: "Synthetic rehearsal: a new renewal cycle on the same lease",
    });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    const fresh = (await reads.working()).record;
    assert.notEqual(fresh.cycle.cycleId, state.cycleId);
    const heldFields = Object.keys(fresh.cycle.held ?? {});
    for (const field of ["terms_rent", "terms_effective_date", "terms_end_date"])
      if (beforeCycle.fields[field]) {
        assert.equal(fresh.cycle.held[field]?.scope, "earlier", field);
        assert.equal(fresh.fields[field], undefined, field);
      }
    assert.equal(
      fresh.fields.current_rent?.value,
      lease.rent,
      "Current rent stays with the lease",
    );
    const ownerFresh = await reads.owner();
    assert.equal(ownerFresh.cycleId, fresh.cycle.cycleId);
    assert.equal(ownerFresh.saved ?? null, null);
    assert.equal(ownerFresh.rentToRecommend?.value ?? null, null);
    const late = await kit.post(page, WORKING, {
      leaseId,
      field: "terms_rent",
      value: termsBefore.value + 5,
      expectedRevision: 0,
      expectedCycleId: state.cycleId,
      operationId: uuid(),
    });
    assert.equal(late.status, 409, JSON.stringify(late.body));
    const freshComposition = await reads.composition();
    assert.ok(
      (freshComposition.target.blockers ?? []).length > 0,
      "The claim refuses the earlier terms",
    );
    await kit.open(page, kit.href(leaseId, "?step=compare-market"));
    await page
      .getByText(/^From an earlier renewal/)
      .first()
      .waitFor();
    assert.equal((await kit.comparisons())[leaseId] ?? 0, lookups);
    record({ id: "N10-01", check: "new-cycle", held: heldFields });
    observed.priorCycleRefusedAsCurrent = true;
  } finally {
    setRecurringCharges(rehearsal, lease.leaseId, null);
  }
  return observed;
}
