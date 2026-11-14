import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync, renameSync } from "node:fs";
import {
  bounceSentMessage,
  deliverOwnerReply,
  setMailThreadUnreadable,
  setNextSend,
  standInState,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { inspectOutcome, outcomeFaults } from "./one-path-november-9-outcome-check.mjs";

const SEQUENCES = "/api/gmail-hub/sequences";
const WORKER = "/api/rehearsal/s260-mail-worker";
const WORKSPACE = "/api/lease-renewal/workspace";
const DAY = 86_400_000;
const cleanText = (value) => value.replace(/\r\n/g, "\n").trim();
const postFor = (response, action) =>
  new URL(response.url()).pathname === SEQUENCES &&
  response.request().method() === "POST" &&
  response.request().postDataJSON()?.action === action;

export async function qualifyCompiledTenantOffer({
  page,
  rehearsal,
  combined,
  leaseId,
  href,
  open,
  read,
  post,
  record,
}) {
  const workspace = () => read(page, WORKSPACE + "?leaseId=" + leaseId);
  const beforeDecision = (await workspace()).state.tenantResponse ?? null;
  const token = process.env.S260_SYNTHETIC_WORKER_TOKEN;
  assert.match(token, /^[a-f0-9]{64}$/);
  const worker = (authorized = true) =>
    page.request.post(rehearsal.origin + WORKER, {
      maxRedirects: 0,
      headers: authorized ? { authorization: "Bearer " + token } : {},
    });
  assert.equal((await worker(false)).status(), 403);
  const tick = async () => {
    const reply = await worker();
    assert.equal(reply.status(), 200, "Run the real worker in the compiled fixture");
    return reply.json();
  };
  const setClock = (at) => {
    const path = rehearsal.files.mailClock;
    assert.match(path, /\/s260-mail-clock\.json$/);
    writeFileSync(path + ".new", JSON.stringify(at) + "\n", { mode: 0o600 });
    renameSync(path + ".new", path);
  };
  const sentMail = async () => {
    const state = await standInState(rehearsal);
    assert.equal(state.mail.refusedRecipients, 0);
    return state.mail.mailboxes.flatMap((box) =>
      box.messages.filter(({ labelIds }) => labelIds.includes("SENT")),
    );
  };
  const deskAction = async () => {
    await open(page, "/lease-renewal/live/desk");
    const row = page.locator('tr[data-batch-lease="' + leaseId + '"]');
    return {
      stage: await row.locator(".renewal-batch-stage").innerText(),
      next: await row.locator("[data-batch-next-step]").innerText(),
    };
  };
  assert.deepEqual(await sentMail(), [], "No synthetic mail was sent before N09-07");
  await setNextSend(rehearsal, "unconfirmed");
  const firstRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === SEQUENCES &&
      request.method() === "POST" &&
      request.postDataJSON()?.action === "send",
  );
  await combined.click();
  const request = await firstRequest;
  const command = request.postDataJSON();
  const id = command.id;
  const readback = () => read(page, SEQUENCES + "?id=" + id);
  const [initialResponse, duplicate, concurrentWorker] = await Promise.all([
    request.response(),
    post(page, SEQUENCES, { ...command, operationId: randomUUID() }),
    tick(),
  ]);
  assert.deepEqual(
    [initialResponse.status(), duplicate.status].sort(),
    [200, 409],
    JSON.stringify({ ui: await initialResponse.json(), duplicate: duplicate.body.error }),
  );
  assert.equal(concurrentWorker.failures, 0);
  const uncertain = await readback();
  assert.equal(uncertain.sequence.context.entityId, leaseId);
  assert.equal(uncertain.sequence.state, "needs_reconciliation");
  assert.equal(uncertain.sequence.confirmedCount, 0);
  assert.equal(uncertain.sequence.nextDueAtMs, null);
  assert.equal(uncertain.sequence.authorization.immediateTenantOffer, true);
  assert.equal(uncertain.sequence.authorization.schedule.sendLimit, 3);
  assert.equal(uncertain.attempts.length, 1);
  assert.equal(uncertain.attempts[0].state, "ambiguous");
  assert.equal(uncertain.attempts[0].id, uncertain.sequence.unresolvedOccurrenceId);
  const [first] = await sentMail();
  assert.ok(first);
  assert.equal((await sentMail()).length, 1);
  assert.equal(
    (await tick()).sent,
    0,
    "No recurrence while initial acceptance is uncertain",
  );
  const unconfirmedDesk = await deskAction();
  assert.match(unconfirmedDesk.next, /check whether the message went out/i);
  const label = "Check whether the message went out";
  const guided = page.getByRole("region", { name: "Now", exact: true });
  const full = page.locator('section[data-renewal-outcome="offer-tenant"]');
  const offerViews = [
    ["?view=full#renewal-outcome-offer-tenant", full],
    ["?step=offer-tenant", guided],
  ];
  const checkOfferLayout = async (scope, checkpoint, query) => {
    await scope.locator("[data-renewal-work]").waitFor();
    await scope.locator("details[data-renewal-verification]").waitFor();
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    const layout = await scope.evaluate(inspectOutcome);
    const faults = outcomeFaults(layout);
    record({ id: "N09-07", checkpoint, query, layout, faults });
    assert.deepEqual(faults, [], checkpoint + " " + query);
  };
  for (const [query, scope] of offerViews) {
    await open(page, href(leaseId, query));
    await scope.getByRole("button", { name: label, exact: true }).waitFor();
    await checkOfferLayout(scope, "unconfirmed", query);
  }
  record({
    id: "N09-07",
    checkpoint: "real-unconfirmed-in-both-views",
    attempt: uncertain.attempts[0].id,
  });

  const acceptedResponse = page.waitForResponse((response) =>
    postFor(response, "reconcile"),
  );
  await guided.getByRole("button", { name: label, exact: true }).click();
  assert.equal((await acceptedResponse).status(), 200);
  const accepted = await readback();
  const authorization = accepted.sequence.authorization;
  const due = accepted.sequence.nextDueAtMs;
  assert.equal(accepted.sequence.state, "active");
  assert.equal(accepted.sequence.confirmedCount, 1);
  assert.equal(accepted.attempts.length, 1);
  assert.equal(accepted.attempts[0].state, "sent");
  assert.equal(accepted.attempts[0].gmailMessageId, first.id);
  assert.equal(accepted.attempts[0].rfcMessageId, first.rfcMessageId);
  assert.equal(accepted.sequence.threads[0].threadId, first.threadId);
  assert.ok(due > accepted.sequence.lastSentAtMs);
  assert.equal(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: authorization.schedule.timeZone,
    }).format(due),
    authorization.schedule.firstDate,
  );
  assert.equal(first.from.toLowerCase(), authorization.senderEmail);
  assert.equal(first.subject, authorization.initial.subject);
  assert.equal(cleanText(first.text), cleanText(authorization.initial.plainText));
  assert.equal((await post(page, SEQUENCES, command)).status, 409);
  assert.equal((await sentMail()).length, 1);
  const waitingDesk = await deskAction();
  assert.match(waitingDesk.stage + " " + waitingDesk.next, /waiting.*tenant/i);
  for (const [query, scope] of offerViews) {
    await open(page, href(leaseId, query));
    const waiting = scope
      .locator('[data-renewal-field="waiting"]:visible')
      .filter({ hasText: /^Waiting on the tenant since / });
    await waiting.waitFor();
    assert.equal(await waiting.count(), 1);
    await checkOfferLayout(scope, "waiting", query);
  }

  const refresh = async () => {
    const response = await post(page, SEQUENCES, { action: "refresh", id });
    assert.equal(response.status, 200);
    return response.body.sequence;
  };
  let resumedRevision;
  try {
    setClock(due);
    await setMailThreadUnreadable(rehearsal, first.threadId);
    const unavailable = await refresh();
    assert.equal(unavailable.observation.state, "unavailable");
    assert.equal(unavailable.observation.reason, "read_failed");
    assert.equal((await tick()).sent, 0);
    assert.equal((await sentMail()).length, 1);
    await setMailThreadUnreadable(rehearsal, null);

    const auto = await deliverOwnerReply(rehearsal, {
      threadId: first.threadId,
      automatic: true,
      text: "Synthetic out-of-office reply.",
    });
    const afterAuto = await refresh();
    assert.equal(afterAuto.state, "active");
    assert.equal(
      afterAuto.inbound.find((entry) => entry.messageId === auto.messageId)?.kind,
      "auto_reply",
    );
    const reply = await deliverOwnerReply(rehearsal, {
      threadId: first.threadId,
      text: "Please review this synthetic response before I decide.",
    });
    assert.ok(authorization.to.includes(reply.from));
    const paused = await refresh();
    assert.equal(paused.state, "paused");
    assert.equal(paused.pause.cause, "reply");
    assert.equal(paused.nextDueAtMs, null);
    assert.equal(
      paused.inbound.find((entry) => entry.messageId === reply.messageId)?.kind,
      "human",
    );
    assert.equal((await workspace()).state.tenantResponse ?? null, beforeDecision);
    assert.equal((await tick()).sent, 0);
    assert.equal((await sentMail()).length, 1);
    for (const [query, scope] of offerViews) {
      await open(page, href(leaseId, query));
      const decision = scope.getByRole("button", {
        name: "Record the tenant's decision",
        exact: true,
      });
      await decision.waitFor();
      assert.equal(await decision.count(), 1);
      await checkOfferLayout(scope, "reply-decision", query);
    }

    const resume = (latest) =>
      post(page, SEQUENCES, {
        action: "resume",
        id,
        expectedVersion: latest.sequence.version,
        operationId: randomUUID(),
        reviewedDraftHash: latest.reviewedDraftHash,
        reviewedTargetHash: command.reviewedTargetHash,
        schedule: null,
      });
    const reviewedAgain = await resume(await readback());
    assert.equal(reviewedAgain.status, 200, JSON.stringify(reviewedAgain.body));
    assert.equal(reviewedAgain.body.sequence.state, "active");
    resumedRevision = reviewedAgain.body.sequence.authorization.revision;
    assert.equal(resumedRevision, authorization.revision + 1);
    assert.equal((await tick()).sent, 1);
    const recurring = await readback();
    assert.equal(recurring.sequence.confirmedCount, 2);
    assert.equal(recurring.attempts.length, 2);
    const messages = await sentMail();
    assert.equal(messages.length, 2);
    const followUp = messages.find(({ id }) => id !== first.id);
    assert.equal(followUp.from.toLowerCase(), authorization.senderEmail);
    assert.equal(followUp.subject, authorization.followUp.subject);
    assert.equal(cleanText(followUp.text), cleanText(authorization.followUp.plainText));
    assert.doesNotMatch(
      first.text + followUp.text,
      /Prior Editor footer|November Fixture Approver/,
    );
    assert.ok(
      recurring.attempts.some(
        (item) => item.gmailMessageId === followUp.id && item.state === "sent",
      ),
    );

    const bounced = await bounceSentMessage(rehearsal, { threadId: followUp.threadId });
    const afterBounce = await refresh();
    assert.equal(afterBounce.state, "paused");
    assert.equal(afterBounce.pause.cause, "bounce");
    assert.equal(
      afterBounce.inbound.find((entry) => entry.messageId === bounced.messageId)?.kind,
      "bounce",
    );
    setClock(Date.parse(authorization.schedule.endDate + "T12:00:00Z") + 2 * DAY);
    const expired = await resume(await readback());
    assert.equal(expired.status, 409);
    assert.match(expired.body.error, /inclusive end date has passed/i);
    assert.equal((await tick()).sent, 0);
    assert.equal((await sentMail()).length, 2);
  } finally {
    setClock(null);
    await setMailThreadUnreadable(rehearsal, null);
  }

  await open(page, href(leaseId, "?view=full#renewal-manual-tenant_response"));
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  const tenantDecision = page
    .locator("#renewal-manual-tenant_response")
    .getByLabel("Tenant response", { exact: true });
  await tenantDecision.waitFor();
  const decisionSaved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKSPACE &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action?.kind === "tenant_response",
  );
  await tenantDecision.selectOption("accepted");
  // S276 R-S276-1 (pin changed by S276): the response is recorded by its one visible Save.
  await page
    .locator("#renewal-manual-tenant_response")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  const recorded = await decisionSaved;
  const decisionInput = recorded.request().postDataJSON();
  assert.equal(decisionInput.leaseId, leaseId);
  assert.equal(decisionInput.action.outcome, "accepted");
  const saved = await recorded.json();
  assert.equal(recorded.status(), 200, JSON.stringify(saved));
  assert.equal(saved.state.tenantResponse.eventId, decisionInput.operationId);
  assert.equal(saved.state.tenantResponse.outcome, "accepted");
  const readbackDecision = (await workspace()).state.tenantResponse;
  assert.deepEqual(readbackDecision, saved.state.tenantResponse);
  return {
    initialSends: 1,
    followUpSends: 1,
    exactReceipts: 2,
    concurrentConfirmAndWorker: true,
    ambiguousHeldAndReconciled: true,
    twoViewReconciliation: true,
    twoViewWaiting: true,
    twoViewReplyDecision: true,
    unconfirmedDesk,
    waitingDesk,
    verifiedHumanReplyPaused: true,
    automaticReplyPreservedSchedule: true,
    unavailableReadHeld: true,
    bouncePaused: true,
    freshResumeRevision: resumedRevision,
    expiredResumeRefused: true,
    separatelyRecordedTenantDecision: true,
    exactResponsibleSenderBytes: true,
  };
}
