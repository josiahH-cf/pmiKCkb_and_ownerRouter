// S243 R-S243-6: synthetic fixtures for the help rehearsal. Every person, lease, property, amount
// and record here is visibly made up (Example names, local demo accounts, reserved example
// addresses), and every write goes to the Firestore emulator named by FIRESTORE_EMULATOR_HOST.
// Nothing here can reach a provider or a production store. The capture script runs under the
// TypeScript loader, so the app's own record builders and services shape these documents: the
// process is published, its run started, the operational page approved and published and the
// queue item created through the same functions the app's routes call, and each result is read
// back through the app's own readers before the rehearsal starts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { demoRecords } from "../demo-firestore.mjs";

const PROJECT_ID = "pmi-kc-kb-help-rehearsal-test";
// The scene manifest's route parameters name the run, Space, process and page every help route
// resolves to, so the fixtures seed exactly those records.
const ROUTES = JSON.parse(
  readFileSync(new URL("../../lib/help/content/scenes.json", import.meta.url), "utf8"),
).routeParameters;
// Production's published process cites three source links; publication requires at least one.
const SOURCE_LINKS = [
  {
    label: "Example renewal outreach procedure",
    url: "https://example.invalid/help-rehearsal/renewal-outreach-procedure",
  },
  {
    label: "Example owner message wording",
    url: "https://example.invalid/help-rehearsal/owner-message-wording",
  },
  {
    label: "Example market evidence notes",
    url: "https://example.invalid/help-rehearsal/market-evidence-notes",
  },
];
// The local-demo publication scanner (lib/publication/scanners.ts). It is fenced to local-demo
// auth, a non-production NODE_ENV and a loopback Firestore emulator.
const LOCAL_DEMO_SCANNER_KEY = "fake-clean-v1";

// The local demo principals exactly as localDemoUser (lib/auth/session.ts) builds them for the
// default hosted domain. That helper reads the server's environment descriptor, which this seeding
// process does not carry.
function demoActor(role, hostedDomain) {
  const uid = `local-demo-${role.toLowerCase()}`;
  return {
    uid,
    email: role === "Admin" ? `local-demo@${hostedDomain}` : `${uid}@${hostedDomain}`,
    hd: hostedDomain,
    role,
  };
}

// The one emulator-only Firestore handle every fixture write goes through.
let helpApp = null;
function helpFirestore() {
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST ?? "",
    /^127\.0\.0\.1:\d+$/,
    "Help rehearsal fixtures write only to the local Firestore emulator.",
  );
  helpApp ??= initializeApp({ projectId: PROJECT_ID }, "help-rehearsal");
  return getFirestore(helpApp);
}

