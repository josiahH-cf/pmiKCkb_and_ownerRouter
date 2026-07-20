import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DRAFT_BANNER = "Draft \u2014 Review before sending";
const defaultOwnerUid = "launch-process-owner";
// F-TMPL-2/F-TMPL-6: fixed review timestamp for the seeded Approved process copy (mirrors
// lib/launch/content.ts seedTimestamp). Bodies below are byte-identical to the code fallbacks
// (lib/gmail-inbox-zero/sample-hub.ts SAMPLE_REPLY_TEMPLATES + lib/move-in/welcome-draft.ts
// WELCOME_V1_BASE_COPY); a seed-consistency test asserts that identity so 1-character drift is caught.
const SEED_REVIEW_TIMESTAMP = "2026-05-29T00:00:00.000Z";

const skeletonDefinitions = [
  {
    id: "owner-renewal-outreach",
    name: "Owner Renewal Outreach + Comp Lookup",
    prompt:
      "Approved owner renewal outreach wording, comp lookup screenshots, and follow-up cadence still need source confirmation.",
    sourceHint:
      "Transcript context supports manual Zillow/PMI comp lookup and owner follow-up pain, but exact wording/cadence requires approved sources.",
    templateName: "Owner Renewal Outreach Placeholder",
  },
  {
    id: "tenant-renewal-notice",
    name: "Tenant Renewal Notice + DotLoop Follow-Up",
    prompt:
      "Approved tenant renewal notice, DotLoop handoff, and signature follow-up wording still need source confirmation.",
    sourceHint:
      "Transcript context supports RentVine tenant outreach, DotLoop document creation, and repeated signature follow-up pain.",
    templateName: "Tenant Renewal Notice Placeholder",
  },
  {
    id: "vendor-assignment-handoff",
    name: "Vendor Assignment Handoff",
    prompt:
      "Approved vendor-routing categories, Dan escalation rules, and vendor notification wording still need source confirmation.",
    sourceHint:
      "Transcript context supports Dan-owned vendor assignment and scattered vendor communication, but not autonomous vendor choice.",
    templateName: "Vendor Assignment Handoff Placeholder",
  },
  {
    id: "daily-inbox-triage",
    name: "Daily Inbox Triage",
    prompt:
      "Approved LeadSimple/Gmail triage ownership, daily assignment rules, and escalation timing still need source confirmation.",
    sourceHint:
      "Transcript context supports LeadSimple unassigned inbox review, Gmail overload, and team assignment friction.",
    templateName: "Daily Inbox Triage Placeholder",
  },
  {
    id: "fathom-training",
    name: "Fathom Training",
    prompt:
      "Approved Fathom recording intake, training index ownership, and meeting action-item follow-up rules still need source confirmation.",
    sourceHint:
      "Transcript context supports Fathom recording use and the need for assignment-tracked meeting follow-up.",
    templateName: "Fathom Training Placeholder",
  },
  {
    id: "escalation-rules",
    name: "Escalation Rules",
    prompt:
      "Approved escalation ownership by issue type, urgency, and backup owner still needs source confirmation.",
    sourceHint:
      "Transcript context supports Bailey as knowledge bottleneck and Dan as vendor/document decision bottleneck.",
    templateName: "Escalation Rules Placeholder",
  },
  {
    id: "move-in",
    name: "Move-In",
    prompt:
      "Approved move-in checklist ownership, tenant prerequisites, Z-inspection handoff, and closeout wording still need source confirmation.",
    sourceHint:
      "Transcript context supports processing fee, animal registration, utilities, Z-inspection, keys, welcome letter, and listing closeout tracking.",
    templateName: "Move-In Checklist Placeholder",
  },
];

export function parseLaunchSkeletonArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
}

