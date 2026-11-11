// S271 N10-09 (S266/S267 assistance contact and internal review) and N10-10 (S268 first packet)
// on the guarded rehearsal. Provider effects are counted from the boundary's refusal logs and the
// app's own attempt records, never assumed.
import assert from "node:assert/strict";
import { refusedConnections } from "../../scripts/lib/one-path-rehearsal/control.mjs";
import { openRehearsalDatabase } from "../../scripts/lib/one-path-rehearsal/emulator-database.mjs";
import { seedOnePathForms } from "./one-path-forms-seed.mjs";
import { leaseReads } from "./one-path-november-10-core-journeys.mjs";
import { centralDate, uuid } from "./one-path-november-10-kit.mjs";
import { recordTenantAcceptance } from "./one-path-november-10-offer-journeys.mjs";

const WORKING = "/api/lease-renewal/working-record";
const WORKSPACE = "/api/lease-renewal/workspace";
const STATUS = "/api/lease-renewal/work-status";
const RETURNED = "/api/lease-renewal/returned-state";

const recipients = (composition) => ({
  to: [...(composition.target?.to ?? [])].sort(),
  cc: [...(composition.target?.cc ?? [])].sort(),
});

// ---- N10-09 ------------------------------------------------------------------------------------

export async function journeyN1009(ctx, page, mutations) {
  const { kit, rehearsal, record } = ctx;
  const assisted = String(ctx.leases.assisted.leaseId);
  const voucher = String(ctx.voucherLeaseId);
  const ordinary = String(ctx.leases.prepared.leaseId);
  const reads = leaseReads(kit, page, assisted);
  const observed = {};
  await kit.signIn(page, "Admin");
  const roster = async () =>
    (await kit.read(page, "/api/admin/users")).users
      .map(({ email, role, scopes, disabled }) => ({ email, role, scopes, disabled }))
      .sort((left, right) => String(left.email).localeCompare(String(right.email)));
  const roster0 = await roster();
  const recipients0 = {
    owner: recipients(await reads.composition("renewal_owner")),
    tenant: recipients(await reads.composition("renewal_tenant")),
  };
  await kit.signIn(page, "Editor");

  // RentVine wording alone never sets the fact; the ordinary lease stays Not set.
  await kit.open(page, kit.href(voucher, "?step=check-numbers"));
  const suggested = page.locator("#renewal-now-housing-assistance");
  await suggested.waitFor();
  assert.equal(
    await suggested.getAttribute("data-renewal-housing-assistance"),
    "not_set",
  );
  await page
    .getByText("RentVine mentions housing assistance. Set the field?", { exact: true })
    .first()
    .waitFor();
  assert.equal(await suggested.getByRole("radio", { checked: true }).count(), 0);
  const voucherRecord = (await kit.read(page, WORKING + "?leaseId=" + voucher)).record;
  assert.equal(voucherRecord?.fields?.housing_assistance, undefined);

  // No approved RentVine program read exists: the source stays pending and the contact is manual.
  await kit.open(page, kit.href(assisted, "?step=assisted-program-contact"));
  const hint = page
    .locator('[data-renewal-field="housing-assistance-source-hint"]')
    .first();
  await hint.waitFor();
  assert.match(
    await hint.innerText(),
    /^RentVine program source: Source pending\. No approved RentVine program read is available\./,
  );
  const serverReads = refusedConnections(rehearsal).filter((entry) =>
    /vendor|program/i.test(entry.path ?? ""),
  );
  assert.deepEqual(serverReads, []);
  observed.absentOrDuplicateVendorPending = true;
  observed.duplicateVendor =
    "No RentVine vendor or program read exists on this build, so an absent and a duplicate vendor both stay Source pending (tests/unit/s266-housing-assistance-source.test.ts covers the duplicate projection).";

  // The trainee (Editor) records the verified program contact through the one field.
  const contact = "SYNTHETIC Example Program Office, program.office@example.invalid";
  await page
    .getByRole("button", { name: /^(Enter|Edit) the program contact$/ })
    .first()
    .click();
  const field = page.getByLabel("Program contact (optional)", { exact: true }).first();
  await field.waitFor();
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKING &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.field === "housing_assistance",
  );
  await field.fill(contact);
  await field.press("Tab");
  assert.equal((await saved).status(), 200);
  const fact = (await kit.read(page, WORKING + "?leaseId=" + assisted)).record.fields
    .housing_assistance;
  assert.equal(fact.value.status, "yes");
  assert.equal(fact.value.contact, contact);
  assert.equal(fact.origin, "staff_entry");
  assert.equal(fact.recordedByUid, "local-demo-editor");
  await kit.open(page, kit.href(assisted, "?step=assisted-program-contact"));
  assert.match(
    await page
      .locator('[data-renewal-field="assisted-program-contact"]')
      .first()
      .innerText(),
    new RegExp("Program contact: " + contact.replace(/[.]/g, "\\.")),
  );
  assert.ok(
    (await page.getByLabel("Program contact (optional)", { exact: true }).count()) <= 1,
  );
  observed.verifiedProgramContactRecorded = true;

  // The first record on a lease without a work record establishes it (S154: cycleId null).
  const workspace = (await reads.workspace()).state;
  const contacted = await kit.post(page, WORKSPACE, {
    operation: "record",
    leaseId: assisted,
    cycleId: workspace?.cycleId ?? null,
    expectedRevision: workspace?.revision ?? 0,
    operationId: uuid(),
    action: {
      kind: "activity",
      activity: "program_contact",
      outcome: "done",
      source: "SYNTHETIC call to the program office",
    },
  });
  assert.equal(contacted.status, 200, JSON.stringify(contacted.body));
  const note = "SYNTHETIC trainee note: program contact recorded for the lead";
  const noted = await kit.post(page, STATUS, {
    kind: "note",
    leaseId: assisted,
    noteId: uuid(),
    text: note,
    expectedRevision: 0,
    operationId: uuid(),
  });
  assert.equal(noted.status, 200, JSON.stringify(noted.body));
  const trainee = {
    working: (await kit.read(page, WORKING + "?leaseId=" + assisted)).record.fields
      .housing_assistance,
    activity: (await reads.workspace()).state.activities.program_contact,
    notes: (await kit.read(page, STATUS + "?leaseId=" + assisted)).notes.map(
      ({ text }) => text,
    ),
  };
  assert.equal(trainee.activity.outcome, "done");
  assert.equal(trainee.activity.actorUid, "local-demo-editor");
  assert.ok(trainee.notes.includes(note));
  observed.traineePrepared = true;

  // The lead (Approver) inspects the same progress internally and writes nothing.
  const before = mutations.length;
  await kit.signIn(page, "Approver");
  await kit.open(page, kit.href(assisted, "?step=assisted-program-contact"));
  await page
    .getByText(new RegExp("Program contact: " + contact.replace(/[.]/g, "\\.")))
    .first()
    .waitFor();
  const lead = {
    working: (await kit.read(page, WORKING + "?leaseId=" + assisted)).record.fields
      .housing_assistance,
    activity: (await reads.workspace()).state.activities.program_contact,
    notes: (await kit.read(page, STATUS + "?leaseId=" + assisted)).notes.map(
      ({ text }) => text,
    ),
  };
  assert.deepEqual(lead, trainee);
  assert.equal(mutations.length - before, 0, "The lead's inspection posts nothing");
  observed.leadInspectedInternally = true;

  // No automatic Cc, no granted access, no inferred program fact.
  for (const role of ["Approver", "Editor"]) {
    await kit.signIn(page, role);
    const owner = await reads.composition("renewal_owner");
    const tenant = await reads.composition("renewal_tenant");
    assert.deepEqual(
      { owner: recipients(owner), tenant: recipients(tenant) },
      recipients0,
    );
    assert.ok(!JSON.stringify([owner.target, tenant.target]).includes("program.office"));
    const users = await kit.readStatus(page, "/api/admin/users");
    assert.equal(users.status, 403);
  }
  observed.noAutomaticCc = true;
  await kit.signIn(page, "Admin");
  assert.deepEqual(await roster(), roster0);
  assert.ok(!mutations.some((path) => path.startsWith("/api/admin/")));
  observed.noGrantedAccess = true;
  await kit.signIn(page, "Editor");
  const after = (await kit.read(page, WORKING + "?leaseId=" + voucher)).record;
  assert.equal(after?.fields?.housing_assistance, undefined);
  const ordinaryRecord = (await kit.read(page, WORKING + "?leaseId=" + ordinary)).record;
  assert.equal(ordinaryRecord?.fields?.housing_assistance, undefined);
  observed.noInferredProgramFact = true;
  record({ id: "N10-09", check: "recipients", recipients0 });
  return observed;
}