export async function seedHelpRehearsal() {
  const db = helpFirestore();
  const now = new Date().toISOString();
  const put = (collection, id, data) => db.collection(collection).doc(id).set(data);
  const { ALLOWED_HD_DEFAULT } = await import("../../lib/constants.ts");
  const admin = demoActor("Admin", ALLOWED_HD_DEFAULT);
  const editor = demoActor("Editor", ALLOWED_HD_DEFAULT);
  const approver = demoActor("Approver", ALLOWED_HD_DEFAULT);

  // The safe demo Approval Queue items (two ready for approval, one blocked, one snoozed), all
  // assigned to the local demo Admin.
  for (const record of demoRecords.filter((entry) =>
    ["approval_queue_items", "approval_queue_activity"].includes(entry.collection),
  )) {
    await put(record.collection, record.id, {
      id: record.id,
      ...record.data,
      created_at: now,
      ...(record.includeUpdatedAt === false ? {} : { updated_at: now }),
    });
  }

  // 1. The Owner Renewal Outreach process definition as the app's own seed builds it (a Draft at
  // its fixed id, owned by the local demo Admin, with synthetic source links), then published as
  // Active version 1 the way production holds it: an Admin creates the exact-process Low
  // publication policy for the reviewed bytes and revision, and the definition is published
  // through the app's publication service, which writes the immutable version, content chunks,
  // publication record and the definition's version pin. Production has no run of it; the one
  // run below exists only so the run page renders.
  const {
    buildOwnerRenewalOutreachDefinitionRecord,
    OWNER_RENEWAL_OUTREACH_DEFINITION_ID,
  } =
    await import("../../lib/lease-renewal/owner-renewal-outreach/process-definition-seed.ts");
  assert.equal(ROUTES.definitionId, OWNER_RENEWAL_OUTREACH_DEFINITION_ID);
  const record = buildOwnerRenewalOutreachDefinitionRecord({
    ownerUid: admin.uid,
    approverUid: admin.uid,
    sourceLinks: SOURCE_LINKS,
  });
  await put("process_definitions", record.id, {
    ...record,
    created_at: now,
    updated_at: now,
  });
  const { getProcessDefinition, startWorkflowRun } =
    await import("../../lib/firestore/workflows.ts");
  const { spaceIdForProcessDefinition } =
    await import("../../lib/space-scope-resources.ts");
  const draft = await getProcessDefinition(admin, record.id, db);
  const spaceId = spaceIdForProcessDefinition(draft);
  assert.equal(spaceId, ROUTES.spaceId);
  const { createPublicationPolicy } = await import("../../lib/publication/policy.ts");
  const { processDefinitionPublicationContent } =
    await import("../../lib/publication/process-definition-content.ts");
  const policy = await createPublicationPolicy(
    admin,
    {
      allowedSpaces: [spaceId],
      connectorId: "help-rehearsal-synthetic",
      rootId: "help-rehearsal-processes",
      reason: "Synthetic help rehearsal: exact-process Low policy for this definition.",
      scannerKey: LOCAL_DEMO_SCANNER_KEY,
      resourceScope: {
        resourceType: "process_definition",
        resourceId: `process-definition:${draft.id}`,
        contentHash: processDefinitionPublicationContent(draft).contentHash,
        reviewedNoClientData: true,
      },
      expectedDefinitionRevision: draft.revision,
      sensitivityCeiling: "Low",
    },
    db,
  );
  const { resolvePublicationScanner } = await import("../../lib/publication/provider.ts");
  const { publishProcessDefinition } =
    await import("../../lib/publication/process-definition.ts");
  const { definition: active } = await publishProcessDefinition(
    admin,
    draft.id,
    {
      expected_revision: draft.revision,
      note: "Synthetic help rehearsal publication.",
      policy_id: policy.id,
    },
    {
      db,
      scanner: resolvePublicationScanner(policy.scannerKey, {
        firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
        localDemoAuth: true,
        nodeEnv: process.env.NODE_ENV,
        policy,
      }),
    },
  );
  const { readProcessDefinitionPublication } =
    await import("../../lib/publication/process-definition-readback.ts");
  const publication = await readProcessDefinitionPublication(admin, active, db);
  assert.equal(active.status, "Active");
  assert.equal(publication.state, "verified", "The published version did not read back.");
  assert.equal(publication.versionNumber, 1);

  // 2. One checklist run of the published version, started by the local demo Editor through the
  // app's run start under the trusted run id the help routes name. Its checklist stays untouched.
  const run = await startWorkflowRun(
    editor,
    active.id,
    {
      expected_revision: active.revision,
      note: "Started for the help rehearsal with synthetic data only.",
    },
    db,
    { runId: ROUTES.runId },
  );
  const { listStepChecksForRun } =
    await import("../../lib/firestore/workflow-run-step-checks.ts");
  assert.equal(run.status, "In Progress");
  assert.equal(run.definition_version_id, active.active_version_id);
  assert.deepEqual(await listStepChecksForRun(editor, run.id, db), []);

  // 3. A read-only operational page on the Space, drafted, approved and published by the local
  // demo Admin through the operational page store with the exact confirmations its route
  // requires. Its text is generic.
  const {
    approveOperationalPageVersion,
    createOperationalPageDraft,
    publishOperationalPageVersion,
    readPublishedOperationalPage,
  } = await import("../../lib/firestore/operational-pages.ts");
  const {
    OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
    OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
    OperationalPageActionSchema,
  } = await import("../../lib/operational-pages/schema.ts");
  const pageDraft = await createOperationalPageDraft(
    admin,
    OperationalPageActionSchema.parse({
      operation: "draft",
      reason: "Synthetic help rehearsal page.",
      definition: {
        pageType: "operational_process",
        spaceId,
        slug: ROUTES.slug,
        title: "Owner outreach overview",
        components: [
          { type: "heading", level: "2", text: "About this page" },
          {
            type: "text",
            text: "An example read-only page for the help rehearsal. Its text is generic and names no real lease, person or property.",
          },
          {
            type: "callout",
            tone: "info",
            title: "Read-only",
            text: "This page sends nothing and changes no record. The work itself happens on the Space and on each lease workspace.",
          },
          {
            type: "checklist",
            title: "Example outreach checklist",
            items: [
              "Gather the lease facts",
              "Review the market evidence",
              "Prepare the owner message",
              "Record the owner outcome",
            ],
          },
          {
            type: "internal_link",
            label: "Open the Owner Renewal Outreach Space",
            href: `/spaces/${spaceId}`,
          },
        ],
      },
    }),
    db,
    now,
  );
  const exactVersion = { versionId: pageDraft.id, previewHash: pageDraft.previewHash };
  await approveOperationalPageVersion(
    admin,
    OperationalPageActionSchema.parse({
      operation: "approve",
      ...exactVersion,
      confirmation: OPERATIONAL_PAGE_APPROVAL_CONFIRMATION,
    }),
    db,
    now,
  );
  await publishOperationalPageVersion(
    admin,
    OperationalPageActionSchema.parse({
      operation: "publish",
      ...exactVersion,
      confirmation: OPERATIONAL_PAGE_PUBLICATION_CONFIRMATION,
    }),
    db,
    now,
  );
  const page = await readPublishedOperationalPage(editor, spaceId, ROUTES.slug, db);
  assert.equal(
    page?.id,
    pageDraft.id,
    "The operational page did not read back published.",
  );

  // 4. One Approval Queue item the local demo Approver may approve now. The queue shows an item
  // to its assignee, its required approver and every Admin; an Approver may approve it only as
  // its required approver, never as its assignee, while it is Ready for Approval with no linked
  // execution. The local demo Admin requests it through the app's queue service, which derives
  // its status and risk (Medium, an internal workflow update) and notifies its assignee and
  // required approver. Like the other demo items it is assigned to the Admin, so the Editor's
  // queue and unread notifications (and with them the Notifications button's name) stay as before.
  const { createApprovalQueueItem, listApprovalQueue } =
    await import("../../lib/firestore/approval-queue.ts");
  const { queueActionAvailability } = await import("../../lib/approval/queue.ts");
  const item = await createApprovalQueueItem(
    admin,
    {
      action_needed: "Approve the example owner outreach checklist note.",
      affected_system_action: "Internal checklist note",
      assignee_uid: admin.uid,
      audience_group: "Team follow-up",
      direct_link: `/workflow-runs/${run.id}`,
      due_date: new Date(Date.parse(now) + 7 * 86_400_000).toISOString().slice(0, 10),
      item_type: "ApprovalPackage",
      note: "Synthetic help rehearsal item. Approving it changes only this app decision.",
      process_run_ref: {
        id: run.id,
        label: "Example - Owner Renewal Outreach checklist",
      },
      required_approver_uid: approver.uid,
      risk_signals: { internal_workflow_update: true },
      source_trigger_key: `help-rehearsal:${run.id}:outreach-note`,
    },
    db,
  );
  const ready = (await listApprovalQueue(approver, {}, db)).find(
    (entry) => entry.id === item.id,
  );
  assert.ok(
    ready && queueActionAvailability(approver, ready).approve,
    "The local demo Approver cannot approve the seeded queue item.",
  );

  // What the emulator now holds, by collection, for the capture log.
  const seeded = {};
  for (const collection of await db.listCollections())
    seeded[collection.id] = (await collection.get()).size;
  return { collections: seeded, processVersionId: publication.versionId };
}