export function buildLaunchSkeletonRecords(now = new Date().toISOString()) {
  const definitionRecords = skeletonDefinitions.flatMap((definition) => [
    {
      collection: "sops",
      id: `launch-${definition.id}-sop`,
      data: {
        body_md: [
          `# ${definition.name} Placeholder SOP`,
          "",
          "This launch Space is ready for source-backed content, but final SOP wording is not approved yet.",
          "",
          "Known from sanitized call context:",
          `- Source basis: ${definition.sourceHint}`,
          "",
          "Do not answer legal, fee, deadline, approval-threshold, or system-of-record questions from this placeholder alone.",
        ].join("\n"),
        created_at: now,
        id: `launch-${definition.id}-sop`,
        owner_uid: defaultOwnerUid,
        sensitivity: "Low",
        source_state_hint: "Open Placeholder",
        space_id: definition.id,
        status: "Placeholder",
        title: `${definition.name} Placeholder SOP`,
        updated_at: now,
      },
    },
    {
      collection: "templates",
      id: `launch-${definition.id}-template`,
      data: {
        audience: "Internal",
        body: `${DRAFT_BANNER}\n\nNeeds Verification: approved ${definition.name} wording.\n\nUse this placeholder only to route the missing source detail to the process owner.`,
        channel: "Internal",
        created_at: now,
        id: `launch-${definition.id}-template`,
        name: definition.templateName,
        space_id: definition.id,
        status: "Draft",
        updated_at: now,
      },
    },
    {
      collection: "placeholders",
      id: `launch-placeholder-${definition.id}`,
      data: {
        created_at: now,
        due_date: "2026-06-30",
        id: `launch-placeholder-${definition.id}`,
        missing_detail: definition.prompt,
        owner_uid: defaultOwnerUid,
        priority: "P1",
        space_id: definition.id,
        status: "Open",
        updated_at: now,
      },
    },
  ]);

  return [...definitionRecords, ...buildLaunchTemplateSeedRecords(now)];
}

// F-TMPL-2/F-TMPL-6: the Admin-editable process copy seeded into the store. Reply patterns land in the
// daily-inbox-triage Communications Space; the welcome email in the move-in Space. Bodies are
// byte-identical to the code fallbacks (SAMPLE_REPLY_TEMPLATES / WELCOME_V1_BASE_COPY). Approved records
// carry owner_uid + approved_by_uid + last_reviewed_at so they satisfy the Approved-template invariant.
export function buildLaunchTemplateSeedRecords(now = new Date().toISOString()) {
  const approvedFields = {
    owner_uid: defaultOwnerUid,
    approved_by_uid: defaultOwnerUid,
    last_reviewed_at: SEED_REVIEW_TIMESTAMP,
  };

  return [
    {
      collection: "templates",
      id: "tpl-vendor-ack",
      data: {
        audience: "Vendor",
        body: "Thanks — we received the invoice and will review it against the work order, then follow up.",
        channel: "Gmail",
        created_at: now,
        id: "tpl-vendor-ack",
        name: "Vendor invoice acknowledgement",
        space_id: "daily-inbox-triage",
        status: "Approved",
        updated_at: now,
        ...approvedFields,
      },
    },
    {
      collection: "templates",
      id: "tpl-scheduling-ack",
      data: {
        audience: "Unknown",
        body: "Thanks for the note. We are coordinating scheduling on our side and will confirm a time shortly.",
        channel: "Gmail",
        created_at: now,
        id: "tpl-scheduling-ack",
        name: "Scheduling acknowledgement",
        space_id: "daily-inbox-triage",
        status: "Approved",
        updated_at: now,
        ...approvedFields,
      },
    },
    {
      collection: "templates",
      id: "tpl-proposed-portal",
      data: {
        audience: "Tenant",
        body: "Here are the steps to reset your resident portal access.",
        channel: "Gmail",
        created_at: now,
        id: "tpl-proposed-portal",
        name: "Portal access help (proposed)",
        owner_uid: defaultOwnerUid,
        space_id: "daily-inbox-triage",
        status: "Draft",
        updated_at: now,
      },
    },
    {
      collection: "templates",
      id: "move-in-welcome-email",
      data: {
        audience: "Tenant",
        body: [
          "Hello {{tenant}},",
          "",
          "Welcome to your new home at {{property}}! We're glad to have you with PMI KC Metro.",
          "",
          "A few move-in notes:",
          "- Move-in date: {{move_in_date}}",
          "- {{deposit_posture_note}}",
          "- Any move-in fees and deposit amounts: {{fees_pointer}} (these vary by property).",
          "",
          "You'll also receive this note in your RentVine Portal Chat. Contact us any time with questions.",
          "",
          "Thanks,",
          "PMI KC Metro",
        ].join("\n"),
        channel: "Gmail",
        created_at: now,
        id: "move-in-welcome-email",
        name: "Move-In Welcome Email",
        space_id: "move-in",
        status: "Approved",
        updated_at: now,
        ...approvedFields,
      },
    },
  ];
}

