// S243 R-S243-6: synthetic fixtures for the help rehearsal. Every person, lease, property, amount
// and record here is visibly made up (Example names, local demo accounts, reserved example
// addresses), and every write goes to the Firestore emulator named by FIRESTORE_EMULATOR_HOST.
// Nothing here can reach a provider or a production store. The capture script runs under the
// TypeScript loader, so the app's own record builders and services shape these documents: the
// process is published, its run started, the operational page approved and published and the
// queue item created through the same functions the app's routes call, and each result is read
// back through the app's own readers before the rehearsal starts.
import assert from "node:assert/strict";
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

export async function seedHelpRehearsal() {
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST ?? "",
    /^127\.0\.0\.1:\d+$/,
    "Help rehearsal fixtures write only to the local Firestore emulator.",
  );
  const db = getFirestore(initializeApp({ projectId: PROJECT_ID }, "help-rehearsal"));
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
  return seeded;
}