// S252 R-S252-6 / L61: the help pictures of the kickoff show a prepared lease, as staff meet one on
// the November 5 mix. Lease 5001 (Sample Pl, a verified example.invalid owner address) is prepared
// ahead as the one-path rehearsal prepares its prepared lease
// (scripts/lib/one-path-rehearsal/seeds.mjs, preparedKickoff). The served app's own routes do
// what they can: an Approver publishes the owner and tenant templates, and the Editor's synthetic
// signature is saved on the owner message, which keeps it for that sender and establishes the
// lease's work record (its cycle). The synthetic lease has no full street address, so no
// comparison lookup can run for it; its stored comparison for that cycle is written to the
// emulator in the exact shape the comparison route's capture writes
// (lib/firestore/renewal-market-observations.ts, captureMarketObservation), with the market basis
// built by the app's own marketBasisFromCapturedResult. The numbers mirror the one-path
// comparison stand-in (scripts/lib/one-path-rehearsal/stand-ins.mjs) around the lease's own rent.
// The message is then saved once more on that basis, as staff save after a comparison. Nothing is
// sent, no draft is made and no provider is reached.
export const HELP_PREPARED_LEASE = "5001";
// Lease 5001's synthetic unit (tests/browser/renewal-novdec-journey-network.mjs).
const HELP_PREPARED_UNIT = Object.freeze({ rent: 1400, bedrooms: 3, bathrooms: 2 });