export async function seedLaunchSkeletons({
  db = getLiveFirestore(),
  force = false,
  now = new Date().toISOString(),
} = {}) {
  const records = buildLaunchSkeletonRecords(now);
  const results = [];

  for (const record of records) {
    const ref = db.collection(record.collection).doc(record.id);
    const snapshot = await ref.get();

    if (snapshot.exists && !force) {
      results.push({ ...record, action: "skipped" });
      continue;
    }

    await ref.set(
      snapshot.exists
        ? {
            ...record.data,
            created_at: snapshot.data()?.created_at ?? now,
            updated_at: now,
          }
        : record.data,
      { merge: true },
    );

    if (snapshot.exists) {
      await clearStaleReviewFields(ref, record.collection, record.data);
    }

    results.push({ ...record, action: snapshot.exists ? "updated" : "created" });
  }

  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseLaunchSkeletonArgs(argv);
  const records = buildLaunchSkeletonRecords();

  if (args.dryRun) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }

  const results = await seedLaunchSkeletons({ force: args.force });

  for (const result of results) {
    console.log(`${result.action}: ${result.collection}/${result.id}`);
  }
}

export function launchSkeletonDeleteFieldsFor(collection, data = undefined) {
  if (collection === "sops") {
    return ["backup_owner_uid", "last_reviewed_at"];
  }

  if (collection === "templates") {
    // F-TMPL-2/F-TMPL-6: an Approved template legitimately CARRIES approved_by_uid + last_reviewed_at
    // (they are required for Approved), so never strip them from a seeded Approved record on re-seed.
    // The strip stays for the Draft placeholder templates, which must not accrue stale review fields.
    return data?.status === "Approved" ? [] : ["approved_by_uid", "last_reviewed_at"];
  }

  if (collection === "placeholders") {
    return ["related_sop_id", "resolution"];
  }

  return [];
}

async function clearStaleReviewFields(ref, collection, data = undefined) {
  const fields = launchSkeletonDeleteFieldsFor(collection, data);

  if (fields.length === 0) {
    return;
  }

  await ref.update(
    Object.fromEntries(fields.map((fieldName) => [fieldName, FieldValue.delete()])),
  );
}

function getLiveFirestore() {
  const localEnv = readLocalEnv();
  const readEnv = (name) => process.env[name] || localEnv[name];
  const projectId =
    readEnv("FIREBASE_PROJECT_ID") ||
    readEnv("GCP_PROJECT_ID") ||
    readEnv("GOOGLE_CLOUD_PROJECT") ||
    readEnv("GCLOUD_PROJECT");

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  }

  return getFirestore();
}

function readLocalEnv() {
  try {
    return Object.fromEntries(
      readFileSync(join(root, ".env.local"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");

          if (separator === -1) {
            return null;
          }

          const key = line.slice(0, separator).trim();
          const value = line
            .slice(separator + 1)
            .trim()
            .replace(/^"|"$/g, "");
          return [key, value];
        })
        .filter(Boolean),
    );
  } catch {
    return {};
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