// ---- N10-10 ------------------------------------------------------------------------------------

const DOTLOOP_HOSTS = /dotloop/i;

export async function journeyN1010(ctx, page) {
  const { kit, rehearsal, record } = ctx;
  const leaseId = String(ctx.leases.assisted.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const observed = {};
  const refusalsBefore = refusedConnections(rehearsal).length;

  // The Admin's two named setup reads and writes: the brokerage form use and a fee-only policy.
  await kit.signIn(page, "Admin");
  try {
    const use = await kit.read(page, "/api/admin/lease-artifact-family-use");
    const brokerage = (use.familyUse?.families ?? []).find?.(
      (entry) => entry.kind === "brokerage_disclosure",
    );
    if (brokerage?.use !== "mandatory") {
      const saved = await kit.post(page, "/api/admin/lease-artifact-family-use", {
        kind: "brokerage_disclosure",
        use: "mandatory",
        expectedVersion: use.familyUse?.version ?? 0,
        operationId: uuid(),
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
    }
    const policy = await kit.read(page, "/api/admin/lease-charge-policy");
    if (!policy.record) {
      const saved = await kit.post(page, "/api/admin/lease-charge-policy", {
        content: {
          residentBenefitPackage: null,
          insuranceProgram: null,
          animals: null,
          petProcessingFee: {
            amountCents: 5000,
            unit: null,
            source: "SYNTHETIC rehearsal fee",
          },
        },
        effectiveFrom: centralDate(0),
        expectedVersion: 0,
        operationId: uuid(),
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
    }
  } finally {
    await kit.signIn(page, "Editor");
  }

  // Applicable families and the source-pending lead with its form, evidence and role.
  await kit.open(page, kit.href(leaseId, "?view=full#renewal-section-documents"));
  const documents = page.locator('section[data-renewal-outcome="documents"]');
  await documents.waitFor();
  const group = page.locator(
    'details[data-renewal-group="Other packet and handoff work"]',
  );
  if (await group.count()) await kit.toggleDisclosure(page, group.first(), true);
  const families = page.locator("tr[data-family]");
  await families.first().waitFor();
  const applies = Object.fromEntries(
    await families.evaluateAll((rows) =>
      rows.map((row) => [
        row.getAttribute("data-family"),
        row.innerText.replace(/\s+/g, " "),
      ]),
    ),
  );
  record({ id: "N10-10", check: "families", applies });
  assert.match(applies.renewal_extension ?? "", /Applies to this lease/);
  assert.match(applies.standard_lease ?? "", /Does not apply to this lease/);
  assert.match(applies.owner_acknowledgment ?? "", /Prepared separately for the owner/);
  observed.applicableFamilies = true;
  const nextStep = page.locator("[data-packet-lead]").first();
  await nextStep.waitFor();
  const leadText = (await nextStep.innerText()).replace(/\s+/g, " ");
  assert.equal(await nextStep.getAttribute("data-packet-lead"), "source_pending");
  assert.match(leadText, /Source pending: .+\. Missing: .+ Responsible: .+\./);
  assert.match(leadText, /manual handoff stays available/);
  observed.pendingMapDecisions = true;
  const verifyForms = await page
    .locator("details[data-renewal-verification] > summary")
    .filter({ hasText: /^Verify forms and signing evidence$/ })
    .count();
  observed.failFirst = verifyForms > 0 ? ["Verify forms and signing evidence group"] : [];

  // Both exact Dotloop keys stay closed and refuse; the manual handoff stays available.
  const handoff = await kit.read(
    page,
    "/api/lease-renewal/document-handoff?leaseId=" + leaseId,
  );
  const operations = Object.values(handoff.operations ?? {});
  assert.deepEqual(operations.map((operation) => operation.actionKey).sort(), [
    "dotloop.document.upload",
    "dotloop.loop.create_from_template",
  ]);
  for (const operation of operations) {
    assert.equal(operation.dimensions?.authority?.state, "closed");
    assert.ok(
      (operation.blockers ?? []).some((blocker) =>
        new RegExp(
          "exact " +
            operation.actionKey.replace(/[.]/g, "\\.") +
            " action is not currently executable",
        ).test(
          typeof blocker === "string"
            ? blocker
            : (blocker.label ?? blocker.message ?? ""),
        ),
      ),
    );
  }
  const preview = page.getByRole("button", {
    name: "Preview exact Dotloop packet creation",
    exact: true,
  });
  if (await preview.count()) assert.equal(await preview.isEnabled(), false);
  observed.bothExactKeyRefusals = true;
  // The manual outcome is its own disclosure inside a named group: its exact link opens the group.
  await kit.open(page, kit.href(leaseId, "?view=full#renewal-manual-documents"));
  const manualForm = page.locator("details#renewal-manual-documents");
  await manualForm.waitFor({ state: "attached" });
  await kit.toggleDisclosure(page, manualForm, true);
  const manual = manualForm.getByLabel("Required documents prepared outcome", {
    exact: true,
  });
  await manual.waitFor();
  const recorded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === WORKSPACE &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action?.activity === "documents",
  );
  await manual.selectOption("waiting");
  assert.equal((await recorded).status(), 200);
  assert.equal((await reads.workspace()).state.activities.documents.outcome, "waiting");
  observed.manualHandoffAvailable = true;

  // Synthetic packet inputs into the reviewed regions only.
  const inputs = await kit.read(
    page,
    "/api/lease-renewal/packet-inputs?leaseId=" + leaseId,
  );
  const inputText = JSON.stringify(inputs);
  assert.match(inputText, /Example/);
  const current = await kit.read(
    page,
    "/api/lease-renewal/packet-truth?leaseId=" + leaseId + "&transactionId=" + leaseId,
  );
  const evaluated = await kit.post(page, "/api/lease-renewal/packet-truth", {
    action: "evaluate",
    leaseId,
    transactionId: leaseId,
    expectedCurrentSnapshotId: current.snapshot?.snapshotId ?? null,
  });
  assert.equal(evaluated.status, 200, JSON.stringify(evaluated.body));
  const snapshot = evaluated.body.snapshot;
  const reread = await kit.read(
    page,
    "/api/lease-renewal/packet-truth?leaseId=" + leaseId + "&transactionId=" + leaseId,
  );
  assert.deepEqual(reread.snapshot, snapshot);
  const artifacts = snapshot.manifest?.includedArtifacts ?? [];
  const extension = artifacts.find((artifact) =>
    /extension/i.test(String(artifact.kind ?? artifact.label)),
  );
  record({
    id: "N10-10",
    check: "snapshot",
    state: snapshot.state,
    artifacts: artifacts.map(({ kind, label, artifactId }) => ({
      kind,
      label,
      artifactId,
    })),
  });
  if (extension?.artifactId) {
    const preparedPdf = await kit.post(page, "/api/lease-renewal/filled-artifact", {
      leaseId,
      snapshotId: snapshot.snapshotId,
      artifactId: extension.artifactId,
      action: "prepare",
      operationId: uuid(),
      expectedCurrentId: null,
    });
    assert.equal(preparedPdf.status, 200, JSON.stringify(preparedPdf.body));
    const filled = preparedPdf.body.record;
    assert.match(filled.outputHash, /^[a-f0-9]{64}$/);
    const fields = Object.keys(filled.comparison?.allFields ?? {});
    assert.ok(fields.length > 0);
    assert.ok(
      fields.every((name) => /^(Property|TenantName-[1-6])$/.test(name)),
      fields.join(","),
    );
    observed.syntheticPdfInputs = true;
    observed.protectedFieldsPreserved = true;
  } else {
    observed.syntheticPdfInputs = false;
    observed.protectedFieldsPreserved = false;
  }

  // Signed evidence stays separate (S236, R-S268-3): the prepared bytes and the manual documents
  // outcome imply no signature, and a staff "Sent for signature" record changes only its own
  // returned-document record, never the signatures activity or the documents outcome.
  const readReturned = async () =>
    (await kit.read(page, RETURNED + "?leaseId=" + leaseId)).view;
  const returned = await readReturned();
  const shown = (view) =>
    view.documents.map(({ kind, state, revision, attestation }) => ({
      kind,
      state,
      revision,
      attestation,
    }));
  record({
    id: "N10-10",
    check: "returned",
    unavailable: returned.unavailable,
    overall: returned.overall,
    documents: shown(returned),
  });
  const signedStates = ["Partially signed", "Fully executed"];
  assert.equal(returned.signaturesComplete, false);
  assert.ok(returned.documents.every(({ state }) => !signedStates.includes(state)));
  const tracked =
    returned.documents.find(({ kind }) => kind === "renewal_extension") ??
    returned.documents[0];
  if (returned.unavailable || !tracked) {
    observed.signedEvidenceSeparate = false;
    observed.returnedUnavailable = returned.unavailable;
  } else {
    const sentBody = {
      leaseId,
      cycleId: returned.cycleId,
      snapshotId: returned.snapshotId,
      kind: tracked.kind,
      documentContentHash: tracked.contentHash,
      expectedRevision: tracked.revision,
      operationId: uuid(),
      change: {
        kind: "sent_for_signature",
        at: new Date().toISOString(),
        how: "SYNTHETIC rehearsal: handed over in person",
      },
    };
    const sent = await kit.post(page, RETURNED, sentBody);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const replay = await kit.post(page, RETURNED, sentBody);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.duplicate, true);
    const stale = await kit.post(page, RETURNED, { ...sentBody, operationId: uuid() });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    const after = await readReturned();
    const recorded = after.documents.find(({ kind }) => kind === tracked.kind);
    record({ id: "N10-10", check: "sent-for-signature", documents: shown(after) });
    assert.equal(recorded.revision, tracked.revision + 1);
    assert.ok(!signedStates.includes(recorded.state));
    assert.equal(after.signaturesComplete, false);
    const activities = (await reads.workspace()).state.activities;
    assert.equal(activities.signatures, undefined);
    assert.equal(activities.documents.outcome, "waiting");
    observed.signedEvidenceSeparate = true;
  }

  const effects = refusedConnections(rehearsal)
    .slice(refusalsBefore)
    .filter((entry) => DOTLOOP_HOSTS.test(entry.host ?? ""));
  observed.providerEffects =
    effects.length + (handoff.attempts?.length ?? 0) + (handoff.association ? 1 : 0);
  assert.equal(observed.providerEffects, 0);

  // R-S264-6 with S268 (AC-S264-6; the N10-04 and N10-10 cross-surface case): a form relying on a
  // shared charge that the accepted offer disagrees with holds, alone, in the first-packet review.
  const shared = await sharedChargeHold(ctx, page);
  observed.sharedChargeDiscrepancyHeld = shared.held;
  const missing = [
    shared.missing,
    observed.syntheticPdfInputs
      ? null
      : "The snapshot was not ready for a filled extension PDF.",
    observed.signedEvidenceSeparate
      ? null
      : `Returned documents were unavailable: ${observed.returnedUnavailable ?? "no tracked document"}.`,
  ].filter(Boolean);
  if (missing.length) observed.missing = missing.join(" ");
  return observed;
}

const PACKET_PARITY_HOLD =
  /Pet rent: the accepted offer has \$[\d,]+\.\d\d per month(?: and \$[\d,]+\.\d\d per month)* and this form's packet has (?:no such charge|\$[\d,]+\.\d\d per month(?: and \$[\d,]+\.\d\d per month)*)\. This form waits until they match/;

/**
 * Every packet family row of a lease's Documents and signatures, as staff read them on a fresh
 * page: the same address would only move to its fragment and keep the earlier render.
 */
async function packetFamilies(kit, page, leaseId) {
  await page.goto("about:blank");
  await kit.open(page, kit.href(leaseId, "?view=full#renewal-section-documents"));
  const group = page.locator(
    'details[data-renewal-group="Other packet and handoff work"]',
  );
  if (await group.count()) await kit.toggleDisclosure(page, group.first(), true);
  const rows = page.locator("tr[data-family]");
  await rows.first().waitFor();
  return Object.fromEntries(
    await rows.evaluateAll((list) =>
      list.map((row) => [
        row.getAttribute("data-family"),
        row.innerText.replace(/\s+/g, " "),
      ]),
    ),
  );
}

/**
 * The prepared lease's tenant accepts its confirmed offer (N10-05 sent it), recorded against that
 * exact send. The S253 seed's opt-in pet agreement then reviews one more field, each animal's
 * monthly charge, written through the seed's own writer as its L64 variant is: the pet agreement
 * now relies on Pet rent, which the accepted offer charges and the fee-only packet policy does not.
 * Only that form holds, naming the difference; with the original map nothing is compared. The
 * original map is restored and the lease goes back to awaiting the tenant.
 */
async function sharedChargeHold(ctx, page) {
  const { kit, rehearsal, record } = ctx;
  const leaseId = String(ctx.leases.prepared.leaseId);
  const reads = leaseReads(kit, page, leaseId);
  const sent = (await reads.tenant()).offerAnswers?.candidates?.find(
    (candidate) => candidate.kind === "linked_communication",
  );
  if (!sent)
    return {
      held: false,
      missing:
        "The prepared lease has no confirmed tenant offer to accept; N10-05 sends one in the full run.",
    };
  const db = openRehearsalDatabase(rehearsal);
  const { linkedAnswer } = await recordTenantAcceptance(kit, page, leaseId, sent);
  try {
    assert.equal(linkedAnswer?.attribution?.kind, "linked_communication");
    const before = await packetFamilies(kit, page, leaseId);
    let after;
    await seedOnePathForms(db, { sharedChargePetAgreement: true });
    try {
      after = await packetFamilies(kit, page, leaseId);
    } finally {
      await seedOnePathForms(db);
    }
    const restored = await packetFamilies(kit, page, leaseId);
    record({
      id: "N10-10",
      check: "shared-charge",
      answered: sent.sequenceId,
      before: before.animal_agreement,
      after: after.animal_agreement,
    });
    assert.doesNotMatch(before.animal_agreement ?? "", PACKET_PARITY_HOLD);
    assert.match(after.animal_agreement ?? "", PACKET_PARITY_HOLD);
    for (const [kind, text] of Object.entries(after))
      if (kind !== "animal_agreement")
        assert.doesNotMatch(text, /the accepted offer has/, kind + " is not held");
    assert.doesNotMatch(restored.animal_agreement ?? "", PACKET_PARITY_HOLD);
    return { held: true };
  } finally {
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
  }
}