const HELP_SEEDED_SIGNATURE = Object.freeze({
  name: "Example Staff",
  role: "PMI KC Metro (help rehearsal)",
  phone: null,
  hours: null,
  website: null,
  source: "Staff entry on the message",
});

// Page code is a plain string: this module runs under the TypeScript loader, whose name helpers do
// not exist inside the browser.
function routeFrom(page, path, body) {
  const init =
    body === undefined
      ? "{}"
      : `{method:"POST",headers:{"content-type":"application/json"},body:${JSON.stringify(JSON.stringify(body))}}`;
  return page.evaluate(
    `fetch(${JSON.stringify(path)},${init}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))`,
  );
}

const refusal = (answer) =>
  `HTTP ${answer.status}${answer.body?.error ? `: ${String(answer.body.error).slice(0, 200)}` : ""}`;

export async function seedHelpPreparedLease({
  page,
  signIn,
  leaseId = HELP_PREPARED_LEASE,
}) {
  const notes = [];
  await signIn("Approver");
  for (const channel of ["owner", "tenant"]) {
    const published = await routeFrom(page, "/api/lease-renewal/message-preparation", {
      kind: "publish",
      channel,
    });
    assert.equal(
      published.status,
      200,
      `The ${channel} template was not published: ${refusal(published)}`,
    );
    notes.push(`${channel} template ${published.body?.status ?? "published"}`);
  }
  await signIn("Editor");
  const first = await saveOwnerMessage(page, leaseId);
  const cycleId = first.cycleId;
  assert.match(
    cycleId ?? "",
    /^[0-9a-f-]{36}$/,
    `Saving the owner message established no work record for lease ${leaseId}.`,
  );
  notes.push("the Editor's signature saved on the owner message");

  const { ALLOWED_HD_DEFAULT } = await import("../../lib/constants.ts");
  const { RENEWAL_WORKSPACE_COLLECTIONS } =
    await import("../../lib/firestore/renewal-workspace.ts");
  const { marketBasisFromCapturedResult } =
    await import("../../lib/lease-renewal/market-observation.ts");
  const result = helpComparisonResult(new Date());
  const market = marketBasisFromCapturedResult(result);
  assert.ok(
    market.provider?.comps?.length === result.comparables.length,
    "The synthetic comparison is not a usable provider basis.",
  );
  const db = helpFirestore();
  const observation = db
    .collection(RENEWAL_WORKSPACE_COLLECTIONS.observations)
    .doc(randomUUID());
  await observation.create({
    lease_id: leaseId,
    cycle_id: cycleId,
    actor_uid: demoActor("Editor", ALLOWED_HD_DEFAULT).uid,
    recorded_at: result.retrievedAt,
    operation: "comps",
    result,
    market,
  });
  notes.push(
    `a stored comparison for cycle ${cycleId} ($${market.provider.rangeLow} to $${market.provider.rangeHigh}, ${market.provider.compCount} comparables)`,
  );

  const second = await saveOwnerMessage(page, leaseId);
  assert.equal(
    second.cycleId,
    cycleId,
    `The owner message moved to another cycle after the comparison was stored.`,
  );
  assert.ok(
    second.facts?.comps?.length === result.comparables.length && second.facts?.range,
    `The owner message does not read the stored comparison for lease ${leaseId}.`,
  );
  assert.equal(
    second.publication?.status,
    "approved",
    "The owner template is not approved for the prepared lease.",
  );
  notes.push(`the owner message saved at revision ${second.saved?.revision ?? "?"}`);
  return { leaseId, cycleId, detail: `${notes.join("; ")}.` };
}

/** Read the lease's owner message and save it with the Editor's synthetic signature. */
async function saveOwnerMessage(page, leaseId) {
  const message = await routeFrom(
    page,
    `/api/lease-renewal/message-preparation?leaseId=${leaseId}&channel=owner`,
  );
  assert.equal(
    message.status,
    200,
    `The owner message was not read: ${refusal(message)}`,
  );
  const saved = await routeFrom(page, "/api/lease-renewal/message-preparation", {
    kind: "save",
    leaseId,
    channel: "owner",
    ...(message.body.cycleId ? { cycleId: message.body.cycleId } : {}),
    expectedRevision: message.body.saved?.revision ?? 0,
    operationId: randomUUID(),
    inputs: { ...message.body.inputs, signature: { ...HELP_SEEDED_SIGNATURE } },
    bodyOverride: null,
    subjectOverride: null,
  });
  assert.equal(saved.status, 200, `The owner message was not saved: ${refusal(saved)}`);
  return saved.body;
}

/**
 * A synthetic RentCast comparison in the normalized shape the comparison route stores: five
 * Example comparables around lease 5001's own rent, retrieved now. It names no real address.
 */
function helpComparisonResult(now) {
  const { rent, bedrooms, bathrooms } = HELP_PREPARED_UNIT;
  const isoDaysAgo = (days) =>
    new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const comparables = [-25, 25, 50, 75, 100].map((delta, index) => ({
    rent: rent + delta,
    correlation: Number((0.98 - index * 0.02).toFixed(2)),
    distanceMiles: Number((0.3 + index * 0.4).toFixed(1)),
    propertyType: "Single Family",
    bedrooms,
    bathrooms,
    squareFootage: 1000 + (index - 2) * 50,
    listedDate: isoDaysAgo(20 + index * 5),
    lastSeenDate: isoDaysAgo(2 + index),
    daysOld: 2 + index,
    daysOnMarket: 18 + index * 5,
  }));
  return {
    source: "RentCast",
    confidence: "Likely",
    rangeLow: rent - 50,
    rangeHigh: rent + 150,
    pointEstimate: rent + 50,
    compCount: comparables.length,
    comparables,
    subjectProperty: {
      propertyType: "Single Family",
      bedrooms,
      bathrooms,
      squareFootage: 1000,
    },
    retrievedAt: now.toISOString(),
    cached: false,
  };
}
